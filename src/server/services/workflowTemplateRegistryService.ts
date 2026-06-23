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
  [key: string]: unknown
}

const USER_CONFIG_SCHEMA_VERSION = WORKFLOW_TEMPLATE_SCHEMA_VERSION
const TEMPLATE_VALIDATION_SUPPORTED_SKILL_SOURCES: WorkflowPhaseSkillSource[] = [
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

function getConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function getWorkflowConfigPath(): string {
  return getAppStoragePath(getConfigDir(), 'workflows.json')
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

  async writeTemplates(templates: unknown[]): Promise<void> {
    const configPath = getWorkflowConfigPath()
    const { config, issues } = await readUserConfig(configPath)
    assertValidWritePayload(templates, issues)
    const existingConfig: WorkflowConfigFile = config ?? {
      schemaVersion: USER_CONFIG_SCHEMA_VERSION,
      templates: [],
    }
    const existingTemplates = Array.isArray(existingConfig.templates)
      ? existingConfig.templates
      : []

    const nextTemplates = templates.map((template) => {
      if (!isRecord(template) || !isNonEmptyString(template.id)) return template
      const existingTemplate = existingTemplates.find((candidate) =>
        isRecord(candidate) && candidate.id === template.id
      )
      return stripTemplateRuntimeState(mergeTemplateUnknownFields(template, existingTemplate))
    })

    const nextConfig: WorkflowConfigFile = {
      ...existingConfig,
      schemaVersion: USER_CONFIG_SCHEMA_VERSION,
      templates: nextTemplates,
    }

    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf-8')

    resetWorkflowTemplateRegistryForTests()
  }

  private async loadTemplates(configPath: string): Promise<WorkflowTemplateRegistryListResult> {
    const templates: WorkflowTemplateRegistryTemplate[] = []
    const invalidTemplates: WorkflowTemplateValidationIssue[] = []

    const { config, issues, missing } = await readUserConfig(configPath)
    if (missing) {
      return { templates, invalidTemplates }
    }
    invalidTemplates.push(...issues)
    if (!config) {
      return { templates, invalidTemplates }
    }

    const byId = new Map<string, WorkflowTemplateRegistryTemplate[]>()
    const validationResults = config.templates?.map((template, index) =>
      validateAndNormalizeUserConfigTemplate(template, index),
    ) ?? []

    for (const [index, { template, issues: templateIssues }] of validationResults.entries()) {
      invalidTemplates.push(...templateIssues)
      if (!template || templateIssues.length > 0) continue
      invalidTemplates.push(...await resolveTemplatePhaseSkillIssues(template, index))
      const existing = byId.get(template.id) ?? []
      existing.push(template)
      byId.set(template.id, existing)
    }

    for (const [id, matchingTemplates] of byId) {
      if (matchingTemplates.length <= 1) continue
      invalidTemplates.push({
        source: 'user-config',
        path: '$.templates',
        code: 'WORKFLOW_TEMPLATE_DUPLICATE_ID',
        message: 'User template ids must be unique.',
        templateId: id,
        severity: 'error',
      })
    }

    for (const [, matchingTemplates] of byId) {
      if (matchingTemplates.length === 1) {
        templates.push(matchingTemplates[0])
      }
    }

    return { templates, invalidTemplates }
  }
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
    { path: path.join(process.cwd(), '.codex', 'skills'), source: 'managed' },
    { path: path.join(process.cwd(), '.agents', 'skills'), source: 'managed' },
    { path: path.join(process.cwd(), 'src', 'skills', 'bundled'), source: 'bundled' },
    { path: path.join(getConfigDir(), 'skills'), source: 'user' },
    ...getProjectDirsUpToHome('skills', process.cwd()).map((skillsPath) => ({
      path: skillsPath,
      source: 'project' as const,
    })),
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

      const key = `${root.source}:${entry.name}`
      if (seen.has(key)) continue
      seen.add(key)
      catalog.push({
        name: entry.name,
        source: root.source,
        sourcePath: skillFile,
      })
    }
  }

  return catalog
}
