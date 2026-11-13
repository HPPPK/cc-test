import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import * as storage from './sessionStorage.js'
import { clearCommandQueue, enqueuePendingNotification, getCommandQueue } from './messageQueueManager.js'

let record: ReturnType<typeof spyOn>
beforeEach(() => {
  record = spyOn(storage, 'recordQueueOperation').mockResolvedValue(undefined)
  clearCommandQueue()
})
afterEach(() => {
  clearCommandQueue()
  record.mockRestore()
})

describe('notification queue provenance', () => {
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
