import {
  getApiKeyForProvider,
  getConfiguredWebSearchSettings,
  getFallbackProvider,
  searchWithExternalProvider,
} from '../../tools/WebSearchTool/backend.js'
import type { Output } from '../../tools/WebSearchTool/WebSearchTool.js'

export type SkillDiscoverySource = 'web' | 'qclaw' | 'all'
export type SkillDiscoveryProvider = 'tavily' | 'brave'

export type SkillDiscoveryResult = {
  title: string
  url: string
  source: Exclude<SkillDiscoverySource, 'all'>
}

export type SkillDiscoveryResponse = {
  query: string
  source: SkillDiscoverySource
  provider: SkillDiscoveryProvider
  results: SkillDiscoveryResult[]
}

export class SkillDiscoveryConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkillDiscoveryConfigurationError'
  }
}

type SkillDiscoveryDependencies = {
  getSettings: typeof getConfiguredWebSearchSettings
  getProvider: typeof getFallbackProvider
  getApiKey: typeof getApiKeyForProvider
  search: typeof searchWithExternalProvider
}

const defaultDependencies: SkillDiscoveryDependencies = {
  getSettings: getConfiguredWebSearchSettings,
  getProvider: getFallbackProvider,
  getApiKey: getApiKeyForProvider,
  search: searchWithExternalProvider,
}

/**
 * Finds public Skill references through the user-configured Tavily or Brave
 * provider. Results stay as links only: this service never downloads, imports,
 * or executes third-party content.
 */
export class SkillDiscoveryService {
  private readonly dependencies: SkillDiscoveryDependencies

  constructor(dependencies: Partial<SkillDiscoveryDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies }
  }

  async searchSkills(query: string, source: SkillDiscoverySource): Promise<SkillDiscoveryResponse> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      throw new TypeError('A skill discovery query is required.')
    }

    const settings = this.dependencies.getSettings()
    const provider = this.dependencies.getProvider(settings)
    if (!provider || provider === 'tavily-keyless') {
      throw new SkillDiscoveryConfigurationError(
        'Online Skill discovery needs a Tavily or Brave API key in Web Search settings.',
      )
    }

    const apiKey = this.dependencies.getApiKey(provider, settings)
    if (!apiKey) {
      throw new SkillDiscoveryConfigurationError(
        `Online Skill discovery cannot use ${provider} until its API key is configured.`,
      )
    }

    const signal = AbortSignal.timeout(15_000)
    const searches = source === 'all'
      ? [
          this.search(provider, apiKey, normalizedQuery, 'web', signal),
          this.search(provider, apiKey, normalizedQuery, 'qclaw', signal),
        ]
      : [this.search(provider, apiKey, normalizedQuery, source, signal)]
    const results = dedupeResults((await Promise.all(searches)).flat())

    return { query: normalizedQuery, source, provider, results }
  }

  private async search(
    provider: SkillDiscoveryProvider,
    apiKey: string,
    query: string,
    source: Exclude<SkillDiscoverySource, 'all'>,
    signal: AbortSignal,
  ): Promise<SkillDiscoveryResult[]> {
    const output = await this.dependencies.search(
      provider,
      {
        query,
        ...(source === 'qclaw' ? { allowed_domains: ['qclaw.qq.com'] } : {}),
      },
      apiKey,
      signal,
    )

    return extractSearchHits(output)
      .filter((hit) => source !== 'qclaw' || isQClawUrl(hit.url))
      .map((hit) => ({
        ...hit,
        source: source === 'qclaw' || isQClawUrl(hit.url) ? 'qclaw' : 'web',
      }))
  }
}

function extractSearchHits(output: Output): Array<{ title: string; url: string }> {
  return output.results.flatMap((result) => {
    if (typeof result === 'string') return []
    return result.content.filter((hit) => isPublicHttpUrl(hit.url))
  })
}

function dedupeResults(results: SkillDiscoveryResult[]): SkillDiscoveryResult[] {
  const deduped = new Map<string, SkillDiscoveryResult>()
  for (const result of results) {
    const key = normalizeUrlKey(result.url)
    const existing = deduped.get(key)
    if (!existing || result.source === 'qclaw') deduped.set(key, result)
  }
  return [...deduped.values()]
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function isQClawUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'qclaw.qq.com' || hostname.endsWith('.qclaw.qq.com')
  } catch {
    return false
  }
}

function normalizeUrlKey(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString()
  } catch {
    return value
  }
}
