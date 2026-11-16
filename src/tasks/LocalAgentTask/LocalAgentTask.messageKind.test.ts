import { describe, expect, test } from 'bun:test'
import { drainPendingMessages, queuePendingMessage } from './LocalAgentTask.js'

describe('local agent pending prompt provenance', () => {
  test('retains legacy string queue compatibility and explicit human metadata', () => {
    let state = { tasks: { fixture: { id: 'fixture', type: 'local_agent', pendingMessages: [] } } } as any
    const set = (update: any) => { state = update(state) }
    queuePendingMessage('fixture', 'legacy runtime prompt', set)
    queuePendingMessage('fixture', 'typed human followup', set, { messageKind: 'user_input', isSynthetic: true })
    queuePendingMessage('fixture', 'metadata-only runtime prompt', set, {})
    const drained = drainPendingMessages('fixture', () => state, set)
    expect(drained[0]).toBe('legacy runtime prompt')
    expect(drained[1]).toMatchObject({ content: 'typed human followup', messageKind: 'user_input', isSynthetic: true })
    expect(drained[2]).toMatchObject({ content: 'metadata-only runtime prompt', messageKind: 'internal_notification' })
    expect(state.tasks.fixture.pendingMessages).toEqual([])
  })
})
