import { searchEngineForUrl } from '../../utils/searchEngineSurface.js'
const SEARCH_ENGINES = ['Google', '百度', 'Bing', '360'] as const
type ExpertSearchEngine = (typeof SEARCH_ENGINES)[number]

type JsonRecord = Record<string, unknown>
type SearchPacingConfig = { serverUrl: string; sessionId: string; minIntervalMs: number }
type SearchPacingLease = { leaseId: string; engine: ExpertSearchEngine; waitedMs: number }

type FetchLike = typeof fetch

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

async function post(config: SearchPacingConfig, body: JsonRecord, fetchImpl: FetchLike): Promise<Response> {
  return await fetchImpl(new URL('/api/expert-browser-search-pacing', config.serverUrl), {
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
}): Promise<{ engine?: ExpertSearchEngine; waitedMs?: number; release(): Promise<void> }> {
  if (params.toolName !== 'Playwright') return { async release() {} }
  const config = resolveConfig(params.env ?? process.env)
  const engine = engineForInput(params.input)
  if (!config || !engine) return { async release() {} }
  const fetchImpl = params.fetchImpl ?? fetch
  const response = await post(config, { action: 'acquire', engine, minIntervalMs: config.minIntervalMs }, fetchImpl)
  const payload = await response.json().catch(() => null) as Partial<SearchPacingLease> | null
  if (!response.ok || !payload || typeof payload.leaseId !== 'string' || typeof payload.waitedMs !== 'number') {
    throw new Error('Expert search pacing service did not return a valid engine lease.')
  }
  let released = false
  return {
    engine,
    waitedMs: payload.waitedMs,
    async release() {
      if (released) return
      released = true
      await post(config, { action: 'release', leaseId: payload.leaseId! }, fetchImpl).catch(() => undefined)
    },
  }
}

export function resolveExpertSearchEngineForInput(input: unknown): ExpertSearchEngine | undefined {
  return engineForInput(input)
}
