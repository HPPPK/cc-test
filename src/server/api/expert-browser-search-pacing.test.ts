import { expect, test } from 'bun:test'
import { handleExpertBrowserSearchPacingApi } from './expert-browser-search-pacing.js'
import { expertHumanVerificationService } from '../services/expertHumanVerificationService.js'
import { expertRuntimeSessionStore } from '../services/expertRuntimeSessionStore.js'
import { expertSearchPacingService } from '../services/expertSearchPacingService.js'

test('API discovery is paused by human verification and releases remain possible', async () => {
  const originalGet = expertRuntimeSessionStore.get
  const originalPending = expertHumanVerificationService.getPendingRequest
  let pending = true
  expertRuntimeSessionStore.get = async () => ({ runtimeBinding: { active: true, researchBrowserPolicy: { searchEnginePacing: { enabled: true } } } }) as never
  expertHumanVerificationService.getPendingRequest = () => pending ? ({ requestId: 'human-only' }) as never : null
  const call = (body: Record<string, unknown>) => handleExpertBrowserSearchPacingApi(new Request('http://localhost/api/expert-browser-search-pacing', {
    method: 'POST', body: JSON.stringify({ sessionId: 'trial', ...body }),
  }), new URL('http://localhost'), ['api', 'expert-browser-search-pacing'])
  try {
    await expect(call({ action: 'acquire', engine: 'Tavily API', minIntervalMs: 0 })).rejects.toThrow('HUMAN_VERIFICATION_PENDING')
    pending = false
    const response = await call({ action: 'acquire', engine: 'Tavily API', minIntervalMs: 0 })
    const lease = await response.json() as { leaseId: string }
    pending = true
    expect(await (await call({ action: 'release', leaseId: lease.leaseId })).json()).toEqual({ released: true })
    pending = false
    const owner = await (await call({ action: 'acquire', engine: 'Brave API', minIntervalMs: 0 })).json() as { leaseId: string }
    const queued = call({ action: 'acquire', engine: 'Brave API', minIntervalMs: 0 }).catch(error => error)
    await new Promise(resolve => setTimeout(resolve, 5))
    pending = true
    expertSearchPacingService.release('trial', owner.leaseId)
    expect(await queued).toBeInstanceOf(Error)
    pending = false
    const recovered = await call({ action: 'acquire', engine: 'Brave API', minIntervalMs: 0 })
    expect(recovered.ok).toBe(true)
  } finally {
    expertRuntimeSessionStore.get = originalGet
    expertHumanVerificationService.getPendingRequest = originalPending
    expertSearchPacingService.resetForTests()
  }
})
