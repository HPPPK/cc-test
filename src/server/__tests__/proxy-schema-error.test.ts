import { expect, spyOn, test } from 'bun:test'
import { ProviderService } from '../services/providerService.js'
import { handleProxyRequest } from '../proxy/handler.js'

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
