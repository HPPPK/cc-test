import { expect, test } from 'bun:test'
import { expertLocalRequest } from './expertLocalTransport.js'

test('retries a lost local acknowledgement once with the exact same reservation identity', async () => {
  const requests: Array<{ body: unknown; proxy: unknown }> = []
  const result = await expertLocalRequest('http://127.0.0.1:3456/api/sessions/s/expert/research-budget', {
    method: 'POST', body: JSON.stringify({ action: 'reserve-browser', agentId: 'a', requestId: 'same-call' }),
  }, { fetchImpl: async (_url, init) => {
    requests.push({ body: init?.body, proxy: (init as any)?.proxy })
    if (requests.length === 1) throw new TypeError('connection reset after commit')
    return Response.json({ allowed: true })
  } })
  expect(result.status).toBe(200)
  expect(requests).toHaveLength(2)
  expect(requests[0]).toEqual(requests[1])
  expect(requests[0]?.proxy).toBe('')
})

test('does not retry structured denials or non-local requests', async () => {
  for (const status of [400, 401, 409, 503]) {
    let calls = 0
    const response = await expertLocalRequest('http://localhost:3456/test', {}, { fetchImpl: async () => { calls++; return new Response('', { status }) } })
    expect(response.status).toBe(status)
    expect(calls).toBe(1)
  }
  let calls = 0
  await expect(expertLocalRequest('https://example.com/', {}, { fetchImpl: async (_url, init) => {
    calls++; expect((init as any)?.proxy).toBeUndefined(); throw new Error('offline')
  } })).rejects.toThrow('offline')
  expect(calls).toBe(1)
})

test('bounds consecutive local transport failures', async () => {
  let calls = 0
  await expect(expertLocalRequest('http://[::1]:3456/test', {}, { fetchImpl: async () => { calls++; throw new Error('offline') } })).rejects.toThrow('offline')
  expect(calls).toBe(2)
})

test('a real local timeout can recover without duplicating a committed reservation', async () => {
  const charged = new Set<string>()
  let calls = 0
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
    const body = await req.json() as { requestId: string }
    charged.add(body.requestId)
    calls++
    if (calls === 1) await Bun.sleep(120)
    return Response.json({ allowed: true })
  } })
  try {
    const result = await expertLocalRequest(`http://127.0.0.1:${server.port}/research-budget`, {
      method: 'POST', body: JSON.stringify({ requestId: 'one-call' }),
    }, { timeoutMs: 80 })
    expect(result.ok).toBe(true)
    expect(calls).toBe(2)
    expect(charged.size).toBe(1)
  } finally { server.stop(true) }
})
