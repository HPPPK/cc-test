import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from '../../i18n'
import type {
  WorkflowTemplateListItem,
  WorkflowTemplateSource,
  WorkflowTemplateValidationIssue,
} from '../../types/session'
import { localizeWorkflowTemplateDisplay } from './workflowTemplateDisplay'

export type WorkflowStartDialogSelection = {
  templateId: string
  templateSource: WorkflowTemplateSource
  initialPhaseId: string
}

type WorkflowStartDialogProps = {
  open: boolean
  templates: WorkflowTemplateListItem[]
  invalidTemplates?: WorkflowTemplateValidationIssue[]
  selectedTemplateId?: string | null
  onSelect: (selection: {
    templateId: string
    templateSource: WorkflowTemplateSource
  }) => void
  onStart: (selection: WorkflowStartDialogSelection) => void
  onClose: () => void
  starting?: boolean
}

export function WorkflowStartDialog({
  open,
  templates,
  invalidTemplates = [],
  selectedTemplateId = null,
  onSelect,
  onStart,
  onClose,
  starting = false,
}: WorkflowStartDialogProps) {
  const t = useTranslation()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => {
      if (a.source !== b.source) return a.source === 'builtin' ? -1 : 1
      return a.name.localeCompare(b.name)
    }),
    [templates],
  )
  const selectedTemplate = sortedTemplates.find((template) => template.id === selectedTemplateId) ?? null
  const selectedTemplateStartable = selectedTemplate ? isTemplateStartable(selectedTemplate) : false

  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus()
  }, [open])

  if (!open) return null

  const handleStart = () => {
    if (!selectedTemplate || !selectedTemplateStartable || starting) return

    onStart({
      templateId: selectedTemplate.id,
      templateSource: selectedTemplate.source,
      initialPhaseId: selectedTemplate.firstPhaseId,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-start-dialog-title"
        aria-describedby="workflow-start-dialog-description"
        tabIndex={-1}
        data-testid="workflow-start-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
        className="flex max-h-[min(720px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl focus-visible:outline-none"
      >
        <header className="flex min-w-0 items-start justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <h2
              id="workflow-start-dialog-title"
              className="text-base font-semibold text-[var(--color-text-primary)]"
            >
              {t('workflows.startDialog.title')}
            </h2>
            <p
              id="workflow-start-dialog-description"
              className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]"
            >
              {t('workflows.startDialog.description')}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('workflows.startDialog.close')}
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
          <section
            aria-label={t('workflows.startDialog.templateList')}
            className="min-h-0 overflow-y-auto border-b border-[var(--color-border)] p-3 md:border-b-0 md:border-r"
          >
            {sortedTemplates.length > 0 ? (
              <div className="flex flex-col gap-2">
                {sortedTemplates.map((template) => {
                  const selected = selectedTemplate?.id === template.id
                  const startable = isTemplateStartable(template)
                  const displayTemplate = localizeWorkflowTemplateDisplay(template, t)

                  return (
                    <button
                      key={`${template.source}:${template.id}:${template.version}`}
                      type="button"
                      aria-pressed={selected}
                      aria-disabled={!startable}
                      disabled={!startable}
                      onClick={() => onSelect({
                        templateId: template.id,
                        templateSource: template.source,
                      })}
                      className={`w-full rounded-[8px] border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35 ${
                        selected
                          ? 'border-[var(--color-brand)]/45 bg-[var(--color-brand)]/8'
                          : 'border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-hover)]'
                      } ${startable ? '' : 'cursor-not-allowed opacity-65 hover:bg-[var(--color-surface-container-lowest)]'}`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                          {displayTemplate.name}
                        </span>
                        <StatusChip>
                          {t(`workflows.startDialog.source.${template.source}`)}
                        </StatusChip>
                        <StatusChip>
                          {t('workflows.startDialog.phaseCount', { count: template.phaseCount })}
                        </StatusChip>
                      </div>
                      {displayTemplate.description && (
                        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--color-text-secondary)]">
                          {displayTemplate.description}
                        </p>
                      )}
                      {displayTemplate.phaseNames && displayTemplate.phaseNames.length > 0 ? (
                        <ol
                          aria-label={t('workflows.startDialog.phaseListFor', { name: displayTemplate.name })}
                          className="mt-2 flex flex-wrap gap-1.5"
                        >
                          {displayTemplate.phaseNames.map((phaseName, index) => (
                            <li
                              key={`${template.id}:${phaseName}:${index}`}
                              className="max-w-full truncate rounded-[5px] bg-[var(--color-surface-container)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)]"
                            >
                              {phaseName}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-2 text-[11px] text-[var(--color-warning)]">
                          {t('workflows.startDialog.noPhases')}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-4 text-sm text-[var(--color-text-secondary)]">
                {t('workflows.startDialog.empty')}
              </p>
            )}
          </section>

          <aside className="min-h-0 overflow-y-auto p-3">
            <section
              data-testid="workflow-start-dialog-details"
              className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-3"
            >
              <h3 className="text-xs font-semibold uppercase text-[var(--color-text-tertiary)]">
                {t('workflows.startDialog.selectedTitle')}
              </h3>
              {selectedTemplate ? (
                <dl className="mt-2 space-y-2 text-xs">
                  <TemplateDetail label={t('workflows.startDialog.name')} value={localizeWorkflowTemplateDisplay(selectedTemplate, t).name} />
                  <TemplateDetail label={t('workflows.startDialog.source')} value={t(`workflows.startDialog.source.${selectedTemplate.source}`)} />
                  <TemplateDetail label={t('workflows.startDialog.version')} value={selectedTemplate.version} />
                  <TemplateDetail
                    label={t('workflows.startDialog.firstPhase')}
                    value={selectedTemplate.firstPhaseId || t('workflows.startDialog.missingFirstPhase')}
                    warning={!selectedTemplate.firstPhaseId}
                  />
                </dl>
              ) : (
                <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {t('workflows.startDialog.noSelection')}
                </p>
              )}
            </section>

            {invalidTemplates.length > 0 && (
              <section
                data-testid="workflow-start-dialog-invalid"
                aria-live="polite"
                className="mt-3 rounded-[8px] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/8 px-3 py-3"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-warning)]">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">warning</span>
                  <span>{t('workflows.startDialog.invalidTitle')}</span>
                </div>
                <ul className="mt-2 space-y-2">
                  {invalidTemplates.map((issue, index) => (
                    <li
                      key={`${issue.source}:${issue.templateId ?? 'template'}:${issue.path}:${issue.code}:${index}`}
                      className="rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                        <StatusChip>{issue.severity}</StatusChip>
                        <span className="font-mono text-[var(--color-text-secondary)]">
                          {issue.templateId ?? issue.source}
                        </span>
                        <span className="font-mono">{issue.code}</span>
                      </div>
                      <p className="mt-1 leading-5 text-[var(--color-text-secondary)]">
                        {issue.message}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-[7px] border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            {t('workflows.startDialog.cancel')}
          </button>
          <button
            type="button"
            disabled={!selectedTemplateStartable || starting}
            onClick={handleStart}
            className="inline-flex h-9 items-center gap-1.5 rounded-[7px] bg-[var(--color-brand)] px-3 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">play_arrow</span>
            {starting ? t('workflows.startDialog.starting') : t('workflows.startDialog.start')}
          </button>
        </footer>
      </div>
    </div>
  )
}

function isTemplateStartable(template: WorkflowTemplateListItem) {
  return template.startable ?? (template.phaseCount > 0 && Boolean(template.firstPhaseId))
}

function StatusChip({ children }: { children: string }) {
  return (
    <span className="shrink-0 rounded-[5px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--color-text-tertiary)]">
      {children}
    </span>
  )
}

function TemplateDetail({
  label,
  value,
  warning = false,
}: {
  label: string
  value: string
  warning?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[var(--color-text-tertiary)]">{label}</dt>
      <dd className={`mt-0.5 truncate font-medium ${warning ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-secondary)]'}`}>
        {value}
      </dd>
    </div>
  )
}
