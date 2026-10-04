import { sendToSession } from '../ws/handler.js'

export type ExpertBrowserActivityStatus = 'researching' | 'awaiting_verification' | 'resumed' | 'completed' | 'access_limited'

export type ExpertBrowserActivity = {
  status: ExpertBrowserActivityStatus
  currentTarget?: string
  checkedTargets: string[]
  connectionKind?: 'managed' | 'cdp'
  updatedAt: string
}

type PresentationResult = {
  generation: number
  confirmed: boolean
}

type PresentationWaiter = {
  browserKey: string
  generation: number
  resolve: (confirmed: boolean | null) => void
  timeout: ReturnType<typeof setTimeout>
}

type ActivityState = ExpertBrowserActivity & {
  legacyShowGeneration: number
  showGenerationByBrowserKey: Map<string, number>
  verificationCheckGenerationByBrowserKey: Map<string, number>
  presentationResultsByBrowserKey: Map<string, PresentationResult>
  latestBrowserKey?: string
}

function safeTarget(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value)
    return url.hostname.replace(/^www./, '') + (url.pathname && url.pathname !== '/' ? url.pathname.slice(0, 48) : '')
  } catch {
    return undefined
  }
}

function safeBrowserKey(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 500
    ? value.trim()
    : undefined
}

/**
 * Ephemeral, package-authorized browser activity. It deliberately stores only
 * host/path labels, never queries, profiles, cookies, screenshots, or content.
 */
export class ExpertBrowserActivityService {
  private states = new Map<string, ActivityState>()
  private presentationWaitersBySession = new Map<string, Set<PresentationWaiter>>()

  publish(sessionId: string, input: {
    status: ExpertBrowserActivityStatus
    currentTarget?: unknown
    checkedTarget?: unknown
    connectionKind?: unknown
    browserKey?: unknown
  }): ExpertBrowserActivity {
    const previous = this.states.get(sessionId)
    const currentTarget = safeTarget(input.currentTarget) ?? previous?.currentTarget
    const checkedTarget = safeTarget(input.checkedTarget)
    const checkedTargets = checkedTarget
      ? [...new Set([...(previous?.checkedTargets ?? []), checkedTarget])].slice(-3)
      : previous?.checkedTargets ?? []
    const browserKey = safeBrowserKey(input.browserKey)
    const state: ActivityState = {
      status: input.status,
      ...(currentTarget ? { currentTarget } : {}),
      checkedTargets,
      ...(input.connectionKind === 'managed' || input.connectionKind === 'cdp' ? { connectionKind: input.connectionKind } : previous?.connectionKind ? { connectionKind: previous.connectionKind } : {}),
      updatedAt: new Date().toISOString(),
      legacyShowGeneration: previous?.legacyShowGeneration ?? 0,
      showGenerationByBrowserKey: previous?.showGenerationByBrowserKey ?? new Map(),
      verificationCheckGenerationByBrowserKey: previous?.verificationCheckGenerationByBrowserKey ?? new Map(),
      presentationResultsByBrowserKey: previous?.presentationResultsByBrowserKey ?? new Map(),
      ...(browserKey ? { latestBrowserKey: browserKey } : previous?.latestBrowserKey ? { latestBrowserKey: previous.latestBrowserKey } : {}),
    }
    this.states.set(sessionId, state)
    this.deliver(sessionId, state)
    return this.publicState(state)
  }

  requestShow(sessionId: string, browserKey?: string): ExpertBrowserActivity | null {
    const current = this.states.get(sessionId)
    if (!current) return null
    const targetBrowserKey = safeBrowserKey(browserKey) ?? current.latestBrowserKey
    const showGenerationByBrowserKey = new Map(current.showGenerationByBrowserKey)
    const legacyShowGeneration = targetBrowserKey
      ? current.legacyShowGeneration
      : current.legacyShowGeneration + 1
    if (targetBrowserKey) {
      showGenerationByBrowserKey.set(targetBrowserKey, (showGenerationByBrowserKey.get(targetBrowserKey) ?? 0) + 1)
    }
    const state: ActivityState = {
      ...current,
      legacyShowGeneration,
      showGenerationByBrowserKey,
      ...(targetBrowserKey ? { latestBrowserKey: targetBrowserKey } : {}),
      updatedAt: new Date().toISOString(),
    }
    this.states.set(sessionId, state)
    this.deliver(sessionId, state)
    return this.publicState(state)
  }

  requestVerificationCheck(sessionId: string, browserKey?: string): ExpertBrowserActivity | null {
    const current = this.states.get(sessionId)
    if (!current) return null
    const targetBrowserKey = safeBrowserKey(browserKey) ?? current.latestBrowserKey
    if (!targetBrowserKey) return this.publicState(current)
    const verificationCheckGenerationByBrowserKey = new Map(current.verificationCheckGenerationByBrowserKey)
    verificationCheckGenerationByBrowserKey.set(targetBrowserKey, (verificationCheckGenerationByBrowserKey.get(targetBrowserKey) ?? 0) + 1)
    const state: ActivityState = {
      ...current,
      verificationCheckGenerationByBrowserKey,
      latestBrowserKey: targetBrowserKey,
      updatedAt: new Date().toISOString(),
    }
    this.states.set(sessionId, state)
    this.deliver(sessionId, state)
    return this.publicState(state)
  }

  getVerificationCheckGeneration(sessionId: string, browserKey?: string): number {
    const state = this.states.get(sessionId)
    if (!state) return 0
    const targetBrowserKey = safeBrowserKey(browserKey)
    return targetBrowserKey
      ? state.verificationCheckGenerationByBrowserKey.get(targetBrowserKey) ?? 0
      : 0
  }

  getShowGeneration(sessionId: string, browserKey?: string): number {
    const state = this.states.get(sessionId)
    if (!state) return 0
    const targetBrowserKey = safeBrowserKey(browserKey)
    return targetBrowserKey
      ? state.showGenerationByBrowserKey.get(targetBrowserKey) ?? 0
      : state.legacyShowGeneration
  }

  /** The Desktop never receives this internal routing key. It is used only to
   * direct an explicit "open browser" request to the latest managed worker. */
  getLatestBrowserKey(sessionId: string): string | null {
    return this.states.get(sessionId)?.latestBrowserKey ?? null
  }

  /** The runner acknowledges the exact show generation after CDP has attempted
   * to restore the managed window. A result is never persisted as user browser
   * history or exposed to the model. */
  reportPresentationResult(
    sessionId: string,
    browserKey: string,
    generation: number,
    confirmed: boolean,
  ): boolean {
    const state = this.states.get(sessionId)
    const targetBrowserKey = safeBrowserKey(browserKey)
    if (!state || !targetBrowserKey || !Number.isInteger(generation) || generation <= 0) return false
    const requestedGeneration = state.showGenerationByBrowserKey.get(targetBrowserKey) ?? 0
    if (generation !== requestedGeneration) return false

    const presentationResultsByBrowserKey = new Map(state.presentationResultsByBrowserKey)
    presentationResultsByBrowserKey.set(targetBrowserKey, { generation, confirmed })
    this.states.set(sessionId, {
      ...state,
      presentationResultsByBrowserKey,
      updatedAt: new Date().toISOString(),
    })
    this.resolvePresentationWaiters(sessionId, targetBrowserKey, generation, confirmed)
    return true
  }

  /** Wait briefly for the already-running local runner; a missing acknowledgement
   * is deliberately distinguishable from an explicit Windows/CDP failure. */
  async waitForPresentationResult(
    sessionId: string,
    browserKey: string,
    generation: number,
    timeoutMs = 2_000,
  ): Promise<boolean | null> {
    const state = this.states.get(sessionId)
    const targetBrowserKey = safeBrowserKey(browserKey)
    if (!state || !targetBrowserKey || !Number.isInteger(generation) || generation <= 0) return null
    const existing = state.presentationResultsByBrowserKey.get(targetBrowserKey)
    if (existing && existing.generation >= generation) return existing.confirmed

    return await new Promise<boolean | null>((resolve) => {
      const waiters = this.presentationWaitersBySession.get(sessionId) ?? new Set<PresentationWaiter>()
      const waiter: PresentationWaiter = {
        browserKey: targetBrowserKey,
        generation,
        resolve,
        timeout: setTimeout(() => {
          waiters.delete(waiter)
          if (waiters.size === 0) this.presentationWaitersBySession.delete(sessionId)
          resolve(null)
        }, timeoutMs),
      }
      waiter.timeout.unref?.()
      waiters.add(waiter)
      this.presentationWaitersBySession.set(sessionId, waiters)
    })
  }

  clear(sessionId: string): void {
    this.states.delete(sessionId)
    this.rejectPresentationWaiters(sessionId)
    sendToSession(sessionId, { type: 'system_notification', subtype: 'expert_browser_activity_cleared' })
  }

  resetForTests(): void {
    this.states.clear()
    for (const sessionId of this.presentationWaitersBySession.keys()) this.rejectPresentationWaiters(sessionId)
  }

  private resolvePresentationWaiters(sessionId: string, browserKey: string, generation: number, confirmed: boolean): void {
    const waiters = this.presentationWaitersBySession.get(sessionId)
    if (!waiters) return
    for (const waiter of [...waiters]) {
      if (waiter.browserKey !== browserKey || waiter.generation > generation) continue
      clearTimeout(waiter.timeout)
      waiters.delete(waiter)
      waiter.resolve(confirmed)
    }
    if (waiters.size === 0) this.presentationWaitersBySession.delete(sessionId)
  }

  private rejectPresentationWaiters(sessionId: string): void {
    const waiters = this.presentationWaitersBySession.get(sessionId)
    if (!waiters) return
    this.presentationWaitersBySession.delete(sessionId)
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout)
      waiter.resolve(null)
    }
  }

  private publicState(state: ActivityState): ExpertBrowserActivity {
    const {
      legacyShowGeneration: _legacyShowGeneration,
      showGenerationByBrowserKey: _showGenerationByBrowserKey,
      verificationCheckGenerationByBrowserKey: _verificationCheckGenerationByBrowserKey,
      presentationResultsByBrowserKey: _presentationResultsByBrowserKey,
      latestBrowserKey: _latestBrowserKey,
      ...publicState
    } = state
    return publicState
  }

  private deliver(sessionId: string, state: ActivityState): void {
    sendToSession(sessionId, {
      type: 'system_notification',
      subtype: 'expert_browser_activity',
      data: this.publicState(state),
    })
  }
}

export const expertBrowserActivityService = new ExpertBrowserActivityService()
