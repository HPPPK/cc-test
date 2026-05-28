import { createHash } from 'node:crypto'

import {
  WorkflowTemplateRegistryService,
  type WorkflowTemplateRegistryListResult,
  type WorkflowTemplateRegistryTemplate,
} from './workflowTemplateRegistryService.js'
import { workflowTemplateAuthoringGuide, type WorkflowTemplateAuthoringGuide } from './workflowTemplateAuthoringGuide.js'
import {
  isNonEmptyString,
  normalizeStringList,
  validateAndNormalizeWorkflowTemplate,
  type WorkflowTemplateValidationIssue,
} from './workflowTemplateValidation.js'
import type { WorkflowTemplateSource } from './workflowTypes.js'

export type WorkflowTemplateAuthoringOperationName =
  | 'guide'
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
  operation: 'create' | 'update' | 'duplicate' | 'delete'
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
  | 'copy-builtin-first'
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

export type WorkflowTemplateBasis = {
  source: WorkflowTemplateSource
  id: string
  basisHash: string
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

function matchesSource(
  template: WorkflowTemplateRegistryTemplate,
  source: WorkflowTemplateAuthoringListInput['source'],
): boolean {
  return source === undefined || source === 'all' || template.source === source
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

  return {
    operation: 'validate',
    status: validation.issues.length === 0 ? 'validated' : 'rejected',
    persisted: false,
    ...(normalized ? { affectedTemplate: affectedTemplate(normalized, { includeBasisHash: false }) } : {}),
    validation: {
      valid: validation.issues.length === 0,
      issues: validation.issues,
    },
    invalidTemplates: registry.invalidTemplates,
    ...(normalized ? { template: cloneJson(normalized) } : {}),
    nextAction: validation.issues.length === 0 ? 'none' : 'repair-and-validate',
    message: validation.issues.length === 0
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
      issue.code === 'WORKFLOW_TEMPLATE_CONFLICT' ||
      issue.code === 'WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT'
    )
    const conflictSource: WorkflowTemplateSource = conflictIssue?.code === 'WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT'
      ? 'builtin'
      : 'user'

    return {
      operation: 'create',
      status: 'rejected',
      persisted: false,
      ...(conflictIssue?.templateId
        ? {
            affectedTemplate: {
              source: conflictSource,
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
            'WORKFLOW_TEMPLATE_BUILTIN_READONLY',
            'Builtin workflow templates are read-only; duplicate the template before editing.',
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'copy-builtin-first',
      message: 'Builtin workflow templates are read-only; duplicate the template before editing.',
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
      issue.code === 'WORKFLOW_TEMPLATE_CONFLICT' ||
      issue.code === 'WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT'
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
            'WORKFLOW_TEMPLATE_BUILTIN_READONLY',
            'Builtin workflow templates are read-only; duplicate the template before editing.',
            input.selector.id,
          ),
        ],
      },
      invalidTemplates: registry.invalidTemplates,
      nextAction: 'copy-builtin-first',
      message: 'Builtin workflow templates are read-only; duplicate the template before editing.',
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
