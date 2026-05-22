import type {
  WorkflowCompletionResult,
  WorkflowFinalReport,
  WorkflowModelResolution,
  WorkflowPhaseReportSummary,
  WorkflowSessionState,
  WorkflowVerificationResult,
} from './workflowTypes.js'

function completionForPhase(state: WorkflowSessionState, phaseId: string): WorkflowCompletionResult {
  const phase = state.phases.find((candidate) => candidate.id === phaseId)
  if (phase?.completion) return phase.completion

  const acceptedArtifacts = (phase?.artifactPointers ?? []).filter((pointer) =>
    (pointer as Record<string, unknown>).lifecycleStatus === 'accepted'
  )

  return {
    phaseId,
    passed: true,
    checkedAt: phase?.completedAt ?? state.updatedAt,
    criteriaType: acceptedArtifacts.length ? 'artifact-required' : 'agent-reported',
    artifactPointers: acceptedArtifacts,
  }
}

function phaseSummaries(state: WorkflowSessionState): WorkflowPhaseReportSummary[] {
  return state.phases
    .filter((phase) => phase.status === 'completed' || phase.status === 'failed' || phase.status === 'cancelled')
    .map((phase) => {
      const definition = state.templateSnapshot.phases.find((candidate) => candidate.id === phase.id)
      const model = phase.requestedModel !== undefined || phase.actualModel !== undefined || phase.fallbackReason !== undefined
        ? {
            requestedModel: phase.requestedModel ?? null,
            actualModel: phase.actualModel ?? null,
            providerId: null,
            source: 'phase-request' as const,
            fallbackApplied: Boolean(phase.fallbackReason),
            fallbackReason: phase.fallbackReason ?? null,
            resolvedAt: phase.completedAt ?? state.updatedAt,
          }
        : undefined

      return {
        phaseId: phase.id,
        label: definition?.label ?? phase.id,
        status: phase.status as 'completed' | 'failed' | 'cancelled',
        artifactRefs: phase.artifactPointers,
        completion: completionForPhase(state, phase.id),
        ...(model ? { model } : {}),
      }
    })
}

function verificationResult(state: WorkflowSessionState): WorkflowVerificationResult {
  return {
    passed: state.workflowStatus === 'completed' && state.status === 'completed',
    notes: state.workflowStatus === 'completed'
      ? 'Workflow completed.'
      : `Workflow ended with status ${state.workflowStatus}.`,
  }
}

function modelResolutions(state: WorkflowSessionState): WorkflowModelResolution[] {
  return state.phases
    .filter((phase) =>
      phase.requestedModel !== undefined ||
      phase.actualModel !== undefined ||
      phase.fallbackReason !== undefined
    )
    .map((phase) => ({
      requestedModel: phase.requestedModel ?? null,
      actualModel: phase.actualModel ?? null,
      providerId: null,
      source: 'phase-request',
      fallbackApplied: Boolean(phase.fallbackReason),
      fallbackReason: phase.fallbackReason ?? null,
      resolvedAt: phase.completedAt ?? state.updatedAt,
    }))
}

function templateSnapshotId(state: WorkflowSessionState): string {
  if ('snapshotId' in state.template && typeof state.template.snapshotId === 'string') {
    return state.template.snapshotId
  }

  return `${state.templateIdentity.id}-v${state.templateIdentity.version}`
}

export function buildWorkflowFinalReport(state: WorkflowSessionState): WorkflowFinalReport {
  const summaries = phaseSummaries(state)
  const verification = verificationResult(state)

  return {
    schemaVersion: state.schemaVersion,
    reportId: 'final',
    sessionId: state.sessionId,
    templateId: state.templateIdentity.id,
    templateVersion: state.templateIdentity.version,
    createdAt: state.finalReportRef?.createdAt ?? state.updatedAt,
    phaseSummaries: summaries,
    verificationResult: verification,
    conversationSummary: 'Workflow completed.',
    artifactRefs: Array.isArray(state.artifactIndex)
      ? state.artifactIndex
      : Object.values(state.artifactIndex ?? {}),
    modelResolutions: modelResolutions(state),
    skillProvenance: state.phases.flatMap((phase) => phase.skillProvenance ?? []),
    template: {
      id: state.templateIdentity.id,
      version: String(state.templateIdentity.version),
      source: state.templateIdentity.source,
      snapshotId: templateSnapshotId(state),
    },
    status: 'completed',
    summary: 'Workflow completed.',
    phases: summaries.map((phase) => ({
      id: phase.phaseId,
      name: phase.label,
      status: phase.status,
      artifactPointers: phase.artifactRefs,
      completion: phase.completion,
      ...(phase.model ? { model: phase.model } : {}),
    })),
    verification,
  }
}
