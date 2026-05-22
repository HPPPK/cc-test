import type { WorkflowStatusPanelSummary } from './WorkflowStatusPanel'

type WorkflowReportLinkProps = {
  workflow?: WorkflowStatusPanelSummary | null
}

export function WorkflowReportLink({ workflow }: WorkflowReportLinkProps) {
  const pointer = workflow?.reportPointer
  const href = pointer?.uri ?? pointer?.artifactId

  if (!workflow || workflow.status !== 'completed' || !pointer || !href) return null

  return (
    <a
      href={href}
      className="inline-flex max-w-full items-center gap-2 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
    >
      <span className="material-symbols-outlined shrink-0 text-[15px] text-[var(--color-text-tertiary)]" aria-hidden="true">
        description
      </span>
      <span className="min-w-0">
        <span className="block truncate">{pointer.label ?? 'Final workflow report'}</span>
        <span className="block truncate font-mono text-[10px] font-normal text-[var(--color-text-tertiary)]">{href}</span>
      </span>
    </a>
  )
}
