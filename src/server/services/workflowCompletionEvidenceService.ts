import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { isWorkflowArtifactWritePath } from './workflowToolPolicy.js'
import type {
  WorkflowArtifactPointer,
  WorkflowPhaseArtifact,
  WorkflowPhaseDefinition,
  WorkflowSessionState,
  WorkflowTemplate,
} from './workflowTypes.js'
import { WorkflowSessionStateService } from './workflowSessionStateService.js'

const MAX_RUNTIME_VERIFIED_ARTIFACT_BYTES = 2 * 1024 * 1024

export type RuntimeVerifiedOutputObservation = {
  outputId: string
  filename: string
  bytes: number
  sha256: string
  modifiedAt: string
}

export type WorkflowSemanticEvidenceValidationError = {
  code: 'WORKFLOW_CORE_FLOW_EVIDENCE_INVALID'
  message: string
}

export type RuntimeVerifiedOutputEvidence = {
  state: WorkflowSessionState
  phaseId: string
  outputArtifactIds: string[]
  observedOutputs: RuntimeVerifiedOutputObservation[]
  outputPointersById: Map<string, WorkflowArtifactPointer>
  evidenceOutputArtifactId: string | null
  semanticValidationError: WorkflowSemanticEvidenceValidationError | null
}

function activeTemplate(state: WorkflowSessionState): WorkflowTemplate | null {
  if (state.template && typeof state.template === 'object' && Array.isArray((state.template as WorkflowTemplate).phases)) {
    return state.template as WorkflowTemplate
  }
  return state.templateSnapshot ?? null
}

function activePhase(state: WorkflowSessionState, template: WorkflowTemplate): WorkflowPhaseDefinition | null {
  const phaseId = state.activePhaseId
  return phaseId ? template.phases.find((phase) => phase.id === phaseId) ?? null : null
}

function workflowLabels(state: WorkflowSessionState): string[] {
  return [...new Set([...(state.labels ?? []), ...(state.secondaryLabels ?? [])])]
}

function isRequiredOutputForState(
  artifact: NonNullable<WorkflowPhaseDefinition['outputArtifacts']>[number],
  state: WorkflowSessionState,
): boolean {
  if (artifact.required === false) return false
  const requiredWhen = artifact.requiredWhen ?? []
  return requiredWhen.length === 0 || requiredWhen.some((label) => workflowLabels(state).includes(label))
}

function artifactPointers(state: WorkflowSessionState): WorkflowArtifactPointer[] {
  return Array.isArray(state.artifactIndex)
    ? state.artifactIndex
    : Object.values(state.artifactIndex ?? {})
}

export function appendWorkflowArtifactPointers(
  state: WorkflowSessionState,
  pointers: WorkflowArtifactPointer[],
): WorkflowSessionState {
  if (!pointers.length) return state
  const existing = artifactPointers(state)
  const newPointers = pointers.filter((pointer) => !existing.some((candidate) => candidate.artifactId === pointer.artifactId))
  if (!newPointers.length) return state

  return {
    ...state,
    artifactIndex: Array.isArray(state.artifactIndex)
      ? [...state.artifactIndex, ...newPointers]
      : Object.fromEntries([...existing, ...newPointers].map((pointer) => [pointer.artifactId, pointer])),
    phases: state.phases.map((phase) => phase.id === state.activePhaseId
      ? {
          ...phase,
          artifactPointers: [...phase.artifactPointers, ...newPointers.filter((pointer) => !phase.artifactPointers.some((candidate) => candidate.artifactId === pointer.artifactId))],
        }
      : phase),
    phaseRuns: state.phaseRuns.map((run) => run.phaseId === state.activePhaseId
      ? {
          ...run,
          outputArtifactRefs: [...run.outputArtifactRefs, ...newPointers.filter((pointer) => !run.outputArtifactRefs.some((candidate) => candidate.artifactId === pointer.artifactId))],
        }
      : run),
  }
}

function expandOutputFileName(filename: string, state: WorkflowSessionState): string | null {
  if (!filename.includes('<runId>')) return filename
  if (!state.activeWorkflowRunId) return null
  return filename.replaceAll('<runId>', state.activeWorkflowRunId)
}

function runtimeArtifactId(phaseId: string, outputArtifactId: string, digest: string): string {
  return `runtime-output-${createHash('sha256').update(`${phaseId}\u0000${outputArtifactId}\u0000${digest}`).digest('hex').slice(0, 32)}`
}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString)
}

function coreFlowEvidenceError(message: string): WorkflowSemanticEvidenceValidationError {
  return { code: 'WORKFLOW_CORE_FLOW_EVIDENCE_INVALID', message }
}

function validateCoreFlowEvidence(
  phase: WorkflowPhaseDefinition,
  outputContentsById: Map<string, Buffer>,
): WorkflowSemanticEvidenceValidationError | null {
  const policy = phase.evidencePolicy?.coreFlowEvidence
  if (!policy || policy.type !== 'core-flow-evidence-v1') return null

  const source = outputContentsById.get(policy.outputArtifactId)
  if (!source) return coreFlowEvidenceError(
    `Required core-flow evidence output is missing: ${policy.outputArtifactId}.`,
  )

  let document: unknown
  try {
    document = JSON.parse(source.toString('utf8'))
  } catch {
    return coreFlowEvidenceError('Core-flow evidence must be valid JSON.')
  }
  if (!isRecord(document) || document.schemaVersion !== 1 || !Array.isArray(document.flows) || document.flows.length === 0) {
    return coreFlowEvidenceError('Core-flow evidence must contain schemaVersion: 1 and a non-empty flows array.')
  }

  let hasIncompleteFlow = false
  for (const [index, candidate] of document.flows.entries()) {
    if (!isRecord(candidate)) return coreFlowEvidenceError(`Core-flow evidence entry ${index + 1} must be an object.`)
    if (!nonEmptyString(candidate.coreFlowId) || !nonEmptyString(candidate.entryBoundary)) {
      return coreFlowEvidenceError(`Core-flow evidence entry ${index + 1} must record coreFlowId and entryBoundary.`)
    }
    if (!nonEmptyStringArray(candidate.expectedCheckpoints) || !Array.isArray(candidate.observedCheckpoints)) {
      return coreFlowEvidenceError(`Core-flow evidence entry ${index + 1} must record expectedCheckpoints and observedCheckpoints.`)
    }

    const execution = candidate.execution
    if (!isRecord(execution) || !['pass', 'partial', 'not-run'].includes(String(execution.status)) || !['runtime', 'manual-preview', 'integration', 'static'].includes(String(execution.method))) {
      return coreFlowEvidenceError(`Core-flow evidence entry ${index + 1} must declare a valid execution status and method.`)
    }
    const status = execution.status
    const method = execution.method
    if (status === 'pass') {
      if (method === 'static' || !nonEmptyString(execution.visibleResult) || !nonEmptyStringArray(candidate.observedCheckpoints)) {
        return coreFlowEvidenceError(`Core-flow evidence entry ${index + 1} cannot claim pass from static inspection or without observed checkpoints and a visible result.`)
      }
    } else {
      hasIncompleteFlow = true
      if (!nonEmptyString(execution.nextAction)) {
        return coreFlowEvidenceError(`Core-flow evidence entry ${index + 1} must record nextAction when the path is partial or not-run.`)
      }
    }

    if (policy.requireLogDisposition) {
      const logEvidence = candidate.logEvidence
      if (!isRecord(logEvidence) || !['used', 'not-applicable', 'unavailable'].includes(String(logEvidence.status))) {
        return coreFlowEvidenceError(`Core-flow evidence entry ${index + 1} must record logEvidence as used, not-applicable, or unavailable.`)
      }
      if (logEvidence.status === 'used') {
        if (!nonEmptyStringArray(logEvidence.paths) || !nonEmptyString(logEvidence.timeWindow) || !nonEmptyStringArray(logEvidence.observations)) {
          return coreFlowEvidenceError(`Core-flow evidence entry ${index + 1} must include log paths, timeWindow, and observations when logs were used.`)
        }
      } else if (!nonEmptyString(logEvidence.reason)) {
        return coreFlowEvidenceError(`Core-flow evidence entry ${index + 1} must explain why logs were not applicable or unavailable.`)
      }
    }
  }

  if (hasIncompleteFlow && policy.qualityReportArtifactId) {
    const qualityReport = outputContentsById.get(policy.qualityReportArtifactId)?.toString('utf8') ?? ''
    if (/(?:Runtime Preview|运行时预览)\s*(?:—|--|-|:)?\s*(?:PASS|PASSED|通过)/i.test(qualityReport)) {
      return coreFlowEvidenceError('Quality report cannot claim Runtime Preview PASS while a declared core flow is partial or not-run.')
    }
  }

  return null
}

/**
 * Converts actual, declared .workflow output files into session-scoped audit artifacts.
 * It never treats assistant prose as evidence and never scans arbitrary workspace files.
 */
export async function collectRuntimeVerifiedOutputEvidence(input: {
  sessionId: string
  state: WorkflowSessionState
  workspaceRoot: string
  requestedAt: string
  stateService?: WorkflowSessionStateService
}): Promise<RuntimeVerifiedOutputEvidence | null> {
  const template = activeTemplate(input.state)
  if (!template || !input.state.activePhaseId) return null
  const phase = activePhase(input.state, template)
  if (!phase) return null

  const outputs = (phase.outputArtifacts ?? []).filter((artifact) =>
    isRequiredOutputForState(artifact, input.state) && typeof artifact.filename === 'string' && artifact.filename.trim().length > 0,
  )
  if (!outputs.length) return null

  const observed: RuntimeVerifiedOutputObservation[] = []
  const outputContentsById = new Map<string, Buffer>()
  for (const output of outputs) {
    const filename = expandOutputFileName(output.filename!, input.state)
    if (!filename || !isWorkflowArtifactWritePath(input.workspaceRoot, filename)) return null
    const absolutePath = path.resolve(input.workspaceRoot, filename)
    let content: Buffer
    let modifiedAt: string
    try {
      const beforeRead = await fs.stat(absolutePath)
      if (!beforeRead.isFile()) return null
      content = await fs.readFile(absolutePath)
      const afterRead = await fs.stat(absolutePath)
      if (!afterRead.isFile() || beforeRead.size !== afterRead.size || beforeRead.mtimeMs !== afterRead.mtimeMs) return null
      modifiedAt = new Date(afterRead.mtimeMs).toISOString()
    } catch {
      return null
    }
    if (content.byteLength > MAX_RUNTIME_VERIFIED_ARTIFACT_BYTES) return null
    outputContentsById.set(output.id, content)
    observed.push({
      outputId: output.id,
      filename: path.relative(input.workspaceRoot, absolutePath).replace(/\\/g, '/'),
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
      modifiedAt,
    })
  }

  const semanticValidationError = validateCoreFlowEvidence(phase, outputContentsById)
  if (semanticValidationError) {
    return {
      state: input.state,
      phaseId: phase.id,
      outputArtifactIds: observed.map((output) => output.outputId),
      observedOutputs: observed,
      outputPointersById: new Map(),
      evidenceOutputArtifactId: phase.evidencePolicy?.outputArtifact?.id ?? null,
      semanticValidationError,
    }
  }

  const stateService = input.stateService ?? new WorkflowSessionStateService()
  const existing = new Map(artifactPointers(input.state).map((pointer) => [pointer.artifactId, pointer]))
  const pointers: WorkflowArtifactPointer[] = []
  const outputPointersById = new Map<string, WorkflowArtifactPointer>()

  for (const output of observed) {
    const artifactId = runtimeArtifactId(phase.id, output.outputId, output.sha256)
    let pointer = existing.get(artifactId)
    if (!pointer) {
      const artifact: WorkflowPhaseArtifact = {
        schemaVersion: 1,
        sessionId: input.sessionId,
        phaseId: phase.id,
        artifactId,
        lifecycleStatus: 'accepted',
        type: 'structured-output',
        createdAt: input.requestedAt,
        title: `Runtime-verified workflow output: ${output.outputId}`,
        content: {
          outputArtifactId: output.outputId,
          workspaceRelativePath: output.filename,
          bytes: output.bytes,
          sha256: output.sha256,
          observedAt: input.requestedAt,
          modifiedAt: output.modifiedAt,
          verification: 'declared-workflow-output-file-present',
        },
        provenance: {
          messageId: `runtime-output-verification:${phase.id}:${output.outputId}:${output.sha256}`,
        },
      }
      pointer = (await stateService.writePhaseArtifact(input.sessionId, artifact)).pointer
      pointers.push(pointer)
    }
    outputPointersById.set(output.outputId, pointer)
  }

  return {
    state: appendWorkflowArtifactPointers(input.state, pointers),
    phaseId: phase.id,
    outputArtifactIds: observed.map((output) => output.outputId),
    observedOutputs: observed,
    outputPointersById,
    evidenceOutputArtifactId: phase.evidencePolicy?.outputArtifact?.id ?? null,
    semanticValidationError: null,
  }
}


/**
 * A user answer alone never resolves a blocking workflow question. The runtime may
 * resolve it only when every current-phase, required declared workflow output has
 * just been hash-verified and at least one declared output records work performed
 * after that answer. Planning outputs that must exist before execution do not need
 * to be rewritten solely to acknowledge a later authorization answer.
 */
export function getRuntimeResolvableAnsweredIssueIds(
  state: WorkflowSessionState,
  verified: RuntimeVerifiedOutputEvidence,
): string[] {
  if (state.activePhaseId !== verified.phaseId) return []
  const phaseState = state.runtimeContract?.phaseStates[verified.phaseId]
  if (!phaseState || verified.observedOutputs.length === 0 || verified.outputPointersById.size !== verified.observedOutputs.length) return []

  return phaseState.issues
    .filter((issue) => issue.phaseId === verified.phaseId && issue.blocksCompletion && issue.status === 'answered-pending-processing')
    .filter((issue) => {
      const answerReceivedAt = Date.parse(issue.answerReceivedAt ?? '')
      if (!Number.isFinite(answerReceivedAt)) return false
      return verified.observedOutputs.some((output) => {
        const modifiedAt = Date.parse(output.modifiedAt)
        return Number.isFinite(modifiedAt) && modifiedAt >= answerReceivedAt
      })
    })
    .map((issue) => issue.id)
}
