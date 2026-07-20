import type {
  CompletionSubmission,
  WorkflowArtifactPointer,
  WorkflowCompletionSubmissionStatus,
  WorkflowClientMessage,
  WorkflowCompletionResult,
  WorkflowArtifactLifecycleStatus,
  WorkflowPendingConfirmation,
  WorkflowPendingRoute,
  WorkflowRouteIntent,
  WorkflowRouteRequest,
  WorkflowPhaseDefinition,
  WorkflowPhaseSkillResolution,
  WorkflowPhaseSkillResolutionStatus,
  WorkflowPhaseSkillSnapshot,
  WorkflowPhaseState,
  WorkflowRun,
  WorkflowSessionState,
  WorkflowSkillBinding,
  WorkflowSkillBindingResolution,
  WorkflowSkillProvenance,
  WorkflowTransitionRecord,
  WorkflowTransitionRequest,
  WorkflowTemplate,
} from './workflowTypes.js'
import { ApiError } from '../middleware/errorHandler.js'
import {
  collectTemplateSkillCatalog,
} from './workflowTemplateRegistryService.js'
import {
  resolveWorkflowPhaseSkills,
  type WorkflowPhaseSkillCatalogEntry,
} from './workflowPhaseSkillResolver.js'
import { getWorkflowPhaseActionPolicy } from './workflowToolPolicy.js'
import { loadCurrentWorkflowTemplate } from './workflowRuntimeTemplateService.js'
import {
  buildWorkflowRuntimePrompt,
  sanitizeWorkflowToolNameText,
} from './workflowRuntimeEnforcement.js'
import { resolveWorkflowSkillBindings } from './workflowSkillRegistry.js'
import {
  BUNDLED_BRAINSTORMING_REFERENCE_ID,
  loadBundledBrainstormingFallback,
} from './workflowBrainstormingFallback.js'

type WorkflowNotification = {
  type: 'system_notification'
  subtype: 'workflow_state' | 'workflow_transition' | 'workflow_blocked' | 'workflow_report_ready'
  message?: string
  data: unknown
}

type ModelSelector = {
  providerId: string | null
  modelId: string | null
}

type StartPhaseInput = {
  state: WorkflowSessionState
  requestedAt: string
  resolveDefaultModel: () => Promise<ModelSelector>
  isRequestedModelAvailable: (modelId: string) => Promise<boolean>
}

type RuntimeResult = {
  state: WorkflowSessionState
  notifications: WorkflowNotification[]
}

type AssemblePromptInput = {
  state: WorkflowSessionState
  userMessage: string
  priorArtifactSummaries?: string[]
}

type AssemblePromptResult = {
  content: string
  skillProvenance: WorkflowSkillProvenance[]
  scheduledToolCalls?: []
}

type TransitionInput = {
  state: WorkflowSessionState
  request: WorkflowTransitionRequest | WorkflowClientMessage
  requestedAt: string
  completion?: {
    passed: boolean
    blockedReason?: string
    artifactPointers?: unknown[]
  }
}

type SubmitPhaseCompletionInput = {
  state: WorkflowSessionState
  submission: CompletionSubmission
  requestedAt: string
  transitionId?: string
  nextPhaseContextStrategy?: WorkflowTransitionRequest['nextPhaseContextStrategy']
}

type SubmitPhaseCompletionResult = {
  status: 'pending' | 'recorded'
  state: WorkflowSessionState
  artifact: Record<string, unknown>
  notifications: WorkflowNotification[]
}

type RequestWorkflowRouteInput = {
  state: WorkflowSessionState
  request: WorkflowRouteRequest
  requestedAt: string
  transitionId?: string
}

type RequestWorkflowRouteResult = RuntimeResult & {
  approvedTargetPhaseId: string | null
  routeReason: string
  requiresConfirmation: boolean
}

type RecordCompletionSubmissionOptions = {
  readyLifecycleStatus: WorkflowArtifactLifecycleStatus
  advanceReady: boolean
  readyAuthority: WorkflowTransitionRecord['authority']
  readyAction: NonNullable<WorkflowTransitionRecord['action']>
  requestAction: string
}

type WorkflowCompletionArtifactPointer = WorkflowArtifactPointer & {
  phaseId: string
  title: string
  lifecycleStatus: WorkflowArtifactLifecycleStatus | WorkflowCompletionSubmissionStatus
  submission?: CompletionSubmission
}

const WORKFLOW_PHASE_SKILL_RESOLVER_VERSION = 'workflow-phase-skill-resolver-v1'
const UNAVAILABLE_RECOMMENDATION_STATUSES = new Set<WorkflowPhaseSkillResolutionStatus>([
  'missing',
  'unsupported-source',
  'plugin-disabled',
  'invalid-reference',
])
const DEGRADED_RECOMMENDATION_STATUSES = new Set<WorkflowPhaseSkillResolutionStatus>([
  'ambiguous',
  'installable',
])

function isWorkflowState(state: WorkflowSessionState): boolean {
  return state?.mode === 'workflow' && Array.isArray(state.phases)
}

function cloneState(state: WorkflowSessionState): WorkflowSessionState {
  return JSON.parse(JSON.stringify(state)) as WorkflowSessionState
}

function nextVersion(state: WorkflowSessionState): number {
  return (typeof state.stateVersion === 'number' ? state.stateVersion : 0) + 1
}

function touchState(state: WorkflowSessionState, requestedAt: string): WorkflowSessionState {
  return {
    ...state,
    status: state.workflowStatus,
    stateVersion: nextVersion(state),
    revision: typeof state.revision === 'number' ? state.revision : state.stateVersion + 1,
    updatedAt: requestedAt,
  }
}

function activePhase(state: WorkflowSessionState): WorkflowPhaseState | null {
  if (!state.activePhaseId) return null
  return state.phases.find((phase) => phase.id === state.activePhaseId) ?? null
}

function phaseDefinition(template: WorkflowTemplate | null, phaseId: string): WorkflowPhaseDefinition | null {
  return template?.phases?.find((phase) => phase.id === phaseId) ?? null
}

function phaseSkillSnapshots(state: WorkflowSessionState): WorkflowPhaseSkillSnapshot[] {
  return Array.isArray(state.phaseSkillSnapshots)
    ? state.phaseSkillSnapshots as WorkflowPhaseSkillSnapshot[]
    : []
}

function activePhaseSkillSnapshot(state: WorkflowSessionState): WorkflowPhaseSkillSnapshot | null {
  if (!state.activePhaseId) return null
  return phaseSkillSnapshots(state).find((snapshot) => snapshot.phaseId === state.activePhaseId) ?? null
}

function shouldUseBrainstormingSkill(state: WorkflowSessionState): boolean {
  const mode = state.brainstormingMode ?? 'auto'
  if (mode === 'off') return false
  if (mode === 'on') return true

  const run = activeWorkflowRun(state)
  const primaryLabel = run.primaryLabel ?? state.labels?.[0]
  const effort = run.effort ?? state.effort
  return primaryLabel === 'new-product' || effort === 'heavy'
}

function effectiveSkillBindings(
  definition: WorkflowPhaseDefinition | null,
  state: WorkflowSessionState,
): Array<string | WorkflowSkillBinding> | undefined {
  const bindings = definition?.skillBindings
  if (!bindings?.length) return bindings
  if (shouldUseBrainstormingSkill(state)) return bindings

  return bindings.filter((binding) => {
    const id = typeof binding === 'string' ? binding : binding.id
    return id !== 'superpowers:brainstorming'
  })
}

function nativeWorkflowSkillIds(
  catalog: WorkflowPhaseSkillCatalogEntry[],
  selectedWorkflowId: string | undefined,
): Set<string> {
  const ids = new Set<string>()
  for (const entry of catalog) {
    if (entry.source === 'bundled') continue
    if (entry.source === 'managed' && entry.packId !== selectedWorkflowId) continue
    ids.add(entry.name)
    if (entry.referenceId) ids.add(entry.referenceId)
    for (const alias of entry.aliases ?? []) ids.add(alias)
  }
  return ids
}

function hasNativeBrainstormingSkill(resolutions: WorkflowSkillBindingResolution[]): boolean {
  return resolutions.some((resolution) => (
    resolution.id === BUNDLED_BRAINSTORMING_REFERENCE_ID && resolution.availability === 'native'
  ))
}

function withBundledBrainstormingFallback(
  resolutions: WorkflowSkillBindingResolution[],
  fallbackContent: string | null,
): WorkflowSkillBindingResolution[] {
  if (!fallbackContent) return resolutions

  return [
    ...resolutions.filter((resolution) => resolution.id !== BUNDLED_BRAINSTORMING_REFERENCE_ID),
    {
      id: BUNDLED_BRAINSTORMING_REFERENCE_ID,
      mode: 'fallback-contract',
      availability: 'fallback',
      fallbackContract: 'Bundled complete brainstorming SKILL.md is injected for this workflow run.',
    },
  ]
}

function activeWorkflowRun(state: WorkflowSessionState): WorkflowRun {
  const runs = Array.isArray(state.workflowRuns) ? state.workflowRuns : []
  const active = state.activeWorkflowRunId
    ? runs.find((run) => run.id === state.activeWorkflowRunId)
    : runs.find((run) => run.status === 'active')
  if (active) return active

  return {
    id: state.activeWorkflowRunId ?? `${state.sessionId}-run`,
    templateId: state.templateIdentity?.id ?? 'workflow',
    status: state.runStatus === 'paused' ? 'paused' : 'active',
    primaryLabel: state.labels?.[0],
    secondaryLabels: state.secondaryLabels,
    effort: state.effort,
    workspaceRoot: state.workspaceRoot,
    currentPhaseId: state.activePhaseId ?? undefined,
    artifacts: [],
    history: [],
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  }
}

function updateActiveWorkflowRun(
  state: WorkflowSessionState,
  requestedAt: string,
  updates: Partial<WorkflowRun>,
): void {
  if (!Array.isArray(state.workflowRuns) || state.workflowRuns.length === 0) return
  const activeIndex = state.activeWorkflowRunId
    ? state.workflowRuns.findIndex((run) => run.id === state.activeWorkflowRunId)
    : state.workflowRuns.findIndex((run) => run.status === 'active')
  if (activeIndex < 0) return
  const current = state.workflowRuns[activeIndex]
  if (!current) return
  state.workflowRuns[activeIndex] = {
    ...current,
    ...updates,
    updatedAt: requestedAt,
    history: [
      ...current.history,
      {
        type: 'state-updated',
        at: requestedAt,
        summary: `Workflow run status updated to ${updates.status ?? current.status}.`,
        ...(updates.currentPhaseId ? { phaseId: updates.currentPhaseId } : {}),
      },
    ],
  }
}

function phaseIndex(state: WorkflowSessionState, phaseId: string): number {
  return state.phases.findIndex((phase) => phase.id === phaseId)
}

function nextPhaseId(state: WorkflowSessionState, phaseId: string): string | null {
  const index = phaseIndex(state, phaseId)
  if (index < 0) return null
  return state.phases[index + 1]?.id ?? null
}

function stateNotification(state: WorkflowSessionState): WorkflowNotification {
  return {
    type: 'system_notification',
    subtype: 'workflow_state',
    data: state,
  }
}

function transitionNotification(transition: WorkflowTransitionRecord): WorkflowNotification {
  return {
    type: 'system_notification',
    subtype: 'workflow_transition',
    data: transition,
  }
}

function reportReadyNotification(state: WorkflowSessionState, reportPointer: WorkflowArtifactPointer): WorkflowNotification {
  return {
    type: 'system_notification',
    subtype: 'workflow_report_ready',
    data: {
      sessionId: state.sessionId,
      reportPointer,
      stateVersion: state.stateVersion,
    },
  }
}

function blockedNotification(
  state: WorkflowSessionState,
  phaseId: string,
  reason: string,
  details: {
    status?: WorkflowCompletionSubmissionStatus
    evidence?: CompletionSubmission['evidence']
  } = {},
): WorkflowNotification {
  return {
    type: 'system_notification',
    subtype: 'workflow_blocked',
    message: reason,
    data: {
      sessionId: state.sessionId,
      phaseId,
      reason,
      retryable: true,
      stateVersion: state.stateVersion,
      ...(details.status ? { status: details.status } : {}),
      ...(details.evidence ? { evidence: details.evidence } : {}),
    },
  }
}

function workflowError(
  code: string,
  message: string,
  statusCode = code === 'WORKFLOW_STATE_STALE' || code === 'WORKFLOW_PENDING_CONFLICT' ? 409 : 400,
): ApiError {
  return new ApiError(statusCode, message, code)
}

function requestAction(request: WorkflowTransitionRequest | WorkflowClientMessage): string {
  return (request as unknown as Record<string, unknown>).action as string
}

function requestStateVersion(request: WorkflowTransitionRequest | WorkflowClientMessage): number | undefined {
  const record = request as unknown as Record<string, unknown>
  if (typeof record.stateVersion === 'number') return record.stateVersion
  return undefined
}

function assertFreshStateVersion(
  state: WorkflowSessionState,
  expectedVersion: number | undefined,
): void {
  if (typeof expectedVersion !== 'number') return
  if (expectedVersion !== state.stateVersion) {
    throw workflowError('WORKFLOW_STATE_STALE', 'Workflow state version is stale.')
  }
}

function assertCompletableWorkflowState(state: WorkflowSessionState): void {
  if (!isWorkflowState(state)) {
    throw workflowError('WORKFLOW_TOOL_UNAVAILABLE', 'Workflow completion is available only in workflow sessions.')
  }
  if (!state.activePhaseId) {
    throw workflowError('WORKFLOW_COMPLETION_INVALID', 'Workflow has no active phase to complete.')
  }
  if (state.workflowStatus === 'completed' || state.workflowStatus === 'cancelled' || state.workflowStatus === 'failed') {
    throw workflowError('WORKFLOW_COMPLETION_INVALID', 'Workflow is not in a completable state.')
  }
}

function assertActivePhase(state: WorkflowSessionState, phaseId: string): WorkflowPhaseState {
  if (phaseId !== state.activePhaseId) {
    throw workflowError('WORKFLOW_PHASE_MISMATCH', 'Completion phase must match the active workflow phase.')
  }
  const phase = state.phases.find((candidate) => candidate.id === phaseId)
  if (!phase) {
    throw workflowError('WORKFLOW_PHASE_MISMATCH', 'Workflow phase is unavailable.')
  }
  return phase
}

const GENERIC_WORKFLOW_ROUTE_ACTION_RULES = new Set([
  'route-request',
  'route_request',
  'request_workflow_route',
  'workflow-route',
  'workflow_route',
  'workflow route',
])

const WORKFLOW_ROUTE_INTENT_ACTION_RULES: Record<WorkflowRouteIntent, ReadonlySet<string>> = {
  advance: new Set(['advance', 'advance_phase', 'advance phase']),
  rework_current_phase: new Set([
    'rework_current_phase',
    'rework current phase',
    'return_to_phase',
    'return to phase',
  ]),
  jump_to_phase: new Set(['jump_to_phase', 'jump to phase']),
  route_to_workflow: new Set(['route_to_workflow', 'route to workflow']),
  pause: new Set(['pause', 'pause_workflow', 'pause workflow']),
  resume: new Set(['resume', 'resume_workflow', 'resume workflow']),
  finish: new Set(['finish', 'finish_workflow', 'finish workflow']),
}

function normalizeWorkflowActionRule(action: string): string {
  return action.trim().toLowerCase()
}

function isRouteActionRule(action: string, intent: WorkflowRouteIntent): boolean {
  return GENERIC_WORKFLOW_ROUTE_ACTION_RULES.has(action)
    || WORKFLOW_ROUTE_INTENT_ACTION_RULES[intent].has(action)
}

function isAnyRouteActionRule(action: string): boolean {
  return GENERIC_WORKFLOW_ROUTE_ACTION_RULES.has(action)
    || Object.values(WORKFLOW_ROUTE_INTENT_ACTION_RULES).some((rules) => rules.has(action))
}

function isRouteAllowedForCurrentPhase(
  state: WorkflowSessionState,
  template: WorkflowTemplate,
  intent: WorkflowRouteIntent,
): void {
  const policy = getWorkflowPhaseActionPolicy(state, template)
  if (!policy) return

  const forbiddenRules = policy.forbiddenActions.map(normalizeWorkflowActionRule)
  if (forbiddenRules.some((action) => isRouteActionRule(action, intent))) {
    throw workflowError('WORKFLOW_ROUTE_FORBIDDEN', `Workflow route intent "${intent}" is forbidden for the active phase.`)
  }

  const allowedRules = policy.allowedActions.map(normalizeWorkflowActionRule)
  const hasRouteSpecificAllowList = allowedRules.some(isAnyRouteActionRule)
  if (hasRouteSpecificAllowList && !allowedRules.some((action) => isRouteActionRule(action, intent))) {
    throw workflowError('WORKFLOW_ROUTE_FORBIDDEN', `Workflow route intent "${intent}" is not allowed for the active phase.`)
  }
}

function routeTargetForRequest(
  state: WorkflowSessionState,
  current: WorkflowPhaseState,
  request: WorkflowRouteRequest,
): string | null {
  if (request.intent === 'advance') return nextPhaseId(state, current.id)
  if (request.intent === 'rework_current_phase') return current.id
  if (request.intent === 'jump_to_phase') {
    if (!request.targetPhaseId?.trim()) {
      throw workflowError('WORKFLOW_ROUTE_TARGET_REQUIRED', 'jump_to_phase requires targetPhaseId.')
    }
    return request.targetPhaseId
  }
  if (request.intent === 'finish') return null
  return request.targetPhaseId?.trim() || null
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const EXECUTABLE_WORKFLOW_ROUTE_HANDOFF_FIELDS = new Set([
  'routeRequest',
  'routeDecision',
  'workflowRoute',
  'routeIntent',
  'targetPhaseId',
  'targetWorkflowId',
])

function executableWorkflowRouteHandoffField(handoff: Record<string, unknown>): string | null {
  return Object.keys(handoff).find((key) => EXECUTABLE_WORKFLOW_ROUTE_HANDOFF_FIELDS.has(key)) ?? null
}

function isReadyCompletionStatus(status: CompletionSubmission['status']): boolean {
  return status === 'ready' || status === 'needs_user' || status === 'completed'
}

function completionTransitionAuthority(state: WorkflowSessionState, phaseId: string): 'auto' | 'user-confirmation' {
  const authority = state.templateSnapshot?.phases.find((phase) => phase.id === phaseId)?.transitionAuthority
  return authority === 'auto' ? 'auto' : 'user-confirmation'
}

function validateCompletionSubmission(
  state: WorkflowSessionState,
  submission: CompletionSubmission,
): WorkflowPhaseState {
  assertCompletableWorkflowState(state)
  if (!submission || typeof submission !== 'object') {
    throw workflowError('WORKFLOW_COMPLETION_INVALID', 'Completion submission must be an object.')
  }
  if (!isReadyCompletionStatus(submission.status)
    && submission.status !== 'blocked'
    && submission.status !== 'unable'
  ) {
    throw workflowError('WORKFLOW_STATUS_UNSUPPORTED', 'Workflow completion status is unsupported.')
  }
  if (typeof submission.phaseId !== 'string' || !submission.phaseId) {
    throw workflowError('WORKFLOW_COMPLETION_INVALID', 'Completion submission phaseId is required.')
  }
  if (typeof submission.stateVersion !== 'number') {
    throw workflowError('WORKFLOW_COMPLETION_INVALID', 'Completion submission stateVersion is required.')
  }
  assertFreshStateVersion(state, submission.stateVersion)
  const phase = assertActivePhase(state, submission.phaseId)
  if (!isJsonObject(submission.handoff)) {
    throw workflowError('WORKFLOW_COMPLETION_INVALID', 'Completion submission handoff is required.')
  }
  const routeField = executableWorkflowRouteHandoffField(submission.handoff)
  if (routeField) {
    throw workflowError(
      'WORKFLOW_ROUTE_REQUEST_REQUIRED',
      `Completion handoff cannot contain executable workflow routing field "${routeField}". Submit completion evidence without a route, then call request_workflow_route in the same assistant turn.`,
    )
  }
  if (typeof submission.rationale !== 'string' || submission.rationale.length === 0) {
    throw workflowError('WORKFLOW_COMPLETION_INVALID', 'Completion submission rationale is required.')
  }
  if (!Array.isArray(submission.evidence)) {
    throw workflowError('WORKFLOW_COMPLETION_INVALID', 'Completion submission evidence is required.')
  }
  return phase
}

function normalizeArtifacts(value: unknown[] | undefined): WorkflowArtifactPointer[] {
  if (!Array.isArray(value)) return []
  return value.filter((artifact): artifact is WorkflowArtifactPointer =>
    Boolean(artifact) && typeof artifact === 'object' && !Array.isArray(artifact),
  )
}

function formatPhaseActionPolicy(state: WorkflowSessionState, template: WorkflowTemplate | null): string {
  const policy = getWorkflowPhaseActionPolicy(state, template)
  if (!policy) return ''

  const sections = [
    'Phase action policy',
    policy.allowedActions.length
      ? `Allowed actions:\n${policy.allowedActions.map((action) => `- ${sanitizeWorkflowToolNameText(action)}`).join('\n')}`
      : '',
    policy.forbiddenActions.length
      ? `Forbidden actions:\n${policy.forbiddenActions.map((action) => `- ${sanitizeWorkflowToolNameText(action)}`).join('\n')}`
      : '',
    'Do not perform forbidden actions in this phase even if the user asks.',
  ].filter(Boolean)

  return sections.join('\n')
}

function formatPhasePrompt(definition: WorkflowPhaseDefinition | null | undefined): string {
  const prompt = definition?.phasePrompt
  if (!prompt) return ''

  const sections = [
    'Phase handoff protocol',
    `Objective:\n${prompt.objective}`,
    prompt.handoffInput.length
      ? `Handoff intake:\n${prompt.handoffInput.map((item) => `- ${item}`).join('\n')}`
      : '',
    prompt.executionRules.length
      ? `Execution rules:\n${prompt.executionRules.map((item) => `- ${item}`).join('\n')}`
      : '',
    [
      `Required output artifact: ${prompt.outputArtifact.name}`,
      prompt.outputArtifact.sections.length
        ? prompt.outputArtifact.sections.map((section) => `- ${section}`).join('\n')
        : '',
    ].filter(Boolean).join('\n'),
    prompt.completionRules.length
      ? `Completion and stop rules:\n${prompt.completionRules.map((item) => `- ${item}`).join('\n')}`
      : '',
  ].filter(Boolean)

  return sections.join('\n')
}

function workflowLanguagePolicy(userMessage: string, explicitLanguage?: 'zh' | 'en'): string {
  if (explicitLanguage === 'zh') {
    return '工作流语言策略：当前 UI 使用中文。所有用户可见回复、AskUserQuestion 的 prompt、choice label、阶段摘要和交接说明必须使用中文。仅代码标识符、JSON key、tool name、文件路径、原始命令输出和原始错误信息可保留原文。若草稿不是中文，请在发送前改写为中文。'
  }
  if (explicitLanguage === 'en') {
    return 'Workflow language policy: the current UI language is English. Write all user-visible replies, AskUserQuestion prompts and choices, phase summaries, and handoffs in English. Keep code identifiers, JSON keys, tool names, file paths, raw command output, and raw errors verbatim.'
  }
  const chinese = /[\u3400-\u9fff]/.test(userMessage)
  if (!chinese) {
    return "Workflow language policy: respond in the user's most recent primary language. Keep structured AskUserQuestion prompts, labels, and phase summaries in that language; preserve code identifiers, JSON keys, tool names, paths, commands, and raw errors verbatim."
  }
  return '工作流语言策略：当前用户主要使用中文。所有用户可见回复、AskUserQuestion 的 prompt、choice label、阶段摘要和交接说明必须使用中文。仅代码标识符、JSON key、tool name、文件路径、原始命令输出和原始错误信息可保留原文。若草稿不是中文，请在发送前改写为中文。'
}

function formatWorkflowQuestionPolicy(): string {
  return [
    'Workflow-generated question policy',
    'Every workflow-generated question must use AskUserQuestion or the existing structured question UI.',
    'Ask one question at a time.',
    'Provide at least 3 options.',
    'Put the recommended option first and include "(Recommended)" in the label.',
    'Use plain-language descriptions.',
    'Plain assistant text is not an approval gate. Any confirmation, yes/no choice, "should I...", "do you want me to...", or "鎯宠瘯璇曞悧" workflow question must be emitted as AskUserQuestion or the structured question UI so the user gets clickable options.',
    'Do not put user-input requests, confirmation prompts, or clarification questions in normal assistant text. Normal assistant text may summarize progress or handoff results, but any sentence that expects the user to choose, confirm, answer, approve, reject, retry, continue, pause, stop, provide a path, or add a note must be represented as one structured AskUserQuestion.',
    'Allowed workflow question intents are confirm-workspace, confirm-scope, confirm-brainstorming, confirm-tech-stack, confirm-phase-transition, confirm-terminal-label, confirm-checkpoint-restore, confirm-handoff, clarify-requirement, choose-next-workflow, and record-user-note. Use the closest intent in the AskUserQuestion payload or option labels/descriptions when the current UI schema has no explicit intent field.',
    'Do not ask non-technical users to choose a tech stack; recommend one and ask them to confirm or request alternatives.',
    'When confirming a recommended tech stack, keep the option label as the stack name, but make each option description simple and user-facing. Explain what the choice means for the app, setup, and future changes in everyday words. Avoid specialist wording such as backend, rendering engine, database service, migrations, ORM, server-side, frontend stack, or deployment architecture unless the user used those words first.',
    'For optional visual brainstorming, browser display, local preview, or design sketch offers, do not promise to open anything unless a concrete preview/browser-opening control is available and the phase allows it. If confirmation is needed, ask one structured question with options such as "鐢熸垚绠€鐗堢晫闈㈣崏鍥?(Recommended)", "鍏堢敤鏂囧瓧纭鑼冨洿", and "璺宠繃瑙嗚鑽夊浘". If no preview tool is visible, provide a text or Mermaid sketch in the answer/handoff instead.',
    'If a concrete tool is missing or returns "No such tool available", do not retry it and do not use screen/computer-control tools to operate Terminal, an editor, Finder, or another app as a substitute. Record the limitation or ask one structured question.',
    'If a file edit/write operation reports "File has not been read yet", do not retry the edit blindly. Read the exact target file first when a concrete read tool is available, then retry once with the current file contents in mind. If no concrete read tool is visible, stop editing and ask one structured question or record the limitation in the workflow handoff.',
    'If a workflow artifact is required but no concrete file-writing tool is visible, write the artifact content in the phase handoff/answer instead of attempting file creation.',
    'Do not offer fake permission choices such as "grant terminal access" or "authorize write tools" unless the application provides a concrete permission control in the UI. If tools are unavailable, explain where the user can change execution permissions or offer a manual/pause path.',
  ].join('\n')
}

function formatCheckpointRestorePrompt(state: WorkflowSessionState): string {
  const restore = state.lastCheckpointRestore
  if (!restore || typeof restore !== 'object' || Array.isArray(restore)) return ''
  const details = restore as {
    checkpointId?: unknown
    checkpointLabel?: unknown
    restoredAt?: unknown
    restoredActivePhaseId?: unknown
    instruction?: unknown
    removedFiles?: unknown
  }
  return [
    'Workflow checkpoint rollback context',
    `Restored checkpoint: ${typeof details.checkpointId === 'string' ? details.checkpointId : 'unknown'}`,
    `Checkpoint label: ${typeof details.checkpointLabel === 'string' ? details.checkpointLabel : 'unknown'}`,
    `Restored at: ${typeof details.restoredAt === 'string' ? details.restoredAt : 'unknown'}`,
    `Restored phase: ${typeof details.restoredActivePhaseId === 'string' ? details.restoredActivePhaseId : state.activePhaseId ?? 'unknown'}`,
    Array.isArray(details.removedFiles) && details.removedFiles.length
      ? `Files removed by rollback:\n${details.removedFiles.map((item) => `- ${String(item)}`).join('\n')}`
      : 'Files removed by rollback: none recorded',
    typeof details.instruction === 'string'
      ? details.instruction
      : 'The workflow and files were rolled back to a checkpoint. Treat later generated context as superseded and continue from the restored phase.',
  ].join('\n')
}

function recommendationLabel(resolution: WorkflowPhaseSkillResolution): string {
  return resolution.resolvedSkill?.displayName
    ?? resolution.resolvedSkill?.name
    ?? resolution.reference.name
}

function formatResolutionDetails(resolution: WorkflowPhaseSkillResolution): string {
  const provenance = resolution.resolvedSkill?.source ?? resolution.reference.source
  const plugin = resolution.resolvedSkill?.pluginName ?? resolution.reference.pluginName
  const priority = resolution.reference.priority
  const details = [
    `status: ${resolution.status}`,
    provenance ? `source: ${provenance}` : '',
    plugin ? `plugin: ${plugin}` : '',
    priority ? `priority: ${priority}` : '',
  ].filter(Boolean)
  const diagnostic = resolution.diagnostic?.message
  return diagnostic ? `${details.join(', ')}; ${diagnostic}` : details.join(', ')
}

function formatRecommendedSkillsPromptBlock(snapshot: WorkflowPhaseSkillSnapshot | null): string {
  if (!snapshot || snapshot.resolutions.length === 0) return ''

  const available = snapshot.resolutions.filter((resolution) => resolution.status === 'available')
  const nativeSkillTool = available.filter(isNativeSkillToolRecommendation)
  const degraded = snapshot.resolutions.filter((resolution) => DEGRADED_RECOMMENDATION_STATUSES.has(resolution.status))
  const unavailable = snapshot.resolutions.filter((resolution) => UNAVAILABLE_RECOMMENDATION_STATUSES.has(resolution.status))

  const sections = [
    'Active phase recommended skills',
    'These are advisory recommendations for the current phase. They do not grant tool permissions, change model/effort settings, open shells, fork work, install hooks, or schedule SkillTool calls.',
    'A higher priority recommendation is attention metadata only, not a safety override or permission grant.',
    'Invoke recommended skills only when the current task matches the skill and normal SkillTool permission checks allow it.',
    'Do not invoke SkillTool automatically for recommended skills; the runtime schedules no SkillTool calls from recommendations.',
    nativeSkillTool.length
      ? [
          'Native skill execution',
          'Use SkillTool for these installed native skills when the current phase task directly matches the skill and SkillTool is available and allowed.',
          'If SkillTool is unavailable or denied, mark the skill as relevant-unavailable or use the documented fallback-contract without claiming native execution.',
          nativeSkillTool.map((resolution) => `- ${resolution.reference.name}`).join('\n'),
        ].join('\n')
      : '',
    'nested skill invocation must follow existing SkillTool depth guardrails and must not recurse beyond the active depth limits.',
    'Record bounded material skill audit evidence only when relevant using outcomes: used, relevant-skipped, or relevant-unavailable.',
    available.length
      ? `Available recommendations:\n${available.map((resolution) =>
        `- ${recommendationLabel(resolution)} (${formatResolutionDetails(resolution)})`
      ).join('\n')}`
      : '',
    degraded.length
      ? `Degraded recommendations:\n${degraded.map((resolution) =>
        `- ${recommendationLabel(resolution)} (${formatResolutionDetails(resolution)})`
      ).join('\n')}`
      : '',
    unavailable.length
      ? `Unavailable recommendations:\n${unavailable.map((resolution) =>
        `- ${recommendationLabel(resolution)} (${formatResolutionDetails(resolution)})`
      ).join('\n')}`
      : '',
  ].filter(Boolean)

  return sections.join('\n')
}

function isNativeSkillToolRecommendation(resolution: WorkflowPhaseSkillResolution): boolean {
  if (resolution.status !== 'available') return false
  const source = resolution.resolvedSkill?.source ?? resolution.reference.source
  return (
    source === 'superpowers' ||
    source === 'spec-kit-plus' ||
    source === 'codex' ||
    source === 'claude-code' ||
    source === 'workflow' ||
    source === 'user' ||
    source === 'project' ||
    source === 'plugin' ||
    source === 'bundled' ||
    source === 'mcp'
  )
}

function resolveProjectRecommendationsFromTemplate(
  references: WorkflowPhaseDefinition['skills'],
  resolutions: WorkflowPhaseSkillResolution[],
  checkedAt: string,
): WorkflowPhaseSkillResolution[] {
  return resolutions.map((resolution, index) => {
    const reference = references?.[index]
    if (
      resolution.status !== 'missing'
      || reference?.source !== 'project'
      || typeof reference.name !== 'string'
      || reference.name.length === 0
    ) {
      return resolution
    }

    return {
      reference: resolution.reference,
      status: 'available',
      checkedAt,
      resolvedSkill: {
        name: resolution.reference.name,
        source: 'project',
      },
    }
  })
}

function completionFromInput(
  phaseId: string,
  requestedAt: string,
  completion?: TransitionInput['completion'],
): WorkflowCompletionResult | null {
  if (!completion) return null
  return {
    phaseId,
    passed: completion.passed,
    checkedAt: requestedAt,
    criteriaType: completion.artifactPointers?.length ? 'artifact-required' : 'agent-reported',
    artifactPointers: normalizeArtifacts(completion.artifactPointers),
    ...(completion.blockedReason ? { blockedReason: completion.blockedReason } : {}),
  }
}

function transitionRecord(input: {
  request: WorkflowTransitionRequest | WorkflowClientMessage
  fromPhaseId: string | null
  toPhaseId: string | null
  authority: WorkflowTransitionRecord['authority']
  action: NonNullable<WorkflowTransitionRecord['action']>
  result: NonNullable<WorkflowTransitionRecord['result']>
  requestedAt: string
  stateVersion: number
}): WorkflowTransitionRecord {
  return {
    transitionId: input.request.transitionId || crypto.randomUUID(),
    requestId: input.request.transitionId,
    fromPhaseId: input.fromPhaseId,
    toPhaseId: input.toPhaseId,
    authority: input.authority,
    action: input.action,
    result: input.result,
    completionCheckId: null,
    createdAt: input.requestedAt,
    stateVersion: input.stateVersion,
    ...(input.toPhaseId && input.request.nextPhaseContextStrategy === 'clear'
      ? { nextPhaseContextStrategy: 'clear' as const }
      : {}),
  }
}

function hasTransition(state: WorkflowSessionState, transitionId: string | undefined): boolean {
  if (!transitionId) return false
  return state.transitionHistory.some((transition) =>
    transition.transitionId === transitionId || transition.requestId === transitionId,
  )
}

function existingTransition(
  state: WorkflowSessionState,
  transitionId: string | undefined,
): WorkflowTransitionRecord | null {
  if (!transitionId) return null
  return state.transitionHistory.find((transition) =>
    transition.transitionId === transitionId || transition.requestId === transitionId,
  ) ?? null
}

function finalReportPointer(state: WorkflowSessionState, requestedAt: string): WorkflowArtifactPointer {
  return {
    kind: 'final-report',
    sessionId: state.sessionId,
    artifactId: 'final',
    schemaVersion: state.schemaVersion,
    createdAt: requestedAt,
    label: 'Final workflow report',
  }
}

function artifactIndexValues(state: WorkflowSessionState): WorkflowArtifactPointer[] {
  if (Array.isArray(state.artifactIndex)) {
    return state.artifactIndex
  }
  if (state.artifactIndex && typeof state.artifactIndex === 'object') {
    return Object.values(state.artifactIndex)
  }
  return []
}

function applyNextPhaseContextStrategy(
  state: WorkflowSessionState,
  toPhaseId: string | null,
  strategy: WorkflowTransitionRequest['nextPhaseContextStrategy'] | undefined,
): void {
  if (toPhaseId && strategy === 'clear') {
    state.nextPhaseContextStrategy = 'clear'
    return
  }
  delete state.nextPhaseContextStrategy
}

function appendArtifact(state: WorkflowSessionState, artifact: WorkflowArtifactPointer): void {
  if (Array.isArray(state.artifactIndex)) {
    if (!state.artifactIndex.some((pointer) => pointer.artifactId === artifact.artifactId)) {
      state.artifactIndex.push(artifact)
    }
    return
  }

  if (state.artifactIndex && typeof state.artifactIndex === 'object') {
    state.artifactIndex = {
      ...state.artifactIndex,
      [artifact.artifactId]: artifact,
    }
    return
  }

  state.artifactIndex = [artifact]
}

function updatePointerLifecycle(
  pointer: WorkflowArtifactPointer,
  lifecycleStatus: WorkflowArtifactLifecycleStatus,
): WorkflowArtifactPointer {
  return {
    ...pointer,
    lifecycleStatus,
  } as WorkflowArtifactPointer
}

function markArtifacts(
  state: WorkflowSessionState,
  phase: WorkflowPhaseState,
  artifactIds: string[],
  lifecycleStatus: WorkflowArtifactLifecycleStatus,
): WorkflowArtifactPointer[] {
  const ids = new Set(artifactIds)
  phase.artifactPointers = phase.artifactPointers.map((pointer) =>
    ids.has(pointer.artifactId) ? updatePointerLifecycle(pointer, lifecycleStatus) : pointer
  )

  if (Array.isArray(state.artifactIndex)) {
    state.artifactIndex = state.artifactIndex.map((pointer) =>
      ids.has(pointer.artifactId) ? updatePointerLifecycle(pointer, lifecycleStatus) : pointer
    )
  } else if (state.artifactIndex && typeof state.artifactIndex === 'object') {
    state.artifactIndex = Object.fromEntries(
      Object.entries(state.artifactIndex).map(([key, pointer]) => [
        key,
        ids.has(pointer.artifactId) ? updatePointerLifecycle(pointer, lifecycleStatus) : pointer,
      ]),
    )
  }

  return phase.artifactPointers.filter((pointer) => ids.has(pointer.artifactId))
}

function completionArtifact(input: {
  state: WorkflowSessionState
  phaseId: string
  requestedAt: string
  transitionId?: string
  submission: CompletionSubmission
  lifecycleStatus: WorkflowArtifactLifecycleStatus | WorkflowCompletionSubmissionStatus
}): WorkflowCompletionArtifactPointer {
  const suffix = input.transitionId || crypto.randomUUID()
  return {
    kind: 'phase-artifact',
    sessionId: input.state.sessionId,
    artifactId: `${input.phaseId}-${input.submission.status}-${suffix}`,
    schemaVersion: input.state.schemaVersion,
    createdAt: input.requestedAt,
    phaseId: input.phaseId,
    title: `${input.phaseId} phase completion`,
    lifecycleStatus: input.lifecycleStatus,
    submission: input.submission,
  }
}

function cloneArtifactForResult(artifact: WorkflowArtifactPointer): Record<string, unknown> {
  return JSON.parse(JSON.stringify(artifact)) as Record<string, unknown>
}

function withCompletionSubmission(
  pointer: WorkflowArtifactPointer,
  submission: CompletionSubmission,
): WorkflowArtifactPointer {
  const record = pointer as Record<string, unknown>
  if (
    (record.lifecycleStatus === 'blocked' || record.lifecycleStatus === 'unable') &&
    record.lifecycleStatus === submission.status &&
    !record.submission
  ) {
    return {
      ...pointer,
      submission,
    } as WorkflowArtifactPointer
  }
  return pointer
}

function persistCompletionSubmissionOnMatchingArtifacts(
  state: WorkflowSessionState,
  phase: WorkflowPhaseState,
  artifact: WorkflowArtifactPointer,
  submission: CompletionSubmission,
): void {
  phase.artifactPointers = phase.artifactPointers.map((pointer) => {
    const record = pointer as Record<string, unknown>
    if (pointer.artifactId === artifact.artifactId) return artifact
    if (record.lifecycleStatus === submission.status) {
      return { ...pointer, submission } as WorkflowArtifactPointer
    }
    return pointer
  })

  if (Array.isArray(state.artifactIndex)) {
    state.artifactIndex = state.artifactIndex.map((pointer) => {
      const record = pointer as Record<string, unknown>
      if (pointer.artifactId === artifact.artifactId) return artifact
      if (record.lifecycleStatus === submission.status) {
        return { ...pointer, submission } as WorkflowArtifactPointer
      }
      return pointer
    })
  } else if (state.artifactIndex && typeof state.artifactIndex === 'object') {
    state.artifactIndex = {
      ...state.artifactIndex,
      [artifact.artifactId]: artifact,
    }
  }
}

export type WorkflowRuntimeTemplateLoader = (state: WorkflowSessionState) => Promise<WorkflowTemplate | null>

export class WorkflowRuntimeService {
  constructor(
    private readonly loadSkillCatalog: () => Promise<WorkflowPhaseSkillCatalogEntry[]> = collectTemplateSkillCatalog,
    private readonly loadWorkflowTemplate: WorkflowRuntimeTemplateLoader = loadCurrentWorkflowTemplate,
  ) {}

  async exitWorkflow(input: {
    state: WorkflowSessionState
    requestedAt: string
    transitionId?: string
  }): Promise<RuntimeResult> {
    if (!isWorkflowState(input.state)) {
      return { state: input.state, notifications: [] }
    }

    const existing = existingTransition(input.state, input.transitionId)
    if (existing) {
      return { state: input.state, notifications: [] }
    }

    const state = cloneState(input.state)
    const previousStatus = state.workflowStatus
    state.workflowStatus = 'cancelled'
    state.status = 'cancelled'
    state.runStatus = 'cancelled'
    state.pendingConfirmation = null
    updateActiveWorkflowRun(state, input.requestedAt, {
      status: 'cancelled',
      currentPhaseId: state.activePhaseId ?? undefined,
    })

    const nextState = touchState(state, input.requestedAt)
    const transition = transitionRecord({
      request: {
        phaseId: state.activePhaseId ?? '',
        action: 'cancelled' as WorkflowTransitionRequest['action'],
        transitionId: input.transitionId,
      },
      fromPhaseId: state.activePhaseId,
      toPhaseId: state.activePhaseId,
      authority: 'cancel',
      action: 'cancelled',
      result: 'noop',
      requestedAt: input.requestedAt,
      stateVersion: nextState.stateVersion,
    })
    transition.fromStatus = previousStatus
    transition.toStatus = 'cancelled'
    transition.decision = 'cancelled'
    nextState.transitionHistory.push(transition)

    return {
      state: nextState,
      notifications: [transitionNotification(transition), stateNotification(nextState)],
    }
  }

  async startPhase(input: StartPhaseInput): Promise<RuntimeResult> {
    if (!isWorkflowState(input.state)) {
      return { state: input.state, notifications: [] }
    }

    const state = cloneState(input.state)
    const phase = activePhase(state)
    if (!phase) return { state: input.state, notifications: [] }

    const template = await this.loadWorkflowTemplate(state)
    if (!template) return this.missingTemplateResult(state, input.requestedAt)

    const definition = phaseDefinition(template, phase.id)
    const requestedModel = definition?.requestedModel ?? phase.requestedModel
    phase.requestedModel = requestedModel || undefined
    phase.startedAt ||= input.requestedAt
    phase.skillProvenance = definition?.skillDeclarations ?? phase.skillProvenance ?? []
    await this.ensurePhaseSkillSnapshot(state, definition, input.requestedAt, template)

    let actualModel: string | null = null
    let providerId: string | null = null
    let fallbackReason: string | undefined

    if (requestedModel && await input.isRequestedModelAvailable(requestedModel)) {
      actualModel = requestedModel
    } else {
      const fallback = await input.resolveDefaultModel()
      providerId = fallback.providerId
      actualModel = fallback.modelId
      if (requestedModel && actualModel) {
        fallbackReason = `Requested model ${requestedModel} is unavailable; using main session default ${actualModel}.`
      }
    }

    if (!actualModel) {
      const reason = requestedModel
        ? `Requested model ${requestedModel} is unavailable and no fallback model can be resolved.`
        : 'No workflow phase model can be resolved.'
      phase.status = 'failed'
      phase.actualModel = undefined
      phase.blockedReason = reason
      const blockedState = touchState({
        ...state,
        workflowStatus: 'failed',
        status: 'failed',
        runStatus: 'blocked',
        blockedReason: reason,
      }, input.requestedAt)
      updateActiveWorkflowRun(blockedState, input.requestedAt, {
        status: 'blocked',
        currentPhaseId: phase.id,
      })
      return {
        state: blockedState,
        notifications: [stateNotification(blockedState), blockedNotification(blockedState, phase.id, reason)],
      }
    }

    phase.status = 'running'
    phase.actualModel = actualModel
    phase.fallbackReason = fallbackReason
    delete phase.blockedReason
    updateActiveWorkflowRun(state, input.requestedAt, {
      status: 'active',
      currentPhaseId: phase.id,
    })

    const runningState = touchState({
      ...state,
      workflowStatus: 'running',
      status: 'running',
      runStatus: 'active',
      activeModelResolution: {
        requestedModel: requestedModel ?? null,
        actualModel,
        providerId,
        source: fallbackReason ? 'main-session-default' : 'phase-request',
        fallbackApplied: Boolean(fallbackReason),
        fallbackReason: fallbackReason ?? null,
        resolvedAt: input.requestedAt,
      },
    }, input.requestedAt)

    return {
      state: runningState,
      notifications: [stateNotification(runningState)],
    }
  }

  async assemblePrompt(input: AssemblePromptInput): Promise<AssemblePromptResult> {
    if (!isWorkflowState(input.state)) {
      return { content: input.userMessage, skillProvenance: [] }
    }

    const phase = activePhase(input.state)
    if (!phase) {
      return { content: input.userMessage, skillProvenance: [] }
    }

    const template = await this.loadWorkflowTemplate(input.state)
    if (!template) {
      return {
        content: '当前 workflow 的 ZIP 模板不可用，无法继续执行。请先重新导入对应 workflow ZIP。',
        skillProvenance: [],
      }
    }

    const definition = phaseDefinition(template, phase.id)
    const requiredArtifacts = definition?.requiredArtifacts ?? []
    const criteria = definition?.completionCriteria
    const criteriaText = typeof criteria === 'string'
      ? criteria
      : Array.isArray(criteria)
        ? criteria.join('\n')
        : criteria && typeof criteria === 'object'
          ? JSON.stringify(criteria)
          : 'No completion criteria recorded.'
    const skillProvenance = phase.skillProvenance ?? definition?.skillDeclarations ?? []
    const actionPolicy = formatPhaseActionPolicy(input.state, template)
    const checkpointRestorePrompt = formatCheckpointRestorePrompt(input.state)
    const phasePrompt = formatPhasePrompt(definition)
    const recommendedSkills = formatRecommendedSkillsPromptBlock(activePhaseSkillSnapshot(input.state))
    const questionPolicy = formatWorkflowQuestionPolicy()
    const languagePolicy = workflowLanguagePolicy(input.userMessage, input.state.workflowLanguage)
    const skillCatalog = await this.loadSkillCatalog()
    const resolvedSkillAvailability = definition
      ? resolveWorkflowSkillBindings(effectiveSkillBindings(definition, input.state), {
          installedSkillIds: nativeWorkflowSkillIds(skillCatalog, template.id),
          allowFallbackContracts: template.source !== 'pack',
        })
      : []
    const bundledBrainstormingFallback = definition && shouldUseBrainstormingSkill(input.state) && !hasNativeBrainstormingSkill(resolvedSkillAvailability)
      ? await loadBundledBrainstormingFallback(skillCatalog)
      : null
    const skillAvailability = withBundledBrainstormingFallback(
      resolvedSkillAvailability,
      bundledBrainstormingFallback,
    )
    const strictRuntimePrompt = definition
      ? buildWorkflowRuntimePrompt({
        template,
        run: activeWorkflowRun(input.state),
        phase: definition,
        sessionState: input.state,
        inheritedArtifacts: activeWorkflowRun(input.state).artifacts,
        projectContext: activeWorkflowRun(input.state).artifacts.find((artifact) => artifact.filename === 'project-context.md')?.content,
        skillAvailability,
        brainstormingFallback: bundledBrainstormingFallback,
        userMessage: '',
      })
      : ''

    const lines = [
      'Workflow mode',
      `Active phase: ${phase.id}`,
      definition?.instructions ? `Phase instructions: ${definition.instructions}` : '',
      strictRuntimePrompt,
      checkpointRestorePrompt,
      languagePolicy,
      questionPolicy,
      phasePrompt,
      actionPolicy,
      recommendedSkills,
      requiredArtifacts.length
        ? `Required artifacts:\n${requiredArtifacts.map((artifact) => `- ${artifact.id}: ${artifact.description}`).join('\n')}`
        : 'Required artifacts: none',
      `completion criteria: ${criteriaText}`,
      input.priorArtifactSummaries?.length
        ? `Prior artifacts:\n${input.priorArtifactSummaries.join('\n')}`
        : '',
      input.state.nextPhaseContextStrategy === 'clear'
        ? 'Context boundary: use only accepted handoff materials and prior workflow artifacts for this phase. Do not rely on inherited transcript history unless the user provides it again.'
        : '',
      skillProvenance.length
        ? `Skill guidance:\n${skillProvenance.map((skill) => `- ${sanitizeWorkflowToolNameText(skill.guidance)}`).join('\n')}`
        : '',
      phase.requestedModel ? `Requested model: ${phase.requestedModel}` : '',
      phase.actualModel ? `Actual model: ${phase.actualModel}` : '',
      phase.fallbackReason ? `Model fallback: ${phase.fallbackReason}` : '',
      '',
      input.userMessage,
    ].filter(Boolean)

    return {
      content: lines.join('\n\n'),
      skillProvenance,
      scheduledToolCalls: [],
    }
  }

  async applyTransition(input: TransitionInput): Promise<RuntimeResult> {
    if (!isWorkflowState(input.state)) {
      return { state: input.state, notifications: [] }
    }
    const existing = existingTransition(input.state, input.request.transitionId)
    if (existing) {
      if (existing.fromPhaseId === input.request.phaseId && input.state.activePhaseId !== input.request.phaseId) {
        return { state: input.state, notifications: [] }
      }
      return { state: input.state, notifications: [] }
    }

    assertFreshStateVersion(input.state, requestStateVersion(input.request))
    const state = cloneState(input.state)
    const template = await this.loadWorkflowTemplate(state)
    if (!template) return this.missingTemplateResult(state, input.requestedAt)

    const current = state.phases.find((phase) => phase.id === input.request.phaseId)
    if (!current) {
      return this.blockTransition(state, input, 'Workflow phase is unavailable.')
    }

    const action = requestAction(input.request)
    if (action === 'confirm') {
      return this.confirmTransition(state, input, current)
    }
    if (action === 'reject') {
      return this.rejectTransition(state, input, current)
    }
    if (action === 'manual_complete') {
      return this.manualCompleteTransition(state, input, current)
    }
    if (action === 'pause') {
      return this.pauseTransition(state, input, current)
    }
    if (action === 'resume') {
      return this.resumeTransition(state, input, current)
    }
    if (action === 'stop') {
      return this.stopTransition(state, input, current)
    }
    return this.retryTransition(state, input, current, template)
  }

  async submitPhaseCompletion(input: SubmitPhaseCompletionInput): Promise<SubmitPhaseCompletionResult> {
    const authority = completionTransitionAuthority(input.state, input.submission.phaseId)
    const advanceReady = input.submission.status === 'completed' && authority === 'auto'
    return this.recordCompletionSubmission(input, {
      readyLifecycleStatus: advanceReady ? 'accepted' : 'pending',
      advanceReady,
      readyAuthority: authority,
      readyAction: advanceReady ? 'auto-advance' : 'confirmation-requested',
      requestAction: 'retry',
    })
  }

  async submitManualCompletion(input: SubmitPhaseCompletionInput): Promise<SubmitPhaseCompletionResult> {
    return this.recordCompletionSubmission(input, {
      readyLifecycleStatus: 'accepted',
      advanceReady: true,
      readyAuthority: 'user-confirmation',
      readyAction: 'confirmed',
      requestAction: 'manual_complete',
    })
  }

  async requestWorkflowRoute(input: RequestWorkflowRouteInput): Promise<RequestWorkflowRouteResult> {
    if (!isWorkflowState(input.state)) {
      throw workflowError('WORKFLOW_TOOL_UNAVAILABLE', 'Workflow routing is available only in workflow sessions.')
    }
    assertFreshStateVersion(input.state, input.request.stateVersion)
    if (!input.request.rationale?.trim()) {
      throw workflowError('WORKFLOW_ROUTE_INVALID', 'Workflow route rationale is required.')
    }
    if (!Array.isArray(input.request.evidence)) {
      throw workflowError('WORKFLOW_ROUTE_INVALID', 'Workflow route evidence must be an array.')
    }

    const state = cloneState(input.state)
    const template = await this.loadWorkflowTemplate(state)
    if (!template) {
      const missing = this.missingTemplateResult(state, input.requestedAt)
      return {
        ...missing,
        approvedTargetPhaseId: null,
        routeReason: 'Workflow template is unavailable.',
        requiresConfirmation: true,
      }
    }
    const phaseId = input.request.phaseId ?? state.activePhaseId
    if (!phaseId) throw workflowError('WORKFLOW_PHASE_MISMATCH', 'Workflow has no active phase to route from.')
    const current = assertActivePhase(state, phaseId)
    isRouteAllowedForCurrentPhase(state, template, input.request.intent)

    if (input.request.intent === 'route_to_workflow' && !input.request.targetWorkflowId?.trim()) {
      throw workflowError('WORKFLOW_ROUTE_TARGET_REQUIRED', 'route_to_workflow requires targetWorkflowId.')
    }
    if (input.request.intent === 'route_to_workflow') {
      throw workflowError('WORKFLOW_ROUTE_UNSUPPORTED', 'route_to_workflow is not available in this runtime; keep the current workflow active and select a workflow explicitly.')
    }
    if (input.request.intent === 'pause' || input.request.intent === 'resume') {
      const result = input.request.intent === 'pause'
        ? await this.pauseTransition(state, {
          requestedAt: input.requestedAt,
          request: { phaseId: current.id, action: 'pause', transitionId: input.transitionId },
        }, current)
        : await this.resumeTransition(state, {
          requestedAt: input.requestedAt,
          request: { phaseId: current.id, action: 'resume', transitionId: input.transitionId },
        }, current)
      return {
        ...result,
        approvedTargetPhaseId: current.id,
        routeReason: input.request.rationale,
        requiresConfirmation: false,
      }
    }

    const hasPendingCompletion = Boolean(
      state.pendingConfirmation
      && state.pendingConfirmation.phaseId === current.id
      && state.pendingConfirmation.status === 'pending',
    )
    const isBlockedRecovery = Boolean(
      state.runStatus === 'blocked'
      && !state.pendingConfirmation
      && current.blockedReason,
    )
    if (!hasPendingCompletion && !isBlockedRecovery) {
      throw workflowError(
        'WORKFLOW_ROUTE_COMPLETION_REQUIRED',
        'Submit the current phase completion before requesting a workflow route.',
      )
    }
    if (isBlockedRecovery && !['rework_current_phase', 'jump_to_phase'].includes(input.request.intent)) {
      throw workflowError(
        'WORKFLOW_ROUTE_RECOVERY_INTENT_INVALID',
        `Workflow route intent "${input.request.intent}" is not available while the current phase is blocked.`,
      )
    }
    if (state.pendingRoute?.status === 'pending') {
      throw workflowError('WORKFLOW_PENDING_CONFLICT', 'Workflow already has a pending route.')
    }

    const targetPhaseId = routeTargetForRequest(state, current, input.request)
    if (targetPhaseId && !template.phases.some((phase) => phase.id === targetPhaseId)) {
      throw workflowError('WORKFLOW_ROUTE_TARGET_INVALID', `Workflow route target "${targetPhaseId}" does not exist in the current template.`)
    }

    // A repair may describe returning to validation as a jump even though the
    // submitted completion already targets the immediate next phase. Keep that
    // ordinary completion confirmation as the single source of truth instead
    // of creating a second pending route for the exact same destination.
    if (
      hasPendingCompletion
      && (input.request.intent === 'advance' || input.request.intent === 'jump_to_phase')
      && targetPhaseId === state.pendingConfirmation?.toPhaseId
    ) {
      const requiresConfirmation = input.request.requireUserConfirmation !== false
      if (!requiresConfirmation) {
        const confirmed = await this.confirmTransition(state, {
          requestedAt: input.requestedAt,
          request: {
            phaseId: current.id,
            action: 'confirm',
            transitionId: `${input.transitionId ?? 'workflow-route'}-approved`,
            expectedStateVersion: state.stateVersion,
          },
        }, current)
        return {
          ...confirmed,
          approvedTargetPhaseId: targetPhaseId,
          routeReason: input.request.rationale.trim(),
          requiresConfirmation: false,
        }
      }
      return {
        state,
        notifications: [],
        approvedTargetPhaseId: targetPhaseId,
        routeReason: input.request.rationale.trim(),
        requiresConfirmation: true,
      }
    }

    const requiresConfirmation = input.request.requireUserConfirmation !== false
    state.pendingRoute = {
      routeId: input.transitionId ?? `workflow-route-${Date.now()}`,
      phaseId: current.id,
      fromPhaseId: current.id,
      targetPhaseId,
      ...(input.request.targetWorkflowId ? { targetWorkflowId: input.request.targetWorkflowId } : {}),
      intent: input.request.intent,
      rationale: input.request.rationale.trim(),
      evidence: input.request.evidence,
      createdAt: input.requestedAt,
      requiresConfirmation,
      approvedTargetPhaseId: targetPhaseId,
      status: 'pending',
      ...(isBlockedRecovery ? { origin: 'blocked-recovery' as const } : {}),
    }
    state.workflowStatus = 'pending-confirmation'
    state.status = 'pending-confirmation'
    state.runStatus = 'waiting_for_user'
    const nextState = touchState(state, input.requestedAt)
    const transition = transitionRecord({
      request: {
        phaseId: current.id,
        action: 'route',
        transitionId: input.transitionId,
      } as WorkflowTransitionRequest,
      fromPhaseId: current.id,
      toPhaseId: targetPhaseId,
      authority: 'user-choice',
      action: 'route-requested',
      result: 'accepted',
      requestedAt: input.requestedAt,
      stateVersion: nextState.stateVersion,
    })
    nextState.transitionHistory.push(transition)

    if (!requiresConfirmation) {
      const confirmed = await this.confirmTransition(nextState, {
        requestedAt: input.requestedAt,
        request: {
          phaseId: current.id,
          action: 'confirm',
          transitionId: `${input.transitionId ?? 'workflow-route'}-approved`,
          expectedStateVersion: nextState.stateVersion,
        },
      }, current)
      return {
        ...confirmed,
        approvedTargetPhaseId: targetPhaseId,
        routeReason: input.request.rationale.trim(),
        requiresConfirmation: false,
      }
    }

    return {
      state: nextState,
      notifications: [transitionNotification(transition), stateNotification(nextState)],
      approvedTargetPhaseId: targetPhaseId,
      routeReason: input.request.rationale.trim(),
      requiresConfirmation: true,
    }
  }

  private async ensurePhaseSkillSnapshot(
    state: WorkflowSessionState,
    definition: WorkflowPhaseDefinition | null,
    snapshottedAt: string,
    template: WorkflowTemplate,
  ): Promise<void> {
    if (!definition?.skills?.length) return

    const snapshots = phaseSkillSnapshots(state)
    if (snapshots.some((snapshot) => snapshot.phaseId === definition.id)) return

    const catalog = await collectTemplateSkillCatalog()
    const result = await resolveWorkflowPhaseSkills({
      templateId: template.id,
      phaseId: definition.id,
      references: definition.skills,
      catalog,
      requiredPackId: template.source === 'pack' ? template.packId : undefined,
      checkedAt: snapshottedAt,
    })
    const resolutions = resolveProjectRecommendationsFromTemplate(definition.skills, result.resolutions, snapshottedAt)
    state.phaseSkillSnapshots = [
      ...snapshots,
      {
        phaseId: definition.id,
        references: resolutions.map((resolution) => resolution.reference),
        resolutions,
        snapshottedAt,
        ...(state.templateIdentity?.contentHash ? { templateContentHash: state.templateIdentity.contentHash } : {}),
        resolverVersion: WORKFLOW_PHASE_SKILL_RESOLVER_VERSION,
      },
    ]
  }

  private recordCompletionSubmission(
    input: SubmitPhaseCompletionInput,
    options: RecordCompletionSubmissionOptions,
  ): SubmitPhaseCompletionResult {
    if (!isWorkflowState(input.state)) {
      throw workflowError('WORKFLOW_TOOL_UNAVAILABLE', 'Workflow completion is available only in workflow sessions.')
    }

    if (hasTransition(input.state, input.transitionId)) {
      const artifact = artifactIndexValues(input.state).find((pointer) =>
        pointer.artifactId.includes(input.transitionId ?? '')
      ) ?? {}
      return {
        status: isReadyCompletionStatus(input.submission.status) && !options.advanceReady ? 'pending' : 'recorded',
        state: input.state,
        artifact: artifact as Record<string, unknown>,
        notifications: [],
      }
    }

    validateCompletionSubmission(input.state, input.submission)
    if (
      isReadyCompletionStatus(input.submission.status)
      && input.state.pendingConfirmation?.status === 'pending'
    ) {
      throw workflowError('WORKFLOW_PENDING_CONFLICT', 'Workflow already has a pending completion.')
    }

    const state = cloneState(input.state)
    const phase = validateCompletionSubmission(state, input.submission)
    const artifact = completionArtifact({
      state,
      phaseId: phase.id,
      requestedAt: input.requestedAt,
      transitionId: input.transitionId,
      submission: input.submission,
      lifecycleStatus: isReadyCompletionStatus(input.submission.status) ? options.readyLifecycleStatus : input.submission.status,
    })

    phase.artifactPointers = mergeArtifacts(phase.artifactPointers, [artifact])
    appendArtifact(state, artifact)
    persistCompletionSubmissionOnMatchingArtifacts(state, phase, artifact, input.submission)

    const toPhaseId = nextPhaseId(state, phase.id)
    if (isReadyCompletionStatus(input.submission.status)) {
      delete phase.blockedReason
      if (options.advanceReady) {
        this.advanceToPhase(state, phase, toPhaseId, input.requestedAt)
        applyNextPhaseContextStrategy(state, toPhaseId, input.nextPhaseContextStrategy)
      } else {
        phase.status = 'pending-confirmation'
        state.workflowStatus = 'pending-confirmation'
        state.status = 'pending-confirmation'
        state.runStatus = 'waiting_for_user'
        updateActiveWorkflowRun(state, input.requestedAt, {
          status: 'waiting_for_user',
          currentPhaseId: phase.id,
        })
        state.pendingConfirmation = makePendingConfirmation(state, phase, toPhaseId, input.requestedAt, {
          submission: input.submission,
          artifactRefs: [artifact],
          confirmationId: input.transitionId,
          completionCheckId: input.transitionId,
        })
      }
    } else {
      phase.status = 'running'
      phase.blockedReason = input.submission.rationale
      state.workflowStatus = 'running'
      state.status = 'running'
      state.runStatus = 'blocked'
      state.pendingConfirmation = null
      updateActiveWorkflowRun(state, input.requestedAt, {
        status: 'blocked',
        currentPhaseId: phase.id,
      })
    }

    const nextState = touchState(state, input.requestedAt)
    const transition = transitionRecord({
      request: {
        phaseId: phase.id,
        action: options.requestAction,
        transitionId: input.transitionId,
        nextPhaseContextStrategy: input.nextPhaseContextStrategy,
      } as WorkflowTransitionRequest,
      fromPhaseId: phase.id,
      toPhaseId: isReadyCompletionStatus(input.submission.status) ? toPhaseId : phase.id,
      authority: isReadyCompletionStatus(input.submission.status) ? options.readyAuthority : 'completion-check',
      action: isReadyCompletionStatus(input.submission.status) ? options.readyAction : 'retry',
      result: isReadyCompletionStatus(input.submission.status) ? 'accepted' : input.submission.status,
      requestedAt: input.requestedAt,
      stateVersion: nextState.stateVersion,
    })
    if (isReadyCompletionStatus(input.submission.status) && options.advanceReady) {
      transition.artifactRefs = [artifact]
    }
    nextState.transitionHistory.push(transition)

    const notifications = [transitionNotification(transition), stateNotification(nextState)]
    if (!isReadyCompletionStatus(input.submission.status)) {
      notifications.push(blockedNotification(nextState, phase.id, input.submission.rationale, {
        status: input.submission.status,
        evidence: input.submission.evidence,
      }))
    } else if (nextState.finalReportRef) {
      notifications.push(reportReadyNotification(nextState, nextState.finalReportRef))
    }
    return {
      status: isReadyCompletionStatus(input.submission.status) && !options.advanceReady ? 'pending' : 'recorded',
      state: nextState,
      artifact: cloneArtifactForResult(artifact),
      notifications,
    }
  }

  private missingTemplateResult(stateInput: WorkflowSessionState, requestedAt: string): RuntimeResult {
    const state = cloneState(stateInput)
    const reason = 'Current workflow ZIP template is unavailable. Re-import the workflow ZIP with the same id before continuing.'
    state.sourceTemplateStatus = 'missing-template'
    state.workflowStatus = 'failed'
    state.status = 'failed'
    state.runStatus = 'blocked'
    state.blockedReason = reason
    state.updatedAt = requestedAt
    return {
      state,
      notifications: [blockedNotification(state, state.activePhaseId ?? 'workflow', reason)],
    }
  }

  private async retryTransition(
    state: WorkflowSessionState,
    input: TransitionInput,
    current: WorkflowPhaseState,
    template: WorkflowTemplate,
  ): Promise<RuntimeResult> {
    const pending = state.pendingConfirmation
    if (pending?.phaseId === current.id && !input.completion) {
      markArtifacts(
        state,
        current,
        pending.artifactRefs.map((artifact) => artifact.artifactId),
        'superseded',
      )
      current.status = 'running'
      state.workflowStatus = 'running'
      state.status = 'running'
      state.runStatus = 'active'
      state.pendingConfirmation = null
      updateActiveWorkflowRun(state, input.requestedAt, {
        status: 'active',
        currentPhaseId: current.id,
      })
      const nextState = touchState(state, input.requestedAt)
      const transition = transitionRecord({
        request: input.request,
        fromPhaseId: current.id,
        toPhaseId: current.id,
        authority: 'user-confirmation',
        action: 'retry',
        result: 'superseded',
        requestedAt: input.requestedAt,
        stateVersion: nextState.stateVersion,
      })
      nextState.transitionHistory.push(transition)
      return {
        state: nextState,
        notifications: [transitionNotification(transition), stateNotification(nextState)],
      }
    }

    const completion = completionFromInput(current.id, input.requestedAt, input.completion)
    if (completion && !completion.passed) {
      const reason = completion.blockedReason || 'Workflow completion criteria did not pass.'
      current.status = 'running'
      current.completion = completion
      current.blockedReason = reason
      state.runStatus = 'blocked'
      updateActiveWorkflowRun(state, input.requestedAt, {
        status: 'blocked',
        currentPhaseId: current.id,
      })
      const nextState = touchState(state, input.requestedAt)
      const transition = transitionRecord({
        request: input.request,
        fromPhaseId: current.id,
        toPhaseId: current.id,
        authority: 'auto',
        action: 'retry',
        result: 'blocked',
        requestedAt: input.requestedAt,
        stateVersion: nextState.stateVersion,
      })
      nextState.transitionHistory.push(transition)
      return {
        state: nextState,
        notifications: [transitionNotification(transition), stateNotification(nextState), blockedNotification(nextState, current.id, reason)],
      }
    }

    if (completion) {
      current.completion = completion
      current.artifactPointers = mergeArtifacts(current.artifactPointers, completion.artifactPointers)
      for (const artifact of completion.artifactPointers) {
        appendArtifact(state, artifact)
      }
      delete current.blockedReason
    }

    const toPhaseId = nextPhaseId(state, current.id)
    const definition = phaseDefinition(template, current.id)
    if (toPhaseId) {
      current.status = 'pending-confirmation'
      state.workflowStatus = 'pending-confirmation'
      state.status = 'pending-confirmation'
      state.runStatus = 'waiting_for_user'
      updateActiveWorkflowRun(state, input.requestedAt, {
        status: 'waiting_for_user',
        currentPhaseId: current.id,
      })
      state.pendingConfirmation = makePendingConfirmation(state, current, toPhaseId, input.requestedAt)
    } else {
      if (definition?.transitionAuthority === 'user-confirmation') {
        current.status = 'pending-confirmation'
        state.workflowStatus = 'pending-confirmation'
        state.status = 'pending-confirmation'
        state.runStatus = 'waiting_for_user'
        updateActiveWorkflowRun(state, input.requestedAt, {
          status: 'waiting_for_user',
          currentPhaseId: current.id,
        })
        state.pendingConfirmation = makePendingConfirmation(state, current, toPhaseId, input.requestedAt)
      } else {
        this.completeWorkflow(state, current, input.requestedAt)
      }
    }

    const nextState = touchState(state, input.requestedAt)
    const transition = transitionRecord({
      request: input.request,
      fromPhaseId: current.id,
      toPhaseId,
      authority: definition?.transitionAuthority === 'user-confirmation' ? 'user-confirmation' : 'auto',
      action: definition?.transitionAuthority === 'user-confirmation' ? 'confirmation-requested' : 'retry',
      result: 'accepted',
      requestedAt: input.requestedAt,
      stateVersion: nextState.stateVersion,
    })
    nextState.transitionHistory.push(transition)
    return {
      state: nextState,
      notifications: [transitionNotification(transition), stateNotification(nextState)],
    }
  }

  private async confirmTransition(
    state: WorkflowSessionState,
    input: TransitionInput,
    current: WorkflowPhaseState,
  ): Promise<RuntimeResult> {
    const pending = state.pendingConfirmation
    const route = state.pendingRoute?.phaseId === current.id && state.pendingRoute.status === 'pending'
      ? state.pendingRoute
      : null
    const isBlockedRecoveryRoute = route?.origin === 'blocked-recovery'
    if (
      (!pending || pending.phaseId !== current.id || pending.status !== 'pending')
      && !isBlockedRecoveryRoute
    ) {
      return this.blockTransition(state, input, 'Workflow confirmation is not pending.')
    }

    if (pending) pending.status = 'approved'
    const targetPhaseId = route?.approvedTargetPhaseId ?? pending?.toPhaseId ?? null
    const acceptedArtifacts = pending
      ? markArtifacts(
        state,
        current,
        pending.artifactRefs.map((artifact) => artifact.artifactId),
        route?.intent === 'rework_current_phase' ? 'superseded' : 'accepted',
      )
      : []
    if (route?.intent === 'rework_current_phase') {
      route.status = 'approved'
      current.status = 'running'
      current.completedAt = undefined
      delete current.blockedReason
      state.activePhaseId = current.id
      state.workflowStatus = 'running'
      state.status = 'running'
      state.runStatus = 'active'
      state.pendingConfirmation = null
      state.pendingRoute = null
      updateActiveWorkflowRun(state, input.requestedAt, { status: 'active', currentPhaseId: current.id })
    } else {
      if (route) route.status = 'approved'
      if (isBlockedRecoveryRoute) delete current.blockedReason
      this.advanceToPhase(state, current, targetPhaseId, input.requestedAt)
      state.pendingRoute = null
      applyNextPhaseContextStrategy(state, targetPhaseId, input.request.nextPhaseContextStrategy)
    }
    const nextState = touchState(state, input.requestedAt)
    const transition = transitionRecord({
      request: input.request,
      fromPhaseId: current.id,
      toPhaseId: targetPhaseId,
      authority: route ? 'user-choice' : 'user-confirmation',
      action: route ? (isBlockedRecoveryRoute ? 'route-recovery-confirmed' : 'route-confirmed') : 'confirmed',
      result: 'accepted',
      requestedAt: input.requestedAt,
      stateVersion: nextState.stateVersion,
    })
    transition.artifactRefs = acceptedArtifacts
    nextState.transitionHistory.push(transition)
    const notifications = [transitionNotification(transition), stateNotification(nextState)]
    if (nextState.finalReportRef) {
      notifications.push(reportReadyNotification(nextState, nextState.finalReportRef))
    }
    return { state: nextState, notifications }
  }

  private async pauseTransition(
    state: WorkflowSessionState,
    input: TransitionInput,
    current: WorkflowPhaseState,
  ): Promise<RuntimeResult> {
    state.runStatus = 'paused'
    state.lastPausedAt = input.requestedAt
    updateActiveWorkflowRun(state, input.requestedAt, {
      status: 'paused',
      currentPhaseId: current.id,
    })
    const nextState = touchState(state, input.requestedAt)
    const transition = transitionRecord({
      request: input.request,
      fromPhaseId: current.id,
      toPhaseId: current.id,
      authority: 'system',
      action: 'paused',
      result: 'noop',
      requestedAt: input.requestedAt,
      stateVersion: nextState.stateVersion,
    })
    transition.decision = 'paused'
    nextState.transitionHistory.push(transition)
    return {
      state: nextState,
      notifications: [transitionNotification(transition), stateNotification(nextState)],
    }
  }

  private async resumeTransition(
    state: WorkflowSessionState,
    input: TransitionInput,
    current: WorkflowPhaseState,
  ): Promise<RuntimeResult> {
    state.runStatus = 'active'
    state.workflowStatus = state.workflowStatus === 'created' ? 'running' : state.workflowStatus
    state.status = state.workflowStatus
    state.lastResumeAt = input.requestedAt
    updateActiveWorkflowRun(state, input.requestedAt, {
      status: 'active',
      currentPhaseId: current.id,
    })
    const nextState = touchState(state, input.requestedAt)
    const transition = transitionRecord({
      request: input.request,
      fromPhaseId: current.id,
      toPhaseId: current.id,
      authority: 'resume',
      action: 'resumed',
      result: 'noop',
      requestedAt: input.requestedAt,
      stateVersion: nextState.stateVersion,
    })
    transition.decision = 'resumed'
    nextState.transitionHistory.push(transition)
    return {
      state: nextState,
      notifications: [transitionNotification(transition), stateNotification(nextState)],
    }
  }

  private async stopTransition(
    state: WorkflowSessionState,
    input: TransitionInput,
    current: WorkflowPhaseState,
  ): Promise<RuntimeResult> {
    state.runStatus = 'stopped'
    state.stoppedAt = input.requestedAt
    updateActiveWorkflowRun(state, input.requestedAt, {
      status: 'stopped',
      currentPhaseId: current.id,
    })
    const nextState = touchState(state, input.requestedAt)
    const transition = transitionRecord({
      request: input.request,
      fromPhaseId: current.id,
      toPhaseId: current.id,
      authority: 'stop',
      action: 'stopped',
      result: 'noop',
      requestedAt: input.requestedAt,
      stateVersion: nextState.stateVersion,
    })
    transition.decision = 'stopped'
    nextState.transitionHistory.push(transition)
    return {
      state: nextState,
      notifications: [transitionNotification(transition), stateNotification(nextState)],
    }
  }

  private async rejectTransition(
    state: WorkflowSessionState,
    input: TransitionInput,
    current: WorkflowPhaseState,
  ): Promise<RuntimeResult> {
    const pending = state.pendingConfirmation
    if (pending?.phaseId === current.id) {
      pending.status = 'rejected'
      markArtifacts(
        state,
        current,
        pending.artifactRefs.map((artifact) => artifact.artifactId),
        'rejected',
      )
    }
    current.status = 'running'
    state.workflowStatus = 'running'
    state.status = 'running'
    state.runStatus = 'active'
    state.pendingConfirmation = null
    state.pendingRoute = null
    updateActiveWorkflowRun(state, input.requestedAt, {
      status: 'active',
      currentPhaseId: current.id,
    })
    const nextState = touchState(state, input.requestedAt)
    const transition = transitionRecord({
      request: input.request,
      fromPhaseId: current.id,
      toPhaseId: current.id,
      authority: 'user-confirmation',
      action: 'rejected',
      result: 'rejected',
      requestedAt: input.requestedAt,
      stateVersion: nextState.stateVersion,
    })
    nextState.transitionHistory.push(transition)
    return {
      state: nextState,
      notifications: [transitionNotification(transition), stateNotification(nextState)],
    }
  }

  private async manualCompleteTransition(
    state: WorkflowSessionState,
    input: TransitionInput,
    current: WorkflowPhaseState,
  ): Promise<RuntimeResult> {
    const completion = completionFromInput(current.id, input.requestedAt, input.completion)
    if (!completion?.passed) {
      const reason = completion?.blockedReason || 'Manual workflow completion did not pass.'
      current.status = 'running'
      current.blockedReason = reason
      state.runStatus = 'blocked'
      updateActiveWorkflowRun(state, input.requestedAt, {
        status: 'blocked',
        currentPhaseId: current.id,
      })
      const nextState = touchState(state, input.requestedAt)
      const transition = transitionRecord({
        request: input.request,
        fromPhaseId: current.id,
        toPhaseId: current.id,
        authority: 'user-confirmation',
        action: 'retry',
        result: 'blocked',
        requestedAt: input.requestedAt,
        stateVersion: nextState.stateVersion,
      })
      nextState.transitionHistory.push(transition)
      return {
        state: nextState,
        notifications: [transitionNotification(transition), stateNotification(nextState), blockedNotification(nextState, current.id, reason)],
      }
    }

    current.completion = completion
    const acceptedArtifacts = completion.artifactPointers.map((artifact) =>
      updatePointerLifecycle(artifact, 'accepted')
    )
    current.artifactPointers = mergeArtifacts(current.artifactPointers, acceptedArtifacts)
    for (const artifact of acceptedArtifacts) {
      appendArtifact(state, artifact)
    }
    delete current.blockedReason
    state.pendingConfirmation = null

    const toPhaseId = nextPhaseId(state, current.id)
    this.advanceToPhase(state, current, toPhaseId, input.requestedAt)
    applyNextPhaseContextStrategy(state, toPhaseId, input.request.nextPhaseContextStrategy)
    const nextState = touchState(state, input.requestedAt)
    const transition = transitionRecord({
      request: input.request,
      fromPhaseId: current.id,
      toPhaseId,
      authority: 'user-confirmation',
      action: 'confirmed',
      result: 'accepted',
      requestedAt: input.requestedAt,
      stateVersion: nextState.stateVersion,
    })
    transition.artifactRefs = acceptedArtifacts
    nextState.transitionHistory.push(transition)

    const notifications = [transitionNotification(transition), stateNotification(nextState)]
    if (nextState.finalReportRef) {
      notifications.push(reportReadyNotification(nextState, nextState.finalReportRef))
    }
    return { state: nextState, notifications }
  }

  private async blockTransition(
    state: WorkflowSessionState,
    input: TransitionInput,
    reason: string,
  ): Promise<RuntimeResult> {
    state.runStatus = 'blocked'
    updateActiveWorkflowRun(state, input.requestedAt, {
      status: 'blocked',
      currentPhaseId: input.request.phaseId,
    })
    const nextState = touchState(state, input.requestedAt)
    const transition = transitionRecord({
      request: input.request,
      fromPhaseId: input.request.phaseId,
      toPhaseId: input.request.phaseId,
      authority: 'auto',
      action: requestAction(input.request) === 'confirm' ? 'confirmed' : 'retry',
      result: 'blocked',
      requestedAt: input.requestedAt,
      stateVersion: nextState.stateVersion,
    })
    nextState.transitionHistory.push(transition)
    return {
      state: nextState,
      notifications: [transitionNotification(transition), blockedNotification(nextState, input.request.phaseId, reason)],
    }
  }

  private advanceToPhase(
    state: WorkflowSessionState,
    current: WorkflowPhaseState,
    toPhaseId: string | null,
    requestedAt: string,
  ): void {
    current.status = 'completed'
    current.completedAt ||= requestedAt
    state.pendingConfirmation = null
    if (!toPhaseId) {
      this.completeWorkflow(state, current, requestedAt)
      return
    }
    const next = state.phases.find((phase) => phase.id === toPhaseId)
    if (next) {
      next.status = 'running'
      next.startedAt ||= requestedAt
    }
    state.activePhaseId = toPhaseId
    state.workflowStatus = 'running'
    state.status = 'running'
    state.runStatus = 'active'
    updateActiveWorkflowRun(state, requestedAt, {
      status: 'active',
      currentPhaseId: toPhaseId,
    })
  }

  private completeWorkflow(
    state: WorkflowSessionState,
    current: WorkflowPhaseState,
    requestedAt: string,
  ): void {
    current.status = 'completed'
    current.completedAt ||= requestedAt
    state.activePhaseId = null
    state.workflowStatus = 'completed'
    state.status = 'completed'
    state.runStatus = 'completed'
    state.pendingConfirmation = null
    const run = activeWorkflowRun(state)
    state.lastCompletedWorkflowRunId = run.id
    updateActiveWorkflowRun(state, requestedAt, {
      status: 'completed',
      currentPhaseId: current.id,
    })
    const pointer = finalReportPointer(state, requestedAt)
    state.finalReportRef = pointer
    state.finalReportPointer = pointer
  }
}

function mergeArtifacts(
  existing: WorkflowArtifactPointer[],
  incoming: WorkflowArtifactPointer[],
): WorkflowArtifactPointer[] {
  const byKey = new Map<string, WorkflowArtifactPointer>()
  for (const pointer of [...existing, ...incoming]) {
    byKey.set(pointer.artifactId, pointer)
  }
  return Array.from(byKey.values())
}

function makePendingConfirmation(
  state: WorkflowSessionState,
  current: WorkflowPhaseState,
  toPhaseId: string | null,
  requestedAt: string,
  options: {
    submission?: CompletionSubmission
    artifactRefs?: WorkflowArtifactPointer[]
    confirmationId?: string
    completionCheckId?: string
  } = {},
): WorkflowPendingConfirmation {
  return {
    confirmationId: options.confirmationId || crypto.randomUUID(),
    phaseId: current.id,
    fromPhaseId: current.id,
    toPhaseId,
    completionCheckId: options.completionCheckId || current.completion?.phaseId || current.id,
    artifactRefs: options.artifactRefs ?? current.artifactPointers,
    createdAt: requestedAt,
    status: 'pending',
    ...(options.submission ? { submission: options.submission } : {}),
  }
}
