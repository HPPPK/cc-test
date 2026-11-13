import { withFetchPreconnect } from '../../server/__tests__/fixtureAssertions.js'
import { describe, expect, test } from 'bun:test'
import {
  isLikelyClaudeModel,
  isWebSearchEnabledForModel,
  resolveWebSearchProvider,
  shouldFallbackFromNativeError,
} from './backend.js'

describe('WebSearch backend resolver', () => {
  test('detects Claude models by model name instead of provider URL', () => {
    expect(isLikelyClaudeModel('claude-sonnet-4-5')).toBe(true)
    expect(isLikelyClaudeModel('anthropic/claude-3-7-sonnet')).toBe(true)
    expect(isLikelyClaudeModel('anthropic.claude-opus-4-1')).toBe(true)
    expect(isLikelyClaudeModel('MiniMax-M2.7-highspeed')).toBe(false)
  })

  test('auto mode prefers native Anthropic web search for Claude model names', () => {
    expect(
      resolveWebSearchProvider('anthropic/claude-3-7-sonnet', {
        mode: 'auto',
        tavilyApiKey: 'tvly-key',
        braveApiKey: 'brave-key',
      }).provider,
    ).toBe('anthropic')
  })

  test('auto mode keeps WebSearch available for non-Claude models with fallback keys', () => {
    expect(
      resolveWebSearchProvider('gpt-5.4', {
        mode: 'auto',
        tavilyApiKey: 'tvly-key',
        braveApiKey: 'brave-key',
      }).provider,
    ).toBe('tavily')

    expect(
      resolveWebSearchProvider('gpt-5.4', {
        mode: 'auto',
        braveApiKey: 'brave-key',
      }).provider,
    ).toBe('brave')
  })

  test('explicit provider modes require their API key', () => {
    expect(resolveWebSearchProvider('gpt-5.4', { mode: 'tavily' }).provider).toBe(
      'disabled',
    )
    expect(
      resolveWebSearchProvider('gpt-5.4', {
        mode: 'brave',
        braveApiKey: 'brave-key',
      }).provider,
    ).toBe('brave')
  })

  test('isEnabled reflects native Claude or external fallback availability', () => {
    expect(isWebSearchEnabledForModel('claude-sonnet-4-5', { mode: 'auto' })).toBe(
      true,
    )
    expect(
      isWebSearchEnabledForModel('qwen3-coder', {
        mode: 'auto',
        tavilyApiKey: 'tvly-key',
      }),
    ).toBe(true)
    expect(isWebSearchEnabledForModel('qwen3-coder', { mode: 'auto' })).toBe(
      false,
    )
  })

  test('falls back on native tool schema/provider mismatch errors', () => {
    expect(
      shouldFallbackFromNativeError(
        new Error('422 Extra inputs are not permitted: web_search_20250305'),
      ),
    ).toBe(true)
    expect(shouldFallbackFromNativeError(new Error('network timeout'))).toBe(
      false,
    )
  })
})

test('keyless Tavily requires an explicit choice and does not change legacy defaults', () => {
  expect(resolveWebSearchProvider('gpt-6-luna', { mode: 'tavily-keyless' }).provider).toBe('tavily-keyless')
  expect(resolveWebSearchProvider('gpt-6-luna', { mode: 'auto' }).provider).toBe('disabled')
  expect(resolveWebSearchProvider('gpt-6-luna', { mode: 'tavily' }).provider).toBe('disabled')
})

test('keyless discovery uses the official access headers and returns candidates, not verified evidence', async () => {
  const { searchWithExternalProvider } = await import('./backend.js')
  const original = globalThis.fetch
  let requests = 0
  globalThis.fetch = withFetchPreconnect(async (_url: unknown, init?: RequestInit) => {
    requests++
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(new Headers(init?.headers).get('X-Tavily-Access-Mode')).toBe('keyless')
    return Response.json({ results: [
      { title: 'Official pricing', url: 'https://example.com/pricing' },
      { title: 'Unsafe link', url: 'javascript:alert(1)' },
      { title: 'Excluded', url: 'https://unwanted.example/pricing' },
    ] })
  })
  try {
    const input = { query: 'old photo official pricing trial regression', allowed_domains: ['example.com'] }
    const result = await searchWithExternalProvider('tavily-keyless', input, '', new AbortController().signal)
    expect(result.results[0]).toContain('Discovery only')
    expect(JSON.stringify(result.results)).toContain('https://example.com/pricing')
    expect(JSON.stringify(result.results)).not.toContain('javascript:')
    expect(JSON.stringify(result.results)).not.toContain('unwanted.example')
    await searchWithExternalProvider('tavily-keyless', input, '', new AbortController().signal)
    expect(requests).toBe(1)
  } finally { globalThis.fetch = original }
})

test('quota errors back off without exposing the response body or sending another request', async () => {
  const { searchWithExternalProvider } = await import('./backend.js')
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = withFetchPreconnect(async () => { calls++; return new Response('secret-provider-debug-body', { status: 429, headers: { 'Retry-After': '60' } }) })
  try {
    await expect(searchWithExternalProvider('brave', { query: 'quota regression' }, 'test-quota-key', new AbortController().signal)).rejects.toThrow('SEARCH_PROVIDER_RATE_LIMITED')
    await expect(searchWithExternalProvider('brave', { query: 'different query quota regression' }, 'test-quota-key', new AbortController().signal)).rejects.toThrow('SEARCH_PROVIDER_COOLDOWN')
    expect(calls).toBe(1)
  } finally { globalThis.fetch = original }
})

 test('reads legacy and explicit trial configuration without silently enabling trial mode', async () => {
  const { getConfiguredWebSearchSettings } = await import('./backend.js')
  expect(getConfiguredWebSearchSettings({ webSearch: { tavilyApiKey: '  fixture-key  ' } })).toMatchObject({ mode: 'auto', tavilyApiKey: 'fixture-key' })
  expect(getConfiguredWebSearchSettings({ webSearch: { mode: 'tavily-keyless' } })).toMatchObject({ mode: 'tavily-keyless' })
})
