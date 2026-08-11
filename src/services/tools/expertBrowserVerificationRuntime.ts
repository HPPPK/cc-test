import type { ToolResult } from '../../Tool.js'

const HUMAN_VERIFICATION_REQUIRED = 'EXPERT_HUMAN_VERIFICATION_REQUIRED:'
const HUMAN_VERIFICATION_PENDING = 'EXPERT_HUMAN_VERIFICATION_PENDING:'

type PlaywrightResultData = {
  url?: unknown
  title?: unknown
  error?: unknown
}

const SEARCH_ENGINES = ['Google', '百度', 'Bing', '360'] as const
type ExpertSearchEngine = (typeof SEARCH_ENGINES)[number]
const MAX_HUMAN_VERIFICATION_HANDOFFS = 8
const MAX_HUMAN_VERIFICATION_WAIT_RECONNECTS = 3

type ExpertVerificationRuntimeConfig = {
  serverUrl: string
  sessionId: string
  fallbackSearchEngines: ExpertSearchEngine[]
}

type ExpertVerificationResponse = {
  resolution: 'verification_completed' | 'switch_public_entry' | 'record_evidence_gap'
}

type FetchLike = typeof fetch

type JsonRecord = Record<string, unknown>
type PlaywrightStep = JsonRecord & { index?: number }
type FallbackContinuation = { input: JsonRecord; engine: ExpertSearchEngine }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseFallbackSearchEngines(env: NodeJS.ProcessEnv): ExpertSearchEngine[] {
  const raw = (
    env.CC_JIANGXIA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES
    ?? env.CC_HAHA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES
  )?.trim()
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((value): value is ExpertSearchEngine =>
      typeof value === 'string' && (SEARCH_ENGINES as readonly string[]).includes(value),
    ))]
  } catch {
    return []
  }
}

function resolveRuntimeConfig(env: NodeJS.ProcessEnv): ExpertVerificationRuntimeConfig | null {
  const handoffEnabled = env.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF === '1'
    || env.CC_HAHA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF === '1'
  if (!handoffEnabled) return null

  const serverUrl = (env.CC_JIANGXIA_DESKTOP_SERVER_URL ?? env.CC_HAHA_DESKTOP_SERVER_URL)?.trim()
  const sessionId = (env.CC_JIANGXIA_EXPERT_SESSION_ID ?? env.CC_HAHA_EXPERT_SESSION_ID)?.trim()
  return serverUrl && sessionId
    ? { serverUrl, sessionId, fallbackSearchEngines: parseFallbackSearchEngines(env) }
    : null
}

function verificationState(value: unknown): { data: PlaywrightResultData & Record<string, unknown>; joinsExisting: boolean } | null {
  const data = record(value)
  if (!data || typeof data.error !== 'string') return null
  if (data.error.includes(HUMAN_VERIFICATION_REQUIRED)) return { data, joinsExisting: false }
  if (data.error.includes(HUMAN_VERIFICATION_PENDING)) return { data, joinsExisting: true }
  return null
}

function searchEngineFor(url: string): ExpertSearchEngine | undefined {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname.includes('google.')) return 'Google'
    if (hostname.includes('baidu.')) return '百度'
    if (hostname.includes('bing.')) return 'Bing'
    if (hostname === 'so.com' || hostname.endsWith('.so.com')) return '360'
  } catch {
    // The Playwright result still carries the exact runtime error even when the URL is malformed.
  }
  return undefined
}

function guidanceFor(resolution: ExpertVerificationResponse['resolution'], url: string): string {
  switch (resolution) {
    case 'verification_completed':
      return [
        'EXPERT_HUMAN_VERIFICATION_RESOLVED: The user completed the visible website verification.',
        `The preserved page is still ${url || 'open in the visible Playwright window'}.`,
        'Next Playwright call: set verification_resolution="verified" and use only wait/extract (one reload at most if the page did not change). Do not open a new search page first.',
      ].join(' ')
    case 'switch_public_entry':
      return [
        'EXPERT_HUMAN_VERIFICATION_SWITCH_PUBLIC_ENTRY: The user explicitly declined this website verification.',
        `Keep ${url || 'this search entry'} in the evidence ledger as access-limited.`,
        'Do not mark the overall field as an evidence gap yet. Next Playwright call: set verification_resolution="switch_public_entry" and navigate to the next configured search engine, a rendered candidate URL, or a direct official page.',
      ].join(' ')
    case 'record_evidence_gap':
      return [
        'EXPERT_HUMAN_VERIFICATION_RECORDED_AS_GAP: The user explicitly chose to stop checking this entry.',
        `Record ${url || 'this page'} as access-limited with the verification reason.`,
        'Next Playwright call may set verification_resolution="record_evidence_gap" with an empty actions array to release the preserved page; do not claim the page was verified.',
      ].join(' ')
  }
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined
}

function actionIsNavigation(value: unknown): boolean {
  const action = asRecord(value)
  return action?.type === 'navigate' || action?.type === 'new_tab'
}

function completedActionCount(data: unknown): number {
  const steps = asRecord(data)?.steps
  if (!Array.isArray(steps)) return 0
  const indexes = steps
    .map((step) => asRecord(step)?.index)
    .filter((index): index is number => typeof index === 'number' && Number.isInteger(index))
  return indexes.length > 0 ? Math.max(...indexes) + 1 : 0
}

function queryFromUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value)
    for (const key of ['q', 'query', 'wd', 'word', 'keyword']) {
      const query = url.searchParams.get(key)?.trim()
      if (query) return query
    }
  } catch {
    // Query extraction is best-effort. The caller can still return normal fallback guidance.
  }
  return undefined
}

function queryFromInput(input: unknown): string | undefined {
  const actions = asRecord(input)?.actions
  if (!Array.isArray(actions)) return undefined

  for (const action of [...actions].reverse()) {
    const actionRecord = asRecord(action)
    const query = queryFromUrl(actionRecord?.url)
    if (query) return query
    if (actionRecord?.type !== 'fill' && actionRecord?.type !== 'type') continue
    const value = actionRecord.value ?? actionRecord.text
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function fallbackUrl(engine: ExpertSearchEngine, query: string): string {
  const encoded = encodeURIComponent(query)
  switch (engine) {
    case 'Google': return 'https://www.google.com/search?q=' + encoded
    case '百度': return 'https://www.baidu.com/s?wd=' + encoded
    case 'Bing': return 'https://www.bing.com/search?q=' + encoded
    case '360': return 'https://www.so.com/s?q=' + encoded
  }
}

function nextFallbackSearchEngine(
  currentEngine: ExpertSearchEngine | undefined,
  fallbackSearchEngines: ExpertSearchEngine[],
  attemptedEngines: ReadonlySet<ExpertSearchEngine>,
): ExpertSearchEngine | undefined {
  if (fallbackSearchEngines.length === 0) return undefined
  const currentIndex = currentEngine ? fallbackSearchEngines.indexOf(currentEngine) : -1
  for (let offset = 1; offset <= fallbackSearchEngines.length; offset += 1) {
    const index = currentIndex >= 0
      ? (currentIndex + offset) % fallbackSearchEngines.length
      : offset - 1
    const candidate = fallbackSearchEngines[index]
    if (candidate && candidate !== currentEngine && !attemptedEngines.has(candidate)) return candidate
  }
  return undefined
}

/**
 * Builds a package-declared fallback search only after the user explicitly
 * declines the visible website verification. It derives the query from the
 * real preserved search URL or the original visible actions; no model-written
 * browser action is needed to release the held page and try the next entry.
 */
export function buildExpertFallbackPlaywrightContinuation(
  input: unknown,
  data: unknown,
  fallbackSearchEngines: ExpertSearchEngine[],
  attemptedEngines: ReadonlySet<ExpertSearchEngine>,
): FallbackContinuation | undefined {
  const original = asRecord(input)
  if (!original || !Array.isArray(original.actions)) return undefined

  const dataRecord = asRecord(data)
  const url = typeof dataRecord?.url === 'string' ? dataRecord.url : ''
  const currentEngine = searchEngineFor(url)
  const query = queryFromUrl(url) ?? queryFromInput(original)
  const engine = nextFallbackSearchEngine(currentEngine, fallbackSearchEngines, attemptedEngines)
  if (!query || !engine) return undefined

  return {
    engine,
    input: {
      ...original,
      actions: [
        { type: 'navigate', url: fallbackUrl(engine, query) },
        { type: 'wait_for_load_state', state: 'domcontentloaded' },
        { type: 'extract', selector: 'body' },
      ],
      verification_resolution: 'switch_public_entry',
    },
  }
}

function buildExpertVerificationRelease(input: unknown): JsonRecord | undefined {
  const original = asRecord(input)
  if (!original || !Array.isArray(original.actions)) return undefined
  return {
    ...original,
    actions: [],
    verification_resolution: 'record_evidence_gap',
  }
}

/**
 * Builds the exact continuation for the Playwright call that was paused by a
 * user-visible verification page. It deliberately starts with the first
 * unfinished non-navigation actions, so a solved CAPTCHA is read before any
 * unrelated later search/navigation can run.
 */
export function buildExpertVerifiedPlaywrightContinuation(input: unknown, data: unknown): JsonRecord | undefined {
  const original = asRecord(input)
  const actions = original?.actions
  if (!original || !Array.isArray(actions)) return undefined

  const start = completedActionCount(data)
  const continuation: unknown[] = []
  for (const action of actions.slice(start)) {
    if (continuation.length > 0 && actionIsNavigation(action)) break
    continuation.push(action)
  }
  if (continuation.length === 0) {
    continuation.push(
      { type: 'wait_for_load_state', state: 'domcontentloaded' },
      { type: 'extract', selector: 'body' },
    )
  }

  return {
    ...original,
    actions: continuation,
    verification_resolution: 'verified',
  }
}

function mergeVerifiedPlaywrightContinuation<T>(
  initial: ToolResult<T>,
  resumed: ToolResult<T>,
): ToolResult<T> {
  const initialData = asRecord(initial.data)
  const resumedData = asRecord(resumed.data)
  if (!initialData || !resumedData) return resumed

  const initialSteps = Array.isArray(initialData.steps) ? initialData.steps.map(asRecord).filter((step): step is PlaywrightStep => Boolean(step)) : []
  const resumedSteps = Array.isArray(resumedData.steps) ? resumedData.steps.map(asRecord).filter((step): step is PlaywrightStep => Boolean(step)) : []
  const offset = completedActionCount(initialData)
  const mergedSteps = [
    ...initialSteps,
    ...resumedSteps.map((step, index) => ({ ...step, index: offset + index })),
  ]

  return {
    ...resumed,
    data: {
      ...resumedData,
      steps: mergedSteps,
    } as T,
  }
}

function shouldReconnectHumanVerificationWait(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /(?:operation )?timed out|timeout|socket connection was closed|connection (?:was )?closed/i.test(message)
}

function withVerificationError<T>(result: ToolResult<T>, error: string): ToolResult<T> {
  const data = asRecord(result.data)
  return data
    ? {
        ...result,
        data: { ...data, error } as T,
      }
    : result
}

async function requestVerificationResolution(
  config: ExpertVerificationRuntimeConfig,
  state: { data: PlaywrightResultData & Record<string, unknown>; joinsExisting: boolean },
  params: { agentId?: string; toolUseId?: string; browserSessionKey?: string; fetchImpl?: FetchLike },
): Promise<ExpertVerificationResponse> {
  const url = typeof state.data.url === 'string' ? state.data.url : ''
  const title = typeof state.data.title === 'string' ? state.data.title : undefined
  const endpoint = new URL('/api/expert-human-verifications', config.serverUrl)
  let joinExisting = state.joinsExisting

  for (let reconnectCount = 0; ; reconnectCount += 1) {
    try {
      const response = await (params.fetchImpl ?? fetch)(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: config.sessionId,
          ...(params.agentId ? { agentId: params.agentId } : {}),
          ...(params.toolUseId ? { toolUseId: params.toolUseId } : {}),
          ...(params.browserSessionKey ? { browserSessionKey: params.browserSessionKey } : {}),
          ...(joinExisting
            ? { joinExisting: true }
            : {
                verification: {
                  url,
                  ...(title ? { title } : {}),
                  detail: state.data.error,
                  ...(searchEngineFor(url) ? { engine: searchEngineFor(url) } : {}),
                },
              }),
        }),
      })
      const payload = await response.json().catch(() => null) as ExpertVerificationResponse | null
      if (!response.ok || !payload || !['verification_completed', 'switch_public_entry', 'record_evidence_gap'].includes(payload.resolution)) {
        throw new Error('The Desktop browser-verification handoff did not return a valid user resolution.')
      }
      return payload
    } catch (error) {
      if (reconnectCount >= MAX_HUMAN_VERIFICATION_WAIT_RECONNECTS || !shouldReconnectHumanVerificationWait(error)) throw error
      // The original Desktop request may have timed out at the HTTP layer while
      // its visible CAPTCHA and service-side decision are still alive. Rejoin it
      // instead of opening a second modal or abandoning the paused browser page.
      joinExisting = true
    }
  }
}

/**
 * This is an Expert-runtime adapter, not part of the shared Playwright tool.
 * It observes a real Playwright CAPTCHA result, hands the already-visible page
 * to Desktop, then either resumes that exact call or—only after an explicit
 * refusal—tries the next package-declared public search entry. A later CAPTCHA
 * from a runtime-owned continuation opens a new Desktop handoff for that exact
 * visible page rather than leaking a model AskUserQuestion or abandoning work.
 */
export async function coordinateExpertBrowserVerification<T>(params: {
  toolName: string
  result: ToolResult<T>
  agentId?: string
  toolUseId?: string
  browserSessionKey?: string
  input?: unknown
  resume?: (input: unknown) => Promise<ToolResult<T>>
  env?: NodeJS.ProcessEnv
  fetchImpl?: FetchLike
}): Promise<ToolResult<T>> {
  if (params.toolName !== 'Playwright') return params.result

  const config = resolveRuntimeConfig(params.env ?? process.env)
  if (!config) return params.result

  let currentResult = params.result
  let aggregateResult = params.result
  let currentInput = params.input
  const attemptedEngines = new Set<ExpertSearchEngine>()

  for (let handoffCount = 0; handoffCount < MAX_HUMAN_VERIFICATION_HANDOFFS; handoffCount += 1) {
    const state = verificationState(currentResult.data)
    if (!state || typeof state.data.error !== 'string') return aggregateResult

    const url = typeof state.data.url === 'string' ? state.data.url : ''
    const currentEngine = searchEngineFor(url)
    if (currentEngine) attemptedEngines.add(currentEngine)

    let resolution: ExpertVerificationResponse
    try {
      resolution = await requestVerificationResolution(config, state, params)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return withVerificationError(aggregateResult, 'EXPERT_HUMAN_VERIFICATION_HANDOFF_FAILED: ' + message + ' The visible page remains preserved; do not claim this page was verified.')
    }

    if (!params.resume) return withVerificationError(aggregateResult, guidanceFor(resolution.resolution, url))

    let continuation: JsonRecord | undefined
    if (resolution.resolution === 'verification_completed') {
      continuation = buildExpertVerifiedPlaywrightContinuation(currentInput, currentResult.data)
    } else if (resolution.resolution === 'switch_public_entry') {
      const fallback = buildExpertFallbackPlaywrightContinuation(
        currentInput,
        currentResult.data,
        config.fallbackSearchEngines,
        attemptedEngines,
      )
      if (fallback) {
        attemptedEngines.add(fallback.engine)
        continuation = fallback.input
      } else {
        return withVerificationError(
          aggregateResult,
          config.fallbackSearchEngines.length > 0
            ? 'EXPERT_HUMAN_VERIFICATION_FALLBACK_EXHAUSTED: The user explicitly declined verification and every package-declared public search entry has been attempted or is unavailable. Keep the affected entries as access-limited; continue with already-discovered direct public pages before recording an overall evidence gap.'
            : guidanceFor(resolution.resolution, url),
        )
      }
    } else {
      continuation = buildExpertVerificationRelease(currentInput)
    }

    if (!continuation) return withVerificationError(aggregateResult, guidanceFor(resolution.resolution, url))

    try {
      const resumed = await params.resume(continuation)
      aggregateResult = mergeVerifiedPlaywrightContinuation(aggregateResult, resumed)
      currentResult = resumed
      currentInput = continuation
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return withVerificationError(aggregateResult, 'EXPERT_HUMAN_VERIFICATION_RESUME_FAILED: ' + message + ' The visible page remains preserved; do not claim this page was verified.')
    }
  }

  return withVerificationError(
    aggregateResult,
    'EXPERT_HUMAN_VERIFICATION_HANDOFF_EXHAUSTED: Repeated visible verification pages exceeded the bounded runtime handoff limit. The latest page remains preserved; do not claim it was verified.',
  )
}
