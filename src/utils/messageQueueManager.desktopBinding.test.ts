import { afterEach, expect, test } from 'bun:test'
import { getSessionId } from '../bootstrap/state.js'
import { getDefaultAppState } from '../state/AppStateStore.js'
import { resolveWorkflowRuntimeState } from '../services/tools/workflowRuntimeStateBridge.js'
import { acknowledgeTaskNotification, enqueuePendingNotification, getCommandQueue, pruneObsoleteTaskNotifications, resetCommandQueue, taskNotificationOwner, taskNotificationReady } from './messageQueueManager.js'
import { enqueueTaskNotificationWithAuthority, readTaskNotificationBoundary, resetTaskNotificationBoundaryRetriesForTests } from './taskNotificationBoundary.js'

const originalFetch = globalThis.fetch
const server = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
const session = process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
afterEach(() => {
  globalThis.fetch = originalFetch
  if (server === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = server
  if (session === undefined) delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
  else process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = session
  resetCommandQueue()
  resetTaskNotificationBoundaryRetriesForTests()
})

function desktopFixture(workflow: object) {
  process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:54321'
  process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = getSessionId()
  globalThis.fetch = Object.assign(async () => Response.json({ state: { mode: 'workflow', sessionId: getSessionId(), ...workflow } }), { preconnect: originalFetch.preconnect })
  return getDefaultAppState()
}

test('Desktop notification boundary holds a generated result during real authoritative confirmation without local workflow state', async () => {
  const local = desktopFixture({ pendingConfirmation: { status: 'pending' }, runStatus: 'waiting_for_user' })
  expect(Object.hasOwn(local, 'workflow')).toBe(false)
  // This is the current real tool bridge behavior: returns authority, never mutates local AppState.
  const authority = await resolveWorkflowRuntimeState((local as { workflow?: unknown }).workflow)
  expect(authority.source).toBe('desktop')
  const command = { mode: 'task-notification' as const, taskNotificationId: 'terminal-agent', value: 'unread actual failure' }
  const boundary = await readTaskNotificationBoundary(local)
  expect(taskNotificationReady(command, boundary)).toBe(false)
  expect(taskNotificationReady({ mode: 'prompt', value: 'confirm' }, boundary)).toBe(true)
  expect(Object.hasOwn(local, 'workflow')).toBe(false)
})

test('Desktop notification producer binds real run phase role and attempt even when AppState has no workflow property', async () => {
  const local = desktopFixture({ activeWorkflowRunId: 'run-2', activePhaseId: 'delegate-implement', runtimeContract: {
    phaseStates: { 'delegate-implement': { taskSnapshots: [{ agentRunId: 'terminal-agent', runId: 'run-2',
      phaseId: 'delegate-implement', batchId: 'B1', workflowRole: 'coder', attempt: 3 }] } },
  } })
  const authority = await resolveWorkflowRuntimeState((local as { workflow?: unknown }).workflow)
  expect(authority.source).toBe('desktop')
  const boundary = await readTaskNotificationBoundary(local)
  expect(taskNotificationOwner('terminal-agent', boundary)).toMatchObject({ runId: 'run-2', phaseId: 'delegate-implement',
    batchId: 'B1', role: 'coder', workflowAttempt: 3 })
})

test('ordinary CLI without a Desktop workflow keeps synchronous notification enqueue and local delivery state', async () => {
  delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
  const local = { tasks: { legacy: { startTime: 55 } }, workflow: { mode: 'workflow', pendingConfirmation: {} } }
  expect(await readTaskNotificationBoundary(local)).toBe(local)
  const write = enqueueTaskNotificationWithAuthority({ mode: 'task-notification', taskNotificationId: 'legacy', value: 'legacy report' }, local, taskNotificationOwner('legacy', local))
  expect(getCommandQueue()).toHaveLength(1)
  await write
  expect(getCommandQueue()[0]!.value).toBe('legacy report')
})

test.each(['throw', 'malformed', 'session-mismatch'] as const)('Desktop %s holds machine notifications without blocking user input or leaking local workflow hints', async failure => {
  const local = desktopFixture({ status: 'running' })
  globalThis.fetch = Object.assign(async () => {
    if (failure === 'throw') throw new Error('offline')
    return Response.json({ state: failure === 'malformed' ? {} : { mode: 'workflow', sessionId: 'foreign', status: 'running' } })
  }, { preconnect: originalFetch.preconnect })
  const state = await readTaskNotificationBoundary({ ...local, workflow: { mode: 'workflow', status: 'running' } })
  expect(state.notificationAuthorityUnavailable).toBe(true)
  expect(taskNotificationReady({ mode: 'task-notification', value: 'retain failure' }, state)).toBe(false)
  expect(taskNotificationReady({ mode: 'prompt', value: 'human continue' }, state)).toBe(true)
})

test('a hung Desktop read times out, preserves results, then recovers from fresh authority', async () => {
  const local = desktopFixture({ status: 'running' })
  globalThis.fetch = Object.assign((_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
  }), { preconnect: originalFetch.preconnect })
  const keepAlive = setInterval(() => {}, 100)
  try {
    const held = await readTaskNotificationBoundary(local, { timeoutMs: 10 })
    expect(held.notificationAuthorityUnavailable).toBe(true)
    enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'held', value: 'actual failure retained' })
    expect(getCommandQueue()).toHaveLength(1)
    desktopFixture({ status: 'running', runStatus: 'active' })
    const fresh = await readTaskNotificationBoundary(local)
    expect(taskNotificationReady(getCommandQueue()[0]!, fresh)).toBe(true)
    expect(getCommandQueue()[0]!.value).toBe('actual failure retained')
  } finally { clearInterval(keepAlive) }
})

test('pending human input skips Desktop transport and never waits on its timeout', async () => {
  const local = desktopFixture({ pendingConfirmation: {} })
  let called = false
  globalThis.fetch = Object.assign(async () => { called = true; throw new Error('must not run') }, { preconnect: originalFetch.preconnect })
  const state = await readTaskNotificationBoundary(local, { skipDesktopRefresh: true })
  expect(called).toBe(false)
  expect(taskNotificationReady({ mode: 'prompt', value: 'answer' }, state)).toBe(true)
  expect(taskNotificationReady({ mode: 'task-notification', value: 'unread' }, state)).toBe(false)
})

test('human input arriving during a Desktop lookup interrupts the read rather than waiting for its timeout', async () => {
  const local = desktopFixture({})
  let aborted = false
  globalThis.fetch = Object.assign((_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => new Promise<Response>((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => { aborted = true; reject(init!.signal!.reason) }, { once: true })
  }), { preconnect: originalFetch.preconnect })
  const read = readTaskNotificationBoundary(local, { timeoutMs: 10_000, interruptOnHumanInput: true })
  enqueuePendingNotification({ mode: 'task-notification', messageKind: 'user_input', value: 'human reply' })
  const state = await read
  expect(aborted).toBe(true)
  expect(taskNotificationReady(getCommandQueue()[0]!, state)).toBe(true)
})

test('unavailable authority schedules one bounded wake, then successful pending confirmation does not poll', async () => {
  const local = desktopFixture({})
  globalThis.fetch = Object.assign(async () => { throw new Error('offline') }, { preconnect: originalFetch.preconnect })
  let wakes = 0
  const wake = () => { wakes++ }
  const keepAlive = setInterval(() => {}, 100)
  try {
    await readTaskNotificationBoundary(local, { wakeOnUnavailable: wake })
    await readTaskNotificationBoundary(local, { wakeOnUnavailable: wake })
    await Bun.sleep(1100)
    expect(wakes).toBe(1)
    desktopFixture({ pendingConfirmation: { status: 'pending' } })
    const waiting = await readTaskNotificationBoundary(local, { wakeOnUnavailable: wake })
    expect(taskNotificationReady({ mode: 'task-notification', value: 'retained result' }, waiting)).toBe(false)
    await Bun.sleep(1100)
    expect(wakes).toBe(1)
  } finally { clearInterval(keepAlive) }
})

test('producer captures exact attempt before awaiting authority; read-before-late-enqueue stays acknowledged', async () => {
  const local = desktopFixture({ status: 'running' })
  const captured = { ...local, tasks: { 'terminal-agent': { startTime: 100 } } }
  let resolve!: (response: Response) => void
  globalThis.fetch = Object.assign(() => new Promise<Response>(done => { resolve = done }), { preconnect: originalFetch.preconnect })
  const write = enqueueTaskNotificationWithAuthority({ mode: 'task-notification', taskNotificationId: 'terminal-agent', value: 'old result' }, captured,
    taskNotificationOwner('terminal-agent', captured))
  acknowledgeTaskNotification('terminal-agent', 100)
  const resumed = { ...captured, tasks: { 'terminal-agent': { startTime: 200 } } }
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'terminal-agent', value: 'new result' }, taskNotificationOwner('terminal-agent', resumed))
  resolve(Response.json({ state: { mode: 'workflow', sessionId: getSessionId() } }))
  await write
  expect(getCommandQueue().map(command => command.value)).toEqual(['new result'])
})

test('producer and consumer use Desktop slots to remove scope-reset notifications without deleting their actual result', async () => {
  const snapshot = { agentRunId: 'old-agent', runId: 'run-2', phaseId: 'delegate-implement', batchId: 'B1', workflowRole: 'coder', attempt: 2, status: 'blocked' }
  const local = desktopFixture({ activeWorkflowRunId: 'run-2', activePhaseId: 'delegate-implement', runtimeContract: {
    phaseStates: { 'delegate-implement': { taskSnapshots: [snapshot] } },
  } })
  await enqueueTaskNotificationWithAuthority({ mode: 'task-notification', taskNotificationId: 'old-agent', value: 'old failure' }, local, taskNotificationOwner('old-agent', local))
  expect(getCommandQueue()).toHaveLength(1)
  desktopFixture({ activeWorkflowRunId: 'run-2', activePhaseId: 'delegate-implement', runtimeContract: {
    phaseStates: { 'delegate-implement': { taskSnapshots: [{ ...snapshot, agentRunId: undefined, status: 'pending' }] } },
  } })
  pruneObsoleteTaskNotifications(await readTaskNotificationBoundary(local))
  expect(getCommandQueue()).toHaveLength(0)
  expect(snapshot.status).toBe('blocked') // Original receipt is not mutated by notification cleanup.
})
