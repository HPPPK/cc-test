export const EXPERT_SEARCH_ENGINES = ['Google', '百度', 'Bing', '360'] as const
export type ExpertSearchEngine = (typeof EXPERT_SEARCH_ENGINES)[number]

type PendingLease = {
  leaseId: string
  requestedAt: number
  resolve: (lease: ExpertSearchPacingLease) => void
  reject: (error: Error) => void
}

type EngineState = {
  pending: PendingLease[]
  activeLeaseId?: string
  lastStartedAt?: number
  timer?: ReturnType<typeof setTimeout>
  minIntervalMs: number
}

export type ExpertSearchPacingLease = {
  leaseId: string
  engine: ExpertSearchEngine
  waitedMs: number
}

export type ExpertSearchPacingRequest = {
  sessionId: string
  engine: ExpertSearchEngine
  minIntervalMs: number
}

function normalizedInterval(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(60_000, Math.round(value))) : 3_000
}

/**
 * Session-scoped SERP pacing for an opted-in Expert package. It deliberately
 * knows only neutral engine names and leases; identifying a business workflow,
 * deciding which search to run, and fallback policy stay outside this service.
 */
export class ExpertSearchPacingService {
  private readonly stateBySession = new Map<string, Map<ExpertSearchEngine, EngineState>>()
  private readonly leaseLocations = new Map<string, { sessionId: string; engine: ExpertSearchEngine }>()

  async acquire(request: ExpertSearchPacingRequest): Promise<ExpertSearchPacingLease> {
    const interval = normalizedInterval(request.minIntervalMs)
    const leaseId = 'expert-search-pace:' + crypto.randomUUID()
    return await new Promise<ExpertSearchPacingLease>((resolve, reject) => {
      const state = this.engineState(request.sessionId, request.engine, interval)
      state.minIntervalMs = interval
      state.pending.push({ leaseId, requestedAt: Date.now(), resolve, reject })
      this.schedule(request.sessionId, request.engine)
    })
  }

  release(sessionId: string, leaseId: string): boolean {
    const location = this.leaseLocations.get(leaseId)
    if (!location || location.sessionId !== sessionId) return false
    const state = this.stateBySession.get(location.sessionId)?.get(location.engine)
    if (!state || state.activeLeaseId !== leaseId) return false
    state.activeLeaseId = undefined
    this.leaseLocations.delete(leaseId)
    this.schedule(location.sessionId, location.engine)
    return true
  }

  clear(sessionId: string, reason = 'Expert session ended before queued search could start.'): void {
    const engines = this.stateBySession.get(sessionId)
    if (!engines) return
    this.stateBySession.delete(sessionId)
    for (const [engine, state] of engines) {
      if (state.timer) clearTimeout(state.timer)
      if (state.activeLeaseId) this.leaseLocations.delete(state.activeLeaseId)
      for (const pending of state.pending) pending.reject(new Error(reason))
      state.pending.length = 0
      void engine
    }
  }

  resetForTests(): void {
    for (const sessionId of [...this.stateBySession.keys()]) this.clear(sessionId, 'Search pacing service reset.')
  }

  private engineState(sessionId: string, engine: ExpertSearchEngine, minIntervalMs: number): EngineState {
    const engines = this.stateBySession.get(sessionId) ?? new Map<ExpertSearchEngine, EngineState>()
    if (!this.stateBySession.has(sessionId)) this.stateBySession.set(sessionId, engines)
    const state = engines.get(engine) ?? { pending: [], minIntervalMs }
    if (!engines.has(engine)) engines.set(engine, state)
    return state
  }

  private schedule(sessionId: string, engine: ExpertSearchEngine): void {
    const state = this.stateBySession.get(sessionId)?.get(engine)
    if (!state || state.activeLeaseId || state.pending.length === 0 || state.timer) return

    const next = state.pending[0]!
    const earliest = (state.lastStartedAt ?? 0) + state.minIntervalMs
    const delay = Math.max(0, earliest - Date.now())
    if (delay > 0) {
      state.timer = setTimeout(() => {
        state.timer = undefined
        this.schedule(sessionId, engine)
      }, delay)
      return
    }

    state.pending.shift()
    state.activeLeaseId = next.leaseId
    state.lastStartedAt = Date.now()
    this.leaseLocations.set(next.leaseId, { sessionId, engine })
    next.resolve({ leaseId: next.leaseId, engine, waitedMs: Math.max(0, Date.now() - next.requestedAt) })
  }
}

export const expertSearchPacingService = new ExpertSearchPacingService()
