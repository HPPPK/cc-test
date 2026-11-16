import { afterEach, expect, test } from 'bun:test'
import { acknowledgeTaskNotifications, dequeue, enqueuePendingNotification, getCommandQueue, resetCommandQueue, takeTaskNotificationBatch, taskNotificationReady } from '../utils/messageQueueManager.js'

afterEach(resetCommandQueue)

test('streaming consumption uses the authoritative notification boundary instead of local workflow cache', async () => {
  const source = await Bun.file(new URL('./print.ts', import.meta.url)).text()
  expect(source).toContain('await readTaskNotificationBoundary(local, {')
  expect(source).toContain('await refreshNotificationState()')
  expect(source).toContain('pruneObsoleteTaskNotifications(notificationState)')
  expect(source).toContain('takeTaskNotificationBatch(command, notificationState)')
  expect(source).not.toContain('taskNotificationReady(cmd, getAppState())')
})

test('the CLI notification batch retains each unread failure in one model input and holds results during confirmation', () => {
  for (let index = 0; index < 18; index++) {
    enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: `pending-${index}`, value: `actual terminal report ${index}` }, { attempt: index })
  }
  const waiting = { workflow: { mode: 'workflow', pendingConfirmation: { status: 'pending' } } }
  expect(dequeue(command => taskNotificationReady(command, waiting))).toBeUndefined()
  expect(getCommandQueue()).toHaveLength(18)
  const first = dequeue(command => taskNotificationReady(command, {}))!
  const batch = takeTaskNotificationBatch(first, {})
  expect(batch).toHaveLength(18)
  expect(batch.map(command => command.value)).toContain('actual terminal report 17')
  expect(getCommandQueue()).toHaveLength(0)
  acknowledgeTaskNotifications(batch)
  enqueuePendingNotification({ mode: 'task-notification', taskNotificationId: 'pending-0', value: 'actual terminal report 0' }, { attempt: 0 })
  expect(getCommandQueue()).toHaveLength(0)
})
