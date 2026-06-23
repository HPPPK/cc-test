import type { WorkflowPhaseActionPolicy, WorkflowPhaseToolPolicy, WorkflowSessionState } from './workflowTypes.js'

export const SUBMIT_PHASE_COMPLETION_TOOL_NAME = 'submit_phase_completion'
export const WORKFLOW_TEMPLATE_AUTHORING_TOOL_NAME = 'workflow_template_authoring'

export const WORKFLOW_PHASE_IMPLEMENTATION_TOOLS = [
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Bash',
  'PowerShell',
  'Agent',
] as const

const WORKFLOW_PHASE_FILE_EDIT_TOOLS = [
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Agent',
] as const

// User-authored SuperSpec templates can use skill-style phase ids such as "sp-implement".
const IMPLEMENTATION_PHASE_IDS = new Set(['implementation', 'implement', 'sp-implementation', 'sp-implement'])
const VERIFICATION_PHASE_ID = 'verification'

export const WORKFLOW_TEMPLATE_AUTHORING_READ_ONLY_OPERATIONS = [
  'guide',
  'skill_catalog',
  'list',
  'inspect',
  'validate',
] as const

export const WORKFLOW_PHASE_RUNTIME_TOOL_NAMES = [
  ...WORKFLOW_PHASE_IMPLEMENTATION_TOOLS,
  WORKFLOW_TEMPLATE_AUTHORING_TOOL_NAME,
] as const

export const WORKFLOW_PHASE_SCOPED_TOOL_NAMES = [
  SUBMIT_PHASE_COMPLETION_TOOL_NAME,
] as const

export const WORKFLOW_PHASE_CONFIGURABLE_TOOL_NAMES = [
  ...WORKFLOW_PHASE_RUNTIME_TOOL_NAMES,
  ...WORKFLOW_PHASE_SCOPED_TOOL_NAMES,
] as const

export const WORKFLOW_TEMPLATE_AUTHORING_MUTATING_OPERATIONS = [
  'skill_create',
  'create',
  'update',
  'duplicate',
  'delete',
] as const

export type WorkflowTemplateAuthoringReadOnlyOperation =
  typeof WORKFLOW_TEMPLATE_AUTHORING_READ_ONLY_OPERATIONS[number]

export type WorkflowTemplateAuthoringMutatingOperation =
  typeof WORKFLOW_TEMPLATE_AUTHORING_MUTATING_OPERATIONS[number]

export type WorkflowTemplateAuthoringOperation =
  | WorkflowTemplateAuthoringReadOnlyOperation
  | WorkflowTemplateAuthoringMutatingOperation

export type WorkflowTemplateAuthoringOperationPolicy = {
  operation: string
  allowed: boolean
  denied: boolean
  readOnly: boolean
  mutating: boolean
  reason:
    | 'read-only-operation'
    | 'outside-active-workflow'
    | 'implementation-phase'
    | 'custom-policy-allows-workflow-template-authoring'
    | 'phase-tool-policy-denies-workflow-template-authoring'
    | 'phase-policy-denies-workflow-template-authoring'
    | 'unknown-operation'
  phaseId?: string
  message: string
}

function isActiveWorkflowState(
  state: WorkflowSessionState | null | undefined,
): state is WorkflowSessionState {
  return Boolean(
    state
      && state.mode === 'workflow'
      && state.activePhaseId
      && state.workflowStatus !== 'completed'
      && state.workflowStatus !== 'cancelled'
      && state.workflowStatus !== 'failed',
  )
}

function includesWorkflowTemplateAuthoringAllowance(policy: WorkflowPhaseActionPolicy | undefined): boolean {
  if (!policy) return false
  return policy.allowedActions.some((action) => {
    const normalized = action.toLowerCase()
    return (
      normalized.includes('workflow template authoring')
      || normalized.includes('author workflow templates')
      || normalized.includes('authoring workflow templates')
    )
  })
}

function normalizeWorkflowPhaseId(phaseId: string): string {
  return phaseId.trim().toLowerCase().replace(/[\s_]+/g, '-')
}

function isImplementationPhaseId(phaseId: string | null | undefined): boolean {
  return Boolean(phaseId && IMPLEMENTATION_PHASE_IDS.has(normalizeWorkflowPhaseId(phaseId)))
}

function builtinWorkflowPhaseActionPolicyFor(phaseId: string): WorkflowPhaseActionPolicy | undefined {
  if (isImplementationPhaseId(phaseId)) {
    return BUILTIN_WORKFLOW_PHASE_ACTION_POLICIES.implementation
  }
  return BUILTIN_WORKFLOW_PHASE_ACTION_POLICIES[normalizeWorkflowPhaseId(phaseId)]
}

export const BUILTIN_WORKFLOW_PHASE_ACTION_POLICIES: Record<string, WorkflowPhaseActionPolicy> = {
  'requirements-clarification': {
    allowedActions: [
      'Ask clarifying questions',
      'Summarize confirmed requirements',
      'Record constraints, acceptance criteria, and open questions',
    ],
    forbiddenActions: [
      'Create, edit, or delete implementation files',
      'Start implementation coding',
      'Skip user confirmation before design',
    ],
  },
  'technical-design': {
    allowedActions: [
      'Design the technical approach and affected code surfaces',
      'Identify risks, dependencies, and validation strategy',
      'Explain tradeoffs before implementation planning',
    ],
    forbiddenActions: [
      'Create, edit, or delete implementation files',
      'Run implementation commands',
      'Skip user confirmation before task planning',
    ],
  },
  'implementation-planning': {
    allowedActions: [
      'Break the approved design into ordered implementation tasks',
      'Name files and tests that will be changed',
      'Define validation commands and handoff checkpoints',
    ],
    forbiddenActions: [
      'Create, edit, or delete implementation files',
      'Start implementation coding before the plan is accepted',
      'Expand scope beyond the approved design',
    ],
  },
  implementation: {
    allowedActions: [
      'Create and edit scoped production, test, and documentation files',
      'Run focused checks while implementing',
      'Fix defects found inside the approved implementation scope',
    ],
    forbiddenActions: [
      'Change requirements without returning to an earlier phase',
      'Skip required validation evidence',
      'Make unrelated refactors or scope expansions',
    ],
  },
  verification: {
    allowedActions: [
      'Run verification commands and inspect their output',
      'Record pass, fail, skipped checks, and residual risk',
      'Apply narrow fixes only for validation failures inside the implemented scope',
    ],
    forbiddenActions: [
      'Add new product scope without returning to requirements or design',
      'Start a new implementation batch without a failed validation reason',
      'Claim completion without fresh evidence',
    ],
  },
}

function normalizePhaseToolPolicy(value: unknown): WorkflowPhaseToolPolicy | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const allowedTools = (value as { allowedTools?: unknown }).allowedTools
  if (!Array.isArray(allowedTools)) return undefined
  return {
    ...(value as Record<string, unknown>),
    allowedTools: Array.from(new Set(allowedTools.filter((tool): tool is string =>
      typeof tool === 'string' && tool.trim().length > 0
    ).map((tool) => tool.trim()))),
  }
}

function activePhaseDefinition(
  state: WorkflowSessionState,
): { id: string, actionPolicy?: WorkflowPhaseActionPolicy, toolPolicy?: WorkflowPhaseToolPolicy } | null {
  if (!state.activePhaseId) return null
  const definition = state.templateSnapshot?.phases?.find((phase) => phase.id === state.activePhaseId)
  return {
    id: state.activePhaseId,
    actionPolicy: definition?.actionPolicy,
    toolPolicy: normalizePhaseToolPolicy(definition?.toolPolicy ?? definition?.contract?.toolPolicy),
  }
}

function explicitAllowedToolNames(
  state: WorkflowSessionState | null | undefined,
): Set<string> | null {
  if (!state || state.mode !== 'workflow') return null
  const phase = activePhaseDefinition(state)
  if (!phase?.toolPolicy) return null
  return new Set(phase.toolPolicy.allowedTools)
}

export function getWorkflowPhaseActionPolicy(
  state: WorkflowSessionState | null | undefined,
): (WorkflowPhaseActionPolicy & { phaseId: string }) | null {
  if (!state || state.mode !== 'workflow') return null
  const phase = activePhaseDefinition(state)
  if (!phase) return null
  const policy = phase.actionPolicy ?? builtinWorkflowPhaseActionPolicyFor(phase.id)
  if (!policy) return null
  return {
    phaseId: phase.id,
    allowedActions: [...policy.allowedActions],
    forbiddenActions: [...policy.forbiddenActions],
  }
}

export function getWorkflowPhaseDisallowedTools(
  state: WorkflowSessionState | null | undefined,
): string[] {
  if (!state || state.mode !== 'workflow') return []
  if (!state.activePhaseId) return []
  const explicitAllowedTools = explicitAllowedToolNames(state)
  if (explicitAllowedTools) {
    return WORKFLOW_PHASE_RUNTIME_TOOL_NAMES.filter((toolName) => !explicitAllowedTools.has(toolName))
  }
  const activePhaseId = normalizeWorkflowPhaseId(state.activePhaseId)
  if (isImplementationPhaseId(activePhaseId)) return []
  if (activePhaseId === VERIFICATION_PHASE_ID) return [...WORKFLOW_PHASE_FILE_EDIT_TOOLS]
  return [...WORKFLOW_PHASE_IMPLEMENTATION_TOOLS]
}

export function isWorkflowPhaseToolDenied(
  toolName: string,
  state: WorkflowSessionState | null | undefined,
): boolean {
  return getWorkflowPhaseDisallowedTools(state).includes(toolName)
}

export function isWorkflowTemplateAuthoringReadOnlyOperation(
  operation: string,
): operation is WorkflowTemplateAuthoringReadOnlyOperation {
  return (WORKFLOW_TEMPLATE_AUTHORING_READ_ONLY_OPERATIONS as readonly string[]).includes(operation)
}

export function isWorkflowTemplateAuthoringMutatingOperation(
  operation: string,
): operation is WorkflowTemplateAuthoringMutatingOperation {
  return (WORKFLOW_TEMPLATE_AUTHORING_MUTATING_OPERATIONS as readonly string[]).includes(operation)
}

export function getWorkflowTemplateAuthoringOperationPolicy(
  operation: string,
  state: WorkflowSessionState | null | undefined,
): WorkflowTemplateAuthoringOperationPolicy {
  const readOnly = isWorkflowTemplateAuthoringReadOnlyOperation(operation)
  const mutating = isWorkflowTemplateAuthoringMutatingOperation(operation)

  if (
    isActiveWorkflowState(state)
    && isWorkflowPhaseToolDenied(WORKFLOW_TEMPLATE_AUTHORING_TOOL_NAME, state)
  ) {
    return {
      operation,
      allowed: false,
      denied: true,
      readOnly,
      mutating,
      reason: 'phase-tool-policy-denies-workflow-template-authoring',
      phaseId: state.activePhaseId,
      message: `Workflow template authoring operation "${operation}" is denied because the active phase tool policy does not allow ${WORKFLOW_TEMPLATE_AUTHORING_TOOL_NAME}.`,
    }
  }

  if (readOnly) {
    return {
      operation,
      allowed: true,
      denied: false,
      readOnly,
      mutating,
      reason: 'read-only-operation',
      message: `Workflow template authoring operation "${operation}" is read-only and remains available during workflow phases.`,
    }
  }

  if (!mutating) {
    return {
      operation,
      allowed: false,
      denied: true,
      readOnly,
      mutating,
      reason: 'unknown-operation',
      message: `Workflow template authoring operation "${operation}" is not recognized.`,
    }
  }

  if (!isActiveWorkflowState(state)) {
    return {
      operation,
      allowed: true,
      denied: false,
      readOnly,
      mutating,
      reason: 'outside-active-workflow',
      message: `Workflow template authoring mutation "${operation}" is allowed outside active workflow sessions.`,
    }
  }

  const phase = activePhaseDefinition(state)
  const phaseId = phase?.id ?? state.activePhaseId

  if (isImplementationPhaseId(phaseId)) {
    return {
      operation,
      allowed: true,
      denied: false,
      readOnly,
      mutating,
      reason: 'implementation-phase',
      phaseId,
      message: `Workflow template authoring mutation "${operation}" is allowed during the active implementation phase.`,
    }
  }

  if (includesWorkflowTemplateAuthoringAllowance(phase?.actionPolicy)) {
    return {
      operation,
      allowed: true,
      denied: false,
      readOnly,
      mutating,
      reason: 'custom-policy-allows-workflow-template-authoring',
      phaseId,
      message: `Workflow template authoring mutation "${operation}" is explicitly allowed by the active phase policy.`,
    }
  }

  return {
    operation,
    allowed: false,
    denied: true,
    readOnly,
    mutating,
    reason: 'phase-policy-denies-workflow-template-authoring',
    phaseId,
    message: `Workflow template authoring mutation "${operation}" is denied by the active workflow phase policy.`,
  }
}

export function isWorkflowTemplateAuthoringMutationDenied(
  operation: string,
  state: WorkflowSessionState | null | undefined,
): boolean {
  return getWorkflowTemplateAuthoringOperationPolicy(operation, state).denied
}

export function getWorkflowScopedToolNames(
  state: WorkflowSessionState | null | undefined,
): string[] {
  if (!isActiveWorkflowState(state)) return []
  const explicitAllowedTools = explicitAllowedToolNames(state)
  if (explicitAllowedTools) {
    return WORKFLOW_PHASE_SCOPED_TOOL_NAMES.filter((toolName) => explicitAllowedTools.has(toolName))
  }
  return [...WORKFLOW_PHASE_SCOPED_TOOL_NAMES]
}

export function getWorkflowPromptToolGuidance(
  state: WorkflowSessionState | null | undefined,
): string | null {
  if (!isActiveWorkflowState(state)) return null

  const phaseDefinition = state.templateSnapshot?.phases?.find((phase) =>
    phase.id === state.activePhaseId
  )
  const skillDeclarations = phaseDefinition?.skillDeclarations ?? []
  const scopedToolNames = getWorkflowScopedToolNames(state)
  const hasCompletionTool = scopedToolNames.includes(SUBMIT_PHASE_COMPLETION_TOOL_NAME)
  const skillGuidance = skillDeclarations
    .map((skill) => {
      const label = skill.id ?? skill.name ?? 'workflow-skill'
      return `- ${label}: ${skill.guidance}`
    })
    .join('\n')

  return [
    'Workflow-only tools',
    hasCompletionTool
      ? `Use ${SUBMIT_PHASE_COMPLETION_TOOL_NAME} only when the active workflow phase is ready, blocked, or unable to complete.`
      : `${SUBMIT_PHASE_COMPLETION_TOOL_NAME} is disabled by this phase tool policy; do not claim you can submit phase completion through that tool.`,
    hasCompletionTool
      ? `${SUBMIT_PHASE_COMPLETION_TOOL_NAME} requires phaseId, stateVersion, status, handoff, rationale, and evidence.`
      : null,
    hasCompletionTool
      ? `When the active phase is ready, present the handoff and call ${SUBMIT_PHASE_COMPLETION_TOOL_NAME} with status ready in the same assistant turn.`
      : null,
    hasCompletionTool
      ? 'Do not ask the user to type continue before calling the completion tool; the tool creates the user-confirmation step.'
      : null,
    hasCompletionTool
      ? 'A ready status creates a pending user confirmation and does not advance the workflow by itself.'
      : null,
    hasCompletionTool
      ? 'Blocked or unable statuses record the response and keep the workflow on the current phase.'
      : null,
    'recommended phase skills do not grant tool permissions and do not enable SkillTool globally.',
    'A higher priority recommended skill is attention metadata only, not a safety override or permission grant, and still does not expose SkillTool globally.',
    skillGuidance
      ? `Skill declarations are prompt-level guidance only and do not enable SkillTool globally:\n${skillGuidance}`
      : null,
  ].filter(Boolean).join('\n')
}
