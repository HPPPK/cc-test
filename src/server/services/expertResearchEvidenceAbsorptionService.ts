import { REPORT_ABSORPTION_WORK_GUIDANCE, REPORT_EVIDENCE_HANDOFF_GUIDANCE } from '../../services/tools/expertReportHandoffGuidance.js'
import { registeredResearchArtifactPaths, researchArtifactRootPath } from '../../services/tools/expertFileFirstResearchProtocol.js'
import { searchEngineForUrl, isSearchResultsUrl } from '../../utils/searchEngineSurface.js'
import { URL } from 'node:url'
import { normalizeExpertTemplateFillTableRow, type ExpertTemplateFillField } from '../../utils/expertTemplateFill.js'
import type { ExpertResearchAuditEntry, ExpertResearchSearchResultStatus } from './expertResearchCompletionService.js'
import type { ExpertResearchEvidenceRecord, ExpertResearchEvidenceState } from './expertResearchEvidenceReviewService.js'
import type { ExpertResearchArtifactPolicy } from './expertResearchArtifactPolicyService.js'

export type ExpertResearchEvidenceAbsorptionPolicy = {
  required: true
  userInteraction: 'none'
  before: 'template-fill'
  reviewerAgentType: string
  /** Optional internal file-first worker that converts ledgers into compact report-writing clusters. */
  absorberAgentType?: string
  sourceAgentTypes: string[]
  sourceFieldId: string
  /** Legacy compatibility marker. Browser actions are automatically recorded in 06; it no longer requires manual per-page Markdown disposition blocks. */
  requireAllOpenedSourcesDisposition?: true
  requireSourceFieldMapping: true
  /** Optional so older Expert ZIPs keep their existing source-only behavior. */
  requireUsedSourceFieldEvidence?: true
  /** Optional: every business field declared for a used source must retain its own visible claim. */
  requireUsedSourceEvidenceForEveryMappedField?: true
  /** Optional: field evidence must be a report-ready statement rather than a bare price, count, or label. */
  requireReportReadyFieldEvidence?: true
  /**
   * Commercial-report opt-in: every meaningful report field must be explicitly
   * accounted for as sourced evidence, a bounded evidence gap, or a labeled
   * reasoned inference before template rendering.
   */
  requireFieldCoverage?: true
  /** The business fields that must have a fieldCoverage entry when enabled. */
  fieldCoverageFieldIds?: string[]
  /** Allows clearly labeled, non-numeric strategic inference grounded in audited sources. */
  allowReasonedInference?: true
  /** Commercial-report opt-in: render one visible four-part evidence status summary. */
  requireEvidenceStatusSummary?: true
  /** Template field that renders verified facts, limited observations, inference, and gaps. */
  evidenceStatusSummaryFieldId?: string
  /** Commercial-report opt-in: pass the reviewer's compact include/merge allowlist into final drafting. */
  requireReviewerDispositionAbsorption?: true
  /** Optional report fields where a named search engine must retain its SERP trace. */
  searchEvidenceFieldIds?: string[]
  /** Require every final search-source row to retain the concrete browser audit ID that produced it. */
  requireSearchAuditBindings?: true
  /** Require 07 to publish a machine-checkable, field-level detail manifest that the final draft must preserve. */
  requireAuditedDetailClusters?: true
  /** Require each research Markdown to bind its stated browser outcomes to the exact server audit IDs. */
  requireResearchArtifactAuditAssertions?: true
  /**
   * Pack-declared report-writing guidance injected immediately before final
   * structured Write. This keeps field-specific evidence granularity close to
   * the final drafting step without hard-coding one Expert's business rules
   * into the shared server layer.
   */
  fieldGranularityGuidance?: ExpertResearchFieldGranularityGuidance[]
}

export type ExpertResearchFieldGranularityGuidance = {
  fieldId: string
  instruction: string
}

export type ExpertResearchEvidenceReviewerState = {
  reviewer: ExpertResearchEvidenceRecord
  updatedAt: string
}

export type ExpertEvidenceAbsorptionDisposition = 'used' | 'limited' | 'not-applicable'

export type ExpertEvidenceAbsorptionRecord = {
  sourceUrl: string
  disposition: ExpertEvidenceAbsorptionDisposition
  fieldIds: string[]
  note: string
}

export type ExpertEvidenceAbsorptionFieldEvidence = {
  sourceUrl: string
  fieldId: string
  claim: string
}

export type ExpertEvidenceAbsorptionFieldCoverageState = 'evidence' | 'inference' | 'evidence-gap'

/**
 * A report-preparation ledger. It is not rendered itself: it proves that each
 * meaningful report field was deliberately populated, limited, or inferred
 * from same-round audited sources rather than omitted by a short summary.
 */
export type ExpertEvidenceAbsorptionFieldCoverage = {
  fieldId: string
  state: ExpertEvidenceAbsorptionFieldCoverageState
  sourceUrls: string[]
  note: string
}

export type ExpertEvidenceAbsorptionPayload = {
  version: 'cc-jiangxia-evidence-absorption/v1' | 'cc-jiangxia-evidence-absorption/v2'
  records?: ExpertEvidenceAbsorptionRecord[]
  fieldEvidence?: ExpertEvidenceAbsorptionFieldEvidence[]
  fieldCoverage?: ExpertEvidenceAbsorptionFieldCoverage[]
}

export type ExpertResearchDetailClusterState =
  | 'verified'
  | 'bounded-observation'
  | 'access-limited'
  | 'inference'
  | 'evidence-gap'

export type ExpertResearchDetailCluster = {
  id: string
  fieldId: string
  reportText: string
  state: ExpertResearchDetailClusterState
  auditIds: string[]
}

export type ExpertResearchDetailClusterManifest = {
  version: 'cc-jiangxia-report-detail-clusters/v1'
  clusters: ExpertResearchDetailCluster[]
}

type JsonRecord = Record<string, unknown>

const VALID_AGENT_TYPE = /^[a-z][a-z0-9-]{0,95}$/
const VALID_FIELD_ID = /^[A-Z][A-Z0-9_]*$/
const MAX_RECORDS = 64
const MAX_NOTE_LENGTH = 2000
const MAX_CONTENT_LENGTH = 48000
const REVIEWER_DIGEST_MAX_ITEMS = 24
const REVIEWER_DIGEST_MAX_LENGTH = 6000
const MAX_DETAIL_CLUSTERS = 160

const EVIDENCE_STATUS_SECTIONS = [
  { label: 'Verified facts', matcher: /已(?:核验|核实|核查|核|验证)(?:的)?事实/ },
  { label: '有限公开观察', matcher: /有限公开观察/ },
  { label: 'AI inference', matcher: /(?:基于证据的\s*)?[（(]?\s*AI\s*推断\s*[）)]?/i },
  { label: 'Evidence gaps / pending validation', matcher: /证据缺口|待验证/ },
] as const

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseExpertResearchDetailClusterManifest(
  content: string | undefined,
): ExpertResearchDetailClusterManifest | undefined {
  const matches = [...(content ?? '').matchAll(/<!--\s*CC_REPORT_DETAIL_CLUSTERS\s*\r?\n([\s\S]*?)\r?\n\s*-->/g)]
  // Detail clusters are an optional accelerator for reviewers, not a required
  // intermediate serialization protocol. Prefer the first fully valid comment
  // when one is present, otherwise let natural 07 Markdown flow to rendering.
  for (const match of matches) {
    try {
      const raw: unknown = JSON.parse(match[1] ?? '')
      if (!isRecord(raw) || raw.version !== 'cc-jiangxia-report-detail-clusters/v1' || !Array.isArray(raw.clusters) || raw.clusters.length === 0 || raw.clusters.length > MAX_DETAIL_CLUSTERS) continue
      const ids = new Set<string>()
      const clusters = raw.clusters.map((item): ExpertResearchDetailCluster => {
        if (!isRecord(item)) throw new Error('cluster is not an object')
        const id = normalizeAgentType(item.id, 'cluster id is invalid')
        if (ids.has(id)) throw new Error('duplicate cluster id')
        ids.add(id)
        const fieldId = normalizeFieldId(item.fieldId, 'cluster field is invalid')
        const reportText = requiredText(item.reportText, 'cluster text is empty')
        if (reportText.length > MAX_NOTE_LENGTH) throw new Error('cluster text is too long')
        const state = item.state
        if (state !== 'verified' && state !== 'bounded-observation' && state !== 'access-limited' && state !== 'inference' && state !== 'evidence-gap') throw new Error('cluster state is invalid')
        if (!Array.isArray(item.auditIds)) throw new Error('cluster audit IDs are invalid')
        const auditIds = [...new Set(item.auditIds.map((auditId) => requiredText(auditId, 'cluster audit ID is empty')))]
        if (state !== 'evidence-gap' && auditIds.length === 0) throw new Error('cluster evidence needs an audit')
        if (state === 'evidence-gap' && auditIds.length > 0) throw new Error('gap cluster cannot cite an audit')
        return { id, fieldId, reportText, state, auditIds }
      })
      return { version: 'cc-jiangxia-report-detail-clusters/v1', clusters }
    } catch {
      // A malformed optional comment is treated as ordinary Markdown content.
    }
  }
  return undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requiredText(value: unknown, message: string): string {
  const normalized = text(value)
  if (!normalized) throw new Error(message)
  return normalized
}

/**
 * A source URL is often copied out of a Chinese sentence or a Markdown link.
 * Treat only unambiguous copy wrappers / sentence punctuation as presentation,
 * never as part of the audited URL. This is intentionally narrower than a
 * general URL rewriter so query values, paths, and evidence-bearing params
 * remain untouched.
 */
function trimCopiedUrlPresentation(value: string): string {
  let normalized = value.trim()
  if (normalized.startsWith('<') && normalized.endsWith('>')) {
    normalized = normalized.slice(1, -1).trim()
  }
  return normalized.replace(/[。．，、；：！？）》〉】〕〗〙〛」』]+$/u, '')
}

function normalizeHttpUrl(value: unknown): string | undefined {
  const source = text(value)
  if (!source) return undefined
  const raw = trimCopiedUrlPresentation(source)
  if (!raw) return undefined
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    parsed.hash = ''
    // Preserve evidence-bearing search parameters, but remove only well-known
    // tracking/UI parameters so a copied source URL does not fail solely due to
    // locale or campaign decoration (for example Microsoft Store hl/gl).
    const hostname = parsed.hostname.toLowerCase()
    const isRedditHost = hostname === 'reddit.com' || hostname.endsWith('.reddit.com')
    const removable = (key: string) => /^(utm_[a-z0-9_]+|gclid|fbclid|msclkid)$/i.test(key)
      || (hostname === 'apps.microsoft.com' && /^(hl|gl)$/i.test(key))
      // These are transient anti-abuse challenge parameters, not stable Reddit
      // content identifiers. Keeping them in a final source table makes the
      // link non-reusable and leaks a short-lived challenge token.
      || (isRedditHost && /^(js_challenge|jsc_orig_r|solution|token)$/i.test(key))
    const params = [...parsed.searchParams.entries()]
      .filter(([key]) => !removable(key))
      .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
    parsed.search = new URLSearchParams(params).toString()
    return parsed.toString()
  } catch {
    return undefined
  }
}

function normalizeAgentType(value: unknown, message: string): string {
  const normalized = requiredText(value, message)
  if (!VALID_AGENT_TYPE.test(normalized)) throw new Error(message)
  return normalized
}

function normalizeFieldId(value: unknown, message: string): string {
  const normalized = requiredText(value, message)
  if (!VALID_FIELD_ID.test(normalized)) throw new Error(message)
  return normalized
}

function normalizeAgentTypes(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(message)
  return [...new Set(value.map((item) => normalizeAgentType(item, message)))]
}

function normalizeOptionalFieldIds(value: unknown, message: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0) throw new Error(message)
  return [...new Set(value.map((item) => normalizeFieldId(item, message)))]
}

function normalizeFieldGranularityGuidance(value: unknown): ExpertResearchFieldGranularityGuidance[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('postReviewEvidenceAbsorption.fieldGranularityGuidance must be a non-empty array when declared.')
  }
  const seen = new Set<string>()
  return value.map((raw) => {
    if (!isRecord(raw)) {
      throw new Error('Every postReviewEvidenceAbsorption.fieldGranularityGuidance item must be an object.')
    }
    const fieldId = normalizeFieldId(raw.fieldId, 'postReviewEvidenceAbsorption.fieldGranularityGuidance.fieldId must be a template field ID')
    if (seen.has(fieldId)) {
      throw new Error(`postReviewEvidenceAbsorption.fieldGranularityGuidance declares ${fieldId} more than once.`)
    }
    seen.add(fieldId)
    return {
      fieldId,
      instruction: requiredText(raw.instruction, `postReviewEvidenceAbsorption.fieldGranularityGuidance.${fieldId}.instruction must be non-empty.`).slice(0, MAX_NOTE_LENGTH),
    }
  })
}

function normalizeAuditEntries(value: unknown): ExpertResearchAuditEntry[] {
  if (!Array.isArray(value)) throw new Error('Independent review record is missing entries.')
  return value.slice(0, MAX_RECORDS).flatMap((raw) => {
    if (!isRecord(raw)) return []
    const target = text(raw.target)
    if (!target || !['opened', 'access_limited', 'failed', 'pending', 'interrupted'].includes(String(raw.status))) return []
    return [{
      target,
      status: raw.status as ExpertResearchAuditEntry['status'],
      ...(text(raw.auditId) ? { auditId: text(raw.auditId) } : {}),
      ...(raw.kind === 'search' || raw.kind === 'url' ? { kind: raw.kind } : {}),
      ...(typeof raw.searchEngine === 'string' ? { searchEngine: raw.searchEngine as ExpertResearchAuditEntry['searchEngine'] } : {}),
      ...(text(raw.query) ? { query: text(raw.query) } : {}),
      ...(raw.searchResultStatus === 'results_observed' || raw.searchResultStatus === 'entry_opened' || raw.searchResultStatus === 'access_limited' || raw.searchResultStatus === 'failed' || raw.searchResultStatus === 'pending' || raw.searchResultStatus === 'interrupted'
        ? { searchResultStatus: raw.searchResultStatus as ExpertResearchAuditEntry['searchResultStatus'] }
        : {}),
      ...(text(raw.finalUrl) ? { finalUrl: text(raw.finalUrl) } : {}),
      ...(text(raw.detail) ? { detail: text(raw.detail) } : {}),
    }]
  })
}

export function resolveExpertResearchEvidenceAbsorptionPolicy(outputProtocolContent?: string): ExpertResearchEvidenceAbsorptionPolicy | undefined {
  if (!outputProtocolContent?.trim()) return undefined
  let document: unknown
  try {
    document = JSON.parse(outputProtocolContent)
  } catch {
    return undefined
  }
  if (!isRecord(document) || document.postReviewEvidenceAbsorption === undefined) return undefined
  if (!isRecord(document.postReviewEvidenceAbsorption)) throw new Error('postReviewEvidenceAbsorption must be an object.')
  const raw = document.postReviewEvidenceAbsorption
  if (raw.required !== true || raw.userInteraction !== 'none' || raw.before !== 'template-fill') {
    throw new Error('postReviewEvidenceAbsorption must declare required, no user interaction, and template-fill timing.')
  }
  if (raw.requireSourceFieldMapping !== true) {
    throw new Error('postReviewEvidenceAbsorption must require source-field mapping.')
  }
  if (raw.requireAllOpenedSourcesDisposition !== undefined && raw.requireAllOpenedSourcesDisposition !== true) {
    throw new Error('postReviewEvidenceAbsorption.requireAllOpenedSourcesDisposition must be true when declared.')
  }
  if (raw.requireUsedSourceFieldEvidence !== undefined && raw.requireUsedSourceFieldEvidence !== true) {
    throw new Error('postReviewEvidenceAbsorption.requireUsedSourceFieldEvidence must be true when declared.')
  }
  if (raw.requireUsedSourceEvidenceForEveryMappedField !== undefined && raw.requireUsedSourceEvidenceForEveryMappedField !== true) {
    throw new Error('postReviewEvidenceAbsorption.requireUsedSourceEvidenceForEveryMappedField must be true when declared.')
  }
  if (raw.requireReportReadyFieldEvidence !== undefined && raw.requireReportReadyFieldEvidence !== true) {
    throw new Error('postReviewEvidenceAbsorption.requireReportReadyFieldEvidence must be true when declared.')
  }
  if (raw.requireFieldCoverage !== undefined && raw.requireFieldCoverage !== true) {
    throw new Error('postReviewEvidenceAbsorption.requireFieldCoverage must be true when declared.')
  }
  if (raw.allowReasonedInference !== undefined && raw.allowReasonedInference !== true) {
    throw new Error('postReviewEvidenceAbsorption.allowReasonedInference must be true when declared.')
  }
  if (raw.requireEvidenceStatusSummary !== undefined && raw.requireEvidenceStatusSummary !== true) {
    throw new Error('postReviewEvidenceAbsorption.requireEvidenceStatusSummary must be true when declared.')
  }
  if (raw.requireReviewerDispositionAbsorption !== undefined && raw.requireReviewerDispositionAbsorption !== true) {
    throw new Error('postReviewEvidenceAbsorption.requireReviewerDispositionAbsorption must be true when declared.')
  }
  if (raw.requireSearchAuditBindings !== undefined && raw.requireSearchAuditBindings !== true) {
    throw new Error('postReviewEvidenceAbsorption.requireSearchAuditBindings must be true when declared.')
  }
  if (raw.requireAuditedDetailClusters !== undefined && raw.requireAuditedDetailClusters !== true) {
    throw new Error('postReviewEvidenceAbsorption.requireAuditedDetailClusters must be true when declared.')
  }
  if (raw.requireResearchArtifactAuditAssertions !== undefined && raw.requireResearchArtifactAuditAssertions !== true) {
    throw new Error('postReviewEvidenceAbsorption.requireResearchArtifactAuditAssertions must be true when declared.')
  }
  const absorberAgentType = raw.absorberAgentType === undefined
    ? undefined
    : normalizeAgentType(raw.absorberAgentType, 'postReviewEvidenceAbsorption.absorberAgentType must be a valid subagent type')
  const evidenceStatusSummaryFieldId = raw.evidenceStatusSummaryFieldId === undefined
    ? undefined
    : normalizeFieldId(raw.evidenceStatusSummaryFieldId, 'postReviewEvidenceAbsorption.evidenceStatusSummaryFieldId must be a template field ID')
  if (raw.requireEvidenceStatusSummary === true && !evidenceStatusSummaryFieldId) {
    throw new Error('postReviewEvidenceAbsorption must declare evidenceStatusSummaryFieldId when the evidence summary is enabled.')
  }
  const fieldCoverageFieldIds = normalizeOptionalFieldIds(
    raw.fieldCoverageFieldIds,
    'postReviewEvidenceAbsorption.fieldCoverageFieldIds must be a non-empty template field ID array',
  )
  if (raw.requireFieldCoverage === true && !fieldCoverageFieldIds) {
    throw new Error('postReviewEvidenceAbsorption must declare fieldCoverageFieldIds when field coverage is enabled.')
  }
  const searchEvidenceFieldIds = normalizeOptionalFieldIds(
    raw.searchEvidenceFieldIds,
    'postReviewEvidenceAbsorption.searchEvidenceFieldIds must be a non-empty template field ID array',
  )
  const fieldGranularityGuidance = normalizeFieldGranularityGuidance(raw.fieldGranularityGuidance)
  return {
    required: true,
    userInteraction: 'none',
    before: 'template-fill',
    reviewerAgentType: normalizeAgentType(raw.reviewerAgentType, 'postReviewEvidenceAbsorption.reviewerAgentType must be a valid subagent type'),
    ...(absorberAgentType ? { absorberAgentType } : {}),
    sourceAgentTypes: normalizeAgentTypes(raw.sourceAgentTypes, 'postReviewEvidenceAbsorption.sourceAgentTypes must be a non-empty subagent type array'),
    sourceFieldId: normalizeFieldId(raw.sourceFieldId, 'postReviewEvidenceAbsorption.sourceFieldId must be a template field ID'),
    ...(raw.requireAllOpenedSourcesDisposition === true ? { requireAllOpenedSourcesDisposition: true as const } : {}),
    requireSourceFieldMapping: true,
    ...(raw.requireUsedSourceFieldEvidence === true ? { requireUsedSourceFieldEvidence: true as const } : {}),
    ...(raw.requireUsedSourceEvidenceForEveryMappedField === true ? { requireUsedSourceEvidenceForEveryMappedField: true as const } : {}),
    ...(raw.requireReportReadyFieldEvidence === true ? { requireReportReadyFieldEvidence: true as const } : {}),
    ...(raw.requireFieldCoverage === true ? { requireFieldCoverage: true as const } : {}),
    ...(fieldCoverageFieldIds ? { fieldCoverageFieldIds } : {}),
    ...(raw.allowReasonedInference === true ? { allowReasonedInference: true as const } : {}),
    ...(raw.requireEvidenceStatusSummary === true ? { requireEvidenceStatusSummary: true as const } : {}),
    ...(evidenceStatusSummaryFieldId ? { evidenceStatusSummaryFieldId } : {}),
    ...(raw.requireReviewerDispositionAbsorption === true ? { requireReviewerDispositionAbsorption: true as const } : {}),
    ...(raw.requireSearchAuditBindings === true ? { requireSearchAuditBindings: true as const } : {}),
    ...(raw.requireAuditedDetailClusters === true ? { requireAuditedDetailClusters: true as const } : {}),
    ...(raw.requireResearchArtifactAuditAssertions === true ? { requireResearchArtifactAuditAssertions: true as const } : {}),
    ...(searchEvidenceFieldIds ? { searchEvidenceFieldIds } : {}),
    ...(fieldGranularityGuidance ? { fieldGranularityGuidance } : {}),
  }
}

export function recordExpertResearchEvidenceReviewer(
  previous: ExpertResearchEvidenceReviewerState | undefined,
  policy: ExpertResearchEvidenceAbsorptionPolicy,
  input: { agentId: unknown; agentType: unknown; recordedAt: string; content: unknown; artifactPath?: unknown; entries: unknown },
): ExpertResearchEvidenceReviewerState | undefined {
  const agentType = text(input.agentType)
  if (agentType !== policy.reviewerAgentType) return previous
  const recordedAt = requiredText(input.recordedAt, 'Independent review record is missing recordedAt.')
  const agentId = requiredText(input.agentId, 'Independent review record is missing agentId.')
  if (previous?.reviewer) {
    if (previous.reviewer.agentId === agentId) return previous
    throw new Error(`本次会话已经保存独立复核 ${previous.reviewer.agentId}；不得重复派遣新的复核子代理。`)
  }
  return {
    reviewer: {
      agentId,
      agentType,
      recordedAt,
      content: requiredText(input.content, 'Independent review record is missing final review text.').slice(0, MAX_CONTENT_LENGTH),
      ...(text(input.artifactPath) ? { artifactPath: text(input.artifactPath) } : {}),
      // Evidence-only reviewers are intentionally not required to browse again.
      entries: normalizeAuditEntries(input.entries),
    },
    updatedAt: recordedAt,
  }
}

function sameWebsite(target: string, finalUrl: string): boolean {
  try {
    const targetHost = new URL(target).hostname.toLowerCase()
    const finalHost = new URL(finalUrl).hostname.toLowerCase()
    return targetHost === finalHost
      || targetHost.endsWith('.' + finalHost)
      || finalHost.endsWith('.' + targetHost)
  } catch {
    return false
  }
}

/**
 * An opened direct page may normally redirect within the same site. A cross-site
 * target/final pair has no trustworthy redirect chain in the compact audit and
 * can be caused by a shared-context tab mix-up, so it must not become a citation
 * or silently rewrite a model-provided source URL.
 */
function hasIncoherentOpenedDirectFinalUrl(entry: ExpertResearchAuditEntry): boolean {
  if (entry.status !== 'opened' || entry.kind === 'search') return false
  const target = normalizeHttpUrl(entry.target)
  const finalUrl = normalizeHttpUrl(entry.finalUrl)
  return Boolean(target && finalUrl && target !== finalUrl && !sameWebsite(target, finalUrl))
}

function collectOpenedUrls(state: ExpertResearchEvidenceState | undefined, policy: ExpertResearchEvidenceAbsorptionPolicy): string[] {
  const urls = new Set<string>()
  for (const record of state?.records ?? []) {
    if (!policy.sourceAgentTypes.includes(record.agentType)) continue
    for (const entry of record.entries) {
      if (entry.status !== 'opened' || entry.kind === 'search' || hasIncoherentOpenedDirectFinalUrl(entry)) continue
      const url = normalizeHttpUrl(entry.finalUrl ?? entry.target)
      if (url) urls.add(url)
    }
  }
  return [...urls]
}

type FinalSourceRow = {
  url: string
  auditId?: string
  text: string
}

function finalSourceRows(fields: Record<string, unknown>, field: ExpertTemplateFillField | undefined): FinalSourceRow[] {
  if (!field || field.kind !== 'table-rows' || field.urlColumnIndex === undefined) return []
  const rows = fields[field.id]
  if (!Array.isArray(rows)) return []
  return rows.flatMap((rawRow) => {
    const normalized = normalizeExpertTemplateFillTableRow(rawRow, field.columns)
    const cells = normalized?.cells
    if (!cells) return []
    const url = normalizeHttpUrl(cells[field.urlColumnIndex])
    if (!url) return []
    return [{
      url,
      ...(normalized.auditId ? { auditId: normalized.auditId } : {}),
      text: cells.map((cell, index) => index === field.urlColumnIndex ? '' : text(cell)).join(' '),
    }]
  })
}

function buildAutoAppendedSourceRowCells(input: {
  sourceField: Extract<ExpertTemplateFillField, { kind: 'table-rows' }>
  sourceNumber: number
  sourceType: string
  summary: string
  visitDate: string
  urlCell: string
}): string[] {
  const columns = input.sourceField.columns
  const urlIndex = input.sourceField.urlColumnIndex ?? Math.max(0, columns.length - 1)
  const cells = Array.from({ length: columns.length }, () => '')
  if (cells.length === 0) return []
  cells[urlIndex] = input.urlCell

  const fallback = ['[' + input.sourceNumber + ']', input.sourceType, input.summary, '访问于 ' + input.visitDate]
  for (let index = 0; index < columns.length; index += 1) {
    if (index === urlIndex) continue
    const column = String(columns[index] ?? '').trim().toLowerCase()
    if (/^(?:id|编号|序号|#)$/.test(column)) cells[index] = '[' + input.sourceNumber + ']'
    else if (/(?:date|captured|采集|访问日期|日期)/.test(column)) cells[index] = '访问于 ' + input.visitDate
    else if (/(?:summary|摘要|用途|支持|说明|边界)/.test(column)) cells[index] = input.summary
    else if (/(?:type|类型|来源)/.test(column)) cells[index] = input.sourceType
  }

  let fallbackIndex = 0
  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index]) continue
    while (fallbackIndex < fallback.length && cells.includes(fallback[fallbackIndex])) fallbackIndex += 1
    cells[index] = fallback[fallbackIndex] ?? input.summary
    fallbackIndex += 1
  }
  return cells
}


/** Optional ordinary Markdown references in 07 preserve claim -> source identity.
 * A name, video ID or visited homepage alone is never sufficient attribution.
 */
function reportSourceBindings(artifact: string | undefined, reportText: string, canonicalUrls: Map<string, string>, auditUrls: Map<string, string>) {
  type Source = { label: string; url: string; auditId?: string }
  const definitions = new Map<string, Source[]>()
  const ambiguous = new Set<string>()
  const labelKey = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase()
  const addDefinition = (label: string, references: string) => {
    const refs = [...references.matchAll(/(?:https?:\/\/|audit:)[^\s<>"'\x60|\[\]（）【】]+/g)].map((match) => {
      const value = match[0].replace(/[),.;，。；]+$/, '')
      const auditId = auditReferenceId(value)
      const rawUrl = normalizeHttpUrl(value)
      const url = auditId ? auditUrls.get(auditId) ?? '' : rawUrl ? canonicalUrls.get(rawUrl) ?? rawUrl : ''
      return { label: label.trim(), url, ...(auditId ? { auditId } : {}) }
    })
    if (!refs.length) return
    const key = labelKey(label)
    const identity = (sources: Source[]) => [...new Set(sources.map((ref) => ref.url + '\n' + (ref.auditId ?? '')))].sort().join('\n\n')
    const old = definitions.get(key)
    // One explicitly grouped definition may name several pages. Conflicting
    // definitions of the same label are still ambiguous; never guess a winner.
    if (old && identity(old) !== identity(refs)) ambiguous.add(key)
    definitions.set(key, refs)
  }
  const markdown = (artifact ?? '').replace(/\x60{3}[^\n]*\n[\s\S]*?\x60{3}/g, '')
  for (const match of markdown.matchAll(/^[ \t]{0,3}\[([^\]\r\n]+)\]:[ \t]*([^\r\n]+)$/gm)) addDefinition(match[1]!, match[2]!)
  for (const match of markdown.matchAll(/\[([^\]\r\n]+)\]\(((?:https?:\/\/|audit:)[^\s]+?)\)/g)) addDefinition(match[1]!, match[2]!)
  // A source table is ordinary Markdown too. Require an explicit first-cell
  // citation label; prose mentioning a platform or a visited URL is not a map.
  for (const match of markdown.matchAll(/^[ \t]*\|[ \t]*\[([^\]\r\n]+)\][ \t]*\|([^\r\n]+)$/gm)) addDefinition(match[1]!, match[2]!)
  const bindings = new Map<string, Array<Source & { passage: string }>>()
  for (const line of reportText.split(/\r?\n/)) {
    for (const match of line.matchAll(/\[([^\]\r\n]+)\](?!\s*[:(])/g)) {
      const key = labelKey(match[1]!)
      const definition = definitions.get(key)
      if (!definition || ambiguous.has(key)) continue
      const supported = definition.filter((ref) => canonicalUrls.has(ref.url))
      if (supported.length) bindings.set(key, supported.map((ref) => ({ ...ref, label: match[1]!.trim(), passage: line.trim() })))
    }
  }
  return bindings
}

/**
 * Restores report-used audited URLs to the source appendix, not the visit inventory.
 * Existing model-authored rows keep their wording; newly appended rows are
 * carry the actual report passage that used that URL. Unused visits stay in 06.
 * Limited, failed, pending, and incoherent cross-site results stay in 06 only.
 */
export function mergeAuditedOpenedSourcesIntoSourceRows(input: {
  policy: ExpertResearchEvidenceAbsorptionPolicy
  researchEvidence: ExpertResearchEvidenceState | undefined
  fields: Record<string, unknown>
  templateFields: ExpertTemplateFillField[]
  absorptionArtifactContent?: string
}): { fields: Record<string, unknown>; appended: number } {
  const sourceField = input.templateFields.find((field) => field.id === input.policy.sourceFieldId)
  if (!sourceField || sourceField.kind !== 'table-rows' || sourceField.urlColumnIndex === undefined) {
    return { fields: input.fields, appended: 0 }
  }
  let rawRows = Array.isArray(input.fields[sourceField.id]) ? [...input.fields[sourceField.id] as unknown[]] : []
  const canonicalUrls = citableAuditedCanonicalUrls(input.researchEvidence, input.policy)
  const reportText = Object.entries(input.fields).filter(([key]) => key !== sourceField.id).map(([, value]) => textFromField(value)).join('\n')
  const auditUrls = citableAuditedUrlById(input.researchEvidence, input.policy)
  const bindings = reportSourceBindings(input.absorptionArtifactContent, reportText, canonicalUrls, auditUrls)
  let repaired = false
  // An exact source ID in the used-material mapping can repair a copied URL.
  // Do not infer attribution from similar website names or all visited URLs.
  rawRows = rawRows.map((rawRow) => {
    const normalized = normalizeExpertTemplateFillTableRow(rawRow, sourceField.columns)
    // An explicit audit selects one browser observation; never replace it with
    // a URL-only 07 label, which cannot distinguish repeated search attempts.
    if (!normalized || normalized.auditId || auditReferenceId(normalized.cells[sourceField.urlColumnIndex!])) return rawRow
    const groups = [...String(normalized.cells[0] ?? '').matchAll(/\[([^\]]+)\]/g)]
      .map((match) => bindings.get(match[1]!.trim().replace(/\s+/g, ' ').toLowerCase()))
    if (!groups.length || groups.some((group) => !group?.length)) return rawRow
    const refs = groups.flatMap((group) => group ?? [])
    if (new Set(refs.map((ref) => ref.url)).size !== 1) return rawRow
    if (new Set(refs.map((ref) => ref!.auditId)).size !== 1) return rawRow
    const url = refs[0]!.url
    const auditId = refs[0]!.auditId
    if (!auditId && normalizeHttpUrl(normalized.cells[sourceField.urlColumnIndex!]) === url) return rawRow
    const cells = [...normalized.cells]
    cells[sourceField.urlColumnIndex!] = auditId ? 'audit:' + auditId : url
    repaired = true
    return auditId ? { value: cells, auditId } : cells
  })
  const existingAuditIds = new Set<string>()
  const existing = new Set([...sourceRowUrls({ ...input.fields, [sourceField.id]: rawRows }, sourceField)].map((url) => canonicalUrls.get(url) ?? url))
  for (const rawRow of rawRows) {
    const row = normalizeExpertTemplateFillTableRow(rawRow, sourceField.columns)
    const auditId = row && (auditReferenceId(row.cells[sourceField.urlColumnIndex]) ?? row.auditId)
    const url = auditId ? auditUrls.get(auditId) : undefined
    if (url) existing.add(url)
    if (auditId) existingAuditIds.add(auditId)
  }
  let nextNumber = rawRows.reduce<number>((maximum, rawRow) => {
    const normalized = normalizeExpertTemplateFillTableRow(rawRow, sourceField.columns)
    const match = String(normalized?.cells[0] ?? '').match(/\d+/)
    return Math.max(maximum, match ? Number(match[0]) : 0)
  }, 0) + 1
  let appended = 0

  for (const record of input.researchEvidence?.records ?? []) {
    if (!input.policy.sourceAgentTypes.includes(record.agentType)) continue
    const visitDate = Number.isFinite(Date.parse(record.recordedAt)) ? record.recordedAt.slice(0, 10) : '本轮访问'
    for (const entry of record.entries) {
      const isObservedSearch = entry.kind === 'search'
        && entry.status === 'opened'
        && entry.searchResultStatus === 'results_observed'
      const isOpenedPage = entry.kind !== 'search'
        && entry.status === 'opened'
        && !hasIncoherentOpenedDirectFinalUrl(entry)
      if (!isObservedSearch && !isOpenedPage) continue
      const url = normalizeHttpUrl(entry.finalUrl ?? entry.target)
      if (!url) continue
      // The audit inventory lives in 06. Only restore a source actually used in
      // report prose; visiting a catalog homepage does not make it a citation.
      const aliases = new Set([url, normalizeHttpUrl(entry.target)].filter(Boolean))
      const matchingBindings = [...bindings.values()].flat().filter((binding) => aliases.has(binding.url) && (!binding.auditId || binding.auditId === entry.auditId))
      const hasExactBinding = matchingBindings.some((binding) => binding.auditId === entry.auditId && binding.auditId !== undefined)
      if (existing.has(url) && (!hasExactBinding || (entry.auditId && existingAuditIds.has(entry.auditId)))) continue
      const supportingLine = matchingBindings[0]?.passage ?? reportText.split(/\r?\n/).find((line) =>
        [...line.matchAll(/https?:\/\/[^\s<>"'\x60\[\]（）【】]+/g)].some((match) =>
          aliases.has(normalizeHttpUrl(match[0].replace(/[),.;，。；]+$/, '')))))?.trim()
      if (!supportingLine) continue

      const host = (() => {
        try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '公开网页' }
      })()
      const sourceType = isObservedSearch
        ? (entry.searchEngine ?? '搜索引擎') + ' 关键词结果页'
        : host + ' 公开页面'
      const summary = supportingLine.slice(0, 800)
      const urlCell = (isObservedSearch || hasExactBinding) && entry.auditId ? 'audit:' + entry.auditId : url
      const cells = buildAutoAppendedSourceRowCells({ sourceField, sourceNumber: nextNumber, sourceType, summary, visitDate, urlCell })
      if (matchingBindings.length) cells[0] = matchingBindings.map((binding) => '[' + binding.label + ']').join('、')
      const row = {
        value: cells,
        ...(entry.auditId ? { auditId: entry.auditId } : {}),
      }
      rawRows.push(row)
      existing.add(url)
      if (entry.auditId) existingAuditIds.add(entry.auditId)
      nextNumber += 1
      appended += 1
    }
  }

  // Consolidate direct-page duplicates, retaining every cited ID and description.
  // Search observations can differ per audit even at the same URL: do not merge them.
  const directUrls = new Set(collectOpenedUrls(input.researchEvidence, input.policy))
  const rowsByUrl = new Map<string, { cells: unknown[]; auditId?: string }>()
  const deduplicated: unknown[] = []
  for (const rawRow of rawRows) {
    const normalized = normalizeExpertTemplateFillTableRow(rawRow, sourceField.columns)
    const rawUrl = normalized && normalizeHttpUrl(normalized.cells[sourceField.urlColumnIndex])
    const url = rawUrl ? canonicalUrls.get(rawUrl) ?? rawUrl : undefined
    if (!normalized || !url || !directUrls.has(url) || normalized.cells.some((cell) => typeof cell !== 'string')) {
      deduplicated.push(rawRow)
      continue
    }
    const cells = [...normalized.cells]
    const aliases = [...bindings.values()].flat().filter((binding) => binding.url === url).map((binding) => '[' + binding.label + ']')
    for (const alias of aliases) {
      if (!String(cells[0]).includes(alias)) { cells[0] = String(cells[0]) + '、' + alias; repaired = true }
    }
    const previous = rowsByUrl.get(url)
    if (previous) {
      for (let index = 0; index < cells.length; index++) {
        if (index === sourceField.urlColumnIndex) continue
        const pieces = [...new Set([...String(previous.cells[index]).split('\n'), String(cells[index])])]
        previous.cells[index] = pieces.join('\n')
      }
      repaired = true
      continue
    }
    const value = { cells, ...(normalized.auditId ? { auditId: normalized.auditId } : {}) }
    rowsByUrl.set(url, value)
    deduplicated.push({ value: cells, ...(normalized.auditId ? { auditId: normalized.auditId } : {}) })
  }
  if (repaired) rawRows = deduplicated
  return appended || repaired
    ? { fields: { ...input.fields, [sourceField.id]: rawRows }, appended }
    : { fields: input.fields, appended: 0 }
}

function sourceRowUrls(fields: Record<string, unknown>, field: ExpertTemplateFillField | undefined): Set<string> {
  return new Set(finalSourceRows(fields, field).map((row) => row.url))
}

function backgroundSourceRowUrls(fields: Record<string, unknown>, field: ExpertTemplateFillField | undefined): Set<string> {
  return new Set(finalSourceRows(fields, field)
    .filter((row) => /背景路线核验|background(?:-| )route verification/i.test(row.text))
    .map((row) => row.url))
}

/**
 * SOURCE_ROWS is a citation table, not a raw browser ledger. Direct pages are
 * citable only after a successful open. Search audits retain their existing
 * limited-evidence behavior so an explicitly limited, engine-identified SERP
 * can document that exact limitation. Failed direct pages (for example a 404
 * purchase URL) remain internal audit notes instead of report sources.
 */
function citableAuditedUrlById(
  state: ExpertResearchEvidenceState | undefined,
  policy: ExpertResearchEvidenceAbsorptionPolicy,
): Map<string, string> {
  const citableUrls = collectCitableFinalReportSourceUrls(state, policy)
  const urls = new Map<string, string>()
  for (const record of state?.records ?? []) {
    if (!policy.sourceAgentTypes.includes(record.agentType)) continue
    for (const entry of record.entries) {
      if (!entry.auditId || entry.status !== 'opened' || hasIncoherentOpenedDirectFinalUrl(entry)) continue
      if (entry.kind === 'search' && entry.searchResultStatus !== 'results_observed') continue
      const url = normalizeHttpUrl(entry.finalUrl ?? entry.target)
      if (url && citableUrls.has(url)) urls.set(entry.auditId, url)
    }
  }
  return urls
}

/**
 * Direct URLs are allowed in SOURCE_ROWS for compatibility, but the final
 * report must use the same canonical representation persisted in this round's
 * citable browser ledger. Do not consult reviewer prose here: it is
 * explanatory text, not a source-of-truth URL registry.
 */
function citableAuditedCanonicalUrls(
  state: ExpertResearchEvidenceState | undefined,
  policy: ExpertResearchEvidenceAbsorptionPolicy,
): Map<string, string> {
  const citableUrls = collectCitableFinalReportSourceUrls(state, policy)
  const urls = new Map<string, string>()
  for (const record of state?.records ?? []) {
    if (!policy.sourceAgentTypes.includes(record.agentType)) continue
    for (const entry of record.entries) {
      if (hasIncoherentOpenedDirectFinalUrl(entry)) continue
      const canonical = normalizeHttpUrl(entry.finalUrl ?? entry.target)
      if (!canonical || !citableUrls.has(canonical)) continue
      urls.set(canonical, canonical)

      // A researcher may open a requested URL that redirects (for example a
      // product feature page to the product home page). The final report must
      // cite the browser's actual final URL, but a copied target is safe to
      // repair when this same audit was successfully opened.
      const target = normalizeHttpUrl(entry.target)
      if (entry.status === 'opened' && target && target !== canonical) {
        urls.set(target, canonical)
      }
    }
  }
  return urls
}

function auditReferenceId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = value.trim().match(/^audit:(?:\/\/)?([A-Za-z0-9:_-]+)$/)
  return match?.[1]
}

/**
 * Search providers frequently append signed or per-request parameters. The model may
 * safely cite the stable search URL it saw in a ledger; the server resolves it to one
 * unambiguous same-session audit and retains the exact final URL plus audit id.
 */
function stableSearchUrlKey(value: string): string | undefined {
  try {
    const url = new URL(value)
    const params = [...url.searchParams.entries()]
      .filter(([key]) => !/^(?:__|p_|sei$|ved$|ei$|oq$|aqs$|source$|form$|sp$|cvid$|qs$|sc$|sk$|sid$|sxsrf$|iflsig$|uule$|gws_rd$|utm_|gclid$|fbclid$)/i.test(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
    return url.protocol.toLowerCase() + '//' + url.hostname.toLowerCase() + (url.pathname.replace(/\/+$/, '') || '/') + '?' + new URLSearchParams(params).toString()
  } catch {
    return undefined
  }
}

/**
 * Lets the model cite an injected browser audit by stable id instead of
 * retyping a long URL. The server replaces only the URL cell before template
 * rendering; unrecognised refs are rejected rather than becoming new sources.
 */
export function resolveExpertResearchAuditSourceReferences(input: {
  policy: ExpertResearchEvidenceAbsorptionPolicy
  researchEvidence: ExpertResearchEvidenceState | undefined
  fields: Record<string, unknown>
  templateFields: ExpertTemplateFillField[]
}): { fields: Record<string, unknown>; errors: string[]; repairedSourceRows: number } {
  const sourceField = input.templateFields.find((field) => field.id === input.policy.sourceFieldId)
  if (!sourceField || sourceField.kind !== 'table-rows' || sourceField.urlColumnIndex === undefined) {
    return { fields: input.fields, errors: [], repairedSourceRows: 0 }
  }
  const sourceRows = input.fields[sourceField.id]
  if (!Array.isArray(sourceRows)) return { fields: input.fields, errors: [], repairedSourceRows: 0 }
  const urls = citableAuditedUrlById(input.researchEvidence, input.policy)
  const citableAuditedUrls = citableAuditedCanonicalUrls(input.researchEvidence, input.policy)
  const searchAuditsByStableUrl = new Map<string, SearchAudit[]>()
  for (const audit of collectSearchAudits(input.researchEvidence, input.policy)) {
    if (!audit.auditId) continue
    const key = stableSearchUrlKey(audit.sourceUrl)
    if (!key) continue
    const entries = searchAuditsByStableUrl.get(key) ?? []
    entries.push(audit)
    searchAuditsByStableUrl.set(key, entries)
  }
  const errors: string[] = []
  let changed = false
  let repairedSourceRows = 0
  const rows = sourceRows.map((rawRow) => {
    const normalized = normalizeExpertTemplateFillTableRow(rawRow, sourceField.columns)
    const row = normalized?.cells
    if (!row) return rawRow
    const urlIndex = sourceField.urlColumnIndex!
    const referenceAuditId = auditReferenceId(row[urlIndex])
    const persistedAuditId = normalized.auditId
    if (referenceAuditId && persistedAuditId && referenceAuditId !== persistedAuditId) {
      errors.push('SOURCE_ROWS contains conflicting audit IDs: ' + referenceAuditId + ' and ' + persistedAuditId)
      return rawRow
    }
    const auditId = referenceAuditId ?? persistedAuditId
    if (auditId) {
      const url = urls.get(auditId)
      if (!url) {
        errors.push('SOURCE_ROWS references audit ID with no usable final URL: ' + auditId)
        return rawRow
      }
      const cells = [...row]
      cells[urlIndex] = url
      changed = true
      repairedSourceRows += 1
      return { value: cells, auditId }
    }

    // A copied stable search URL may deliberately omit provider-generated
    // signatures or tracking parameters. Bind it to exactly one real audit when
    // possible; ambiguous repeats still require the explicit audit:<id> form.
    const normalizedUrl = normalizeHttpUrl(row[urlIndex])
    const incoherentAudit = normalizedUrl
      ? (input.researchEvidence?.records ?? []).flatMap((record) => record.entries).find((entry) =>
          hasIncoherentOpenedDirectFinalUrl(entry) && normalizeHttpUrl(entry.target) === normalizedUrl,
        )
      : undefined
    if (incoherentAudit) {
      errors.push('SOURCE_ROWS cannot use ' + normalizedUrl + ' because its browser audit ended on an unrelated site (' + normalizeHttpUrl(incoherentAudit.finalUrl) + '). This audit is isolated; omit the row or obtain a new direct open.')
      return rawRow
    }
    const searchKey = normalizedUrl ? stableSearchUrlKey(normalizedUrl) : undefined
    const matchingSearchAudits = searchKey ? searchAuditsByStableUrl.get(searchKey) ?? [] : []
    if (matchingSearchAudits.length === 1 && matchingSearchAudits[0]?.auditId) {
      const audit = matchingSearchAudits[0]
      const cells = [...row]
      cells[urlIndex] = audit.sourceUrl
      changed = true
      repairedSourceRows += 1
      return { value: cells, auditId: audit.auditId }
    }

    // Direct source URLs are rendered back into the final report too. First
    // remove harmless copy punctuation, then rebind the cell to the exact URL.
    const canonicalUrl = normalizedUrl ? citableAuditedUrls.get(normalizedUrl) ?? normalizedUrl : undefined
    if (!canonicalUrl || canonicalUrl === row[urlIndex]) return rawRow
    const cells = [...row]
    cells[urlIndex] = canonicalUrl
    changed = true
    repairedSourceRows += 1
    return Array.isArray(rawRow)
      ? cells
      : { value: cells, ...(normalized.auditId ? { auditId: normalized.auditId } : {}) }
  })
  return changed
    ? { fields: { ...input.fields, [sourceField.id]: rows }, errors, repairedSourceRows }
    : { fields: input.fields, errors, repairedSourceRows }
}

type SearchAudit = {
  auditId?: string
  sourceUrl: string
  engine: string
  status: ExpertResearchAuditEntry['status']
  resultStatus: ExpertResearchSearchResultStatus
}

function collectCitableFinalReportSourceUrls(
  state: ExpertResearchEvidenceState | undefined,
  policy: ExpertResearchEvidenceAbsorptionPolicy,
): Set<string> {
  const urls = new Set(collectOpenedUrls(state, policy))
  for (const audit of collectSearchAudits(state, policy)) urls.add(audit.sourceUrl)
  return urls
}

function collectSearchAudits(
  state: ExpertResearchEvidenceState | undefined,
  policy: ExpertResearchEvidenceAbsorptionPolicy,
): SearchAudit[] {
  const audits = new Map<string, SearchAudit>()
  for (const record of state?.records ?? []) {
    if (!policy.sourceAgentTypes.includes(record.agentType)) continue
    for (const entry of record.entries) {
      if (entry.kind !== 'search' || !entry.searchEngine) continue
      const sourceUrl = normalizeHttpUrl(entry.finalUrl ?? entry.target)
      if (!sourceUrl || searchEngineForUrl(sourceUrl) !== entry.searchEngine) continue
      const value: SearchAudit = {
        ...(entry.auditId ? { auditId: entry.auditId } : {}),
        sourceUrl,
        engine: entry.searchEngine,
        status: entry.status,
        resultStatus: entry.searchResultStatus === 'results_observed' && !isSearchResultsUrl(sourceUrl, entry.searchEngine)
          ? 'entry_opened' : entry.searchResultStatus ?? (entry.status === 'opened' ? 'entry_opened' : entry.status),
      }
      // Audit IDs are the evidence identity. The same final URL can legitimately
      // appear in two attempts with different outcomes, so URL-only de-duplication
      // would let a later limited attempt overwrite an earlier observed SERP.
      audits.set(value.auditId ? `audit:${value.auditId}` : `${value.engine}\u0000${value.sourceUrl}`, value)
    }
  }
  return [...audits.values()]
}

function textFromField(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textFromField).join('\n')
  if (isRecord(value)) return Object.values(value).map(textFromField).join('\n')
  return ''
}

function searchEvidenceText(
  fields: Record<string, unknown>,
  policy: ExpertResearchEvidenceAbsorptionPolicy,
): string {
  return (policy.searchEvidenceFieldIds ?? []).map((fieldId) => textFromField(fields[fieldId])).join('\n')
}

function mentionedSearchEngines(
  fields: Record<string, unknown>,
  policy: ExpertResearchEvidenceAbsorptionPolicy,
): string[] {
  const body = searchEvidenceText(fields, policy)
  return ['Google', '百度', 'Bing', '360'].filter((engine) => body.includes(engine))
}

function joinErrors(errors: string[]): string | null {
  return errors.length ? [...new Set(errors)].join('；') : null
}

export type ExpertResearchEvidenceAbsorptionDispositionState = {
  sourceUrl: string
  disposition: ExpertEvidenceAbsorptionDisposition
}

/**
 * Derives every audited URL disposition from persisted browser audits and the
 * final source table. This intentionally removes the need for the model to
 * hand-copy a record for every opened URL before an HTML report can render.
 */
export function deriveExpertResearchEvidenceAbsorptionDispositions(input: {
  policy: ExpertResearchEvidenceAbsorptionPolicy
  researchEvidence: ExpertResearchEvidenceState | undefined
  sourceUrls: Set<string>
  backgroundSourceUrls?: Set<string>
}): ExpertResearchEvidenceAbsorptionDispositionState[] {
  const dispositions = new Map<string, ExpertEvidenceAbsorptionDisposition>()
  for (const sourceUrl of collectOpenedUrls(input.researchEvidence, input.policy)) {
    dispositions.set(sourceUrl, input.sourceUrls.has(sourceUrl) && !input.backgroundSourceUrls?.has(sourceUrl) ? 'used' : 'not-applicable')
  }
  for (const audit of collectSearchAudits(input.researchEvidence, input.policy)) {
    // A cited access-limited SERP remains a bounded limitation, not evidence of
    // a successful result. Uncited audits are still explicitly disposed by the
    // server as not applicable to the final report.
    const disposition = input.sourceUrls.has(audit.sourceUrl) && !input.backgroundSourceUrls?.has(audit.sourceUrl)
      ? (audit.resultStatus === 'results_observed' ? 'used' : 'limited')
      : 'not-applicable'
    dispositions.set(audit.sourceUrl, disposition)
  }
  return [...dispositions.entries()].map(([sourceUrl, disposition]) => ({ sourceUrl, disposition }))
}

type NormalizedFieldCoverage = {
  fieldId: string
  state: ExpertEvidenceAbsorptionFieldCoverageState
  sourceUrls: string[]
  note: string
}

function normalizeFieldCoverage(value: unknown): NormalizedFieldCoverage[] | undefined {
  if (!isRecord(value) || value.fieldCoverage === undefined) return undefined
  if (!Array.isArray(value.fieldCoverage)) throw new Error('evidenceAbsorption.fieldCoverage must be an array.')
  const seen = new Set<string>()
  return value.fieldCoverage.map((raw) => {
    if (!isRecord(raw)) throw new Error('Every evidenceAbsorption.fieldCoverage item must be an object.')
    const fieldId = normalizeFieldId(raw.fieldId, 'evidenceAbsorption.fieldCoverage.fieldId is invalid.')
    if (seen.has(fieldId)) throw new Error(`evidenceAbsorption.fieldCoverage declares ${fieldId} more than once.`)
    seen.add(fieldId)
    const state = raw.state
    if (state !== 'evidence' && state !== 'inference' && state !== 'evidence-gap') {
      throw new Error(`evidenceAbsorption.fieldCoverage.${fieldId}.state must be evidence, inference, or evidence-gap.`)
    }
    const sourceUrls = raw.sourceUrls === undefined
      ? []
      : Array.isArray(raw.sourceUrls)
        ? [...new Set(raw.sourceUrls.map((sourceUrl) => normalizeHttpUrl(sourceUrl)).filter((sourceUrl): sourceUrl is string => Boolean(sourceUrl)))]
        : (() => { throw new Error(`evidenceAbsorption.fieldCoverage.${fieldId}.sourceUrls 必须是数组。`) })()
    return {
      fieldId,
      state,
      sourceUrls,
      note: requiredText(raw.note, `evidenceAbsorption.fieldCoverage.${fieldId}.note 不能为空。`),
    }
  })
}

function isLabeledReasonedInference(value: string): boolean {
  return EVIDENCE_STATUS_SECTIONS[2].matcher.test(value)
}

function isVisibleEvidenceGap(value: string): boolean {
  return /证据缺口|待验证|未取得|无法确认|未公开确认/.test(value)
}

function statusSectionBody(summary: string, sectionIndex: number): string | undefined {
  const section = EVIDENCE_STATUS_SECTIONS[sectionIndex]
  const match = summary.match(section.matcher)
  if (!match || match.index === undefined) return undefined
  const start = match.index + match[0].length
  const end = EVIDENCE_STATUS_SECTIONS
    .map((candidate, index) => index === sectionIndex ? -1 : summary.slice(start).search(candidate.matcher))
    .filter((offset) => offset >= 0)
    .map((offset) => start + offset)
    .sort((left, right) => left - right)[0] ?? summary.length
  return summary.slice(start, end).replace(/^[：:、\-\s]+/, '').trim()
}

function compactReviewerAllowedEvidenceDigest(content: string): string[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const allowed = /\b(?:verified|partially[_ -]?verified|include|merge)\b|已核验|部分核验|(?:建议|处理)?[：:]?(?:保留|纳入|合并)/i
  const excluded = /\b(?:rejected|internal[_ -]?only)\b|(?:建议|处理)?[：:]?(?:拒绝|不纳入|排除)|(?:仅)?内部使用/i
  const result: string[] = []
  let length = 0
  for (const line of lines) {
    if (!allowed.test(line) || excluded.test(line)) continue
    const clipped = line.slice(0, 900)
    if (length + clipped.length > REVIEWER_DIGEST_MAX_LENGTH) break
    result.push(clipped)
    length += clipped.length
    if (result.length >= REVIEWER_DIGEST_MAX_ITEMS) break
  }
  return result
}

function canonicalReviewerSourceUrl(value: string, citableAuditedUrls: Map<string, string>): string | undefined {
  // A reviewer prose line is not the URL registry. It sometimes contains a
  // display abbreviation such as `...?q=pricing...`; accepting that as a
  // final source would make an unverifiable or ambiguous link mandatory.
  if (value.includes('...')) return undefined
  const normalized = normalizeHttpUrl(value)
  return normalized ? citableAuditedUrls.get(normalized) : undefined
}

function reconcileReviewerAllowedEvidenceDigest(content: string, citableAuditedUrls: Map<string, string>): string[] {
  return compactReviewerAllowedEvidenceDigest(content).map((line) => line.replace(
    /https?:\/\/[^\s<>"'`，、；：！？（）()\[\]{}]+/gu,
    (copiedUrl) => canonicalReviewerSourceUrl(copiedUrl, citableAuditedUrls)
      ?? '（该 URL 仅是本轮内部审计记录，不能作为最终报告引用来源；请以 canonical citable source URL allowlist 为准）',
  ))
}

function reviewerAllowedSourceUrls(content: string, citableAuditedUrls: Map<string, string>): string[] {
  return [...new Set(compactReviewerAllowedEvidenceDigest(content)
    .flatMap((line) => line.match(/https?:\/\/[^\s<>"'`，、；：！？（）()\[\]{}]+/gu) ?? [])
    .map((url) => canonicalReviewerSourceUrl(url, citableAuditedUrls))
    .filter((url): url is string => Boolean(url)))]
}

function validateEvidenceStatusSummary(input: {
  policy: ExpertResearchEvidenceAbsorptionPolicy
  fields: Record<string, unknown>
  templateFieldIds: Set<string>
  serverDispositions: ExpertResearchEvidenceAbsorptionDispositionState[]
  sourceUrls: Set<string>
}): string[] {
  const { policy, fields, templateFieldIds, serverDispositions, sourceUrls } = input
  if (!policy.requireEvidenceStatusSummary) return []
  const fieldId = policy.evidenceStatusSummaryFieldId
  if (!fieldId || !templateFieldIds.has(fieldId)) {
    return ['Evidence status summary declares a missing template field: ' + (fieldId ?? 'not declared')]
  }
  const summary = textFromField(fields[fieldId]).trim()
  if (!summary) return ['Field ' + fieldId + ' must clearly state verified facts, limited public observations, AI inference, and evidence gaps / pending validation.']
  const errors: string[] = []
  for (let index = 0; index < EVIDENCE_STATUS_SECTIONS.length; index += 1) {
    const section = EVIDENCE_STATUS_SECTIONS[index]
    const body = statusSectionBody(summary, index)
    if (!body) errors.push('Field ' + fieldId + ' is missing a concrete section for ' + section.label + '; if this round found no material, state that truthfully.')
  }
  const verifiedBody = statusSectionBody(summary, 0) ?? ''
  const hasUsedSource = serverDispositions.some((item) => item.disposition === 'used')
  if (hasUsedSource && /^(?:本轮)?(?:无|未|暂无|尚未|没有)/.test(verifiedBody)) {
    errors.push('This round has used sources; field ' + fieldId + ' must not label all verified facts as pending or unavailable.')
  }
  if (hasUsedSource && sourceUrls.size === 0) {
    errors.push('Field ' + fieldId + ' claims verified facts but ' + policy.sourceFieldId + ' has no traceable source.')
  }
  return errors
}

function validateReviewerAllowedSourceRetention(input: {
  policy: ExpertResearchEvidenceAbsorptionPolicy
  researchEvidence: ExpertResearchEvidenceState | undefined
  reviewerState: ExpertResearchEvidenceReviewerState | undefined
  sourceUrls: Set<string>
}): string[] {
  if (!input.policy.requireReviewerDispositionAbsorption) return []
  const reviewer = input.reviewerState?.reviewer
  if (!reviewer) return []
  const citableAuditedUrls = citableAuditedCanonicalUrls(input.researchEvidence, input.policy)
  return reviewerAllowedSourceUrls(reviewer.content, citableAuditedUrls)
    .filter((sourceUrl) => !input.sourceUrls.has(sourceUrl))
    .map((sourceUrl) => 'Reviewer include/merge source must remain in ' + input.policy.sourceFieldId + '：' + sourceUrl)
}

/**
 * The ledger remains mandatory, but it is server-derived. Requiring the model
 * to hand-author one mechanical fieldCoverage object for every report field was
 * causing complete researched drafts to be discarded during repair loops.
 */
function deriveFieldCoverageFromFinalFields(input: {
  policy: ExpertResearchEvidenceAbsorptionPolicy
  fields: Record<string, unknown>
  sourceUrls: Set<string>
}): NormalizedFieldCoverage[] {
  return (input.policy.fieldCoverageFieldIds ?? []).map((fieldId) => {
    const visibleText = textFromField(input.fields[fieldId]).trim()
    const state: ExpertEvidenceAbsorptionFieldCoverageState = isVisibleEvidenceGap(visibleText)
      ? 'evidence-gap'
      : isLabeledReasonedInference(visibleText)
        ? 'inference'
        : 'evidence'
    return {
      fieldId,
      state,
      // The source table is the model's deliberate report-level source
      // selection. Server validation below still rejects any URL that was not
      // actually audited this session.
      sourceUrls: state === 'evidence-gap' ? [] : [...input.sourceUrls],
      note: 'Server-derived from final report field and audited source table.',
    }
  })
}

function validateFieldCoverage(input: {
  policy: ExpertResearchEvidenceAbsorptionPolicy
  evidenceAbsorption: unknown
  fields: Record<string, unknown>
  templateFieldIds: Set<string>
  sourceUrls: Set<string>
  serverDispositions: ExpertResearchEvidenceAbsorptionDispositionState[]
}): string[] {
  const { policy, evidenceAbsorption, fields, templateFieldIds, sourceUrls, serverDispositions } = input
  if (!policy.requireFieldCoverage) return []
  const errors: string[] = []
  let coverage: NormalizedFieldCoverage[] | undefined
  try {
    coverage = normalizeFieldCoverage(evidenceAbsorption)
  } catch (error) {
    return [error instanceof Error ? error.message : 'evidenceAbsorption.fieldCoverage is invalid.']
  }
  if (!coverage) {
    coverage = deriveFieldCoverageFromFinalFields({ policy, fields, sourceUrls })
  }

  const byFieldId = new Map(coverage.map((entry) => [entry.fieldId, entry]))
  for (const fieldId of policy.fieldCoverageFieldIds ?? []) {
    if (!templateFieldIds.has(fieldId)) {
      errors.push(`字段吸收覆盖声明了不存在的模板字段：${fieldId}`)
      continue
    }
    const entry = byFieldId.get(fieldId)
    if (!entry) {
      errors.push(`Post-review evidence absorption does not explain how field ${fieldId} is handled; use evidence, inference, or evidence-gap.`)
      continue
    }
    const visibleText = textFromField(fields[fieldId]).trim()
    if (!visibleText) {
      errors.push(`字段 ${fieldId} 已在证据吸收清单中声明，但最终报告字段为空。`)
      continue
    }
    if ((entry.state === 'evidence' || entry.state === 'inference') && entry.sourceUrls.length === 0) {
      errors.push(`字段 ${fieldId} 标为 ${entry.state} 时至少需要一个本轮审计来源。`)
    }
    if (entry.state === 'inference') {
      if (!policy.allowReasonedInference) {
        errors.push(`Field ${fieldId} declares AI inference, but this Expert pack does not allow controlled inference.`)
      } else if (!isLabeledReasonedInference(visibleText)) {
        errors.push(`字段 ${fieldId} 的推断必须在正文中明确标注“AI推断”（括号可选），并说明其依据。`)
      }
    }
    if (entry.state === 'evidence-gap' && !isVisibleEvidenceGap(visibleText)) {
      errors.push(`字段 ${fieldId} 标为 evidence-gap 时，正文必须明确写出证据缺口、待验证或未取得。`)
    }
    for (const sourceUrl of entry.sourceUrls) {
      if (!sourceUrls.has(sourceUrl)) {
        errors.push(`Field ${fieldId} absorption source must appear in ${policy.sourceFieldId}：${sourceUrl}`)
      }
    }
  }

  const coveredSourceUrls = new Set(coverage.flatMap((entry) => entry.sourceUrls))
  for (const item of serverDispositions) {
    if (item.disposition === 'used' && !coveredSourceUrls.has(item.sourceUrl)) {
      errors.push(`已用于最终报告的来源尚未映射到任何业务字段：${item.sourceUrl}`)
    }
  }
  return errors
}

type ResearchAuditAssertion = {
  auditId: string
  status: ExpertResearchAuditEntry['status']
  kind?: ExpertResearchAuditEntry['kind']
  searchResultStatus?: ExpertResearchSearchResultStatus
  finalUrl?: string
}

const RESEARCH_AUDIT_ASSERTION_STATES = new Set<ExpertResearchAuditEntry['status']>(['opened', 'access_limited', 'failed', 'pending', 'interrupted'])
const RESEARCH_AUDIT_ASSERTION_SEARCH_STATES = new Set<ExpertResearchSearchResultStatus>(['results_observed', 'entry_opened', 'access_limited', 'failed', 'pending', 'interrupted'])

function researchAuditAssertionBody(content: string): { body: string; assertions: ResearchAuditAssertion[] } {
  const canonicalComments = [...content.matchAll(/<!--\s*CC_RESEARCH_AUDIT_ASSERTIONS\s*\r?\n([\s\S]*?)\r?\n\s*-->/g)]
    .map((match) => ({ comment: match[0], json: match[1] }))
  // Earlier research workers correctly collected the v1 JSON but emitted it as
  // <!-- { ... } -->. Accept that one safe legacy form so a presentation-only
  // wrapper mismatch cannot discard an otherwise auditable research run.
  const legacyBareJsonComments = canonicalComments.length
    ? []
    : [...content.matchAll(/<!--\s*(\{[\s\S]*?\})\s*-->/g)]
      .map((match) => ({ comment: match[0], json: match[1] }))
  const matches = canonicalComments.length ? canonicalComments : legacyBareJsonComments
  if (matches.length !== 1) {
    throw new Error('Research Markdown must contain exactly one CC_RESEARCH_AUDIT_ASSERTIONS JSON comment or one compatible bare JSON assertion comment.')
  }
  const match = matches[0]!
  let raw: unknown
  try {
    raw = JSON.parse(match.json ?? '')
  } catch (error) {
    throw new Error('CC_RESEARCH_AUDIT_ASSERTIONS must contain valid JSON: ' + (error instanceof Error ? error.message : String(error)))
  }
  if (!isRecord(raw) || raw.version !== 'cc-jiangxia-research-audit-assertions/v1' || !Array.isArray(raw.assertions)) {
    throw new Error('CC_RESEARCH_AUDIT_ASSERTIONS must declare version cc-jiangxia-research-audit-assertions/v1 and an assertions array.')
  }
  const ids = new Set<string>()
  const assertions = raw.assertions.map((item): ResearchAuditAssertion => {
    if (!isRecord(item)) throw new Error('Every CC_RESEARCH_AUDIT_ASSERTIONS item must be an object.')
    const auditId = requiredText(item.auditId, 'Every CC_RESEARCH_AUDIT_ASSERTIONS item needs auditId.')
    if (ids.has(auditId)) throw new Error('CC_RESEARCH_AUDIT_ASSERTIONS declares ' + auditId + ' more than once.')
    ids.add(auditId)
    if (!RESEARCH_AUDIT_ASSERTION_STATES.has(item.status as ExpertResearchAuditEntry['status'])) {
      throw new Error('CC_RESEARCH_AUDIT_ASSERTIONS.' + auditId + '.status is invalid.')
    }
    const kind = item.kind === 'search' || item.kind === 'url' ? item.kind : undefined
    if (item.kind !== undefined && !kind) throw new Error('CC_RESEARCH_AUDIT_ASSERTIONS.' + auditId + '.kind is invalid.')
    const searchResultStatus = typeof item.searchResultStatus === 'string' && RESEARCH_AUDIT_ASSERTION_SEARCH_STATES.has(item.searchResultStatus as ExpertResearchSearchResultStatus)
      ? item.searchResultStatus as ExpertResearchSearchResultStatus
      : undefined
    if (item.searchResultStatus !== undefined && !searchResultStatus) {
      throw new Error('CC_RESEARCH_AUDIT_ASSERTIONS.' + auditId + '.searchResultStatus is invalid.')
    }
    const finalUrl = item.finalUrl === undefined ? undefined : normalizeHttpUrl(item.finalUrl)
    if (item.finalUrl !== undefined && !finalUrl) throw new Error('CC_RESEARCH_AUDIT_ASSERTIONS.' + auditId + '.finalUrl must be an http(s) URL.')
    return { auditId, status: item.status as ExpertResearchAuditEntry['status'], ...(kind ? { kind } : {}), ...(searchResultStatus ? { searchResultStatus } : {}), ...(finalUrl ? { finalUrl } : {}) }
  })
  return { body: content.replace(match.comment, ''), assertions }
}

function auditIdsMentionedInText(value: string): string[] {
  return [...value.matchAll(/\[audit:([A-Za-z0-9:_-]+)\]/g)].map((match) => match[1]!).filter(Boolean)
}

export function validateExpertResearchArtifactAuditTruth(input: {
  policy: ExpertResearchEvidenceAbsorptionPolicy
  content: string | undefined
  entries: ExpertResearchAuditEntry[]
}): string[] {
  if (!input.policy.requireResearchArtifactAuditAssertions) return []
  const content = input.content ?? ''
  let parsed: { body: string; assertions: ResearchAuditAssertion[] }
  try {
    parsed = researchAuditAssertionBody(content)
  } catch (error) {
    return ['Research Markdown audit assertions are required: ' + (error instanceof Error ? error.message : String(error))]
  }
  const actualById = new Map(input.entries.flatMap((entry) => entry.auditId ? [[entry.auditId, entry] as const] : []))
  const assertionByActualAuditId = new Map<string, ResearchAuditAssertion>()
  const entryByAssertionReference = new Map(actualById)
  const errors: string[] = []

  for (const assertion of parsed.assertions) {
    let entry = actualById.get(assertion.auditId)
    if (!entry) {
      // Researchers can only see their own readable ledger URL or alias while
      // the server owns the opaque Playwright audit ID. Resolve that readable
      // reference only when its declared (or URL-shaped) target maps to one
      // and exactly one real entry from this submission.
      const aliasUrl = assertion.finalUrl ?? normalizeHttpUrl(assertion.auditId)
      if (!aliasUrl) {
        errors.push('Research Markdown asserts an unknown browser audit ID: ' + assertion.auditId)
        continue
      }
      const matches = [...actualById.values()].filter((candidate) => (
        normalizeHttpUrl(candidate.finalUrl ?? candidate.target) === aliasUrl
      ))
      if (matches.length === 0) {
        errors.push('Research Markdown asserts an unknown browser audit ID: ' + assertion.auditId)
        continue
      }
      if (matches.length > 1) {
        errors.push('Research Markdown uses an ambiguous browser audit URL alias: ' + assertion.auditId)
        continue
      }
      entry = matches[0]!
    }
    if (!entry.auditId) {
      errors.push('Research Markdown asserts an unknown browser audit ID: ' + assertion.auditId)
      continue
    }
    const previousAssertion = assertionByActualAuditId.get(entry.auditId)
    if (previousAssertion) {
      errors.push('Research Markdown maps multiple assertions to browser audit ' + entry.auditId + ': ' + previousAssertion.auditId + ' and ' + assertion.auditId)
      continue
    }
    assertionByActualAuditId.set(entry.auditId, assertion)
    entryByAssertionReference.set(assertion.auditId, entry)
  }

  for (const [auditId, entry] of actualById) {
    const assertion = assertionByActualAuditId.get(auditId)
    if (!assertion) {
      errors.push('Research Markdown omitted browser audit assertion: ' + auditId)
      continue
    }
    if (assertion.status !== entry.status) errors.push('Research Markdown changes the recorded status for audit ' + auditId)
    if (assertion.kind && assertion.kind !== entry.kind) errors.push('Research Markdown changes the recorded kind for audit ' + auditId)
    const actualSearchStatus = entry.searchResultStatus ?? (entry.kind === 'search' && entry.status === 'opened' ? 'entry_opened' : entry.status)
    if (entry.kind === 'search' && assertion.searchResultStatus !== actualSearchStatus) {
      errors.push('Research Markdown changes the recorded search-result status for audit ' + auditId)
    }
    const finalUrl = normalizeHttpUrl(entry.finalUrl ?? entry.target)
    if (assertion.finalUrl && finalUrl !== assertion.finalUrl) errors.push('Research Markdown changes the recorded final URL for audit ' + auditId)
  }

  for (const line of parsed.body.split(/\r?\n/)) {
    const mentionsRestriction = hasSearchAccessRestrictionLanguage(line)
    const mentionsObservedResults = hasObservedSearchResultLanguage(line)
    if (!mentionsRestriction && !mentionsObservedResults) continue
    const linkedAuditIds = auditIdsMentionedInText(line)
    if (!linkedAuditIds.length) {
      errors.push('Research Markdown status wording must bind to [audit:<id>] on the same line: ' + line.trim().slice(0, 180))
      continue
    }
    for (const auditId of linkedAuditIds) {
      const entry = entryByAssertionReference.get(auditId)
      if (!entry) continue
      const observed = entry.kind === 'search' && entry.status === 'opened' && entry.searchResultStatus === 'results_observed'
      const limited = entry.status === 'access_limited' || entry.searchResultStatus === 'access_limited'
      if (mentionsRestriction && observed) errors.push('Research Markdown describes results-observed audit ' + auditId + ' as access-limited or verification-blocked.')
      if (mentionsObservedResults && !observed) errors.push('Research Markdown claims observed results for audit ' + auditId + ' although it did not reach a keyword SERP.')
      if (mentionsRestriction && !limited && entry.kind === 'search') errors.push('Research Markdown restriction wording does not match audit ' + auditId)
    }
  }
  return errors
}

function hasSearchAccessRestrictionLanguage(value: string): boolean {
  return /(?:access(?:\s|-)?limited|security(?:\s|-)?verification|captcha|human(?:\s|-)?verification|entry(?:\s|-)?restricted|\u5165\u53e3\u53d7\u9650|\u8bbf\u95ee\u53d7\u9650|\u5b89\u5168\u9a8c\u8bc1|\u4eba\u673a\u9a8c\u8bc1|\u9a8c\u8bc1\u7801|\u672a\u53d6\u5f97\u5b8c\u6574\u7ed3\u679c)/i.test(value)
}

function hasObservedSearchResultLanguage(value: string): boolean {
  return /(?:\bserp\b|\bsearch results?\b|\brank(?:ed|ing)?\b|\u6392\u540d|\u641c\u7d22\u7ed3\u679c|\u7ed3\u679c\u663e\u793a)/i.test(value)
}

function auditedEntriesById(
  state: ExpertResearchEvidenceState | undefined,
  policy: ExpertResearchEvidenceAbsorptionPolicy,
): Map<string, ExpertResearchAuditEntry> {
  const entries = new Map<string, ExpertResearchAuditEntry>()
  for (const record of state?.records ?? []) {
    if (!policy.sourceAgentTypes.includes(record.agentType)) continue
    for (const entry of record.entries) {
      if (entry.auditId) entries.set(entry.auditId, entry)
    }
  }
  return entries
}

function isResultObservedAudit(entry: ExpertResearchAuditEntry): boolean {
  if (entry.kind !== 'search') return entry.status === 'opened'
  return entry.status === 'opened' && entry.searchResultStatus === 'results_observed'
}

function isAccessLimitedAudit(entry: ExpertResearchAuditEntry): boolean {
  return entry.status === 'access_limited' || entry.searchResultStatus === 'access_limited'
}

function validateSearchAuditBindings(input: {
  policy: ExpertResearchEvidenceAbsorptionPolicy
  researchEvidence: ExpertResearchEvidenceState | undefined
  fields: Record<string, unknown>
  sourceField: ExpertTemplateFillField
}): string[] {
  if (!input.policy.requireSearchAuditBindings) return []
  const rows = finalSourceRows(input.fields, input.sourceField)
  const searchAudits = collectSearchAudits(input.researchEvidence, input.policy)
  const auditsById = new Map(searchAudits.flatMap((audit) => audit.auditId ? [[audit.auditId, audit] as const] : []))
  const errors: string[] = []
  for (const row of rows) {
    const candidates = searchAudits.filter((audit) => audit.sourceUrl === row.url)
    if (!candidates.length) continue
    if (!row.auditId) {
      errors.push('Search SOURCE_ROWS must retain its exact audit:// ID instead of a bare URL: ' + row.url)
      continue
    }
    const audit = auditsById.get(row.auditId)
    if (!audit || audit.sourceUrl !== row.url) {
      errors.push('SOURCE_ROWS audit binding does not match the final search URL: ' + row.auditId)
      continue
    }
    if (audit.resultStatus === 'results_observed' && audit.status !== 'access_limited' && hasSearchAccessRestrictionLanguage(row.text)) {
      errors.push('SOURCE_ROWS describes a results-observed ' + audit.engine + ' SERP as access-limited or verification-blocked: ' + row.auditId)
    }
    if (audit.resultStatus !== 'results_observed' && hasObservedSearchResultLanguage(row.text)) {
      errors.push('SOURCE_ROWS claims observed ' + audit.engine + ' search results although audit ' + row.auditId + ' did not observe a keyword SERP.')
    }
  }
  return errors
}

function validateAuditedDetailClusters(input: {
  policy: ExpertResearchEvidenceAbsorptionPolicy
  researchEvidence: ExpertResearchEvidenceState | undefined
  fields: Record<string, unknown>
  templateFieldIds: Set<string>
  absorptionArtifactContent?: string
}): string[] {
  if (!input.policy.requireAuditedDetailClusters) return []
  const manifest = parseExpertResearchDetailClusterManifest(input.absorptionArtifactContent)
  if (!manifest) return []
  const auditsById = auditedEntriesById(input.researchEvidence, input.policy)
  const errors: string[] = []
  for (const cluster of manifest.clusters) {
    if (!input.templateFieldIds.has(cluster.fieldId)) {
      errors.push('CC_REPORT_DETAIL_CLUSTERS references an unknown template field: ' + cluster.fieldId)
      continue
    }
    const renderedFieldText = textFromField(input.fields[cluster.fieldId])
    if (!renderedFieldText.includes(cluster.reportText)) {
      errors.push('Final field ' + cluster.fieldId + ' omitted detail cluster ' + cluster.id + '; preserve its reportText verbatim instead of compressing it into a generic conclusion.')
    }
    if (cluster.state === 'evidence-gap') {
      if (!isVisibleEvidenceGap(cluster.reportText)) {
        errors.push('Evidence-gap detail cluster ' + cluster.id + ' must explicitly state the gap or pending validation.')
      }
      continue
    }
    const audits = cluster.auditIds.map((auditId) => ({ auditId, entry: auditsById.get(auditId) }))
    for (const audit of audits) {
      if (!audit.entry) errors.push('Detail cluster ' + cluster.id + ' references unknown browser audit ID: ' + audit.auditId)
    }
    const knownAudits = audits.flatMap((audit) => audit.entry ? [audit.entry] : [])
    if (!knownAudits.length) continue
    if (cluster.state === 'access-limited') {
      if (!knownAudits.some(isAccessLimitedAudit)) {
        errors.push('Detail cluster ' + cluster.id + ' labels a source access-limited although its cited browser audit was not access-limited.')
      }
      if (!hasSearchAccessRestrictionLanguage(cluster.reportText)) {
        errors.push('Access-limited detail cluster ' + cluster.id + ' must state the access limitation plainly.')
      }
      continue
    }
    if (cluster.state === 'inference' && !isLabeledReasonedInference(cluster.reportText)) {
      errors.push('Inference detail cluster ' + cluster.id + ' must visibly use the AI推断 label (parentheses optional).')
    }
    if (knownAudits.some((audit) => !isResultObservedAudit(audit))) {
      errors.push('Detail cluster ' + cluster.id + ' uses evidence or inference from an audit that did not reach an opened direct page or observed search result.')
    }
    if (knownAudits.some((audit) => audit.kind === 'search' && audit.searchResultStatus === 'results_observed') && hasSearchAccessRestrictionLanguage(cluster.reportText)) {
      errors.push('Detail cluster ' + cluster.id + ' describes a results-observed SERP as access-limited or verification-blocked.')
    }
  }
  return errors
}

export function evaluateExpertResearchEvidenceAbsorption(input: {
  policy: ExpertResearchEvidenceAbsorptionPolicy
  researchEvidence: ExpertResearchEvidenceState | undefined
  reviewerState: ExpertResearchEvidenceReviewerState | undefined
  fields: Record<string, unknown>
  templateFields: ExpertTemplateFillField[]
  evidenceAbsorption: unknown
  absorptionArtifactContent?: string
}): string | null {
  const { policy, researchEvidence, reviewerState, fields, templateFields } = input
  const errors: string[] = []
  if (!reviewerState?.reviewer?.content?.trim()) errors.push('Independent evidence review is incomplete; report rendering cannot skip post-review evidence absorption.')
  const evidenceRecords = (researchEvidence?.records ?? []).filter((record) => policy.sourceAgentTypes.includes(record.agentType))
  if (!evidenceRecords.length) errors.push('No research-subagent evidence ledger is available for absorption; the report cannot render directly.')

  const templateFieldIds = new Set(templateFields.map((field) => field.id))
  for (const fieldId of policy.searchEvidenceFieldIds ?? []) {
    if (!templateFieldIds.has(fieldId)) errors.push(`SEO 来源映射声明了不存在的模板字段：${fieldId}`)
  }
  const sourceField = templateFields.find((field) => field.id === policy.sourceFieldId)
  if (!sourceField || sourceField.kind !== 'table-rows') {
    return joinErrors([...errors, 'Evidence absorption source field is missing or is not a source table: ' + policy.sourceFieldId])
  }

  const sourceUrls = sourceRowUrls(fields, sourceField)
  const backgroundSources = backgroundSourceRowUrls(fields, sourceField)
  const serverDispositions = deriveExpertResearchEvidenceAbsorptionDispositions({ policy, researchEvidence, sourceUrls, backgroundSourceUrls: backgroundSources })
  errors.push(...validateSearchAuditBindings({ policy, researchEvidence, fields, sourceField }))
  errors.push(...validateAuditedDetailClusters({
    policy,
    researchEvidence,
    fields,
    templateFieldIds,
    absorptionArtifactContent: input.absorptionArtifactContent,
  }))
  const auditedUrls = collectCitableFinalReportSourceUrls(researchEvidence, policy)
  errors.push(...validateEvidenceStatusSummary({
    policy,
    fields,
    templateFieldIds,
    serverDispositions,
    sourceUrls,
  }))
  errors.push(...validateReviewerAllowedSourceRetention({
    policy,
    researchEvidence,
    reviewerState,
    sourceUrls,
  }))
  errors.push(...validateFieldCoverage({
    policy,
    evidenceAbsorption: input.evidenceAbsorption,
    fields,
    templateFieldIds,
    sourceUrls,
    serverDispositions,
  }))

  // SOURCE_ROWS is the final report's auditable boundary. Every URL it cites
  // must come from a researcher record in this session; model annotations do
  // not make a new URL real.
  for (const url of sourceUrls) {
    if (!auditedUrls.has(url)) errors.push(policy.sourceFieldId + ' 中的来源未在本轮研究审计中找到：' + url)
  }

  const searchAudits = collectSearchAudits(researchEvidence, policy)
  const searchText = searchEvidenceText(fields, policy)
  // Validate positive SERP observations, not mere engine names in suggestions
  // or limitation notes. Never force the first/latest unrelated query as proof.
  for (const engine of mentionedSearchEngines(fields, policy)) {
    const claims = searchText.split(/\n|[。；;!?！？]|[,，]?\s*(?:但是|但|然而|不过)\s*|[,，]\s*(?=(?:Google|百度(?!贴吧)|Bing|360))/).filter((sentence) => {
      const mentions = engine === '百度' ? /百度(?!贴吧|网盘|百科|地图)/.test(sentence) : sentence.includes(engine)
      return mentions && !/建议|未来|待验证|尚未|未取证|未取得|未获取|未观察|没有(?:取得|获取|观察)|未能(?:取得|获取|观察)|缺失|缺口|不得|禁止|不应|不能判断|不(?:能|支持)|无法|受限|仅.*入口|suggest|not (?:obtained|observed)|limited/i.test(sentence)
        && /结果|排名|可见性|搜索到|检索到|SERP|rank|results|visibility|observed/i.test(sentence)
    })
    if (!claims.length) continue
    const observed = searchAudits.filter((audit) => audit.engine === engine && audit.resultStatus === 'results_observed' && audit.status === 'opened')
    const cited = observed.filter((audit) => sourceUrls.has(audit.sourceUrl))
    if (!cited.length) {
      errors.push('SEO/SEM 对 ' + engine + ' 的实际结果观察需要对应查询的已取证来源；不能用首页、受限页或任意最近一次查询代替。')
      continue
    }
    for (const claim of claims) {
      const explicitQueries = [...claim.matchAll(/(?:关键词|查询词|查询|query|搜索词)\s*[:：]?\s*[“「"]([^”」"]{2,120})[”」"]/gi)].map((match) => match[1]!.toLowerCase())
      if (explicitQueries.length && !cited.some((audit) => {
        const url = new URL(audit.sourceUrl)
        const query = (url.searchParams.get('q') ?? url.searchParams.get('wd') ?? url.searchParams.get('word') ?? '').toLowerCase()
        return explicitQueries.some((expected) => query.includes(expected))
      })) errors.push('SEO/SEM 引用的 ' + engine + ' 查询与该观察中的关键词不对应；请引用同一查询或说明尚未取证。')
    }
  }
  return joinErrors(errors)
}

export function buildExpertPostReviewEvidenceAbsorptionInstruction(input: {
  policy: ExpertResearchEvidenceAbsorptionPolicy | undefined
  researchEvidence: ExpertResearchEvidenceState | undefined
  reviewerState: ExpertResearchEvidenceReviewerState | undefined
  artifactPolicy?: ExpertResearchArtifactPolicy
  templateFields?: ExpertTemplateFillField[]
}): string | null {
  if (!input.policy || !input.reviewerState?.reviewer) return null
  const records = (input.researchEvidence?.records ?? []).filter((record) => input.policy!.sourceAgentTypes.includes(record.agentType))
  if (!records.length) return null
  const reviewer = input.reviewerState.reviewer
  const knownTemplateFieldIds = new Set((input.templateFields ?? []).map((field) => field.id))
  const unknownFieldGranularityGuidance = (input.policy.fieldGranularityGuidance ?? [])
    .map((guidance) => guidance.fieldId)
    .filter((fieldId) => !knownTemplateFieldIds.has(fieldId))
  if (unknownFieldGranularityGuidance.length) {
    throw new Error(`postReviewEvidenceAbsorption.fieldGranularityGuidance references unknown template field(s): ${[...new Set(unknownFieldGranularityGuidance)].join(', ')}.`)
  }
  const fieldGranularityInstruction = (input.policy.fieldGranularityGuidance ?? [])
    .map((guidance) => `${guidance.fieldId}: ${guidance.instruction}`)
  const fieldGranularityContract = fieldGranularityInstruction.length
    ? [
        'Field-specific report quality contract: satisfy every applicable instruction below with concrete, source-bounded report content. Do not pad fields, collapse concrete pages into a generic source category, or turn an unavailable route into a factual conclusion.',
        ...fieldGranularityInstruction,
      ]
    : []
  if (input.artifactPolicy) {
    const researcherPaths = registeredResearchArtifactPaths(input.artifactPolicy, records)
    const sourcePaths = new Set(researcherPaths.map(researchArtifactRootPath))
    if (!reviewer.artifactPath || reviewer.artifactPath !== input.artifactPolicy.reviewerPath || !input.artifactPolicy.researcherPaths.every((artifactPath) => sourcePaths.has(artifactPath))) {
      return null
    }
    if (input.artifactPolicy.absorptionPath && input.policy.absorberAgentType) {
      return [
        '<expert-post-review-evidence-absorption>',
        'This is an internal, no-user-interaction report-preparation phase. Do not call AskUserQuestion or ask for delivery confirmation.',
        'The independent review is complete. Dispatch exactly one Agent with subagent_type: "' + input.policy.absorberAgentType + '" and run_in_background: false.',
        'Give it the task to Read the brief and independent review first, consult declared raw artifacts only for targeted source/detail checks, and Write ' + input.artifactPolicy.absorptionPath + '. Its final response must be one short receipt with the declared Markdown path plus a brief save/read-back status; all research content remains in the file.',
        REPORT_ABSORPTION_WORK_GUIDANCE,
        REPORT_EVIDENCE_HANDOFF_GUIDANCE,
        'Pass the shared reading, writing, source-selection and inference guidance above to E unchanged; do not replace it with instructions to create an empty stub, Edit-append, or reread every raw shard.',
        'After it succeeds, the parent must Read ' + input.artifactPolicy.briefPath + ' and ' + input.artifactPolicy.absorptionPath + ' before the structured final Write. Do not reopen every raw ledger, do not ask the user a delivery question, and do not bypass this chapter-ready material phase.',
        "Read to EOF using offset/limit pages for long files; full-file and complete paginated Reads are equivalent. Missing pages, failed reads, and reads from an older file revision do not count; continue the unread range instead of re-reading everything.",
        "Keep exact source identity through 07: a detail may cite [S1], with [S1]: audit:<exact-audit-id> copied from 06, or one complete audited URL per label. This applies to articles and videos as well as SERPs. Preserve all article/query parameters; do not reconstruct a URL from a title, domain, /s prefix, login page, or platform name. Reuse the label in report prose and SOURCE_ROWS; the runtime resolves the exact successful audit to its final URL and preserves distinct repeated-query audit IDs. These are optional native Markdown references, not a new format gate; full URLs remain supported and missing labels do not block completion.",
        'The absorption file is a chapter-ready report material package and reasoning boundary. Organize it by report chapter/field family; retain distinct usable reviewer-approved details as verified facts, limited observations with scope, grounded （AI推断） with basis and falsification condition, risks/validation gates, explicit gaps, candidate fields, and audit/source references. Do not compress different decision-relevant details into generic conclusions. It is still not a per-URL, per-field, or word-count quota.',
        '</expert-post-review-evidence-absorption>',
      ].join('\n\n')
    }
    return [
      '<expert-post-review-evidence-absorption>',
      'This is an internal, no-user-interaction report-preparation phase. Do not call AskUserQuestion or ask for delivery confirmation.',
      'This Expert uses file-first research handoffs. Read only these exact session Markdown artifacts before drafting the report; do not scan the workDir, reopen tool-result transcripts, or call Playwright in this absorption phase:',
      '- ' + input.artifactPolicy.briefPath,
      ...researcherPaths.map((artifactPath) => '- ' + artifactPath),
      'Read every listed research part using offset/limit pages (typically 200 lines per Read); continue to EOF before absorption. Do not read an entire long ledger in one call or omit later pages.',
      '- ' + input.artifactPolicy.auditPath,
      '- ' + input.artifactPolicy.reviewerPath,
      '',
      REPORT_EVIDENCE_HANDOFF_GUIDANCE,
      'Read the reviewer decision first, then absorb important usable evidence clusters into the relevant report chapter, comparison, risk, validation gate, or source appendix. Do not compress detailed valid evidence into a generic conclusion.',
      'The server validates final sources against the same browser audit. SOURCE_ROWS must include audited URLs actually used in the report, and the server restores only report-used audited URLs accidentally omitted from the source table. The full visit inventory remains in 06; do not manufacture generic background citations. access_limited, failed, pending, verification pages, and incoherent redirects remain internal only. Do not invent a URL or infer numeric facts.',
      'A clearly labeled （AI推断） is allowed only for non-numeric reasoning grounded in the Markdown evidence, with its basis and falsification condition stated. Keep real evidence, limited observations, inferences, and evidence gaps visibly distinct.',
      ...fieldGranularityContract,
      ...(input.policy.requireEvidenceStatusSummary ? [
        'Fill ' + input.policy.evidenceStatusSummaryFieldId + ' with clearly separated evidence categories (equivalent wording and optional parentheses are accepted): 已核验事实、有限公开观察、AI推断、证据缺口 / 待验证。Do not label all researched material as pending.',
      ] : []),
      '</expert-post-review-evidence-absorption>',
    ].join('\n\n')
  }
  const reviewerDigest = input.policy.requireReviewerDispositionAbsorption
    ? reconcileReviewerAllowedEvidenceDigest(
      reviewer.content,
      citableAuditedCanonicalUrls(input.researchEvidence, input.policy),
    )
    : []
  const fieldCoverageInstruction = input.policy.requireFieldCoverage
    ? [
        'The server compiles the internal field-coverage ledger from your final report fields and audited SOURCE_ROWS. Do not hand-write evidenceAbsorption.fieldCoverage, records, or fieldEvidence.',
        'The goal is complete ledger-to-field absorption, not word-count padding or a generic short summary. Put the actual supported details into the relevant report fields.',
    ...(input.policy.requireAuditedDetailClusters ? ['The parent must Read 07-report-field-absorption.md and preserve every CC_REPORT_DETAIL_CLUSTERS reportText verbatim in its declared field. The server rejects a compressed first draft even if it has the right headings.'] : []),
        'A clearly labeled （AI推断） is allowed only when grounded in the listed audited URLs. Do not invent numeric facts through inference; state an evidence gap when the number was not obtained.',
      ]
    : [
        'The server already persists every browser audit and automatically derives a disposition for every audited URL. Do not hand-write evidenceAbsorption records or fieldEvidence merely to make final HTML valid.',
        'evidenceAbsorption is optional supplemental context only. If you include it, keep it concise and truthful; it never requires copying every opened URL or every field claim verbatim.',
      ]
  return [
    '<expert-post-review-evidence-absorption>',
    'This is an internal, no-user-interaction report-preparation phase. Do not call AskUserQuestion or ask for delivery confirmation.',
    'The immediately preceding reviewer result is the detailed, report-ready field-level verdict produced from all completed researcher ledgers. Absorb its verified and partially verified details into the relevant report fields; do not collapse it into a generic short summary.',
    ...(reviewerDigest.length ? [
      'Compact reviewer allowlist (these include / merge / partially verified details must be retained in the relevant chapter, comparison, limitation, or source appendix; rejected/internal-only items are intentionally omitted):',
      reviewerDigest.join('\n'),
    ] : []),
    'Do not call Read to reopen a persisted Agent/tool-results file for this phase. The reviewer result is already attached immediately before this compact audit allowlist; the duplicate raw ledgers and reviewer text are intentionally omitted here to keep the parent handoff readable.',
    REPORT_EVIDENCE_HANDOFF_GUIDANCE,
    ...fieldCoverageInstruction,
    ...fieldGranularityContract,
    ...(input.policy.requireEvidenceStatusSummary ? [
       'Fill ' + input.policy.evidenceStatusSummaryFieldId + ' with clearly separated evidence categories (equivalent wording and optional parentheses are accepted): 已核验事实、有限公开观察、AI推断、证据缺口 / 待验证。Each line must state what that category does and does not establish for this specific report; do not label all researched material as pending.',
    ] : []),
    "Keep exact source identity through 07: a detail may cite [S1], with [S1]: audit:<exact-audit-id> copied from 06, or one complete audited URL per label. This applies to articles and videos as well as SERPs. Preserve all article/query parameters; do not reconstruct a URL from a title, domain, /s prefix, login page, or platform name. Reuse the label in report prose and SOURCE_ROWS; the runtime resolves the exact successful audit to its final URL and preserves distinct repeated-query audit IDs. These are optional native Markdown references, not a new format gate; full URLs remain supported and missing labels do not block completion.",
    'Final SOURCE_ROWS must include every source actually audited and used in the report. The server restores only audited URLs already used in report prose. Keep other visits in 06 and point to that complete inventory in the report declaration; do not pad citations with generic summaries. For ordinary pages, cite the actual page URL. For a search-engine result page with long or volatile parameters, write audit:<id> in the URL cell instead of reconstructing its URL; the server resolves that stable reference to the audited final URL. Never invent an audit id or a source URL.',
    ...(input.policy.requireSearchAuditBindings ? ['For search-engine SOURCE_ROWS, prefer audit:<exact-audit-id> in the URL cell. The runtime preserves the internal audit binding and renders the audited final URL. A stable copied search URL is also accepted only when it maps to exactly one same-session audit; if the same query was audited more than once, use audit:<id> to select the truthful attempt.'] : []),
    'If a final SEO/SEM field makes a positive observation about Google, 百度, Bing, or 360 results, include the corresponding audited query in SOURCE_ROWS. Merely naming an engine in a recommendation or not-obtained statement does not require an arbitrary SERP citation. An opened SERP supports a bounded observation; an access-limited/failed/pending SERP supports only the stated limitation when it directly bounds that specific claim. Do not name an engine merely to disclose an internal connection, navigation, or access failure: when another public entry or concrete page supports the field, keep the failed attempt only in the internal audit and omit it from final fields and SOURCE_ROWS.',
    'Allowed template fields:',
    JSON.stringify((input.templateFields ?? []).map((field) => ({ id: field.id, kind: field.kind, ...(field.kind === 'table-rows' ? { columns: field.columns } : {}) }))),
    'Canonical citable source URL allowlist (this is an exact source list, not a replacement for the preceding reviewer verdict):',
    JSON.stringify([...collectCitableFinalReportSourceUrls(input.researchEvidence, input.policy)]),
    'Reviewer receipt:',
    JSON.stringify({ agentId: reviewer.agentId, recordedAt: reviewer.recordedAt }),
    '</expert-post-review-evidence-absorption>',
  ].join('\n\n')
}


