import { withFetchPreconnect } from "../../server/__tests__/fixtureAssertions.js"
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
    const fetchImpl: typeof fetch = withFetchPreconnect(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify(requests.length === 1 ? { leaseId: 'lease-1', engine: 'Bing', waitedMs: 17 } : { released: true }))
    })
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
    const fetchImpl: typeof fetch = withFetchPreconnect(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify(requests.length === 1 ? { leaseId: 'lease-google', engine: 'Google', waitedMs: 3000 } : { released: true }))
    })

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
      fetchImpl: withFetchPreconnect(async () => { called = true; return new Response('{}') }),
    })
    await result.release()
    expect(called).toBe(false)
  })
})

test('API discovery shares an App-wide provider queue without labelling it a Google SERP', async () => {
  const requests: any[] = []
  const lease = await coordinateExpertBrowserSearchPacing({ toolName: 'WebSearch', input: { query: 'photo restoration' }, searchProvider: 'tavily-keyless', env, fetchImpl: (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); requests.push(body)
    return Response.json(body.action === 'acquire' ? { leaseId: 'api-lease', engine: 'Tavily API', waitedMs: 0 } : { released: true })
  }) as typeof fetch } as never)
  expect(requests[0]?.engine).toBe('Tavily API')
  expect(lease.engine).toBeUndefined()
  await lease.release()
  expect(requests[1]?.action).toBe('release')
})

test('keeps the same operation waiting and resumes its unchanged engine after a user resolution', async () => {
  const { withExpertSearchPacing } = await import('./expertBrowserSearchPacingRuntime.js')
  let pending = true
  let ran = false
  const requests: Record<string, unknown>[] = []
  const operation = withExpertSearchPacing({ toolName: 'WebSearch', input: { query: 'old photos' }, searchProvider: 'tavily-keyless', env,
    fetchImpl: withFetchPreconnect(async (_url, init) => {
      const body = JSON.parse(String(init?.body)); requests.push(body)
      return body.action === 'release' ? Response.json({ released: true }) : pending
        ? Response.json({ error: 'HUMAN_VERIFICATION_PENDING' }, { status: 409 })
        : Response.json({ leaseId: 'after-human-choice', waitedMs: 0 })
    }),
  }, async () => { ran = true; return 'saved evidence' })
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(ran).toBe(false)
  pending = false
  expect(await operation).toBe('saved evidence')
  expect(requests.filter(r => r.action === 'acquire').map(r => r.engine)).toEqual(['Tavily API', 'Tavily API'])
}, 6000)

describe('search pacing lease failure diagnostics', () => {
  const request = (fetchImpl: typeof fetch) => coordinateExpertBrowserSearchPacing({
    toolName: 'WebSearch', input: { query: 'test' }, searchProvider: 'tavily-keyless', env, fetchImpl,
  })

  for (const [status, code, recovery] of [
    [403, 'FORBIDDEN', 'authorization'],
    [429, 'RATE_LIMITED', 'rate limit'],
    [500, 'INTERNAL_ERROR', 'service'],
    [409, 'CONFLICT', 'conflict'],
  ] as const) {
    test(`preserves HTTP ${status} and safe code without upstream messages or retrying`, async () => {
      let calls = 0
      const failure = await request(withFetchPreconnect(async () => {
        calls++
        return Response.json({ error: code, message: 'secret-token https://private.example/?token=secret' }, { status })
      })).catch(error => error)
      expect(failure).toBeInstanceOf(Error)
      expect(failure.message).toContain(`HTTP ${status}`)
      expect(failure.message).toContain(code)
      expect(failure.message).toContain(recovery)
      expect(failure.message).not.toContain('secret')
      expect(failure.message).not.toContain('https:')
      expect(failure.message).not.toContain('HUMAN_VERIFICATION_PENDING')
      expect(calls).toBe(1)
    })
  }

  test.each(['not-json', '{}', '{"leaseId":"","waitedMs":0}', '{"leaseId":"lease","waitedMs":-1}'])('identifies malformed success payload %s', async body => {
    await expect(request(withFetchPreconnect(async () => new Response(body)))).rejects.toThrow('INVALID_LEASE_RESPONSE (HTTP 200)')
  })

  test('unknown error codes and an empty conflict cannot masquerade as a human wait', async () => {
    for (const payload of [{}, { error: 'https://private.example/secret-token' }]) {
      const failure = await request(withFetchPreconnect(async () => Response.json(payload, { status: 409 }))).catch(error => error)
      expect(failure.message).toContain('LEASE_REQUEST_FAILED (HTTP 409)')
      expect(failure.message).not.toContain('HUMAN_VERIFICATION_PENDING')
      expect(failure.message).not.toContain('secret')
    }
  })

  test('cancellation interrupts a pending human wait without running or retrying the operation', async () => {
    const controller = new AbortController()
    let calls = 0
    const wait = coordinateExpertBrowserSearchPacing({ toolName: 'WebSearch', input: {}, searchProvider: 'tavily-keyless', env, signal: controller.signal,
      fetchImpl: withFetchPreconnect(async () => { calls++; return Response.json({ error: 'HUMAN_VERIFICATION_PENDING' }, { status: 409 }) }),
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    controller.abort(new Error('user cancelled research'))
    await expect(wait).rejects.toThrow('user cancelled research')
    expect(calls).toBe(1)
  })

  test('network failures report a bounded cause without exposing transport messages', async () => {
    let calls = 0
    const failure = await request(withFetchPreconnect(async () => {
      calls++
      throw new TypeError('fetch failed https://private.example/secret-token')
    })).catch(error => error)
    expect(failure.message).toContain('LEASE_NETWORK_ERROR')
    expect(failure.message).toContain('desktop server connection')
    expect(failure.message).not.toContain('secret')
    expect(failure.message).not.toContain('https:')
    expect(calls).toBe(1)
  })

  test('preserves intentional cancellation rather than misreporting a network failure', async () => {
    const controller = new AbortController()
    const aborted = new DOMException('Search cancelled', 'AbortError')
    controller.abort(aborted)
    await expect(coordinateExpertBrowserSearchPacing({
      toolName: 'WebSearch', input: {}, searchProvider: 'tavily-keyless', env, signal: controller.signal,
      fetchImpl: withFetchPreconnect(async () => { throw aborted }),
    })).rejects.toBe(aborted)
  })
})
