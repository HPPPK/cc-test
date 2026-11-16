import { expect, test } from 'bun:test'
import type { Transport } from './Transport.js'
import { SSETransport } from './SSETransport.js'
import { WebSocketTransport } from './WebSocketTransport.js'

test('SSE and WebSocket implementations satisfy the common transport contract', () => {
  const transports: Transport[] = [new SSETransport(new URL('https://example.test/session/events')), new WebSocketTransport(new URL('wss://example.test/session'))]
  for (const transport of transports) {
    expect(transport.isConnectedStatus()).toBe(false)
    transport.setOnData(() => {})
    transport.setOnClose(() => {})
    transport.close()
    expect(transport.isConnectedStatus()).toBe(false)

  }
})
