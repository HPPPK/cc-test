import type { WorkflowTemplateSource } from '../../types/session'
import { useTranslation } from '../../i18n'
import { localizeWorkflowTemplateDisplay } from './workflowTemplateDisplay'

export type WorkflowTemplatePickerItem = {
  id: string
  source: WorkflowTemplateSource
  version: string
  name: string
  description?: string
  phaseCount: number
  firstPhaseId: string
  phaseNames?: string[]
}

export type WorkflowTemplatePickerIssue = {
  id?: string
  source?: WorkflowTemplateSource | string
  message: string
}

type WorkflowTemplatePickerProps = {
  templates: WorkflowTemplatePickerItem[]
  invalidTemplates?: WorkflowTemplatePickerIssue[]
  selectedTemplateId?: string | null
  onSelect: (selection: {
    templateId: string
    templateSource: WorkflowTemplateSource
  }) => void
}

export function WorkflowTemplatePicker({
  templates,
  invalidTemplates = [],
  selectedTemplateId = null,
  onSelect,
}: WorkflowTemplatePickerProps) {
  const t = useTranslation()
  const startableTemplates = templates.filter((template) => template.phaseCount > 0 && template.firstPhaseId)

  return (
    <section
      data-testid="workflow-template-picker"
      data-workflow-selected={selectedTemplateId ? 'true' : 'false'}
      className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3"
    >
      <div className="flex flex-col gap-2">
        {startableTemplates.map((template) => {
          const selected = selectedTemplateId === template.id
          const displayTemplate = localizeWorkflowTemplateDisplay(template, t)
          return (
            <button
              key={`${template.source}:${template.id}:${template.version}`}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect({ templateId: template.id, templateSource: template.source })}
              className={`w-full rounded-[8px] border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35 ${
                selected
                  ? 'border-[var(--color-brand)]/45 bg-[var(--color-brand)]/8'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                  {displayTemplate.name}
                </span>
                <span className="shrink-0 rounded-[5px] border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--color-text-tertiary)]">
                  {t('workflows.startDialog.phaseCount', { count: template.phaseCount })}
                </span>
              </div>
              {displayTemplate.description && (
                <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--color-text-secondary)]">
                  {displayTemplate.description}
                </p>
              )}
              {displayTemplate.phaseNames && displayTemplate.phaseNames.length > 0 && (
                <ol className="mt-2 flex flex-wrap gap-1.5">
                  {displayTemplate.phaseNames.map((phaseName, index) => (
                    <li
                      key={`${template.id}:${phaseName}:${index}`}
                      className="max-w-full truncate rounded-[5px] bg-[var(--color-surface-container)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)]"
                    >
                      {phaseName}
                    </li>
                  ))}
                </ol>
              )}
            </button>
          )
        })}
      </div>

      {invalidTemplates.length > 0 && (
        <div className="mt-3 rounded-[8px] border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/8 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--color-warning)]">
            <span className="material-symbols-outlined text-[15px]" aria-hidden="true">warning</span>
            <span>{t('workflows.startDialog.invalidTitle')}</span>
          </div>
          <ul className="mt-1.5 space-y-1">
            {invalidTemplates.map((issue, index) => (
              <li
                key={`${issue.source ?? 'template'}:${issue.id ?? index}:${issue.message}`}
                className="text-[11px] leading-5 text-[var(--color-text-secondary)]"
              >
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
