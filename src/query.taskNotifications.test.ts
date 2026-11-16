import { afterEach, expect, test } from 'bun:test'
import type { QueuedCommand } from './types/textInputTypes.js'
import { dequeue, enqueuePendingNotification, getCommandQueue, resetCommandQueue, takeTaskNotificationBatch, taskNotificationReady } from './utils/messageQueueManager.js'

afterEach(resetCommandQueue)

test('mid-turn consumption resolves Desktop delivery state before filtering and pruning generated results', async () => {
  const source = await Bun.file(new URL('./query.ts', import.meta.url)).text()
  expect(source).toContain('await readTaskNotificationBoundary(toolUseContext.getAppState(), {')
  expect(source).toContain('pruneObsoleteTaskNotifications(notificationState)')
  expect(source).toContain('taskNotificationReady(cmd, notificationState)')
  expect(source).toContain('wakeOnUnavailable: recheckCommandQueue')
})

test('notification consumption preserves another agent and session and does not block human confirmation input', () => {
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'main', value: 'main result' })
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'child', agentId: 'child' as QueuedCommand['agentId'], value: 'child result' })
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'foreign', value: 'foreign result' }, { sessionId: 'another-session' })
  const first = dequeue(command => command.agentId === undefined && taskNotificationReady(command, {}))!
  expect(takeTaskNotificationBatch(first, {}).map(command => command.value)).toEqual(['main result'])
  expect(getCommandQueue()).toHaveLength(2)
  expect(taskNotificationReady({ mode: 'prompt', value: 'confirm' }, { workflow: { mode: 'workflow', pendingRoute: {} } })).toBe(true)
})
