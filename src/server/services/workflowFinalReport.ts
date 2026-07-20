import type {
  WorkflowCompletionResult,
  WorkflowFinalReport,
  WorkflowModelResolution,
  WorkflowPhaseSkillEvidence,
  WorkflowPhaseSkillReference,
  WorkflowPhaseSkillResolution,
  WorkflowPhaseSkillSnapshot,
  WorkflowPhaseReportSummary,
  WorkflowSessionState,
  WorkflowVerificationResult,
} from './workflowTypes.js'

type WorkflowRecommendedSkillReport = {
  snapshots: WorkflowPhaseSkillSnapshot[]
  evidence: WorkflowPhaseSkillEvidence[]
}

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
      const definition = state.phases.find((candidate) => candidate.id === phase.id)
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

function templateVersionId(state: WorkflowSessionState): string {
  if ('snapshotId' in state.template && typeof state.template.snapshotId === 'string') {
    return state.template.snapshotId
  }

  return `${state.templateIdentity.id}-v${state.templateIdentity.version}`
}

function recommendedSkillReport(state: WorkflowSessionState): WorkflowRecommendedSkillReport | undefined {
  const evidence = workflowPhaseSkillEvidence(state)
  if (evidence.length === 0) return undefined

  const evidenceKeys = new Set(evidence.map((item) => `${item.phaseId}\u0000${item.name}`))
  const snapshots = workflowPhaseSkillSnapshots(state)
    .map((snapshot) => boundedSnapshot(snapshot, evidenceKeys))
    .filter((snapshot) => snapshot.references.length > 0 || snapshot.resolutions.length > 0)

  if (snapshots.length === 0) return { snapshots: [], evidence }
  return { snapshots, evidence }
}

function workflowPhaseSkillSnapshots(state: WorkflowSessionState): WorkflowPhaseSkillSnapshot[] {
  return Array.isArray(state.phaseSkillSnapshots)
    ? state.phaseSkillSnapshots as WorkflowPhaseSkillSnapshot[]
    : []
}

function workflowPhaseSkillEvidence(state: WorkflowSessionState): WorkflowPhaseSkillEvidence[] {
  return Array.isArray(state.phaseSkillEvidence)
    ? state.phaseSkillEvidence as WorkflowPhaseSkillEvidence[]
    : []
}

function boundedSnapshot(
  snapshot: WorkflowPhaseSkillSnapshot,
  evidenceKeys: Set<string>,
): WorkflowPhaseSkillSnapshot {
  const references = snapshot.references.filter((reference) =>
    evidenceKeys.has(`${snapshot.phaseId}\u0000${reference.name}`)
  )
  const referenceKeys = new Set(references.map(skillReferenceKey))
  const resolutions = snapshot.resolutions.filter((resolution) =>
    referenceKeys.has(skillReferenceKey(resolution.reference))
  )

  return {
    ...snapshot,
    references,
    resolutions,
  }
}

function skillReferenceKey(reference: WorkflowPhaseSkillReference | WorkflowPhaseSkillResolution['reference']): string {
  return [
    reference.name,
    reference.source ?? '',
    reference.pluginName ?? '',
    reference.namespace ?? '',
    reference.referenceId ?? '',
  ].join('\u0000')
}

export function buildWorkflowFinalReport(state: WorkflowSessionState): WorkflowFinalReport {
  const summaries = phaseSummaries(state)
  const verification = verificationResult(state)
  const recommendedSkills = recommendedSkillReport(state)

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
    ...(recommendedSkills ? { recommendedSkills } : {}),
    template: {
      id: state.templateIdentity.id,
      version: String(state.templateIdentity.version),
      source: state.templateIdentity.source,
      snapshotId: templateVersionId(state),
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
