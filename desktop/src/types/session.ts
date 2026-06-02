// Source: src/server/services/sessionService.ts

export type SessionMode = 'dialogue' | 'workflow'
export type WorkflowTemplateSource = 'builtin' | 'user'
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
  | 'user'
  | 'project'
  | 'plugin'
  | 'managed'
  | 'bundled'
  | 'mcp'
  | 'unknown'
export type WorkflowPhaseSkillResolutionStatus =
  | 'available'
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
  blockedReason?: string
  blockedStatus?: 'blocked' | 'unable'
  blockedEvidence?: Array<Record<string, unknown>>
  blockedArtifact?: WorkflowPhaseArtifact | null
  model?: WorkflowModelResolution
  statePointer: WorkflowArtifactPointer
  reportPointer?: WorkflowArtifactPointer
  phaseNames?: string[]
  transitionAuthority?: 'auto' | 'user-confirmation'
  pendingArtifact?: WorkflowPhaseArtifact | null
  artifactHistory?: WorkflowPhaseArtifact[]
  recommendedSkillStatus?: WorkflowRecommendedSkillStatusSummary
  recommendedSkillEvidence?: WorkflowPhaseSkillEvidence[]
}

export type WorkflowSessionCreateOptions = {
  templateId: string
  templateSource?: WorkflowTemplateSource
  initialPhaseId?: string
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
  authority: 'auto' | 'user-confirmation'
  [key: string]: unknown
}

export type WorkflowTemplatePhase = {
  id: string
  name: string
  instructions: string
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
  [key: string]: unknown
}

export type WorkflowTemplateDraft = {
  schemaVersion: 1
  id: string
  source?: WorkflowTemplateSource
  version: string
  name: string
  description?: string
  phases: WorkflowTemplatePhase[]
  [key: string]: unknown
}

export type WorkflowTemplateListItem = {
  id: string
  source: WorkflowTemplateSource
  version: string
  name: string
  description?: string
  phaseCount: number
  firstPhaseId: string
  phaseNames?: string[]
  startable?: boolean
  editable?: boolean
  copyable?: boolean
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
} | WorkflowTemplateDraft

export type WorkflowTemplateImportPreviewRequest = {
  payload: WorkflowTemplateImportPayload
}

export type WorkflowTemplateImportConflict = 'none' | 'builtin-template' | 'user-template'
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

export type WorkflowTemplateImportPreviewResponse = {
  schemaVersion: 1
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
}

export type WorkflowTemplateExportResponse = {
  schemaVersion: 1 | 2
  exportedAt: string
  templates: WorkflowTemplateDetail[]
  dependencyManifest?: WorkflowSkillDependencyManifest
}

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
  clientRequestId?: string
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

export type WorkflowTransitionHandoff = {
  summary: string
  artifacts: WorkflowArtifactPointer[]
}

export type WorkflowTransitionRequest = {
  phaseId: string
  stateVersion?: number
  action: WorkflowTransitionAction
  transitionId?: string
  handoff?: WorkflowTransitionHandoff
  rationale?: string
  evidence?: unknown[]
}

export type WorkflowTransitionResponse = {
  ok: boolean
  workflow: WorkflowSessionSummary
  state?: Record<string, unknown>
}

export type WorkflowReportResponse = {
  report: Record<string, unknown> & {
    recommendedSkills?: WorkflowRecommendedSkillReport
  }
  pointer: WorkflowArtifactPointer
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
