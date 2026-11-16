export const EXPERT_SEARCH_ENGINES = ['Google', '百度', 'Bing', '360', 'Tavily API', 'Brave API'] as const
export type ExpertSearchEngine = (typeof EXPERT_SEARCH_ENGINES)[number]

type PendingLease = {
  leaseId: string
  sessionId: string
  requestedAt: number
  minIntervalMs: number
  resolve: (lease: ExpertSearchPacingLease) => void
  reject: (error: Error) => void
}
type EngineState = {
  pending: PendingLease[]
  activeLeaseId?: string
  lastStartedAt?: number
  lastIntervalMs: number
  timer?: ReturnType<typeof setTimeout>
}
export type ExpertSearchPacingLease = { leaseId: string; engine: ExpertSearchEngine; waitedMs: number }
export type ExpertSearchPacingRequest = { sessionId: string; engine: ExpertSearchEngine; minIntervalMs: number; signal?: AbortSignal }
function normalizedInterval(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(60_000, Math.round(value))) : 3_000
}

/** One engine queue for the whole Desktop service, while leases and cancellation
 * stay owned by their conversation. Multiple agents/chats share one network exit.
 */
export class ExpertSearchPacingService {
  private readonly engines = new Map<ExpertSearchEngine, EngineState>()
  private readonly leases = new Map<string, { sessionId: string; engine: ExpertSearchEngine }>()

  async acquire(request: ExpertSearchPacingRequest): Promise<ExpertSearchPacingLease> {
    request.signal?.throwIfAborted()
    const leaseId = 'expert-search-pace:' + crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const state = this.engines.get(request.engine) ?? { pending: [], lastIntervalMs: 0 }
      this.engines.set(request.engine, state)
      const cleanup = () => request.signal?.removeEventListener('abort', onAbort)
      const onAbort = () => {
        state.pending = state.pending.filter(candidate => candidate.leaseId !== leaseId)
        cleanup()
        reject(new Error('Search cancelled while waiting for its turn.'))
        this.schedule(request.engine)
      }
      state.pending.push({ leaseId, sessionId: request.sessionId, requestedAt: Date.now(), minIntervalMs: normalizedInterval(request.minIntervalMs),
        resolve: lease => { cleanup(); resolve(lease) },
        reject: error => { cleanup(); reject(error) },
      })
      request.signal?.addEventListener('abort', onAbort, { once: true })
      this.schedule(request.engine)
    })
  }

  release(sessionId: string, leaseId: string): boolean {
    const lease = this.leases.get(leaseId)
    if (!lease || lease.sessionId !== sessionId) return false
    const state = this.engines.get(lease.engine)
    if (!state || state.activeLeaseId !== leaseId) return false
    state.activeLeaseId = undefined
    this.leases.delete(leaseId)
    this.schedule(lease.engine)
    return true
  }

  clear(sessionId: string, reason = 'Expert session ended before queued search could start.'): void {
    for (const [engine, state] of this.engines) {
      if (state.timer) clearTimeout(state.timer)
      state.timer = undefined
      for (const request of state.pending.filter(request => request.sessionId === sessionId)) request.reject(new Error(reason))
      state.pending = state.pending.filter(request => request.sessionId !== sessionId)
      if (state.activeLeaseId && this.leases.get(state.activeLeaseId)?.sessionId === sessionId) {
        this.leases.delete(state.activeLeaseId)
        state.activeLeaseId = undefined
      }
      this.schedule(engine)
    }
  }

  resetForTests(): void {
    const owners = new Set([...this.leases.values()].map(lease => lease.sessionId))
    for (const state of this.engines.values()) for (const request of state.pending) owners.add(request.sessionId)
    for (const owner of owners) this.clear(owner, 'Search pacing service reset.')
    for (const state of this.engines.values()) if (state.timer) clearTimeout(state.timer)
    this.engines.clear()
    this.leases.clear()
  }

  private schedule(engine: ExpertSearchEngine): void {
    const state = this.engines.get(engine)
    if (!state || state.activeLeaseId || !state.pending.length || state.timer) return
    const next = state.pending[0]!
    const delay = (state.lastStartedAt ?? 0) + Math.max(state.lastIntervalMs, next.minIntervalMs) - Date.now()
    if (delay > 0) {
      state.timer = setTimeout(() => { state.timer = undefined; this.schedule(engine) }, delay)
      return
    }
    state.pending.shift()
    state.activeLeaseId = next.leaseId
    state.lastStartedAt = Date.now()
    state.lastIntervalMs = next.minIntervalMs
    this.leases.set(next.leaseId, { sessionId: next.sessionId, engine })
    next.resolve({ leaseId: next.leaseId, engine, waitedMs: Date.now() - next.requestedAt })
  }
}

export const expertSearchPacingService = new ExpertSearchPacingService()
