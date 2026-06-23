import { type ReactNode, useState } from 'react'

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

type WorkflowPhaseSkillResolutionStatus =
  | 'available'
  | 'missing'
  | 'ambiguous'
  | 'unsupported-source'
  | 'plugin-disabled'
  | 'invalid-reference'
  | 'installable'

type WorkflowPhaseSkillSource =
  | 'user'
  | 'project'
  | 'plugin'
  | 'managed'
  | 'bundled'
  | 'mcp'
  | 'unknown'

type WorkflowRecommendedSkillStatusSummary = {
  total: number
  available: number
  unavailable: number
  degraded: number
  evidenceCount: number
  activePhaseItems?: Array<{
    name: string
    status: WorkflowPhaseSkillResolutionStatus | (string & {})
    source?: WorkflowPhaseSkillSource | (string & {})
    pluginName?: string
    namespace?: string
    referenceId?: string
    contentHash?: string
  }>
}

type WorkflowPhaseSkillEvidence = {
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
}

const STATUS_LABELS: Record<WorkflowStatusPanelSummary['status'], string> = {
  created: 'Created',
  running: 'Running',
  'pending-confirmation': 'Waiting for confirmation',
  failed: 'Completion check failed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  resumed: 'Resumed',
  'stale-template': 'Template source is stale',
  'missing-template': 'Template source is missing',
}

export function WorkflowStatusPanel({ workflow, compact = false, hideDetails = false, actions }: WorkflowStatusPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)

  if (!workflow) return null

  const phaseName = resolvePhaseName(workflow)
  const authorityLabel = authorityText(workflow.transitionAuthority)
  const requestedModel = workflow.model?.requested ?? workflow.model?.requestedModel
  const actualModel = workflow.model?.actual ?? workflow.model?.actualModel
  const statePointer = pointerText(workflow.statePointer)
  const fallbackLabel = typeof workflow.model?.fallbackApplied === 'boolean'
    ? workflow.model.fallbackApplied ? 'Fallback applied' : 'No fallback'
    : null
  const hasActiveBlockedRecovery = !workflow.pendingConfirmation && (
    Boolean(workflow.blockedStatus) || Boolean(workflow.blockedReason)
  )
  const detailRows = [
    { label: 'Transition authority', value: workflow.transitionAuthority ?? 'auto' },
    { label: 'State pointer', value: statePointer, mono: true },
    requestedModel ? { label: 'Requested model', value: requestedModel } : null,
    actualModel ? { label: 'Actual model', value: actualModel } : null,
    workflow.model?.providerId ? { label: 'Provider', value: workflow.model.providerId } : null,
    workflow.model?.source ? { label: 'Model source', value: workflow.model.source } : null,
    fallbackLabel ? { label: 'Fallback', value: fallbackLabel } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; mono?: boolean }>
  const actionsAreManualCompletion = Boolean(
    actions &&
    workflow.status === 'running' &&
    workflow.transitionAuthority === 'user-confirmation' &&
    !workflow.pendingConfirmation &&
    !hasActiveBlockedRecovery,
  )
  const inlineActions = actionsAreManualCompletion ? null : actions
  const detailActions = actionsAreManualCompletion ? actions : null

  return (
    <section
      data-testid="workflow-status-panel"
      data-compact={compact ? 'true' : 'false'}
      className={
        compact
          ? 'rounded-[8px] border border-[var(--color-border)]/70 bg-[var(--color-surface-container-lowest)] px-2.5 py-1.5 text-[11px]'
          : 'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[12px]'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className={`${compact ? 'text-[12px]' : 'text-[13px]'} truncate font-semibold text-[var(--color-text-primary)]`}>
            {humanize(workflow.templateId)}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-text-tertiary)]">
            <span className="truncate">{workflow.templateSource} {workflow.templateVersion}</span>
            <span className="text-[var(--color-border)]" aria-hidden="true">/</span>
            <span className="truncate">
              {phaseName} · Phase {Math.max(workflow.activePhaseIndex + 1, 1)} of {workflow.phaseCount}
            </span>
            <span className="text-[var(--color-border)]" aria-hidden="true">/</span>
            <span className="truncate">Authority: {authorityLabel}</span>
          </div>
        </div>
        <StatusBadge status={displayStatus(workflow)} />
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-border)]">
        <div
          className="h-full rounded-full bg-[var(--color-brand)] transition-all"
          style={{ width: `${progressPercent(workflow)}%` }}
        />
      </div>

      {hasActiveBlockedRecovery && workflow.blockedReason && inlineActions ? (
        <div className="mt-2 rounded-[8px] border border-[var(--color-error)]/20 bg-[var(--color-error)]/8 px-3 py-2 text-[11px] leading-5 text-[var(--color-error)]">
          <p>{workflow.blockedReason}</p>
          <div className="mt-2">
            {inlineActions}
          </div>
        </div>
      ) : inlineActions ? (
        <div className="mt-2">
          {inlineActions}
        </div>
      ) : null}

      {hideDetails ? null : (
        <div className="mt-2">
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls="workflow-status-details"
            onClick={() => setDetailsOpen((open) => !open)}
            className="flex max-w-full items-center gap-2 text-[11px] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            <span className={`material-symbols-outlined text-[14px] transition-transform ${detailsOpen ? 'rotate-90' : ''}`} aria-hidden="true">
              chevron_right
            </span>
            <span className="font-medium">{detailsOpen ? 'Hide workflow details' : 'Show workflow details'}</span>
          </button>
          {detailsOpen ? (
            <div id="workflow-status-details" data-testid="workflow-status-details">
              {compact ? null : <RecommendedSkillStatusStrip workflow={workflow} />}
              {detailActions ? (
                <section className="mt-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-3 py-2">
                  <div className="mb-2 text-[10px] font-semibold uppercase text-[var(--color-text-tertiary)]">
                    Advanced workflow actions
                  </div>
                  {detailActions}
                </section>
              ) : null}
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {detailRows.map((row) => (
                  <InfoRow key={row.label} label={row.label} value={row.value} mono={row.mono} />
                ))}
              </dl>
              {workflow.model?.fallbackReason && (
                <div className="mt-2 rounded-[8px] border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/8 px-3 py-2 text-[11px] leading-5 text-[var(--color-text-secondary)]">
                  {workflow.model.fallbackReason}
                </div>
              )}

              {!compact && workflow.pendingArtifact ? (
                <ArtifactCard
                  artifact={workflow.pendingArtifact}
                  testId="workflow-pending-artifact"
                  title="Current artifact"
                  statusLabel="Awaiting"
                  showLabel
                  showMetadata
                />
              ) : null}

              {!compact && workflow.artifactHistory?.length ? (
                <section
                  data-testid="workflow-artifact-history"
                  className="mt-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container)] p-3"
                >
                  <div className="mb-2 text-[11px] font-semibold uppercase text-[var(--color-text-tertiary)]">
                    Artifact history
                  </div>
                  <div className="grid gap-2">
                    {workflow.artifactHistory.map((artifact) => (
                      <ArtifactCard
                        key={artifact.artifactId}
                        artifact={artifact}
                        testId={`workflow-artifact-${artifact.artifactId}`}
                        showPhase={!artifact.handoffSummary.toLowerCase().includes(artifact.phaseId.toLowerCase())}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      )}


      {hasActiveBlockedRecovery && workflow.blockedReason && !inlineActions && (
        <div className="mt-2 rounded-[8px] border border-[var(--color-error)]/20 bg-[var(--color-error)]/8 px-3 py-2 text-[11px] leading-5 text-[var(--color-error)]">
          {workflow.blockedReason}
        </div>
      )}

    </section>
  )
}

function RecommendedSkillStatusStrip({ workflow }: { workflow: WorkflowStatusPanelSummary }) {
  const status = workflow.recommendedSkillStatus
  if (!status || status.total <= 0) return null

  const evidenceNames = new Set(
    (workflow.recommendedSkillEvidence ?? [])
      .filter((item) => isRelevantEvidenceOutcome(item.outcome))
      .map((item) => item.name),
  )
  const activePhaseItems = status.activePhaseItems ?? []
  const activeItems = workflow.recommendedSkillEvidence
    ? activePhaseItems
      .filter((item) => item.status !== 'available' || evidenceNames.has(item.name))
    : activePhaseItems.filter((item) => item.status !== 'available' || item.source !== 'bundled')
  const evidenceItems = (workflow.recommendedSkillEvidence ?? [])
    .filter((item) => isRelevantEvidenceOutcome(item.outcome))

  return (
    <section
      data-testid="workflow-recommended-skill-status"
      className="mt-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-3 py-2 text-[11px] leading-5 text-[var(--color-text-secondary)]"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-[var(--color-text-primary)]">Recommended skills</span>
        <span>{status.available} available</span>
        <span>{status.unavailable} unavailable</span>
        <span>{status.degraded} degraded</span>
        <span>{status.evidenceCount} evidence</span>
      </div>
      {activeItems.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {activeItems.map((item) => (
            <span
              key={`${item.name}-${item.status}-${item.pluginName ?? item.source ?? ''}`}
              className="rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]"
              title={skillStatusParts(item).join(' / ')}
            >
              {item.name} · {skillStatusParts(item).join(' · ')}
            </span>
          ))}
        </div>
      ) : null}
      {evidenceItems.length ? (
        <div className="mt-2 grid gap-1.5">
          {evidenceItems.map((item) => (
            <div
              key={`${item.phaseId}-${item.name}-${item.outcome}-${item.recordedAt}`}
              className="rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 py-1.5"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                <span className="font-semibold text-[var(--color-text-primary)]">{item.name}</span>
                <span>{item.outcome}</span>
                {item.resolutionStatus ? <span>{item.resolutionStatus}</span> : null}
                {item.source ? <span>{item.source}</span> : null}
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">{item.rationale}</p>
              {(item.toolUseId || item.artifactRef) ? (
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[10px] text-[var(--color-text-tertiary)]">
                  {item.toolUseId ? <span>{item.toolUseId}</span> : null}
                  {item.artifactRef ? <span>{item.artifactRef}</span> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function skillStatusParts(item: {
  status: string
  source?: string
  pluginName?: string
  namespace?: string
  referenceId?: string
  contentHash?: string
}) {
  return [
    item.status,
    item.source,
    item.pluginName,
    item.namespace,
    item.referenceId,
    item.contentHash,
  ].filter(Boolean) as string[]
}

function ArtifactCard({
  artifact,
  testId,
  title,
  statusLabel,
  showLabel = false,
  showMetadata = false,
  showPhase = true,
}: {
  artifact: WorkflowPhaseArtifact
  testId: string
  title?: string
  statusLabel?: string
  showLabel?: boolean
  showMetadata?: boolean
  showPhase?: boolean
}) {
  const artifactText = `${artifact.handoffSummary} ${artifact.evidenceSummary}`.toLowerCase()
  const showStatus = !artifactText.includes(artifact.status.toLowerCase())

  return (
    <article
      data-testid={testId}
      className="mt-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[11px] leading-5"
    >
      {title ? (
        <div className="mb-1 text-[10px] font-semibold uppercase text-[var(--color-text-tertiary)]">
          {title}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {showLabel ? (
          <span className="font-semibold text-[var(--color-text-primary)]">{artifact.label}</span>
        ) : null}
        {showStatus ? (
          <span
            className="rounded-[6px] border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--color-text-secondary)]"
            title={artifact.status}
          >
            {statusLabel ?? artifact.status}
          </span>
        ) : null}
        {showPhase ? <span className="text-[var(--color-text-tertiary)]">{artifact.phaseId}</span> : null}
      </div>
      <p className="mt-1 text-[var(--color-text-primary)]">{artifact.handoffSummary}</p>
      <p className="mt-1 text-[var(--color-text-secondary)]">{artifact.evidenceSummary}</p>
      {showMetadata ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {artifact.provenance ? <span>{artifact.provenance}</span> : null}
          {artifact.transitionId ? <span>{artifact.transitionId}</span> : null}
          {artifact.completionId ? <span>{artifact.completionId}</span> : null}
        </div>
      ) : null}
    </article>
  )
}

function StatusBadge({ status }: { status: WorkflowStatusPanelSummary['status'] }) {
  const tone = status === 'failed' || status === 'missing-template'
    ? 'border-[var(--color-error)]/25 bg-[var(--color-error)]/8 text-[var(--color-error)]'
    : status === 'pending-confirmation' || status === 'stale-template'
      ? 'border-[var(--color-warning)]/25 bg-[var(--color-warning)]/8 text-[var(--color-warning)]'
      : status === 'completed'
        ? 'border-[var(--color-success)]/25 bg-[var(--color-success)]/8 text-[var(--color-success)]'
        : 'border-[var(--color-border)] bg-[var(--color-surface-container)] text-[var(--color-text-secondary)]'

  return (
    <span className={`shrink-0 rounded-[6px] border px-2 py-1 text-[11px] font-medium ${tone}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function displayStatus(workflow: WorkflowStatusPanelSummary): WorkflowStatusPanelSummary['status'] {
  if (workflow.pendingConfirmation) return 'pending-confirmation'
  return workflow.status
}

function authorityText(authority?: string) {
  if (authority === 'user-confirmation') return 'User confirmation required'
  if (authority === 'auto') return 'Automatic transition'
  return authority ?? 'Automatic transition'
}

function isRelevantEvidenceOutcome(outcome: string): outcome is WorkflowPhaseSkillEvidence['outcome'] {
  return outcome === 'used' ||
    outcome === 'relevant-skipped' ||
    outcome === 'relevant-unavailable'
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-[8px] bg-[var(--color-surface-container)] px-3 py-2">
      <dt className="text-[10px] font-medium uppercase text-[var(--color-text-tertiary)]">{label}</dt>
      <dd className={`mt-0.5 truncate text-[12px] text-[var(--color-text-primary)] ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  )
}

function resolvePhaseName(workflow: WorkflowStatusPanelSummary) {
  if (workflow.activePhaseIndex >= 0) {
    const phaseName = workflow.phaseNames?.[workflow.activePhaseIndex]
    if (phaseName) return phaseName
  }
  return workflow.activePhaseId ? humanize(workflow.activePhaseId) : 'No active phase'
}

function progressPercent(workflow: WorkflowStatusPanelSummary) {
  if (workflow.phaseCount <= 0) return 0
  if (workflow.status === 'completed') return 100
  return Math.min(100, Math.max(0, ((workflow.activePhaseIndex + 1) / workflow.phaseCount) * 100))
}

function pointerText(pointer: ArtifactPointer) {
  return pointer.uri ?? pointer.artifactId ?? pointer.label ?? pointer.kind ?? 'Workflow state'
}

function humanize(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
