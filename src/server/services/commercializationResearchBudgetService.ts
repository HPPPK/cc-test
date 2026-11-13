import { resolveResearchQualityCheckpointPolicy } from './expertResearchQualityCheckpoint.js'
import { expertHumanVerificationService } from './expertHumanVerificationService.js'

/** Process-local admission control; never manufactures browser evidence or changes persisted shapes. */
export const COMMERCIALIZATION_RESEARCH_LIMITS = { researchers: 6, perLane: 2, browserCalls: 12, windowMs: 15 * 60_000 } as const
export const RESEARCH_BUDGET_STOP = 'EXPERT_RESEARCH_BUDGET_EXHAUSTED: Save the existing evidence and explicit unresearched gaps to your assigned Markdown, Read it back, submit the real audit, and return. Continue D/E/F using existing evidence; do not start more research or invent visits.'
type SavedWorker = { agentId: string; agentType?: string; artifactPath?: string; recordedAt?: string; dispatchedAt?: string; retryCount?: number }
type BudgetExpert = { researchIntake?: { admittedAt?: string }; mode?: string; status?: string; runtimeBinding?: { expertId?: string; activatedAt?: string; outputProtocol?: { content: string }; researchArtifactPolicy?: { researcherPaths: string[] } }; researchEvidence?: { records: SavedWorker[] }; researchSourceDispatches?: { receipts: SavedWorker[] } }
export type ResearchBudgetRequest = { action: 'reserve-researcher' | 'reserve-browser'; agentId: string; artifactPath?: string; requestId?: string }
type Worker = { lane: string; calls: Set<string>; finished?: boolean; generation?: number; startedAt?: number }
type State = { workers: Map<string, Worker>; restoredExtraStarts: number; restoredExtraByLane: Map<string, number> }
export type ResearchBudgetDecision = { allowed: boolean; applicable: boolean; reason?: string; deadline?: string }
const lanePath = (value: string) => value.replace(/\\/g, '/').replace(/\.parts\/[^/]+\.md$/, '.md')
export class CommercializationResearchBudgetService {
  private states = new Map<string, State>()
  private saveOnlyRecoveries = new Set<string>()
  constructor(private readonly humanWaitMs: (sessionId: string, since: number, now: number) => number = () => 0) {}
  private deadline(sessionId: string, expert: BudgetExpert | undefined, now: number): number {
    const activated = Date.parse(expert?.researchIntake?.admittedAt ?? expert?.runtimeBinding?.activatedAt ?? '')
    const pausedMs = Number.isFinite(activated) ? this.humanWaitMs(sessionId, activated, now) : 0
    const quality = resolveResearchQualityCheckpointPolicy(expert?.runtimeBinding?.outputProtocol?.content)
    const windowMs = quality ? 25 * 60_000 : COMMERCIALIZATION_RESEARCH_LIMITS.windowMs
    return activated + windowMs + (Number.isFinite(pausedMs) ? Math.max(0, Math.min(pausedMs, Math.max(0, now - activated))) : 0)
  }

  finish(sessionId: string, expert: BudgetExpert | undefined, agentId: string): boolean {
    const worker = this.states.get(sessionId + ':' + expert?.runtimeBinding?.activatedAt)?.workers.get(agentId)
    if (!worker) return false
    worker.finished = true
    return true
  }

  markSaveOnlyRecovery(sessionId: string, expert: BudgetExpert | undefined, agentId: string): void {
    if (expert?.mode !== 'expert' || expert.status !== 'active' || expert.runtimeBinding?.expertId !== 'commercialization-research-report' || !agentId.trim()) return
    this.saveOnlyRecoveries.add(JSON.stringify([sessionId, expert.runtimeBinding.activatedAt, agentId]))
  }

  /** Actual process-local lifecycle, independent of source-batch receipts. */
  getWorkerLifecycles(sessionId: string, expert: BudgetExpert | undefined): Array<{ agentId: string; artifactPath: string; state: 'running' | 'ended'; generation: number; startedAt?: number }> {
    const workers = this.states.get(sessionId + ':' + expert?.runtimeBinding?.activatedAt)?.workers
    return [...(workers?.entries() ?? [])]
      // Restored records are history, not proof of a currently executing worker.
      .filter(([, worker]) => Boolean(worker.generation))
      .map(([agentId, worker]) => ({ agentId, artifactPath: worker.lane, state: worker.finished ? 'ended' : 'running', generation: worker.generation!, startedAt: worker.startedAt }))
  }

  /** Read-only admission snapshot. Never consumes a worker or browser reservation. */
  inspect(sessionId: string, expert: BudgetExpert | undefined, now = Date.now()) {
    const binding = expert?.runtimeBinding
    const state = this.states.get(sessionId + ':' + binding?.activatedAt)
    const counts = new Map<string, number>()
    const pending = new Map<string, number>()
    const completed = new Set((expert?.researchEvidence?.records ?? []).filter(r => r.agentType === 'expert-evidence-researcher').map(r => r.agentId))
    let starts = 0
    if (state) {
      starts = state.workers.size + state.restoredExtraStarts
      for (const [agentId, worker] of state.workers) {
        counts.set(worker.lane, (counts.get(worker.lane) ?? 0) + 1)
        if (!worker.finished && !completed.has(agentId)) pending.set(worker.lane, (pending.get(worker.lane) ?? 0) + 1)
      }
      for (const [lane, extra] of state.restoredExtraByLane) counts.set(lane, (counts.get(lane) ?? 0) + extra)
    } else {
      const workers = new Map<string, { lane: string; slots: number }>()
      const activated = Date.parse(binding?.activatedAt ?? '')
      for (const row of [...(expert?.researchEvidence?.records ?? []).filter(r => r.agentType === 'expert-evidence-researcher'), ...(expert?.researchSourceDispatches?.receipts ?? [])]) {
        if (!(Date.parse(row.recordedAt ?? row.dispatchedAt ?? '') >= activated)) continue
        const existing = workers.get(row.agentId)
        workers.set(row.agentId, { lane: lanePath(row.artifactPath ?? ''), slots: Math.max(existing?.slots ?? 0, 1 + (row.retryCount ?? 0)) })
      }
      for (const worker of workers.values()) { starts += worker.slots; counts.set(worker.lane, (counts.get(worker.lane) ?? 0) + worker.slots) }
    }
    return {
      remainingStarts: Math.max(0, COMMERCIALIZATION_RESEARCH_LIMITS.researchers - starts),
      pendingByLane: Object.fromEntries((binding?.researchArtifactPolicy?.researcherPaths ?? []).map(lane => [lane, pending.get(lane) ?? 0])),
      remainingByLane: Object.fromEntries((binding?.researchArtifactPolicy?.researcherPaths ?? []).map(lane => [lane, Math.max(0, COMMERCIALIZATION_RESEARCH_LIMITS.perLane - (counts.get(lane) ?? 0))])),
      timeRemainingMs: Number.isFinite(this.deadline(sessionId, expert, now)) ? Math.max(0, this.deadline(sessionId, expert, now) - now) : 0,
    }
  }

  reserve(sessionId: string, expert: BudgetExpert | undefined, input: ResearchBudgetRequest, now = Date.now()): ResearchBudgetDecision {
    const binding = expert?.runtimeBinding
    if (expert?.mode !== 'expert' || expert.status !== 'active' || binding?.expertId !== 'commercialization-research-report') return { allowed: true, applicable: false }
    const activated = Date.parse(binding.activatedAt ?? '')
    const deadlineMs = this.deadline(sessionId, expert, now)
    const denied = (reason: string): ResearchBudgetDecision => {
      const message = reason.endsWith('research window ended')
        ? RESEARCH_BUDGET_STOP
        : reason === 'researcher start limit reached'
          ? 'EXPERT_RESEARCH_BUDGET_EXHAUSTED: This researcher start was not admitted; already-running researchers may continue within their own remaining browser-call and time budgets. Do not retry this rejected start or spawn cleanup/replacement workers to bypass the limit. Wait for already-running researchers, including human-verification waits, to finish; collect their actual Markdown and audits, then continue D/E/F.'
          : reason === 'twelve browser tool calls consumed'
            ? 'EXPERT_RESEARCH_BUDGET_EXHAUSTED: Only this researcher must stop browsing, save its existing evidence and explicit gaps to its assigned Markdown, Read back, submit its real audit and return. Other researchers retain their own remaining budgets. Do not spawn a replacement to bypass this call limit.'
            : 'EXPERT_RESEARCH_BUDGET_REJECTED: This requested reservation was not admitted. Correct its session, researcher or lane identity before retrying; this denial does not mean other researchers have exhausted their budgets. Preserve actual evidence and never invent visits.'
      return { allowed: false, applicable: true, reason: message + ' (' + reason + ')', ...(Number.isFinite(deadlineMs) ? { deadline: new Date(deadlineMs).toISOString() } : {}) }
    }
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
    if (input.action === 'reserve-browser' && this.saveOnlyRecoveries.has(JSON.stringify([sessionId, binding.activatedAt, input.agentId]))) {
      return { allowed: false, applicable: true, reason: 'EXPERT_RESEARCH_SAVE_ONLY_RECOVERY: This original worker is recovering its saved handoff only. Do not browse or start another researcher. Reuse the actual prior browser results, save the assigned Markdown, Read it back and submit its real audit.', deadline: new Date(deadlineMs).toISOString() }
    }
    if (input.action === 'reserve-researcher' && worker) {
      if (worker.finished || !worker.generation) {
        worker.generation = (worker.generation ?? 0) + 1
        worker.startedAt = now
      }
      worker.finished = false
      return { allowed: true, applicable: true, deadline: new Date(deadlineMs).toISOString() }
    }
    if (input.action === 'reserve-browser' && worker?.calls.has(input.requestId ?? '')) return { allowed: true, applicable: true, deadline: new Date(deadlineMs).toISOString() }
    if (now >= deadlineMs) return denied(resolveResearchQualityCheckpointPolicy(binding.outputProtocol?.content) ? 'twenty-five-minute research window ended' : 'fifteen-minute research window ended')
    if (input.action === 'reserve-researcher') {
      if (!input.artifactPath?.trim()) return denied('missing assigned research lane')
      const lane = lanePath(input.artifactPath)
      if (binding.researchArtifactPolicy && !binding.researchArtifactPolicy.researcherPaths.includes(lane)) return denied('unknown assigned research lane')
      if (state.workers.size + state.restoredExtraStarts >= COMMERCIALIZATION_RESEARCH_LIMITS.researchers || [...state.workers.values()].filter(w => w.lane === lane).length + (state.restoredExtraByLane.get(lane) ?? 0) >= COMMERCIALIZATION_RESEARCH_LIMITS.perLane) return denied('researcher start limit reached')
      state.workers.set(input.agentId, { lane, calls: new Set(), generation: 1, startedAt: now })
    } else {
      if (!worker || !input.requestId?.trim()) return denied('browser call has no reserved researcher or call identity')
      if (worker.calls.size >= COMMERCIALIZATION_RESEARCH_LIMITS.browserCalls) return denied('twelve browser tool calls consumed')
      worker.calls.add(input.requestId)
    }
    return { allowed: true, applicable: true, deadline: new Date(deadlineMs).toISOString() }
  }
}
export const commercializationResearchBudgetService = new CommercializationResearchBudgetService((sessionId, since, now) => expertHumanVerificationService.getVerificationWaitMs(sessionId, since, now))
