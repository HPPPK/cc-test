import { withFetchPreconnect } from '../../server/__tests__/fixtureAssertions.js'
import { expect, spyOn, test } from 'bun:test'
import { WebSearchTool } from './WebSearchTool.js'
import * as backend from './backend.js'

test('the actual WebSearch tool acquires an API channel, releases after failure and never falls back to browser search', async () => {
  const originalFetch = globalThis.fetch
  const envKeys = ['CC_JIANGXIA_EXPERT_BROWSER_SEARCH_PACING', 'CC_JIANGXIA_DESKTOP_SERVER_URL', 'CC_JIANGXIA_EXPERT_SESSION_ID'] as const
  const previous = envKeys.map(key => process.env[key])
  process.env[envKeys[0]] = '1'
  process.env[envKeys[1]] = 'http://127.0.0.1:3456'
  process.env[envKeys[2]] = 'integration-trial'
  const resolver = spyOn(backend, 'resolveWebSearchProvider').mockReturnValue({ provider: 'tavily-keyless', settings: { mode: 'tavily-keyless' } })
  const calls: string[] = []
  let fail = false
  let channel = 'Tavily API'
  globalThis.fetch = withFetchPreconnect(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('/api/expert-browser-search-pacing')) {
      const input = JSON.parse(String(init?.body))
      calls.push(input.action)
      if (input.action === 'acquire') {
        expect(input.engine).toBe(channel)
        return Response.json({ leaseId: 'tool-lease', waitedMs: 0 })
      }
      return Response.json({ released: true })
    }
    if (channel === 'Tavily API') {
      expect(String(url)).toBe('https://api.tavily.com/search')
      expect(new Headers(init?.headers).get('X-Tavily-Access-Mode')).toBe('keyless')
    } else expect(String(url)).toContain('api.search.brave.com')
    calls.push('search')
    if (fail) return new Response('private debug', { status: 503 })
    return Response.json({ results: [{ title: 'Original candidate', url: 'https://example.com/original' }] })
  })
  try {
    const context = { options: { mainLoopModel: 'gpt-6-luna' }, abortController: new AbortController() } as never
    const result = await WebSearchTool.call({ query: 'actual tool integration trial' }, context, undefined as never, undefined as never, () => {})
    expect(JSON.stringify(result)).toContain('https://example.com/original')
    expect(calls).toEqual(['acquire', 'search', 'release'])
    fail = true
    await expect(WebSearchTool.call({ query: 'actual tool integration failure' }, context, undefined as never, undefined as never, () => {})).rejects.toThrow('503')
    expect(calls).toEqual(['acquire', 'search', 'release', 'acquire', 'search', 'release'])
    fail = false
    channel = 'Brave API'
    resolver.mockReturnValue({ provider: 'anthropic', settings: { mode: 'auto', braveApiKey: 'fixture-brave' } })
    const nativeMismatch = { options: { mainLoopModel: 'claude-fixture' }, abortController: new AbortController(), getAppState() { throw new Error('422 web_search unsupported') } } as never
    await WebSearchTool.call({ query: 'fallback pacing integration' }, nativeMismatch, undefined as never, undefined as never, () => {})
    expect(calls.slice(-3)).toEqual(['acquire', 'search', 'release'])
  } finally {
    resolver.mockRestore()
    globalThis.fetch = originalFetch
    envKeys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i] })
  }
})
