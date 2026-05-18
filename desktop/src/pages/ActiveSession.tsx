import { useEffect, useMemo, useRef, useState } from 'react'
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
import type { SessionListItem } from '../types/session'
import { useMobileViewport } from '../hooks/useMobileViewport'
import { isTauriRuntime } from '../lib/desktopRuntime'
import type { ActiveGoalState, BackgroundAgentTask } from '../types/chat'
import { Bot, CheckCircle2, ChevronDown, ChevronUp, LoaderCircle, Target, XCircle } from 'lucide-react'

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

function GoalStatusPanel({
  goal,
  isRunning,
  compact,
}: {
  goal: ActiveGoalState
  isRunning: boolean
  compact: boolean
}) {
  const t = useTranslation()
  const stateLabel = goal.action === 'completed'
    ? t('chat.activeGoal.completed')
    : goal.action === 'paused' || goal.status === 'paused'
      ? t('chat.activeGoal.paused')
      : isRunning && goal.status !== 'complete'
        ? t('chat.activeGoal.running')
        : t('chat.activeGoal.active')
  const hasMeta = Boolean(goal.budget || goal.continuations || goal.elapsed)

  return (
    <div
      data-testid="active-goal-panel"
      className={
        compact
          ? 'mx-auto w-full max-w-[860px] px-4 py-2'
          : 'mx-auto w-full max-w-[860px] px-8 py-2.5'
      }
    >
      <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-[var(--color-memory-border)] bg-[var(--color-memory-surface)] px-3 py-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--color-memory-accent)]">
          <Target size={15} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span className="shrink-0 text-[13px] font-medium text-[var(--color-text-primary)]">
          {t('chat.activeGoal.title')}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-[var(--color-text-tertiary)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-memory-accent)]" aria-hidden="true" />
          {stateLabel}
        </span>
        {goal.objective && (
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-text-primary)]">
            {goal.objective}
          </span>
        )}
        {hasMeta && (
          <div className="hidden shrink-0 items-center gap-1.5 md:flex">
            {goal.budget && (
              <span className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
                {t('chat.activeGoal.budget', { value: goal.budget })}
              </span>
            )}
            {goal.continuations && (
              <span className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
                {t('chat.activeGoal.continuations', { value: goal.continuations })}
              </span>
            )}
            {goal.elapsed && (
              <span className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
                {t('chat.activeGoal.elapsed', { value: goal.elapsed })}
              </span>
            )}
          </div>
        )}
        {hasMeta && goal.budget ? (
          <span className="ml-auto shrink-0 text-[11px] font-medium text-[var(--color-text-tertiary)] md:hidden">
            {t('chat.activeGoal.budget', { value: goal.budget })}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function formatBackgroundTaskDuration(durationMs?: number) {
  if (typeof durationMs !== 'number' || durationMs < 0) return null
  const seconds = Math.round(durationMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function BackgroundAgentTasksPanel({
  tasks,
  compact,
}: {
  tasks: BackgroundAgentTask[]
  compact: boolean
}) {
  const t = useTranslation()
  const hasRunningTask = tasks.some((task) => task.status === 'running')
  const [isExpanded, setIsExpanded] = useState(hasRunningTask)

  useEffect(() => {
    if (hasRunningTask) {
      setIsExpanded(true)
      return
    }
    setIsExpanded(false)
  }, [hasRunningTask, tasks.length])

  if (tasks.length === 0) return null

  return (
    <div
      data-testid="background-agent-panel"
      className={
        compact
          ? 'mx-auto w-full max-w-[860px] px-4 py-2'
          : 'mx-auto w-full max-w-[860px] px-8 py-2.5'
      }
    >
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-low)]">
        <div className={`flex min-w-0 items-center gap-2 px-3 py-2 ${isExpanded ? 'border-b border-[var(--color-border)]' : ''}`}>
          <Bot size={15} strokeWidth={2.25} className="shrink-0 text-[var(--color-text-secondary)]" aria-hidden="true" />
          <span className="shrink-0 text-[13px] font-medium text-[var(--color-text-primary)]">
            {t('chat.backgroundAgents.title')}
          </span>
          <span className="truncate text-[12px] text-[var(--color-text-tertiary)]">
            {t('chat.backgroundAgents.count', { count: tasks.length })}
          </span>
          <button
            type="button"
            aria-label={isExpanded ? t('chat.backgroundAgents.collapse') : t('chat.backgroundAgents.expand')}
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((expanded) => !expanded)}
            className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
          >
            {isExpanded ? (
              <ChevronUp size={15} strokeWidth={2.25} aria-hidden="true" />
            ) : (
              <ChevronDown size={15} strokeWidth={2.25} aria-hidden="true" />
            )}
          </button>
        </div>
        {isExpanded && (
          <div className="divide-y divide-[var(--color-border)]">
            {tasks.map((task) => {
              const isRunning = task.status === 'running'
              const isFailed = task.status === 'failed' || task.status === 'stopped'
              const duration = formatBackgroundTaskDuration(task.usage?.durationMs)
              const detail = task.summary || task.lastToolName || task.description || task.outputFile || task.taskId
              return (
                <div key={task.taskId} className="flex min-w-0 items-start gap-2 px-3 py-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                    {isRunning ? (
                      <LoaderCircle size={15} strokeWidth={2.25} className="animate-spin text-[var(--color-accent)]" aria-hidden="true" />
                    ) : isFailed ? (
                      <XCircle size={15} strokeWidth={2.25} className="text-[var(--color-error)]" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 size={15} strokeWidth={2.25} className="text-[var(--color-success)]" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-[12px] font-medium text-[var(--color-text-primary)]">
                        {task.taskType || t('chat.backgroundAgents.agent')}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">
                        {t(`chat.backgroundAgents.status.${task.status}`)}
                      </span>
                      {task.usage?.totalTokens ? (
                        <span className="hidden shrink-0 text-[11px] text-[var(--color-text-tertiary)] sm:inline">
                          {t('chat.backgroundAgents.tokens', { count: task.usage.totalTokens.toLocaleString() })}
                        </span>
                      ) : null}
                      {duration ? (
                        <span className="hidden shrink-0 text-[11px] text-[var(--color-text-tertiary)] sm:inline">
                          {duration}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[var(--color-text-secondary)]">
                      {detail}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
export function ActiveSession() {
  const isMobileLayout = useMobileViewport() && !isTauriRuntime()
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activeTabType = useTabStore((s) => s.tabs.find((tab) => tab.sessionId === s.activeTabId)?.type ?? null)
  const sessions = useSessionStore((s) => s.sessions)
  const connectToSession = useChatStore((s) => s.connectToSession)
  const refreshMemberSession = useTeamStore((s) => s.refreshMemberSession)
  const startMemberPolling = useTeamStore((s) => s.startMemberPolling)
  const sessionState = useChatStore((s) => activeTabId ? s.sessions[activeTabId] : undefined)
  const pendingComputerUsePermission = sessionState?.pendingComputerUsePermission ?? null
  const fetchSessionTasks = useCLITaskStore((s) => s.fetchSessionTasks)
  const trackedTaskSessionId = useCLITaskStore((s) => s.sessionId)
  const hasIncompleteTasks = useCLITaskStore((s) => s.tasks.some((task) => task.status !== 'completed'))
  const chatState = sessionState?.chatState ?? 'idle'
  const activeGoal = sessionState?.activeGoal ?? null
  const backgroundAgentTasks = useMemo(
    () => Object.values(sessionState?.backgroundAgentTasks ?? {})
      .sort((a, b) => {
        if (a.status === 'running' && b.status !== 'running') return -1
        if (a.status !== 'running' && b.status === 'running') return 1
        return b.updatedAt - a.updatedAt
      }),
    [sessionState?.backgroundAgentTasks],
  )
  const tokenUsage = sessionState?.tokenUsage ?? { input_tokens: 0, output_tokens: 0 }

  const session = sessions.find((s) => s.id === activeTabId)
  const memberInfo = useTeamStore((s) => activeTabId ? s.getMemberBySessionId(activeTabId) : null)
  const activeTeam = useTeamStore((s) => s.activeTeam)
  const isMemberSession = !!memberInfo
  const isDisconnectedMemberSession =
    isMemberSession && sessionState?.connectionState === 'disconnected'
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

  useEffect(() => {
    if (activeTabId && !isMemberSession) {
      connectToSession(activeTabId)
    }
  }, [activeTabId, isMemberSession, connectToSession])

  useEffect(() => {
    if (!activeTabId || !isMemberSession) return

    void refreshMemberSession(activeTabId)
    startMemberPolling(activeTabId)
  }, [activeTabId, isMemberSession, refreshMemberSession, startMemberPolling])

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
  const isEmpty = messages.length === 0 && !streamingText && (session?.messageCount ?? 0) === 0

  const isActive = chatState !== 'idle'
  const totalTokens = tokenUsage.input_tokens + tokenUsage.output_tokens

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
                    {isDisconnectedMemberSession && (
                      <span className="material-symbols-outlined text-[14px] text-[var(--color-text-tertiary)]">link_off</span>
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
                    <img src="/app-icon.png" alt="Claude Code Haha" className="mb-6 h-24 w-24" />
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
                      : 'mx-auto flex w-full max-w-[860px] items-center border-b border-outline-variant/10 px-8 py-3'
                  }
                >
                  <div className="min-w-0 flex-1">
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
                  </div>
                </div>
              )}

              {activeGoal && (
                <GoalStatusPanel
                  goal={activeGoal}
                  isRunning={isActive}
                  compact={showWorkspacePanel || isMobileLayout}
                />
              )}
              <BackgroundAgentTasksPanel
                tasks={backgroundAgentTasks}
                compact={showWorkspacePanel || isMobileLayout}
              />

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
