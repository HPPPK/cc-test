import { type ReactNode } from 'react'
import { formatWorkflowPhaseSummary } from './workflowPhaseDisplay'

type ArtifactPointer = {
  id?: string
  label?: string
  uri?: string
  artifactId?: string
  kind?: string
  sessionId?: string
  schemaVersion?: number
  createdAt?: string
  updatedAt?: string
}

type WorkflowModel = {
  requested?: string | null
  actual?: string | null
  requestedModel?: string | null
  actualModel?: string | null
  providerId?: string | null
  source?: 'phase-request' | 'main-session-default' | 'none' | string
  fallbackApplied?: boolean
  fallbackReason?: string | null
}

type WorkflowPhaseArtifact = {
  artifactId: string
  phaseId: string
  status: 'pending' | 'accepted' | 'rejected' | 'superseded' | 'blocked' | 'unable'
  label: string
  handoffSummary: string
  evidenceSummary: string
  createdAt: string
  updatedAt?: string
  transitionId?: string
  completionId?: string
  provenance?: string
}

type WorkflowRunArtifact = {
  id: string
  filename?: string
  kind: string
  required?: boolean
  phaseId?: string
  createdAt: string
  updatedAt: string
  inheritedFromRunId?: string
  description?: string
}

type WorkflowRunSummary = {
  id: string
  templateId: string
  status: 'draft' | 'active' | 'waiting_for_user' | 'paused' | 'completed' | 'cancelled' | 'stopped' | 'blocked'
  primaryLabel?: string
  secondaryLabels?: string[]
  effort?: string
  workspaceRoot?: string
  currentPhaseId?: string
  inheritedFromRunId?: string
  artifacts: WorkflowRunArtifact[]
  historyCount: number
  createdAt: string
  updatedAt: string
}

type WorkflowPreviewState = {
  status: 'idle' | 'starting' | 'running' | 'failed' | 'stopping' | 'stopped'
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

type WorkflowSkillBindingStatus = {
  id: string
  mode: string
  availability: 'native' | 'fallback' | 'disabled' | string
  fallbackContract?: string
}

type WorkflowRecommendedSkillStatusSummary = {
  total: number
  available: number
  unavailable: number
  degraded: number
  evidenceCount: number
  activePhaseItems?: Array<Record<string, unknown>>
}

type WorkflowPhaseSkillEvidence = {
  phaseId: string
  name: string
  outcome: 'used' | 'relevant-skipped' | 'relevant-unavailable'
  rationale: string
  recordedAt: string
  source?: string
  resolutionStatus?: string
  toolUseId?: string
  artifactRef?: string
}

export type WorkflowStatusPanelSummary = {
  templateId: string
  templateVersion: string
  templateSource: string
  status:
    | 'created'
    | 'running'
    | 'pending-confirmation'
    | 'failed'
    | 'cancelled'
    | 'completed'
    | 'resumed'
    | 'stale-template'
    | 'missing-template'
  activePhaseId: string | null
  activePhaseIndex: number
  phaseCount: number
  pendingConfirmation: boolean
  /** Server-issued identity for the one confirmation card currently allowed to act. */
  pendingConfirmationId?: string
  pendingRoute?: {
    routeId: string
    phaseId: string
    fromPhaseId: string
    targetPhaseId: string | null
    intent: string
    rationale: string
    requiresConfirmation: boolean
    approvedTargetPhaseId: string | null
    status: 'pending' | 'approved' | 'rejected'
  } | null
  pendingTargetPhaseId?: string | null
  pendingTargetPhaseIndex?: number
  pendingTargetPhaseLabel?: string
  routeReason?: string
  requiresConfirmation?: boolean
  runStatus?: 'draft' | 'active' | 'waiting_for_user' | 'paused' | 'completed' | 'cancelled' | 'stopped' | 'blocked'
  labels?: string[]
  secondaryLabels?: string[]
  effort?: 'auto' | 'light' | 'standard' | 'heavy' | string
  routingMode?: 'manual' | 'auto-confirm' | 'auto' | string
  router?: {
    primaryLabel?: string
    secondaryLabels?: string[]
    effort?: string
    confidence?: number
    rationale?: string
    suggestedPath?: string[]
    terminalReason?: string
  }
  workspaceRoot?: string
  activeWorkflowRunId?: string
  lastCompletedWorkflowRunId?: string
  activeWorkflowRun?: WorkflowRunSummary
  workflowRuns?: WorkflowRunSummary[]
  artifactList?: WorkflowRunArtifact[]
  preview?: WorkflowPreviewState
  skillBindingStatus?: WorkflowSkillBindingStatus[]
  blockedReason?: string
  blockedStatus?: 'blocked' | 'unable'
  blockedEvidence?: Array<Record<string, unknown>>
  blockedArtifact?: WorkflowPhaseArtifact | null
  model?: WorkflowModel
  statePointer: ArtifactPointer
  reportPointer?: ArtifactPointer
  phaseNames?: string[]
  transitionAuthority?: 'auto' | 'user-confirmation' | string
  stateVersion?: number
  pendingArtifact?: WorkflowPhaseArtifact | null
  artifactHistory?: WorkflowPhaseArtifact[]
  recommendedSkillStatus?: WorkflowRecommendedSkillStatusSummary
  recommendedSkillEvidence?: WorkflowPhaseSkillEvidence[]
}

type WorkflowStatusPanelProps = {
  workflow?: WorkflowStatusPanelSummary | null
  compact?: boolean
  hideDetails?: boolean
  actions?: ReactNode
  checkpointActions?: ReactNode
}

const STATUS_LABELS: Record<WorkflowStatusPanelSummary['status'], string> = {
  created: '草稿',
  running: '进行中',
  'pending-confirmation': '等待确认',
  failed: '需要处理',
  cancelled: '已取消',
  completed: '已完成',
  resumed: '进行中',
  'stale-template': '模板需更新',
  'missing-template': '模板缺失',
}

const RUN_STATUS_LABELS: Record<NonNullable<WorkflowStatusPanelSummary['runStatus']>, string> = {
  draft: '草稿',
  active: '进行中',
  waiting_for_user: '等待确认',
  paused: '已暂停',
  completed: '已完成',
  cancelled: '已取消',
  stopped: '已停止',
  blocked: '需要处理',
}

export function WorkflowStatusPanel({ workflow, compact = false, actions, checkpointActions }: WorkflowStatusPanelProps) {
  if (!workflow) return null

  const status = displayStatus(workflow)
  const phaseSummary = formatWorkflowPhaseSummary(workflow)

  return (
    <section
      data-testid="workflow-status-panel"
      data-compact={compact ? 'true' : 'false'}
      className="rounded-[12px] border border-[var(--color-border)]/70 bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[12px] shadow-sm"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary)]/10 text-[var(--color-secondary)]">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">menu_book</span>
          </span>
          <span className="shrink-0 font-semibold text-[var(--color-text-primary)]">
            {workflowTypeLabel(workflow)}
          </span>
          <span className="text-[var(--color-border)]" aria-hidden="true">·</span>
          <span className={statusTextClassName(status)}>{statusLabel(status)}</span>
          <span className="text-[var(--color-border)]" aria-hidden="true">·</span>
          <span className="min-w-0 truncate text-[var(--color-text-secondary)]">{phaseSummary}</span>
        </div>
        {actions ? (
          <div className="min-w-0 shrink-0">
            {actions}
          </div>
        ) : null}
        {checkpointActions ? (
          <div className="min-w-0 shrink-0">
            {checkpointActions}
          </div>
        ) : null}
      </div>
    </section>
  )
}

type DisplayWorkflowStatus = WorkflowStatusPanelSummary['status'] | NonNullable<WorkflowStatusPanelSummary['runStatus']>

function statusLabel(status: DisplayWorkflowStatus) {
  return status in RUN_STATUS_LABELS
    ? RUN_STATUS_LABELS[status as NonNullable<WorkflowStatusPanelSummary['runStatus']>]
    : STATUS_LABELS[status as WorkflowStatusPanelSummary['status']]
}

function displayStatus(workflow: WorkflowStatusPanelSummary): DisplayWorkflowStatus {
  if (workflow.runStatus) return workflow.runStatus
  if (workflow.pendingConfirmation) return 'pending-confirmation'
  return workflow.status
}

function statusTextClassName(status: DisplayWorkflowStatus) {
  if (status === 'failed' || status === 'missing-template' || status === 'blocked') {
    return 'shrink-0 font-medium text-[var(--color-error)]'
  }
  if (status === 'pending-confirmation' || status === 'stale-template' || status === 'waiting_for_user' || status === 'paused' || status === 'stopped') {
    return 'shrink-0 font-medium text-[var(--color-warning)]'
  }
  if (status === 'completed' || status === 'active' || status === 'running' || status === 'resumed') {
    return 'shrink-0 font-medium text-[var(--color-success)]'
  }
  return 'shrink-0 font-medium text-[var(--color-text-secondary)]'
}

function workflowTypeLabel(workflow: WorkflowStatusPanelSummary) {
  const label = workflow.activeWorkflowRun?.primaryLabel ?? workflow.router?.primaryLabel ?? workflow.labels?.[0]
  if (label === 'bug') return '调试流程'
  if (label === 'enhancement') return '功能扩展流程'
  return '开发流程'
}
