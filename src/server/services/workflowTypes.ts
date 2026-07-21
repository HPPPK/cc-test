export const WORKFLOW_LIFECYCLE_STATUSES = [
  'created',
  'running',
  'pending-confirmation',
  'failed',
  'cancelled',
  'completed',
  'resumed',
  'stale-template',
  'missing-template',
] as const

export const WORKFLOW_PHASE_STATUSES = [
  'created',
  'running',
  'pending-confirmation',
  'failed',
  'cancelled',
  'completed',
  'resumed',
] as const

export const WORKFLOW_TEMPLATE_SOURCE_STATUSES = ['current', 'stale-template', 'missing-template'] as const

export const WORKFLOW_ARTIFACT_POINTER_KINDS = ['workflow-state', 'phase-artifact', 'final-report'] as const

export const WORKFLOW_COMPLETION_SUBMISSION_STATUSES = ['ready', 'needs_user', 'completed', 'blocked', 'unable'] as const

export const WORKFLOW_ARTIFACT_LIFECYCLE_STATUSES = ['pending', 'accepted', 'rejected', 'superseded'] as const

export const WORKFLOW_LABELS = [
  'new-product',
  'enhancement',
  'bug',
  'documentation',
  'refactor',
  'test',
  'question',
  'duplicate',
  'invalid',
  'wontfix',
  'help-wanted',
  'good-first-issue',
  'ux-copy',
  'error-handling',
] as const

export const WORKFLOW_EFFORT_MODES = ['auto', 'light', 'standard', 'heavy'] as const

export const WORKFLOW_BRAINSTORMING_MODES = ['auto', 'on', 'off'] as const

export const WORKFLOW_RUN_STATUSES = [
  'draft',
  'active',
  'waiting_for_user',
  'paused',
  'completed',
  'cancelled',
  'stopped',
  'blocked',
] as const

export const WORKFLOW_PREVIEW_STATUSES = [
  'idle',
  'starting',
  'running',
  'failed',
  'stopping',
  'stopped',
] as const

export const WORKFLOW_SKILL_BINDING_MODES = [
  'native-if-installed',
  'fallback-contract',
  'native-if-installed-else-fallback-contract',
  'disabled',
] as const

export const WORKFLOW_SKILL_BINDING_AVAILABILITIES = [
  'native',
  'fallback',
  'disabled',
] as const

export const WORKFLOW_PHASE_SKILL_MODES = ['recommended'] as const

export const WORKFLOW_PHASE_SKILL_SOURCES = [
  'workflow',
  'fallback',
  'superpowers',
  'spec-kit-plus',
  'codex',
  'claude-code',
  'user',
  'project',
  'plugin',
  'managed',
  'bundled',
  'mcp',
  'unknown',
] as const

export const WORKFLOW_PHASE_SKILL_RESOLUTION_STATUSES = [
  'available',
  'fallback-contract',
  'missing',
  'ambiguous',
  'unsupported-source',
  'plugin-disabled',
  'invalid-reference',
  'installable',
] as const

export type WorkflowTemplateSource = 'builtin' | 'user' | 'pack'
export type WorkflowMode = 'workflow'
export type DialogueMode = 'dialogue'
export type WorkflowLifecycleStatus = (typeof WORKFLOW_LIFECYCLE_STATUSES)[number]
export type WorkflowPhaseStatus = (typeof WORKFLOW_PHASE_STATUSES)[number]
export type WorkflowTemplateSourceStatus = (typeof WORKFLOW_TEMPLATE_SOURCE_STATUSES)[number]
export type WorkflowArtifactPointerKind = (typeof WORKFLOW_ARTIFACT_POINTER_KINDS)[number]
export type WorkflowCompletionSubmissionStatus = (typeof WORKFLOW_COMPLETION_SUBMISSION_STATUSES)[number]
export type WorkflowArtifactLifecycleStatus = (typeof WORKFLOW_ARTIFACT_LIFECYCLE_STATUSES)[number]
export type WorkflowLabel = (typeof WORKFLOW_LABELS)[number]
export type EffortMode = (typeof WORKFLOW_EFFORT_MODES)[number]
export type WorkflowBrainstormingMode = (typeof WORKFLOW_BRAINSTORMING_MODES)[number]
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number]
export type WorkflowPreviewStatus = (typeof WORKFLOW_PREVIEW_STATUSES)[number]
export type WorkflowRoutingMode = 'manual' | 'auto-confirm' | 'auto'
export type WorkflowSkillBindingMode = (typeof WORKFLOW_SKILL_BINDING_MODES)[number]
export type WorkflowSkillBindingAvailability = (typeof WORKFLOW_SKILL_BINDING_AVAILABILITIES)[number]
export type WorkflowPhaseSkillMode = (typeof WORKFLOW_PHASE_SKILL_MODES)[number]
export type WorkflowPhaseSkillSource = (typeof WORKFLOW_PHASE_SKILL_SOURCES)[number]
export type WorkflowPhaseSkillResolutionStatus = (typeof WORKFLOW_PHASE_SKILL_RESOLUTION_STATUSES)[number]
export type WorkflowTemplateVersion = string | number
export type WorkflowModelSelector = string

export type JsonObject = Record<string, unknown>

export type WorkflowTaskRouterInput = {
  request: string
  selectedFiles?: string[]
  repoMetadata?: JsonObject
  errors?: string
  logs?: string
  testOutput?: string
  forcedLabel?: WorkflowLabel
}

export type WorkflowTaskRouterResult = {
  primaryLabel: WorkflowLabel
  secondaryLabels: WorkflowLabel[]
  effort: EffortMode
  confidence: number
  rationale: string
  suggestedPath: string[]
  terminalReason?: string
}

export type WorkflowSkillBinding = {
  id: string
  mode?: WorkflowSkillBindingMode
}

export type WorkflowSkillBindingResolution = {
  id: string
  mode: WorkflowSkillBindingMode
  availability: WorkflowSkillBindingAvailability
  fallbackContract?: string
}

export type WorkflowPhaseSkipPolicy = {
  labels?: WorkflowLabel[]
  efforts?: EffortMode[]
}

export type WorkflowPhaseModePolicy = {
  light?: string
  standard?: string
  heavy?: string
}

export type DialogueSessionWorkflowProjection = {
  workflow?: never
}

export type WorkflowArtifactPointer = {
  kind: WorkflowArtifactPointerKind
  sessionId: string
  artifactId: string
  schemaVersion: number
  createdAt: string
  updatedAt?: string
  label?: string
}

export type WorkflowArtifactRef = WorkflowArtifactPointer & {
  kind:
    | WorkflowArtifactPointerKind
    | 'phase-output'
    | 'completion-evidence'
    | 'template-snapshot'
    | 'final-report'
    | (string & {})
  contentType?: string
  revision?: number
  phaseId?: string
  title?: string
  summary?: string
  checksum?: string
}

export type WorkflowModelResolution = {
  requestedModel: WorkflowModelSelector | null
  actualModel: WorkflowModelSelector | null
  providerId: string | null
  source: 'phase-request' | 'main-session-default' | 'none'
  fallbackApplied: boolean
  fallbackReason: string | null
  resolvedAt: string
}

export type WorkflowSkillDeclaration = {
  id?: string
  name?: string
  source: 'template'
  guidance: string
  provenance?: {
    templateId: string
    templateVersion: WorkflowTemplateVersion
    phaseId: string
    sourcePath?: string
  }
  optional?: boolean
  [key: string]: unknown
}

export type WorkflowSkillProvenance = WorkflowSkillDeclaration

export type WorkflowPhaseSkillReference = {
  name: string
  mode?: WorkflowPhaseSkillMode
  source?: WorkflowPhaseSkillSource
  pluginName?: string
  namespace?: string
  version?: string
  contentHash?: string
  referenceId?: string
  reason?: string
  [key: string]: unknown
}

export type WorkflowPhaseSkillResolvedSkill = {
  name: string
  displayName?: string
  source: WorkflowPhaseSkillSource
  pluginName?: string
}

export type WorkflowPhaseSkillCandidate = {
  name: string
  displayName?: string
  source: WorkflowPhaseSkillSource
  pluginName?: string
  namespace?: string
  referenceId?: string
  packId?: string
}

export type WorkflowPhaseSkillDiagnostic = {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

export type WorkflowPhaseSkillProvenance = {
  sourcePath?: string
  version?: string
  contentHash?: string
  namespace?: string
  referenceId?: string
  packId?: string
}

export type WorkflowPhaseSkillResolution = {
  reference: WorkflowPhaseSkillReference
  status: WorkflowPhaseSkillResolutionStatus
  checkedAt: string
  resolvedSkill?: WorkflowPhaseSkillResolvedSkill
  candidates?: WorkflowPhaseSkillCandidate[]
  diagnostic?: WorkflowPhaseSkillDiagnostic
  provenance?: WorkflowPhaseSkillProvenance
}

export type WorkflowPhaseSkillSnapshot = {
  phaseId: string
  references: WorkflowPhaseSkillReference[]
  resolutions: WorkflowPhaseSkillResolution[]
  snapshottedAt: string
  templateContentHash?: string
  resolverVersion?: string
}

export type WorkflowPhaseSkillEvidence = {
  phaseId: string
  name: string
  outcome: 'used' | 'relevant-skipped' | 'relevant-unavailable'
  rationale: string
  recordedAt: string
  source?: WorkflowPhaseSkillSource
  resolutionStatus?: WorkflowPhaseSkillResolutionStatus
  toolUseId?: string
  artifactRef?: string
}

export type WorkflowImportDependencyDiagnostic = {
  templateId: string
  phaseId: string
  reference: WorkflowPhaseSkillReference
  status: WorkflowPhaseSkillResolutionStatus
  severity: 'info' | 'warning' | 'error'
  message: string
  canImport: boolean
}

export type WorkflowRequiredArtifact = {
  id: string
  kind: 'markdown' | 'json' | 'file-ref' | (string & {})
  description: string
  required: boolean
  [key: string]: unknown
}

export type WorkflowPhaseActionPolicy = {
  allowedActions: string[]
  forbiddenActions: string[]
}

export type WorkflowPhaseToolPolicy = {
  allowedTools: string[]
  disallowedTools?: string[]
  forbidden?: string[]
  requiresExplicitUserConfirmation?: string[]
  maxRepairLoops?: number
  repairLoopAllowedTo?: string
  [key: string]: unknown
}

export type WorkflowPhaseRuntimeContract = {
  allowedActions?: string[]
  forbiddenActions?: string[]
  allowedTools?: string[]
  disallowedTools?: string[]
  mustProduce?: string[]
  questionPolicy?: JsonObject
  explorationPolicy?: JsonObject
  toolAccess?: {
    allowed?: string[]
    forbidden?: string[]
    requiresExplicitUserConfirmation?: string[]
    maxRepairLoops?: number
    repairLoopAllowedTo?: string
  }
  completionRequires?: string[]
}

export type WorkflowPhaseOutputArtifact = {
  id: string
  filename?: string
  kind: string
  required?: boolean
  requiredWhen?: WorkflowLabel[]
  description?: string
}

export type WorkflowPhaseConstraintStrength = 'guidance' | 'policy' | 'evidence' | 'gate'

export type WorkflowPhaseIntentContract = {
  objective: string
  role: string
  intake: string[]
  strength?: WorkflowPhaseConstraintStrength
  [key: string]: unknown
}

export type WorkflowPhaseExecutionContract = {
  instructions: string
  executionRules: string[]
  actionPolicy?: WorkflowPhaseActionPolicy & {
    strength?: WorkflowPhaseConstraintStrength
    [key: string]: unknown
  }
  toolPolicy?: WorkflowPhaseToolPolicy
  transitionAuthority: 'auto' | 'user-confirmation' | 'artifact-gate' | 'user-choice'
  [key: string]: unknown
}

export type WorkflowPhaseEvidencePolicy = {
  outputArtifact: WorkflowRequiredArtifact & {
    name: string
    description: string
    strength?: WorkflowPhaseConstraintStrength
    [key: string]: unknown
  }
  requiredArtifacts: WorkflowRequiredArtifact[]
  completionCriteria: JsonObject & {
    type: 'manual-checklist' | 'artifact-required' | 'agent-reported'
    description: string
    strength?: WorkflowPhaseConstraintStrength
  }
  handoffRules: string[]
  [key: string]: unknown
}

export type WorkflowPhaseRuntimeState = {
  status?: WorkflowPhaseStatus
  pendingConfirmation?: boolean
  [key: string]: unknown
}

export type WorkflowPhasePrompt = {
  objective: string
  handoffInput: string[]
  executionRules: string[]
  outputArtifact: {
    name: string
    sections: string[]
  }
  completionRules: string[]
}

export type WorkflowPhaseDefinition = {
  id: string
  label: string
  instructions: string
  appliesTo?: WorkflowLabel[]
  skipWhen?: WorkflowPhaseSkipPolicy
  modePolicy?: WorkflowPhaseModePolicy
  requestedModel?: WorkflowModelSelector | null
  skills?: WorkflowPhaseSkillReference[]
  skillBindings?: Array<string | WorkflowSkillBinding>
  skillDeclarations: WorkflowSkillDeclaration[]
  requiredArtifacts: WorkflowRequiredArtifact[]
  completionCriteria: string[] | JsonObject
  transitionAuthority: 'auto' | 'user-confirmation' | 'artifact-gate' | 'user-choice'
  intent?: WorkflowPhaseIntentContract
  contract?: WorkflowPhaseExecutionContract
  evidencePolicy?: WorkflowPhaseEvidencePolicy
  runtimeState?: WorkflowPhaseRuntimeState
  actionPolicy?: WorkflowPhaseActionPolicy
  toolPolicy?: WorkflowPhaseToolPolicy
  runtimeContract?: WorkflowPhaseRuntimeContract
  outputArtifacts?: WorkflowPhaseOutputArtifact[]
  phasePrompt?: WorkflowPhasePrompt
  [key: string]: unknown
}

export type WorkflowTemplate = {
  schemaVersion: number
  id: string
  source: WorkflowTemplateSource
  version: WorkflowTemplateVersion
  displayName: string
  description: string
  labels?: WorkflowLabel[]
  routingPolicy?: JsonObject
  stopConditions?: string[]
  phases: WorkflowPhaseDefinition[]
  registryKey?: string
  sourcePath?: string
  contentHash?: string
  [key: string]: unknown
}

export type WorkflowTemplateRegistryDocument = {
  schemaVersion: number
  templates: WorkflowTemplate[]
  [key: string]: unknown
}

export type WorkflowSessionCreateOptions = {
  templateId: string
  templateSource?: WorkflowTemplateSource
  initialPhaseId?: string
  request?: string
  selectedFiles?: string[]
  repoMetadata?: JsonObject
  errors?: string
  logs?: string
  testOutput?: string
  labels?: WorkflowLabel[]
  effort?: EffortMode
  routingMode?: WorkflowRoutingMode
  brainstormingMode?: WorkflowBrainstormingMode
}

export type WorkflowSessionSummary = {
  mode: WorkflowMode
  templateId: string
  templateVersion: string
  templateSource: WorkflowTemplateSource
  templateSnapshotId: string
  status: WorkflowLifecycleStatus
  activePhaseId: string | null
  activePhaseIndex: number
  phaseCount: number
  /** Optimistic-concurrency version required for workflow transition commands. */
  stateVersion?: number
  pendingConfirmation: boolean
  pendingRoute?: WorkflowPendingRoute | null
  pendingTargetPhaseId?: string | null
  pendingTargetPhaseIndex?: number
  pendingTargetPhaseLabel?: string
  routeReason?: string
  requiresConfirmation?: boolean
  runStatus?: WorkflowRunStatus
  labels?: WorkflowLabel[]
  secondaryLabels?: WorkflowLabel[]
  effort?: EffortMode
  routingMode?: WorkflowRoutingMode
  brainstormingMode?: WorkflowBrainstormingMode
  router?: WorkflowTaskRouterResult
  activeWorkflowRunId?: string
  lastCompletedWorkflowRunId?: string
  activeWorkflowRun?: WorkflowRunSummary
  workflowRuns?: WorkflowRunSummary[]
  artifactList?: WorkflowArtifactSummary[]
  preview?: WorkflowPreviewState
  skillBindingStatus?: WorkflowSkillBindingResolution[]
  phaseNames?: string[]
  blockedReason?: string
  model?: WorkflowModelResolution
  statePointer: WorkflowArtifactPointer
  reportPointer?: WorkflowArtifactPointer
  transitionAuthority?: 'auto' | 'user-confirmation' | 'artifact-gate' | 'user-choice'
}

export type WorkflowSessionMetadata = {
  mode: WorkflowMode
  schemaVersion: number
  templateId: string
  templateSource: WorkflowTemplateSource
  templateVersion: WorkflowTemplateVersion
  templateSnapshotRef?: WorkflowArtifactPointer
  templateSnapshotId: string
  workflowStatus: WorkflowLifecycleStatus
  status?: WorkflowLifecycleStatus
  runStatus?: WorkflowRunStatus
  activePhaseId: string | null
  stateRef?: WorkflowArtifactPointer
  statePointer: WorkflowArtifactPointer
  reportRef?: WorkflowArtifactPointer | null
  reportPointer?: WorkflowArtifactPointer
  sourceTemplateStatus?: WorkflowTemplateSourceStatus
  stateRevision?: number
  lastTransitionId?: string | null
  lastError?: string
  updatedAt: string
  labels?: WorkflowLabel[]
  secondaryLabels?: WorkflowLabel[]
  effort?: EffortMode
  routingMode?: WorkflowRoutingMode
  brainstormingMode?: WorkflowBrainstormingMode
  router?: WorkflowTaskRouterResult
  activeWorkflowRunId?: string
  lastCompletedWorkflowRunId?: string
  workflowRuns?: WorkflowRunSummary[]
  artifactList?: WorkflowArtifactSummary[]
  preview?: WorkflowPreviewState
  skillBindingStatus?: WorkflowSkillBindingResolution[]
  phaseNames?: string[]
  pendingRoute?: WorkflowPendingRoute | null
  pendingTargetPhaseId?: string | null
  pendingTargetPhaseIndex?: number
  pendingTargetPhaseLabel?: string
  routeReason?: string
  requiresConfirmation?: boolean
  [key: string]: unknown
}

export type WorkflowCompletionResult = {
  phaseId: string
  passed: boolean
  checkedAt: string
  criteriaType: 'manual-checklist' | 'artifact-required' | 'agent-reported'
  artifactPointers: WorkflowArtifactPointer[]
  blockedReason?: string
}

export type WorkflowCompletionCheckResult = {
  checkId: string
  phaseId: string
  status: 'passed' | 'failed'
  criteriaRef: string
  summary: string
  blockedReason: string | null
  artifactRefs: WorkflowArtifactPointer[]
  evaluatedAt: string
  evaluator?: 'system' | 'agent' | 'user'
  rawEvidenceRef?: WorkflowArtifactPointer
}

export type CompletionSubmission = {
  phaseId: string
  stateVersion: number
  status: WorkflowCompletionSubmissionStatus
  handoff: JsonObject
  rationale: string
  evidence: Array<JsonObject>
}

export type WorkflowPendingConfirmation = {
  confirmationId: string
  phaseId: string
  fromPhaseId: string
  toPhaseId: string | null
  completionCheckId: string
  artifactRefs: WorkflowArtifactPointer[]
  createdAt: string
  status: WorkflowArtifactLifecycleStatus | 'approved'
  submission?: CompletionSubmission
}

export const WORKFLOW_ROUTE_INTENTS = [
  'advance',
  'rework_current_phase',
  'jump_to_phase',
  'pause',
  'resume',
  'finish',
] as const

export type WorkflowRouteIntent = (typeof WORKFLOW_ROUTE_INTENTS)[number]

export type WorkflowRouteRequest = {
  phaseId?: string
  stateVersion?: number
  intent: WorkflowRouteIntent
  targetPhaseId?: string
  rationale: string
  evidence: Array<JsonObject>
  requireUserConfirmation?: boolean
}

export type WorkflowPendingRoute = {
  routeId: string
  phaseId: string
  fromPhaseId: string
  targetPhaseId: string | null
  intent: WorkflowRouteIntent
  rationale: string
  evidence: Array<JsonObject>
  createdAt: string
  requiresConfirmation: boolean
  approvedTargetPhaseId: string | null
  status: 'pending' | 'approved' | 'rejected'
  origin?: 'blocked-recovery'
}

export type WorkflowPhaseRun = {
  phaseId: string
  index: number
  status: Exclude<WorkflowPhaseStatus, 'resumed'>
  startedAt: string | null
  completedAt: string | null
  instructionsProvenance: {
    templateId: string
    templateVersion: WorkflowTemplateVersion
    phaseId: string
  }
  inputArtifactRefs: WorkflowArtifactPointer[]
  outputArtifactRefs: WorkflowArtifactPointer[]
  completionChecks: WorkflowCompletionCheckResult[]
  modelResolution: WorkflowModelResolution | null
  skillProvenance: WorkflowSkillDeclaration[]
  blockedReason: string | JsonObject | null
  attempt?: number
  lastUserMessageId?: string
  lastAssistantMessageId?: string
}

export type WorkflowPhaseState = {
  id: string
  label?: string
  transitionAuthority?: 'auto' | 'user-confirmation' | 'artifact-gate' | 'user-choice'
  index: number
  status: WorkflowPhaseStatus
  startedAt?: string
  completedAt?: string
  requestedModel?: WorkflowModelSelector
  actualModel?: WorkflowModelSelector
  fallbackReason?: string
  skillProvenance?: WorkflowSkillProvenance[]
  artifactPointers: WorkflowArtifactPointer[]
  completion?: WorkflowCompletionResult
  blockedReason?: string
}

export type WorkflowTransitionAuthority =
  | 'auto'
  | 'system'
  | 'completion-check'
  | 'user-confirmation'
  | 'artifact-gate'
  | 'user-choice'
  | 'resume'
  | 'cancel'
  | 'stop'
  | 'recovery'

export type WorkflowNextPhaseContextStrategy = 'inherit' | 'clear'

export type WorkflowTransitionRecord = {
  transitionId: string
  fromStatus?: WorkflowLifecycleStatus | WorkflowPhaseStatus
  toStatus?: WorkflowLifecycleStatus | WorkflowPhaseStatus
  fromPhaseId: string | null
  toPhaseId: string | null
  authority: WorkflowTransitionAuthority
  decision?:
    | 'started'
    | 'advanced'
    | 'blocked'
    | 'approved'
    | 'rejected'
    | 'failed'
    | 'cancelled'
    | 'completed'
    | 'resumed'
    | 'paused'
    | 'stopped'
    | 'stale-template'
    | 'missing-template'
  action?: 'auto-advance' | 'confirmation-requested' | 'route-requested' | 'route-confirmed' | 'confirmed' | 'rejected' | 'retry' | 'paused' | 'resumed' | 'stopped' | 'cancelled'
  result?: 'accepted' | 'rejected' | 'superseded' | 'blocked' | 'unable' | 'noop'
  completionCheckId: string | null
  artifactRefs?: WorkflowArtifactPointer[]
  createdAt: string
  stateVersion?: number
  requestId?: string
  previousRevision?: number
  nextRevision?: number
  nextPhaseContextStrategy?: WorkflowNextPhaseContextStrategy
}

export type WorkflowSessionState = {
  schemaVersion: number
  sessionId: string
  mode: WorkflowMode
  template: {
    id: string
    version: string
    source: WorkflowTemplateSource
    snapshotId: string
    sourceState: WorkflowTemplateSourceStatus
  } | WorkflowTemplate
  /** @deprecated Legacy persisted sessions only; runtime always reloads the current fixed ZIP pack. */
  templateSnapshot?: WorkflowTemplate
  templateIdentity: {
    id: string
    source: WorkflowTemplateSource
    version: WorkflowTemplateVersion
    registryKey?: string
    contentHash?: string
  }
  sourceTemplateStatus: WorkflowTemplateSourceStatus
  status: WorkflowLifecycleStatus
  workflowStatus: WorkflowLifecycleStatus
  runStatus?: WorkflowRunStatus
  activePhaseId: string | null
  labels?: WorkflowLabel[]
  secondaryLabels?: WorkflowLabel[]
  effort?: EffortMode
  routingMode?: WorkflowRoutingMode
  brainstormingMode?: WorkflowBrainstormingMode
  router?: WorkflowTaskRouterResult
  workspaceRoot?: string
  activeWorkflowRunId?: string
  lastCompletedWorkflowRunId?: string
  workflowRuns?: WorkflowRun[]
  skillBindingStatus?: WorkflowSkillBindingResolution[]
  skippedPhases?: Array<{
    phaseId: string
    reason: string
  }>
  phases: WorkflowPhaseState[]
  phaseRuns: WorkflowPhaseRun[]
  transitionHistory: WorkflowTransitionRecord[]
  artifactIndex: WorkflowArtifactPointer[] | Record<string, WorkflowArtifactPointer>
  finalReportRef: WorkflowArtifactPointer | null
  finalReportPointer?: WorkflowArtifactPointer
  stateVersion: number
  revision: number
  createdAt: string
  updatedAt: string
  lastResumeAt?: string
  lastRecoveryStatus?: 'ok' | 'state-missing' | 'state-corrupt' | 'report-missing' | 'metadata-only'
  pendingConfirmation?: WorkflowPendingConfirmation | null
  pendingRoute?: WorkflowPendingRoute | null
  workflowLanguage?: 'zh' | 'en'
  nextPhaseContextStrategy?: WorkflowNextPhaseContextStrategy
  blockedReason?: string | JsonObject
  unknown?: JsonObject
  [key: string]: unknown
}

export type WorkflowArtifact = {
  id: string
  filename?: string
  kind: string
  required?: boolean
  phaseId?: string
  createdAt: string
  updatedAt: string
  content?: string
  inheritedFromRunId?: string
  description?: string
  [key: string]: unknown
}

export type WorkflowArtifactSummary = Omit<WorkflowArtifact, 'content'>

export type WorkflowPreviewState = {
  status: WorkflowPreviewStatus
  command?: string
  cwd?: string
  pid?: number
  processOwner?: 'workflow'
  logPath?: string
  logs?: string[]
  detectedUrl?: string
  detectedPort?: number
  dbStatus?: 'unknown' | 'not-required' | 'pending-confirmation' | 'initialized' | 'skipped' | 'failed'
  startedAt?: string
  stoppedAt?: string
  updatedAt: string
  error?: string
}

export type WorkflowRunEvent = {
  type: string
  at: string
  summary: string
  phaseId?: string
  [key: string]: unknown
}

export type WorkflowRun = {
  id: string
  templateId: string
  status: WorkflowRunStatus
  primaryLabel?: WorkflowLabel
  secondaryLabels?: WorkflowLabel[]
  effort?: EffortMode
  workspaceRoot?: string
  currentPhaseId?: string
  inheritedFromRunId?: string
  artifacts: WorkflowArtifact[]
  history: WorkflowRunEvent[]
  createdAt: string
  updatedAt: string
}

export type WorkflowRunSummary = Pick<
  WorkflowRun,
  | 'id'
  | 'templateId'
  | 'status'
  | 'primaryLabel'
  | 'secondaryLabels'
  | 'effort'
  | 'currentPhaseId'
  | 'inheritedFromRunId'
  | 'createdAt'
  | 'updatedAt'
> & {
  artifacts: WorkflowArtifactSummary[]
  historyCount: number
}

export type WorkflowVerificationResult = {
  passed: boolean
  notes?: string
  evidencePointers?: WorkflowArtifactPointer[]
}

export type WorkflowPhaseReportSummary = {
  phaseId: string
  label: string
  status: 'completed' | 'failed' | 'cancelled'
  artifactRefs: WorkflowArtifactPointer[]
  completion: WorkflowCompletionResult
  model?: WorkflowModelResolution
}

export type WorkflowFinalReport = {
  schemaVersion: number
  reportId: string
  sessionId: string
  templateId: string
  templateVersion: WorkflowTemplateVersion
  createdAt: string
  phaseSummaries: WorkflowPhaseReportSummary[]
  verificationResult: WorkflowVerificationResult
  conversationSummary: string
  artifactRefs: WorkflowArtifactPointer[]
  modelResolutions?: WorkflowModelResolution[]
  skillProvenance?: WorkflowSkillProvenance[]
  transitionHistoryRef?: WorkflowArtifactPointer
  template?: {
    id: string
    version: string
    source: WorkflowTemplateSource
    snapshotId: string
  }
  status?: 'completed'
  summary?: string
  phases?: Array<{
    id: string
    name: string
    status: 'completed' | 'failed' | 'cancelled'
    artifactPointers: WorkflowArtifactPointer[]
    completion: WorkflowCompletionResult
    model?: WorkflowModelResolution
  }>
  verification?: WorkflowVerificationResult
}

export type WorkflowPhaseArtifact = {
  schemaVersion: number
  sessionId: string
  phaseId: string
  artifactId: string
  lifecycleStatus?: WorkflowArtifactLifecycleStatus
  type: 'text-summary' | 'structured-output' | 'completion-check' | 'attachment-pointer'
  createdAt: string
  title: string
  content: unknown
  provenance: {
    messageId?: string
    model?: WorkflowModelResolution
    skillGuidance?: WorkflowSkillProvenance[]
  }
}

export type WorkflowTransitionRequest = {
  phaseId: string
  action: 'confirm' | 'reject' | 'retry' | 'manual_complete' | 'pause' | 'resume' | 'stop' | 'cancelled' | 'route'
  transitionId?: string
  expectedStateVersion?: number
  stateVersion?: number
  nextPhaseContextStrategy?: WorkflowNextPhaseContextStrategy
  routeIntent?: WorkflowRouteIntent
  targetPhaseId?: string
  rationale?: string
  evidence?: Array<JsonObject>
  requireUserConfirmation?: boolean
}

export type WorkflowClientMessage = WorkflowTransitionRequest & {
  type: 'workflow_transition'
}
