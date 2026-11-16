import { afterEach, expect, test } from 'bun:test'
import { getSessionId } from '../../bootstrap/state.js'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { enqueueAgentNotification } from './LocalAgentTask.js'
import { getCommandQueue, pruneObsoleteTaskNotifications, resetCommandQueue } from '../../utils/messageQueueManager.js'
import { readTaskNotificationBoundary } from '../../utils/taskNotificationBoundary.js'

const previousServer = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
const previousSession = process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
  if (previousServer === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = previousServer
  if (previousSession === undefined) delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
  else process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = previousSession
  resetCommandQueue()
})

test('real local terminal producer enriches a default AppState notice from Desktop and scope reset supersedes it', async () => {
  process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:54321'
  process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = getSessionId()
  const slot = { runId: 'run-current', phaseId: 'delegate-implement', batchId: 'B1', workflowRole: 'coder',
    agentRunId: 'local-producer', attempt: 2, status: 'blocked' }
  const workflow = { mode: 'workflow', sessionId: getSessionId(), activeWorkflowRunId: 'run-current', activePhaseId: 'delegate-implement',
    runtimeContract: { phaseStates: { 'delegate-implement': { taskSnapshots: [slot] } } } }
  globalThis.fetch = Object.assign(async () => Response.json({ state: workflow }), { preconnect: originalFetch.preconnect })
  let state = { ...getDefaultAppState(), tasks: { 'local-producer': { id: 'local-producer', type: 'local_agent', startTime: 100, notified: false } } } as any
  enqueueAgentNotification({ taskId: 'local-producer', description: 'actual finished task', status: 'completed',
    finalMessage: 'actual blocked result', setAppState: update => { state = update(state) } })
  expect(state.tasks['local-producer'].notified).toBe(true)
  expect(Object.hasOwn(state, 'workflow')).toBe(false)
  for (let i = 0; i < 20 && !getCommandQueue().length; i++) await Bun.sleep(1)
  expect(getCommandQueue()).toHaveLength(1)
  slot.agentRunId = undefined as any
  slot.status = 'pending'
  pruneObsoleteTaskNotifications(await readTaskNotificationBoundary(state))
  expect(getCommandQueue()).toHaveLength(0)
  expect(state.tasks['local-producer'].startTime).toBe(100)
})
