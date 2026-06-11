import { afterEach, describe, expect, it, vi } from 'vitest'
import { providersApi } from './providers'
import type { ProviderBundle } from '../types/providerImportExport'

describe('providersApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls the provider import/export endpoints with the expected request shapes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const responses = [
      { providers: [], activeId: null },
      { presets: [] },
      { hasAuth: false, source: 'none' },
      { theme: 'dark' },
      { ok: true },
      { provider: { id: 'provider-a' } },
      { provider: { id: 'provider-a' } },
      { ok: true },
      { ok: true },
      { ok: true },
      { result: { ok: true } },
      { result: { ok: true } },
      { bundle: { kind: 'cc-jiangxia-provider-bundle' } },
      { bundle: { containsSecrets: true } },
      { preview: { canCommit: true, candidates: [], errors: [], bundle: {} } },
      { result: { created: [], updated: [], errors: [] } },
    ]
    const bundle: ProviderBundle = {
      schemaVersion: 1,
      kind: 'cc-jiangxia-provider-bundle',
      containsSecrets: false,
      providers: [],
    }
    let responseIndex = 0
    fetchMock.mockImplementation(async () => {
      const body = responses[responseIndex++] ?? {}
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    await providersApi.list()
    await providersApi.presets()
    await providersApi.authStatus()
    await providersApi.getSettings()
    await providersApi.updateSettings({ theme: 'dark' })
    await providersApi.create({
      presetId: 'custom',
      name: 'Provider A',
      baseUrl: 'https://example.invalid',
      apiKey: 'sk-test',
      apiFormat: 'anthropic',
      models: {
        main: 'model-main',
        haiku: 'model-haiku',
        sonnet: 'model-sonnet',
        opus: 'model-opus',
      },
    })
    await providersApi.update('provider-a', { name: 'Provider B' })
    await providersApi.delete('provider-a')
    await providersApi.activate('provider-a')
    await providersApi.activateOfficial()
    await providersApi.test('provider-a', { baseUrl: 'https://example.invalid' })
    await providersApi.testConfig({
      baseUrl: 'https://example.invalid',
      apiKey: 'sk-test',
      apiFormat: 'anthropic',
      modelId: 'model-main',
    })
    await providersApi.exportProviders({ all: true })
    await providersApi.exportProvidersWithSecrets({
      all: true,
      confirmation: { acknowledgedCredentialExposure: true },
    })
    await providersApi.previewProviderImport({ bundle })
    await providersApi.commitProviderImport({
      bundle,
      resolutions: [],
    })

    expect(fetchMock).toHaveBeenCalledTimes(16)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/providers')
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ theme: 'dark' }),
    })
    expect(fetchMock.mock.calls[11]?.[0]).toContain('/api/providers/test')
    expect(fetchMock.mock.calls[14]?.[0]).toContain('/api/providers/import/preview')
    expect(fetchMock.mock.calls[15]?.[0]).toContain('/api/providers/import/commit')
  })
})
