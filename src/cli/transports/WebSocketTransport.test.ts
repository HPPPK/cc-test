import { describe, expect, test } from 'bun:test'
import { WebSocketTransport } from './WebSocketTransport.js'

describe('WebSocketTransport', () => {
  test('does not reconnect after a 1008 policy violation close', () => {
    const transport = new WebSocketTransport(
      new URL('ws://127.0.0.1:3456/sdk/session-id?token=stale-token'),
    )
    let closeCode: number | undefined
    transport.setOnClose(code => {
      closeCode = code
    })

    ;(transport as unknown as { state: string }).state = 'connected'
    ;(transport as unknown as {
      handleConnectionError(closeCode?: number): void
    }).handleConnectionError(1008)

    expect(transport.getStateLabel()).toBe('closed')
    expect(closeCode).toBe(1008)
  })
})
