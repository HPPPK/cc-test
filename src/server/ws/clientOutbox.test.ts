import { describe, expect, it } from 'bun:test'
import { ClientOutbox } from './clientOutbox.js'

describe('client stream outbox', () => {
  it('pauses after an accepted backpressured frame and resumes without replay or lost terminal events', () => {
    const sent: any[] = []
    let result = -1
    const queue = new ClientOutbox((p) => { sent.push(JSON.parse(p)); return result }, () => {})
    queue.send(JSON.stringify({ type: 'content_delta', toolInput: 'a' }))
    for (let i = 0; i < 5000; i++) queue.send(JSON.stringify({ type: 'content_delta', toolInput: 'b' }))
    queue.send(JSON.stringify({ type: 'tool_use_complete', toolUseId: 't' }))
    queue.send(JSON.stringify({ type: 'tool_result', toolUseId: 't', result: 'ok' }))
    queue.send(JSON.stringify({ type: 'message_complete', usage: {} }))
    expect(sent).toHaveLength(1)
    result = 1
    queue.drain()
    expect(sent.map(x => x.type)).toEqual(['content_delta', 'content_delta', 'tool_use_complete', 'tool_result', 'message_complete'])
    expect(sent[0].toolInput + sent[1].toolInput).toBe('a' + 'b'.repeat(5000))
    queue.drain()
    expect(sent).toHaveLength(5)
  })

  it('does not merge across semantic boundaries or unrelated fields', () => {
    const sent: any[] = []
    let result = -1
    const queue = new ClientOutbox((p) => { sent.push(JSON.parse(p)); return result }, () => {})
    for (const message of [
      { type: 'status', state: 'thinking' },
      { type: 'content_delta', text: 'A' },
      { type: 'content_delta', toolInput: 'B' },
      { type: 'thinking', text: 'C' },
      { type: 'content_start', toolUseId: 'new' },
      { type: 'content_delta', text: 'D' },
      { type: 'content_delta', text: 'E', sequence: 1 },
      { type: 'content_delta', text: 'F', sequence: 2 },
    ]) queue.send(JSON.stringify(message))
    result = 1
    queue.drain()
    expect(sent).toHaveLength(8)
    expect(sent.at(-1).text).toBe('F')
  })

  it('bounds memory with an explicit reconnect signal rather than silently dropping terminal events', () => {
    let overflows = 0
    const queue = new ClientOutbox(() => -1, () => { overflows++ }, 64)
    queue.send('{}')
    queue.send(JSON.stringify({ type: 'content_delta', text: 'x'.repeat(65) }))
    expect(overflows).toBe(1)
    expect(queue.send('{}')).toBe('dropped')
  })
})
