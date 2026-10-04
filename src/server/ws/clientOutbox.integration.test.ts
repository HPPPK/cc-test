import { describe, expect, it } from 'bun:test'
import { ClientOutbox } from './clientOutbox.js'

describe('client outbox loopback transport', () => {
  it('delivers every fragment and terminal event in order over a real WebSocket after injected backpressure', async () => {
    let outbox: ClientOutbox | undefined
    let drainTimer: ReturnType<typeof setTimeout> | undefined
    const received: any[] = []
    let complete!: () => void
    let failed!: (error: unknown) => void
    const finished = new Promise<void>((resolve, reject) => { complete = resolve; failed = reject })
    const server = Bun.serve({
      hostname: '127.0.0.1', port: 0,
      fetch(request, server) { if (server.upgrade(request)) return; return new Response('not found', { status: 404 }) },
      websocket: {
        open(ws) {
          let first = true
          outbox = new ClientOutbox(payload => {
            const result = ws.send(payload)
            // Deterministic pressure injection after a real accepted wire frame.
            // This checks -1 semantics without depending on OS socket buffer sizes.
            if (first && result !== 0) { first = false; return -1 }
            return result
          }, () => failed(new Error('unexpected outbox overflow')))
          outbox.send(JSON.stringify({ type: 'content_start', blockType: 'tool_use', toolUseId: 'write-1' }))
          for (let i = 0; i < 10_000; i++) outbox.send(JSON.stringify({ type: 'content_delta', toolInput: '证据' }))
          outbox.send(JSON.stringify({ type: 'tool_use_complete', toolUseId: 'write-1' }))
          outbox.send(JSON.stringify({ type: 'tool_result', toolUseId: 'write-1', content: 'written' }))
          outbox.send(JSON.stringify({ type: 'system_notification', subtype: 'task_notification', data: { status: 'completed' } }))
          outbox.send(JSON.stringify({ type: 'message_complete', usage: { input_tokens: 1, output_tokens: 2 } }))
          drainTimer = setTimeout(() => outbox?.drain(), 20)
        },
        message() {},
        drain() { outbox?.drain() },
      },
    })
    const client = new WebSocket('ws://127.0.0.1:' + server.port)
    client.onmessage = event => {
      const message = JSON.parse(String(event.data))
      received.push(message)
      if (message.type === 'message_complete') complete()
    }
    client.onerror = () => failed(new Error('loopback socket failed'))
    const timeout = setTimeout(() => failed(new Error('terminal message missing')), 3000)
    try {
      await finished
      expect(received.map(x => x.type)).toEqual(['content_start', 'content_delta', 'tool_use_complete', 'tool_result', 'system_notification', 'message_complete'])
      expect(received[1].toolInput).toBe('证据'.repeat(10_000))
    } finally {
      clearTimeout(timeout)
      clearTimeout(drainTimer)
      outbox?.dispose()
      client.close()
      await server.stop(true)
    }
  })
})
