import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { getAppStoragePath } from '../../utils/appIdentity.js'
import { ZipPackAdapter, assertSafeZipPath, type ZipPackArchive } from './zipPackAdapter.js'
import { deriveExpertTemplateFillSchema } from '../../utils/expertTemplateFill.js'
import { resolveExpertResearchBrowserPolicy, type ExpertResearchBrowserConnection, type ExpertResearchBrowserPolicy, type ExpertResearchBrowserPresentation } from './expertResearchBrowserPolicyService.js'
import type { ExpertResearchCompletionPolicy, ExpertResearchCompletionState } from './expertResearchCompletionService.js'

export type ExpertSessionStatus = 'active' | 'collecting' | 'running' | 'completed' | 'exited' | 'failed'

export type ExpertMaterialRef = {
  runId: string
  expertId: string
  expertName: string
  packId: string
  packVersion: string
  summaryPath: string
  materialJsonPath: string
  evidencePath: string
  createdAt: string
  title: string
  shortSummary: string
}

export type ExpertOption = { id: string; label: string; description?: string }

export type ExpertFormField = {
  id: string
  kind: 'text' | 'textarea' | 'url' | 'url-list' | 'file' | 'file-list' | 'folder' | 'select' | 'multi-select' | 'table' | 'checkbox'
  label: string
  required?: boolean
  options?: ExpertOption[]
  placeholder?: string
  description?: string
}

export type ExpertIntakeStep =
  | { type: 'question'; id: string; question: string; options: ExpertOption[]; required?: boolean }
  | { type: 'form'; id: string; title: string; fields: ExpertFormField[]; required?: boolean }
  | { type: 'message'; id: string; markdown: string }

export type ExpertIntakeFlow = {
  version: 1
  steps: ExpertIntakeStep[]
}

export type ExpertIntakeState = {
  currentStepId?: string
  answers: Record<string, unknown>
  errors: Record<string, string>
  completedStepIds: string[]
  updatedAt: string
}

export type ExpertOutputMode = 'template-fill'

/**
 * Optional, package-declared runtime boundary. Omitted means legacy Expert
 * behavior is preserved. Strict visual workflow is opt-in for the selected ZIP
 * only; it never changes another Expert's tool policy.
 */
export type ExpertRuntimePolicy = {
  mode: 'strict-visual-workflow' | 'package-local-skills'
  allowedToolNames: string[]
  requiredSkillIds: string[]
}

export type ExpertRuntimeBinding = {
  schemaVersion: 1
  active: true
  expertId: string
  expertName: string
  packId: string
  packVersion: string
  promptSnapshot: string
  skills: Array<{
    skillId: string
    title: string
    path: string
    sha256: string
    content: string
  }>
  /** Package-declared Skill IDs that must be injected into each matching delegated Expert agent. */
  subagentSkillIdsByAgentType?: Record<string, string[]>
  hostTools: ExpertHostTool[]
  tools: ExpertToolManifest[]
  permissions: ExpertPermission[]
  runtimePolicy?: ExpertRuntimePolicy
  outputProtocol?: { path: string; content: string }
  researchDeliveryPolicy?: ExpertResearchDeliveryPolicy
  researchBrowserPolicy?: ExpertResearchBrowserPolicy
  researchCompletionPolicy?: ExpertResearchCompletionPolicy
  outputMode?: ExpertOutputMode
  outputTemplate?: { path: string; content: string }
  activatedAt: string
}


export type ExpertSessionMetadata = {
  mode: 'expert'
  expertId: string
  expertName: string
  packId: string
  packVersion: string
  status: ExpertSessionStatus
  activeRunId?: string
  runtimeBinding?: ExpertRuntimeBinding
  intakeState?: ExpertIntakeState
  researchDelivery?: ExpertResearchDeliveryState
  researchCompletion?: ExpertResearchCompletionState
  /** Session-scoped browser choice; never persists a profile path or credentials. */
  researchBrowserConnection?: ExpertResearchBrowserConnection
  /** Session-scoped managed Chromium presentation; omitted for legacy or CDP sessions. */
  researchBrowserPresentation?: ExpertResearchBrowserPresentation
  materialRefs: ExpertMaterialRef[]
  startedAt: string
  updatedAt: string
  completedAt?: string
  exitedAt?: string
  error?: string
}

export type ExpertHostTool = { id: string; name: string; purpose: string; minHostVersion?: string; supported?: boolean }
export type ExpertPermission = { id: string; description: string }
export type ExpertToolType = 'hostBuiltinRef' | 'packageLocalDeclarative' | 'packageLocalExecutable'
export type ExpertCatalogMetadata = { categoryId?: string; tags?: string[] }

export type ExpertProfileMemory = { id: string; content: string; createdAt: string }
export type ExpertProfileDiaryEntry = { id: string; content: string; createdAt: string }
export type ExpertProfileWorkflowStep = { id: string; title: string; description?: string }
export type ExpertProfileKnowledgeBase = {
  version: string
  ruleCount?: number
  styleCount?: number
  paletteCount?: number
  componentCount?: number
  notes?: string
}
export type ExpertProfile = {
  avatar?: string
  tagline?: string
  soul?: { whoIAm: string; howITalk: string; boundaries: string[] }
  starterPrompts?: string[]
  workflow?: ExpertProfileWorkflowStep[]
  knowledgeBase?: ExpertProfileKnowledgeBase
  memories?: ExpertProfileMemory[]
  diary?: ExpertProfileDiaryEntry[]
}

export type ExpertToolManifest = {
  id: string
  name: string
  type: ExpertToolType
  purpose: string
  entrypoint: string
  permissions: ExpertPermission[]
  hostToolId?: string
  command?: string
  network?: 'none' | 'declared'
}

export type ExpertPackManifest = {
  packId: string
  name: string
  version: string
  minHostVersion?: string
  schemaVersion: 1
  type: 'expert-pack'
  description?: string
  catalog?: ExpertCatalogMetadata
  entrypoints: {
    experts: string[]
    skills: string[]
    tools?: string[]
  }
  hostTools?: ExpertHostTool[]
  requiredHostTools?: ExpertHostTool[]
  permissions?: ExpertPermission[]
  compatibility?: Record<string, unknown>
  runtimePolicy?: ExpertRuntimePolicy
  portability?: { selfContained: boolean; notes?: string }
}

export type ExpertDefinition = {
  id: string
  name: string
  description: string
  statusLabel: string
  profile?: ExpertProfile
  categoryId?: string
  tags?: string[]
  packId: string
  packName: string
  packVersion: string
  entrypoint: string
  promptPaths: { system?: string; intake?: string }
  formPaths: string[]
  outputProtocolPath?: string
  outputProtocolContent?: string
  researchBrowserPolicy?: ExpertResearchBrowserPolicy
  outputMode?: ExpertOutputMode
  outputTemplatePath?: string
  outputTemplateContent?: string
  skillIds: string[]
  /** Optional package-local Skill bindings for delegated Expert agent types. */
  subagentSkillIdsByAgentType?: Record<string, string[]>
  hostTools: NonNullable<ExpertPackManifest['hostTools']>
  permissions: NonNullable<ExpertPackManifest['permissions']>
  runtimePolicy?: ExpertRuntimePolicy
  tools: ExpertToolManifest[]
  intakeFlow?: ExpertIntakeFlow
  portable: boolean
  systemPromptContent?: string
  skillContents?: Record<string, string>
}

export type ExpertPackIndexEntry = {
  packId: string
  name: string
  version: string
  description: string
  manifest: ExpertPackManifest
  storage: { kind: 'zip'; path: string; source?: 'bundled' | 'stored' }
  experts: ExpertDefinition[]
  tools: ExpertToolManifest[]
  importedAt: string
}

export type ExpertPackImportPreview = {
  pack: ExpertPackIndexEntry
  experts: ExpertDefinition[]
  summary: string
  warnings: string[]
  canImport: boolean
  expertId?: string
  overwrite?: boolean
}

export type ExpertPackCreateInput = ExpertPackUpdateInput & {
  packId: string
  expert: NonNullable<ExpertPackUpdateInput['expert']> & { id: string; name: string }
}

export type ExpertPackExportResult = {
  format: 'zip-pack'
  contentType: 'application/zip'
  filename: string
  dataBase64: string
}

export type ExpertPackSkillUpdate = {
  id: string
  files: Record<string, string>
}

export type ExpertPackUpdateInput = {
  name?: string
  version?: string
  description?: string
  catalog?: ExpertCatalogMetadata
  minHostVersion?: string
  hostTools?: ExpertHostTool[]
  permissions?: ExpertPermission[]
  compatibility?: Record<string, unknown>
  runtimePolicy?: ExpertRuntimePolicy | null
  portability?: { selfContained: boolean; notes?: string }
  expert?: {
    id: string
    name?: string
    description?: string
    statusLabel?: string
    profile?: ExpertProfile
    systemPromptContent?: string
    skillIds?: string[]
    intakeFlow?: ExpertIntakeFlow
    outputProtocolContent?: string
  }
  tools?: ExpertToolManifest[]
  /**
   * Self-contained Skill content to add or replace while updating this Expert ZIP.
   * Every entry must include a non-empty SKILL.md file.
   */
  skills?: ExpertPackSkillUpdate[]
  removeToolIds?: string[]
  toolArchivesBase64?: string[]
  /** @deprecated Kept for one migration cycle for callers using the old array shape. */
  experts?: Array<{
    id: string
    name?: string
    description?: string
    statusLabel?: string
    systemPromptContent?: string
    skillContents?: Record<string, string>
  }>
}

const adapter = new ZipPackAdapter()
const MANAGED_BUNDLED_EXPERT_PACKS_FILE = 'managed-bundled-expert-packs.json'
const KNOWN_LEGACY_BUNDLED_EXPERT_FINGERPRINTS = new Map<string, ReadonlySet<string>>([
  ['commercialization-research-report', new Set([
    'f3b5f95f5188ebdf43d07f141385769b21febd91f0210e717bb91e656bba0936',
    // v0.10.9-local package seeded before template-fill delivery existed.
    '09c987c5c8d727a59596b7aee139273a96008cdb48b544f9207fb73caae722b9',
  ])],
])
let packsCache: ExpertPackIndexEntry[] | null = null

export class ExpertPackValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpertPackValidationError'
  }
}


function getConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

export function getExpertPackStorageDir(): string {
  return getAppStoragePath(getConfigDir(), 'experts', 'packs')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function skillEntryPath(skillId: string): string {
  const entryPath = `skills/${skillId}/SKILL.md`
  assertSafeZipPath(entryPath)
  return entryPath
}

function missingSkillFileError(entryPath: string): ExpertPackValidationError {
  return new ExpertPackValidationError(`专家包不完整，缺少 Skill 文件：${entryPath}。请重新导入完整专家 ZIP。`)
}

function normalizeSkillUpdates(value: unknown): ExpertPackSkillUpdate[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('skills must be an array of { id, files } entries.')

  const seenIds = new Set<string>()
  return value.map((raw, index) => {
    const label = `skills[${index}]`
    if (!isRecord(raw)) throw new Error(`${label} must use { id, files }.`)
    if (!isNonEmptyString(raw.id)) {
      if ('name' in raw || 'systemPromptContent' in raw) {
        throw new Error(`${label} must use { id, files }; the legacy { name, systemPromptContent } shape is not supported.`)
      }
      throw new Error(`${label}.id is required.`)
    }
    const id = raw.id.trim()
    if (id.includes('/') || id.includes('\\') || id.includes('..')) throw new Error(`Skill ID is unsafe: ${id}`)
    if (seenIds.has(id)) throw new Error(`Duplicate Skill update id: ${id}`)
    seenIds.add(id)

    if (!isRecord(raw.files)) throw new Error(`${label}.files must be an object of relative file paths to text content.`)
    const files: Record<string, string> = {}
    for (const [relativePath, content] of Object.entries(raw.files)) {
      if (relativePath.startsWith('skills/')) throw new Error(`${label}.files paths must be relative to skills/${id}/: ${relativePath}`)
      assertSafeZipPath(relativePath)
      if (typeof content !== 'string') throw new Error(`${label}.files[${relativePath}] must be text.`)
      files[relativePath] = content
    }
    if (!isNonEmptyString(files['SKILL.md'])) throw new Error(`${label}.files.SKILL.md must be non-empty.`)
    return { id, files }
  })
}

export function resetExpertPackRegistryForTests(): void {
  packsCache = null
}

export class ExpertPackRegistryService {
  async createExpertPack(input: ExpertPackCreateInput): Promise<ExpertPackImportPreview> {
    const packId = requireText(input.packId, 'pack ID')
    const expert = input.expert
    const expertId = requireText(expert.id, 'expert ID')
    const expertName = requireText(expert.name, 'expert name')
    const systemPath = `experts/${safeFileSegment(expertId)}/prompts/system.md`
    const expertPath = `experts/${safeFileSegment(expertId)}/expert.json`
    const entries: Record<string, Uint8Array | string> = {
      'manifest.json': JSON.stringify({
        packId,
        name: requireText(input.name ?? expertName, 'name'),
        version: requireText(input.version ?? '1.0.0', 'version'),
        schemaVersion: 1,
        type: 'expert-pack',
        description: input.description ?? '',
        entrypoints: { experts: [expertPath], skills: [], tools: [] },
        ...(input.minHostVersion ? { minHostVersion: input.minHostVersion } : {}),
        ...(input.hostTools ? { hostTools: input.hostTools } : {}),
        ...(input.permissions ? { permissions: input.permissions } : {}),
        ...(input.compatibility ? { compatibility: input.compatibility } : {}),
        ...(input.catalog ? { catalog: normalizeCatalogMetadata(input.catalog) } : {}),
        portability: input.portability ?? { selfContained: true },
      }, null, 2) + '\n',
      [expertPath]: JSON.stringify({
        id: expertId,
        name: expertName,
        description: expert.description ?? '',
        statusLabel: expert.statusLabel ?? '',
        ...(expert.profile ? { profile: normalizeExpertProfile(expert.profile) } : {}),
        promptPaths: { system: systemPath },
        skillIds: expert.skillIds ?? [],
        formPaths: [],
      }, null, 2) + '\n',
      [systemPath]: expert.systemPromptContent ?? '',
    }
    if (expert.intakeFlow) {
      const formPath = `experts/${safeFileSegment(expertId)}/forms/intake.json`
      const expertEntry = JSON.parse(String(entries[expertPath])) as Record<string, unknown>
      expertEntry.formPaths = [formPath]
      entries[expertPath] = JSON.stringify(expertEntry, null, 2) + '\n'
      entries[formPath] = JSON.stringify(expert.intakeFlow, null, 2) + '\n'
    }
    if (expert.outputProtocolContent !== undefined) {
      const outputPath = `experts/${safeFileSegment(expertId)}/output-protocol.json`
      const expertEntry = JSON.parse(String(entries[expertPath])) as Record<string, unknown>
      expertEntry.outputProtocolPath = outputPath
      entries[expertPath] = JSON.stringify(expertEntry, null, 2) + '\n'
      entries[outputPath] = expert.outputProtocolContent
    }
    const manifest = JSON.parse(String(entries['manifest.json'])) as Record<string, any>
    const toolPaths: string[] = []
    for (const tool of input.tools ?? []) {
      assertSafeZipPath(tool.entrypoint)
      if (!tool.entrypoint.startsWith('tools/')) throw new Error(`ZIP tool entrypoint must be inside tools/: ${tool.entrypoint}`)
      entries[tool.entrypoint] = JSON.stringify(tool, null, 2) + '\n'
      toolPaths.push(tool.entrypoint)
    }
    for (const archiveBase64 of input.toolArchivesBase64 ?? []) {
      const archive = await adapter.read(new Uint8Array(Buffer.from(archiveBase64, 'base64')))
      for (const entry of archive.entries) {
        if (!entry.path.startsWith('tools/')) throw new Error(`Tool archive entry must be inside tools/: ${entry.path}`)
        entries[entry.path] = await archive.readBytes(entry.path)
        if (entry.path.endsWith('.json')) toolPaths.push(entry.path)
      }
    }
    manifest.entrypoints.tools = [...new Set(toolPaths)]
    entries['manifest.json'] = JSON.stringify(manifest, null, 2) + '\n'
    return this.importExpertPackZip(await adapter.write(entries))
  }

  async listPacks(): Promise<ExpertPackIndexEntry[]> {
    const packs = await this.loadAllPacks()
    return clone(packs)
  }

  async listExperts(): Promise<ExpertDefinition[]> {
    const packs = await this.listPacks()
    return packs.flatMap((pack) => pack.experts).map(clone)
  }

  async getExpert(expertId: string): Promise<ExpertDefinition | null> {
    const experts = await this.listExperts()
    return experts.find((expert) => expert.id === expertId) ?? null
  }

  async getPackForExpert(expertId: string): Promise<ExpertPackIndexEntry | null> {
    const packs = await this.listPacks()
    return packs.find((pack) => pack.experts.some((expert) => expert.id === expertId)) ?? null
  }

  async readPackText(packId: string, entryPath: string): Promise<string> {
    assertSafeZipPath(entryPath)
    const zip = await adapter.read(await this.readPackBytes(packId))
    if (!zip.has(entryPath)) {
      if (/^skills\/[^/]+\/SKILL\.md$/.test(entryPath)) throw missingSkillFileError(entryPath)
      throw new Error(`专家包缺少文件：${entryPath}`)
    }
    return zip.readText(entryPath)
  }

  async previewExpertPackZip(
    zipData: Uint8Array,
    options: { detectConflicts?: boolean } = {},
  ): Promise<ExpertPackImportPreview> {
    const result = await this.readPack(zipData, { storage: { kind: 'zip', path: '' }, importedAt: new Date().toISOString() })
    // The ordinary import-preview route keeps duplicate detection. Authoring
    // validation is intentionally structural-only so its read-only tool call
    // never boots the registry and seeds bundled Expert ZIPs.
    if (options.detectConflicts === false) return result
    const incomingExpertIds = new Set(result.pack.experts.map((expert) => expert.id))
    const existing = (await this.listPacks()).find((pack) => (
      pack.packId === result.pack.packId || pack.experts.some((expert) => incomingExpertIds.has(expert.id))
    ))
    if (existing) {
      result.expertId = existing.experts.find((expert) => incomingExpertIds.has(expert.id))?.id ?? result.pack.packId
      result.overwrite = true
    }
    return result
  }

  async importExpertPackZip(zipData: Uint8Array): Promise<ExpertPackImportPreview> {
    const preview = await this.previewExpertPackZip(zipData)
    if (!preview.canImport) throw new Error(preview.warnings[0] ?? '\u4e13\u5bb6\u5305\u9700\u8981\u7684\u8f6f\u4ef6\u80fd\u529b\u5f53\u524d\u4e0d\u53ef\u7528\u3002')

    const packId = preview.pack.packId
    const overwrite = Boolean(preview.overwrite)

    const dir = getExpertPackStorageDir()
    await fs.mkdir(dir, { recursive: true })
    const zipPath = path.join(dir, `${safeFileSegment(packId)}.zip`)
    await fs.writeFile(zipPath, Buffer.from(zipData))
    await this.unmarkManagedBundledExpertPack(packId)

    this.invalidateCache()

    const pack: ExpertPackIndexEntry = {
      ...preview.pack,
      packId,
      storage: { kind: 'zip', path: `${safeFileSegment(packId)}.zip` },
      importedAt: new Date().toISOString(),
    }
    return { ...preview, pack: clone(pack), experts: clone(pack.experts), expertId: preview.expertId ?? packId, overwrite }
  }

  async exportExpertPackZip(packId: string): Promise<ExpertPackExportResult> {
    return exportResult(packId, await this.readPackBytes(packId))
  }

  async deleteExpertPack(packId: string): Promise<void> {
    const zipPath = path.join(getExpertPackStorageDir(), `${safeFileSegment(packId)}.zip`)
    await fs.rm(zipPath, { force: true })
    this.invalidateCache()
  }

  async updateExpertPack(packId: string, input: ExpertPackUpdateInput): Promise<ExpertPackIndexEntry> {
    const zipData = await this.readPackBytes(packId)
    const zip = await adapter.read(zipData)
    const entries = await readAllEntries(zip)
    const manifest = normalizeManifest(parseJsonEntry(entries['manifest.json']))
    if (manifest.entrypoints.experts.length !== 1) throw new Error('Expert ZIP must contain exactly one expert definition.')

    if (input.name !== undefined) manifest.name = requireText(input.name, 'name')
    if (input.version !== undefined) manifest.version = requireText(input.version, 'version')
    if (input.description !== undefined) manifest.description = input.description
    if (input.minHostVersion !== undefined) {
      const minHostVersion = input.minHostVersion.trim()
      if (minHostVersion) manifest.minHostVersion = requireText(minHostVersion, 'minimum host version')
      else delete manifest.minHostVersion
    }
    if (input.hostTools !== undefined) manifest.hostTools = normalizeHostTools(input.hostTools)
    if (input.permissions !== undefined) manifest.permissions = normalizePermissions(input.permissions)
    if (input.compatibility !== undefined) manifest.compatibility = input.compatibility
    if (input.runtimePolicy !== undefined) {
      if (input.runtimePolicy === null) delete manifest.runtimePolicy
      else manifest.runtimePolicy = normalizeRuntimePolicy(input.runtimePolicy)
    }
    if (input.catalog !== undefined) manifest.catalog = normalizeCatalogMetadata(input.catalog)
    if (input.portability !== undefined) manifest.portability = {
      selfContained: input.portability.selfContained !== false,
      ...(isNonEmptyString(input.portability.notes) ? { notes: input.portability.notes } : {}),
    }

    const expertPatch = input.expert ?? (input.experts?.length ? input.experts[0] : undefined)
    if ((input.experts?.length ?? 0) > 1) throw new Error('Expert ZIP can update exactly one expert definition.')
    if (expertPatch) {
      const entrypoint = manifest.entrypoints.experts[0]
      const raw = parseJsonEntry(entries[entrypoint])
      if (!isRecord(raw) || raw.id !== expertPatch.id) throw new Error(`Expert not found in package: ${expertPatch.id}`)
      if (expertPatch.name !== undefined) raw.name = requireText(expertPatch.name, 'expert name')
      if (expertPatch.description !== undefined) raw.description = expertPatch.description
      if (expertPatch.statusLabel !== undefined) raw.statusLabel = expertPatch.statusLabel
      if ('profile' in expertPatch && expertPatch.profile !== undefined) raw.profile = normalizeExpertProfile(expertPatch.profile)
      if ('skillIds' in expertPatch && expertPatch.skillIds !== undefined) raw.skillIds = normalizeStringArray(expertPatch.skillIds)
      if ('systemPromptContent' in expertPatch && expertPatch.systemPromptContent !== undefined) {
        const promptPaths = isRecord(raw.promptPaths) ? raw.promptPaths : {}
        const systemPath = isNonEmptyString(promptPaths.system) ? promptPaths.system : `experts/${safeFileSegment(String(raw.id))}/prompts/system.md`
        assertSafeZipPath(systemPath)
        raw.promptPaths = { ...promptPaths, system: systemPath }
        entries[systemPath] = expertPatch.systemPromptContent
      }
      if ('intakeFlow' in expertPatch && expertPatch.intakeFlow !== undefined) {
        const formPaths = normalizeStringArray(raw.formPaths)
        const formPath = formPaths[0] ?? `experts/${safeFileSegment(String(raw.id))}/forms/intake.json`
        assertSafeZipPath(formPath)
        raw.formPaths = [formPath]
        entries[formPath] = JSON.stringify(expertPatch.intakeFlow, null, 2) + '\n'
      }
      if ('outputProtocolContent' in expertPatch && expertPatch.outputProtocolContent !== undefined) {
        const outputPath = isNonEmptyString(raw.outputProtocolPath) ? raw.outputProtocolPath : `experts/${safeFileSegment(String(raw.id))}/output-protocol.json`
        assertSafeZipPath(outputPath)
        raw.outputProtocolPath = outputPath
        entries[outputPath] = expertPatch.outputProtocolContent
      }
      entries[entrypoint] = JSON.stringify(raw, null, 2) + '\n'
    }

    const skillIds = new Set(manifest.entrypoints.skills)
    for (const skill of normalizeSkillUpdates(input.skills)) {
      skillIds.add(skill.id)
      for (const [relativePath, content] of Object.entries(skill.files)) {
        const entryPath = `skills/${skill.id}/${relativePath}`
        assertSafeZipPath(entryPath)
        entries[entryPath] = content
      }
    }
    manifest.entrypoints.skills = [...skillIds]

    const toolPaths = new Set(manifest.entrypoints.tools)
    for (const tool of input.tools ?? []) {
      assertSafeZipPath(tool.entrypoint)
      if (!tool.entrypoint.startsWith('tools/')) throw new Error(`ZIP tool entrypoint must be inside tools/: ${tool.entrypoint}`)
      const normalizedTool = normalizeToolManifest(tool, tool.entrypoint)
      entries[tool.entrypoint] = JSON.stringify({
        id: normalizedTool.id,
        name: normalizedTool.name,
        type: normalizedTool.type,
        purpose: normalizedTool.purpose,
        permissions: normalizedTool.permissions,
        ...(normalizedTool.hostToolId ? { hostToolId: normalizedTool.hostToolId } : {}),
        ...(normalizedTool.command ? { command: normalizedTool.command } : {}),
        network: normalizedTool.network,
      }, null, 2) + '\n'
      toolPaths.add(tool.entrypoint)
    }
    for (const toolId of input.removeToolIds ?? []) {
      for (const toolPath of [...toolPaths]) {
        const tool = parseJsonEntry(entries[toolPath])
        if (isRecord(tool) && tool.id === toolId) {
          toolPaths.delete(toolPath)
          delete entries[toolPath]
        }
      }
      const toolRoot = `tools/${safeFileSegment(toolId)}/`
      for (const entryPath of Object.keys(entries)) {
        if (entryPath.startsWith(toolRoot)) delete entries[entryPath]
      }
    }
    for (const archiveBase64 of input.toolArchivesBase64 ?? []) {
      const archive = await adapter.read(new Uint8Array(Buffer.from(archiveBase64, 'base64')))
      for (const entry of archive.entries) {
        if (!entry.path.startsWith('tools/')) throw new Error(`Tool archive entry must be inside tools/: ${entry.path}`)
        entries[entry.path] = await archive.readBytes(entry.path)
        if (entry.path.endsWith('.json')) toolPaths.add(entry.path)
      }
    }
    manifest.entrypoints.tools = [...toolPaths]
    entries['manifest.json'] = JSON.stringify(manifest, null, 2) + '\n'

    // Validate the complete candidate ZIP before touching the installed copy.
    // A rejected patch must leave the existing user ZIP and registry cache intact.
    const candidateData = await adapter.write(entries)
    const candidate = await this.readPack(candidateData, {
      storage: { kind: 'zip', path: `${safeFileSegment(packId)}.zip`, source: 'stored' },
      importedAt: new Date().toISOString(),
    })
    await this.writeStoredPack(packId, candidateData)
    return clone(candidate.pack)
  }

  async copyExpertPack(packId: string): Promise<ExpertPackImportPreview> {
    const source = await this.readPackBytes(packId)
    const zip = await adapter.read(source)
    const entries = await readAllEntries(zip)
    const manifest = normalizeManifest(parseJsonEntry(entries['manifest.json']))
    const copiedPackId = await this.nextAvailableId(`${manifest.packId}-copy`)
    const idMap = new Map<string, string>()
    for (const entrypoint of manifest.entrypoints.experts) {
      const raw = parseJsonEntry(entries[entrypoint])
      if (isRecord(raw) && typeof raw.id === 'string') idMap.set(raw.id, `${raw.id}-copy`)
    }
    manifest.packId = copiedPackId
    entries['manifest.json'] = `${JSON.stringify(manifest, null, 2)}\n`
    for (const entrypoint of manifest.entrypoints.experts) {
      const raw = parseJsonEntry(entries[entrypoint])
      if (isRecord(raw) && typeof raw.id === 'string') {
        raw.id = idMap.get(raw.id) ?? `${raw.id}-copy`
        entries[entrypoint] = `${JSON.stringify(raw, null, 2)}\n`
      }
    }
    const copiedData = await adapter.write(entries)
    await this.writeStoredPack(copiedPackId, copiedData)
    const preview = await this.readPack(copiedData, { storage: { kind: 'zip', path: `${safeFileSegment(copiedPackId)}.zip` }, importedAt: new Date().toISOString() })
    this.invalidateCache()
    return preview
  }

  private async readPackBytes(packId: string): Promise<Uint8Array> {
    const pack = (await this.loadAllPacks()).find((candidate) => candidate.packId === packId)
    if (!pack) throw new Error(`Expert package not found: ${packId}`)
    const zipPath = pack.storage.source === 'bundled'
      ? pack.storage.path
      : path.join(getExpertPackStorageDir(), pack.storage.path)
    try {
      return new Uint8Array(await fs.readFile(zipPath))
    } catch {
      throw new Error(`Expert package not found: ${packId}`)
    }
  }

  private async writeStoredPack(packId: string, data: Uint8Array): Promise<void> {
    const storageDir = getExpertPackStorageDir()
    const filename = `${safeFileSegment(packId)}.zip`
    const zipPath = path.join(storageDir, filename)
    const temporaryPath = path.join(storageDir, `.${filename}.${randomUUID()}.tmp`)
    await fs.mkdir(storageDir, { recursive: true })
    try {
      await fs.writeFile(temporaryPath, Buffer.from(data))
      // rename replaces the target as one filesystem operation on the same volume.
      await fs.rename(temporaryPath, zipPath)
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    }
    await this.unmarkManagedBundledExpertPack(packId)
    this.invalidateCache()
  }

  private async nextAvailableId(base: string): Promise<string> {
    const existing = new Set((await this.loadAllPacks()).map((pack) => pack.packId))
    if (!existing.has(base)) return base
    let index = 2
    while (existing.has(`${base}-${index}`)) index += 1
    return `${base}-${index}`
  }

  private async loadAllPacks(): Promise<ExpertPackIndexEntry[]> {
    if (packsCache) return packsCache

    const bundled = await this.loadPacksFromDirectories(bundledExpertPackDirectories(), 'bundled')
    await this.seedBundledExpertPacks(bundled)
    const stored = await this.loadPacksFromDirectories([getExpertPackStorageDir()], 'stored')
    packsCache = keepNewestExpertDefinitions([...bundled, ...stored])
    return packsCache
  }

  private async seedBundledExpertPacks(bundledPacks: ExpertPackIndexEntry[]): Promise<void> {
    if (bundledPacks.length === 0) return

    const storageDir = getExpertPackStorageDir()
    await fs.mkdir(storageDir, { recursive: true })
    const managedPackIds = await this.readManagedBundledExpertPackIds()
    let managedStateChanged = false

    for (const pack of bundledPacks) {
      const sourceZip = new Uint8Array(await fs.readFile(pack.storage.path))
      const targetPath = path.join(storageDir, safeFileSegment(pack.packId) + '.zip')
      let existing: Uint8Array | null = null
      try {
        existing = new Uint8Array(await fs.readFile(targetPath))
      } catch {
        // A missing default is installed below.
      }

      const legacyDefault = existing
        ? await isKnownLegacyBundledExpertFingerprint(pack.packId, existing)
        : false
      const shouldManage = !existing || managedPackIds.has(pack.packId) || legacyDefault
      if (!shouldManage) continue

      if (!existing || !Buffer.from(existing).equals(Buffer.from(sourceZip))) {
        await fs.writeFile(targetPath, Buffer.from(sourceZip))
      }
      if (!managedPackIds.has(pack.packId)) {
        managedPackIds.add(pack.packId)
        managedStateChanged = true
      }
    }

    if (managedStateChanged) await this.writeManagedBundledExpertPackIds(managedPackIds)
  }

  private managedBundledExpertPacksPath(): string {
    return path.join(getExpertPackStorageDir(), MANAGED_BUNDLED_EXPERT_PACKS_FILE)
  }

  private async readManagedBundledExpertPackIds(): Promise<Set<string>> {
    try {
      const raw = JSON.parse(await fs.readFile(this.managedBundledExpertPacksPath(), 'utf8')) as unknown
      if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.packIds)) return new Set()
      return new Set(raw.packIds.filter(isNonEmptyString))
    } catch {
      return new Set()
    }
  }

  private async writeManagedBundledExpertPackIds(packIds: Set<string>): Promise<void> {
    await fs.writeFile(this.managedBundledExpertPacksPath(), JSON.stringify({
      schemaVersion: 1,
      packIds: [...packIds].sort(),
    }, null, 2) + '\n')
  }

  private async unmarkManagedBundledExpertPack(packId: string): Promise<void> {
    const packIds = await this.readManagedBundledExpertPackIds()
    if (!packIds.delete(packId)) return
    await this.writeManagedBundledExpertPackIds(packIds)
  }

  private async loadPacksFromDirectories(
    directories: string[],
    source: 'bundled' | 'stored',
  ): Promise<ExpertPackIndexEntry[]> {
    const packs: ExpertPackIndexEntry[] = []
    const seen = new Set<string>()
    for (const directory of directories) {
      const dir = path.resolve(directory)
      if (seen.has(dir)) continue
      seen.add(dir)

      let files: string[]
      try {
        files = await fs.readdir(dir)
      } catch {
        continue
      }

      for (const file of files.sort()) {
        if (!file.endsWith('.zip')) continue
        const zipPath = path.join(dir, file)
        try {
          const stat = await fs.stat(zipPath)
          const zipData = new Uint8Array(await fs.readFile(zipPath))
          const parsed = await this.readPack(zipData, {
            storage: { kind: 'zip', path: source === 'bundled' ? zipPath : file, source },
            // Bundled packages deliberately sort behind user-owned ZIPs so an
            // editable local override remains authoritative after an update.
            importedAt: source === 'bundled' ? new Date(0).toISOString() : stat.mtime.toISOString(),
          })
          packs.push(parsed.pack)
        } catch {
          // Skip invalid / unreadable ZIPs silently
        }
      }
    }
    return packs
  }

  private invalidateCache(): void {
    packsCache = null
  }

  private async readPack(zipData: Uint8Array, options: { storage: ExpertPackIndexEntry['storage']; importedAt: string }): Promise<ExpertPackImportPreview> {
    const zip = await adapter.read(zipData)
    if (!zip.has('manifest.json')) throw new Error('Expert package is missing manifest.json.')
    const manifest = normalizeManifest(await zip.readJson('manifest.json'))
    if (manifest.entrypoints.experts.length !== 1) throw new Error('Expert ZIP must contain exactly one expert definition.')

    for (const skillId of manifest.entrypoints.skills) {
      const entryPath = skillEntryPath(skillId)
      if (!zip.has(entryPath)) throw missingSkillFileError(entryPath)
    }

    const tools: ExpertToolManifest[] = []
    for (const toolPath of manifest.entrypoints.tools ?? []) {
      assertSafeZipPath(toolPath)
      if (!zip.has(toolPath)) throw new Error(`\u4e13\u5bb6\u5305\u7f3a\u5c11\u5de5\u5177\u8bf4\u660e\uff1a${toolPath}`)
      tools.push(normalizeToolManifest(await zip.readJson(toolPath), toolPath))
    }

    const experts: ExpertDefinition[] = []
    for (const entrypoint of manifest.entrypoints.experts) {
      assertSafeZipPath(entrypoint)
      if (!zip.has(entrypoint)) throw new Error(`\u4e13\u5bb6\u5305\u7f3a\u5c11\u4e13\u5bb6\u8bf4\u660e\uff1a${entrypoint}`)
      const expert = normalizeExpert(await zip.readJson(entrypoint), manifest, entrypoint, tools)
      if (expert.outputMode === 'template-fill') {
        if (!expert.outputTemplatePath) {
          throw new ExpertPackValidationError('专家包声明 template-fill 输出模式时必须提供 outputTemplatePath。')
        }
        if (!zip.has(expert.outputTemplatePath)) {
          throw new ExpertPackValidationError(`专家包不完整，缺少 HTML 母版：${expert.outputTemplatePath}。请重新导入完整专家 ZIP。`)
        }
        try {
          deriveExpertTemplateFillSchema(await zip.readText(expert.outputTemplatePath))
        } catch (error) {
          throw new ExpertPackValidationError(`专家包 HTML 母版不能用于模板填充：${error instanceof Error ? error.message : String(error)}`)
        }
      }
      for (const skillId of expert.skillIds) {
        if (!manifest.entrypoints.skills.includes(skillId)) {
          throw new ExpertPackValidationError(`专家包 Skill 声明不一致：专家引用了未在 manifest 中声明的 Skill：${skillId}`)
        }
      }
      const skillContents = Object.fromEntries(await Promise.all(expert.skillIds
        .map(async (skillId) => {
          const skillPath = skillEntryPath(skillId)
          return [skillId, await zip.readText(skillPath)] as const
        })))
      const outputProtocolContent = expert.outputProtocolPath && zip.has(expert.outputProtocolPath)
        ? await zip.readText(expert.outputProtocolPath)
        : undefined
      const researchBrowserPolicy = resolveExpertResearchBrowserPolicy(outputProtocolContent)
      experts.push({
        ...expert,
        intakeFlow: await readExpertIntakeFlow(zip, expert),
        ...(expert.promptPaths.system && zip.has(expert.promptPaths.system)
          ? { systemPromptContent: await zip.readText(expert.promptPaths.system) }
          : {}),
        ...(outputProtocolContent ? { outputProtocolContent } : {}),
        ...(researchBrowserPolicy ? { researchBrowserPolicy } : {}),
        ...(expert.outputTemplatePath && zip.has(expert.outputTemplatePath)
          ? { outputTemplateContent: await zip.readText(expert.outputTemplatePath) }
          : {}),
        skillContents,
      })
    }

    const unsupportedHostTools = (manifest.hostTools ?? []).filter((tool) => tool.supported === false)
    const executableTools = tools.filter((tool) => tool.type === 'packageLocalExecutable')
    const warnings = [
      ...unsupportedHostTools.map((tool) => `\u5f53\u524d\u8f6f\u4ef6\u7248\u672c\u4e0d\u652f\u6301\u4e13\u5bb6\u5305\u9700\u8981\u7684\u80fd\u529b\uff1a${tool.name}\u3002`),
      ...(executableTools.length > 0 ? ['\u8fd9\u4e2a\u4e13\u5bb6\u5305\u5305\u542b\u9700\u8981\u786e\u8ba4\u540e\u624d\u80fd\u8fd0\u884c\u7684\u672c\u5730\u5de5\u5177\uff1b\u5bfc\u5165\u4e0d\u4f1a\u6267\u884c\u8fd9\u4e9b\u5de5\u5177\u3002'] : []),
      ...(manifest.portability?.selfContained === false ? ['\u8fd9\u4e2a\u4e13\u5bb6\u5305\u58f0\u660e\u5e76\u975e\u5b8c\u5168\u53ef\u79fb\u690d\uff0c\u5bfc\u5165\u540e\u53ef\u80fd\u9700\u8981\u989d\u5916\u786e\u8ba4\u3002'] : []),
    ]

    const pack: ExpertPackIndexEntry = {
      packId: manifest.packId,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description ?? '',
      manifest,
      storage: options.storage,
      experts,
      tools,
      importedAt: options.importedAt,
    }
    return {
      pack,
      experts: clone(experts),
      summary: `\u8fd9\u4e2a\u4e13\u5bb6\u5305\u5305\u542b ${experts.length} \u4e2a\u4e13\u5bb6\u3001${manifest.entrypoints.skills.length} \u4e2a\u6280\u80fd\u3001${countForms(experts)} \u4e2a\u8868\u5355\u3002`,
      warnings,
      canImport: unsupportedHostTools.length === 0,
    }
  }

}

function normalizeManifest(raw: unknown): ExpertPackManifest {
  if (!isRecord(raw)) throw new Error('\u4e13\u5bb6\u5305\u683c\u5f0f\u4e0d\u6b63\u786e\uff1amanifest \u5fc5\u987b\u662f\u5bf9\u8c61\u3002')
  if (!isNonEmptyString(raw.packId)) throw new Error('\u4e13\u5bb6\u5305\u683c\u5f0f\u4e0d\u6b63\u786e\uff1a\u7f3a\u5c11\u5305 ID\u3002')
  if (!isNonEmptyString(raw.name)) throw new Error('\u4e13\u5bb6\u5305\u683c\u5f0f\u4e0d\u6b63\u786e\uff1a\u7f3a\u5c11\u540d\u79f0\u3002')
  if (!isNonEmptyString(raw.version)) throw new Error('\u4e13\u5bb6\u5305\u683c\u5f0f\u4e0d\u6b63\u786e\uff1a\u7f3a\u5c11\u7248\u672c\u3002')
  if (raw.schemaVersion !== 1) throw new Error('\u4e13\u5bb6\u5305\u683c\u5f0f\u4e0d\u6b63\u786e\uff1a\u6682\u53ea\u652f\u6301 schemaVersion 1\u3002')
  if (raw.type !== 'expert-pack') throw new Error('\u4e13\u5bb6\u5305\u683c\u5f0f\u4e0d\u6b63\u786e\uff1a\u7c7b\u578b\u5fc5\u987b\u662f expert-pack\u3002')
  if (!isRecord(raw.entrypoints)) throw new Error('\u4e13\u5bb6\u5305\u683c\u5f0f\u4e0d\u6b63\u786e\uff1a\u7f3a\u5c11\u5165\u53e3\u3002')
  const experts = normalizeStringArray(raw.entrypoints.experts)
  const skills = normalizeStringArray(raw.entrypoints.skills)
  const tools = normalizeStringArray(raw.entrypoints.tools)
  experts.forEach(assertSafeZipPath)
  tools.forEach(assertSafeZipPath)
  for (const skillId of skills) {
    if (skillId.includes('/') || skillId.includes('\\') || skillId.includes('..')) throw new Error(`\u6280\u80fd ID \u4e0d\u5b89\u5168\uff1a${skillId}`)
  }
  const hostTools = normalizeHostTools(raw.hostTools)
  const requiredHostTools = normalizeHostTools(raw.requiredHostTools)
  const runtimePolicy = normalizeRuntimePolicy(raw.runtimePolicy)
  const allHostToolIds = new Set(hostTools.map((tool) => tool.id))
  return {
    packId: raw.packId,
    name: raw.name,
    version: raw.version,
    ...(isNonEmptyString(raw.minHostVersion) ? { minHostVersion: raw.minHostVersion } : {}),
    schemaVersion: 1,
    type: 'expert-pack',
    description: isNonEmptyString(raw.description) ? raw.description : '',
    entrypoints: { experts, skills, tools },
    hostTools: [...hostTools, ...requiredHostTools.filter((tool) => !allHostToolIds.has(tool.id))],
    requiredHostTools,
    permissions: normalizePermissions(raw.permissions),
    compatibility: isRecord(raw.compatibility) ? raw.compatibility : {},
    ...(runtimePolicy ? { runtimePolicy } : {}),
    catalog: normalizeCatalogMetadata(raw.catalog),
    portability: isRecord(raw.portability)
      ? { selfContained: raw.portability.selfContained !== false, ...(isNonEmptyString(raw.portability.notes) ? { notes: raw.portability.notes } : {}) }
      : { selfContained: true },
  }
}

function normalizeRuntimePolicy(value: unknown): ExpertRuntimePolicy | undefined {
  if (!isRecord(value) || (value.mode !== 'strict-visual-workflow' && value.mode !== 'package-local-skills')) return undefined
  const allowedToolNames = normalizeStringArray(value.allowedToolNames)
  const requiredSkillIds = normalizeStringArray(value.requiredSkillIds)
  return {
    mode: value.mode,
    allowedToolNames: [...new Set(allowedToolNames)],
    requiredSkillIds: [...new Set(requiredSkillIds)],
  }
}

function normalizeCatalogMetadata(value: unknown): ExpertCatalogMetadata {
  if (!isRecord(value)) return {}
  const categoryId = isNonEmptyString(value.categoryId)
    ? value.categoryId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
  const tags = normalizeStringArray(value.tags).map((tag) => tag.slice(0, 48)).slice(0, 12)
  return { ...(categoryId ? { categoryId } : {}), ...(tags.length ? { tags } : {}) }
}

function normalizeHostTools(value: unknown): ExpertHostTool[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((tool) => {
    const id = isNonEmptyString(tool.id) ? tool.id : 'unknown'
    return {
      id,
      name: isNonEmptyString(tool.name) ? tool.name : '\u8f6f\u4ef6\u5185\u7f6e\u80fd\u529b',
      purpose: isNonEmptyString(tool.purpose) ? tool.purpose : '\u4e13\u5bb6\u8fd0\u884c\u65f6\u9700\u8981\u4f7f\u7528\u3002',
      ...(isNonEmptyString(tool.minHostVersion) ? { minHostVersion: tool.minHostVersion } : {}),
      supported: tool.supported !== false,
    }
  })
}

function normalizePermissions(value: unknown): ExpertPermission[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((permission) => ({
    id: isNonEmptyString(permission.id) ? permission.id : 'permission',
    description: isNonEmptyString(permission.description) ? permission.description : '\u4e13\u5bb6\u9700\u8981\u8fd9\u9879\u6743\u9650\u3002',
  }))
}

function normalizeToolManifest(raw: unknown, entrypoint: string): ExpertToolManifest {
  if (!isRecord(raw)) throw new Error(`\u5de5\u5177\u8bf4\u660e\u683c\u5f0f\u4e0d\u6b63\u786e\uff1a${entrypoint}`)
  if (!isNonEmptyString(raw.id)) throw new Error(`\u5de5\u5177\u8bf4\u660e\u7f3a\u5c11 ID\uff1a${entrypoint}`)
  const type = raw.type === 'hostBuiltinRef' || raw.type === 'packageLocalDeclarative' || raw.type === 'packageLocalExecutable'
    ? raw.type
    : 'packageLocalDeclarative'
  return {
    id: raw.id,
    name: isNonEmptyString(raw.name) ? raw.name : raw.id,
    type,
    purpose: isNonEmptyString(raw.purpose) ? raw.purpose : '\u4e13\u5bb6\u5305\u5185\u5de5\u5177\u3002',
    entrypoint,
    permissions: normalizePermissions(raw.permissions),
    ...(isNonEmptyString(raw.hostToolId) ? { hostToolId: raw.hostToolId } : {}),
    ...(isNonEmptyString(raw.command) ? { command: raw.command } : {}),
    network: raw.network === 'declared' ? 'declared' : 'none',
  }
}

async function readExpertIntakeFlow(zip: { has(pathName: string): boolean; readJson<T = unknown>(pathName: string): Promise<T> }, expert: ExpertDefinition): Promise<ExpertIntakeFlow | undefined> {
  const formPath = expert.formPaths[0]
  if (!formPath || !zip.has(formPath)) return undefined
  return normalizeIntakeFlow(await zip.readJson(formPath))
}

function normalizeIntakeFlow(raw: unknown): ExpertIntakeFlow | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.steps)) return undefined
  const steps: ExpertIntakeStep[] = raw.steps.filter(isRecord).flatMap((step, index): ExpertIntakeStep[] => {
    const id = isNonEmptyString(step.id) ? step.id : `step-${index + 1}`
    if (step.type === 'message') return [{ type: 'message', id, markdown: isNonEmptyString(step.markdown) ? step.markdown : '' }]
    if (step.type === 'question') {
      const rawOptions = Array.isArray(step.options) ? step.options : []
      const options = rawOptions.map((option, optionIndex): ExpertOption => isRecord(option)
        ? { id: isNonEmptyString(option.id) ? option.id : `option-${optionIndex + 1}`, label: isNonEmptyString(option.label) ? option.label : String(optionIndex + 1), ...(isNonEmptyString(option.description) ? { description: option.description } : {}) }
        : { id: String(optionIndex + 1), label: String(option) })
      return [{ type: 'question', id, question: isNonEmptyString(step.question) ? step.question : '\u8bf7\u9009\u62e9\u672c\u6b21\u54a8\u8be2\u91cd\u70b9\u3002', options, required: step.required !== false }]
    }
    if (step.type === 'form') {
      const fields = Array.isArray(step.fields) ? step.fields.filter(isRecord).map(normalizeFormField) : []
      return [{ type: 'form', id, title: isNonEmptyString(step.title) ? step.title : '\u8bf7\u8865\u5145\u6750\u6599', fields, required: step.required !== false }]
    }
    return []
  })
  return { version: 1, steps }
}

function normalizeFormField(field: Record<string, unknown>): ExpertFormField {
  const allowed = new Set(['text', 'textarea', 'url', 'url-list', 'file', 'file-list', 'folder', 'select', 'multi-select', 'table', 'checkbox'])
  const kind = typeof field.kind === 'string' && allowed.has(field.kind) ? field.kind as ExpertFormField['kind'] : 'text'
  return {
    id: isNonEmptyString(field.id) ? field.id : 'field',
    kind,
    label: isNonEmptyString(field.label) ? field.label : '\u8868\u5355\u5b57\u6bb5',
    required: field.required === true,
    ...(isNonEmptyString(field.placeholder) ? { placeholder: field.placeholder } : {}),
    ...(isNonEmptyString(field.description) ? { description: field.description } : {}),
    ...(Array.isArray(field.options) ? { options: field.options.filter(isRecord).map((option, index) => ({
      id: isNonEmptyString(option.id) ? option.id : `option-${index + 1}`,
      label: isNonEmptyString(option.label) ? option.label : `Option ${index + 1}`,
      ...(isNonEmptyString(option.description) ? { description: option.description } : {}),
    })) } : {}),
  }
}

function normalizeExpert(raw: unknown, manifest: ExpertPackManifest, entrypoint: string, tools: ExpertToolManifest[] = []): ExpertDefinition {
  if (!isRecord(raw)) throw new Error(`\u4e13\u5bb6\u8bf4\u660e\u683c\u5f0f\u4e0d\u6b63\u786e\uff1a${entrypoint}`)
  if (!isNonEmptyString(raw.id)) throw new Error(`\u4e13\u5bb6\u8bf4\u660e\u7f3a\u5c11 ID\uff1a${entrypoint}`)
  if (!isNonEmptyString(raw.name)) throw new Error(`\u4e13\u5bb6\u8bf4\u660e\u7f3a\u5c11\u540d\u79f0\uff1a${entrypoint}`)
  const promptPaths = isRecord(raw.promptPaths) ? {
    ...(isNonEmptyString(raw.promptPaths.system) ? { system: raw.promptPaths.system } : {}),
    ...(isNonEmptyString(raw.promptPaths.intake) ? { intake: raw.promptPaths.intake } : {}),
  } : {}
  if (promptPaths.system) assertSafeZipPath(promptPaths.system)
  if (promptPaths.intake) assertSafeZipPath(promptPaths.intake)
  const formPaths = normalizeStringArray(raw.formPaths)
  formPaths.forEach(assertSafeZipPath)
  const outputProtocolPath = isNonEmptyString(raw.outputProtocolPath) ? raw.outputProtocolPath : undefined
  if (outputProtocolPath) assertSafeZipPath(outputProtocolPath)
  const outputMode = raw.outputMode === 'template-fill' ? 'template-fill' as const : undefined
  const outputTemplatePath = isNonEmptyString(raw.outputTemplatePath) ? raw.outputTemplatePath : undefined
  if (outputTemplatePath) assertSafeZipPath(outputTemplatePath)
  if (outputMode === 'template-fill' && !outputTemplatePath) {
    throw new ExpertPackValidationError('专家包声明 template-fill 输出模式时必须提供 outputTemplatePath。')
  }
  const skillIds = normalizeStringArray(raw.skillIds)
  const subagentSkillIdsByAgentType = normalizeSubagentSkillIdsByAgentType(
    raw.subagentSkillIds,
    skillIds,
  )
  const intakeFlow = normalizeIntakeFlow(raw.intakeFlow)
  const profile = normalizeExpertProfile(raw.profile)
  return {
    id: raw.id,
    name: raw.name,
    description: isNonEmptyString(raw.description) ? raw.description : '',
    statusLabel: isNonEmptyString(raw.statusLabel) ? raw.statusLabel : '',
    ...(profile ? { profile } : {}),
    ...(manifest.catalog?.categoryId ? { categoryId: manifest.catalog.categoryId } : {}),
    tags: manifest.catalog?.tags ?? [],
    packId: manifest.packId,
    packName: manifest.name,
    packVersion: manifest.version,
    entrypoint,
    promptPaths,
    formPaths,
    outputProtocolPath,
    ...(outputMode ? { outputMode } : {}),
    outputTemplatePath,
    skillIds,
    ...(Object.keys(subagentSkillIdsByAgentType).length > 0 ? { subagentSkillIdsByAgentType } : {}),
    hostTools: manifest.hostTools ?? [],
    permissions: manifest.permissions ?? [],
    ...(manifest.runtimePolicy ? { runtimePolicy: manifest.runtimePolicy } : {}),
    tools,
    intakeFlow,
    portable: manifest.portability?.selfContained !== false,
  }
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : []
}

function normalizeSubagentSkillIdsByAgentType(
  value: unknown,
  declaredSkillIds: readonly string[],
): Record<string, string[]> {
  if (value === undefined) return {}
  if (!isRecord(value)) {
    throw new ExpertPackValidationError('subagentSkillIds 必须是“子代理类型 -> Skill ID 数组”的对象。')
  }

  const declared = new Set(declaredSkillIds)
  const normalized: Record<string, string[]> = {}
  for (const [agentType, rawSkillIds] of Object.entries(value)) {
    const safeAgentType = agentType.trim()
    if (!/^[a-z][a-z0-9-]{0,95}$/.test(safeAgentType)) {
      throw new ExpertPackValidationError(`subagentSkillIds 包含无效子代理类型：${agentType}`)
    }
    if (!Array.isArray(rawSkillIds) || rawSkillIds.some((skillId) => !isNonEmptyString(skillId))) {
      throw new ExpertPackValidationError(`subagentSkillIds.${safeAgentType} 必须是非空 Skill ID 数组。`)
    }
    const skillIds = [...new Set(rawSkillIds.map((skillId) => (skillId as string).trim()))]
    for (const skillId of skillIds) {
      if (!declared.has(skillId)) {
        throw new ExpertPackValidationError(`subagentSkillIds.${safeAgentType} 引用了未声明的 Skill：${skillId}`)
      }
    }
    normalized[safeAgentType] = skillIds
  }
  return normalized
}

function normalizeProfileEntries(value: unknown): ExpertProfileMemory[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).flatMap((entry, index): ExpertProfileMemory[] => {
    const content = isNonEmptyString(entry.content) ? entry.content.trim() : ''
    if (!content) return []
    return [{
      id: isNonEmptyString(entry.id) ? entry.id : `entry-${index + 1}`,
      content,
      createdAt: isNonEmptyString(entry.createdAt) ? entry.createdAt : new Date(0).toISOString(),
    }]
  })
}

export function normalizeExpertProfile(value: unknown): ExpertProfile | undefined {
  if (!isRecord(value)) return undefined
  const soul = isRecord(value.soul) ? {
    whoIAm: isNonEmptyString(value.soul.whoIAm) ? value.soul.whoIAm.trim() : '',
    howITalk: isNonEmptyString(value.soul.howITalk) ? value.soul.howITalk.trim() : '',
    boundaries: normalizeStringArray(value.soul.boundaries),
  } : undefined
  const workflow = Array.isArray(value.workflow) ? value.workflow.filter(isRecord).flatMap((step, index): ExpertProfileWorkflowStep[] => {
    const title = isNonEmptyString(step.title) ? step.title.trim() : ''
    if (!title) return []
    return [{
      id: isNonEmptyString(step.id) ? step.id : `step-${index + 1}`,
      title,
      ...(isNonEmptyString(step.description) ? { description: step.description.trim() } : {}),
    }]
  }) : []
  const knowledgeBase = isRecord(value.knowledgeBase) && isNonEmptyString(value.knowledgeBase.version) ? {
    version: value.knowledgeBase.version.trim(),
    ...(typeof value.knowledgeBase.ruleCount === 'number' && value.knowledgeBase.ruleCount >= 0 ? { ruleCount: Math.floor(value.knowledgeBase.ruleCount) } : {}),
    ...(typeof value.knowledgeBase.styleCount === 'number' && value.knowledgeBase.styleCount >= 0 ? { styleCount: Math.floor(value.knowledgeBase.styleCount) } : {}),
    ...(typeof value.knowledgeBase.paletteCount === 'number' && value.knowledgeBase.paletteCount >= 0 ? { paletteCount: Math.floor(value.knowledgeBase.paletteCount) } : {}),
    ...(typeof value.knowledgeBase.componentCount === 'number' && value.knowledgeBase.componentCount >= 0 ? { componentCount: Math.floor(value.knowledgeBase.componentCount) } : {}),
    ...(isNonEmptyString(value.knowledgeBase.notes) ? { notes: value.knowledgeBase.notes.trim() } : {}),
  } : undefined
  const profile: ExpertProfile = {
    ...(isNonEmptyString(value.avatar) ? { avatar: value.avatar.trim() } : {}),
    ...(isNonEmptyString(value.tagline) ? { tagline: value.tagline.trim() } : {}),
    ...(soul ? { soul } : {}),
    ...(normalizeStringArray(value.starterPrompts).length ? { starterPrompts: normalizeStringArray(value.starterPrompts) } : {}),
    ...(workflow.length ? { workflow } : {}),
    ...(knowledgeBase ? { knowledgeBase } : {}),
    ...(normalizeProfileEntries(value.memories).length ? { memories: normalizeProfileEntries(value.memories) } : {}),
    ...(normalizeProfileEntries(value.diary).length ? { diary: normalizeProfileEntries(value.diary) } : {}),
  }
  return Object.keys(profile).length ? profile : undefined
}

function countForms(experts: ExpertDefinition[]): number {
  return experts.reduce((total, expert) => total + expert.formPaths.length, 0)
}

function exportResult(packId: string, data: Uint8Array): ExpertPackExportResult {
  return {
    format: 'zip-pack',
    contentType: 'application/zip',
    filename: `${safeFileSegment(packId)}.zip`,
    dataBase64: Buffer.from(data).toString('base64'),
  }
}

async function isKnownLegacyBundledExpertFingerprint(packId: string, zipData: Uint8Array): Promise<boolean> {
  const known = KNOWN_LEGACY_BUNDLED_EXPERT_FINGERPRINTS.get(packId)
  if (!known) return false
  return known.has(await canonicalExpertPackFingerprint(zipData))
}

async function canonicalExpertPackFingerprint(zipData: Uint8Array): Promise<string> {
  const zip = await adapter.read(zipData)
  const hash = createHash('sha256')
  for (const entry of [...zip.entries].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(entry.path)
    hash.update('\0')
    hash.update(await zip.readBytes(entry.path))
    hash.update('\0')
  }
  return hash.digest('hex')
}
function keepNewestExpertDefinitions(packs: ExpertPackIndexEntry[]): ExpertPackIndexEntry[] {
  const claimedExpertIds = new Set<string>()
  return [...packs]
    .sort((left, right) => {
      const importedAt = Date.parse(right.importedAt) - Date.parse(left.importedAt)
      if (importedAt !== 0) return importedAt
      return right.packId.localeCompare(left.packId)
    })
    .map((pack) => ({
      ...pack,
      experts: pack.experts.filter((expert) => {
        if (claimedExpertIds.has(expert.id)) return false
        claimedExpertIds.add(expert.id)
        return true
      }),
    }))
    .filter((pack) => pack.experts.length > 0)
}

/**
 * Directories scanned for built-in Expert Pack ZIPs. They are immutable
 * application resources; user edits are written to the separate config store.
 */
function bundledExpertPackDirectories(): string[] {
  const dirs: string[] = []
  const envDir = process.env.CLAUDE_EXPERT_PACKS_DIR
  if (envDir) return [envDir]

  if (process.execPath) {
    const exeDir = path.dirname(process.execPath)
    pushUniqueDirectory(dirs, path.join(exeDir, 'packs', 'experts'))
    pushUniqueDirectory(dirs, path.join(exeDir, 'binaries', 'packs', 'experts'))
  }

  for (const base of [process.env.CLAUDE_APP_ROOT, process.env.CALLER_DIR, process.cwd()]) {
    if (!base) continue
    pushUniqueDirectory(dirs, path.join(base, 'src', 'server', 'packs', 'experts'))
    pushUniqueDirectory(dirs, path.join(base, '..', 'src', 'server', 'packs', 'experts'))
    pushUniqueDirectory(dirs, path.join(base, 'desktop', 'src-tauri', 'binaries', 'packs', 'experts'))
    pushUniqueDirectory(dirs, path.join(base, '..', 'desktop', 'src-tauri', 'binaries', 'packs', 'experts'))
  }

  return dirs
}

function pushUniqueDirectory(dirs: string[], candidate: string): void {
  const normalized = path.resolve(candidate)
  if (!dirs.includes(normalized)) dirs.push(normalized)
}

function safeFileSegment(value: string): string {
  const safe = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return safe || 'expert-pack'
}

function readAllEntries(zip: ZipPackArchive): Promise<Record<string, Uint8Array>> {
  return Promise.all(zip.entries.map(async (entry) => [entry.path, await zip.readBytes(entry.path)] as const))
    .then((pairs) => Object.fromEntries(pairs))
}

function parseJsonEntry(value: string | Uint8Array | undefined): unknown {
  if (value === undefined) throw new Error('Expert ZIP entry is missing.')
  return JSON.parse(typeof value === 'string' ? value : new TextDecoder().decode(value)) as unknown
}

function requireText(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`Expert package ${label} cannot be empty.`)
  return normalized
}




