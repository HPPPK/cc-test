import { afterEach, expect, test } from 'bun:test'
import { getSessionId } from '../bootstrap/state.js'
import { asAgentId } from '../types/ids.js'
import { acknowledgeTaskNotifications, dequeue, enqueue, enqueuePendingNotification, getCommandQueue, recheckCommandQueue, resetCommandQueue, takeTaskNotificationBatch, taskNotificationReady, type NotificationState } from '../utils/messageQueueManager.js'
import { enqueueTaskNotificationWithAuthority, resetTaskNotificationBoundaryRetriesForTests } from '../utils/taskNotificationBoundary.js'
import { subscribeIdleTaskNotificationWake } from './printNotificationWake.js'

const originalFetch = globalThis.fetch
const originalUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
const originalSession = process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
const disposers: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  resetCommandQueue()
  resetTaskNotificationBoundaryRetriesForTests()
  globalThis.fetch = originalFetch
  if (originalUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = originalUrl
  if (originalSession === undefined) delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
  else process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = originalSession
})
const flush = () => Bun.sleep(20)
function fixture() {
  let idle = true
  let closed = false
  let state: NotificationState = { tasks: { worker: { startTime: 42 } }, workflow: {
    mode: 'workflow', sessionId: getSessionId(), activePhaseId: 'delegate-implement', runStatus: 'active',
  } }
  const inputs: string[] = []
  const errors: unknown[] = []
  let runs = 0
  const run = () => {
    runs++
    idle = false
    let first
    while ((first = dequeue(command => command.agentId === undefined && taskNotificationReady(command, state)))) {
      const batch = takeTaskNotificationBatch(first, state)
      inputs.push(...batch.map(command => String(command.value)))
      acknowledgeTaskNotifications(batch)
    }
    idle = true
  }
  const dispose = subscribeIdleTaskNotificationWake({ canWake: () => idle && !closed, getState: () => state, run, onError: error => errors.push(error) })
  disposers.push(dispose)
  return { inputs, errors, run, dispose, get runs() { return runs },
    setIdle(value: boolean) { idle = value }, close() { closed = true }, setState(value: NotificationState) { state = value }, get state() { return state } }
}

test('late asynchronous authority enqueue wakes an idle SDK consumer exactly once without human input', async () => {
  const f = fixture()
  process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://fixture.invalid'
  process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = getSessionId()
  let release!: () => void
  const delayed = new Promise<void>(resolve => { release = resolve })
  let calls = 0
  globalThis.fetch = Object.assign(async () => { if (++calls === 1) await delayed; return Response.json({ state: f.state.workflow }) }, { preconnect: originalFetch.preconnect })
  f.setIdle(false)
  const terminalTasks = structuredClone(f.state.tasks)
  const delivery = enqueueTaskNotificationWithAuthority({ mode: 'task-notification', taskNotificationId: 'worker', value: '<status>failed</status>real worker result' }, f.state, { sessionId: getSessionId(), attempt: 42 })
  expect(getCommandQueue()).toHaveLength(0)
  // The last worker is terminal; the SDK run loop releases its mutex before authority returns.
  f.setIdle(true)
  release()
  await delivery
  await flush()
  expect(f.runs).toBe(1)
  expect(f.inputs).toEqual(['<status>failed</status>real worker result'])
  expect(getCommandQueue()).toHaveLength(0)
  expect(f.state.tasks).toEqual(terminalTasks)
  expect(f.errors).toEqual([])
  recheckCommandQueue()
  await flush()
  expect(f.runs).toBe(1)
})

test('running SDK turn retains queue ownership and overlapping idle arrivals coalesce into one drain', async () => {
  const f = fixture()
  f.setIdle(false)
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'one', value: 'one' })
  await flush()
  expect(f.runs).toBe(0)
  expect(getCommandQueue()).toHaveLength(1)
  f.setIdle(true)
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'two', value: 'two' })
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'three', value: 'three' })
  await flush()
  expect(f.runs).toBe(1)
  expect(f.inputs).toEqual(['one', 'two', 'three'])
})

test.each(['waiting_for_user', 'paused', 'stopped', 'confirmation'] as const)('late %s boundary holds results until normal control recovery', async boundary => {
  const f = fixture()
  f.setState({ ...f.state, workflow: { mode: 'workflow', runStatus: boundary === 'confirmation' ? 'active' : boundary, ...(boundary === 'confirmation' ? { pendingConfirmation: { status: 'pending' } } : {}) } })
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'worker', value: 'retained report' })
  await flush()
  expect(f.runs).toBe(0)
  expect(getCommandQueue()).toHaveLength(1)
  f.setState({ ...f.state, workflow: { mode: 'workflow', runStatus: 'active' } })
  recheckCommandQueue()
  await flush()
  expect(f.runs).toBe(1)
  expect(f.inputs).toEqual(['retained report'])
})

test('closed/disposed SDK streams, child/foreign notices and human input do not wake this subscription', async () => {
  const f = fixture()
  enqueue({ mode: 'prompt', value: 'human input' })
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'foreign', value: 'foreign' }, { sessionId: 'another-session' })
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'child', agentId: asAgentId('child'), value: 'child' })
  await flush()
  expect(f.runs).toBe(0)
  f.close()
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'closed', value: 'closed' })
  await flush()
  expect(f.runs).toBe(0)
  f.dispose()
  recheckCommandQueue()
  await flush()
  expect(f.runs).toBe(0)
})

test.each(['running', 'closed', 'disposed'] as const)('an authority read cannot wake a stream that became %s during the await', async boundary => {
  const f = fixture()
  process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://fixture.invalid'
  process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = getSessionId()
  let release!: () => void
  const delayed = new Promise<void>(resolve => { release = resolve })
  globalThis.fetch = Object.assign(async () => { await delayed; return Response.json({ state: f.state.workflow }) }, { preconnect: originalFetch.preconnect })
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'worker', value: 'retained report' })
  if (boundary === 'running') f.setIdle(false)
  else if (boundary === 'closed') f.close()
  else f.dispose()
  release()
  await flush()
  expect(f.runs).toBe(0)
  expect(getCommandQueue()).toHaveLength(1)
})

test('delivery snapshot errors are reported once without losing queued results', async () => {
  const errors: unknown[] = []
  const dispose = subscribeIdleTaskNotificationWake({ canWake: () => true, getState: () => { throw new Error('snapshot unavailable') },
    run: () => { throw new Error('must not execute') }, onError: error => errors.push(error) })
  disposers.push(dispose)
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'worker', value: 'retained report' })
  await flush()
  expect(errors).toHaveLength(1)
  expect(String(errors[0])).toContain('snapshot unavailable')
  expect(getCommandQueue()).toHaveLength(1)
})
