import { describe, expect, test } from 'bun:test'
import { coordinateExpertBrowserSearchPacing, resolveExpertSearchEngineForInput } from './expertBrowserSearchPacingRuntime.js'

const env = {
  CC_JIANGXIA_EXPERT_BROWSER_SEARCH_PACING: '1',
  CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456',
  CC_JIANGXIA_EXPERT_SESSION_ID: 'expert-session',
  CC_JIANGXIA_EXPERT_BROWSER_SEARCH_MIN_INTERVAL_MS: '3000',
} as NodeJS.ProcessEnv

describe('expert browser search pacing runtime', () => {
  test('recognizes explicit SERP URLs and canonical search-home submission entries', () => {
    expect(resolveExpertSearchEngineForInput({ actions: [{ type: 'navigate', url: 'https://www.google.com/search?q=markdown' }] })).toBe('Google')
    expect(resolveExpertSearchEngineForInput({ actions: [{ type: 'navigate', url: 'https://www.baidu.com/s?wd=markdown' }] })).toBe('百度')
    expect(resolveExpertSearchEngineForInput({ actions: [
      { type: 'navigate', url: 'https://www.google.com/' },
      { type: 'fill', selector: "textarea[name='q']", text: 'markdown' },
      { type: 'press', selector: "textarea[name='q']", key: 'Enter' },
    ] })).toBe('Google')
    expect(resolveExpertSearchEngineForInput({ actions: [{ type: 'navigate', url: 'https://www.baidu.com/' }] })).toBe('百度')
    expect(resolveExpertSearchEngineForInput({ actions: [{ type: 'navigate', url: 'https://www.bing.com/' }] })).toBe('Bing')
    expect(resolveExpertSearchEngineForInput({ actions: [{ type: 'navigate', url: 'https://www.so.com/' }] })).toBe('360')
    expect(resolveExpertSearchEngineForInput({ actions: [{ type: 'navigate', url: 'https://support.google.com/' }] })).toBeUndefined()
    expect(resolveExpertSearchEngineForInput({ actions: [{ type: 'navigate', url: 'https://typora.io/' }] })).toBeUndefined()
    expect(resolveExpertSearchEngineForInput({ actions: [{ type: 'fill', selector: 'input', value: 'markdown' }] })).toBeUndefined()
  })

  test('acquires and releases only for an opted-in Playwright SERP request', async () => {
    const requests: unknown[] = []
    const fetchImpl: typeof fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify(requests.length === 1 ? { leaseId: 'lease-1', engine: 'Bing', waitedMs: 17 } : { released: true }))
    }
    const lease = await coordinateExpertBrowserSearchPacing({
      toolName: 'Playwright',
      input: { actions: [{ type: 'navigate', url: 'https://www.bing.com/search?q=markdown' }] },
      env,
      fetchImpl,
    })
    expect(lease.engine).toBe('Bing')
    expect(lease.waitedMs).toBe(17)
    await lease.release()
    expect(requests).toEqual([
      { sessionId: 'expert-session', action: 'acquire', engine: 'Bing', minIntervalMs: 3000 },
      { sessionId: 'expert-session', action: 'release', leaseId: 'lease-1' },
    ])
  })

  test('acquires before a homepage-fill-Enter search sequence can begin', async () => {
    const requests: unknown[] = []
    const fetchImpl: typeof fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify(requests.length === 1 ? { leaseId: 'lease-google', engine: 'Google', waitedMs: 3000 } : { released: true }))
    }

    const lease = await coordinateExpertBrowserSearchPacing({
      toolName: 'Playwright',
      input: {
        actions: [
          { type: 'navigate', url: 'https://www.google.com/' },
          { type: 'fill', selector: "textarea[name='q']", text: 'mouse productivity' },
          { type: 'press', selector: "textarea[name='q']", key: 'Enter' },
        ],
      },
      env,
      fetchImpl,
    })

    expect(lease.engine).toBe('Google')
    expect(lease.waitedMs).toBe(3000)
    await lease.release()
    expect(requests).toEqual([
      { sessionId: 'expert-session', action: 'acquire', engine: 'Google', minIntervalMs: 3000 },
      { sessionId: 'expert-session', action: 'release', leaseId: 'lease-google' },
    ])
  })

  test('leaves direct pages and ordinary sessions untouched', async () => {
    let called = false
    const result = await coordinateExpertBrowserSearchPacing({
      toolName: 'Playwright',
      input: { actions: [{ type: 'navigate', url: 'https://typora.io/' }] },
      env,
      fetchImpl: async () => { called = true; return new Response('{}') },
    })
    await result.release()
    expect(called).toBe(false)
  })
})
