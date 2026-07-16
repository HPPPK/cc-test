// Source: src/server/services/sessionService.ts

export type SessionMode = 'dialogue' | 'workflow' | 'expert'
export type WorkflowTemplateSource = 'builtin' | 'user' | 'pack'
export type WorkflowLabel =
  | 'new-product'
  | 'enhancement'
  | 'bug'
  | 'documentation'
  | 'refactor'
  | 'test'
  | 'question'
  | 'duplicate'
  | 'invalid'
  | 'wontfix'
  | 'help-wanted'
  | 'good-first-issue'
  | 'ux-copy'
  | 'error-handling'
export type WorkflowEffortMode = 'auto' | 'light' | 'standard' | 'heavy'
export type WorkflowBrainstormingMode = 'auto' | 'on' | 'off'
export type WorkflowRunStatus =
  | 'draft'
  | 'active'
  | 'waiting_for_user'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'stopped'
  | 'blocked'
export type WorkflowPreviewStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'failed'
  | 'stopping'
  | 'stopped'
export type WorkflowRoutingMode = 'manual' | 'auto-confirm' | 'auto'
export type WorkflowTaskRouterResult = {
  primaryLabel: WorkflowLabel
  secondaryLabels: WorkflowLabel[]
  effort: WorkflowEffortMode
  confidence: number
  rationale: string
  suggestedPath: string[]
  terminalReason?: string
}
export type WorkflowSkillBindingAvailability = 'native' | 'fallback' | 'disabled'
export type WorkflowSkillBindingResolution = {
  id: string
  mode: 'native-if-installed' | 'fallback-contract' | 'native-if-installed-else-fallback-contract' | 'disabled'
  availability: WorkflowSkillBindingAvailability
  fallbackContract?: string
}
export type WorkflowTemplateValidationIssueSource = 'user-config' | 'builtin' | 'request' | 'import'
export type WorkflowLifecycleStatus =
  | 'created'
  | 'running'
  | 'pending-confirmation'
  | 'failed'
  | 'cancelled'
  | 'completed'
  | 'resumed'
  | 'stale-template'
  | 'missing-template'
export type WorkflowArtifactPointerKind = 'workflow-state' | 'phase-artifact' | 'final-report' | 'state' | 'report' | 'artifact'
export type WorkflowModelSelector = string
export type WorkflowPhaseSkillMode = 'recommended'
export type WorkflowPhaseSkillSource =
  | 'workflow'
  | 'fallback'
  | 'superpowers'
  | 'spec-kit-plus'
  | 'codex'
  | 'claude-code'
  | 'user'
  | 'project'
  | 'plugin'
  | 'managed'
  | 'bundled'
  | 'mcp'
  | 'unknown'
export type WorkflowPhaseSkillResolutionStatus =
  | 'available'
  | 'fallback-contract'
  | 'missing'
  | 'ambiguous'
  | 'unsupported-source'
  | 'plugin-disabled'
  | 'invalid-reference'
  | 'installable'

export type WorkflowArtifactPointer = {
  id?: string
  kind: WorkflowArtifactPointerKind
  sessionId: string
  artifactId: string
  schemaVersion: number
  createdAt: string
  updatedAt?: string
  label?: string
  uri?: string
}

export type WorkflowModelResolution = {
  requested?: WorkflowModelSelector | null
  actual?: WorkflowModelSelector | null
  requestedModel: WorkflowModelSelector | null
  actualModel: WorkflowModelSelector | null
  providerId: string | null
  source: 'phase-request' | 'main-session-default' | 'none'
  fallbackApplied: boolean
  fallbackReason: string | null
  resolvedAt: string
}

export type WorkflowPhaseArtifactStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'superseded'
  | 'blocked'
  | 'unable'

export type WorkflowPhaseArtifact = {
  artifactId: string
  phaseId: string
  status: WorkflowPhaseArtifactStatus
  label: string
  handoffSummary: string
  evidenceSummary: string
  createdAt: string
  updatedAt?: string
  transitionId?: string
  completionId?: string
  provenance?: string
}

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

export type WorkflowSessionSummary = {
  mode: 'workflow'
  templateId: string
  templateVersion: string
  templateSource: WorkflowTemplateSource
  templateSnapshotId: string
  status: WorkflowLifecycleStatus
  activePhaseId: string | null
  activePhaseIndex: number
  phaseCount: number
  stateVersion?: number
  pendingConfirmation: boolean
  runStatus?: WorkflowRunStatus
  labels?: WorkflowLabel[]
  secondaryLabels?: WorkflowLabel[]
  effort?: WorkflowEffortMode
  routingMode?: WorkflowRoutingMode
  brainstormingMode?: WorkflowBrainstormingMode
  router?: WorkflowTaskRouterResult
  workspaceRoot?: string
  activeWorkflowRunId?: string
  lastCompletedWorkflowRunId?: string
  activeWorkflowRun?: WorkflowRunSummary
  workflowRuns?: WorkflowRunSummary[]
  artifactList?: WorkflowRunArtifact[]
  preview?: WorkflowPreviewState
  skillBindingStatus?: WorkflowSkillBindingResolution[]
  blockedReason?: string
  blockedStatus?: 'blocked' | 'unable'
  blockedEvidence?: Array<Record<string, unknown>>
  blockedArtifact?: WorkflowPhaseArtifact | null
  model?: WorkflowModelResolution
  statePointer: WorkflowArtifactPointer
  reportPointer?: WorkflowArtifactPointer
  phaseNames?: string[]
  transitionAuthority?: 'auto' | 'user-confirmation' | 'artifact-gate' | 'user-choice'
  pendingArtifact?: WorkflowPhaseArtifact | null
  artifactHistory?: WorkflowPhaseArtifact[]
  recommendedSkillStatus?: WorkflowRecommendedSkillStatusSummary
  recommendedSkillEvidence?: WorkflowPhaseSkillEvidence[]
}


export type ExpertSessionStatus = 'active' | 'collecting' | 'running' | 'completed' | 'exited' | 'failed'

export type ExpertOption = { id: string; label: string; description?: string }

export type ExpertFormField = {
  id: string
  kind: 'text' | 'textarea' | 'url' | 'url-list' | 'file' | 'file-list' | 'folder' | 'select' | 'multi-select' | 'table' | 'checkbox'
  label: string
  required?: boolean
  options?: ExpertOption[]
  placeholder?: string
  description?: string
}

export type ExpertIntakeStep =
  | { type: 'question'; id: string; question: string; options: ExpertOption[]; required?: boolean }
  | { type: 'form'; id: string; title: string; fields: ExpertFormField[]; required?: boolean }
  | { type: 'message'; id: string; markdown: string }

export type ExpertIntakeFlow = { version: 1; steps: ExpertIntakeStep[] }

export type ExpertIntakeState = {
  currentStepId?: string
  answers: Record<string, unknown>
  errors: Record<string, string>
  completedStepIds: string[]
  updatedAt: string
}

export type ExpertMaterialRef = {
  runId: string
  expertId: string
  expertName: string
  packId: string
  packVersion: string
  summaryPath: string
  materialJsonPath: string
  evidencePath: string
  createdAt: string
  title: string
  shortSummary: string
}

export type ExpertSessionSummary = {
  mode: 'expert'
  expertId: string
  expertName: string
  packId: string
  packVersion: string
  status: ExpertSessionStatus
  activeRunId?: string
  intakeState?: ExpertIntakeState
  materialRefs: ExpertMaterialRef[]
  startedAt: string
  updatedAt: string
  completedAt?: string
  exitedAt?: string
  error?: string
}

export type WorkflowSessionCreateOptions = {
  templateId: string
  templateSource?: WorkflowTemplateSource
  initialPhaseId?: string
  request?: string
  selectedFiles?: string[]
  repoMetadata?: Record<string, unknown>
  errors?: string
  logs?: string
  testOutput?: string
  labels?: WorkflowLabel[]
  effort?: WorkflowEffortMode
  routingMode?: WorkflowRoutingMode
  brainstormingMode?: WorkflowBrainstormingMode
}

export type WorkflowTemplateValidationIssue = {
  source: WorkflowTemplateValidationIssueSource | (string & {})
  templateId?: string
  path: string
  code: string
  message: string
  severity: 'error' | 'warning'
}

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

export type WorkflowTemplateSkillDeclaration = WorkflowPhaseSkillReference

export type WorkflowPhaseSkillResolvedSkill = {
  name: string
  displayName?: string
  source: WorkflowPhaseSkillSource
  pluginName?: string
}

export type WorkflowPhaseSkillCandidate = WorkflowPhaseSkillResolvedSkill & {
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

export type WorkflowRecommendedSkillStatusSummary = {
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
    namespace?: string
    referenceId?: string
    contentHash?: string
  }>
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

export type WorkflowRecommendedSkillReport = {
  snapshots: WorkflowPhaseSkillSnapshot[]
  evidence: WorkflowPhaseSkillEvidence[]
}

export type WorkflowTemplateRequiredArtifact = {
  id: string
  name?: string
  description?: string
  required: boolean
  [key: string]: unknown
}

export type WorkflowTemplateOutputArtifact = {
  id: string
  name: string
  kind: string
  description: string
  required: true
  sections?: string[]
  [key: string]: unknown
}

export type WorkflowTemplateCompletionCriteria = {
  type?: 'manual-checklist' | 'artifact-required' | 'agent-reported' | (string & {})
  description: string
  [key: string]: unknown
}

export type WorkflowTemplateTransitionPolicy = {
  authority: 'auto' | 'user-confirmation' | 'artifact-gate' | 'user-choice'
  [key: string]: unknown
}

export type WorkflowRunArtifact = {
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

export type WorkflowRunSummary = {
  id: string
  templateId: string
  status: WorkflowRunStatus
  primaryLabel?: WorkflowLabel
  secondaryLabels?: WorkflowLabel[]
  effort?: WorkflowEffortMode
  workspaceRoot?: string
  currentPhaseId?: string
  inheritedFromRunId?: string
  artifacts: WorkflowRunArtifact[]
  historyCount: number
  createdAt: string
  updatedAt: string
}

export type WorkflowTemplatePhaseActionPolicy = {
  allowedActions: string[]
  forbiddenActions: string[]
  [key: string]: unknown
}

export type WorkflowTemplatePhaseToolPolicy = {
  allowedTools: string[]
  [key: string]: unknown
}

export type WorkflowTemplatePhaseIntent = {
  objective: string
  role: string
  intake: string[]
  [key: string]: unknown
}

export type WorkflowTemplatePhaseContract = {
  instructions: string
  executionRules: string[]
  actionPolicy?: WorkflowTemplatePhaseActionPolicy
  toolPolicy?: WorkflowTemplatePhaseToolPolicy
  transitionAuthority: 'auto' | 'user-confirmation' | 'artifact-gate' | 'user-choice'
  [key: string]: unknown
}

export type WorkflowTemplatePhaseEvidencePolicy = {
  outputArtifact?: WorkflowTemplateOutputArtifact
  requiredArtifacts?: WorkflowTemplateRequiredArtifact[]
  completionCriteria?: WorkflowTemplateCompletionCriteria
  handoffRules?: string[]
  [key: string]: unknown
}

export type WorkflowTemplatePhase = {
  id: string
  name: string
  instructions: string
  appliesTo?: WorkflowLabel[]
  skipWhen?: {
    labels?: WorkflowLabel[]
    efforts?: WorkflowEffortMode[]
  }
  modePolicy?: {
    light?: string
    standard?: string
    heavy?: string
  }
  skillBindings?: Array<string | {
    id: string
    mode?: 'native-if-installed' | 'fallback-contract' | 'native-if-installed-else-fallback-contract' | 'disabled'
  }>
  runtimeContract?: {
    allowedActions?: string[]
    forbiddenActions?: string[]
    toolAccess?: {
      allowed?: string[]
      forbidden?: string[]
      requiresExplicitUserConfirmation?: string[]
      maxRepairLoops?: number
      repairLoopAllowedTo?: string
    }
    completionRequires?: string[]
  }
  outputArtifacts?: Array<{
    id: string
    filename?: string
    kind: string
    required?: boolean
    requiredWhen?: WorkflowLabel[]
    description?: string
  }>
  requestedModel?: unknown
  objective?: string
  requiredIntake?: string[]
  handoffRules?: string[]
  executionRules?: string[]
  outputArtifact?: WorkflowTemplateOutputArtifact
  skills?: WorkflowTemplateSkillDeclaration[]
  requiredArtifacts?: WorkflowTemplateRequiredArtifact[]
  completionCriteria?: WorkflowTemplateCompletionCriteria
  transition?: WorkflowTemplateTransitionPolicy
  intent?: WorkflowTemplatePhaseIntent
  contract?: WorkflowTemplatePhaseContract
  evidencePolicy?: WorkflowTemplatePhaseEvidencePolicy
  actionPolicy?: WorkflowTemplatePhaseActionPolicy
  toolPolicy?: WorkflowTemplatePhaseToolPolicy
  runtimeState?: unknown
  [key: string]: unknown
}

export type WorkflowTemplateDraft = {
  schemaVersion: 1 | 2
  id: string
  source?: WorkflowTemplateSource
  version: string
  name: string
  description?: string
  labels?: WorkflowLabel[]
  routingPolicy?: Record<string, unknown>
  stopConditions?: string[]
  phases: WorkflowTemplatePhase[]
  [key: string]: unknown
}

export type WorkflowTemplateListItem = {
  id: string
  source: WorkflowTemplateSource
  version: string
  name: string
  description?: string
  labels?: WorkflowLabel[]
  phaseCount: number
  firstPhaseId: string
  phaseNames?: string[]
  startable?: boolean
  editable?: boolean
  copyable?: boolean
  modelRequirements?: {
    required?: Record<string, boolean> | string[]
    optional?: Record<string, boolean> | string[]
    [key: string]: unknown
  }
  requiredModelCapabilities?: Record<string, boolean> | string[]
  packId?: string
  packName?: string
}

export type WorkflowTemplatesResponse = {
  templates: WorkflowTemplateListItem[]
  invalidTemplates: WorkflowTemplateValidationIssue[]
}

export type WorkflowTemplateDetail = WorkflowTemplateDraft & {
  source: WorkflowTemplateSource
  description: string
  editable: boolean
  copyable: boolean
}

export type WorkflowTemplateDetailResponse = {
  template: WorkflowTemplateDetail
  invalidTemplates?: WorkflowTemplateValidationIssue[]
  issues?: WorkflowTemplateValidationIssue[]
}

export type WorkflowTemplateValidateRequest = {
  template: WorkflowTemplateDraft
  allowExistingId?: string
}

export type WorkflowTemplateValidateResponse = {
  valid: boolean
  template: WorkflowTemplateDetail | null
  issues: WorkflowTemplateValidationIssue[]
}

export type WorkflowTemplateCreateRequest = {
  template: WorkflowTemplateDraft
}

export type WorkflowTemplateUpdateRequest = {
  template: WorkflowTemplateDraft
}

export type WorkflowTemplateMutationResponse = WorkflowTemplatesResponse & {
  template: WorkflowTemplateDetail
}

export type WorkflowTemplateDeleteResponse = WorkflowTemplatesResponse & {
  ok?: boolean
}

export type WorkflowTemplateDuplicateRequest = {
  source: WorkflowTemplateSource
  id: string
  targetId: string
  targetName?: string
}

export type WorkflowTemplateZipImportPayload = {
  format: 'zip-pack' | 'zip'
  dataBase64?: string
  zipBase64?: string
  fileName?: string
}

export type WorkflowTemplateImportPayload = {
  schemaVersion: 1
  templates: WorkflowTemplateDraft[]
  [key: string]: unknown
} | {
  schemaVersion: 2
  exportedAt?: string
  templates: WorkflowTemplateDraft[]
  dependencyManifest?: WorkflowSkillDependencyManifest
  [key: string]: unknown
} | WorkflowTemplateZipImportPayload | WorkflowTemplateDraft

export type WorkflowTemplateImportPreviewRequest = {
  payload: WorkflowTemplateImportPayload
}

export type WorkflowTemplateImportConflict = 'none' | 'user-template'
export type WorkflowTemplateImportResolution = 'add' | 'rename' | 'overwrite'

export type WorkflowTemplateImportCandidate = {
  importId: string
  originalId: string
  proposedId: string
  name: string
  version: string
  phaseCount: number
  conflict: WorkflowTemplateImportConflict
  defaultResolution: 'add' | 'rename'
  selectable: boolean
  issues: WorkflowTemplateValidationIssue[]
  dependencyDiagnostics?: WorkflowImportDependencyDiagnostic[]
}

export type WorkflowPackPreviewInfo = {
  packId: string
  name: string
  version: string
  description?: string
  legacy?: boolean
}

export type WorkflowPackagedSkillPreview = {
  id: string
  identity: string
  safeName: string
  entrypoint: string
  root: string
  contentHash: string
  source: string
  references: string[]
  fileCount: number
  totalBytes: number
}

export type WorkflowPackHostToolPreview = {
  name: string
  supported: boolean
}

export type WorkflowPackSkillInstallPlanItem = {
  identity: string
  safeName: string
  entrypoint: string
  contentHash: string
  status: 'install' | 'reuse' | 'conflict' | 'legacy-unpackaged'
  targetPath?: string
  existingPath?: string
  message?: string
}

export type WorkflowTemplateImportPreviewResponse = {
  schemaVersion: 1
  format?: 'json' | 'zip-pack'
  commitMode?: 'templates' | 'pack'
  pack?: WorkflowPackPreviewInfo
  packagedSkills?: WorkflowPackagedSkillPreview[]
  requiredHostTools?: WorkflowPackHostToolPreview[]
  skillInstallPlan?: WorkflowPackSkillInstallPlanItem[]
  candidates: WorkflowTemplateImportCandidate[]
  invalidTemplates: WorkflowTemplateValidationIssue[]
  canCommit: boolean
}

export type WorkflowTemplateImportSelection = {
  importId: string
  resolution: WorkflowTemplateImportResolution
  targetId?: string
}

export type WorkflowTemplateImportCommitRequest = {
  payload: WorkflowTemplateImportPayload
  selections: WorkflowTemplateImportSelection[]
}

export type WorkflowTemplateImportedTemplate = {
  importId: string
  id: string
  resolution: WorkflowTemplateImportResolution
}

export type WorkflowTemplateImportCommitResponse = WorkflowTemplatesResponse & {
  imported?: WorkflowTemplateImportedTemplate[]
}

export type WorkflowTemplateSelector = {
  source: WorkflowTemplateSource
  id: string
}

export type WorkflowTemplateExportRequest = {
  templates: WorkflowTemplateSelector[]
  mode?: 'selected' | (string & {})
  format?: 'json' | 'zip' | 'zip-pack'
  packId?: string
  name?: string
  version?: string
  description?: string
}

export type WorkflowTemplateJsonExportResponse = {
  schemaVersion: 1 | 2
  exportedAt: string
  templates: WorkflowTemplateDetail[]
  dependencyManifest?: WorkflowSkillDependencyManifest
}

export type WorkflowTemplateZipExportResponse = {
  schemaVersion: 1
  format: 'zip-pack'
  exportedAt: string
  fileName: string
  contentType: 'application/zip'
  dataBase64: string
  templates: WorkflowTemplateDetail[]
  dependencyManifest?: WorkflowSkillDependencyManifest
}

export type WorkflowTemplateExportResponse = WorkflowTemplateJsonExportResponse | WorkflowTemplateZipExportResponse

export type WorkflowSkillDependencyManifest = {
  schemaVersion: 1
  generatedAt: string
  resolverVersion?: string
  dependencies: WorkflowSkillDependency[]
}

export type WorkflowSkillDependency = {
  templateId: string
  phaseId: string
  reference: WorkflowPhaseSkillReference
  exportStatus: WorkflowPhaseSkillResolutionStatus
  resolvedSource?: WorkflowPhaseSkillSource
  pluginName?: string
  contentHash?: string
  diagnostic?: string
}

export type LinkedWorkflowContextStrategy = 'inherit' | 'summarize' | 'clear'

export type LinkedWorkflowSessionCreateRequest = {
  workflow: WorkflowSessionCreateOptions
  contextStrategy: LinkedWorkflowContextStrategy
  summaryInstructions?: string
  /** A user-reviewed summary generated before a separate workflow session is opened. */
  summaryContent?: string
  clientRequestId?: string
}

export type LinkedWorkflowContextSummaryPreviewRequest = {
  summaryInstructions?: string
}

export type LinkedWorkflowContextSummaryPreviewResponse = {
  content: string
  sourceMessageCount: number
}

export type LinkedWorkflowSessionLink = {
  sourceSessionId: string
  targetSessionId: string
  contextStrategy: LinkedWorkflowContextStrategy
  summaryArtifactId?: string
  sourceMessageCount: number
  createdAt: string
  clientRequestId?: string
}

export type LinkedWorkflowSessionCreateResponse = {
  sessionId: string
  workDir?: string
  workflow: WorkflowSessionSummary
  link: LinkedWorkflowSessionLink
}

export type WorkflowFollowUpRunRequest = {
  request: string
  kind?: 'development' | 'feature-extension' | 'debug-repair'
  templateId?: string
  templateSource?: WorkflowTemplateSource
  initialPhaseId?: string
  selectedFiles?: string[]
  repoMetadata?: Record<string, unknown>
  errors?: string
  logs?: string
  testOutput?: string
}

export type WorkflowPreviewStartRequest = {
  command?: string
  cwd?: string
  detectedPort?: number
  detectedUrl?: string
}

export type WorkflowPreviewStopRequest = {
  reason?: string
}

export type LinkedWorkflowSessionStartErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'WORKFLOW_TEMPLATE_INVALID'
  | 'WORKFLOW_TEMPLATE_NOT_FOUND'
  | 'WORKFLOW_SOURCE_INVALID'
  | 'WORKFLOW_SOURCE_ACTIVE'
  | 'WORKFLOW_LINK_DUPLICATE'
  | 'WORKFLOW_CONTEXT_TOO_LARGE'
  | 'WORKFLOW_CONTEXT_SUMMARY_UNAVAILABLE'

export type LinkedWorkflowSessionStartErrorBody = {
  error?: LinkedWorkflowSessionStartErrorCode
  code?: LinkedWorkflowSessionStartErrorCode
  message: string
}

export type WorkflowSessionStateResponse = {
  workflow: WorkflowSessionSummary
  state: Record<string, unknown>
}

export type WorkflowTransitionAction = 'confirm' | 'reject' | 'retry' | 'manual_complete'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'cancelled'
export type WorkflowNextPhaseContextStrategy = 'inherit' | 'clear'

export type WorkflowTransitionHandoff = {
  summary: string
  artifacts: WorkflowArtifactPointer[]
}

export type WorkflowTransitionRequest = {
  phaseId: string
  stateVersion?: number
  action: WorkflowTransitionAction
  transitionId?: string
  nextPhaseContextStrategy?: WorkflowNextPhaseContextStrategy
  handoff?: WorkflowTransitionHandoff
  rationale?: string
  evidence?: unknown[]
}

export type WorkflowTransitionResponse = {
  ok: boolean
  workflow: WorkflowSessionSummary
  state?: Record<string, unknown>
}

export type WorkflowFollowUpRunResponse = WorkflowTransitionResponse
export type WorkflowPreviewResponse = WorkflowTransitionResponse & {
  preview: WorkflowPreviewState
}

export type WorkflowReportResponse = {
  report: Record<string, unknown> & {
    recommendedSkills?: WorkflowRecommendedSkillReport
  }
  pointer: WorkflowArtifactPointer
}

export type WorkflowGitCheckpoint = {
  id: string
  ref: string
  version: number
  commit: string
  phaseId: string | null
  phaseIndex: number | null
  label: string
  createdAt: string
  message: string
}

export type WorkflowGitCheckpointListResponse = {
  enabled: boolean
  reason?: string
  latestVersion: number | null
  checkpoints: WorkflowGitCheckpoint[]
}

export type WorkflowGitCheckpointCreateRequest = {
  phaseId?: string | null
  phaseIndex?: number | null
  label?: string
}

export type WorkflowGitCheckpointCreateResponse = {
  ok: true
  checkpoint: WorkflowGitCheckpoint
  checkpoints: WorkflowGitCheckpoint[]
  latestVersion: number
}

export type WorkflowGitCheckpointRestoreRequest = {
  checkpointId: string
}

export type WorkflowGitCheckpointRestoreResponse = {
  ok: true
  checkpoint: WorkflowGitCheckpoint
  workflowStateRestored: boolean
  transcriptRestored: boolean
  conversation?: {
    messagesRemoved: number
    removedMessageIds?: string[]
  }
  removedFiles: string[]
  workflow?: WorkflowSessionSummary
  expert?: ExpertSessionSummary
}

export type SessionListItem = {
  id: string
  title: string
  createdAt: string
  modifiedAt: string
  messageCount: number
  projectPath: string
  projectRoot?: string | null
  workDir: string | null
  workDirExists: boolean
  workflow?: WorkflowSessionSummary
  expert?: ExpertSessionSummary
}

export type MessageEntry = {
  id: string
  type: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result'
  content: unknown
  timestamp: string
  model?: string
  parentUuid?: string
  parentToolUseId?: string
  isSidechain?: boolean
}

export type SessionDetail = SessionListItem & {
  messages: MessageEntry[]
}

