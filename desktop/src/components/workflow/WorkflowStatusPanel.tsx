type ArtifactPointer = {
  id?: string
  label?: string
  uri?: string
  artifactId?: string
  kind?: string
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
}

type WorkflowStatusPanelProps = {
  workflow?: WorkflowStatusPanelSummary | null
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

export function WorkflowStatusPanel({ workflow }: WorkflowStatusPanelProps) {
  if (!workflow) return null

  const phaseName = resolvePhaseName(workflow)
  const requestedModel = workflow.model?.requested ?? workflow.model?.requestedModel
  const actualModel = workflow.model?.actual ?? workflow.model?.actualModel
  const statePointer = pointerText(workflow.statePointer)

  return (
    <section
      data-testid="workflow-status-panel"
      className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3 text-[12px]"
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
            {humanize(workflow.templateId)}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">
            {workflow.templateSource} {workflow.templateVersion}
          </div>
        </div>
        <StatusBadge status={workflow.status} />
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--color-text-primary)]">{phaseName}</span>
          <span className="text-[var(--color-text-tertiary)]">
            Phase {Math.max(workflow.activePhaseIndex + 1, 1)} of {workflow.phaseCount}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
          <div
            className="h-full rounded-full bg-[var(--color-brand)] transition-all"
            style={{ width: `${progressPercent(workflow)}%` }}
          />
        </div>
      </div>

      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <InfoRow label="Transition authority" value={workflow.transitionAuthority ?? 'auto'} />
        <InfoRow label="State pointer" value={statePointer} mono />
        {requestedModel && <InfoRow label="Requested model" value={requestedModel} />}
        {actualModel && <InfoRow label="Actual model" value={actualModel} />}
        {workflow.model?.providerId && <InfoRow label="Provider" value={workflow.model.providerId} />}
        {workflow.model?.source && <InfoRow label="Model source" value={workflow.model.source} />}
        {typeof workflow.model?.fallbackApplied === 'boolean' && (
          <InfoRow
            label="Fallback"
            value={workflow.model.fallbackApplied ? 'Fallback applied' : 'No fallback'}
          />
        )}
      </dl>

      {workflow.model?.fallbackReason && (
        <div className="mt-2 rounded-[8px] border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/8 px-3 py-2 text-[11px] leading-5 text-[var(--color-text-secondary)]">
          {workflow.model.fallbackReason}
        </div>
      )}

      {workflow.blockedReason && (
        <div className="mt-2 rounded-[8px] border border-[var(--color-error)]/20 bg-[var(--color-error)]/8 px-3 py-2 text-[11px] leading-5 text-[var(--color-error)]">
          {workflow.blockedReason}
        </div>
      )}

      {workflow.pendingArtifact ? (
        <ArtifactCard
          artifact={workflow.pendingArtifact}
          testId="workflow-pending-artifact"
          title="Current artifact"
          statusLabel="Awaiting"
          showLabel
          showMetadata
        />
      ) : null}

      {workflow.artifactHistory?.length ? (
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
    </section>
  )
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
