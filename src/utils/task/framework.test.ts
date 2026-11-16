import { afterEach, expect, test } from 'bun:test'
import type { AppState } from '../../state/AppState.js'
import { IDLE_SPECULATION_STATE } from '../../state/AppStateStore.js'
import { enqueueAgentNotification, type LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { createTaskStateBase } from '../../Task.js'
import { dequeueAll, enqueuePendingNotification, resetCommandQueue } from '../messageQueueManager.js'
import { applyTaskOffsetsAndEvictions, evictTerminalTask, generateTaskAttachments } from './framework.js'
import { TaskOutputTool } from '../../tools/TaskOutputTool/TaskOutputTool.js'

afterEach(resetCommandQueue)

function store(id: string) {
  const task: LocalAgentTaskState = {
    ...createTaskStateBase(id, 'local_agent', 'Terminal worker'),
    type: 'local_agent', status: 'completed', agentId: id, agentType: 'general-purpose',
    prompt: 'Implement', retrieved: false, lastReportedTokenCount: 0, lastReportedToolCount: 0,
    isBackgrounded: true, pendingMessages: [], retain: false, diskLoaded: false,
    evictAfter: Date.now() - 60_000,
    result: { content: [{ type: 'text', text: 'actual final answer' }] } as LocalAgentTaskState['result'],
  }
  let state = { tasks: { [id]: task }, speculation: IDLE_SPECULATION_STATE } as unknown as AppState
  return { get: () => state, set: (fn: (prev: AppState) => AppState) => { state = fn(state) } }
}

test('does not evict a terminal agent while its notification remains queued beyond the grace period', async () => {
  const state = store('queued-notice-gc')
  enqueueAgentNotification({ taskId: 'queued-notice-gc', description: 'Terminal worker', status: 'completed', setAppState: state.set })
  evictTerminalTask('queued-notice-gc', state.set)
  expect(state.get().tasks['queued-notice-gc']).toBeDefined()
  const patches = await generateTaskAttachments(state.get())
  applyTaskOffsetsAndEvictions(state.set, patches.updatedTaskOffsets, patches.evictedTaskIds)
  expect(state.get().tasks['queued-notice-gc']).toBeDefined()
  dequeueAll()
  evictTerminalTask('queued-notice-gc', state.set)
  expect(state.get().tasks['queued-notice-gc']).toBeUndefined()
})

test('TaskOutput can retrieve a known terminal result after task panel eviction', async () => {
  const state = store('retired-known-agent')
  state.set(prev => ({ ...prev, tasks: { ...prev.tasks, 'retired-known-agent': { ...prev.tasks['retired-known-agent']!, notified: true } } }))
  evictTerminalTask('retired-known-agent', state.set)
  const input = { task_id: 'retired-known-agent', block: false, timeout: 0 }
  expect(await TaskOutputTool.validateInput?.(input, { getAppState: state.get } as never)).toEqual({ result: true })
  const output = await TaskOutputTool.call(input, { getAppState: state.get, setAppState: state.set } as never, undefined as never, undefined as never)
  expect(output.data).toMatchObject({ retrieval_status: 'success', task: { status: 'completed', output: 'actual final answer' } })
})

test('legacy notifications without structural ownership preserve the existing eviction behavior', () => {
  const state = store('legacy-notice-gc')
  state.set(prev => ({ ...prev, tasks: { ...prev.tasks, 'legacy-notice-gc': { ...prev.tasks['legacy-notice-gc']!, notified: true } } }))
  enqueuePendingNotification({ mode: 'task-notification', value: '<task-id>legacy-notice-gc</task-id>' })
  evictTerminalTask('legacy-notice-gc', state.set)
  expect(state.get().tasks['legacy-notice-gc']).toBeUndefined()
})
