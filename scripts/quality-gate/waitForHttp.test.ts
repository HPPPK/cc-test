import { expect, test } from 'bun:test'
import { waitForHttp } from './waitForHttp'

test('startup has no total deadline and waits for readiness after an initial failure', async () => {
  let attempts = 0
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('', { status: ++attempts < 2 ? 503 : 200 }) })
  try {
    await waitForHttp(`http://127.0.0.1:${server.port}`, { pollIntervalMs: 1 })
    expect(attempts).toBe(2)
  } finally { server.stop(true) }
})

test('a failed server process ends an unlimited startup wait', async () => {
  await expect(waitForHttp('http://127.0.0.1:1', { process: { exitCode: 1 } })).rejects.toThrow('exited with code 1')
})

test('explicit finite startup deadlines remain available', async () => {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('', { status: 503 }) })
  try {
    await expect(waitForHttp(`http://127.0.0.1:${server.port}`, { timeoutMs: 5, pollIntervalMs: 1 })).rejects.toThrow('Timed out waiting')
  } finally { server.stop(true) }
})
