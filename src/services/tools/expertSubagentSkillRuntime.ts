import type { ExpertResearchAuditEntry } from '../../server/services/expertResearchCompletionService.js'
import { isFileFirstExpertResearchAgentType, resolveFileFirstExpertAgentType, researchArtifactRootPath } from './expertFileFirstResearchProtocol.js'

export type ExpertResearchTaskKind = 'source-batch' | 'targeted-evidence'

/** Missing/legacy values retain normal library coverage; no prose heuristics. */
export function normalizeExpertResearchTaskKind(value: unknown): ExpertResearchTaskKind {
  return value === 'targeted-evidence' ? 'targeted-evidence' : 'source-batch'
}

type ExpertSubagentRuntimeSkill = {
  skillId: string
  title: string
  path: string
  sha256: string
  content: string
}

export type ExpertSubagentResearchEvidenceContext = {
  expertId: string
  packId: string
  packVersion: string
  reviewerEvidenceOnly: true
  artifactPaths?: {
    briefPath: string
    researcherPaths: string[]
    researcherParts?: boolean
    reviewerPath: string
    auditPath: string
    absorptionPath?: string
    completionReviewPath?: string
  }
  records: Array<{
    agentId: string
    agentType: string
    recordedAt: string
    content: string
    artifactPath?: string
    entries: ExpertResearchAuditEntry[]
  }>
}

export type ExpertPostReviewEvidenceAbsorptionContext = {
  expertId: string
  packId: string
  packVersion: string
  instruction: string
}

export type ExpertSubagentResearchSourceEntry = {
  tier: "core" | "open"
  category: string
  candidateUrl: string
  candidateHost: string
  owner: "competitors" | "demand-market" | "commercialization-channel"
}

export type ExpertResearchSourceAssignment = {
  artifactPath: string
  candidateUrls: string[]
}

export type ExpertSubagentResearchSourcePlan = {
  batches: Array<{
    owner: "competitors" | "demand-market" | "commercialization-channel"
    artifactPath: string
    batchFingerprint?: string
    entries: ExpertSubagentResearchSourceEntry[]
  }>
}

export type ExpertSubagentSkillContext = {
  expertId: string
  packId: string
  packVersion: string
  /** Runtime-only file-first path allowlist; it is not injected into model prose. */
  artifactPaths?: {
    briefPath: string
    researcherPaths: string[]
    researcherParts?: boolean
    reviewerPath: string
    auditPath: string
    absorptionPath?: string
    completionReviewPath?: string
  }
  outputReview?: {
    briefPath: string
    absorptionPath: string
    completionReviewPath: string
    reportPath: string
  }
  /** Per-call purpose, not persisted session state. */
  researchTaskKind?: ExpertResearchTaskKind
  /** Concrete A/B/C source batch for one file-first research worker. */
  researchSourcePlan?: ExpertSubagentResearchSourcePlan
  skills: ExpertSubagentRuntimeSkill[]
}

type Dependencies = {
  env: NodeJS.ProcessEnv
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

const MAX_TOTAL_SKILL_CHARACTERS = 32_000
const REQUEST_TIMEOUT_MS = 4_000
const SKILL_CONTEXT_REQUEST_ATTEMPTS = 2

export class ExpertSubagentContextGateError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ExpertSubagentContextGateError'
    this.code = code
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeArtifactPaths(value: unknown): ExpertSubagentSkillContext['artifactPaths'] | undefined {
  if (!isRecord(value)) return undefined
  const briefPath = safeArtifactPath(value.briefPath)
  const reviewerPath = safeArtifactPath(value.reviewerPath)
  const auditPath = safeArtifactPath(value.auditPath)
  const absorptionPath = value.absorptionPath === undefined ? undefined : safeArtifactPath(value.absorptionPath)
  const completionReviewPath = value.completionReviewPath === undefined ? undefined : safeArtifactPath(value.completionReviewPath)
  if (!briefPath || !reviewerPath || !auditPath || (value.absorptionPath !== undefined && !absorptionPath) || (value.completionReviewPath !== undefined && !completionReviewPath) || !Array.isArray(value.researcherPaths)) return undefined
  const researcherPaths = value.researcherPaths.map(safeArtifactPath)
  if (researcherPaths.length === 0 || researcherPaths.some((candidate) => !candidate)) return undefined
  return { briefPath, researcherPaths: researcherPaths as string[], ...(value.researcherParts === true ? { researcherParts: true } : {}), reviewerPath, auditPath, ...(absorptionPath ? { absorptionPath } : {}), ...(completionReviewPath ? { completionReviewPath } : {}) }
}

function resolveServerUrl(env: NodeJS.ProcessEnv): string | undefined {
  const value = nonEmptyString(env.CC_JIANGXIA_DESKTOP_SERVER_URL ?? env.DESKTOP_SERVER_URL)
  if (!value) return undefined
  try {
    return new URL(value).toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

function normalizeOutputReview(value: unknown): ExpertSubagentSkillContext['outputReview'] | undefined {
  if (!isRecord(value)) return undefined
  const briefPath = safeArtifactPath(value.briefPath)
  const absorptionPath = safeArtifactPath(value.absorptionPath)
  const completionReviewPath = safeArtifactPath(value.completionReviewPath)
  const reportPath = nonEmptyString(value.reportPath)
  if (!briefPath || !absorptionPath || !completionReviewPath || !reportPath || !/\.html?$/i.test(reportPath)) return undefined
  return { briefPath, absorptionPath, completionReviewPath, reportPath }
}

function isResearchSourceOwner(value: string): value is ExpertSubagentResearchSourceEntry["owner"] {
  return value === "competitors" || value === "demand-market" || value === "commercialization-channel"
}

function normalizeResearchSourcePlan(
  value: unknown,
  artifactPaths: ExpertSubagentSkillContext["artifactPaths"] | undefined,
): ExpertSubagentResearchSourcePlan | undefined {
  if (!isRecord(value) || !artifactPaths || !Array.isArray(value.batches)) return undefined
  const allowedPaths = new Set(artifactPaths.researcherPaths)
  const seenOwners = new Set<string>()
  const seenPaths = new Set<string>()
  const batches: ExpertSubagentResearchSourcePlan["batches"] = []

  for (const rawBatch of value.batches) {
    if (!isRecord(rawBatch) || !Array.isArray(rawBatch.entries)) return undefined
    const owner = nonEmptyString(rawBatch.owner)
    const artifactPath = safeArtifactPath(rawBatch.artifactPath)
    if (!owner || !isResearchSourceOwner(owner) || !artifactPath || !allowedPaths.has(artifactPath) || seenOwners.has(owner) || seenPaths.has(artifactPath)) return undefined

    const batchFingerprint = rawBatch.batchFingerprint === undefined ? undefined : nonEmptyString(rawBatch.batchFingerprint)
    if (rawBatch.batchFingerprint !== undefined && !batchFingerprint) return undefined
    const entries: ExpertSubagentResearchSourceEntry[] = []
    for (const rawEntry of rawBatch.entries) {
      if (!isRecord(rawEntry)) return undefined
      const tier = nonEmptyString(rawEntry.tier)
      const category = nonEmptyString(rawEntry.category)
      const candidateUrl = nonEmptyString(rawEntry.candidateUrl)
      const candidateHost = nonEmptyString(rawEntry.candidateHost)
      const entryOwner = nonEmptyString(rawEntry.owner)
      if ((tier !== "core" && tier !== "open") || !category || !candidateUrl || !candidateHost || entryOwner !== owner) return undefined
      entries.push({ tier, category, candidateUrl, candidateHost, owner })
    }

    seenOwners.add(owner)
    seenPaths.add(artifactPath)
    batches.push({ owner, artifactPath, ...(batchFingerprint ? { batchFingerprint } : {}), entries })
  }

  return batches.length > 0 ? { batches } : undefined
}

function normalizeContext(value: unknown): ExpertSubagentSkillContext | undefined {
  if (!isRecord(value)) return undefined
  const expertId = nonEmptyString(value.expertId)
  const packId = nonEmptyString(value.packId)
  const packVersion = nonEmptyString(value.packVersion)
  if (!expertId || !packId || !packVersion || !Array.isArray(value.skills)) return undefined
  const artifactPaths = normalizeArtifactPaths(value.artifactPaths)
  const outputReview = normalizeOutputReview(value.outputReview)
  const researchSourcePlan = normalizeResearchSourcePlan(value.researchSourcePlan, artifactPaths)

  let total = 0
  const skills: ExpertSubagentRuntimeSkill[] = []
  for (const rawSkill of value.skills) {
    if (!isRecord(rawSkill)) continue
    const skillId = nonEmptyString(rawSkill.skillId)
    const title = nonEmptyString(rawSkill.title)
    const path = nonEmptyString(rawSkill.path)
    const sha256 = nonEmptyString(rawSkill.sha256)
    const content = nonEmptyString(rawSkill.content)
    if (!skillId || !title || !path || !sha256 || !content) continue
    if (total + content.length > MAX_TOTAL_SKILL_CHARACTERS) break
    total += content.length
    skills.push({ skillId, title, path, sha256, content })
  }
  return {
    expertId,
    packId,
    packVersion,
    ...(artifactPaths ? { artifactPaths } : {}),
    ...(outputReview ? { outputReview } : {}),
    ...(researchSourcePlan ? { researchSourcePlan } : {}),
    ...(value.researchTaskKind !== undefined ? { researchTaskKind: normalizeExpertResearchTaskKind(value.researchTaskKind) } : {}),
    skills,
  }
}

function normalizePostReviewEvidenceAbsorptionContext(value: unknown): ExpertPostReviewEvidenceAbsorptionContext | undefined {
  if (!isRecord(value)) return undefined
  const expertId = nonEmptyString(value.expertId)
  const packId = nonEmptyString(value.packId)
  const packVersion = nonEmptyString(value.packVersion)
  const instruction = nonEmptyString(value.instruction)
  if (!expertId || !packId || !packVersion || !instruction) return undefined
  if (!instruction.includes('<expert-post-review-evidence-absorption>')) return undefined
  return { expertId, packId, packVersion, instruction }
}

function responseGateError(value: unknown): ExpertSubagentContextGateError | undefined {
  if (!isRecord(value)) return undefined
  const code = nonEmptyString(value.error)
  const message = nonEmptyString(value.message)
  if (!code?.startsWith('EXPERT_RESEARCH_')) return undefined
  return new ExpertSubagentContextGateError(code, message ?? code)
}

async function throwResearchContextGateIfPresent(response: Response): Promise<void> {
  if (response.ok) return
  try {
    const gateError = responseGateError(await response.json())
    if (gateError) throw gateError
  } catch (error) {
    if (error instanceof ExpertSubagentContextGateError) throw error
  }
}

/** Accept only exact relative paths in the reviewer's file-first allowlist. */
export function isFileFirstReviewerReadAllowed(
  input: unknown,
  artifactPaths: NonNullable<ExpertSubagentResearchEvidenceContext['artifactPaths']>,
): boolean {
  if (!isRecord(input)) return false
  const filePath = safeArtifactPath(input.file_path)
  if (!filePath) return false
  return new Set([
    artifactPaths.briefPath,
    ...artifactPaths.researcherPaths,
    artifactPaths.reviewerPath,
    artifactPaths.auditPath,
  ]).has(filePath)
}

function safeArtifactPath(value: unknown): string | undefined {
  const normalized = nonEmptyString(value)
  return normalized && normalized === String(value) && !/[\r\n]/.test(normalized) && normalized.endsWith('.md') ? normalized : undefined
}

function normalizeEvidenceContext(value: unknown): ExpertSubagentResearchEvidenceContext | undefined {
  if (!isRecord(value)) return undefined
  const expertId = nonEmptyString(value.expertId)
  const packId = nonEmptyString(value.packId)
  const packVersion = nonEmptyString(value.packVersion)
  if (!expertId || !packId || !packVersion || value.reviewerEvidenceOnly !== true || !Array.isArray(value.records)) return undefined

  if (isRecord(value.artifactPaths)) {
    const briefPath = safeArtifactPath(value.artifactPaths.briefPath)
    const reviewerPath = safeArtifactPath(value.artifactPaths.reviewerPath)
    const auditPath = safeArtifactPath(value.artifactPaths.auditPath)
    const researcherPaths = Array.isArray(value.artifactPaths.researcherPaths)
      ? value.artifactPaths.researcherPaths.map(safeArtifactPath).filter((item): item is string => Boolean(item))
      : []
    if (briefPath && reviewerPath && auditPath && researcherPaths.length > 0) {
      return {
        expertId, packId, packVersion, reviewerEvidenceOnly: true,
        artifactPaths: { briefPath, researcherPaths, reviewerPath, auditPath },
        records: [],
      }
    }
  }

  const records: ExpertSubagentResearchEvidenceContext['records'] = []
  let total = 0
  for (const rawRecord of value.records.slice(-16)) {
    if (!isRecord(rawRecord)) continue
    const agentId = nonEmptyString(rawRecord.agentId)
    const agentType = nonEmptyString(rawRecord.agentType)
    const recordedAt = nonEmptyString(rawRecord.recordedAt)
    const content = nonEmptyString(rawRecord.content)
    const artifactPath = rawRecord.artifactPath === undefined ? undefined : safeArtifactPath(rawRecord.artifactPath)
    if (!agentId || !agentType || !recordedAt || !content || !Array.isArray(rawRecord.entries)) continue
    if (total + content.length > 96_000) break
    total += content.length
    records.push({
      agentId, agentType, recordedAt, content,
      ...(artifactPath ? { artifactPath } : {}),
      entries: rawRecord.entries.filter(isRecord).map((entry) => ({
        target: nonEmptyString(entry.target) ?? '',
        status: nonEmptyString(entry.status) as ExpertResearchAuditEntry['status'],
        ...(entry.kind === 'search' || entry.kind === 'url' ? { kind: entry.kind as ExpertResearchAuditEntry['kind'] } : {}),
        ...(nonEmptyString(entry.searchEngine) ? { searchEngine: nonEmptyString(entry.searchEngine) as ExpertResearchAuditEntry['searchEngine'] } : {}),
        ...(nonEmptyString(entry.query) ? { query: nonEmptyString(entry.query) } : {}),
        ...(nonEmptyString(entry.finalUrl) ? { finalUrl: nonEmptyString(entry.finalUrl) } : {}),
        ...(Array.isArray(entry.actionTypes) ? {
          actionTypes: entry.actionTypes
            .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
            .map((item) => item.trim())
            .slice(0, 64),
        } : {}),
        ...(nonEmptyString(entry.detail) ? { detail: nonEmptyString(entry.detail) } : {}),
      })).filter((entry) => entry.target && entry.status),
    })
  }
  return { expertId, packId, packVersion, reviewerEvidenceOnly: true, records }
}

/**
 * Loads the server-generated absorption context only for the declared reviewer
 * after it has persisted its final verdict. Other Experts and agent types get
 * no result, so this remains a ZIP opt-in behavior.
 */
export async function loadExpertPostReviewEvidenceAbsorptionContext(
  agentType: string,
  dependencies: Dependencies = { env: process.env, fetch: globalThis.fetch },
): Promise<ExpertPostReviewEvidenceAbsorptionContext | undefined> {
  if (!agentType.startsWith('expert-')) return undefined
  const sessionId = nonEmptyString(
    dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID,
  )
  const serverUrl = resolveServerUrl(dependencies.env)
  if (!sessionId || !serverUrl) return undefined
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await dependencies.fetch(
      `${serverUrl}/api/sessions/${encodeURIComponent(sessionId)}/expert/post-review-evidence-absorption-context?agentType=${encodeURIComponent(agentType)}`,
      { signal: controller.signal },
    )
    if (!response.ok) return undefined
    return normalizePostReviewEvidenceAbsorptionContext(await response.json())
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

/** Loads bounded upstream researcher evidence only for the ZIP-designated reviewer. */
export async function loadExpertSubagentResearchEvidenceContext(
  agentType: string,
  dependencies: Dependencies = { env: process.env, fetch: globalThis.fetch },
): Promise<ExpertSubagentResearchEvidenceContext | undefined> {
  if (!agentType.startsWith('expert-')) return undefined
  const sessionId = nonEmptyString(
    dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID,
  )
  const serverUrl = resolveServerUrl(dependencies.env)
  if (!sessionId || !serverUrl) return undefined
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await dependencies.fetch(
      `${serverUrl}/api/sessions/${encodeURIComponent(sessionId)}/expert/subagent-research-evidence-context?agentType=${encodeURIComponent(agentType)}`,
      { signal: controller.signal },
    )
    await throwResearchContextGateIfPresent(response)
    if (!response.ok) return undefined
    return normalizeEvidenceContext(await response.json())
  } catch (error) {
    if (error instanceof ExpertSubagentContextGateError) throw error
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Formats reviewer context while keeping file-first research detail inside its
 * declared Markdown. Legacy non-file-first Expert packages retain their old
 * evidence-text context for compatibility.
 */
function formatFileFirstLegacyResearchReceipt(
  record: ExpertSubagentResearchEvidenceContext['records'][number],
): string {
  return [
    '## Upstream file receipt: ' + record.agentType + '/' + record.agentId,
    'Recorded: ' + record.recordedAt,
    'Declared Markdown:',
    record.artifactPath ? '- ' + record.artifactPath : '- No verified Markdown path was retained.',
    'The stored free-form handoff and browser audit are intentionally not forwarded. Read the declared Markdown directly; if no declared path is available, record only that metadata gap in your own declared Markdown.',
  ].join('\n')
}

export function formatExpertSubagentResearchEvidenceContext(
  context: ExpertSubagentResearchEvidenceContext | undefined,
): string | undefined {
  if (!context) return undefined
  if (context.artifactPaths) {
    return [
      '<expert-subagent-research-evidence>',
      'The active Expert ZIP ' + context.packId + '@' + context.packVersion + ' uses file-first research handoffs for this review.',
      'Read only these exact session Markdown artifacts, in offset/limit pages of at most 200 lines until EOF. Do not scan the workDir, do not open tool-result files, and do not call Playwright:',
      '- ' + context.artifactPaths.briefPath,
      ...context.artifactPaths.researcherPaths.map((artifactPath) => '- ' + artifactPath),
      '- ' + context.artifactPaths.auditPath,
      '',
      'Use the research reports plus the server-generated browser audit to classify evidence item by item: include, merge, limited, internal-only, or reject. Opened pages may support facts; limited or failed pages may support only a stated limitation.',
      'Write the review Markdown only to ' + context.artifactPaths.reviewerPath + '. After Write and Read-back verification, hand back exactly one short file receipt only; do not repeat findings, evidence, URLs, or review prose. The parent reads the declared Markdown itself, and the receipt never decides completion.',
      '</expert-subagent-research-evidence>',
    ].join('\n')
  }

  const records = context.records.map((record) => {
    if (isFileFirstExpertResearchAgentType(record.agentType)) {
      return formatFileFirstLegacyResearchReceipt(record)
    }
    const audit = record.entries.map((entry) => {
      const target = entry.kind === 'search'
        ? 'search ' + JSON.stringify(entry.query ?? entry.target) + (entry.searchEngine ? ' [engine=' + entry.searchEngine + ']' : '')
        : entry.target
      return '- ' + entry.status + ': ' + target + (entry.finalUrl ? ' [final_url=' + entry.finalUrl + ']' : '') + (entry.detail ? ' — ' + entry.detail : '')
    }).join('\n')
    return [
      '## Upstream research handoff: ' + record.agentType + '/' + record.agentId,
      'Recorded: ' + record.recordedAt,
      'Artifact receipt:',
      record.content,
      'Playwright audit:',
      audit || '- No valid Playwright audit was retained.',
    ].join('\n')
  }).join('\n\n---\n\n')
  return [
    '<expert-subagent-research-evidence>',
    'The active Expert ZIP ' + context.packId + '@' + context.packVersion + ' has provided the completed upstream research handoffs below.',
    'This is the material you must review. Do not use Read to search the work directory and do not call Playwright to rediscover it.',
    'Treat only opened URL audit entries and the supplied report text as candidate evidence. access_limited, failed, and interrupted entries can support only a limitation or execution-gap statement; pending means the attempt is not terminal.',
    'For each important finding, state whether it is usable and where it should go: include, merge, internal-only, or exclude. Do not downgrade supplied opened evidence to evidence_gap merely because no local file exists.',
    records || 'No upstream researcher handoff was retained. Report that this reviewer has no reviewable upstream evidence.',
    '</expert-subagent-research-evidence>',
  ].join('\n')
}

/**
 * Loads only the selected Expert ZIP's declared delegated-agent Skills from the
 * local Desktop service. This is session-scoped and does not read user files,
 * history, provider configuration, or global Skills.
 */
export async function loadExpertSubagentSkillContext(
  agentType: string,
  dependencies: Dependencies = { env: process.env, fetch: globalThis.fetch },
  options: { researchTaskKind?: ExpertResearchTaskKind } = {},
): Promise<ExpertSubagentSkillContext | undefined> {
  if (!agentType.startsWith('expert-')) return undefined
  const sessionId = nonEmptyString(
    dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID,
  )
  const serverUrl = resolveServerUrl(dependencies.env)
  if (!sessionId || !serverUrl) return undefined

  const url = serverUrl + '/api/sessions/' + encodeURIComponent(sessionId) + '/expert/subagent-skill-context?agentType=' + encodeURIComponent(agentType)
    + (options.researchTaskKind ? '&researchTaskKind=' + encodeURIComponent(options.researchTaskKind) : '')
  for (let attempt = 0; attempt < SKILL_CONTEXT_REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await dependencies.fetch(url, { signal: controller.signal })
      await throwResearchContextGateIfPresent(response)
      if (!response.ok) {
        if (attempt + 1 < SKILL_CONTEXT_REQUEST_ATTEMPTS && response.status >= 500) continue
        return undefined
      }
      const context = normalizeContext(await response.json())
      if (context) return context
      if (attempt + 1 >= SKILL_CONTEXT_REQUEST_ATTEMPTS) return undefined
    } catch (error) {
      if (error instanceof ExpertSubagentContextGateError) throw error
      if (attempt + 1 >= SKILL_CONTEXT_REQUEST_ATTEMPTS) return undefined
    } finally {
      clearTimeout(timeout)
    }
  }
  return undefined
}

function researchSourceOwnerLabel(owner: ExpertSubagentResearchSourceEntry["owner"]): string {
  if (owner === "competitors") return "A：产品与竞品"
  if (owner === "demand-market") return "B：需求与市场"
  return "C：商业化与渠道"
}

/** Resolves the one structured source package that the current child runner will inject. */
export function resolveExpertAssignedResearchSourceBatch(
  context: ExpertSubagentSkillContext | undefined,
  researcherTargetPath: string | undefined,
): ExpertSubagentResearchSourcePlan['batches'][number] | undefined {
  if (!context || !researcherTargetPath || context.researchTaskKind === 'targeted-evidence') return undefined
  return context.researchSourcePlan?.batches.find((candidate) => candidate.artifactPath === researchArtifactRootPath(researcherTargetPath))
}

/** Formats only the one A/B/C source batch assigned to this researcher path. */
export function formatExpertAssignedResearchSourceBatch(
  context: ExpertSubagentSkillContext | undefined,
  researcherTargetPath: string | undefined,
): string | undefined {
  const batch = resolveExpertAssignedResearchSourceBatch(context, researcherTargetPath)
  if (!batch) return undefined
  const coreEntries = batch.entries.filter((entry) => entry.tier === "core")
  const openEntries = batch.entries.filter((entry) => entry.tier === "open")
  const formatEntries = (entries: ExpertSubagentResearchSourceEntry[]) => entries.length === 0
    ? ["- 本批次没有该层来源入口。"]
    : entries.map((entry) => `- [${entry.category}] ${entry.candidateUrl}`)

  return [
    '<expert-research-source-assignment>',
    `唯一负责产物：${researcherTargetPath}`,
    `研究线：${researchSourceOwnerLabel(batch.owner)}`,
    '',
    '这是服务端按 A/B/C 唯一路径分配的当前真实来源执行小批次，不是背景说明。每线本次最多 10 个仍未终态 URL；三条研究方向的工作者通过连续小批次合计覆盖完整的公司 PM 核心库和维护的开放网络。你只处理本包，不能用泛搜索替代，也不要重复其他人或已终态的批次。',
    '对本包每个核心入口和维护的开放平台入口，都做一次有界的真实 Playwright 尝试，并把结果记为 opened、access_limited、failed/no-result，或运行时写入的 interrupted。先导航入口或与该入口直接相关的公开具体页，等待并提取可见内容；首页、搜索页和目录页只用于发现，若页面对当前字段有价值应继续打开具体页。访问受限、失效、无关或失败时如实保留本次结果并继续下一个；不要卡住、编造、重复刷新或要求每页成功；不做每个目录的机械深读，但与产品、用户问题、竞品对比相关的线索应选具体页提取。',
    '处理完当前小批次就把进展追加保存到自己的 Markdown。opened、access_limited、failed/no-result 和 interrupted 都是合法终态，不要求每页成功；服务端只会继续下发下一批未终态 URL。interrupted 表示子代理中断、共享验证阻塞导致动作未执行，或一次定向补查结束后仍缺回执；不等于网站受限或访问失败。相同来源批次已真实结束却缺回执时，运行时最多定向补查一次；再次结束仍缺回执的入口如实记为 interrupted（未执行/未完成），不得记为已访问、网站受限或无结果，然后继续后续阶段。仍在运行的批次不重复派发；派发回执不是完成证明。pending 或未浏览不能冒充完成。实际用于正文且有审计支持的页面进入最终来源表，不能把仅打开的入口都灌成事实引用；所有访问继续完整保留在 06；受限、失败、interrupted、pending 和未打开候选只留在 06-browser-audit.md。',
    '直接竞品覆盖按三条研究方向合计完成：brief 已知竞品按 A=官网/价格/商店/GitHub/Gitee，B=B站/YouTube/Reddit/小红书/知乎/百度贴吧/微博，C=X/SEO/渠道路线分工；如果你在并行执行中发现 brief 未列出的直接竞品，发现者不能假设兄弟代理会看到它，需对官网和上述主流平台各做一次有界发现/具体页尝试。无结果或访问受限是合法终态，不要编造帖子或 URL。',
    '',
    `### 公司 PM 核心来源库（本研究线 ${coreEntries.length} 项，逐项实际尝试）`,
    ...formatEntries(coreEntries),
    '',
    `### 开放补充来源网络（本研究线 ${openEntries.length} 项，逐项真实尝试；无结果可如实记录）`,
    ...formatEntries(openEntries),
    '</expert-research-source-assignment>',
  ].join('\n')
}

/** Creates a meta prompt that makes package-local methods available without the global Skill tool. */
export function formatExpertSubagentSkillContext(
  context: ExpertSubagentSkillContext | undefined,
  input: { researcherTargetPath?: string } = {},
): string | undefined {
  if (!context) return undefined
  const sections: string[] = []
  if (context.skills.length > 0) {
    const skills = context.skills
      .filter((skill) => context.researchTaskKind !== 'targeted-evidence' || skill.skillId !== 'research-source-library')
      .map((skill) => [
      `## Package Skill: ${skill.title} (${skill.skillId})`,
      `Source: ${skill.path} (sha256:${skill.sha256})`,
      skill.content,
    ].join('\n')).join('\n\n---\n\n')
    sections.push([
      '<expert-subagent-package-skills>',
      `The active Expert ZIP ${context.packId}@${context.packVersion} has preloaded the following package-local Skills for this delegated task.`,
      'Apply these instructions directly. Do not call the global Skill tool and do not use Read to locate ZIP Skills: they are already present below.',
      skills,
      '</expert-subagent-package-skills>',
    ].join('\n'))
  }
  if (context.researchTaskKind === 'targeted-evidence' && input.researcherTargetPath) {
    sections.push([
      '<expert-targeted-evidence-task>',
      '本次是专项补证，不是公司来源库小批次。按主代理本次任务中的具体产品、官网、平台或证据缺口取证；不要改跑无关的来源库入口。',
      '保存是 checkpoint，不是结束。完成本次分配的问题、产品/竞品和平台的有界取证后才返回；有相关结果需打开具体页，无结果/受限则记真实边界，不得只打开首页就称已取证。既有文件先分段 Read，再用 Edit 增量补充；独立新分片直接 Write 创建自己的 Markdown，避免为追加内容反复重写长文件或转用 Bash/嵌套 Agent。',
      '既有文件分段 Read 后更新、新分片直接创建：' + input.researcherTargetPath + '，保留已有正文和真实证据。正文只写 Markdown，回传仅该路径和极短状态。',
      '系统仍保存本次真实浏览回执；没有执行的公司来源库入口继续留在原队列。本次结束不能冒充该队列完成、受限或中断。',
      '</expert-targeted-evidence-task>',
    ].join('\n'))
  }
  const sourceAssignment = formatExpertAssignedResearchSourceBatch(context, input.researcherTargetPath)
  if (sourceAssignment) sections.push(sourceAssignment)
  if (context.artifactPaths?.researcherParts && input.researcherTargetPath) {
    sections.push([
      '<expert-research-part-output>',
      '本任务独立 Markdown：' + input.researcherTargetPath,
      'A/B/C 和 02/03/04 是研究方向，不是三个共享大文件。当前工作者只写上述独立分片，不追加或重写根台账，也不复制其他分片。先 Write 创建本任务分片，后续可 Edit 增量补充。分片数量和研究子代理总数不固定。',
      '完整发现、证据、来源及真实限制写进分片，回传仅实际分片路径和极短状态；后续复核及字段吸收会读取全部已登记分片，不需要将其再拼成三个大文件。',
      'Read 必须带 offset/limit，建议每次 200 行，读至 EOF；新分片不存在时直接 Write 创建，不要反复 Read 不存在的文件。长文件不是重新查网站的理由。',
      '</expert-research-part-output>',
    ].join('\n'))
  }
  return sections.length > 0 ? sections.join('\n\n') : undefined
}


/**
 * Writes an audit-only receipt after the child runner has injected its exact
 * A/B/C source package. It deliberately never throws: source-package receipt
 * transport must not prevent a researcher from doing real browser work.
 */
export async function recordExpertSubagentResearchSourceDispatch(
  input: {
    agentId: string
    agentType: string
    artifactPath: string
    batchFingerprint: string
    coreEntryCount: number
    openEntryCount: number
  },
  dependencies: Dependencies = { env: process.env, fetch: globalThis.fetch },
): Promise<void> {
  if (input.agentType !== 'expert-evidence-researcher') return
  const sessionId = nonEmptyString(
    dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID,
  )
  const serverUrl = resolveServerUrl(dependencies.env)
  if (!sessionId || !serverUrl) return
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await dependencies.fetch(
      `${serverUrl}/api/sessions/${encodeURIComponent(sessionId)}/expert/research-source-dispatch`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    )
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.warn(`[expert-research-source-dispatch] failed to record ${input.artifactPath}: HTTP ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ''}`)
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.warn(`[expert-research-source-dispatch] transport failed for ${input.artifactPath}: ${detail}`)
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Sends transcript-derived browser audit data to the active Expert Runtime.
 * This is transport only: the server decides whether the selected ZIP declared
 * a completion contract. Ordinary agents and Experts without that contract are
 * unaffected, and no model-callable tool is introduced.
 */
export class ExpertResearchAuditPersistenceError extends Error {
  readonly code = 'EXPERT_RESEARCH_AUDIT_PERSISTENCE_FAILED'

  constructor(message: string) {
    super(message)
    this.name = 'ExpertResearchAuditPersistenceError'
  }
}

function requiresDurableExpertResearchAudit(agentType: string): boolean {
  return agentType === 'expert-evidence-researcher' || agentType === 'expert-evidence-reviewer' || agentType === 'expert-evidence-output-reviewer'
}

export async function recordExpertSubagentResearchAudit(
  input: { agentId: string; agentType: string; entries: unknown; artifactPath?: unknown; content?: unknown; interrupted?: boolean; completed?: boolean },
  dependencies: Dependencies = { env: process.env, fetch: globalThis.fetch },
): Promise<void> {
  // Legacy workers may have defaulted to general-purpose despite a declared MD target.
  // Forward their real transcript audit; the bound server validates the path and role.
  const legacyResearch = input.agentType === 'general-purpose' && Boolean(safeArtifactPath(input.artifactPath))
  if (!input.agentType.startsWith('expert-') && !legacyResearch) return
  const sessionId = nonEmptyString(
    dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID,
  )
  const serverUrl = resolveServerUrl(dependencies.env)
  if (!sessionId || !serverUrl) {
    if (requiresDurableExpertResearchAudit(input.agentType)) {
      const missing = [
        ...(sessionId ? [] : ['CC_JIANGXIA_EXPERT_SESSION_ID']),
        ...(serverUrl ? [] : ['CC_JIANGXIA_DESKTOP_SERVER_URL']),
      ]
      throw new ExpertResearchAuditPersistenceError(
        `[expert-research-audit] cannot persist audit for ${input.agentType}/${input.agentId}: missing ${missing.join(' and ')}`,
      )
    }
    return
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await dependencies.fetch(
      `${serverUrl}/api/sessions/${encodeURIComponent(sessionId)}/expert/research-audit`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    )
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      const message = `[expert-research-audit] failed to persist audit for ${input.agentType}/${input.agentId}: HTTP ${response.status}${detail ? ` ${detail.slice(0, 480)}` : ''}`
      if (requiresDurableExpertResearchAudit(input.agentType) || legacyResearch) {
        throw new ExpertResearchAuditPersistenceError(message)
      }
      console.error(message)
    }
  } catch (error) {
    if (error instanceof ExpertResearchAuditPersistenceError) throw error
    const detail = error instanceof Error ? error.message : String(error)
    const message = `[expert-research-audit] transport failed for ${input.agentType}/${input.agentId}: ${detail}`
    if (requiresDurableExpertResearchAudit(input.agentType) || legacyResearch) {
      throw new ExpertResearchAuditPersistenceError(message)
    }
    console.error(message)
  } finally {
    clearTimeout(timeout)
  }
}


/** Resolve a missing researcher identity before agent selection, not after execution. */
export async function resolveExpertSubagentTypeForDispatch(
  input: { agentType?: string; artifactPath?: string; workflowRole?: string },
  dependencies: Dependencies = { env: process.env, fetch: globalThis.fetch },
): Promise<string | undefined> {
  if (input.workflowRole || !safeArtifactPath(input.artifactPath)
    || (input.agentType && input.agentType !== 'general-purpose' && !isFileFirstExpertResearchAgentType(input.agentType))) return input.agentType
  const sessionId = nonEmptyString(dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID)
  if (!sessionId) return input.agentType
  const policyJson = dependencies.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY ?? dependencies.env.EXPERT_RESEARCH_ARTIFACT_POLICY
  if (policyJson) {
    try {
      const policy = JSON.parse(policyJson)
      const paths = isRecord(policy) && policy.mode === 'markdown-path-only' ? normalizeArtifactPaths(policy) : undefined
      if (paths) return resolveFileFirstExpertAgentType({ agentType: input.agentType, artifactPath: input.artifactPath, artifactPaths: paths })
    } catch { /* Old/malformed snapshots use the active server context below. */ }
  }
  // Legacy bindings use a read-only context probe, never a batch reservation.
  const context = await loadExpertSubagentSkillContext('expert-evidence-researcher', dependencies, { researchTaskKind: 'targeted-evidence' })
  return resolveFileFirstExpertAgentType({ agentType: input.agentType, artifactPath: input.artifactPath, artifactPaths: context?.artifactPaths })
}
