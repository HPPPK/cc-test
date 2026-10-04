import { createHash, randomUUID } from 'node:crypto'
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
import {
  PackRegistryService,
  getWorkflowPackStorageDir,
} from './packRegistryService.js'
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

export type WorkflowTemplateBundledUpdate = {
  kind: 'version' | 'content'
  localVersion: string
  bundledVersion: string
  localSha256: string
  bundledSha256: string
}

export type WorkflowTemplateBundledUpdateResult = {
  backupFilename: string
  previousVersion: string
  installedVersion: string
  installedSha256: string
}

export class WorkflowTemplateBundledUpdateError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 404 | 409 = 409,
  ) {
    super(message)
  }
}

type WorkflowConfigFile = {
  schemaVersion: 1
  templates?: unknown[]
  seededEditableDefaultTemplateIds?: string[]
  [key: string]: unknown
}

type ManagedBundledWorkflowPackState = {
  schemaVersion: 1
  packs: Record<string, {
    installedVersion: string
    installedSha256: string
    bundledSha256: string
  }>
}

type ManagedBundledWorkflowPack = {
  workflowId: string
  version: string
  data: Uint8Array
  sha256: string
}

type ManagedBundledWorkflowReconciliation = {
  updates: Map<string, WorkflowTemplateBundledUpdate>
  protectedLocalPacks: Map<string, { data: Uint8Array; sha256: string }>
}

const USER_CONFIG_SCHEMA_VERSION = WORKFLOW_TEMPLATE_SCHEMA_VERSION
const MANAGED_BUNDLED_WORKFLOW_PACKS_FILE = 'managed-bundled-workflow-packs.json'
const MANAGED_BUNDLED_WORKFLOW_IDS = new Set([
  'efficient-constrained-dev-debug-workflow-v5',
  'feature-extension-workflow-v8',
  'debug-repair-workflow-v8',
])
const KNOWN_PREVIOUS_OFFICIAL_WORKFLOW_PACK_SHA256 = new Map<string, ReadonlySet<string>>([
  ['efficient-constrained-dev-debug-workflow-v5', new Set([
    '5aee81e834a5a97f6d7bce9ccfe50dd10744342e20568917b305d3abd36eebe6',
    'a9d79c1ef8ab146af8fd841acd005f403bedf7be883e61cdb3461c50e3353a08',
    'be16b990f40f67ff19a07c54bf7ae1bc55af400eb36e881e3a97c5570e470830',
    '4ebf5430a08a95682ac83f639b3c12570914c5f484cee176825fd7e7bb0546b7',
    '8094aa865a9044d9a422decb2393c00f97583835a149456c97b4ba1d3deb47fa',
    'c13c7fd9d66a644fe1a57042e13259de0da212134c6acaca7a8966c0c3599e35',
    'f5eab29bd11cc5bd60fd5bbfaf2c7bcade910419d143b30d38fcbaf5f8a8e49d',
  ])],
  ['feature-extension-workflow-v8', new Set([
    'ee9e6642fdf3af446b840ecf50397ac0175508e167f0c2381c02db56c12db117',
    '6752acd0bf576a8177ec62c0104b6871bc7b779059e31ad2d10c48f58dc6fa1c',
    'c5e3f017ba30167a9425d1d1ca334b802ccce28b7f115bc9bbd6f0587d8957eb',
    '025cb1d20f927c81485f0c3a4e69c849bcc0cc6f64388f26c21981f12dda51a4',
    'd8cb9dacaa96959cd92803d8084d60b926417cb9fde1233a95cafc5f5ba92cef',
    '110235422d8b2d715a7d0c555dd024d216008ba83aa45d5b60393868adfb4fcb',
  ])],
  ['debug-repair-workflow-v8', new Set([
    '10f90783a1df9b7cea7c6d153c42fd0edde080314fc026c69e794f802e4e641c',
    'a5b11ff2204e2d9a13a5ecf190c7b5f115d105025e35e2df4c101c4aaf1c5c97',
    '2ef5f11e9e0ac94633bde8b947b16480385cc08addd188665432207847cae8f2',
    'eed56c8e5fa4bcc987ca031e3d5b5df5916da0faa342bbd8e9722d2882fcb132',
    '9a4ab7a63b162aa67a6540d23a302df0e1cfd09b063d1a9d531dc32bbededaa5',
    'dd887d61bff653781fdcd21bebdb4d19d97f402929eaeebbf44eeb9bc4ec83e7',
    '2b5a834855f42d8e54ab7dea40350b03638ebb4cbf3bd838bb5ffc9f44cb76b1',
  ])],
])
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

function getManagedBundledWorkflowPacksPath(): string {
  return getAppStoragePath(getConfigDir(), 'workflows', MANAGED_BUNDLED_WORKFLOW_PACKS_FILE)
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

  async applyBundledWorkflowUpdate(workflowId: string): Promise<WorkflowTemplateBundledUpdateResult> {
    assertManagedBundledWorkflowId(workflowId)
    const packRegistry = new PackRegistryService()
    const bundled = await findManagedBundledWorkflowPack(packRegistry, workflowId)
    if (!bundled) {
      throw new WorkflowTemplateBundledUpdateError(
        'WORKFLOW_BUNDLED_UPDATE_NOT_FOUND',
        `No bundled update is available for workflow: ${workflowId}`,
        404,
      )
    }

    const localPath = managedWorkflowPackPath(workflowId)
    let localData: Uint8Array
    try {
      localData = new Uint8Array(await fs.readFile(localPath))
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') {
        throw new WorkflowTemplateBundledUpdateError(
          'WORKFLOW_BUNDLED_UPDATE_LOCAL_NOT_FOUND',
          `A local workflow ZIP was not found for: ${workflowId}`,
          404,
        )
      }
      throw error
    }

    const localSha256 = sha256Bytes(localData)
    if (localSha256 === bundled.sha256) {
      throw new WorkflowTemplateBundledUpdateError(
        'WORKFLOW_BUNDLED_UPDATE_NOT_AVAILABLE',
        `The local workflow ZIP already matches the bundled workflow: ${workflowId}`,
      )
    }

    const localTemplate = await packRegistry.loadStoredWorkflowTemplate(workflowId).catch(() => null)
    if (!localTemplate) {
      throw new WorkflowTemplateBundledUpdateError(
        'WORKFLOW_BUNDLED_UPDATE_LOCAL_INVALID',
        `The local workflow ZIP cannot be read safely: ${workflowId}`,
      )
    }
    if (compareWorkflowVersions(bundled.version, localTemplate.version) < 0) {
      throw new WorkflowTemplateBundledUpdateError(
        'WORKFLOW_BUNDLED_UPDATE_WOULD_DOWNGRADE',
        `The bundled workflow is older than the local workflow: ${workflowId}`,
      )
    }

    const backupFilename = await backupManagedWorkflowPack(workflowId, localData, localTemplate.version)
    let previousState: ManagedBundledWorkflowPackState | null = null
    let installedSha256 = ''
    try {
      await replaceManagedWorkflowPack(localPath, bundled.data, bundled.sha256)
      installedSha256 = sha256Bytes(new Uint8Array(await fs.readFile(localPath)))
      if (installedSha256 !== bundled.sha256) {
        throw new Error(`Installed workflow ZIP failed SHA-256 verification: ${workflowId}`)
      }

      previousState = await readManagedBundledWorkflowPackState()
      const nextState = cloneManagedBundledWorkflowPackState(previousState)
      nextState.packs[workflowId] = {
        installedVersion: bundled.version,
        installedSha256,
        bundledSha256: bundled.sha256,
      }
      await writeManagedBundledWorkflowPackState(nextState)
    } catch (error) {
      try {
        await replaceManagedWorkflowPack(localPath, localData, localSha256)
        if (previousState) await writeManagedBundledWorkflowPackState(previousState)
      } catch (rollbackError) {
        throw new WorkflowTemplateBundledUpdateError(
          'WORKFLOW_BUNDLED_UPDATE_ROLLBACK_FAILED',
          `Workflow update failed and rollback also failed: ${errorMessage(error)}; rollback: ${errorMessage(rollbackError)}`,
        )
      }
      throw new WorkflowTemplateBundledUpdateError(
        'WORKFLOW_BUNDLED_UPDATE_FAILED',
        `Workflow update failed and the previous ZIP was restored: ${errorMessage(error)}`,
      )
    }
    resetWorkflowTemplateRegistryForTests()

    return {
      backupFilename,
      previousVersion: localTemplate.version,
      installedVersion: bundled.version,
      installedSha256,
    }
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
      let reconciliation: ManagedBundledWorkflowReconciliation = {
        updates: new Map(),
        protectedLocalPacks: new Map(),
      }
      try {
        reconciliation = await reconcileManagedBundledWorkflowPacks(packRegistry)
      } catch (error) {
        invalidTemplates.push({
          source: 'pack-registry',
          path: '$.packs.bundledUpdate',
          code: 'WORKFLOW_BUNDLED_UPDATE_RECONCILE_FAILED',
          message: `Bundled workflow updates could not be reconciled: ${errorMessage(error)}`,
          severity: 'warning',
        })
      }
      await packRegistry.seedBundledWorkflowPacks()
      await restoreProtectedManagedWorkflowPacks(reconciliation.protectedLocalPacks)
      const packWorkflows = await packRegistry.listWorkflows()
      templates.push(...packWorkflows.map((template) => {
        const bundledUpdate = reconciliation.updates.get(template.id)
        return bundledUpdate ? { ...template, bundledUpdate } : template
      }))
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

async function reconcileManagedBundledWorkflowPacks(
  packRegistry: PackRegistryService,
): Promise<ManagedBundledWorkflowReconciliation> {
  const updates = new Map<string, WorkflowTemplateBundledUpdate>()
  const protectedLocalPacks = new Map<string, { data: Uint8Array; sha256: string }>()
  const state = await readManagedBundledWorkflowPackState()
  const bundledPacks = await listManagedBundledWorkflowPacks(packRegistry)
  const bundledById = new Map(bundledPacks.map((pack) => [pack.workflowId, pack]))
  const storedPacks = await packRegistry.listStoredWorkflowPacks()
  const storedVersionById = new Map(storedPacks.flatMap((pack) =>
    pack.workflows.map((workflow) => [workflow.id, workflow.version] as const),
  ))
  let stateChanged = false

  for (const workflowId of MANAGED_BUNDLED_WORKFLOW_IDS) {
    const bundled = bundledById.get(workflowId)
    if (!bundled) continue
    const localPath = managedWorkflowPackPath(workflowId)
    const localData = await readBytesIfExists(localPath)

    if (!localData) {
      await replaceManagedWorkflowPack(localPath, bundled.data, bundled.sha256)
      state.packs[workflowId] = managedStateEntry(bundled)
      stateChanged = true
      continue
    }

    const localSha256 = sha256Bytes(localData)
    if (localSha256 === bundled.sha256) {
      if (!managedStateMatches(state.packs[workflowId], bundled)) {
        state.packs[workflowId] = managedStateEntry(bundled)
        stateChanged = true
      }
      continue
    }

    const localVersion = storedVersionById.get(workflowId)
      ?? (await packRegistry.loadStoredWorkflowTemplate(workflowId).catch(() => null))?.version

    const tracked = state.packs[workflowId]
    const trackedOfficial = Boolean(tracked) && (
      localSha256 === tracked.installedSha256 ||
      localSha256 === tracked.bundledSha256
    )
    const knownOfficialSha = KNOWN_PREVIOUS_OFFICIAL_WORKFLOW_PACK_SHA256.get(workflowId)?.has(localSha256) ?? false

    if ((trackedOfficial || knownOfficialSha) && localVersion && compareWorkflowVersions(bundled.version, localVersion) >= 0) {
      await replaceManagedWorkflowPack(localPath, bundled.data, bundled.sha256)
      state.packs[workflowId] = managedStateEntry(bundled)
      stateChanged = true
      continue
    }

    protectedLocalPacks.set(workflowId, { data: localData, sha256: localSha256 })
    if (!localVersion || compareWorkflowVersions(bundled.version, localVersion) < 0) continue
    updates.set(workflowId, {
      kind: compareWorkflowVersions(bundled.version, localVersion) > 0 ? 'version' : 'content',
      localVersion,
      bundledVersion: bundled.version,
      localSha256,
      bundledSha256: bundled.sha256,
    })
  }

  if (stateChanged) await writeManagedBundledWorkflowPackState(state)
  return { updates, protectedLocalPacks }
}

async function restoreProtectedManagedWorkflowPacks(
  protectedLocalPacks: Map<string, { data: Uint8Array; sha256: string }>,
): Promise<void> {
  for (const [workflowId, protectedPack] of protectedLocalPacks) {
    const localPath = managedWorkflowPackPath(workflowId)
    const current = await readBytesIfExists(localPath)
    if (current && sha256Bytes(current) === protectedPack.sha256) continue
    await replaceManagedWorkflowPack(localPath, protectedPack.data, protectedPack.sha256)
  }
}

async function listManagedBundledWorkflowPacks(
  packRegistry: PackRegistryService,
): Promise<ManagedBundledWorkflowPack[]> {
  const result: ManagedBundledWorkflowPack[] = []
  const seen = new Set<string>()
  for (const pack of await packRegistry.listBundledPacks()) {
    const workflow = pack.workflows.find((candidate) => MANAGED_BUNDLED_WORKFLOW_IDS.has(candidate.id))
    if (!workflow || seen.has(workflow.id)) continue
    if (pack.workflows.length !== 1) continue
    const data = new Uint8Array(await fs.readFile(pack.storage.path))
    result.push({
      workflowId: workflow.id,
      version: workflow.version,
      data,
      sha256: sha256Bytes(data),
    })
    seen.add(workflow.id)
  }
  return result
}

async function findManagedBundledWorkflowPack(
  packRegistry: PackRegistryService,
  workflowId: string,
): Promise<ManagedBundledWorkflowPack | undefined> {
  return (await listManagedBundledWorkflowPacks(packRegistry))
    .find((pack) => pack.workflowId === workflowId)
}

function assertManagedBundledWorkflowId(workflowId: string): void {
  if (MANAGED_BUNDLED_WORKFLOW_IDS.has(workflowId)) return
  throw new WorkflowTemplateBundledUpdateError(
    'WORKFLOW_BUNDLED_UPDATE_NOT_MANAGED',
    `Managed workflow bundled updates are unavailable for: ${workflowId}`,
    404,
  )
}

function managedWorkflowPackPath(workflowId: string): string {
  return path.join(getWorkflowPackStorageDir(), `${workflowId}.zip`)
}

function managedStateEntry(pack: ManagedBundledWorkflowPack): ManagedBundledWorkflowPackState['packs'][string] {
  return {
    installedVersion: pack.version,
    installedSha256: pack.sha256,
    bundledSha256: pack.sha256,
  }
}

function cloneManagedBundledWorkflowPackState(
  state: ManagedBundledWorkflowPackState,
): ManagedBundledWorkflowPackState {
  return JSON.parse(JSON.stringify(state)) as ManagedBundledWorkflowPackState
}

function managedStateMatches(
  entry: ManagedBundledWorkflowPackState['packs'][string] | undefined,
  pack: ManagedBundledWorkflowPack,
): boolean {
  return entry?.installedVersion === pack.version &&
    entry.installedSha256 === pack.sha256 &&
    entry.bundledSha256 === pack.sha256
}

async function readManagedBundledWorkflowPackState(): Promise<ManagedBundledWorkflowPackState> {
  try {
    const parsed = JSON.parse(await fs.readFile(getManagedBundledWorkflowPacksPath(), 'utf-8')) as unknown
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRecord(parsed.packs)) {
      return { schemaVersion: 1, packs: {} }
    }
    const packs: ManagedBundledWorkflowPackState['packs'] = {}
    for (const [workflowId, raw] of Object.entries(parsed.packs)) {
      if (!MANAGED_BUNDLED_WORKFLOW_IDS.has(workflowId) || !isRecord(raw)) continue
      if (!isNonEmptyString(raw.installedVersion) || !isSha256(raw.installedSha256) || !isSha256(raw.bundledSha256)) continue
      packs[workflowId] = {
        installedVersion: raw.installedVersion,
        installedSha256: raw.installedSha256,
        bundledSha256: raw.bundledSha256,
      }
    }
    return { schemaVersion: 1, packs }
  } catch (error) {
    if (errnoCode(error) === 'ENOENT' || error instanceof SyntaxError) {
      return { schemaVersion: 1, packs: {} }
    }
    throw error
  }
}

async function writeManagedBundledWorkflowPackState(state: ManagedBundledWorkflowPackState): Promise<void> {
  const statePath = getManagedBundledWorkflowPacksPath()
  const temporaryPath = `${statePath}.${randomUUID()}.tmp`
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
    try {
      await fs.rename(temporaryPath, statePath)
    } catch (error) {
      if (errnoCode(error) !== 'EEXIST' && errnoCode(error) !== 'EPERM') throw error
      await fs.rm(statePath, { force: true })
      await fs.rename(temporaryPath, statePath)
    }
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

async function backupManagedWorkflowPack(
  workflowId: string,
  data: Uint8Array,
  version: string,
): Promise<string> {
  const backupDir = path.join(getWorkflowPackStorageDir(), 'backups')
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const filename = `${workflowId}.backup-${safeBackupSegment(version)}-${timestamp}-${randomUUID().slice(0, 8)}.zip`
  await fs.mkdir(backupDir, { recursive: true })
  await fs.writeFile(path.join(backupDir, filename), Buffer.from(data), { flag: 'wx' })
  return filename
}

async function replaceManagedWorkflowPack(
  targetPath: string,
  data: Uint8Array,
  expectedSha256: string,
): Promise<void> {
  const directory = path.dirname(targetPath)
  const filename = path.basename(targetPath)
  const temporaryPath = path.join(directory, `.${filename}.${randomUUID()}.tmp`)
  const rollbackPath = path.join(directory, `.${filename}.${randomUUID()}.rollback`)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(temporaryPath, Buffer.from(data), { flag: 'wx' })

  const temporarySha256 = sha256Bytes(new Uint8Array(await fs.readFile(temporaryPath)))
  if (temporarySha256 !== expectedSha256) {
    await fs.rm(temporaryPath, { force: true })
    throw new Error(`Workflow ZIP staging verification failed for ${filename}.`)
  }

  let movedExisting = false
  let installed = false
  try {
    try {
      await fs.rename(targetPath, rollbackPath)
      movedExisting = true
    } catch (error) {
      if (errnoCode(error) !== 'ENOENT') throw error
    }

    await fs.rename(temporaryPath, targetPath)
    installed = true
    const installedSha256 = sha256Bytes(new Uint8Array(await fs.readFile(targetPath)))
    if (installedSha256 !== expectedSha256) {
      throw new Error(`Workflow ZIP install verification failed for ${filename}.`)
    }
  } catch (error) {
    if (installed) await fs.rm(targetPath, { force: true }).catch(() => undefined)
    if (movedExisting) {
      try {
        await fs.rename(rollbackPath, targetPath)
        movedExisting = false
      } catch (rollbackError) {
        throw new Error(`Workflow ZIP update failed and rollback also failed: ${errorMessage(error)}; rollback: ${errorMessage(rollbackError)}`)
      }
    }
    throw error
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    if (movedExisting) await fs.rm(rollbackPath, { force: true }).catch(() => undefined)
  }
}

async function readBytesIfExists(filePath: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await fs.readFile(filePath))
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return null
    throw error
  }
}

function sha256Bytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

function safeBackupSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
}

function compareWorkflowVersions(left: string, right: string): number {
  const leftParts = left.split(/[.-]/).map((part) => /^\d+$/.test(part) ? Number(part) : part)
  const rightParts = right.split(/[.-]/).map((part) => /^\d+$/.test(part) ? Number(part) : part)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart === rightPart) continue
    if (typeof leftPart === 'number' && typeof rightPart === 'number') return leftPart > rightPart ? 1 : -1
    return String(leftPart).localeCompare(String(rightPart), undefined, { numeric: true })
  }
  return 0
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
