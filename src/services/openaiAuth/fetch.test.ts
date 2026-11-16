import { expect, test } from 'bun:test'
import type { AnthropicRequest } from '../../server/proxy/transform/types.js'
import { readAnthropicBody } from './fetch.js'

test('OAuth request decoding preserves JSON from text, ArrayBuffer and byte views', async () => {
  const request: AnthropicRequest = { model: 'fixture-model', max_tokens: 10, messages: [{ role: 'user', content: 'hello' }] }
  const json = JSON.stringify(request)
  const encoded = new TextEncoder().encode(json)
  const padded = new Uint8Array(encoded.byteLength + 4)
  padded.set(encoded, 2)
  const byteView = padded.subarray(2, encoded.byteLength + 2)
  for (const body of [json, encoded.buffer, byteView]) {
    expect(await readAnthropicBody('https://example.test/v1/messages', { body })).toEqual(request)
  }
})
