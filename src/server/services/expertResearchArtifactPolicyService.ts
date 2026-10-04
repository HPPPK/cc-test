import * as path from 'node:path'
import { researchArtifactRootPath } from '../../services/tools/expertFileFirstResearchProtocol.js'
// Legacy sessions can still deserialize this retired shape so their runtime
// binding can be upgraded safely. It is no longer used as a Markdown write gate.
type LegacyResearchRouteCompletionSettings = {
  defaultMarketScope?: 'dual'
  requiredSourceLanesByReport?: Record<string, string[]>
  sourceLanes?: Record<string, { hostSuffixes: string[]; allowConcreteOpenedPageFallback?: boolean }>
}

type ResearchRouteCompletionSettings =
  | ({ mode: 'dynamic-route-status-v1' } & LegacyResearchRouteCompletionSettings)
  | { mode: 'dynamic-route-status-v2'; requireAttemptedRequiredRoutes: true }
type JsonRecord = Record<string, unknown>

export type ExpertResearchArtifactKind = 'research-brief' | 'researcher-report' | 'evidence-review' | 'browser-audit' | 'field-absorption' | 'final-output-review'

export type ExpertResearchArtifactPolicy = {
  mode: 'markdown-path-only'
  directory: string
  briefPath: string
  researcherPaths: string[]
  /** Each worker may save an independent Markdown under its lane .parts directory. */
  researcherParts?: boolean
  reviewerPath: string
  auditPath: string
  /** Optional for legacy ZIP compatibility; new file-first packs may require it before final delivery. */
  absorptionPath?: string
  /** Optional completion check written after the first rendered report draft. */
  completionReviewPath?: string
  /** Optional runtime gate for dynamic, brief-selected research route completion. */
  routeCompletion?: ResearchRouteCompletionSettings
  /** Pack opt-in: every opened concrete public page needs an explicit research-ledger disposition. */
  requireOpenedPageDisposition?: boolean
  maxCharacters: number
}

export type ResolvedExpertResearchArtifactPath = {
  relativePath: string
  absolutePath: string
}

const MAX_ARTIFACT_CHARACTERS = 120_000

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeRelativeMarkdownPath(value: unknown, field: string): string {
  const raw = text(value)
  if (!raw) throw new Error(`${field} 必须是非空相对 Markdown 文件路径。`)
  const normalized = raw.replace(/\\/g, '/')
  if (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..') ||
    !normalized.endsWith('.md')
  ) {
    throw new Error(`${field} 必须是安全的相对 .md 文件路径。`)
  }
  return normalized
}

function normalizeDirectory(value: unknown): string {
  const raw = text(value)
  if (!raw) throw new Error('researchArtifacts.directory 必须是非空相对目录。')
  const normalized = raw.replace(/\\/g, '/').replace(/\/$/, '')
  if (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('researchArtifacts.directory 必须是安全的相对目录。')
  }
  return normalized
}

function routeLaneId(value: unknown, field: string): string {
  const id = text(value)
  if (!id || !/^[a-z][a-z0-9-]{0,63}$/.test(id)) {
    throw new Error(`${field} 必须是小写 source lane 标识。`)
  }
  return id
}

function routeCompletionSettings(value: unknown): ResearchRouteCompletionSettings {
  if (!isRecord(value) || (value.mode !== 'dynamic-route-status-v1' && value.mode !== 'dynamic-route-status-v2')) {
    throw new Error('researchArtifacts.routeCompletion.mode 必须为 dynamic-route-status-v1 或 dynamic-route-status-v2。')
  }
  if (value.mode === 'dynamic-route-status-v2') {
    if (value.requireAttemptedRequiredRoutes !== true) {
      throw new Error('researchArtifacts.routeCompletion.requireAttemptedRequiredRoutes 必须为 true。')
    }
    return { mode: 'dynamic-route-status-v2', requireAttemptedRequiredRoutes: true }
  }
  const defaultMarketScope = value.defaultMarketScope === undefined
    ? undefined
    : value.defaultMarketScope === 'dual'
      ? 'dual' as const
      : (() => { throw new Error('researchArtifacts.routeCompletion.defaultMarketScope 如声明必须为 dual。') })()
  const requiredSourceLanesByReport = value.requiredSourceLanesByReport === undefined
    ? undefined
    : (() => {
        if (!isRecord(value.requiredSourceLanesByReport)) {
          throw new Error('researchArtifacts.routeCompletion.requiredSourceLanesByReport 必须是对象。')
        }
        const entries = Object.entries(value.requiredSourceLanesByReport).map(([reportPath, lanes]) => {
          const normalizedReportPath = normalizeRelativeMarkdownPath(reportPath, 'researchArtifacts.routeCompletion.requiredSourceLanesByReport')
          if (!Array.isArray(lanes) || lanes.length === 0) {
            throw new Error('researchArtifacts.routeCompletion.requiredSourceLanesByReport 每个报告必须声明非空 source lane 数组。')
          }
          return [normalizedReportPath, [...new Set(lanes.map((lane) => routeLaneId(lane, 'researchArtifacts.routeCompletion.requiredSourceLanesByReport')))] ] as const
        })
        return Object.fromEntries(entries)
      })()
  const sourceLanes = value.sourceLanes === undefined
    ? undefined
    : (() => {
        if (!isRecord(value.sourceLanes)) throw new Error('researchArtifacts.routeCompletion.sourceLanes 必须是对象。')
        const entries = Object.entries(value.sourceLanes).map(([lane, config]) => {
          const laneId = routeLaneId(lane, 'researchArtifacts.routeCompletion.sourceLanes')
          if (!isRecord(config) || !Array.isArray(config.hostSuffixes) || config.hostSuffixes.length === 0) {
            throw new Error('researchArtifacts.routeCompletion.sourceLanes.' + laneId + '.hostSuffixes 必须是非空域名后缀数组。')
          }
          const hostSuffixes = [...new Set(config.hostSuffixes.map((host) => {
            const normalized = text(host)?.toLowerCase().replace(/^\./, '')
            if (!normalized || !/^[a-z0-9.-]+$/.test(normalized) || normalized.includes('..') || normalized.startsWith('-') || normalized.endsWith('-')) {
              throw new Error('researchArtifacts.routeCompletion.sourceLanes.' + laneId + '.hostSuffixes 包含无效域名后缀。')
            }
            return normalized
          }))]
          const allowConcreteOpenedPageFallback = config.allowConcreteOpenedPageFallback === undefined
            ? undefined
            : typeof config.allowConcreteOpenedPageFallback === 'boolean'
              ? config.allowConcreteOpenedPageFallback
              : (() => { throw new Error('researchArtifacts.routeCompletion.sourceLanes.' + laneId + '.allowConcreteOpenedPageFallback 必须为布尔值。') })()
          return [laneId, { hostSuffixes, ...(allowConcreteOpenedPageFallback ? { allowConcreteOpenedPageFallback: true } : {}) }] as const
        })
        return Object.fromEntries(entries)
      })()
  if ((requiredSourceLanesByReport || sourceLanes) && !defaultMarketScope) {
    throw new Error('声明来源路线规则时，researchArtifacts.routeCompletion.defaultMarketScope 必须为 dual。')
  }
  if (requiredSourceLanesByReport && !sourceLanes) {
    throw new Error('researchArtifacts.routeCompletion.requiredSourceLanesByReport 需要配套 sourceLanes。')
  }
  if (requiredSourceLanesByReport && sourceLanes) {
    for (const lanes of Object.values(requiredSourceLanesByReport)) {
      for (const lane of lanes) {
        if (!sourceLanes[lane]) throw new Error('researchArtifacts.routeCompletion.requiredSourceLanesByReport 引用了未声明 source lane：' + lane)
      }
    }
  }
  return {
    mode: 'dynamic-route-status-v1',
    ...(defaultMarketScope ? { defaultMarketScope } : {}),
    ...(requiredSourceLanesByReport ? { requiredSourceLanesByReport } : {}),
    ...(sourceLanes ? { sourceLanes } : {}),
  }
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_ARTIFACT_CHARACTERS) {
    throw new Error(`${field} 必须是 1–${MAX_ARTIFACT_CHARACTERS} 的整数。`)
  }
  return value as number
}

function assertInsideDirectory(directory: string, artifactPath: string, field: string): void {
  if (!artifactPath.startsWith(`${directory}/`)) {
    throw new Error(`${field} 必须位于 researchArtifacts.directory 内。`)
  }
}

/**
 * Reads a ZIP opt-in contract for file-first Expert research handoffs. The
 * policy contains only safe relative paths; ordinary Experts omit it and keep
 * their current transcript handoffs untouched.
 */
export function resolveExpertResearchArtifactPolicy(
  outputProtocolContent?: string,
): ExpertResearchArtifactPolicy | undefined {
  if (!outputProtocolContent?.trim()) return undefined
  let document: unknown
  try {
    document = JSON.parse(outputProtocolContent)
  } catch {
    throw new Error('专家输出协议不是有效 JSON，无法读取 researchArtifacts 规则。')
  }
  if (!isRecord(document) || document.researchArtifacts === undefined) return undefined
  if (!isRecord(document.researchArtifacts)) throw new Error('researchArtifacts 必须是对象。')
  const raw = document.researchArtifacts
  if (raw.mode !== 'markdown-path-only') {
    throw new Error('researchArtifacts.mode 必须为 markdown-path-only。')
  }
  const directory = normalizeDirectory(raw.directory)
  const briefPath = normalizeRelativeMarkdownPath(raw.briefPath, 'researchArtifacts.briefPath')
  const reviewerPath = normalizeRelativeMarkdownPath(raw.reviewerPath, 'researchArtifacts.reviewerPath')
  const auditPath = normalizeRelativeMarkdownPath(raw.auditPath, 'researchArtifacts.auditPath')
  const absorptionPath = raw.absorptionPath === undefined
    ? undefined
    : normalizeRelativeMarkdownPath(raw.absorptionPath, 'researchArtifacts.absorptionPath')
  const completionReviewPath = raw.completionReviewPath === undefined
    ? undefined
    : normalizeRelativeMarkdownPath(raw.completionReviewPath, 'researchArtifacts.completionReviewPath')
  const routeCompletion = raw.routeCompletion === undefined
    ? undefined
    : routeCompletionSettings(raw.routeCompletion)
  const requireOpenedPageDisposition = raw.requireOpenedPageDisposition === undefined
    ? undefined
    : raw.requireOpenedPageDisposition === true
      ? true
      : (() => { throw new Error('researchArtifacts.requireOpenedPageDisposition 如声明必须为 true。') })()
  if (!Array.isArray(raw.researcherPaths) || raw.researcherPaths.length === 0) {
    throw new Error('researchArtifacts.researcherPaths 必须是非空 Markdown 文件路径数组。')
  }
  const researcherPaths = [...new Set(raw.researcherPaths.map((value) => normalizeRelativeMarkdownPath(value, 'researchArtifacts.researcherPaths')))]
  for (const [field, artifactPath] of [
    ['researchArtifacts.briefPath', briefPath],
    ['researchArtifacts.reviewerPath', reviewerPath],
    ['researchArtifacts.auditPath', auditPath],
    ...(absorptionPath ? [['researchArtifacts.absorptionPath', absorptionPath] as const] : []),
    ...(completionReviewPath ? [['researchArtifacts.completionReviewPath', completionReviewPath] as const] : []),
    ...researcherPaths.map((artifactPath) => ['researchArtifacts.researcherPaths', artifactPath] as const),
  ]) assertInsideDirectory(directory, artifactPath, field)

  const allPaths = [briefPath, ...researcherPaths, reviewerPath, auditPath, ...(absorptionPath ? [absorptionPath] : []), ...(completionReviewPath ? [completionReviewPath] : [])]
  if (new Set(allPaths).size !== allPaths.length) {
    throw new Error('researchArtifacts 中的 Markdown 路径不得重复。')
  }
  return {
    mode: 'markdown-path-only',
    directory,
    briefPath,
    researcherPaths,
    ...(raw.researcherParts === true ? { researcherParts: true } : {}),
    reviewerPath,
    auditPath,
    ...(absorptionPath ? { absorptionPath } : {}),
    ...(completionReviewPath ? { completionReviewPath } : {}),
    ...(routeCompletion ? { routeCompletion } : {}),
    ...(requireOpenedPageDisposition ? { requireOpenedPageDisposition: true } : {}),
    maxCharacters: positiveInteger(raw.maxCharacters, 'researchArtifacts.maxCharacters'),
  }
}


/**
 * Resolves the session-scoped policy value passed through the child-process
 * environment. Unlike the ZIP output protocol, this value is intentionally the
 * bare `researchArtifacts` object. Accept the legacy wrapped form too so the
 * three runtime consumers cannot silently drift apart.
 */
export function resolveRuntimeExpertResearchArtifactPolicy(
  serializedPolicy?: string,
): ExpertResearchArtifactPolicy | undefined {
  if (!serializedPolicy?.trim()) return undefined
  let document: unknown
  try {
    document = JSON.parse(serializedPolicy)
  } catch {
    throw new Error('会话 research-artifact 策略不是有效 JSON。')
  }
  if (!isRecord(document)) return undefined
  return resolveExpertResearchArtifactPolicy(JSON.stringify(
    document.researchArtifacts === undefined
      ? { researchArtifacts: document }
      : document,
  ))
}

export function allowedExpertResearchArtifactPaths(
  policy: ExpertResearchArtifactPolicy,
  kind: ExpertResearchArtifactKind,
): string[] {
  switch (kind) {
    case 'research-brief': return [policy.briefPath]
    case 'researcher-report': return [...policy.researcherPaths]
    case 'evidence-review': return [policy.reviewerPath]
    case 'browser-audit': return [policy.auditPath]
    case 'field-absorption': return policy.absorptionPath ? [policy.absorptionPath] : []
    case 'final-output-review': return policy.completionReviewPath ? [policy.completionReviewPath] : []
  }
}

function pathApiFor(workDir: string, artifactPath: string): typeof path {
  return path.win32.isAbsolute(workDir) || path.win32.isAbsolute(artifactPath)
    ? path.win32
    : path
}

function isPathOutside(root: string, candidate: string, api: typeof path): boolean {
  const relative = api.relative(root, candidate)
  return !relative || relative === '..' || relative.startsWith(`..${api.sep}`) || api.isAbsolute(relative)
}

/**
 * Converts a tool-supplied relative or absolute Markdown path into the exact
 * session-relative contract path. The ZIP protocol itself remains relative-only;
 * this only accepts an absolute path when it resolves inside the current session
 * work directory and exactly matches a declared artifact.
 */
export function canonicalizeExpertResearchArtifactInputPath(input: {
  workDir: string
  artifactPath: unknown
  field?: string
}): ResolvedExpertResearchArtifactPath {
  const raw = text(input.artifactPath)
  const field = input.field ?? '研究 Markdown 路径'
  if (!raw || raw !== input.artifactPath || /[\r\n]/.test(raw)) {
    throw new Error(`${field} 必须是非空 Markdown 文件路径。`)
  }
  const api = pathApiFor(input.workDir, raw)
  const workDir = api.resolve(input.workDir)
  const absolutePath = api.isAbsolute(raw)
    ? api.resolve(raw)
    : api.resolve(workDir, raw)
  const relativeFromWorkDir = api.relative(workDir, absolutePath)
  if (isPathOutside(workDir, absolutePath, api)) {
    throw new Error(`${field} 越出了当前会话工作目录。`)
  }
  return {
    relativePath: normalizeRelativeMarkdownPath(relativeFromWorkDir.replace(/\\/g, '/'), field),
    absolutePath,
  }
}

function artifactPathKey(value: string, api: typeof path): string {
  return api === path.win32 ? value.toLowerCase() : value
}

export function resolveExpertResearchArtifactPath(input: {
  workDir: string
  policy: ExpertResearchArtifactPolicy
  artifactPath: unknown
  allowedKinds: ExpertResearchArtifactKind[]
}): ResolvedExpertResearchArtifactPath {
  const resolved = canonicalizeExpertResearchArtifactInputPath({
    workDir: input.workDir,
    artifactPath: input.artifactPath,
  })
  const api = pathApiFor(input.workDir, resolved.absolutePath)
  const allowedPaths = input.allowedKinds.flatMap((kind) => allowedExpertResearchArtifactPaths(input.policy, kind))
  const allowedPath = allowedPaths.find((candidate) => artifactPathKey(candidate, api) === artifactPathKey(resolved.relativePath, api))
    ?? (input.policy.researcherParts && input.allowedKinds.includes('researcher-report')
      && input.policy.researcherPaths.some((candidate) => artifactPathKey(candidate, api) === artifactPathKey(researchArtifactRootPath(resolved.relativePath), api))
      ? resolved.relativePath : undefined)
  if (!allowedPath) {
    throw new Error(`研究 Markdown 路径不在当前阶段允许的文件清单内：${resolved.relativePath}`)
  }
  const workDir = api.resolve(input.workDir)
  const artifactRoot = api.resolve(workDir, input.policy.directory)
  if (isPathOutside(artifactRoot, resolved.absolutePath, api)) {
    throw new Error('研究 Markdown 路径越出了当前会话允许的研究目录。')
  }
  return { relativePath: allowedPath, absolutePath: resolved.absolutePath }
}
