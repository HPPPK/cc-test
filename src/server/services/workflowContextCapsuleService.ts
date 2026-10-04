import { createHash } from 'node:crypto'
import type {
  JsonObject,
  WorkflowArtifactPointer,
  WorkflowContextCapsule,
  WorkflowSessionState,
} from './workflowTypes.js'

const CAPSULE_WORKFLOW_IDS = new Set([
  'efficient-constrained-dev-debug-workflow-v5',
  'feature-extension-workflow-v8',
  'debug-repair-workflow-v8',
])

export function workflowUsesContextCapsule(state: Pick<WorkflowSessionState, 'templateIdentity'>): boolean {
  return CAPSULE_WORKFLOW_IDS.has(state.templateIdentity.id)
}

export function createWorkflowContextCapsule(
  state: WorkflowSessionState,
  input: {
    fromPhaseId: string
    toPhaseId: string
    createdAt: string
    handoff: JsonObject
  },
): WorkflowContextCapsule {
  const phase = state.phases.find((candidate) => candidate.id === input.fromPhaseId)
  const phaseContract = state.runtimeContract?.phaseStates?.[input.fromPhaseId]
  const tasks = phaseContract?.taskSnapshots ?? []
  const artifactRefs = dedupeArtifacts(phase?.artifactPointers ?? [])
  const payload = {
    sessionId: state.sessionId,
    runId: state.activeWorkflowRunId ?? state.sessionId + '-run',
    fromPhaseId: input.fromPhaseId,
    toPhaseId: input.toPhaseId,
    sourceStateVersion: state.stateVersion,
    handoff: input.handoff,
    tasks: tasks.map((task) => ({ taskId: task.taskId, status: task.status, batchId: task.batchId, workflowRole: task.workflowRole })),
    artifactRefs,
  }
  const sourceHash = 'sha256-' + createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  const resolvedIssues = (phaseContract?.issues ?? [])
    .filter((issue) => issue.status === 'resolved')
    .map((issue) => issue.blockingReason || issue.question || issue.id)

  return {
    schemaVersion: 1,
    id: 'capsule-' + safeSegment(input.fromPhaseId) + '-to-' + safeSegment(input.toPhaseId) + '-' + state.stateVersion + '-' + sourceHash.slice(-12),
    sessionId: state.sessionId,
    runId: state.activeWorkflowRunId ?? state.sessionId + '-run',
    fromPhaseId: input.fromPhaseId,
    toPhaseId: input.toPhaseId,
    sourceStateVersion: state.stateVersion,
    sourceHash,
    createdAt: input.createdAt,
    userRequirements: stringList(input.handoff.userRequirements ?? input.handoff.requirements),
    userDecisions: stringList(input.handoff.userDecisions ?? input.handoff.decisions),
    acceptedTaskIds: tasks.map((task) => task.taskId),
    completedTaskIds: tasks.filter((task) => task.status === 'succeeded').map((task) => task.taskId),
    incompleteTaskIds: tasks.filter((task) => task.status !== 'succeeded' && task.status !== 'cancelled').map((task) => task.taskId),
    artifactRefs,
    modifiedFiles: stringList(input.handoff.modifiedFiles ?? input.handoff.changedFiles),
    verificationEvidence: stringList(input.handoff.verificationEvidence ?? input.handoff.evidence),
    excludedIssues: unique([...resolvedIssues, ...stringList(input.handoff.excludedIssues ?? input.handoff.excludedCauses)]),
    unresolvedRisks: stringList(input.handoff.unresolvedRisks ?? input.handoff.risks),
    nextActions: stringList(input.handoff.nextActions ?? input.handoff.nextPhaseInputs),
    handoff: input.handoff,
  }
}

export function attachWorkflowContextCapsule(
  state: WorkflowSessionState,
  capsule: WorkflowContextCapsule,
): void {
  const existing = state.contextCapsules ?? []
  state.contextCapsules = existing.some((candidate) => candidate.id === capsule.id)
    ? existing
    : [...existing, capsule]
  state.activeContextCapsuleId = capsule.id
  state.nextPhaseContextStrategy = 'capsule'
}

export function activeWorkflowContextCapsule(state: WorkflowSessionState): WorkflowContextCapsule | null {
  if (!state.activeContextCapsuleId) return null
  return state.contextCapsules?.find((capsule) => capsule.id === state.activeContextCapsuleId) ?? null
}

export function contextCapsulePrompt(state: WorkflowSessionState): string {
  const capsule = activeWorkflowContextCapsule(state)
  if (!capsule) return ''
  return [
    'Context Capsule (authoritative handoff for this phase)',
    JSON.stringify({
      fromPhaseId: capsule.fromPhaseId,
      toPhaseId: capsule.toPhaseId,
      sourceStateVersion: capsule.sourceStateVersion,
      sourceHash: capsule.sourceHash,
      userRequirements: capsule.userRequirements,
      userDecisions: capsule.userDecisions,
      acceptedTaskIds: capsule.acceptedTaskIds,
      completedTaskIds: capsule.completedTaskIds,
      incompleteTaskIds: capsule.incompleteTaskIds,
      artifactRefs: capsule.artifactRefs,
      modifiedFiles: capsule.modifiedFiles,
      verificationEvidence: capsule.verificationEvidence,
      excludedIssues: capsule.excludedIssues,
      unresolvedRisks: capsule.unresolvedRisks,
      nextActions: capsule.nextActions,
      handoff: capsule.handoff,
    }, null, 2),
    'Use this capsule plus the current phase instructions and latest user input. Do not infer work outside the active phase.',
  ].join('\n')
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return unique(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

function dedupeArtifacts(values: WorkflowArtifactPointer[]): WorkflowArtifactPointer[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.artifactId + ':' + (value.contentHash ?? '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'phase'
}
