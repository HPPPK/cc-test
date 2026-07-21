import { useEffect, useRef, useState } from 'react'
import { createWorkflowTransitionId } from '../../api/websocket'
import { useTranslation } from '../../i18n'
import type { WorkflowStatusPanelSummary } from './WorkflowStatusPanel'
import { formatWorkflowPhaseSummary } from './workflowPhaseDisplay'

export type WorkflowTransitionCommand = {
  phaseId: string
  action: 'confirm' | 'reject' | 'retry' | 'manual_complete' | 'pause' | 'resume' | 'stop'
  transitionId?: string
  confirmationId?: string
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
  pendingTransition?: WorkflowTransitionCommand | null
  transitionError?: string | null
  transitionErrorScope?: { phaseId: string; stateVersion?: number; confirmationId?: string } | null
  transitionResetKey?: number
  transitionSyncing?: boolean
  embedded?: boolean
  onConfirm: (command: WorkflowTransitionCommand) => void
  onReject: (command: WorkflowTransitionCommand) => void
  onRetry: (command: WorkflowTransitionCommand) => void
}

export function WorkflowTransitionControls({
  workflow,
  stateVersion,
  pendingTransition = null,
  transitionError = null,
  transitionErrorScope = null,
  transitionResetKey = 0,
  transitionSyncing = false,
  embedded = false,
  onConfirm,
  onReject,
  onRetry,
}: WorkflowTransitionControlsProps) {
  const t = useTranslation()
  const [localPending, setLocalPending] = useState(false)
  const submissionLockRef = useRef(false)
  const lastWorkflowStateRef = useRef<string | null>(null)
  const lastResetKeyRef = useRef(transitionResetKey)

  if (!workflow) return null

  const phaseId = workflow.activePhaseId
  const pending = workflow.status === 'pending-confirmation' || workflow.pendingConfirmation
  const blocked = workflow.status === 'failed' || Boolean(workflow.blockedStatus) || Boolean(workflow.blockedReason)

  if (!phaseId || (!pending && !blocked)) return null

  const routeTarget = workflowRouteTarget(workflow, t)
  const isJumpRoute = isNonLinearRouteTarget(workflow) && Boolean(routeTarget)
  const confirmationId = workflow.pendingConfirmationId
  const workflowStateKey = `${phaseId}:${typeof stateVersion === 'number' ? stateVersion : 'unknown'}:${confirmationId ?? 'missing'}`

  useEffect(() => {
    const workflowStateChanged = lastWorkflowStateRef.current !== null && lastWorkflowStateRef.current !== workflowStateKey
    const resetRequested = lastResetKeyRef.current !== transitionResetKey
    if (workflowStateChanged || resetRequested) {
      submissionLockRef.current = false
      setLocalPending(false)
    }
    lastWorkflowStateRef.current = workflowStateKey
    lastResetKeyRef.current = transitionResetKey
  }, [transitionResetKey, workflowStateKey])

  const pendingTransitionMatchesCurrentConfirmation = Boolean(
    pendingTransition
      && pendingTransition.phaseId === phaseId
      && typeof pendingTransition.stateVersion === 'number'
      && typeof stateVersion === 'number'
      && pendingTransition.stateVersion === stateVersion
      && (
        (pendingTransition.action !== 'confirm' && pendingTransition.action !== 'reject')
        || pendingTransition.confirmationId === confirmationId
      ),
  )
  const confirmationCredentialMissing = pending && !confirmationId
  const transitionPending = transitionSyncing || confirmationCredentialMissing || localPending || pendingTransitionMatchesCurrentConfirmation
  const transitionErrorMatchesCurrentConfirmation = Boolean(
    transitionError
      && (!transitionErrorScope || (
        transitionErrorScope.phaseId === phaseId
        && typeof transitionErrorScope.stateVersion === 'number'
        && transitionErrorScope.stateVersion === stateVersion
        && (
          !transitionErrorScope.confirmationId
          || transitionErrorScope.confirmationId === confirmationId
        )
      )),
  )
  const submitTransition = (
    handler: (command: WorkflowTransitionCommand) => void,
    action: WorkflowTransitionCommand['action'],
  ) => {
    if (submissionLockRef.current || pendingTransitionMatchesCurrentConfirmation) return
    if ((action === 'confirm' || action === 'reject') && !confirmationId) return

    submissionLockRef.current = true
    setLocalPending(true)
    handler({
      phaseId,
      action,
      transitionId: createWorkflowTransitionId(phaseId, stateVersion, action, confirmationId),
      ...(action === 'confirm' || action === 'reject' ? { confirmationId } : {}),
      stateVersion,
    })
  }
  const transitionNotice = confirmationCredentialMissing
    ? '正在同步最新阶段确认信息，请稍候…'
    : (transitionErrorMatchesCurrentConfirmation ? transitionError : null) || (transitionPending ? '正在提交阶段操作，请稍候…' : null)
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
        {transitionNotice ? (
          <p role="status" className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">{transitionNotice}</p>
        ) : null}
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <OptionButton
            icon="refresh"
            title={t('workflows.transition.retryTitle')}
            description={t('workflows.transition.retryDescription')}
            disabled={transitionPending}
            onClick={() => submitTransition(onRetry, 'retry')}
          />
          <OptionButton
            icon="pause_circle"
            title={t('workflows.transition.pauseTitle')}
            description={t('workflows.transition.pauseDescription')}
            disabled={transitionPending}
            onClick={() => submitTransition(onRetry, 'pause')}
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

      {transitionNotice ? (
        <p role="status" className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">{transitionNotice}</p>
      ) : null}

      <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-outline-variant)]/30 bg-[var(--color-surface)] px-3 py-2">
        <div className="text-xs font-semibold text-[var(--color-text-primary)]">{t('workflows.transition.summaryTitle')}</div>
        <ul className="mt-1.5 space-y-1 text-xs leading-5 text-[var(--color-text-secondary)]">
          <li>{t('workflows.transition.currentPhase', { phase: formatWorkflowPhaseSummary(workflow) })}</li>
          <li>{t('workflows.transition.keyResult')}</li>
          {routeTarget ? <li>{t('workflows.transition.nextStep', { step: routeTarget })}</li> : null}
        </ul>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <OptionButton
          icon="thumb_up"
          title={t('workflows.transition.continueTitle')}
          description={
            routeTarget
              ? isJumpRoute
                ? t('workflows.transition.moveToRouteTarget', { step: routeTarget })
                : t('workflows.transition.moveToNext', { step: routeTarget })
              : ''
          }
          disabled={transitionPending}
          onClick={() => submitTransition(onConfirm, 'confirm')}
        />
        <OptionButton
          icon="edit"
          title={t('workflows.transition.adjustTitle')}
          description={t('workflows.transition.adjustDescription')}
          disabled={transitionPending}
          onClick={() => submitTransition(onReject, 'reject')}
        />
        <OptionButton
          icon="pause_circle"
          title={t('workflows.transition.pauseTitle')}
          description={t('workflows.transition.pauseDescription')}
          disabled={transitionPending}
          onClick={() => submitTransition(onRetry, 'pause')}
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
  disabled = false,
}: {
  icon: string
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[88px] w-full items-center gap-3 rounded-[12px] border border-[var(--color-outline-variant)]/40 bg-[var(--color-surface)] px-4 py-3 text-left transition-all duration-150 hover:border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container-low)] disabled:cursor-not-allowed disabled:opacity-55"
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

function isNonLinearRouteTarget(workflow: WorkflowStatusPanelSummary): boolean {
  return workflow.pendingRoute?.intent === 'jump_to_phase'
}

function workflowRouteTarget(
  workflow: WorkflowStatusPanelSummary,
  translate: ReturnType<typeof useTranslation>,
): string | null {
  if (typeof workflow.pendingTargetPhaseIndex === 'number') {
    const label = workflow.pendingTargetPhaseLabel
      ?? workflow.phaseNames?.[workflow.pendingTargetPhaseIndex]
      ?? workflow.pendingTargetPhaseId
    if (!label) return translate('workflows.transition.nextStepNumber', { step: workflow.pendingTargetPhaseIndex + 1 })
    return isNonLinearRouteTarget(workflow)
      ? translate('workflows.transition.routeTargetWithName', { step: workflow.pendingTargetPhaseIndex + 1, name: label })
      : translate('workflows.transition.nextStepWithName', { step: workflow.pendingTargetPhaseIndex + 1, name: label })
  }
  if (workflow.pendingTargetPhaseLabel) return workflow.pendingTargetPhaseLabel
  return null
}
