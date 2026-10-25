import { expertHumanVerificationService } from './expertHumanVerificationService.js'

/** Process-local admission control; never manufactures browser evidence or changes persisted shapes. */
export const COMMERCIALIZATION_RESEARCH_LIMITS = { researchers: 6, perLane: 2, browserCalls: 12, windowMs: 15 * 60_000 } as const
export const RESEARCH_BUDGET_STOP = 'EXPERT_RESEARCH_BUDGET_EXHAUSTED: Save the existing evidence and explicit unresearched gaps to your assigned Markdown, Read it back, submit the real audit, and return. Continue D/E/F using existing evidence; do not start more research or invent visits.'
type SavedWorker = { agentId: string; agentType?: string; artifactPath?: string; recordedAt?: string; dispatchedAt?: string; retryCount?: number }
type BudgetExpert = { mode?: string; status?: string; runtimeBinding?: { expertId?: string; activatedAt?: string; researchArtifactPolicy?: { researcherPaths: string[] } }; researchEvidence?: { records: SavedWorker[] }; researchSourceDispatches?: { receipts: SavedWorker[] } }
export type ResearchBudgetRequest = { action: 'reserve-researcher' | 'reserve-browser'; agentId: string; artifactPath?: string; requestId?: string }
type Worker = { lane: string; calls: Set<string> }
type State = { workers: Map<string, Worker>; restoredExtraStarts: number; restoredExtraByLane: Map<string, number> }
export type ResearchBudgetDecision = { allowed: boolean; applicable: boolean; reason?: string; deadline?: string }
const lanePath = (value: string) => value.replace(/\\/g, '/').replace(/\.parts\/[^/]+\.md$/, '.md')
export class CommercializationResearchBudgetService {
  private states = new Map<string, State>()
  constructor(private readonly humanWaitMs: (sessionId: string, since: number, now: number) => number = () => 0) {}
  reserve(sessionId: string, expert: BudgetExpert | undefined, input: ResearchBudgetRequest, now = Date.now()): ResearchBudgetDecision {
    const binding = expert?.runtimeBinding
    if (expert?.mode !== 'expert' || expert.status !== 'active' || binding?.expertId !== 'commercialization-research-report') return { allowed: true, applicable: false }
    const activated = Date.parse(binding.activatedAt ?? '')
    const pausedMs = Number.isFinite(activated) ? this.humanWaitMs(sessionId, activated, now) : 0
    const deadlineMs = activated + COMMERCIALIZATION_RESEARCH_LIMITS.windowMs + (Number.isFinite(pausedMs) ? Math.max(0, Math.min(pausedMs, Math.max(0, now - activated))) : 0)
    const denied = (reason: string): ResearchBudgetDecision => ({ allowed: false, applicable: true, reason: RESEARCH_BUDGET_STOP + ' (' + reason + ')', ...(Number.isFinite(deadlineMs) ? { deadline: new Date(deadlineMs).toISOString() } : {}) })
    if (!input.agentId.trim() || !Number.isFinite(activated)) return denied('missing researcher identity or activation timestamp')
    const key = sessionId + ':' + binding.activatedAt
    let state = this.states.get(key)
    if (!state) {
      state = { workers: new Map(), restoredExtraStarts: 0, restoredExtraByLane: new Map() }
      // Audit page entries do not equal browser calls. Restored workers are treated
      // as having spent their call budget. Unrecorded in-flight starts cannot be
      // reconstructed after a server restart; the absolute deadline still holds.
      const saved = [...(expert.researchEvidence?.records ?? []).filter(r => r.agentType === 'expert-evidence-researcher'), ...(expert.researchSourceDispatches?.receipts ?? [])]
      for (const row of saved) {
        const stamp = Date.parse(row.recordedAt ?? row.dispatchedAt ?? '')
        if (!Number.isFinite(stamp) || stamp < activated) continue
        state.workers.set(row.agentId, { lane: lanePath(row.artifactPath ?? ''), calls: new Set(Array.from({ length: COMMERCIALIZATION_RESEARCH_LIMITS.browserCalls }, (_, i) => 'restored:' + i)) })
      }
      const receiptStartsByLane = new Map<string, number>()
      for (const row of expert.researchSourceDispatches?.receipts ?? []) {
        if (!(Date.parse(row.dispatchedAt ?? '') >= activated)) continue
        const lane = lanePath(row.artifactPath ?? '')
        receiptStartsByLane.set(lane, (receiptStartsByLane.get(lane) ?? 0) + 1 + (row.retryCount ?? 0))
      }
      for (const [lane, count] of receiptStartsByLane) {
        const known = [...state.workers.values()].filter(worker => worker.lane === lane).length
        const extra = Math.max(0, count - known)
        state.restoredExtraByLane.set(lane, extra)
        state.restoredExtraStarts += extra
      }
      this.states.set(key, state)
    }
    const worker = state.workers.get(input.agentId)
    if (input.action === 'reserve-researcher' && worker) return { allowed: true, applicable: true, deadline: new Date(deadlineMs).toISOString() }
    if (input.action === 'reserve-browser' && worker?.calls.has(input.requestId ?? '')) return { allowed: true, applicable: true, deadline: new Date(deadlineMs).toISOString() }
    if (now >= deadlineMs) return denied('fifteen-minute research window ended')
    if (input.action === 'reserve-researcher') {
      if (!input.artifactPath?.trim()) return denied('missing assigned research lane')
      const lane = lanePath(input.artifactPath)
      if (binding.researchArtifactPolicy && !binding.researchArtifactPolicy.researcherPaths.includes(lane)) return denied('unknown assigned research lane')
      if (state.workers.size + state.restoredExtraStarts >= COMMERCIALIZATION_RESEARCH_LIMITS.researchers || [...state.workers.values()].filter(w => w.lane === lane).length + (state.restoredExtraByLane.get(lane) ?? 0) >= COMMERCIALIZATION_RESEARCH_LIMITS.perLane) return denied('researcher start limit reached')
      state.workers.set(input.agentId, { lane, calls: new Set() })
    } else {
      if (!worker || !input.requestId?.trim()) return denied('browser call has no reserved researcher or call identity')
      if (worker.calls.size >= COMMERCIALIZATION_RESEARCH_LIMITS.browserCalls) return denied('twelve browser tool calls consumed')
      worker.calls.add(input.requestId)
    }
    return { allowed: true, applicable: true, deadline: new Date(deadlineMs).toISOString() }
  }
}
export const commercializationResearchBudgetService = new CommercializationResearchBudgetService((sessionId, since, now) => expertHumanVerificationService.getVerificationWaitMs(sessionId, since, now))
