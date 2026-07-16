import { useEffect, useMemo, useState } from 'react'
import { sessionsApi } from '../../api/sessions'
import { useTranslation } from '../../i18n'
import { useUIStore } from '../../stores/uiStore'
import type {
  WorkflowTemplateDetail,
  WorkflowTemplateListItem,
  WorkflowTemplateSelector,
  WorkflowTemplatesResponse,
} from '../../types/session'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { WorkflowImportExportDialog } from './WorkflowImportExportDialog'
import { WorkflowTemplateEditor } from './WorkflowTemplateEditor'
import { localizeWorkflowTemplateDisplay, workflowTemplateSourceLabel } from './workflowTemplateDisplay'
import { formatTaskCategory, taskCategoryForTemplate } from './workflowTaskCategories'

type WorkflowTemplateManagerProps = {
  onCopyTemplate?: (template: WorkflowTemplateListItem) => void
  onEditTemplate?: (template: WorkflowTemplateListItem) => void
  onDeleteTemplate?: (template: WorkflowTemplateListItem) => void
  onExportTemplate?: (template: WorkflowTemplateListItem) => void
}

type TemplateIssue = WorkflowTemplatesResponse['invalidTemplates'][number]

export function WorkflowTemplateManager({
  onCopyTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onExportTemplate,
}: WorkflowTemplateManagerProps) {
  const t = useTranslation()
  const addToast = useUIStore((state) => state.addToast)
  const [templates, setTemplates] = useState<WorkflowTemplateListItem[]>([])
  const [invalidTemplates, setInvalidTemplates] = useState<TemplateIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyTemplateKey, setBusyTemplateKey] = useState<string | null>(null)
  const [editorTemplate, setEditorTemplate] = useState<WorkflowTemplateDetail | null>(null)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [editorOpen, setEditorOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'import' | 'export' | null>(null)
  const [exportSelection, setExportSelection] = useState<WorkflowTemplateSelector[]>([])
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<WorkflowTemplateListItem | null>(null)

  const applyTemplateList = (response: WorkflowTemplatesResponse) => {
    setTemplates(response.templates)
    setInvalidTemplates(response.invalidTemplates)
  }

  const loadTemplates = async () => {
    setLoading(true)
    setError(null)

    try {
      applyTemplateList(await sessionsApi.listWorkflowTemplates())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('settings.workflows.manager.loadFailed'))
      setTemplates([])
      setInvalidTemplates([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => {
      return a.name.localeCompare(b.name)
    }),
    [templates],
  )

  const openCreateEditor = () => {
    setActionError(null)
    setEditorMode('create')
    setEditorTemplate(null)
    setEditorOpen(true)
  }

  const openImportDialog = () => {
    setActionError(null)
    setDialogMode('import')
    setExportSelection([])
  }

  const openExportDialog = (selection: WorkflowTemplateSelector[] = templates.map(({ source, id }) => ({ source, id }))) => {
    setActionError(null)
    setExportSelection(selection)
    setDialogMode('export')
  }

  const handleEditTemplate = async (template: WorkflowTemplateListItem) => {
    if (template.source !== 'user' || template.editable === false) return

    setActionError(null)
    setBusyTemplateKey(templateKey(template))
    try {
      const response = await sessionsApi.getWorkflowTemplate(template.source, template.id)
      setEditorTemplate(response.template)
      setEditorMode('edit')
      setEditorOpen(true)
      onEditTemplate?.(template)
    } catch (editError) {
      setActionError(errorMessage(editError))
    } finally {
      setBusyTemplateKey(null)
    }
  }

  const handleDeleteTemplate = async (template: WorkflowTemplateListItem) => {
    if (template.source !== 'user' || template.editable === false) return false

    setActionError(null)
    setBusyTemplateKey(templateKey(template))
    try {
      applyTemplateList(await sessionsApi.deleteWorkflowTemplate(template.id))
      if (editorTemplate?.id === template.id) {
        setEditorTemplate(null)
        setEditorMode('create')
        setEditorOpen(false)
      }
      onDeleteTemplate?.(template)
      return true
    } catch (deleteError) {
      setActionError(errorMessage(deleteError))
      return false
    } finally {
      setBusyTemplateKey(null)
    }
  }

  const requestDeleteTemplate = (template: WorkflowTemplateListItem) => {
    if (template.source !== 'user' || template.editable === false) return

    setActionError(null)
    setPendingDeleteTemplate(template)
  }

  const confirmDeleteTemplate = async () => {
    if (!pendingDeleteTemplate) return

    const deleted = await handleDeleteTemplate(pendingDeleteTemplate)
    if (deleted) {
      setPendingDeleteTemplate(null)
    }
  }

  const handleCopyTemplate = async (template: WorkflowTemplateListItem) => {
    if (template.copyable === false) return

    const targetId = uniqueTemplateId(`${template.id}-copy`, templates)
    setActionError(null)
    setBusyTemplateKey(templateKey(template))
    try {
      const response = await sessionsApi.duplicateWorkflowTemplate({
        source: template.source,
        id: template.id,
        targetId,
        targetName: `${template.name} Copy`,
      })
      applyTemplateList(response)
      setEditorTemplate(response.template)
      setEditorMode('edit')
      setEditorOpen(true)
      addToast({
        type: 'success',
        message: t('settings.workflows.manager.copySuccess', { name: response.template.name }),
      })
      onCopyTemplate?.(template)
    } catch (copyError) {
      const message = errorMessage(copyError)
      setActionError(message)
      addToast({ type: 'error', message })
    } finally {
      setBusyTemplateKey(null)
    }
  }

  const handleEditorSaved = async (template: WorkflowTemplateDetail) => {
    setEditorTemplate(template)
    setEditorMode('edit')
    setEditorOpen(true)
    await loadTemplates()
  }

  const handleImportSuccess = (response: WorkflowTemplatesResponse) => {
    applyTemplateList(response)
  }

  return (
    <section
      data-testid="workflow-template-manager"
      className="flex w-full min-w-0 flex-col gap-3"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {t('settings.workflows.manager.title')}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
            {t('settings.workflows.manager.description')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={loadTemplates}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">refresh</span>
            {t('settings.workflows.manager.refresh')}
          </button>
          <button
            type="button"
            onClick={openImportDialog}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">file_upload</span>
            {t('settings.workflows.manager.import')}
          </button>
          <button
            type="button"
            onClick={() => openExportDialog()}
            disabled={templates.length === 0}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">ios_share</span>
            {t('settings.workflows.manager.exportSelected')}
          </button>
          <button
            type="button"
            onClick={openCreateEditor}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] bg-[var(--color-brand)] px-2.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add</span>
            {t('settings.workflows.manager.new')}
          </button>
        </div>
      </div>

      {dialogMode && (
        <WorkflowImportExportDialog
          mode={dialogMode}
          open
          templates={templates}
          initialSelectedTemplates={exportSelection}
          onClose={() => setDialogMode(null)}
          onImported={handleImportSuccess}
        />
      )}

      {pendingDeleteTemplate && (
        <ConfirmDialog
          open
          title={t('settings.workflows.manager.deleteConfirmTitle')}
          body={t('settings.workflows.manager.deleteConfirmBody', {
            name: localizeWorkflowTemplateDisplay(pendingDeleteTemplate, t).name,
          })}
          confirmLabel={t('settings.workflows.manager.delete')}
          cancelLabel={t('common.cancel')}
          loading={busyTemplateKey === templateKey(pendingDeleteTemplate)}
          onClose={() => setPendingDeleteTemplate(null)}
          onConfirm={confirmDeleteTemplate}
        />
      )}

      {actionError && (
        <div className="rounded-[8px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/8 px-3 py-2 text-xs text-[var(--color-error)]">
          {actionError}
        </div>
      )}

      {editorOpen && editorMode === 'edit' && editorTemplate && (
        <WorkflowTemplateEditor
          key={`${editorTemplate.source}:${editorTemplate.id}`}
          template={editorTemplate}
          mode="edit"
          source={editorTemplate.source}
          onSaved={handleEditorSaved}
          onCancel={() => setEditorOpen(false)}
        />
      )}

      {editorOpen && editorMode === 'create' && editorTemplate === null && (
        <WorkflowTemplateEditor
          key="new-workflow-template"
          template={null}
          mode="create"
          source="user"
          onSaved={handleEditorSaved}
          onCancel={() => setEditorOpen(false)}
        />
      )}

      {loading ? (
        <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-4 text-sm text-[var(--color-text-secondary)]">
          {t('settings.workflows.manager.loading')}
        </div>
      ) : error ? (
        <div className="rounded-[8px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/8 px-3 py-3 text-sm text-[var(--color-error)]">
          {error}
        </div>
      ) : (
        <>
          {invalidTemplates.length > 0 && (
            <WorkflowTemplateDiagnostics issues={invalidTemplates} />
          )}

          <div className="overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]">
            {sortedTemplates.length > 0 ? (
              <div className="divide-y divide-[var(--color-border)]">
                {sortedTemplates.map((template) => (
                  <WorkflowTemplateRow
                    key={`${template.source}:${template.id}:${template.version}`}
                    template={template}
                    displayTemplate={localizeWorkflowTemplateDisplay(template, t)}
                    onCopyTemplate={handleCopyTemplate}
                    onEditTemplate={handleEditTemplate}
                    onDeleteTemplate={requestDeleteTemplate}
                    onExportTemplate={(template) => {
                      openExportDialog([{ source: template.source, id: template.id }])
                      onExportTemplate?.(template)
                    }}
                    busy={busyTemplateKey === templateKey(template)}
                  />
                ))}
              </div>
            ) : (
              <div className="px-3 py-4 text-sm text-[var(--color-text-secondary)]">
                {t('settings.workflows.manager.empty')}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function WorkflowTemplateRow({
  template,
  displayTemplate,
  onCopyTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onExportTemplate,
  busy = false,
}: {
  template: WorkflowTemplateListItem
  displayTemplate?: WorkflowTemplateListItem
  onCopyTemplate?: (template: WorkflowTemplateListItem) => void
  onEditTemplate?: (template: WorkflowTemplateListItem) => void
  onDeleteTemplate?: (template: WorkflowTemplateListItem) => void
  onExportTemplate?: (template: WorkflowTemplateListItem) => void
  busy?: boolean
}) {
  const t = useTranslation()
  const startable = template.startable ?? (template.phaseCount > 0 && Boolean(template.firstPhaseId))
  const editable = template.editable !== false
  const copyable = template.copyable !== false
  const display = displayTemplate ?? template

  return (
    <article
      data-testid={`workflow-template-row-${template.source}-${testIdPart(template.id)}`}
      className="grid min-w-0 gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h4 className="min-w-0 max-w-full truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {display.name}
          </h4>
          <StatusChip tone="accent">
            {workflowTemplateSourceLabel(template.source, t)}
          </StatusChip>
          <StatusChip tone={startable ? 'success' : 'warning'}>
            {startable
              ? t('settings.workflows.manager.startable')
              : t('settings.workflows.manager.notStartable')}
          </StatusChip>
          <StatusChip tone="accent">
            {formatTaskCategory(taskCategoryForTemplate(template))}
          </StatusChip>
          {!editable && (
            <StatusChip tone="neutral">
              {t('settings.workflows.manager.readOnly')}
            </StatusChip>
          )}
        </div>

        {display.description && (
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--color-text-secondary)]">
            {display.description}
          </p>
        )}

        <dl className="mt-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-text-tertiary)]">
          <div className="flex min-w-0 gap-1">
            <dt>{t('settings.workflows.manager.id')}</dt>
            <dd className="min-w-0 max-w-[220px] truncate font-mono text-[var(--color-text-secondary)]">
              {template.id}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>{t('settings.workflows.manager.version')}</dt>
            <dd className="font-medium text-[var(--color-text-secondary)]">
              {template.version}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>{t('settings.workflows.manager.phases')}</dt>
            <dd className="font-medium text-[var(--color-text-secondary)]">
              {t('settings.workflows.manager.phaseCount', { count: template.phaseCount })}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex shrink-0 flex-wrap items-start justify-start gap-1.5 md:justify-end">
        {copyable && (
          <ActionButton
            icon="content_copy"
            label={t('settings.workflows.manager.copy')}
            ariaLabel={t('settings.workflows.manager.copyTemplate', { name: display.name })}
            disabled={busy}
            onClick={() => onCopyTemplate?.(template)}
          />
        )}
        {editable && (
          <>
            <ActionButton
              icon="edit"
              label={t('settings.workflows.manager.edit')}
              ariaLabel={t('settings.workflows.manager.editTemplate', { name: display.name })}
              disabled={busy}
              onClick={() => onEditTemplate?.(template)}
            />
            <ActionButton
              icon="ios_share"
              label={t('settings.workflows.manager.export')}
              ariaLabel={t('settings.workflows.manager.exportTemplate', { name: display.name })}
              onClick={() => onExportTemplate?.(template)}
            />
            <ActionButton
              icon="delete"
              label={t('settings.workflows.manager.delete')}
              ariaLabel={t('settings.workflows.manager.deleteTemplate', { name: display.name })}
              danger
              disabled={busy}
              onClick={() => onDeleteTemplate?.(template)}
            />
          </>
        )}
      </div>
    </article>
  )
}

function WorkflowTemplateDiagnostics({ issues }: { issues: TemplateIssue[] }) {
  const t = useTranslation()

  return (
    <section
      data-testid="workflow-template-diagnostics"
      className="rounded-[8px] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/8 px-3 py-3"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-warning)]">
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">warning</span>
        <span>{t('settings.workflows.manager.invalidTitle')}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
        {t('settings.workflows.manager.invalidAction')}
      </p>
      <ul className="mt-2 space-y-2">
        {issues.map((issue, index) => (
          <li
            key={`${issue.source}:${issue.templateId ?? 'template'}:${issue.path}:${issue.code}:${index}`}
            className="rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px]">
              <StatusChip tone={issue.severity === 'error' ? 'warning' : 'neutral'}>{issue.severity}</StatusChip>
              <span className="font-mono text-[var(--color-text-secondary)]">
                {issue.templateId ?? issue.source}
              </span>
              <span className="font-mono text-[var(--color-text-tertiary)]">
                {issue.code}
              </span>
              <span className="min-w-0 max-w-full truncate font-mono text-[var(--color-text-tertiary)]">
                {issue.path}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
              {issue.message}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ActionButton({
  icon,
  label,
  ariaLabel,
  danger = false,
  disabled = false,
  onClick,
}: {
  icon: string
  label: string
  ariaLabel: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35 ${
        danger
          ? 'border-[var(--color-error)]/25 text-[var(--color-error)] hover:bg-[var(--color-error)]/8'
          : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
      }`}
    >
      <span className="material-symbols-outlined text-[15px]" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function StatusChip({
  tone,
  children,
}: {
  tone: 'accent' | 'neutral' | 'success' | 'warning'
  children: string
}) {
  const classes = {
    accent: 'border-[var(--color-brand)]/25 bg-[var(--color-brand)]/10 text-[var(--color-text-accent)]',
    neutral: 'border-[var(--color-border)] bg-[var(--color-surface-container)] text-[var(--color-text-tertiary)]',
    success: 'border-[var(--color-success)]/25 bg-[var(--color-success)]/10 text-[var(--color-success)]',
    warning: 'border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  }[tone]

  return (
    <span className={`shrink-0 rounded-[5px] border px-1.5 py-0.5 text-[10px] font-medium uppercase ${classes}`}>
      {children}
    </span>
  )
}

function testIdPart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
}

function templateKey(template: WorkflowTemplateListItem) {
  return `${template.source}:${template.id}`
}

function uniqueTemplateId(preferredId: string, templates: WorkflowTemplateListItem[]) {
  const usedIds = new Set(templates.map((template) => template.id))
  const baseId = slugFromText(preferredId) || 'workflow-template-copy'
  if (!usedIds.has(baseId)) return baseId

  let suffix = 2
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1
  }
  return `${baseId}-${suffix}`
}

function slugFromText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
