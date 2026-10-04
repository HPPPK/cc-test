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
