import { useEffect, useMemo, useState } from 'react'
import { sessionsApi } from '../../api/sessions'
import { useTranslation } from '../../i18n'
import type {
  WorkflowTemplateImportCandidate,
  WorkflowTemplateImportPayload,
  WorkflowTemplateImportResolution,
  WorkflowTemplateListItem,
  WorkflowTemplateSelector,
  WorkflowTemplatesResponse,
} from '../../types/session'
import { localizeWorkflowTemplateDisplay, workflowTemplateSourceLabel } from './workflowTemplateDisplay'

type WorkflowImportExportDialogProps = {
  mode: 'import' | 'export'
  open: boolean
  templates: WorkflowTemplateListItem[]
  initialSelectedTemplates?: WorkflowTemplateSelector[]
  onClose: () => void
  onImported?: (response: WorkflowTemplatesResponse) => void
}

const EMPTY_TEMPLATE_SELECTION: WorkflowTemplateSelector[] = []

type SelectionState = {
  selected: boolean
  resolution: WorkflowTemplateImportResolution
  targetId: string
}

export function WorkflowImportExportDialog({
  mode,
  open,
  templates,
  initialSelectedTemplates = EMPTY_TEMPLATE_SELECTION,
  onClose,
  onImported,
}: WorkflowImportExportDialogProps) {
  const t = useTranslation()
  const [importText, setImportText] = useState('')
  const [payload, setPayload] = useState<WorkflowTemplateImportPayload | null>(null)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof sessionsApi.previewWorkflowTemplateImport>> | null>(null)
  const [candidateSelections, setCandidateSelections] = useState<Record<string, SelectionState>>({})
  const [selectedExportKeys, setSelectedExportKeys] = useState<Set<string>>(new Set())
  const [exportText, setExportText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    setImportText('')
    setPayload(null)
    setPreview(null)
    setCandidateSelections({})
    setExportText('')
    setBusy(false)
    setError(null)
    setSuccess(null)
    setSelectedExportKeys(new Set(initialSelectedTemplates.map(templateKey)))
  }, [initialSelectedTemplates, open])

  const selectedExportTemplates = useMemo(
    () => templates.filter((template) => selectedExportKeys.has(templateKey(template))),
    [selectedExportKeys, templates],
  )

  if (!open) return null

  const previewCandidates = preview?.candidates ?? []
  const invalidTemplates = preview?.invalidTemplates ?? []
  const selectedImportCount = previewCandidates.filter(
    (candidate) => candidateSelections[candidate.importId]?.selected,
  ).length

  const handlePreview = async () => {
    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const parsedPayload = parseImportPayload(importText)
      const response = await sessionsApi.previewWorkflowTemplateImport({ payload: parsedPayload })
      setPayload(parsedPayload)
      setPreview(response)
      setCandidateSelections(Object.fromEntries(
        response.candidates.map((candidate) => [
          candidate.importId,
          {
            selected: candidate.selectable,
            resolution: defaultResolution(candidate),
            targetId: candidate.proposedId,
          },
        ]),
      ))
    } catch (previewError) {
      setPayload(null)
      setPreview(null)
      setCandidateSelections({})
      setError(previewError instanceof Error ? previewError.message : t('settings.workflows.import.invalidJson'))
    } finally {
      setBusy(false)
    }
  }

  const handleCommitImport = async () => {
    if (!payload || !preview) return

    const selections = preview.candidates
      .filter((candidate) => candidateSelections[candidate.importId]?.selected)
      .map((candidate) => {
        const selection = candidateSelections[candidate.importId] ?? {
          selected: false,
          resolution: defaultResolution(candidate),
          targetId: candidate.proposedId,
        }
        return {
          importId: candidate.importId,
          resolution: selection.resolution,
          targetId: selection.targetId,
        }
      })

    if (selections.length === 0) {
      setError(t('settings.workflows.import.error.noSelection'))
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await sessionsApi.commitWorkflowTemplateImport({ payload, selections })
      onImported?.(response)
      setSuccess(t('settings.workflows.import.success', { count: response.imported?.length ?? selections.length }))
    } catch (commitError) {
      setError(errorMessage(commitError))
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async () => {
    if (selectedExportTemplates.length === 0) {
      setError(t('settings.workflows.export.error.noSelection'))
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await sessionsApi.exportWorkflowTemplates({
        mode: 'selected',
        templates: selectedExportTemplates.map(({ source, id }) => ({ source, id })),
      })
      setExportText(JSON.stringify(response, null, 2))
      setSuccess(t('settings.workflows.export.success', { count: response.templates.length }))
    } catch (exportError) {
      setError(errorMessage(exportError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'import' ? t('settings.workflows.import.title') : t('settings.workflows.export.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {mode === 'import' ? t('settings.workflows.import.title') : t('settings.workflows.export.title')}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
              {mode === 'import' ? t('settings.workflows.import.description') : t('settings.workflows.export.description')}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('settings.workflows.dialog.close')}
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-4 py-4">
          {error && (
            <Alert tone="error">{error}</Alert>
          )}
          {success && (
            <Alert tone="success">{success}</Alert>
          )}

          {mode === 'import' ? (
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {t('settings.workflows.import.jsonLabel')}
                </span>
                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder={t('settings.workflows.import.jsonPlaceholder')}
                  className="mt-1 min-h-[150px] w-full resize-y rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20"
                />
              </label>

              <button
                type="button"
                onClick={handlePreview}
                disabled={busy || importText.trim().length === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[var(--color-brand)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">plagiarism</span>
                {t('settings.workflows.import.preview')}
              </button>

              {preview && (
                <ImportPreview
                  candidates={previewCandidates}
                  invalidTemplates={invalidTemplates}
                  selections={candidateSelections}
                  onSelectionChange={(importId, next) => {
                    setCandidateSelections((current) => ({
                      ...current,
                      [importId]: mergeSelection(current[importId], next),
                    }))
                  }}
                />
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]">
                {templates.length > 0 ? templates.map((template) => {
                  const key = templateKey(template)
                  const displayTemplate = localizeWorkflowTemplateDisplay(template, t)
                  return (
                    <label
                      key={key}
                      className="flex min-w-0 items-start gap-3 border-b border-[var(--color-border)] px-3 py-3 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedExportKeys.has(key)}
                        onChange={(event) => {
                          setSelectedExportKeys((current) => {
                            const next = new Set(current)
                            if (event.target.checked) next.add(key)
                            else next.delete(key)
                            return next
                          })
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)]"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">
                          {displayTemplate.name}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--color-text-tertiary)]">
                          {workflowTemplateSourceLabel(template.source, t)}:{template.id} - v{template.version} - {t('settings.workflows.manager.phaseCount', { count: template.phaseCount })}
                        </span>
                      </span>
                    </label>
                  )
                }) : (
                  <div className="px-3 py-4 text-sm text-[var(--color-text-secondary)]">
                    {t('settings.workflows.manager.empty')}
                  </div>
                )}
              </div>

              <p className="text-xs leading-5 text-[var(--color-text-tertiary)]">
                {t('settings.workflows.export.privacyNote')}
              </p>

              <button
                type="button"
                onClick={handleExport}
                disabled={busy || selectedExportTemplates.length === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[var(--color-brand)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">ios_share</span>
                {t('settings.workflows.export.generate')}
              </button>

              {exportText && (
                <label className="block">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    {t('settings.workflows.export.jsonLabel')}
                  </span>
                  <textarea
                    readOnly
                    value={exportText}
                    className="mt-1 min-h-[220px] w-full resize-y rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-text-primary)]"
                  />
                </label>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3">
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {mode === 'import'
              ? t('settings.workflows.import.selectedCount', { count: selectedImportCount })
              : t('settings.workflows.export.selectedCount', { count: selectedExportTemplates.length })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center rounded-[7px] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            >
              {t('common.cancel')}
            </button>
            {mode === 'import' && (
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={busy || !preview?.canCommit || selectedImportCount === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[var(--color-brand)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">download_done</span>
                {t('settings.workflows.import.commit')}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

function ImportPreview({
  candidates,
  invalidTemplates,
  selections,
  onSelectionChange,
}: {
  candidates: WorkflowTemplateImportCandidate[]
  invalidTemplates: Awaited<ReturnType<typeof sessionsApi.previewWorkflowTemplateImport>>['invalidTemplates']
  selections: Record<string, SelectionState>
  onSelectionChange: (importId: string, next: Partial<SelectionState>) => void
}) {
  const t = useTranslation()

  return (
    <section data-testid="workflow-import-preview" className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {t('settings.workflows.import.previewTitle')}
        </h4>
        <StatusChip>{t('settings.workflows.import.candidateCount', { count: candidates.length })}</StatusChip>
        <StatusChip>{t('settings.workflows.import.invalidCount', { count: invalidTemplates.length })}</StatusChip>
      </div>

      {invalidTemplates.length > 0 && (
        <IssueList title={t('settings.workflows.import.invalidTitle')} issues={invalidTemplates} />
      )}

      <div className="overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]">
        {candidates.length > 0 ? candidates.map((candidate) => {
          const selection = selections[candidate.importId] ?? {
            selected: false,
            resolution: defaultResolution(candidate),
            targetId: candidate.proposedId,
          }
          const resolutionOptions = candidate.conflict === 'builtin-template'
            ? ['rename'] as const
            : candidate.conflict === 'user-template'
              ? ['rename', 'overwrite'] as const
              : ['add', 'rename'] as const

          return (
            <article
              key={candidate.importId}
              data-testid={`workflow-import-candidate-${candidate.importId}`}
              className="grid min-w-0 gap-3 border-b border-[var(--color-border)] px-3 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_260px]"
            >
              <div className="min-w-0">
                <label className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selection.selected}
                    disabled={!candidate.selectable}
                    onChange={(event) => onSelectionChange(candidate.importId, { selected: event.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)]"
                  />
                  <span className="min-w-0">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                        {candidate.name}
                      </span>
                      <StatusChip>{candidate.conflict}</StatusChip>
                      {!candidate.selectable && <StatusChip>{t('settings.workflows.import.notSelectable')}</StatusChip>}
                    </span>
                    <span className="mt-1 block font-mono text-[11px] text-[var(--color-text-tertiary)]">
                      {candidate.originalId}
                      {' -> '}
                      {candidate.proposedId}
                      {' - '}
                      v{candidate.version}
                      {' - '}
                      {t('settings.workflows.manager.phaseCount', { count: candidate.phaseCount })}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--color-text-secondary)]">
                      {t('settings.workflows.import.defaultResolution', { resolution: candidate.defaultResolution })}
                    </span>
                  </span>
                </label>

                {candidate.issues.length > 0 && (
                  <IssueList title={t('settings.workflows.import.candidateIssues')} issues={candidate.issues} compact />
                )}
              </div>

              <div className="space-y-2">
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
                    {t('settings.workflows.import.resolution')}
                  </span>
                  <select
                    value={selection.resolution}
                    disabled={!candidate.selectable || !selection.selected}
                    onChange={(event) => {
                      const resolution = event.target.value as WorkflowTemplateImportResolution
                      onSelectionChange(candidate.importId, {
                        resolution,
                        targetId: resolution === 'overwrite' ? candidate.originalId : candidate.proposedId,
                      })
                    }}
                    className="mt-1 h-8 w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-primary)]"
                  >
                    {resolutionOptions.map((resolution) => (
                      <option key={resolution} value={resolution}>
                        {resolution}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
                    {t('settings.workflows.import.targetId')}
                  </span>
                  <input
                    value={selection.targetId}
                    disabled={!candidate.selectable || !selection.selected || selection.resolution === 'overwrite'}
                    onChange={(event) => onSelectionChange(candidate.importId, { targetId: event.target.value })}
                    className="mt-1 h-8 w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 font-mono text-xs text-[var(--color-text-primary)]"
                  />
                </label>
              </div>
            </article>
          )
        }) : (
          <div className="px-3 py-4 text-sm text-[var(--color-text-secondary)]">
            {t('settings.workflows.import.noCandidates')}
          </div>
        )}
      </div>
    </section>
  )
}

function IssueList({
  title,
  issues,
  compact = false,
}: {
  title: string
  issues: Array<{ templateId?: string; path: string; code: string; message: string; severity: string }>
  compact?: boolean
}) {
  return (
    <section className={`${compact ? 'mt-3' : ''} rounded-[8px] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/8 px-3 py-2`}>
      <h5 className="text-xs font-semibold text-[var(--color-warning)]">{title}</h5>
      <ul className="mt-2 space-y-1.5">
        {issues.map((issue, index) => (
          <li key={`${issue.templateId ?? 'template'}:${issue.path}:${issue.code}:${index}`} className="text-xs leading-5 text-[var(--color-text-secondary)]">
            <span className="font-mono text-[var(--color-text-primary)]">{issue.templateId ?? issue.severity}</span>
            {' '}
            <span className="font-mono">{issue.code}</span>
            {' '}
            <span className="font-mono text-[var(--color-text-tertiary)]">{issue.path}</span>
            {' - '}
            {issue.message}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Alert({ tone, children }: { tone: 'error' | 'success'; children: string }) {
  const classes = tone === 'error'
    ? 'border-[var(--color-error)]/30 bg-[var(--color-error)]/8 text-[var(--color-error)]'
    : 'border-[var(--color-success)]/30 bg-[var(--color-success)]/8 text-[var(--color-success)]'

  return (
    <div className={`mb-3 rounded-[8px] border px-3 py-2 text-xs ${classes}`}>
      {children}
    </div>
  )
}

function StatusChip({ children }: { children: string }) {
  return (
    <span className="shrink-0 rounded-[5px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--color-text-tertiary)]">
      {children}
    </span>
  )
}

function parseImportPayload(value: string): WorkflowTemplateImportPayload {
  try {
    return JSON.parse(value) as WorkflowTemplateImportPayload
  } catch {
    throw new Error('Import JSON is invalid. Paste a workflow template export or a single template object.')
  }
}

function defaultResolution(candidate: WorkflowTemplateImportCandidate): WorkflowTemplateImportResolution {
  if (candidate.conflict === 'none') return candidate.defaultResolution
  return 'rename'
}

function mergeSelection(
  current: SelectionState | undefined,
  next: Partial<SelectionState>,
): SelectionState {
  return {
    selected: next.selected ?? current?.selected ?? false,
    resolution: next.resolution ?? current?.resolution ?? 'add',
    targetId: next.targetId ?? current?.targetId ?? '',
  }
}

function templateKey(template: WorkflowTemplateSelector) {
  return `${template.source}:${template.id}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
