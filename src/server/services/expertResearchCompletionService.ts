export type ExpertResearchSearchEngine = 'Google' | '百度' | 'Bing' | '360'

export type ExpertResearchFinalOutputBehavior = 'block' | 'allow-with-evidence-gaps'

/** Optional ZIP-declared minimum for source rows in a rendered report. */
export type ExpertResearchFinalSourceCoverage = {
  fieldId: string
  minimumRows: number
}

export type ExpertResearchCompletionPolicy = {
  finalOutputBehavior: ExpertResearchFinalOutputBehavior
  trackedAgentTypes: string[]
  minimumCompletedAgents: number
  /** Optional ZIP-declared agent composition so one worker type cannot stand in for a full research program. */
  minimumCompletedAgentsByType?: Record<string, number>
  requiredSearchEngines: ExpertResearchSearchEngine[]
  minimumDistinctSearchQueries: number
  minimumOpenedSpecificPublicPages: number
  /** Optional ZIP-declared floor for independently hosted pages actually opened by Playwright. */
  minimumDistinctOpenedSourceDomains?: number
  requireConcreteSourcePerAgent: boolean
  finalSourceCoverage?: ExpertResearchFinalSourceCoverage
}

export type ExpertResearchAuditEntry = {
  target: string
  kind?: 'search' | 'url'
  searchEngine?: ExpertResearchSearchEngine
  query?: string
  status: 'opened' | 'access_limited' | 'failed' | 'pending'
  finalUrl?: string
  detail?: string
}

export type ExpertResearchAuditRecord = {
  agentId: string
  agentType: string
  recordedAt: string
  entries: ExpertResearchAuditEntry[]
}

export type ExpertResearchCompletionState = {
  audits: ExpertResearchAuditRecord[]
  updatedAt: string
}

export type ExpertResearchCompletionEvaluation = {
  complete: boolean
  missing: string[]
}

type JsonRecord = Record<string, unknown>
const ENGINES = new Set<ExpertResearchSearchEngine>(['Google', '百度', 'Bing', '360'])
const STATUSES = new Set<ExpertResearchAuditEntry['status']>(['opened', 'access_limited', 'failed', 'pending'])

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => !text(item))) throw new Error(`researchCompletion.${field} 必须是非空字符串数组。`)
  return [...new Set(value.map((item) => (item as string).trim()))]
}
function positiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 64) throw new Error(`researchCompletion.${field} 必须是 1–64 的整数。`)
  return value as number
}
function finalSourceCoverage(value: unknown): ExpertResearchFinalSourceCoverage | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new Error('researchCompletion.finalSourceCoverage 必须是对象。')
  const fieldId = text(value.fieldId)
  if (!fieldId || !/^[A-Z][A-Z0-9_]*$/.test(fieldId)) throw new Error('researchCompletion.finalSourceCoverage.fieldId 必须是模板字段 ID。')
  return {
    fieldId,
    minimumRows: positiveInteger(value.minimumRows, 'finalSourceCoverage.minimumRows'),
  }
}
function minimumAgentsByType(value: unknown): Record<string, number> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value) || Object.keys(value).length === 0) throw new Error('researchCompletion.minimumCompletedAgentsByType 必须是非空对象。')
  const minimums: Record<string, number> = {}
  for (const [agentType, minimum] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9-]{0,95}$/.test(agentType)) throw new Error('researchCompletion.minimumCompletedAgentsByType 包含无效的子代理类型。')
    minimums[agentType] = positiveInteger(minimum, `minimumCompletedAgentsByType.${agentType}`)
  }
  return minimums
}

/** Reads an opt-in, ZIP-declared research completion contract. No Expert ID is hard-coded. */
export function resolveExpertResearchCompletionPolicy(outputProtocolContent?: string): ExpertResearchCompletionPolicy | undefined {
  if (!outputProtocolContent?.trim()) return undefined
  let document: unknown
  try { document = JSON.parse(outputProtocolContent) } catch { throw new Error('专家输出协议不是有效 JSON，无法读取 researchCompletion 规则。') }
  if (!isRecord(document) || document.researchCompletion === undefined) return undefined
  if (!isRecord(document.researchCompletion)) throw new Error('researchCompletion 必须是对象。')
  const raw = document.researchCompletion
  let finalOutputBehavior: ExpertResearchFinalOutputBehavior | undefined
  if (raw.finalOutputBehavior === 'block' || raw.finalOutputBehavior === 'allow-with-evidence-gaps') {
    finalOutputBehavior = raw.finalOutputBehavior
  } else if (raw.finalOutputBehavior !== undefined) {
    throw new Error('researchCompletion.finalOutputBehavior 只能是 block 或 allow-with-evidence-gaps。')
  } else if (raw.requireVerifiedResearchBeforeFinalOutput === true) {
    // Backward compatibility for older ZIPs that explicitly requested a hard block.
    finalOutputBehavior = 'block'
  }
  if (!finalOutputBehavior) return undefined
  const trackedAgentTypes = stringArray(raw.trackedAgentTypes, 'trackedAgentTypes')
  const engines = stringArray(raw.requiredSearchEngines, 'requiredSearchEngines')
  if (engines.some((engine) => !ENGINES.has(engine as ExpertResearchSearchEngine))) throw new Error('researchCompletion.requiredSearchEngines 包含不支持的搜索入口。')
  if (raw.requireConcreteSourcePerAgent !== true) throw new Error('启用 researchCompletion 时 requireConcreteSourcePerAgent 必须为 true。')
  const minimumCompletedAgents = positiveInteger(raw.minimumCompletedAgents, 'minimumCompletedAgents')
  const minimumCompletedAgentsByType = minimumAgentsByType(raw.minimumCompletedAgentsByType)
  if (minimumCompletedAgentsByType && Object.keys(minimumCompletedAgentsByType).some((agentType) => !trackedAgentTypes.includes(agentType))) {
    throw new Error('researchCompletion.minimumCompletedAgentsByType 只能声明 trackedAgentTypes 中的子代理类型。')
  }
  const minimumRequiredAgents = Object.values(minimumCompletedAgentsByType ?? {}).reduce((total, minimum) => total + minimum, 0)
  if (minimumRequiredAgents > minimumCompletedAgents) {
    throw new Error('researchCompletion.minimumCompletedAgents 不得小于 minimumCompletedAgentsByType 的合计。')
  }
  const minimumOpenedSpecificPublicPages = positiveInteger(raw.minimumOpenedSpecificPublicPages, 'minimumOpenedSpecificPublicPages')
  const minimumDistinctOpenedSourceDomains = raw.minimumDistinctOpenedSourceDomains === undefined
    ? undefined
    : positiveInteger(raw.minimumDistinctOpenedSourceDomains, 'minimumDistinctOpenedSourceDomains')
  if (minimumDistinctOpenedSourceDomains && minimumDistinctOpenedSourceDomains > minimumOpenedSpecificPublicPages) {
    throw new Error('researchCompletion.minimumDistinctOpenedSourceDomains 不得大于 minimumOpenedSpecificPublicPages。')
  }
  const sourceCoverage = finalSourceCoverage(raw.finalSourceCoverage)
  return {
    finalOutputBehavior,
    trackedAgentTypes,
    minimumCompletedAgents,
    ...(minimumCompletedAgentsByType ? { minimumCompletedAgentsByType } : {}),
    requiredSearchEngines: engines as ExpertResearchSearchEngine[],
    minimumDistinctSearchQueries: positiveInteger(raw.minimumDistinctSearchQueries, 'minimumDistinctSearchQueries'),
    minimumOpenedSpecificPublicPages,
    ...(minimumDistinctOpenedSourceDomains ? { minimumDistinctOpenedSourceDomains } : {}),
    requireConcreteSourcePerAgent: true,
    ...(sourceCoverage ? { finalSourceCoverage: sourceCoverage } : {}),
  }
}

/** Validates an optional ZIP-declared final source-table floor without hard-coding any Expert. */
export function evaluateExpertFinalSourceCoverage(policy: ExpertResearchCompletionPolicy | undefined, payload: unknown): string | undefined {
  const coverage = policy?.finalSourceCoverage
  if (!coverage) return undefined
  const fields = isRecord(payload) && isRecord(payload.fields) ? payload.fields : undefined
  const rows = fields?.[coverage.fieldId]
  if (!Array.isArray(rows)) return `最终来源表 ${coverage.fieldId} 缺失；至少需要 ${coverage.minimumRows} 条实际使用的来源。`
  const urls = new Set(rows.flatMap((row) => Array.isArray(row)
    ? row.filter((cell): cell is string => typeof cell === 'string').map((cell) => {
      try {
        const url = new URL(cell.trim())
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
      } catch { return undefined }
    }).filter((url): url is string => Boolean(url))
    : []))
  return urls.size >= coverage.minimumRows
    ? undefined
    : `最终来源表 ${coverage.fieldId} 只包含 ${urls.size} 条实际 URL；该专家至少需要 ${coverage.minimumRows} 条实际使用、可追溯的来源后才能渲染正式报告。`
}

function normalizeEntry(value: unknown): ExpertResearchAuditEntry | undefined {
  if (!isRecord(value)) return undefined
  const target = text(value.target)
  const status = text(value.status)
  if (!target || !status || !STATUSES.has(status as ExpertResearchAuditEntry['status'])) return undefined
  const kind = value.kind === 'search' || value.kind === 'url' ? value.kind : undefined
  const searchEngine = typeof value.searchEngine === 'string' && ENGINES.has(value.searchEngine as ExpertResearchSearchEngine)
    ? value.searchEngine as ExpertResearchSearchEngine : undefined
  return { target, status: status as ExpertResearchAuditEntry['status'], ...(kind ? { kind } : {}), ...(searchEngine ? { searchEngine } : {}), ...(text(value.query) ? { query: text(value.query) } : {}), ...(text(value.finalUrl) ? { finalUrl: text(value.finalUrl) } : {}), ...(text(value.detail) ? { detail: text(value.detail) } : {}) }
}

export function recordExpertResearchAudit(
  previous: ExpertResearchCompletionState | undefined,
  input: { agentId: unknown; agentType: unknown; entries: unknown; recordedAt: string },
): ExpertResearchCompletionState {
  const agentId = text(input.agentId)
  const agentType = text(input.agentType)
  if (!agentId || !agentType || !Array.isArray(input.entries)) throw new Error('研究审计缺少 agentId、agentType 或 entries。')
  const entries = input.entries.map(normalizeEntry).filter((entry): entry is ExpertResearchAuditEntry => Boolean(entry)).slice(0, 64)
  if (entries.length === 0) throw new Error('研究审计没有可验证的 Playwright 记录。')
  const record: ExpertResearchAuditRecord = { agentId, agentType, recordedAt: input.recordedAt, entries }
  const audits = [...(previous?.audits ?? []).filter((item) => item.agentId !== agentId), record].slice(-32)
  return { audits, updatedAt: input.recordedAt }
}

export function evaluateExpertResearchCompletion(
  policy: ExpertResearchCompletionPolicy,
  state: ExpertResearchCompletionState | undefined,
): ExpertResearchCompletionEvaluation {
  const audits = (state?.audits ?? []).filter((audit) => policy.trackedAgentTypes.includes(audit.agentType))
  const missing: string[] = []
  if (audits.length < policy.minimumCompletedAgents) missing.push(`仍缺少 ${policy.minimumCompletedAgents - audits.length} 个已回传浏览审计的研究子代理。`)
  for (const [agentType, minimum] of Object.entries(policy.minimumCompletedAgentsByType ?? {})) {
    const completed = audits.filter((audit) => audit.agentType === agentType).length
    if (completed < minimum) missing.push(`仍缺少 ${minimum - completed} 个类型为 ${agentType} 的已回传浏览审计子代理。`)
  }
  const searches = audits.flatMap((audit) => audit.entries.filter((entry) => entry.kind === 'search'))
  const seenEngines = new Set(searches.map((entry) => entry.searchEngine).filter(Boolean))
  const missingEngines = policy.requiredSearchEngines.filter((engine) => !seenEngines.has(engine))
  if (missingEngines.length) missing.push(`未记录以下搜索入口的实际尝试状态：${missingEngines.join('、')}。`)
  const queries = new Set(searches.map((entry) => entry.query?.trim()).filter(Boolean))
  if (queries.size < policy.minimumDistinctSearchQueries) missing.push(`只记录了 ${queries.size} 个不同搜索词；至少需要 ${policy.minimumDistinctSearchQueries} 个，以证明出现跑偏/受限时有改词或补充检索。`)
  const concreteEntries = audits.flatMap((audit) => audit.entries.filter((entry) => entry.kind === 'url' && entry.status === 'opened'))
  const concreteUrls = new Set(concreteEntries.map((entry) => entry.finalUrl ?? entry.target))
  if (concreteUrls.size < policy.minimumOpenedSpecificPublicPages) missing.push(`只实际打开了 ${concreteUrls.size} 个具体公开来源页；至少需要 ${policy.minimumOpenedSpecificPublicPages} 个。`)
  if (policy.minimumDistinctOpenedSourceDomains) {
    const domains = new Set([...concreteUrls].flatMap((value) => {
      try {
        const url = new URL(value)
        return url.protocol === 'https:' || url.protocol === 'http:' ? [url.hostname.toLowerCase().replace(/^www\./, '')] : []
      } catch {
        return []
      }
    }))
    if (domains.size < policy.minimumDistinctOpenedSourceDomains) {
      missing.push(`只实际打开了 ${domains.size} 个独立来源域名；至少需要 ${policy.minimumDistinctOpenedSourceDomains} 个，不能用同一官网的多页冒充多源。`)
    }
  }
  if (policy.requireConcreteSourcePerAgent) {
    const agentsWithoutSource = audits.filter((audit) => !audit.entries.some((entry) => entry.kind === 'url' && entry.status === 'opened'))
    if (agentsWithoutSource.length) missing.push(`以下研究子代理尚未打开具体公开来源页：${agentsWithoutSource.map((audit) => audit.agentId).join('、')}。`)
  }
  return { complete: missing.length === 0, missing }
}

/**
 * Advisory audit coverage for prompts and recovery copy.
 * For allow-with-evidence-gaps packs, an explicit user accept_current_scope
 * remains authoritative even when this returns eligible:false (VPN/CAPTCHA,
 * partial subagents, missing engines). Do not use this result to hide the
 * delivery card or veto a recorded human acceptance.
 */
export function evaluateExpertResearchDeliveryEligibility(
  policy: ExpertResearchCompletionPolicy,
  state: ExpertResearchCompletionState | undefined,
): { eligible: boolean; missing: string[] } {
  const completion = evaluateExpertResearchCompletion(policy, state)
  return { eligible: completion.complete, missing: completion.missing }
}
