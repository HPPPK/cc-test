import type {
  WorkflowPhaseSkillEvidence,
  WorkflowPhaseSkillReference,
  WorkflowPhaseSkillResolution,
  WorkflowPhaseSkillResolutionStatus,
  WorkflowPhaseSkillSnapshot,
  WorkflowPhaseSkillSource,
  WorkflowLifecycleStatus,
  WorkflowModelResolution,
  WorkflowSessionMetadata,
  WorkflowSessionState,
  WorkflowSessionSummary,
} from './workflowTypes.js'

type WorkflowRecommendedSkillStatusSummary = {
  total: number
  available: number
  unavailable: number
  degraded: number
  evidenceCount: number
  activePhaseItems?: Array<{
    name: string
    status: WorkflowPhaseSkillResolutionStatus
    source?: WorkflowPhaseSkillSource
    pluginName?: string
  }>
}

export function workflowSummaryFromState(state: WorkflowSessionState): WorkflowSessionSummary {
  const pointer = {
    kind: 'workflow-state' as const,
    sessionId: state.sessionId,
    artifactId: 'state',
    schemaVersion: state.schemaVersion,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    label: 'Workflow state',
  }
  return workflowSummaryFromMetadata(stateToWorkflowMetadata(state, pointer))
}

export function stateToWorkflowMetadata(
  state: WorkflowSessionState,
  statePointer: WorkflowSessionMetadata['statePointer'],
): WorkflowSessionMetadata {
  const template = state.templateIdentity
  const model = visibleModelResolution(state)
  const recommendedSkillStatus = recommendedSkillStatusFromState(state)
  return {
    mode: 'workflow',
    schemaVersion: 1,
    templateId: template.id,
    templateVersion: template.version,
    templateSource: template.source,
    templateSnapshotId: `${template.id}-v${template.version}`,
    workflowStatus: state.workflowStatus,
    status: state.status,
    activePhaseId: state.activePhaseId,
    statePointer,
    stateRef: statePointer,
    reportPointer: state.finalReportPointer,
    reportRef: state.finalReportRef,
    sourceTemplateStatus: state.sourceTemplateStatus,
    stateRevision: state.revision,
    updatedAt: state.updatedAt,
    activePhaseIndex: activePhaseIndex(state),
    phaseCount: state.phaseRuns.length || state.phases.length,
    pendingConfirmation: Boolean(state.pendingConfirmation),
    ...(activePhaseTransitionAuthority(state)
      ? { transitionAuthority: activePhaseTransitionAuthority(state) }
      : {}),
    ...(model ? { model } : {}),
    ...(recommendedSkillStatus ? { recommendedSkillStatus } : {}),
    ...(typeof state.blockedReason === 'string' ? { blockedReason: state.blockedReason } : {}),
  }
}

export function workflowSummaryFromMetadata(metadata: WorkflowSessionMetadata): WorkflowSessionSummary {
  const activeIndex = typeof metadata.activePhaseIndex === 'number'
    ? metadata.activePhaseIndex
    : -1
  const phaseCount = typeof metadata.phaseCount === 'number'
    ? metadata.phaseCount
    : 0

  const summary: WorkflowSessionSummary = {
    mode: 'workflow',
    templateId: metadata.templateId,
    templateVersion: String(metadata.templateVersion),
    templateSource: metadata.templateSource,
    templateSnapshotId: metadata.templateSnapshotId,
    status: (metadata.status ?? metadata.workflowStatus) as WorkflowLifecycleStatus,
    activePhaseId: metadata.activePhaseId,
    activePhaseIndex: activeIndex,
    phaseCount,
    pendingConfirmation: Boolean(metadata.pendingConfirmation),
    ...(metadata.transitionAuthority === 'auto' || metadata.transitionAuthority === 'user-confirmation'
      ? { transitionAuthority: metadata.transitionAuthority }
      : {}),
    ...(isWorkflowModelResolution(metadata.model) ? { model: metadata.model } : {}),
    ...(isWorkflowRecommendedSkillStatusSummary(metadata.recommendedSkillStatus)
      ? { recommendedSkillStatus: metadata.recommendedSkillStatus }
      : {}),
    ...(typeof metadata.blockedReason === 'string' ? { blockedReason: metadata.blockedReason } : {}),
    statePointer: metadata.statePointer,
    ...(metadata.reportPointer ? { reportPointer: metadata.reportPointer } : {}),
  } as WorkflowSessionSummary

  return typeof metadata.sourceTemplateStatus === 'string'
    ? { ...summary, sourceTemplateStatus: metadata.sourceTemplateStatus }
    : summary
}

function activePhaseTransitionAuthority(
  state: WorkflowSessionState,
): 'auto' | 'user-confirmation' | undefined {
  if (!state.activePhaseId) return undefined
  const phase = state.templateSnapshot?.phases?.find((candidate) => candidate.id === state.activePhaseId)
  return phase?.transitionAuthority
}

function isWorkflowModelResolution(value: unknown): value is WorkflowModelResolution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    (typeof record.requestedModel === 'string' || record.requestedModel === null) &&
    (typeof record.actualModel === 'string' || record.actualModel === null) &&
    (typeof record.providerId === 'string' || record.providerId === null) &&
    typeof record.fallbackApplied === 'boolean'
  )
}

function recommendedSkillStatusFromState(
  state: WorkflowSessionState,
): WorkflowRecommendedSkillStatusSummary | undefined {
  const snapshots = workflowPhaseSkillSnapshots(state)
  if (snapshots.length === 0) return undefined

  const activeSnapshot = state.activePhaseId
    ? snapshots.find((snapshot) => snapshot.phaseId === state.activePhaseId)
    : undefined
  const snapshot = activeSnapshot ?? snapshots[0]
  if (!snapshot) return undefined

  const resolutionByName = new Map(
    snapshot.resolutions.map((resolution) => [
      skillReferenceKey(resolution.reference),
      resolution,
    ]),
  )
  const activePhaseItems = snapshot.references.map((reference) => {
    const resolution = resolutionByName.get(skillReferenceKey(reference))
    return {
      name: reference.name,
      status: resolution?.status ?? 'invalid-reference',
      ...(skillSource(reference, resolution) ? { source: skillSource(reference, resolution) } : {}),
      ...(reference.pluginName ?? resolution?.resolvedSkill?.pluginName
        ? { pluginName: reference.pluginName ?? resolution?.resolvedSkill?.pluginName }
        : {}),
    }
  })

  return {
    total: activePhaseItems.length,
    available: activePhaseItems.filter((item) => item.status === 'available').length,
    unavailable: activePhaseItems.filter((item) => isUnavailableSkillStatus(item.status)).length,
    degraded: activePhaseItems.filter((item) => isDegradedSkillStatus(item.status)).length,
    evidenceCount: workflowPhaseSkillEvidence(state)
      .filter((evidence) => evidence.phaseId === snapshot.phaseId)
      .length,
    activePhaseItems,
  }
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

function skillReferenceKey(reference: WorkflowPhaseSkillReference): string {
  return [
    reference.name,
    reference.source ?? '',
    reference.pluginName ?? '',
    reference.namespace ?? '',
    reference.referenceId ?? '',
  ].join('\u0000')
}

function skillSource(
  reference: WorkflowPhaseSkillReference,
  resolution?: WorkflowPhaseSkillResolution,
): WorkflowPhaseSkillSource | undefined {
  return resolution?.resolvedSkill?.source ?? reference.source
}

function isUnavailableSkillStatus(status: WorkflowPhaseSkillResolutionStatus): boolean {
  return (
    status === 'missing' ||
    status === 'unsupported-source' ||
    status === 'plugin-disabled' ||
    status === 'invalid-reference'
  )
}

function isDegradedSkillStatus(status: WorkflowPhaseSkillResolutionStatus): boolean {
  return status === 'ambiguous' || status === 'installable'
}

function isWorkflowRecommendedSkillStatusSummary(
  value: unknown,
): value is WorkflowRecommendedSkillStatusSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.total === 'number' &&
    typeof record.available === 'number' &&
    typeof record.unavailable === 'number' &&
    typeof record.degraded === 'number' &&
    typeof record.evidenceCount === 'number'
  )
}

function visibleModelResolution(state: WorkflowSessionState): WorkflowModelResolution | undefined {
  const activePhaseRun = state.activePhaseId
    ? state.phaseRuns.find((phase) => phase.phaseId === state.activePhaseId)
    : undefined
  const phaseRuns = [
    ...(activePhaseRun ? [activePhaseRun] : []),
    ...[...state.phaseRuns].reverse(),
  ]

  for (const phase of phaseRuns) {
    if (phase.modelResolution) return phase.modelResolution
  }

  const activePhase = state.activePhaseId
    ? state.phases.find((phase) => phase.id === state.activePhaseId)
    : undefined
  const phases = [
    ...(activePhase ? [activePhase] : []),
    ...[...state.phases].reverse(),
  ]

  for (const phase of phases) {
    if (
      phase.requestedModel !== undefined ||
      phase.actualModel !== undefined ||
      phase.fallbackReason !== undefined
    ) {
      return {
        requestedModel: phase.requestedModel ?? null,
        actualModel: phase.actualModel ?? null,
        providerId: null,
        source: 'phase-request',
        fallbackApplied: Boolean(phase.fallbackReason),
        fallbackReason: phase.fallbackReason ?? null,
        resolvedAt: state.updatedAt,
      }
    }
  }

  return undefined
}

function activePhaseIndex(state: WorkflowSessionState): number {
  if (!state.activePhaseId) return -1
  const phaseRunIndex = state.phaseRuns.findIndex((phase) => phase.phaseId === state.activePhaseId)
  if (phaseRunIndex >= 0) return phaseRunIndex
  return state.phases.findIndex((phase) => phase.id === state.activePhaseId)
}
