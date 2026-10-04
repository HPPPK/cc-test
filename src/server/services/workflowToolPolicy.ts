import * as path from 'node:path'
﻿import type { WorkflowPhaseActionPolicy, WorkflowPhaseDefinition, WorkflowSessionState, WorkflowTemplate } from './workflowTypes.js'
import { getRipgrepStatus } from '../../utils/ripgrep.js'
import { getWorkflowCompletionEligibility } from './workflowCompletionGate.js'

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

export const WORKFLOW_ARTIFACT_WRITE_CAPABILITY = 'workflow_artifact_write'

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
  if (normalized === WORKFLOW_ARTIFACT_WRITE_CAPABILITY) {
    return ['Write']
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

const SKILLS_DEVELOPMENT_TEMPLATE_ID = 'skills-development'
const SINGLE_QUESTION_WORKFLOW_TEMPLATE_IDS = new Set([
  'efficient-constrained-dev-debug-workflow-v5',
  'feature-extension-workflow-v8',
  'debug-repair-workflow-v8',
])
type SkillsDevelopmentScopePlanQuestionPolicy = {
  exactQuestionCount: number
  minChoices: number
  maxChoices: number
  firstChoiceLabelIncludes: string
  requireChoiceDescriptions: boolean
  disallowComputerUse: boolean
}

type NecessaryWorkflowQuestionPolicy = {
  requireNecessaryQuestion: true
  requireAnswerProcessingBeforeNextQuestion: boolean
}

function workflowTemplateId(state: WorkflowSessionState): string | null {
  return state.templateIdentity?.id ?? state.templateSnapshot?.id ?? state.template?.id ?? null
}

function isSkillsDevelopmentWorkflow(state: WorkflowSessionState): boolean {
  return workflowTemplateId(state) === SKILLS_DEVELOPMENT_TEMPLATE_ID
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function getSkillsDevelopmentScopePlanQuestionPolicy(
  state: WorkflowSessionState | null | undefined,
): SkillsDevelopmentScopePlanQuestionPolicy | null {
  if (!isActiveWorkflowState(state) || !isSkillsDevelopmentWorkflow(state)) return null

  const policy = activePhaseDefinition(state)?.runtimeContract?.questionPolicy
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return null

  const exactQuestionCount = positiveInteger(policy.exactQuestionCount)
  const minChoices = positiveInteger(policy.minChoices)
  const maxChoices = positiveInteger(policy.maxChoices)
  const firstChoiceLabelIncludes = typeof policy.firstChoiceLabelIncludes === 'string'
    ? policy.firstChoiceLabelIncludes.trim()
    : ''

  if (
    !exactQuestionCount
    || !minChoices
    || !maxChoices
    || minChoices > maxChoices
    || !firstChoiceLabelIncludes
    || policy.requireChoiceDescriptions !== true
    || policy.disallowComputerUse !== true
  ) {
    return null
  }

  return {
    exactQuestionCount,
    minChoices,
    maxChoices,
    firstChoiceLabelIncludes,
    requireChoiceDescriptions: true,
    disallowComputerUse: true,
  }
}

function getNecessaryWorkflowQuestionPolicy(
  state: WorkflowSessionState | null | undefined,
): NecessaryWorkflowQuestionPolicy | null {
  if (!isActiveWorkflowState(state)) return null

  const policy = activePhaseDefinition(state)?.runtimeContract?.questionPolicy
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return null

  if (policy.requireNecessaryQuestion !== true) return null

  return {
    requireNecessaryQuestion: true,
    requireAnswerProcessingBeforeNextQuestion: policy.requireAnswerProcessingBeforeNextQuestion === true,
  }
}

function hasOpenWorkflowQuestion(state: WorkflowSessionState): boolean {
  const phaseId = state.activePhaseId
  if (!phaseId) return false

  return state.runtimeContract?.phaseStates[phaseId]?.issues.some((issue) => (
    issue.source === 'ask-user-question'
    && issue.status === 'open'
  )) ?? false
}

function getSingleWorkflowQuestionViolation(
  input: unknown,
  state: WorkflowSessionState,
  templateId: string,
): string | null {
  const phaseLabel = state.activePhaseId ?? 'active phase'
  const contractLabel = templateId + '/' + phaseLabel
  const questions = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>).questions
    : undefined

  if (!Array.isArray(questions) || questions.length !== 1) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel
      + ' allows exactly one question per AskUserQuestion call. Reissue one question only.'
  }

  const question = questions[0]
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel
      + ' requires one structured question.'
  }

  if (hasOpenWorkflowQuestion(state)) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel
      + ' already has an unanswered question. Restore or wait for that existing card; do not create a second AskUserQuestion.'
  }

  const context = question as Record<string, unknown>
  if (context.blocksCompletion !== true) return null

  if (typeof context.blockingReason !== 'string' || !context.blockingReason.trim()) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel
      + ' requires a non-empty blockingReason when blocksCompletion is true.'
  }

  if (typeof context.answerImpact !== 'string' || !context.answerImpact.trim()) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel
      + ' requires a non-empty answerImpact when blocksCompletion is true.'
  }

  return null
}

function hasAnsweredQuestionPendingProcessing(state: WorkflowSessionState): boolean {
  const phaseId = state.activePhaseId
  if (!phaseId) return false

  return state.runtimeContract?.phaseStates[phaseId]?.issues.some((issue) => (
    issue.source === 'ask-user-question'
    && issue.status === 'answered-pending-processing'
  )) ?? false
}

function getNecessaryWorkflowQuestionViolation(
  input: unknown,
  state: WorkflowSessionState,
  policy: NecessaryWorkflowQuestionPolicy,
): string | null {
  const phaseLabel = state.activePhaseId ?? 'active phase'
  const contractLabel = workflowTemplateId(state) + '/' + phaseLabel
  const questions = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>).questions
    : undefined

  if (!Array.isArray(questions) || questions.length !== 1) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel
      + ' allows exactly one necessary blocking question per AskUserQuestion call. Reissue one question only.'
  }

  const question = questions[0]
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel
      + ' requires one structured necessary blocking question.'
  }

  const context = question as Record<string, unknown>
  if (context.blocksCompletion !== true) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel
      + ' only allows a necessary blocking question. Set blocksCompletion to true or continue with a conservative default.'
  }

  if (typeof context.blockingReason !== 'string' || !context.blockingReason.trim()) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel
      + ' requires a non-empty blockingReason explaining why the request, workspace, logs, and artifacts cannot answer this question.'
  }

  if (typeof context.answerImpact !== 'string' || !context.answerImpact.trim()) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel
      + ' requires a non-empty answerImpact explaining the concrete implementation, investigation, or acceptance decision the answer will change.'
  }

  if (hasOpenWorkflowQuestion(state)) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel
      + ' already has an unanswered blocking question. Restore or wait for that existing card; do not create a second AskUserQuestion.'
  }

  if (policy.requireAnswerProcessingBeforeNextQuestion && hasAnsweredQuestionPendingProcessing(state)) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel
      + ' already has an answered question pending processing. Apply the user answer to current-phase work and update current-phase evidence before asking another question.'
  }

  return null
}

export function getWorkflowQuestionCardContractViolation(
  toolName: string,
  input: unknown,
  state: WorkflowSessionState | null | undefined,
): string | null {
  if (toolName !== 'AskUserQuestion') return null

  const policy = getSkillsDevelopmentScopePlanQuestionPolicy(state)
  if (!policy) {
    const necessaryQuestionPolicy = getNecessaryWorkflowQuestionPolicy(state)
    if (necessaryQuestionPolicy) {
      return getNecessaryWorkflowQuestionViolation(input, state, necessaryQuestionPolicy)
    }

    const templateId = state && isActiveWorkflowState(state) ? workflowTemplateId(state) : null
    if (templateId && SINGLE_QUESTION_WORKFLOW_TEMPLATE_IDS.has(templateId)) {
      return getSingleWorkflowQuestionViolation(input, state, templateId)
    }

    return null
  }
  const phaseLabel = state?.activePhaseId ?? 'active phase'
  const contractLabel = SKILLS_DEVELOPMENT_TEMPLATE_ID + '/' + phaseLabel

  const questions = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>).questions
    : undefined
  if (!Array.isArray(questions) || questions.length !== policy.exactQuestionCount) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel + ' requires exactly '
      + policy.exactQuestionCount + ' decision question per AskUserQuestion call. Reissue one question only.'
  }

  const question = questions[0]
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel + ' requires one structured decision question.'
  }

  const choices = (question as Record<string, unknown>).choices
    ?? (question as Record<string, unknown>).options
  if (!Array.isArray(choices) || choices.length < policy.minChoices || choices.length > policy.maxChoices) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel + ' decision cards require exactly '
      + policy.minChoices + '–' + policy.maxChoices + ' choices. Reissue the same decision with '
      + policy.minChoices + ' or ' + policy.maxChoices + ' choices.'
  }

  const firstChoice = choices[0]
  const firstLabel = firstChoice && typeof firstChoice === 'object' && !Array.isArray(firstChoice)
    ? (firstChoice as Record<string, unknown>).label
    : undefined
  if (typeof firstLabel !== 'string' || !firstLabel.includes(policy.firstChoiceLabelIncludes)) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel + ' first choice label must include "'
      + policy.firstChoiceLabelIncludes + '". Reissue the question with the recommended choice first.'
  }

  const missingDescription = choices.some((choice) => {
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return true
    const description = (choice as Record<string, unknown>).description
    return typeof description !== 'string' || !description.trim()
  })
  if (missingDescription) {
    return 'WORKFLOW_QUESTION_CONTRACT_VIOLATION: ' + contractLabel + ' decision cards require that every choice needs a non-empty user-facing description. Reissue the question with descriptions for all choices.'
  }

  return null
}

export function isWorkflowComputerUseDenied(
  state: WorkflowSessionState | null | undefined,
): boolean {
  return getSkillsDevelopmentScopePlanQuestionPolicy(state)?.disallowComputerUse === true
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
  const hasExplicitToolAccess = [
    ...(toolPolicy?.allowedTools ?? []),
    ...(toolPolicy?.disallowedTools ?? []),
    ...(toolPolicy?.forbidden ?? []),
    ...(runtime?.allowedTools ?? []),
    ...(runtime?.disallowedTools ?? []),
    ...(runtime?.toolAccess?.allowed ?? []),
    ...(runtime?.toolAccess?.forbidden ?? []),
  ].some((value) => value.trim().length > 0)

  // Structured tool access is authoritative. `forbiddenActions` also carries
  // human-readable prerequisites such as “Create the task packet before code
  // changes”, which must not be reinterpreted as a ban on Write/Edit in an
  // implementation phase that explicitly allows those tools. Keep the legacy
  // natural-language inference only for templates that have no tool contract.
  if (!hasExplicitToolAccess) {
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
  }

  // A phase may use natural-language action rules rather than an explicit tool
  // policy. The runtime must still prevent source edits before formal advance.
  // The declarative workflow_artifact_write capability is the sole exception:
  // it exposes Write for session-internal .workflow evidence only and is
  // checked again at permission execution time.
  const allowsScopedArtifactWrite = [
    ...(toolPolicy?.allowedTools ?? []),
    ...(runtime?.allowedTools ?? []),
    ...(runtime?.toolAccess?.allowed ?? []),
    ...(runtime?.allowedActions ?? []),
  ].some((value) => value.trim().toLowerCase() === WORKFLOW_ARTIFACT_WRITE_CAPABILITY)
  if (isPreImplementationPhase(phase.id) && !allowsScopedArtifactWrite) {
    for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) forbidden.add(tool)
  }

  return { allowed, forbidden }
}
export function getWorkflowPhaseAlwaysLoadedTools(
  state: WorkflowSessionState | null | undefined,
): string[] {
  if (!isActiveWorkflowState(state)) return []
  const managedIds = new Set([
    "efficient-constrained-dev-debug-workflow-v5",
    "feature-extension-workflow-v8",
    "debug-repair-workflow-v8",
  ])
  if (!managedIds.has(state.templateIdentity?.id ?? "")) return []
  const { allowed, forbidden } = phaseToolPolicy(state)
  return [...new Set([
    ...allowed,
    SUBMIT_PHASE_COMPLETION_TOOL_NAME,
    REQUEST_WORKFLOW_ROUTE_TOOL_NAME,
    "AskUserQuestion",
  ])].filter(toolName => !forbidden.has(toolName))
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

export function hasWorkflowArtifactWriteCapability(
  state: WorkflowSessionState | null | undefined,
): boolean {
  if (!isActiveWorkflowState(state)) return false
  const phase = activePhaseDefinition(state)
  if (!phase) return false
  const runtime = phase.runtimeContract
  return [
    ...(phase.toolPolicy?.allowedTools ?? []),
    ...(runtime?.allowedTools ?? []),
    ...(runtime?.toolAccess?.allowed ?? []),
    ...(runtime?.allowedActions ?? []),
  ].some((value) => value.trim().toLowerCase() === WORKFLOW_ARTIFACT_WRITE_CAPABILITY)
}

export function isWorkflowArtifactWritePath(
  workspaceRoot: string,
  candidatePath: unknown,
): boolean {
  if (typeof candidatePath !== 'string' || !candidatePath.trim()) return false
  const internalRoot = path.resolve(workspaceRoot, '.workflow')
  const targetPath = path.resolve(workspaceRoot, candidatePath)
  const relative = path.relative(internalRoot, targetPath)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
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
  if (
    (toolName === SUBMIT_PHASE_COMPLETION_TOOL_NAME || toolName === REQUEST_WORKFLOW_ROUTE_TOOL_NAME)
    && state?.runtimeContract
    && !getWorkflowScopedToolNames(state).includes(toolName)
  ) {
    return true
  }
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

  // Both protocol tools are direct runtime tools, not Skills. Keep route
  // requests visible while a phase is ineligible: after recording a blocked
  // or needs-user result, the agent must be able to request a structured
  // recovery route instead of hiding targetPhaseId in the completion handoff.
  // The runtime service still validates phase, stateVersion, recovery state,
  // route policy, target existence, and explicit user confirmation.
  return [SUBMIT_PHASE_COMPLETION_TOOL_NAME, REQUEST_WORKFLOW_ROUTE_TOOL_NAME]
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
  const necessaryQuestionPolicy = getNecessaryWorkflowQuestionPolicy(state)
  const hasArtifactWrite = hasWorkflowArtifactWriteCapability(state)
  // The concrete artifact-write recovery wording belongs only to the independently
  // evolved skills-development pack. Other workflow templates keep their existing
  // prompt guidance even if they share the declarative capability name.
  const hasSkillsDevelopmentArtifactWriteGuidance =
    hasArtifactWrite && state.templateIdentity?.id === 'skills-development'
  const completionEligibility = state.runtimeContract
    ? getWorkflowCompletionEligibility(state)
    : null
  const unavailableSearchTools = getWorkflowUnavailableSearchToolNames()
  const skillGuidance = skillDeclarations
    .map((skill) => {
      const label = skill.id ?? skill.name ?? 'workflow-skill'
      return `- ${label}: ${skill.guidance}`
    })
    .join('\n')

  return [
    'Workflow-only tools',
    necessaryQuestionPolicy
      ? 'AskUserQuestion in this phase uses the necessary-question schema branch: call exactly one question with blocksCompletion: true, non-empty blockingReason and answerImpact, and 2–4 user-answer choices. Use this card only when the answer is required for current-phase work; otherwise continue with a conservative default instead of calling AskUserQuestion.'
      : null,
    hasSkillsDevelopmentArtifactWriteGuidance
      ? 'workflow_artifact_write is a declarative capability, not necessarily a visible tool name. It exposes the visible Write tool only for workspace-relative .workflow/... artifacts in this phase.'
      : null,
    hasSkillsDevelopmentArtifactWriteGuidance
      ? 'Do not use Edit/MultiEdit as a substitute, and do not use Write for src, public, the repository root, C:\\Temp, another workspace, or an unknown path. If an artifact Write is denied, repair the path to .workflow/... and continue the same phase; do not end in prose.'
      : null,
    hasCompletionTool
      ? `${SUBMIT_PHASE_COMPLETION_TOOL_NAME} is a direct API tool, never a Skill. Do not call Skill with workflow:${SUBMIT_PHASE_COMPLETION_TOOL_NAME}, and do not prepend workflow: to this tool name.`
      : null,
    hasCompletionTool
      ? `Use ${SUBMIT_PHASE_COMPLETION_TOOL_NAME} only when the active workflow phase is ready, genuinely blocked, or unable to complete.`
      : null,
    hasCompletionTool
      ? `${SUBMIT_PHASE_COMPLETION_TOOL_NAME} requires status, handoff, rationale, and evidence. phaseId and stateVersion may be omitted because the active phase and latest state version are inferred at call time.`
      : null,
    hasCompletionTool
      ? `${SUBMIT_PHASE_COMPLETION_TOOL_NAME} input contract: handoff must be an object, rationale must be a non-empty string, and evidence must be an array. Plain assistant text does not satisfy these required tool inputs.`
      : null,
    completionEligibility?.status === 'eligible'
      ? `The persisted completion gate is eligible. Present the handoff and call ${SUBMIT_PHASE_COMPLETION_TOOL_NAME} with status ready in the same assistant turn.`
      : `The persisted completion gate is not yet eligible. Do not submit ready/completed or claim a phase transition. Resolve current work, blocking issues, required evidence, and checks through their explicit workflow state-update path first. If work must return for repair or wait on the user, first record the current result with ${SUBMIT_PHASE_COMPLETION_TOOL_NAME} with status blocked or needs_user, then request ${REQUEST_WORKFLOW_ROUTE_TOOL_NAME} with rework_current_phase or jump_to_phase; never put executable route fields in handoff.`,
    hasCompletionTool
      ? 'Do not ask the user to type continue before calling the completion tool; the tool creates the user-confirmation step.'
      : null,
    hasCompletionTool
      ? 'A ready status creates a pending user confirmation and does not advance the workflow by itself.'
      : null,
    hasCompletionTool
      ? 'Blocked or unable statuses record the response and keep the workflow on the current phase.'
      : null,
    hasRouteTool
      ? 'request_workflow_route is a separate direct API tool. Never call it through Skill and never use it for normal linear completion.'
      : 'request_workflow_route is not currently exposed. Do not replace it with a Skill call or ordinary assistant prose.',
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
