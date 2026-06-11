import type { WorkflowStatusPanelSummary } from './WorkflowStatusPanel'

type WorkflowReportLinkProps = {
  workflow?: WorkflowStatusPanelSummary | null
  compact?: boolean
}

export function WorkflowReportLink({ workflow, compact = false }: WorkflowReportLinkProps) {
  const pointer = workflow?.reportPointer
  const href = pointer?.uri ?? pointer?.artifactId

  if (!workflow || workflow.status !== 'completed' || !pointer || !href) return null

  return (
    <a
      href={href}
      data-compact={compact ? 'true' : 'false'}
      className={
        compact
          ? 'inline-flex max-w-full items-center gap-1.5 rounded-[7px] border border-[var(--color-border)]/70 bg-[var(--color-surface-container-lowest)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35'
          : 'inline-flex max-w-full items-center gap-2 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35'
      }
    >
      <span className="material-symbols-outlined shrink-0 text-[15px] text-[var(--color-text-tertiary)]" aria-hidden="true">
        description
      </span>
      <span className="min-w-0">
        <span className="block truncate">{pointer.label ?? 'Final workflow report'}</span>
        {compact ? null : (
          <span className="block truncate font-mono text-[10px] font-normal text-[var(--color-text-tertiary)]">{href}</span>
        )}
      </span>
    </a>
  )
}
