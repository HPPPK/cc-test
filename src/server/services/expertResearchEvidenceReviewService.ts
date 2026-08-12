import type { ExpertResearchAuditEntry } from './expertResearchCompletionService.js'

export type ExpertResearchEvidenceReviewPolicy = {
  reviewerAgentType: string
  sourceAgentTypes: string[]
  maxRecords: number
  maxCharactersPerRecord: number
  reviewerEvidenceOnly: boolean
}

export type ExpertResearchEvidenceRecord = {
  agentId: string
  agentType: string
  recordedAt: string
  content: string
  entries: ExpertResearchAuditEntry[]
}

export type ExpertResearchEvidenceState = {
  records: ExpertResearchEvidenceRecord[]
  updatedAt: string
}

type JsonRecord = Record<string, unknown>

const MAX_RECORDS = 16
const MAX_CHARACTERS_PER_RECORD = 48_000
const VALID_STATUSES = new Set<ExpertResearchAuditEntry['status']>([
  'opened',
  'access_limited',
  'failed',
  'pending',
])
const VALID_ENGINES = new Set(['Google', '百度', 'Bing', '360'])

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function positiveInteger(value: unknown, field: string, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    throw new Error(`researchEvidenceReview.${field} 必须是 1–${maximum} 的整数。`)
  }
  return value as number
}

function agentType(value: unknown, field: string): string {
  const normalized = text(value)
  if (!normalized || !/^[a-z][a-z0-9-]{0,95}$/.test(normalized)) {
    throw new Error(`researchEvidenceReview.${field} 必须是有效的子代理类型。`)
  }
  return normalized
}

function agentTypes(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`researchEvidenceReview.${field} 必须是非空子代理类型数组。`)
  }
  return [...new Set(value.map((item) => agentType(item, field)))]
}

function normalizeAuditEntry(value: unknown): ExpertResearchAuditEntry | undefined {
  if (!isRecord(value)) return undefined
  const target = text(value.target)
  const status = text(value.status)
  if (!target || !status || !VALID_STATUSES.has(status as ExpertResearchAuditEntry['status'])) return undefined
  const kind = value.kind === 'search' || value.kind === 'url' ? value.kind : undefined
  const searchEngine = typeof value.searchEngine === 'string' && VALID_ENGINES.has(value.searchEngine)
    ? value.searchEngine as ExpertResearchAuditEntry['searchEngine']
    : undefined
  return {
    target,
    status: status as ExpertResearchAuditEntry['status'],
    ...(kind ? { kind } : {}),
    ...(searchEngine ? { searchEngine } : {}),
    ...(text(value.query) ? { query: text(value.query) } : {}),
    ...(text(value.finalUrl) ? { finalUrl: text(value.finalUrl) } : {}),
    ...(text(value.detail) ? { detail: text(value.detail) } : {}),
  }
}

/**
 * Reads an opt-in ZIP contract for passing bounded upstream research to a
 * designated evidence reviewer. No Expert pack ID is hard-coded here.
 */
export function resolveExpertResearchEvidenceReviewPolicy(
  outputProtocolContent?: string,
): ExpertResearchEvidenceReviewPolicy | undefined {
  if (!outputProtocolContent?.trim()) return undefined
  let document: unknown
  try {
    document = JSON.parse(outputProtocolContent)
  } catch {
    throw new Error('专家输出协议不是有效 JSON，无法读取 researchEvidenceReview 规则。')
  }
  if (!isRecord(document) || document.researchEvidenceReview === undefined) return undefined
  if (!isRecord(document.researchEvidenceReview)) {
    throw new Error('researchEvidenceReview 必须是对象。')
  }
  const raw = document.researchEvidenceReview
  if (raw.reviewerEvidenceOnly !== true) {
    throw new Error('启用 researchEvidenceReview 时 reviewerEvidenceOnly 必须为 true。')
  }
  const reviewerAgentType = agentType(raw.reviewerAgentType, 'reviewerAgentType')
  const sourceAgentTypes = agentTypes(raw.sourceAgentTypes, 'sourceAgentTypes')
  if (sourceAgentTypes.includes(reviewerAgentType)) {
    throw new Error('researchEvidenceReview.sourceAgentTypes 不得包含 reviewerAgentType。')
  }
  return {
    reviewerAgentType,
    sourceAgentTypes,
    maxRecords: positiveInteger(raw.maxRecords, 'maxRecords', MAX_RECORDS),
    maxCharactersPerRecord: positiveInteger(raw.maxCharactersPerRecord, 'maxCharactersPerRecord', MAX_CHARACTERS_PER_RECORD),
    reviewerEvidenceOnly: true,
  }
}

/**
 * Stores only the completed upstream researcher handoff and its browser audit.
 * The reviewer receives it as session-scoped runtime context, never as a new
 * model-callable tool or a file path to discover.
 */
export function recordExpertResearchEvidence(
  previous: ExpertResearchEvidenceState | undefined,
  policy: ExpertResearchEvidenceReviewPolicy,
  input: {
    agentId: unknown
    agentType: unknown
    recordedAt: string
    content: unknown
    entries: unknown
  },
): ExpertResearchEvidenceState {
  const agentId = text(input.agentId)
  const sourceAgentType = text(input.agentType)
  const content = text(input.content)
  if (!agentId || !sourceAgentType || !content || !policy.sourceAgentTypes.includes(sourceAgentType)) {
    return previous ?? { records: [], updatedAt: input.recordedAt }
  }
  if (!Array.isArray(input.entries)) {
    throw new Error('研究证据缺少 entries。')
  }
  const entries = input.entries
    .map(normalizeAuditEntry)
    .filter((entry): entry is ExpertResearchAuditEntry => Boolean(entry))
    .slice(0, 64)
  if (entries.length === 0) {
    throw new Error('研究证据没有可验证的 Playwright 记录。')
  }
  const record: ExpertResearchEvidenceRecord = {
    agentId,
    agentType: sourceAgentType,
    recordedAt: input.recordedAt,
    content: content.slice(0, policy.maxCharactersPerRecord),
    entries,
  }
  const records = [
    ...(previous?.records ?? []).filter((item) => item.agentId !== agentId),
    record,
  ].slice(-policy.maxRecords)
  return { records, updatedAt: input.recordedAt }
}
