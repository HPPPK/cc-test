import { describe, expect, test } from 'bun:test'
import {
  clearWorkflowSessionTransitionCoordinatorForTests,
  enqueueWorkflowSessionTransition,
} from './workflowTransitionCoordinator.js'

describe('workflow transition coordinator', () => {
  test('serializes transitions from all transports for the same session without blocking another session', async () => {
    const events: string[] = []
    let releaseFirst!: () => void
    const firstStarted = new Promise<void>((resolve) => { releaseFirst = resolve })
    let allowFirst!: () => void
    const firstGate = new Promise<void>((resolve) => { allowFirst = resolve })

    const first = enqueueWorkflowSessionTransition('shared-session', async () => {
      events.push('first:start')
      releaseFirst()
      await firstGate
      events.push('first:end')
    })
    await firstStarted
    const second = enqueueWorkflowSessionTransition('shared-session', async () => {
      events.push('second')
    })
    const independent = enqueueWorkflowSessionTransition('other-session', async () => {
      events.push('other')
    })

    await independent
    expect(events).toEqual(['first:start', 'other'])
    allowFirst()
    await Promise.all([first, second])
    expect(events).toEqual(['first:start', 'other', 'first:end', 'second'])
  })

  test('continues after a failed transition and releases the session queue', async () => {
    await expect(enqueueWorkflowSessionTransition('failed-session', async () => {
      throw new Error('expected failure')
    })).rejects.toThrow('expected failure')

    await enqueueWorkflowSessionTransition('failed-session', async () => {})
    clearWorkflowSessionTransitionCoordinatorForTests()
  })
})
