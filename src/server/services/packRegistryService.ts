import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { getAppStoragePath } from '../../utils/appIdentity.js'
import {
  isNonEmptyString,
  isRecord,
  validateAndNormalizeWorkflowTemplate,
  type WorkflowTemplateRegistryTemplate,
  type WorkflowTemplateValidationIssue,
} from './workflowTemplateValidation.js'
import { ZipPackAdapter, assertSafeZipPath, type ZipPackArchive } from './zipPackAdapter.js'
import {
  buildChecksums,
  buildSelfContainedWorkflowPackDependencies,
  buildWorkflowPackSkillInstallPlan,
  verifyWorkflowPackChecksums,
  safePackFileSegment,
  WorkflowPackExportDependencyError,
  type WorkflowPackHostTool,
  type WorkflowPackSkillFileSet,
  type WorkflowPackSkillInstallPlan,
  type WorkflowPackagedSkill,
} from './workflowPackSkillService.js'
import type { WorkflowPhaseSkillCatalogEntry } from './workflowPhaseSkillResolver.js'

export type PackEntrypoints = {
  workflows: string[]
  experts: string[]
  skills: string[]
}

export type PackManifest = {
  packId: string
  name: string
  version: string
  schemaVersion: 1 | 2
  type: 'workflow-pack' | 'resource-pack'
  description?: string
  entrypoints: PackEntrypoints
  permissions?: unknown[]
  modelRequirements?: Record<string, unknown>
  compatibility?: Record<string, unknown>
  dependencies?: {
    packagedSkills?: WorkflowPackagedSkill[]
    requiredHostTools?: WorkflowPackHostTool[]
    blockedExternalDependencies?: unknown[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type PackWorkflowIndexEntry = {
  id: string
  name: string
  version: string
  schemaVersion: 1 | 2
  description: string
  entrypoint: string
  packId: string
  packName: string
  packVersion: string
  phaseCount: number
  phaseNames: string[]
  labels?: unknown
  modelRequirements?: unknown
}

export type PackIndexEntry = {
  packId: string
  name: string
  version: string
  type: PackManifest['type']
  description: string
  manifest: PackManifest
  storage: {
    kind: 'zip'
    path: string
  }
  workflows: PackWorkflowIndexEntry[]
  importedAt: string
}

export type PackRegistryIndex = {
  schemaVersion: 1
  packs: PackIndexEntry[]
}

export type PackImportResult = {
  pack: PackIndexEntry
  workflows: WorkflowTemplateRegistryTemplate[]
  invalidTemplates: WorkflowTemplateValidationIssue[]
  legacy?: boolean
  packagedSkills?: WorkflowPackagedSkill[]
  requiredHostTools?: WorkflowPackHostTool[]
  skillInstallPlan?: (Omit<WorkflowPackSkillInstallPlan, 'status'> & { status: 'pack-private' })[]
}

export type ExportWorkflowPackInput = {
  packId: string
  name: string
  version?: string
  description?: string
  workflows: unknown[]
  permissions?: unknown[]
  modelRequirements?: Record<string, unknown>
  compatibility?: Record<string, unknown>
  selfContained?: boolean
}

const PACK_REGISTRY_SCHEMA_VERSION = 1
const adapter = new ZipPackAdapter()
let cachedIndex: PackRegistryIndex | null = null
let cachedIndexPath: string | null = null
const bundledWorkflowPackSeedTasks = new Map<string, Promise<void>>()

function getConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function getPackRegistryPath(): string {
  return getAppStoragePath(getConfigDir(), 'packs', 'registry.json')
}

export function getWorkflowPackStorageDir(): string {
  return getAppStoragePath(getConfigDir(), 'workflows', 'packs')
}

export async function loadStoredWorkflowTemplate(
  workflowId: string,
): Promise<WorkflowTemplateRegistryTemplate> {
  if (!isNonEmptyString(workflowId)) throw new Error('Stored workflow id is required.')

  const zipPath = getWorkflowPackStoragePath(workflowPackFileName(workflowId))
  let zipData: Uint8Array
  try {
    zipData = new Uint8Array(await fs.readFile(zipPath))
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      throw new Error(`Stored workflow pack not found: ${zipPath}`)
    }
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read stored workflow pack "${zipPath}": ${detail}`)
  }

  try {
    const zip = await adapter.read(zipData)
    if (!zip.has('manifest.json')) throw new Error('missing manifest.json')
    const manifest = normalizePackManifest(await zip.readJson('manifest.json'))
    if (manifest.type !== 'workflow-pack') throw new Error('manifest type must be workflow-pack')
    await verifyWorkflowPackChecksums(zip, manifest.schemaVersion === 2)

    const entrypoint = manifest.entrypoints.workflows[0]
    if (!entrypoint) throw new Error('manifest must declare a workflow entrypoint')
    assertSafeZipPath(entrypoint)
    if (!zip.has(entrypoint)) throw new Error(`workflow entrypoint is missing: ${entrypoint}`)

    const rawWorkflow = await zip.readJson(entrypoint)
    const validation = validateAndNormalizeWorkflowTemplate(
      isRecord(rawWorkflow) ? { ...rawWorkflow, source: 'pack' } : rawWorkflow,
      { basePath: `stored:${workflowId}:${entrypoint}`, source: 'import' },
    )
    const errors = validation.issues.filter((issue) => issue.severity === 'error')
    if (!validation.template || errors.length > 0) {
      throw new Error(errors.map((issue) => issue.message).join('; ') || 'workflow template validation failed')
    }
    if (validation.template.id !== workflowId) {
      throw new Error(`workflow id mismatch: expected ${workflowId}, found ${validation.template.id}`)
    }

    return {
      ...validation.template,
      source: 'user',
      packId: manifest.packId,
      packName: manifest.name,
      packVersion: manifest.version,
      packEntrypoint: entrypoint,
      editable: true,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid stored workflow pack "${zipPath}": ${detail}`)
  }
}

function getWorkflowPackStoragePath(fileName: string): string {
  return path.join(getWorkflowPackStorageDir(), fileName)
}

function isCanonicalStoredWorkflowPathForId(storagePath: string, workflowId: string): boolean {
  if (!path.isAbsolute(storagePath)) return false
  return path.resolve(storagePath) === path.resolve(getWorkflowPackStoragePath(workflowPackFileName(workflowId)))
}

function workflowPackFileName(workflowId: string): string {
  return `${safeFileSegment(workflowId)}.zip`
}

function isStoredWorkflowPackPath(storagePath: string): boolean {
  const normalized = storagePath.replace(/\\/g, '/')
  return normalized.startsWith('workflows/packs/')
}

function isCanonicalWorkflowPackPath(storagePath: string): boolean {
  if (isStoredWorkflowPackPath(storagePath)) return true
  const normalizedStorage = path.resolve(storagePath)
  const normalizedDir = path.resolve(getWorkflowPackStorageDir())
  return normalizedStorage.startsWith(normalizedDir + path.sep)
}

function workflowPackStorageRelativePath(fileName: string): string {
  return `workflows/packs/${fileName}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function errnoCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

export function resetPackRegistryForTests(): void {
  cachedIndex = null
  cachedIndexPath = null
  bundledWorkflowPackSeedTasks.clear()
}

export class PackRegistryService {
  async previewWorkflowPackZip(zipData: Uint8Array): Promise<PackImportResult> {
    return this.parseWorkflowPackZip(zipData, { storePack: false })
  }

  async importWorkflowPackZip(zipData: Uint8Array): Promise<PackImportResult> {
    return this.parseWorkflowPackZip(zipData, { storePack: true })
  }

  private async parseWorkflowPackZip(
    zipData: Uint8Array,
    options: { storePack: boolean },
  ): Promise<PackImportResult> {
    const zip = await adapter.read(zipData)
    if (!zip.has('manifest.json')) {
      throw new Error('Workflow pack ZIP must contain manifest.json.')
    }

    const manifest = normalizePackManifest(await zip.readJson('manifest.json'))
    await verifyWorkflowPackChecksums(zip, manifest.schemaVersion === 2)
    if (manifest.entrypoints.workflows.length === 0) {
      throw new Error('Workflow pack manifest must declare at least one workflow entrypoint.')
    }
    if (manifest.schemaVersion === 2) {
      for (const skillEntrypoint of manifest.entrypoints.skills) {
        assertSafeZipPath(skillEntrypoint)
        if (!zip.has(skillEntrypoint)) throw new Error(`Workflow pack skill entrypoint is missing: ${skillEntrypoint}`)
      }
    }

    const workflows: WorkflowTemplateRegistryTemplate[] = []
    const invalidTemplates: WorkflowTemplateValidationIssue[] = []
    const workflowIndex: PackWorkflowIndexEntry[] = []

    for (const [index, entrypoint] of manifest.entrypoints.workflows.entries()) {
      assertSafeZipPath(entrypoint)
      if (!zip.has(entrypoint)) {
        throw new Error(`Workflow pack entrypoint is missing: ${entrypoint}`)
      }
      const rawWorkflow = await zip.readJson(entrypoint)
      const validation = validateAndNormalizeWorkflowTemplate(
        isRecord(rawWorkflow) ? { ...rawWorkflow, source: 'pack' } : rawWorkflow,
        { basePath: `$.workflows[${index}]`, source: 'import' },
      )
      invalidTemplates.push(...validation.issues)
      if (!validation.template || validation.issues.some((issue) => issue.severity === 'error')) continue
      const workflow = {
        ...validation.template,
        source: 'pack' as const,
        packId: manifest.packId,
        packName: manifest.name,
        packVersion: manifest.version,
        packEntrypoint: entrypoint,
        editable: false,
      }
      workflows.push(workflow)
      workflowIndex.push(indexWorkflow(manifest, entrypoint, workflow))
    }

    if (workflows.length === 0) {
      const firstIssue = invalidTemplates[0]
      throw new Error(firstIssue?.message ?? 'Workflow pack does not contain any valid workflow templates.')
    }

    // Build skill usage plan for UI display, but never install skills to user local directory.
    // Skills remain pack-private and are resolved directly from the ZIP archive at runtime.
    const skillInstallPlan = (await buildWorkflowPackSkillInstallPlan(zip, manifest)).map((item) => ({
      ...item,
      status: 'pack-private' as const,
    }))

    let resultManifest = manifest
    let resultWorkflowIndex = workflowIndex
    let storagePath = ''
    if (options.storePack) {
      const firstWorkflow = workflows[0]
      const workflowIds = workflows.map((workflow) => workflow.id)
      const keptFileNames = new Set(workflowIds.map(workflowPackFileName))
      const firstWorkflowPath = workflowPackStorageRelativePath(workflowPackFileName(firstWorkflow.id))
      storagePath = firstWorkflowPath
      if (workflows.length === 1 && manifest.schemaVersion === 2) {
        const absoluteStoragePath = getWorkflowPackStoragePath(workflowPackFileName(firstWorkflow.id))
        await fs.mkdir(path.dirname(absoluteStoragePath), { recursive: true })
        await fs.writeFile(absoluteStoragePath, Buffer.from(zipData))
      } else {
        await Promise.all(workflows.map((workflow) => this.writeSingleWorkflowPack(workflow, workflow.id)))
        resultManifest = {
          ...manifest,
          packId: firstWorkflow.id,
          name: firstWorkflow.name || manifest.name,
          description: firstWorkflow.description || manifest.description || '',
          entrypoints: {
            workflows: [`workflows/${safeFileSegment(firstWorkflow.id)}.workflow.json`],
            experts: [],
            skills: [],
          },
        }
        resultWorkflowIndex = [indexWorkflow(resultManifest, resultManifest.entrypoints.workflows[0], firstWorkflow)]
      }
    }

    const pack: PackIndexEntry = {
      packId: resultManifest.packId,
      name: resultManifest.name,
      version: resultManifest.version,
      type: resultManifest.type,
      description: resultManifest.description ?? '',
      manifest: resultManifest,
      storage: {
        kind: 'zip',
        path: storagePath,
      },
      workflows: resultWorkflowIndex,
      importedAt: new Date().toISOString(),
    }

    return {
      pack: clone(pack),
      workflows: clone(workflows),
      invalidTemplates: invalidTemplates.map((issue) => ({ ...issue })),
      legacy: manifest.schemaVersion === 1,
      packagedSkills: clone(manifest.dependencies?.packagedSkills ?? []),
      requiredHostTools: clone(manifest.dependencies?.requiredHostTools ?? []),
      skillInstallPlan: clone(skillInstallPlan),
    }
  }

  async importLegacyWorkflowJson(payload: unknown): Promise<PackImportResult> {
    const templates = extractLegacyTemplates(payload)
    if (templates.length === 0) throw new Error('Legacy workflow JSON does not contain workflow templates.')
    const first = templates.find(isRecord)
    const baseId = first && isNonEmptyString(first.id) ? first.id : `legacy-workflow-${Date.now()}`
    const packId = `legacy-${safeFileSegment(baseId)}`
    const workflows = templates.map((template) => isRecord(template) ? template : {})
    const archive = await this.exportWorkflowPackZip({
      packId,
      name: isNonEmptyString(first?.name) ? `${first.name} Legacy Pack` : 'Legacy Workflow Pack',
      version: isNonEmptyString(first?.version) ? first.version : '1.0.0',
      workflows,
      description: 'Internal compatibility pack created from a legacy workflow JSON import.',
      selfContained: false,
    })
    return this.importWorkflowPackZip(archive)
  }

  private async readPackPrivateSkillFileSet(sourcePath: string): Promise<WorkflowPackSkillFileSet | null> {
    const match = /^pack:\/\/([^/]+)\/(.+)$/.exec(sourcePath)
    if (!match) return null
    const [, packId, entrypoint] = match
    assertSafeZipPath(entrypoint)
    if (!entrypoint.startsWith('skills/') || !entrypoint.endsWith('/SKILL.md')) return null
    const root = entrypoint.slice(0, -'/SKILL.md'.length)
    const pack = (await this.listAllPacks()).find((candidate) => candidate.packId === packId)
    if (!pack) return null

    const zipData = pack.storage.path.startsWith('archives/') || isStoredWorkflowPackPath(pack.storage.path)
      ? await this.readStoredZip(pack)
      : new Uint8Array(await fs.readFile(pack.storage.path))
    const zip = await adapter.read(zipData)
    if (!zip.has(entrypoint)) return null

    const files: Array<{ relativePath: string; bytes: Uint8Array }> = []
    let totalBytes = 0
    for (const entry of zip.entries.filter((candidate) => candidate.path.startsWith(`${root}/`))) {
      const relativePath = entry.path.slice(root.length + 1)
      if (!relativePath) continue
      assertSafeZipPath(relativePath)
      const bytes = await zip.readBytes(entry.path)
      totalBytes += bytes.byteLength
      files.push({ relativePath, bytes })
    }
    if (!files.some((file) => file.relativePath === 'SKILL.md')) return null
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    return { files, totalBytes }
  }

  async listPacks(): Promise<PackIndexEntry[]> {
    return (await this.readIndex()).packs.map(clone)
  }

  async exportWorkflowPackZip(input: ExportWorkflowPackInput): Promise<Uint8Array> {
    if (!isNonEmptyString(input.packId)) throw new Error('packId is required.')
    if (!isNonEmptyString(input.name)) throw new Error('name is required.')
    if (!Array.isArray(input.workflows) || input.workflows.length === 0) {
      throw new Error('At least one workflow is required.')
    }

    const entries: Record<string, Uint8Array | string> = {}
    const workflowPaths: string[] = []
    const workflows = input.workflows.map((workflow, index) => {
      const validation = validateAndNormalizeWorkflowTemplate(
        isRecord(workflow) ? { ...workflow, source: 'pack' } : workflow,
        { basePath: `$.workflows[${index}]`, source: 'import' },
      )
      if (!validation.template || validation.issues.some((issue) => issue.severity === 'error')) {
        throw new Error(validation.issues[0]?.message ?? 'Workflow template is invalid.')
      }
      return validation.template
    })

    for (const workflow of workflows) {
      const entryPath = `workflows/${safeFileSegment(workflow.id)}.workflow.json`
      workflowPaths.push(entryPath)
      const draft = clone(workflow) as Record<string, unknown>
      delete draft.source
      delete draft.editable
      delete draft.copyable
      entries[entryPath] = `${JSON.stringify(draft, null, 2)}\n`
    }

    const selfContained = input.selfContained !== false
    let skillEntrypoints: string[] = []
    let dependencies: PackManifest['dependencies'] | undefined
    const permissions = input.permissions ?? []
    let modelRequirements = input.modelRequirements ?? {}

    if (selfContained) {
      const dependencyExport = await buildSelfContainedWorkflowPackDependencies(workflows, {
        readPackPrivateSkill: (sourcePath) => this.readPackPrivateSkillFileSet(sourcePath),
      })
      Object.assign(entries, dependencyExport.entries)
      skillEntrypoints = dependencyExport.entrypoints
      dependencies = {
        packagedSkills: dependencyExport.skills,
        requiredHostTools: dependencyExport.requiredHostTools,
        blockedExternalDependencies: dependencyExport.blockedExternalDependencies,
      }
      entries['tools/host-tools.json'] = `${JSON.stringify({
        schemaVersion: 1,
        requiredHostTools: dependencyExport.requiredHostTools,
      }, null, 2)}\n`
      entries['permissions/permissions.json'] = `${JSON.stringify(dependencyExport.permissions, null, 2)}\n`
      entries['model-capabilities/requirements.json'] = `${JSON.stringify(dependencyExport.modelRequirements, null, 2)}\n`
      modelRequirements = dependencyExport.modelRequirements
    }

    const manifest: PackManifest = {
      packId: input.packId,
      name: input.name,
      version: input.version ?? '1.0.0',
      schemaVersion: selfContained ? 2 : 1,
      type: 'workflow-pack',
      description: input.description ?? '',
      entrypoints: {
        workflows: workflowPaths,
        experts: [],
        skills: skillEntrypoints,
      },
      permissions,
      modelRequirements,
      compatibility: {
        workflowSchemaVersion: 2,
        selfContained,
        ...(input.compatibility ?? {}),
      },
      ...(dependencies ? { dependencies } : {}),
    }
    entries['manifest.json'] = `${JSON.stringify(manifest, null, 2)}\n`
    entries['README.md'] = `# ${input.name}\n\nWorkflow pack generated by Claude Code Jiangxia. Contents are indexed as data and never executed.\n`
    if (selfContained) {
      entries['checksums.json'] = `${JSON.stringify(buildChecksums(entries), null, 2)}\n`
    }

    return adapter.write(entries)
  }

  private async readStoredZip(pack: PackIndexEntry): Promise<Uint8Array> {
    const relative = pack.storage.path.replace(/\\/g, '/')
    assertSafeZipPath(relative)
    const appStorageRoot = path.dirname(path.dirname(getPackRegistryPath()))
    const storageRoot = relative.startsWith('archives/')
      ? path.dirname(getPackRegistryPath())
      : appStorageRoot
    const archivePath = path.join(storageRoot, relative)
    const resolvedRoot = path.resolve(storageRoot)
    const resolvedArchive = path.resolve(archivePath)
    if (!resolvedArchive.startsWith(resolvedRoot + path.sep)) {
      throw new Error('Pack storage path escapes registry directory.')
    }
    return new Uint8Array(await fs.readFile(resolvedArchive))
  }

  private async readIndex(): Promise<PackRegistryIndex> {
    const indexPath = getPackRegistryPath()
    if (cachedIndex && cachedIndexPath === indexPath) return clone(cachedIndex)
    let raw: string
    try {
      raw = await fs.readFile(indexPath, 'utf-8')
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') {
        return { schemaVersion: PACK_REGISTRY_SCHEMA_VERSION, packs: [] }
      }
      throw error
    }
    const parsed = JSON.parse(raw) as unknown
    const index = normalizePackIndex(parsed)
    cachedIndex = clone(index)
    cachedIndexPath = indexPath
    return index
  }

  private async writeIndex(index: PackRegistryIndex): Promise<void> {
    const indexPath = getPackRegistryPath()
    await fs.mkdir(path.dirname(indexPath), { recursive: true })
    await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf-8')
    cachedIndex = clone(index)
    cachedIndexPath = indexPath
  }

  /**
   * Scan bundled pack directories for ZIP workflow packs.
   * Runtime source: bundled ZIP packs only. Does not read workflow JSON files directly.
   */
  async listBundledPacks(): Promise<PackIndexEntry[]> {
    const candidates = bundledPackDirectories()
    const packs: PackIndexEntry[] = []
    const seenPaths = new Set<string>()
    for (const dir of candidates) {
      const normalized = path.resolve(dir)
      if (seenPaths.has(normalized)) continue
      seenPaths.add(normalized)
      packs.push(...await this.listPacksFromDirectory(normalized, 'bundled'))
    }
    return packs
  }

  async listStoredWorkflowPacks(): Promise<PackIndexEntry[]> {
    const packs = await this.listPacksFromDirectory(getWorkflowPackStorageDir(), 'stored')
    return this.dedupeStoredWorkflowPacksByWorkflowId(packs)
  }

  private async listPacksFromDirectory(dir: string, source: 'bundled' | 'stored'): Promise<PackIndexEntry[]> {
    const packs: PackIndexEntry[] = []
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      return packs
    }

    for (const entry of entries.sort()) {
      if (!entry.toLowerCase().endsWith('.zip')) continue
      const zipPath = path.join(dir, entry)
      try {
        const zipData = new Uint8Array(await fs.readFile(zipPath))
        const zip = await adapter.read(zipData)
        if (!zip.has('manifest.json')) continue
        const manifest = normalizePackManifest(await zip.readJson('manifest.json'))
        if (manifest.type !== 'workflow-pack') continue
        await verifyWorkflowPackChecksums(zip, manifest.schemaVersion === 2)
        const workflows: PackWorkflowIndexEntry[] = []
        for (const [wfIdx, wfEntrypoint] of manifest.entrypoints.workflows.entries()) {
          assertSafeZipPath(wfEntrypoint)
          if (!zip.has(wfEntrypoint)) continue
          const raw = await zip.readJson(wfEntrypoint)
          const validation = validateAndNormalizeWorkflowTemplate(
            isRecord(raw) ? { ...raw, source: 'pack' } : raw,
            { basePath: `${source}:${manifest.packId}:workflows[${wfIdx}]`, source: 'import' },
          )
          if (!validation.template || validation.issues.some((i) => i.severity === 'error')) continue
          workflows.push(indexWorkflow(manifest, wfEntrypoint, {
            ...validation.template,
            source: 'pack',
            packId: manifest.packId,
            packName: manifest.name,
            packVersion: manifest.version,
            packEntrypoint: wfEntrypoint,
            editable: source === 'stored',
          }))
        }
        const stat = source === 'stored' ? await fs.stat(zipPath) : null
        packs.push({
          packId: manifest.packId,
          name: manifest.name,
          version: manifest.version,
          type: manifest.type,
          description: manifest.description ?? '',
          manifest,
          storage: { kind: 'zip', path: zipPath },
          workflows,
          importedAt: source === 'bundled' ? new Date(0).toISOString() : (stat?.mtime ?? new Date()).toISOString(),
        })
      } catch {
        continue
      }
    }

    return packs
  }

  private async dedupeStoredWorkflowPacksByWorkflowId(packs: PackIndexEntry[]): Promise<PackIndexEntry[]> {
    // Keep every stored ZIP on disk. Runtime listing may project one workflow
    // view per id, but reading the directory must never delete a pack as a
    // side effect of discovering duplicate ids.
    return [...packs].sort((a, b) => Date.parse(a.importedAt) - Date.parse(b.importedAt))
  }

  /**
   * List runtime workflow packs from the ZIP-only workflow sources.
   *
   * Legacy imported/exported archives under packs/archives are deliberately not
   * runtime workflow sources: if an archive is imported, its workflows are split
   * into the fixed editable workflow ZIP store first. This keeps every workflow
   * shown in the template list editable/deletable from its canonical ZIP.
   */
  async listAllPacks(): Promise<PackIndexEntry[]> {
    const [storedWorkflowPacks, bundledPacks] = await Promise.all([
      this.listStoredWorkflowPacks(),
      this.listBundledPacks(),
    ])
    const storedPackIds = new Set(storedWorkflowPacks.map((p) => p.packId))
    return [
      ...bundledPacks.filter((p) => !storedPackIds.has(p.packId)),
      ...storedWorkflowPacks,
    ]
  }

  /**
   * List all workflows from all packs (user + bundled).
   * This is the primary runtime listing method.
   */
  async listWorkflows(): Promise<WorkflowTemplateRegistryTemplate[]> {
    const allPacks = await this.listAllPacks()
    const workflowsById = new Map<string, { workflow: WorkflowTemplateRegistryTemplate; canonical: boolean }>()
    for (const pack of allPacks) {
      try {
        let zip: ZipPackArchive
        if (pack.storage.path.startsWith('archives/') || isStoredWorkflowPackPath(pack.storage.path)) {
          const zipData = await this.readStoredZip(pack)
          zip = await adapter.read(zipData)
        } else {
          // Bundled packs use absolute path
          const zipData = new Uint8Array(await fs.readFile(pack.storage.path))
          zip = await adapter.read(zipData)
        }
        for (const entry of pack.workflows) {
          if (!zip.has(entry.entrypoint)) continue
          const rawWorkflow = await zip.readJson(entry.entrypoint)
          const validation = validateAndNormalizeWorkflowTemplate(
            isRecord(rawWorkflow) ? { ...rawWorkflow, source: 'pack' } : rawWorkflow,
            { basePath: `pack:${pack.packId}:${entry.entrypoint}`, source: 'import' },
          )
          if (!validation.template || validation.issues.some((issue) => issue.severity === 'error')) continue
          const editable = isCanonicalWorkflowPackPath(pack.storage.path)
          const workflow = {
            ...validation.template,
            source: editable ? 'user' as const : 'pack' as const,
            packId: pack.packId,
            packName: pack.name,
            packVersion: pack.version,
            packEntrypoint: entry.entrypoint,
            editable,
          }
          const canonical = isCanonicalStoredWorkflowPathForId(pack.storage.path, workflow.id)
          const existing = workflowsById.get(workflow.id)
          // Keep the normal latest-in-list behavior among equal candidates, but
          // never let a renamed stale ZIP override the canonical <workflow-id>.zip.
          if (!existing || canonical || !existing.canonical) {
            workflowsById.set(workflow.id, { workflow, canonical })
          }
        }
      } catch {
        continue
      }
    }
    return Array.from(workflowsById.values(), ({ workflow }) => clone(workflow))
  }

  /**
   * Read the current workflow definition directly from its canonical stored ZIP.
   * This deliberately bypasses registry.json, workflows.json, and any session snapshot.
   */
  async loadStoredWorkflowTemplate(workflowId: string): Promise<WorkflowTemplateRegistryTemplate> {
    if (!isNonEmptyString(workflowId)) {
      throw new Error('Workflow id is required to load a stored workflow pack.')
    }

    const zipPath = getWorkflowPackStoragePath(workflowPackFileName(workflowId))
    let zipData: Uint8Array
    try {
      zipData = new Uint8Array(await fs.readFile(zipPath))
    } catch (error) {
      throw new Error(`Stored workflow ZIP is unavailable for ${workflowId}: ${error instanceof Error ? error.message : String(error)}`)
    }

    const zip = await adapter.read(zipData)
    if (!zip.has('manifest.json')) {
      throw new Error(`Stored workflow ZIP for ${workflowId} is missing manifest.json.`)
    }
    const manifest = normalizePackManifest(await zip.readJson('manifest.json'))
    if (manifest.type !== 'workflow-pack') {
      throw new Error(`Stored ZIP for ${workflowId} is not a workflow pack.`)
    }
    await verifyWorkflowPackChecksums(zip, manifest.schemaVersion === 2)

    for (const entrypoint of manifest.entrypoints.workflows) {
      assertSafeZipPath(entrypoint)
      if (!zip.has(entrypoint)) continue
      const rawWorkflow = await zip.readJson(entrypoint)
      const validation = validateAndNormalizeWorkflowTemplate(
        isRecord(rawWorkflow) ? { ...rawWorkflow, source: 'pack' } : rawWorkflow,
        { basePath: `stored:${workflowId}:${entrypoint}`, source: 'import' },
      )
      if (!validation.template || validation.issues.some((issue) => issue.severity === 'error')) continue
      if (validation.template.id !== workflowId) continue

      return clone({
        ...validation.template,
        source: 'user' as const,
        packId: manifest.packId,
        packName: manifest.name,
        packVersion: manifest.version,
        packEntrypoint: entrypoint,
        editable: true,
      })
    }

    throw new Error(`Stored workflow ZIP does not contain workflow ${workflowId}.`)
  }

  /**
   * Return catalog entries for pack-private skills from all packs.
   * These entries have source='workflow' and are scoped to their pack.
   */
  async listPackSkillCatalogEntries(): Promise<WorkflowPhaseSkillCatalogEntry[]> {
    const allPacks = await this.listAllPacks()
    const catalog: WorkflowPhaseSkillCatalogEntry[] = []
    const seen = new Set<string>()

    for (const pack of allPacks) {
      try {
        let zip: ZipPackArchive
        if (pack.storage.path.startsWith('archives/') || isStoredWorkflowPackPath(pack.storage.path)) {
          const zipData = await this.readStoredZip(pack)
          zip = await adapter.read(zipData)
        } else {
          const zipData = new Uint8Array(await fs.readFile(pack.storage.path))
          zip = await adapter.read(zipData)
        }

        const packagedSkills = pack.manifest.dependencies?.packagedSkills ?? []
        for (const skill of packagedSkills) {
          const key = `${pack.packId}:${skill.identity}`
          if (seen.has(key)) continue
          seen.add(key)
          catalog.push({
            name: skill.identity,
            displayName: skill.identity,
            source: 'managed' as const,
            packId: pack.packId,
            packSkillIdentity: skill.identity,
            sourcePath: `pack://${pack.packId}/${skill.entrypoint}`,
            contentHash: skill.contentHash,
            aliases: [...(skill.aliases ?? []), ...(skill.references ?? [])],
            referenceId: skill.identity,
            installable: false,
          })
        }

        // Also scan ZIP entrypoints for skills not listed in packagedSkills
        for (const entrypoint of pack.manifest.entrypoints.skills) {
          const text = await zip.readText(entrypoint)
          const frontmatter = parseFrontmatter(text)
          const entryKey = `${pack.packId}:${entrypoint}`
          if (seen.has(entryKey)) continue
          seen.add(entryKey)
          const identity = frontmatter.referenceId ?? frontmatter.name ?? entrypoint
          catalog.push({
            name: identity,
            displayName: identity,
            source: 'managed' as const,
            packId: pack.packId,
            packSkillIdentity: identity,
            sourcePath: `pack://${pack.packId}/${entrypoint}`,
            referenceId: identity,
            installable: false,
          })
        }
      } catch {
        continue
      }
    }

    return catalog
  }

  async saveUserWorkflowAsZip(workflow: WorkflowTemplateRegistryTemplate, workflowId: string): Promise<{ packId: string; zipPath: string }> {
    return this.writeSingleWorkflowPack(workflow, workflowId)
  }

  async updateWorkflowZip(zipPath: string, workflow: WorkflowTemplateRegistryTemplate): Promise<void> {
    const workflowId = path.basename(zipPath, '.zip')
    const zipData = await this.buildSingleWorkflowPackZip(workflow, workflowId)
    await fs.mkdir(path.dirname(zipPath), { recursive: true })
    await fs.writeFile(zipPath, zipData)
  }

  async writeSingleWorkflowPack(workflow: WorkflowTemplateRegistryTemplate, workflowId = workflow.id): Promise<{ packId: string; zipPath: string }> {
    const zipData = await this.buildSingleWorkflowPackZip(workflow, workflowId)
    const zipPath = getWorkflowPackStoragePath(workflowPackFileName(workflowId))
    await fs.mkdir(path.dirname(zipPath), { recursive: true })
    await fs.writeFile(zipPath, zipData)
    return { packId: workflowId, zipPath }
  }

  async writeSingleWorkflowPacks(workflows: WorkflowTemplateRegistryTemplate[]): Promise<void> {
    await fs.mkdir(getWorkflowPackStorageDir(), { recursive: true })
    for (const workflow of workflows) {
      // This method writes the explicitly supplied workflows only. It must not
      // infer deletion from a partial or temporarily incomplete read of the
      // stored ZIP directory. Explicit deletion has its own operation.
      await this.writeSingleWorkflowPack(workflow, workflow.id)
    }
  }

  async deleteStoredWorkflowPack(workflowId: string): Promise<void> {
    if (!isNonEmptyString(workflowId)) {
      throw new Error('Workflow id is required to delete a stored workflow pack.')
    }
    const zipPath = getWorkflowPackStoragePath(workflowPackFileName(workflowId))
    await fs.rm(zipPath, { force: true })
  }

  /**
   * Reconcile the packaged default workflow ZIPs into the user's canonical
   * workflow store. The ZIP manifest is parsed by importWorkflowPackZip(), so
   * the workflow ID—not the bundled ZIP file name—is the replacement key.
   *
   * Every bundled workflow is authoritative for its own ID. A package update
   * therefore replaces the canonical <workflow-id>.zip, while ZIPs that only
   * contain other workflow IDs remain untouched in the user's packs directory.
   */
  async seedBundledWorkflowPacks(): Promise<void> {
    const storageDir = getWorkflowPackStorageDir()
    const existingSeed = bundledWorkflowPackSeedTasks.get(storageDir)
    if (existingSeed) return existingSeed

    const seedTask = (async () => {
      const bundledPacks = await this.listBundledPacks()
      const bundledWorkflowIds = new Set(bundledPacks.flatMap((pack) => pack.workflows.map((workflow) => workflow.id)))
      for (const pack of bundledPacks) {
        const sourceZip = new Uint8Array(await fs.readFile(pack.storage.path))
        await this.importWorkflowPackZip(sourceZip)
      }

      // The canonical ZIPs have now been written. Remove old renamed ZIPs only
      // when every workflow they contain is one of the shipped defaults: a ZIP
      // that also contains a user-defined workflow is intentionally preserved.
      for (const storedPack of await this.listStoredWorkflowPacks()) {
        const workflowIds = storedPack.workflows.map((workflow) => workflow.id)
        if (workflowIds.length === 0 || !workflowIds.every((id) => bundledWorkflowIds.has(id))) continue
        if (workflowIds.every((id) => isCanonicalStoredWorkflowPathForId(storedPack.storage.path, id))) continue
        await fs.rm(storedPack.storage.path, { force: true })
      }
    })()
    bundledWorkflowPackSeedTasks.set(storageDir, seedTask)

    try {
      await seedTask
    } catch (error) {
      bundledWorkflowPackSeedTasks.delete(storageDir)
      throw error
    }
  }

  private async buildSingleWorkflowPackZip(workflow: WorkflowTemplateRegistryTemplate, workflowId: string): Promise<Uint8Array> {
    const input = {
      packId: workflowId,
      name: workflow.name || workflowId,
      version: workflow.version || '1.0.0',
      description: workflow.description || '',
      workflows: [workflow],
    }

    try {
      return await this.exportWorkflowPackZip({
        ...input,
        selfContained: true,
      })
    } catch (error) {
      if (error instanceof WorkflowPackExportDependencyError && error.blockers.every((blocker) => blocker.kind === 'skill')) {
        return this.exportWorkflowPackZip({
          ...input,
          selfContained: false,
        })
      }
      throw error
    }
  }
}

function normalizePackManifest(value: unknown): PackManifest {
  if (!isRecord(value)) throw new Error('Pack manifest must be an object.')
  if (!isNonEmptyString(value.packId)) throw new Error('Pack manifest requires packId.')
  if (!isNonEmptyString(value.name)) throw new Error('Pack manifest requires name.')
  if (!isNonEmptyString(value.version)) throw new Error('Pack manifest requires version.')
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) throw new Error('Pack manifest schemaVersion must be 1 or 2.')
  if (value.type !== 'workflow-pack' && value.type !== 'resource-pack') {
    throw new Error('Pack manifest type must be workflow-pack or resource-pack.')
  }
  if (!isRecord(value.entrypoints)) throw new Error('Pack manifest requires entrypoints.')
  const workflows = normalizeEntrypoints(value.entrypoints.workflows)
  const experts = normalizeEntrypoints(value.entrypoints.experts)
  const skills = normalizeEntrypoints(value.entrypoints.skills)
  ;[...workflows, ...experts, ...skills].forEach(assertSafeZipPath)
  const dependencies = isRecord(value.dependencies)
    ? {
        ...value.dependencies,
        packagedSkills: Array.isArray(value.dependencies.packagedSkills)
          ? value.dependencies.packagedSkills.filter(isRecord) as WorkflowPackagedSkill[]
          : [],
        requiredHostTools: Array.isArray(value.dependencies.requiredHostTools)
          ? value.dependencies.requiredHostTools.filter(isRecord) as WorkflowPackHostTool[]
          : [],
        blockedExternalDependencies: Array.isArray(value.dependencies.blockedExternalDependencies)
          ? value.dependencies.blockedExternalDependencies
          : [],
      }
    : undefined

  return {
    ...value,
    packId: value.packId,
    name: value.name,
    version: value.version,
    schemaVersion: value.schemaVersion,
    type: value.type,
    description: isNonEmptyString(value.description) ? value.description : '',
    entrypoints: { workflows, experts, skills },
    permissions: Array.isArray(value.permissions) ? value.permissions : [],
    modelRequirements: isRecord(value.modelRequirements) ? value.modelRequirements : {},
    compatibility: isRecord(value.compatibility) ? value.compatibility : {},
    ...(dependencies ? { dependencies } : {}),
  }
}

function normalizeEntrypoints(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : []
}

function normalizePackIndex(value: unknown): PackRegistryIndex {
  if (!isRecord(value) || value.schemaVersion !== PACK_REGISTRY_SCHEMA_VERSION || !Array.isArray(value.packs)) {
    return { schemaVersion: PACK_REGISTRY_SCHEMA_VERSION, packs: [] }
  }
  return {
    schemaVersion: PACK_REGISTRY_SCHEMA_VERSION,
    packs: value.packs.filter(isRecord).flatMap((pack): PackIndexEntry[] => {
      try {
        const manifest = normalizePackManifest(pack.manifest)
        if (!isRecord(pack.storage) || pack.storage.kind !== 'zip' || !isNonEmptyString(pack.storage.path)) return []
        const workflows = Array.isArray(pack.workflows)
          ? pack.workflows.filter(isRecord).flatMap((workflow): PackWorkflowIndexEntry[] => {
              if (!isNonEmptyString(workflow.id) || !isNonEmptyString(workflow.entrypoint)) return []
              return [{
                id: workflow.id,
                name: isNonEmptyString(workflow.name) ? workflow.name : workflow.id,
                version: isNonEmptyString(workflow.version) ? workflow.version : '1',
                schemaVersion: workflow.schemaVersion === 2 ? 2 : 1,
                description: isNonEmptyString(workflow.description) ? workflow.description : '',
                entrypoint: workflow.entrypoint,
                packId: manifest.packId,
                packName: manifest.name,
                packVersion: manifest.version,
                phaseCount: typeof workflow.phaseCount === 'number' ? workflow.phaseCount : 0,
                phaseNames: Array.isArray(workflow.phaseNames) ? workflow.phaseNames.filter(isNonEmptyString) : [],
                ...(workflow.labels ? { labels: workflow.labels } : {}),
                ...(workflow.modelRequirements ? { modelRequirements: workflow.modelRequirements } : {}),
              }]
            })
          : []
        return [{
          packId: manifest.packId,
          name: manifest.name,
          version: manifest.version,
          type: manifest.type,
          description: manifest.description ?? '',
          manifest,
          storage: { kind: 'zip', path: pack.storage.path },
          workflows,
          importedAt: isNonEmptyString(pack.importedAt) ? pack.importedAt : new Date(0).toISOString(),
        }]
      } catch {
        return []
      }
    }),
  }
}

function indexWorkflow(
  manifest: PackManifest,
  entrypoint: string,
  workflow: WorkflowTemplateRegistryTemplate,
): PackWorkflowIndexEntry {
  return {
    id: workflow.id,
    name: workflow.name,
    version: workflow.version,
    schemaVersion: workflow.schemaVersion,
    description: workflow.description,
    entrypoint,
    packId: manifest.packId,
    packName: manifest.name,
    packVersion: manifest.version,
    phaseCount: workflow.phases.length,
    phaseNames: workflow.phases.map((phase) => phase.name),
    ...(workflow.labels ? { labels: workflow.labels } : {}),
    ...(workflow.modelRequirements ? { modelRequirements: workflow.modelRequirements } : {}),
  }
}

function extractLegacyTemplates(payload: unknown): unknown[] {
  if (isRecord(payload) && Array.isArray(payload.templates)) return payload.templates
  if (isRecord(payload) && isNonEmptyString(payload.id)) return [payload]
  return []
}

function safeFileSegment(value: string): string {
  return safePackFileSegment(value)
}

/**
 * Directories scanned for bundled (built-in) ZIP workflow packs at startup.
 * Order matters: first found wins for packId deduplication.
 * Missing directories are silently skipped.
 */
function bundledPackDirectories(): string[] {
  const dirs: string[] = []

  // Environment variable override
  const envDir = process.env.CLAUDE_PACKS_DIR
  if (envDir) dirs.push(envDir)

  // Sidecar-adjacent: exe-relative directories
  if (process.execPath) {
    const exeDir = path.dirname(process.execPath)
    pushUniqueDir(dirs, path.join(exeDir, 'packs'))
    pushUniqueDir(dirs, path.join(exeDir, 'binaries', 'packs'))
  }

  // Repo source fallback (development / non-packaged builds)
  const callerDirs = [
    process.env.CLAUDE_APP_ROOT,
    process.env.CALLER_DIR,
    process.cwd(),
  ]
  for (const base of callerDirs) {
    if (!base) continue
    pushUniqueDir(dirs, path.join(base, 'src', 'server', 'packs'))
    pushUniqueDir(dirs, path.join(base, '..', 'src', 'server', 'packs'))
    pushUniqueDir(dirs, path.join(base, 'desktop', 'src-tauri', 'binaries', 'packs'))
    pushUniqueDir(dirs, path.join(base, 'desktop', 'src-tauri', 'binaries', 'packs', 'workflows'))
    pushUniqueDir(dirs, path.join(base, '..', 'desktop', 'src-tauri', 'binaries', 'packs'))
    pushUniqueDir(dirs, path.join(base, '..', 'desktop', 'src-tauri', 'binaries', 'packs', 'workflows'))
  }

  return dirs
}

function pushUniqueDir(dirs: string[], candidate: string | null | undefined): void {
  if (!candidate) return
  const normalized = path.resolve(candidate)
  if (!dirs.includes(normalized)) {
    dirs.push(normalized)
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



