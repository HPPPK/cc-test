import { setTimeout as wait } from 'node:timers/promises'
import { searchEngineForUrl } from '../../utils/searchEngineSurface.js'
const SEARCH_ENGINES = ['Google', '百度', 'Bing', '360'] as const
type ExpertSearchEngine = (typeof SEARCH_ENGINES)[number]

type JsonRecord = Record<string, unknown>
type SearchPacingConfig = { serverUrl: string; sessionId: string; minIntervalMs: number }
type SearchPacingLease = { leaseId: string; engine: ExpertSearchEngine; waitedMs: number }

type FetchLike = typeof fetch

// API codes are trusted only by exact match. Upstream messages may contain URLs or credentials.
const LEASE_ERROR_CODES = new Set(['HUMAN_VERIFICATION_PENDING', 'FORBIDDEN', 'BAD_REQUEST', 'NOT_FOUND', 'CONFLICT', 'INTERNAL_ERROR', 'RATE_LIMITED', 'TOO_MANY_REQUESTS'])

function leaseResponseError(response: Response, payload: JsonRecord | null): Error {
  const code = response.ok ? 'INVALID_LEASE_RESPONSE'
    : typeof payload?.error === 'string' && LEASE_ERROR_CODES.has(payload.error) ? payload.error : 'LEASE_REQUEST_FAILED'
  const recovery = code === 'HUMAN_VERIFICATION_PENDING'
    ? 'Search is paused for the user. Do not change providers or retry to bypass verification.'
    : response.status === 403
      ? 'Check the active Expert session and search pacing authorization.'
      : response.status === 429
        ? 'Search pacing rate limit reached. Keep search paused until the limit is resolved.'
        : response.status === 409
          ? 'Search pacing conflict. Check the active session state before continuing.'
          : 'Check the Expert search pacing service and its response contract before continuing.'
  return new Error(`${code} (HTTP ${response.status}): ${recovery}`)
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

const engineForUrl = searchEngineForUrl

function engineForInput(input: unknown): ExpertSearchEngine | undefined {
  const actions = record(input)?.actions
  if (!Array.isArray(actions)) return undefined
  for (const action of actions) {
    const actionRecord = record(action)
    if (actionRecord?.type !== 'navigate' && actionRecord?.type !== 'new_tab') continue
    const engine = engineForUrl(actionRecord.url)
    if (engine) return engine
  }
  return undefined
}

function resolveConfig(env: NodeJS.ProcessEnv): SearchPacingConfig | null {
  const enabled = env.CC_JIANGXIA_EXPERT_BROWSER_SEARCH_PACING === '1' || env.CC_HAHA_EXPERT_BROWSER_SEARCH_PACING === '1'
  if (!enabled) return null
  const serverUrl = (env.CC_JIANGXIA_DESKTOP_SERVER_URL ?? env.CC_HAHA_DESKTOP_SERVER_URL)?.trim()
  const sessionId = (env.CC_JIANGXIA_EXPERT_SESSION_ID ?? env.CC_HAHA_EXPERT_SESSION_ID)?.trim()
  const rawInterval = Number(env.CC_JIANGXIA_EXPERT_BROWSER_SEARCH_MIN_INTERVAL_MS ?? env.CC_HAHA_EXPERT_BROWSER_SEARCH_MIN_INTERVAL_MS ?? 3_000)
  if (!serverUrl || !sessionId) return null
  return { serverUrl, sessionId, minIntervalMs: Number.isFinite(rawInterval) ? Math.max(0, Math.min(60_000, Math.round(rawInterval))) : 3_000 }
}

async function post(config: SearchPacingConfig, body: JsonRecord, fetchImpl: FetchLike, signal?: AbortSignal): Promise<Response> {
  return await fetchImpl(new URL('/api/expert-browser-search-pacing', config.serverUrl), {
    signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: config.sessionId, ...body }),
  })
}

/**
 * Package-scoped runtime adapter. It recognizes real SERP URLs and the
 * canonical search-home submission entry used by the commercial Expert Skill.
 * Direct public pages and ordinary Playwright calls remain fully parallel and unchanged.
 */
export async function coordinateExpertBrowserSearchPacing(params: {
  toolName: string
  input: unknown
  env?: NodeJS.ProcessEnv
  fetchImpl?: FetchLike
  searchProvider?: 'tavily' | 'tavily-keyless' | 'brave'
  signal?: AbortSignal
}): Promise<{ engine?: ExpertSearchEngine; waitedMs?: number; release(): Promise<void> }> {
  if (params.toolName !== 'Playwright' && params.toolName !== 'WebSearch') return { async release() {} }
  const config = resolveConfig(params.env ?? process.env)
  const engine = params.toolName === 'Playwright' ? engineForInput(params.input) : undefined
  const channel = engine ?? (params.toolName === 'WebSearch' ? (params.searchProvider === 'brave' ? 'Brave API' : params.searchProvider === 'tavily' || params.searchProvider === 'tavily-keyless' ? 'Tavily API' : undefined) : undefined)
  if (!config || !channel) return { async release() {} }
  const fetchImpl = params.fetchImpl ?? fetch
  let payload: JsonRecord | null
  const requestedAt = Date.now()
  for (;;) {
    params.signal?.throwIfAborted()
    let response: Response
    try {
      response = await post(config, { action: 'acquire', engine: channel, minIntervalMs: config.minIntervalMs }, fetchImpl, params.signal)
    } catch {
      params.signal?.throwIfAborted()
      throw new Error('LEASE_NETWORK_ERROR: Could not contact the Expert search pacing service. Check the desktop server connection before continuing.')
    }
    payload = record(await response.json().catch(() => null))
    if (response.status === 409 && payload?.error === 'HUMAN_VERIFICATION_PENDING') {
      // This is the same suspended tool call, not another research attempt.
      // Only the server's actual pending state can release it; no URL or old
      // CAPTCHA result is cached here. Cancellation must still interrupt it.
      try { await wait(3_000, undefined, { signal: params.signal }) } catch (error) {
        params.signal?.throwIfAborted()
        throw error
      }
      continue
    }
    if (!response.ok || !payload || typeof payload.leaseId !== 'string' || !payload.leaseId.trim()
      || typeof payload.waitedMs !== 'number' || !Number.isFinite(payload.waitedMs) || payload.waitedMs < 0) {
      throw leaseResponseError(response, payload)
    }
    break
  }
  const lease = payload as SearchPacingLease
  let released = false
  return {
    engine,
    waitedMs: Math.max(lease.waitedMs, Date.now() - requestedAt),
    async release() {
      if (released) return
      released = true
      await post(config, { action: 'release', leaseId: lease.leaseId }, fetchImpl).catch(() => undefined)
    },
  }
}

export function resolveExpertSearchEngineForInput(input: unknown): ExpertSearchEngine | undefined {
  return engineForInput(input)
}

export async function withExpertSearchPacing<T>(
  params: Parameters<typeof coordinateExpertBrowserSearchPacing>[0],
  operation: () => Promise<T>,
): Promise<T> {
  const lease = await coordinateExpertBrowserSearchPacing(params)
  try { params.signal?.throwIfAborted(); return await operation() } finally { await lease.release() }
}
