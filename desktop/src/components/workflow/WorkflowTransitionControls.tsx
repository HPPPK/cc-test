import type { WorkflowStatusPanelSummary } from './WorkflowStatusPanel'
import { useState } from 'react'

export type WorkflowTransitionCommand = {
  phaseId: string
  action: 'confirm' | 'reject' | 'retry' | 'manual_complete'
  transitionId?: string
  stateVersion?: number
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
  onConfirm: (command: WorkflowTransitionCommand) => void
  onReject: (command: WorkflowTransitionCommand) => void
  onRetry: (command: WorkflowTransitionCommand) => void
}

export function WorkflowTransitionControls({
  workflow,
  stateVersion,
  transitionId,
  onConfirm,
  onReject,
  onRetry,
}: WorkflowTransitionControlsProps) {
  const [manualDialogOpen, setManualDialogOpen] = useState(false)
  const [manualSummary, setManualSummary] = useState('')
  const [manualEvidence, setManualEvidence] = useState('')

  if (!workflow) return null

  const phaseId = workflow.activePhaseId
  const pending = workflow.status === 'pending-confirmation' || workflow.pendingConfirmation
  const blocked = workflow.status === 'failed' || Boolean(workflow.blockedReason)
  const canRequestConfirmation = workflow.status === 'running' && workflow.transitionAuthority === 'user-confirmation'

  if (!phaseId || (!pending && !blocked && !canRequestConfirmation)) return null

  const commandBase = {
    phaseId,
    transitionId,
    stateVersion,
  }

  if (canRequestConfirmation) {
    const phaseLabel = phaseId.replace(/[-_]+/g, ' ')
    const trimmedSummary = manualSummary.trim()
    const trimmedEvidence = manualEvidence.trim()

    return (
      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3">
        <button
          type="button"
          onClick={() => setManualDialogOpen(true)}
          className="inline-flex h-8 items-center rounded-[7px] bg-[var(--color-brand)] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
        >
          Complete Phase
        </button>
        {manualDialogOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Complete ${phaseLabel} phase`}
            className="mt-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <label className="block text-[12px] font-semibold text-[var(--color-text-primary)]">
              Summary
              <textarea
                value={manualSummary}
                onChange={(event) => setManualSummary(event.target.value)}
                className="mt-1 min-h-[72px] w-full resize-y rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 py-1.5 text-[12px] font-normal text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
              />
            </label>
            <label className="mt-3 block text-[12px] font-semibold text-[var(--color-text-primary)]">
              Evidence
              <textarea
                value={manualEvidence}
                onChange={(event) => setManualEvidence(event.target.value)}
                className="mt-1 min-h-[56px] w-full resize-y rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 py-1.5 text-[12px] font-normal text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onRetry({
                    ...commandBase,
                    action: 'manual_complete',
                    handoff: {
                      summary: trimmedSummary,
                      artifacts: [],
                    },
                    rationale: 'User manually confirmed this phase is complete.',
                    evidence: trimmedEvidence
                      ? [{
                        kind: 'manual',
                        label: 'Manual completion evidence',
                        ref: trimmedEvidence,
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

  if (pending) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3">
        <div className="mb-2 text-[12px] font-medium text-[var(--color-text-primary)]">
          Waiting for confirmation
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onConfirm({ ...commandBase, action: 'confirm' })}
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

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-error)]/20 bg-[var(--color-error)]/6 p-3">
      {workflow.blockedReason && (
        <p className="mb-2 text-[12px] leading-5 text-[var(--color-error)]">
          {workflow.blockedReason}
        </p>
      )}
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
