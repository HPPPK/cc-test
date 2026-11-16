import '../toolFixtures.test.js'
import { afterEach, expect, test } from 'bun:test'
import type { AppState } from '../../state/AppState.js'
import { IDLE_SPECULATION_STATE } from '../../state/AppStateStore.js'
import { createTaskStateBase } from '../../Task.js'
import { getEmptyToolPermissionContext, type ToolUseContext } from '../../Tool.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { getCommandQueue, resetCommandQueue } from '../../utils/messageQueueManager.js'
import { createAssistantMessage } from '../../utils/messages.js'
import { runAsyncAgentLifecycle } from './agentToolUtils.js'

afterEach(resetCommandQueue)

function fixture() {
  const taskId = 'workflow-receipt-test'
  const abortController = new AbortController()
  const task = {
    ...createTaskStateBase(taskId, 'local_agent', 'Review', 'toolu_review'),
    type: 'local_agent', status: 'running', agentId: taskId, prompt: 'Review',
    agentType: 'general-purpose', abortController, retrieved: false,
    lastReportedToolCount: 0, lastReportedTokenCount: 0, isBackgrounded: true,
    pendingMessages: [], retain: false, diskLoaded: false,
  } as LocalAgentTaskState
  let state = { tasks: { [taskId]: task }, toolPermissionContext: getEmptyToolPermissionContext(),
    speculation: IDLE_SPECULATION_STATE } as unknown as AppState
  const options: Parameters<typeof runAsyncAgentLifecycle>[0] = {
    taskId, abortController,
    async *makeStream() { yield createAssistantMessage({ content: 'Review completed.' }) },
    metadata: { prompt: 'Review', resolvedAgentModel: 'fixture', isBuiltInAgent: true,
      startTime: Date.now(), agentType: 'general-purpose', isAsync: true },
    description: 'Review',
    toolUseContext: { options: { tools: [] }, toolUseId: 'toolu_review', getAppState: () => state } as unknown as ToolUseContext,
    rootSetAppState: update => { state = update(state) }, agentIdForCleanup: taskId,
    enableSummarization: false, getWorktreeResult: async () => ({}),
  }
  return { options, task: () => state.tasks[taskId] }
}

test('persists a workflow terminal receipt before local completion and parent notification', async () => {
  const f = fixture()
  let persisted = false
  const result = await runAsyncAgentLifecycle({ ...f.options, beforeTerminal: async outcome => {
    expect(outcome.status).toBe('succeeded')
    expect(f.task()?.status).toBe('running')
    expect(getCommandQueue()).toHaveLength(0)
    persisted = true
  } })
  expect(persisted).toBe(true)
  expect(result.status).toBe('succeeded')
  expect(f.task()?.status).toBe('completed')
  expect(JSON.stringify(getCommandQueue())).toContain('<status>completed</status>')
})

test('receipt failure settles the local task as failed and never notifies success', async () => {
  const f = fixture()
  const result = await runAsyncAgentLifecycle({ ...f.options, beforeTerminal: async () => {
    throw new Error('WORKFLOW_TASK_RECEIPT_UNAVAILABLE: storage unavailable')
  } })
  expect(result.status).toBe('failed')
  expect(f.task()?.status).toBe('failed')
  const queue = JSON.stringify(getCommandQueue())
  expect(queue).toContain('<status>failed</status>')
  expect(queue).toContain('WORKFLOW_TASK_RECEIPT_UNAVAILABLE')
  expect(queue).not.toContain('<status>completed</status>')
})
