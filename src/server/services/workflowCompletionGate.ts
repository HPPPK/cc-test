import type {
  WorkflowCompletionEligibilityStatus,
  WorkflowPhaseArtifactRequirementState,
  WorkflowPhaseCheckState,
  WorkflowPhaseCompletionState,
  WorkflowPhaseDefinition,
  WorkflowPhaseIssue,
  WorkflowRuntimeContractState,
  WorkflowSessionState,
  WorkflowTemplate,
} from './workflowTypes.js'

export type WorkflowCompletionEligibility = {
  status: WorkflowCompletionEligibilityStatus
  reasons: string[]
  phaseState: WorkflowPhaseCompletionState | null
}

export type WorkflowPhaseProgressUpdate =
  | { type: 'rebuild'; actor: 'user' | 'runtime'; rationale: string }
  | { type: 'work-ready-for-review'; actor: 'user' | 'runtime'; rationale: string }
  | { type: 'artifact-satisfied'; actor: 'user' | 'runtime'; artifactRequirementId: string; artifactIds: string[]; rationale: string }
  | { type: 'check-passed'; actor: 'user' | 'runtime'; checkId: string; evidenceArtifactIds?: string[]; rationale: string }
  | { type: 'process-issue'; actor: 'user' | 'runtime'; issueId: string; status: Extract<WorkflowPhaseIssue['status'], 'resolved' | 'requires-artifact-update' | 'requires-check' | 'needs-clarification' | 'conflict' | 'deferred-with-user-approval'>; rationale: string; artifactIds?: string[]; checkIds?: string[]; followUp?: string }

const CONTRACT_SCHEMA_VERSION = 1 as const

function templateFromState(state: WorkflowSessionState, template?: WorkflowTemplate | null): WorkflowTemplate | null {
  if (template) return template
  if (state.template && typeof state.template === 'object' && Array.isArray((state.template as WorkflowTemplate).phases)) {
    return state.template as WorkflowTemplate
  }
  return state.templateSnapshot ?? null
}

function phaseDefinition(template: WorkflowTemplate | null, phaseId: string): WorkflowPhaseDefinition | null {
  return template?.phases.find((phase) => phase.id === phaseId) ?? null
}

function requirementsFor(phase: WorkflowPhaseDefinition | null, now: string): WorkflowPhaseArtifactRequirementState[] {
  const declared = [
    ...(phase?.requiredArtifacts ?? []),
    ...(phase?.evidencePolicy?.requiredArtifacts ?? []),
    ...(phase?.evidencePolicy?.outputArtifact ? [phase.evidencePolicy.outputArtifact] : []),
  ]
  const unique = new Map<string, { id: string; required?: boolean; description?: string }>()
  for (const artifact of declared) {
    if (!artifact?.id || artifact.required === false || unique.has(artifact.id)) continue
    unique.set(artifact.id, artifact)
  }
  return [...unique.values()].map((artifact) => ({
    id: artifact.id,
    required: true,
    description: artifact.description,
    status: 'pending' as const,
    artifactIds: [],
    updatedAt: now,
  }))
}

function checksFor(phase: WorkflowPhaseDefinition | null, now: string): WorkflowPhaseCheckState[] {
  if (!phase) return []
  if (Array.isArray(phase.completionCriteria)) {
    return phase.completionCriteria
      .filter((criterion) => typeof criterion === 'string' && criterion.trim())
      .map((criterion, index) => ({
        id: `completion-criteria:${index}`,
        description: criterion,
        required: true,
        status: 'pending' as const,
        evidenceArtifactIds: [],
        updatedAt: now,
      }))
  }
  const criteria = phase.evidencePolicy?.completionCriteria ?? phase.completionCriteria
  if (!criteria || typeof criteria !== 'object') return []
  return [{
    id: 'completion-criteria',
    description: typeof criteria.description === 'string' ? criteria.description : 'Phase completion criteria',
    required: true,
    status: 'pending',
    evidenceArtifactIds: [],
    updatedAt: now,
  }]
}

function phaseStateFor(
  state: WorkflowSessionState,
  phaseId: string,
  template: WorkflowTemplate | null,
  now: string,
  workStatus: WorkflowPhaseCompletionState['workStatus'],
): WorkflowPhaseCompletionState {
  const phase = phaseDefinition(template, phaseId)
  return {
    phaseId,
    workStatus,
    eligibility: 'ineligible',
    blockerReasons: ['Phase work has not been verified for completion.'],
    issues: [],
    artifactRequirements: requirementsFor(phase, now),
    checks: checksFor(phase, now),
    taskSnapshots: [],
    evaluatedAt: now,
  }
}

function phaseIds(state: WorkflowSessionState, template: WorkflowTemplate | null): string[] {
  const ids = Array.isArray(state.phases)
    ? state.phases.map((phase) => phase.id).filter((phaseId): phaseId is string => typeof phaseId === 'string' && phaseId.length > 0)
    : []
  if (ids.length) return ids

  const legacyRunIds = Array.isArray(state.phaseRuns)
    ? state.phaseRuns.map((phaseRun) => phaseRun.phaseId).filter((phaseId): phaseId is string => typeof phaseId === 'string' && phaseId.length > 0)
    : []
  if (legacyRunIds.length) return [...new Set(legacyRunIds)]

  const templateIds = (template?.phases ?? []).map((phase) => phase.id)
  if (templateIds.length) return templateIds
  return state.activePhaseId ? [state.activePhaseId] : []
}

export function createWorkflowRuntimeContract(
  state: WorkflowSessionState,
  template: WorkflowTemplate | null | undefined,
  now: string,
): WorkflowRuntimeContractState {
  const resolvedTemplate = templateFromState(state, template)
  const phaseStates = Object.fromEntries(phaseIds(state, resolvedTemplate).map((phaseId) => [
    phaseId,
    phaseStateFor(
      state,
      phaseId,
      resolvedTemplate,
      now,
      phaseId === state.activePhaseId ? 'in-progress' : 'not-started',
    ),
  ]))
  const contract: WorkflowRuntimeContractState = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    migrationStatus: 'current',
    phaseStates,
    audit: [{
      at: now,
      type: 'runtime-contract-created',
      summary: 'Created fail-closed workflow completion contract.',
    }],
  }
  return recalculateWorkflowCompletionEligibility({ ...state, runtimeContract: contract }, resolvedTemplate, now).runtimeContract!
}

export function migrateWorkflowRuntimeContract(
  state: WorkflowSessionState,
  template: WorkflowTemplate | null | undefined,
  now: string,
): WorkflowSessionState {
  if (state.runtimeContract?.schemaVersion === CONTRACT_SCHEMA_VERSION) {
    const resolvedTemplate = templateFromState(state, template)
    const missingPhaseStates = Object.fromEntries(
      phaseIds(state, resolvedTemplate)
        .filter((phaseId) => !state.runtimeContract!.phaseStates[phaseId])
        .map((phaseId) => [
          phaseId,
          phaseStateFor(
            state,
            phaseId,
            resolvedTemplate,
            now,
            phaseId === state.activePhaseId ? 'in-progress' : 'not-started',
          ),
        ]),
    )
    if (!Object.keys(missingPhaseStates).length) return state
    return recalculateWorkflowCompletionEligibility(
      {
        ...state,
        runtimeContract: {
          ...state.runtimeContract,
          phaseStates: { ...state.runtimeContract.phaseStates, ...missingPhaseStates },
        },
      },
      resolvedTemplate,
      now,
    )
  }

  const resolvedTemplate = templateFromState(state, template)
  const phaseStates = Object.fromEntries(phaseIds(state, resolvedTemplate).map((phaseId) => [
    phaseId,
    {
      ...phaseStateFor(
        state,
        phaseId,
        resolvedTemplate,
        now,
        phaseId === state.activePhaseId ? 'interrupted' : 'not-started',
      ),
      blockerReasons: ['Legacy workflow state must be rebuilt and re-evaluated before phase transition tools are available.'],
      issues: [{
        id: 'migration:' + phaseId,
        phaseId,
        sessionId: state.sessionId,
        createdAt: now,
        updatedAt: now,
        source: 'migration',
        status: 'open',
        blocksCompletion: true,
        blockingReason: 'Legacy workflow state has no completion contract.',
        createdStateVersion: state.stateVersion,
      } satisfies WorkflowPhaseIssue],
    } satisfies WorkflowPhaseCompletionState,
  ]))

  return {
    ...state,
    runtimeContract: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      migrationStatus: 'needs-rebuild',
      migratedAt: now,
      phaseStates,
      audit: [{
        at: now,
        type: 'runtime-contract-migrated',
        summary: 'Migrated legacy workflow state in fail-closed mode; rebuild is required.',
      }],
    },
  }
}

export function recalculateWorkflowCompletionEligibility(
  state: WorkflowSessionState,
  _template?: WorkflowTemplate | null,
  now = new Date().toISOString(),
): WorkflowSessionState {
  const contract = state.runtimeContract
  if (!contract) return state
  const phaseStates: Record<string, WorkflowPhaseCompletionState> = {}
  for (const [phaseId, phaseState] of Object.entries(contract.phaseStates)) {
    const reasons = completionBlockerReasons(state, phaseState)
    phaseStates[phaseId] = {
      ...phaseState,
      eligibility: reasons.length ? 'ineligible' : 'eligible',
      blockerReasons: reasons,
      evaluatedAt: now,
    }
  }
  return {
    ...state,
    runtimeContract: {
      ...contract,
      phaseStates,
    },
  }
}

function completionBlockerReasons(
  state: WorkflowSessionState,
  phaseState: WorkflowPhaseCompletionState,
): string[] {
  const reasons: string[] = []
  if (state.runtimeContract?.migrationStatus === 'needs-rebuild') {
    reasons.push('Workflow state must be rebuilt and re-evaluated after migration.')
  }
  if (phaseState.workStatus !== 'ready-for-review' && phaseState.workStatus !== 'completed') {
    reasons.push('Phase work is not ready for completion review.')
  }
  for (const issue of phaseState.issues) {
    if (issue.blocksCompletion && issue.status !== 'resolved' && issue.status !== 'stale') {
      reasons.push('Unresolved phase issue: ' + issue.blockingReason)
    }
  }
  for (const requirement of phaseState.artifactRequirements) {
    if (requirement.required && requirement.status !== 'satisfied') {
      reasons.push('Required artifact is not verified: ' + requirement.id)
    }
  }
  for (const check of phaseState.checks) {
    if (check.required && check.status !== 'passed') {
      reasons.push('Required completion check is not passed: ' + check.id)
    }
  }
  for (const task of phaseState.taskSnapshots) {
    if (task.status === 'pending' || task.status === 'running' || task.status === 'interrupted') {
      reasons.push('Workflow task is not safely settled: ' + task.taskId)
    }
    if (task.integrationStatus && task.integrationStatus !== 'not-required' && task.integrationStatus !== 'verified') {
      reasons.push('Workflow task is not integrated and verified: ' + task.taskId)
    }
  }
  return [...new Set(reasons)]
}

export function getWorkflowCompletionEligibility(
  state: WorkflowSessionState | null | undefined,
): WorkflowCompletionEligibility {
  if (!state || state.mode !== 'workflow' || !state.activePhaseId) {
    return { status: 'ineligible', reasons: ['Workflow has no active phase.'], phaseState: null }
  }
  const phaseState = state.runtimeContract?.phaseStates[state.activePhaseId] ?? null
  if (!phaseState) {
    return { status: 'ineligible', reasons: ['Workflow completion contract is unavailable.'], phaseState: null }
  }
  return {
    status: phaseState.eligibility,
    reasons: phaseState.blockerReasons,
    phaseState,
  }
}

export function rebuildWorkflowCompletionContract(
  state: WorkflowSessionState,
  template: WorkflowTemplate | null | undefined,
  now: string,
  rationale: string,
): WorkflowSessionState {
  const contract = createWorkflowRuntimeContract(state, template, now)
  return recalculateWorkflowCompletionEligibility({
    ...state,
    runtimeContract: {
      ...contract,
      phaseStates: Object.fromEntries(Object.entries(contract.phaseStates).map(([phaseId, phaseState]) => [
        phaseId,
        { ...phaseState, lastRebuiltAt: now },
      ])),
      audit: [
        ...contract.audit,
        {
          at: now,
          type: 'runtime-contract-rebuilt',
          phaseId: state.activePhaseId ?? undefined,
          summary: rationale,
        },
      ],
    },
  }, template, now)
}

export function recordAskUserQuestionIssue(
  state: WorkflowSessionState,
  input: { requestId: string; toolUseId?: string; questions: Array<{ id?: string; question?: string; header?: string; blocksCompletion?: boolean }>; now: string },
): WorkflowSessionState {
  if (!state.activePhaseId || !state.runtimeContract || !input.questions.length) return state
  const phaseState = state.runtimeContract.phaseStates[state.activePhaseId]
  if (!phaseState) return state
  const existingIssueIds = new Set(phaseState.issues.map((issue) => issue.id))
  const issues = [...phaseState.issues]
  for (const [index, question] of input.questions.entries()) {
    const id = 'ask:' + input.requestId + ':' + index
    const questionId = question.id ?? question.question ?? question.header ?? 'question-' + index
    if (existingIssueIds.has(id)) continue
    issues.push({
      id,
      phaseId: phaseState.phaseId,
      sessionId: state.sessionId,
      createdAt: input.now,
      updatedAt: input.now,
      source: 'ask-user-question',
      status: 'open',
      blocksCompletion: question.blocksCompletion !== false,
      question: question.question ?? question.header ?? 'Workflow question',
      blockingReason: 'A workflow question requires an answer and explicit processing.',
      questionRequestId: input.requestId,
      questionId,
      toolUseId: input.toolUseId,
      createdStateVersion: state.stateVersion,
    })
  }
  return recalculateWorkflowCompletionEligibility({
    ...state,
    runtimeContract: {
      ...state.runtimeContract,
      phaseStates: {
        ...state.runtimeContract.phaseStates,
        [phaseState.phaseId]: { ...phaseState, issues },
      },
      audit: [...state.runtimeContract.audit, {
        at: input.now,
        type: 'workflow-question-recorded',
        phaseId: phaseState.phaseId,
        summary: 'Recorded workflow question(s) as blocking phase issues.',
      }],
    },
  }, undefined, input.now)
}

export function recordAskUserQuestionAnswer(
  state: WorkflowSessionState,
  input: { requestId: string; answers: Record<string, unknown>; now: string },
): WorkflowSessionState {
  if (!state.runtimeContract || !state.activePhaseId) return state
  let changed = false
  const phaseStates = Object.fromEntries(Object.entries(state.runtimeContract.phaseStates).map(([phaseId, phaseState]) => {
    let phaseChanged = false
    const issues = phaseState.issues.map((issue) => {
      if (phaseId !== state.activePhaseId || issue.phaseId !== state.activePhaseId || issue.questionRequestId !== input.requestId || issue.status !== 'open') return issue
      if (issue.questionId && !Object.hasOwn(input.answers, issue.questionId)) return issue
      changed = true
      phaseChanged = true
      return {
        ...issue,
        status: 'answered-pending-processing' as const,
        answer: input.answers,
        answerReceivedAt: input.now,
        answeredStateVersion: state.stateVersion,
        updatedAt: input.now,
      }
    })
    return [phaseId, phaseChanged ? { ...phaseState, issues } : phaseState]
  })) as Record<string, WorkflowPhaseCompletionState>
  if (!changed) return state
  return recalculateWorkflowCompletionEligibility({
    ...state,
    runtimeContract: {
      ...state.runtimeContract,
      phaseStates,
      audit: [...state.runtimeContract.audit, {
        at: input.now,
        type: 'workflow-question-answered',
        summary: 'Recorded workflow question answer; explicit phase processing is still required.',
      }],
    },
  }, undefined, input.now)
}

function artifactPointersFor(state: WorkflowSessionState): Array<{ artifactId: string; sessionId: string }> {
  return Array.isArray(state.artifactIndex)
    ? state.artifactIndex
    : Object.values(state.artifactIndex ?? {})
}

function assertKnownArtifactIds(state: WorkflowSessionState, artifactIds: string[], context: string): void {
  if (!artifactIds.length) throw new Error(`${context} requires at least one persisted artifact reference.`)
  const known = new Map(artifactPointersFor(state).map((pointer) => [pointer.artifactId, pointer]))
  for (const artifactId of artifactIds) {
    const pointer = known.get(artifactId)
    if (!pointer || pointer.sessionId !== state.sessionId) {
      throw new Error(`${context} references an unknown workflow artifact: ${artifactId}`)
    }
  }
}

function assertIssueDependencies(
  phaseState: WorkflowPhaseCompletionState,
  update: Extract<WorkflowPhaseProgressUpdate, { type: 'process-issue' }>,
): void {
  for (const artifactId of update.artifactIds ?? []) {
    const requirement = phaseState.artifactRequirements.find((candidate) => candidate.id === artifactId)
    if (!requirement || requirement.status !== 'satisfied') {
      throw new Error(`Workflow issue references an artifact requirement that is not satisfied: ${artifactId}`)
    }
  }
  for (const checkId of update.checkIds ?? []) {
    const check = phaseState.checks.find((candidate) => candidate.id === checkId)
    if (!check || check.status !== 'passed') {
      throw new Error(`Workflow issue references a completion check that is not passed: ${checkId}`)
    }
  }
}

export function applyWorkflowPhaseProgress(
  state: WorkflowSessionState,
  phaseId: string,
  update: WorkflowPhaseProgressUpdate,
  now: string,
): WorkflowSessionState {
  const phaseState = state.runtimeContract?.phaseStates[phaseId]
  if (!phaseState || !state.runtimeContract) throw new Error('Workflow completion contract is unavailable for this phase.')
  if (update.type === 'rebuild') return rebuildWorkflowCompletionContract(state, undefined, now, update.rationale)

  let nextPhaseState: WorkflowPhaseCompletionState = phaseState
  if (update.type === 'work-ready-for-review') {
    nextPhaseState = { ...phaseState, workStatus: 'ready-for-review' }
  } else if (update.type === 'artifact-satisfied') {
    assertKnownArtifactIds(state, update.artifactIds, 'Artifact satisfaction')
    let found = false
    const artifactRequirements = phaseState.artifactRequirements.map((requirement) => {
      if (requirement.id !== update.artifactRequirementId) return requirement
      found = true
      return { ...requirement, status: 'satisfied' as const, artifactIds: [...new Set(update.artifactIds)], updatedAt: now }
    })
    if (!found) throw new Error('Unknown workflow artifact requirement: ' + update.artifactRequirementId)
    nextPhaseState = { ...phaseState, artifactRequirements }
  } else if (update.type === 'check-passed') {
    const evidenceArtifactIds = update.evidenceArtifactIds ?? []
    assertKnownArtifactIds(state, evidenceArtifactIds, 'Completion check')
    let found = false
    const checks = phaseState.checks.map((check) => {
      if (check.id !== update.checkId) return check
      found = true
      return { ...check, status: 'passed' as const, evidenceArtifactIds: [...new Set(update.evidenceArtifactIds ?? [])], updatedAt: now }
    })
    if (!found) throw new Error('Unknown workflow completion check: ' + update.checkId)
    nextPhaseState = { ...phaseState, checks }
  } else if (update.type === 'process-issue') {
    assertIssueDependencies(phaseState, update)
    let found = false
    const issues = phaseState.issues.map((issue) => {
      if (issue.id !== update.issueId) return issue
      found = true
      return {
        ...issue,
        status: update.status,
        updatedAt: now,
        artifactIds: update.artifactIds ?? issue.artifactIds,
        checkIds: update.checkIds ?? issue.checkIds,
        followUp: update.followUp ?? issue.followUp,
        processing: {
          status: update.status,
          rationale: update.rationale,
          processedAt: now,
          processedBy: update.actor,
        },
      }
    })
    if (!found) throw new Error('Unknown workflow phase issue: ' + update.issueId)
    nextPhaseState = { ...phaseState, issues }
  }

  return recalculateWorkflowCompletionEligibility({
    ...state,
    runtimeContract: {
      ...state.runtimeContract,
      migrationStatus: 'current',
      phaseStates: { ...state.runtimeContract.phaseStates, [phaseId]: nextPhaseState },
      audit: [...state.runtimeContract.audit, {
        at: now,
        type: 'workflow-phase-progress-updated',
        phaseId,
        summary: update.rationale,
      }],
    },
  }, undefined, now)
}

export function markWorkflowPhaseStarted(
  state: WorkflowSessionState,
  phaseId: string,
  now: string,
): WorkflowSessionState {
  const phaseState = state.runtimeContract?.phaseStates[phaseId]
  if (!phaseState || !state.runtimeContract || phaseState.workStatus !== 'not-started') return state
  return recalculateWorkflowCompletionEligibility({
    ...state,
    runtimeContract: {
      ...state.runtimeContract,
      phaseStates: {
        ...state.runtimeContract.phaseStates,
        [phaseId]: { ...phaseState, workStatus: 'in-progress' },
      },
      audit: [...state.runtimeContract.audit, {
        at: now,
        type: 'workflow-phase-started',
        phaseId,
        summary: 'Workflow phase started and is not yet completion-eligible.',
      }],
    },
  }, undefined, now)
}
