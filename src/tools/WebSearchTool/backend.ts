import { upgradeWebSearchSettings } from '../../utils/settings/webSearchSettings.js'
import { createHash } from 'node:crypto'
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'
import type { SettingsJson } from '../../utils/settings/types.js'
import type { Input, Output, SearchResult } from './WebSearchTool.js'

export type WebSearchMode =
  | 'auto'
  | 'anthropic'
  | 'tavily'
  | 'tavily-keyless'
  | 'brave'
  | 'disabled'

export type WebSearchProvider = 'anthropic' | 'tavily' | 'tavily-keyless' | 'brave' | 'disabled'

export type WebSearchSettings = {
  mode?: WebSearchMode
  tavilyApiKey?: string
  braveApiKey?: string
}

export type ResolvedWebSearch = {
  provider: WebSearchProvider
  settings: WebSearchSettings
}

type ExternalSearchHit = {
  title: string
  url: string
}

const WEB_SEARCH_MODES = new Set<WebSearchMode>([
  'auto',
  'anthropic',
  'tavily',
  'tavily-keyless',
  'brave',
  'disabled',
])

const unsupportedNativeModels = new Set<string>()

export function isLikelyClaudeModel(model: string | undefined): boolean {
  if (!model) {
    return false
  }

  return /(^|[/:._-])claude([/:._-]|$)/.test(model.toLowerCase())
}

export function getConfiguredWebSearchSettings(
  settings: Pick<SettingsJson, 'webSearch'> = getSettings_DEPRECATED(),
): WebSearchSettings {
  const raw = settings.webSearch
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  const upgraded = upgradeWebSearchSettings(raw)
  const modeCandidate = upgraded.mode as WebSearchMode

  return {
    mode: WEB_SEARCH_MODES.has(modeCandidate) ? modeCandidate : 'auto',
    tavilyApiKey: normalizeApiKey(raw.tavilyApiKey),
    braveApiKey: normalizeApiKey(raw.braveApiKey),
  }
}

export function resolveWebSearchProvider(
  model: string | undefined,
  settings: WebSearchSettings = getConfiguredWebSearchSettings(),
): ResolvedWebSearch {
  const mode = settings.mode ?? 'auto'

  if (mode === 'disabled') {
    return { provider: 'disabled', settings }
  }

  if (mode === 'tavily-keyless') return { provider: 'tavily-keyless', settings }

  if (mode === 'tavily') {
    return { provider: settings.tavilyApiKey ? 'tavily' : 'disabled', settings }
  }

  if (mode === 'brave') {
    return { provider: settings.braveApiKey ? 'brave' : 'disabled', settings }
  }

  if (mode === 'anthropic') {
    return {
      provider: canUseAnthropicNativeWebSearch(model) ? 'anthropic' : 'disabled',
      settings,
    }
  }

  if (canUseAnthropicNativeWebSearch(model)) {
    return { provider: 'anthropic', settings }
  }

  if (settings.tavilyApiKey) {
    return { provider: 'tavily', settings }
  }

  if (settings.braveApiKey) {
    return { provider: 'brave', settings }
  }

  return { provider: 'disabled', settings }
}

export function isWebSearchEnabledForModel(
  model: string | undefined,
  settings: WebSearchSettings = getConfiguredWebSearchSettings(),
): boolean {
  return resolveWebSearchProvider(model, settings).provider !== 'disabled'
}

export function shouldFallbackFromNativeError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error)
  return (
    /\b(400|422)\b/.test(message) ||
    /web_search|server tool|tool schema|input_schema|extra input|unsupported/i.test(
      message,
    )
  )
}

export function markAnthropicNativeUnsupported(model: string | undefined): void {
  const key = normalizeModelKey(model)
  if (key) {
    unsupportedNativeModels.add(key)
  }
}

export async function searchWithExternalProvider(
  provider: Exclude<WebSearchProvider, 'anthropic' | 'disabled'>,
  input: Input,
  apiKey: string,
  signal: AbortSignal,
): Promise<Output> {
  signal.throwIfAborted()
  const key = createHash('sha256').update(JSON.stringify([provider, apiKey, input.query.trim(), [...(input.allowed_domains ?? [])].sort(), [...(input.blocked_domains ?? [])].sort()])).digest('hex')
  const cached = discoveryCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.output)
  const providerKey = createHash('sha256').update(provider + ':' + apiKey).digest('hex')
  const until = providerCooldown.get(providerKey) ?? 0
  if (until > Date.now()) throw new Error(`SEARCH_PROVIDER_COOLDOWN: ${provider}; retry after ${Math.ceil((until - Date.now()) / 1000)} seconds. Preserve existing sources; do not retry unchanged requests now.`)
  const startTime = performance.now()
  let hits: ExternalSearchHit[]
  try {
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(20_000)])
    hits = provider === 'brave'
      ? await searchWithBrave(input, apiKey, boundedSignal)
      : await searchWithTavily(input, apiKey, boundedSignal, provider === 'tavily-keyless')
  } catch (error) {
    if (error instanceof SearchProviderRateLimitError) providerCooldown.set(providerKey, Date.now() + error.retryAfterSeconds * 1000)
    throw error
  }
  hits = hits.filter(hit => isAllowedSearchHit(hit, input))
  const output = makeExternalSearchOutput(provider, input.query, hits, (performance.now() - startTime) / 1000)
  if (discoveryCache.size >= 128) discoveryCache.delete(discoveryCache.keys().next().value!)
  discoveryCache.set(key, { expiresAt: Date.now() + 120_000, output })
  return structuredClone(output)
}

const discoveryCache = new Map<string, { expiresAt: number; output: Output }>()
const providerCooldown = new Map<string, number>()
class SearchProviderRateLimitError extends Error {
  constructor(provider: string, readonly retryAfterSeconds: number) {
    super(`SEARCH_PROVIDER_RATE_LIMITED: ${provider}; retry after ${retryAfterSeconds} seconds. This is an API limit, not browser verification. Preserve sources; wait or explicitly select another configured search service.`)
  }
}
function isAllowedSearchHit(hit: ExternalSearchHit, input: Input): boolean {
  let url: URL
  try { url = new URL(hit.url) } catch { return false }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false
  const matches = (domain: string) => url.hostname === domain.toLowerCase() || url.hostname.endsWith('.' + domain.toLowerCase())
  return (!input.allowed_domains?.length || input.allowed_domains.some(matches)) && !input.blocked_domains?.some(matches)
}
function assertSearchResponse(response: Response, provider: string): void {
  if (response.status === 429) {
    const raw = response.headers.get('Retry-After')
    const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.ceil((Date.parse(raw) - Date.now()) / 1000) : 30
    throw new SearchProviderRateLimitError(provider, Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 3600)) : 30)
  }
  if (!response.ok) throw new Error(`SEARCH_PROVIDER_FAILED: ${provider}; HTTP ${response.status}. Check the selected search service and its quota; existing evidence is preserved.`)
}

export function getFallbackProvider(
  settings: WebSearchSettings,
): Exclude<WebSearchProvider, 'anthropic' | 'disabled'> | null {
  if (settings.tavilyApiKey) {
    return 'tavily'
  }
  if (settings.braveApiKey) {
    return 'brave'
  }
  return null
}

export function getApiKeyForProvider(
  provider: Exclude<WebSearchProvider, 'anthropic' | 'disabled'>,
  settings: WebSearchSettings,
): string | null {
  if (provider === 'tavily-keyless') return ''
  return provider === 'tavily' ? settings.tavilyApiKey ?? null : settings.braveApiKey ?? null
}

export function makeWebSearchUnavailableOutput(
  query: string,
  durationSeconds: number,
  reason: string,
): Output {
  return {
    query,
    results: [reason],
    durationSeconds,
  }
}

function canUseAnthropicNativeWebSearch(model: string | undefined): boolean {
  const key = normalizeModelKey(model)
  return isLikelyClaudeModel(model) && (!key || !unsupportedNativeModels.has(key))
}

function normalizeModelKey(model: string | undefined): string | null {
  const trimmed = model?.trim().toLowerCase()
  return trimmed || null
}

function normalizeApiKey(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

async function searchWithTavily(
  input: Input,
  apiKey: string,
  signal: AbortSignal,
  keyless = false,
): Promise<ExternalSearchHit[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      ...(keyless ? { 'X-Tavily-Access-Mode': 'keyless', 'X-Client-Source': 'cc-jiangxia-keyless-trial' } : { Authorization: `Bearer ${apiKey}` }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: input.query,
      max_results: 8,
      search_depth: 'basic',
      include_answer: false,
      include_domains: input.allowed_domains,
      exclude_domains: input.blocked_domains,
    }),
    signal,
  })

  assertSearchResponse(response, keyless ? 'tavily-keyless' : 'tavily')

  const body = (await response.json()) as {
    results?: Array<{ title?: unknown; url?: unknown }>
  }

  return (body.results ?? [])
    .map(hit => normalizeHit(hit.title, hit.url))
    .filter((hit): hit is ExternalSearchHit => hit != null)
}

async function searchWithBrave(
  input: Input,
  apiKey: string,
  signal: AbortSignal,
): Promise<ExternalSearchHit[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', applyDomainFiltersToQuery(input))
  url.searchParams.set('count', '8')

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal,
  })

  assertSearchResponse(response, 'brave')

  const body = (await response.json()) as {
    web?: { results?: Array<{ title?: unknown; url?: unknown }> }
  }

  return (body.web?.results ?? [])
    .map(hit => normalizeHit(hit.title, hit.url))
    .filter((hit): hit is ExternalSearchHit => hit != null)
}

function applyDomainFiltersToQuery(input: Input): string {
  const allowed = input.allowed_domains?.filter(Boolean) ?? []
  const blocked = input.blocked_domains?.filter(Boolean) ?? []
  const allowedClause = allowed.length
    ? `(${allowed.map(domain => `site:${domain}`).join(' OR ')}) `
    : ''
  const blockedClause = blocked.length
    ? `${blocked.map(domain => `-site:${domain}`).join(' ')} `
    : ''

  return `${allowedClause}${blockedClause}${input.query}`.trim()
}

function normalizeHit(title: unknown, url: unknown): ExternalSearchHit | null {
  if (typeof title !== 'string' || typeof url !== 'string') {
    return null
  }

  return { title, url }
}

function makeExternalSearchOutput(
  provider: Exclude<WebSearchProvider, 'anthropic' | 'disabled'>,
  query: string,
  hits: ExternalSearchHit[],
  durationSeconds: number,
): Output {
  const result: SearchResult = {
    tool_use_id: `${provider}-web-search`,
    content: hits,
  }

  return {
    query,
    results: [`Search provider: ${provider}. Discovery only: these are candidate URLs, not verified page evidence or Google/Baidu SERP observations. Open the relevant original pages with Playwright before citing.`, result],
    durationSeconds,
  }
}
