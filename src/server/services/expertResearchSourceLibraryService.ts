import { researchArtifactRootPath } from '../../services/tools/expertFileFirstResearchProtocol.js'
import { createHash } from 'node:crypto'
import type { ExpertResearchEvidenceRecord } from "./expertResearchEvidenceReviewService.js"

export type ExpertResearchSourceLibraryTier = "core" | "open"
export type ExpertResearchSourceLibraryTaskOwner = "competitors" | "demand-market" | "commercialization-channel"

export const EXPERT_RESEARCH_SOURCE_EXECUTION_BATCH_SIZE = 10

export type ExpertResearchSourceLibraryEntry = {
  tier: ExpertResearchSourceLibraryTier
  category: string
  candidateUrl: string
  candidateHost: string
  /** Exact-host matching is the safe default. A specific non-www subdomain can opt into descendants. */
  allowSubdomains: boolean
}

export type ExpertResearchSourceLibraryCatalog = {
  entries: ExpertResearchSourceLibraryEntry[]
}

export type ExpertResearchSourceLibraryUsage = {
  agentId: string
  agentType: string
  /** The declared file-first report that produced this real browser receipt. */
  artifactPath?: string
  auditId?: string
  tier: ExpertResearchSourceLibraryTier
  category: string
  candidateHost: string
  openedUrl: string
}

export type ExpertResearchSourceLibraryAttempt = {
  agentId: string
  agentType: string
  /** The declared file-first report that produced this real browser receipt. */
  artifactPath?: string
  auditId?: string
  tier: ExpertResearchSourceLibraryTier
  category: string
  candidateHost: string
  candidateUrl: string
  status: "opened" | "access_limited" | "failed" | "pending" | "interrupted"
  targetUrl: string
  finalUrl?: string
  detail?: string
}

export type ExpertResearchSourceLibraryTask = ExpertResearchSourceLibraryEntry & {
  owner: ExpertResearchSourceLibraryTaskOwner
}

export type ExpertResearchSourceLibraryExecutionBatch = {
  owner: ExpertResearchSourceLibraryTaskOwner
  artifactPath: string
  /** Stable identity for this exact A/B/C source package. */
  batchFingerprint: string
  entries: ExpertResearchSourceLibraryTask[]
}

export type ExpertResearchSourceLibraryExecutionPlan = {
  batches: ExpertResearchSourceLibraryExecutionBatch[]
}

/** A server-persisted acknowledgement that the child runner received one source package. */
export type ExpertResearchSourceLibraryDispatchReceipt = {
  artifactPath: string
  batchFingerprint: string
  coreEntryCount: number
  openEntryCount: number
  agentId: string
  dispatchedAt: string
  /** Absent in legacy receipts: never infer completion from an incremental Write. */
  completedAt?: string
  retryCount?: number
}

/**
 * Restores a legacy browser record's file-first owner only when the same agent
 * has one unambiguous server-validated dispatch destination. Never infer across
 * multiple artifact paths and never parse free-form handoff text.
 */
export function resolveResearchRecordArtifactPath(
  record: Pick<ExpertResearchEvidenceRecord, 'agentId' | 'artifactPath'>,
  dispatches?: ExpertResearchSourceLibraryDispatchReceipt[],
): string | undefined {
  if (record.artifactPath) return researchArtifactRootPath(record.artifactPath)
  const dispatchedPaths = new Set((dispatches ?? [])
    .filter((dispatch) => dispatch.agentId === record.agentId)
    .map((dispatch) => dispatch.artifactPath))
  return dispatchedPaths.size === 1 ? [...dispatchedPaths][0] : undefined
}

export type ExpertResearchSourceLibraryBatchProgress = {
  owner: ExpertResearchSourceLibraryTaskOwner
  artifactPath: string
  batchFingerprint: string
  dispatched: boolean
  coreEntryCount: number
  openEntryCount: number
  coreAttemptedCount: number
  coreOpenedCount: number
  coreAccessLimitedCount: number
  coreFailedCount: number
  coreNotStartedCount: number
  openAttemptedCount: number
  openOpenedCount: number
  openAccessLimitedCount: number
  openFailedCount: number
  openNotStartedCount: number
}

export type ExpertResearchSourceLibraryMissingBatch = {
  owner: ExpertResearchSourceLibraryTaskOwner
  artifactPath: string
  batchFingerprint: string
  entries: ExpertResearchSourceLibraryTask[]
}

function sourceBatchFingerprint(input: {
  owner: ExpertResearchSourceLibraryTaskOwner
  artifactPath: string
  entries: ExpertResearchSourceLibraryTask[]
}): string {
  const serializable = {
    owner: input.owner,
    artifactPath: input.artifactPath.replace(/\\/g, '/'),
    entries: input.entries.map((entry) => ({
      tier: entry.tier,
      category: entry.category,
      candidateUrl: entry.candidateUrl,
      candidateHost: entry.candidateHost,
      owner: entry.owner,
    })),
  }
  return createHash('sha256').update(JSON.stringify(serializable)).digest('hex').slice(0, 32)
}

const URL_PATTERN = /https?:\/\/[^\s)\]>,]+/gi
const TIER_MARKER_PATTERN = /^<!--\s*research-source-library-tier:\s*(core|open)\s*-->\s*$/i

function normalizedCandidate(value: string): Pick<ExpertResearchSourceLibraryEntry, "candidateUrl" | "candidateHost" | "allowSubdomains"> | undefined {
  try {
    const parsed = new URL(value)
    const rawHost = parsed.hostname.toLowerCase().replace(/\.$/, "")
    const candidateHost = rawHost.replace(/^www\./, "")
    if (!candidateHost) return undefined

    // A root or www host should not silently claim unrelated sub-sites such as
    // play.google.com for a www.google.com candidate. A library entry that
    // names a specific non-www subdomain may match its descendants instead.
    return {
      candidateUrl: parsed.toString(),
      candidateHost,
      allowSubdomains: !rawHost.startsWith("www.") && candidateHost.split(".").length >= 3,
    }
  } catch {
    return undefined
  }
}

type ComparableUrl = {
  href: string
  protocol: string
  rawHost: string
  candidateHost: string
  pathname: string
}

function comparableUrl(value: string | undefined): ComparableUrl | undefined {
  if (!value) return undefined
  try {
    const parsed = new URL(value)
    const rawHost = parsed.hostname.toLowerCase().replace(/\.$/, "")
    return {
      href: parsed.toString(),
      protocol: parsed.protocol,
      rawHost,
      candidateHost: rawHost.replace(/^www\./, ""),
      pathname: parsed.pathname || '/',
    }
  } catch {
    return undefined
  }
}

function cleanCategory(value: string): string | undefined {
  const category = value.trim()
  return category || undefined
}

function matchesCandidateHost(openedHost: string, candidate: ExpertResearchSourceLibraryEntry): boolean {
  return openedHost === candidate.candidateHost
    // Only the public Weibo search host belongs to its social-platform route.
    // data.weibo.com is a separate company-library source, not interchangeable.
    || (candidate.tier === 'open' && candidate.candidateHost === 'weibo.com' && openedHost === 's.weibo.com')
    || (candidate.allowSubdomains && openedHost.endsWith("." + candidate.candidateHost))
}

/** Returns only catalog entries whose normalized URL exactly matches the requested target. */
function exactCandidatesForVisitedUrl(
  value: string | undefined,
  catalog: ExpertResearchSourceLibraryCatalog,
): ExpertResearchSourceLibraryEntry[] {
  const visited = comparableUrl(value)
  if (!visited) return []
  return catalog.entries.filter((candidate) => comparableUrl(candidate.candidateUrl)?.href === visited.href)
}

/**
 * Maps one browser navigation to at most one same-host catalog route unless the
 * exact URL was intentionally duplicated. This prevents one visit from silently
 * completing two distinct company links that happen to share a host.
 */
function candidatesForVisitedUrl(
  value: string | undefined,
  catalog: ExpertResearchSourceLibraryCatalog,
): ExpertResearchSourceLibraryEntry[] {
  const visited = comparableUrl(value)
  if (!visited) return []
  const hostMatches = catalog.entries.filter((candidate) => matchesCandidateHost(visited.candidateHost, candidate))
  if (hostMatches.length <= 1) return hostMatches

  const exact = hostMatches.filter((candidate) => comparableUrl(candidate.candidateUrl)?.href === visited.href)
  if (exact.length) return exact

  const pathMatches = hostMatches
    .map((candidate) => ({ candidate, url: comparableUrl(candidate.candidateUrl) }))
    .filter((item): item is { candidate: ExpertResearchSourceLibraryEntry; url: ComparableUrl } => Boolean(item.url))
    .filter((item) => item.url.pathname !== '/' && (
      visited.pathname === item.url.pathname
      || visited.pathname.startsWith(item.url.pathname.replace(/\/$/, '') + '/')
    ))
    .sort((left, right) => right.url.pathname.length - left.url.pathname.length)
  if (pathMatches.length) return [pathMatches[0].candidate]

  const roots = hostMatches
    .map((candidate) => ({ candidate, url: comparableUrl(candidate.candidateUrl) }))
    .filter((item): item is { candidate: ExpertResearchSourceLibraryEntry; url: ComparableUrl } => Boolean(item.url) && item.url.pathname === '/')
  const sameOriginRoot = roots.find((item) => item.url.protocol === visited.protocol && item.url.rawHost === visited.rawHost)
    ?? roots.find((item) => item.url.protocol === visited.protocol)
    ?? roots.find((item) => item.url.rawHost === visited.rawHost)
    ?? roots[0]
  return sameOriginRoot ? [sameOriginRoot.candidate] : [hostMatches[0]]
}

function tierLabel(tier: ExpertResearchSourceLibraryTier): string {
  return tier === "core" ? "公司 PM 核心来源库" : "开放补充来源网络"
}

function ownerLabel(owner: ExpertResearchSourceLibraryTaskOwner): string {
  if (owner === "competitors") return "A：产品与竞品"
  if (owner === "demand-market") return "B：需求与市场"
  return "C：商业化与渠道"
}

function sourceTaskOwner(entry: ExpertResearchSourceLibraryEntry): ExpertResearchSourceLibraryTaskOwner {
  const category = entry.category
  const host = entry.candidateHost

  if (entry.tier === "core") {
    if (/移动应用|产品数据|ASO/.test(category)) return "competitors"
    if (/行业|用户|内容|品牌/.test(category)) return "demand-market"
    return "commercialization-channel"
  }

  if (/应用商店|用户评价|产品口碑/.test(category)) return "competitors"
  if (/趋势|搜索|流量|SEO/.test(category)) return "commercialization-channel"
  if (["producthunt.com", "github.com", "gitee.com"].includes(host)) return "competitors"
  if (["x.com", "indiehackers.com"].includes(host)) return "commercialization-channel"
  return "demand-market"
}

function emptyTierMessage(tier: ExpertResearchSourceLibraryTier): string {
  return tier === "core"
    ? "本轮没有已打开且命中公司 PM 核心来源库的具体页面；这表示尚未执行到匹配入口，不表示核心来源受限、无价值或已经被否定。"
    : "本轮没有已打开且命中开放补充来源网络的具体页面；这表示尚未执行到匹配入口，不表示相关平台受限、无价值或已经被否定。"
}

/**
 * Parses the package-local source library instead of hard-coding company or
 * platform domains into shared server code. Entries are core by default so
 * future user additions stay high priority. The ZIP may mark its expanded
 * public network with \`<!-- research-source-library-tier: open -->\`.
 */
export function parseResearchSourceLibrary(content: string | undefined): ExpertResearchSourceLibraryCatalog {
  if (!content?.trim()) return { entries: [] }

  const entries: ExpertResearchSourceLibraryEntry[] = []
  const seen = new Set<string>()
  let category: string | undefined
  let tier: ExpertResearchSourceLibraryTier = "core"

  for (const line of content.split(/\r?\n/)) {
    const tierMarker = TIER_MARKER_PATTERN.exec(line)
    if (tierMarker) {
      tier = tierMarker[1].toLowerCase() as ExpertResearchSourceLibraryTier
      category = undefined
      continue
    }

    const heading = /^###\s+(.+?)\s*$/.exec(line)
    if (heading) {
      category = cleanCategory(heading[1])
      continue
    }
    if (!category) continue

    for (const candidateUrl of line.match(URL_PATTERN) ?? []) {
      const candidate = normalizedCandidate(candidateUrl)
      if (!candidate) continue
      const key = [tier, category, candidate.candidateUrl].join("\n")
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ tier, category, ...candidate })
    }
  }

  return { entries }
}

/**
 * Deterministically gives every catalog entry exactly one default A/B/C owner.
 * It is an exhaustive planning map, not a claim that every page must be deeply
 * read or cited in every product study. Product relevance is decided in the
 * brief; actual browser results remain the only evidence.
 */
export function planResearchSourceLibraryTaskPool(catalog: ExpertResearchSourceLibraryCatalog): ExpertResearchSourceLibraryTask[] {
  return catalog.entries.map((entry) => ({ ...entry, owner: sourceTaskOwner(entry) }))
}

/**
 * Converts the diagnostic A/B/C owner map into the concrete execution batches
 * injected into the three file-first researchers. This is intentionally scoped
 * to the commercialization expert's canonical 02/03/04 handoff paths. It does
 * not create a completion gate: an attempted, limited, failed, or unused page
 * remains a truthful audit outcome instead of a reason to block report delivery.
 */
export function planResearchSourceLibraryExecutionBatches(input: {
  catalog: ExpertResearchSourceLibraryCatalog
  researcherPaths: string[]
}): ExpertResearchSourceLibraryExecutionPlan | undefined {
  const pathByOwner: Partial<Record<ExpertResearchSourceLibraryTaskOwner, string>> = {}
  for (const candidate of input.researcherPaths) {
    const normalized = candidate.replace(/\\/g, "/")
    if (/^commercialization-research\/02-[^/]+\.md$/i.test(normalized)) pathByOwner.competitors ??= candidate
    else if (/^commercialization-research\/03-[^/]+\.md$/i.test(normalized)) pathByOwner["demand-market"] ??= candidate
    else if (/^commercialization-research\/04-[^/]+\.md$/i.test(normalized)) pathByOwner["commercialization-channel"] ??= candidate
  }

  const owners: ExpertResearchSourceLibraryTaskOwner[] = [
    "competitors",
    "demand-market",
    "commercialization-channel",
  ]
  if (owners.some((owner) => !pathByOwner[owner])) return undefined

  const tasks = planResearchSourceLibraryTaskPool(input.catalog)
  return {
    batches: owners.map((owner) => {
      const artifactPath = pathByOwner[owner]!
      const entries = tasks.filter((task) => task.owner === owner)
      return {
        owner,
        artifactPath,
        batchFingerprint: sourceBatchFingerprint({ owner, artifactPath, entries }),
        entries,
      }
    }),
  }
}

/**
 * Returns only browser audit entries that were actually opened this round and
 * whose final concrete page belongs to a source-library domain. It is
 * observational metadata: neither core nor open matches block completion or
 * delivery, and unmatched routes remain "not executed", never "restricted".
 */
export function matchOpenedResearchSourceLibraryEntries(input: {
  catalog: ExpertResearchSourceLibraryCatalog
  records: ExpertResearchEvidenceRecord[]
  dispatches?: ExpertResearchSourceLibraryDispatchReceipt[]
}): ExpertResearchSourceLibraryUsage[] {
  const matches: ExpertResearchSourceLibraryUsage[] = []
  const seen = new Set<string>()

  for (const record of input.records) {
    const artifactPath = resolveResearchRecordArtifactPath(record, input.dispatches)
    for (const entry of record.entries) {
      if (entry.status !== "opened" || entry.kind === "search") continue
      const openedUrl = entry.finalUrl ?? entry.target
      const targetCandidates = candidatesForVisitedUrl(entry.target, input.catalog)
      const matchedCandidates = targetCandidates.length
        ? targetCandidates
        : candidatesForVisitedUrl(openedUrl, input.catalog)

      for (const candidate of matchedCandidates) {
        const key = [record.agentId, entry.auditId ?? "", candidate.tier, candidate.category, candidate.candidateUrl, openedUrl].join("\n")
        if (seen.has(key)) continue
        seen.add(key)
        matches.push({
          agentId: record.agentId,
          agentType: record.agentType,
          ...(artifactPath ? { artifactPath } : {}),
          ...(entry.auditId ? { auditId: entry.auditId } : {}),
          tier: candidate.tier,
          category: candidate.category,
          candidateHost: candidate.candidateHost,
          openedUrl,
        })
      }
    }
  }

  return matches
}

/**
 * Keeps an observational disposition for any concrete attempt on a catalog
 * domain. Unlike opened usage this table may show access limits or failures,
 * but it never turns a missing attempt into a restriction conclusion or claim
 * that the candidate entry URL itself was opened.
 */
export function matchResearchSourceLibraryAttempts(input: {
  catalog: ExpertResearchSourceLibraryCatalog
  records: ExpertResearchEvidenceRecord[]
  dispatches?: ExpertResearchSourceLibraryDispatchReceipt[]
}): ExpertResearchSourceLibraryAttempt[] {
  const attempts: ExpertResearchSourceLibraryAttempt[] = []
  const seen = new Set<string>()

  for (const record of input.records) {
    const artifactPath = resolveResearchRecordArtifactPath(record, input.dispatches)
    for (const entry of record.entries) {
      // Search-result discovery pages must not satisfy the source library by
      // host alone. But when Playwright's audit classifier labels an explicit
      // source-library navigation as "search", the exact requested target is
      // still authoritative proof that this catalog route was attempted.
      const exactTargetCandidates = exactCandidatesForVisitedUrl(entry.target, input.catalog)
      const platformSearchCandidates = candidatesForVisitedUrl(entry.target, input.catalog)
        .filter((candidate) => candidate.tier === 'open' && new URL(candidate.candidateUrl).pathname === '/')
      // A platform search is a route attempt, never a citable content page.
      // Generic discovery searches still cannot complete core-library sources.
      if (entry.kind === "search" && exactTargetCandidates.length === 0 && platformSearchCandidates.length === 0) continue

      // Prefer the actual requested target. Only an opened same-site final URL
      // may recover a missing target match; limited cross-site interstitials can
      // never complete an unrelated catalog entry.
      const targetCandidates = exactTargetCandidates.length
        ? exactTargetCandidates
        : candidatesForVisitedUrl(entry.target, input.catalog)
      const matchedCandidates = targetCandidates.length
        ? targetCandidates
        : entry.status === "opened"
          ? candidatesForVisitedUrl(entry.finalUrl, input.catalog)
          : []
      for (const candidate of matchedCandidates) {
        const key = [record.agentId, entry.auditId ?? "", candidate.tier, candidate.category, candidate.candidateUrl, entry.status, entry.target, entry.finalUrl ?? ""].join("\n")
        if (seen.has(key)) continue
        seen.add(key)
        attempts.push({
          agentId: record.agentId,
          agentType: record.agentType,
          ...(artifactPath ? { artifactPath } : {}),
          ...(entry.auditId ? { auditId: entry.auditId } : {}),
          tier: candidate.tier,
          category: candidate.category,
          candidateHost: candidate.candidateHost,
          candidateUrl: candidate.candidateUrl,
          status: entry.status,
          targetUrl: entry.target,
          ...(entry.finalUrl ? { finalUrl: entry.finalUrl } : {}),
          ...(entry.detail ? { detail: entry.detail } : {}),
        })
      }
    }
  }

  return attempts
}

/**
 * Derives truthful per-batch status from persisted dispatch receipts and real
 * Playwright audit records. Terminal outcomes advance bounded execution waves;
 * they never require success, deep reading, or final citation.
 */
export function evaluateResearchSourceLibraryExecutionProgress(input: {
  plan: ExpertResearchSourceLibraryExecutionPlan
  attempts: ExpertResearchSourceLibraryAttempt[]
  dispatches?: ExpertResearchSourceLibraryDispatchReceipt[]
}): ExpertResearchSourceLibraryBatchProgress[] {
  return input.plan.batches.map((batch) => {
    const coreEntries = batch.entries.filter((entry) => entry.tier === 'core')
    const openEntries = batch.entries.filter((entry) => entry.tier === 'open')
    // Dispatch receipts are validated against the exact execution wave when
    // they are persisted. Progress only needs to show whether this owner has
    // received at least one real wave; older chunk fingerprints stay valid after
    // later attempts advance the remaining queue.
    const validDispatch = (input.dispatches ?? []).some((dispatch) => dispatch.artifactPath === batch.artifactPath)
    const latestByCandidate = new Map<string, ExpertResearchSourceLibraryAttempt>()
    for (const attempt of input.attempts) {
      if (attempt.status === 'pending' || attempt.artifactPath !== batch.artifactPath) continue
      if (!batch.entries.some((entry) => entry.tier === attempt.tier && entry.category === attempt.category && entry.candidateUrl === attempt.candidateUrl)) continue
      latestByCandidate.set([attempt.tier, attempt.category, attempt.candidateUrl].join('\n'), attempt)
    }
    const latest = [...latestByCandidate.values()]
    const latestCore = latest.filter((attempt) => attempt.tier === 'core')
    const latestOpen = latest.filter((attempt) => attempt.tier === 'open')
    const count = (items: ExpertResearchSourceLibraryAttempt[], status: ExpertResearchSourceLibraryAttempt['status']) => items.filter((attempt) => attempt.status === status).length
    return {
      owner: batch.owner,
      artifactPath: batch.artifactPath,
      batchFingerprint: batch.batchFingerprint,
      dispatched: validDispatch,
      coreEntryCount: coreEntries.length,
      openEntryCount: openEntries.length,
      coreAttemptedCount: latestCore.length,
      coreOpenedCount: count(latestCore, 'opened'),
      coreAccessLimitedCount: count(latestCore, 'access_limited'),
      coreFailedCount: count(latestCore, 'failed'),
      coreNotStartedCount: Math.max(0, coreEntries.length - latestCore.length),
      openAttemptedCount: latestOpen.length,
      openOpenedCount: count(latestOpen, 'opened'),
      openAccessLimitedCount: count(latestOpen, 'access_limited'),
      openFailedCount: count(latestOpen, 'failed'),
      openNotStartedCount: Math.max(0, openEntries.length - latestOpen.length),
    }
  })
}

/**
 * Returns only entries that have no real browser outcome yet. A failed or
 * access-limited attempt counts as covered because the goal is truthful route
 * execution, not forced success. This supports bounded remaining-only waves
 * without turning individual sites into success-based blockers.
 */
export function findUnattemptedResearchSourceLibraryEntries(input: {
  plan: ExpertResearchSourceLibraryExecutionPlan
  attempts: ExpertResearchSourceLibraryAttempt[]
}): ExpertResearchSourceLibraryMissingBatch[] {
  return input.plan.batches.flatMap((batch) => {
    const attempted = new Set(input.attempts
      .filter((attempt) => attempt.status !== 'pending' && attempt.artifactPath === batch.artifactPath)
      .map((attempt) => [attempt.tier, attempt.category, attempt.candidateUrl].join('\n')))
    const entries = batch.entries.filter((entry) => !attempted.has([entry.tier, entry.category, entry.candidateUrl].join('\n')))
    return entries.length ? [{
      owner: batch.owner,
      artifactPath: batch.artifactPath,
      batchFingerprint: batch.batchFingerprint,
      entries,
    }] : []
  })
}

export type ExpertResearchSourceLibraryExecutionCoverage = {
  complete: boolean
  missingBatches: ExpertResearchSourceLibraryMissingBatch[]
  executionWave: ExpertResearchSourceLibraryExecutionPlan
}

/**
 * Produces the next bounded A/B/C execution wave from real terminal browser
 * outcomes. Each owner keeps one deterministic batch, including an empty batch
 * after completion so route-specific researcher recovery remains scoped without
 * re-injecting the full source library.
 */
export function evaluateResearchSourceLibraryExecutionCoverage(input: {
  plan: ExpertResearchSourceLibraryExecutionPlan
  attempts: ExpertResearchSourceLibraryAttempt[]
  maxEntriesPerBatch?: number
}): ExpertResearchSourceLibraryExecutionCoverage {
  const maxEntriesPerBatch = Number.isInteger(input.maxEntriesPerBatch)
    ? Math.max(1, Math.min(50, input.maxEntriesPerBatch as number))
    : EXPERT_RESEARCH_SOURCE_EXECUTION_BATCH_SIZE
  const missingBatches = findUnattemptedResearchSourceLibraryEntries({
    plan: input.plan,
    attempts: input.attempts,
  })
  const missingByArtifact = new Map(missingBatches.map((batch) => [batch.artifactPath, batch]))
  const executionWave: ExpertResearchSourceLibraryExecutionPlan = {
    batches: input.plan.batches.map((batch) => {
      const entries = (missingByArtifact.get(batch.artifactPath)?.entries ?? []).slice(0, maxEntriesPerBatch)
      return {
        owner: batch.owner,
        artifactPath: batch.artifactPath,
        batchFingerprint: sourceBatchFingerprint({ owner: batch.owner, artifactPath: batch.artifactPath, entries }),
        entries,
      }
    }),
  }
  return {
    complete: missingBatches.length === 0,
    missingBatches,
    executionWave,
  }
}

export function planResearchSourceLibraryExecutionWave(input: {
  plan: ExpertResearchSourceLibraryExecutionPlan
  attempts: ExpertResearchSourceLibraryAttempt[]
  maxEntriesPerBatch?: number
}): ExpertResearchSourceLibraryExecutionPlan {
  return evaluateResearchSourceLibraryExecutionCoverage(input).executionWave
}

function markdownCell(value: string | undefined): string {
  return String(value ?? "").replace(/[|\r\n]+/g, " ").trim().slice(0, 420)
}

function renderTierUsage(tier: ExpertResearchSourceLibraryTier, matches: ExpertResearchSourceLibraryUsage[]): string[] {
  const lines = ["### " + tierLabel(tier), ""]
  const tierMatches = matches.filter((match) => match.tier === tier)
  if (tierMatches.length === 0) {
    lines.push(emptyTierMessage(tier), "")
    return lines
  }

  lines.push("| 研究子代理 | 来源类别 | 候选域名 | 实际打开页面 | 审计 ID |", "| --- | --- | --- | --- | --- |")
  for (const match of tierMatches) {
    lines.push("| " + markdownCell(match.agentType + "（" + match.agentId + "）") + " | " + markdownCell(match.category) + " | " + markdownCell(match.candidateHost) + " | " + markdownCell(match.openedUrl) + " | " + markdownCell(match.auditId) + " |")
  }
  lines.push("")
  return lines
}

function renderAttemptStatus(attempts: ExpertResearchSourceLibraryAttempt[]): string {
  if (attempts.length === 0) return "未开始：尚未产生浏览回执（不是受限或无价值结论）"
  const latest = attempts.at(-1)
  if (!latest) return "未开始：尚未产生浏览回执（不是受限或无价值结论）"
  if (latest.status === "opened") return "同域具体页已打开：" + markdownCell(latest.finalUrl ?? latest.targetUrl)
  if (latest.status === "access_limited") return "同域入口已尝试：访问受限" + (latest.detail ? "（" + markdownCell(latest.detail) + "）" : "")
  if (latest.status === "failed") return "同域入口已尝试：失败" + (latest.detail ? "（" + markdownCell(latest.detail) + "）" : "")
  if (latest.status === "interrupted") return "同域入口已尝试：研究子代理中断，未据此判断网站受限" + (latest.detail ? "（" + markdownCell(latest.detail) + "）" : "")
  return "已发起浏览，回执待定"
}

/**
 * Makes the full user-curated catalog visible as one distributed A/B/C task
 * pool. Terminal execution coverage is a lifecycle gate, while success rate,
 * deep reading, and final citation remain evidence decisions limited to
 * product-relevant, actually opened concrete pages.
 * Browser status is domain-route matching, not proof that the root candidate
 * URL itself was opened.
 */
export function renderResearchSourceLibraryTaskPoolMarkdown(input: {
  catalog: ExpertResearchSourceLibraryCatalog
  attempts: ExpertResearchSourceLibraryAttempt[]
  plan?: ExpertResearchSourceLibraryExecutionPlan
  dispatches?: ExpertResearchSourceLibraryDispatchReceipt[]
}): string {
  const tasks = planResearchSourceLibraryTaskPool(input.catalog)
  const coreCount = tasks.filter((task) => task.tier === "core").length
  const openCount = tasks.filter((task) => task.tier === "open").length
  const progressByOwner = new Map((input.plan
    ? evaluateResearchSourceLibraryExecutionProgress({ plan: input.plan, attempts: input.attempts, dispatches: input.dispatches })
    : []).map((progress) => [progress.owner, progress]))
  const lines = [
    "## 用户候选来源库任务池与浏览状态",
    "",
    "> 服务端将本轮来源库中的每个候选入口默认分给 A（产品与竞品）、B（需求与市场）或 C（商业化与渠道）。这确保公司 PM 核心库与主流公开平台都进入同一个总任务池；全部入口必须各有一次真实终态后流程才进入 D/E/08/HTML，但不要求逐站成功、深读、引用或达到来源数量。主代理在 01 中按当前产品写“直接相关 / 可能相关 / 当前不适用”的理由；下表状态按候选入口所属域名与真实浏览回执对照，不等于候选根链接本身已被打开；只有实际打开具体页面的内容才可作为证据或最终引用。",
    "",
    "> 本轮任务池：公司 PM 核心来源库 " + coreCount + " 个候选入口；开放补充来源网络 " + openCount + " 个候选入口。下表中的“尚未产生浏览回执”只表示本轮尚未执行到该入口，不表示访问受限、无价值、已覆盖或研究失败。",
    "",
  ]

  for (const owner of ["competitors", "demand-market", "commercialization-channel"] as const) {
    const ownerTasks = tasks.filter((task) => task.owner === owner)
    lines.push("### " + ownerLabel(owner), "")
    const progress = progressByOwner.get(owner)
    if (progress) {
      lines.push("> 来源包状态：" + (progress.dispatched ? "已分发" : "未分发")
        + "；核心候选 " + progress.coreEntryCount
        + "；实际尝试 " + progress.coreAttemptedCount
        + "；已打开 " + progress.coreOpenedCount
        + "；访问受限 " + progress.coreAccessLimitedCount
        + "；失败 " + progress.coreFailedCount
        + "；未开始 " + progress.coreNotStartedCount + "。", "")
    }
    if (ownerTasks.length === 0) {
      lines.push("本轮没有分配到该批次的候选入口。", "")
      continue
    }
    lines.push("| 来源层 | 来源类别 | 候选入口 | 同域页面浏览状态 |", "| --- | --- | --- | --- |")
    for (const task of ownerTasks) {
      const attempts = input.attempts.filter((attempt) => attempt.tier === task.tier
        && attempt.category === task.category
        && attempt.candidateUrl === task.candidateUrl)
      lines.push("| " + markdownCell(tierLabel(task.tier)) + " | " + markdownCell(task.category) + " | " + markdownCell(task.candidateUrl) + " | " + renderAttemptStatus(attempts) + " |")
    }
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * Appends a transparent receipt to 06-browser-audit.md. It keeps the company
 * PM core library visibly distinct from open-platform expansion, while never
 * converting either into a fixed-domain, per-site success, deep-read, or citation requirement.
 */
export function renderResearchSourceLibraryUsageMarkdown(matches: ExpertResearchSourceLibraryUsage[]): string {
  const lines = [
    "## 用户候选来源库实际命中",
    "",
    "> 此区由服务端把本轮实际 opened 的具体页面与候选来源库按域名自动对照生成。它区分公司 PM 核心来源库与开放补充来源网络，只说明本轮实际打开过哪些入口；未命中只表示尚未执行到，不代表站点受限、无价值或已覆盖，也不会增加逐站深读、数量或交付门槛。",
    "",
    ...renderTierUsage("core", matches),
    ...renderTierUsage("open", matches),
  ]
  return lines.join("\n")
}
