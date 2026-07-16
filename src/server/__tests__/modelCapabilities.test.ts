import { describe, it, expect } from 'bun:test'

import { handleModelCapabilitiesApi } from '../api/modelCapabilities.js'

describe('model capability API', () => {
  it('GET /api/model-capabilities returns conservative fallback for unknown models', async () => {
    const url = new URL('http://127.0.0.1/api/model-capabilities?provider=unknown&model=unknown-model')
    const res = await handleModelCapabilitiesApi(new Request(url), url, ['api', 'model-capabilities'])
    const body = await res.json() as Record<string, any>

    expect(res.status).toBe(200)
    expect(body.capability.source).toBe('unknown')
    expect(body.capability.capabilities.textInput).toBe(true)
    expect(body.capability.capabilities.imageInput).toBe(false)
  })

  it('POST /api/model-capabilities/precheck blocks unmet required image input', async () => {
    const url = new URL('http://127.0.0.1/api/model-capabilities/precheck')
    const res = await handleModelCapabilitiesApi(new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'deepseek',
        modelId: 'deepseek-chat',
        requirements: { required: { imageInput: true }, optional: { longContext: true } },
      }),
    }), url, ['api', 'model-capabilities', 'precheck'])
    const body = await res.json() as Record<string, any>

    expect(res.status).toBe(200)
    expect(body.result.ok).toBe(false)
    expect(body.result.blockers).toContainEqual(expect.objectContaining({
      capability: 'imageInput',
      severity: 'error',
    }))
  })
})
