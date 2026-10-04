import * as path from 'node:path'
import { stat } from 'node:fs/promises'
import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
import {
  resolveExpertResearchArtifactPath,
  resolveRuntimeExpertResearchArtifactPolicy,
  type ExpertResearchArtifactKind,
  type ExpertResearchArtifactPolicy,
} from '../../server/services/expertResearchArtifactPolicyService.js'

export type ExpertTemplateFillWriteResult =
  | { kind: 'not-template-fill' }
  | {
      kind: 'research-artifact'
      filePath: string
      content: string
    }
  | {
      kind: 'rendered-template-fill'
      filePath: string
      content: string
      templateId: string
      confirmWrite: () => Promise<void>
    }

type ExpertTemplateFillOutput = {
  templateId: string
  fields: Record<string, unknown>
  mode?: 'patch' | 'finalize'
  evidenceAbsorption?: unknown
}

function isTemplateFillWriteSession(): boolean {
  return getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_WRITE')?.trim() === '1'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function resolveOutputPath(value: unknown): string {
  if (typeof value !== 'string' || !/\.html?$/i.test(value.trim())) {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: Final Expert delivery must use one .html or .htm filename.')
  }

  const requestedPath = value.trim()
  const outputRoot = getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_OUTPUT_ROOT')?.trim()
  if (!outputRoot) {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: Missing the session output directory for this Expert delivery.')
  }

  let outputName = requestedPath
  if (path.isAbsolute(requestedPath)) {
    const resolvedRequestedPath = path.resolve(requestedPath)
    const resolvedOutputRoot = path.resolve(outputRoot)
    if (!sameResolvedPath(path.dirname(resolvedRequestedPath), resolvedOutputRoot)) {
      throw new Error(
        'EXPERT_TEMPLATE_FILL_REJECTED: Final report file_path must be an .html filename, or an absolute .html path whose parent is exactly the current session workDir. Do not ask the user for a filename; correct file_path and retry.',
      )
    }
    outputName = path.basename(resolvedRequestedPath)
  }

  if (path.basename(outputName) !== outputName || outputName === '.' || outputName === '..') {
    throw new Error(
      'EXPERT_TEMPLATE_FILL_REJECTED: Final report file_path must be one .html filename in the current session workDir. Do not ask the user for a filename; correct file_path and retry.',
    )
  }
  return path.resolve(outputRoot, outputName)
}

function parseExpertOutput(value: unknown): ExpertTemplateFillOutput {
  if (!isRecord(value)) {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: Write.expert_output must be an object with templateId and fields.')
  }
  const templateId = typeof value.templateId === 'string' ? value.templateId.trim() : ''
  if (!templateId) {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: Write.expert_output.templateId must be a non-empty string.')
  }
  if (!isRecord(value.fields)) {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: Write.expert_output.fields must be an object keyed by template field ID.')
  }
  if (value.mode !== undefined && value.mode !== 'patch' && value.mode !== 'finalize') {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: Write.expert_output.mode must be patch or finalize when it is provided.')
  }
  return {
    templateId,
    fields: value.fields,
    ...(value.mode === 'patch' || value.mode === 'finalize' ? { mode: value.mode } : {}),
    ...(value.evidenceAbsorption !== undefined ? { evidenceAbsorption: value.evidenceAbsorption } : {}),
  }
}

export function resolveSessionResearchArtifactPolicy(): ExpertResearchArtifactPolicy | undefined {
  const raw = getJiangxiaEnvValue('EXPERT_RESEARCH_ARTIFACT_POLICY')?.trim()
  if (!raw) return undefined
  try {
    return resolveRuntimeExpertResearchArtifactPolicy(raw)
  } catch {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: The session research-artifact policy is invalid.')
  }
}

/**
 * Allows only an exact declared Markdown artifact to be read by an opted-in
 * Expert session. It is intentionally session-scoped and does not widen normal
 * workspace Read access for ordinary chats or Experts.
 */
export function isSessionResearchArtifactReadAllowed(
  filePath: unknown,
  allowedKinds: ExpertResearchArtifactKind[],
): boolean {
  try {
    const policy = resolveSessionResearchArtifactPolicy()
    const outputRoot = getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_OUTPUT_ROOT')?.trim()
    if (!policy || !outputRoot) return false
    resolveExpertResearchArtifactPath({
      workDir: outputRoot,
      policy,
      artifactPath: filePath,
      allowedKinds,
    })
    return true
  } catch {
    return false
  }
}

// A session-scoped proof of actual successful parent reads, not a required
// Read invocation shape. Complete pagination and one-shot reads are equivalent.
const reportFieldAbsorptionReads = new Set<string>()

type ExpertTemplateOutputReviewState = {
  reportPath: string
  reviewRead: boolean
}

// The first structured Write produces a real rendered draft so a constrained
// reviewer can compare it with 07. This state is session-scoped and intentionally
// contains paths only, never report prose, browser data, or user materials.
const expertTemplateOutputReviewStates = new Map<string, ExpertTemplateOutputReviewState>()

function reportFieldAbsorptionReadKey(
  policy: ExpertResearchArtifactPolicy,
  outputRoot: string,
): string | undefined {
  if (!policy.absorptionPath) return undefined
  const sessionId = getJiangxiaEnvValue('EXPERT_SESSION_ID')?.trim()
  return sessionId ? [sessionId, outputRoot, policy.absorptionPath].join('\u0000') : undefined
}

function outputReviewStateKey(
  policy: ExpertResearchArtifactPolicy,
  outputRoot: string,
): string | undefined {
  if (!policy.completionReviewPath) return undefined
  const sessionId = getJiangxiaEnvValue('EXPERT_SESSION_ID')?.trim()
  return sessionId ? [sessionId, outputRoot, policy.completionReviewPath].join('\u0000') : undefined
}

function sameResolvedPath(left: string, right: string): boolean {
  // Windows paths are case-insensitive; this keeps session scoping correct for
  // a rendered report returned with a different drive-letter casing.
  return path.resolve(left).replace(/\\/g, '/').toLowerCase() === path.resolve(right).replace(/\\/g, '/').toLowerCase()
}

export type CurrentExpertTemplateOutputReviewContext = {
  briefPath: string
  absorptionPath: string
  completionReviewPath: string
  reportPath: string
}

/** Provides the exact files a post-render reviewer may use, and nothing else. */
export function currentExpertTemplateOutputReviewContext(): CurrentExpertTemplateOutputReviewContext | undefined {
  const policy = resolveSessionResearchArtifactPolicy()
  const outputRoot = getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_OUTPUT_ROOT')?.trim()
  if (!policy?.absorptionPath || !policy.completionReviewPath || !outputRoot) return undefined
  const key = outputReviewStateKey(policy, outputRoot)
  const state = key ? expertTemplateOutputReviewStates.get(key) : undefined
  if (!state) return undefined
  return {
    briefPath: policy.briefPath,
    absorptionPath: policy.absorptionPath,
    completionReviewPath: policy.completionReviewPath,
    reportPath: state.reportPath,
  }
}

/** Used by the constrained output-reviewer permission branch. */
export function isCurrentExpertTemplateOutputReviewReportPath(
  filePath: unknown,
  persistedReportPath?: unknown,
): boolean {
  if (typeof filePath !== 'string' || !filePath.trim()) return false
  const current = currentExpertTemplateOutputReviewContext()
  if (current && sameResolvedPath(filePath, current.reportPath)) return true
  return typeof persistedReportPath === 'string'
    && persistedReportPath.trim()
    && sameResolvedPath(filePath, persistedReportPath)
}

type ReportReadProgress = {
  filePath: string
  mtimeMs: number
  totalBytes: number
  fileSize: number
  totalLines: number
  ranges: Array<[number, number]>
}
const reportReadProgress = new Map<string, ReportReadProgress>()

function reportReadTarget(filePath: unknown) {
  try {
    const policy = resolveSessionResearchArtifactPolicy()
    const root = getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_OUTPUT_ROOT')?.trim()
    if (!policy || !root) return undefined
    const resolved = resolveExpertResearchArtifactPath({ workDir: root, policy, artifactPath: filePath, allowedKinds: ['field-absorption', 'final-output-review'] })
    const key = resolved.relativePath === policy.absorptionPath
      ? reportFieldAbsorptionReadKey(policy, root) : outputReviewStateKey(policy, root)
    return key ? { key, filePath: resolved.absolutePath } : undefined
  } catch { return undefined }
}

/** Re-read these two handoff files instead of returning an unowned cache stub. */
export function isMainAgentReportHandoffRead(filePath: unknown): boolean {
  return Boolean(reportReadTarget(filePath))
}

function invalidateReportRead(key: string): void {
  reportReadProgress.delete(key)
  reportFieldAbsorptionReads.delete(key)
  const review = expertTemplateOutputReviewStates.get(key)
  if (review) review.reviewRead = false
}

/** Called only after a successful, untruncated text Read by the parent. */
export async function recordMainAgentReportReadPage(filePath: string, page: {
  offset: number; lineCount: number; totalLines: number; totalBytes: number; mtimeMs: number
}): Promise<void> {
  const target = reportReadTarget(filePath)
  if (!target) return
  // The reader strips BOMs from text byte counts. Track disk size separately,
  // and reject a page whose file revision changed while it was being read.
  let fileSize: number
  try {
    const current = await stat(target.filePath)
    if (current.mtimeMs !== page.mtimeMs) {
      invalidateReportRead(target.key)
      return
    }
    fileSize = current.size
  } catch {
    invalidateReportRead(target.key)
    return
  }
  let progress = reportReadProgress.get(target.key)
  if (!progress || progress.mtimeMs !== page.mtimeMs || progress.totalBytes !== page.totalBytes || progress.totalLines !== page.totalLines || progress.fileSize !== fileSize) {
    invalidateReportRead(target.key)
    progress = { filePath: target.filePath, mtimeMs: page.mtimeMs, totalBytes: page.totalBytes, fileSize, totalLines: page.totalLines, ranges: [] }
    reportReadProgress.set(target.key, progress)
  }
  if (page.lineCount <= 0) return
  const start = Math.max(1, page.offset)
  progress.ranges.push([start, Math.min(page.totalLines, start + page.lineCount - 1)])
  progress.ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of progress.ranges) {
    const last = merged.at(-1)
    if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
  }
  progress.ranges = merged
  if (merged[0]?.[0] === 1 && merged[0][1] >= page.totalLines) {
    recordMainAgentReportFieldAbsorptionRead(target.filePath)
    recordMainAgentReportCompletenessReviewRead(target.filePath)
  }
}

async function refreshReportRead(key: string): Promise<void> {
  const progress = reportReadProgress.get(key)
  if (!progress) return
  try {
    const current = await stat(progress.filePath)
    if (current.mtimeMs === progress.mtimeMs && current.size === progress.fileSize) return
  } catch { /* A removed/replaced handoff is not a current read. */ }
  invalidateReportRead(key)
}

function reportReadRecovery(key: string | undefined): string {
  const progress = key ? reportReadProgress.get(key) : undefined
  const next = progress?.ranges[0]?.[0] === 1 ? progress.ranges[0][1] + 1 : 1
  return ' 支持分页累计读取，无需整文件重读；请从未读位置 offset=' + next + ' 继续 Read（可设置 limit），直到 EOF。'
}

export function recordMainAgentReportFieldAbsorptionRead(filePath: unknown): void {
  try {
    const policy = resolveSessionResearchArtifactPolicy()
    const outputRoot = getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_OUTPUT_ROOT')?.trim()
    if (!policy || !outputRoot || !policy.absorptionPath) return
    const resolved = resolveExpertResearchArtifactPath({
      workDir: outputRoot,
      policy,
      artifactPath: filePath,
      allowedKinds: ['field-absorption'],
    })
    if (resolved.relativePath !== policy.absorptionPath) return
    const key = reportFieldAbsorptionReadKey(policy, outputRoot)
    if (key) reportFieldAbsorptionReads.add(key)
  } catch {
    // A normal Read error or an unrelated file never satisfies this guard.
  }
}

/** A complete parent read of 08, paginated or one-shot, unlocks this review cycle. */
export function recordMainAgentReportCompletenessReviewRead(filePath: unknown): void {
  try {
    const policy = resolveSessionResearchArtifactPolicy()
    const outputRoot = getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_OUTPUT_ROOT')?.trim()
    if (!policy || !outputRoot || !policy.completionReviewPath) return
    const resolved = resolveExpertResearchArtifactPath({
      workDir: outputRoot,
      policy,
      artifactPath: filePath,
      allowedKinds: ['final-output-review'],
    })
    if (resolved.relativePath !== policy.completionReviewPath) return
    const key = outputReviewStateKey(policy, outputRoot)
    const state = key ? expertTemplateOutputReviewStates.get(key) : undefined
    if (state) state.reviewRead = true
  } catch {
    // A normal Read error or an unrelated file never satisfies this guard.
  }
}

function clearMainAgentReportFieldAbsorptionRead(policy: ExpertResearchArtifactPolicy, outputRoot: string): void {
  const key = reportFieldAbsorptionReadKey(policy, outputRoot)
  if (key) invalidateReportRead(key)
  const outputReviewKey = outputReviewStateKey(policy, outputRoot)
  if (outputReviewKey) {
    invalidateReportRead(outputReviewKey)
    expertTemplateOutputReviewStates.delete(outputReviewKey)
  }
}

export function resetMainAgentReportFieldAbsorptionReadsForTests(): void {
  reportReadProgress.clear()
  reportFieldAbsorptionReads.clear()
  expertTemplateOutputReviewStates.clear()
}

async function requireMainAgentReportFieldAbsorptionRead(): Promise<void> {
  const policy = resolveSessionResearchArtifactPolicy()
  const outputRoot = getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_OUTPUT_ROOT')?.trim()
  if (!policy?.absorptionPath || !outputRoot) return
  const key = reportFieldAbsorptionReadKey(policy, outputRoot)
  if (key) await refreshReportRead(key)
  if (!key || !reportFieldAbsorptionReads.has(key)) {
    throw new Error('EXPERT_TEMPLATE_FILL_REPORT_ABSORPTION_READ_REQUIRED: Before final report Write, Read the declared report-field absorption Markdown written after evidence review. Do not reopen every raw ledger or recreate it in the final response.' + reportReadRecovery(key))
  }
}

async function requireMainAgentReportCompletenessReviewRead(payload: ExpertTemplateFillOutput): Promise<void> {
  if (payload.mode !== 'patch' && payload.mode !== 'finalize') return
  const policy = resolveSessionResearchArtifactPolicy()
  const outputRoot = getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_OUTPUT_ROOT')?.trim()
  if (!policy?.completionReviewPath || !outputRoot) return
  const key = outputReviewStateKey(policy, outputRoot)
  const state = key ? expertTemplateOutputReviewStates.get(key) : undefined
  if (key) await refreshReportRead(key)
  if (state && !state.reviewRead) {
    throw new Error('EXPERT_TEMPLATE_FILL_OUTPUT_REVIEW_READ_REQUIRED: The initial report draft is saved. First invoke the constrained output reviewer, then Read its declared report-completeness Markdown before the terminal Write. Use mode="patch" only for a source-supported omission or correction grounded in 07; otherwise mode="finalize" with fields: {}. Do not rewrite the whole report from memory.' + reportReadRecovery(key))
  }
}

/** Adds a concrete next step to the initial Write receipt without changing normal Write behavior. */
export function expertTemplateFillPostWriteNotice(filePath: unknown): string | undefined {
  if (typeof filePath !== 'string' || !filePath.trim()) return undefined
  const current = currentExpertTemplateOutputReviewContext()
  const policy = resolveSessionResearchArtifactPolicy()
  const outputRoot = getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_OUTPUT_ROOT')?.trim()
  const key = policy && outputRoot ? outputReviewStateKey(policy, outputRoot) : undefined
  if (!current || (key && expertTemplateOutputReviewStates.get(key)?.reviewRead) || !sameResolvedPath(filePath, current.reportPath)) return undefined
  return 'This is the initial rendered report draft, not the final delivery. Immediately invoke the constrained expert-evidence-output-reviewer. Its research inputs are only the brief, 07 absorption Markdown, and this exact HTML; it must Write the declared 08 completeness review and may Read that same 08 to verify saving. Then Read 08. Complete one successful terminal Write; rejected or unsaved attempts may be corrected and retried on the same draft without restarting research. Use mode="patch" only when the natural-language review plainly identifies a source-supported omission or correction grounded in 07 that needs a patch; otherwise send mode="finalize" with empty fields so the reviewed draft becomes final without a rewrite.'
}

const RESEARCH_ARTIFACT_KINDS: ExpertResearchArtifactKind[] = [
  'research-brief',
  'researcher-report',
  'evidence-review',
  'browser-audit',
  'field-absorption',
  'final-output-review',
]

function inferResearchArtifactKind(
  policy: ExpertResearchArtifactPolicy,
  outputRoot: string,
  artifactPath: unknown,
): ExpertResearchArtifactKind | undefined {
  for (const kind of RESEARCH_ARTIFACT_KINDS) {
    try {
      resolveExpertResearchArtifactPath({
        workDir: outputRoot,
        policy,
        artifactPath,
        allowedKinds: [kind],
      })
      return kind
    } catch {
      // Try the next declared artifact kind. The actual write below repeats the
      // resolution so it can retain the canonical path and validation error.
    }
  }
  return undefined
}

function isResearchMarkdownWriteAttempt(input: Record<string, unknown>): boolean {
  if (input.expert_output !== undefined) return false
  return typeof input.file_path === 'string'
    && input.file_path.trim().toLowerCase().endsWith('.md')
    && Boolean(resolveSessionResearchArtifactPolicy())
}

type BriefRouteBlock = { id: string; body: string }

function briefRouteBlocks(markdown: string): BriefRouteBlock[] {
  const routes: BriefRouteBlock[] = []
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

function briefRouteLineValue(body: string, label: string): string | undefined {
  const prefix = '- ' + label + ':'
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line.toLowerCase().startsWith(prefix.toLowerCase())) continue
    const value = line.slice(prefix.length).trim().replace(/^\x60|\x60$/g, '')
    if (value) return value
  }
  return undefined
}

function briefRouteOwnerMatches(ownerReport: string, researcherPath: string): boolean {
  const owner = ownerReport.replace(/\\/g, '/').trim().toLowerCase()
  const researcher = researcherPath.replace(/\\/g, '/').trim().toLowerCase()
  if (owner === researcher) return true
  return !owner.includes('/') && owner === path.basename(researcher)
}

function briefDocumentLineValue(markdown: string, label: string): string | undefined {
  const prefix = '- ' + label + ':'
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line.toLowerCase().startsWith(prefix.toLowerCase())) continue
    const value = line.slice(prefix.length).trim().replace(/^\x60|\x60$/g, '')
    if (value) return value
  }
  return undefined
}

function briefMarketScope(markdown: string): 'dual' | 'cn' | 'global' | undefined {
  const raw = briefDocumentLineValue(markdown, 'Market scope')?.toLowerCase()
  if (!raw) return undefined
  if (/^(?:dual|both|cn\s*\+\s*global|中外双线|中国\s*\+\s*(?:海外|国际))$/i.test(raw)) return 'dual'
  if (/(?:^|[\s/,:;])(?:china|chinese|中国|中文)(?:-?only|市场?限定|为主|仅|$)/i.test(raw) || /^(?:中国|中文)(?:市场)?$/i.test(raw)) return 'cn'
  if (/(?:^|[\s/,:;])(?:overseas|international|global|海外|国际)(?:-?only|市场?限定|为主|仅|$)/i.test(raw) || /^(?:海外|国际)(?:市场)?$/i.test(raw)) return 'global'
  return undefined
}

function sourceLaneMarket(lane: string): 'cn' | 'global' | undefined {
  const normalized = lane.trim().toLowerCase()
  if (/^(?:cn|china|chinese)(?:-|_)/.test(normalized)) return 'cn'
  if (/^(?:global|overseas|international|intl)(?:-|_)/.test(normalized)) return 'global'
  return undefined
}

function requiredBriefSourceLanes(policy: ExpertResearchArtifactPolicy, researcherPath: string, scope: 'dual' | 'cn' | 'global'): string[] {
  const legacy = policy.routeCompletion?.mode === 'dynamic-route-status-v1' ? policy.routeCompletion : undefined
  const configured = Object.entries(legacy?.requiredSourceLanesByReport ?? {})
    .find(([reportPath]) => briefRouteOwnerMatches(reportPath, researcherPath))?.[1] ?? []
  if (scope === 'dual') return configured
  return configured.filter((lane) => sourceLaneMarket(lane) === scope)
}

/**
 * The route-completion gate belongs at brief creation time: without an assigned
 * route, a researcher can only discover the contradiction after it has already
 * browsed and attempted its final Write. This validates structure, not research
 * length, sources, conclusions, or any product-specific route content.
 */
function validateResearchBriefRoutePlan(policy: ExpertResearchArtifactPolicy, markdown: string): string[] {
  if (policy.routeCompletion?.mode !== 'dynamic-route-status-v1') return []
  const routes = briefRouteBlocks(markdown)
  if (routes.length === 0) {
    return ['Add at least one dynamic ### Route block for each delegated researcher before starting A/B/C.']
  }
  const issues: string[] = []
  const marketScope = policy.routeCompletion.defaultMarketScope
    ? briefMarketScope(markdown)
    : undefined
  if (policy.routeCompletion.defaultMarketScope && !marketScope) {
    issues.push('The brief must declare one - Market scope: dual | China-only | Overseas-only line before starting researchers.')
  }
  if (policy.routeCompletion.defaultMarketScope && briefDocumentLineValue(markdown, 'Market scope') && !marketScope) {
    issues.push('Market scope must be dual, China-only, or Overseas-only so the route gate can keep Chinese and overseas evidence separate.')
  }
  for (const researcherPath of policy.researcherPaths) {
    const owned = routes.filter((route) => {
      const owner = briefRouteLineValue(route.body, 'Owner report')
      return Boolean(owner && briefRouteOwnerMatches(owner, researcherPath))
    })
    if (owned.length === 0) {
      issues.push('No Route assigns Owner report: ' + researcherPath + '.')
      continue
    }
    for (const route of owned) {
      const missing = ['Goal', 'First route', 'Fallback route', 'Completion bar'].filter((label) => !briefRouteLineValue(route.body, label))
      if (missing.length > 0) {
        issues.push('Route ' + route.id + ' for ' + researcherPath + ' is missing ' + missing.join(', ') + '.')
      }
    }
    if (marketScope) {
      for (const lane of requiredBriefSourceLanes(policy, researcherPath, marketScope)) {
        if (!owned.some((route) => briefRouteLineValue(route.body, 'Source lane') === lane)) {
          issues.push('The ' + marketScope + ' brief must assign Source lane: ' + lane + ' to a Route owned by ' + researcherPath + '.')
        }
      }
    }
  }
  return issues
}

function resolveResearchArtifactWrite(input: Record<string, unknown>): Extract<ExpertTemplateFillWriteResult, { kind: 'research-artifact' }> {
  if (input.expert_output !== undefined) {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: A research Markdown artifact cannot include expert_output.')
  }
  const policy = resolveSessionResearchArtifactPolicy()
  if (!policy) {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: This Expert session does not permit research Markdown artifacts.')
  }
  const outputRoot = getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_OUTPUT_ROOT')?.trim()
  if (!outputRoot) {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: Missing the session output directory for this Expert delivery.')
  }
  // The exact Markdown path is the authority for the internal artifact kind.
  // This internal classification is inferred by the runtime, never supplied by the model.
  const kind = inferResearchArtifactKind(policy, outputRoot, input.file_path)
  if (!kind) {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: Research Markdown file_path must exactly match a Markdown artifact declared for this Expert session.')
  }
  const resolved = resolveExpertResearchArtifactPath({
    workDir: outputRoot,
    policy,
    artifactPath: input.file_path,
    allowedKinds: [kind],
  })
  if (typeof input.content !== 'string' || !input.content.trim()) {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: Research Markdown artifact content must be non-empty.')
  }
  // Research size is a splitting hint, not a write gate. Persist evidence even if an old worker still writes a long ledger.
  if (kind === 'research-brief') {
    const routePlanIssues = validateResearchBriefRoutePlan(policy, input.content)
    if (routePlanIssues.length > 0) {
      throw new Error('EXPERT_RESEARCH_BRIEF_ROUTE_PLAN_REQUIRED: ' + routePlanIssues.join(' '))
    }
  }
  if (kind === 'research-brief' || kind === 'field-absorption') {
    clearMainAgentReportFieldAbsorptionRead(policy, outputRoot)
  }
  return { kind: 'research-artifact', filePath: resolved.absolutePath, content: input.content }
}

function resolveServerUrl(): string {
  const raw = getJiangxiaEnvValue('DESKTOP_SERVER_URL')?.trim()
  if (!raw) throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: Missing the Desktop Expert renderer URL for this session.')
  try {
    return new URL(raw).toString().replace(/\/$/, '')
  } catch {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: The Desktop Expert renderer URL is invalid for this session.')
  }
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: unknown; error?: unknown }
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const code = typeof body.error === 'string' ? body.error.trim() : ''
    // Preserve the machine-readable server code in the returned tool error.
    // The execution layer uses terminal codes to stop a model from repeatedly
    // retrying a delivery that has already exhausted its repair allowance.
    if (code && message) return code + ': ' + message
    if (message) return message
    if (code) return code
  } catch {
    // Fall through to a concise HTTP fallback below.
  }
  return 'Template renderer returned HTTP ' + response.status + '.'
}

/**
 * Template-fill Experts keep the user-visible Write tool, but transform its
 * opt-in structured payload into final HTML before the shared filesystem tool
 * sees it. This removes model-authored shell/heredoc/temporary-file delivery.
 */
export async function renderExpertTemplateFillForWrite(input: Record<string, unknown>): Promise<ExpertTemplateFillWriteResult> {
  if (!isTemplateFillWriteSession()) return { kind: 'not-template-fill' }

  if (isResearchMarkdownWriteAttempt(input)) return resolveResearchArtifactWrite(input)

  if (!Object.keys(input).length || input.file_path === undefined || input.expert_output === undefined) {
    throw new Error('EXPERT_TEMPLATE_FILL_REPAIR_REQUIRED: A previous report draft, if any, is retained. Do not send an empty Write. Keep the same file_path and templateId. Before an initial draft exists, submit complete fields or repair the retained candidate. After the initial draft is saved, follow 08: mode="patch" only for a source-supported correction, otherwise mode="finalize" with fields: {}. Do not add placeholder fields or send an empty patch.')
  }

  const outputPath = resolveOutputPath(input.file_path)
  if (input.content !== '') {
    throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: Final Expert Write.content must be an empty string; provide report fields only in expert_output.')
  }
  const payload = parseExpertOutput(input.expert_output)
  await requireMainAgentReportFieldAbsorptionRead()
  await requireMainAgentReportCompletenessReviewRead(payload)
  const sessionId = getJiangxiaEnvValue('EXPERT_SESSION_ID')?.trim()
  if (!sessionId) throw new Error('EXPERT_TEMPLATE_FILL_REJECTED: Missing the active Expert session ID.')

  let response: Response
  try {
    const endpoint = resolveServerUrl() + '/api/sessions/' + encodeURIComponent(sessionId) + '/expert/template-fill'
    response = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // The server persists this already runtime-validated, workDir-scoped path
      // with the draft so reconnect recovery can invoke 08 on the same HTML.
      body: JSON.stringify({ payload, outputPath }),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error('EXPERT_TEMPLATE_FILL_RENDER_FAILED: Could not reach the Desktop Expert renderer: ' + detail)
  }

  if (!response.ok) {
    throw new Error('EXPERT_TEMPLATE_FILL_RENDER_FAILED: ' + await responseMessage(response))
  }

  let body: { content?: unknown; templateId?: unknown; completionReviewRequired?: unknown; writeReceipt?: unknown }
  try {
    body = await response.json() as { content?: unknown; templateId?: unknown; completionReviewRequired?: unknown; writeReceipt?: unknown }
  } catch {
    throw new Error('EXPERT_TEMPLATE_FILL_RENDER_FAILED: The Desktop Expert renderer returned invalid JSON.')
  }
  if (typeof body.content !== 'string' || !body.content.trim() || typeof body.templateId !== 'string' || !body.templateId.trim()) {
    throw new Error('EXPERT_TEMPLATE_FILL_RENDER_FAILED: The Desktop Expert renderer returned an invalid template result.')
  }

  const confirmWrite = async () => {
    if (typeof body.writeReceipt === 'string' && body.writeReceipt) {
      // Retry only the acknowledgement once on a transient transport failure.
      // Never rewrite/re-render the report just because an acknowledgement was lost.
      let acknowledged = false
      let lastError: unknown
      for (let attempt = 0; attempt < 2 && !acknowledged; attempt++) {
        try {
          const ack = await globalThis.fetch(resolveServerUrl() + '/api/sessions/' + encodeURIComponent(sessionId) + '/expert/template-fill-commit', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ receipt: body.writeReceipt, outputPath }),
          })
          if (!ack.ok) {
            const error = new Error(await responseMessage(ack))
            if (ack.status < 500) { lastError = error; break }
            throw error
          }
          const value = await ack.json() as { committed?: unknown }
          if (value.committed !== true) throw new Error('Renderer did not acknowledge the saved file.')
          acknowledged = true
        } catch (error) { lastError = error }
      }
      if (!acknowledged) throw new Error('EXPERT_TEMPLATE_FILL_WRITE_CONFIRM_FAILED: 文件写入已执行，但服务器尚未确认；保留原字段重试同一 Write，不要重做调研。' + String(lastError))
    }
    const policy = resolveSessionResearchArtifactPolicy()
    const outputRoot = getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_OUTPUT_ROOT')?.trim()
    if (policy?.completionReviewPath && outputRoot) {
      const key = outputReviewStateKey(policy, outputRoot)
      // The first successful render may be a patch of rejected candidate fields.
      // Follow server state, not the request verb; absent flags support older servers.
      if (body.completionReviewRequired === true || (body.completionReviewRequired === undefined && payload.mode === undefined)) {
        if (key) {
          invalidateReportRead(key)
          expertTemplateOutputReviewStates.set(key, { reportPath: outputPath, reviewRead: false })
        }
      } else if (key) {
        // A patch or a no-change finalize consumes this exact review cycle. Do not
        // keep a stale state that could affect the next independently rendered draft.
        expertTemplateOutputReviewStates.delete(key)
      }
    }
  }

  return {
    kind: 'rendered-template-fill',
    filePath: outputPath,
    content: body.content,
    templateId: body.templateId,
    confirmWrite,
  }
}
