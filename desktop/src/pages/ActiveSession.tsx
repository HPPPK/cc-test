import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Target } from 'lucide-react'
import {
  SCHEDULED_TAB_ID,
  SETTINGS_TAB_ID,
  TERMINAL_TAB_PREFIX,
  useTabStore,
  type TabType,
} from '../stores/tabStore'
import { useSessionStore } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'
import { useCLITaskStore } from '../stores/cliTaskStore'
import { useTeamStore } from '../stores/teamStore'
import { useWorkspacePanelStore } from '../stores/workspacePanelStore'
import { useExpertStore } from '../stores/expertStore'
import { useUIStore } from '../stores/uiStore'
import {
  TERMINAL_PANEL_DEFAULT_HEIGHT,
  TERMINAL_PANEL_MAX_HEIGHT,
  TERMINAL_PANEL_MIN_HEIGHT,
  useTerminalPanelStore,
} from '../stores/terminalPanelStore'
import { useTranslation } from '../i18n'
import { MessageList } from '../components/chat/MessageList'
import { ChatInput } from '../components/chat/ChatInput'
import { ComputerUsePermissionModal } from '../components/chat/ComputerUsePermissionModal'
import { SessionTaskBar } from '../components/chat/SessionTaskBar'
import { WorkspacePanel } from '../components/workspace/WorkspacePanel'
import { TeamStatusBar } from '../components/teams/TeamStatusBar'
import { TerminalSettings } from './TerminalSettings'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import {
  WorkflowReportLink,
  WorkflowGitCheckpointControls,
  WorkflowStatusPanel,
  type WorkflowTransitionCommand,
  type WorkflowStatusPanelSummary,
} from '../components/workflow/WorkflowComponents'
import { WorkflowTransitionControls } from '../components/workflow/WorkflowTransitionControls'
import { formatWorkflowPhaseSummary } from '../components/workflow/workflowPhaseDisplay'
import { sessionsApi } from '../api/sessions'
import { expertsApi, type ExpertDefinition } from '../api/experts'
import type {
  ExpertMaterialRef,
  SessionListItem,
  WorkflowGitCheckpointListResponse,
  WorkflowRunSummary,
  WorkflowTemplateListItem,
} from '../types/session'
import type { ActiveGoalState, BackgroundAgentTask } from '../types/chat'
import { useMobileViewport } from '../hooks/useMobileViewport'
import { isTauriRuntime } from '../lib/desktopRuntime'

const TASK_POLL_INTERVAL_MS = 1000
const WORKSPACE_RESIZE_STEP = 32
const TERMINAL_RESIZE_STEP = 24
const CHAT_COLUMN_WITH_WORKSPACE_CLASS =
  'min-w-[320px] flex-1 border-r border-[var(--color-border)] bg-[var(--color-surface)]'

type WorkflowFollowUpButtonKind = 'debug' | 'feature' | 'development'

const FOLLOW_UP_REQUEST_BY_KIND: Record<WorkflowFollowUpButtonKind, string> = {
  debug: 'Start Debug Repair follow-up from the previous workflow result.',
  feature: 'Start Feature Extension follow-up from the previous workflow result.',
  development: 'Start Development follow-up from the previous workflow result.',
}

const FOLLOW_UP_TEMPLATE_KIND_BY_BUTTON: Record<WorkflowFollowUpButtonKind, 'debug-repair' | 'feature-extension' | 'development'> = {
  debug: 'debug-repair',
  feature: 'feature-extension',
  development: 'development',
}

function isSessionTabState(activeTabId: string | null, activeTabType: TabType | null | undefined) {
  if (!activeTabId) return false
  if (activeTabType === 'session') return true
  if (activeTabType) return false
  return activeTabId !== SETTINGS_TAB_ID &&
    activeTabId !== SCHEDULED_TAB_ID &&
    !activeTabId.startsWith(TERMINAL_TAB_PREFIX)
}

function getSessionTerminalCwd(session: SessionListItem | undefined) {
  if (!session) return undefined
  if (session.workDir && session.workDirExists !== false) return session.workDir
  return session.projectPath || undefined
}

function ActiveGoalStrip({
  goal,
  isRunning,
  compact,
}: {
  goal: ActiveGoalState | null | undefined
  isRunning: boolean
  compact: boolean
}) {
  const t = useTranslation()
  if (!goal || goal.action === 'completed') return null

  const objective = goal.objective ?? goal.message
  if (!objective) return null

  const statusLabel = isRunning
    ? t('chat.activeGoal.running')
    : goal.status === 'paused'
      ? t('chat.activeGoal.paused')
      : t('chat.activeGoal.active')
  const meta = [
    goal.budget ? t('chat.activeGoal.budget', { value: goal.budget }) : null,
    goal.elapsed ? t('chat.activeGoal.elapsed', { value: goal.elapsed }) : null,
    goal.continuations ? t('chat.activeGoal.continuations', { value: goal.continuations }) : null,
  ].filter((value): value is string => value !== null)

  return (
    <div
      data-testid="active-goal-strip"
      className={[
        'mt-2 flex max-w-full items-center gap-2 rounded-[8px] border border-[var(--color-memory-border)] bg-[var(--color-memory-surface)] px-2.5 py-1.5',
        compact ? 'text-[11px]' : 'text-[12px]',
      ].join(' ')}
    >
      <Target size={compact ? 13 : 14} className="shrink-0 text-[var(--color-memory-accent)]" strokeWidth={2.25} aria-hidden="true" />
      <span className="shrink-0 font-semibold text-[var(--color-text-primary)]">
        {t('chat.activeGoal.title')}
      </span>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-memory-accent)]" aria-hidden="true" />
      <span className="shrink-0 text-[var(--color-text-tertiary)]">{statusLabel}</span>
      <span className="min-w-0 flex-1 truncate font-medium text-[var(--color-text-primary)]" title={objective}>
        {objective}
      </span>
      {meta.length > 0 ? (
        <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)] lg:flex">
          {meta.map((item) => (
            <span key={item} className="max-w-[140px] truncate">{item}</span>
          ))}
        </span>
      ) : null}
    </div>
  )
}

function getBackgroundAgentStatusLabel(status: BackgroundAgentTask['status'], t: ReturnType<typeof useTranslation>) {
  switch (status) {
    case 'queued':
      return t('chat.backgroundAgents.status.queued')
    case 'running':
      return t('chat.backgroundAgents.status.running')
    case 'blocked':
      return t('chat.backgroundAgents.status.blocked')
    case 'completed':
      return t('chat.backgroundAgents.status.completed')
    case 'failed':
      return t('chat.backgroundAgents.status.failed')
    case 'stopped':
      return t('chat.backgroundAgents.status.stopped')
  }
}

function BackgroundAgentPanel({
  tasks,
}: {
  tasks: BackgroundAgentTask[]
}) {
  const t = useTranslation()
  const [expanded, setExpanded] = useState(false)

  if (tasks.length === 0) return null

  return (
    <div
      data-testid="background-agent-panel"
      className="border-b border-[var(--color-border)]/40 bg-[var(--color-surface)]/60 px-4 py-1.5"
    >
      <div className="mx-auto w-full max-w-[860px]">
        <button
          type="button"
          aria-label={expanded ? t('chat.backgroundAgents.collapse') : t('chat.backgroundAgents.expand')}
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full min-w-0 items-center gap-1.5 text-left"
        >
          <span className="material-symbols-outlined text-[14px] text-[var(--color-text-tertiary)]" aria-hidden="true">
            {expanded ? 'expand_more' : 'chevron_right'}
          </span>
          <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
            {t('chat.backgroundAgents.title')}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--color-text-tertiary)]">
            {t('chat.backgroundAgents.count', { count: tasks.length })}
          </span>
        </button>

        {expanded ? (
          <div className="mt-2 space-y-1.5">
            {tasks.map((task) => {
              const detail = task.summary || task.description || task.outputFile || task.taskId
              return (
                <div
                  key={task.taskId}
                  className="flex min-w-0 items-center gap-2 rounded-[7px] border border-[var(--color-border)]/70 bg-[var(--color-surface)] px-2.5 py-1.5"
                >
                  <span className="material-symbols-outlined text-[14px] text-[var(--color-text-tertiary)]" aria-hidden="true">
                    smart_toy
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-[var(--color-text-secondary)]">
                    {getBackgroundAgentStatusLabel(task.status, t)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text-primary)]">
                    {detail}
                  </span>
                  {task.usage?.totalTokens ? (
                    <span className="hidden shrink-0 text-[11px] text-[var(--color-text-tertiary)] sm:inline">
                      {t('chat.backgroundAgents.tokens', { count: task.usage.totalTokens.toLocaleString() })}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}



function ExpertModeStrip({
  expert,
  definition,
  intakeOpen,
  materialsOpen,
  busy,
  downloadingRunId,
  onToggleIntake,
  onToggleMaterials,
  onDownload,
  onExit,
}: {
  expert: NonNullable<SessionListItem['expert']>
  definition?: ExpertDefinition | null
  intakeOpen: boolean
  materialsOpen: boolean
  busy: boolean
  downloadingRunId: string | null
  onToggleIntake: () => void
  onToggleMaterials: () => void
  onDownload: (material: ExpertMaterialRef) => void
  onExit: () => void
}) {
  const skillCount = definition?.skillIds.length ?? 0
  const toolCount = definition?.tools.length ?? 0

  return (
    <section
      data-testid="expert-mode-strip"
      className="shrink-0 border-b border-[#eadfd7] bg-[#fffaf5] px-4 py-2.5"
      aria-label="专家 Mode"
    >
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#9a542f] px-2 py-0.5 text-[10px] font-semibold text-white">专家 Runtime</span>
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">{expert.expertName}</span>
              <span className="text-[11px] text-[var(--color-text-secondary)]">{expertStatusLabel(expert.status)}</span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[var(--color-text-secondary)]">
              普通聊天、流式回复和工具调用保持可用；本次对话会按专家提示词、技能、工具声明和输出协议执行。
              {skillCount > 0 ? ' 已加载 ' + skillCount + ' 个技能。' : ''}
              {toolCount > 0 ? ' 已声明 ' + toolCount + ' 个专家工具。' : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <button type="button" onClick={onToggleIntake} className="rounded-[7px] border border-[#d8c1b1] bg-white px-2.5 py-1 text-[11px] font-medium text-[#7d4325] transition-colors hover:bg-[#fff4ea]">
              {intakeOpen ? '收起结构化信息' : '补充结构化信息'}
            </button>
            <button type="button" onClick={onToggleMaterials} className="rounded-[7px] border border-[#d8c1b1] bg-white px-2.5 py-1 text-[11px] font-medium text-[#7d4325] transition-colors hover:bg-[#fff4ea]">
              {'专家产物 (' + expert.materialRefs.length + ')'}
            </button>
            <button type="button" disabled={busy} onClick={onExit} className="rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50">
              退出专家 Mode
            </button>
          </div>
        </div>
        {materialsOpen ? (
          <div data-testid="expert-material-list" className="rounded-[9px] border border-[#eadfd7] bg-white/80 p-2">
            {expert.materialRefs.length === 0 ? (
              <p className="px-1 py-1 text-[11px] text-[var(--color-text-secondary)]">尚未生成专家产物。可先正常对话，或在“补充结构化信息”中生成材料包。</p>
            ) : (
              <div className="space-y-1.5">
                {expert.materialRefs.map((material) => (
                  <div key={material.runId} data-testid={'expert-material-' + material.runId} className="flex flex-wrap items-center justify-between gap-2 rounded-[7px] border border-[#f0e4da] bg-white px-2.5 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium text-[var(--color-text-primary)]">{material.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-[var(--color-text-secondary)]">{material.shortSummary}</div>
                    </div>
                    <button type="button" disabled={downloadingRunId === material.runId} onClick={() => onDownload(material)} className="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-[#d8c1b1] px-2 py-1 text-[11px] font-medium text-[#7d4325] hover:bg-[#fff4ea] disabled:cursor-wait disabled:opacity-60">
                      <span className="material-symbols-outlined text-[13px]" aria-hidden="true">download</span>
                      {downloadingRunId === material.runId ? '正在下载' : '下载材料包'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ExpertIntakeCard({
  expert,
  definition,
  phase,
  message,
  error,
  onWriteMaterial,
}: {
  expert: NonNullable<SessionListItem['expert']>
  definition?: ExpertDefinition | null
  phase: string
  message: string | null
  error: string | null
  onWriteMaterial: (title: string, notes: string, answers: Record<string, unknown>) => void
}) {
  const initialAnswers = useMemo(() => expert.intakeState?.answers ?? {}, [expert.intakeState?.answers])
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers)
  const flow = definition?.intakeFlow
  const steps = flow?.steps?.length ? flow.steps : fallbackExpertIntakeSteps()
  const busy = phase === 'writing' || phase === 'loading' || phase === 'entering' || phase === 'running' || expert.status === 'running'

  useEffect(() => {
    setAnswers(initialAnswers)
  }, [initialAnswers])

  const focusLabel = resolveExpertFocusLabel(steps, answers) || '专家材料整理'
  const notes = typeof answers.notes === 'string' ? answers.notes : ''

  const updateAnswer = (id: string, value: unknown) => {
    setAnswers((current) => ({ ...current, [id]: value }))
  }

  return (
    <section
      data-testid="expert-intake-card"
      className="mx-auto mb-4 w-full max-w-[860px] rounded-2xl border border-[#eadfd7] bg-[#fffaf5] p-4 shadow-sm"
      aria-label="专家引导表单"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#9a542f] px-2.5 py-1 text-xs font-semibold text-white">专家引导</span>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{expert.expertName}</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            先补充必要材料，专家会把结果写成材料包；这个过程不会修改源码，也不会自动启动 workflow。
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => onWriteMaterial(focusLabel, notes, answers)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-[#9a542f] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#7d4325] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[15px]" aria-hidden="true">description</span>
          生成材料包
        </button>
      </div>

      <div className="mt-3 grid gap-2 rounded-xl border border-[#eadfd7] bg-white/75 p-3" data-testid="expert-intake-flow">
        {steps.map((step) => (
          <ExpertIntakeStepView key={step.id} step={step} answers={answers} onChange={updateAnswer} />
        ))}
      </div>

      {message ? <div className="mt-3 text-xs text-[#7d4325]">{message}</div> : null}
      {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
    </section>
  )
}

function ExpertIntakeStepView({
  step,
  answers,
  onChange,
}: {
  step: NonNullable<ExpertDefinition['intakeFlow']>['steps'][number]
  answers: Record<string, unknown>
  onChange: (id: string, value: unknown) => void
}) {
  if (step.type === 'message') {
    return <div className="text-xs leading-5 text-[var(--color-text-secondary)]">{step.markdown}</div>
  }

  if (step.type === 'question') {
    const current = typeof answers[step.id] === 'string' ? answers[step.id] : ''
    return (
      <section className="rounded-lg border border-[#f0dfd2] bg-white px-3 py-2" data-testid={'expert-intake-question-' + step.id}>
        <div className="text-[11px] font-semibold text-[var(--color-text-primary)]">{step.question}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {step.options.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={current === option.id}
              onClick={() => onChange(step.id, option.id)}
              title={option.description}
              className={'rounded-full border px-2.5 py-1 text-[11px] transition-colors ' + (current === option.id ? 'border-[#9a542f] bg-[#fff0e6] text-[#7d4325]' : 'border-[#eadfd7] bg-white text-[var(--color-text-secondary)] hover:bg-[#fff8f3]')}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="grid gap-2 rounded-lg border border-[#f0dfd2] bg-white px-3 py-2 md:grid-cols-2" data-testid={'expert-intake-form-' + step.id}>
      <div className="md:col-span-2 text-[11px] font-semibold text-[var(--color-text-primary)]">{step.title}</div>
      {step.fields.map((field) => (
        <ExpertIntakeField key={field.id} field={field} value={answers[field.id]} onChange={(value) => onChange(field.id, value)} />
      ))}
    </section>
  )
}

function ExpertIntakeField({
  field,
  value,
  onChange,
}: {
  field: NonNullable<Extract<NonNullable<ExpertDefinition['intakeFlow']>['steps'][number], { type: 'form' }>['fields']>[number]
  value: unknown
  onChange: (value: unknown) => void
}) {
  const stringValue = typeof value === 'string' ? value : ''
  const label = field.label + (field.required ? ' *' : '')
  const commonClass = 'mt-1 w-full rounded-[8px] border border-[#eadfd7] bg-white px-2 py-1.5 text-[11px] font-normal text-[var(--color-text-primary)] outline-none focus:border-[#9a542f]'
  const pathInputClass = commonClass + ' mt-0'
  const pickerButtonClass = 'inline-flex shrink-0 items-center justify-center gap-1 rounded-[8px] border border-[#d8b39f] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#7d4325] transition-colors hover:bg-[#fff8f3]'
  const [pathPickerHint, setPathPickerHint] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const controlId = 'expert-intake-field-' + field.id.replace(/[^a-zA-Z0-9_-]/g, '-')

  const focusPathControl = () => {
    if (field.kind === 'file-list') textareaRef.current?.focus()
    else inputRef.current?.focus()
  }

  const handlePickPath = async () => {
    if (field.kind !== 'file' && field.kind !== 'file-list' && field.kind !== 'folder') return
    setPathPickerHint(null)

    if (!isTauriRuntime()) {
      focusPathControl()
      setPathPickerHint('当前环境不能打开系统选择器，请直接粘贴路径。')
      return
    }

    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        directory: field.kind === 'folder',
        multiple: field.kind === 'file-list',
        title: field.kind === 'folder' ? '选择文件夹' : '选择文件',
      })
      const selectedPaths = normalizeExpertDialogSelection(selected)
      if (selectedPaths.length === 0) return

      if (field.kind === 'file-list') {
        onChange(mergeExpertPathList(value, selectedPaths))
        setPathPickerHint(`已添加 ${selectedPaths.length} 个路径。`)
      } else {
        onChange(selectedPaths[0])
        setPathPickerHint('已填入选择的路径。')
      }
    } catch {
      focusPathControl()
      setPathPickerHint('无法打开系统选择器，请直接粘贴路径。')
    }
  }

  const handleAddPathLine = () => {
    const current = pathListTextValue(value)
    onChange(current && !current.endsWith('\n') ? current + '\n' : current)
    focusPathControl()
    setPathPickerHint('已为新路径留出一行，请粘贴文件路径。')
  }

  if (field.kind === 'file-list') {
    return (
      <div className="block text-[11px] font-semibold text-[var(--color-text-primary)] md:col-span-2">
        <label htmlFor={controlId}>{label}</label>
        <div className="mt-1 grid gap-2">
          <textarea
            ref={textareaRef}
            id={controlId}
            value={pathListTextValue(value)}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder || field.description || '每行一个文件路径，也可以点击“选择文件”批量添加。'}
            className={commonClass + ' mt-0 h-16 resize-none'}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handlePickPath} className={pickerButtonClass}>
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">attach_file</span>
              选择文件
            </button>
            <button type="button" onClick={handleAddPathLine} className={pickerButtonClass}>
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">add</span>
              添加路径
            </button>
          </div>
          {pathPickerHint ? <div className="text-[11px] font-normal text-[var(--color-text-secondary)]">{pathPickerHint}</div> : null}
        </div>
      </div>
    )
  }

  if (field.kind === 'textarea' || field.kind === 'url-list' || field.kind === 'table') {
    return (
      <label className="block text-[11px] font-semibold text-[var(--color-text-primary)] md:col-span-2">
        {label}
        <textarea
          value={Array.isArray(value) ? value.join('\n') : stringValue}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder || field.description || (field.kind === 'table' ? '每行一条，后续可作为表格材料读取。' : undefined)}
          className={commonClass + ' h-16 resize-none'}
        />
      </label>
    )
  }

  if (field.kind === 'file' || field.kind === 'folder') {
    const pickerLabel = field.kind === 'folder' ? '选择文件夹' : '选择文件'
    return (
      <div className="block text-[11px] font-semibold text-[var(--color-text-primary)]">
        <label htmlFor={controlId}>{label}</label>
        <div className="mt-1 flex gap-2">
          <input
            ref={inputRef}
            id={controlId}
            value={stringValue}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder || field.description || '粘贴路径，或点击右侧按钮选择。'}
            type="text"
            className={pathInputClass}
          />
          <button type="button" onClick={handlePickPath} className={pickerButtonClass}>
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">{field.kind === 'folder' ? 'folder_open' : 'attach_file'}</span>
            {pickerLabel}
          </button>
        </div>
        {pathPickerHint ? <div className="mt-1 text-[11px] font-normal text-[var(--color-text-secondary)]">{pathPickerHint}</div> : null}
      </div>
    )
  }

  if (field.kind === 'select' || field.kind === 'multi-select') {
    const selected = field.kind === 'multi-select' && Array.isArray(value) ? value.map(String) : [stringValue]
    return (
      <label className="block text-[11px] font-semibold text-[var(--color-text-primary)]">
        {label}
        <select
          multiple={field.kind === 'multi-select'}
          value={field.kind === 'multi-select' ? selected : stringValue}
          onChange={(event) => {
            if (field.kind === 'multi-select') onChange(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))
            else onChange(event.currentTarget.value)
          }}
          className={commonClass}
        >
          <option value="">请选择</option>
          {(field.options ?? []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
    )
  }

  if (field.kind === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-[11px] font-semibold text-[var(--color-text-primary)]">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.currentTarget.checked)} />
        {label}
      </label>
    )
  }

  return (
    <label className="block text-[11px] font-semibold text-[var(--color-text-primary)]">
      {label}
      <input
        value={stringValue}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder || field.description}
        type={field.kind === 'url' ? 'url' : 'text'}
        className={commonClass}
      />
    </label>
  )
}

function normalizeExpertDialogSelection(selected: unknown) {
  if (typeof selected === 'string') {
    const trimmed = selected.trim()
    return trimmed ? [trimmed] : []
  }

  if (Array.isArray(selected)) {
    return selected.map((item) => String(item).trim()).filter(Boolean)
  }

  return []
}

function pathListTextValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join('\n')
  return typeof value === 'string' ? value : ''
}

function mergeExpertPathList(currentValue: unknown, selectedPaths: string[]) {
  const existing = pathListTextValue(currentValue)
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean)
  return Array.from(new Set([...existing, ...selectedPaths]))
}

function fallbackExpertIntakeSteps(): NonNullable<ExpertDefinition['intakeFlow']>['steps'] {
  return [
    {
      type: 'question',
      id: 'focus',
      question: '你这次希望专家重点帮你看什么？',
      options: [
        { id: 'run', label: '怎么运行' },
        { id: 'test', label: '怎么测试' },
        { id: 'structure', label: '整体结构' },
        { id: 'ai-handoff', label: '交给 AI 继续开发' },
      ],
      required: true,
    },
    {
      type: 'form',
      id: 'materials',
      title: '请补充材料',
      fields: [
        { id: 'projectRoot', kind: 'folder', label: '项目目录' },
        { id: 'notes', kind: 'textarea', label: '补充说明' },
        { id: 'urls', kind: 'url-list', label: '参考链接' },
      ],
      required: false,
    },
  ]
}

function resolveExpertFocusLabel(steps: NonNullable<ExpertDefinition['intakeFlow']>['steps'], answers: Record<string, unknown>) {
  for (const step of steps) {
    if (step.type !== 'question') continue
    const value = answers[step.id]
    const option = step.options.find((candidate) => candidate.id === value)
    if (option) return option.label
  }
  return null
}

function expertStatusLabel(status: NonNullable<SessionListItem['expert']>['status']) {
  switch (status) {
    case 'collecting': return '正在收集材料'
    case 'running': return '正在生成报告'
    case 'completed': return '已生成材料'
    case 'failed': return '运行失败'
    case 'exited': return '已退出'
    default: return '进行中'
  }
}

function CompletedWorkflowStrip({
  workflow,
  reportState,
  onStartFollowUp,
  followUpStarting,
  activeRun,
}: {
  workflow: WorkflowStatusPanelSummary
  reportState: string | null
  onStartFollowUp?: (kind: WorkflowFollowUpButtonKind) => void
  followUpStarting?: boolean
  activeRun?: WorkflowRunSummary | null
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const hasActiveFollowUp = Boolean(activeRun && activeRun.status !== 'completed')

  return (
    <div className="min-w-0 flex-1">
      <div
        data-testid="completed-workflow-strip"
        className="flex min-w-0 items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]"
      >
        <span
          className="material-symbols-outlined shrink-0 text-[15px] text-[var(--color-success)]"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          check_circle
        </span>
        <span className="shrink-0 font-semibold text-[var(--color-text-primary)]">
          {humanizeWorkflowValue(workflow.templateId)}
        </span>
        <span className="shrink-0 text-[var(--color-success)]">Completed</span>
        <span className="min-w-0 flex-1 truncate">
          {resolveWorkflowPhaseSummary(workflow)}
        </span>
        {activeRun ? (
          <span
            data-testid="active-follow-up-workflow"
            className="shrink-0 rounded-[6px] border border-[var(--color-border)]/70 bg-[var(--color-surface-container-lowest)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)]"
          >
            Next: {humanizeWorkflowValue(activeRun.templateId)} · {humanizeWorkflowValue(activeRun.status)}
          </span>
        ) : null}
        {reportState ? (
          <span className="shrink-0 rounded-[6px] border border-[var(--color-border)]/70 bg-[var(--color-surface-container-lowest)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
            {reportState}
          </span>
        ) : null}
        {workflow.artifactHistory?.length ? (
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls="completed-workflow-details"
            onClick={() => setDetailsOpen((open) => !open)}
            className="shrink-0 text-[11px] font-medium text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35"
          >
            Details
          </button>
        ) : null}
        {onStartFollowUp ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={followUpStarting || hasActiveFollowUp}
              onClick={() => onStartFollowUp('debug')}
              className="rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-50"
            >
              Debug
            </button>
            <button
              type="button"
              disabled={followUpStarting || hasActiveFollowUp}
              onClick={() => onStartFollowUp('feature')}
              className="rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-50"
            >
              Feature
            </button>
            <button
              type="button"
              disabled={followUpStarting || hasActiveFollowUp}
              onClick={() => onStartFollowUp('development')}
              className="rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-50"
            >
              Development
            </button>
          </div>
        ) : null}
      </div>
      {workflow.artifactHistory?.length && detailsOpen ? (
        <div id="completed-workflow-details">
          <section
            data-testid="workflow-artifact-history"
            className="mt-2 rounded-[8px] border border-[var(--color-border)]/70 bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[11px] leading-5"
          >
            <div className="mb-1 text-[10px] font-semibold uppercase text-[var(--color-text-tertiary)]">
              Artifact history
            </div>
            <div className="grid gap-1.5">
              {workflow.artifactHistory.map((artifact) => (
                <div key={artifact.artifactId} className="rounded-[7px] bg-[var(--color-surface-container)] px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-[var(--color-text-primary)]">{artifact.label}</span>
                    <span className="shrink-0 text-[10px] uppercase text-[var(--color-text-tertiary)]">{artifact.status}</span>
                  </div>
                  <p className="mt-0.5 text-[var(--color-text-primary)]">{artifact.handoffSummary}</p>
                  <p className="mt-0.5 text-[var(--color-text-secondary)]">{artifact.evidenceSummary}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function WorkflowFollowUpSelectorDialog({
  kind,
  templates,
  loading,
  error,
  selectedTemplateKey,
  starting,
  onSelectTemplate,
  onCancel,
  onConfirm,
}: {
  kind: WorkflowFollowUpButtonKind
  templates: WorkflowTemplateListItem[]
  loading: boolean
  error: string | null
  selectedTemplateKey: string | null
  starting: boolean
  onSelectTemplate: (key: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const candidates = followUpTemplateCandidates(templates, kind)
  const selectedTemplate = selectedTemplateKey
    ? candidates.find((template) => workflowTemplateKey(template) === selectedTemplateKey) ?? null
    : null
  const title = kind === 'debug'
    ? '选择调试修复 workflow'
    : kind === 'feature'
      ? '选择功能拓展 workflow'
      : '选择开发 workflow'

  return (
    <div
      role="presentation"
      className="workflow-content-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/35 py-4"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[86vh] w-full max-w-[720px] flex-col rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 className="text-[18px] font-semibold text-[var(--color-text-primary)]">{title}</h2>
            <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
              从当前 workflow 列表中选择一个模板。这里不会默认选中任何 workflow。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onCancel}
            className="rounded-[7px] p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-container)] hover:text-[var(--color-text-primary)]"
          >
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true">close</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-3 py-3 text-[13px] text-[var(--color-text-secondary)]">
              正在读取 workflow 列表...
            </div>
          ) : error ? (
            <div className="rounded-[8px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-3 py-3 text-[13px] text-[var(--color-error)]">
              {error}
            </div>
          ) : candidates.length === 0 ? (
            <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-3 py-3 text-[13px] text-[var(--color-text-secondary)]">
              当前没有可启动的 workflow 模板。
            </div>
          ) : (
            <div className="grid gap-2" role="radiogroup" aria-label="Workflow 模板">
              {candidates.map((template) => {
                const key = workflowTemplateKey(template)
                const checked = selectedTemplateKey === key
                return (
                  <label
                    key={key}
                    className={[
                      'flex cursor-pointer items-start gap-3 rounded-[8px] border px-3 py-3 transition-colors',
                      checked
                        ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/8'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] hover:border-[var(--color-border-focus)]',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="workflow-follow-up-template"
                      checked={checked}
                      onChange={() => onSelectTemplate(key)}
                      className="mt-1 h-4 w-4 accent-[var(--color-brand)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
                        {template.name}
                      </span>
                      <span className="mt-1 block truncate font-mono text-[12px] text-[var(--color-text-tertiary)]">
                        {template.source}:{template.id} · v{template.version} · {template.phaseCount} 个阶段
                      </span>
                      {template.description ? (
                        <span className="mt-1 block text-[12px] leading-5 text-[var(--color-text-secondary)]">
                          {template.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-4">
          <span className="min-w-0 truncate text-[12px] text-[var(--color-text-tertiary)]">
            {selectedTemplate ? `已选择：${selectedTemplate.name}` : '尚未选择 workflow'}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-3 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!selectedTemplate || starting}
              className="rounded-[8px] bg-[var(--color-brand)] px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting ? '启动中...' : '使用这个 workflow'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}

function WorkflowPreviewControls({
  workflow,
  busy,
  onStart,
  onStop,
}: {
  workflow: WorkflowStatusPanelSummary
  busy: 'start' | 'stop' | null
  onStart: () => void
  onStop: () => void
}) {
  const preview = workflow.preview
  const isRunning = preview?.status === 'running' || preview?.status === 'starting'
  const showControls = workflow.activePhaseId === 'run-preview' || Boolean(preview)
  if (!showControls) return null

  return (
    <section
      data-testid="workflow-preview-controls"
      className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-3 py-2 text-[11px] leading-5 text-[var(--color-text-secondary)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[var(--color-text-primary)]">Local preview</span>
        <span className="rounded-[6px] border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase">
          {preview?.status ?? 'idle'}
        </span>
        {preview?.detectedUrl ? (
          <a
            href={preview.detectedUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[var(--color-brand)] hover:underline"
          >
            {preview.detectedUrl}
          </a>
        ) : null}
        {preview?.detectedPort ? <span>port {preview.detectedPort}</span> : null}
        {preview?.dbStatus ? <span>DB {preview.dbStatus}</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          data-testid="workflow-preview-start"
          onClick={onStart}
          disabled={Boolean(busy) || isRunning}
          className="inline-flex items-center gap-1 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-brand)]/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">play_arrow</span>
          {busy === 'start' ? 'Starting' : 'Start App'}
        </button>
        <button
          type="button"
          data-testid="workflow-preview-stop"
          onClick={onStop}
          disabled={Boolean(busy) || !isRunning}
          className="inline-flex items-center gap-1 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-brand)]/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">stop</span>
          {busy === 'stop' ? 'Stopping' : 'Stop App'}
        </button>
      </div>
      {preview?.command || preview?.logPath || preview?.error ? (
        <div className="mt-2 grid gap-1 font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {preview.command ? <span>{preview.command}</span> : null}
          {preview.logPath ? <span>{preview.logPath}</span> : null}
          {preview.error ? <span className="text-[var(--color-error)]">{preview.error}</span> : null}
        </div>
      ) : null}
    </section>
  )
}

function resolveWorkflowPhaseSummary(workflow: WorkflowStatusPanelSummary) {
  return formatWorkflowPhaseSummary(workflow)
}

function humanizeWorkflowValue(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function workflowTemplateKey(template: WorkflowTemplateListItem) {
  return `${template.source}:${template.id}`
}

function followUpTemplateCandidates(
  templates: WorkflowTemplateListItem[],
  kind: WorkflowFollowUpButtonKind,
) {
  const startable = templates.filter((template) =>
    template.startable !== false && template.firstPhaseId && template.phaseCount > 0
  )
  const matching = startable.filter((template) => {
    const labels = new Set(template.labels ?? [])
    if (kind === 'debug') return labels.has('bug')
    if (kind === 'feature') return labels.has('enhancement') && !labels.has('new-product')
    return labels.has('new-product')
  })
  return matching.length > 0 ? matching : startable
}

function WorkspaceResizeHandle() {
  const t = useTranslation()
  const width = useWorkspacePanelStore((state) => state.width)
  const setWidth = useWorkspacePanelStore((state) => state.setWidth)
  const [dragState, setDragState] = useState<{ startX: number; startWidth: number } | null>(null)
  const dragStateRef = useRef(dragState)

  useEffect(() => {
    dragStateRef.current = dragState
  }, [dragState])

  useEffect(() => {
    if (!dragState) return

    const handlePointerMove = (event: PointerEvent) => {
      const current = dragStateRef.current
      if (!current) return
      setWidth(current.startWidth + current.startX - event.clientX)
    }

    const handlePointerUp = () => {
      setDragState(null)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [dragState, setWidth])

  return (
    <div
      role="separator"
      aria-label={t('workspace.resizePanel')}
      aria-orientation="vertical"
      aria-valuenow={width}
      tabIndex={0}
      data-testid="workspace-resize-handle"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        setDragState({ startX: event.clientX, startWidth: width })
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          setWidth(width + WORKSPACE_RESIZE_STEP)
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          setWidth(width - WORKSPACE_RESIZE_STEP)
        }
      }}
      className="group relative z-10 flex w-2 shrink-0 cursor-col-resize items-stretch justify-center bg-[var(--color-surface)] outline-none focus-visible:bg-[var(--color-surface-container)]"
    >
      <div className="my-3 w-px rounded-full bg-[var(--color-border)] transition-colors group-hover:bg-[var(--color-border-focus)] group-focus-visible:bg-[var(--color-border-focus)]" />
    </div>
  )
}

function TerminalResizeHandle() {
  const t = useTranslation()
  const height = useTerminalPanelStore((state) => state.height)
  const setHeight = useTerminalPanelStore((state) => state.setHeight)
  const [dragState, setDragState] = useState<{ startY: number; startHeight: number } | null>(null)
  const dragStateRef = useRef(dragState)

  useEffect(() => {
    dragStateRef.current = dragState
  }, [dragState])

  useEffect(() => {
    if (!dragState) return

    const handlePointerMove = (event: PointerEvent) => {
      const current = dragStateRef.current
      if (!current) return
      setHeight(current.startHeight + current.startY - event.clientY)
    }

    const handlePointerUp = () => {
      setDragState(null)
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [dragState, setHeight])

  return (
    <div
      role="separator"
      aria-label={t('terminal.resizePanel')}
      aria-orientation="horizontal"
      aria-valuemin={TERMINAL_PANEL_MIN_HEIGHT}
      aria-valuemax={TERMINAL_PANEL_MAX_HEIGHT}
      aria-valuenow={height}
      tabIndex={0}
      data-testid="terminal-resize-handle"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        setDragState({ startY: event.clientY, startHeight: height })
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setHeight(height + TERMINAL_RESIZE_STEP)
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setHeight(height - TERMINAL_RESIZE_STEP)
        }
        if (event.key === 'Home') {
          event.preventDefault()
          setHeight(TERMINAL_PANEL_MIN_HEIGHT)
        }
        if (event.key === 'End') {
          event.preventDefault()
          setHeight(TERMINAL_PANEL_MAX_HEIGHT)
        }
      }}
      onDoubleClick={() => setHeight(TERMINAL_PANEL_DEFAULT_HEIGHT)}
      className="group flex h-2.5 shrink-0 cursor-row-resize items-center bg-[var(--color-surface)] outline-none focus-visible:bg-[var(--color-surface-container)]"
    >
      <div className="mx-3 h-px flex-1 rounded-full bg-[var(--color-border)] transition-colors group-hover:bg-[var(--color-border-focus)] group-focus-visible:bg-[var(--color-border-focus)]" />
    </div>
  )
}

export function ActiveSession() {
  const isMobileLayout = useMobileViewport() && !isTauriRuntime()
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activeTabType = useTabStore((s) => s.tabs.find((tab) => tab.sessionId === s.activeTabId)?.type ?? null)
  const sessions = useSessionStore((s) => s.sessions)
  const connectToSession = useChatStore((s) => s.connectToSession)
  const reloadHistory = useChatStore((s) => s.reloadHistory)
  const sessionState = useChatStore((s) => activeTabId ? s.sessions[activeTabId] : undefined)
  const pendingComputerUsePermission = sessionState?.pendingComputerUsePermission ?? null
  const fetchSessionTasks = useCLITaskStore((s) => s.fetchSessionTasks)
  const trackedTaskSessionId = useCLITaskStore((s) => s.sessionId)
  const hasIncompleteTasks = useCLITaskStore((s) => s.tasks.some((task) => task.status !== 'completed'))
  const hasRunningTasks = useCLITaskStore((s) => s.tasks.some((task) => task.status === 'in_progress'))
  const chatState = sessionState?.chatState ?? 'idle'
  const tokenUsage = sessionState?.tokenUsage ?? { input_tokens: 0, output_tokens: 0 }
  const backgroundAgentTasks = useMemo(
    () => Object.values(sessionState?.backgroundAgentTasks ?? {}),
    [sessionState?.backgroundAgentTasks],
  )
  const hasRunningBackgroundTasks = backgroundAgentTasks
    .some((task) => task.status === 'queued' || task.status === 'running')

  const session = sessions.find((s) => s.id === activeTabId)
  const expertModePhase = useExpertStore((state) => state.modePhase)
  const expertModeMessage = useExpertStore((state) => state.modeMessage)
  const expertModeError = useExpertStore((state) => state.modeError)
  const expertDefinitions = useExpertStore((state) => state.experts)
  const activeExpertDefinition = useMemo(
    () => session?.expert
      ? expertDefinitions.find((candidate) => candidate.id === session.expert?.expertId) ?? null
      : null,
    [expertDefinitions, session?.expert?.expertId],
  )
  const loadExperts = useExpertStore((state) => state.loadExperts)
  const memberInfo = useTeamStore((s) => activeTabId ? s.getMemberBySessionId(activeTabId) : null)
  const activeTeam = useTeamStore((s) => s.activeTeam)
  const refreshMemberSession = useTeamStore((s) => s.refreshMemberSession)
  const startMemberPolling = useTeamStore((s) => s.startMemberPolling)
  const isMemberSession = !!memberInfo
  const isDisconnectedMemberSession = isMemberSession && sessionState?.connectionState === 'disconnected'
  const attentionBackgroundAgentTasks = useMemo(
    () => backgroundAgentTasks
      .filter((task) => task.status !== 'completed')
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [backgroundAgentTasks],
  )
  const showWorkspacePanel = useWorkspacePanelStore((state) =>
    activeTabId && isSessionTabState(activeTabId, activeTabType) && !isMemberSession && !isMobileLayout
      ? state.isPanelOpen(activeTabId)
      : false,
  )
  const showTerminalPanel = useTerminalPanelStore((state) =>
    activeTabId && isSessionTabState(activeTabId, activeTabType) && !isMemberSession && !isMobileLayout
      ? state.isPanelOpen(activeTabId)
      : false,
  )
  const terminalPanelHeight = useTerminalPanelStore((state) => state.height)
  const [startingWorkflowFollowUp, setStartingWorkflowFollowUp] = useState<WorkflowFollowUpButtonKind | null>(null)
  const [workflowFollowUpDialogKind, setWorkflowFollowUpDialogKind] = useState<WorkflowFollowUpButtonKind | null>(null)
  const [workflowFollowUpTemplates, setWorkflowFollowUpTemplates] = useState<WorkflowTemplateListItem[]>([])
  const [workflowFollowUpTemplatesLoading, setWorkflowFollowUpTemplatesLoading] = useState(false)
  const [workflowFollowUpTemplatesError, setWorkflowFollowUpTemplatesError] = useState<string | null>(null)
  const [selectedWorkflowFollowUpTemplateKey, setSelectedWorkflowFollowUpTemplateKey] = useState<string | null>(null)
  const [workflowPreviewBusy, setWorkflowPreviewBusy] = useState<'start' | 'stop' | null>(null)
  const [workflowExitDialogOpen, setWorkflowExitDialogOpen] = useState(false)
  const [workflowExitBusy, setWorkflowExitBusy] = useState(false)
  const [expertIntakeOpen, setExpertIntakeOpen] = useState(false)
  const [expertMaterialsOpen, setExpertMaterialsOpen] = useState(false)
  const [expertMaterialDownloadingRunId, setExpertMaterialDownloadingRunId] = useState<string | null>(null)
  const [workflowCheckpoints, setWorkflowCheckpoints] = useState<WorkflowGitCheckpointListResponse>({
    enabled: false,
    latestVersion: null,
    checkpoints: [],
  })
  const [workflowCheckpointsLoading, setWorkflowCheckpointsLoading] = useState(false)
  const [workflowCheckpointBusy, setWorkflowCheckpointBusy] = useState<'create' | 'restore' | null>(null)
  const [workflowCheckpointError, setWorkflowCheckpointError] = useState<string | null>(null)
  const handleWorkflowTransition = useCallback(async (command: WorkflowTransitionCommand) => {
    if (!activeTabId) return

    useChatStore.getState().sendWorkflowTransition(activeTabId, command)
  }, [activeTabId])

  const handleWorkflowFollowUp = useCallback((kind: WorkflowFollowUpButtonKind) => {
    setSelectedWorkflowFollowUpTemplateKey(null)
    setWorkflowFollowUpTemplatesError(null)
    setWorkflowFollowUpDialogKind(kind)
  }, [])

  const closeWorkflowFollowUpDialog = useCallback(() => {
    if (startingWorkflowFollowUp) return
    setWorkflowFollowUpDialogKind(null)
    setSelectedWorkflowFollowUpTemplateKey(null)
    setWorkflowFollowUpTemplatesError(null)
  }, [startingWorkflowFollowUp])

  const startSelectedWorkflowFollowUp = useCallback(async () => {
    if (!activeTabId || !workflowFollowUpDialogKind || !selectedWorkflowFollowUpTemplateKey) return
    const candidates = followUpTemplateCandidates(workflowFollowUpTemplates, workflowFollowUpDialogKind)
    const selectedTemplate = candidates.find((template) => workflowTemplateKey(template) === selectedWorkflowFollowUpTemplateKey)
    if (!selectedTemplate) return
    setStartingWorkflowFollowUp(workflowFollowUpDialogKind)
    try {
      const result = await sessionsApi.startWorkflowFollowUpRun(activeTabId, {
        request: FOLLOW_UP_REQUEST_BY_KIND[workflowFollowUpDialogKind],
        kind: FOLLOW_UP_TEMPLATE_KIND_BY_BUTTON[workflowFollowUpDialogKind],
        templateId: selectedTemplate.id,
        templateSource: selectedTemplate.source,
        initialPhaseId: selectedTemplate.firstPhaseId,
      })
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((candidate) =>
          candidate.id === activeTabId
            ? { ...candidate, workflow: result.workflow, modifiedAt: new Date().toISOString() }
            : candidate,
        ),
      }))
      setWorkflowFollowUpDialogKind(null)
      setSelectedWorkflowFollowUpTemplateKey(null)
    } finally {
      setStartingWorkflowFollowUp(null)
    }
  }, [activeTabId, selectedWorkflowFollowUpTemplateKey, workflowFollowUpDialogKind, workflowFollowUpTemplates])

  useEffect(() => {
    if (!workflowFollowUpDialogKind) return
    let cancelled = false
    setWorkflowFollowUpTemplatesLoading(true)
    setWorkflowFollowUpTemplatesError(null)
    setSelectedWorkflowFollowUpTemplateKey(null)

    sessionsApi.listWorkflowTemplates()
      .then((response) => {
        if (cancelled) return
        setWorkflowFollowUpTemplates(response.templates)
      })
      .catch((error) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : '写入专家材料包失败'
        setWorkflowFollowUpTemplates([])
        setWorkflowFollowUpTemplatesError(message)
      })
      .finally(() => {
        if (!cancelled) setWorkflowFollowUpTemplatesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [workflowFollowUpDialogKind])

  const handleWorkflowPreview = useCallback(async (action: 'start' | 'stop') => {
    if (!activeTabId) return
    setWorkflowPreviewBusy(action)
    try {
      const result = action === 'start'
        ? await sessionsApi.startWorkflowPreview(activeTabId)
        : await sessionsApi.stopWorkflowPreview(activeTabId, { reason: 'User stopped local preview from workflow UI.' })
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((candidate) =>
          candidate.id === activeTabId
            ? { ...candidate, workflow: result.workflow, modifiedAt: new Date().toISOString() }
            : candidate,
        ),
      }))
    } finally {
      setWorkflowPreviewBusy(null)
    }
  }, [activeTabId])

  useEffect(() => {
    if (activeTabId && !isMemberSession) {
      connectToSession(activeTabId)
    }
  }, [activeTabId, isMemberSession, connectToSession])

  useEffect(() => {
    setExpertIntakeOpen(false)
    setExpertMaterialsOpen(false)
  }, [activeTabId, session?.expert?.expertId, session?.expert?.status])

  useEffect(() => {
    if (!session?.expert || expertDefinitions.length > 0) return
    void loadExperts()
  }, [expertDefinitions.length, loadExperts, session?.expert])

  useEffect(() => {
    if (!activeTabId || !isMemberSession || isDisconnectedMemberSession) return

    void refreshMemberSession(activeTabId)
    startMemberPolling(activeTabId)
  }, [
    activeTabId,
    isMemberSession,
    isDisconnectedMemberSession,
    refreshMemberSession,
    startMemberPolling,
  ])

  useEffect(() => {
    if (!activeTabId || isMemberSession) return

    const shouldPollTasks =
      chatState !== 'idle' ||
      (trackedTaskSessionId === activeTabId && hasIncompleteTasks)

    if (!shouldPollTasks) return

    void fetchSessionTasks(activeTabId)

    const timer = setInterval(() => {
      void fetchSessionTasks(activeTabId)
    }, TASK_POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [
    activeTabId,
    isMemberSession,
    chatState,
    trackedTaskSessionId,
    hasIncompleteTasks,
    fetchSessionTasks,
  ])

  const t = useTranslation()
  const messages = sessionState?.messages ?? []
  const streamingText = sessionState?.streamingText ?? ''
  const activeGoal = sessionState?.activeGoal ?? null
  const isEmpty = messages.length === 0 && !streamingText && (session?.messageCount ?? 0) === 0

  const isActive = chatState !== 'idle' ||
    (trackedTaskSessionId === activeTabId && hasRunningTasks) ||
    hasRunningBackgroundTasks
  const totalTokens = tokenUsage.input_tokens + tokenUsage.output_tokens
  const workflowDisplay = useMemo(() => {
    if (!session?.workflow || session.workflow.status === 'cancelled') return null
    return session.workflow
  }, [session?.workflow])
  const workflowReportState = workflowDisplay && !workflowDisplay.reportPointer
    ? workflowDisplay.status === 'completed' ? 'Final report unavailable' : null
    : null
  const isCompletedWorkflow = workflowDisplay?.status === 'completed'
  const workflowPreviewIsRunning = workflowDisplay?.preview?.status === 'running' ||
    workflowDisplay?.preview?.status === 'starting' ||
    workflowDisplay?.preview?.status === 'stopping'
  const canExitWorkflow = Boolean(workflowDisplay) &&
    workflowDisplay?.status !== 'completed' &&
    !workflowPreviewBusy &&
    !workflowPreviewIsRunning
  const activeWorkflowRun = useMemo(() => {
    if (!workflowDisplay) return null
    if (workflowDisplay.activeWorkflowRun) return workflowDisplay.activeWorkflowRun
    if (!workflowDisplay.activeWorkflowRunId || !workflowDisplay.workflowRuns?.length) return null
    return workflowDisplay.workflowRuns.find((run) => run.id === workflowDisplay.activeWorkflowRunId) ?? null
  }, [workflowDisplay])
  const workflowStateVersion = workflowDisplay
    ? workflowDisplay.stateVersion
    : undefined
  const workflowControlsDisplay = useMemo<WorkflowStatusPanelSummary | null>(() => {
    if (!workflowDisplay) return null
    if (
      workflowDisplay.pendingConfirmation ||
      workflowDisplay.status === 'pending-confirmation' ||
      !workflowDisplay.blockedStatus
    ) {
      return workflowDisplay
    }

    return {
      ...workflowDisplay,
      status: 'failed',
      pendingConfirmation: false,
      transitionAuthority: 'auto',
    }
  }, [workflowDisplay])
  const canShowWorkflowControls = workflowDisplay !== null &&
    workflowDisplay.status !== 'completed' &&
    workflowDisplay.status !== 'stale-template' &&
    workflowDisplay.status !== 'missing-template' &&
    (
      workflowDisplay.pendingConfirmation ||
      workflowDisplay.status === 'pending-confirmation' ||
      workflowDisplay.status === 'failed' ||
      Boolean(workflowDisplay.blockedStatus) ||
      Boolean(workflowDisplay.blockedReason)
    )
  const canShowWorkflowPreviewControls = workflowDisplay !== null &&
    workflowDisplay.status !== 'completed' &&
    workflowDisplay.status !== 'stale-template' &&
    workflowDisplay.status !== 'missing-template' &&
    (workflowDisplay.activePhaseId === 'run-preview' || Boolean(workflowDisplay.preview))
  const workflowTransitionCard = canShowWorkflowControls ? (
    <WorkflowTransitionControls
      workflow={workflowControlsDisplay}
      stateVersion={workflowStateVersion}
      onConfirm={handleWorkflowTransition}
      onReject={handleWorkflowTransition}
      onRetry={handleWorkflowTransition}
    />
  ) : null

  const loadWorkflowCheckpoints = useCallback(async () => {
    if (!activeTabId || !workflowDisplay || isMemberSession) return
    setWorkflowCheckpointsLoading(true)
    setWorkflowCheckpointError(null)
    try {
      setWorkflowCheckpoints(await sessionsApi.listWorkflowGitCheckpoints(activeTabId))
    } catch (error) {
      setWorkflowCheckpointError(error instanceof Error ? error.message : 'Workflow checkpoint list failed')
    } finally {
      setWorkflowCheckpointsLoading(false)
    }
  }, [activeTabId, isMemberSession, workflowDisplay])

  useEffect(() => {
    if (!activeTabId || !workflowDisplay || isMemberSession) {
      setWorkflowCheckpoints({ enabled: false, latestVersion: null, checkpoints: [] })
      setWorkflowCheckpointError(null)
      return
    }

    void loadWorkflowCheckpoints()
  }, [activeTabId, isMemberSession, loadWorkflowCheckpoints, workflowDisplay])

  const handleCreateWorkflowCheckpoint = useCallback(async () => {
    if (!activeTabId || !workflowDisplay) return
    setWorkflowCheckpointBusy('create')
    setWorkflowCheckpointError(null)
    try {
      const result = await sessionsApi.createWorkflowGitCheckpoint(activeTabId, {
        phaseId: workflowDisplay.activePhaseId,
        phaseIndex: workflowDisplay.activePhaseIndex,
        label: formatWorkflowPhaseSummary(workflowDisplay),
      })
      setWorkflowCheckpoints({
        enabled: true,
        latestVersion: result.latestVersion,
        checkpoints: result.checkpoints,
      })
    } catch (error) {
      setWorkflowCheckpointError(error instanceof Error ? error.message : 'Workflow checkpoint save failed')
    } finally {
      setWorkflowCheckpointBusy(null)
    }
  }, [activeTabId, workflowDisplay])

  const handleRestoreWorkflowCheckpoint = useCallback(async (checkpointId: string) => {
    if (!activeTabId) return
    setWorkflowCheckpointBusy('restore')
    setWorkflowCheckpointError(null)
    try {
      const result = await sessionsApi.restoreWorkflowGitCheckpoint(activeTabId, { checkpointId })
      if (result.workflow) {
        useSessionStore.setState((state) => ({
          sessions: state.sessions.map((candidate) =>
            candidate.id === activeTabId
              ? { ...candidate, workflow: result.workflow, modifiedAt: new Date().toISOString() }
              : candidate,
          ),
        }))
      }
      if (result.transcriptRestored) {
        await reloadHistory(activeTabId)
      }
      await loadWorkflowCheckpoints()
    } catch (error) {
      setWorkflowCheckpointError(error instanceof Error ? error.message : 'Workflow checkpoint rollback failed')
    } finally {
      setWorkflowCheckpointBusy(null)
    }
  }, [activeTabId, loadWorkflowCheckpoints, reloadHistory])

  const handleWriteExpertMaterial = useCallback(async (focus: string, notes: string, answers: Record<string, unknown>) => {
    if (!activeTabId || !session?.expert) return
    try {
      const expertStore = useExpertStore.getState()
      const firstAnswerKey = Object.keys(answers)[0] ?? 'intake'
      try {
        await expertStore.submitIntakeStep(activeTabId, { stepId: firstAnswerKey, answer: answers[firstAnswerKey], answers })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('请先进入专家 Mode')) throw error
        const refreshedExpert = await expertStore.enterExpertMode(activeTabId, session.expert.expertId)
        useSessionStore.setState((state) => ({
          sessions: state.sessions.map((candidate) => candidate.id === activeTabId
            ? { ...candidate, expert: refreshedExpert, modifiedAt: new Date().toISOString() }
            : candidate),
        }))
        await expertStore.submitIntakeStep(activeTabId, { stepId: firstAnswerKey, answer: answers[firstAnswerKey], answers })
      }
      const projectRootAnswer = typeof answers.projectRoot === 'string' ? answers.projectRoot : undefined
      const result = await expertStore.runExpertAgent(activeTabId, {
        expertId: session.expert.expertId,
        projectRoot: projectRootAnswer || session.workDir || session.projectRoot || session.projectPath,
        notes,
        title: notes.trim()
          ? `${session.expert.expertName}：${focus}（含补充说明）`
          : `${session.expert.expertName}：${focus}`,
      })
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((candidate) => candidate.id === activeTabId
          ? { ...candidate, expert: result.expert, modifiedAt: new Date().toISOString() }
          : candidate),
      }))
      useUIStore.getState().addToast({ type: 'success', message: '专家材料包已生成，可在后续 workflow 启动时继承。' })
    } catch (error) {
      useUIStore.getState().addToast({ type: 'error', message: error instanceof Error ? error.message : '写入专家材料包失败' })
    }
  }, [activeTabId, session?.expert, session?.projectPath, session?.projectRoot, session?.workDir])

  const handleExitWorkflow = useCallback(async () => {
    if (!activeTabId || !workflowDisplay) return
    setWorkflowExitBusy(true)
    try {
      const result = await sessionsApi.exitWorkflow(activeTabId)
      useChatStore.getState().settleSessionIdle(activeTabId)
      useCLITaskStore.getState().clearTasks(activeTabId)
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((candidate) => candidate.id === activeTabId
          ? { ...candidate, workflow: result.workflow, modifiedAt: new Date().toISOString() }
          : candidate),
      }))
      setWorkflowExitDialogOpen(false)
      useUIStore.getState().addToast({ type: 'success', message: '已退出工作流，现有记录和产物已保留。' })
    } catch (error) {
      useUIStore.getState().addToast({ type: 'error', message: error instanceof Error ? error.message : '退出工作流失败' })
    } finally {
      setWorkflowExitBusy(false)
    }
  }, [activeTabId, workflowDisplay])

  const handleExitExpertMode = useCallback(async () => {
    if (!activeTabId || !session?.expert) return
    try {
      const expert = await useExpertStore.getState().exitExpertMode(activeTabId)
      useChatStore.getState().settleSessionIdle(activeTabId)
      useCLITaskStore.getState().clearTasks(activeTabId)
      useSessionStore.setState((state) => ({
        sessions: state.sessions.map((candidate) => candidate.id === activeTabId
          ? { ...candidate, expert, modifiedAt: new Date().toISOString() }
          : candidate),
      }))
      useUIStore.getState().addToast({ type: 'success', message: '已退出专家 Mode，会话中的专家材料会保留。' })
    } catch (error) {
      useUIStore.getState().addToast({ type: 'error', message: error instanceof Error ? error.message : '退出专家 Mode 失败' })
    }
  }, [activeTabId, session?.expert])

  const handleDownloadExpertMaterial = useCallback(async (material: ExpertMaterialRef) => {
    if (!activeTabId) return
    setExpertMaterialDownloadingRunId(material.runId)
    try {
      const bytes = await expertsApi.downloadMaterialPackage(activeTabId, material.runId)
      const blob = new Blob([bytes], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = material.title.replace(/[\\/:*?"<>|]+/g, '_') + '.zip'
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      useUIStore.getState().addToast({ type: 'error', message: error instanceof Error ? error.message : '下载专家材料失败' })
    } finally {
      setExpertMaterialDownloadingRunId(null)
    }
  }, [activeTabId])

  const activeExpertMode = !isMemberSession && Boolean(session?.expert && session.expert.status !== 'exited')
  const expertModeBusy = expertModePhase === 'writing' || expertModePhase === 'loading' || expertModePhase === 'entering' || session?.expert?.status === 'running'

  const activeExpertIntakeCard = activeExpertMode && expertIntakeOpen && session?.expert ? (
    <ExpertIntakeCard
      expert={session.expert}
      definition={activeExpertDefinition}
      phase={expertModePhase}
      message={expertModeMessage}
      error={expertModeError}
      onWriteMaterial={(focus, notes, answers) => { void handleWriteExpertMaterial(focus, notes, answers) }}
    />
  ) : null

  const chatInlineCard = workflowTransitionCard || activeExpertIntakeCard ? (
    <>
      {workflowTransitionCard}
      {activeExpertIntakeCard}
    </>
  ) : null
  const showEmptyHero = isEmpty && !activeExpertMode
  const showSessionTitleHeader = !isMemberSession && !isMobileLayout && (!showEmptyHero || Boolean(session?.expert && session.expert.status !== 'exited'))

  const lastUpdated = useMemo(() => {
    if (!session?.modifiedAt) return ''
    const diff = Date.now() - new Date(session.modifiedAt).getTime()
    if (diff < 60000) return t('session.timeJustNow')
    if (diff < 3600000) return t('session.timeMinutes', { n: Math.floor(diff / 60000) })
    if (diff < 86400000) return t('session.timeHours', { n: Math.floor(diff / 3600000) })
    return t('session.timeDays', { n: Math.floor(diff / 86400000) })
  }, [session?.modifiedAt, t])

  if (!activeTabId) return null

  return (
    <div className="flex-1 flex relative overflow-hidden bg-background text-on-surface">
      <div data-testid="active-session-content-row" className="flex min-h-0 min-w-0 flex-1">
        <div
          data-testid="active-session-chat-column"
          className={`flex flex-col ${showWorkspacePanel ? CHAT_COLUMN_WITH_WORKSPACE_CLASS : isMobileLayout ? 'min-w-0 flex-1' : 'min-w-[360px] flex-1'}`}
        >
          {isMemberSession && (
            <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface-container)]">
              <div className="mx-auto max-w-[860px] flex items-center justify-between gap-4 px-8 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    {memberInfo?.status === 'running' && (
                      <span className="flex h-2 w-2 rounded-full bg-[var(--color-warning)] animate-pulse-dot" />
                    )}
                    {memberInfo?.status === 'completed' && (
                      <span className="material-symbols-outlined text-[14px] text-[var(--color-success)]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    )}
                    <span className="material-symbols-outlined text-[14px] text-[var(--color-text-tertiary)]">smart_toy</span>
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {memberInfo?.role}
                    </span>
                    {activeTeam && (
                      <span className="text-[10px] text-[var(--color-text-tertiary)]">
                        @ {activeTeam.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                    {isDisconnectedMemberSession
                      ? t('teams.memberSessionDisconnectedHint')
                      : t('teams.memberSessionHint')}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (activeTeam?.leadSessionId) {
                      useTabStore.getState().openTab(
                        activeTeam.leadSessionId,
                        t('teams.leader'),
                        'session',
                      )
                    }
                  }}
                  disabled={!activeTeam?.leadSessionId}
                  className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50 disabled:hover:text-[var(--color-text-secondary)]"
                >
                  <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                  {t('teams.backToLeader')}
                </button>
              </div>
            </div>
          )}

          {!isMemberSession && workflowDisplay ? (
            <div
              data-testid="workflow-session-strip"
              data-compact={isCompletedWorkflow ? 'true' : 'false'}
              className={
                isCompletedWorkflow
                  ? 'shrink-0 border-b border-[var(--color-border)]/50 bg-[var(--color-surface)]/80 px-4 py-1.5'
                  : 'shrink-0 border-b border-[var(--color-border)]/70 bg-[var(--color-surface)] px-4 py-2'
              }
            >
              <div className={
                showWorkspacePanel
                  ? `flex w-full ${isCompletedWorkflow ? 'flex-row flex-wrap items-center gap-2' : 'flex-col gap-2'}`
                  : `mx-auto flex w-full max-w-[960px] ${isCompletedWorkflow ? 'flex-row flex-wrap items-center gap-2' : 'flex-col gap-2'}`
              }>
                {isCompletedWorkflow ? (
                  <CompletedWorkflowStrip
                    workflow={workflowDisplay}
                    reportState={workflowReportState}
                    onStartFollowUp={handleWorkflowFollowUp}
                    followUpStarting={Boolean(startingWorkflowFollowUp)}
                    activeRun={activeWorkflowRun}
                  />
                ) : (
                  <>
                    <WorkflowStatusPanel
                      workflow={workflowDisplay}
                      actions={canExitWorkflow ? (
                        <button
                          type="button"
                          onClick={() => setWorkflowExitDialogOpen(true)}
                          className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                        >
                          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">logout</span>
                          退出工作流
                        </button>
                      ) : null}
                      checkpointActions={(
                        <WorkflowGitCheckpointControls
                          enabled={workflowCheckpoints.enabled}
                          reason={workflowCheckpoints.reason}
                          latestVersion={workflowCheckpoints.latestVersion}
                          checkpoints={workflowCheckpoints.checkpoints}
                          loading={workflowCheckpointsLoading}
                          busy={workflowCheckpointBusy}
                          error={workflowCheckpointError}
                          onCreate={() => { void handleCreateWorkflowCheckpoint() }}
                          onRestore={(checkpointId) => { void handleRestoreWorkflowCheckpoint(checkpointId) }}
                        />
                      )}
                    />
                    {canShowWorkflowPreviewControls ? (
                      <WorkflowPreviewControls
                        workflow={workflowDisplay}
                        busy={workflowPreviewBusy}
                        onStart={() => { void handleWorkflowPreview('start') }}
                        onStop={() => { void handleWorkflowPreview('stop') }}
                      />
                    ) : null}
                  </>
                )}
                <WorkflowReportLink
                  workflow={workflowDisplay}
                  compact={isCompletedWorkflow}
                />
                {!isCompletedWorkflow && workflowReportState ? (
                  <div className="inline-flex max-w-full items-center gap-2 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-3 py-2 text-[12px] font-medium text-[var(--color-text-secondary)]">
                    <span className="material-symbols-outlined shrink-0 text-[15px] text-[var(--color-text-tertiary)]" aria-hidden="true">
                      description
                    </span>
                    <span>{workflowReportState}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeExpertMode && session?.expert ? (
            <ExpertModeStrip
              expert={session.expert}
              definition={activeExpertDefinition}
              intakeOpen={expertIntakeOpen}
              materialsOpen={expertMaterialsOpen}
              busy={expertModeBusy}
              downloadingRunId={expertMaterialDownloadingRunId}
              onToggleIntake={() => setExpertIntakeOpen((open) => !open)}
              onToggleMaterials={() => setExpertMaterialsOpen((open) => !open)}
              onDownload={(material) => { void handleDownloadExpertMaterial(material) }}
              onExit={() => { void handleExitExpertMode() }}
            />
          ) : null}
          <ConfirmDialog
            open={workflowExitDialogOpen}
            title="退出工作流"
            body="退出后，当前工作流将不再限制后续对话。聊天记录、阶段产物和 checkpoint 会保留；不会回滚已经写入磁盘的代码，也不会撤销 Git 提交。"
            confirmLabel="退出工作流"
            cancelLabel={t('common.cancel')}
            loading={workflowExitBusy}
            onClose={() => setWorkflowExitDialogOpen(false)}
            onConfirm={handleExitWorkflow}
          />

          {workflowFollowUpDialogKind ? (
            <WorkflowFollowUpSelectorDialog
              kind={workflowFollowUpDialogKind}
              templates={workflowFollowUpTemplates}
              loading={workflowFollowUpTemplatesLoading}
              error={workflowFollowUpTemplatesError}
              selectedTemplateKey={selectedWorkflowFollowUpTemplateKey}
              starting={Boolean(startingWorkflowFollowUp)}
              onSelectTemplate={setSelectedWorkflowFollowUpTemplateKey}
              onCancel={closeWorkflowFollowUpDialog}
              onConfirm={() => { void startSelectedWorkflowFollowUp() }}
            />
          ) : null}

          {showEmptyHero ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 pb-32">
              <div className="flex max-w-md flex-col items-center text-center">
                {isMemberSession ? (
                  <>
                    <span className="material-symbols-outlined text-[48px] mb-4 text-[var(--color-text-tertiary)]">smart_toy</span>
                    <p className="text-[var(--color-text-secondary)]">
                      {memberInfo?.status === 'running'
                        ? `${memberInfo.role} ${t('teams.working')}`
                        : t('teams.noMessages')}
                    </p>
                  </>
                ) : (
                  <>
                    <img src="/app-icon.png" alt="Claude Code Jiangxia" className="mb-6 h-24 w-24" />
                    <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-headline)' }}>
                      {t('empty.title')}
                    </h1>
                    <p className="mx-auto max-w-xs text-[var(--color-text-secondary)]" style={{ fontFamily: 'var(--font-body)' }}>
                      {t('empty.subtitle')}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {showSessionTitleHeader && (
                <div
                  className={
                    showWorkspacePanel
                      ? 'flex w-full items-center border-b border-[var(--color-border)]/70 px-4 py-3'
                      : 'w-full border-b border-outline-variant/10 px-4 py-3'
                  }
                >
                  <div className={showWorkspacePanel ? 'min-w-0 flex-1' : 'mx-auto w-full max-w-[860px] min-w-0'}>
                    <h1
                      className={
                        showWorkspacePanel
                          ? 'truncate text-[15px] font-bold font-headline leading-tight text-on-surface'
                          : 'text-lg font-bold font-headline text-on-surface leading-tight'
                      }
                    >
                      {session?.expert && session.expert.status !== 'exited' ? (
                        <span className="mr-2 inline-flex align-middle rounded-full bg-[#9a542f] px-2 py-0.5 text-[11px] font-semibold text-white">专家</span>
                      ) : null}
                      <span className="align-middle">{session?.expert && session.expert.status !== 'exited' ? session.expert.expertName : (session?.title || t('session.untitled'))}</span>
                    </h1>
                    <div
                      className={
                        showWorkspacePanel
                          ? 'mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[10px] font-medium text-outline'
                          : 'flex items-center gap-2 text-[10px] text-outline font-medium mt-1'
                      }
                    >
                      {isActive && (
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
                          {t('session.active')}
                        </span>
                      )}
                      {totalTokens > 0 && (
                        <>
                          <span className="text-[var(--color-outline)]">·</span>
                          <span>{totalTokens.toLocaleString()} t</span>
                        </>
                      )}
                      {lastUpdated && (
                        <>
                          <span className="shrink-0 text-[var(--color-outline)]">·</span>
                          <span className="truncate">{t('session.lastUpdated', { time: lastUpdated })}</span>
                        </>
                      )}
                      {!showWorkspacePanel && session?.messageCount !== undefined && session.messageCount > 0 && (
                        <>
                          <span className="text-[var(--color-outline)]">·</span>
                          <span>{t('session.messages', { count: session.messageCount })}</span>
                        </>
                      )}
                      {session?.expert && session.expert.status !== 'exited' ? (
                        <>
                          <span className="text-[var(--color-outline)]">·</span>
                          <span>{expertStatusLabel(session.expert.status)}</span>
                          <span className="text-[var(--color-outline)]">·</span>
                          <span>{session.expert.materialRefs.length} 份材料</span>
                          <button
                            type="button"
                            disabled={expertModePhase === 'writing' || expertModePhase === 'loading' || expertModePhase === 'entering' || session.expert.status === 'running'}
                            onClick={() => { void handleExitExpertMode() }}
                            className="ml-1 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            退出专家 Mode
                          </button>
                        </>
                      ) : null}
                    </div>
                    {session?.workDirExists === false && (
                      <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--color-error)]/20 bg-[var(--color-error)]/8 px-3 py-1.5 text-[11px] text-[var(--color-error)]">
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        <span className="truncate">
                          {t('session.workspaceUnavailable', { dir: session.workDir || 'directory no longer exists' })}
                        </span>
                      </div>
                    )}
                    <ActiveGoalStrip
                      goal={activeGoal}
                      isRunning={isActive}
                      compact={showWorkspacePanel}
                    />
                  </div>
                </div>
              )}

              {!isMemberSession && !isMobileLayout ? (
                <BackgroundAgentPanel tasks={attentionBackgroundAgentTasks} />
              ) : null}

              <MessageList compact={showWorkspacePanel} workflowTransitionCard={chatInlineCard} />
            </>
          )}

          {!isMemberSession && <SessionTaskBar />}

          <TeamStatusBar />

          <ChatInput
            variant={showEmptyHero && !isMemberSession && !showWorkspacePanel ? 'hero' : 'default'}
            compact={showWorkspacePanel}
          />

          {showTerminalPanel && activeTabId ? (
            <div
              data-testid="session-terminal-panel"
              className="flex shrink-0 flex-col border-t border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]"
              style={{ height: terminalPanelHeight }}
            >
              <TerminalResizeHandle />
              <TerminalSettings
                active
                docked
                cwd={getSessionTerminalCwd(session)}
                testId={`session-terminal-host-${activeTabId}`}
                onOpenInTab={() => {
                  useTerminalPanelStore.getState().closePanel(activeTabId)
                  useTabStore.getState().openTerminalTab(getSessionTerminalCwd(session))
                }}
                onClose={() => useTerminalPanelStore.getState().closePanel(activeTabId)}
              />
            </div>
          ) : null}
        </div>

        {showWorkspacePanel ? (
          <>
            <WorkspaceResizeHandle />
            <WorkspacePanel sessionId={activeTabId} />
          </>
        ) : null}
      </div>

      {!isMemberSession && activeTabId ? (
        <ComputerUsePermissionModal
          sessionId={activeTabId}
          request={pendingComputerUsePermission?.request ?? null}
        />
      ) : null}
    </div>
  )
}
