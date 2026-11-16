import { recalculateWorkflowCompletionEligibility } from './workflowCompletionGate.js'
import {
  DEVELOPMENT_IMPLEMENT_PHASE_ID,
  developmentBatchPlanSignature,
  isDevelopmentBatchTaskSnapshot,
  isDevelopmentImplementationPhase,
  validateDevelopmentBatchPlanForState,
  type DevelopmentBatchAgentProgressInput,
  type DevelopmentBatchAgentRole,
  type DevelopmentBatchPlanTask,
} from './workflowDevelopmentBatchAgentPolicy.js'
import type { AgentRunEventInput } from './agentRunLedgerService.js'
import type { WorkflowSessionState, WorkflowTaskSnapshot } from './workflowTypes.js'

function cloneState(state: WorkflowSessionState): WorkflowSessionState {
  return JSON.parse(JSON.stringify(state)) as WorkflowSessionState
}

function snapshotId(batchId: string, role: DevelopmentBatchAgentRole): string {
  return `development-batch:${batchId}:${role}`
}

function validateProgressInput(state: WorkflowSessionState, input: DevelopmentBatchAgentProgressInput): void {
  if (input.phaseId !== DEVELOPMENT_IMPLEMENT_PHASE_ID) {
    throw new Error('WORKFLOW_DEVELOPMENT_BATCH_PHASE_MISMATCH: Agent progress must target delegate-implement.')
  }
  if (!input.batchId.trim() || !input.agentId.trim()) {
    throw new Error('WORKFLOW_DEVELOPMENT_BATCH_AGENT_INVALID: batchId and agentId are required.')
  }
  if (!Array.isArray(input.plan) || input.plan.length === 0) {
    throw new Error('WORKFLOW_DEVELOPMENT_BATCH_PLAN_REQUIRED: The complete Stage 3 Batch plan is required.')
  }
  const ids = new Set<string>()
  for (const task of input.plan) {
    const id = task.id.trim()
    if (!id || ids.has(id)) {
      throw new Error('WORKFLOW_DEVELOPMENT_BATCH_PLAN_INVALID: Batch IDs must be non-empty and unique.')
    }
    ids.add(id)
  }
  if (!ids.has(input.batchId)) {
    throw new Error(`WORKFLOW_DEVELOPMENT_BATCH_PLAN_INVALID: Batch ${input.batchId} is not present in the complete plan.`)
  }
  validateDevelopmentBatchPlanForState(state, input.plan)
  if (input.role === 'reviewer' && input.status === 'succeeded') {
    const outcome = input.reviewerOutcome
    if (!outcome || outcome.reviewStatus !== 'pass' || outcome.readyForNextBatch !== true || outcome.requiredFixes.length) {
      throw new Error('WORKFLOW_DEVELOPMENT_REVIEW_RESULT_INVALID: A successful Reviewer receipt requires reviewStatus=pass, readyForNextBatch=true, and no requiredFixes.')
    }
  }
}

function schedulerTaskId(batchId: string, role: DevelopmentBatchAgentRole): string {
  return `${batchId}::${role}`
}

function createPendingSnapshot(input: {
  state: WorkflowSessionState
  task: DevelopmentBatchPlanTask
  role: DevelopmentBatchAgentRole
  planSignature: string
  recordedAt: string
}): WorkflowTaskSnapshot {
  const dependsOn = input.role === 'reviewer'
    ? [schedulerTaskId(input.task.id, 'coder')]
    : input.task.dependsOn.map(batchId => schedulerTaskId(batchId, 'reviewer'))
  return {
    taskId: snapshotId(input.task.id, input.role),
    runId: input.state.activeWorkflowRunId,
    sessionId: input.state.sessionId,
    phaseId: DEVELOPMENT_IMPLEMENT_PHASE_ID,
    stateVersion: input.state.stateVersion,
    status: dependsOn.length ? 'waiting_dependency' : 'pending',
    executionMode: input.role === 'reviewer'
      ? 'read'
      : input.task.executionMode ?? (input.task.writeScopes.length > 0 ? 'write' : 'read'),
    integrationStatus: 'not-required',
    updatedAt: input.recordedAt,
    batchId: input.task.id,
    workflowRole: input.role,
    developmentPlanSignature: input.planSignature,
    attempt: 0,
    dependsOn,
    writeScopes: input.role === 'reviewer' ? [] : [...input.task.writeScopes],
    resourceClaims: input.role === 'reviewer' ? [] : [...input.task.resourceClaims],
    inputCapsuleRef: typeof input.state.activeContextCapsuleId === 'string'
      ? input.state.activeContextCapsuleId
      : undefined,
  }
}

function reconcileTaskDependencies(snapshots: WorkflowTaskSnapshot[], stateVersion: number, recordedAt: string): WorkflowTaskSnapshot[] {
  const bySchedulerId = new Map(snapshots
    .filter(isDevelopmentBatchTaskSnapshot)
    .map(snapshot => [schedulerTaskId(snapshot.batchId, snapshot.workflowRole), snapshot]))
  return snapshots.map(snapshot => {
    if (snapshot.status !== 'pending' && snapshot.status !== 'waiting_dependency') return snapshot
    const dependenciesComplete = (snapshot.dependsOn ?? []).every(id => bySchedulerId.get(id)?.status === 'succeeded')
    const status = dependenciesComplete ? 'pending' : 'waiting_dependency'
    return status === snapshot.status ? snapshot : { ...snapshot, status, stateVersion, updatedAt: recordedAt }
  })
}

export function recordDevelopmentBatchAgentProgress(
  state: WorkflowSessionState,
  input: DevelopmentBatchAgentProgressInput,
): WorkflowSessionState {
  if (!isDevelopmentImplementationPhase(state)) {
    throw new Error('WORKFLOW_DEVELOPMENT_BATCH_GUARD_INACTIVE: This Agent receipt is only valid for the default development workflow Stage 4.')
  }
  validateProgressInput(state, input)

  const next = cloneState(state)
  const phaseState = next.runtimeContract?.phaseStates[DEVELOPMENT_IMPLEMENT_PHASE_ID]
  if (!phaseState || !next.runtimeContract) {
    throw new Error('WORKFLOW_DEVELOPMENT_BATCH_CONTRACT_UNAVAILABLE: Stage 4 completion state is unavailable.')
  }

  const signature = developmentBatchPlanSignature(input.plan)
  const currentExecutionSnapshots = phaseState.taskSnapshots.filter(snapshot =>
    !(isDevelopmentBatchTaskSnapshot(snapshot) && snapshot.status === 'stale'))
  const existingSignature = currentExecutionSnapshots
    .find(isDevelopmentBatchTaskSnapshot)?.developmentPlanSignature
  if (existingSignature && existingSignature !== signature) {
    throw new Error('WORKFLOW_DEVELOPMENT_BATCH_PLAN_MISMATCH: Every Stage 4 Agent must use the same complete Batch plan.')
  }

  // Stale receipts belong to a superseded Stage 4 execution. They remain in
  // persisted history until the revised phase actually dispatches work, then
  // the first new receipt atomically replaces them with snapshots derived from
  // the newly validated Stage 3 plan.
  const byTaskId = new Map(currentExecutionSnapshots.map((snapshot) => [snapshot.taskId, snapshot]))
  for (const task of input.plan) {
    const batchId = task.id.trim()
    for (const role of ['coder', 'reviewer'] as const) {
      const taskId = snapshotId(batchId, role)
      if (!byTaskId.has(taskId)) {
        byTaskId.set(taskId, createPendingSnapshot({
          state: next,
          task: { ...task, id: batchId },
          role,
          planSignature: signature,
          recordedAt: input.recordedAt,
        }))
      }
    }
  }

  const currentTaskId = snapshotId(input.batchId, input.role)
  const current = byTaskId.get(currentTaskId)!
  if (
    current.agentId === input.agentId
    && current.toolUseId === input.toolUseId
    && current.status === input.status
    && current.reviewStatus === input.reviewerOutcome?.reviewStatus
    && current.readyForNextBatch === input.reviewerOutcome?.readyForNextBatch
    && JSON.stringify(current.requiredFixes ?? []) === JSON.stringify(input.reviewerOutcome?.requiredFixes ?? [])
  ) return state

  if (input.status === 'succeeded' && (
    (state.runStatus !== undefined && state.runStatus !== 'active')
    || ['paused', 'cancelled', 'completed', 'exited'].includes(state.status)
    || state.pendingConfirmation || state.pendingRoute
  )) {
    throw new Error('WORKFLOW_EXECUTION_SUSPENDED: A successful task receipt requires the current workflow to be active without a pending confirmation or route. Preserve completed work and resume through the Leader.')
  }

  const nextStateVersion = state.stateVersion + 1
  if (input.status === 'running') {
    if (current.status === 'running' && current.agentId !== input.agentId) {
      throw new Error(`WORKFLOW_DEVELOPMENT_BATCH_AGENT_ALREADY_RUNNING: ${input.batchId} ${input.role} is already running.`)
    }
    const bySchedulerId = new Map([...byTaskId.values()]
      .filter(isDevelopmentBatchTaskSnapshot)
      .map(snapshot => [schedulerTaskId(snapshot.batchId, snapshot.workflowRole), snapshot]))
    if (input.role === 'reviewer') {
      const coder = byTaskId.get(snapshotId(input.batchId, 'coder'))
      if (coder?.status !== 'succeeded') {
        throw new Error(`WORKFLOW_DEVELOPMENT_BATCH_SEQUENCE_VIOLATION: Batch ${input.batchId} Reviewer cannot start before its Coder succeeds.`)
      }
      if (
        current.reviewStatus === 'needs-fix'
        && typeof current.completedStateVersion === 'number'
        && (coder.completedStateVersion ?? -1) <= current.completedStateVersion
      ) {
        throw new Error(`WORKFLOW_DEVELOPMENT_BATCH_REPAIR_REQUIRED: Batch ${input.batchId} Coder must run again after the Reviewer requested fixes.`)
      }
    } else if (!(current.dependsOn ?? []).every(dependencyId => bySchedulerId.get(dependencyId)?.status === 'succeeded')) {
      throw new Error(`WORKFLOW_DEVELOPMENT_BATCH_SEQUENCE_VIOLATION: Dependencies are incomplete for Batch ${input.batchId} Coder.`)
    } else {
      const reviewerId = snapshotId(input.batchId, 'reviewer')
      const reviewer = byTaskId.get(reviewerId)!
      if (reviewer.status !== 'waiting_dependency' || reviewer.reviewStatus || reviewer.requiredFixes?.length) {
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
    byTaskId.set(currentTaskId, {
      ...current,
      status: 'running',
      stateVersion: nextStateVersion,
      updatedAt: input.recordedAt,
      reason: undefined,
      agentId: input.agentId,
      agentRunId: input.agentId,
      toolUseId: input.toolUseId,
      attempt: (current.attempt ?? 0) + 1,
      startedAt: input.recordedAt,
      completedAt: undefined,
      startedStateVersion: nextStateVersion,
      completedStateVersion: undefined,
      lastHeartbeatAt: input.recordedAt,
      reviewStatus: undefined,
      requiredFixes: undefined,
      readyForNextBatch: undefined,
    })
  } else {
    if (current.status !== 'running' || current.agentId !== input.agentId) {
      throw new Error(`WORKFLOW_DEVELOPMENT_BATCH_AGENT_RECEIPT_MISMATCH: ${input.batchId} ${input.role} has no matching running Agent.`)
    }
    if (input.role === 'reviewer') {
      const coder = byTaskId.get(snapshotId(input.batchId, 'coder'))
      if (coder?.status !== 'succeeded') {
        throw new Error(`WORKFLOW_DEVELOPMENT_BATCH_SEQUENCE_VIOLATION: Batch ${input.batchId} Reviewer cannot finish before its Coder.`)
      }
    }
    byTaskId.set(currentTaskId, {
      ...current,
      status: input.reviewerOutcome?.reviewStatus === 'needs-fix' ? 'needs_fix' : input.status,
      stateVersion: nextStateVersion,
      updatedAt: input.recordedAt,
      reason: input.reason,
      completedAt: input.recordedAt,
      completedStateVersion: nextStateVersion,
      lastHeartbeatAt: input.recordedAt,
      reviewStatus: input.reviewerOutcome?.reviewStatus,
      requiredFixes: input.reviewerOutcome?.requiredFixes,
      readyForNextBatch: input.reviewerOutcome?.readyForNextBatch,
    })
  }

  phaseState.taskSnapshots = reconcileTaskDependencies([...byTaskId.values()], nextStateVersion, input.recordedAt)

  const updated = recalculateWorkflowCompletionEligibility({
    ...next,
    stateVersion: nextStateVersion,
    revision: (typeof next.revision === 'number' ? next.revision : next.stateVersion) + 1,
    updatedAt: input.recordedAt,
    runtimeContract: {
      ...next.runtimeContract,
      phaseStates: {
        ...next.runtimeContract.phaseStates,
        [DEVELOPMENT_IMPLEMENT_PHASE_ID]: {
          ...phaseState,
          taskSnapshots: phaseState.taskSnapshots,
        },
      },
    },
  }, undefined, input.recordedAt)

  return updated
}

export type DevelopmentBatchAgentLedgerEventAppender = (event: AgentRunEventInput) => Promise<unknown>

function ledgerStatusForDevelopmentBatch(
  status: DevelopmentBatchAgentProgressInput['status'],
): AgentRunEventInput['status'] {
  if (status === 'running') return 'running'
  if (status === 'blocked') return 'blocked'
  if (status === 'succeeded') return 'completed'
  return 'failed'
}

export async function recordDevelopmentBatchAgentProgressWithLedger(
  state: WorkflowSessionState,
  input: DevelopmentBatchAgentProgressInput,
  appendLedgerEvent: DevelopmentBatchAgentLedgerEventAppender,
): Promise<WorkflowSessionState> {
  const next = recordDevelopmentBatchAgentProgress(state, input)
  const receiptId = input.toolUseId?.trim() || input.agentId
  await appendLedgerEvent({
    sessionId: state.sessionId,
    runId: input.agentId,
    eventType: 'status_changed',
    toolUseId: `${receiptId}:workflow-task-${input.status}`,
    status: ledgerStatusForDevelopmentBatch(input.status),
  })
  return next
}
