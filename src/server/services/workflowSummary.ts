import type {
  WorkflowPhaseSkillEvidence,
  WorkflowPhaseSkillReference,
  WorkflowPhaseSkillResolution,
  WorkflowPhaseSkillResolutionStatus,
  WorkflowPhaseSkillSnapshot,
  WorkflowPhaseSkillSource,
  WorkflowArtifact,
  WorkflowArtifactSummary,
  WorkflowLifecycleStatus,
  WorkflowModelResolution,
  WorkflowRunSummary,
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
  const pendingConfirmation = Boolean(state.pendingConfirmation)
  return {
    mode: 'workflow',
    schemaVersion: 1,
    templateId: template.id,
    templateVersion: template.version,
    templateSource: template.source,
    templateSnapshotId: `${template.id}-v${template.version}`,
    workflowStatus: state.workflowStatus,
    status: state.status,
    runStatus: state.runStatus,
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
    phaseNames: state.phases.map((phase) => phase.label ?? phase.id),
    pendingConfirmation,
    ...(Array.isArray(state.labels) ? { labels: state.labels } : {}),
    ...(Array.isArray(state.secondaryLabels) ? { secondaryLabels: state.secondaryLabels } : {}),
    ...(typeof state.effort === 'string' ? { effort: state.effort } : {}),
    ...(typeof state.routingMode === 'string' ? { routingMode: state.routingMode } : {}),
    ...(typeof state.brainstormingMode === 'string' ? { brainstormingMode: state.brainstormingMode } : {}),
    ...(state.router && typeof state.router === 'object' ? { router: state.router } : {}),
    ...(typeof state.activeWorkflowRunId === 'string' ? { activeWorkflowRunId: state.activeWorkflowRunId } : {}),
    ...(typeof state.lastCompletedWorkflowRunId === 'string' ? { lastCompletedWorkflowRunId: state.lastCompletedWorkflowRunId } : {}),
    ...(workflowRunSummaries(state).length ? { workflowRuns: workflowRunSummaries(state) } : {}),
    ...(activeWorkflowRunSummary(state) ? { activeWorkflowRun: activeWorkflowRunSummary(state) } : {}),
    ...(workflowArtifactList(state).length ? { artifactList: workflowArtifactList(state) } : {}),
    ...(isWorkflowPreviewState(state.preview) ? { preview: state.preview } : {}),
    ...(Array.isArray(state.skillBindingStatus) ? { skillBindingStatus: state.skillBindingStatus } : {}),
    ...(activePhaseTransitionAuthority(state)
      ? { transitionAuthority: activePhaseTransitionAuthority(state) }
      : {}),
    ...(model ? { model } : {}),
    ...(recommendedSkillStatus ? { recommendedSkillStatus } : {}),
    ...(!pendingConfirmation && typeof state.blockedReason === 'string' ? { blockedReason: state.blockedReason } : {}),
  }
}

export function workflowSummaryFromMetadata(metadata: WorkflowSessionMetadata): WorkflowSessionSummary {
  const activeIndex = typeof metadata.activePhaseIndex === 'number'
    ? metadata.activePhaseIndex
    : -1
  const phaseCount = typeof metadata.phaseCount === 'number'
    ? metadata.phaseCount
    : 0

  const pendingConfirmation = Boolean(metadata.pendingConfirmation)
  const summary: WorkflowSessionSummary = {
    mode: 'workflow',
    templateId: metadata.templateId,
    templateVersion: String(metadata.templateVersion),
    templateSource: metadata.templateSource,
    templateSnapshotId: metadata.templateSnapshotId,
    status: (metadata.status ?? metadata.workflowStatus) as WorkflowLifecycleStatus,
    ...(typeof metadata.runStatus === 'string' ? { runStatus: metadata.runStatus as WorkflowSessionSummary['runStatus'] } : {}),
    activePhaseId: metadata.activePhaseId,
    activePhaseIndex: activeIndex,
    phaseCount,
    ...(Array.isArray(metadata.phaseNames) ? { phaseNames: metadata.phaseNames.filter((name): name is string => typeof name === 'string') } : {}),
    pendingConfirmation,
    ...(Array.isArray(metadata.labels) ? { labels: metadata.labels as WorkflowSessionSummary['labels'] } : {}),
    ...(Array.isArray(metadata.secondaryLabels) ? { secondaryLabels: metadata.secondaryLabels as WorkflowSessionSummary['secondaryLabels'] } : {}),
    ...(typeof metadata.effort === 'string' ? { effort: metadata.effort as WorkflowSessionSummary['effort'] } : {}),
    ...(typeof metadata.routingMode === 'string' ? { routingMode: metadata.routingMode as WorkflowSessionSummary['routingMode'] } : {}),
    ...(typeof metadata.brainstormingMode === 'string' ? { brainstormingMode: metadata.brainstormingMode as WorkflowSessionSummary['brainstormingMode'] } : {}),
    ...(metadata.router && typeof metadata.router === 'object' ? { router: metadata.router as WorkflowSessionSummary['router'] } : {}),
    ...(typeof metadata.activeWorkflowRunId === 'string' ? { activeWorkflowRunId: metadata.activeWorkflowRunId } : {}),
    ...(typeof metadata.lastCompletedWorkflowRunId === 'string' ? { lastCompletedWorkflowRunId: metadata.lastCompletedWorkflowRunId } : {}),
    ...(publicWorkflowRunSummaries(metadata.workflowRuns).length
      ? { workflowRuns: publicWorkflowRunSummaries(metadata.workflowRuns) }
      : {}),
    ...(publicWorkflowRunSummaries(metadata.workflowRuns).length && typeof metadata.activeWorkflowRunId === 'string'
      ? { activeWorkflowRun: publicWorkflowRunSummaries(metadata.workflowRuns).find((run) => run.id === metadata.activeWorkflowRunId) }
      : {}),
    ...(publicArtifactSummaries(metadata.artifactList).length ? { artifactList: publicArtifactSummaries(metadata.artifactList) } : {}),
    ...(isWorkflowPreviewState(metadata.preview) ? { preview: metadata.preview } : {}),
    ...(Array.isArray(metadata.skillBindingStatus) ? { skillBindingStatus: metadata.skillBindingStatus as WorkflowSessionSummary['skillBindingStatus'] } : {}),
    ...(metadata.transitionAuthority === 'auto' ||
      metadata.transitionAuthority === 'user-confirmation' ||
      metadata.transitionAuthority === 'artifact-gate' ||
      metadata.transitionAuthority === 'user-choice'
      ? { transitionAuthority: metadata.transitionAuthority }
      : {}),
    ...(isWorkflowModelResolution(metadata.model) ? { model: metadata.model } : {}),
    ...(isWorkflowRecommendedSkillStatusSummary(metadata.recommendedSkillStatus)
      ? { recommendedSkillStatus: metadata.recommendedSkillStatus }
      : {}),
    ...(!pendingConfirmation && typeof metadata.blockedReason === 'string' ? { blockedReason: metadata.blockedReason } : {}),
    statePointer: metadata.statePointer,
    ...(metadata.reportPointer ? { reportPointer: metadata.reportPointer } : {}),
  } as WorkflowSessionSummary

  return typeof metadata.sourceTemplateStatus === 'string'
    ? { ...summary, sourceTemplateStatus: metadata.sourceTemplateStatus }
    : summary
}

function activePhaseTransitionAuthority(
  state: WorkflowSessionState,
): 'auto' | 'user-confirmation' | 'artifact-gate' | 'user-choice' | undefined {
  if (!state.activePhaseId) return undefined
  const phase = state.phases.find((candidate) => candidate.id === state.activePhaseId)
  return phase?.transitionAuthority
}

function workflowRunSummaries(state: WorkflowSessionState): NonNullable<WorkflowSessionSummary['workflowRuns']> {
  if (!Array.isArray(state.workflowRuns)) return []
  return state.workflowRuns.map((run) => ({
    id: run.id,
    templateId: run.templateId,
    status: run.status,
    ...(run.primaryLabel ? { primaryLabel: run.primaryLabel } : {}),
    ...(run.secondaryLabels ? { secondaryLabels: run.secondaryLabels } : {}),
    ...(run.effort ? { effort: run.effort } : {}),
    ...(run.currentPhaseId ? { currentPhaseId: run.currentPhaseId } : {}),
    ...(run.inheritedFromRunId ? { inheritedFromRunId: run.inheritedFromRunId } : {}),
    artifacts: publicArtifactSummaries(run.artifacts),
    historyCount: run.history.length,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }))
}

function activeWorkflowRunSummary(state: WorkflowSessionState): WorkflowSessionSummary['activeWorkflowRun'] {
  const runs = workflowRunSummaries(state)
  if (!runs.length) return undefined
  if (state.activeWorkflowRunId) return runs.find((run) => run.id === state.activeWorkflowRunId)
  return runs.find((run) => run.status === 'active') ?? runs[0]
}

function workflowArtifactList(state: WorkflowSessionState): NonNullable<WorkflowSessionSummary['artifactList']> {
  if (!Array.isArray(state.workflowRuns)) return []
  const byId = new Map<string, NonNullable<WorkflowSessionSummary['artifactList']>[number]>()
  for (const run of state.workflowRuns) {
    for (const artifact of run.artifacts) {
      byId.set(`${run.id}:${artifact.id}`, artifact)
    }
  }
  return publicArtifactSummaries([...byId.values()])
}

function publicWorkflowRunSummaries(value: unknown): WorkflowRunSummary[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((run): run is Record<string, unknown> => Boolean(run) && typeof run === 'object' && !Array.isArray(run))
    .map((run) => ({
      id: typeof run.id === 'string' ? run.id : '',
      templateId: typeof run.templateId === 'string' ? run.templateId : '',
      status: typeof run.status === 'string' ? run.status as WorkflowRunSummary['status'] : 'draft',
      ...(typeof run.primaryLabel === 'string' ? { primaryLabel: run.primaryLabel as WorkflowRunSummary['primaryLabel'] } : {}),
      ...(Array.isArray(run.secondaryLabels) ? { secondaryLabels: run.secondaryLabels as WorkflowRunSummary['secondaryLabels'] } : {}),
      ...(typeof run.effort === 'string' ? { effort: run.effort as WorkflowRunSummary['effort'] } : {}),
      ...(typeof run.currentPhaseId === 'string' ? { currentPhaseId: run.currentPhaseId } : {}),
      ...(typeof run.inheritedFromRunId === 'string' ? { inheritedFromRunId: run.inheritedFromRunId } : {}),
      artifacts: publicArtifactSummaries(run.artifacts),
      historyCount: typeof run.historyCount === 'number' ? run.historyCount : 0,
      createdAt: typeof run.createdAt === 'string' ? run.createdAt : '',
      updatedAt: typeof run.updatedAt === 'string' ? run.updatedAt : '',
    }))
    .filter((run) => run.id && run.templateId)
}

function publicArtifactSummaries(value: unknown): WorkflowArtifactSummary[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((artifact): artifact is WorkflowArtifact => Boolean(artifact) && typeof artifact === 'object' && !Array.isArray(artifact))
    .map((artifact) => {
      const {
        content: _content,
        ...summary
      } = artifact
      return summary
    })
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

function isWorkflowPreviewState(value: unknown): value is WorkflowSessionSummary['preview'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    (record.status === 'idle' ||
      record.status === 'starting' ||
      record.status === 'running' ||
      record.status === 'failed' ||
      record.status === 'stopping' ||
      record.status === 'stopped') &&
    typeof record.updatedAt === 'string'
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
