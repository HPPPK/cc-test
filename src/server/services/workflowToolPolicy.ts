import type { WorkflowPhaseActionPolicy, WorkflowPhaseDefinition, WorkflowSessionState, WorkflowTemplate } from './workflowTypes.js'
import { getRipgrepStatus } from '../../utils/ripgrep.js'

type WorkflowRipgrepStatus = ReturnType<typeof getRipgrepStatus>

export const SUBMIT_PHASE_COMPLETION_TOOL_NAME = 'submit_phase_completion'
export const REQUEST_WORKFLOW_ROUTE_TOOL_NAME = 'request_workflow_route'
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

export const WORKFLOW_PHASE_READ_ONLY_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'LS',
] as const

const WORKFLOW_PHASE_RIPGREP_BACKED_TOOLS = ['Glob', 'Grep'] as const

export const WORKFLOW_PHASE_ASSISTIVE_TOOLS = [
  'AskUserQuestion',
  'TodoWrite',
] as const

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
  REQUEST_WORKFLOW_ROUTE_TOOL_NAME,
] as const

export const WORKFLOW_PHASE_CONFIGURABLE_TOOL_NAMES = [
  ...WORKFLOW_PHASE_READ_ONLY_TOOLS,
  ...WORKFLOW_PHASE_ASSISTIVE_TOOLS,
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
    | 'workflow-tool-access-unrestricted'
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

// Retained as an empty export for callers that still import the former built-in policy registry.
export const BUILTIN_WORKFLOW_PHASE_ACTION_POLICIES: Record<string, WorkflowPhaseActionPolicy> = {}

function builtinWorkflowPhaseActionPolicyFor(phaseId: string): WorkflowPhaseActionPolicy | undefined {
  // Built-in action policies were retired; templates supply optional prompt guidance.
  return BUILTIN_WORKFLOW_PHASE_ACTION_POLICIES[phaseId]
}

export function concreteToolNamesForWorkflowCapability(value: string): string[] {
  const rawValue = value.trim()
  const normalized = rawValue.toLowerCase()
  if (!normalized) return []

  const exactToolName = WORKFLOW_PHASE_CONFIGURABLE_TOOL_NAMES.find(
    (toolName) => toolName === rawValue,
  )
  if (exactToolName) return [exactToolName]

  if (normalized === 'read' || normalized.includes('read') || normalized.includes('inspect')) {
    return [...WORKFLOW_PHASE_READ_ONLY_TOOLS]
  }
  if (normalized === 'artifact') {
    return []
  }
  if (normalized === 'askuserquestion' || normalized.includes('question')) {
    return ['AskUserQuestion']
  }
  if (normalized === 'agent' || normalized.includes('subagent')) {
    return ['Agent']
  }
  if (
    normalized === 'bash' ||
    normalized === 'powershell' ||
    normalized === 'test' ||
    normalized === 'build' ||
    normalized === 'lint' ||
    normalized.includes('preview') ||
    normalized.includes('terminal') ||
    normalized.includes('command')
  ) {
    return ['Bash', 'PowerShell']
  }
  if (
    normalized === 'write' ||
    normalized === 'edit' ||
    normalized === 'apply_patch' ||
    normalized.includes('edit') ||
    normalized.includes('repair') ||
    normalized.includes('change')
  ) {
    return ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']
  }
  return WORKFLOW_PHASE_CONFIGURABLE_TOOL_NAMES.includes(value as typeof WORKFLOW_PHASE_CONFIGURABLE_TOOL_NAMES[number])
    ? [value]
    : []
}

function activePhaseDefinition(
  state: WorkflowSessionState,
  template?: WorkflowTemplate | null,
): WorkflowPhaseDefinition | null {
  if (!state.activePhaseId) return null
  const definition = (template ?? state.templateSnapshot)?.phases?.find(
    (phase) => phase.id === state.activePhaseId,
  )
  return definition ?? {
    id: state.activePhaseId,
    label: state.activePhaseId,
    instructions: '',
    requestedModel: null,
    skillDeclarations: [],
    requiredArtifacts: [],
    completionCriteria: [],
    transitionAuthority: 'user-confirmation',
  }
}

function toolsForCapabilities(values: readonly string[] | undefined): Set<string> {
  return new Set((values ?? []).flatMap(concreteToolNamesForWorkflowCapability))
}

function isPreImplementationPhase(phaseId: string): boolean {
  const phase = phaseId.toLowerCase()
  if (phase.includes('implementation') && !phase.includes('plan')) return false
  return /(^|[-_])(intake|route|requirements?|clarif|design|plan|planning|investigat|memory)([-_]|$)/.test(phase)
}

function phaseToolPolicy(state: WorkflowSessionState): {
  allowed: Set<string>
  forbidden: Set<string>
} {
  const phase = activePhaseDefinition(state)
  if (!phase) return { allowed: new Set(), forbidden: new Set() }

  const toolPolicy = phase.toolPolicy
  const runtime = phase.runtimeContract
  const allowed = toolsForCapabilities([
    ...(toolPolicy?.allowedTools ?? []),
    ...(runtime?.allowedTools ?? []),
    ...(runtime?.toolAccess?.allowed ?? []),
    ...(runtime?.allowedActions ?? []),
  ])
  const forbidden = toolsForCapabilities([
    ...(toolPolicy?.disallowedTools ?? []),
    ...(toolPolicy?.forbidden ?? []),
    ...(runtime?.disallowedTools ?? []),
    ...(runtime?.toolAccess?.forbidden ?? []),
  ])
  const forbiddenActions = [
    ...(phase.actionPolicy?.forbiddenActions ?? []),
    ...(runtime?.forbiddenActions ?? []),
  ]
  for (const action of forbiddenActions) {
    const normalized = action.toLowerCase()
    if (
      /(?:create|edit|delete|write).*(?:implementation|source|code|file)/.test(normalized)
      || normalized.includes('implementation coding')
      || normalized.includes('production edit')
      || normalized.includes('source edit')
      || normalized.includes('apply_patch')
      || normalized.includes('apply patch')
    ) {
      for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) forbidden.add(tool)
    }
    if (
      /run.*implementation.*(?:command|test|build|lint)/.test(normalized)
      || normalized.includes('test execution')
    ) {
      forbidden.add('Bash')
      forbidden.add('PowerShell')
    }
    if (normalized.includes('subagent dispatch') || normalized.includes('general autonomous agent')) {
      forbidden.add('Agent')
    }
  }

  // A phase may use natural-language action rules rather than an explicit tool
  // policy. The runtime must still prevent source edits before formal advance.
  if (isPreImplementationPhase(phase.id)) {
    for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) forbidden.add(tool)
  }

  return { allowed, forbidden }
}
export function getWorkflowUnavailableSearchToolNames(
  status: WorkflowRipgrepStatus = getRipgrepStatus(),
): string[] {
  if (status.mode === 'unavailable' || status.working === false) {
    return [...WORKFLOW_PHASE_RIPGREP_BACKED_TOOLS]
  }
  return []
}

export function getWorkflowPhaseActionPolicy(
  state: WorkflowSessionState | null | undefined,
  template?: WorkflowTemplate | null,
): (WorkflowPhaseActionPolicy & { phaseId: string }) | null {
  if (!state || state.mode !== 'workflow') return null
  const phase = activePhaseDefinition(state, template)
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
  ripgrepStatus?: WorkflowRipgrepStatus,
): string[] {
  if (!isActiveWorkflowState(state)) return []

  const { allowed, forbidden } = phaseToolPolicy(state)
  const denied = new Set<string>([
    ...getWorkflowUnavailableSearchToolNames(ripgrepStatus),
    ...forbidden,
  ])

  // An explicit allowedTools/toolAccess list is a real allow-list. Keep only
  // the protocol tools that are required to ask/complete the current phase;
  // do not let a free-form user message re-enable a denied editor or shell.
  if (allowed.size > 0) {
    const alwaysAvailable = new Set([
      SUBMIT_PHASE_COMPLETION_TOOL_NAME,
      REQUEST_WORKFLOW_ROUTE_TOOL_NAME,
      'AskUserQuestion',
      'TodoWrite',
    ])
    for (const toolName of WORKFLOW_PHASE_CONFIGURABLE_TOOL_NAMES) {
      if (!allowed.has(toolName) && !alwaysAvailable.has(toolName)) {
        denied.add(toolName)
      }
    }
  }

  // Explicit forbids have precedence over the small protocol allow-list.
  return [...denied]
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

  if (!readOnly && !mutating) {
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

  if (readOnly) {
    return {
      operation,
      allowed: true,
      denied: false,
      readOnly,
      mutating,
      reason: 'read-only-operation',
      message: `Workflow template authoring operation "${operation}" is read-only and available during workflow phases.`,
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

  return {
    operation,
    allowed: true,
    denied: false,
    readOnly,
    mutating,
    reason: 'workflow-tool-access-unrestricted',
    phaseId: state.activePhaseId,
    message: `Workflow template authoring mutation "${operation}" remains available; follow the active phase guidance.`,
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
  return [...WORKFLOW_PHASE_SCOPED_TOOL_NAMES]
}

export function getWorkflowPromptToolGuidance(
  state: WorkflowSessionState | null | undefined,
  template?: WorkflowTemplate | null,
): string | null {
  if (!isActiveWorkflowState(state)) return null

  const phaseDefinition = template?.phases?.find((phase) =>
    phase.id === state.activePhaseId
  )
  const skillDeclarations = phaseDefinition?.skillDeclarations ?? []
  const scopedToolNames = getWorkflowScopedToolNames(state)
  const hasCompletionTool = scopedToolNames.includes(SUBMIT_PHASE_COMPLETION_TOOL_NAME)
  const hasRouteTool = scopedToolNames.includes(REQUEST_WORKFLOW_ROUTE_TOOL_NAME)
  const unavailableSearchTools = getWorkflowUnavailableSearchToolNames()
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
      ? `${SUBMIT_PHASE_COMPLETION_TOOL_NAME} requires status, handoff, rationale, and evidence. phaseId and stateVersion may be omitted because the active phase and latest state version are inferred at call time.`
      : null,
    hasCompletionTool
      ? `${SUBMIT_PHASE_COMPLETION_TOOL_NAME} input contract: handoff must be an object, rationale must be a non-empty string, and evidence must be an array. Plain assistant text does not satisfy these required tool inputs.`
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
    unavailableSearchTools.length
      ? `${unavailableSearchTools.join('/')} are disabled for this workflow session because ripgrep is unavailable in the runtime environment. Do not retry them; use available files, project context, or ask the user for the needed path.`
      : null,
    'recommended phase skills do not grant tool permissions and do not enable SkillTool globally.',
    'A higher priority recommended skill is attention metadata only, not a safety override or permission grant, and still does not expose SkillTool globally.',
    skillGuidance
      ? `Skill declarations are prompt-level guidance only and do not enable SkillTool globally:\n${skillGuidance}`
      : null,
  ].filter(Boolean).join('\n')
}
