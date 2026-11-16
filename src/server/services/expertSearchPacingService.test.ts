import { describe, expect, test } from 'bun:test'
import { ExpertSearchPacingService } from './expertSearchPacingService.js'

describe('ExpertSearchPacingService', () => {
  test('serializes one engine and enforces the configured interval between leases', async () => {
    const service = new ExpertSearchPacingService()
    const first = await service.acquire({ sessionId: 'session-1', engine: 'Google', minIntervalMs: 30 })
    const startedAt = Date.now()
    const secondPromise = service.acquire({ sessionId: 'session-1', engine: 'Google', minIntervalMs: 30 })
    await Promise.resolve()
    expect(service.release('session-1', first.leaseId)).toBe(true)
    const second = await secondPromise
    expect(second.waitedMs).toBeGreaterThanOrEqual(25)
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25)
    expect(service.release('session-1', second.leaseId)).toBe(true)
  })

  test('keeps different engines independent within the same Expert session', async () => {
    const service = new ExpertSearchPacingService()
    const google = await service.acquire({ sessionId: 'session-1', engine: 'Google', minIntervalMs: 3_000 })
    const bing = await service.acquire({ sessionId: 'session-1', engine: 'Bing', minIntervalMs: 3_000 })
    expect(google.engine).toBe('Google')
    expect(bing.engine).toBe('Bing')
    expect(service.release('session-1', google.leaseId)).toBe(true)
    expect(service.release('session-1', bing.leaseId)).toBe(true)
  })

  test('rejects queued work and invalidates active leases when the session is cleared', async () => {
    const service = new ExpertSearchPacingService()
    const first = await service.acquire({ sessionId: 'session-1', engine: '百度', minIntervalMs: 3_000 })
    const queued = service.acquire({ sessionId: 'session-1', engine: '百度', minIntervalMs: 3_000 })
    service.clear('session-1', 'test cleanup')
    await expect(queued).rejects.toThrow('test cleanup')
    expect(service.release('session-1', first.leaseId)).toBe(false)
  })
})

test('serializes searches across conversations without clearing another session lease', async () => {
  const service = new ExpertSearchPacingService()
  const first = await service.acquire({ sessionId: 'a', engine: 'Google', minIntervalMs: 0 })
  let started = false
  const next = service.acquire({ sessionId: 'b', engine: 'Google', minIntervalMs: 0 }).then(lease => { started = true; return lease })
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(started).toBe(false)
  expect(service.release('b', first.leaseId)).toBe(false)
  service.clear('a')
  const second = await next
  service.clear('a')
  expect(service.release('b', second.leaseId)).toBe(true)
  service.resetForTests()
})

 test('cancels queued searches without stranding the next conversation', async () => {
  const service = new ExpertSearchPacingService()
  const first = await service.acquire({ sessionId: 'a', engine: 'Tavily API', minIntervalMs: 0 })
  const controller = new AbortController()
  const cancelled = service.acquire({ sessionId: 'b', engine: 'Tavily API', minIntervalMs: 0, signal: controller.signal })
  const rejected = cancelled.catch(error => error)
  controller.abort()
  expect(await rejected).toBeInstanceOf(Error)
  const next = service.acquire({ sessionId: 'c', engine: 'Tavily API', minIntervalMs: 0 })
  service.release('a', first.leaseId)
  const lease = await next
  expect(service.release('c', lease.leaseId)).toBe(true)
  service.resetForTests()
})
