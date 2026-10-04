import { researchArtifactRootPath } from '../../services/tools/expertFileFirstResearchProtocol.js'
import { searchEngineForUrl, isSearchResultsUrl } from '../../utils/searchEngineSurface.js'
import * as path from 'node:path'
import type { ExpertResearchArtifactPolicy } from './expertResearchArtifactPolicyService.js'
import type { ExpertResearchAuditEntry } from './expertResearchCompletionService.js'
import type { ExpertResearchEvidenceRecord } from './expertResearchEvidenceReviewService.js'

export type ExpertResearchRequiredRoute = {
  routeId: string
  artifactPath: string
  evidenceField?: string
  goal?: string
  firstRoute?: string
  fallbackRoute?: string
  completionBar?: string
  primaryTargetHost: string
  fallbackTargetHost: string
}

export type ExpertResearchRequiredRouteStatus =
  | 'primary-succeeded'
  | 'fallback-succeeded'
  | 'primary-needs-extract'
  | 'fallback-needs-extract'
  | 'primary-not-attempted'
  | 'fallback-required'
  | 'evidence-gap-after-fallback'
  | 'unresolved-after-bounded-attempts'

export type ExpertResearchRequiredRouteRecovery = Pick<
  ExpertResearchRequiredRoute,
  'routeId' | 'artifactPath' | 'evidenceField' | 'goal' | 'firstRoute' | 'fallbackRoute' | 'completionBar' | 'primaryTargetHost' | 'fallbackTargetHost'
> & {
  nextStep: 'attempt-primary' | 'extract-primary' | 'attempt-fallback' | 'extract-fallback'
  reason: string
}

export type ExpertResearchRequiredRouteEvaluation = {
  complete: boolean
  routes: Array<ExpertResearchRequiredRoute & { status: ExpertResearchRequiredRouteStatus }>
  recoveries: ExpertResearchRequiredRouteRecovery[]
}


// The brief may use a normal Chinese table instead of optional English Route
// blocks. Planning a platform must not disappear merely because of formatting.
const PLANNED_PLATFORMS = [
  { aliases: /B站|哔哩哔哩|bilibili/i, host: 'bilibili.com', fallback: 'v2ex.com', owner: 1 },
  { aliases: /YouTube|youtu\.be/i, host: 'youtube.com', fallback: 'producthunt.com', owner: 1 },
  { aliases: /知乎|zhihu/i, host: 'zhihu.com', fallback: 'v2ex.com', owner: 1 },
  { aliases: /Reddit/i, host: 'reddit.com', fallback: 'producthunt.com', owner: 1 },
  { aliases: /小红书|xiaohongshu/i, host: 'xiaohongshu.com', fallback: 'zhihu.com', owner: 1 },
  { aliases: /百度贴吧|tieba\.baidu/i, host: 'tieba.baidu.com', fallback: 'v2ex.com', owner: 1 },
  { aliases: /微博|weibo/i, host: 'weibo.com', fallback: 'zhihu.com', owner: 1 },
  { aliases: /\bGitHub\b/i, host: 'github.com', fallback: 'gitee.com', owner: 0 },
  { aliases: /\bGitee\b/i, host: 'gitee.com', fallback: 'github.com', owner: 0 },
  { aliases: /Twitter|x\.com|(?:^|[\/、，|：\s])X(?:$|[\/、，|\s])/i, host: 'x.com', fallback: 'reddit.com', owner: 2 },
]

function inferPlannedRoutes(policy: ExpertResearchArtifactPolicy, markdown: string): ExpertResearchRequiredRoute[] {
  // Explicitly out-of-scope/future recommendations are not current work orders.
  const lines = markdown.split(/\r?\n/).filter((line) => !/不适用|不纳入|不要求|暂不|仅作候选|后续建议|未来建议|optional|out.of.scope/i.test(line))
  return PLANNED_PLATFORMS.flatMap((platform) => {
    if (!lines.some((line) => platform.aliases.test(line))) return []
    const artifactPath = policy.researcherPaths[platform.owner]
    if (!artifactPath) return []
    return [{ routeId: 'planned-' + platform.host.replace(/\./g, '-'), artifactPath,
      evidenceField: platform.owner === 1 ? 'user-demand' : platform.owner === 0 ? 'competitor' : 'acquisition',
      goal: '围绕本产品/竞品进行站内或 site: 检索，选相关具体内容页提取；不是仅打开平台首页。',
      firstRoute: '结合产品与竞品名称检索 ' + platform.host + '，有相关结果就打开具体页并提取。',
      fallbackRoute: '对同一问题检索 ' + platform.fallback + ' 的公开内容；真实无结果/受限时记录缺口，不循环。',
      primaryTargetHost: platform.host, fallbackTargetHost: platform.fallback }]
  })
}

/** Navigation success is not content evidence. Corporate official homepages can
 * describe a product, but social home/search/login pages cannot describe a post. */
function concreteRoutePage(entry: ExpertResearchAuditEntry, expectedHost: string): boolean {
  try {
    const url = new URL(entry.finalUrl ?? entry.target)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    if (!(host === expectedHost || host.endsWith('.' + expectedHost))) return false
    if (searchEngineForUrl(url.href)) return false
    if (/^\/(?:search|results|login|signin|auth|sorry)(?:[/.]|$)/i.test(url.pathname)) return false
    if (/\/(?:robots\.txt|sitemap[^/]*\.xml)$/.test(url.pathname)) return false
    if (host.endsWith('bilibili.com')) return /^\/video\/[^/]+/.test(url.pathname)
    if (host.endsWith('youtube.com')) return (url.pathname === '/watch' && Boolean(url.searchParams.get('v'))) || /^\/(shorts|live)\/[^/]+/.test(url.pathname)
    if (host.endsWith('zhihu.com')) return /^\/(?:question|p|answer)\/[^/]+/.test(url.pathname)
    if (host.endsWith('reddit.com')) return /\/comments\/[^/]+/.test(url.pathname)
    if (host.endsWith('tieba.baidu.com')) return /^\/p\/\d+/.test(url.pathname)
    if (host.endsWith('v2ex.com')) return /^\/t\/[^/]+/.test(url.pathname)
    if (host.endsWith('producthunt.com')) return /^\/(?:posts|products)\/[^/]+/.test(url.pathname)
    if (host.endsWith('github.com') || host.endsWith('gitee.com')) return /^\/[^/]+\/[^/]+/.test(url.pathname) && !/^\/(?:topics|explore|search|trending)(?:\/|$)/.test(url.pathname)
    if (host === 'x.com' || host.endsWith('twitter.com')) return /\/status\/[^/]+/.test(url.pathname)
    if (host.endsWith('xiaohongshu.com')) return /^\/(?:explore|discovery\/item)\/[^/]+/.test(url.pathname)
    if (PLANNED_PLATFORMS.some((p) => host === p.host || host.endsWith('.' + p.host))) return url.pathname !== '/' && url.pathname !== ''
    return true
  } catch { return false }
}

function routeSearchAttempt(entry: ExpertResearchAuditEntry, host: string): boolean {
  const platform = PLANNED_PLATFORMS.find((p) => p.host === host)
  const query = entry.query ?? (entry.kind === 'search' ? entry.target : '')
  return entry.kind === 'search' && entry.status !== 'pending' && entry.status !== 'interrupted'
    && (entry.status !== 'opened' || entry.searchResultStatus === 'results_observed' || isSearchResultsUrl(entry.finalUrl))
    && (query.toLowerCase().includes(host) || Boolean(platform?.aliases.test(query)))
}

function recordedSearchGap(records: ExpertResearchEvidenceRecord[], host: string): boolean {
  const platform = PLANNED_PLATFORMS.find((p) => p.host === host)
  return records.some((record) => record.entries.some((entry) => routeSearchAttempt(entry, host))
    && record.content.split(/\r?\n/).some((line) => (line.includes(host) || Boolean(platform?.aliases.test(line)))
      && /未找到|无(?:相关)?结果|弱相关|不相关|no (?:relevant )?results/i.test(line)))
}

type ParsedRouteBlock = { id: string; body: string }

function text(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
}

function parseRouteBlocks(markdown: string): ParsedRouteBlock[] {
  const routes: ParsedRouteBlock[] = []
  let current: { id: string; lines: string[] } | undefined
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^###\s+Route:\s*\x60?([A-Za-z0-9][A-Za-z0-9_-]{0,95})\x60?\s*$/i)
    if (match?.[1]) {
      if (current) routes.push({ id: current.id, body: current.lines.join('\n') })
      current = { id: match[1], lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) routes.push({ id: current.id, body: current.lines.join('\n') })
  return routes
}

function routeLineValue(body: string, label: string): string | undefined {
  const prefix = '- ' + label + ':'
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line.toLowerCase().startsWith(prefix.toLowerCase())) continue
    return text(line.slice(prefix.length).trim().replace(/^\x60|\x60$/g, ''))
  }
  return undefined
}

function ownerMatches(ownerReport: string, artifactPath: string): boolean {
  const owner = ownerReport.replace(/\\/g, '/').trim().toLowerCase()
  const artifact = artifactPath.replace(/\\/g, '/').trim().toLowerCase()
  return owner === artifact || (!owner.includes('/') && owner === path.basename(artifact))
}

function normalizeHost(value: string | undefined): string | undefined {
  const raw = text(value)?.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/^\./, '')
  if (!raw || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(raw) || raw.includes('..')) return undefined
  return raw
}

function isRequiredRoute(value: string | undefined): boolean {
  return /^(?:yes|true|required|是|需要|必需)$/i.test(value?.trim() ?? '')
}

/** Parses only routes explicitly selected for mandatory execution in this brief.
 * Ordinary candidate routes remain advisory and are intentionally omitted. */
export function parseExpertResearchRequiredRoutes(
  policy: ExpertResearchArtifactPolicy,
  researchBriefMarkdown: string,
): { routes: ExpertResearchRequiredRoute[]; declarationIssues: string[] } {
  if (policy.routeCompletion?.mode !== 'dynamic-route-status-v2') return { routes: [], declarationIssues: [] }

  const routes: ExpertResearchRequiredRoute[] = []
  const declarationIssues: string[] = []
  for (const block of parseRouteBlocks(researchBriefMarkdown)) {
    if (!isRequiredRoute(routeLineValue(block.body, 'Required route'))) continue
    const ownerReport = routeLineValue(block.body, 'Owner report')
    const artifactPath = ownerReport && policy.researcherPaths.find((candidate) => ownerMatches(ownerReport, candidate))
    const primaryTargetHost = normalizeHost(routeLineValue(block.body, 'Primary target host'))
    const fallbackTargetHost = normalizeHost(routeLineValue(block.body, 'Fallback target host'))
    const missing = [
      ...(!artifactPath ? ['Owner report'] : []),
      ...(!primaryTargetHost ? ['Primary target host'] : []),
      ...(!fallbackTargetHost ? ['Fallback target host'] : []),
    ]
    if (missing.length) {
      declarationIssues.push('Required Route ' + block.id + ' is missing or has an invalid ' + missing.join(', ') + '.')
      continue
    }
    routes.push({
      routeId: block.id,
      artifactPath,
      ...(routeLineValue(block.body, 'Evidence field') ? { evidenceField: routeLineValue(block.body, 'Evidence field') } : {}),
      ...(routeLineValue(block.body, 'Goal') ? { goal: routeLineValue(block.body, 'Goal') } : {}),
      ...(routeLineValue(block.body, 'First route') ? { firstRoute: routeLineValue(block.body, 'First route') } : {}),
      ...(routeLineValue(block.body, 'Fallback route') ? { fallbackRoute: routeLineValue(block.body, 'Fallback route') } : {}),
      ...(routeLineValue(block.body, 'Completion bar') ? { completionBar: routeLineValue(block.body, 'Completion bar') } : {}),
      primaryTargetHost,
      fallbackTargetHost,
    })
  }
  const prose = researchBriefMarkdown.split(/\r?\n/).filter((line) => !/^\s*- (?:First route|Fallback route|Primary target host|Fallback target host|Goal|Completion bar|Evidence field|Owner report):/i.test(line)).join('\n')
  const planned = inferPlannedRoutes(policy, prose)
  for (const route of planned) {
    if (!routes.some((existing) => existing.primaryTargetHost === route.primaryTargetHost)) routes.push(route)
  }
  return { routes, declarationIssues }
}

function entryHosts(entry: ExpertResearchAuditEntry): string[] {
  return [entry.target, entry.finalUrl].flatMap((value) => {
    if (!value) return []
    try {
      const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '')
      return hostname ? [hostname] : []
    } catch {
      return []
    }
  })
}

function matchesHost(entry: ExpertResearchAuditEntry, expectedHost: string): boolean {
  return entry.kind === 'url' && entryHosts(entry).some((hostname) => hostname === expectedHost || hostname.endsWith('.' + expectedHost))
}

function successfulExtraction(entries: ExpertResearchAuditEntry[], host: string): boolean {
  return entries.some((entry) => entry.status === 'opened' && entry.actionTypes?.includes('extract') && concreteRoutePage(entry, host))
}

function openedWithoutExtract(entries: ExpertResearchAuditEntry[]): boolean {
  return entries.some((entry) => entry.status === 'opened')
}

function limitedOrFailed(entries: ExpertResearchAuditEntry[]): boolean {
  return entries.some((entry) => entry.status === 'access_limited' || entry.status === 'failed')
}

function recovery(
  route: ExpertResearchRequiredRoute,
  nextStep: ExpertResearchRequiredRouteRecovery['nextStep'],
  reason: string,
): ExpertResearchRequiredRouteRecovery {
  return { ...route, nextStep, reason }
}

/**
 * Evaluates both optional structured and naturally planned platform routes against
 * actual persisted Playwright audit entries. A target hostname is authoritative
 * for blocked redirects, while the final URL remains valid proof for a normal
 * redirected page. Bounded unresolved attempts remain explicit evidence gaps.
 */
export function evaluateExpertResearchRequiredRoutes(input: {
  artifactPolicy: ExpertResearchArtifactPolicy
  researchBriefMarkdown: string
  sourceRecords: ExpertResearchEvidenceRecord[]
}): ExpertResearchRequiredRouteEvaluation {
  const parsed = parseExpertResearchRequiredRoutes(input.artifactPolicy, input.researchBriefMarkdown)
  const routes: Array<ExpertResearchRequiredRoute & { status: ExpertResearchRequiredRouteStatus }> = []
  const recoveries: ExpertResearchRequiredRouteRecovery[] = []

  for (const route of parsed.routes) {
    const records = input.sourceRecords.filter((record) => record.artifactPath && researchArtifactRootPath(record.artifactPath) === route.artifactPath)
    const entries = records.flatMap((record) => record.entries)
    const primary = entries.filter((entry) => matchesHost(entry, route.primaryTargetHost))
    const fallback = entries.filter((entry) => matchesHost(entry, route.fallbackTargetHost))

    if (successfulExtraction(primary, route.primaryTargetHost)) {
      routes.push({ ...route, status: 'primary-succeeded' })
      continue
    }
    // Count completed tool calls, not pages in one script or ordinary homepage
    // navigation. Preserve the fallback opportunity before accepting a bounded gap.
    const calls = (host: string, includeEntries: boolean) => new Set(entries
      .filter((entry) => entry.status !== 'pending' && entry.status !== 'interrupted'
        && (routeSearchAttempt(entry, host) || (matchesHost(entry, host)
          && (includeEntries || concreteRoutePage(entry, host)))))
      .map((entry) => entry.auditId?.replace(/:(?:\d+|sequence)(?::script:\d+)?$/, '') ?? 'legacy-unidentified-call'))
    const primaryExhausted = limitedOrFailed(primary) || recordedSearchGap(records, route.primaryTargetHost)
      || calls(route.primaryTargetHost, false).size >= 2
    if (primaryExhausted) {
      if (successfulExtraction(fallback, route.fallbackTargetHost)) {
        routes.push({ ...route, status: 'fallback-succeeded' })
        continue
      }
      if (limitedOrFailed(fallback) || recordedSearchGap(records, route.fallbackTargetHost)) {
        routes.push({ ...route, status: 'evidence-gap-after-fallback' })
        continue
      }
      if (calls(route.fallbackTargetHost, true).size >= 2) {
        routes.push({ ...route, status: 'unresolved-after-bounded-attempts' })
        continue
      }
      if (openedWithoutExtract(fallback)) {
        routes.push({ ...route, status: 'fallback-needs-extract' })
        recoveries.push(recovery(route, 'extract-fallback', '备选路线只有入口或缺少具体内容提取；针对同一问题补查一次，仍无证据则如实保留缺口，不循环。'))
        continue
      }
      routes.push({ ...route, status: 'fallback-required' })
      recoveries.push(recovery(route, 'attempt-fallback', '首路线已按真实结果收尾，或有界定向尝试仍缺具体提取；尚未尝试同字段备选路线。不要把取证不足写成网站受限。'))
      continue
    }

    if (openedWithoutExtract(primary)) {
      routes.push({ ...route, status: 'primary-needs-extract' })
      recoveries.push(recovery(route, 'extract-primary', '只有入口/搜索页或缺少具体页提取；围绕产品选择一页相关正文取证，真实无结果时记录，不要求成功。'))
      continue
    }
    routes.push({ ...route, status: 'primary-not-attempted' })
    recoveries.push(recovery(route, 'attempt-primary', '任务书已选为 Required route，但没有匹配的真实 Playwright 具体页面记录。'))
  }

  // Optional declaration syntax is not a file-format gate. Natural planned
  // platform routes above remain active when an optional block is incomplete.
  return { complete: recoveries.length === 0, routes, recoveries }
}


/** Bounded incompleteness remains visible, even when it no longer blocks delivery. */
export function formatExpertResearchRouteEvaluation(evaluation: ExpertResearchRequiredRouteEvaluation): string {
  if (!evaluation.routes.length) return ''
  return '\n\n## 已计划具体内容路线（服务端核对）\n\n'
    + '首页访问不等于正文证据；unresolved-after-bounded-attempts 表示有界补查后仍未取得具体证据，不代表网站受限或已完成具体取证。复核与报告必须保留相应缺口。\n\n'
    + evaluation.routes.map((route) => '- ' + route.artifactPath + ' | ' + route.routeId + ' | ' + route.primaryTargetHost + ' | ' + route.status).join('\n') + '\n'
}
