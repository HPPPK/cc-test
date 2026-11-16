import { describe, expect, test } from 'bun:test'
import { CommercializationResearchBudgetService } from './commercializationResearchBudgetService.js'
const start = '2026-10-25T00:00:00.000Z'
const expert = { mode: 'expert', status: 'active', runtimeBinding: { expertId: 'commercialization-research-report', activatedAt: start } }
describe('commercialization research budget', () => {
  test('excludes runtime-confirmed human wait while retaining active research deadline and call quota', () => {
    let waited = 0
    const service = new CommercializationResearchBudgetService(() => waited)
    const t = Date.parse(start)
    expect(service.reserve('wait', expert, { action: 'reserve-researcher', agentId: 'a', artifactPath: 'lane' }, t).allowed).toBe(true)
    waited = 600_000
    expect(service.reserve('wait', expert, { action: 'reserve-browser', agentId: 'a', requestId: 'after-user-login' }, t + 1_000_000).allowed).toBe(true)
    expect(service.reserve('wait', expert, { action: 'reserve-browser', agentId: 'a', requestId: 'expired' }, t + 1_500_000).allowed).toBe(false)
    for (let i = 0; i < 11; i++) expect(service.reserve('wait', expert, { action: 'reserve-browser', agentId: 'a', requestId: 'c' + i }, t + 1_000_000).allowed).toBe(true)
    expect(service.reserve('wait', expert, { action: 'reserve-browser', agentId: 'a', requestId: 'over-quota' }, t + 1_000_000).allowed).toBe(false)
  })
  test('atomically reserves six starts and treats duplicate IDs idempotently', async () => {
    const service = new CommercializationResearchBudgetService()
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => Promise.resolve().then(() => service.reserve('s', expert, { action: 'reserve-researcher', agentId: String(i), artifactPath: 'lane' + (i % 3) }, Date.parse(start)))))
    expect(results.filter(r => r.allowed)).toHaveLength(6)
    expect(service.reserve('s', expert, { action: 'reserve-researcher', agentId: '0', artifactPath: 'lane0' }, Date.parse(start)).allowed).toBe(true)
  })
  test('limits each lane to two and browser calls to twelve with idempotent request IDs', () => {
    const service = new CommercializationResearchBudgetService()
    const reserve = (action: 'reserve-researcher' | 'reserve-browser', agentId: string, requestId?: string) => service.reserve('s', expert, { action, agentId, artifactPath: 'lane', requestId }, Date.parse(start))
    expect(reserve('reserve-researcher', 'a').allowed).toBe(true)
    expect(reserve('reserve-researcher', 'b').allowed).toBe(true)
    expect(reserve('reserve-researcher', 'c').allowed).toBe(false)
    for (let i = 0; i < 12; i++) expect(reserve('reserve-browser', 'a', String(i)).allowed).toBe(true)
    expect(reserve('reserve-browser', 'a', '0').allowed).toBe(true)
    expect(reserve('reserve-browser', 'a', '13').allowed).toBe(false)
    expect(reserve('reserve-browser', 'unknown', '1').allowed).toBe(false)
  })
  test('uses activation deadline, isolates runtimes, and leaves other experts alone', () => {
    const service = new CommercializationResearchBudgetService()
    expect(service.reserve('s', expert, { action: 'reserve-researcher', agentId: 'a', artifactPath: 'lane' }, Date.parse(start) + 900000).allowed).toBe(false)
    expect(service.reserve('s', { ...expert, runtimeBinding: { ...expert.runtimeBinding, expertId: 'other' } }, { action: 'reserve-browser', agentId: 'a' }).allowed).toBe(true)
    expect(service.reserve('s', { ...expert, runtimeBinding: { ...expert.runtimeBinding, activatedAt: 'invalid' } }, { action: 'reserve-researcher', agentId: 'a' }).allowed).toBe(false)
  })
  test('rehydrates existing starts conservatively without creating browser outcomes', () => {
    const service = new CommercializationResearchBudgetService()
    const saved = { ...expert, researchEvidence: { records: [{ agentId: 'a', agentType: 'expert-evidence-researcher', artifactPath: 'lane', recordedAt: start, entries: [] }] } }
    expect(service.reserve('s', saved, { action: 'reserve-browser', agentId: 'a', requestId: 'x' }, Date.parse(start)).allowed).toBe(false)
    expect(service.reserve('s', saved, { action: 'reserve-researcher', agentId: 'b', artifactPath: 'lane' }, Date.parse(start)).allowed).toBe(true)
  })
})

test('normalizes part paths, checks declared lane allowlist, and charges expired browser calls', () => {
  const service = new CommercializationResearchBudgetService()
  const restricted = { ...expert, runtimeBinding: { ...expert.runtimeBinding, researchArtifactPolicy: { researcherPaths: ['research/02.md'] } } }
  const now = Date.parse(start)
  expect(service.reserve('r', restricted, { action: 'reserve-researcher', agentId: 'a', artifactPath: 'research/02.parts/a.md' }, now).allowed).toBe(true)
  expect(service.reserve('r', restricted, { action: 'reserve-researcher', agentId: 'b', artifactPath: 'research/02.parts/b.md' }, now).allowed).toBe(true)
  expect(service.reserve('r', restricted, { action: 'reserve-researcher', agentId: 'c', artifactPath: 'research/02.md' }, now).allowed).toBe(false)
  expect(service.reserve('r', restricted, { action: 'reserve-researcher', agentId: 'c', artifactPath: 'other' }, now).allowed).toBe(false)
  expect(service.reserve('r', restricted, { action: 'reserve-browser', agentId: 'a', requestId: 'late' }, now + 900000).allowed).toBe(false)
  expect(service.reserve('r', restricted, { action: 'reserve-researcher', agentId: '' }, now).allowed).toBe(false)
  expect(service.reserve('r', restricted, { action: 'reserve-researcher', agentId: 'd' }, now).allowed).toBe(false)
})
test('rehydrates retry starts and preserves fresh activation isolation', () => {
  const service = new CommercializationResearchBudgetService()
  const saved = { ...expert, researchSourceDispatches: { receipts: [{ agentId: 'a', artifactPath: 'lane', dispatchedAt: start, retryCount: 5 }] } }
  expect(service.reserve('s', saved, { action: 'reserve-researcher', agentId: 'b', artifactPath: 'other' }, Date.parse(start)).allowed).toBe(false)
  const later = '2026-10-25T01:00:00.000Z'
  expect(service.reserve('s', { ...saved, runtimeBinding: { ...expert.runtimeBinding, activatedAt: later } }, { action: 'reserve-researcher', agentId: 'b', artifactPath: 'other' }, Date.parse(later)).allowed).toBe(true)
})

test('restored retries consume the original lane capacity', () => {
  const service = new CommercializationResearchBudgetService()
  const saved = { ...expert, researchSourceDispatches: { receipts: [{ agentId: 'a', artifactPath: 'lane', dispatchedAt: start, retryCount: 1 }] } }
  expect(service.reserve('retry-lane', saved, { action: 'reserve-researcher', agentId: 'b', artifactPath: 'lane' }, Date.parse(start)).allowed).toBe(false)
  expect(service.reserve('retry-lane', saved, { action: 'reserve-researcher', agentId: 'c', artifactPath: 'other' }, Date.parse(start)).allowed).toBe(true)
})


test('a rejected start leaves running researchers available and describes only the denied operation', () => {
  const service = new CommercializationResearchBudgetService()
  const now = Date.parse(start)
  for (const agentId of ['a', 'b']) expect(service.reserve('scope', expert, { action: 'reserve-researcher', agentId, artifactPath: 'lane' }, now).allowed).toBe(true)
  const startDenial = service.reserve('scope', expert, { action: 'reserve-researcher', agentId: 'cleanup', artifactPath: 'lane' }, now)
  expect(startDenial.allowed).toBe(false)
  expect(startDenial.reason).toContain('researcher start limit reached')
  expect(startDenial.reason).toContain('already-running researchers may continue')
  expect(startDenial.reason).toContain('including human-verification waits, to finish')
  expect(startDenial.reason).not.toContain('do not start more research')
  for (let index = 0; index < 12; index++) expect(service.reserve('scope', expert, { action: 'reserve-browser', agentId: 'a', requestId: String(index) }, now).allowed).toBe(true)
  const callDenial = service.reserve('scope', expert, { action: 'reserve-browser', agentId: 'a', requestId: 'excess' }, now)
  expect(callDenial.allowed).toBe(false)
  expect(callDenial.reason).toContain('Only this researcher must stop browsing')
  expect(callDenial.reason).toContain('Other researchers retain their own remaining budgets')
  expect(service.reserve('scope', expert, { action: 'reserve-browser', agentId: 'b', requestId: 'still-live' }, now).allowed).toBe(true)
  const globalDenial = service.reserve('scope', expert, { action: 'reserve-browser', agentId: 'b', requestId: 'expired' }, now + 900000)
  expect(globalDenial.reason).toContain('fifteen-minute research window ended')
  expect(globalDenial.reason).toContain('do not start more research')
})

test('read-only budget inspection preserves reservations and reports bounded lane follow-ups', () => {
  const service = new CommercializationResearchBudgetService()
  const now = Date.parse(start)
  const scoped = { ...expert, runtimeBinding: { ...expert.runtimeBinding, researchArtifactPolicy: { researcherPaths: ['A', 'B', 'C'] } } }
  expect(service.reserve('inspect', scoped, { action: 'reserve-researcher', agentId: 'a', artifactPath: 'A' }, now).allowed).toBe(true)
  expect(service.inspect('inspect', scoped, now)).toMatchObject({ remainingStarts: 5, remainingByLane: { A: 1, B: 2, C: 2 }, timeRemainingMs: 900000 })
  expect(service.inspect('inspect', scoped, now).remainingStarts).toBe(5)
  expect(service.reserve('inspect', scoped, { action: 'reserve-researcher', agentId: 'a-followup', artifactPath: 'A' }, now).allowed).toBe(true)
  expect(service.inspect('inspect', scoped, now).remainingByLane.A).toBe(0)
  expect(service.inspect('inspect', scoped, now + 900000).timeRemainingMs).toBe(0)
})

test('quality-enabled research gets a bounded 25-minute window without relaxing legacy budgets', () => {
  const service = new CommercializationResearchBudgetService()
  const quality = { ...expert, runtimeBinding: { ...expert.runtimeBinding, outputProtocol: { content: JSON.stringify({ researchQualityCheckpoint: { version: 1, minimumDistinctSuppliers: 2, minimumUserSignals: 2, minimumChannelMechanisms: 2 } }) } } }
  expect(service.inspect('quality-window', quality, Date.parse(start)).timeRemainingMs).toBe(25 * 60000)
  expect(service.reserve('quality-window', quality, { action: 'reserve-researcher', agentId: 'a', artifactPath: 'lane' }, Date.parse(start) + 16 * 60000).allowed).toBe(true)
  expect(service.inspect('legacy-window', expert, Date.parse(start)).timeRemainingMs).toBe(15 * 60000)
})


test('unfinished follow-ups are visible, and settling a failed worker never refunds its slot', () => {
  const service = new CommercializationResearchBudgetService()
  const now = Date.parse(start)
  const scoped = { ...expert, runtimeBinding: { ...expert.runtimeBinding, researchArtifactPolicy: { researcherPaths: ['A'] } } }
  service.reserve('pending', scoped, { action: 'reserve-researcher', agentId: 'a', artifactPath: 'A' }, now)
  expect(service.inspect('pending', scoped, now).pendingByLane.A).toBe(1)
  expect(service.finish('pending', scoped, 'unknown')).toBe(false)
  expect(service.finish('pending', scoped, 'a')).toBe(true)
  const status = service.inspect('pending', scoped, now)
  expect(status.pendingByLane.A).toBe(0)
  expect(status.remainingByLane.A).toBe(1)
})

 test('normal worker stays pending until its saved evidence audit arrives', () => {
  const service = new CommercializationResearchBudgetService()
  const now = Date.parse(start)
  const scoped = { ...expert, runtimeBinding: { ...expert.runtimeBinding, researchArtifactPolicy: { researcherPaths: ['A'] } } }
  service.reserve('audit-receipt', scoped, { action: 'reserve-researcher', agentId: 'a', artifactPath: 'A' }, now)
  expect(service.inspect('audit-receipt', scoped, now).pendingByLane.A).toBe(1)
  const saved = { ...scoped, researchEvidence: { records: [{ agentId: 'a', agentType: 'expert-evidence-researcher', artifactPath: 'A', recordedAt: start, entries: [] }] } }
  expect(service.inspect('audit-receipt', saved, now).pendingByLane.A).toBe(0)
  expect(service.inspect('audit-receipt', saved, now).remainingByLane.A).toBe(1)
})

test('adaptive intake wait does not consume the admitted research window', () => {
  const service = new CommercializationResearchBudgetService()
  const admittedAt = new Date(Date.parse(start) + 60 * 60_000).toISOString()
  const admitted = { ...expert, researchIntake: { admittedAt } }
  expect(service.reserve('intake', admitted, { action: 'reserve-researcher', agentId: 'a', artifactPath: 'lane' }, Date.parse(admittedAt)).allowed).toBe(true)
  expect(service.inspect('intake', admitted, Date.parse(admittedAt)).timeRemainingMs).toBe(900_000)
})


test('save-only resume exposes real same-worker generations without refunding research quota', () => {
  const service = new CommercializationResearchBudgetService()
  const t = Date.parse(start)
  const scoped = { ...expert, runtimeBinding: { ...expert.runtimeBinding, researchArtifactPolicy: { researcherPaths: ['research/02.md'] } } }
  const reserve = () => service.reserve('lifecycle', scoped, { action: 'reserve-researcher', agentId: 'original-A', artifactPath: 'research/02.parts/original-A.md' }, t)
  expect(reserve().allowed).toBe(true)
  expect(service.getWorkerLifecycles('lifecycle', scoped)).toEqual([{ agentId: 'original-A', artifactPath: 'research/02.md', state: 'running', generation: 1, startedAt: t }])
  reserve() // Transport retries cannot invent another execution generation.
  expect(service.getWorkerLifecycles('lifecycle', scoped)[0]!.generation).toBe(1)
  expect(service.finish('lifecycle', scoped, 'original-A')).toBe(true)
  expect(service.getWorkerLifecycles('lifecycle', scoped)[0]!.state).toBe('ended')
  expect(service.reserve('lifecycle', scoped, { action: 'reserve-researcher', agentId: 'original-A', artifactPath: 'research/02.md' }, t + 9999999).allowed).toBe(true)
  expect(service.getWorkerLifecycles('lifecycle', scoped)[0]).toMatchObject({ state: 'running', generation: 2, startedAt: t + 9999999 })
  expect(service.inspect('lifecycle', scoped, t).remainingByLane['research/02.md']).toBe(1)
  expect(service.reserve('lifecycle', scoped, { action: 'reserve-browser', agentId: 'original-A', requestId: 'new-search' }, t + 9999999).allowed).toBe(false)
})


test('a pending save-only handoff cannot be replaced by a fresh researcher on the same lane', () => {
  const service = new CommercializationResearchBudgetService()
  const t = Date.parse(start)
  service.reserve('resume', expert, { action: 'reserve-researcher', agentId: 'original', artifactPath: 'lane' }, t)
  service.finish('resume', expert, 'original')
  service.markSaveOnlyRecovery('resume', expert, 'original')
  const before = service.inspect('resume', expert, t).remainingStarts
  const decision = service.reserve('resume', expert, { action: 'reserve-researcher', agentId: 'empty-replacement', artifactPath: 'lane' }, t)
  expect(decision).toMatchObject({ allowed: false })
  expect(decision.reason).toContain('SendMessage')
  expect(decision.reason).toContain('original')
  expect(service.inspect('resume', expert, t).remainingStarts).toBe(before)
  expect(service.reserve('resume', expert, { action: 'reserve-researcher', agentId: 'original', artifactPath: 'lane' }, t).allowed).toBe(true)
  service.completeSaveOnlyRecovery('resume', expert, 'original')
  expect(service.reserve('resume', expert, { action: 'reserve-researcher', agentId: 'followup', artifactPath: 'lane' }, t).allowed).toBe(true)
})

test('save-only recovery is a host-enforced browser boundary, not just a model instruction', () => {
  const service = new CommercializationResearchBudgetService()
  const t = Date.parse(start)
  service.reserve('save-only', expert, { action: 'reserve-researcher', agentId: 'original', artifactPath: 'lane' }, t)
  expect(service.reserve('save-only', expert, { action: 'reserve-browser', agentId: 'original', requestId: 'before' }, t).allowed).toBe(true)
  service.markSaveOnlyRecovery('save-only', expert, 'original')
  expect(service.reserve('save-only', expert, { action: 'reserve-browser', agentId: 'original', requestId: 'after' }, t)).toMatchObject({ allowed: false, reason: expect.stringContaining('EXPERT_RESEARCH_SAVE_ONLY_RECOVERY') })
  expect(service.reserve('save-only', expert, { action: 'reserve-browser', agentId: 'original', requestId: 'before' }, t).allowed).toBe(false)
  service.finish('save-only', expert, 'original')
  expect(service.reserve('save-only', expert, { action: 'reserve-researcher', agentId: 'original', artifactPath: 'lane' }, t).allowed).toBe(true)
  expect(service.reserve('save-only', expert, { action: 'reserve-browser', agentId: 'original', requestId: 'resumed' }, t).allowed).toBe(false)
  service.reserve('save-only', expert, { action: 'reserve-researcher', agentId: 'sibling', artifactPath: 'other' }, t)
  expect(service.reserve('save-only', expert, { action: 'reserve-browser', agentId: 'sibling', requestId: 'allowed' }, t).allowed).toBe(true)
})
