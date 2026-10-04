import { describe, expect, test } from 'bun:test'
import { SessionRuntimeTransitionService } from './sessionRuntimeTransitionService.js'

describe('session lifecycle queue', () => {
  test('serializes the same session but not unrelated sessions', async () => {
    const queue = new SessionRuntimeTransitionService()
    const events: string[] = []
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const first = queue.run('a', async () => { events.push('prewarm'); await gate; events.push('started') })
    const expert = queue.run('a', async () => { events.push('expert'); return 'bound' })
    await queue.run('b', async () => { events.push('other') })
    expect(events).toEqual(['prewarm', 'other'])
    release()
    await first
    expect(await expert).toBe('bound')
    await queue.pending('a')
    expect(events).toEqual(['prewarm', 'other', 'started', 'expert'])
    expect(queue.pending('a')).toBeUndefined()
  })
  test('propagates startup errors and allows a later explicit attempt', async () => {
    const queue = new SessionRuntimeTransitionService()
    const failed = queue.run('a', async () => { throw new Error('startup failed') })
    const barrier = queue.pending('a')!
    await expect(failed).rejects.toThrow('startup failed')
    await expect(barrier).rejects.toThrow('startup failed')
    expect(await queue.run('a', async () => 'retry')).toBe('retry')
  })
})
