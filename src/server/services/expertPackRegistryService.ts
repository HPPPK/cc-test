import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { getAppStoragePath } from '../../utils/appIdentity.js'
import { ZipPackAdapter, assertSafeZipPath, type ZipPackArchive } from './zipPackAdapter.js'

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
  hostTools: ExpertHostTool[]
  tools: ExpertToolManifest[]
  permissions: ExpertPermission[]
  outputProtocol?: { path: string; content: string }
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
  entrypoints: {
    experts: string[]
    skills: string[]
    tools?: string[]
  }
  hostTools?: ExpertHostTool[]
  requiredHostTools?: ExpertHostTool[]
  permissions?: ExpertPermission[]
  compatibility?: Record<string, unknown>
  portability?: { selfContained: boolean; notes?: string }
}

export type ExpertDefinition = {
  id: string
  name: string
  description: string
  statusLabel: string
  packId: string
  packName: string
  packVersion: string
  entrypoint: string
  promptPaths: { system?: string; intake?: string }
  formPaths: string[]
  outputProtocolPath?: string
  outputProtocolContent?: string
  skillIds: string[]
  hostTools: NonNullable<ExpertPackManifest['hostTools']>
  permissions: NonNullable<ExpertPackManifest['permissions']>
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
  storage: { kind: 'zip'; path: string }
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

export type ExpertPackUpdateInput = {
  name?: string
  version?: string
  description?: string
  minHostVersion?: string
  hostTools?: ExpertHostTool[]
  permissions?: ExpertPermission[]
  compatibility?: Record<string, unknown>
  portability?: { selfContained: boolean; notes?: string }
  expert?: {
    id: string
    name?: string
    description?: string
    statusLabel?: string
    systemPromptContent?: string
    skillIds?: string[]
    intakeFlow?: ExpertIntakeFlow
    outputProtocolContent?: string
  }
  tools?: ExpertToolManifest[]
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
let packsCache: ExpertPackIndexEntry[] | null = null


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
        portability: input.portability ?? { selfContained: true },
      }, null, 2) + '\n',
      [expertPath]: JSON.stringify({
        id: expertId,
        name: expertName,
        description: expert.description ?? '',
        statusLabel: expert.statusLabel ?? '',
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
    const zipPath = path.join(getExpertPackStorageDir(), `${safeFileSegment(packId)}.zip`)
    let zipData: Uint8Array
    try {
      zipData = new Uint8Array(await fs.readFile(zipPath))
    } catch {
      throw new Error('Expert package not found.')
    }
    const zip = await adapter.read(zipData)
    if (!zip.has(entryPath)) throw new Error(`专家包缺少文件：${entryPath}`)
    return zip.readText(entryPath)
  }

  async previewExpertPackZip(zipData: Uint8Array): Promise<ExpertPackImportPreview> {
    const result = await this.readPack(zipData, { storage: { kind: 'zip', path: '' }, importedAt: new Date().toISOString() })
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
    const zipPath = path.join(getExpertPackStorageDir(), `${safeFileSegment(packId)}.zip`)
    let data: Uint8Array
    try {
      data = new Uint8Array(await fs.readFile(zipPath))
    } catch {
      throw new Error('Expert package not found.')
    }
    return exportResult(packId, data)
  }

  async deleteExpertPack(packId: string): Promise<void> {
    const zipPath = path.join(getExpertPackStorageDir(), `${safeFileSegment(packId)}.zip`)
    await fs.rm(zipPath, { force: true })
    this.invalidateCache()
  }

  async updateExpertPack(packId: string, input: ExpertPackUpdateInput): Promise<ExpertPackIndexEntry> {
    const zipData = await this.readStoredPackBytes(packId)
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

    await this.writeStoredPack(packId, await adapter.write(entries))
    const updated = (await this.listPacks()).find((pack) => pack.packId === packId)
    if (!updated) throw new Error(`Updated expert package could not be reloaded: ${packId}`)
    return updated
  }

  async copyExpertPack(packId: string): Promise<ExpertPackImportPreview> {
    const source = await this.readStoredPackBytes(packId)
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

  private async readStoredPackBytes(packId: string): Promise<Uint8Array> {
    const zipPath = path.join(getExpertPackStorageDir(), `${safeFileSegment(packId)}.zip`)
    try {
      return new Uint8Array(await fs.readFile(zipPath))
    } catch {
      throw new Error(`Expert package not found: ${packId}`)
    }
  }

  private async writeStoredPack(packId: string, data: Uint8Array): Promise<void> {
    await fs.mkdir(getExpertPackStorageDir(), { recursive: true })
    await fs.writeFile(path.join(getExpertPackStorageDir(), `${safeFileSegment(packId)}.zip`), Buffer.from(data))
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

    const dir = getExpertPackStorageDir()
    let files: string[]
    try {
      files = await fs.readdir(dir)
    } catch {
      await fs.mkdir(dir, { recursive: true })
      files = await fs.readdir(dir)
    }

    const packs: ExpertPackIndexEntry[] = []
    for (const file of files) {
      if (!file.endsWith('.zip')) continue
      const zipPath = path.join(dir, file)
      try {
        const stat = await fs.stat(zipPath)
        const zipData = new Uint8Array(await fs.readFile(zipPath))
        const parsed = await this.readPack(zipData, {
          storage: { kind: 'zip', path: file },
          importedAt: stat.mtime.toISOString(),
        })
        packs.push(parsed.pack)
      } catch {
        // Skip invalid / unreadable ZIPs silently
      }
    }

    packsCache = keepNewestExpertDefinitions(packs)
    return packsCache
  }

  private invalidateCache(): void {
    packsCache = null
  }

  private async readPack(zipData: Uint8Array, options: { storage: ExpertPackIndexEntry['storage']; importedAt: string }): Promise<ExpertPackImportPreview> {
    const zip = await adapter.read(zipData)
    if (!zip.has('manifest.json')) throw new Error('Expert package is missing manifest.json.')
    const manifest = normalizeManifest(await zip.readJson('manifest.json'))
    if (manifest.entrypoints.experts.length !== 1) throw new Error('Expert ZIP must contain exactly one expert definition.')


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
      const skillContents = Object.fromEntries(await Promise.all(expert.skillIds
        .filter((skillId) => zip.has(`skills/${skillId}/SKILL.md`))
        .map(async (skillId) => {
          const skillPath = `skills/${skillId}/SKILL.md`
          return [skillId, await zip.readText(skillPath)] as const
        })))
      experts.push({
        ...expert,
        intakeFlow: await readExpertIntakeFlow(zip, expert),
        ...(expert.promptPaths.system && zip.has(expert.promptPaths.system)
          ? { systemPromptContent: await zip.readText(expert.promptPaths.system) }
          : {}),
        ...(expert.outputProtocolPath && zip.has(expert.outputProtocolPath)
          ? { outputProtocolContent: await zip.readText(expert.outputProtocolPath) }
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
    portability: isRecord(raw.portability)
      ? { selfContained: raw.portability.selfContained !== false, ...(isNonEmptyString(raw.portability.notes) ? { notes: raw.portability.notes } : {}) }
      : { selfContained: true },
  }
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
  const skillIds = normalizeStringArray(raw.skillIds)
  const intakeFlow = normalizeIntakeFlow(raw.intakeFlow)
  return {
    id: raw.id,
    name: raw.name,
    description: isNonEmptyString(raw.description) ? raw.description : '',
    statusLabel: isNonEmptyString(raw.statusLabel) ? raw.statusLabel : '',
    packId: manifest.packId,
    packName: manifest.name,
    packVersion: manifest.version,
    entrypoint,
    promptPaths,
    formPaths,
    outputProtocolPath,
    skillIds,
    hostTools: manifest.hostTools ?? [],
    permissions: manifest.permissions ?? [],
    tools,
    intakeFlow,
    portable: manifest.portability?.selfContained !== false,
  }
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : []
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




