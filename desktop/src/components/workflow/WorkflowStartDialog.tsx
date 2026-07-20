import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from '../../i18n'
import { DirectoryPicker } from '../shared/DirectoryPicker'
import type {
  WorkflowBrainstormingMode,
  WorkflowEffortMode,
  WorkflowLabel,
  WorkflowTemplateListItem,
  WorkflowTemplateSource,
  WorkflowTaskRouterResult,
  WorkflowTemplateValidationIssue,
  ExpertMaterialRef,
} from '../../types/session'
import {
  TASK_CATEGORY_LABEL,
  taskCategoryForTemplate,
  WORKFLOW_TASK_CATEGORIES,
  type WorkflowTaskCategory,
} from './workflowTaskCategories'
import { localizeWorkflowTemplateDisplay } from './workflowTemplateDisplay'

export type WorkflowStartDialogSelection = {
  templateId: string
  templateSource: WorkflowTemplateSource
  initialPhaseId: string
  request?: string
  workspaceRoot?: string
  labels?: WorkflowLabel[]
  effort?: WorkflowEffortMode
  routingMode?: 'manual' | 'auto-confirm' | 'auto'
  brainstormingMode?: WorkflowBrainstormingMode
  router?: WorkflowTaskRouterResult
  expertMaterialRefs?: ExpertMaterialRef[]
}

type WorkflowStartDialogProps = {
  open: boolean
  templates: WorkflowTemplateListItem[]
  invalidTemplates?: WorkflowTemplateValidationIssue[]
  templatesLoading?: boolean
  templatesLoadFailed?: boolean
  onRetryTemplates?: () => void
  selectedTemplateId?: string | null
  selectedTemplateSource?: WorkflowTemplateSource | null
  onSelect: (selection: {
    templateId: string
    templateSource: WorkflowTemplateSource
  }) => void
  onStart: (selection: WorkflowStartDialogSelection) => void
  onClose: () => void
  starting?: boolean
  requestText?: string
  workspaceRoot?: string
  onWorkspaceRootChange?: (workspaceRoot: string) => void
  expertMaterialRefs?: ExpertMaterialRef[]
}

const EFFORT_OPTIONS: WorkflowEffortMode[] = ['auto', 'light', 'standard', 'heavy']
const BRAINSTORMING_MODES: WorkflowBrainstormingMode[] = ['auto', 'on', 'off']
const EMPTY_EXPERT_MATERIAL_REFS: ExpertMaterialRef[] = []

type WorkflowStartCard = {
  key: string
  title: string
  description: string
  icon: string
  badge: string
  phases: string[]
  phasesLabel: string
  category: WorkflowTaskCategory
  template: WorkflowTemplateListItem
  selected: boolean
  startable: boolean
}

export function WorkflowStartDialog({
  open,
  templates,
  invalidTemplates = [],
  templatesLoading = false,
  templatesLoadFailed = false,
  onRetryTemplates,
  selectedTemplateId = null,
  selectedTemplateSource = null,
  onSelect,
  onStart,
  onClose,
  starting = false,
  requestText = '',
  workspaceRoot = '',
  onWorkspaceRootChange,
  expertMaterialRefs = EMPTY_EXPERT_MATERIAL_REFS,
}: WorkflowStartDialogProps) {
  const t = useTranslation()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const sortedTemplates = useMemo(
    () => templates
      .map((template) => localizeWorkflowTemplateDisplay(template, t))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [templates, t],
  )
  const selectedTemplate = sortedTemplates.find((template) => (
    template.id === selectedTemplateId && (!selectedTemplateSource || template.source === selectedTemplateSource)
  )) ?? null
  const defaultTemplate = sortedTemplates.find(isTemplateStartable) ?? sortedTemplates[0] ?? null
  const selectedTemplateCategory = selectedTemplate
    ? taskCategoryForTemplate(selectedTemplate)
    : defaultTemplate
      ? taskCategoryForTemplate(defaultTemplate)
      : 'development'
  const [activeTaskCategory, setActiveTaskCategory] = useState<WorkflowTaskCategory>(selectedTemplateCategory)
  const visibleTemplates = useMemo(
    () => sortedTemplates.filter((template) => taskCategoryForTemplate(template) === activeTaskCategory),
    [sortedTemplates, activeTaskCategory],
  )
  const visibleSelectedTemplate = selectedTemplate && taskCategoryForTemplate(selectedTemplate) === activeTaskCategory
    ? selectedTemplate
    : null
  const workflowCards = useMemo(
    () => buildWorkflowStartCards(activeTaskCategory, visibleTemplates, visibleSelectedTemplate, t),
    [activeTaskCategory, visibleTemplates, visibleSelectedTemplate, t],
  )
  const selectedTemplateStartable = visibleSelectedTemplate ? isTemplateStartable(visibleSelectedTemplate) : false
  const workflowWorkspaceRoot = workspaceRoot.trim()
  const recommendation = useMemo(
    () => recommendWorkflowRoute(requestText, activeTaskCategory, t),
    [requestText, activeTaskCategory, t],
  )
  const [effort, setEffort] = useState<WorkflowEffortMode>(recommendation.effort)
  const [brainstormingMode, setBrainstormingMode] = useState<WorkflowBrainstormingMode>('auto')
  const [selectedExpertRunIds, setSelectedExpertRunIds] = useState<string[]>([])
  const expertMaterialRunKey = expertMaterialRefs.map((ref) => ref.runId).join('|')

  useEffect(() => {
    if (!open || !selectedTemplate) return
    setActiveTaskCategory(taskCategoryForTemplate(selectedTemplate))
  }, [open, selectedTemplate])

  useEffect(() => {
    if (!open || selectedTemplate || !defaultTemplate) return
    setActiveTaskCategory(taskCategoryForTemplate(defaultTemplate))
  }, [open, selectedTemplate, defaultTemplate])

  useEffect(() => {
    if (!open) return
    setEffort(recommendation.effort)
    setBrainstormingMode('auto')
  }, [open, recommendation])

  useEffect(() => {
    if (!open) return
    const nextRunIds = expertMaterialRefs[0]?.runId ? [expertMaterialRefs[0].runId] : []
    setSelectedExpertRunIds((current) => (
      current.length === nextRunIds.length && current.every((runId, index) => runId === nextRunIds[index])
        ? current
        : nextRunIds
    ))
  }, [open, expertMaterialRunKey])

  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus()
  }, [open])

  if (!open) return null

  const handleStart = () => {
    if (!visibleSelectedTemplate || !selectedTemplateStartable || !workflowWorkspaceRoot || starting) return

    onStart({
      templateId: visibleSelectedTemplate.id,
      templateSource: visibleSelectedTemplate.source,
      initialPhaseId: visibleSelectedTemplate.firstPhaseId,
      request: requestText,
      workspaceRoot: workflowWorkspaceRoot,
      labels: [recommendation.primaryLabel],
      effort,
      ...(brainstormingMode !== 'auto' ? { brainstormingMode } : {}),
      router: {
        ...recommendation,
        secondaryLabels: [],
        effort,
      },
      expertMaterialRefs: expertMaterialRefs.filter((ref) => selectedExpertRunIds.includes(ref.runId)),
    })
  }

  return (
    <div
      className="workflow-content-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/35 py-4"
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
        className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl focus-visible:outline-none"
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

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <section
            aria-label={t('workflows.startDialog.templateList')}
            className="min-h-0 overflow-y-auto border-b border-[var(--color-border)] bg-[#fffdf9] p-4 md:border-b-0 md:border-r"
          >
            <div className="mb-4 flex items-start gap-3">
              <span className="material-symbols-outlined mt-1 text-[20px] text-[#9a542f]" aria-hidden="true">format_list_bulleted</span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">{t('workflows.startDialog.listTitle')}</h3>
                <p className="mt-1 text-[12px] leading-5 text-[var(--color-text-secondary)]">{t('workflows.startDialog.listDescription')}</p>
              </div>
            </div>
            {templatesLoadFailed ? (
              <div
                role="alert"
                className="mb-3 rounded-[8px] border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950"
              >
                <p>{t('workflows.startDialog.loadFailed')}</p>
                {onRetryTemplates ? (
                  <button
                    type="button"
                    onClick={onRetryTemplates}
                    disabled={templatesLoading}
                    className="mt-2 rounded-[6px] border border-amber-400 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-950 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t('workflows.startDialog.retry')}
                  </button>
                ) : null}
              </div>
            ) : null}
            {workflowCards.length > 0 ? (
              <div className="flex flex-col gap-3">
                {workflowCards.map((card) => (
                  <WorkflowStartCardButton
                    key={card.key}
                    card={card}
                    onSelect={() => {
                      if (!card.startable) return
                      onSelect({
                        templateId: card.template.id,
                        templateSource: card.template.source,
                      })
                    }}
                  />
                ))}
              </div>
            ) : templatesLoading ? (
              <p role="status" className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-4 text-sm text-[var(--color-text-secondary)]">
                {t('workflows.startDialog.loading')}
              </p>
            ) : templatesLoadFailed ? null : (
              <p className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-4 text-sm text-[var(--color-text-secondary)]">
                {t('workflows.startDialog.empty')}
              </p>
            )}
          </section>

          <aside className="min-h-0 overflow-y-auto bg-[#fffdf9] p-4">
            <section
              data-testid="workflow-routing-controls"
              className="rounded-[14px] border border-[#eadfd7] bg-white px-4 py-4 shadow-sm"
            >
              <ConfigSection title={t('workflows.startDialog.taskTypeTitle')} description={t('workflows.startDialog.taskTypeDescription')}>
                <div className="grid grid-cols-3 gap-2">
                  {WORKFLOW_TASK_CATEGORIES.map((category) => (
                    <TaskTypeButton
                      key={category}
                      category={category}
                      selected={category === activeTaskCategory}
                      translate={t}
                      onClick={() => {
                        setActiveTaskCategory(category)
                        const matchingTemplate = sortedTemplates.find((template) =>
                          isTemplateStartable(template) && taskCategoryForTemplate(template) === category
                        )
                        if (matchingTemplate) {
                          onSelect({ templateId: matchingTemplate.id, templateSource: matchingTemplate.source })
                        }
                      }}
                    />
                  ))}
                </div>
              </ConfigSection>

              <Divider />

              <ConfigSection
                title={t('workflows.startDialog.brainstormingTitle')}
                description={t('workflows.startDialog.brainstormingDescription')}
                dataTestId="workflow-brainstorming-controls"
              >
                <div className="grid grid-cols-3 gap-2">
                  {BRAINSTORMING_MODES.map((mode) => (
                    <SegmentButton
                      key={mode}
                      selected={mode === brainstormingMode}
                      onClick={() => setBrainstormingMode(mode)}
                    >
                      {formatBrainstormingMode(mode, t)}
                    </SegmentButton>
                  ))}
                </div>
              </ConfigSection>

              <Divider />

              <ConfigSection title={t('workflows.startDialog.depthTitle')} description={t('workflows.startDialog.depthDescription')}>
                <div className="grid grid-cols-4 gap-2">
                  {EFFORT_OPTIONS.map((option) => (
                    <SegmentButton
                      key={option}
                      selected={option === effort}
                      onClick={() => setEffort(option)}
                    >
                      {formatEffort(option, t)}
                    </SegmentButton>
                  ))}
                </div>
              </ConfigSection>

              <Divider />

              <ConfigSection
                title={t('workflows.startDialog.workspaceTitle')}
                description={t('workflows.startDialog.workspaceDescription')}
                dataTestId="workflow-workspace-controls"
              >
                <div>
                  {onWorkspaceRootChange ? (
                    <DirectoryPicker
                      value={workflowWorkspaceRoot}
                      onChange={onWorkspaceRootChange}
                      variant="workbar"
                    />
                  ) : workflowWorkspaceRoot ? (
                    <WorkspacePathDisplay workspaceRoot={workflowWorkspaceRoot} />
                  ) : (
                    <p className="rounded-[10px] border border-[#d97706]/30 bg-[#fef3c7] px-3 py-2 text-[12px] leading-5 text-[#92400e]">
                      {t('workflows.startDialog.workspaceRequired')}
                    </p>
                  )}
                </div>
              </ConfigSection>

              {expertMaterialRefs.length > 0 ? (
                <>
                  <Divider />
                  <ConfigSection
                    title={t('workflows.startDialog.expertMaterialsTitle')}
                    description={t('workflows.startDialog.expertMaterialsDescription')}
                    dataTestId="workflow-expert-material-controls"
                  >
                    <div className="space-y-2">
                      {expertMaterialRefs.map((ref) => {
                        const checked = selectedExpertRunIds.includes(ref.runId)
                        return (
                          <label
                            key={ref.runId}
                            className={`flex cursor-pointer gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors ${checked ? 'border-[#9a542f] bg-[#fff7ef]' : 'border-[#eadfd7] bg-[#fffdf9] hover:bg-[#fff8f3]'}`}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 shrink-0 accent-[#9a542f]"
                              checked={checked}
                              onChange={(event) => {
                                setSelectedExpertRunIds((current) => event.target.checked
                                  ? Array.from(new Set([...current, ref.runId]))
                                  : current.filter((runId) => runId !== ref.runId))
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[12px] font-semibold text-[var(--color-text-primary)]">{ref.title || ref.expertName}</span>
                              <span className="mt-1 block text-[11px] leading-4 text-[var(--color-text-secondary)]">{ref.shortSummary}</span>
                              <span className="mt-1 block truncate font-mono text-[10px] text-[var(--color-text-tertiary)]">{ref.summaryPath}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </ConfigSection>
                </>
              ) : null}
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
            disabled={!selectedTemplateStartable || !workflowWorkspaceRoot || starting}
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

function WorkflowStartCardButton({
  card,
  onSelect,
}: {
  card: WorkflowStartCard
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={card.selected}
      aria-disabled={!card.startable}
      disabled={!card.startable}
      onClick={onSelect}
      className={`group w-full rounded-[12px] border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a542f]/30 ${
        card.selected
          ? 'border-[#c58f78] bg-[#fbf4ef] shadow-sm'
          : 'border-[#eadfd7] bg-white hover:border-[#d4a48f] hover:bg-[#fffaf6]'
      } ${card.startable ? '' : 'cursor-not-allowed opacity-55 hover:border-[#eadfd7] hover:bg-white'}`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <span className="inline-flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[12px] bg-[#f5ebe6] text-[#9a542f]">
          <span className="material-symbols-outlined text-[34px]" aria-hidden="true">{card.icon}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--color-text-primary)]">
              {card.title}
            </span>
            <span className="shrink-0 rounded-[7px] bg-[#f7e8df] px-2 py-1 text-[11px] font-semibold text-[#8a4b2b]">
              {card.badge}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--color-text-secondary)]">
            {card.description}
          </p>
          <ol className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={card.phasesLabel}>
            {card.phases.map((phase, index) => (
              <li key={`${card.key}:${index}:${phase}`} className="flex items-center gap-1">
                <span className="rounded-[5px] bg-[#f6f2ee] px-1.5 py-0.5 text-[10px] text-[#6b5b50]">
                  {phase}
                </span>
                {index < card.phases.length - 1 ? (
                  <span className="text-[10px] text-[#b8a69a]" aria-hidden="true">&gt;</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
        <span className="material-symbols-outlined shrink-0 text-[20px] text-[#9b8b80] transition-transform group-hover:translate-x-0.5" aria-hidden="true">
          chevron_right
        </span>
      </div>
    </button>
  )
}

function StatusChip({ children }: { children: string }) {
  return (
    <span className="shrink-0 rounded-[5px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--color-text-tertiary)]">
      {children}
    </span>
  )
}

function formatTaskCategoryLabel(category: WorkflowTaskCategory, translate: ReturnType<typeof useTranslation>): string {
  return translate(`workflows.startDialog.taskCategory.${category}` as Parameters<typeof translate>[0])
}

function ConfigSection({
  title,
  description,
  children,
  dataTestId,
}: {
  title: string
  description: string
  children: ReactNode
  dataTestId?: string
}) {
  return (
    <div data-testid={dataTestId}>
      <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)]">{title}</h3>
      <p className="mt-1 text-[12px] leading-5 text-[var(--color-text-secondary)]">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Divider() {
  return <div className="my-4 h-px bg-[#eee6df]" />
}

function TaskTypeButton({
  category,
  selected,
  onClick,
  translate,
}: {
  category: WorkflowTaskCategory
  selected: boolean
  onClick: () => void
  translate: ReturnType<typeof useTranslation>
}) {
  const icon = category === 'development'
    ? 'code'
    : category === 'feature-extension'
      ? 'extension'
      : 'bug_report'
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-[10px] border px-2 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a542f]/30 ${
        selected
          ? 'border-[#9a542f] bg-[#fbf4ef] text-[#7d3f23]'
          : 'border-[#eadfd7] bg-[#fffdf9] text-[var(--color-text-secondary)] hover:border-[#d8b39f] hover:bg-[#fff8f3]'
      }`}
    >
      <span className="material-symbols-outlined block text-[22px]" aria-hidden="true">
        {icon}
      </span>
      <span className="mt-1 block text-[12px] font-semibold">{formatTaskCategoryLabel(category, translate)}</span>
    </button>
  )
}

function SegmentButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-[9px] border px-2 py-2 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a542f]/30 ${
        selected
          ? 'border-[#9a542f] bg-[#fbf4ef] text-[#7d3f23]'
          : 'border-[#eadfd7] bg-[#fffdf9] text-[var(--color-text-secondary)] hover:border-[#d8b39f] hover:bg-[#fff8f3]'
      }`}
    >
      {children}
    </button>
  )
}

function WorkspacePathDisplay({ workspaceRoot }: { workspaceRoot: string }) {
  const normalized = workspaceRoot.replace(/\/+$/, '')
  const projectName = normalized.split('/').filter(Boolean).pop() ?? normalized
  const parent = normalized.slice(0, Math.max(0, normalized.length - projectName.length)).replace(/\/+$/, '')
  const shortParent = parent ? `${parent.split('/').filter(Boolean).slice(-1)[0] ?? 'workspace'}/${projectName}` : projectName
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[10px] border border-[#eadfd7] bg-[#fffdf9] px-3 py-2">
      <span className="material-symbols-outlined text-[28px] text-[#9a542f]" aria-hidden="true">folder</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{projectName}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-tertiary)]">/{shortParent}</p>
      </div>
      <span className="material-symbols-outlined text-[18px] text-[var(--color-text-tertiary)]" aria-hidden="true">expand_more</span>
    </div>
  )
}

function buildWorkflowStartCards(
  category: WorkflowTaskCategory,
  templates: WorkflowTemplateListItem[],
  selectedTemplate: WorkflowTemplateListItem | null,
  translate: ReturnType<typeof useTranslation>,
): WorkflowStartCard[] {
  return templates.map((template) => {
    const display = displayForActualWorkflowTemplate(template, category, translate)
    return {
      key: `${template.source}:${template.id}`,
      ...display,
      badge: formatTaskCategoryLabel(category, translate),
      category,
      template,
      startable: isTemplateStartable(template),
      selected: selectedTemplate !== null && template.id === selectedTemplate.id && template.source === selectedTemplate.source,
    }
  })
}

function displayForActualWorkflowTemplate(
  template: WorkflowTemplateListItem,
  category: WorkflowTaskCategory,
  translate: ReturnType<typeof useTranslation>,
): Pick<WorkflowStartCard, 'title' | 'description' | 'icon' | 'phases' | 'phasesLabel'> {
  const phases = template.phaseNames ?? []

  return {
    title: template.name,
    description: template.description || defaultWorkflowDescription(category, translate),
    icon: workflowIconForCategory(category),
    phases,
    phasesLabel: translate('workflows.startDialog.phasesAriaLabel', { name: template.name }),
  }
}

function defaultWorkflowDescription(category: WorkflowTaskCategory, translate: ReturnType<typeof useTranslation>): string {
  if (category === 'feature-extension') return translate('workflows.startDialog.defaultDescription.featureExtension')
  if (category === 'debug') return translate('workflows.startDialog.defaultDescription.debug')
  return translate('workflows.startDialog.defaultDescription.development')
}

function workflowIconForCategory(category: WorkflowTaskCategory): string {
  if (category === 'feature-extension') return 'extension'
  if (category === 'debug') return 'bug_report'
  return 'rocket_launch'
}

function recommendWorkflowRoute(
  requestText: string,
  category: WorkflowTaskCategory,
  translate: ReturnType<typeof useTranslation>,
): WorkflowTaskRouterResult {
  const normalized = requestText.toLowerCase()
  const primaryLabel = TASK_CATEGORY_LABEL[category]
  const effort: WorkflowEffortMode = normalized.includes('readme') || normalized.includes('docs') || normalized.includes('documentation')
    ? 'light'
    : primaryLabel === 'new-product' && (normalized.includes('mvp') || normalized.includes('saas') || normalized.includes('create'))
      ? 'heavy'
      : 'standard'
  return {
    primaryLabel,
    secondaryLabels: [],
    effort,
    confidence: selectedWorkflowConfidence(category, normalized),
    rationale: translate('workflows.startDialog.routerRationale', {
      category: formatTaskCategoryLabel(category, translate),
      effort: formatEffort(effort, translate),
    }),
    suggestedPath: [],
  }
}

function selectedWorkflowConfidence(category: WorkflowTaskCategory, normalizedRequest: string): number {
  if (category === 'debug' && (
    normalizedRequest.includes('500') ||
    normalizedRequest.includes('error') ||
    normalizedRequest.includes('click does not respond') ||
    normalizedRequest.includes('console')
  )) return 0.9
  if (category === 'development' && (
    normalizedRequest.includes('mvp') ||
    normalizedRequest.includes('saas') ||
    normalizedRequest.includes('create')
  )) return 0.88
  return 0.78
}

function formatEffort(effort: WorkflowEffortMode, translate: ReturnType<typeof useTranslation>): string {
  return translate(`workflows.startDialog.effort.${effort}` as Parameters<typeof translate>[0])
}

function formatBrainstormingMode(mode: WorkflowBrainstormingMode, translate: ReturnType<typeof useTranslation>): string {
  return translate(`workflows.startDialog.brainstorming.${mode}` as Parameters<typeof translate>[0])
}
