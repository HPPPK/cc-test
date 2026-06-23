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
import {
  WorkflowReportLink,
  WorkflowStatusPanel,
  type WorkflowTransitionCommand,
  type WorkflowStatusPanelSummary,
} from '../components/workflow/WorkflowComponents'
import { WorkflowTransitionControls } from '../components/workflow/WorkflowTransitionControls'
import type { SessionListItem } from '../types/session'
import type { ActiveGoalState, BackgroundAgentTask } from '../types/chat'
import { useMobileViewport } from '../hooks/useMobileViewport'
import { isTauriRuntime } from '../lib/desktopRuntime'

const TASK_POLL_INTERVAL_MS = 1000
const WORKSPACE_RESIZE_STEP = 32
const TERMINAL_RESIZE_STEP = 24
const CHAT_COLUMN_WITH_WORKSPACE_CLASS =
  'min-w-[320px] flex-1 border-r border-[var(--color-border)] bg-[var(--color-surface)]'

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
    case 'running':
      return t('chat.backgroundAgents.status.running')
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

function CompletedWorkflowStrip({
  workflow,
  reportState,
}: {
  workflow: WorkflowStatusPanelSummary
  reportState: string | null
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)

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

function resolveWorkflowPhaseSummary(workflow: WorkflowStatusPanelSummary) {
  if (workflow.status === 'completed') {
    return workflow.phaseCount > 0
      ? `All ${workflow.phaseCount} ${workflow.phaseCount === 1 ? 'phase' : 'phases'} completed`
      : 'Workflow completed'
  }

  const phaseName = workflow.activePhaseIndex >= 0
    ? workflow.phaseNames?.[workflow.activePhaseIndex]
    : null
  const label = phaseName ?? workflow.activePhaseId
  return label
    ? `${humanizeWorkflowValue(label)} · Phase ${Math.max(workflow.activePhaseIndex + 1, 1)} of ${workflow.phaseCount}`
    : `Phase ${Math.max(workflow.activePhaseIndex + 1, 1)} of ${workflow.phaseCount}`
}

function humanizeWorkflowValue(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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
    .some((task) => task.status === 'running')

  const session = sessions.find((s) => s.id === activeTabId)
  const memberInfo = useTeamStore((s) => activeTabId ? s.getMemberBySessionId(activeTabId) : null)
  const activeTeam = useTeamStore((s) => s.activeTeam)
  const refreshMemberSession = useTeamStore((s) => s.refreshMemberSession)
  const startMemberPolling = useTeamStore((s) => s.startMemberPolling)
  const isMemberSession = !!memberInfo
  const isDisconnectedMemberSession = isMemberSession && sessionState?.connectionState === 'disconnected'
  const attentionBackgroundAgentTasks = useMemo(
    () => backgroundAgentTasks
      .filter((task) => task.status !== 'running' && task.status !== 'completed')
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
  const handleWorkflowTransition = useCallback(async (command: WorkflowTransitionCommand) => {
    if (!activeTabId) return

    useChatStore.getState().sendWorkflowTransition(activeTabId, command)
  }, [activeTabId])

  useEffect(() => {
    if (activeTabId && !isMemberSession) {
      connectToSession(activeTabId)
    }
  }, [activeTabId, isMemberSession, connectToSession])

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
    if (!session?.workflow) return null
    return session.workflow
  }, [session?.workflow])
  const workflowReportState = workflowDisplay && !workflowDisplay.reportPointer
    ? workflowDisplay.status === 'completed' ? 'Final report unavailable' : null
    : null
  const isCompletedWorkflow = workflowDisplay?.status === 'completed'
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
  const canShowWorkflowControls = workflowDisplay &&
    workflowDisplay.status !== 'completed' &&
    workflowDisplay.status !== 'stale-template' &&
    workflowDisplay.status !== 'missing-template'

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
                  : 'shrink-0 border-b border-[var(--color-border)]/70 bg-[var(--color-surface)] px-4 py-3'
              }
            >
              <div className={
                showWorkspacePanel
                  ? `flex w-full ${isCompletedWorkflow ? 'flex-row flex-wrap items-center gap-2' : 'flex-col gap-3'}`
                  : `mx-auto flex w-full max-w-[860px] ${isCompletedWorkflow ? 'flex-row flex-wrap items-center gap-2' : 'flex-col gap-3'}`
              }>
                {isCompletedWorkflow ? (
                  <CompletedWorkflowStrip workflow={workflowDisplay} reportState={workflowReportState} />
                ) : (
                  <WorkflowStatusPanel
                    workflow={workflowDisplay}
                    actions={canShowWorkflowControls ? (
                      <WorkflowTransitionControls
                        workflow={workflowControlsDisplay}
                        stateVersion={workflowStateVersion}
                        embedded
                        onConfirm={handleWorkflowTransition}
                        onReject={handleWorkflowTransition}
                        onRetry={handleWorkflowTransition}
                      />
                    ) : null}
                  />
                )}
                <WorkflowReportLink workflow={workflowDisplay} compact={isCompletedWorkflow} />
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

          {isEmpty ? (
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
              {!isMemberSession && !isMobileLayout && (
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
                      {session?.title || t('session.untitled')}
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

              <MessageList compact={showWorkspacePanel} />
            </>
          )}

          {!isMemberSession && <SessionTaskBar />}

          <TeamStatusBar />

          <ChatInput
            variant={isEmpty && !isMemberSession && !showWorkspacePanel ? 'hero' : 'default'}
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
