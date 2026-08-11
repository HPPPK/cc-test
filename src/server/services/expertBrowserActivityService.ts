import { sendToSession } from '../ws/handler.js'

export type ExpertBrowserActivityStatus = 'researching' | 'awaiting_verification' | 'resumed' | 'completed' | 'access_limited'

export type ExpertBrowserActivity = {
  status: ExpertBrowserActivityStatus
  currentTarget?: string
  checkedTargets: string[]
  connectionKind?: 'managed' | 'cdp'
  updatedAt: string
}

type ActivityState = ExpertBrowserActivity & {
  legacyShowGeneration: number
  showGenerationByBrowserKey: Map<string, number>
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

  getShowGeneration(sessionId: string, browserKey?: string): number {
    const state = this.states.get(sessionId)
    if (!state) return 0
    const targetBrowserKey = safeBrowserKey(browserKey)
    return targetBrowserKey
      ? state.showGenerationByBrowserKey.get(targetBrowserKey) ?? 0
      : state.legacyShowGeneration
  }

  clear(sessionId: string): void {
    this.states.delete(sessionId)
    sendToSession(sessionId, { type: 'system_notification', subtype: 'expert_browser_activity_cleared' })
  }

  resetForTests(): void {
    this.states.clear()
  }

  private publicState(state: ActivityState): ExpertBrowserActivity {
    const {
      legacyShowGeneration: _legacyShowGeneration,
      showGenerationByBrowserKey: _showGenerationByBrowserKey,
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
