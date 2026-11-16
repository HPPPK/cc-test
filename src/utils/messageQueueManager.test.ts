import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import * as storage from './sessionStorage.js'
import { clearCommandQueue, dequeue, enqueuePendingNotification, getCommandQueue, hasPendingTaskNotification, acknowledgeTaskNotification, acknowledgeTaskNotifications, pruneObsoleteTaskNotifications, resetCommandQueue, restoreTaskNotificationBatch, takeTaskNotificationBatch, taskNotificationOwner, taskNotificationReady } from './messageQueueManager.js'

let record: ReturnType<typeof spyOn>
beforeEach(() => {
  record = spyOn(storage, 'recordQueueOperation').mockResolvedValue(undefined)
  resetCommandQueue()
})
afterEach(() => {
  clearCommandQueue()
  record.mockRestore()
})

describe('notification queue provenance', () => {
  test('deduplicates one terminal attempt while allowing a later attempt of the same agent', () => {
    const command = { mode: 'task-notification' as const, taskNotificationId: 'same-agent', value: 'terminal report' }
    enqueuePendingNotification(command, { attempt: 100 })
    enqueuePendingNotification(command, { attempt: 100 })
    expect(getCommandQueue()).toHaveLength(1)
    enqueuePendingNotification(command, { attempt: 200 })
    expect(getCommandQueue()).toHaveLength(2)
  })
  test('acknowledges exact task attempts and preserves later attempts, foreign sessions and unowned legacy notices', () => {
    const notice = { mode: 'task-notification' as const, taskNotificationId: 'ack-agent', value: 'real failure' }
    enqueuePendingNotification(notice, { attempt: 100 })
    enqueuePendingNotification(notice, { attempt: 200 })
    enqueuePendingNotification(notice, { attempt: 100, sessionId: 'other-session' })
    enqueuePendingNotification({ mode: 'task-notification', value: '<task-id>ack-agent</task-id>' })
    acknowledgeTaskNotification('ack-agent', 100)
    expect(getCommandQueue()).toHaveLength(3)
    enqueuePendingNotification(notice, { attempt: 100 })
    expect(getCommandQueue()).toHaveLength(3)
    expect(getCommandQueue().filter(item => taskNotificationReady(item, {}))).toHaveLength(2)
  })
  test('batches unread results once but holds results during user confirmation without losing real errors', () => {
    enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'batch-one', value: 'first failure' }, { attempt: 1 })
    enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'batch-two', value: 'second success' }, { attempt: 2 })
    const waiting = { workflow: { mode: 'workflow', pendingRoute: { status: 'pending' } } }
    expect(getCommandQueue().filter(item => taskNotificationReady(item, waiting))).toHaveLength(0)
    expect(getCommandQueue()).toHaveLength(2)
    const first = dequeue(item => taskNotificationReady(item, {}))!
    const batch = takeTaskNotificationBatch(first, {})
    expect(batch.map(item => item.value)).toEqual(['first failure', 'second success'])
    acknowledgeTaskNotifications(batch)
    expect(getCommandQueue()).toHaveLength(0)
    enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'batch-one', value: 'first failure' }, { attempt: 1 })
    expect(getCommandQueue()).toHaveLength(0)
  })
  test('retains unread errors if model processing fails rather than acknowledging them', () => {
    enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'model-failed', value: 'actual worker error' }, { attempt: 1 })
    const batch = takeTaskNotificationBatch(dequeue()!, {})
    restoreTaskNotificationBatch(batch)
    expect(getCommandQueue().map(command => command.value)).toEqual(['actual worker error'])
    expect(takeTaskNotificationBatch(dequeue()!, {})).toHaveLength(1)
  })
  test('supersedes only structurally matching workflow run, phase, batch and role', () => {
    const state = { tasks: { old: { startTime: 1 } }, workflow: { mode: 'workflow', runtimeContract: { phaseStates: { implement: { taskSnapshots: [
      { runId: 'run', phaseId: 'implement', batchId: 'B1', workflowRole: 'coder', agentRunId: 'old', attempt: 1 },
    ] } } } } }
    const owner = taskNotificationOwner('old', state)
    enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'old', value: 'old coder failure' }, owner)
    const snapshots = state.workflow.runtimeContract.phaseStates.implement.taskSnapshots
    snapshots[0] = { ...snapshots[0]!, workflowRole: 'reviewer', agentRunId: 'different-role' }
    pruneObsoleteTaskNotifications(state)
    expect(getCommandQueue()).toHaveLength(1)
    snapshots[0] = { ...snapshots[0]!, workflowRole: 'coder', agentRunId: 'new-coder', attempt: 2 }
    pruneObsoleteTaskNotifications(state)
    expect(getCommandQueue()).toHaveLength(0)
  })
  test('retires a bound attempt notification when scope approval explicitly resets its slot', () => {
    const state = { tasks: { oldReset: { startTime: 1 } }, workflow: { mode: 'workflow', activeWorkflowRunId: 'run', activePhaseId: 'implement', runtimeContract: { phaseStates: { implement: { taskSnapshots: [
      { runId: 'run', phaseId: 'implement', batchId: 'B1', workflowRole: 'coder', agentRunId: 'oldReset' as string | undefined, attempt: 1, status: 'failed' },
    ] } } } } }
    enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'oldReset', value: 'Recorded failure remains on disk' }, taskNotificationOwner('oldReset', state))
    const slot = state.workflow.runtimeContract.phaseStates.implement.taskSnapshots[0]!
    slot.agentRunId = undefined
    slot.status = 'waiting_dependency'
    pruneObsoleteTaskNotifications(state)
    expect(getCommandQueue()).toHaveLength(0)
  })
  test('retires only proven old-run or old-phase workflow notices and preserves unknown ownership and human messages', () => {
    for (const changed of ['run', 'phase']) {
      resetCommandQueue()
      const state = { tasks: { oldBound: { startTime: 1 } }, workflow: { mode: 'workflow', activeWorkflowRunId: 'run', activePhaseId: 'implement', runtimeContract: { phaseStates: { implement: { taskSnapshots: [
        { runId: 'run', phaseId: 'implement', batchId: 'B1', workflowRole: 'coder', agentRunId: 'oldBound', attempt: 1 },
      ] } } } } }
      const owner = taskNotificationOwner('oldBound', state)
      enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'oldBound', value: 'old outcome' }, owner)
      enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'unknown', value: 'unknown outcome' })
      enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'human', value: 'human input', messageKind: 'user_input' }, owner)
      if (changed === 'run') state.workflow.activeWorkflowRunId = 'next-run'
      else state.workflow.activePhaseId = 'next-phase'
      pruneObsoleteTaskNotifications(state)
      expect(getCommandQueue().map(command => command.value)).toEqual(['unknown outcome', 'human input'])
    }
  })
  test('tracks queued task ownership structurally without guessing IDs from legacy text', () => {
    enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'known', value: 'arbitrary body' })
    enqueuePendingNotification({ mode: 'task-notification', value: '<task-id>legacy</task-id>' })
    expect(hasPendingTaskNotification('known')).toBe(true)
    expect(hasPendingTaskNotification('legacy')).toBe(false)
    expect(hasPendingTaskNotification('unknown')).toBe(false)
    expect(dequeue()?.taskNotificationId).toBe('known')
    expect(hasPendingTaskNotification('known')).toBe(false)
  })
  test('marks task and autonomous prompts without inspecting content', () => {
    for (const mode of ['task-notification', 'prompt'] as const) {
      enqueuePendingNotification({ mode, value: 'hello', isMeta: true } as any)
    }
    expect(getCommandQueue().map(command => command.messageKind)).toEqual(['internal_notification', 'internal_notification'])
  })

  test('preserves explicit human teammate provenance and independent flags', () => {
    enqueuePendingNotification({ mode: 'task-notification', value: 'Task completed', messageKind: 'user_input', isSynthetic: true } as any)
    expect(getCommandQueue()[0]).toMatchObject({ messageKind: 'user_input', isSynthetic: true, priority: 'later' })
  })

  test('preserves context summary provenance', () => {
    enqueuePendingNotification({ mode: 'prompt', value: 'summary', messageKind: 'context_summary', isCompactSummary: true } as any)
    expect(getCommandQueue()[0]).toMatchObject({ messageKind: 'context_summary', isCompactSummary: true })
  })
})

test('mixed human input and generated notification drain by priority without provenance bleed', async () => {
  const { enqueue, dequeue, getPendingNotificationsSnapshot } = await import('./messageQueueManager.js')
  enqueue({ mode: 'prompt', value: 'human input', messageKind: 'user_input', priority: 'next' } as any)
  enqueuePendingNotification({ mode: 'task-notification', value: 'background completion', isMeta: true } as any)
  enqueuePendingNotification({ mode: 'task-notification', value: 'teammate input', messageKind: 'user_input', priority: 'now' } as any)
  expect(getPendingNotificationsSnapshot()).toHaveLength(3)
  expect(dequeue()).toMatchObject({ value: 'teammate input', messageKind: 'user_input' })
  expect(dequeue()).toMatchObject({ value: 'human input', messageKind: 'user_input' })
  expect(dequeue()).toMatchObject({ value: 'background completion', messageKind: 'internal_notification', isMeta: true })
  expect(dequeue()).toBeUndefined()
})
