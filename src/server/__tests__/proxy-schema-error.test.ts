import { expect, spyOn, test } from 'bun:test'
import { ProviderService } from '../services/providerService.js'
import { handleProxyRequest } from '../proxy/handler.js'

test.each([false, true])('upstream reset retains a safe diagnostic identity without secrets (nested cause=%s)', async nested => {
  const config = spyOn(ProviderService.prototype, 'getProviderForProxy').mockResolvedValue({ apiFormat: 'openai_responses', baseUrl: 'https://invalid.example', apiKey: 'test-only' } as any)
  const cause = Object.assign(new Error('secret-token-must-not-log'), { code: 'ECONNRESET' })
  const upstream = spyOn(globalThis, 'fetch').mockRejectedValue(nested ? new TypeError('fetch failed', { cause }) : cause)
  const logs = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const req = new Request('http://localhost/proxy/v1/messages', { method: 'POST', body: JSON.stringify({ model: 'fixture', max_tokens: 10, messages: [] }) })
    const result = await handleProxyRequest(req, new URL(req.url))
    const payload = await result.json() as any
    expect(result.status).toBe(502)
    expect(payload.error).toMatchObject({ code: 'UPSTREAM_CONNECTION_RESET', causeCode: 'ECONNRESET', phase: 'upstream-request', elapsedMs: expect.any(Number), requestId: expect.any(String) })
    expect(JSON.stringify(payload)).not.toContain('secret-token')
    expect(JSON.stringify(logs.mock.calls)).not.toContain('secret-token')
  } finally { config.mockRestore(); upstream.mockRestore(); logs.mockRestore() }
})

for (const apiFormat of ['openai_chat', 'openai_responses']) {
  test(`returns an actionable schema error without fetching upstream (${apiFormat})`, async () => {
    const config = spyOn(ProviderService.prototype, 'getProviderForProxy').mockResolvedValue({ apiFormat, baseUrl: 'https://invalid.example', apiKey: 'test-only' } as any)
    const upstream = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'))
    try {
      const req = new Request('http://localhost/proxy/v1/messages', { method: 'POST', body: JSON.stringify({
        model: 'fixture', max_tokens: 10, messages: [], tools: [{ name: 'lookup', strict: true, input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }],
      }) })
      const result = await handleProxyRequest(req, new URL(req.url))
      expect(result.status).toBe(400)
      expect(await result.json()).toMatchObject({ error: { type: 'invalid_request_error', code: 'INVALID_STRICT_TOOL_SCHEMA', message: expect.stringContaining('additionalProperties') } })
      expect(upstream).not.toHaveBeenCalled()
    } finally { config.mockRestore(); upstream.mockRestore() }
  })
}
