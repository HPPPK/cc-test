import type {
  WorkflowPhaseActionPolicy,
  WorkflowPhasePrompt,
  WorkflowPhaseSkillSource,
  WorkflowTemplateSource,
} from './workflowTypes.js'

export const WORKFLOW_TEMPLATE_BUILTIN_ID = 'agent-development'
export const WORKFLOW_TEMPLATE_SCHEMA_VERSION = 1

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
  authority: 'auto' | 'user-confirmation'
  [key: string]: unknown
}

export type WorkflowTemplateRegistryPhase = {
  id: string
  name: string
  instructions: string
  requestedModel?: unknown
  objective?: string
  requiredIntake?: string[]
  handoffRules?: string[]
  executionRules?: string[]
  outputArtifact?: WorkflowTemplateRegistryOutputArtifact
  skills: WorkflowTemplateRegistrySkillDeclaration[]
  requiredArtifacts: WorkflowTemplateRegistryRequiredArtifact[]
  completionCriteria: WorkflowTemplateRegistryCompletionCriteria
  transition: WorkflowTemplateRegistryTransitionPolicy
  actionPolicy?: WorkflowPhaseActionPolicy
  phasePrompt?: WorkflowPhasePrompt
  [key: string]: unknown
}

export type WorkflowTemplateRegistryTemplate = {
  schemaVersion: 1
  id: string
  source: WorkflowTemplateSource
  version: string
  name: string
  description: string
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
  if (value.authority !== 'auto' && value.authority !== 'user-confirmation') return null

  return {
    ...value,
    authority: value.authority,
  }
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

  if (value.id === WORKFLOW_TEMPLATE_BUILTIN_ID) {
    issues.push(workflowTemplateValidationIssue(
      source,
      `${templatePath}.id`,
      'WORKFLOW_TEMPLATE_BUILTIN_ID_CONFLICT',
      'User templates cannot shadow builtin template ids.',
      templateId,
    ))
  }

  if (
    isNonEmptyString(value.id) &&
    value.id !== options.allowExistingId &&
    options.registry?.templates.some((template) => template.source === 'user' && template.id === value.id)
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

      if (!isNonEmptyString(phase.id)) {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.id`,
          'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
          'Phase requires an id.',
          templateId,
        ))
      } else if (phaseIds.has(phase.id)) {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.id`,
          'WORKFLOW_PHASE_DUPLICATE_ID',
          'Phase ids must be unique within a template.',
          templateId,
        ))
      } else {
        phaseIds.add(phase.id)
      }

      if (!isNonEmptyString(phase.name) || !isNonEmptyString(phase.instructions)) {
        issues.push(workflowTemplateValidationIssue(
          source,
          phasePath,
          'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
          'Phase requires name and instructions fields.',
          templateId,
        ))
      }

      const completionCriteria = normalizeCompletionCriteria(phase.completionCriteria)
      if (!completionCriteria) {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.completionCriteria`,
          'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
          'Phase requires valid completion criteria.',
          templateId,
        ))
      }

      const outputArtifact = normalizeOutputArtifact(phase.outputArtifact)
      if (!outputArtifact) {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.outputArtifact`,
          'WORKFLOW_PHASE_OUTPUT_ARTIFACT_REQUIRED',
          'Phase requires a first-class required output artifact contract.',
          templateId,
        ))
      }

      const requiredIntake = normalizeStringList(phase.requiredIntake)
      const handoffRules = normalizeStringList(phase.handoffRules)
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

      const transition = normalizeTransition(phase.transition)
      if (!transition) {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.transition`,
          'WORKFLOW_TEMPLATE_MISSING_REQUIRED_FIELD',
          'Phase requires a valid transition authority.',
          templateId,
        ))
      }

      const normalizedSkills = normalizePhaseSkillReferences(phase.skills)
      normalizedSkills.invalidIndexes.forEach((skillIndex) => {
        issues.push(workflowTemplateValidationIssue(
          source,
          `${phasePath}.skills[${skillIndex}]`,
          'WORKFLOW_PHASE_SKILL_INVALID_REFERENCE',
          'Workflow phase skill reference requires a non-empty name and recommended mode.',
          templateId,
        ))
      })

      if (
        isNonEmptyString(phase.id) &&
        isNonEmptyString(phase.name) &&
        isNonEmptyString(phase.instructions) &&
        outputArtifact &&
        hasHandoff &&
        completionCriteria &&
        transition
      ) {
        const actionPolicy = normalizeActionPolicy(phase.actionPolicy)
        const phasePrompt = normalizePhasePrompt(phase.phasePrompt)
        normalizedPhases.push({
          ...phase,
          id: phase.id,
          name: phase.name,
          instructions: phase.instructions,
          ...(isNonEmptyString(phase.objective) ? { objective: phase.objective } : {}),
          requiredIntake,
          handoffRules,
          executionRules: normalizeStringList(phase.executionRules),
          outputArtifact,
          skills: normalizedSkills.references,
          requiredArtifacts: normalizeRequiredArtifacts(phase.requiredArtifacts),
          completionCriteria,
          transition,
          ...(actionPolicy ? { actionPolicy } : {}),
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
      schemaVersion: WORKFLOW_TEMPLATE_SCHEMA_VERSION,
      id: templateId,
      source: 'user',
      version: value.version,
      name: value.name,
      description: isNonEmptyString(value.description) ? value.description : '',
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

function isWorkflowPhaseSkillSource(value: unknown): value is WorkflowPhaseSkillSource {
  return value === 'user' ||
    value === 'project' ||
    value === 'plugin' ||
    value === 'managed' ||
    value === 'bundled' ||
    value === 'mcp' ||
    value === 'unknown'
}
