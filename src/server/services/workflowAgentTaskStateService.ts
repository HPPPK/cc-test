import { recalculateWorkflowCompletionEligibility } from './workflowCompletionGate.js'
import type { AgentRunEventInput, AgentRunLedger } from './agentRunLedgerService.js'
import type { WorkflowSessionState, WorkflowTaskSnapshot } from './workflowTypes.js'

export const MANAGED_WORKFLOW_IDS = new Set([
  'efficient-constrained-dev-debug-workflow-v5',
  'feature-extension-workflow-v8',
  'debug-repair-workflow-v8',
])

const IMPLEMENT_PHASE_BY_WORKFLOW = new Map([
  ['efficient-constrained-dev-debug-workflow-v5', 'delegate-implement'],
  ['feature-extension-workflow-v8', 'feature-implement'],
  ['debug-repair-workflow-v8', 'debug-fix'],
])

export type WorkflowAgentTaskRole = 'coder' | 'reviewer' | 'qa' | 'debug'
export type WorkflowAgentTaskProgressStatus =
  | 'running'
  | 'waiting_user'
  | 'needs_fix'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'interrupted'
  | 'cancelled'

export type WorkflowAgentTaskPlanItem = {
  id: string
  dependsOn: string[]
  writeScopes: string[]
  resourceClaims: string[]
  executionMode?: 'read' | 'write'
}

export type WorkflowAgentTaskProgressInput = {
  phaseId: string
  batchId: string
  role: WorkflowAgentTaskRole
  plan: WorkflowAgentTaskPlanItem[]
  status: WorkflowAgentTaskProgressStatus
  agentRunId: string
  toolUseId?: string
  reason?: string
  reviewStatus?: 'pass' | 'needs-fix'
  requiredFixes?: string[]
  outputArtifactRefs?: string[]
  recordedAt: string
}

type AgentRunLookup = (sessionId: string, runId: string) => Promise<AgentRunLedger | null>

const AGENT_RUN_STALE_MS = 60_000

function isStaleTimestamp(value: string | undefined, now: string): boolean {
  const timestamp = value ? Date.parse(value) : Number.NaN
  const current = Date.parse(now)
  return !Number.isFinite(timestamp) || !Number.isFinite(current) || current - timestamp >= AGENT_RUN_STALE_MS
}

function cloneState(state: WorkflowSessionState): WorkflowSessionState {
  return JSON.parse(JSON.stringify(state)) as WorkflowSessionState
}

function templateId(state: WorkflowSessionState): string {
  return state.templateIdentity?.id || ('id' in state.template ? state.template.id : '')
}

export function isManagedWorkflowAgentTaskState(state: WorkflowSessionState | null | undefined): state is WorkflowSessionState {
  return !!state && MANAGED_WORKFLOW_IDS.has(templateId(state))
}

export function isManagedWorkflowAgentImplementationPhase(state: WorkflowSessionState | null | undefined): state is WorkflowSessionState {
  if (!isManagedWorkflowAgentTaskState(state)) return false
  return IMPLEMENT_PHASE_BY_WORKFLOW.get(templateId(state)) === state.activePhaseId
}

function scheduledTaskId(batchId: string, role: WorkflowAgentTaskRole): string {
  return `${batchId}::${role}`
}

function normalizePlan(input: WorkflowAgentTaskProgressInput): WorkflowAgentTaskPlanItem[] {
  if (!Array.isArray(input.plan) || input.plan.length === 0) {
    throw new Error('WORKFLOW_AGENT_TASK_PLAN_REQUIRED: The complete workflow task plan is required.')
  }
  const ids = new Set<string>()
  const normalized = input.plan.map(task => {
    const id = task.id.trim()
    if (!id || ids.has(id)) {
      throw new Error('WORKFLOW_AGENT_TASK_PLAN_INVALID: Task IDs must be non-empty and unique.')
    }
    ids.add(id)
    return {
      id,
      dependsOn: [...(task.dependsOn ?? [])],
      writeScopes: [...(task.writeScopes ?? [])],
      resourceClaims: [...(task.resourceClaims ?? [])],
      executionMode: task.executionMode ?? ((task.writeScopes?.length ?? 0) > 0 ? 'write' : 'read'),
    }
  })
  for (const task of normalized) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(`WORKFLOW_AGENT_TASK_PLAN_INVALID: Unknown dependency ${task.id} -> ${dependency}.`)
      }
    }
  }
  if (!ids.has(input.batchId)) {
    throw new Error(`WORKFLOW_AGENT_TASK_PLAN_INVALID: Batch ${input.batchId} is not present in the complete plan.`)
  }
  return normalized
}

function createSnapshot(args: {
  state: WorkflowSessionState
  phaseId: string
  task: WorkflowAgentTaskPlanItem
  role: 'coder' | 'reviewer'
  stateVersion: number
  recordedAt: string
}): WorkflowTaskSnapshot {
  const dependsOn = args.role === 'reviewer'
    ? [scheduledTaskId(args.task.id, 'coder')]
    : args.task.dependsOn.map(id => scheduledTaskId(id, 'reviewer'))
  return {
    taskId: scheduledTaskId(args.task.id, args.role),
    runId: args.state.activeWorkflowRunId,
    sessionId: args.state.sessionId,
    phaseId: args.phaseId,
    stateVersion: args.stateVersion,
    status: dependsOn.length ? 'waiting_dependency' : 'pending',
    executionMode: args.role === 'reviewer' ? 'read' : args.task.executionMode,
    integrationStatus: 'not-required',
    updatedAt: args.recordedAt,
    batchId: args.task.id,
    workflowRole: args.role,
    attempt: 0,
    dependsOn,
    writeScopes: args.role === 'reviewer' ? [] : [...args.task.writeScopes],
    resourceClaims: args.role === 'reviewer' ? [] : [...args.task.resourceClaims],
    inputCapsuleRef: typeof args.state.activeContextCapsuleId === 'string'
      ? args.state.activeContextCapsuleId
      : undefined,
  }
}

function dependencySatisfied(task: WorkflowTaskSnapshot, byTaskId: Map<string, WorkflowTaskSnapshot>): boolean {
  return (task.dependsOn ?? []).every(dependencyId => byTaskId.get(dependencyId)?.status === 'succeeded')
}

function reconcileWaitingStatuses(snapshots: WorkflowTaskSnapshot[], recordedAt: string, stateVersion: number): WorkflowTaskSnapshot[] {
  const byTaskId = new Map(snapshots.map(snapshot => [snapshot.taskId, snapshot]))
  return snapshots.map(snapshot => {
    if (snapshot.status !== 'pending' && snapshot.status !== 'waiting_dependency') return snapshot
    const nextStatus = dependencySatisfied(snapshot, byTaskId) ? 'pending' : 'waiting_dependency'
    if (nextStatus === snapshot.status) return snapshot
    return { ...snapshot, status: nextStatus, updatedAt: recordedAt, stateVersion }
  })
}

function sameReceipt(snapshot: WorkflowTaskSnapshot, input: WorkflowAgentTaskProgressInput): boolean {
  return snapshot.agentRunId === input.agentRunId
    && snapshot.toolUseId === input.toolUseId
    && snapshot.status === input.status
    && snapshot.reviewStatus === input.reviewStatus
    && JSON.stringify(snapshot.requiredFixes ?? []) === JSON.stringify(input.requiredFixes ?? [])
    && JSON.stringify(snapshot.outputArtifactRefs ?? []) === JSON.stringify(input.outputArtifactRefs ?? [])
}

export function recordWorkflowAgentTaskProgress(
  state: WorkflowSessionState,
  input: WorkflowAgentTaskProgressInput,
): WorkflowSessionState {
  if (!isManagedWorkflowAgentTaskState(state)) {
    throw new Error('WORKFLOW_AGENT_TASK_GUARD_INACTIVE: Durable Agent tasks only apply to the three managed workflows.')
  }
  if (!state.activePhaseId || input.phaseId !== state.activePhaseId) {
    throw new Error('WORKFLOW_AGENT_TASK_PHASE_MISMATCH: Agent progress must target the active workflow phase.')
  }
  if (!input.batchId.trim() || !input.agentRunId.trim()) {
    throw new Error('WORKFLOW_AGENT_TASK_INVALID: batchId and agentRunId are required.')
  }
  const plan = normalizePlan(input)
  const phaseState = state.runtimeContract?.phaseStates[input.phaseId]
  if (!phaseState || !state.runtimeContract) {
    throw new Error('WORKFLOW_AGENT_TASK_CONTRACT_UNAVAILABLE: Active phase task state is unavailable.')
  }

  const next = cloneState(state)
  const nextPhaseState = next.runtimeContract!.phaseStates[input.phaseId]!
  const nextStateVersion = state.stateVersion + 1
  const byTaskId = new Map(nextPhaseState.taskSnapshots.map(snapshot => [snapshot.taskId, snapshot]))
  for (const task of plan) {
    for (const role of ['coder', 'reviewer'] as const) {
      const id = scheduledTaskId(task.id, role)
      if (!byTaskId.has(id)) {
        const legacy = [...byTaskId.values()].find(snapshot => snapshot.batchId === task.id && snapshot.workflowRole === role)
        byTaskId.set(id, legacy
          ? { ...legacy, taskId: id, dependsOn: role === 'reviewer' ? [scheduledTaskId(task.id, 'coder')] : task.dependsOn.map(dependency => scheduledTaskId(dependency, 'reviewer')), writeScopes: role === 'reviewer' ? [] : [...task.writeScopes], resourceClaims: role === 'reviewer' ? [] : [...task.resourceClaims], inputCapsuleRef: typeof state.activeContextCapsuleId === 'string' ? state.activeContextCapsuleId : legacy.inputCapsuleRef }
          : createSnapshot({ state, phaseId: input.phaseId, task, role, stateVersion: nextStateVersion, recordedAt: input.recordedAt }))
      }
    }
  }

  const currentId = scheduledTaskId(input.batchId, input.role)
  let current = byTaskId.get(currentId)
  if (!current) {
    const task = plan.find(candidate => candidate.id === input.batchId)!
    current = {
      ...createSnapshot({ state, phaseId: input.phaseId, task, role: input.role === 'reviewer' ? 'reviewer' : 'coder', stateVersion: nextStateVersion, recordedAt: input.recordedAt }),
      taskId: currentId,
      workflowRole: input.role,
    }
    byTaskId.set(currentId, current)
  }
  if (sameReceipt(current, input)) return state

  if (input.status === 'running') {
    if (current.status === 'succeeded') {
      const reviewer = input.role === 'coder'
        ? byTaskId.get(scheduledTaskId(input.batchId, 'reviewer'))
        : undefined
      if (reviewer?.status !== 'needs_fix') {
        throw new Error(`WORKFLOW_AGENT_TASK_ALREADY_SUCCEEDED: ${currentId} already has a successful receipt.`)
      }
    }
    if (current.status === 'running' && current.agentRunId !== input.agentRunId) {
      throw new Error(`WORKFLOW_AGENT_TASK_ALREADY_RUNNING: ${currentId} is already owned by another Agent Run.`)
    }
    if (!dependencySatisfied(current, byTaskId)) {
      throw new Error(`WORKFLOW_AGENT_TASK_SEQUENCE_VIOLATION: Dependencies are not complete for ${currentId}.`)
    }
    if (input.role === 'reviewer') {
      const coder = byTaskId.get(scheduledTaskId(input.batchId, 'coder'))
      if (coder?.status !== 'succeeded') {
        throw new Error(`WORKFLOW_AGENT_TASK_SEQUENCE_VIOLATION: Reviewer cannot start before Coder succeeds for ${input.batchId}.`)
      }
      if (current.status === 'needs_fix' && (coder.attempt ?? 0) <= (current.attempt ?? 0)) {
        throw new Error(`WORKFLOW_AGENT_TASK_REPAIR_REQUIRED: Coder must run again before Reviewer retries ${input.batchId}.`)
      }
    }
    if (input.role === 'coder') {
      const reviewerId = scheduledTaskId(input.batchId, 'reviewer')
      const reviewer = byTaskId.get(reviewerId)
      if (reviewer && reviewer.status === 'needs_fix') {
        byTaskId.set(reviewerId, {
          ...reviewer,
          status: 'waiting_dependency',
          stateVersion: nextStateVersion,
          updatedAt: input.recordedAt,
          reason: undefined,
          agentId: undefined,
          agentRunId: undefined,
          toolUseId: undefined,
          startedAt: undefined,
          completedAt: undefined,
          startedStateVersion: undefined,
          completedStateVersion: undefined,
          reviewStatus: undefined,
          requiredFixes: undefined,
          readyForNextBatch: undefined,
        })
      }
    }
    byTaskId.set(currentId, {
      ...current,
      status: 'running',
      stateVersion: nextStateVersion,
      updatedAt: input.recordedAt,
      reason: undefined,
      agentId: input.agentRunId,
      agentRunId: input.agentRunId,
      toolUseId: input.toolUseId,
      attempt: (current.attempt ?? 0) + 1,
      startedAt: input.recordedAt,
      startedStateVersion: nextStateVersion,
      completedAt: undefined,
      completedStateVersion: undefined,
      lastHeartbeatAt: input.recordedAt,
      reviewStatus: undefined,
      requiredFixes: undefined,
      readyForNextBatch: undefined,
      outputArtifactRefs: undefined,
    })
  } else {
    if (current.status !== 'running' && current.status !== 'waiting_user' && current.status !== 'blocked') {
      throw new Error(`WORKFLOW_AGENT_TASK_RECEIPT_MISMATCH: No matching active Agent task for ${currentId}.`)
    }
    if (current.agentRunId !== input.agentRunId) {
      throw new Error(`WORKFLOW_AGENT_TASK_RECEIPT_MISMATCH: Agent Run does not own ${currentId}.`)
    }
    if (input.role === 'reviewer' && input.status === 'succeeded' && input.reviewStatus !== 'pass') {
      throw new Error('WORKFLOW_AGENT_TASK_REVIEW_INVALID: A successful Reviewer receipt requires reviewStatus=pass.')
    }
    const status = input.reviewStatus === 'needs-fix' || input.status === 'needs_fix'
      ? 'needs_fix'
      : input.status
    byTaskId.set(currentId, {
      ...current,
      status,
      stateVersion: nextStateVersion,
      updatedAt: input.recordedAt,
      reason: input.reason,
      completedAt: ['succeeded', 'failed', 'needs_fix', 'cancelled', 'interrupted'].includes(status) ? input.recordedAt : undefined,
      completedStateVersion: ['succeeded', 'failed', 'needs_fix', 'cancelled', 'interrupted'].includes(status) ? nextStateVersion : undefined,
      lastHeartbeatAt: input.recordedAt,
      reviewStatus: input.reviewStatus,
      requiredFixes: input.requiredFixes,
      readyForNextBatch: input.role === 'reviewer' && status === 'succeeded' && input.reviewStatus === 'pass',
      outputArtifactRefs: input.outputArtifactRefs,
    })
  }

  nextPhaseState.taskSnapshots = reconcileWaitingStatuses([...byTaskId.values()], input.recordedAt, nextStateVersion)
  return recalculateWorkflowCompletionEligibility({
    ...next,
    stateVersion: nextStateVersion,
    revision: (typeof next.revision === 'number' ? next.revision : next.stateVersion) + 1,
    updatedAt: input.recordedAt,
  }, undefined, input.recordedAt)
}

export type WorkflowAgentTaskLedgerEventAppender = (event: AgentRunEventInput) => Promise<unknown>

function ledgerStatusForWorkflowTask(status: WorkflowAgentTaskProgressStatus): AgentRunEventInput['status'] {
  if (status === 'running') return 'running'
  if (status === 'waiting_user') return 'waiting_user'
  if (status === 'blocked') return 'blocked'
  if (status === 'succeeded' || status === 'needs_fix') return 'completed'
  return 'failed'
}

export async function recordWorkflowAgentTaskProgressWithLedger(
  state: WorkflowSessionState,
  input: WorkflowAgentTaskProgressInput,
  appendLedgerEvent: WorkflowAgentTaskLedgerEventAppender,
): Promise<WorkflowSessionState> {
  const next = recordWorkflowAgentTaskProgress(state, input)
  const receiptId = input.toolUseId?.trim() || input.agentRunId
  await appendLedgerEvent({
    sessionId: state.sessionId,
    runId: input.agentRunId,
    eventType: 'status_changed',
    toolUseId: `${receiptId}:workflow-task-${input.status}`,
    status: ledgerStatusForWorkflowTask(input.status),
  })
  return next
}

export async function reconcileWorkflowAgentTasks(
  state: WorkflowSessionState,
  lookup: AgentRunLookup,
  recordedAt = new Date().toISOString(),
): Promise<WorkflowSessionState> {
  if (!isManagedWorkflowAgentTaskState(state) || !state.runtimeContract) return state
  const next = cloneState(state)
  let changed = false
  const nextStateVersion = state.stateVersion + 1

  for (const phaseState of Object.values(next.runtimeContract!.phaseStates)) {
    for (let index = 0; index < phaseState.taskSnapshots.length; index += 1) {
      const task = phaseState.taskSnapshots[index]!
      if (task.status !== 'running' || !task.agentRunId) continue
      const ledger = await lookup(state.sessionId, task.agentRunId)
      let status: WorkflowTaskSnapshot['status'] = task.status
      let reason = task.reason
      let outputArtifactRefs = task.outputArtifactRefs
      if (!ledger) {
        if (isStaleTimestamp(task.lastHeartbeatAt ?? task.updatedAt, recordedAt)) {
          status = 'interrupted'
          reason = 'Agent Run Ledger is unavailable after workflow recovery.'
        }
      } else if (ledger.status === 'running' && isStaleTimestamp(ledger.updatedAt, recordedAt)) {
        status = 'interrupted'
        reason = 'Agent Run Ledger heartbeat expired during workflow recovery.'
      } else if (ledger.status === 'completed') {
        status = 'succeeded'
        outputArtifactRefs = ledger.artifacts.map(artifact => artifact.path)
      } else if (ledger.status === 'failed') {
        status = 'failed'
        reason = 'Agent Run Ledger reports a failed task.'
      } else if (ledger.status === 'waiting_user') {
        status = 'waiting_user'
      } else if (ledger.status === 'blocked') {
        status = 'blocked'
      }
      if (status === task.status && ledger?.updatedAt === task.lastHeartbeatAt) continue
      phaseState.taskSnapshots[index] = {
        ...task,
        status,
        reason,
        outputArtifactRefs,
        lastHeartbeatAt: ledger?.updatedAt ?? task.lastHeartbeatAt,
        updatedAt: recordedAt,
        stateVersion: nextStateVersion,
        ...(['succeeded', 'failed', 'interrupted'].includes(status)
          ? { completedAt: recordedAt, completedStateVersion: nextStateVersion }
          : {}),
      }
      changed = true
    }
    if (changed) {
      phaseState.taskSnapshots = reconcileWaitingStatuses(phaseState.taskSnapshots, recordedAt, nextStateVersion)
    }
  }

  if (!changed) return state
  return recalculateWorkflowCompletionEligibility({
    ...next,
    stateVersion: nextStateVersion,
    revision: (typeof next.revision === 'number' ? next.revision : next.stateVersion) + 1,
    updatedAt: recordedAt,
  }, undefined, recordedAt)
}
