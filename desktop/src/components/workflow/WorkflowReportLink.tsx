import { useEffect, useMemo, useRef, useState } from 'react'
import { sessionsApi, type WorkflowReportResponse } from '../../api/sessions'
import { Modal } from '../shared/Modal'
import { CopyButton } from '../shared/CopyButton'
import type { WorkflowStatusPanelSummary } from './WorkflowStatusPanel'

type WorkflowReportLinkProps = {
  workflow?: WorkflowStatusPanelSummary | null
  compact?: boolean
  openRequestId?: number
  onOpenHandled?: () => void
}

export function WorkflowReportLink({ workflow, compact = false, openRequestId, onOpenHandled }: WorkflowReportLinkProps) {
  const pointer = workflow?.reportPointer
  const displayRef = pointer?.uri ?? pointer?.artifactId
  const sessionId = pointer?.sessionId ?? workflow?.statePointer?.sessionId
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportResponse, setReportResponse] = useState<WorkflowReportResponse | null>(null)
  const handledOpenRequestId = useRef<number | undefined>(undefined)

  const reportJson = useMemo(() => {
    if (!reportResponse) return ''
    return JSON.stringify(reportResponse.report, null, 2)
  }, [reportResponse])

  const loadReport = async () => {
    if (!sessionId) {
      setError('Workflow session id is missing.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await sessionsApi.getWorkflowReport(sessionId)
      setReportResponse(response)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load workflow report.')
    } finally {
      setLoading(false)
    }
  }

  const openReport = () => {
    setOpen(true)
    if (!reportResponse && !loading) {
      void loadReport()
    }
  }

  useEffect(() => {
    if (
      openRequestId === undefined ||
      openRequestId === 0 ||
      handledOpenRequestId.current === openRequestId
    ) return

    handledOpenRequestId.current = openRequestId
    openReport()
    onOpenHandled?.()
  }, [openRequestId])

  if (!workflow || workflow.status !== 'completed' || !pointer || !displayRef) return null

  const downloadReport = () => {
    if (!reportJson) return
    const blob = new Blob([reportJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${sessionId ?? pointer.artifactId ?? 'workflow'}-final-report.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const modalFooter = reportJson || error ? (
    <>
      {reportJson ? (
        <>
          <CopyButton
            text={reportJson}
            label="Copy report JSON"
            copiedLabel="Copied report JSON"
            displayLabel={(
              <span className="inline-flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">content_copy</span>
                Copy JSON
              </span>
            )}
            displayCopiedLabel={(
              <span className="inline-flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">check</span>
                Copied
              </span>
            )}
            className="inline-flex h-9 items-center gap-1.5 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[12px] font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          />
          <button
            type="button"
            onClick={downloadReport}
            className="inline-flex h-9 items-center gap-1.5 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[12px] font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">download</span>
            Download JSON
          </button>
        </>
      ) : null}
      {error ? (
        <button
          type="button"
          onClick={() => void loadReport()}
          disabled={loading}
          className="inline-flex h-9 items-center gap-1.5 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[12px] font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">refresh</span>
          Retry
        </button>
      ) : null}
    </>
  ) : null

  return (
    <>
      <button
        type="button"
        onClick={openReport}
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
        <span className="min-w-0 text-left">
          <span className="block truncate">{pointer.label ?? 'Final workflow report'}</span>
          {compact ? null : (
            <span className="block truncate font-mono text-[10px] font-normal text-[var(--color-text-tertiary)]">{displayRef}</span>
          )}
        </span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={pointer.label ?? 'Final workflow report'}
        width={820}
        footer={modalFooter}
      >
        <div className="space-y-3">
          <div className="grid gap-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[12px] sm:grid-cols-2">
            <ReportMeta label="Session" value={sessionId ?? 'unknown'} />
            <ReportMeta label="Artifact" value={pointer.artifactId ?? pointer.id ?? displayRef} />
            <ReportMeta label="Kind" value={pointer.kind ?? 'final-report'} />
            <ReportMeta label="Created" value={pointer.createdAt ?? reportResponse?.pointer.createdAt ?? 'unknown'} />
          </div>

          {loading ? (
            <div role="status" className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-8 text-center text-[13px] text-[var(--color-text-secondary)]">
              Loading workflow report...
            </div>
          ) : error ? (
            <div role="alert" className="rounded-[8px] border border-[var(--color-error)]/30 bg-[var(--color-error-container)]/40 px-3 py-2 text-[13px] text-[var(--color-error)]">
              {error}
            </div>
          ) : reportJson ? (
            <pre
              data-testid="workflow-final-report-json"
              className="max-h-[52vh] overflow-auto rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3 font-mono text-[11px] leading-5 text-[var(--color-text-primary)]"
            >
              {reportJson}
            </pre>
          ) : null}
        </div>
      </Modal>
    </>
  )
}

function ReportMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase text-[var(--color-text-tertiary)]">{label}</div>
      <div className="truncate font-mono text-[11px] text-[var(--color-text-primary)]" title={value}>{value}</div>
    </div>
  )
}
