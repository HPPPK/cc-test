import { useTranslation } from '../../i18n'
import type { WorkflowStatusPanelSummary } from './WorkflowStatusPanel'
import { formatWorkflowPhaseSummary } from './workflowPhaseDisplay'

export type WorkflowTransitionCommand = {
  phaseId: string
  action: 'confirm' | 'reject' | 'retry' | 'manual_complete' | 'pause' | 'resume' | 'stop'
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
  const t = useTranslation()

  if (!workflow) return null

  const phaseId = workflow.activePhaseId
  const pending = workflow.status === 'pending-confirmation' || workflow.pendingConfirmation
  const blocked = workflow.status === 'failed' || Boolean(workflow.blockedStatus) || Boolean(workflow.blockedReason)

  if (!phaseId || (!pending && !blocked)) return null

  const hasNextPhase = workflow.activePhaseIndex >= 0 && workflow.phaseCount > workflow.activePhaseIndex + 1
  const commandBase = {
    phaseId,
    transitionId,
    stateVersion,
  }
  if (blocked && !pending) {
    return (
      <section
        data-testid="workflow-phase-confirmation-card"
        className={cardClassName(embedded, true)}
      >
        <div className="flex items-start gap-3">
          <Icon tone="error" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t('workflows.transition.attentionTitle')}</h2>
            {workflow.blockedReason ? (
              <p className="mt-1 text-xs leading-5 text-[var(--color-error)]">{workflow.blockedReason}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <OptionButton
            icon="refresh"
            title={t('workflows.transition.retryTitle')}
            description={t('workflows.transition.retryDescription')}
            onClick={() => onRetry({ ...commandBase, action: 'retry' })}
          />
          <OptionButton
            icon="pause_circle"
            title={t('workflows.transition.pauseTitle')}
            description={t('workflows.transition.pauseDescription')}
            onClick={() => onRetry({ ...commandBase, action: 'pause' })}
          />
        </div>
      </section>
    )
  }

  return (
    <section
      data-testid="workflow-phase-confirmation-card"
      className={cardClassName(embedded)}
    >
      <div className="flex items-start gap-3">
        <Icon />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t('workflows.transition.confirmTitle')}</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            {t('workflows.transition.confirmDescription')}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)]/30 bg-[var(--color-surface)] px-3 py-2">
        <div className="text-xs font-semibold text-[var(--color-text-primary)]">{t('workflows.transition.summaryTitle')}</div>
        <ul className="mt-1.5 space-y-1 text-xs leading-5 text-[var(--color-text-secondary)]">
          <li>{t('workflows.transition.currentPhase', { phase: formatWorkflowPhaseSummary(workflow) })}</li>
          <li>{t('workflows.transition.keyResult')}</li>
          <li>{t('workflows.transition.nextStep', { step: hasNextPhase ? nextPhaseLabel(workflow, t) : t('workflows.transition.finishWorkflow') })}</li>
        </ul>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <OptionButton
          icon="thumb_up"
          title={t('workflows.transition.continueTitle')}
          description={hasNextPhase ? t('workflows.transition.moveToNext', { step: nextPhaseLabel(workflow, t) }) : t('workflows.transition.finishWorkflow')}
          onClick={() => onConfirm({ ...commandBase, action: 'confirm' })}
        />
        <OptionButton
          icon="edit"
          title={t('workflows.transition.adjustTitle')}
          description={t('workflows.transition.adjustDescription')}
          onClick={() => onReject({ ...commandBase, action: 'reject' })}
        />
        <OptionButton
          icon="pause_circle"
          title={t('workflows.transition.pauseTitle')}
          description={t('workflows.transition.pauseDescription')}
          onClick={() => onRetry({ ...commandBase, action: 'pause' })}
        />
      </div>
    </section>
  )
}

function cardClassName(embedded: boolean, error = false) {
  return [
    'mx-auto mb-4 w-full max-w-[860px] overflow-hidden rounded-[18px] border px-5 py-4 shadow-sm',
    embedded ? 'bg-[var(--color-surface-container-lowest)]' : 'bg-[var(--color-surface-container-lowest)]',
    error ? 'border-[var(--color-error)]/25' : 'border-[var(--color-brand)]/30',
  ].join(' ')
}

function Icon({ tone = 'normal' }: { tone?: 'normal' | 'error' }) {
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${tone === 'error' ? 'bg-[var(--color-error)]/10' : 'bg-[var(--color-brand)]/10'}`}>
      <span className={`material-symbols-outlined text-[18px] ${tone === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-brand)]'}`} aria-hidden="true">
        {tone === 'error' ? 'priority_high' : 'fact_check'}
      </span>
    </div>
  )
}

function OptionButton({
  icon,
  title,
  description,
  onClick,
}: {
  icon: string
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[88px] w-full items-center gap-3 rounded-[12px] border border-[var(--color-outline-variant)]/40 bg-[var(--color-surface)] px-4 py-3 text-left transition-all duration-150 hover:border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-low)]"
    >
      <span className="material-symbols-outlined shrink-0 text-[24px] text-[var(--color-text-primary)]" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--color-text-primary)]">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-[var(--color-text-secondary)]">
          {description}
        </span>
      </span>
    </button>
  )
}

function nextPhaseLabel(workflow: WorkflowStatusPanelSummary, translate: ReturnType<typeof useTranslation>) {
  const nextIndex = workflow.activePhaseIndex + 1
  const nextName = workflow.phaseNames?.[nextIndex]
  if (nextName) {
    return translate('workflows.transition.nextStepWithName', { step: nextIndex + 1, name: nextName })
  }
  return translate('workflows.transition.nextStepNumber', { step: nextIndex + 1 })
}
