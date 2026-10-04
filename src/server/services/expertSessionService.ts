import { isFileFirstExpertResearchAgentType, resolveFileFirstExpertAgentType, researchArtifactRootPath, registeredResearchArtifactPaths } from '../../services/tools/expertFileFirstResearchProtocol.js'
import { normalizeExpertResearchTaskKind, type ExpertResearchTaskKind } from '../../services/tools/expertSubagentSkillRuntime.js'
// 专家 Mode session service.
import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import * as path from 'node:path'
import { ApiError } from '../middleware/errorHandler.js'
import { sessionService } from './sessionService.js'
import { conversationService } from './conversationService.js'
import { ExpertPackRegistryService, ExpertPackValidationError, type ExpertIntakeState, type ExpertMaterialRef, type ExpertSessionMetadata, type ExpertTemplateFillDraftState } from './expertPackRegistryService.js'
import { ExpertRuntimeService } from './expertRuntimeService.js'
import { createExpertRuntimeBinding, hasActiveExpertRuntime, restoreTruncatedExpertRuntime, upgradeCommercializationResearchChannelRuntime } from './expertRuntimeBindingService.js'
import { EXPERT_TEMPLATE_FILL_FORMAT, deriveExpertTemplateFillSchema, renderExpertTemplateFill } from '../../utils/expertTemplateFill.js'
import { expertRuntimeSessionStore } from './expertRuntimeSessionStore.js'
import { sessionRuntimeTransitionService } from './sessionRuntimeTransitionService.js'
import { withExpertResearchSourceDispatchLock } from './expertResearchSourceDispatchLock.js'
import { resolveExpertResearchArtifactPath, type ExpertResearchArtifactPolicy } from './expertResearchArtifactPolicyService.js'
import { hasAcceptedExpertResearchDelivery, resolveExpertResearchDeliveryDecision, type ExpertResearchDeliveryState } from './expertResearchDeliveryService.js'
import { resolveExpertResearchBrowserConnection, resolveExpertResearchBrowserPresentation } from './expertResearchBrowserPolicyService.js'
import { expertBrowserActivityService } from './expertBrowserActivityService.js'
import { expertSearchPacingService } from './expertSearchPacingService.js'
import { expertResearchAutoContinueService, type FinishedResearchSourceBatch } from './expertResearchAutoContinueService.js'
import { evaluateExpertFinalSourceCoverage, evaluateExpertResearchCompletion, recordExpertResearchAudit, type ExpertResearchAuditEntry, type ExpertResearchCompletionState } from './expertResearchCompletionService.js'
import { recordExpertResearchEvidence, type ExpertResearchEvidenceRecord, type ExpertResearchEvidenceState } from './expertResearchEvidenceReviewService.js'
import { evaluateResearchSourceLibraryExecutionCoverage, matchOpenedResearchSourceLibraryEntries, matchResearchSourceLibraryAttempts, parseResearchSourceLibrary, resolveResearchRecordArtifactPath, planResearchSourceLibraryExecutionBatches, renderResearchSourceLibraryTaskPoolMarkdown, renderResearchSourceLibraryUsageMarkdown, type ExpertResearchSourceLibraryDispatchReceipt, type ExpertResearchSourceLibraryExecutionPlan } from './expertResearchSourceLibraryService.js'
import { evaluateExpertResearchRequiredRoutes, formatExpertResearchRouteEvaluation } from './expertResearchRouteCompletionService.js'
import { ensureCommercializationReportSourceBoundary } from './expertCommercializationReportScopeService.js'
import { buildExpertPostReviewEvidenceAbsorptionInstruction, evaluateExpertResearchEvidenceAbsorption, mergeAuditedOpenedSourcesIntoSourceRows, recordExpertResearchEvidenceReviewer, resolveExpertResearchAuditSourceReferences, validateExpertResearchArtifactAuditTruth, type ExpertResearchEvidenceReviewerState } from './expertResearchEvidenceAbsorptionService.js'

const registry = new ExpertPackRegistryService()
const runtime = new ExpertRuntimeService()

const MAX_TEMPLATE_FILL_REPAIR_DIAGNOSTIC_RECORDS = 24
const COMMERCIALIZATION_REPORT_EXPERT_ID = 'commercialization-research-report'
const COMMERCIALIZATION_REPORT_TIME_ZONE = 'Asia/Shanghai'
/** The report date is rendered by the server, not trusted to model-authored fields. */
export function formatCommercializationReportDate(now: Date = new Date()): string {
  // Test/runtime date overrides are the only safe way to correct a host whose
  // operating-system clock is wrong; otherwise use the server's China-local day.
  const override = process.env.CLAUDE_CODE_OVERRIDE_DATE?.trim()
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override

  const values = new Map(
    new Intl.DateTimeFormat('en-US', {
      timeZone: COMMERCIALIZATION_REPORT_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now).map((part) => [part.type, part.value]),
  )
  return [values.get('year'), values.get('month'), values.get('day')].join('-')
}

export function stampCommercializationReportDate(
  expertId: string,
  fields: Record<string, unknown>,
  now: Date = new Date(),
): Record<string, unknown> {
  if (expertId !== COMMERCIALIZATION_REPORT_EXPERT_ID) return fields
  return { ...fields, REPORT_DATE: formatCommercializationReportDate(now) }
}

type ExpertTemplateFillRepairFailureKind = 'template-fill' | 'evidence' | 'schema'

type ExpertTemplateFillRepairFailure = {
  kind: ExpertTemplateFillRepairFailureKind
  /** Present on new records; absent legacy records retain exact-payload compatibility. */
  code?: string
  payloadFingerprint: string
  failureFingerprint: string
  failedAt: string
}

type ExpertTemplateFillDraft = ExpertTemplateFillDraftState

// Rejected fields are a repair candidate, NOT a rendered draft. Keep this
// bounded, process-local cache separate from persisted delivery/review state.
// No user storage format changes; a server restart requires a full resubmission.
const templateFillCandidates = new Map<string, { sessionId: string; payload: TemplateFillSubmission; savedAt: number }>()
// A render is only a prepared write. Receipts are process-local, never a new
// user-storage schema; after server restart the same structured Write can retry.
const templateFillWrites = new Map<string, {
  sessionId: string; candidateKey: string; outputPath: string | undefined
  contentHash: string; bindingHash: string; requestHash: string; savedAt: number; committed?: boolean
  state: Pick<ExpertSessionMetadata, 'templateFillDraft' | 'templateFillDelivery' | 'reportCompletenessReview'>
}>()
function prepareTemplateFillWrite(sessionId: string, candidateKey: string, outputPath: string | undefined, binding: unknown, content: string, request: TemplateFillSubmission,
  state: Pick<ExpertSessionMetadata, 'templateFillDraft' | 'templateFillDelivery' | 'reportCompletenessReview'>): string {
  const now = Date.now()
  for (const [id, write] of templateFillWrites) {
    if (now - write.savedAt > 2 * 60 * 60 * 1000 || (write.candidateKey === candidateKey && !write.committed)) templateFillWrites.delete(id)
  }
  const receipt = randomUUID()
  templateFillWrites.set(receipt, { sessionId, candidateKey, outputPath, bindingHash: fingerprint(binding), requestHash: fingerprint(request),
    contentHash: createHash('sha256').update(content).digest('hex'), state, savedAt: now })
  while (templateFillWrites.size > 64) templateFillWrites.delete(templateFillWrites.keys().next().value!)
  return receipt
}
function templateFillCandidateKey(sessionId: string, binding: unknown, outputPath: string | undefined): string {
  return sessionId + ':' + fingerprint({ binding, outputPath: outputPath ?? null })
}
function rememberTemplateFillCandidate(key: string, sessionId: string, payload: TemplateFillSubmission): void {
  const now = Date.now()
  for (const [storedKey, value] of templateFillCandidates) {
    if (now - value.savedAt > 2 * 60 * 60 * 1000) templateFillCandidates.delete(storedKey)
  }
  templateFillCandidates.delete(key)
  templateFillCandidates.set(key, { sessionId, payload, savedAt: now })
  while (templateFillCandidates.size > 16) templateFillCandidates.delete(templateFillCandidates.keys().next().value!)
}

type ExpertSessionWithTemplateFillRepairFailures = ExpertSessionMetadata & {
  templateFillRepairFailures?: ExpertTemplateFillRepairFailure[]
}

function stableJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'undefined') return 'undefined'
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(String(value))
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function readTemplateFillRepairFailures(expert: ExpertSessionMetadata): ExpertTemplateFillRepairFailure[] {
  const value = (expert as ExpertSessionWithTemplateFillRepairFailures).templateFillRepairFailures
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const candidate = item as Partial<ExpertTemplateFillRepairFailure>
    if (
      !['template-fill', 'evidence', 'schema'].includes(String(candidate.kind))
      || (candidate.code !== undefined && typeof candidate.code !== 'string')
      || typeof candidate.payloadFingerprint !== 'string'
      || typeof candidate.failureFingerprint !== 'string'
      || typeof candidate.failedAt !== 'string'
    ) return []
    return [{
      kind: candidate.kind as ExpertTemplateFillRepairFailureKind,
      ...(typeof candidate.code === 'string' ? { code: candidate.code } : {}),
      payloadFingerprint: candidate.payloadFingerprint,
      failureFingerprint: candidate.failureFingerprint,
      failedAt: candidate.failedAt,
    }]
  }).slice(-MAX_TEMPLATE_FILL_REPAIR_DIAGNOSTIC_RECORDS)
}

type TemplateFillSubmission = {
  templateId: string
  fields: Record<string, unknown>
  mode?: 'patch' | 'finalize'
  evidenceAbsorption?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeTemplateFillOutputPath(pathApi: typeof path, value: string): string {
  return pathApi.resolve(value).split(pathApi.sep).join('/').toLowerCase()
}

function sameTemplateFillOutputPath(left: string, right: string): boolean {
  const pathApi = path.win32.isAbsolute(left) || path.win32.isAbsolute(right) ? path.win32 : path
  return normalizeTemplateFillOutputPath(pathApi, left) === normalizeTemplateFillOutputPath(pathApi, right)
}

/**
 * A renderer path is a delivery identity, not model-authored report content.
 * It may only name one .html/.htm file directly under this session workDir.
 */
function resolveTemplateFillOutputPath(workDir: string | undefined, value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/\.html?$/i.test(value.trim())) {
    throw ApiError.badRequest('模板输出路径必须是当前会话目录下的一个 .html 或 .htm 文件。')
  }
  if (!workDir) {
    throw new ApiError(409, '当前会话缺少可验证的报告输出目录。', 'EXPERT_TEMPLATE_OUTPUT_PATH_REQUIRED')
  }
  const requestedPath = value.trim()
  const pathApi = path.win32.isAbsolute(workDir) || path.win32.isAbsolute(requestedPath) ? path.win32 : path
  const resolvedWorkDir = pathApi.resolve(workDir)
  const resolvedPath = pathApi.isAbsolute(requestedPath)
    ? pathApi.resolve(requestedPath)
    : pathApi.resolve(resolvedWorkDir, requestedPath)
  if (
    !sameTemplateFillOutputPath(pathApi.dirname(resolvedPath), resolvedWorkDir)
    || (!pathApi.isAbsolute(requestedPath) && pathApi.basename(requestedPath) !== requestedPath)
  ) {
    throw ApiError.badRequest('模板输出路径只能是当前会话 workDir 直接下的一个 .html 或 .htm 文件。')
  }
  return resolvedPath
}

function parseTemplateFillSubmission(value: unknown): TemplateFillSubmission {
  if (!isRecord(value)) throw ApiError.badRequest('模板填充数据必须是包含 templateId 和 fields 的对象。')
  const templateId = typeof value.templateId === 'string' ? value.templateId.trim() : ''
  if (!templateId || !isRecord(value.fields)) {
    throw ApiError.badRequest('模板填充数据缺少非空 templateId 或 fields 对象。')
  }
  if (value.mode !== undefined && value.mode !== 'patch' && value.mode !== 'finalize') {
    throw ApiError.badRequest('模板填充 mode 只能是 patch 或 finalize。')
  }
  return {
    templateId,
    fields: value.fields,
    ...(value.mode === 'patch' || value.mode === 'finalize' ? { mode: value.mode } : {}),
    ...(value.evidenceAbsorption !== undefined ? { evidenceAbsorption: value.evidenceAbsorption } : {}),
  }
}

function readTemplateFillDraft(expert: ExpertSessionMetadata): ExpertTemplateFillDraft | undefined {
  const value = (expert as ExpertSessionWithTemplateFillRepairFailures).templateFillDraft
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  if (typeof value.templateId !== 'string' || !value.templateId.trim() || !isRecord(value.fields) || typeof value.savedAt !== 'string' || typeof value.updatedAt !== 'string') return undefined
  return {
    templateId: value.templateId,
    fields: value.fields,
    ...(value.evidenceAbsorption !== undefined ? { evidenceAbsorption: value.evidenceAbsorption } : {}),
    ...(isRecord(value.completionReview) && typeof value.completionReview.initialRenderedAt === 'string'
      ? {
        completionReview: {
          initialRenderedAt: value.completionReview.initialRenderedAt,
          ...(typeof value.completionReview.reportPath === 'string' && value.completionReview.reportPath.trim()
            ? { reportPath: value.completionReview.reportPath }
            : {}),
        },
      }
      : {}),
    savedAt: value.savedAt,
    updatedAt: value.updatedAt,
  }
}

/** A draft enters the 08/patch lifecycle only after HTML has rendered successfully. */
function renderedTemplateFillDraft(draft: ExpertTemplateFillDraft | undefined): ExpertTemplateFillDraft | undefined {
  return draft?.completionReview ? draft : undefined
}

function omitsSavedDraftFields(submission: TemplateFillSubmission, draft: ExpertTemplateFillDraft): boolean {
  return Object.keys(draft.fields).some((fieldId) => !Object.prototype.hasOwnProperty.call(submission.fields, fieldId))
}

export type ExpertSubagentResearchEvidenceContext = {
  expertId: string
  packId: string
  packVersion: string
  reviewerEvidenceOnly: true
  /** File-first handoff for the opt-in commercialization expert. */
  artifactPaths?: {
    briefPath: string
    researcherPaths: string[]
    researcherParts?: boolean
    reviewerPath: string
    auditPath: string
    absorptionPath?: string
    completionReviewPath?: string
  }
  records: ExpertResearchEvidenceRecord[]
}

export type ExpertPostReviewEvidenceAbsorptionContext = {
  expertId: string
  packId: string
  packVersion: string
  instruction: string
}

export type ExpertSubagentSkillContext = {
  expertId: string
  packId: string
  packVersion: string
  /** Runtime-only paths used to narrow file-first child Write and verification. */
  artifactPaths?: {
    briefPath: string
    researcherPaths: string[]
    researcherParts?: boolean
    reviewerPath: string
    auditPath: string
    absorptionPath?: string
    completionReviewPath?: string
  }
  /** Server-persisted same-session HTML identity for the constrained 08 worker. */
  outputReview?: {
    briefPath: string
    absorptionPath: string
    completionReviewPath: string
    reportPath: string
  }
  researchTaskKind?: ExpertResearchTaskKind
  /** Current bounded A/B/C source-execution wave; never the whole library at once. */
  researchSourcePlan?: ExpertResearchSourceLibraryExecutionPlan
  skills: Array<{
    skillId: string
    title: string
    path: string
    sha256: string
    content: string
  }>
}

function markdownCell(value: unknown): string {
  return String(value ?? '').replace(/[|\r\n]+/g, ' ').trim().slice(0, 420)
}

function renderBrowserAuditArtifact(
  records: ExpertResearchEvidenceRecord[],
  sourceLibraryContent?: string,
  sourceLibraryPlan?: ExpertResearchSourceLibraryExecutionPlan,
  sourceLibraryDispatches?: ExpertResearchSourceLibraryDispatchReceipt[],
): string {
  const lines = [
    '# 浏览器研究审计台账',
    '',
    '> 此文件由服务端根据三名研究子代理实际记录的 Playwright 动作生成。它用于独立复核和最终字段吸收；不含浏览器 Profile、Cookie 或用户聊天内容。',
    '',
  ]
  for (const record of records) {
    lines.push('## ' + record.agentType + '（' + record.agentId + '）', '')
    lines.push('| 状态 | 类型 | 搜索引擎 | 查询/目标 | 最终页面 | 动作 | 备注 |', '| --- | --- | --- | --- | --- | --- | --- |')
    for (const entry of record.entries) {
      lines.push('| ' + markdownCell(entry.status) + ' | ' + markdownCell(entry.kind ?? 'url') + ' | ' + markdownCell(entry.searchEngine ?? '') + ' | ' + markdownCell(entry.query ?? entry.target) + ' | ' + markdownCell(entry.finalUrl ?? entry.target) + ' | ' + markdownCell((entry.actionTypes ?? []).join(' → ')) + ' | ' + markdownCell(entry.detail ?? '') + ' |')
    }
    lines.push('')
  }
  if (sourceLibraryContent?.trim()) {
    const sourceLibraryCatalog = parseResearchSourceLibrary(sourceLibraryContent)
    const sourceLibraryAttempts = matchResearchSourceLibraryAttempts({
      catalog: sourceLibraryCatalog,
      records,
      dispatches: sourceLibraryDispatches,
    })
    const sourceLibraryUsage = matchOpenedResearchSourceLibraryEntries({
      catalog: sourceLibraryCatalog,
      records,
      dispatches: sourceLibraryDispatches,
    })
    lines.push(renderResearchSourceLibraryTaskPoolMarkdown({
      catalog: sourceLibraryCatalog,
      attempts: sourceLibraryAttempts,
      ...(sourceLibraryPlan ? { plan: sourceLibraryPlan } : {}),
      ...(sourceLibraryDispatches ? { dispatches: sourceLibraryDispatches } : {}),
    }).trimEnd(), '')
    lines.push(renderResearchSourceLibraryUsageMarkdown(sourceLibraryUsage).trimEnd())
  }
  return lines.join('\n') + '\n'
}

function exactArtifactPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized && !/[\r\n]/.test(normalized) && normalized.endsWith('.md') ? normalized : undefined
}

/** Internal artifact transport comes from the actual Write tool use and is
 * intentionally independent of the subagent's free-form final handoff. */
function reportedArtifactPath(value: unknown): string | undefined {
  return exactArtifactPath(value)
}

/**
 * The durable file path is the authoritative phase boundary for file-first
 * Expert workers. A model can accidentally select the researcher agent type
 * while assigning the declared reviewer/absorber/final-review Markdown; do
 * not turn that recoverable dispatch mistake into a false browser-audit error.
 */
function reconcileFileFirstExpertAgentType(input: {
  agentType: string
  workDir: string | undefined
  policy: ExpertResearchArtifactPolicy | undefined
  artifactPath: string | undefined
}): string {
  if (!input.workDir || !input.policy || !input.artifactPath || (input.agentType !== 'general-purpose' && !isFileFirstExpertResearchAgentType(input.agentType))) {
    return input.agentType
  }
  let relativePath: string
  try {
    relativePath = resolveExpertResearchArtifactPath({
      workDir: input.workDir,
      policy: input.policy,
      artifactPath: input.artifactPath,
      allowedKinds: ['researcher-report', 'evidence-review', 'field-absorption', 'final-output-review'],
    }).relativePath
  } catch {
    return input.agentType
  }
  return resolveFileFirstExpertAgentType({ agentType: input.agentType, artifactPath: relativePath, artifactPaths: input.policy }) ?? input.agentType
}

async function requireResearchBriefArtifact(
  workDir: string,
  policy: ExpertResearchArtifactPolicy,
): Promise<void> {
  const brief = resolveExpertResearchArtifactPath({
    workDir,
    policy,
    artifactPath: policy.briefPath,
    allowedKinds: ['research-brief'],
  })
  const content = await fs.readFile(brief.absolutePath, 'utf8')
  if (!content.trim()) throw new Error('调研任务说明 Markdown 文件为空。')
}

async function requireEvidenceReviewArtifact(
  workDir: string,
  policy: ExpertResearchArtifactPolicy,
): Promise<void> {
  const review = resolveExpertResearchArtifactPath({
    workDir,
    policy,
    artifactPath: policy.reviewerPath,
    allowedKinds: ['evidence-review'],
  })
  const content = await fs.readFile(review.absolutePath, 'utf8')
  if (!content.trim()) throw new Error('独立复核 Markdown 文件为空。')
}

async function requireReportFieldAbsorptionArtifact(
  workDir: string,
  policy: ExpertResearchArtifactPolicy,
): Promise<string | undefined> {
  if (!policy.absorptionPath) return undefined
  const absorption = resolveExpertResearchArtifactPath({
    workDir,
    policy,
    artifactPath: policy.absorptionPath,
    allowedKinds: ['field-absorption'],
  })
  const content = await fs.readFile(absorption.absolutePath, 'utf8')
  if (!content.trim()) throw new Error('报告字段吸收 Markdown 文件为空。')
  return content
}

function reviewMarkdownRequiresPatch(content: string): boolean {
  // Only an affirmative finding requests a patch. Empty finding lists and an
  // optional section are not requests, even when their headings mention fixes.
  let optionalSectionLevel: number | undefined
  let requiredSectionLevel: number | undefined
  for (const line of content.replace(/[*\x60]/g, '').split(/\r?\n/)) {
    const heading = line.match(/^\s*(#{1,6})\s+(.+)/)
    if (heading) {
      const level = heading[1]!.length
      if (optionalSectionLevel !== undefined && level <= optionalSectionLevel) optionalSectionLevel = undefined
      if (requiredSectionLevel !== undefined && level <= requiredSectionLevel) requiredSectionLevel = undefined
      if (/(?:非必须|非必要|可选|仅供参考|optional)/i.test(heading[2]!)) optionalSectionLevel = level
      if (/^(?:MUST_PATCH|(?:必须|需要|待)(?:补写|补充|修正|修改)(?:的)?(?:项|项目|字段|清单)?)\s*[:：]?\s*$/i.test(heading[2]!)) {
        requiredSectionLevel = level
        continue
      }
    }
    if (optionalSectionLevel !== undefined) continue
    const clauses = line.split(/[。；;！？!?]|\.(?:\s|$)|[,，]\s*(?=[A-Z][A-Z_]+\s*(?:需要|需|应该|应当|建议|请|needs?\b))|[,，]?\s*(?:但是|但|然而|不过|\bbut\b|\bhowever\b)\s*/i)
    for (const part of clauses) {
      const clause = part.replace(/^\s*(?:#{1,6}\s*|[-+]\s*|>\s*)/, '').trim()
      if (!clause) continue
      if (/(?:^|[，,:：])\s*(?:若|如果|如需|如有|仅当)|\bif\b/i.test(clause)) continue
      if (/(?:非必须|非必要|不构成须补写|不建议据以打补丁)|(?:^|[，,:：])\s*(?:可选|仅供参考)|\boptional\b/i.test(clause)) continue
      if (/(?:无需|不需要|不必|不用|无须|无必须|无必要).{0,12}(?:补写|补充|修正|修改|patch)|(?:未见|未发现|没有发现|不存在).{0,100}(?:遗漏|缺失|缺少|补写|MUST_PATCH)|(?:无|没有|不构成|不标)\s*MUST_PATCH|\b(?:no|without)\s+(?:MUST_PATCH|patch)|\b(?:does?\s+not|doesn't|do\s+not)\s+need\s+(?:a\s+)?patch|\bnot\s+(?:a\s+)?MUST_PATCH/i.test(clause)) continue
      // A postposed empty-list verdict, not an empty report field that needs a fix.
      if (/(?:需要(?:补写|补充|修正|修改)的(?:具体)?(?:项|项目|字段)|(?:必须|待)(?:补写|补充|修正|修改)(?:项|清单)).{0,50}(?:(?:当前|目前)?为空|[:：]\s*(?:无|没有|0\s*项|none)\s*$)/i.test(clause)) continue
      if (/^MUST_PATCH\s*[:：-]?\s*(?:无|没有|否|不需要|无需|none|no|false)\s*[.，,。;；]?$/i.test(clause)) continue
      if (requiredSectionLevel !== undefined && /缺少|遗漏|缺失|错误|不一致|missing|incorrect|mismatch/i.test(clause)) return true
      if (/^MUST_PATCH(?:\s*[:：-]|\s*$)/i.test(clause)) return true
      if (/(?:需要|需(?=补写|补充|修正|修改|最小|在|对|将)|应当|应该|建议|请|应(?=补写|补充|修正|修改)).{0,24}(?:补写|补充|修正|修改)|(?:遗漏|缺少|缺失).{0,24}(?:补写|补充|修正|修改|需要)|\b(?:needs?|should)\s+(?:a\s+)?(?:small\s+)?patch\b/i.test(clause)) return true
    }
  }
  return false
}


/** Read-only recovery for the former pre-validation SOURCE_ROWS persistence bug.
 * Never discard unknown fields or trust a merely schema-valid historical draft:
 * only the same reviewed report's exact bytes can authenticate its old fields.
 * The recovered fields remain local until the normal write acknowledgement.
 */
async function recoverReviewedTemplateFillDraft(sessionId: string, expert: ExpertSessionMetadata, draft: ExpertTemplateFillDraft): Promise<ExpertTemplateFillDraft | undefined> {
  const template = expert.runtimeBinding?.outputTemplate?.content
  const reportPath = draft.completionReview?.reportPath
  if (!template || !reportPath) return undefined
  const found = await sessionService.findSessionFile(sessionId)
  if (!found) return undefined
  const written = await fs.readFile(reportPath, 'utf8')
  const input = createReadStream(found.filePath, { encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })
  let recovered: ExpertTemplateFillDraft | undefined
  const checked = new Set<string>()
  try {
    for await (const line of lines) {
      let entry: { type?: string; expert?: ExpertSessionMetadata }
      try { entry = JSON.parse(line) } catch { continue }
      if (entry.type !== 'session-meta' || !entry.expert) continue
      const prior = renderedTemplateFillDraft(readTemplateFillDraft(entry.expert))
      if (!prior || prior.templateId !== draft.templateId
        || prior.completionReview?.initialRenderedAt !== draft.completionReview?.initialRenderedAt
        || !prior.completionReview?.reportPath || !sameTemplateFillOutputPath(prior.completionReview.reportPath, reportPath)
        || entry.expert.runtimeBinding?.outputTemplate?.content !== template) continue
      const key = fingerprint({ fields: prior.fields, evidenceAbsorption: prior.evidenceAbsorption })
      if (checked.has(key)) continue
      checked.add(key)
      try {
        if (renderExpertTemplateFill(template, { format: EXPERT_TEMPLATE_FILL_FORMAT, templateId: prior.templateId, fields: prior.fields }).content === written) recovered = prior
      } catch { /* A rejected historical candidate is not a recovery source. */ }
    }
  } finally {
    lines.close()
    input.destroy()
  }
  return recovered
}

async function requireReportCompletenessReviewArtifact(
  workDir: string,
  policy: ExpertResearchArtifactPolicy,
  initialRenderedAt: string,
  reviewerReceipt: { artifactPath: string; completedAt: string } | undefined,
): Promise<{ content: string; requiresPatch: boolean }> {
  if (!policy.completionReviewPath) return
  const review = resolveExpertResearchArtifactPath({
    workDir,
    policy,
    artifactPath: policy.completionReviewPath,
    allowedKinds: ['final-output-review'],
  })
  if (
    !reviewerReceipt
    || reviewerReceipt.artifactPath !== policy.completionReviewPath
    || Date.parse(reviewerReceipt.completedAt) < Date.parse(initialRenderedAt)
  ) {
    throw new Error('报告完整性复核必须由本轮 expert-evidence-output-reviewer 成功写入并完成审计确认。')
  }
  const [content, stat] = await Promise.all([
    fs.readFile(review.absolutePath, 'utf8'),
    fs.stat(review.absolutePath),
  ])
  if (!content.trim()) throw new Error('报告完整性复核 Markdown 文件为空。')
  // Filesystem mtimes on Windows can be rounded or lag a server receipt. The
  // same-session reviewer receipt above is the authoritative completion time;
  // do not reject a real review because of timestamp granularity.
  return { content, requiresPatch: reviewMarkdownRequiresPatch(content) }
}

async function savedResearcherArtifactPaths(workDir: string | undefined, policy: ExpertResearchArtifactPolicy, records: readonly { artifactPath?: string }[]): Promise<string[]> {
  if (!workDir) return []
  const saved = await Promise.all(registeredResearchArtifactPaths(policy, records).map(async (artifactPath) => {
    try {
      const resolved = resolveExpertResearchArtifactPath({ workDir, policy, artifactPath, allowedKinds: ['researcher-report'] })
      return (await fs.readFile(resolved.absolutePath, 'utf8')).trim() ? resolved.relativePath : undefined
    } catch { return undefined }
  }))
  return saved.filter((artifactPath): artifactPath is string => Boolean(artifactPath))
}

export class ExpertSessionService {
  /**
   * Performs the one additive channel-route upgrade for a legacy active
   * commercialization session and persists it to both session stores. It does
   * not invent research evidence. A path lost by the old size gate can be restored
   * only from a unique validated dispatch and an existing non-empty file.
   */
  private async upgradeLegacyCommercializationChannelBinding(
    sessionId: string,
    workDir: string | undefined,
    expert: ExpertSessionMetadata,
  ): Promise<ExpertSessionMetadata> {
    let upgraded = await restoreTruncatedExpertRuntime(upgradeCommercializationResearchChannelRuntime(expert))
    const policy = upgraded.runtimeBinding?.researchArtifactPolicy
    if (workDir && policy?.researcherParts && upgraded.researchEvidence) {
      const records = await Promise.all(upgraded.researchEvidence.records.map(async (record) => {
        if (record.artifactPath) return record
        const recoveredPath = resolveResearchRecordArtifactPath(record, upgraded.researchSourceDispatches?.receipts)
        if (!recoveredPath) return record
        try {
          const resolved = resolveExpertResearchArtifactPath({ workDir, policy, artifactPath: recoveredPath, allowedKinds: ['researcher-report'] })
          if (!(await fs.readFile(resolved.absolutePath, 'utf8')).trim()) return record
          return { ...record, artifactPath: resolved.relativePath }
        } catch { return record }
      }))
      if (records.some((record, index) => record !== upgraded.researchEvidence!.records[index])) {
        upgraded = { ...upgraded, researchEvidence: { ...upgraded.researchEvidence, records } }
      }
    }
    if (upgraded === expert) return expert
    await sessionService.appendSessionMetadata(sessionId, { workDir, expert: upgraded })
    await expertRuntimeSessionStore.save(sessionId, upgraded)
    return upgraded
  }

  /**
   * Returns only package-declared Skill content for one delegated Expert agent.
   * It never exposes user materials, chat history, provider configuration, or
   * unrelated package skills. Omitted mappings deliberately return an empty
   * list so ordinary Experts keep their existing agent behaviour.
   */
  async getSubagentSkillContext(
    sessionId: string,
    agentType: string,
    requestedTaskKind?: unknown,
  ): Promise<ExpertSubagentSkillContext> {
    const normalizedAgentType = agentType.trim()
    if (!/^[a-z][a-z0-9-]{0,95}$/.test(normalizedAgentType)) {
      throw ApiError.badRequest('子代理类型无效。')
    }
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    let expert = hasActiveExpertRuntime(session.expert)
      ? session.expert
      : await expertRuntimeSessionStore.get(sessionId)
    if (!hasActiveExpertRuntime(expert)) {
      throw ApiError.badRequest('当前会话没有启用有效的 Expert Runtime。')
    }
    expert = await this.upgradeLegacyCommercializationChannelBinding(
      sessionId,
      session.workDir || session.projectRoot || session.projectPath,
      expert,
    )
    // The upgrade helper returns the broader persisted metadata type. Re-check
    // the active runtime invariant before using the optional binding below.
    if (!hasActiveExpertRuntime(expert)) {
      throw ApiError.badRequest('当前会话没有启用有效的 Expert Runtime。')
    }

    const artifactPolicy = expert.runtimeBinding.researchArtifactPolicy
    const evidencePolicy = expert.runtimeBinding.researchEvidenceReviewPolicy
    const absorptionPolicy = expert.runtimeBinding.researchEvidenceAbsorptionPolicy
    const sourceLibrarySkill = artifactPolicy
      ? expert.runtimeBinding.skills.find((skill) => skill.skillId === 'research-source-library')
      : undefined
    const sourceLibraryCatalog = sourceLibrarySkill
      ? parseResearchSourceLibrary(sourceLibrarySkill.content)
      : undefined
    const sourceLibraryExecutionPlan = sourceLibraryCatalog?.entries.length && artifactPolicy
      ? planResearchSourceLibraryExecutionBatches({
          catalog: sourceLibraryCatalog,
          researcherPaths: artifactPolicy.researcherPaths,
        })
      : undefined
    const sourceLibraryAttempts = sourceLibraryCatalog && sourceLibraryExecutionPlan
      ? matchResearchSourceLibraryAttempts({
          catalog: sourceLibraryCatalog,
          records: (expert.researchEvidence?.records ?? []).filter((record) => (
            evidencePolicy?.sourceAgentTypes.includes(record.agentType)
          )),
          dispatches: expert.researchSourceDispatches?.receipts,
        })
      : []
    const sourceLibraryCoverage = sourceLibraryExecutionPlan
      ? evaluateResearchSourceLibraryExecutionCoverage({
          plan: sourceLibraryExecutionPlan,
          attempts: sourceLibraryAttempts,
        })
      : undefined
    const isOutputReviewer = Boolean(
      artifactPolicy?.completionReviewPath && normalizedAgentType === 'expert-evidence-output-reviewer',
    )
    const isResearchLifecycleAgent = Boolean(
      artifactPolicy && evidencePolicy && (
        evidencePolicy.sourceAgentTypes.includes(normalizedAgentType) ||
        evidencePolicy.reviewerAgentType === normalizedAgentType ||
        absorptionPolicy?.absorberAgentType === normalizedAgentType ||
        isOutputReviewer
      ),
    )
    const isPostResearchLifecycleAgent = Boolean(
      evidencePolicy && (
        evidencePolicy.reviewerAgentType === normalizedAgentType
        || absorptionPolicy?.absorberAgentType === normalizedAgentType
        || isOutputReviewer
      ),
    )
    const savedResearcherPaths = artifactPolicy && isPostResearchLifecycleAgent
      ? await savedResearcherArtifactPaths(session.workDir || session.projectRoot || session.projectPath, artifactPolicy,
        (expert.researchEvidence?.records ?? []).filter((record) => evidencePolicy?.sourceAgentTypes.includes(record.agentType))) : []
    if (artifactPolicy && evidencePolicy && isPostResearchLifecycleAgent) {
      const completedResearcherPaths = new Set(savedResearcherPaths.map(researchArtifactRootPath))
      const missingResearcherPaths = artifactPolicy.researcherPaths.filter(
        (artifactPath) => !completedResearcherPaths.has(artifactPath),
      )
      if (missingResearcherPaths.length > 0) {
        const workDir = session.workDir || session.projectRoot || session.projectPath
        const writtenButUnauditedPaths = workDir
          ? (await Promise.all(missingResearcherPaths.map(async (artifactPath) => {
              try {
                const resolved = resolveExpertResearchArtifactPath({
                  workDir,
                  policy: artifactPolicy,
                  artifactPath,
                  allowedKinds: ['researcher-report'],
                })
                return (await fs.readFile(resolved.absolutePath, 'utf8')).trim() ? artifactPath : undefined
              } catch {
                return undefined
              }
            }))).filter((artifactPath): artifactPath is string => Boolean(artifactPath))
          : []
        if (writtenButUnauditedPaths.length > 0) {
          const stillMissingPaths = missingResearcherPaths.filter((artifactPath) => !writtenButUnauditedPaths.includes(artifactPath))
          throw new ApiError(
            409,
            '以下研究 Markdown 已写入，但真实浏览审计回执没有成功保存：' + writtenButUnauditedPaths.join('、')
              + '。不要等待或暂停；必须重新派遣对应研究子代理，使用本次真实 Playwright 审计记录重新提交。'
              + (stillMissingPaths.length > 0
                ? '以下研究 Markdown 尚未写入，必须同时继续或重新派遣对应研究子代理：' + stillMissingPaths.join('、') + '。'
                : ''),
            'EXPERT_RESEARCH_AUDIT_REPAIR_REQUIRED',
          )
        }
        throw new ApiError(
          409,
          '研究子代理仍在取证或尚未完成审计回执：' + missingResearcherPaths.join('、') + '。不得提前启动复核、字段吸收或最终报告；等待对应 researcher 完成后系统会继续。',
          'EXPERT_RESEARCH_SUBAGENTS_PENDING',
        )
      }
      if (sourceLibraryCoverage && !sourceLibraryCoverage.complete) {
        expertResearchAutoContinueService.schedule(sessionId)
        throw new ApiError(
          409,
          '公司 PM 核心来源库与开放平台仍有未产生真实浏览终态的入口：'
            + sourceLibraryCoverage.missingBatches.map((batch) => batch.artifactPath + ' 剩余 ' + batch.entries.length + ' 个').join('；')
            + '。系统会按每线最多 10 个 URL 的小批次，只补发未尝试项；opened、access_limited、failed/no-result 都算合法完成，不要求每站成功。',
          'EXPERT_RESEARCH_SOURCE_LIBRARY_RECOVERY_REQUIRED',
        )
      }
    }
    if (artifactPolicy && isResearchLifecycleAgent) {
      const workDir = session.workDir || session.projectRoot || session.projectPath
      if (!workDir) {
        throw new ApiError(409, '当前会话缺少调研任务说明的输出目录。', 'EXPERT_RESEARCH_BRIEF_REQUIRED')
      }
      try {
        await requireResearchBriefArtifact(workDir, artifactPolicy)
        if (absorptionPolicy?.absorberAgentType === normalizedAgentType) {
          await requireEvidenceReviewArtifact(workDir, artifactPolicy)
        }
        if (isOutputReviewer) {
          await requireEvidenceReviewArtifact(workDir, artifactPolicy)
          await requireReportFieldAbsorptionArtifact(workDir, artifactPolicy)
        }
      } catch (error) {
        const isAbsorber = absorptionPolicy?.absorberAgentType === normalizedAgentType
        throw new ApiError(409, isOutputReviewer
          ? `尚未先生成有效的报告字段吸收 Markdown：${error instanceof Error ? error.message : String(error)}`
          : isAbsorber
            ? `尚未先生成有效的独立复核 Markdown：${error instanceof Error ? error.message : String(error)}`
            : `尚未先生成有效的调研任务说明 Markdown：${error instanceof Error ? error.message : String(error)}`,
        isOutputReviewer ? 'EXPERT_RESEARCH_REPORT_ABSORPTION_REQUIRED' : isAbsorber ? 'EXPERT_RESEARCH_REVIEW_REQUIRED' : 'EXPERT_RESEARCH_BRIEF_REQUIRED')
      }
    }

    const skillIds = expert.runtimeBinding.subagentSkillIdsByAgentType?.[normalizedAgentType] ?? []
    const allowed = new Set(skillIds)
    const isResearcher = normalizedAgentType === 'expert-evidence-researcher'
    const researchTaskKind = normalizeExpertResearchTaskKind(requestedTaskKind)
    const researchSourcePlan = isResearcher && researchTaskKind === 'source-batch'
      ? sourceLibraryCoverage?.executionWave
      : undefined
    const subagentSkills = expert.runtimeBinding.skills
      .filter((skill) => allowed.has(skill.skillId))
      // A researcher receives its one structured batch below. Do not also send
      // the whole catalog and force the model to guess its ownership.
      .filter((skill) => !(researchSourcePlan || (isResearcher && researchTaskKind === 'targeted-evidence')) || skill.skillId !== 'research-source-library')
      .map((skill) => ({ ...skill }))
    return {
      expertId: expert.runtimeBinding.expertId,
      packId: expert.runtimeBinding.packId,
      packVersion: expert.runtimeBinding.packVersion,
      ...(artifactPolicy && isResearchLifecycleAgent ? {
        artifactPaths: {
          briefPath: artifactPolicy.briefPath,
          researcherPaths: isResearcher ? [...artifactPolicy.researcherPaths] : savedResearcherPaths,
          ...(artifactPolicy.researcherParts ? { researcherParts: true } : {}),
          reviewerPath: artifactPolicy.reviewerPath,
          auditPath: artifactPolicy.auditPath,
          ...(artifactPolicy.absorptionPath ? { absorptionPath: artifactPolicy.absorptionPath } : {}),
          ...(artifactPolicy.completionReviewPath ? { completionReviewPath: artifactPolicy.completionReviewPath } : {}),
        },
      } : {}),
      ...(isOutputReviewer
        && artifactPolicy?.absorptionPath
        && artifactPolicy.completionReviewPath
        && expert.templateFillDraft?.completionReview?.reportPath
        ? {
          outputReview: {
            briefPath: artifactPolicy.briefPath,
            absorptionPath: artifactPolicy.absorptionPath,
            completionReviewPath: artifactPolicy.completionReviewPath,
            reportPath: expert.templateFillDraft.completionReview.reportPath,
          },
        }
        : {}),
      ...(researchSourcePlan ? { researchSourcePlan } : {}),
      ...(isResearcher ? { researchTaskKind } : {}),
      skills: subagentSkills,
    }
  }


  /**
   * Exposes only completed researcher handoffs to the ZIP-declared reviewer.
   * It never exposes user materials, chat history, browser profiles, or other
   * agent types, and ordinary Experts receive an empty list.
   */
  async getSubagentResearchEvidenceContext(
    sessionId: string,
    agentType: string,
  ): Promise<ExpertSubagentResearchEvidenceContext | undefined> {
    const normalizedAgentType = agentType.trim()
    if (!/^[a-z][a-z0-9-]{0,95}$/.test(normalizedAgentType)) {
      throw ApiError.badRequest('子代理类型无效。')
    }
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ` + sessionId)
    const expert = hasActiveExpertRuntime(session.expert)
      ? session.expert
      : await expertRuntimeSessionStore.get(sessionId)
    if (!hasActiveExpertRuntime(expert)) {
      throw ApiError.badRequest('当前会话没有启用有效的 Expert Runtime。')
    }
    const policy = expert.runtimeBinding.researchEvidenceReviewPolicy
    if (!policy || policy.reviewerAgentType !== normalizedAgentType) return undefined

    const artifactPolicy = expert.runtimeBinding.researchArtifactPolicy
    const sourceRecords = (expert.researchEvidence?.records ?? [])
      .filter((record) => policy.sourceAgentTypes.includes(record.agentType))
    if (artifactPolicy) {
      const workDir = session.workDir || session.projectRoot || session.projectPath
      if (!workDir) throw ApiError.badRequest('当前会话缺少研究产物目录。')
      try {
        await requireResearchBriefArtifact(workDir, artifactPolicy)
      } catch (error) {
        throw new ApiError(409, `尚未先生成有效的调研任务说明 Markdown：${error instanceof Error ? error.message : String(error)}`, 'EXPERT_RESEARCH_BRIEF_REQUIRED')
      }
      const researcherPaths = await savedResearcherArtifactPaths(workDir, artifactPolicy, sourceRecords)
      const artifactPaths = new Set(researcherPaths.map(researchArtifactRootPath))
      const allResearchersPersisted = artifactPolicy.researcherPaths.every((artifactPath) => artifactPaths.has(artifactPath))
      if (!allResearchersPersisted) {
        throw ApiError.badRequest('文件化研究交接尚未齐全：各研究方向必须先保存本会话的 Markdown 分片及真实浏览审计。')
      }
      let routeAuditSummary = ''
      if (artifactPolicy.routeCompletion?.mode === 'dynamic-route-status-v2') {
        const briefContent = await fs.readFile(resolveExpertResearchArtifactPath({
          workDir,
          policy: artifactPolicy,
          artifactPath: artifactPolicy.briefPath,
          allowedKinds: ['research-brief'],
        }).absolutePath, 'utf8')
        const routeEvaluation = evaluateExpertResearchRequiredRoutes({
          artifactPolicy,
          researchBriefMarkdown: briefContent,
          sourceRecords,
        })
        routeAuditSummary = formatExpertResearchRouteEvaluation(routeEvaluation)
        if (!routeEvaluation.complete) {
          throw new ApiError(
            409,
            '任务书中已计划的具体内容路线尚缺真实取证尝试：'
              + routeEvaluation.recoveries.map((recovery) => recovery.routeId + '（' + recovery.nextStep + '）').join('、')
              + '。系统会只补派对应 Markdown 的窄研究子代理；不要把其它网页数量当作替代。',
            'EXPERT_RESEARCH_REQUIRED_ROUTE_RECOVERY_REQUIRED',
          )
        }
      }
      const artifactRoot = path.resolve(workDir, artifactPolicy.directory)
      const auditPath = path.resolve(workDir, ...artifactPolicy.auditPath.split('/'))
      if (auditPath !== artifactRoot && !auditPath.startsWith(artifactRoot + path.sep)) {
        throw ApiError.badRequest('浏览器审计 Markdown 路径越出当前会话研究目录。')
      }
      await fs.mkdir(path.dirname(auditPath), { recursive: true })
      await fs.writeFile(
        auditPath,
        (() => {
          const sourceLibraryContent = expert.runtimeBinding.skills.find((skill) => skill.skillId === 'research-source-library')?.content
          const sourceLibraryPlan = sourceLibraryContent
            ? planResearchSourceLibraryExecutionBatches({
                catalog: parseResearchSourceLibrary(sourceLibraryContent),
                researcherPaths: artifactPolicy.researcherPaths,
              })
            : undefined
          return renderBrowserAuditArtifact(
            sourceRecords,
            sourceLibraryContent,
            sourceLibraryPlan,
            expert.researchSourceDispatches?.receipts,
          ) + routeAuditSummary
        })(),
        'utf8',
      )
      return {
        expertId: expert.runtimeBinding.expertId,
        packId: expert.runtimeBinding.packId,
        packVersion: expert.runtimeBinding.packVersion,
        reviewerEvidenceOnly: true,
        artifactPaths: {
          briefPath: artifactPolicy.briefPath,
          researcherPaths,
          ...(artifactPolicy.researcherParts ? { researcherParts: true } : {}),
          reviewerPath: artifactPolicy.reviewerPath,
          auditPath: artifactPolicy.auditPath,
          ...(artifactPolicy.absorptionPath ? { absorptionPath: artifactPolicy.absorptionPath } : {}),
          ...(artifactPolicy.completionReviewPath ? { completionReviewPath: artifactPolicy.completionReviewPath } : {}),
        },
        // The server deliberately keeps the detailed content out of this model handoff.
        records: [],
      }
    }

    return {
      expertId: expert.runtimeBinding.expertId,
      packId: expert.runtimeBinding.packId,
      packVersion: expert.runtimeBinding.packVersion,
      reviewerEvidenceOnly: true,
      records: sourceRecords.map((record) => ({
        ...record,
        entries: record.entries.map((entry) => ({ ...entry })),
      })),
    }
  }

  /**
   * Exposes the server-generated post-review absorption context only after the
   * ZIP-designated reviewer has completed. The caller receives no user chat,
   * browser profile, or undeclared Expert data.
   */
  async getPostReviewEvidenceAbsorptionContext(
    sessionId: string,
    agentType: string,
  ): Promise<ExpertPostReviewEvidenceAbsorptionContext | undefined> {
    const normalizedAgentType = agentType.trim()
    if (!/^[a-z][a-z0-9-]{0,95}$/.test(normalizedAgentType)) {
      throw ApiError.badRequest('子代理类型无效。')
    }
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    const expert = hasActiveExpertRuntime(session.expert)
      ? session.expert
      : await expertRuntimeSessionStore.get(sessionId)
    if (!hasActiveExpertRuntime(expert)) {
      throw ApiError.badRequest('当前会话没有启用有效的 Expert Runtime。')
    }
    const policy = expert.runtimeBinding.researchEvidenceAbsorptionPolicy
    if (!policy || policy.reviewerAgentType !== normalizedAgentType) return undefined
    const artifactPolicy = expert.runtimeBinding.researchArtifactPolicy
    const reviewerArtifactPath = expert.researchEvidenceReviewer?.reviewer?.artifactPath
    if (artifactPolicy && reviewerArtifactPath === artifactPolicy.reviewerPath) {
      const workDir = session.workDir || session.projectRoot || session.projectPath
      if (!workDir) throw ApiError.badRequest('当前会话缺少研究产物目录。')
      try {
        await requireEvidenceReviewArtifact(workDir, artifactPolicy)
      } catch {
        // A prior denied/interrupted Write may have left a stale receipt. Do not
        // dispatch E until D's declared Markdown is physically readable.
        return undefined
      }
    }
    const instruction = buildExpertPostReviewEvidenceAbsorptionInstruction({
      policy,
      researchEvidence: expert.researchEvidence,
      reviewerState: expert.researchEvidenceReviewer,
      artifactPolicy: expert.runtimeBinding.researchArtifactPolicy,
      templateFields: expert.runtimeBinding.outputTemplate
        ? deriveExpertTemplateFillSchema(expert.runtimeBinding.outputTemplate.content).fields
        : undefined,
    })
    if (!instruction) return undefined
    return {
      expertId: expert.runtimeBinding.expertId,
      packId: expert.runtimeBinding.packId,
      packVersion: expert.runtimeBinding.packVersion,
      instruction,
    }
  }

  async enterExpertMode(sessionId: string, expertId: string, researchBrowserConnectionInput?: unknown, researchBrowserPresentationInput?: unknown): Promise<ExpertSessionMetadata> {
    return sessionRuntimeTransitionService.run(sessionId, () => this.enterExpertModeInTransition(sessionId, expertId, researchBrowserConnectionInput, researchBrowserPresentationInput))
  }

  private async enterExpertModeInTransition(sessionId: string, expertId: string, researchBrowserConnectionInput?: unknown, researchBrowserPresentationInput?: unknown): Promise<ExpertSessionMetadata> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    const expert = await registry.getExpert(expertId)
    if (!expert) throw ApiError.notFound(`Expert not found: ${expertId}`)
    const now = new Date().toISOString()
    let runtimeContext
    try {
      runtimeContext = await runtime.loadContext(expert.id)
    } catch (error) {
      if (error instanceof ExpertPackValidationError) {
        throw new ApiError(400, error.message, 'EXPERT_PACK_INCOMPLETE')
      }
      throw error
    }
    const previousRefs = session.expert?.materialRefs ?? []
    const runtimeBinding = createExpertRuntimeBinding(runtimeContext, now)
    let researchBrowserConnection
    let researchBrowserPresentation
    try {
      researchBrowserConnection = resolveExpertResearchBrowserConnection(
        runtimeBinding.researchBrowserPolicy,
        researchBrowserConnectionInput,
        now,
      )
      researchBrowserPresentation = resolveExpertResearchBrowserPresentation(
        runtimeBinding.researchBrowserPolicy,
        researchBrowserConnection,
        researchBrowserPresentationInput,
      )
    } catch (error) {
      throw ApiError.badRequest(error instanceof Error ? error.message : String(error))
    }
    const metadata: ExpertSessionMetadata = {
      mode: 'expert',
      expertId: expert.id,
      expertName: expert.name,
      packId: expert.packId,
      packVersion: expert.packVersion,
      status: 'active',
      runtimeBinding,
      ...(researchBrowserConnection ? { researchBrowserConnection } : {}),
      ...(researchBrowserPresentation ? { researchBrowserPresentation } : {}),
      materialRefs: previousRefs,
      intakeState: session.expert?.expertId === expert.id ? session.expert.intakeState : initialIntakeState(now),
      startedAt: session.expert?.startedAt ?? now,
      updatedAt: now,
    }
    await expertRuntimeSessionStore.save(sessionId, metadata)
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: session.workDir || session.projectRoot || session.projectPath,
      expert: metadata,
    })
    const persistedExpert = (await sessionService.getSession(sessionId))?.expert ?? await expertRuntimeSessionStore.get(sessionId)
    if (
      !persistedExpert ||
      persistedExpert.expertId !== metadata.expertId ||
      persistedExpert.status !== 'active' ||
      !hasActiveExpertRuntime(persistedExpert)
    ) {
      throw new ApiError(500, `Failed to persist Expert Mode for session: ${sessionId}`, 'EXPERT_MODE_PERSISTENCE_FAILED')
    }
    // This precise session may already be backed by a CLI with an ordinary
    // tool pool. The next turn must start a new CLI with the expert deny list.
    await conversationService.stopSessionAndWait(sessionId)
    return persistedExpert
  }

  async exitExpertMode(sessionId: string): Promise<ExpertSessionMetadata> {
    return sessionRuntimeTransitionService.run(sessionId, () => this.exitExpertModeInTransition(sessionId))
  }

  private async exitExpertModeInTransition(sessionId: string): Promise<ExpertSessionMetadata> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    if (!session.expert) throw ApiError.notFound(`Expert mode not active for session: ${sessionId}`)
    const now = new Date().toISOString()
    const {
      runtimeBinding: _runtimeBinding,
      researchBrowserConnection: _researchBrowserConnection,
      researchBrowserPresentation: _researchBrowserPresentation,
      ...retainedExpertMetadata
    } = session.expert
    const metadata: ExpertSessionMetadata = {
      ...retainedExpertMetadata,
      status: 'exited',
      updatedAt: now,
      exitedAt: now,
    }
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: session.workDir || session.projectRoot || session.projectPath,
      expert: metadata,
    })
    await expertRuntimeSessionStore.remove(sessionId)
    expertBrowserActivityService.clear(sessionId)
    // Exit has to remove the prior expert deny list before normal chat resumes.
    await conversationService.stopSessionAndWait(sessionId)
    return metadata
  }


  async listMaterials(sessionId: string): Promise<{ materialRefs: ExpertMaterialRef[] }> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    return { materialRefs: session.expert?.materialRefs ?? [] }
  }

  async submitIntakeStep(
    sessionId: string,
    input: { stepId?: string; answer?: unknown; answers?: Record<string, unknown>; choiceId?: string },
  ): Promise<{
    expert: ExpertSessionMetadata
    intakeState: ExpertIntakeState
  }> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound('Session not found: ' + sessionId)
    if (!session.expert) throw ApiError.badRequest('请先进入专家 Mode。')

    const now = new Date().toISOString()
    const previous = session.expert.intakeState ?? initialIntakeState(now)
    const answers = { ...previous.answers, ...(input.answers ?? {}) }
    const completedStepIds = new Set(previous.completedStepIds)
    if (input.stepId) {
      answers[input.stepId] = input.answer ?? input.answers?.[input.stepId] ?? answers[input.stepId]
      completedStepIds.add(input.stepId)
    }
    const intakeState: ExpertIntakeState = {
      currentStepId: input.stepId,
      answers,
      errors: {},
      completedStepIds: [...completedStepIds],
      updatedAt: now,
    }
    const metadata: ExpertSessionMetadata = {
      ...session.expert,
      status: 'collecting',
      intakeState,
      updatedAt: now,
      error: undefined,
    }
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: session.workDir || session.projectRoot || session.projectPath,
      expert: metadata,
    })
    return { expert: metadata, intakeState }
  }

  async recordResearchDeliveryDecision(
    sessionId: string,
    input: { questionId: string; choiceIds: string[]; unresolvedEvidence?: string[] },
  ): Promise<{ expert: ExpertSessionMetadata; researchDelivery: ExpertResearchDeliveryState }> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    const expert = hasActiveExpertRuntime(session.expert)
      ? session.expert
      : await expertRuntimeSessionStore.get(sessionId)
    if (!hasActiveExpertRuntime(expert)) {
      throw ApiError.badRequest('当前会话没有启用可用的专家交付确认。请重新进入专家 Mode 后重试。')
    }

    const policy = expert.runtimeBinding.researchDeliveryPolicy
    if (!policy) {
      throw new ApiError(400, '当前专家没有声明研究交付确认规则，不能提交该确认。', 'EXPERT_RESEARCH_DELIVERY_NOT_CONFIGURED')
    }

    const now = new Date().toISOString()
    let researchDelivery: ExpertResearchDeliveryState
    try {
      researchDelivery = resolveExpertResearchDeliveryDecision(policy, {
        questionId: input.questionId,
        choiceIds: input.choiceIds,
        unresolvedEvidence: input.unresolvedEvidence,
        decidedAt: now,
      })
    } catch (error) {
      throw new ApiError(400, `研究交付确认无效：${error instanceof Error ? error.message : String(error)}`, 'EXPERT_RESEARCH_DELIVERY_INVALID')
    }

    // User-facing accept_current_scope is authoritative for allow-with-evidence-gaps
    // packs. Incomplete audits (Google VPN/CAPTCHA, partial subagents) stay in
    // unresolvedEvidence; they must not veto an explicit human acceptance.

    const metadata: ExpertSessionMetadata = {
      ...expert,
      researchDelivery,
      updatedAt: now,
      error: undefined,
    }
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: session.workDir || session.projectRoot || session.projectPath,
      expert: metadata,
    })
    if (metadata.status === 'active') await expertRuntimeSessionStore.save(sessionId, metadata)
    return { expert: metadata, researchDelivery }
  }


  /**
   * Persists an audit-only receipt after a child runner has constructed and
   * injected one exact A/B/C source package. This is never a generation gate:
   * a transport problem is visible as an absent receipt and the browser audit
   * remains the source of truth for actual attempts.
   */
  async recordResearchSourceDispatch(
    sessionId: string,
    input: {
      agentId: unknown
      agentType: unknown
      artifactPath: unknown
      batchFingerprint: unknown
      coreEntryCount: unknown
      openEntryCount: unknown
    },
  ): Promise<{ expert: ExpertSessionMetadata; receipt: ExpertResearchSourceLibraryDispatchReceipt }> {
    return withExpertResearchSourceDispatchLock(sessionId, async () => {
      // Re-read inside the shared lock. A/B/C researchers can finish together;
      // merging from a pre-lock snapshot would let the last writer erase the
      // other two receipts.
      const session = await sessionService.getSession(sessionId)
      if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
      let expert = hasActiveExpertRuntime(session.expert) ? session.expert : await expertRuntimeSessionStore.get(sessionId)
      if (!hasActiveExpertRuntime(expert)) throw ApiError.badRequest('当前会话没有启用可用的 Expert Runtime。')
      expert = await this.upgradeLegacyCommercializationChannelBinding(
        sessionId,
        session.workDir || session.projectRoot || session.projectPath,
        expert,
      )
      const agentId = typeof input.agentId === 'string' ? input.agentId.trim() : ''
      const agentType = typeof input.agentType === 'string' ? input.agentType.trim() : ''
      const artifactPath = exactArtifactPath(input.artifactPath)
      const batchFingerprint = typeof input.batchFingerprint === 'string' ? input.batchFingerprint.trim() : ''
      const coreEntryCount = Number.isInteger(input.coreEntryCount) && (input.coreEntryCount as number) >= 0
        ? input.coreEntryCount as number
        : undefined
      const openEntryCount = Number.isInteger(input.openEntryCount) && (input.openEntryCount as number) >= 0
        ? input.openEntryCount as number
        : undefined
      if (!agentId || agentType !== 'expert-evidence-researcher' || !artifactPath || !batchFingerprint || coreEntryCount === undefined || openEntryCount === undefined) {
        throw ApiError.badRequest('研究来源包分发回执无效。')
      }

      const artifactPolicy = expert.runtimeBinding.researchArtifactPolicy
      const sourceLibraryContent = expert.runtimeBinding.skills.find((skill) => skill.skillId === 'research-source-library')?.content
      const sourceLibraryCatalog = sourceLibraryContent ? parseResearchSourceLibrary(sourceLibraryContent) : undefined
      const sourceLibraryPlan = artifactPolicy && sourceLibraryCatalog
        ? planResearchSourceLibraryExecutionBatches({
            catalog: sourceLibraryCatalog,
            researcherPaths: artifactPolicy.researcherPaths,
          })
        : undefined
      const sourceLibraryAttempts = sourceLibraryCatalog && sourceLibraryPlan
        ? matchResearchSourceLibraryAttempts({
            catalog: sourceLibraryCatalog,
            records: (expert.researchEvidence?.records ?? []).filter((record) => (
              expert.runtimeBinding.researchEvidenceReviewPolicy?.sourceAgentTypes.includes(record.agentType)
            )),
            dispatches: expert.researchSourceDispatches?.receipts,
          })
        : []
      const executionWave = sourceLibraryPlan
        ? evaluateResearchSourceLibraryExecutionCoverage({
            plan: sourceLibraryPlan,
            attempts: sourceLibraryAttempts,
          }).executionWave
        : undefined
      const expected = executionWave?.batches.find((batch) => batch.artifactPath === artifactPath)
      if (!expected
        || expected.batchFingerprint !== batchFingerprint
        || expected.entries.filter((entry) => entry.tier === 'core').length !== coreEntryCount
        || expected.entries.filter((entry) => entry.tier === 'open').length !== openEntryCount
      ) {
        throw new ApiError(409, '研究来源包与当前会话的 A/B/C 分配不一致；拒绝记录错误回执。', 'EXPERT_RESEARCH_SOURCE_DISPATCH_MISMATCH')
      }

      const previousReceipt = expert.researchSourceDispatches?.receipts.find((receipt) => receipt.artifactPath === artifactPath && receipt.batchFingerprint === batchFingerprint)
      if (previousReceipt?.agentId === agentId) return { expert, receipt: previousReceipt }
      const dispatchedAt = new Date().toISOString()
      const receipt: ExpertResearchSourceLibraryDispatchReceipt = {
        artifactPath,
        batchFingerprint,
        coreEntryCount,
        openEntryCount,
        agentId,
        dispatchedAt,
        retryCount: previousReceipt?.completedAt ? (previousReceipt.retryCount ?? 0) + 1 : previousReceipt?.retryCount ?? 0,
      }
      const current = expert.researchSourceDispatches
      const receipts = [
        ...(current?.receipts ?? []).filter((candidate) => !(
          candidate.artifactPath === artifactPath && candidate.batchFingerprint === batchFingerprint
        )),
        receipt,
      ].slice(-64)
      const hasPriorArtifactEvidence = (expert.researchEvidence?.records ?? []).some((record) => (
        record.artifactPath && researchArtifactRootPath(record.artifactPath) === artifactPath
        && expert.runtimeBinding.researchEvidenceReviewPolicy?.sourceAgentTypes.includes(record.agentType)
      ))
      const recoveredBatchFingerprints = hasPriorArtifactEvidence && expected.entries.length > 0
        ? [...new Set([...(current?.recoveredBatchFingerprints ?? []), batchFingerprint])].slice(-32)
        : [...(current?.recoveredBatchFingerprints ?? [])]
      const metadata: ExpertSessionMetadata = {
        ...expert,
        researchSourceDispatches: {
          receipts,
          ...(recoveredBatchFingerprints.length ? { recoveredBatchFingerprints } : {}),
        },
        updatedAt: dispatchedAt,
      }
      await sessionService.appendSessionMetadata(sessionId, {
        workDir: session.workDir || session.projectRoot || session.projectPath,
        expert: metadata,
      })
      await expertRuntimeSessionStore.save(sessionId, metadata)
      return { expert: metadata, receipt }
    })
  }

  async reconcileResearchSourceCompletionNotifications(sessionId: string): Promise<ExpertSessionMetadata | undefined> {
    return withExpertResearchSourceDispatchLock(sessionId, async () => {
      const session = await sessionService.getSession(sessionId)
      const expert = hasActiveExpertRuntime(session?.expert) ? session.expert : await expertRuntimeSessionStore.get(sessionId)
      const dispatches = expert?.researchSourceDispatches
      if (!expert || !dispatches?.receipts.some((receipt) => !receipt.completedAt)) return expert ?? undefined
      const notifications = await sessionService.getSessionTaskNotifications(sessionId)
      let changed = false
      const receipts = dispatches.receipts.map((receipt) => {
        if (receipt.completedAt) return receipt
        const ended = notifications.find((event) => event.taskId === receipt.agentId && ['completed', 'failed', 'stopped'].includes(event.status) && event.timestamp && Date.parse(event.timestamp) >= Date.parse(receipt.dispatchedAt))
        if (!ended?.timestamp) return receipt
        changed = true
        return { ...receipt, completedAt: ended.timestamp, retryCount: receipt.retryCount ?? 0 }
      })
      if (!changed) return expert
      const updated = { ...expert, researchSourceDispatches: { ...dispatches, receipts }, updatedAt: new Date().toISOString() }
      await sessionService.appendSessionMetadata(sessionId, { workDir: session?.workDir || session?.projectRoot || session?.projectPath, expert: updated })
      await expertRuntimeSessionStore.save(sessionId, updated)
      return updated
    })
  }

  async settleFinishedResearchSourceBatch(sessionId: string, batch: FinishedResearchSourceBatch): Promise<void> {
    await withExpertResearchSourceDispatchLock(sessionId, async () => {
      const session = await sessionService.getSession(sessionId)
      const expert = hasActiveExpertRuntime(session?.expert) ? session.expert : await expertRuntimeSessionStore.get(sessionId)
      const binding = expert?.runtimeBinding
      const receipt = expert?.researchSourceDispatches?.receipts.find((item) => item.agentId === batch.agentId && item.artifactPath === batch.artifactPath && item.batchFingerprint === batch.batchFingerprint)
      if (!binding?.researchArtifactPolicy || !receipt?.completedAt || (receipt.retryCount ?? 0) < 1) return
      const catalog = parseResearchSourceLibrary(binding.skills.find((skill) => skill.skillId === 'research-source-library')?.content)
      const plan = planResearchSourceLibraryExecutionBatches({ catalog, researcherPaths: binding.researchArtifactPolicy.researcherPaths })
      if (!plan) return
      const coverage = evaluateResearchSourceLibraryExecutionCoverage({ plan, attempts: matchResearchSourceLibraryAttempts({ catalog, records: expert?.researchEvidence?.records ?? [], dispatches: expert?.researchSourceDispatches?.receipts }) })
      const missing = coverage.executionWave.batches.find((item) => item.artifactPath === batch.artifactPath && item.batchFingerprint === batch.batchFingerprint)
      if (!missing?.entries.length) return
      const expected = new Set(batch.candidateUrls)
      const entries = missing.entries.filter((entry) => expected.has(entry.candidateUrl)).map((entry) => ({
        target: entry.candidateUrl,
        kind: 'url',
        status: 'interrupted',
        detail: '本来源批次及一次定向补查均已结束，仍未取得该入口的浏览回执；属于未执行/未完成的流程缺口，不代表网站受限、失败或已查询，不得作为事实来源。',
      }))
      if (entries.length) await this.recordResearchAuditUnlocked(sessionId, { agentId: batch.agentId, agentType: 'expert-evidence-researcher', artifactPath: batch.artifactPath, entries, interrupted: true, completed: true })
    })
  }

  async recordResearchAudit(
    sessionId: string,
    input: { agentId: unknown; agentType: unknown; entries: unknown; artifactPath?: unknown; content?: unknown; interrupted?: unknown; completed?: unknown },
  ): Promise<{ expert: ExpertSessionMetadata; researchCompletion: ExpertResearchCompletionState; researchEvidence?: ExpertResearchEvidenceState }> {
    try {
      return await withExpertResearchSourceDispatchLock(sessionId, async () => {
        // A rejected audit must not erase the independent fact that its worker ended.
        if (input.completed === true || input.interrupted === true) {
          const session = await sessionService.getSession(sessionId)
          const expert = hasActiveExpertRuntime(session?.expert) ? session.expert : await expertRuntimeSessionStore.get(sessionId)
          const dispatches = expert?.researchSourceDispatches
          if (expert && dispatches?.receipts.some((receipt) => receipt.agentId === input.agentId && !receipt.completedAt)) {
            const now = new Date().toISOString()
            const updated = { ...expert, researchSourceDispatches: { ...dispatches, receipts: dispatches.receipts.map((receipt) => receipt.agentId === input.agentId ? { ...receipt, completedAt: receipt.completedAt ?? now } : receipt) }, updatedAt: now }
            await sessionService.appendSessionMetadata(sessionId, { workDir: session?.workDir || session?.projectRoot || session?.projectPath, expert: updated })
            await expertRuntimeSessionStore.save(sessionId, updated)
          }
        }
        return this.recordResearchAuditUnlocked(sessionId, input)
      })
    } finally {
      // Publish after releasing the shared receipt lock, including rejected
      // audits whose worker-completed marker was independently persisted.
      expertResearchAutoContinueService.schedule(sessionId)
    }
  }

  private async recordResearchAuditUnlocked(
    sessionId: string,
    input: { agentId: unknown; agentType: unknown; entries: unknown; artifactPath?: unknown; content?: unknown; interrupted?: unknown; completed?: unknown },
  ): Promise<{ expert: ExpertSessionMetadata; researchCompletion: ExpertResearchCompletionState; researchEvidence?: ExpertResearchEvidenceState }> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    let expert = hasActiveExpertRuntime(session.expert) ? session.expert : await expertRuntimeSessionStore.get(sessionId)
    if (!hasActiveExpertRuntime(expert)) throw ApiError.badRequest('当前会话没有启用可用的 Expert Runtime。')
    expert = await this.upgradeLegacyCommercializationChannelBinding(
      sessionId,
      session.workDir || session.projectRoot || session.projectPath,
      expert,
    )
    const completionPolicy = expert.runtimeBinding.researchCompletionPolicy
    const evidencePolicy = expert.runtimeBinding.researchEvidenceReviewPolicy
    const absorptionPolicy = expert.runtimeBinding.researchEvidenceAbsorptionPolicy
    const artifactPolicy = expert.runtimeBinding.researchArtifactPolicy
    const rawAgentType = typeof input.agentType === 'string' ? input.agentType : ''
    const reportedPath = reportedArtifactPath(input.artifactPath) ?? exactArtifactPath(input.content)
    const interrupted = input.interrupted === true
    const agentType = reconcileFileFirstExpertAgentType({
      agentType: rawAgentType,
      workDir: session.workDir || session.projectRoot || session.projectPath,
      policy: artifactPolicy,
      artifactPath: reportedPath,
    })
    const tracksCompletion = Boolean(completionPolicy?.trackedAgentTypes.includes(agentType))
    const tracksEvidence = Boolean(evidencePolicy?.sourceAgentTypes.includes(agentType))
    const tracksReviewer = Boolean(absorptionPolicy?.reviewerAgentType === agentType)
    const tracksOutputReviewer = Boolean(artifactPolicy?.completionReviewPath && agentType === 'expert-evidence-output-reviewer')
    if (!tracksCompletion && !tracksEvidence && !tracksReviewer && !tracksOutputReviewer) {
      return { expert, researchCompletion: expert.researchCompletion ?? { audits: [], updatedAt: new Date().toISOString() } }
    }
    let evidenceInput: { agentId: unknown; agentType: unknown; entries: unknown; content: unknown; artifactPath?: string } = {
      agentId: input.agentId,
      agentType,
      entries: input.entries,
      content: input.content,
      ...(reportedPath ? { artifactPath: reportedPath } : {}),
    }
    if (artifactPolicy && (tracksEvidence || tracksReviewer || tracksOutputReviewer)) {
      const artifactWorkDir = session.workDir || session.projectRoot || session.projectPath
      if (!artifactWorkDir) {
        throw new ApiError(400, '当前会话缺少研究产物目录。', 'EXPERT_RESEARCH_ARTIFACT_INVALID')
      }
      try {
        await requireResearchBriefArtifact(artifactWorkDir, artifactPolicy)
      } catch (error) {
        throw new ApiError(409, `尚未先生成有效的调研任务说明 Markdown：${error instanceof Error ? error.message : String(error)}`, 'EXPERT_RESEARCH_BRIEF_REQUIRED')
      }
      const requestedPath = reportedPath
        ?? (tracksOutputReviewer ? artifactPolicy.completionReviewPath : undefined)
        ?? (tracksReviewer ? artifactPolicy.reviewerPath : undefined)
      // A natural-language final handoff must never decide whether real browser
      // audit data is accepted. When the runtime can identify the saved Write
      // destination, use it as an internal transport hint; otherwise preserve the
      // free-form handoff and audited browser entries without fabricating a path.
      if (requestedPath) {
        try {
          const resolved = resolveExpertResearchArtifactPath({
            workDir: artifactWorkDir,
            policy: artifactPolicy,
            artifactPath: requestedPath,
            allowedKinds: tracksOutputReviewer
              ? ['final-output-review']
              : tracksReviewer
                ? ['evidence-review']
                : ['researcher-report'],
          })
          // A server-planned narrow recovery intentionally uses a fresh agent id
          // to update the same Markdown path. recordExpertResearchEvidence merges
          // its new audit with the prior real attempts instead of discarding either.
          const content = await fs.readFile(resolved.absolutePath, 'utf8')
          if (!content.trim()) throw new Error('研究 Markdown 文件为空。')
          // maxCharacters is a splitting hint, never a reason to discard a saved file or its audit.
          evidenceInput = { ...input, agentType, content, artifactPath: resolved.relativePath }
        } catch {
          // A failed child may still have a real browser audit for this exact
          // source batch. Keep the declared path only for an interruption
          // receipt, and use a synthetic no-claims handoff when the Markdown
          // is not yet durable so the remaining source queue can advance.
          const { artifactPath: _artifactPath, ...artifactlessInput } = input
          evidenceInput = interrupted && reportedPath
            ? {
                ...artifactlessInput,
                agentType,
                artifactPath: reportedPath,
                content: typeof input.content === 'string' && input.content.trim()
                  ? input.content
                  : '研究子代理在当前来源小批次完成前中断；以下记录仅用于恢复队列和浏览审计，不代表入口已打开、访问受限或访问失败。',
              }
            : { ...artifactlessInput, agentType, content: input.content }
        }
      }
    }
    const now = new Date().toISOString()
    let researchCompletion: ExpertResearchCompletionState = expert.researchCompletion ?? { audits: [], updatedAt: now }
    let researchEvidence: ExpertResearchEvidenceState | undefined
    let researchEvidenceReviewer: ExpertResearchEvidenceReviewerState | undefined
    let reportCompletenessReview: { agentId: string; artifactPath: string; completedAt: string } | undefined
    try {
      if (tracksCompletion) {
        researchCompletion = recordExpertResearchAudit(expert.researchCompletion, {
          ...evidenceInput,
          recordedAt: now,
          allowEmptyEntries: Boolean(completionPolicy?.completedWithoutBrowserAuditAgentTypes?.includes(agentType)),
        })
      }
      if (evidencePolicy && tracksEvidence) {
        researchEvidence = recordExpertResearchEvidence(expert.researchEvidence, evidencePolicy, {
          ...evidenceInput,
          recordedAt: now,
        })
        // This format is no longer enabled by the commercialization Expert, but
        // other packages may explicitly opt into it. In that case validate the
        // Markdown's asserted browser outcome against the runtime record before
        // metadata is persisted. It is an audit-truth check, not a general
        // report-format gate: unreadable/no-path researcher handoffs retain their
        // normal recovery behavior.
        if (!interrupted && absorptionPolicy?.requireResearchArtifactAuditAssertions && evidenceInput.artifactPath && typeof evidenceInput.content === 'string') {
          const record = researchEvidence.records.find((candidate) => (
            candidate.agentId === String(evidenceInput.agentId ?? '')
            && candidate.artifactPath === evidenceInput.artifactPath
          ))
          const truthErrors = validateExpertResearchArtifactAuditTruth({
            policy: absorptionPolicy,
            content: evidenceInput.content,
            entries: record?.entries ?? [],
          })
          if (truthErrors.length) throw new Error(truthErrors.join('；'))
        }
      }
      // A file-first pack requires its declared review Markdown, but a compact
      // template-fill Expert without researchArtifactPolicy still needs to persist
      // its reviewer receipt. Otherwise rendering requires a review that this
      // runtime deliberately refuses to record.
      if (absorptionPolicy && tracksReviewer && (!artifactPolicy || evidenceInput.artifactPath)) {
        let previousReviewer = expert.researchEvidenceReviewer
        if (previousReviewer?.reviewer && artifactPolicy) {
          try {
            const reviewerWorkDir = session.workDir || session.projectRoot || session.projectPath
            if (!reviewerWorkDir) throw new Error('当前会话缺少研究产物目录。')
            await requireEvidenceReviewArtifact(reviewerWorkDir, artifactPolicy)
          } catch {
            // Repair historical false-completion state so a real retry of D can
            // replace the stale receipt instead of failing as a duplicate.
            previousReviewer = undefined
          }
        }
        researchEvidenceReviewer = recordExpertResearchEvidenceReviewer(previousReviewer, absorptionPolicy, {
          ...evidenceInput,
          recordedAt: now,
        })
      }
      if (tracksOutputReviewer && evidenceInput.artifactPath) {
        reportCompletenessReview = {
          agentId: typeof input.agentId === 'string' ? input.agentId : String(input.agentId ?? ''),
          artifactPath: evidenceInput.artifactPath,
          completedAt: now,
        }
      }
    } catch (error) {
      throw new ApiError(400, `研究浏览审计无效：${error instanceof Error ? error.message : String(error)}`, 'EXPERT_RESEARCH_AUDIT_INVALID')
    }
    const metadata: ExpertSessionMetadata = {
      ...expert,
      researchCompletion,
      ...((input.completed === true || interrupted) && tracksEvidence && expert.researchSourceDispatches ? {
        researchSourceDispatches: {
          ...expert.researchSourceDispatches,
          receipts: expert.researchSourceDispatches.receipts.map((receipt) => receipt.agentId === input.agentId ? { ...receipt, completedAt: now } : receipt),
        },
      } : {}),
      ...(researchEvidence ? { researchEvidence } : {}),
      ...(researchEvidenceReviewer ? { researchEvidenceReviewer } : {}),
      ...(reportCompletenessReview ? { reportCompletenessReview } : {}),
      updatedAt: now,
    }
    await sessionService.appendSessionMetadata(sessionId, { workDir: session.workDir || session.projectRoot || session.projectPath, expert: metadata })
    await expertRuntimeSessionStore.save(sessionId, metadata)
    return { expert: metadata, researchCompletion, ...(researchEvidence ? { researchEvidence } : {}) }
  }

  private async throwTemplateFillRepairFailure(input: {
    sessionId: string
    workDir: string
    expert: ExpertSessionMetadata
    payload: unknown
    kind: ExpertTemplateFillRepairFailureKind
    statusCode: number
    message: string
    code: string
  }): Promise<never> {
    const payloadFingerprint = fingerprint(input.payload)
    const failureFingerprint = fingerprint({ kind: input.kind, code: input.code, message: input.message })
    const failures = readTemplateFillRepairFailures(input.expert)
    const failedAt = new Date().toISOString()
    const nextExpert: ExpertSessionWithTemplateFillRepairFailures = {
      ...input.expert,
      templateFillRepairFailures: [...failures, {
        kind: input.kind,
        code: input.code,
        payloadFingerprint,
        failureFingerprint,
        failedAt,
      }].slice(-MAX_TEMPLATE_FILL_REPAIR_DIAGNOSTIC_RECORDS),
      updatedAt: failedAt,
    }
    await sessionService.appendSessionMetadata(input.sessionId, {
      workDir: input.workDir,
      expert: nextExpert,
    })
    await expertRuntimeSessionStore.save(input.sessionId, nextExpert)
    const repairHint = renderedTemplateFillDraft(readTemplateFillDraft(input.expert))
      ? ' 已成功写入的初始 HTML 与复核状态仍保留，失败字段未提交。按 08 的结论继续：确有来源支持的遗漏，或 07 已有材料能纠正的来源/语义错误，才使用 mode="patch" 提交最小字段；无需修正则 mode="finalize" 且 fields: {}。不要为绕过校验添加占位字段或提交空补丁。'
      : [...templateFillCandidates.values()].some((candidate) => candidate.sessionId === input.sessionId)
        ? ' 本次尚未生成 HTML，但本服务进程已保留已提交字段。下一次 Write 可用相同路径和 templateId、mode="patch" 只补正报错字段；删除母版未声明字段时提交该字段为 null（先把有用内容移到合法字段），合法字段不能置空。无需重写全文，也不要提前运行 08。服务重启后需重新提交完整字段。'
        : ' 本次尚未成功渲染 HTML；请提交完整 expert_output，不要提前运行 08 完整性复核。'
    throw new ApiError(input.statusCode, input.message + repairHint, input.code)
  }

  async renderTemplateFill(
    sessionId: string,
    payload: unknown,
    options: { outputPath?: unknown } = {},
  ): Promise<{ content: string; templateId: string; completionReviewRequired: boolean; writeReceipt?: string }> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    const sessionWorkDir = session.workDir || session.projectRoot || session.projectPath
    const outputPath = resolveTemplateFillOutputPath(sessionWorkDir, options.outputPath)
    let expert = hasActiveExpertRuntime(session.expert)
      ? session.expert
      : await expertRuntimeSessionStore.get(sessionId)
    if (!hasActiveExpertRuntime(expert)) {
      throw ApiError.badRequest('当前会话没有启用可用的专家模板填充输出。请重新进入专家 Mode 后重试；不要改为手写 HTML、调用 Write 写 .html，或继续试探模板/服务器。')
    }
    const binding = expert.runtimeBinding
    if (binding.outputMode !== 'template-fill' || !binding.outputTemplate) {
      throw ApiError.badRequest('当前专家不使用模板填充输出；请按该专家自身的交付方式操作。')
    }

    let absorptionArtifactContent: string | undefined
    let researchBriefMarkdown: string | undefined
    if (binding.researchArtifactPolicy) {
      const workDir = session.workDir || session.projectRoot || session.projectPath
      if (!workDir) {
        throw new ApiError(409, '当前会话缺少调研任务说明的输出目录。', 'EXPERT_RESEARCH_BRIEF_REQUIRED')
      }
      try {
        await requireResearchBriefArtifact(workDir, binding.researchArtifactPolicy)
        researchBriefMarkdown = await fs.readFile(resolveExpertResearchArtifactPath({
          workDir,
          policy: binding.researchArtifactPolicy,
          artifactPath: binding.researchArtifactPolicy.briefPath,
          allowedKinds: ['research-brief'],
        }).absolutePath, 'utf8')
        absorptionArtifactContent = await requireReportFieldAbsorptionArtifact(workDir, binding.researchArtifactPolicy)
      } catch (error) {
        const requiresAbsorption = Boolean(binding.researchArtifactPolicy.absorptionPath)
        throw new ApiError(409, requiresAbsorption
          ? `尚未先生成有效的报告字段吸收 Markdown：${error instanceof Error ? error.message : String(error)}`
          : `尚未先生成有效的调研任务说明 Markdown：${error instanceof Error ? error.message : String(error)}`,
        requiresAbsorption ? 'EXPERT_RESEARCH_REPORT_ABSORPTION_REQUIRED' : 'EXPERT_RESEARCH_BRIEF_REQUIRED')
      }
    }

    const submission = parseTemplateFillSubmission(payload)
    let effectivePayload: TemplateFillSubmission
    let existingDraft = renderedTemplateFillDraft(readTemplateFillDraft(expert))
    if (existingDraft) {
      try {
        renderExpertTemplateFill(binding.outputTemplate.content, { format: EXPERT_TEMPLATE_FILL_FORMAT, templateId: existingDraft.templateId, fields: existingDraft.fields })
      } catch {
        const recovered = await recoverReviewedTemplateFillDraft(sessionId, expert, existingDraft).catch(() => undefined)
        if (!recovered) {
          return this.throwTemplateFillRepairFailure({ sessionId, workDir: sessionWorkDir, expert, payload,
            kind: 'schema', statusCode: 409, code: 'EXPERT_TEMPLATE_FILL_DRAFT_RECOVERY_REQUIRED',
            message: '旧版本保存的草稿字段无效，且未找到能逐字重现当前 HTML 的历史草稿。原报告与历史均保留；不能靠反复提交补丁修复，也不会丢弃未知字段冒充恢复。',
          })
        }
        existingDraft = recovered
      }
    }
    const candidateKey = templateFillCandidateKey(sessionId, binding, outputPath)
    const cachedCandidate = templateFillCandidates.get(candidateKey)
    const repairCandidate = cachedCandidate && Date.now() - cachedCandidate.savedAt < 2 * 60 * 60 * 1000
      && cachedCandidate.payload.templateId === submission.templateId ? cachedCandidate.payload : undefined
    const completionReviewRequired = Boolean(binding.researchArtifactPolicy?.completionReviewPath)
    const finalizedDelivery = expert.templateFillDelivery
    if (!existingDraft && finalizedDelivery && (submission.mode === 'patch' || submission.mode === 'finalize')) {
      const deliveredPath = finalizedDelivery.reportPath
      const sameOutput = !outputPath || !deliveredPath || sameTemplateFillOutputPath(deliveredPath, outputPath)
      if (sameOutput && deliveredPath) {
        try {
          return {
            content: await fs.readFile(deliveredPath, 'utf8'),
            templateId: finalizedDelivery.templateId,
            completionReviewRequired: false,
          }
        } catch {
          // A missing delivered file is not a valid idempotent retry; fall
          // through to the ordinary draft-required error below.
        }
      }
    }
    if (completionReviewRequired && existingDraft) {
      const saved = [...templateFillWrites.entries()].find(([, write]) => write.committed
        && write.candidateKey === candidateKey && write.requestHash === fingerprint(submission)
        && write.state.templateFillDraft?.completionReview && Date.now() - write.savedAt < 2 * 60 * 60 * 1000)
      if (saved?.[1].outputPath) {
        try {
          const content = await fs.readFile(saved[1].outputPath, 'utf8')
          if (createHash('sha256').update(content).digest('hex') === saved[1].contentHash) {
            return { content, templateId: existingDraft.templateId, completionReviewRequired: true, writeReceipt: saved[0] }
          }
        } catch { /* Missing output must follow ordinary recovery, not false success. */ }
      }
    }
    if (completionReviewRequired && existingDraft && submission.mode !== 'patch' && submission.mode !== 'finalize') {
      throw new ApiError(
        409,
        '初始 HTML 草稿已经生成，尚未完成报告完整性复核。必须先派 expert-evidence-output-reviewer 写入 08-report-completeness-review.md；主代理 Read 08 后，复核明确需要补写或纠错时用一次 mode="patch"，否则用 mode="finalize" 且 fields 为 {}。不得重新提交完整报告覆盖草稿。',
        'EXPERT_REPORT_COMPLETENESS_REVIEW_REQUIRED',
      )
    }
    if (submission.mode === 'finalize' && !completionReviewRequired) {
      throw new ApiError(409, '当前 Expert 没有启用报告完整性复核，不能使用 mode="finalize"。', 'EXPERT_REPORT_COMPLETENESS_REVIEW_REQUIRED')
    }
    if (submission.mode === 'patch' && !existingDraft && repairCandidate && !finalizedDelivery) {
      const repairedFields = { ...repairCandidate.fields, ...submission.fields }
      const declaredFields = new Set(deriveExpertTemplateFillSchema(binding.outputTemplate.content).fields.map((field) => field.id))
      // Explicit deletion is limited to undeclared pre-render keys. Valid content
      // stays in the candidate; null can never erase a required template field.
      for (const [key, value] of Object.entries(submission.fields)) {
        if (value === null && !declaredFields.has(key)) delete repairedFields[key]
      }
      effectivePayload = {
        ...repairCandidate,
        fields: repairedFields,
        ...(submission.evidenceAbsorption !== undefined ? { evidenceAbsorption: submission.evidenceAbsorption } : {}),
      }
    } else if (submission.mode === 'patch' || submission.mode === 'finalize') {
      if (!existingDraft) {
        throw new ApiError(409, '没有可修复的报告草稿。请先提交一次完整 expert_output，再使用 mode="patch" 只补正被指出的字段。', 'EXPERT_TEMPLATE_FILL_DRAFT_REQUIRED')
      }
      if (
        existingDraft.completionReview?.reportPath
        && outputPath
        && !sameTemplateFillOutputPath(existingDraft.completionReview.reportPath, outputPath)
      ) {
        throw new ApiError(
          409,
          '完整性复核中的 patch 或 finalize 必须写回同一个初始 HTML 文件，不能更换报告路径。',
          'EXPERT_TEMPLATE_FILL_OUTPUT_PATH_MISMATCH',
        )
      }
      if (existingDraft.templateId !== submission.templateId) {
        throw new ApiError(409, '当前补丁的 templateId 与已保存报告草稿不一致；请继续修复同一份母版。', 'EXPERT_TEMPLATE_FILL_DRAFT_TEMPLATE_MISMATCH')
      }
      if (submission.mode === 'finalize' && Object.keys(submission.fields).length > 0) {
        throw new ApiError(409, 'mode="finalize" 不接受字段改动；请使用 fields: {} 复用已完成完整性复核的草稿。', 'EXPERT_REPORT_COMPLETENESS_FINALIZE_FIELDS_FORBIDDEN')
      }
      effectivePayload = {
        templateId: existingDraft.templateId,
        fields: submission.mode === 'finalize'
          ? { ...existingDraft.fields }
          : { ...existingDraft.fields, ...submission.fields },
        ...(submission.mode === 'finalize'
          ? existingDraft.evidenceAbsorption !== undefined
            ? { evidenceAbsorption: existingDraft.evidenceAbsorption }
            : {}
          : submission.evidenceAbsorption !== undefined
            ? { evidenceAbsorption: submission.evidenceAbsorption }
            : existingDraft.evidenceAbsorption !== undefined
              ? { evidenceAbsorption: existingDraft.evidenceAbsorption }
              : {}),
      }
    } else if (
      existingDraft
      && existingDraft.templateId === submission.templateId
      && binding.researchEvidenceAbsorptionPolicy?.required === true
      && omitsSavedDraftFields(submission, existingDraft)
    ) {
      // A source-audited research Expert may repair one or two fields after a
      // rejected full delivery. Treating that partial object as a new full
      // report would discard the richer saved draft and force a compressed
      // rewrite. Require the explicit merge mode instead.
      throw new ApiError(
        409,
        '完整报告草稿仍已保留。当前提交只包含部分字段；若只修复被指出的字段，请在 expert_output 中设置 mode="patch"。如要重写完整报告，请提交覆盖已保存草稿全部字段的 fields。',
        'EXPERT_TEMPLATE_FILL_PATCH_REQUIRED',
      )
    } else {
      effectivePayload = submission
    }

    if (completionReviewRequired && existingDraft && (submission.mode === 'patch' || submission.mode === 'finalize')) {
      const workDir = session.workDir || session.projectRoot || session.projectPath
      const initialRenderedAt = existingDraft?.completionReview?.initialRenderedAt
      if (!workDir || !initialRenderedAt || !binding.researchArtifactPolicy) {
        throw new ApiError(
          409,
          '当前补写或最终化缺少同一会话的初始 HTML 草稿与完整性复核上下文。先完成初始报告、08-report-completeness-review.md 和主代理 Read，再按 08 的自然语言复核结论提交一次 patch 或 finalize。',
          'EXPERT_REPORT_COMPLETENESS_REVIEW_REQUIRED',
        )
      }
      try {
        const declaredReview = resolveExpertResearchArtifactPath({
          workDir,
          policy: binding.researchArtifactPolicy,
          artifactPath: binding.researchArtifactPolicy.completionReviewPath,
          allowedKinds: ['final-output-review'],
        })
        await fs.stat(declaredReview.absolutePath)
      } catch (error) {
        throw new ApiError(
          409,
          `初始 HTML 草稿已保存，但尚未生成本轮有效的报告完整性复核：${error instanceof Error ? error.message : String(error)}`,
          'EXPERT_REPORT_COMPLETENESS_REVIEW_REQUIRED',
        )
      }
      if (
        !expert.reportCompletenessReview
        || expert.reportCompletenessReview.artifactPath !== binding.researchArtifactPolicy.completionReviewPath
        || Date.parse(expert.reportCompletenessReview.completedAt) < Date.parse(initialRenderedAt)
      ) {
        throw new ApiError(
          409,
          '08-report-completeness-review.md 必须由本轮 expert-evidence-output-reviewer 成功写入并完成审计确认；不能仅凭磁盘上存在同名文件完成交付。',
          'EXPERT_REPORT_COMPLETENESS_REVIEWER_REQUIRED',
        )
      }
      try {
        const review = await requireReportCompletenessReviewArtifact(workDir, binding.researchArtifactPolicy, initialRenderedAt, expert.reportCompletenessReview)
        if (submission.mode === 'patch' && !review.requiresPatch) {
          throw new ApiError(409, '08-report-completeness-review.md 未明确需要补写；不得假补丁。请以 mode="finalize" 和 fields: {} 交付原始草稿。', 'EXPERT_REPORT_COMPLETENESS_NO_PATCH_REQUIRED')
        }
        if (submission.mode === 'finalize' && review.requiresPatch) {
          throw new ApiError(409, '08-report-completeness-review.md 明确需要补写或纠错；必须先用一次 mode="patch" 修正已有材料支持的字段。', 'EXPERT_REPORT_COMPLETENESS_PATCH_REQUIRED')
        }
      } catch (error) {
        if (error instanceof ApiError) return this.throwTemplateFillRepairFailure({
          sessionId, workDir, expert, payload, kind: 'template-fill', statusCode: error.statusCode, message: error.message, code: error.code,
        })
        throw new ApiError(
          409,
          `初始 HTML 草稿已保存，但尚未生成本轮有效的报告完整性复核：${error instanceof Error ? error.message : String(error)}`,
          'EXPERT_REPORT_COMPLETENESS_REVIEW_REQUIRED',
        )
      }
    }

    // Stamp the commercial report with the actual server rendering date before
    // saving the draft. This prevents a model-supplied future/source-page date
    // from leaking into the user-visible report and keeps patch retries stable.
    const draftNow = new Date().toISOString()
    effectivePayload = {
      ...effectivePayload,
      fields: ensureCommercializationReportSourceBoundary({
        expertId: binding.expertId,
        fields: stampCommercializationReportDate(binding.expertId, effectivePayload.fields, new Date(draftNow)),
      }),
    }

    if (!existingDraft && effectivePayload.templateId === deriveExpertTemplateFillSchema(binding.outputTemplate.content).templateId) {
      rememberTemplateFillCandidate(candidateKey, sessionId, effectivePayload)
    }

    // Keep candidate fields in-memory for semantic validation. Persist templateFillDraft
    // only after the rendered file is written and acknowledged: a rejected first submission is not an HTML draft and
    // must never be forced through the 08/patch lifecycle.
    const draft: ExpertTemplateFillDraft = {
      templateId: effectivePayload.templateId,
      fields: effectivePayload.fields,
      ...(effectivePayload.evidenceAbsorption !== undefined ? { evidenceAbsorption: effectivePayload.evidenceAbsorption } : {}),
      ...(existingDraft?.completionReview ? { completionReview: existingDraft.completionReview } : {}),
      savedAt: existingDraft?.savedAt ?? draftNow,
      updatedAt: draftNow,
    }
    payload = effectivePayload


    const researchCompletion = binding.researchCompletionPolicy
      ? evaluateExpertResearchCompletion(binding.researchCompletionPolicy, expert.researchCompletion)
      : undefined
    if (binding.researchArtifactPolicy?.routeCompletion?.mode === 'dynamic-route-status-v2' && researchBriefMarkdown) {
      const routeEvaluation = evaluateExpertResearchRequiredRoutes({
        artifactPolicy: binding.researchArtifactPolicy,
        researchBriefMarkdown,
        sourceRecords: (expert.researchEvidence?.records ?? []).filter((record) => (
          binding.researchEvidenceReviewPolicy?.sourceAgentTypes.includes(record.agentType)
        )),
      })
      if (!routeEvaluation.complete) {
        throw new ApiError(
          409,
          '任务书中已计划的具体内容路线尚缺真实取证尝试：'
            + routeEvaluation.recoveries.map((recovery) => recovery.routeId + '（' + recovery.nextStep + '）').join('、')
            + '。请等待系统只补齐这些路线；首路线与同字段备选都真实受限时会保留证据缺口，不会卡住最终报告。',
          'EXPERT_RESEARCH_REQUIRED_ROUTE_RECOVERY_REQUIRED',
        )
      }
    }
    if (binding.researchCompletionPolicy?.finalOutputBehavior === 'block' && !researchCompletion?.complete) {
      throw new ApiError(
        409,
        `当前专家的浏览调研尚未达到 ZIP 声明的完成条件：${researchCompletion?.missing.join('；')}。请继续使用 Playwright 的具体页面取证；不要把搜索页、验证码页或失败调用写成已完成。`,
        'EXPERT_RESEARCH_COMPLETION_REQUIRED',
      )
    }
    // Final rendering is defensive only: normally the same terminal-coverage
    // contract has already passed before D/E. A dispatched recovery fingerprint
    // is never evidence; only opened/access_limited/failed browser outcomes count.
    const sourceLibraryContentForFinalOutput = binding.skills.find((skill) => skill.skillId === 'research-source-library')?.content
    const sourceLibraryCatalogForFinalOutput = sourceLibraryContentForFinalOutput
      ? parseResearchSourceLibrary(sourceLibraryContentForFinalOutput)
      : undefined
    const sourceLibraryPlanForFinalOutput = binding.researchArtifactPolicy && sourceLibraryCatalogForFinalOutput?.entries.length
      ? planResearchSourceLibraryExecutionBatches({
          catalog: sourceLibraryCatalogForFinalOutput,
          researcherPaths: binding.researchArtifactPolicy.researcherPaths,
        })
      : undefined
    if (sourceLibraryCatalogForFinalOutput && sourceLibraryPlanForFinalOutput) {
      const sourceAttempts = matchResearchSourceLibraryAttempts({
        catalog: sourceLibraryCatalogForFinalOutput,
        records: (expert.researchEvidence?.records ?? []).filter((record) => (
          binding.researchEvidenceReviewPolicy?.sourceAgentTypes.includes(record.agentType)
        )),
        dispatches: expert.researchSourceDispatches?.receipts,
      })
      const sourceCoverage = evaluateResearchSourceLibraryExecutionCoverage({
        plan: sourceLibraryPlanForFinalOutput,
        attempts: sourceAttempts,
      })
      const awaitingRecovery = sourceCoverage.missingBatches
      if (awaitingRecovery.length) {
        throw new ApiError(
          409,
          '公司 PM 来源库与开放平台网络仍有未执行入口，系统需要继续按 02/03/04 三线小批次补查：'
            + awaitingRecovery.map((batch) => batch.artifactPath + ' 剩余 ' + batch.entries.length + ' 个').join('；')
            + '。每个入口只要求真实尝试一次；受限、无结果或失败会如实保留，不会反复重试或阻止后续报告。',
          'EXPERT_RESEARCH_SOURCE_LIBRARY_RECOVERY_REQUIRED',
        )
      }
    }
    if (binding.researchCompletionPolicy?.requireSearchCoverageBeforeFinalOutput === true) {
      const missingSearchCoverage = researchCompletion?.missing.filter((message) => message.startsWith('未记录以下搜索入口')) ?? []
      if (missingSearchCoverage.length) {
        throw new ApiError(
          409,
          `当前专家尚未完成 ZIP 声明的搜索入口尝试：${missingSearchCoverage.join('；')}。Google、百度、Bing、360 可以受限，但不能未经实际尝试就写入最终报告。`,
          'EXPERT_RESEARCH_SEARCH_COVERAGE_REQUIRED',
        )
      }
    }

    // For allow-with-evidence-gaps packs, an explicit user accept is enough to
    // render the evidence-limited report. Do not re-block on audit eligibility
    // after the user already chose accept_current_scope.

    if (binding.researchDeliveryPolicy && !hasAcceptedExpertResearchDelivery(expert.researchDelivery)) {
      throw new ApiError(
        409,
        '当前商业化调研尚未获得用户对剩余证据缺口和交付范围的确认。先继续完成仍可自行取得的公开证据；确实需要用户选择时，必须使用 AskUserQuestion 的 research-delivery 问题。用户选择“保留列出的证据缺口，交付当前范围报告”后，才能生成最终 HTML；在此之前不得宣布交付完成。',
        'EXPERT_RESEARCH_DELIVERY_DECISION_REQUIRED',
      )
    }

    if (binding.researchEvidenceAbsorptionPolicy) {
      const rawPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : undefined
      const fields = rawPayload?.fields
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        return this.throwTemplateFillRepairFailure({
          sessionId,
          workDir: session.workDir || session.projectRoot || session.projectPath,
          expert,
          payload,
          kind: 'schema',
          statusCode: 400,
          message: '专家模板字段校验未通过：模板填充 payload 缺少 fields 对象。',
          code: 'BAD_REQUEST',
        })
      }
      const templateFields = deriveExpertTemplateFillSchema(binding.outputTemplate.content).fields
      const sourceMerge = mergeAuditedOpenedSourcesIntoSourceRows({
        policy: binding.researchEvidenceAbsorptionPolicy,
        researchEvidence: expert.researchEvidence,
        fields: fields as Record<string, unknown>,
        templateFields,
        absorptionArtifactContent,
      })
      const sourceReferenceResolution = resolveExpertResearchAuditSourceReferences({
        policy: binding.researchEvidenceAbsorptionPolicy,
        researchEvidence: expert.researchEvidence,
        fields: sourceMerge.fields,
        templateFields,
      })
      if (sourceReferenceResolution.errors.length) {
        return this.throwTemplateFillRepairFailure({
          sessionId,
          workDir: session.workDir || session.projectRoot || session.projectPath,
          expert,
          payload,
          kind: 'evidence',
          statusCode: 409,
          message: sourceReferenceResolution.errors.join('；'),
          code: 'EXPERT_RESEARCH_AUDIT_REFERENCE_REQUIRED',
        })
      }

      // Source normalization is a candidate transformation, never a commit.
      // Schema/evidence validation and the exact file-write acknowledgement must
      // succeed before any candidate fields can replace the reviewed draft.
      payload = { ...rawPayload, fields: sourceReferenceResolution.fields }
      const absorptionFailure = evaluateExpertResearchEvidenceAbsorption({
        policy: binding.researchEvidenceAbsorptionPolicy,
        researchEvidence: expert.researchEvidence,
        reviewerState: expert.researchEvidenceReviewer,
        fields: sourceReferenceResolution.fields,
        templateFields,
        evidenceAbsorption: rawPayload.evidenceAbsorption,
        absorptionArtifactContent,
      })
      if (absorptionFailure) {
        return this.throwTemplateFillRepairFailure({
          sessionId,
          workDir: session.workDir || session.projectRoot || session.projectPath,
          expert,
          payload,
          kind: 'evidence',
          statusCode: 409,
          message: absorptionFailure,
          code: 'EXPERT_RESEARCH_EVIDENCE_ABSORPTION_REQUIRED',
        })
      }
    }

    const sourceCoverageFailure = evaluateExpertFinalSourceCoverage(binding.researchCompletionPolicy, payload)
    if (sourceCoverageFailure) {
      return this.throwTemplateFillRepairFailure({
        sessionId,
        workDir: session.workDir || session.projectRoot || session.projectPath,
        expert,
        payload,
        kind: 'evidence',
        statusCode: 409,
        message: sourceCoverageFailure + ' 继续补充并核验具体公开页面，再把实际使用的来源逐条写入来源表；不要用“待验证”填满竞品、价格或渠道字段后直接交付。',
        code: 'EXPERT_FINAL_SOURCE_COVERAGE_REQUIRED',
      })
    }
    try {
      const renderedPayload = parseTemplateFillSubmission(payload)
      const rendered = renderExpertTemplateFill(binding.outputTemplate.content, {
        format: EXPERT_TEMPLATE_FILL_FORMAT,
        ...renderedPayload,
      })
      if (completionReviewRequired && !existingDraft) {
        // Source references can be repaired after the candidate draft is built
        // (for example, a stable Google URL is rebound to the exact audited URL).
        // Persist the actual rendered payload so the later 08 patch/finalize path
        // cannot resurrect the model's pre-repair source cell.
        const initialRenderedAt = new Date().toISOString()
        const pendingReviewExpert = {
          ...expert,
          templateFillDraft: {
            ...draft,
            fields: renderedPayload.fields,
            ...(renderedPayload.evidenceAbsorption !== undefined ? { evidenceAbsorption: renderedPayload.evidenceAbsorption } : {}),
            completionReview: {
              initialRenderedAt,
              ...(outputPath ? { reportPath: outputPath } : {}),
            },
            updatedAt: initialRenderedAt,
          },
          // A former completed review cannot approve a newly rendered draft.
          reportCompletenessReview: undefined,
          // A newly rendered draft always supersedes a prior completed delivery.
          templateFillDelivery: undefined,
          updatedAt: initialRenderedAt,
        } as ExpertSessionMetadata
        const writeReceipt = prepareTemplateFillWrite(sessionId, candidateKey, outputPath, binding, rendered.content, submission, {
          templateFillDraft: pendingReviewExpert.templateFillDraft,
          templateFillDelivery: undefined, reportCompletenessReview: undefined,
        })
        return { content: rendered.content, templateId: rendered.schema.templateId, completionReviewRequired: true, writeReceipt }
      }
      const finalizedAt = new Date().toISOString()
      const finalizedExpert = {
        ...expert,
        templateFillDraft: undefined,
        reportCompletenessReview: undefined,
        templateFillDelivery: {
          templateId: effectivePayload.templateId,
          ...(existingDraft?.completionReview?.reportPath
            ? { reportPath: existingDraft.completionReview.reportPath }
            : outputPath
              ? { reportPath: outputPath }
              : {}),
          finalizedAt,
        },
        updatedAt: finalizedAt,
      } as ExpertSessionMetadata
      const writeReceipt = prepareTemplateFillWrite(sessionId, candidateKey, outputPath, binding, rendered.content, submission, {
        templateFillDraft: undefined, reportCompletenessReview: undefined,
        templateFillDelivery: finalizedExpert.templateFillDelivery,
      })
      return { content: rendered.content, templateId: rendered.schema.templateId, completionReviewRequired: false, writeReceipt }
    } catch (error) {
      return this.throwTemplateFillRepairFailure({
        sessionId,
        workDir: session.workDir || session.projectRoot || session.projectPath,
        expert,
        payload,
        kind: 'template-fill',
        statusCode: 400,
        message: `专家模板字段校验未通过：${error instanceof Error ? error.message : String(error)}`,
        code: 'BAD_REQUEST',
      })
    }
  }

  async commitTemplateFillWrite(sessionId: string, input: { receipt?: unknown; outputPath?: unknown }): Promise<{ committed: true }> {
    const receipt = typeof input.receipt === 'string' ? input.receipt : ''
    const pending = templateFillWrites.get(receipt)
    if (!pending || pending.sessionId !== sessionId || Date.now() - pending.savedAt > 2 * 60 * 60 * 1000) {
      throw new ApiError(409, '写盘确认回执已失效；保留原字段，重试同一份 Write 即可。', 'EXPERT_TEMPLATE_FILL_WRITE_RECEIPT_EXPIRED')
    }
    const session = await sessionService.getSession(sessionId)
    const expert = session?.expert
    if (!session || !expert || fingerprint(expert.runtimeBinding) !== pending.bindingHash) {
      throw new ApiError(409, '当前专家绑定已变更，不能提交旧报告写盘回执。', 'EXPERT_TEMPLATE_FILL_WRITE_BINDING_CHANGED')
    }
    const outputPath = resolveTemplateFillOutputPath(session.workDir || session.projectRoot || session.projectPath, pending.outputPath ?? input.outputPath)
    if (!outputPath) throw ApiError.badRequest('写盘确认缺少实际报告路径。')
    const written = await fs.readFile(outputPath)
    if (createHash('sha256').update(written).digest('hex') !== pending.contentHash) {
      throw new ApiError(409, '报告尚未完整写入；草稿与复核状态保留，请重试同一份 Write。', 'EXPERT_TEMPLATE_FILL_WRITE_NOT_CONFIRMED')
    }
    if (pending.committed) return { committed: true }
    // Merge only delivery state into the latest session, not a stale snapshot.
    const updatedAt = new Date().toISOString()
    const next = { ...expert, ...pending.state, updatedAt }
    if (next.templateFillDelivery) next.templateFillDelivery = { ...next.templateFillDelivery, reportPath: outputPath, finalizedAt: updatedAt }
    if (next.templateFillDraft?.completionReview) next.templateFillDraft = { ...next.templateFillDraft,
      completionReview: { ...next.templateFillDraft.completionReview, reportPath: outputPath, initialRenderedAt: updatedAt } }
    await sessionService.appendSessionMetadata(sessionId, { workDir: session.workDir || session.projectRoot || session.projectPath, expert: next })
    await expertRuntimeSessionStore.save(sessionId, next)
    pending.committed = true
    templateFillCandidates.delete(pending.candidateKey)
    return { committed: true }
  }

  async runExpertAgent(sessionId: string, input: { expertId?: string; projectRoot?: string; title?: string; notes?: string } = {}): Promise<{ expert: ExpertSessionMetadata; materialRef: ExpertMaterialRef }> {
    return this.writeMaterialPackage(sessionId, input)
  }

  async writePlaceholderMaterial(sessionId: string, input: { expertId?: string; projectRoot?: string; title?: string; notes?: string }): Promise<{ expert: ExpertSessionMetadata; materialRef: ExpertMaterialRef }> {
    return this.writeMaterialPackage(sessionId, input)
  }

  async writeMaterialPackage(sessionId: string, input: { expertId?: string; projectRoot?: string; title?: string; notes?: string }): Promise<{ expert: ExpertSessionMetadata; materialRef: ExpertMaterialRef }> {
    const session = await sessionService.getSession(sessionId)
    if (!session) throw ApiError.notFound(`Session not found: ${sessionId}`)
    const activeExpertId = input.expertId || session.expert?.expertId
    if (!activeExpertId) throw ApiError.badRequest('\u8bf7\u5148\u8fdb\u5165\u4e13\u5bb6 Mode\u3002')
    const expert = await registry.getExpert(activeExpertId)
    if (!expert) throw ApiError.notFound(`Expert not found: ${activeExpertId}`)

    const projectRoot = input.projectRoot || session.workDir || session.projectRoot || session.projectPath
    if (!projectRoot || typeof projectRoot !== 'string') throw ApiError.badRequest('\u7f3a\u5c11\u9879\u76ee\u76ee\u5f55\uff0c\u65e0\u6cd5\u5199\u5165\u4e13\u5bb6\u6750\u6599\u5305\u3002')
    const runId = createRunId()
    const outputDir = path.resolve(projectRoot, '.workflow', 'intake', 'expert-runs', runId, expert.id)
    const workflowRoot = path.resolve(projectRoot, '.workflow')
    if (!outputDir.startsWith(workflowRoot + path.sep)) throw ApiError.badRequest('\u4e13\u5bb6\u8f93\u51fa\u8def\u5f84\u4e0d\u5b89\u5168\u3002')
    await fs.mkdir(path.join(outputDir, 'logs'), { recursive: true })

    const now = new Date().toISOString()
    const runningExpert: ExpertSessionMetadata = {
      mode: 'expert',
      expertId: expert.id,
      expertName: expert.name,
      packId: expert.packId,
      packVersion: expert.packVersion,
      status: 'running',
      activeRunId: runId,
      runtimeBinding: session.expert?.runtimeBinding,
      intakeState: session.expert?.intakeState,
      materialRefs: session.expert?.materialRefs ?? [],
      startedAt: session.expert?.startedAt ?? now,
      updatedAt: now,
    }
    await sessionService.appendSessionMetadata(sessionId, {
      workDir: session.workDir || session.projectRoot || session.projectPath,
      expert: runningExpert,
    })

    try {
      const title = input.title?.trim() || `${expert.name}\u6750\u6599\u5305`
      const analysis = await runtime.analyze(expert.id, {
        projectRoot,
        title,
        notes: input.notes,
        runId,
        outputDir,
        intakeState: runningExpert.intakeState,
      })

      const finalSummary = analysis.summary
      const finalMaterial = analysis.material
      const finalEvidence = analysis.evidence
      const shortSummary = String(finalMaterial.summary || `\u5df2\u4e3a\u300c${expert.name}\u300d\u751f\u6210\u4e13\u5bb6\u6750\u6599\u5305\u3002`)
      const summaryPath = path.join(outputDir, 'material-summary.md')
      const materialJsonPath = path.join(outputDir, 'material.json')
      const evidencePath = path.join(outputDir, 'evidence.md')

      await fs.writeFile(summaryPath, finalSummary, 'utf-8')
      await fs.writeFile(materialJsonPath, `${JSON.stringify({
        ...finalMaterial,
        runId,
        outputDirectory: outputDir,
      }, null, 2)}\n`, 'utf-8')
      await fs.writeFile(evidencePath, finalEvidence, 'utf-8')

      const materialRef: ExpertMaterialRef = {
        runId,
        expertId: expert.id,
        expertName: expert.name,
        packId: expert.packId,
        packVersion: expert.packVersion,
        summaryPath,
        materialJsonPath,
        evidencePath,
        createdAt: now,
        title,
        shortSummary,
      }
      const previous = session.expert?.materialRefs ?? []
      const completedAt = new Date().toISOString()
      const nextExpert: ExpertSessionMetadata = {
        ...runningExpert,
        status: 'completed',
        materialRefs: [materialRef, ...previous.filter((ref) => ref.runId !== runId)],
        updatedAt: completedAt,
        completedAt,
        error: undefined,
      }
      await sessionService.appendSessionMetadata(sessionId, {
        workDir: session.workDir || session.projectRoot || session.projectPath,
        expert: nextExpert,
      })
      return { expert: nextExpert, materialRef }
    } catch (error) {
      const failedAt = new Date().toISOString()
      const nextExpert: ExpertSessionMetadata = {
        ...runningExpert,
        status: 'failed',
        updatedAt: failedAt,
        error: error instanceof Error ? error.message : String(error),
      }
      await sessionService.appendSessionMetadata(sessionId, {
        workDir: session.workDir || session.projectRoot || session.projectPath,
        expert: nextExpert,
      })
      throw error
    }
  }
}

function initialIntakeState(now: string): ExpertIntakeState {
  return { answers: {}, errors: {}, completedStepIds: [], updatedAt: now }
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '')
  const suffix = Math.random().toString(36).slice(2, 8)
  return `expert-${timestamp}-${suffix}`
}


