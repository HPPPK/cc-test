import type { WorkflowStatusPanelSummary } from './WorkflowStatusPanel'
import { useRef, useState } from 'react'

export type WorkflowTransitionCommand = {
  phaseId: string
  action: 'confirm' | 'reject' | 'retry' | 'manual_complete'
  transitionId?: string
  stateVersion?: number
  nextPhaseContextStrategy?: 'inherit' | 'clear'
  handoff?: {
    summary: string
    artifacts: unknown[]
  }
  rationale?: string
  evidence?: Array<{
    kind: string
    label: string
    ref: string
  }>
}

type WorkflowTransitionControlsProps = {
  workflow?: WorkflowStatusPanelSummary | null
  stateVersion?: number
  transitionId?: string
  embedded?: boolean
  onConfirm: (command: WorkflowTransitionCommand) => void
  onReject: (command: WorkflowTransitionCommand) => void
  onRetry: (command: WorkflowTransitionCommand) => void
}

export function WorkflowTransitionControls({
  workflow,
  stateVersion,
  transitionId,
  embedded = false,
  onConfirm,
  onReject,
  onRetry,
}: WorkflowTransitionControlsProps) {
  const [manualDialogOpen, setManualDialogOpen] = useState(false)
  const [manualSummary, setManualSummary] = useState('')
  const [manualEvidence, setManualEvidence] = useState('')
  const [clearNextPhaseContext, setClearNextPhaseContext] = useState(false)
  const manualSummaryRef = useRef<HTMLTextAreaElement>(null)
  const manualEvidenceRef = useRef<HTMLTextAreaElement>(null)

  if (!workflow) return null

  const phaseId = workflow.activePhaseId
  const pending = workflow.status === 'pending-confirmation' || workflow.pendingConfirmation
  const blocked = workflow.status === 'failed' || Boolean(workflow.blockedStatus) || Boolean(workflow.blockedReason)
  const canRequestConfirmation = workflow.status === 'running' && workflow.transitionAuthority === 'user-confirmation'

  if (!phaseId || (!pending && !blocked && !canRequestConfirmation)) return null

  const authorityLabel = authorityText(workflow.transitionAuthority)
  const hasNextPhase = workflow.activePhaseIndex >= 0 && workflow.phaseCount > workflow.activePhaseIndex + 1
  const commandBase = {
    phaseId,
    transitionId,
    stateVersion,
  }
  const contextStrategyCommand = clearNextPhaseContext && hasNextPhase
    ? { nextPhaseContextStrategy: 'clear' as const }
    : {}

  if (pending) {
    return (
      <section className={embedded
        ? 'rounded-[8px] border border-[var(--color-border)]/70 bg-[var(--color-surface-container)] px-3 py-2'
        : 'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3'}
      >
        <div className="mb-2 text-[12px] font-medium text-[var(--color-text-primary)]">
          Waiting for confirmation
        </div>
        <div className="mb-2 text-[11px] text-[var(--color-text-tertiary)]">
          Authority: {authorityLabel}
        </div>
        {hasNextPhase ? (
          <ContextStrategyCheckbox
            checked={clearNextPhaseContext}
            onChange={setClearNextPhaseContext}
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onConfirm({ ...commandBase, ...contextStrategyCommand, action: 'confirm' })}
            className="inline-flex h-8 items-center rounded-[7px] bg-[var(--color-brand)] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => onReject({ ...commandBase, action: 'reject' })}
            className="inline-flex h-8 items-center rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[12px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => onRetry({ ...commandBase, action: 'retry' })}
            className="inline-flex h-8 items-center rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[12px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            Retry
          </button>
        </div>
      </section>
    )
  }

  if (canRequestConfirmation) {
    const phaseLabel = phaseId.replace(/[-_]+/g, ' ')

    return (
      <section className={embedded
        ? 'flex flex-wrap items-center gap-2'
        : 'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3'}
      >
        <button
          type="button"
          onClick={() => setManualDialogOpen(true)}
          className="inline-flex h-8 items-center rounded-[7px] bg-[var(--color-brand)] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
        >
          Manually Complete Phase
        </button>
        <span className="inline-flex h-8 items-center text-[11px] text-[var(--color-text-tertiary)]">
          Authority: {authorityLabel}
        </span>
        {manualDialogOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Complete ${phaseLabel} phase`}
            className={`${embedded ? 'basis-full' : ''} mt-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3`}
          >
            <label className="block text-[12px] font-semibold text-[var(--color-text-primary)]">
              Summary
              <textarea
                ref={manualSummaryRef}
                name="summary"
                value={manualSummary}
                onChange={(event) => setManualSummary(event.target.value)}
                className="mt-1 min-h-[72px] w-full resize-y rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 py-1.5 text-[12px] font-normal text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
              />
            </label>
            <label className="mt-3 block text-[12px] font-semibold text-[var(--color-text-primary)]">
              Evidence
              <textarea
                ref={manualEvidenceRef}
                name="evidence"
                value={manualEvidence}
                onChange={(event) => setManualEvidence(event.target.value)}
                className="mt-1 min-h-[56px] w-full resize-y rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 py-1.5 text-[12px] font-normal text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
              />
            </label>
            {hasNextPhase ? (
              <ContextStrategyCheckbox
                checked={clearNextPhaseContext}
                onChange={setClearNextPhaseContext}
                className="mt-3"
              />
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const summaryValue = (manualSummaryRef.current?.value ?? manualSummary).trim()
                  const evidenceValue = (manualEvidenceRef.current?.value ?? manualEvidence).trim()
                  onRetry({
                    ...commandBase,
                    ...contextStrategyCommand,
                    action: 'manual_complete',
                    handoff: {
                      summary: summaryValue,
                      artifacts: [],
                    },
                    rationale: 'User manually confirmed this phase is complete.',
                    evidence: evidenceValue
                      ? [{
                        kind: 'manual',
                        label: 'Manual completion evidence',
                        ref: evidenceValue,
                      }]
                      : [],
                  })
                  setManualDialogOpen(false)
                }}
                className="inline-flex h-8 items-center rounded-[7px] bg-[var(--color-brand)] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
              >
                Confirm Completion
              </button>
              <button
                type="button"
                onClick={() => setManualDialogOpen(false)}
                className="inline-flex h-8 items-center rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[12px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <section className={embedded
      ? 'flex flex-wrap gap-2'
      : 'rounded-[var(--radius-lg)] border border-[var(--color-error)]/20 bg-[var(--color-error)]/6 p-3'}
    >
      {!embedded && workflow.blockedReason && (
        <p className="mb-2 text-[12px] leading-5 text-[var(--color-error)]">
          {workflow.blockedReason}
        </p>
      )}
      <div className={`${embedded ? 'basis-full' : 'mb-2'} text-[11px] text-[var(--color-text-tertiary)]`}>
        Recovery: {workflow.blockedStatus ?? 'failed'} · Authority: {authorityLabel}
      </div>
      <button
        type="button"
        onClick={() => onRetry({ ...commandBase, action: 'retry' })}
        className="inline-flex h-8 items-center rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[12px] font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
      >
        Retry
      </button>
    </section>
  )
}

function authorityText(authority?: string) {
  if (authority === 'user-confirmation') return 'User confirmation required'
  if (authority === 'auto') return 'Automatic transition'
  return authority ?? 'Automatic transition'
}

function ContextStrategyCheckbox({
  checked,
  onChange,
  className = 'mb-3',
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}) {
  return (
    <label className={`flex max-w-full items-start gap-2 rounded-[7px] border border-[var(--color-border)]/70 bg-[var(--color-surface-container-lowest)] px-2.5 py-2 ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
      />
      <span className="min-w-0 text-[11px] leading-4">
        <span className="block font-medium text-[var(--color-text-secondary)]">
          Use only handoff materials for next phase
        </span>
        <span className="block text-[var(--color-text-tertiary)]">
          Starts the next phase from accepted handoff and prior artifacts. It does not delete history.
        </span>
      </span>
    </label>
  )
}
