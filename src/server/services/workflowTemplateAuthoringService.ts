import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  WorkflowTemplateRegistryService,
  type WorkflowTemplateRegistryListResult,
  type WorkflowTemplateRegistryTemplate,
  collectTemplateSkillCatalog,
} from './workflowTemplateRegistryService.js'
import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import { workflowTemplateAuthoringGuide, type WorkflowTemplateAuthoringGuide } from './workflowTemplateAuthoringGuide.js'
import {
  isNonEmptyString,
  normalizeStringList,
  validateAndNormalizeWorkflowTemplate,
  type WorkflowTemplateValidationIssue,
} from './workflowTemplateValidation.js'
import type { WorkflowTemplateSource } from './workflowTypes.js'
import type {
  WorkflowPhaseSkillSource,
} from './workflowTypes.js'
import { resolveWorkflowPhaseSkills } from './workflowPhaseSkillResolver.js'

export type WorkflowTemplateAuthoringOperationName =
  | 'guide'
  | 'skill_catalog'
  | 'skill_create'
  | 'list'
  | 'inspect'
  | 'validate'
  | 'create'
  | 'update'
  | 'duplicate'
  | 'delete'

export type WorkflowTemplateAuthoringSelector = {
  source: WorkflowTemplateSource
  id: string
}

export type WorkflowTemplateAuthoringGuideInput = {
  operation: 'guide'
  topic?: string
}

export type WorkflowTemplateAuthoringSkillCatalogInput = {
  operation: 'skill_catalog'
  query?: string
  source?: 'all' | WorkflowPhaseSkillSource
  limit?: number | null
}

export type WorkflowTemplateAuthoringSkillCreateInput = {
  operation: 'skill_create'
  name: string
  description: string
  body?: string
}

export type WorkflowTemplateAuthoringListInput = {
  operation: 'list'
  source?: 'all' | WorkflowTemplateSource
}

export type WorkflowTemplateAuthoringInspectInput = {
  operation: 'inspect'
  selector: WorkflowTemplateAuthoringSelector
}

export type WorkflowTemplateAuthoringValidateInput = {
  operation: 'validate'
  template: unknown
  allowExistingId?: string | null
}

export type WorkflowTemplateAuthoringMutatingInput = {
  operation: 'skill_create' | 'create' | 'update' | 'duplicate' | 'delete'
  [key: string]: unknown
}

export type WorkflowTemplateAuthoringCreateInput = {
  operation: 'create'
  template: unknown
}

export type WorkflowTemplateAuthoringUpdateInput = {
  operation: 'update'
  selector: WorkflowTemplateAuthoringSelector
  basisHash: string
  template: unknown
}

export type WorkflowTemplateAuthoringDuplicateInput = {
  operation: 'duplicate'
  selector: WorkflowTemplateAuthoringSelector
  target?: {
    id?: string
    name?: string
  }
}

export type WorkflowTemplateAuthoringDeleteInput = {
  operation: 'delete'
  selector: WorkflowTemplateAuthoringSelector
  basisHash: string
}

export type WorkflowTemplateAuthoringOperationInput =
  | WorkflowTemplateAuthoringGuideInput
  | WorkflowTemplateAuthoringSkillCatalogInput
  | WorkflowTemplateAuthoringSkillCreateInput
  | WorkflowTemplateAuthoringListInput
  | WorkflowTemplateAuthoringInspectInput
  | WorkflowTemplateAuthoringValidateInput
  | WorkflowTemplateAuthoringMutatingInput
  | WorkflowTemplateAuthoringCreateInput
  | WorkflowTemplateAuthoringUpdateInput
  | WorkflowTemplateAuthoringDuplicateInput
  | WorkflowTemplateAuthoringDeleteInput

export type WorkflowTemplateAuthoringStatus =
  | 'succeeded'
  | 'validated'
  | 'rejected'
  | 'failed'

export type WorkflowTemplateAuthoringNextAction =
  | 'none'
  | 'inspect-and-retry'
  | 'repair-and-validate'
  | 'choose-unique-target'
  | 'ask-user-to-disambiguate'
  | 'retry-after-server-available'

export type WorkflowTemplateAuthoringIssue = WorkflowTemplateValidationIssue

export type WorkflowTemplateSummary = {
  source: WorkflowTemplateSource
  id: string
  name: string
  version: string
  description: string
  phaseCount: number
  editable: boolean
  copyable: boolean
  basisHash?: string
}

export type WorkflowTemplateAuthoringCreatedSkill = {
  name: string
  source: 'user'
  skillRoot: string
  skillFile: string
  recommendedReference: {
    name: string
    mode: 'recommended'
    source: 'user'
  }
}

export type WorkflowTemplateAuthoringSkillRepairGuidance = {
  templateId: string
  phaseId: string
  skillName: string
  reference: {
    name: string
    mode: 'recommended'
    source?: WorkflowPhaseSkillSource
    pluginName?: string
    namespace?: string
    version?: string
    contentHash?: string
    referenceId?: string
  }
  diagnostic: {
    code: string
    message: string
  }
  actions: Array<
    | {
        operation: 'skill_catalog'
        input: WorkflowTemplateAuthoringSkillCatalogInput
      }
    | {
        operation: 'skill_create'
        input: Omit<WorkflowTemplateAuthoringSkillCreateInput, 'body'>
      }
  >
}

export type WorkflowTemplateBasis = {
  source: WorkflowTemplateSource
  id: string
  basisHash: string
}

export type WorkflowTemplateAuthoringSkillCatalogEntry = {
  name: string
  displayName?: string
  source: WorkflowPhaseSkillSource
  pluginName?: string
  namespace?: string
  version?: string
  contentHash?: string
  referenceId?: string
  installable?: boolean
  recommendedReference: {
    name: string
    mode: 'recommended'
    source: WorkflowPhaseSkillSource
    pluginName?: string
    namespace?: string
    version?: string
    contentHash?: string
    referenceId?: string
  }
}

export type WorkflowTemplateAuthoringAffectedTemplate = {
  source: WorkflowTemplateSource
  id: string
  name?: string
  version?: string
  basisHash?: string
}

export type WorkflowTemplateAuthoringResult = {
  operation: WorkflowTemplateAuthoringOperationName
  status: WorkflowTemplateAuthoringStatus
  persisted: boolean
  affectedTemplate?: WorkflowTemplateAuthoringAffectedTemplate
  beforeSummary?: WorkflowTemplateSummary
  afterSummary?: WorkflowTemplateSummary
  validation?: {
    valid: boolean
    issues: WorkflowTemplateAuthoringIssue[]
  }
  templates?: WorkflowTemplateSummary[]
  skillCatalog?: WorkflowTemplateAuthoringSkillCatalogEntry[]
  createdSkill?: WorkflowTemplateAuthoringCreatedSkill
  skillRepairGuidance?: WorkflowTemplateAuthoringSkillRepairGuidance[]
  invalidTemplates?: WorkflowTemplateAuthoringIssue[]
  guide?: WorkflowTemplateAuthoringGuide
  template?: WorkflowTemplateRegistryTemplate
  nextAction: WorkflowTemplateAuthoringNextAction
  message: string
}

export type WorkflowTemplateAuthoringServiceContext = {
  registry?: WorkflowTemplateRegistryService
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, sortCanonical(entryValue)]),
  )
}

export function canonicalWorkflowTemplateJson(value: unknown): string {
  return JSON.stringify(sortCanonical(value))
}

export function workflowTemplateBasisHash(
  template: WorkflowTemplateRegistryTemplate,
): string {
  const basis = {
    id: template.id,
    source: template.source,
    template: sortCanonical(template),
  }
  return `sha256:${createHash('sha256').update(JSON.stringify(basis)).digest('hex')}`
}

function summarizeTemplate(template: WorkflowTemplateRegistryTemplate): WorkflowTemplateSummary {
  const basisHash = template.source === 'user'
    ? workflowTemplateBasisHash(template)
    : undefined

  return {
    source: template.source,
    id: template.id,
    name: template.name,
    version: template.version,
    description: template.description,
    phaseCount: template.phases.length,
    editable: template.source === 'user',
    copyable: true,
    ...(basisHash ? { basisHash } : {}),
  }
}

function affectedTemplate(
  template: WorkflowTemplateRegistryTemplate,
  options: { includeBasisHash?: boolean } = {},
): WorkflowTemplateAuthoringAffectedTemplate {
  const basisHash = options.includeBasisHash !== false && template.source === 'user'
    ? workflowTemplateBasisHash(template)
    : undefined

  return {
    source: template.source,
    id: template.id,
    name: template.name,
    version: template.version,
    ...(basisHash ? { basisHash } : {}),
  }
}

function stableBasisHashProperty<T extends { basisHash?: string }>(value: T): T {
  if (!value.basisHash) return value

  const basisHash = value.basisHash
  Object.defineProperty(value, 'basisHash', {
    get: () => basisHash,
    set: () => {},
    enumerable: true,
    configurable: false,
  })
  return value
}

function validationContext(registry: WorkflowTemplateRegistryListResult) {
  return {
    templates: registry.templates.map((template) => ({
      id: template.id,
      source: template.source,
    })),
  }
}

function getConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function getUserSkillsDir(): string {
  return path.join(getConfigDir(), 'skills')
}

function matchesSource(
  template: WorkflowTemplateRegistryTemplate,
  source: WorkflowTemplateAuthoringListInput['source'],
): boolean {
  return source === undefined || source === 'all' || template.source === source
}

function matchesSkillCatalogSource(
  entry: WorkflowTemplateAuthoringSkillCatalogEntry,
  source: WorkflowTemplateAuthoringSkillCatalogInput['source'],
): boolean {
  return source === undefined || source === 'all' || entry.source === source
}

function matchesSkillCatalogQuery(
  entry: WorkflowTemplateAuthoringSkillCatalogEntry,
  query: string | undefined,
): boolean {
  const normalizedQuery = query?.trim().toLowerCase()
  if (!normalizedQuery) return true

  return [
    entry.name,
    entry.displayName,
    entry.source,
    entry.pluginName,
    entry.namespace,
    entry.version,
    entry.referenceId,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .some((value) => value.toLowerCase().includes(normalizedQuery))
}

function authoringIssue(
  path: string,
  code: string,
  message: string,
  templateId?: string,
): WorkflowTemplateAuthoringIssue {
  return {
    source: 'authoring',
    path,
    code,
    message,
    severity: 'error',
    ...(templateId ? { templateId } : {}),
  }
}

function skillAuthoringIssue(
  pathValue: string,
  code: string,
  message: string,
): WorkflowTemplateAuthoringIssue {
  return authoringIssue(pathValue, code, message)
}

function normalizeSkillName(value: unknown): string | null {
  if (!isNonEmptyString(value)) return null
  const trimmed = value.trim()
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) return null
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(trimmed)) return null
  return trimmed
}

function skillDisplayNameFromSlug(name: string): string {
  return name
    .split(/[-_:]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function escapeYamlScalar(value: string): string {
  return JSON.stringify(value)
}

function skillMarkdown(name: string, description: string, body: string | undefined): string {
  const contentBody = isNonEmptyString(body)
    ? body.trim()
    : [
        `Use this skill when the task matches ${skillDisplayNameFromSlug(name)}.`,
        '',
        '## Instructions',
        '',
        '- Clarify the expected outcome before applying this skill.',
        '- Keep work scoped to the user request and repository conventions.',
        '- Report verification evidence before claiming completion.',
      ].join('\n')

  return [
    '---',
    `name: ${escapeYamlScalar(skillDisplayNameFromSlug(name))}`,
    `description: ${escapeYamlScalar(description.trim())}`,
    '---',
    '',
    contentBody,
    '',
  ].join('\n')
}

function validateSkillMarkdownShape(
  skillFile: string,
  content: string,
): WorkflowTemplateAuthoringIssue[] {
  const parsed = parseFrontmatter(content, skillFile)
  const issues: WorkflowTemplateAuthoringIssue[] = []

  if (!isNonEmptyString(parsed.frontmatter.description)) {
    issues.push(skillAuthoringIssue(
      '$.description',
      'WORKFLOW_PHASE_SKILL_CREATE_INVALID_SKILL_MD',
      'Generated SKILL.md must include non-empty description frontmatter.',
    ))
  }

  if (!isNonEmptyString(parsed.content)) {
    issues.push(skillAuthoringIssue(
      '$.body',
      'WORKFLOW_PHASE_SKILL_CREATE_INVALID_SKILL_MD',
      'Generated SKILL.md must include non-empty markdown instructions.',
    ))
  }

  return issues
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath)
    return true
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false
    }
    throw error
  }
}

function availabilityIssueForDiagnostic(
  template: WorkflowTemplateRegistryTemplate,
  phaseIndex: number,
  skillIndex: number,
  code: string,
  message: string,
): WorkflowTemplateAuthoringIssue {
  return authoringIssue(
    `$.template.phases[${phaseIndex}].skills[${skillIndex}]`,
    code,
    message,
    template.id,
  )
}

async function validateTemplatePhaseSkillAvailability(
  template: WorkflowTemplateRegistryTemplate,
): Promise<{
  issues: WorkflowTemplateAuthoringIssue[]
  repairGuidance: WorkflowTemplateAuthoringSkillRepairGuidance[]
}> {
  const issues: WorkflowTemplateAuthoringIssue[] = []
  const repairGuidance: WorkflowTemplateAuthoringSkillRepairGuidance[] = []
  const catalog = await collectTemplateSkillCatalog()

  for (const [phaseIndex, phase] of template.phases.entries()) {
    if (phase.skills.length === 0) continue

    const result = await resolveWorkflowPhaseSkills({
      templateId: template.id,
      phaseId: phase.id,
      references: phase.skills,
      catalog,
    })

    result.resolutions.forEach((resolution, skillIndex) => {
      const diagnostic = resolution.diagnostic
      if (!diagnostic || diagnostic.severity === 'info') return
      const repairHint = resolution.status === 'missing'
        ? ' Run workflow_template_authoring skill_catalog to choose an installed skill, or use skill_create to create a user skill before referencing it.'
        : ''
      issues.push(availabilityIssueForDiagnostic(
        template,
        phaseIndex,
        skillIndex,
        diagnostic.code,
        `${diagnostic.message}${repairHint}`,
      ))

      if (resolution.status === 'missing') {
        repairGuidance.push({
          templateId: template.id,
          phaseId: phase.id,
          skillName: resolution.reference.name,
          reference: {
            name: resolution.reference.name,
            mode: 'recommended',
            ...(resolution.reference.source ? { source: resolution.reference.source } : {}),
            ...(resolution.reference.pluginName ? { pluginName: resolution.reference.pluginName } : {}),
            ...(resolution.reference.namespace ? { namespace: resolution.reference.namespace } : {}),
            ...(resolution.reference.version ? { version: resolution.reference.version } : {}),
            ...(resolution.reference.contentHash ? { contentHash: resolution.reference.contentHash } : {}),
            ...(resolution.reference.referenceId ? { referenceId: resolution.reference.referenceId } : {}),
          },
          diagnostic: {
            code: diagnostic.code,
            message: diagnostic.message,
          },
          actions: [
            {
              operation: 'skill_catalog',
              input: {
                operation: 'skill_catalog',
                query: resolution.reference.name,
                source: 'all',
              },
            },
            {
              operation: 'skill_create',
              input: {
                operation: 'skill_create',
                name: resolution.reference.name,
                description: `Use when workflow phases need ${skillDisplayNameFromSlug(resolution.reference.name)} guidance.`,
              },
            },
          ],
        })
      }
    })
  }

  return { issues, repairGuidance }
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === 'object' && !Array.isArray(value) && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeRecordUnknownFields(
  existing: unknown,
  next: unknown,
): unknown {
  return isRecord(existing) && isRecord(next)
    ? { ...existing, ...next }
    : next
}

function mergeUpdateTemplateForWrite(
  existingTemplate: WorkflowTemplateRegistryTemplate,
  nextTemplate: WorkflowTemplateRegistryTemplate,
): WorkflowTemplateRegistryTemplate {
  const existingPhases = Array.isArray(existingTemplate.phases)
    ? existingTemplate.phases
    : []
  const nextPhases = nextTemplate.phases.map((phase) => {
    const existingPhase = existingPhases.find((candidate) => candidate.id === phase.id)
    if (!existingPhase) return phase

    return {
      ...existingPhase,
      ...phase,
      outputArtifact: mergeRecordUnknownFields(existingPhase.outputArtifact, phase.outputArtifact),
      completionCriteria: mergeRecordUnknownFields(existingPhase.completionCriteria, phase.completionCriteria),
      transition: mergeRecordUnknownFields(existingPhase.transition, phase.transition),
    }
  })

  return {
    ...existingTemplate,
    ...nextTemplate,
    phases: nextPhases,
  }
}

function duplicateTemplateDraft(template: WorkflowTemplateRegistryTemplate): Record<string, unknown> {
  const draft = cloneJson(template) as Record<string, unknown>
  draft.source = 'user'
  draft.phases = template.phases.map((phase) => {
    const phasePrompt = phase.phasePrompt
    return {
      ...phase,
      requiredIntake: normalizeStringList(phase.requiredIntake).length > 0
        ? phase.requiredIntake
        : phasePrompt?.handoffInput ?? ['Use the previous workflow context.'],
      handoffRules: normalizeStringList(phase.handoffRules).length > 0
        ? phase.handoffRules
        : phasePrompt?.completionRules ?? ['Summarize the phase output and next action.'],
      outputArtifact: phase.outputArtifact ?? {
        id: `${phase.id}-output`,
        name: phasePrompt?.outputArtifact.name ?? `${phase.name} Output`,
        kind: 'markdown',
        description: `${phase.name} phase output.`,
        required: true,
        ...(phasePrompt?.outputArtifact.sections ? { sections: phasePrompt.outputArtifact.sections } : {}),
      },
    }
  })
  delete draft.editable
  delete draft.copyable
  return draft
}

function findSelectedTemplate(
  registry: WorkflowTemplateRegistryListResult,
  selector: WorkflowTemplateAuthoringSelector,
): WorkflowTemplateRegistryTemplate | undefined {
  return registry.templates.find((template) =>
    template.source === selector.source && template.id === selector.id
  )
}

function nextAvailableTemplateId(
  baseId: string,
  registry: WorkflowTemplateRegistryListResult,
): string {
  const usedIds = new Set(registry.templates.map((template) => template.id))
  if (!usedIds.has(baseId)) return baseId

  for (let index = 2; ; index += 1) {
    const candidate = `${baseId}-${index}`
    if (!usedIds.has(candidate)) return candidate
  }
}

async function executeGuide(
  input: WorkflowTemplateAuthoringGuideInput,
): Promise<WorkflowTemplateAuthoringResult> {
  const knownTopic = input.topic
    ? workflowTemplateAuthoringGuide.fieldGroups.some((group) => group.id === input.topic)
    : true
  return {
    operation: 'guide',
    status: 'succeeded',
    persisted: false,
    validation: {
      valid: knownTopic,
      issues: knownTopic
        ? []
        : [authoringIssue('$.topic', 'WORKFLOW_TEMPLATE_GUIDE_TOPIC_UNKNOWN', 'Guide topic was not recognized; returning the full guide.')],
    },
    guide: cloneJson(workflowTemplateAuthoringGuide),
    nextAction: knownTopic ? 'none' : 'repair-and-validate',
    message: knownTopic
      ? 'Workflow template authoring guide returned.'
      : 'Workflow template authoring guide returned for all topics because the requested topic was not recognized.',
  }
}

async function executeSkillCatalog(
  input: WorkflowTemplateAuthoringSkillCatalogInput,
): Promise<WorkflowTemplateAuthoringResult> {
  const maxLimit = 200
  const requestedLimit = typeof input.limit === 'number' && Number.isFinite(input.limit)
    ? Math.trunc(input.limit)
    : maxLimit
  const limit = Math.min(Math.max(requestedLimit, 1), maxLimit)
  const catalog = (await collectTemplateSkillCatalog())
    .map((entry): WorkflowTemplateAuthoringSkillCatalogEntry => {
      const recommendedReference = {
        name: entry.name,
        mode: 'recommended' as const,
        source: entry.source,
        ...(entry.pluginName ? { pluginName: entry.pluginName } : {}),
        ...(entry.namespace ? { namespace: entry.namespace } : {}),
        ...(entry.version ? { version: entry.version } : {}),
        ...(entry.contentHash ? { contentHash: entry.contentHash } : {}),
        ...(entry.referenceId ? { referenceId: entry.referenceId } : {}),
      }

      return {
        name: entry.name,
        ...(entry.displayName ? { displayName: entry.displayName } : {}),
        source: entry.source,
        ...(entry.pluginName ? { pluginName: entry.pluginName } : {}),
        ...(entry.namespace ? { namespace: entry.namespace } : {}),
        ...(entry.version ? { version: entry.version } : {}),
        ...(entry.contentHash ? { contentHash: entry.contentHash } : {}),
        ...(entry.referenceId ? { referenceId: entry.referenceId } : {}),
        ...(entry.installable ? { installable: entry.installable } : {}),
        recommendedReference,
      }
    })
    .filter((entry) => matchesSkillCatalogSource(entry, input.source))
    .filter((entry) => matchesSkillCatalogQuery(entry, input.query))
    .sort((left, right) =>
      `${left.source}:${left.name}`.localeCompare(`${right.source}:${right.name}`)
    )

  return {
    operation: 'skill_catalog',
    status: 'succeeded',
    persisted: false,
    validation: {
      valid: true,
      issues: [],
    },
    skillCatalog: catalog.slice(0, limit),
    nextAction: 'none',
    message: catalog.length > limit
      ? `Workflow phase skill catalog returned ${limit} of ${catalog.length} matching skill references.`
      : 'Workflow phase skill catalog returned.',
  }
}

async function executeSkillCreate(
  input: WorkflowTemplateAuthoringSkillCreateInput,
): Promise<WorkflowTemplateAuthoringResult> {
  const name = normalizeSkillName(input.name)
  if (!name) {
    return {
      operation: 'skill_create',
      status: 'rejected',
      persisted: false,
      validation: {
        valid: false,
        issues: [
          skillAuthoringIssue(
            '$.name',
            'WORKFLOW_PHASE_SKILL_CREATE_INVALID_NAME',
            'Skill name must be a stable lowercase slug without path separators.',
          ),
        ],
      },
      nextAction: 'repair-and-validate',
      message: 'Workflow phase skill create request is invalid.',
    }
  }

  if (!isNonEmptyString(input.description)) {
    return {
      operation: 'skill_create',
      status: 'rejected',
      persisted: false,
      validation: {
        valid: false,
        issues: [
          skillAuthoringIssue(
            '$.description',
            'WORKFLOW_PHASE_SKILL_CREATE_DESCRIPTION_REQUIRED',
            'Skill creation requires a non-empty description so agents can discover when to use it.',
          ),
        ],
      },
      nextAction: 'repair-and-validate',
      message: 'Workflow phase skill create request is invalid.',
    }
  }

  const skillRoot = path.join(getUserSkillsDir(), name)
  const skillFile = path.join(skillRoot, 'SKILL.md')
  if (await pathExists(skillFile)) {
    return {
      operation: 'skill_create',
      status: 'rejected',
      persisted: false,
      validation: {
        valid: false,
        issues: [
          skillAuthoringIssue(
            '$.name',
            'WORKFLOW_PHASE_SKILL_ALREADY_EXISTS',
            'A user skill with this name already exists; use skill_catalog and reference the existing skill.',
          ),
        ],
      },
      nextAction: 'repair-and-validate',
      message: 'Workflow phase skill already exists.',
    }
  }

  await fs.mkdir(skillRoot, { recursive: true })
  await fs.writeFile(
    skillFile,
    skillMarkdown(name, input.description, input.body),
    {
      encoding: 'utf-8',
      flag: 'wx',
    },
  )
  const writtenContent = await fs.readFile(skillFile, 'utf-8')
  const skillMarkdownIssues = validateSkillMarkdownShape(skillFile, writtenContent)
  if (skillMarkdownIssues.length > 0) {
    return {
      operation: 'skill_create',
      status: 'failed',
      persisted: true,
      validation: {
        valid: false,
        issues: skillMarkdownIssues,
      },
      nextAction: 'repair-and-validate',
      message: 'Workflow phase skill was written but generated SKILL.md is invalid.',
    }
  }

  const createdSkill: WorkflowTemplateAuthoringCreatedSkill = {
    name,
    source: 'user',
    skillRoot,
    skillFile,
    recommendedReference: {
      name,
      mode: 'recommended',
      source: 'user',
    },
  }
  const catalog = await collectTemplateSkillCatalog()
  const catalogEntry = catalog.find((entry) =>
    entry.name === name &&
    entry.source === 'user' &&
    path.normalize(entry.sourcePath ?? '') === path.normalize(skillFile)
  )
  if (!catalogEntry) {
    return {
      operation: 'skill_create',
      status: 'failed',
      persisted: true,
      validation: {
        valid: false,
        issues: [
          skillAuthoringIssue(
            '$.name',
            'WORKFLOW_PHASE_SKILL_CREATE_NOT_CATALOGED',
            'Created skill was not found in the installed user skill catalog.',
          ),
        ],
      },
      createdSkill,
      nextAction: 'repair-and-validate',
      message: 'Workflow phase skill was written but is not visible in the installed skill catalog.',
    }
  }

  return {
    operation: 'skill_create',
    status: 'succeeded',
    persisted: true,
    validation: {
      valid: true,
      issues: [],
    },
    createdSkill,
    skillCatalog: [
      {
        name,
        source: 'user',
        recommendedReference: createdSkill.recommendedReference,
      },
    ],
    nextAction: 'none',
    message: 'Workflow phase skill created in the user skills directory.',
  }
}

async function executeList(
  input: WorkflowTemplateAuthoringListInput,
  registryService: WorkflowTemplateRegistryService,
): Promise<WorkflowTemplateAuthoringResult> {
  const registry = await registryService.listTemplates()
  const templates = registry.templates
    .filter((template) => matchesSource(template, input.source))
    .map(summarizeTemplate)

  return {
    operation: 'list',
    status: 'succeeded',
    persisted: false,
    validation: {
      valid: registry.invalidTemplates.length === 0,
      issues: registry.invalidTemplates,
    },
    templates,
    invalidTemplates: registry.invalidTemplates,
    nextAction: registry.invalidTemplates.length === 0 ? 'none' : 'repair-and-validate',
    message: registry.invalidTemplates.length === 0
      ? 'Workflow templates listed.'
      : 'Workflow templates listed with invalid user template diagnostics.',
  }
}

async function executeInspect(
  input: WorkflowTemplateAuthoringInspectInput,
  registryService: WorkflowTemplateRegistryService,
): Promise<WorkflowTemplateAuthoringResult> {
  const registry = await registryService.listTemplates()
  const selected = findSelectedTemplate(registry, input.selector)
  if (!selected) {
    const issue = authoringIssue(
      '$.selector',
      'WORKFLOW_TEMPLATE_TARGET_NOT_FOUND',
      `No ${input.selector.source} workflow template was found for id "${input.selector.id}".`,
      input.selector.id,
    )
    return {
      operation: 'inspect',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: input.selector.source,
        id: input.selector.id,
      },
      validation: {
        valid: false,
        issues: [issue],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template target was not found.',
    }
  }

  return {
    operation: 'inspect',
    status: 'succeeded',
    persisted: false,
    affectedTemplate: affectedTemplate(selected),
    beforeSummary: summarizeTemplate(selected),
    validation: {
      valid: registry.invalidTemplates.length === 0,
      issues: registry.invalidTemplates,
    },
    invalidTemplates: registry.invalidTemplates,
    template: cloneJson(selected),
    nextAction: 'none',
    message: 'Workflow template inspected.',
  }
}

async function executeValidate(
  input: WorkflowTemplateAuthoringValidateInput,
  registryService: WorkflowTemplateRegistryService,
): Promise<WorkflowTemplateAuthoringResult> {
  const registry = await registryService.listTemplates()
  const validation = validateAndNormalizeWorkflowTemplate(input.template, {
    source: 'authoring',
    registry: validationContext(registry),
    allowExistingId: input.allowExistingId ?? undefined,
  })
  const normalized = validation.template ?? undefined
  const skillAvailability = normalized
    ? await validateTemplatePhaseSkillAvailability(normalized)
    : { issues: [], repairGuidance: [] }
  const issues = [...validation.issues, ...skillAvailability.issues]

  return {
    operation: 'validate',
    status: issues.length === 0 ? 'validated' : 'rejected',
    persisted: false,
    ...(normalized ? { affectedTemplate: affectedTemplate(normalized, { includeBasisHash: false }) } : {}),
    validation: {
      valid: issues.length === 0,
      issues,
    },
    ...(skillAvailability.repairGuidance.length > 0
      ? { skillRepairGuidance: skillAvailability.repairGuidance }
      : {}),
    invalidTemplates: registry.invalidTemplates,
    ...(normalized && issues.length === 0 ? { template: cloneJson(normalized) } : {}),
    nextAction: issues.length === 0 ? 'none' : 'repair-and-validate',
    message: issues.length === 0
      ? 'Workflow template candidate is valid.'
      : 'Workflow template candidate is invalid.',
  }
}

async function executeCreate(
  input: WorkflowTemplateAuthoringCreateInput,
  registryService: WorkflowTemplateRegistryService,
): Promise<WorkflowTemplateAuthoringResult> {
  const registry = await registryService.listTemplates()
  const validation = validateAndNormalizeWorkflowTemplate(input.template, {
    source: 'authoring',
    registry: validationContext(registry),
  })

  if (validation.issues.length > 0 || !validation.template) {
    const conflictIssue = validation.issues.find((issue) =>
      issue.code === 'WORKFLOW_TEMPLATE_CONFLICT'
    )

    return {
      operation: 'create',
      status: 'rejected',
      persisted: false,
      ...(conflictIssue?.templateId
        ? {
            affectedTemplate: {
              source: 'user',
              id: conflictIssue.templateId,
            },
          }
        : {}),
      validation: {
        valid: false,
        issues: validation.issues,
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: conflictIssue ? 'choose-unique-target' : 'repair-and-validate',
      message: conflictIssue
        ? 'Workflow template id already exists.'
        : 'Workflow template candidate is invalid.',
    }
  }

  const skillAvailability = await validateTemplatePhaseSkillAvailability(validation.template)
  if (skillAvailability.issues.length > 0) {
    return {
      operation: 'create',
      status: 'rejected',
      persisted: false,
      affectedTemplate: affectedTemplate(validation.template, { includeBasisHash: false }),
      validation: {
        valid: false,
        issues: skillAvailability.issues,
      },
      ...(skillAvailability.repairGuidance.length > 0
        ? { skillRepairGuidance: skillAvailability.repairGuidance }
        : {}),
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'repair-and-validate',
      message: 'Workflow template candidate references unavailable recommended phase skills.',
    }
  }

  await registryService.writeTemplates([
    ...registry.templates.filter((template) => template.source === 'user'),
    validation.template,
  ])

  const refreshed = await registryService.listTemplates()
  const created = findSelectedTemplate(refreshed, {
    source: 'user',
    id: validation.template.id,
  })

  if (!created) {
    return {
      operation: 'create',
      status: 'failed',
      persisted: true,
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.template.id',
            'WORKFLOW_TEMPLATE_AUTHORING_FAILED',
            'Workflow template was written but could not be found after registry refresh.',
            validation.template.id,
          ),
        ],
      },
      invalidTemplates: refreshed.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template authoring operation failed.',
    }
  }

  return {
    operation: 'create',
    status: 'succeeded',
    persisted: true,
    affectedTemplate: affectedTemplate(created),
    afterSummary: summarizeTemplate(created),
    validation: {
      valid: true,
      issues: [],
    },
    invalidTemplates: refreshed.invalidTemplates,
    nextAction: 'none',
    message: 'Workflow template created.',
  }
}

async function executeUpdate(
  input: WorkflowTemplateAuthoringUpdateInput,
  registryService: WorkflowTemplateRegistryService,
): Promise<WorkflowTemplateAuthoringResult> {
  let registry = await registryService.listTemplates()
  const selected = findSelectedTemplate(registry, input.selector)

  if (input.selector.source !== 'user') {
    return {
      operation: 'update',
      status: 'rejected',
      persisted: false,
      affectedTemplate: selected
        ? affectedTemplate(selected, { includeBasisHash: false })
        : {
            source: input.selector.source,
            id: input.selector.id,
          },
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.selector.source',
            'WORKFLOW_TEMPLATE_INVALID_SOURCE',
            'Workflow template source must be user.',
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template source must be user.',
    }
  }

  if (!selected) {
    return {
      operation: 'update',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: input.selector.source,
        id: input.selector.id,
      },
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.selector',
            'WORKFLOW_TEMPLATE_TARGET_NOT_FOUND',
            `No user workflow template was found for id "${input.selector.id}".`,
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template target was not found.',
    }
  }

  const candidateId = recordValue(input.template, 'id')
  if (typeof candidateId === 'string' && candidateId !== input.selector.id) {
    return {
      operation: 'update',
      status: 'rejected',
      persisted: false,
      affectedTemplate: affectedTemplate(selected),
      beforeSummary: summarizeTemplate(selected),
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.template.id',
            'WORKFLOW_TEMPLATE_ID_MISMATCH',
            'Template id must match the selected workflow template id.',
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'repair-and-validate',
      message: 'Workflow template id must match the selected template.',
    }
  }

  const validation = validateAndNormalizeWorkflowTemplate(input.template, {
    source: 'authoring',
    registry: validationContext(registry),
    allowExistingId: input.selector.id,
  })

  if (validation.issues.length > 0 || !validation.template) {
    return {
      operation: 'update',
      status: 'rejected',
      persisted: false,
      affectedTemplate: affectedTemplate(selected),
      beforeSummary: summarizeTemplate(selected),
      validation: {
        valid: false,
        issues: validation.issues,
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'repair-and-validate',
      message: 'Workflow template candidate is invalid.',
    }
  }

  const skillAvailability = await validateTemplatePhaseSkillAvailability(validation.template)
  if (skillAvailability.issues.length > 0) {
    return {
      operation: 'update',
      status: 'rejected',
      persisted: false,
      affectedTemplate: affectedTemplate(selected),
      beforeSummary: summarizeTemplate(selected),
      validation: {
        valid: false,
        issues: skillAvailability.issues,
      },
      ...(skillAvailability.repairGuidance.length > 0
        ? { skillRepairGuidance: skillAvailability.repairGuidance }
        : {}),
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'repair-and-validate',
      message: 'Workflow template candidate references unavailable recommended phase skills.',
    }
  }

  registry = await registryService.listTemplates()
  const current = findSelectedTemplate(registry, input.selector)
  if (!current) {
    return {
      operation: 'update',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: input.selector.source,
        id: input.selector.id,
      },
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.selector',
            'WORKFLOW_TEMPLATE_TARGET_NOT_FOUND',
            `No user workflow template was found for id "${input.selector.id}".`,
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template target was not found.',
    }
  }

  const currentBasisHash = workflowTemplateBasisHash(current)
  if (input.basisHash !== currentBasisHash) {
    return {
      operation: 'update',
      status: 'rejected',
      persisted: false,
      affectedTemplate: affectedTemplate(current),
      beforeSummary: summarizeTemplate(current),
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.basisHash',
            'WORKFLOW_TEMPLATE_STALE_BASIS',
            'Workflow template basis is stale; inspect the template and retry with the current basisHash.',
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template basis is stale; inspect the template and retry with the current basisHash.',
    }
  }

  const otherUserTemplates = registry.templates.filter((template) =>
    template.source === 'user' && template.id !== input.selector.id
  )
  const templateForWrite = mergeUpdateTemplateForWrite(current, validation.template)
  await registryService.writeTemplates([...otherUserTemplates, templateForWrite])

  const refreshed = await registryService.listTemplates()
  const updated = findSelectedTemplate(refreshed, {
    source: 'user',
    id: input.selector.id,
  })

  if (!updated) {
    return {
      operation: 'update',
      status: 'failed',
      persisted: true,
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.template.id',
            'WORKFLOW_TEMPLATE_AUTHORING_FAILED',
            'Workflow template was written but could not be found after registry refresh.',
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: refreshed.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template authoring operation failed.',
    }
  }

  const beforeSummary = summarizeTemplate(current)
  const afterSummary = stableBasisHashProperty(summarizeTemplate(updated))
  const updatedAffectedTemplate = stableBasisHashProperty({
    source: updated.source,
    id: updated.id,
    name: updated.name,
    version: updated.version,
    ...(afterSummary.basisHash ? { basisHash: afterSummary.basisHash } : {}),
  } satisfies WorkflowTemplateAuthoringAffectedTemplate)

  const result = {
    operation: 'update',
    status: 'succeeded',
    persisted: true,
    beforeSummary,
    validation: {
      valid: true,
      issues: [],
    },
    invalidTemplates: refreshed.invalidTemplates,
    nextAction: 'none',
    message: 'Workflow template updated.',
  } satisfies Omit<WorkflowTemplateAuthoringResult, 'affectedTemplate' | 'afterSummary'>
  Object.defineProperty(result, 'affectedTemplate', {
    get: () => stableBasisHashProperty({ ...updatedAffectedTemplate }),
    enumerable: true,
    configurable: false,
  })
  Object.defineProperty(result, 'afterSummary', {
    get: () => stableBasisHashProperty({ ...afterSummary }),
    enumerable: true,
    configurable: false,
  })
  return result as WorkflowTemplateAuthoringResult
}

async function executeDuplicate(
  input: WorkflowTemplateAuthoringDuplicateInput,
  registryService: WorkflowTemplateRegistryService,
): Promise<WorkflowTemplateAuthoringResult> {
  const registry = await registryService.listTemplates()
  const selected = findSelectedTemplate(registry, input.selector)

  if (!selected) {
    return {
      operation: 'duplicate',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: input.selector.source,
        id: input.selector.id,
      },
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.selector',
            'WORKFLOW_TEMPLATE_TARGET_NOT_FOUND',
            `No ${input.selector.source} workflow template was found for id "${input.selector.id}".`,
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template target was not found.',
    }
  }

  const defaultBaseId = input.selector.source === 'builtin'
    ? `${selected.id}-custom`
    : `${selected.id}-copy`
  const defaultName = input.selector.source === 'builtin'
    ? `${selected.name} Custom`
    : `${selected.name} Copy`
  const targetId = isNonEmptyString(input.target?.id)
    ? input.target.id
    : nextAvailableTemplateId(defaultBaseId, registry)
  const targetName = isNonEmptyString(input.target?.name)
    ? input.target.name
    : defaultName

  const draft = duplicateTemplateDraft(selected)
  draft.id = targetId
  draft.name = targetName

  const validation = validateAndNormalizeWorkflowTemplate(draft, {
    source: 'authoring',
    registry: validationContext(registry),
  })

  if (validation.issues.length > 0 || !validation.template) {
    const conflictIssue = validation.issues.find((issue) =>
      issue.code === 'WORKFLOW_TEMPLATE_CONFLICT'
    )

    return {
      operation: 'duplicate',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: 'user',
        id: targetId,
      },
      beforeSummary: summarizeTemplate(selected),
      validation: {
        valid: false,
        issues: validation.issues,
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: conflictIssue ? 'choose-unique-target' : 'repair-and-validate',
      message: conflictIssue
        ? 'Workflow template id already exists.'
        : 'Workflow template candidate is invalid.',
    }
  }

  const skillAvailability = await validateTemplatePhaseSkillAvailability(validation.template)
  if (skillAvailability.issues.length > 0) {
    return {
      operation: 'duplicate',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: 'user',
        id: targetId,
      },
      beforeSummary: summarizeTemplate(selected),
      validation: {
        valid: false,
        issues: skillAvailability.issues,
      },
      ...(skillAvailability.repairGuidance.length > 0
        ? { skillRepairGuidance: skillAvailability.repairGuidance }
        : {}),
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'repair-and-validate',
      message: 'Workflow template candidate references unavailable recommended phase skills.',
    }
  }

  await registryService.writeTemplates([
    ...registry.templates.filter((template) => template.source === 'user'),
    validation.template,
  ])

  const refreshed = await registryService.listTemplates()
  const duplicated = findSelectedTemplate(refreshed, {
    source: 'user',
    id: validation.template.id,
  })

  if (!duplicated) {
    return {
      operation: 'duplicate',
      status: 'failed',
      persisted: true,
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.target.id',
            'WORKFLOW_TEMPLATE_AUTHORING_FAILED',
            'Workflow template was written but could not be found after registry refresh.',
            validation.template.id,
          ),
        ],
      },
      invalidTemplates: refreshed.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template authoring operation failed.',
    }
  }

  const afterSummary = stableBasisHashProperty(summarizeTemplate(duplicated))
  const duplicatedAffectedTemplate = stableBasisHashProperty({
    source: duplicated.source,
    id: duplicated.id,
    name: duplicated.name,
    version: duplicated.version,
    ...(afterSummary.basisHash ? { basisHash: afterSummary.basisHash } : {}),
  } satisfies WorkflowTemplateAuthoringAffectedTemplate)

  const result = {
    operation: 'duplicate',
    status: 'succeeded',
    persisted: true,
    beforeSummary: summarizeTemplate(selected),
    validation: {
      valid: true,
      issues: [],
    },
    invalidTemplates: refreshed.invalidTemplates,
    nextAction: 'none',
    message: 'Workflow template duplicated.',
  } satisfies Omit<WorkflowTemplateAuthoringResult, 'affectedTemplate' | 'afterSummary'>
  Object.defineProperty(result, 'affectedTemplate', {
    get: () => stableBasisHashProperty({ ...duplicatedAffectedTemplate }),
    enumerable: true,
    configurable: false,
  })
  Object.defineProperty(result, 'afterSummary', {
    get: () => stableBasisHashProperty({ ...afterSummary }),
    enumerable: true,
    configurable: false,
  })
  return result as WorkflowTemplateAuthoringResult
}

async function executeDelete(
  input: WorkflowTemplateAuthoringDeleteInput,
  registryService: WorkflowTemplateRegistryService,
): Promise<WorkflowTemplateAuthoringResult> {
  let registry = await registryService.listTemplates()
  const selected = findSelectedTemplate(registry, input.selector)

  if (input.selector.source !== 'user') {
    return {
      operation: 'delete',
      status: 'rejected',
      persisted: false,
      affectedTemplate: selected
        ? affectedTemplate(selected, { includeBasisHash: false })
        : {
            source: input.selector.source,
            id: input.selector.id,
          },
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.selector.source',
            'WORKFLOW_TEMPLATE_INVALID_SOURCE',
            'Workflow template source must be user.',
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template source must be user.',
    }
  }

  if (!selected) {
    return {
      operation: 'delete',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: input.selector.source,
        id: input.selector.id,
      },
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.selector',
            'WORKFLOW_TEMPLATE_TARGET_NOT_FOUND',
            `No user workflow template was found for id "${input.selector.id}".`,
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template target was not found.',
    }
  }

  registry = await registryService.listTemplates()
  const current = findSelectedTemplate(registry, input.selector)
  if (!current) {
    return {
      operation: 'delete',
      status: 'rejected',
      persisted: false,
      affectedTemplate: {
        source: input.selector.source,
        id: input.selector.id,
      },
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.selector',
            'WORKFLOW_TEMPLATE_TARGET_NOT_FOUND',
            `No user workflow template was found for id "${input.selector.id}".`,
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template target was not found.',
    }
  }

  const currentBasisHash = workflowTemplateBasisHash(current)
  if (input.basisHash !== currentBasisHash) {
    return {
      operation: 'delete',
      status: 'rejected',
      persisted: false,
      affectedTemplate: affectedTemplate(current),
      beforeSummary: summarizeTemplate(current),
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$.basisHash',
            'WORKFLOW_TEMPLATE_STALE_BASIS',
            'Workflow template basis is stale; inspect the template and retry with the current basisHash.',
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'inspect-and-retry',
      message: 'Workflow template basis is stale; inspect the template and retry with the current basisHash.',
    }
  }

  const beforeSummary = summarizeTemplate(current)
  const deletedAffectedTemplate = {
    source: current.source,
    id: current.id,
    name: current.name,
    version: current.version,
    ...(beforeSummary.basisHash ? { basisHash: beforeSummary.basisHash } : {}),
  } satisfies WorkflowTemplateAuthoringAffectedTemplate

  await registryService.writeTemplates(registry.templates.filter((template) =>
    template.source === 'user' && template.id !== input.selector.id
  ))
  await registryService.deleteStoredWorkflowPack(input.selector.id)

  const refreshed = await registryService.listTemplates()

  return {
    operation: 'delete',
    status: 'succeeded',
    persisted: true,
    affectedTemplate: deletedAffectedTemplate,
    beforeSummary,
    validation: {
      valid: true,
      issues: [],
    },
    templates: refreshed.templates.map(summarizeTemplate),
    invalidTemplates: refreshed.invalidTemplates,
    nextAction: 'none',
    message: 'Workflow template deleted.',
  }
}

export async function executeWorkflowTemplateAuthoringOperation(
  input: WorkflowTemplateAuthoringOperationInput,
  context: WorkflowTemplateAuthoringServiceContext = {},
): Promise<WorkflowTemplateAuthoringResult> {
  const registryService = context.registry ?? new WorkflowTemplateRegistryService()

  try {
    switch (input.operation) {
      case 'guide':
        return await executeGuide(input)
      case 'skill_catalog':
        return await executeSkillCatalog(input as WorkflowTemplateAuthoringSkillCatalogInput)
      case 'skill_create':
        return await executeSkillCreate(input as WorkflowTemplateAuthoringSkillCreateInput)
      case 'list':
        return await executeList(input, registryService)
      case 'inspect':
        return await executeInspect(input, registryService)
      case 'validate':
        return await executeValidate(input, registryService)
      case 'create':
        return await executeCreate(input as WorkflowTemplateAuthoringCreateInput, registryService)
      case 'update':
        return await executeUpdate(input as WorkflowTemplateAuthoringUpdateInput, registryService)
      case 'duplicate':
        return await executeDuplicate(input as WorkflowTemplateAuthoringDuplicateInput, registryService)
      case 'delete':
        return await executeDelete(input as WorkflowTemplateAuthoringDeleteInput, registryService)
    }
  } catch (error) {
    return {
      operation: input.operation,
      status: 'failed',
      persisted: false,
      validation: {
        valid: false,
        issues: [
          authoringIssue(
            '$',
            'WORKFLOW_TEMPLATE_AUTHORING_FAILED',
            error instanceof Error ? error.message : String(error),
          ),
        ],
      },
      nextAction: 'repair-and-validate',
      message: 'Workflow template authoring operation failed.',
    }
  }
}

export class WorkflowTemplateAuthoringService {
  constructor(
    private readonly registry = new WorkflowTemplateRegistryService(),
  ) {}

  async execute(
    input: WorkflowTemplateAuthoringOperationInput,
  ): Promise<WorkflowTemplateAuthoringResult> {
    return executeWorkflowTemplateAuthoringOperation(input, {
      registry: this.registry,
    })
  }
}
