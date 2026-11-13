import { expect, test } from 'bun:test'
import { _test, decodeChunk } from './relay.js'

test('relay parser accepts split text or binary HTTP data and rejects non-CONNECT requests', () => {
  for (const encode of [(value: string) => value, (value: string) => Buffer.from(value)]) {
    const state = _test.newConnState()
    const writes: Array<Uint8Array | string> = []
    let ends = 0
    const socket = { write: (data: Uint8Array | string) => { writes.push(data) }, end: () => { ends++ } }
    _test.handleData(socket, state, encode('GET / HTTP/1.1\r\n'), 'ws://unused.invalid', '', '')
    expect(writes).toEqual([])
    _test.handleData(socket, state, encode('\r\n'), 'ws://unused.invalid', '', '')
    expect(writes).toEqual(['HTTP/1.1 405 Method Not Allowed\r\n\r\n'])
    expect(ends).toBe(1)
  }
})

test('relay forwards exact binary bytes and UTF-8 text after the tunnel opens', () => {
  const state = _test.newConnState()
  const sent: Uint8Array[] = []
  state.ws = { onopen: null, onmessage: null, onerror: null, onclose: null, binaryType: 'arraybuffer', readyState: 1, send: data => { if (!(data instanceof Uint8Array)) throw new Error('expected encoded bytes'); sent.push(data) }, close: () => {} }
  state.wsOpen = true
  const socket = { write: () => {}, end: () => {} }
  const bytes = Buffer.from([0, 255, 128, 13, 10])
  _test.handleData(socket, state, bytes, 'ws://unused.invalid', '', '')
  _test.handleData(socket, state, '你好', 'ws://unused.invalid', '', '')
  expect(Buffer.from(decodeChunk(sent[0]!)!)).toEqual(bytes)
  expect(Buffer.from(decodeChunk(sent[1]!)!).toString('utf8')).toBe('你好')
})
