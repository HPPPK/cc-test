// Source: src/server/services/sessionService.ts

export type SessionMode = 'dialogue' | 'workflow'
export type WorkflowTemplateSource = 'builtin' | 'user'
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
}

export type WorkflowSessionCreateOptions = {
  templateId: string
  templateSource?: WorkflowTemplateSource
  initialPhaseId?: string
}

export type WorkflowTemplateValidationIssue = {
  source: string
  templateId?: string
  path: string
  code: string
  message: string
  severity: 'error' | 'warning'
}

export type WorkflowTemplateListItem = {
  id: string
  source: WorkflowTemplateSource
  version: string
  name: string
  description?: string
  phaseCount: number
  firstPhaseId: string
}

export type WorkflowTemplatesResponse = {
  templates: WorkflowTemplateListItem[]
  invalidTemplates: WorkflowTemplateValidationIssue[]
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
  report: Record<string, unknown>
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
