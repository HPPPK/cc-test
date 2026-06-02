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

export const WORKFLOW_COMPLETION_SUBMISSION_STATUSES = ['ready', 'blocked', 'unable'] as const

export const WORKFLOW_ARTIFACT_LIFECYCLE_STATUSES = ['pending', 'accepted', 'rejected', 'superseded'] as const

export const WORKFLOW_PHASE_SKILL_MODES = ['recommended'] as const

export const WORKFLOW_PHASE_SKILL_SOURCES = [
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
  'missing',
  'ambiguous',
  'unsupported-source',
  'plugin-disabled',
  'invalid-reference',
  'installable',
] as const

export type WorkflowTemplateSource = 'builtin' | 'user'
export type WorkflowMode = 'workflow'
export type DialogueMode = 'dialogue'
export type WorkflowLifecycleStatus = (typeof WORKFLOW_LIFECYCLE_STATUSES)[number]
export type WorkflowPhaseStatus = (typeof WORKFLOW_PHASE_STATUSES)[number]
export type WorkflowTemplateSourceStatus = (typeof WORKFLOW_TEMPLATE_SOURCE_STATUSES)[number]
export type WorkflowArtifactPointerKind = (typeof WORKFLOW_ARTIFACT_POINTER_KINDS)[number]
export type WorkflowCompletionSubmissionStatus = (typeof WORKFLOW_COMPLETION_SUBMISSION_STATUSES)[number]
export type WorkflowArtifactLifecycleStatus = (typeof WORKFLOW_ARTIFACT_LIFECYCLE_STATUSES)[number]
export type WorkflowPhaseSkillMode = (typeof WORKFLOW_PHASE_SKILL_MODES)[number]
export type WorkflowPhaseSkillSource = (typeof WORKFLOW_PHASE_SKILL_SOURCES)[number]
export type WorkflowPhaseSkillResolutionStatus = (typeof WORKFLOW_PHASE_SKILL_RESOLUTION_STATUSES)[number]
export type WorkflowTemplateVersion = string | number
export type WorkflowModelSelector = string

export type JsonObject = Record<string, unknown>

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
  requestedModel?: WorkflowModelSelector | null
  skills?: WorkflowPhaseSkillReference[]
  skillDeclarations: WorkflowSkillDeclaration[]
  requiredArtifacts: WorkflowRequiredArtifact[]
  completionCriteria: string[] | JsonObject
  transitionAuthority: 'auto' | 'user-confirmation'
  actionPolicy?: WorkflowPhaseActionPolicy
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
  pendingConfirmation: boolean
  blockedReason?: string
  model?: WorkflowModelResolution
  statePointer: WorkflowArtifactPointer
  reportPointer?: WorkflowArtifactPointer
  transitionAuthority?: 'auto' | 'user-confirmation'
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
  | 'resume'
  | 'cancel'
  | 'recovery'

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
    | 'stale-template'
    | 'missing-template'
  action?: 'auto-advance' | 'confirmation-requested' | 'confirmed' | 'rejected' | 'retry'
  result?: 'accepted' | 'rejected' | 'superseded' | 'blocked' | 'unable' | 'noop'
  completionCheckId: string | null
  artifactRefs?: WorkflowArtifactPointer[]
  createdAt: string
  stateVersion?: number
  requestId?: string
  previousRevision?: number
  nextRevision?: number
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
  templateSnapshot: WorkflowTemplate
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
  activePhaseId: string | null
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
  blockedReason?: string | JsonObject
  unknown?: JsonObject
  [key: string]: unknown
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
  action: 'confirm' | 'reject' | 'retry'
  transitionId?: string
  expectedStateVersion?: number
}

export type WorkflowClientMessage = WorkflowTransitionRequest & {
  type: 'workflow_transition'
}
