import { describe, expect, mock, test } from 'bun:test'
import { runWithRuntimeEnv } from '../../utils/runtimeEnv.js'

const buildOpenAICodexFetchMock = mock((fetchOverride: unknown) => fetchOverride)
const shouldUseOpenAICodexAuthMock = mock(() => true)

mock.module('src/utils/http.js', () => ({
  getAuthHeaders: mock(() => ({})),
  getMCPUserAgent: mock(() => 'client-test-agent'),
  getUserAgent: mock(() => 'client-test-agent'),
  getWebFetchUserAgent: mock(() => 'client-test-agent'),
  withOAuth401Retry: mock(async <T>(fn: () => Promise<T>) => fn()),
}))

mock.module('src/services/openaiAuth/fetch.js', () => ({
  OPENAI_OAUTH_DUMMY_KEY: 'openai-oauth-dummy-key',
  buildOpenAICodexFetch: buildOpenAICodexFetchMock,
  shouldUseOpenAICodexAuth: shouldUseOpenAICodexAuthMock,
}))

describe('resolveAnthropicClientApiKey', () => {
  test('does not inherit a local api key when a provider auth token is explicit', async () => {
    const { resolveAnthropicClientApiKey } = await import('./client.js')
    const getFallbackApiKey = mock(() => 'sk-keychain-fallback')

    const apiKey = resolveAnthropicClientApiKey({
      envAuthToken: 'provider-bearer-token',
      envApiKey: undefined,
      getFallbackApiKey,
    })

    expect(apiKey).toBeNull()
    expect(getFallbackApiKey).not.toHaveBeenCalled()
  })

  test('preserves an explicit api key when the caller opts into dual auth', async () => {
    const { resolveAnthropicClientApiKey } = await import('./client.js')
    const getFallbackApiKey = mock(() => 'sk-keychain-fallback')

    const apiKey = resolveAnthropicClientApiKey({
      explicitApiKey: 'sk-explicit-api-key',
      envAuthToken: 'provider-bearer-token',
      getFallbackApiKey,
    })

    expect(apiKey).toBe('sk-explicit-api-key')
    expect(getFallbackApiKey).not.toHaveBeenCalled()
  })

  test('falls back to the local api key when no provider auth token is present', async () => {
    const { resolveAnthropicClientApiKey } = await import('./client.js')
    const getFallbackApiKey = mock(() => 'sk-keychain-fallback')

    const apiKey = resolveAnthropicClientApiKey({
      envAuthToken: undefined,
      envApiKey: undefined,
      getFallbackApiKey,
    })

    expect(apiKey).toBe('sk-keychain-fallback')
    expect(getFallbackApiKey).toHaveBeenCalled()
  })
})

describe('getAnthropicClient', () => {
  test('passes bearer-token provider auth without an SDK api key', async () => {
    const { getAnthropicClient } = await import('./client.js')
    const originalAuthToken = process.env.ANTHROPIC_AUTH_TOKEN
    const originalApiKey = process.env.ANTHROPIC_API_KEY
    const originalSimple = process.env.CLAUDE_CODE_SIMPLE

    process.env.ANTHROPIC_AUTH_TOKEN = 'provider-bearer-token'
    process.env.CLAUDE_CODE_SIMPLE = '1'
    delete process.env.ANTHROPIC_API_KEY

    try {
      const client = await getAnthropicClient({
        maxRetries: 0,
        model: 'claude-sonnet-4-6',
      })

      expect(client.apiKey).toBeNull()
      expect(client._options.defaultHeaders).toMatchObject({
        Authorization: 'Bearer provider-bearer-token',
      })
    } finally {
      if (originalAuthToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN
      else process.env.ANTHROPIC_AUTH_TOKEN = originalAuthToken

      if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = originalApiKey

      if (originalSimple === undefined) delete process.env.CLAUDE_CODE_SIMPLE
      else process.env.CLAUDE_CODE_SIMPLE = originalSimple
    }
  })

  test('uses per-teammate runtime env without mutating process env', async () => {
    const { getAnthropicClient } = await import('./client.js')

    await runWithRuntimeEnv(
      {
        ANTHROPIC_AUTH_TOKEN: 'runtime-bearer-token',
        ANTHROPIC_BASE_URL: 'http://runtime.example/v1',
        CLAUDE_CODE_SIMPLE: '1',
      },
      async () => {
        const client = await getAnthropicClient({
          maxRetries: 0,
          model: 'provider/model-id',
        })

        expect(client.apiKey).toBeNull()
        expect(client._options.baseURL).toBe('http://runtime.example/v1')
        expect(client._options.defaultHeaders).toMatchObject({
          Authorization: 'Bearer runtime-bearer-token',
        })
      },
    )

    expect(process.env.ANTHROPIC_AUTH_TOKEN).not.toBe('runtime-bearer-token')
  })

  test('does not route provider-managed GPT model IDs through OpenAI Codex auth', async () => {
    const { getAnthropicClient } = await import('./client.js')
    const openAICallsBefore = buildOpenAICodexFetchMock.mock.calls.length

    await runWithRuntimeEnv(
      {
        CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
        ANTHROPIC_API_KEY: 'runtime-provider-key',
        ANTHROPIC_BASE_URL: 'http://provider.example/v1',
        CLAUDE_CODE_SIMPLE: '1',
      },
      async () => {
        const client = await getAnthropicClient({
          maxRetries: 0,
          model: 'gpt-5.4',
        })

        expect(client.apiKey).toBe('runtime-provider-key')
        expect(client._options.baseURL).toBe('http://provider.example/v1')
      },
    )

    expect(buildOpenAICodexFetchMock.mock.calls.length).toBe(openAICallsBefore)
  })
})
