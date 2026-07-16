import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { getAppStoragePath } from '../../utils/appIdentity.js'
import { getProjectDirsUpToHome } from '../../utils/markdownConfigLoader.js'

import {
  WORKFLOW_TEMPLATE_SCHEMA_VERSION,
  isNonEmptyString,
  isRecord,
  validateAndNormalizeUserConfigTemplate,
  workflowTemplateValidationWarning,
  type WorkflowTemplateRegistryPhase,
  type WorkflowTemplateRegistryTemplate,
  type WorkflowTemplateValidationIssue,
} from './workflowTemplateValidation.js'
import { PackRegistryService } from './packRegistryService.js'
import {
  resolveWorkflowPhaseSkills,
  type WorkflowPhaseSkillCatalogEntry,
} from './workflowPhaseSkillResolver.js'
import type {
  WorkflowPhaseSkillSource,
} from './workflowTypes.js'

export type {
  WorkflowTemplateRegistryCompletionCriteria,
  WorkflowTemplateRegistryOutputArtifact,
  WorkflowTemplateRegistryPhase,
  WorkflowTemplateRegistryRequiredArtifact,
  WorkflowTemplateRegistrySkillDeclaration,
  WorkflowTemplateRegistryTemplate,
  WorkflowTemplateRegistryTransitionPolicy,
  WorkflowTemplateValidationIssue,
} from './workflowTemplateValidation.js'

export type WorkflowTemplateRegistryListResult = {
  templates: WorkflowTemplateRegistryTemplate[]
  invalidTemplates: WorkflowTemplateValidationIssue[]
}

type WorkflowConfigFile = {
  schemaVersion: 1
  templates?: unknown[]
  seededEditableDefaultTemplateIds?: string[]
  [key: string]: unknown
}

const USER_CONFIG_SCHEMA_VERSION = WORKFLOW_TEMPLATE_SCHEMA_VERSION
const TEMPLATE_VALIDATION_SUPPORTED_SKILL_SOURCES: WorkflowPhaseSkillSource[] = [
  'superpowers',
  'spec-kit-plus',
  'codex',
  'claude-code',
  'user',
  'project',
  'plugin',
  'managed',
  'bundled',
  'unknown',
]

function cloneTemplate(template: WorkflowTemplateRegistryTemplate): WorkflowTemplateRegistryTemplate {
  return JSON.parse(JSON.stringify(template)) as WorkflowTemplateRegistryTemplate
}

function editableDefaultTemplates(): WorkflowTemplateRegistryTemplate[] {
  // Runtime workflow source is now ZIP pack only (via PackRegistryService).
  // No builtin JSON templates are merged at runtime.
  return []
}

function editableDefaultTemplateIds(): string[] {
  return editableDefaultTemplates().map((template) => template.id)
}

function getConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function getWorkflowConfigPath(): string {
  return getAppStoragePath(getConfigDir(), 'workflows.json')
}

const BUNDLED_SKILLS_DIR_ENV = 'CLAUDE_BUNDLED_SKILLS_DIR'
const SKILLS_DIR_ENV = 'CLAUDE_SKILLS_DIR'
const PACK_SKILL_METADATA_FILE = '.cc-jiangxia-pack.json'

function pushUniquePath(candidates: string[], candidate: string | null | undefined): void {
  if (!candidate) return
  const normalized = path.resolve(candidate)
  if (!candidates.includes(normalized)) candidates.push(normalized)
}

function sidecarResourceBasePath(): string | null {
  if (!process.execPath) return null
  return path.dirname(process.execPath)
}

function pushRepoSkillRootCandidates(
  roots: Array<{ path: string; source: WorkflowPhaseSkillSource }>,
  seen: Set<string>,
  basePath: string | null | undefined,
): void {
  if (!basePath) return
  const baseCandidates: string[] = []
  pushUniquePath(baseCandidates, basePath)
  pushUniquePath(baseCandidates, path.join(basePath, '..'))
  pushUniquePath(baseCandidates, path.join(basePath, '..', '..'))
  pushUniquePath(baseCandidates, path.join(basePath, '..', '..', '..'))

  for (const base of baseCandidates) {
    pushSkillRoot(roots, seen, path.join(base, '.codex', 'skills'), 'managed')
    pushSkillRoot(roots, seen, path.join(base, '.agents', 'skills'), 'managed')
    pushSkillRoot(roots, seen, path.join(base, 'src', 'skills', 'bundled'), 'bundled')
  }
}

function pushPackagedSkillRootCandidates(
  roots: Array<{ path: string; source: WorkflowPhaseSkillSource }>,
  seen: Set<string>,
  basePath: string | null | undefined,
): void {
  if (!basePath) return
  pushSkillRoot(roots, seen, path.join(basePath, 'skills', 'bundled'), 'bundled')
  pushSkillRoot(roots, seen, path.join(basePath, 'binaries', 'skills', 'bundled'), 'bundled')
}

function pushSkillRoot(
  roots: Array<{ path: string; source: WorkflowPhaseSkillSource }>,
  seen: Set<string>,
  rootPath: string | null | undefined,
  source: WorkflowPhaseSkillSource,
): void {
  if (!rootPath) return
  const normalized = path.resolve(rootPath)
  const key = `${source}:${normalized}`
  if (seen.has(key)) return
  seen.add(key)
  roots.push({ path: normalized, source })
}

function templateSkillCatalogRoots(): Array<{ path: string; source: WorkflowPhaseSkillSource }> {
  const roots: Array<{ path: string; source: WorkflowPhaseSkillSource }> = []
  const seen = new Set<string>()

  pushSkillRoot(roots, seen, process.env[SKILLS_DIR_ENV], 'user')
  pushSkillRoot(roots, seen, process.env[BUNDLED_SKILLS_DIR_ENV], 'bundled')
  pushPackagedSkillRootCandidates(roots, seen, sidecarResourceBasePath())
  pushRepoSkillRootCandidates(roots, seen, process.env.CLAUDE_APP_ROOT)
  pushRepoSkillRootCandidates(roots, seen, process.env.CALLER_DIR)
  pushRepoSkillRootCandidates(roots, seen, process.cwd())
  pushSkillRoot(roots, seen, path.join(getConfigDir(), 'skills'), 'user')
  for (const skillsPath of getProjectDirsUpToHome('skills', process.cwd())) {
    pushSkillRoot(roots, seen, skillsPath, 'project')
  }

  return roots
}

function errnoCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

function parseUserConfig(raw: string, filePath: string): {
  config: WorkflowConfigFile | null
  issues: WorkflowTemplateValidationIssue[]
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return {
      config: null,
      issues: [
        {
          source: 'user-config',
          path: '$',
          code: 'WORKFLOW_CONFIG_MALFORMED',
          message: `Workflow config is malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error',
        },
      ],
    }
  }

  if (!isRecord(parsed)) {
    return {
      config: null,
      issues: [
        {
          source: 'user-config',
          path: '$',
          code: 'WORKFLOW_CONFIG_MALFORMED',
          message: `Workflow config at ${filePath} must be a JSON object.`,
          severity: 'error',
        },
      ],
    }
  }

  if (parsed.schemaVersion !== USER_CONFIG_SCHEMA_VERSION) {
    return {
      config: null,
      issues: [
        {
          source: 'user-config',
          path: '$.schemaVersion',
          code: 'WORKFLOW_CONFIG_MALFORMED',
          message: 'Workflow config schemaVersion must be 1.',
          severity: 'error',
        },
      ],
    }
  }

  if ('templates' in parsed && !Array.isArray(parsed.templates)) {
    return {
      config: null,
      issues: [
        {
          source: 'user-config',
          path: '$.templates',
          code: 'WORKFLOW_CONFIG_MALFORMED',
          message: 'Workflow config templates must be an array when present.',
          severity: 'error',
        },
      ],
    }
  }

  return {
    config: {
      ...parsed,
      schemaVersion: USER_CONFIG_SCHEMA_VERSION,
      templates: Array.isArray(parsed.templates) ? parsed.templates : [],
    },
    issues: [],
  }
}

async function readUserConfig(configPath: string): Promise<{
  config: WorkflowConfigFile | null
  issues: WorkflowTemplateValidationIssue[]
  missing: boolean
}> {
  let raw: string
  try {
    raw = await fs.readFile(configPath, 'utf-8')
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      return { config: null, issues: [], missing: true }
    }
    throw error
  }

  return { ...parseUserConfig(raw, configPath), missing: false }
}

function assertValidWritePayload(
  templates: unknown[],
  existingIssues: WorkflowTemplateValidationIssue[],
): void {
  if (existingIssues.length > 0) {
    throw new Error(`Workflow config is invalid and cannot be overwritten: ${existingIssues[0]?.code ?? 'WORKFLOW_CONFIG_INVALID'}`)
  }

  const validationResults = templates.map((template, index) =>
    validateAndNormalizeUserConfigTemplate(template, index),
  )
  const issues = validationResults.flatMap((result) => result.issues)
  const ids = new Map<string, number>()
  validationResults.forEach(({ template }) => {
    if (!template) return
    ids.set(template.id, (ids.get(template.id) ?? 0) + 1)
  })
  for (const [id, count] of ids) {
    if (count <= 1) continue
    issues.push({
      source: 'user-config',
      path: '$.templates',
      code: 'WORKFLOW_TEMPLATE_DUPLICATE_ID',
      message: 'User template ids must be unique.',
      templateId: id,
      severity: 'error',
    })
  }

  if (issues.length > 0) {
    throw new Error(`Workflow template payload is invalid: ${issues[0]?.code ?? 'WORKFLOW_TEMPLATE_INVALID'}`)
  }
}

function mergePhaseUnknownFields(
  nextPhase: unknown,
  existingPhase: unknown,
): unknown {
  if (!isRecord(nextPhase) || !isRecord(existingPhase)) return nextPhase
  const {
    runtimeState: _nextRuntimeState,
    ...nextPhaseWithoutRuntimeState
  } = nextPhase
  const {
    runtimeState: _existingRuntimeState,
    ...existingPhaseWithoutRuntimeState
  } = existingPhase

  const existingSkills = Array.isArray(existingPhaseWithoutRuntimeState.skills)
    ? existingPhaseWithoutRuntimeState.skills
    : []
  const nextSkills = Array.isArray(nextPhaseWithoutRuntimeState.skills)
    ? nextPhaseWithoutRuntimeState.skills.map((skill, skillIndex) => {
        const existingSkill = isRecord(skill) && isNonEmptyString(skill.name)
          ? existingSkills.find((candidate) => isRecord(candidate) && candidate.name === skill.name)
          : existingSkills[skillIndex]
        return isRecord(skill) && isRecord(existingSkill)
          ? { ...existingSkill, ...skill }
          : skill
      })
    : existingPhaseWithoutRuntimeState.skills

  const existingArtifacts = Array.isArray(existingPhaseWithoutRuntimeState.requiredArtifacts)
    ? existingPhaseWithoutRuntimeState.requiredArtifacts
    : []
  const nextArtifacts = Array.isArray(nextPhaseWithoutRuntimeState.requiredArtifacts)
    ? nextPhaseWithoutRuntimeState.requiredArtifacts.map((artifact, artifactIndex) => {
        const existingArtifact = isRecord(artifact) && isNonEmptyString(artifact.id)
          ? existingArtifacts.find((candidate) => isRecord(candidate) && candidate.id === artifact.id)
          : existingArtifacts[artifactIndex]
        return isRecord(artifact) && isRecord(existingArtifact)
          ? { ...existingArtifact, ...artifact }
          : artifact
      })
    : existingPhaseWithoutRuntimeState.requiredArtifacts

  return {
    ...existingPhaseWithoutRuntimeState,
    ...nextPhaseWithoutRuntimeState,
    ...(isRecord(existingPhaseWithoutRuntimeState.completionCriteria) && isRecord(nextPhaseWithoutRuntimeState.completionCriteria)
      ? { completionCriteria: { ...existingPhaseWithoutRuntimeState.completionCriteria, ...nextPhaseWithoutRuntimeState.completionCriteria } }
      : {}),
    ...(isRecord(existingPhaseWithoutRuntimeState.transition) && isRecord(nextPhaseWithoutRuntimeState.transition)
      ? { transition: { ...existingPhaseWithoutRuntimeState.transition, ...nextPhaseWithoutRuntimeState.transition } }
      : {}),
    skills: nextSkills,
    requiredArtifacts: nextArtifacts,
  }
}

function mergeTemplateUnknownFields(
  nextTemplate: unknown,
  existingTemplate: unknown,
): unknown {
  if (!isRecord(nextTemplate) || !isRecord(existingTemplate)) return nextTemplate

  const existingPhases = Array.isArray(existingTemplate.phases)
    ? existingTemplate.phases
    : []
  const nextPhases = Array.isArray(nextTemplate.phases)
    ? nextTemplate.phases.map((phase) => {
        if (!isRecord(phase) || !isNonEmptyString(phase.id)) return phase
        const existingPhase = existingPhases.find((candidate) =>
          isRecord(candidate) && candidate.id === phase.id
        )
        return mergePhaseUnknownFields(phase, existingPhase)
      })
    : nextTemplate.phases

  return {
    ...existingTemplate,
    ...nextTemplate,
    phases: nextPhases,
  }
}

function stripTemplateRuntimeState(template: unknown): unknown {
  if (!isRecord(template)) return template
  const phases = Array.isArray(template.phases)
    ? template.phases.map((phase) => {
        if (!isRecord(phase)) return phase
        const { runtimeState: _runtimeState, ...phaseWithoutRuntimeState } = phase
        return phaseWithoutRuntimeState
      })
    : template.phases

  return {
    ...template,
    phases,
  }
}

async function ensureEditableDefaultTemplates(
  config: WorkflowConfigFile | null,
): Promise<WorkflowConfigFile | null> {
  if (!config) return null

  const seededIds = Array.isArray(config.seededEditableDefaultTemplateIds)
    ? config.seededEditableDefaultTemplateIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  const editableDefaultIds = editableDefaultTemplateIds()
  const templates = Array.isArray(config.templates) ? config.templates : []
  const editableDefaults = editableDefaultTemplates()
  const editableDefaultById = new Map(editableDefaults.map((template) => [template.id, template]))
  const refreshedTemplates = templates.map((template) => {
    if (!isRecord(template) || !isNonEmptyString(template.id) || !seededIds.includes(template.id)) {
      return template
    }
    const defaultTemplate = editableDefaultById.get(template.id)
    if (!defaultTemplate) return template
    return stripTemplateRuntimeState({
      ...template,
      schemaVersion: defaultTemplate.schemaVersion,
      source: 'user',
      version: defaultTemplate.version,
      name: defaultTemplate.name,
      description: defaultTemplate.description,
      ...(defaultTemplate.labels ? { labels: defaultTemplate.labels } : {}),
      ...(defaultTemplate.routingPolicy ? { routingPolicy: defaultTemplate.routingPolicy } : {}),
      ...(defaultTemplate.stopConditions ? { stopConditions: defaultTemplate.stopConditions } : {}),
    })
  })

  const existingUserIds = new Set(
    refreshedTemplates
      .filter(isRecord)
      .map((template) => template.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )
  const defaultsToSeed = editableDefaults
    .filter((template) => !existingUserIds.has(template.id))

  const nextConfig: WorkflowConfigFile = {
    ...config,
    schemaVersion: USER_CONFIG_SCHEMA_VERSION,
    templates: [
      ...refreshedTemplates,
      ...defaultsToSeed.map(stripTemplateRuntimeState),
    ],
    seededEditableDefaultTemplateIds: Array.from(new Set([
      ...seededIds,
      ...editableDefaultIds,
    ])),
  }

  return nextConfig
}

let cachedRegistry: WorkflowTemplateRegistryListResult | null = null
let cachedConfigPath: string | null = null

export function resetWorkflowTemplateRegistryForTests(): void {
  cachedRegistry = null
  cachedConfigPath = null
}

export class WorkflowTemplateRegistryService {
  async listTemplates(): Promise<WorkflowTemplateRegistryListResult> {
    const configPath = getWorkflowConfigPath()
    if (cachedRegistry && cachedConfigPath === configPath) {
      return {
        templates: cachedRegistry.templates.map(cloneTemplate),
        invalidTemplates: cachedRegistry.invalidTemplates.map((templateIssue) => ({ ...templateIssue })),
      }
    }

    const result = await this.loadTemplates(configPath)
    cachedRegistry = {
      templates: result.templates.map(cloneTemplate),
      invalidTemplates: result.invalidTemplates.map((templateIssue) => ({ ...templateIssue })),
    }
    cachedConfigPath = configPath

    return result
  }

  async deleteStoredWorkflowPack(workflowId: string): Promise<void> {
    await new PackRegistryService().deleteStoredWorkflowPack(workflowId)
    resetWorkflowTemplateRegistryForTests()
  }

  async writeTemplates(templates: unknown[]): Promise<void> {
    assertValidWritePayload(templates, [])

    const packRegistry = new PackRegistryService()
    await migrateLegacyWorkflowConfigToPacks(getWorkflowConfigPath(), packRegistry).catch(() => [])
    const existingTemplates = await packRegistry.listWorkflows().catch(() => [])
    const existingById = new Map(existingTemplates
      .filter((template) => template.source === 'user' || template.editable !== false)
      .map((template) => [template.id, template]))

    const nextTemplates = templates.map((template) => {
      if (!isRecord(template) || !isNonEmptyString(template.id)) return template
      const existingTemplate = existingById.get(template.id)
      return stripTemplateRuntimeState(mergeTemplateUnknownFields(template, existingTemplate))
    })

    const validationResults = nextTemplates.map((template, index) =>
      validateAndNormalizeUserConfigTemplate(template, index),
    )
    const normalizedTemplates = validationResults.flatMap((result) => result.template ? [result.template] : [])

    await packRegistry.writeSingleWorkflowPacks(normalizedTemplates)

    resetWorkflowTemplateRegistryForTests()
  }

  private async loadTemplates(configPath: string): Promise<WorkflowTemplateRegistryListResult> {
    const templates: WorkflowTemplateRegistryTemplate[] = []
    const invalidTemplates: WorkflowTemplateValidationIssue[] = []

    // ZIP-only workflow source: workflows are read from ZIP packs. A legacy
    // workflows.json, when present, is treated only as an import/migration
    // source into the fixed one-workflow-per-ZIP store.
    try {
      const packRegistry = new PackRegistryService()
      invalidTemplates.push(...await migrateLegacyWorkflowConfigToPacks(configPath, packRegistry))
      await packRegistry.seedBundledWorkflowPacks()
      const packWorkflows = await packRegistry.listWorkflows()
      templates.push(...packWorkflows)
    } catch (error) {
      invalidTemplates.push({
        source: 'pack-registry',
        path: '$.packs',
        code: 'WORKFLOW_PACK_REGISTRY_UNAVAILABLE',
        message: `Workflow pack registry could not be loaded: ${errorMessage(error)}`,
        severity: 'warning',
      })
    }

    return { templates, invalidTemplates }
  }
}

async function migrateLegacyWorkflowConfigToPacks(
  configPath: string,
  packRegistry: PackRegistryService,
): Promise<WorkflowTemplateValidationIssue[]> {
  const invalidTemplates: WorkflowTemplateValidationIssue[] = []
  const { config, issues, missing } = await readUserConfig(configPath)
  if (missing) return invalidTemplates
  invalidTemplates.push(...issues)
  if (!config) return invalidTemplates

  const migrationMarkerPath = path.join(path.dirname(configPath), 'workflows', 'packs', '.legacy-workflows-json-migrated')
  try {
    await fs.access(migrationMarkerPath)
    return invalidTemplates
  } catch {
    // no marker: legacy workflows.json has not been imported into ZIP storage yet
  }

  const seededEditableDefaultIds = new Set(
    Array.isArray(config.seededEditableDefaultTemplateIds)
      ? config.seededEditableDefaultTemplateIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [],
  )
  const migrationConfig = config
  const storedPacks = await packRegistry.listStoredWorkflowPacks()
  const storedWorkflowIds = new Set(storedPacks.flatMap((pack) =>
    pack.workflows.map((workflow) => workflow.id),
  ))
  const byId = new Map<string, WorkflowTemplateRegistryTemplate[]>()
  const validationResults = migrationConfig.templates?.map((template, index) =>
    validateAndNormalizeUserConfigTemplate(template, index),
  ) ?? []

  for (const [index, { template, issues: templateIssues }] of validationResults.entries()) {
    invalidTemplates.push(...templateIssues)
    if (!template || templateIssues.some((issue) => issue.severity === 'error')) continue
    if (seededEditableDefaultIds.has(template.id)) continue
    const skillIssues = await resolveTemplatePhaseSkillIssues(template, index)
    invalidTemplates.push(...skillIssues)
    if (skillIssues.some((issue) => issue.severity === 'error')) continue
    const existing = byId.get(template.id) ?? []
    existing.push(template)
    byId.set(template.id, existing)
  }

  const duplicateIds = new Set<string>()
  for (const [id, matchingTemplates] of byId) {
    if (matchingTemplates.length <= 1) continue
    duplicateIds.add(id)
    invalidTemplates.push({
      source: 'user-config',
      path: '$.templates',
      code: 'WORKFLOW_TEMPLATE_DUPLICATE_ID',
      message: 'User template ids must be unique.',
      templateId: id,
      severity: 'error',
    })
  }

  for (const [id, matchingTemplates] of byId) {
    if (matchingTemplates.length !== 1 || duplicateIds.has(id) || storedWorkflowIds.has(id)) continue
    await packRegistry.writeSingleWorkflowPack(stripTemplateRuntimeState(matchingTemplates[0]) as WorkflowTemplateRegistryTemplate, id)
  }

  if (!invalidTemplates.some((issue) => issue.severity === 'error')) {
    await fs.mkdir(path.dirname(migrationMarkerPath), { recursive: true })
    await fs.writeFile(migrationMarkerPath, `${new Date().toISOString()}\n`, 'utf-8')
  }

  return invalidTemplates
}

async function resolveTemplatePhaseSkillIssues(
  template: WorkflowTemplateRegistryTemplate,
  templateIndex: number,
): Promise<WorkflowTemplateValidationIssue[]> {
  const issues: WorkflowTemplateValidationIssue[] = []
  const catalog = await collectTemplateSkillCatalog()

  for (const [phaseIndex, phase] of template.phases.entries()) {
    if (phase.skills.length === 0) continue

    const result = await resolveWorkflowPhaseSkills({
      templateId: template.id,
      phaseId: phase.id,
      references: phase.skills,
      catalog,
      supportedSources: TEMPLATE_VALIDATION_SUPPORTED_SKILL_SOURCES,
    })

    result.resolutions.forEach((resolution, skillIndex) => {
      const diagnostic = resolution.diagnostic
      if (!diagnostic || diagnostic.severity === 'info') return
      issues.push(workflowTemplateValidationWarning(
        'user-config',
        `$.templates[${templateIndex}].phases[${phaseIndex}].skills[${skillIndex}]`,
        diagnostic.code,
        diagnostic.message,
        template.id,
      ))
    })
  }

  return issues
}

export async function collectTemplateSkillCatalog(): Promise<WorkflowPhaseSkillCatalogEntry[]> {
  const catalog: WorkflowPhaseSkillCatalogEntry[] = []
  const seen = new Set<string>()
  const roots: Array<{ path: string; source: WorkflowPhaseSkillSource }> = [
    ...templateSkillCatalogRoots(),
    ...(await superpowersSkillRoots()),
  ]

  for (const root of roots) {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(root.path, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name.startsWith('.')) {
        continue
      }
      const skillFile = path.join(root.path, entry.name, 'SKILL.md')
      try {
        const stat = await fs.stat(skillFile)
        if (!stat.isFile()) continue
      } catch {
        continue
      }

      const skillText = await fs.readFile(skillFile, 'utf-8').catch(() => '')
      const frontmatter = parseSkillFrontmatter(skillText)
      const metadata = await readInstalledPackSkillMetadata(path.join(root.path, entry.name))
      const aliases = collectSkillCatalogAliases(entry.name, root.source, frontmatter, metadata)
      for (const alias of aliases) {
        const key = `${root.source}:${metadata?.packId ?? ''}:${alias.name}:${alias.referenceId ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        catalog.push({
          name: alias.name,
          displayName: alias.displayName ?? (root.source === 'superpowers' ? `Superpowers ${entry.name}` : frontmatter.displayName),
          source: root.source,
          pluginName: root.source === 'superpowers' ? 'superpowers' : undefined,
          namespace: alias.namespace ?? (root.source === 'superpowers' ? 'superpowers' : undefined),
          referenceId: alias.referenceId,
          sourcePath: skillFile,
          packId: metadata?.packId,
          packSkillIdentity: metadata?.originalSkillId,
          aliases: metadata?.aliases,
        })
      }
    }
  }

  // Add pack-private skills from PackRegistryService (source='managed', installable=false)
  try {
    const packEntries = await new PackRegistryService().listPackSkillCatalogEntries()
    for (const entry of packEntries) {
      const key = `${entry.source}:${entry.packId ?? ''}:${entry.name}:${entry.referenceId ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      catalog.push(entry)
    }
  } catch {
    // Pack registry unavailable - pack-private skills may not resolve
  }

  return catalog
}


type SkillCatalogAlias = {
  name: string
  referenceId?: string
  namespace?: string
  displayName?: string
}

type InstalledPackSkillMetadata = {
  packId?: string
  originalSkillId?: string
  aliases: string[]
  referenceMappings: Array<{ reference?: string; name?: string; namespace?: string; referenceId?: string }>
}

type SkillFrontmatter = {
  name?: string
  displayName?: string
  referenceId?: string
}

function collectSkillCatalogAliases(
  directoryName: string,
  source: WorkflowPhaseSkillSource,
  frontmatter: SkillFrontmatter,
  metadata: InstalledPackSkillMetadata | null,
): SkillCatalogAlias[] {
  const aliases = new Map<string, SkillCatalogAlias>()
  const add = (name: string | undefined, referenceId?: string, namespace?: string, displayName?: string): void => {
    if (!isNonEmptyString(name)) return
    const inferredNamespace = namespace ?? namespaceFromReference(referenceId ?? name)
    const key = `${name}\0${referenceId ?? ''}\0${inferredNamespace ?? ''}`
    if (aliases.has(key)) return
    aliases.set(key, {
      name,
      ...(referenceId ? { referenceId } : {}),
      ...(inferredNamespace ? { namespace: inferredNamespace } : {}),
      ...(displayName ? { displayName } : {}),
    })
  }

  if (source === 'superpowers') {
    add(`superpowers:${directoryName}`, `superpowers:${directoryName}`, 'superpowers')
    add(directoryName, `superpowers:${directoryName}`, 'superpowers')
  } else {
    add(directoryName, frontmatter.referenceId, namespaceFromReference(frontmatter.referenceId))
  }

  if (isNonEmptyString(frontmatter.referenceId)) add(frontmatter.referenceId, frontmatter.referenceId, namespaceFromReference(frontmatter.referenceId))
  if (isNonEmptyString(frontmatter.name) && frontmatter.name.includes(':')) add(frontmatter.name, frontmatter.referenceId ?? frontmatter.name, namespaceFromReference(frontmatter.name))

  if (metadata) {
    if (isNonEmptyString(metadata.originalSkillId)) add(metadata.originalSkillId, metadata.originalSkillId, namespaceFromReference(metadata.originalSkillId))
    for (const alias of metadata.aliases) add(alias, alias.includes(':') ? alias : undefined, namespaceFromReference(alias))
    for (const mapping of metadata.referenceMappings) {
      add(mapping.reference, mapping.referenceId ?? (mapping.reference?.includes(':') ? mapping.reference : undefined), mapping.namespace)
      add(mapping.name, mapping.referenceId, mapping.namespace)
      add(mapping.referenceId, mapping.referenceId, mapping.namespace)
    }
  }

  return Array.from(aliases.values())
}

function namespaceFromReference(value: string | undefined): string | undefined {
  if (!isNonEmptyString(value) || !value.includes(':')) return undefined
  return value.split(':', 1)[0]
}

async function readInstalledPackSkillMetadata(skillDir: string): Promise<InstalledPackSkillMetadata | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(skillDir, PACK_SKILL_METADATA_FILE), 'utf-8'))
    if (!isRecord(parsed)) return null
    return {
      packId: isNonEmptyString(parsed.packId) ? parsed.packId : undefined,
      originalSkillId: isNonEmptyString(parsed.originalSkillId) ? parsed.originalSkillId : undefined,
      aliases: Array.isArray(parsed.aliases) ? parsed.aliases.filter(isNonEmptyString) : [],
      referenceMappings: parsePackReferenceMappings(parsed.referenceMappings),
    }
  } catch {
    return null
  }
}

function parsePackReferenceMappings(value: unknown): InstalledPackSkillMetadata['referenceMappings'] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((item) => ({
    ...(isNonEmptyString(item.reference) ? { reference: item.reference } : {}),
    ...(isNonEmptyString(item.name) ? { name: item.name } : {}),
    ...(isNonEmptyString(item.namespace) ? { namespace: item.namespace } : {}),
    ...(isNonEmptyString(item.referenceId) ? { referenceId: item.referenceId } : {}),
  }))
}

function parseSkillFrontmatter(text: string): SkillFrontmatter {
  if (!text.startsWith('---')) return {}
  const end = text.indexOf('\n---', 3)
  if (end < 0) return {}
  const block = text.slice(3, end)
  const result: SkillFrontmatter = {}
  for (const line of block.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.+?)\s*$/.exec(line)
    if (!match) continue
    const key = match[1]
    const value = match[2].replace(/^['"]|['"]$/g, '')
    if (key === 'name' && isNonEmptyString(value)) result.name = value
    if (key === 'displayName' && isNonEmptyString(value)) result.displayName = value
    if ((key === 'referenceId' || key === 'reference-id') && isNonEmptyString(value)) result.referenceId = value
  }
  return result
}

async function superpowersSkillRoots(): Promise<Array<{ path: string; source: WorkflowPhaseSkillSource }>> {
  const homes = Array.from(new Set([
    getConfigDir(),
    path.join(os.homedir(), '.claude'),
    path.join(os.homedir(), '.codex'),
  ]))
  const bases = homes.flatMap((home) => [
    path.join(home, 'plugins', 'cache', 'openai-curated-remote', 'superpowers'),
    path.join(home, 'plugins', 'cache', 'openai-curated', 'superpowers'),
    path.join(home, 'plugins', 'cache', 'superpowers'),
  ])
  const roots: Array<{ path: string; source: WorkflowPhaseSkillSource }> = []
  const seen = new Set<string>()

  for (const tmpSkills of homes.map((home) => path.join(home, '.tmp', 'plugins', 'plugins', 'superpowers', 'skills'))) {
    if (await isDirectory(tmpSkills) && !seen.has(tmpSkills)) {
      seen.add(tmpSkills)
      roots.push({ path: tmpSkills, source: 'superpowers' })
    }
  }

  for (const base of bases) {
    const direct = path.join(base, 'skills')
    if (await isDirectory(direct)) {
      if (!seen.has(direct)) {
        seen.add(direct)
        roots.push({ path: direct, source: 'superpowers' })
      }
      continue
    }

    let versions: import('node:fs').Dirent[]
    try {
      versions = await fs.readdir(base, { withFileTypes: true })
    } catch {
      continue
    }
    for (const version of versions) {
      if ((!version.isDirectory() && !version.isSymbolicLink()) || version.name.startsWith('.')) {
        continue
      }
      const versionedSkills = path.join(base, version.name, 'skills')
      if (!await isDirectory(versionedSkills) || seen.has(versionedSkills)) continue
      seen.add(versionedSkills)
      roots.push({ path: versionedSkills, source: 'superpowers' })
    }
  }

  return roots
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory()
  } catch {
    return false
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
