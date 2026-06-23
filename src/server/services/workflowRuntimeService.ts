import type {
  CompletionSubmission,
  WorkflowArtifactPointer,
  WorkflowCompletionSubmissionStatus,
  WorkflowClientMessage,
  WorkflowCompletionResult,
  WorkflowArtifactLifecycleStatus,
  WorkflowPendingConfirmation,
  WorkflowPhaseDefinition,
  WorkflowPhaseSkillResolution,
  WorkflowPhaseSkillResolutionStatus,
  WorkflowPhaseSkillSnapshot,
  WorkflowPhaseState,
  WorkflowSessionState,
  WorkflowSkillProvenance,
  WorkflowTransitionRecord,
  WorkflowTransitionRequest,
} from './workflowTypes.js'
import { ApiError } from '../middleware/errorHandler.js'
import {
  collectTemplateSkillCatalog,
} from './workflowTemplateRegistryService.js'
import { resolveWorkflowPhaseSkills } from './workflowPhaseSkillResolver.js'
import { getWorkflowPhaseActionPolicy } from './workflowToolPolicy.js'

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

function phaseDefinition(state: WorkflowSessionState, phaseId: string): WorkflowPhaseDefinition | null {
  return state.templateSnapshot?.phases?.find((phase) => phase.id === phaseId) ?? null
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

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validateCompletionSubmission(
  state: WorkflowSessionState,
  submission: CompletionSubmission,
): WorkflowPhaseState {
  assertCompletableWorkflowState(state)
  if (!submission || typeof submission !== 'object') {
    throw workflowError('WORKFLOW_COMPLETION_INVALID', 'Completion submission must be an object.')
  }
  if (
    submission.status !== 'ready'
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

function formatPhaseActionPolicy(state: WorkflowSessionState): string {
  const policy = getWorkflowPhaseActionPolicy(state)
  if (!policy) return ''

  const sections = [
    'Phase action policy',
    policy.allowedActions.length
      ? `Allowed actions:\n${policy.allowedActions.map((action) => `- ${action}`).join('\n')}`
      : '',
    policy.forbiddenActions.length
      ? `Forbidden actions:\n${policy.forbiddenActions.map((action) => `- ${action}`).join('\n')}`
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
  const degraded = snapshot.resolutions.filter((resolution) => DEGRADED_RECOMMENDATION_STATUSES.has(resolution.status))
  const unavailable = snapshot.resolutions.filter((resolution) => UNAVAILABLE_RECOMMENDATION_STATUSES.has(resolution.status))

  const sections = [
    'Active phase recommended skills',
    'These are advisory recommendations for the current phase. They do not grant tool permissions, change model/effort settings, open shells, fork work, install hooks, or schedule SkillTool calls.',
    'A higher priority recommendation is attention metadata only, not a safety override or permission grant.',
    'Invoke recommended skills only when the current task matches the skill and normal SkillTool permission checks allow it.',
    'Do not invoke SkillTool automatically for recommended skills; the runtime schedules no SkillTool calls from recommendations.',
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

export class WorkflowRuntimeService {
  async startPhase(input: StartPhaseInput): Promise<RuntimeResult> {
    if (!isWorkflowState(input.state)) {
      return { state: input.state, notifications: [] }
    }

    const state = cloneState(input.state)
    const phase = activePhase(state)
    if (!phase) return { state: input.state, notifications: [] }

    const definition = phaseDefinition(state, phase.id)
    const requestedModel = definition?.requestedModel ?? phase.requestedModel
    phase.requestedModel = requestedModel || undefined
    phase.startedAt ||= input.requestedAt
    phase.skillProvenance = definition?.skillDeclarations ?? phase.skillProvenance ?? []
    await this.ensurePhaseSkillSnapshot(state, definition, input.requestedAt)

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
        blockedReason: reason,
      }, input.requestedAt)
      return {
        state: blockedState,
        notifications: [stateNotification(blockedState), blockedNotification(blockedState, phase.id, reason)],
      }
    }

    phase.status = 'running'
    phase.actualModel = actualModel
    phase.fallbackReason = fallbackReason
    delete phase.blockedReason

    const runningState = touchState({
      ...state,
      workflowStatus: 'running',
      status: 'running',
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

    const definition = phaseDefinition(input.state, phase.id)
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
    const actionPolicy = formatPhaseActionPolicy(input.state)
    const phasePrompt = formatPhasePrompt(definition)
    const recommendedSkills = formatRecommendedSkillsPromptBlock(activePhaseSkillSnapshot(input.state))

    const lines = [
      'Workflow mode',
      `Active phase: ${phase.id}`,
      definition?.instructions ? `Phase instructions: ${definition.instructions}` : '',
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
        ? `Skill guidance:\n${skillProvenance.map((skill) => `- ${skill.guidance}`).join('\n')}`
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
    return this.retryTransition(state, input, current)
  }

  async submitPhaseCompletion(input: SubmitPhaseCompletionInput): Promise<SubmitPhaseCompletionResult> {
    return this.recordCompletionSubmission(input, {
      readyLifecycleStatus: 'pending',
      advanceReady: false,
      readyAuthority: 'user-confirmation',
      readyAction: 'confirmation-requested',
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

  private async ensurePhaseSkillSnapshot(
    state: WorkflowSessionState,
    definition: WorkflowPhaseDefinition | null,
    snapshottedAt: string,
  ): Promise<void> {
    if (!definition?.skills?.length) return

    const snapshots = phaseSkillSnapshots(state)
    if (snapshots.some((snapshot) => snapshot.phaseId === definition.id)) return

    const catalog = await collectTemplateSkillCatalog()
    const result = await resolveWorkflowPhaseSkills({
      templateId: state.templateIdentity?.id ?? state.templateSnapshot?.id,
      phaseId: definition.id,
      references: definition.skills,
      catalog,
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
        status: input.submission.status === 'ready' && !options.advanceReady ? 'pending' : 'recorded',
        state: input.state,
        artifact: artifact as Record<string, unknown>,
        notifications: [],
      }
    }

    validateCompletionSubmission(input.state, input.submission)
    if (
      input.submission.status === 'ready'
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
      lifecycleStatus: input.submission.status === 'ready' ? options.readyLifecycleStatus : input.submission.status,
    })

    phase.artifactPointers = mergeArtifacts(phase.artifactPointers, [artifact])
    appendArtifact(state, artifact)
    persistCompletionSubmissionOnMatchingArtifacts(state, phase, artifact, input.submission)

    const toPhaseId = nextPhaseId(state, phase.id)
    if (input.submission.status === 'ready') {
      delete phase.blockedReason
      if (options.advanceReady) {
        this.advanceToPhase(state, phase, toPhaseId, input.requestedAt)
        applyNextPhaseContextStrategy(state, toPhaseId, input.nextPhaseContextStrategy)
      } else {
        phase.status = 'pending-confirmation'
        state.workflowStatus = 'pending-confirmation'
        state.status = 'pending-confirmation'
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
      state.pendingConfirmation = null
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
      toPhaseId: input.submission.status === 'ready' ? toPhaseId : phase.id,
      authority: input.submission.status === 'ready' ? options.readyAuthority : 'completion-check',
      action: input.submission.status === 'ready' ? options.readyAction : 'retry',
      result: input.submission.status === 'ready' ? 'accepted' : input.submission.status,
      requestedAt: input.requestedAt,
      stateVersion: nextState.stateVersion,
    })
    if (input.submission.status === 'ready' && options.advanceReady) {
      transition.artifactRefs = [artifact]
    }
    nextState.transitionHistory.push(transition)

    const notifications = [transitionNotification(transition), stateNotification(nextState)]
    if (input.submission.status !== 'ready') {
      notifications.push(blockedNotification(nextState, phase.id, input.submission.rationale, {
        status: input.submission.status,
        evidence: input.submission.evidence,
      }))
    } else if (nextState.finalReportRef) {
      notifications.push(reportReadyNotification(nextState, nextState.finalReportRef))
    }
    return {
      status: input.submission.status === 'ready' && !options.advanceReady ? 'pending' : 'recorded',
      state: nextState,
      artifact: cloneArtifactForResult(artifact),
      notifications,
    }
  }

  private async retryTransition(
    state: WorkflowSessionState,
    input: TransitionInput,
    current: WorkflowPhaseState,
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
      state.pendingConfirmation = null
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
    const definition = phaseDefinition(state, current.id)
    if (toPhaseId) {
      current.status = 'pending-confirmation'
      state.workflowStatus = 'pending-confirmation'
      state.status = 'pending-confirmation'
      state.pendingConfirmation = makePendingConfirmation(state, current, toPhaseId, input.requestedAt)
    } else {
      if (definition?.transitionAuthority === 'user-confirmation') {
        current.status = 'pending-confirmation'
        state.workflowStatus = 'pending-confirmation'
        state.status = 'pending-confirmation'
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
    if (!pending || pending.phaseId !== current.id || pending.status !== 'pending') {
      return this.blockTransition(state, input, 'Workflow confirmation is not pending.')
    }

    pending.status = 'approved'
    const acceptedArtifacts = markArtifacts(
      state,
      current,
      pending.artifactRefs.map((artifact) => artifact.artifactId),
      'accepted',
    )
    this.advanceToPhase(state, current, pending.toPhaseId, input.requestedAt)
    applyNextPhaseContextStrategy(state, pending.toPhaseId, input.request.nextPhaseContextStrategy)
    const nextState = touchState(state, input.requestedAt)
    const transition = transitionRecord({
      request: input.request,
      fromPhaseId: current.id,
      toPhaseId: pending.toPhaseId,
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
    state.pendingConfirmation = null
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
    state.pendingConfirmation = null
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
