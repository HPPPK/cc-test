import type {
  EffortMode,
  WorkflowLabel,
  WorkflowPhaseActionPolicy,
  WorkflowPhaseConstraintStrength,
  WorkflowPhaseModePolicy,
  WorkflowPhasePrompt,
  WorkflowPhaseOutputArtifact,
  WorkflowPhaseRuntimeContract,
  WorkflowPhaseSkipPolicy,
  WorkflowPhaseSkillSource,
  WorkflowSkillBinding,
  WorkflowSkillBindingMode,
  WorkflowPhaseToolPolicy,
  WorkflowTemplateSource,
} from './workflowTypes.js'
import {
  WORKFLOW_EFFORT_MODES,
  WORKFLOW_LABELS,
} from './workflowTypes.js'
import { WORKFLOW_PHASE_CONFIGURABLE_TOOL_NAMES } from './workflowToolPolicy.js'

export const WORKFLOW_TEMPLATE_SCHEMA_VERSION = 1
export const WORKFLOW_TEMPLATE_SUPPORTED_SCHEMA_VERSIONS = [1, 2] as const

export type WorkflowTemplateValidationIssueSource =
  | 'user-config'
  | 'builtin'
  | 'request'
  | 'import'
  | 'authoring'

export type WorkflowTemplateValidationIssue = {
  source: WorkflowTemplateValidationIssueSource
  templateId?: string
  path: string
  code: string
  message: string
  severity: 'error' | 'warning'
}

export type WorkflowTemplateRegistrySkillDeclaration = {
  name: string
  mode?: 'recommended'
  source?: WorkflowPhaseSkillSource
  pluginName?: string
  namespace?: string
  version?: string
  contentHash?: string
  referenceId?: string
  reason?: string
  [key: string]: unknown
}

export type WorkflowTemplateRegistrySkillBinding = string | WorkflowSkillBinding

export type WorkflowTemplateRegistryRequiredArtifact = {
  id: string
  name?: string
  description?: string
  required: boolean
  [key: string]: unknown
}

export type WorkflowTemplateRegistryOutputArtifact = {
  id: string
  name: string
  kind: string
  description: string
  required: true
  sections?: string[]
  [key: string]: unknown
}

export type WorkflowTemplateRegistryCompletionCriteria = {
  type: 'manual-checklist' | 'artifact-required' | 'agent-reported'
  description: string
  [key: string]: unknown
}

export type WorkflowTemplateRegistryTransitionPolicy = {
  authority: 'auto' | 'user-confirmation' | 'artifact-gate' | 'user-choice'
  [key: string]: unknown
}

export type WorkflowTemplateRegistryPhase = {
  id: string
  name: string
  instructions: string
  appliesTo?: WorkflowLabel[]
  skipWhen?: WorkflowPhaseSkipPolicy
  modePolicy?: WorkflowPhaseModePolicy
  requestedModel?: unknown
  objective?: string
  requiredIntake?: string[]
  handoffRules?: string[]
  executionRules?: string[]
  outputArtifact?: WorkflowTemplateRegistryOutputArtifact
  outputArtifacts?: WorkflowPhaseOutputArtifact[]
  skills: WorkflowTemplateRegistrySkillDeclaration[]
  skillBindings?: WorkflowTemplateRegistrySkillBinding[]
  requiredArtifacts: WorkflowTemplateRegistryRequiredArtifact[]
  completionCriteria: WorkflowTemplateRegistryCompletionCriteria
  transition: WorkflowTemplateRegistryTransitionPolicy
  runtimeContract?: WorkflowPhaseRuntimeContract
  intent?: {
    objective: string
    role: string
    intake: string[]
    strength?: WorkflowPhaseConstraintStrength
    [key: string]: unknown
  }
  contract?: {
    instructions: string
    executionRules: string[]
    actionPolicy?: WorkflowPhaseActionPolicy & {
      strength?: WorkflowPhaseConstraintStrength
      [key: string]: unknown
    }
    transitionAuthority: 'auto' | 'user-confirmation' | 'artifact-gate' | 'user-choice'
    [key: string]: unknown
  }
  evidencePolicy?: {
    outputArtifact: WorkflowTemplateRegistryOutputArtifact
    requiredArtifacts: WorkflowTemplateRegistryRequiredArtifact[]
    completionCriteria: WorkflowTemplateRegistryCompletionCriteria
    handoffRules: string[]
    [key: string]: unknown
  }
  actionPolicy?: WorkflowPhaseActionPolicy
  toolPolicy?: WorkflowPhaseToolPolicy
  phasePrompt?: WorkflowPhasePrompt
  [key: string]: unknown
}

export type WorkflowTemplateRegistryTemplate = {
  schemaVersion: 1 | 2
  id: string
  source: WorkflowTemplateSource
  version: string
  name: string
  description: string
  labels?: WorkflowLabel[]
  routingPolicy?: Record<string, unknown>
  stopConditions?: string[]
  phases: WorkflowTemplateRegistryPhase[]
  [key: string]: unknown
}

export type WorkflowTemplateValidationRegistryContext = {
  templates: Array<{
    id: string
    source: WorkflowTemplateSource
  }>
}

export type ValidateWorkflowTemplateOptions = {
  basePath?: string
  source?: WorkflowTemplateValidationIssueSource
  registry?: WorkflowTemplateValidationRegistryContext
  allowExistingId?: string
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : []
}

export function isWorkflowLabel(value: unknown): value is WorkflowLabel {
  return typeof value === 'string' && (WORKFLOW_LABELS as readonly string[]).includes(value)
}

export function isEffortMode(value: unknown): value is EffortMode {
  return typeof value === 'string' && (WORKFLOW_EFFORT_MODES as readonly string[]).includes(value)
}

export function normalizeWorkflowLabels(value: unknown): {
  labels: WorkflowLabel[]
  invalidIndexes: number[]
} {
  if (!Array.isArray(value)) return { labels: [], invalidIndexes: [] }
  const labels: WorkflowLabel[] = []
  const invalidIndexes: number[] = []
  value.forEach((label, index) => {
    if (!isWorkflowLabel(label)) {
      invalidIndexes.push(index)
      return
    }
    if (!labels.includes(label)) labels.push(label)
  })
  return { labels, invalidIndexes }
}

function normalizeEffortModes(value: unknown): {
  efforts: EffortMode[]
  invalidIndexes: number[]
} {
  if (!Array.isArray(value)) return { efforts: [], invalidIndexes: [] }
  const efforts: EffortMode[] = []
  const invalidIndexes: number[] = []
  value.forEach((effort, index) => {
    if (!isEffortMode(effort)) {
      invalidIndexes.push(index)
      return
    }
    if (!efforts.includes(effort)) efforts.push(effort)
  })
  return { efforts, invalidIndexes }
}

export function workflowTemplateValidationIssue(
  source: WorkflowTemplateValidationIssueSource,
  pathValue: string,
  code: string,
  message: string,
  templateId?: string,
): WorkflowTemplateValidationIssue {
  return {
    source,
    templateId,
    path: pathValue,
    code,
    message,
    severity: 'error',
  }
}

export function workflowTemplateValidationWarning(
  source: WorkflowTemplateValidationIssueSource,
  pathValue: string,
  code: string,
  message: string,
  templateId?: string,
): WorkflowTemplateValidationIssue {
  return {
    source,
    templateId,
    path: pathValue,
    code,
    message,
    severity: 'warning',
  }
}

export function normalizeRequiredArtifacts(value: unknown): WorkflowTemplateRegistryRequiredArtifact[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isRecord)
    .filter((artifact) => isNonEmptyString(artifact.id))
    .map((artifact) => ({
      ...artifact,
      id: artifact.id as string,
      name: isNonEmptyString(artifact.name) ? artifact.name : undefined,
      description: isNonEmptyString(artifact.description) ? artifact.description : undefined,
      required: typeof artifact.required === 'boolean' ? artifact.required : false,
    }))
}

export function normalizeOutputArtifact(value: unknown): WorkflowTemplateRegistryOutputArtifact | null {
  if (!isRecord(value)) return null
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.kind) ||
    !isNonEmptyString(value.description) ||
    value.required !== true
  ) {
    return null
  }

  return {
    ...value,
    id: value.id,
    name: value.name,
    kind: value.kind,
    description: value.description,
    required: true,
    ...(Array.isArray(value.sections) ? { sections: normalizeStringList(value.sections) } : {}),
  }
}

export function normalizeSkills(value: unknown): WorkflowTemplateRegistrySkillDeclaration[] {
  return normalizePhaseSkillReferences(value).references
}

export function normalizePhaseSkillReferences(value: unknown): {
  references: WorkflowTemplateRegistrySkillDeclaration[]
  invalidIndexes: number[]
} {
  if (!Array.isArray(value)) return { references: [], invalidIndexes: [] }

  const references: WorkflowTemplateRegistrySkillDeclaration[] = []
  const invalidIndexes: number[] = []

  value.forEach((skill, index) => {
    if (isNonEmptyString(skill)) {
      references.push({
        name: skill.trim(),
        mode: 'recommended',
        source: 'fallback',
      })
      return
    }

    if (!isRecord(skill)) {
      invalidIndexes.push(index)
      return
    }

    const name = typeof skill.name === 'string' ? skill.name.trim() : skill.name
    const mode = skill.mode ?? 'recommended'
    if (!isNonEmptyString(name) || mode !== 'recommended') {
      invalidIndexes.push(index)
      return
    }

    references.push({
      ...skill,
      name,
      mode: 'recommended',
      source: isWorkflowPhaseSkillSource(skill.source) ? skill.source : undefined,
      pluginName: isNonEmptyString(skill.pluginName) ? skill.pluginName : undefined,
      namespace: isNonEmptyString(skill.namespace) ? skill.namespace : undefined,
      version: isNonEmptyString(skill.version) ? skill.version : undefined,
      contentHash: isNonEmptyString(skill.contentHash) ? skill.contentHash : undefined,
      referenceId: isNonEmptyString(skill.referenceId) ? skill.referenceId : undefined,
      reason: isNonEmptyString(skill.reason) ? skill.reason : undefined,
    })
  })

  return { references, invalidIndexes }
}

function hasInvalidPluginProvenance(value: unknown): boolean {
  if (!Array.isArray(value)) return false

  return value.some((skill) => {
    if (!isRecord(skill)) return false
    if (skill.source !== 'plugin') return false

    return !isNonEmptyString(skill.pluginName)
  })
}

export function normalizeCompletionCriteria(value: unknown): WorkflowTemplateRegistryCompletionCriteria | null {
  if (!isRecord(value)) return null
  if (
    value.type !== 'manual-checklist' &&
    value.type !== 'artifact-required' &&
    value.type !== 'agent-reported'
  ) {
    return null
  }
  if (!isNonEmptyString(value.description)) return null

  return {
    ...value,
    type: value.type,
    description: value.description,
  }
}

export function normalizeTransition(value: unknown): WorkflowTemplateRegistryTransitionPolicy | null {
  if (!isRecord(value)) return null
  if (
    value.authority !== 'auto' &&
    value.authority !== 'user-confirmation' &&
    value.authority !== 'artifact-gate' &&
    value.authority !== 'user-choice'
  ) return null

  return {
    ...value,
    authority: value.authority,
  }
}

function isWorkflowSkillBindingMode(value: unknown): value is WorkflowSkillBindingMode {
  return value === 'native-if-installed' ||
    value === 'fallback-contract' ||
    value === 'native-if-installed-else-fallback-contract' ||
    value === 'disabled'
}

export function normalizeSkillBindings(value: unknown): {
  bindings: WorkflowTemplateRegistrySkillBinding[]
  invalidIndexes: number[]
} {
  if (!Array.isArray(value)) return { bindings: [], invalidIndexes: [] }

  const bindings: WorkflowTemplateRegistrySkillBinding[] = []
  const invalidIndexes: number[] = []

  value.forEach((binding, index) => {
    if (isNonEmptyString(binding)) {
      bindings.push(binding)
      return
    }
    if (!isRecord(binding) || !isNonEmptyString(binding.id)) {
      invalidIndexes.push(index)
      return
    }
    if (binding.mode !== undefined && !isWorkflowSkillBindingMode(binding.mode)) {
      invalidIndexes.push(index)
      return
    }
    bindings.push({
      id: binding.id,
      ...(binding.mode ? { mode: binding.mode } : {}),
    })
  })

  return { bindings, invalidIndexes }
}

export function normalizeRuntimeContract(value: unknown): WorkflowPhaseRuntimeContract | undefined {
  if (!isRecord(value)) return undefined
  const contract: WorkflowPhaseRuntimeContract = {
    ...(Array.isArray(value.allowedActions) ? { allowedActions: normalizeStringList(value.allowedActions) } : {}),
    ...(Array.isArray(value.forbiddenActions) ? { forbiddenActions: normalizeStringList(value.forbiddenActions) } : {}),
    ...(Array.isArray(value.allowedTools) ? { allowedTools: normalizeStringList(value.allowedTools) } : {}),
    ...(Array.isArray(value.disallowedTools) ? { disallowedTools: normalizeStringList(value.disallowedTools) } : {}),
    ...(Array.isArray(value.mustProduce) ? { mustProduce: normalizeStringList(value.mustProduce) } : {}),
    ...(Array.isArray(value.completionRequires) ? { completionRequires: normalizeStringList(value.completionRequires) } : {}),
    ...(isRecord(value.questionPolicy) ? { questionPolicy: value.questionPolicy } : {}),
    ...(isRecord(value.explorationPolicy) ? { explorationPolicy: value.explorationPolicy } : {}),
  }

  if (isRecord(value.toolAccess)) {
    contract.toolAccess = {
      ...(Array.isArray(value.toolAccess.allowed) ? { allowed: normalizeStringList(value.toolAccess.allowed) } : {}),
      ...(Array.isArray(value.toolAccess.forbidden) ? { forbidden: normalizeStringList(value.toolAccess.forbidden) } : {}),
      ...(Array.isArray(value.toolAccess.requiresExplicitUserConfirmation)
        ? { requiresExplicitUserConfirmation: normalizeStringList(value.toolAccess.requiresExplicitUserConfirmation) }
        : {}),
      ...(typeof value.toolAccess.maxRepairLoops === 'number'
        ? { maxRepairLoops: value.toolAccess.maxRepairLoops }
        : {}),
      ...(isNonEmptyString(value.toolAccess.repairLoopAllowedTo)
        ? { repairLoopAllowedTo: value.toolAccess.repairLoopAllowedTo }
        : {}),
    }
  }

  return Object.keys(contract).length ? contract : undefined
}

export function normalizeOutputArtifacts(value: unknown): WorkflowPhaseOutputArtifact[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .filter((artifact) => isNonEmptyString(artifact.id) && isNonEmptyString(artifact.kind))
    .map((artifact) => {
      const requiredWhen = normalizeWorkflowLabels(artifact.requiredWhen)
      return {
        ...artifact,
        id: artifact.id,
        kind: artifact.kind,
        ...(isNonEmptyString(artifact.filename) ? { filename: artifact.filename } : {}),
        ...(typeof artifact.required === 'boolean' ? { required: artifact.required } : {}),
        ...(requiredWhen.labels.length ? { requiredWhen: requiredWhen.labels } : {}),
        ...(isNonEmptyString(artifact.description) ? { description: artifact.description } : {}),
      }
    })
}

function normalizeSkipWhen(value: unknown): {
  policy?: WorkflowPhaseSkipPolicy
  invalidLabelIndexes: number[]
  invalidEffortIndexes: number[]
} {
  if (!isRecord(value)) {
    return { invalidLabelIndexes: [], invalidEffortIndexes: [] }
  }
  const labels = normalizeWorkflowLabels(value.labels)
  const efforts = normalizeEffortModes(value.efforts)
  const policy: WorkflowPhaseSkipPolicy = {
    ...(labels.labels.length ? { labels: labels.labels } : {}),
    ...(efforts.efforts.length ? { efforts: efforts.efforts } : {}),
  }
  return {
    policy: Object.keys(policy).length ? policy : undefined,
    invalidLabelIndexes: labels.invalidIndexes,
    invalidEffortIndexes: efforts.invalidIndexes,
  }
}

function normalizeModePolicy(value: unknown): WorkflowPhaseModePolicy | undefined {
  if (!isRecord(value)) return undefined
  const modePolicy: WorkflowPhaseModePolicy = {
    ...(isNonEmptyString(value.light) ? { light: value.light } : {}),
    ...(isNonEmptyString(value.standard) ? { standard: value.standard } : {}),
    ...(isNonEmptyString(value.heavy) ? { heavy: value.heavy } : {}),
  }
  return Object.keys(modePolicy).length ? modePolicy : undefined
}

export function normalizeActionPolicy(value: unknown): WorkflowPhaseActionPolicy | undefined {
  if (!isRecord(value)) return undefined
  const allowedActions = Array.isArray(value.allowedActions)
    ? value.allowedActions.filter(isNonEmptyString)
    : []
  const forbiddenActions = Array.isArray(value.forbiddenActions)
    ? value.forbiddenActions.filter(isNonEmptyString)
    : []

  if (allowedActions.length === 0 && forbiddenActions.length === 0) return undefined
  return {
    allowedActions,
    forbiddenActions,
  }
}

const CONFIGURABLE_WORKFLOW_TOOL_NAME_SET = new Set<string>(WORKFLOW_PHASE_CONFIGURABLE_TOOL_NAMES)

export function normalizeToolPolicy(value: unknown): {
  policy?: WorkflowPhaseToolPolicy
  unknownTools: string[]
  invalidShape: boolean
} {
  if (!isRecord(value)) return { unknownTools: [], invalidShape: false }
  if (!Array.isArray(value.allowedTools)) {
    return { unknownTools: [], invalidShape: true }
  }

  const allowedTools = Array.from(new Set(
    value.allowedTools
      .filter(isNonEmptyString)
      .map((tool) => tool.trim()),
  ))
  const unknownTools = allowedTools.filter((tool) => !CONFIGURABLE_WORKFLOW_TOOL_NAME_SET.has(tool))
  const disallowedTools = Array.isArray(value.disallowedTools)
    ? Array.from(new Set(value.disallowedTools.filter(isNonEmptyString).map((tool) => tool.trim())))
    : undefined
  const unknownDisallowedTools = (disallowedTools ?? []).filter((tool) => !CONFIGURABLE_WORKFLOW_TOOL_NAME_SET.has(tool))
  unknownTools.push(...unknownDisallowedTools)
  if (unknownTools.length > 0) {
    return { unknownTools, invalidShape: false }
  }

  return {
    policy: {
      ...value,
      allowedTools,
      ...(disallowedTools ? { disallowedTools } : {}),
    },
    unknownTools: [],
    invalidShape: false,
  }
}

export function normalizePhasePrompt(value: unknown): WorkflowPhasePrompt | undefined {
  if (!isRecord(value)) return undefined
  if (!isNonEmptyString(value.objective)) return undefined
  if (!isRecord(value.outputArtifact)) return undefined
  if (!isNonEmptyString(value.outputArtifact.name)) return undefined

  const handoffInput = normalizeStringList(value.handoffInput)
  const executionRules = normalizeStringList(value.executionRules)
  const sections = normalizeStringList(value.outputArtifact.sections)
  const completionRules = normalizeStringList(value.completionRules)

  if (
    handoffInput.length === 0 &&
    executionRules.length === 0 &&
    sections.length === 0 &&
    completionRules.length === 0
  ) {
    return undefined
  }

  return {
    objective: value.objective,
    handoffInput,
    executionRules,
    outputArtifact: {
      name: value.outputArtifact.name,
      sections,
    },
    completionRules,
  }
}

export function validateLinearOnlyWorkflowTemplate(
  template: Record<string, unknown>,
  templatePath: string,
  source: WorkflowTemplateValidationIssueSource,
  templateId: string | undefined,
): WorkflowTemplateValidationIssue[] {
  const issues: WorkflowTemplateValidationIssue[] = []

  if ('parallelPhases' in template || 'parallel' in template) {
    issues.push(workflowTemplateValidationIssue(
      source,
      templatePath,
      'WORKFLOW_TEMPLATE_PARALLEL_UNSUPPORTED',
      'Parallel workflow definitions are not supported in the first release.',
      templateId,
    ))
  }

  if ('workflows' in template || 'nestedWorkflows' in template || 'childWorkflows' in template) {
    issues.push(workflowTemplateValidationIssue(
      source,
      templatePath,
      'WORKFLOW_TEMPLATE_NESTED_UNSUPPORTED',
      'Nested workflow definitions are not supported in the first release.',
      templateId,
    ))
  }

  const phases = Array.isArray(template.phases) ? template.phases : []
  phases.forEach((phase, phaseIndex) => {
    if (!isRecord(phase)) return
    const transition = isRecord(phase.transition) ? phase.transition : {}
    if ('branches' in transition || 'branch' in transition || 'next' in transition || 'edges' in transition) {
      issues.push(workflowTemplateValidationIssue(
        source,
        `${templatePath}.phases[${phaseIndex}].transition`,
        'WORKFLOW_TEMPLATE_BRANCHING_UNSUPPORTED',
        'Branching workflow definitions are not supported in the first release.',
        templateId,
      ))
    }
    if ('loop' in transition || 'repeat' in transition || 'until' in transition) {
      issues.push(workflowTemplateValidationIssue(
        source,
        `${templatePath}.phases[${phaseIndex}].transition`,
        'WORKFLOW_TEMPLATE_LOOP_UNSUPPORTED',
        'Loop workflow definitions are not supported in the first release.',
        templateId,
      ))
    }
  })

  return issues
}

export function validateAndNormalizeWorkflowTemplate(
  value: unknown,
  options: ValidateWorkflowTemplateOptions = {},
): { template: WorkflowTemplateRegistryTemplate | null, issues: WorkflowTemplateValidationIssue[] } {
  const templatePath = options.basePath ?? '$.template'
  const source = options.source ?? 'request'
  if (!isRecord(value)) {
    return {
      template: null,
      issues: [
        workflowTemplateValidationIssue(
          source,
          templatePath,
          source === 'user-config' ? 'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD' : 'WORKFLOW_TEMPLATE_INVALID',
          'Template must be an object.',
        ),
      ],
    }
  }

  const templateId = isNonEmptyString(value.id) ? value.id : undefined
  const issues: WorkflowTemplateValidationIssue[] = []
  const templateSchemaVersion = value.schemaVersion === 2 ? 2 : 1

  if (
    value.schemaVersion !== undefined &&
    value.schemaVersion !== 1 &&
    value.schemaVersion !== 2
  ) {
    issues.push(workflowTemplateValidationIssue(
      source,
      `${templatePath}.schemaVersion`,
      'WORKFLOW_TEMPLATE_SCHEMA_VERSION_UNSUPPORTED',
      'Template schemaVersion must be 1 or 2.',
      templateId,
    ))
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.version) ||
    !isNonEmptyString(value.name) ||
    !Array.isArray(value.phases)
  ) {
    issues.push(workflowTemplateValidationIssue(
      source,
      templatePath,
      'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
      'Template requires id, version, name, and phases fields.',
      templateId,
    ))
  }

  if (isNonEmptyString(value.id) && /[\\/]/.test(value.id)) {
    issues.push(workflowTemplateValidationIssue(
      source,
      `${templatePath}.id`,
      'WORKFLOW_TEMPLATE_INVALID_ID',
      'Template id must be a stable slug and cannot contain path separators.',
      templateId,
    ))
  }

  if (
    isNonEmptyString(value.id) &&
    value.id !== options.allowExistingId &&
    options.registry?.templates.some((template) => template.id === value.id)
  ) {
    issues.push(workflowTemplateValidationIssue(
      source,
      `${templatePath}.id`,
      'WORKFLOW_TEMPLATE_CONFLICT',
      'A user workflow template with this id already exists.',
      templateId,
    ))
  }

  if (!Array.isArray(value.phases) || value.phases.length === 0) {
    issues.push(workflowTemplateValidationIssue(
      source,
      `${templatePath}.phases`,
      'WORKFLOW_TEMPLATE_INVALID_PHASES',
      'Template phases must be a non-empty ordered array.',
      templateId,
    ))
  }

  const templateLabels = normalizeWorkflowLabels(value.labels)
  templateLabels.invalidIndexes.forEach((labelIndex) => {
    issues.push(workflowTemplateValidationIssue(
      source,
      `${templatePath}.labels[${labelIndex}]`,
      'WORKFLOW_LABEL_INVALID',
      'Workflow template label is not supported.',
      templateId,
    ))
  })

  issues.push(...validateLinearOnlyWorkflowTemplate(value, templatePath, source, templateId))

  const normalizedPhases: WorkflowTemplateRegistryPhase[] = []
  const phaseIds = new Set<string>()
  if (Array.isArray(value.phases)) {
    value.phases.forEach((phase, phaseIndex) => {
      const phasePath = `${templatePath}.phases[${phaseIndex}]`
      if (!isRecord(phase)) {
        issues.push(workflowTemplateValidationIssue(
          source,
          phasePath,
          'WORKFLOW_TEMPLATE_INVALID_PHASES',
          'Phase must be an object.',
          templateId,
        ))
        return
      }
      const phaseForValidation = projectPhaseForValidation(phase)
      const groupedContract = projectGroupedPhaseContract(phase)

      invalidStrengthIssuePaths(phase, phasePath).forEach((issuePath) => {
        issues.push(workflowTemplateValidationIssue(
          source,
          issuePath,
          'WORKFLOW_PHASE_CONSTRAINT_STRENGTH_INVALID',
          'Grouped phase constraint strength does not match its contract section.',
          templateId,
        ))
      })

      if (!isNonEmptyString(phaseForValidation.id)) {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.id`,
          'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
          'Phase requires an id.',
          templateId,
        ))
      } else if (phaseIds.has(phaseForValidation.id)) {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.id`,
          'WORKFLOW_PHASE_DUPLICATE_ID',
          'Phase ids must be unique within a template.',
          templateId,
        ))
      } else {
        phaseIds.add(phaseForValidation.id)
      }

      if (!isNonEmptyString(phaseForValidation.name) || !isNonEmptyString(phaseForValidation.instructions)) {
        issues.push(workflowTemplateValidationIssue(
          source,
          phasePath,
          'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
          'Phase requires name and instructions fields.',
          templateId,
        ))
      }

      const completionCriteria = normalizeCompletionCriteria(phaseForValidation.completionCriteria)
      if (!completionCriteria) {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.completionCriteria`,
          'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
          'Phase requires valid completion criteria.',
          templateId,
        ))
      }

      const outputArtifact = normalizeOutputArtifact(phaseForValidation.outputArtifact)
      if (!outputArtifact) {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.outputArtifact`,
          'WORKFLOW_PHASE_OUTPUT_ARTIFACT_REQUIRED',
          'Phase requires a first-class required output artifact contract.',
          templateId,
        ))
      }

      const requiredIntake = normalizeStringList(phaseForValidation.requiredIntake)
      const handoffRules = normalizeStringList(phaseForValidation.handoffRules)
      const hasHandoff = requiredIntake.length > 0 && handoffRules.length > 0
      if (!hasHandoff) {
        issues.push(workflowTemplateValidationIssue(
          source,
          phasePath,
          'WORKFLOW_PHASE_HANDOFF_REQUIRED',
          'Phase requires first-class handoff intake and handoff rules.',
          templateId,
        ))
      }

      const transition = normalizeTransition(phaseForValidation.transition)
      if (!transition) {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.transition`,
          'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
          'Phase requires a valid transition authority.',
          templateId,
        ))
      }

      const normalizedSkills = normalizePhaseSkillReferences(phaseForValidation.skills)
      normalizedSkills.invalidIndexes.forEach((skillIndex) => {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.skills[${skillIndex}]`,
          'WORKFLOW_PHASE_SKILL_INVALID_REFERENCE',
          'Workflow phase skill reference requires a non-empty name and recommended mode.',
          templateId,
        ))
      })
      if (hasInvalidPluginProvenance(phaseForValidation.skills)) {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.skills`,
          'WORKFLOW_PHASE_SKILL_INVALID_PROVENANCE',
          'Plugin phase skill references require non-empty plugin provenance.',
          templateId,
        ))
      }
      const normalizedSkillBindings = normalizeSkillBindings(phaseForValidation.skillBindings)
      normalizedSkillBindings.invalidIndexes.forEach((bindingIndex) => {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.skillBindings[${bindingIndex}]`,
          'WORKFLOW_PHASE_SKILL_BINDING_INVALID_REFERENCE',
          'Workflow phase skill binding requires a skill id and a supported binding mode.',
          templateId,
        ))
      })

      const appliesTo = normalizeWorkflowLabels(phaseForValidation.appliesTo)
      appliesTo.invalidIndexes.forEach((labelIndex) => {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.appliesTo[${labelIndex}]`,
          'WORKFLOW_LABEL_INVALID',
          'Workflow phase appliesTo label is not supported.',
          templateId,
        ))
      })
      const skipWhen = normalizeSkipWhen(phaseForValidation.skipWhen)
      skipWhen.invalidLabelIndexes.forEach((labelIndex) => {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.skipWhen.labels[${labelIndex}]`,
          'WORKFLOW_LABEL_INVALID',
          'Workflow phase skipWhen label is not supported.',
          templateId,
        ))
      })
      skipWhen.invalidEffortIndexes.forEach((effortIndex) => {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.skipWhen.efforts[${effortIndex}]`,
          'WORKFLOW_EFFORT_INVALID',
          'Workflow phase skipWhen effort is not supported.',
          templateId,
        ))
      })
      const modePolicy = normalizeModePolicy(phaseForValidation.modePolicy)
      if (phaseForValidation.modePolicy !== undefined && !isRecord(phaseForValidation.modePolicy)) {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.modePolicy`,
          'WORKFLOW_PHASE_MODE_POLICY_INVALID',
          'Workflow phase modePolicy must be an object.',
          templateId,
        ))
      }

      if (
        isNonEmptyString(phaseForValidation.id) &&
        isNonEmptyString(phaseForValidation.name) &&
        isNonEmptyString(phaseForValidation.instructions) &&
        outputArtifact &&
        hasHandoff &&
        completionCriteria &&
        transition
      ) {
        const actionPolicy = normalizeActionPolicy(phaseForValidation.actionPolicy)
        const toolPolicyResult = normalizeToolPolicy(phaseForValidation.toolPolicy)
        if (toolPolicyResult.invalidShape) {
          issues.push(workflowTemplateValidationIssue(
            source,
            `${phasePath}.toolPolicy.allowedTools`,
            'WORKFLOW_PHASE_TOOL_POLICY_INVALID',
            'Workflow phase tool policy requires allowedTools to be an array of known tool names.',
            templateId,
          ))
        }
        toolPolicyResult.unknownTools.forEach((toolName) => {
          issues.push(workflowTemplateValidationIssue(
            source,
            `${phasePath}.toolPolicy.allowedTools`,
            'WORKFLOW_PHASE_TOOL_POLICY_UNKNOWN_TOOL',
            `Workflow phase tool policy contains an unknown tool: ${toolName}.`,
            templateId,
          ))
        })
        const phasePrompt = normalizePhasePrompt(phaseForValidation.phasePrompt)
        const runtimeContract = normalizeRuntimeContract(phaseForValidation.runtimeContract)
        const outputArtifacts = normalizeOutputArtifacts(phaseForValidation.outputArtifacts)
        normalizedPhases.push({
          ...stripRuntimeState(phase),
          id: phaseForValidation.id,
          name: phaseForValidation.name,
          instructions: phaseForValidation.instructions,
          ...(isNonEmptyString(phaseForValidation.objective) ? { objective: phaseForValidation.objective } : {}),
          requiredIntake,
          handoffRules,
          executionRules: normalizeExecutionRules(phaseForValidation.executionRules),
          outputArtifact,
          ...(outputArtifacts.length ? { outputArtifacts } : {}),
          skills: normalizedSkills.references,
          ...(normalizedSkillBindings.bindings.length ? { skillBindings: normalizedSkillBindings.bindings } : {}),
          requiredArtifacts: normalizeRequiredArtifacts(phaseForValidation.requiredArtifacts),
          completionCriteria,
          transition,
          intent: groupedContract.intent,
          contract: groupedContract.contract,
          evidencePolicy: groupedContract.evidencePolicy,
          ...(appliesTo.labels.length ? { appliesTo: appliesTo.labels } : {}),
          ...(skipWhen.policy ? { skipWhen: skipWhen.policy } : {}),
          ...(modePolicy ? { modePolicy } : {}),
          ...(actionPolicy ? { actionPolicy } : {}),
          ...(toolPolicyResult.policy ? { toolPolicy: toolPolicyResult.policy } : {}),
          ...(runtimeContract ? { runtimeContract } : {}),
          ...(phasePrompt ? { phasePrompt } : {}),
        })
      }
    })
  }

  if (issues.length > 0 || !templateId || !isNonEmptyString(value.version) || !isNonEmptyString(value.name)) {
    return { template: null, issues }
  }

  return {
    issues,
    template: {
      ...value,
      schemaVersion: templateSchemaVersion,
      id: templateId,
      source: 'user',
      version: value.version,
      name: value.name,
      description: isNonEmptyString(value.description) ? value.description : '',
      ...(templateLabels.labels.length ? { labels: templateLabels.labels } : {}),
      ...(isRecord(value.routingPolicy) ? { routingPolicy: value.routingPolicy } : {}),
      ...(normalizeStringList(value.stopConditions).length ? { stopConditions: normalizeStringList(value.stopConditions) } : {}),
      phases: normalizedPhases,
    },
  }
}

export function validateAndNormalizeUserConfigTemplate(
  value: unknown,
  index: number,
): { template: WorkflowTemplateRegistryTemplate | null, issues: WorkflowTemplateValidationIssue[] } {
  return validateAndNormalizeWorkflowTemplate(value, {
    basePath: `$.templates[${index}]`,
    source: 'user-config',
  })
}

function stripRuntimeState<T>(value: T): T {
  if (!isRecord(value)) return value
  const { runtimeState: _runtimeState, ...rest } = value
  return rest as T
}

function normalizeExecutionRules(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((rule) => {
    if (isNonEmptyString(rule)) return [rule]
    if (isRecord(rule) && isNonEmptyString(rule.text)) return [rule.text]
    return []
  })
}

function normalizeGroupedTransition(value: unknown): WorkflowTemplateRegistryTransitionPolicy | null {
  if (
    value !== 'auto' &&
    value !== 'user-confirmation' &&
    value !== 'artifact-gate' &&
    value !== 'user-choice'
  ) return null
  return { authority: value }
}

function projectPhaseForValidation(phase: Record<string, unknown>): Record<string, unknown> {
  const intent = isRecord(phase.intent) ? phase.intent : {}
  const contract = isRecord(phase.contract) ? phase.contract : {}
  const evidencePolicy = isRecord(phase.evidencePolicy) ? phase.evidencePolicy : {}

  const transition = normalizeTransition(phase.transition)
    ?? normalizeGroupedTransition(contract.transitionAuthority)

  return {
    ...stripRuntimeState(phase),
    name: isNonEmptyString(phase.name)
      ? phase.name
      : isNonEmptyString(intent.role)
        ? intent.role
        : phase.name,
    instructions: isNonEmptyString(phase.instructions)
      ? phase.instructions
      : isNonEmptyString(contract.instructions)
        ? contract.instructions
        : phase.instructions,
    objective: isNonEmptyString(phase.objective)
      ? phase.objective
      : isNonEmptyString(intent.objective)
        ? intent.objective
        : phase.objective,
    requiredIntake: normalizeStringList(phase.requiredIntake).length > 0
      ? phase.requiredIntake
      : normalizeStringList(intent.intake),
    handoffRules: normalizeStringList(phase.handoffRules).length > 0
      ? phase.handoffRules
      : normalizeStringList(evidencePolicy.handoffRules),
    executionRules: normalizeExecutionRules(phase.executionRules).length > 0
      ? phase.executionRules
      : normalizeExecutionRules(contract.executionRules),
    actionPolicy: isRecord(phase.actionPolicy)
      ? phase.actionPolicy
      : isRecord(contract.actionPolicy)
        ? contract.actionPolicy
        : phase.actionPolicy,
    toolPolicy: isRecord(phase.toolPolicy)
      ? phase.toolPolicy
      : isRecord(contract.toolPolicy)
        ? contract.toolPolicy
        : phase.toolPolicy,
    outputArtifact: isRecord(phase.outputArtifact)
      ? phase.outputArtifact
      : isRecord(evidencePolicy.outputArtifact)
        ? evidencePolicy.outputArtifact
        : phase.outputArtifact,
    requiredArtifacts: Array.isArray(phase.requiredArtifacts)
      ? phase.requiredArtifacts
      : Array.isArray(evidencePolicy.requiredArtifacts)
        ? evidencePolicy.requiredArtifacts
        : phase.requiredArtifacts,
    completionCriteria: isRecord(phase.completionCriteria)
      ? phase.completionCriteria
      : isRecord(evidencePolicy.completionCriteria)
        ? evidencePolicy.completionCriteria
        : phase.completionCriteria,
    transition: transition ?? phase.transition,
  }
}

function projectGroupedPhaseContract(phase: Record<string, unknown>): {
  intent: WorkflowTemplateRegistryPhase['intent']
  contract: WorkflowTemplateRegistryPhase['contract']
  evidencePolicy: WorkflowTemplateRegistryPhase['evidencePolicy']
} {
  const normalized = projectPhaseForValidation(phase)
  const existingIntent = isRecord(phase.intent) ? phase.intent : {}
  const existingContract = isRecord(phase.contract) ? phase.contract : {}
  const existingEvidencePolicy = isRecord(phase.evidencePolicy) ? phase.evidencePolicy : {}
  const transition = normalizeTransition(normalized.transition)
  const outputArtifact = normalizeOutputArtifact(normalized.outputArtifact)
  const completionCriteria = normalizeCompletionCriteria(normalized.completionCriteria)
  const toolPolicyResult = normalizeToolPolicy(normalized.toolPolicy)

  return {
    intent: {
      ...existingIntent,
      objective: isNonEmptyString(existingIntent.objective)
        ? existingIntent.objective
        : isNonEmptyString(normalized.objective)
          ? normalized.objective
          : '',
      role: isNonEmptyString(existingIntent.role)
        ? existingIntent.role
        : isNonEmptyString(normalized.name)
          ? normalized.name
          : '',
      intake: normalizeStringList(existingIntent.intake).length > 0
        ? normalizeStringList(existingIntent.intake)
        : normalizeStringList(normalized.requiredIntake),
    },
    contract: {
      ...existingContract,
      instructions: isNonEmptyString(existingContract.instructions)
        ? existingContract.instructions
        : isNonEmptyString(normalized.instructions)
          ? normalized.instructions
          : '',
      executionRules: normalizeExecutionRules(existingContract.executionRules).length > 0
        ? normalizeExecutionRules(existingContract.executionRules)
        : normalizeExecutionRules(normalized.executionRules),
      ...(isRecord(existingContract.actionPolicy)
        ? { actionPolicy: existingContract.actionPolicy as WorkflowPhaseActionPolicy & Record<string, unknown> }
        : isRecord(normalized.actionPolicy)
          ? { actionPolicy: normalized.actionPolicy as WorkflowPhaseActionPolicy & Record<string, unknown> }
          : {}),
      ...(toolPolicyResult.policy ? { toolPolicy: toolPolicyResult.policy } : {}),
      transitionAuthority: existingContract.transitionAuthority === 'auto' ||
        existingContract.transitionAuthority === 'user-confirmation' ||
        existingContract.transitionAuthority === 'artifact-gate' ||
        existingContract.transitionAuthority === 'user-choice'
        ? existingContract.transitionAuthority
        : transition?.authority ?? 'auto',
    },
    evidencePolicy: {
      ...existingEvidencePolicy,
      outputArtifact: isRecord(existingEvidencePolicy.outputArtifact)
        ? normalizeOutputArtifact(existingEvidencePolicy.outputArtifact) ?? outputArtifact
        : outputArtifact,
      requiredArtifacts: Array.isArray(existingEvidencePolicy.requiredArtifacts)
        ? normalizeRequiredArtifacts(existingEvidencePolicy.requiredArtifacts)
        : normalizeRequiredArtifacts(normalized.requiredArtifacts),
      completionCriteria: isRecord(existingEvidencePolicy.completionCriteria)
        ? normalizeCompletionCriteria(existingEvidencePolicy.completionCriteria) ?? completionCriteria
        : completionCriteria,
      handoffRules: normalizeStringList(existingEvidencePolicy.handoffRules).length > 0
        ? normalizeStringList(existingEvidencePolicy.handoffRules)
        : normalizeStringList(normalized.handoffRules),
    },
  }
}

function invalidStrengthIssuePaths(phase: Record<string, unknown>, phasePath: string): string[] {
  const issuePaths: string[] = []
  const strengthAt = (value: unknown): unknown => isRecord(value) ? value.strength : undefined
  const isInvalid = (actual: unknown, expected: WorkflowPhaseConstraintStrength) =>
    actual !== undefined && actual !== expected
  const intent = isRecord(phase.intent) ? phase.intent : {}
  const contract = isRecord(phase.contract) ? phase.contract : {}
  const actionPolicy = isRecord(contract.actionPolicy) ? contract.actionPolicy : undefined
  const evidencePolicy = isRecord(phase.evidencePolicy) ? phase.evidencePolicy : {}

  if (isInvalid(strengthAt(intent), 'guidance')) issuePaths.push(`${phasePath}.intent.strength`)
  if (isInvalid(strengthAt(actionPolicy), 'policy')) issuePaths.push(`${phasePath}.contract.actionPolicy.strength`)
  if (Array.isArray(contract.executionRules)) {
    contract.executionRules.forEach((rule, ruleIndex) => {
      if (isInvalid(strengthAt(rule), 'policy')) {
        issuePaths.push(`${phasePath}.contract.executionRules[${ruleIndex}].strength`)
      }
    })
  }
  if (isInvalid(strengthAt(evidencePolicy.outputArtifact), 'evidence')) {
    issuePaths.push(`${phasePath}.evidencePolicy.outputArtifact.strength`)
  }
  if (Array.isArray(evidencePolicy.requiredArtifacts)) {
    evidencePolicy.requiredArtifacts.forEach((artifact, artifactIndex) => {
      if (isInvalid(strengthAt(artifact), 'evidence')) {
        issuePaths.push(`${phasePath}.evidencePolicy.requiredArtifacts[${artifactIndex}].strength`)
      }
    })
  }
  if (isInvalid(strengthAt(evidencePolicy.completionCriteria), 'gate')) {
    issuePaths.push(`${phasePath}.evidencePolicy.completionCriteria.strength`)
  }

  return issuePaths
}

function isWorkflowPhaseSkillSource(value: unknown): value is WorkflowPhaseSkillSource {
  return value === 'workflow' ||
    value === 'fallback' ||
    value === 'superpowers' ||
    value === 'spec-kit-plus' ||
    value === 'codex' ||
    value === 'claude-code' ||
    value === 'user' ||
    value === 'project' ||
    value === 'plugin' ||
    value === 'managed' ||
    value === 'bundled' ||
    value === 'mcp' ||
    value === 'unknown'
}
