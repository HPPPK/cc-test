import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { WORKFLOW_PHASE_CONFIGURABLE_TOOL_NAMES, concreteToolNamesForWorkflowCapability } from './workflowToolPolicy.js'
import { collectTemplateSkillCatalog } from './workflowTemplateRegistryService.js'
import {
  isNonEmptyString,
  isRecord,
  type WorkflowTemplateRegistrySkillDeclaration,
  type WorkflowTemplateRegistryTemplate,
} from './workflowTemplateValidation.js'
import type { WorkflowPhaseSkillCatalogEntry } from './workflowPhaseSkillResolver.js'
import type { WorkflowPhaseSkillReference, WorkflowPhaseSkillSource } from './workflowTypes.js'
import { assertSafeZipPath, type ZipPackArchive } from './zipPackAdapter.js'

export type WorkflowPackDependencyBlocker = {
  workflowId: string
  phaseId: string
  kind: 'skill' | 'tool'
  reference: string
  reason: string
}

export class WorkflowPackExportDependencyError extends Error {
  constructor(public readonly blockers: WorkflowPackDependencyBlocker[]) {
    super('Workflow pack export requires real packable dependencies.')
  }
}

export type WorkflowPackagedSkillReferenceMapping = {
  workflowId: string
  phaseId: string
  field: 'skills' | 'skillBindings'
  reference: string
  name?: string
  namespace?: string
  referenceId?: string
}

export type WorkflowPackagedSkill = {
  id: string
  identity: string
  safeName: string
  entrypoint: string
  root: string
  contentHash: string
  source: string
  references: string[]
  aliases?: string[]
  referenceMappings?: WorkflowPackagedSkillReferenceMapping[]
  fileCount: number
  totalBytes: number
}

export type WorkflowPackHostTool = {
  name: string
  supported: boolean
}

export type WorkflowPackSkillExport = {
  skills: WorkflowPackagedSkill[]
  entries: Record<string, Uint8Array | string>
  entrypoints: string[]
  requiredHostTools: WorkflowPackHostTool[]
  blockedExternalDependencies: WorkflowPackDependencyBlocker[]
  permissions: Record<string, unknown>
  modelRequirements: Record<string, unknown>
}


export type WorkflowPackSkillFileSet = {
  files: Array<{ relativePath: string; bytes: Uint8Array }>
  totalBytes: number
}

export type WorkflowPackDependencyBuildOptions = {
  readPackPrivateSkill?: (sourcePath: string) => Promise<WorkflowPackSkillFileSet | null>
}

export type WorkflowPackSkillInstallPlan = {
  identity: string
  safeName: string
  entrypoint: string
  contentHash: string
  status: 'install' | 'reuse' | 'conflict' | 'legacy-unpackaged'
  targetPath?: string
  existingPath?: string
  message?: string
  aliases?: string[]
  referenceMappings?: WorkflowPackagedSkillReferenceMapping[]
}

export type WorkflowPackSkillInstallResult = WorkflowPackSkillInstallPlan & {
  installedPath?: string
}

const PACK_SKILL_METADATA_FILE = '.cc-jiangxia-pack.json'
const MAX_SKILL_FILES = 200
const MAX_SKILL_FILE_BYTES = 512 * 1024
const MAX_SKILL_TOTAL_BYTES = 5 * 1024 * 1024
const DANGEROUS_DIR_NAMES = new Set(['.git', '.hg', '.svn', 'node_modules', '__pycache__'])
const DANGEROUS_FILE_NAMES = new Set(['.DS_Store', PACK_SKILL_METADATA_FILE])

function getConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

export function getWorkflowPackUserSkillsDir(): string {
  return path.join(getConfigDir(), 'skills')
}

export function safePackFileSegment(value: string): string {
  const safe = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return safe || 'pack'
}

export async function buildSelfContainedWorkflowPackDependencies(
  workflows: WorkflowTemplateRegistryTemplate[],
  options: WorkflowPackDependencyBuildOptions = {},
): Promise<WorkflowPackSkillExport> {
  const catalog = await collectTemplateSkillCatalog()
  const blockers: WorkflowPackDependencyBlocker[] = []
  const skillReferences = collectWorkflowSkillReferences(workflows)
  const grouped = new Map<string, {
    identity: string
    source: string
    sourcePath: string
    references: string[]
    aliases: string[]
    referenceMappings: WorkflowPackagedSkillReferenceMapping[]
  }>()

  for (const item of skillReferences) {
    const resolved = resolvePackableSkill(item.reference, catalog)
    const display = skillReferenceDisplayName(item.reference)
    if (!resolved?.sourcePath) {
      blockers.push({
        workflowId: item.workflowId,
        phaseId: item.phaseId,
        kind: 'skill',
        reference: display,
        reason: 'Referenced skill does not resolve to a real SKILL.md directory and cannot be packed.',
      })
      continue
    }
    if (!isRealSkillPath(resolved.sourcePath) && !isPackPrivateSkillPath(resolved.sourcePath)) {
      blockers.push({
        workflowId: item.workflowId,
        phaseId: item.phaseId,
        kind: 'skill',
        reference: display,
        reason: 'Referenced skill source is not packable.',
      })
      continue
    }
    if (isPackPrivateSkillPath(resolved.sourcePath) && !options.readPackPrivateSkill) {
      blockers.push({
        workflowId: item.workflowId,
        phaseId: item.phaseId,
        kind: 'skill',
        reference: display,
        reason: 'Referenced skill is pack-private but the source ZIP is unavailable for repacking.',
      })
      continue
    }
    const identity = skillIdentity(item.reference, resolved)
    const key = path.resolve(resolved.sourcePath)
    const existing = grouped.get(key)
    const mapping = workflowSkillReferenceMapping(item, display)
    if (existing) {
      existing.references.push(display)
      existing.aliases.push(...skillReferenceAliasSet(item.reference, display))
      existing.referenceMappings.push(mapping)
      continue
    }
    grouped.set(key, {
      identity,
      source: resolved.source,
      sourcePath: resolved.sourcePath,
      references: [display],
      aliases: skillReferenceAliasSet(item.reference, display),
      referenceMappings: [mapping],
    })
  }

  const requiredHostTools = collectRequiredHostTools(workflows)
  for (const tool of requiredHostTools) {
    if (!tool.supported) {
      blockers.push({
        workflowId: '*',
        phaseId: '*',
        kind: 'tool',
        reference: tool.name,
        reason: 'Tool is not declared as a supported host tool and cannot be packaged as workflow data.',
      })
    }
  }

  if (blockers.length > 0) throw new WorkflowPackExportDependencyError(blockers)

  const entries: Record<string, Uint8Array | string> = {}
  const skills: WorkflowPackagedSkill[] = []
  const usedSafeNames = new Set<string>()
  for (const item of grouped.values()) {
    let safeName = safePackFileSegment(item.identity)
    if (usedSafeNames.has(safeName)) {
      let suffix = 2
      while (usedSafeNames.has(`${safeName}-${suffix}`)) suffix += 1
      safeName = `${safeName}-${suffix}`
    }
    usedSafeNames.add(safeName)

    const collected = isPackPrivateSkillPath(item.sourcePath)
      ? await options.readPackPrivateSkill?.(item.sourcePath)
      : await collectSkillDirectoryEntries(path.dirname(item.sourcePath))
    if (!collected) {
      blockers.push({
        workflowId: item.referenceMappings[0]?.workflowId ?? '*',
        phaseId: item.referenceMappings[0]?.phaseId ?? '*',
        kind: 'skill',
        reference: item.identity,
        reason: 'Referenced pack-private skill could not be read from its source ZIP.',
      })
      continue
    }
    const root = `skills/${safeName}`
    for (const file of collected.files) {
      entries[`${root}/${file.relativePath}`] = file.bytes
    }
    const entrypoint = `${root}/SKILL.md`
    const contentHash = contentHashForFiles(collected.files)
    skills.push({
      id: item.identity,
      identity: item.identity,
      safeName,
      entrypoint,
      root,
      contentHash,
      source: item.source,
      references: Array.from(new Set(item.references)).sort(),
      aliases: Array.from(new Set(item.aliases)).sort(),
      referenceMappings: uniqueReferenceMappings(item.referenceMappings),
      fileCount: collected.files.length,
      totalBytes: collected.totalBytes,
    })
  }

  if (blockers.length > 0) throw new WorkflowPackExportDependencyError(blockers)

  return {
    skills,
    entries,
    entrypoints: skills.map((skill) => skill.entrypoint),
    requiredHostTools,
    blockedExternalDependencies: [],
    permissions: collectWorkflowPermissions(workflows),
    modelRequirements: collectWorkflowModelRequirements(workflows),
  }
}

export async function buildWorkflowPackSkillInstallPlan(
  zip: ZipPackArchive,
  manifest: { packId: string; entrypoints: { skills: string[] }; dependencies?: unknown },
): Promise<WorkflowPackSkillInstallPlan[]> {
  const packagedSkills = manifestPackagedSkills(manifest.dependencies)
  if (manifest.entrypoints.skills.length === 0 && packagedSkills.length === 0) return []
  const userSkillsDir = getWorkflowPackUserSkillsDir()
  const plans: WorkflowPackSkillInstallPlan[] = []
  const plannedByIdentity = new Map<string, WorkflowPackSkillInstallPlan>()
  const plannedBySafeName = new Map<string, WorkflowPackSkillInstallPlan>()
  const seenEntrypoints = new Set<string>()

  for (const entrypoint of manifest.entrypoints.skills) {
    assertSafeZipPath(entrypoint)
    if (seenEntrypoints.has(entrypoint)) continue
    seenEntrypoints.add(entrypoint)
    if (!zip.has(entrypoint)) throw new Error(`Pack skill entrypoint is missing: ${entrypoint}`)
    const root = skillRootFromEntrypoint(entrypoint)
    const metadata = packagedSkills.find((skill) => skill.entrypoint === entrypoint || skill.root === root)
    const identity = metadata?.identity ?? await skillIdentityFromZip(zip, entrypoint)
    const safeName = safePackFileSegment(metadata?.safeName ?? identity)
    const contentHash = metadata?.contentHash ?? await contentHashForZipSkillRoot(zip, root)
    const targetPath = path.join(userSkillsDir, safeName)
    const aliases = Array.from(new Set([...(metadata?.aliases ?? []), ...(metadata?.references ?? [])].filter(isNonEmptyString))).sort()
    const referenceMappings = metadata?.referenceMappings ?? []
    const identityClaim = plannedByIdentity.get(identity)
    if (identityClaim && identityClaim.contentHash !== contentHash) {
      plans.push({
        identity,
        safeName,
        entrypoint,
        contentHash,
        status: 'conflict',
        targetPath,
        aliases,
        referenceMappings,
        message: 'Pack contains the same skill identity with different content.',
      })
      continue
    }
    const safeNameClaim = plannedBySafeName.get(safeName)
    if (safeNameClaim && safeNameClaim.identity !== identity) {
      plans.push({
        identity,
        safeName,
        entrypoint,
        contentHash,
        status: 'conflict',
        targetPath,
        aliases,
        referenceMappings,
        message: 'Pack contains different skill identities targeting the same install directory.',
      })
      continue
    }
    const existing = await findExistingSkillIdentity(identity, userSkillsDir, safeName)

    if (existing) {
      const plan: WorkflowPackSkillInstallPlan = {
        identity,
        safeName,
        entrypoint,
        contentHash,
        status: existing.contentHash === contentHash ? 'reuse' : 'conflict',
        targetPath,
        existingPath: existing.skillDir,
        message: existing.contentHash === contentHash
          ? 'Skill with identical content is already installed.'
          : 'Skill identity already exists with different content.',
        aliases,
        referenceMappings,
      }
      plans.push(plan)
      plannedByIdentity.set(identity, plan)
      plannedBySafeName.set(safeName, plan)
      continue
    }

    const plan: WorkflowPackSkillInstallPlan = {
      identity,
      safeName,
      entrypoint,
      contentHash,
      status: 'install',
      targetPath,
      aliases,
      referenceMappings,
    }
    plans.push(plan)
    plannedByIdentity.set(identity, plan)
    plannedBySafeName.set(safeName, plan)
  }

  return plans
}

export async function installWorkflowPackSkills(
  zip: ZipPackArchive,
  manifest: { packId: string; version: string; entrypoints: { skills: string[] }; dependencies?: unknown },
): Promise<WorkflowPackSkillInstallResult[]> {
  const plan = await buildWorkflowPackSkillInstallPlan(zip, manifest)
  const conflict = plan.find((item) => item.status === 'conflict')
  if (conflict) {
    throw new Error(`Pack skill conflict for ${conflict.identity}: ${conflict.message ?? 'different content already exists.'}`)
  }

  const installedAt = new Date().toISOString()
  const results: WorkflowPackSkillInstallResult[] = []
  for (const item of plan) {
    if (item.status === 'reuse') {
      results.push({ ...item, installedPath: item.existingPath })
      continue
    }
    const root = skillRootFromEntrypoint(item.entrypoint)
    const targetPath = item.targetPath ?? path.join(getWorkflowPackUserSkillsDir(), item.safeName)
    await fs.mkdir(targetPath, { recursive: true })
    for (const entry of zip.entries.filter((candidate) => candidate.path.startsWith(`${root}/`))) {
      const relative = entry.path.slice(root.length + 1)
      assertSafeZipPath(relative)
      const destination = path.join(targetPath, ...relative.split('/'))
      const resolvedTarget = path.resolve(targetPath)
      const resolvedDestination = path.resolve(destination)
      if (resolvedDestination !== resolvedTarget && !resolvedDestination.startsWith(resolvedTarget + path.sep)) {
        throw new Error(`Pack skill entry escapes target directory: ${entry.path}`)
      }
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.writeFile(destination, Buffer.from(await zip.readBytes(entry.path)))
    }
    await fs.writeFile(path.join(targetPath, PACK_SKILL_METADATA_FILE), `${JSON.stringify({
      schemaVersion: 1,
      packId: manifest.packId,
      packVersion: manifest.version,
      originalSkillId: item.identity,
      safeName: item.safeName,
      entrypoint: item.entrypoint,
      contentHash: item.contentHash,
      aliases: item.aliases ?? [],
      referenceMappings: item.referenceMappings ?? [],
      installedAt,
    }, null, 2)}\n`, 'utf-8')
    results.push({ ...item, installedPath: targetPath })
  }
  return results
}

export async function verifyWorkflowPackChecksums(zip: ZipPackArchive, requireChecksums: boolean): Promise<Record<string, string>> {
  if (!zip.has('checksums.json')) {
    if (requireChecksums) throw new Error('Workflow pack v2 requires checksums.json.')
    return {}
  }
  const checksums = await zip.readJson('checksums.json')
  if (!isRecord(checksums) || checksums.algorithm !== 'sha256' || !isRecord(checksums.files)) {
    throw new Error('Invalid checksums.json format.')
  }
  const files: Record<string, string> = {}
  for (const [entryPath, hash] of Object.entries(checksums.files)) {
    if (!isNonEmptyString(entryPath) || !isNonEmptyString(hash)) throw new Error('Invalid checksum entry.')
    assertSafeZipPath(entryPath)
    if (entryPath === 'checksums.json') throw new Error('checksums.json must not include itself.')
    if (!zip.has(entryPath)) throw new Error(`Checksum references missing ZIP entry: ${entryPath}`)
    const actual = sha256Hex(await zip.readBytes(entryPath))
    const expected = hash.startsWith('sha256-') ? hash.slice('sha256-'.length) : hash
    if (actual !== expected) throw new Error(`Checksum mismatch for ${entryPath}`)
    files[entryPath] = hash
  }
  if (requireChecksums) {
    for (const entry of zip.entries) {
      if (entry.path === 'checksums.json') continue
      if (!files[entry.path]) throw new Error(`checksums.json is missing ZIP entry: ${entry.path}`)
    }
  }
  return files
}

export function buildChecksums(entries: Record<string, Uint8Array | string>): Record<string, unknown> {
  const files: Record<string, string> = {}
  for (const [entryPath, value] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
    if (entryPath === 'checksums.json') continue
    const bytes = typeof value === 'string' ? Buffer.from(value, 'utf-8') : Buffer.from(value)
    files[entryPath] = `sha256-${sha256Hex(bytes)}`
  }
  return { schemaVersion: 1, algorithm: 'sha256', files }
}

function collectWorkflowSkillReferences(workflows: WorkflowTemplateRegistryTemplate[]): Array<{
  workflowId: string
  phaseId: string
  field: 'skills' | 'skillBindings'
  reference: WorkflowPhaseSkillReference
}> {
  const items: Array<{ workflowId: string; phaseId: string; field: 'skills' | 'skillBindings'; reference: WorkflowPhaseSkillReference }> = []
  for (const workflow of workflows) {
    for (const phase of workflow.phases) {
      for (const skill of phase.skills) {
        items.push({ workflowId: workflow.id, phaseId: phase.id, field: 'skills', reference: skill })
      }
      for (const binding of phase.skillBindings ?? []) {
        const id = typeof binding === 'string' ? binding : binding.id
        if (!isNonEmptyString(id)) continue
        const [namespace] = id.includes(':') ? id.split(':', 1) : ['']
        items.push({
          workflowId: workflow.id,
          phaseId: phase.id,
          field: 'skillBindings',
          reference: {
            name: id,
            referenceId: id,
            ...(namespace ? { namespace } : {}),
          },
        })
      }
    }
  }
  return items
}


function workflowSkillReferenceMapping(
  item: { workflowId: string; phaseId: string; field: 'skills' | 'skillBindings'; reference: WorkflowPhaseSkillReference },
  display: string,
): WorkflowPackagedSkillReferenceMapping {
  return {
    workflowId: item.workflowId,
    phaseId: item.phaseId,
    field: item.field,
    reference: display,
    name: item.reference.name,
    ...(item.reference.namespace ? { namespace: item.reference.namespace } : {}),
    ...(item.reference.referenceId ? { referenceId: item.reference.referenceId } : {}),
  }
}

function skillReferenceAliasSet(reference: WorkflowPhaseSkillReference, display: string): string[] {
  const values = new Set<string>([display])
  for (const candidate of skillCandidateNames(reference)) {
    values.add(candidate)
    for (const alias of skillReferenceAliases(candidate)) values.add(alias)
  }
  return Array.from(values).filter(isNonEmptyString)
}

function uniqueReferenceMappings(mappings: WorkflowPackagedSkillReferenceMapping[]): WorkflowPackagedSkillReferenceMapping[] {
  const seen = new Set<string>()
  const result: WorkflowPackagedSkillReferenceMapping[] = []
  for (const mapping of mappings) {
    const key = `${mapping.workflowId}\0${mapping.phaseId}\0${mapping.field}\0${mapping.reference}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(mapping)
  }
  return result.sort((a, b) => `${a.workflowId}:${a.phaseId}:${a.field}:${a.reference}`.localeCompare(`${b.workflowId}:${b.phaseId}:${b.field}:${b.reference}`))
}

function parseReferenceMappings(value: unknown): WorkflowPackagedSkillReferenceMapping[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).flatMap((item): WorkflowPackagedSkillReferenceMapping[] => {
    if (!isNonEmptyString(item.workflowId) || !isNonEmptyString(item.phaseId) || !isNonEmptyString(item.reference)) return []
    const field = item.field === 'skillBindings' ? 'skillBindings' : 'skills'
    return [{
      workflowId: item.workflowId,
      phaseId: item.phaseId,
      field,
      reference: item.reference,
      ...(isNonEmptyString(item.name) ? { name: item.name } : {}),
      ...(isNonEmptyString(item.namespace) ? { namespace: item.namespace } : {}),
      ...(isNonEmptyString(item.referenceId) ? { referenceId: item.referenceId } : {}),
    }]
  })
}

function resolvePackableSkill(
  reference: WorkflowPhaseSkillReference,
  catalog: WorkflowPhaseSkillCatalogEntry[],
): WorkflowPhaseSkillCatalogEntry | null {
  const candidates = skillCandidateNames(reference)
  const sourceHint = sourceHintFromSkillReference(reference)
  const scopedCatalog = sourceHint ? catalog.filter((entry) => entry.source === sourceHint) : catalog
  const unscopedCatalog = sourceHint ? catalog.filter((entry) => entry.source !== sourceHint) : []

  return resolvePackableSkillFromCatalog(reference, scopedCatalog, candidates)
    ?? resolvePackableSkillFromCatalog(reference, unscopedCatalog, candidates)
}

function resolvePackableSkillFromCatalog(
  reference: WorkflowPhaseSkillReference,
  catalog: WorkflowPhaseSkillCatalogEntry[],
  candidates: Set<string>,
): WorkflowPhaseSkillCatalogEntry | null {
  const byExactReference = catalog.find((entry) => isPackableSkillPath(entry.sourcePath) && entry.referenceId && candidates.has(entry.referenceId))
  if (byExactReference) return byExactReference
  const byName = catalog.find((entry) => isPackableSkillPath(entry.sourcePath) && candidates.has(entry.name))
  if (byName) return byName
  const aliased = Array.from(candidates).flatMap(skillReferenceAliases)
  return catalog.find((entry) => isPackableSkillPath(entry.sourcePath) && (aliased.includes(entry.referenceId ?? '') || aliased.includes(entry.name))) ?? null
}

function isPackableSkillPath(sourcePath: string | undefined): sourcePath is string {
  return isRealSkillPath(sourcePath) || isPackPrivateSkillPath(sourcePath)
}

function isRealSkillPath(sourcePath: string | undefined): sourcePath is string {
  return isNonEmptyString(sourcePath) && !sourcePath.startsWith('pack://')
}

function isPackPrivateSkillPath(sourcePath: string | undefined): sourcePath is string {
  return isNonEmptyString(sourcePath) && sourcePath.startsWith('pack://')
}

function sourceHintFromSkillReference(reference: WorkflowPhaseSkillReference): WorkflowPhaseSkillSource | undefined {
  if (reference.source) return reference.source
  for (const candidate of [reference.referenceId, reference.name]) {
    if (!isNonEmptyString(candidate) || !candidate.includes(':')) continue
    const [prefix] = candidate.split(':', 1)
    if (isWorkflowPhaseSkillSource(prefix)) return prefix
  }
  return undefined
}

function isWorkflowPhaseSkillSource(value: string): value is WorkflowPhaseSkillSource {
  return value === 'user' || value === 'project' || value === 'bundled' || value === 'managed' || value === 'superpowers' || value === 'plugin' || value === 'mcp'
}

function skillCandidateNames(reference: WorkflowPhaseSkillReference): Set<string> {
  const values = [reference.referenceId, reference.name]
  if (reference.namespace && reference.name && !reference.name.includes(':')) values.push(`${reference.namespace}:${reference.name}`)
  for (const value of [reference.referenceId, reference.name]) {
    const stripped = stripWorkflowSkillSourcePrefix(value)
    if (stripped) values.push(stripped)
  }
  return new Set(values.filter(isNonEmptyString))
}

function stripWorkflowSkillSourcePrefix(value: string | undefined): string | undefined {
  if (!isNonEmptyString(value) || !value.includes(':')) return undefined
  const separator = value.indexOf(':')
  const prefix = value.slice(0, separator)
  if (!isWorkflowPhaseSkillSource(prefix)) return undefined
  const stripped = value.slice(separator + 1).trim()
  return stripped || undefined
}

function skillReferenceAliases(value: string): string[] {
  if (value.startsWith('spec-kit-plus:')) return [`sp-${value.slice('spec-kit-plus:'.length)}`]
  if (value.startsWith('superpowers:')) return [value.slice('superpowers:'.length)]
  if (value.startsWith('workflow:')) return [value.slice('workflow:'.length)]
  if (value.startsWith('codex:')) return [value.slice('codex:'.length)]
  if (value.startsWith('claude-code:')) return [value.slice('claude-code:'.length)]
  return []
}

function skillIdentity(reference: WorkflowPhaseSkillReference, resolved: WorkflowPhaseSkillCatalogEntry): string {
  return reference.referenceId ?? (reference.name.includes(':') ? reference.name : resolved.referenceId ?? `${resolved.source}:${resolved.name}`)
}

function skillReferenceDisplayName(reference: WorkflowPhaseSkillReference): string {
  return reference.referenceId ?? reference.name
}

async function collectSkillDirectoryEntries(skillRoot: string): Promise<{
  files: Array<{ relativePath: string; bytes: Uint8Array }>
  totalBytes: number
}> {
  const resolvedRoot = await fs.realpath(skillRoot)
  const files: Array<{ relativePath: string; bytes: Uint8Array }> = []
  let totalBytes = 0

  async function walk(current: string, relativeBase: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (DANGEROUS_DIR_NAMES.has(entry.name) || DANGEROUS_FILE_NAMES.has(entry.name)) continue
      if (entry.name.startsWith('.') && entry.isDirectory()) continue
      if (entry.isSymbolicLink()) throw new Error(`Skill directory contains unsupported symlink: ${path.join(current, entry.name)}`)
      const fullPath = path.join(current, entry.name)
      const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name
      assertSafeZipPath(relativePath)
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath)
        continue
      }
      if (!entry.isFile()) continue
      const realPath = await fs.realpath(fullPath)
      if (realPath !== resolvedRoot && !realPath.startsWith(resolvedRoot + path.sep)) {
        throw new Error(`Skill file escapes skill directory: ${fullPath}`)
      }
      const stat = await fs.stat(fullPath)
      if (stat.size > MAX_SKILL_FILE_BYTES) throw new Error(`Skill file exceeds maximum size: ${relativePath}`)
      totalBytes += stat.size
      if (totalBytes > MAX_SKILL_TOTAL_BYTES) throw new Error('Skill directory exceeds maximum package size.')
      files.push({ relativePath, bytes: new Uint8Array(await fs.readFile(fullPath)) })
      if (files.length > MAX_SKILL_FILES) throw new Error('Skill directory exceeds maximum file count.')
    }
  }

  await walk(resolvedRoot, '')
  if (!files.some((file) => file.relativePath === 'SKILL.md')) throw new Error(`Skill directory is missing SKILL.md: ${skillRoot}`)
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return { files, totalBytes }
}

function contentHashForFiles(files: Array<{ relativePath: string; bytes: Uint8Array }>): string {
  const hash = crypto.createHash('sha256')
  for (const file of files.filter((candidate) => candidate.relativePath !== PACK_SKILL_METADATA_FILE).sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
    hash.update(file.relativePath)
    hash.update('\0')
    hash.update(Buffer.from(file.bytes))
    hash.update('\0')
  }
  return `sha256-${hash.digest('hex')}`
}

async function contentHashForZipSkillRoot(zip: ZipPackArchive, root: string): Promise<string> {
  const files: Array<{ relativePath: string; bytes: Uint8Array }> = []
  for (const entry of zip.entries.filter((candidate) => candidate.path.startsWith(`${root}/`))) {
    const relativePath = entry.path.slice(root.length + 1)
    if (!relativePath || relativePath === PACK_SKILL_METADATA_FILE) continue
    assertSafeZipPath(relativePath)
    files.push({ relativePath, bytes: await zip.readBytes(entry.path) })
  }
  return contentHashForFiles(files)
}

async function contentHashForSkillDir(skillDir: string): Promise<string> {
  return contentHashForFiles((await collectSkillDirectoryEntries(skillDir)).files)
}

function collectRequiredHostTools(workflows: WorkflowTemplateRegistryTemplate[]): WorkflowPackHostTool[] {
  const concreteSupported = new Set<string>(WORKFLOW_PHASE_CONFIGURABLE_TOOL_NAMES as readonly string[])
  const tools = new Set<string>()
  for (const workflow of workflows) {
    for (const phase of workflow.phases) {
      addStringList(tools, phase.toolPolicy?.allowedTools)
      addStringList(tools, phase.runtimeContract?.allowedTools)
      addStringList(tools, phase.runtimeContract?.toolAccess?.allowed)
      if (isRecord(phase.contract) && isRecord(phase.contract.actionPolicy)) {
        const actionPolicy = phase.contract.actionPolicy
        addStringList(tools, actionPolicy.allowedTools)
        if (isRecord(actionPolicy.toolAccess)) addStringList(tools, actionPolicy.toolAccess.allowed)
      }
    }
  }
  return Array.from(tools).sort().map((name) => {
    // Check if the name is a concrete supported tool name
    if (concreteSupported.has(name)) return { name, supported: true }
    // artifact is a workflow runtime capability declaration, not an external executable dependency.
    if (name.trim().toLowerCase() === 'artifact') return { name, supported: true }
    // Check if the name is a capability alias that maps to supported concrete tools
    const concreteNames = concreteToolNamesForWorkflowCapability(name)
    const supported = concreteNames.length > 0 && concreteNames.some((cn) => concreteSupported.has(cn))
    return { name, supported }
  })
}

function addStringList(target: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return
  value.filter(isNonEmptyString).forEach((item) => target.add(item))
}

function collectWorkflowPermissions(workflows: WorkflowTemplateRegistryTemplate[]): Record<string, unknown> {
  return {
    schemaVersion: 1,
    workflows: workflows.map((workflow) => ({
      id: workflow.id,
      phases: workflow.phases.map((phase) => ({
        id: phase.id,
        ...(phase.toolPolicy ? { toolPolicy: phase.toolPolicy } : {}),
        ...(phase.runtimeContract ? { runtimeContract: phase.runtimeContract } : {}),
      })),
    })),
  }
}

function collectWorkflowModelRequirements(workflows: WorkflowTemplateRegistryTemplate[]): Record<string, unknown> {
  return {
    schemaVersion: 1,
    workflows: workflows.map((workflow) => ({
      id: workflow.id,
      ...(workflow.modelRequirements ? { modelRequirements: workflow.modelRequirements } : {}),
      ...(workflow.requiredModelCapabilities ? { requiredModelCapabilities: workflow.requiredModelCapabilities } : {}),
      phases: workflow.phases.map((phase) => ({
        id: phase.id,
        ...(phase.requestedModel ? { requestedModel: phase.requestedModel } : {}),
      })),
    })),
  }
}

function manifestPackagedSkills(dependencies: unknown): WorkflowPackagedSkill[] {
  if (!isRecord(dependencies) || !Array.isArray(dependencies.packagedSkills)) return []
  return dependencies.packagedSkills.filter(isRecord).flatMap((skill): WorkflowPackagedSkill[] => {
    if (!isNonEmptyString(skill.identity) || !isNonEmptyString(skill.entrypoint) || !isNonEmptyString(skill.contentHash)) return []
    return [{
      id: isNonEmptyString(skill.id) ? skill.id : skill.identity,
      identity: skill.identity,
      safeName: isNonEmptyString(skill.safeName) ? skill.safeName : safePackFileSegment(skill.identity),
      entrypoint: skill.entrypoint,
      root: isNonEmptyString(skill.root) ? skill.root : skillRootFromEntrypoint(skill.entrypoint),
      contentHash: skill.contentHash,
      source: isNonEmptyString(skill.source) ? skill.source : 'unknown',
      references: Array.isArray(skill.references) ? skill.references.filter(isNonEmptyString) : [],
      aliases: Array.isArray(skill.aliases) ? skill.aliases.filter(isNonEmptyString) : [],
      referenceMappings: parseReferenceMappings(skill.referenceMappings),
      fileCount: typeof skill.fileCount === 'number' ? skill.fileCount : 0,
      totalBytes: typeof skill.totalBytes === 'number' ? skill.totalBytes : 0,
    }]
  })
}

function skillRootFromEntrypoint(entrypoint: string): string {
  assertSafeZipPath(entrypoint)
  if (!entrypoint.startsWith('skills/') || !entrypoint.endsWith('/SKILL.md')) {
    throw new Error(`Invalid skill entrypoint: ${entrypoint}`)
  }
  return entrypoint.slice(0, -'/SKILL.md'.length)
}

async function skillIdentityFromZip(zip: ZipPackArchive, entrypoint: string): Promise<string> {
  const text = await zip.readText(entrypoint)
  const frontmatter = parseFrontmatter(text)
  return frontmatter.referenceId ?? frontmatter.name ?? path.basename(skillRootFromEntrypoint(entrypoint))
}

async function findExistingSkillIdentity(identity: string, userSkillsDir: string, safeName: string): Promise<{
  skillDir: string
  contentHash: string
} | null> {
  const candidates = new Set<string>([path.join(userSkillsDir, safeName)])
  try {
    const entries = await fs.readdir(userSkillsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      candidates.add(path.join(userSkillsDir, entry.name))
    }
  } catch {
    // no user skills yet
  }

  for (const skillDir of candidates) {
    const skillFile = path.join(skillDir, 'SKILL.md')
    try {
      const stat = await fs.stat(skillFile)
      if (!stat.isFile()) continue
    } catch {
      continue
    }
    const metadata = await readPackSkillMetadata(skillDir)
    const frontmatter = parseFrontmatter(await fs.readFile(skillFile, 'utf-8'))
    const identities = new Set([metadata?.originalSkillId, frontmatter.referenceId, frontmatter.name, path.basename(skillDir)].filter(isNonEmptyString))
    if (!identities.has(identity) && path.basename(skillDir) !== safeName) continue
    const contentHash = metadata?.contentHash ?? await contentHashForSkillDir(skillDir)
    return { skillDir, contentHash }
  }
  return null
}

async function readPackSkillMetadata(skillDir: string): Promise<{ originalSkillId?: string; contentHash?: string; aliases?: string[]; referenceMappings?: WorkflowPackagedSkillReferenceMapping[]; packId?: string } | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(skillDir, PACK_SKILL_METADATA_FILE), 'utf-8'))
    return isRecord(parsed) ? {
      originalSkillId: isNonEmptyString(parsed.originalSkillId) ? parsed.originalSkillId : undefined,
      contentHash: isNonEmptyString(parsed.contentHash) ? parsed.contentHash : undefined,
      aliases: Array.isArray(parsed.aliases) ? parsed.aliases.filter(isNonEmptyString) : [],
      referenceMappings: parseReferenceMappings(parsed.referenceMappings),
      packId: isNonEmptyString(parsed.packId) ? parsed.packId : undefined,
    } : null
  } catch {
    return null
  }
}

function parseFrontmatter(text: string): { name?: string; referenceId?: string } {
  if (!text.startsWith('---')) return {}
  const end = text.indexOf('\n---', 3)
  if (end < 0) return {}
  const block = text.slice(3, end)
  const result: { name?: string; referenceId?: string } = {}
  for (const line of block.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.+?)\s*$/.exec(line)
    if (!match) continue
    const key = match[1]
    const value = match[2].replace(/^['"]|['"]$/g, '')
    if (key === 'name' && isNonEmptyString(value)) result.name = value
    if ((key === 'referenceId' || key === 'reference-id') && isNonEmptyString(value)) result.referenceId = value
  }
  return result
}

function sha256Hex(data: Uint8Array): string {
  return crypto.createHash('sha256').update(Buffer.from(data)).digest('hex')
}


