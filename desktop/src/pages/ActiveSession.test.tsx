import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { act } from 'react'

const viewportMocks = vi.hoisted(() => ({
  isMobile: false,
}))

const apiMocks = vi.hoisted(() => ({
  getMessages: vi.fn(),
  getSlashCommands: vi.fn(),
  getWorkflowReport: vi.fn(),
  listWorkflowTemplates: vi.fn(),
  listWorkflowGitCheckpoints: vi.fn(),
  createWorkflowGitCheckpoint: vi.fn(),
  restoreWorkflowGitCheckpoint: vi.fn(),
  startWorkflowFollowUpRun: vi.fn(),
  startWorkflowPreview: vi.fn(),
  stopWorkflowPreview: vi.fn(),
  exitWorkflow: vi.fn(),
  transitionWorkflow: vi.fn(),
}))

const tauriDialogMocks = vi.hoisted(() => ({
  open: vi.fn(),
}))

const expertApiMocks = vi.hoisted(() => ({
  downloadMaterialPackage: vi.fn(),
}))

vi.mock('../hooks/useMobileViewport', () => ({
  useMobileViewport: () => viewportMocks.isMobile,
}))

vi.mock('../api/sessions', () => ({
  sessionsApi: {
    getMessages: apiMocks.getMessages,
    getSlashCommands: apiMocks.getSlashCommands,
    getWorkflowReport: apiMocks.getWorkflowReport,
    listWorkflowTemplates: apiMocks.listWorkflowTemplates,
    listWorkflowGitCheckpoints: apiMocks.listWorkflowGitCheckpoints,
    createWorkflowGitCheckpoint: apiMocks.createWorkflowGitCheckpoint,
    restoreWorkflowGitCheckpoint: apiMocks.restoreWorkflowGitCheckpoint,
    startWorkflowFollowUpRun: apiMocks.startWorkflowFollowUpRun,
    startWorkflowPreview: apiMocks.startWorkflowPreview,
    stopWorkflowPreview: apiMocks.stopWorkflowPreview,
    exitWorkflow: apiMocks.exitWorkflow,
    transitionWorkflow: apiMocks.transitionWorkflow,
  },
}))

vi.mock('../api/experts', () => ({
  expertsApi: {
    downloadMaterialPackage: expertApiMocks.downloadMaterialPackage,
  },
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: tauriDialogMocks.open,
}))

vi.mock('../components/chat/MessageList', () => ({
  MessageList: ({ compact, workflowTransitionCard }: { compact?: boolean; workflowTransitionCard?: import('react').ReactNode }) => (
    <div data-testid="message-list" data-compact={compact ? 'true' : 'false'}>
      {workflowTransitionCard}
    </div>
  ),
}))

vi.mock('../components/chat/ChatInput', () => ({
  ChatInput: ({ compact, variant }: { compact?: boolean; variant?: string }) => (
    <div data-testid="chat-input" data-compact={compact ? 'true' : 'false'} data-variant={variant} />
  ),
}))

vi.mock('../components/teams/TeamStatusBar', () => ({
  TeamStatusBar: () => <div data-testid="team-status-bar" />,
}))

vi.mock('../components/chat/SessionTaskBar', () => ({
  SessionTaskBar: () => <div data-testid="session-task-bar" />,
}))

vi.mock('../components/workspace/WorkspacePanel', () => ({
  WorkspacePanel: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="workspace-panel">workspace:{sessionId}</div>
  ),
}))

vi.mock('./TerminalSettings', () => ({
  TerminalSettings: ({
    cwd,
    onOpenInTab,
    onClose,
    testId,
  }: {
    cwd?: string
    onOpenInTab?: () => void
    onClose?: () => void
    testId: string
  }) => (
    <div data-testid={testId} data-cwd={cwd ?? ''}>
      <button type="button" onClick={onOpenInTab}>Open in Tab</button>
      <button type="button" onClick={onClose}>Close terminal panel</button>
    </div>
  ),
}))

vi.mock('../components/experts/ExpertSelectionDialog', async () => {
  const React = await import('react')
  const { useExpertStore } = await import('../stores/expertStore')
  const { useSessionStore } = await import('../stores/sessionStore')

  return {
    ExpertSelectionDialog: ({
      open,
      onClose,
      sessionId,
      onEnterExpert,
    }: {
      open: boolean
      onClose: () => void
      sessionId?: string
      onEnterExpert: (expert: { id: string; name: string }) => Promise<void> | void
    }) => {
      const experts = useExpertStore((state) => state.experts)
      const exitExpertMode = useExpertStore((state) => state.exitExpertMode)
      const session = useSessionStore((state) => state.sessions.find((candidate) => candidate.id === sessionId))
      const [selectedExpertId, setSelectedExpertId] = React.useState<string | null>(null)
      const [confirming, setConfirming] = React.useState(false)
      if (!open) return null
      const selectedExpert = experts.find((expert) => expert.id === selectedExpertId) ?? experts[0]
      const currentExpert = session?.expert?.status === 'active' || session?.expert?.status === 'collecting' || session?.expert?.status === 'running'
        ? session.expert
        : null
      const needsSwitchConfirmation = Boolean(currentExpert && selectedExpert && currentExpert?.expertId !== selectedExpert.id)
      const enterSelectedExpert = async () => {
        if (!selectedExpert) return
        if (needsSwitchConfirmation && !confirming) {
          setConfirming(true)
          return
        }
        await onEnterExpert(selectedExpert)
        onClose()
      }
      const exitAndSwitch = async () => {
        if (!selectedExpert || !sessionId) return
        const exitedExpert = await exitExpertMode(sessionId)
        useSessionStore.setState((state) => ({
          sessions: state.sessions.map((candidate) => candidate.id === sessionId ? { ...candidate, expert: exitedExpert } : candidate),
        }))
        await onEnterExpert(selectedExpert)
        onClose()
      }

      return (
        <div data-testid="expert-selection-dialog">
          {experts.map((expert) => (
            <button key={expert.id} type="button" onClick={() => setSelectedExpertId(expert.id)}>{expert.name}</button>
          ))}
          <button type="button" onClick={enterSelectedExpert}>进入专家 Mode</button>
          {confirming && currentExpert ? (
            <div data-testid="expert-switch-confirmation">
              <p>当前会话正在使用「{currentExpert.expertName}」专家</p>
              <p>不会创建 workflow，也不会改动 workflow state</p>
              <button type="button" onClick={onClose}>继续当前专家</button>
              <button type="button" onClick={exitAndSwitch}>退出并切换</button>
              <button type="button" onClick={() => setConfirming(false)}>取消</button>
            </div>
          ) : null}
        </div>
      )
    },
  }
})

import { ActiveSession } from './ActiveSession'
import { ExpertSelectionDialog } from '../components/experts/ExpertSelectionDialog'
import { useChatStore } from '../stores/chatStore'
import { useExpertStore } from '../stores/expertStore'
import { useCLITaskStore } from '../stores/cliTaskStore'
import { useSessionStore } from '../stores/sessionStore'
import { useTabStore } from '../stores/tabStore'
import { useTeamStore } from '../stores/teamStore'
import { useWorkspacePanelStore } from '../stores/workspacePanelStore'
import { WORKSPACE_PANEL_DEFAULT_WIDTH } from '../stores/workspacePanelStore'
import { useTerminalPanelStore } from '../stores/terminalPanelStore'
import {
  TERMINAL_PANEL_DEFAULT_HEIGHT,
  TERMINAL_PANEL_MAX_HEIGHT,
  TERMINAL_PANEL_MIN_HEIGHT,
} from '../stores/terminalPanelStore'
import type { ExpertDefinition } from '../api/experts'
import type { ExpertSessionSummary, WorkflowSessionSummary } from '../types/session'

type WorkflowPhaseArtifact = {
  artifactId: string
  phaseId: string
  status: 'pending' | 'accepted' | 'rejected' | 'superseded'
  label: string
  handoffSummary: string
  evidenceSummary: string
  createdAt: string
  updatedAt?: string
  transitionId?: string
  completionId?: string
  provenance: 'agent-ready' | 'user-confirmation' | 'manual-complete'
}

const WORKFLOW_SUMMARY: WorkflowSessionSummary & { stateVersion: number } = {
  mode: 'workflow',
  templateId: 'agent-development',
  templateVersion: '1',
  templateSource: 'builtin',
  templateSnapshotId: 'snapshot-001',
  status: 'running',
  activePhaseId: 'specify',
  activePhaseIndex: 1,
  phaseCount: 5,
  stateVersion: 12,
  pendingConfirmation: false,
  transitionAuthority: 'user-confirmation',
  statePointer: {
    kind: 'workflow-state',
    sessionId: 'workflow-session',
    artifactId: 'state-001',
    schemaVersion: 1,
    createdAt: '2026-05-20T00:00:00.000Z',
    label: 'Workflow state',
  },
}

const PENDING_ARTIFACT: WorkflowPhaseArtifact = {
  artifactId: 'artifact-plan-pending',
  phaseId: 'plan',
  status: 'pending',
  label: 'Plan handoff',
  handoffSummary: 'Plan is ready for user confirmation.',
  evidenceSummary: 'Validated requirements, risk notes, and next phase checklist.',
  createdAt: '2026-05-20T00:06:00.000Z',
  transitionId: 'transition-pending-001',
  completionId: 'completion-plan-001',
  provenance: 'agent-ready',
}

const ARTIFACT_HISTORY: WorkflowPhaseArtifact[] = [
  PENDING_ARTIFACT,
  {
    artifactId: 'artifact-specify-accepted',
    phaseId: 'specify',
    status: 'accepted',
    label: 'Specify handoff',
    handoffSummary: 'Specification accepted for planning.',
    evidenceSummary: 'Checklist passed with no unresolved critical gaps.',
    createdAt: '2026-05-20T00:01:00.000Z',
    updatedAt: '2026-05-20T00:02:00.000Z',
    transitionId: 'transition-accepted-001',
    completionId: 'completion-specify-001',
    provenance: 'user-confirmation',
  },
  {
    artifactId: 'artifact-plan-rejected',
    phaseId: 'plan',
    status: 'rejected',
    label: 'Rejected plan handoff',
    handoffSummary: 'Earlier plan omitted rollback evidence.',
    evidenceSummary: 'User rejected the handoff before retry.',
    createdAt: '2026-05-20T00:03:00.000Z',
    updatedAt: '2026-05-20T00:04:00.000Z',
    transitionId: 'transition-rejected-001',
    completionId: 'completion-plan-previous',
    provenance: 'user-confirmation',
  },
  {
    artifactId: 'artifact-plan-superseded',
    phaseId: 'plan',
    status: 'superseded',
    label: 'Superseded plan handoff',
    handoffSummary: 'Retry replaced this older plan artifact.',
    evidenceSummary: 'Kept for audit after a newer submission arrived.',
    createdAt: '2026-05-20T00:04:00.000Z',
    updatedAt: '2026-05-20T00:05:00.000Z',
    transitionId: 'transition-superseded-001',
    completionId: 'completion-plan-superseded',
    provenance: 'agent-ready',
  },
]


function createExpertDefinition(overrides: Partial<ExpertDefinition> & Pick<ExpertDefinition, 'id' | 'name'>): ExpertDefinition {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? `${overrides.name}说明`,
    statusLabel: overrides.statusLabel ?? '框架已准备',
    packId: overrides.packId ?? 'builtin-experts',
    packName: overrides.packName ?? '内置专家基础包',
    packVersion: overrides.packVersion ?? '1.0.0',
    entrypoint: overrides.entrypoint ?? `experts/${overrides.id}/expert.json`,
    promptPaths: overrides.promptPaths ?? {},
    formPaths: overrides.formPaths ?? [],
    skillIds: overrides.skillIds ?? [],
    hostTools: overrides.hostTools ?? [],
    permissions: overrides.permissions ?? [],
    tools: overrides.tools ?? [],
    intakeFlow: overrides.intakeFlow,
    portable: overrides.portable ?? true,
  }
}

function createExpertSessionSummary(overrides: Partial<ExpertSessionSummary> & Pick<ExpertSessionSummary, 'expertId' | 'expertName'>): ExpertSessionSummary {
  return {
    mode: 'expert',
    expertId: overrides.expertId,
    expertName: overrides.expertName,
    packId: overrides.packId ?? 'builtin-experts',
    packVersion: overrides.packVersion ?? '1.0.0',
    status: overrides.status ?? 'active',
    activeRunId: overrides.activeRunId,
    intakeState: overrides.intakeState,
    materialRefs: overrides.materialRefs ?? [],
    startedAt: overrides.startedAt ?? '2026-07-08T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-07-08T00:00:00.000Z',
    completedAt: overrides.completedAt,
    exitedAt: overrides.exitedAt,
    error: overrides.error,
  }
}

function renderExpertSwitchDialog() {
  const sessionId = 'expert-switch-session'
  const currentExpert = createExpertDefinition({ id: 'repo-health-check', name: '项目体检' })
  const nextExpert = createExpertDefinition({ id: 'architecture-review', name: '架构顾问' })
  const activeExpert = createExpertSessionSummary({
    expertId: currentExpert.id,
    expertName: currentExpert.name,
    status: 'active',
  })
  const exitedExpert = { ...activeExpert, status: 'exited' as const, exitedAt: '2026-07-08T00:02:00.000Z' }
  const loadExperts = vi.fn().mockResolvedValue(undefined)
  const enterExpertMode = vi.fn().mockResolvedValue(createExpertSessionSummary({
    expertId: nextExpert.id,
    expertName: nextExpert.name,
    status: 'collecting',
  }))
  const exitExpertMode = vi.fn().mockResolvedValue(exitedExpert)
  const exportPack = vi.fn().mockResolvedValue(undefined)
  const onEnterExpert = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()

  useExpertStore.setState({
    experts: [currentExpert, nextExpert],
    packs: [],
    loadingExperts: false,
    expertsError: null,
    modePhase: 'idle',
    modeMessage: null,
    modeError: null,
    loadExperts,
    enterExpertMode,
    exitExpertMode,
    exportPack,
  })
  useSessionStore.setState({
    sessions: [{
      id: sessionId,
      title: 'Expert Switch Session',
      createdAt: '2026-07-08T00:00:00.000Z',
      modifiedAt: '2026-07-08T00:00:00.000Z',
      messageCount: 1,
      projectPath: '/workspace/project',
      workDir: '/workspace/project',
      workDirExists: true,
      expert: activeExpert,
    }],
    activeSessionId: sessionId,
    isLoading: false,
    error: null,
  })

  render(
    <ExpertSelectionDialog
      open
      onClose={onClose}
      projectRoot="/workspace/project"
      sessionId={sessionId}
      onEnterExpert={onEnterExpert}
    />,
  )

  return { sessionId, nextExpert, loadExperts, enterExpertMode, exitExpertMode, onEnterExpert, onClose }
}

const BLOCKED_ARTIFACT = {
  artifactId: 'artifact-plan-blocked',
  phaseId: 'plan',
  status: 'blocked',
  label: 'Plan blocked',
  handoffSummary: 'Plan phase is blocked until the user selects an OAuth account.',
  evidenceSummary: 'OAuth account selection is missing; no provider-owned artifact can be produced.',
  createdAt: '2026-05-20T00:07:00.000Z',
  transitionId: 'transition-blocked-001',
  completionId: 'completion-plan-blocked',
  provenance: 'agent-blocked',
}

const UNABLE_ARTIFACT = {
  artifactId: 'artifact-plan-unable',
  phaseId: 'plan',
  status: 'unable',
  label: 'Plan unable',
  handoffSummary: 'Plan phase cannot continue because implementation notes are unavailable.',
  evidenceSummary: 'Implementation notes could not be read from the referenced workflow artifact.',
  createdAt: '2026-05-20T00:08:00.000Z',
  transitionId: 'transition-unable-001',
  completionId: 'completion-plan-unable',
  provenance: 'agent-unable',
}

beforeEach(() => {
  delete (window as typeof window & { __TAURI__?: unknown }).__TAURI__
  tauriDialogMocks.open.mockReset()
  apiMocks.getMessages.mockResolvedValue({ messages: [] })
  apiMocks.getSlashCommands.mockResolvedValue({ commands: [] })
  apiMocks.getWorkflowReport.mockResolvedValue({
    pointer: {
      kind: 'final-report',
      sessionId: 'workflow-session',
      artifactId: 'final',
      schemaVersion: 1,
      createdAt: '2026-05-20T00:10:00.000Z',
    },
    report: {
      schemaVersion: 1,
      sessionId: 'workflow-session',
      status: 'completed',
      conversationSummary: 'Workflow completed.',
    },
  })
  apiMocks.transitionWorkflow.mockResolvedValue({
    ok: true,
    workflow: WORKFLOW_SUMMARY,
  })
  apiMocks.listWorkflowTemplates.mockResolvedValue({
    templates: [
      {
        id: 'debug-repair-workflow-v8',
        source: 'user',
        version: '8',
        name: 'Debug Repair Workflow',
        description: 'Debug, investigate, and repair a defect.',
        labels: ['bug'],
        phaseCount: 5,
        firstPhaseId: 'debug-memory-intake',
        phaseNames: ['Debug Memory Intake'],
        startable: true,
      },
      {
        id: 'feature-extension-workflow-v8',
        source: 'user',
        version: '8',
        name: 'Feature Extension Workflow',
        description: 'Plan and implement a feature extension.',
        labels: ['enhancement'],
        phaseCount: 4,
        firstPhaseId: 'feature-memory-plan',
        phaseNames: ['Feature Memory Plan'],
        startable: true,
      },
    ],
    invalidTemplates: [],
  })
  apiMocks.listWorkflowGitCheckpoints.mockResolvedValue({
    enabled: false,
    latestVersion: null,
    checkpoints: [],
  })
  apiMocks.createWorkflowGitCheckpoint.mockResolvedValue({
    workflow: WORKFLOW_SUMMARY,
    checkpoint: null,
    checkpoints: [],
  })
  apiMocks.restoreWorkflowGitCheckpoint.mockResolvedValue({
    workflow: WORKFLOW_SUMMARY,
    checkpoint: null,
    checkpoints: [],
  })
  apiMocks.startWorkflowFollowUpRun.mockResolvedValue({
    ok: true,
    workflow: {
      ...WORKFLOW_SUMMARY,
      activeWorkflowRunId: 'run-debug',
      workflowRuns: [
        { id: 'run-dev', templateId: 'agent-development', status: 'completed', artifacts: [], historyCount: 1, createdAt: '2026-05-20T00:00:00.000Z', updatedAt: '2026-05-20T00:10:00.000Z' },
        { id: 'run-debug', templateId: 'agent-development', status: 'active', primaryLabel: 'bug', artifacts: [], historyCount: 1, createdAt: '2026-05-20T00:11:00.000Z', updatedAt: '2026-05-20T00:11:00.000Z' },
      ],
    },
  })
  apiMocks.startWorkflowPreview.mockResolvedValue({
    ok: true,
    workflow: {
      ...WORKFLOW_SUMMARY,
      activePhaseId: 'run-preview',
      preview: {
        status: 'running',
        command: 'bun run dev',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    },
    preview: {
      status: 'running',
      command: 'bun run dev',
      updatedAt: '2026-07-02T00:00:00.000Z',
    },
  })
  apiMocks.stopWorkflowPreview.mockResolvedValue({
    ok: true,
    workflow: {
      ...WORKFLOW_SUMMARY,
      activePhaseId: 'run-preview',
      preview: {
        status: 'stopped',
        command: 'bun run dev',
        updatedAt: '2026-07-02T00:01:00.000Z',
      },
    },
    preview: {
      status: 'stopped',
      command: 'bun run dev',
      updatedAt: '2026-07-02T00:01:00.000Z',
    },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
  viewportMocks.isMobile = false
  useTabStore.setState({ tabs: [], activeTabId: null })
  useSessionStore.setState({ sessions: [], activeSessionId: null, isLoading: false, error: null })
  useChatStore.setState({ sessions: {} })
  useTeamStore.setState(useTeamStore.getInitialState(), true)
  useWorkspacePanelStore.setState(useWorkspacePanelStore.getInitialState(), true)
  useTerminalPanelStore.setState(useTerminalPanelStore.getInitialState(), true)
  delete (window as typeof window & { __TAURI__?: unknown }).__TAURI__
})

describe('ActiveSession task polling', () => {

  it('confirms before leaving an active expert when selecting another expert', async () => {
    const { exitExpertMode, onEnterExpert, onClose } = renderExpertSwitchDialog()

    await waitFor(() => expect(screen.getByRole('button', { name: /架构顾问/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /架构顾问/ }))
    fireEvent.click(screen.getByRole('button', { name: '进入专家 Mode' }))

    const confirmation = screen.getByTestId('expert-switch-confirmation')
    expect(within(confirmation).getByText(/当前会话正在使用「项目体检」专家/)).toBeInTheDocument()
    expect(within(confirmation).getByText(/不会创建 workflow，也不会改动 workflow state/)).toBeInTheDocument()
    expect(within(confirmation).getByRole('button', { name: '继续当前专家' })).toBeInTheDocument()
    expect(within(confirmation).getByRole('button', { name: '退出并切换' })).toBeInTheDocument()
    expect(within(confirmation).getByRole('button', { name: '取消' })).toBeInTheDocument()
    expect(exitExpertMode).not.toHaveBeenCalled()
    expect(onEnterExpert).not.toHaveBeenCalled()

    fireEvent.click(within(confirmation).getByRole('button', { name: '取消' }))
    expect(screen.queryByTestId('expert-switch-confirmation')).not.toBeInTheDocument()
    expect(exitExpertMode).not.toHaveBeenCalled()
    expect(onEnterExpert).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '进入专家 Mode' }))
    fireEvent.click(within(screen.getByTestId('expert-switch-confirmation')).getByRole('button', { name: '继续当前专家' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(exitExpertMode).not.toHaveBeenCalled()
    expect(onEnterExpert).not.toHaveBeenCalled()
  })

  it('exits the current expert before switching and does not touch workflow state', async () => {
    const { sessionId, nextExpert, exitExpertMode, onEnterExpert, onClose } = renderExpertSwitchDialog()

    await waitFor(() => expect(screen.getByRole('button', { name: /架构顾问/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /架构顾问/ }))
    fireEvent.click(screen.getByRole('button', { name: '进入专家 Mode' }))
    fireEvent.click(within(screen.getByTestId('expert-switch-confirmation')).getByRole('button', { name: '退出并切换' }))

    await waitFor(() => expect(exitExpertMode).toHaveBeenCalledWith(sessionId))
    await waitFor(() => expect(onEnterExpert).toHaveBeenCalledWith(nextExpert))
    const exitCallOrder = exitExpertMode.mock.invocationCallOrder[0]
    const enterCallOrder = onEnterExpert.mock.invocationCallOrder[0]
    expect(exitCallOrder).toBeDefined()
    expect(enterCallOrder).toBeDefined()
    expect(exitCallOrder!).toBeLessThan(enterCallOrder!)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useSessionStore.getState().sessions[0]?.expert?.status).toBe('exited')
    expect(apiMocks.startWorkflowFollowUpRun).not.toHaveBeenCalled()
    expect(apiMocks.transitionWorkflow).not.toHaveBeenCalled()
  })

  it('does not render workflow controls for a normal dialogue active chat', () => {
    const sessionId = 'dialogue-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Dialogue Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:00:00.000Z',
        messageCount: 0,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Dialogue Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'hello', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    expect(screen.getByTestId('message-list')).toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
    expect(screen.queryByTestId('workflow-status-panel')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })



  it('keeps Expert Mode chat-first while exposing optional intake and downloadable materials', async () => {
    const sessionId = 'expert-session'
    const expert = {
      mode: 'expert' as const,
      expertId: 'repo-health-check',
      expertName: '项目体检',
      packId: 'builtin-experts',
      packVersion: '1.0.0',
      status: 'active' as const,
      materialRefs: [],
      startedAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
      intakeState: {
        answers: {},
        errors: {},
        completedStepIds: [],
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    }
    const materialRef = {
      runId: 'expert-run-1',
      expertId: 'repo-health-check',
      expertName: '项目体检',
      packId: 'builtin-experts',
      packVersion: '1.0.0',
      summaryPath: '/workspace/project/.workflow/intake/expert-runs/expert-run-1/repo-health-check/material-summary.md',
      materialJsonPath: '/workspace/project/.workflow/intake/expert-runs/expert-run-1/repo-health-check/material.json',
      evidencePath: '/workspace/project/.workflow/intake/expert-runs/expert-run-1/repo-health-check/evidence.md',
      createdAt: '2026-07-08T00:01:00.000Z',
      title: '项目体检：怎么运行',
      shortSummary: '已生成专家材料包。',
    }
    const submitIntakeStep = vi.fn().mockResolvedValue(expert)
    const runExpertAgent = vi.fn().mockResolvedValue({
      expert: { ...expert, status: 'completed' as const, materialRefs: [materialRef] },
      materialRef,
    })

    useExpertStore.setState({
      experts: [{
        id: 'repo-health-check',
        name: '项目体检',
        description: '整理项目材料',
        statusLabel: '框架已准备',
        packId: 'builtin-experts',
        packName: '内置专家基础包',
        packVersion: '1.0.0',
        entrypoint: 'experts/repo-health-check/expert.json',
        promptPaths: {},
        formPaths: [],
        skillIds: ['repo-health-check-skill'],
        hostTools: [],
        permissions: [],
        tools: [],
        portable: true,
        intakeFlow: {
          version: 1,
          steps: [
            { type: 'question', id: 'focus', question: '你这次希望专家重点帮你看什么？', options: [{ id: 'run', label: '怎么运行' }, { id: 'test', label: '怎么测试' }] },
            {
              type: 'form',
              id: 'materials',
              title: '请补充材料',
              fields: [
                { id: 'projectRoot', kind: 'folder', label: '项目目录' },
                { id: 'briefFile', kind: 'file', label: '参考文件' },
                { id: 'materialPaths', kind: 'file-list', label: '附件路径' },
                { id: 'notes', kind: 'textarea', label: '补充说明' },
              ],
            },
          ],
        },
      }],
      submitIntakeStep,
      runExpertAgent,
    })
    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Expert Session',
        createdAt: '2026-07-08T00:00:00.000Z',
        modifiedAt: '2026-07-08T00:00:00.000Z',
        messageCount: 0,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        expert,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: '[专家] 项目体检 - Expert Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    const messageList = screen.getByTestId('message-list')
    expect(screen.getByTestId('expert-mode-strip')).toBeInTheDocument()
    expect(within(messageList).queryByTestId('expert-intake-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('expert-mode-banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '新建会话' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: /项目体检/ }).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '补充结构化信息' }))
    const expertIntakeCard = within(messageList).getByTestId('expert-intake-card')
    expect(within(expertIntakeCard).getByTestId('expert-intake-flow')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择文件夹' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '选择文件' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: '添加路径' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '选择文件夹' }))
    expect(await screen.findByText('当前环境不能打开系统选择器，请直接粘贴路径。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '怎么运行' }))
    fireEvent.change(screen.getByLabelText(/项目目录/), { target: { value: '/workspace/project-from-form' } })
    fireEvent.change(screen.getByLabelText(/参考文件/), { target: { value: '/workspace/project/README.md' } })
    fireEvent.change(screen.getByLabelText(/附件路径/), { target: { value: '/workspace/project/a.md\n/workspace/project/b.md' } })

    Object.defineProperty(window, '__TAURI__', { value: {}, configurable: true })
    tauriDialogMocks.open.mockResolvedValueOnce(['/workspace/project/c.md', '/workspace/project/a.md'])
    const fileButtons = screen.getAllByRole('button', { name: '选择文件' })
    const addFileListButton = fileButtons[1]
    expect(addFileListButton).toBeDefined()
    fireEvent.click(addFileListButton!)
    await waitFor(() => expect(tauriDialogMocks.open).toHaveBeenCalledWith(expect.objectContaining({
      directory: false,
      multiple: true,
      title: '选择文件',
    })))
    expect(await screen.findByText('已添加 2 个路径。')).toBeInTheDocument()
    expect(screen.getByLabelText(/附件路径/)).toHaveValue('/workspace/project/a.md\n/workspace/project/b.md\n/workspace/project/c.md')

    fireEvent.change(screen.getByLabelText(/补充说明/), { target: { value: '请优先整理启动命令。' } })
    fireEvent.click(screen.getByRole('button', { name: '生成材料包' }))

    await waitFor(() => expect(runExpertAgent).toHaveBeenCalledTimes(1))
    expect(submitIntakeStep).toHaveBeenCalledWith(sessionId, expect.objectContaining({
      answers: expect.objectContaining({
        focus: 'run',
        projectRoot: '/workspace/project-from-form',
        briefFile: '/workspace/project/README.md',
        materialPaths: ['/workspace/project/a.md', '/workspace/project/b.md', '/workspace/project/c.md'],
        notes: '请优先整理启动命令。',
      }),
    }))
    expect(runExpertAgent).toHaveBeenCalledWith(sessionId, expect.objectContaining({
      notes: '请优先整理启动命令。',
      projectRoot: '/workspace/project-from-form',
    }))
    expect(apiMocks.startWorkflowFollowUpRun).not.toHaveBeenCalled()

    expertApiMocks.downloadMaterialPackage.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)
    const createObjectURL = vi.fn().mockReturnValue('blob:expert-material')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const downloadClick = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: /专家产物/ }))
    expect(screen.getByTestId('expert-material-expert-run-1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下载材料包' }))
    await waitFor(() => expect(expertApiMocks.downloadMaterialPackage).toHaveBeenCalledWith(sessionId, 'expert-run-1'))
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(downloadClick).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:expert-material')
  })

  it('exits a workflow without deleting the session history', async () => {
    const sessionId = 'workflow-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:00:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow: WORKFLOW_SUMMARY,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Session', type: 'session', status: 'running' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'workflow started', timestamp: 1 }],
          chatState: 'thinking',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    const panel = screen.getByTestId('workflow-status-panel')
    expect(panel).toHaveTextContent(/\u5f00\u53d1\u6d41\u7a0b/)
    expect(panel).toHaveTextContent(/\u89c4\u683c\u6f84\u6e05.*Specify/)
    expect(panel).toHaveTextContent(/\u7b2c 2 \u6b65.*Specify/)
    expect(panel).not.toHaveTextContent(/state-001/i)

    apiMocks.exitWorkflow.mockResolvedValue({
      ok: true,
      workflow: { ...WORKFLOW_SUMMARY, status: 'cancelled', runStatus: 'cancelled' },
    })
    fireEvent.click(screen.getByRole('button', { name: '退出工作流' }))
    const confirmDialog = screen.getByRole('dialog', { name: '退出工作流' })
    expect(confirmDialog).toHaveTextContent('不会回滚已经写入磁盘的代码')
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '退出工作流' }))

    await waitFor(() => expect(apiMocks.exitWorkflow).toHaveBeenCalledWith(sessionId))
    await waitFor(() => expect(screen.queryByTestId('workflow-status-panel')).not.toBeInTheDocument())
    expect(useSessionStore.getState().sessions[0]?.workflow?.status).toBe('cancelled')
    expect(useChatStore.getState().sessions[sessionId]?.chatState).toBe('idle')
    expect(useTabStore.getState().tabs.find((tab) => tab.sessionId === sessionId)?.status).toBe('idle')
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
  })

  it('renders workflow preview controls and calls start and stop preview APIs', async () => {
    const sessionId = 'workflow-preview-session'
    const workflow: WorkflowSessionSummary = {
      ...WORKFLOW_SUMMARY,
      activePhaseId: 'run-preview',
      activePhaseIndex: 3,
      phaseNames: ['Route', 'Plan', 'Implement', 'Run Preview', 'Ship'],
      preview: {
        status: 'stopped',
        command: 'bun run dev',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    }

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Preview Session',
        createdAt: '2026-07-02T00:00:00.000Z',
        modifiedAt: '2026-07-02T00:00:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Preview Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'workflow started', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    const previewControls = screen.getByTestId('workflow-preview-controls')
    expect(previewControls).toHaveTextContent(/local preview/i)
    expect(previewControls).toHaveTextContent(/stopped/i)

    fireEvent.click(within(previewControls).getByTestId('workflow-preview-start'))

    await waitFor(() => {
      expect(apiMocks.startWorkflowPreview).toHaveBeenCalledWith(sessionId)
    })
    await waitFor(() => {
      expect(screen.getByTestId('workflow-preview-controls')).toHaveTextContent(/running/i)
    })

    const runningControls = screen.getByTestId('workflow-preview-controls')
    fireEvent.click(within(runningControls).getByTestId('workflow-preview-stop'))

    await waitFor(() => {
      expect(apiMocks.stopWorkflowPreview).toHaveBeenCalledWith(sessionId, {
        reason: 'User stopped local preview from workflow UI.',
      })
    })
  })

  it('keeps chat primary while showing compact workflow status for workflow sessions only', () => {
    const sessionId = 'workflow-compact-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Compact Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:00:00.000Z',
        messageCount: 3,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow: WORKFLOW_SUMMARY,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Compact Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'workflow started', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    const chatColumn = screen.getByTestId('active-session-chat-column')
    const statusPanel = within(chatColumn).getByTestId('workflow-status-panel')
    expect(statusPanel).toHaveClass('text-[12px]')
    expect(statusPanel).toHaveTextContent(/\u7b2c 2 \u6b65.*Specify/)
    expect(within(statusPanel).queryByTestId('workflow-status-details')).not.toBeInTheDocument()
    expect(statusPanel).not.toHaveTextContent(/state-001/i)
    expect(screen.queryByText(/final report not ready/i)).not.toBeInTheDocument()
    expect(within(chatColumn).getByTestId('message-list')).toBeInTheDocument()
    expect(within(chatColumn).getByTestId('chat-input')).toBeInTheDocument()
    expect(chatColumn.children[0]).toContainElement(statusPanel)
  })

  it('renders completed workflows as a single compact strip with report access', async () => {
    const sessionId = 'workflow-completed-session'
    const workflow: WorkflowSessionSummary = {
      ...WORKFLOW_SUMMARY,
      status: 'completed',
      activePhaseId: 'implement',
      activePhaseIndex: 4,
      reportPointer: {
        kind: 'final-report',
        sessionId,
        artifactId: 'final-report-001',
        schemaVersion: 1,
        createdAt: '2026-05-20T00:10:00.000Z',
        label: 'Final workflow report',
        uri: 'artifact://final-report-001',
      },
    }

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Completed Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:10:00.000Z',
        messageCount: 3,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Completed Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'workflow complete', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    const chatColumn = screen.getByTestId('active-session-chat-column')
    const strip = within(chatColumn).getByTestId('workflow-session-strip')
    expect(strip).toHaveAttribute('data-compact', 'true')
    expect(within(strip).getByTestId('completed-workflow-strip')).toHaveTextContent(/agent development/i)
    expect(within(strip).getByTestId('completed-workflow-strip')).toHaveTextContent(/completed/i)
    expect(within(chatColumn).queryByTestId('workflow-status-panel')).not.toBeInTheDocument()
    apiMocks.getWorkflowReport.mockResolvedValueOnce({
      pointer: workflow.reportPointer,
      report: {
        schemaVersion: 1,
        sessionId,
        status: 'completed',
        conversationSummary: 'Workflow completed.',
      },
    })
    const reportButton = within(strip).getByRole('button', { name: /final workflow report/i })
    expect(reportButton).toHaveAttribute('data-compact', 'true')
    fireEvent.click(reportButton)
    expect(apiMocks.getWorkflowReport).toHaveBeenCalledWith(sessionId)
    expect(await screen.findByRole('dialog', { name: /final workflow report/i })).toBeInTheDocument()
    expect(screen.getByTestId('workflow-final-report-json')).toHaveTextContent(/workflow completed/i)
    expect(within(chatColumn).getByTestId('message-list')).toBeInTheDocument()
    expect(within(chatColumn).getByTestId('chat-input')).toBeInTheDocument()
    fireEvent.click(within(strip).getByRole('button', { name: /debug/i }))
    const followUpDialog = await screen.findByRole('dialog', { name: '\u9009\u62e9\u8c03\u8bd5\u4fee\u590d workflow' })
    const startButton = within(followUpDialog).getByRole('button', { name: '\u4f7f\u7528\u8fd9\u4e2a workflow' })
    expect(startButton).toBeDisabled()
    expect(apiMocks.startWorkflowFollowUpRun).not.toHaveBeenCalled()

    fireEvent.click(within(followUpDialog).getByRole('radio', { name: /debug repair workflow/i }))
    expect(startButton).toBeEnabled()
    fireEvent.click(startButton)
    await waitFor(() => {
      expect(apiMocks.startWorkflowFollowUpRun).toHaveBeenCalledWith(sessionId, {
        request: 'Start Debug Repair follow-up from the previous workflow result.',
        kind: 'debug-repair',
        templateId: 'debug-repair-workflow-v8',
        templateSource: 'user',
        initialPhaseId: 'debug-memory-intake',
      })
    })
  })

  it('shows the active follow-up workflow on a completed workflow strip', () => {
    const sessionId = 'workflow-completed-with-follow-up-session'
    const workflow: WorkflowSessionSummary = {
      ...WORKFLOW_SUMMARY,
      status: 'completed',
      activeWorkflowRunId: 'run-feature-follow-up',
      workflowRuns: [
        { id: 'run-original', templateId: 'agent-development', status: 'completed', artifacts: [], historyCount: 1, createdAt: '2026-05-20T00:00:00.000Z', updatedAt: '2026-05-20T00:10:00.000Z' },
        { id: 'run-feature-follow-up', templateId: 'feature-extension', status: 'active', primaryLabel: 'enhancement', artifacts: [], historyCount: 1, createdAt: '2026-05-20T00:11:00.000Z', updatedAt: '2026-05-20T00:11:00.000Z' },
      ],
    }

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Follow Up Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:11:00.000Z',
        messageCount: 3,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Follow Up Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'workflow complete', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    const strip = screen.getByTestId('completed-workflow-strip')
    expect(within(strip).getByTestId('active-follow-up-workflow')).toHaveTextContent(/next: feature extension \u00b7 active/i)
    expect(within(strip).getByRole('button', { name: /debug/i })).toBeDisabled()
    expect(within(strip).getByRole('button', { name: /feature/i })).toBeDisabled()
    expect(within(strip).getByRole('button', { name: /development/i })).toBeDisabled()
    expect(apiMocks.startWorkflowFollowUpRun).not.toHaveBeenCalled()
  })

  it('renders bounded recommended skill evidence without listing unused recommendations', () => {
    const sessionId = 'workflow-skill-evidence-session'
    const workflow = {
      ...WORKFLOW_SUMMARY,
      recommendedSkillStatus: {
        total: 5,
        available: 2,
        unavailable: 1,
        degraded: 1,
        evidenceCount: 3,
        activePhaseItems: [
          { name: 'sp-specify', status: 'available', source: 'project' },
          { name: 'security-review', status: 'missing', source: 'user' },
          { name: 'plugin-helper', status: 'plugin-disabled', source: 'plugin', pluginName: 'disabled-plugin' },
          { name: 'style-pass-unused', status: 'available', source: 'bundled' },
          { name: 'bundle-default-unused', status: 'available', source: 'bundled' },
        ],
      },
      recommendedSkillEvidence: [
        {
          phaseId: 'specify',
          name: 'sp-specify',
          outcome: 'used',
          rationale: 'Used to align the specification.',
          recordedAt: '2026-05-20T00:01:00.000Z',
          source: 'project',
          resolutionStatus: 'available',
        },
        {
          phaseId: 'specify',
          name: 'security-review',
          outcome: 'relevant-skipped',
          rationale: 'Relevant but deferred until implementation.',
          recordedAt: '2026-05-20T00:02:00.000Z',
          source: 'user',
          resolutionStatus: 'missing',
        },
        {
          phaseId: 'specify',
          name: 'plugin-helper',
          outcome: 'relevant-unavailable',
          rationale: 'Plugin was disabled.',
          recordedAt: '2026-05-20T00:03:00.000Z',
          source: 'plugin',
          resolutionStatus: 'plugin-disabled',
        },
        {
          phaseId: 'specify',
          name: 'style-pass-unused',
          outcome: 'unused',
          rationale: 'Not relevant to this phase.',
          recordedAt: '2026-05-20T00:04:00.000Z',
          source: 'bundled',
          resolutionStatus: 'available',
        },
      ],
    } as WorkflowSessionSummary & {
      recommendedSkillEvidence: Array<Record<string, unknown>>
    }

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Skill Evidence Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:06:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Skill Evidence Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'workflow started', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    const panel = screen.getByTestId('workflow-status-panel')
    expect(within(panel).queryByTestId('workflow-recommended-skill-status')).not.toBeInTheDocument()

    expect(panel).not.toHaveTextContent(/sp-specify|security-review|plugin-helper/i)
    expect(panel).not.toHaveTextContent(/style-pass-unused|bundle-default-unused/i)
    expect(within(panel).queryByRole('button', { name: /show workflow details/i })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /run|execute|install|enable/i })).not.toBeInTheDocument()
  })

  it('renders resumed workflow metadata from the server summary without localStorage reconstruction', () => {
    const sessionId = 'workflow-resumed-session'
    const workflow: WorkflowSessionSummary = {
      ...WORKFLOW_SUMMARY,
      status: 'pending-confirmation',
      activePhaseId: 'plan',
      activePhaseIndex: 2,
      pendingConfirmation: true,
      model: {
        requestedModel: 'anthropic:claude-opus-4',
        actualModel: 'anthropic:claude-sonnet-4',
        providerId: 'anthropic',
        source: 'main-session-default',
        fallbackApplied: true,
        fallbackReason: 'Requested phase model is unavailable; using the current session default.',
        resolvedAt: '2026-05-20T00:05:00.000Z',
      },
      statePointer: {
        kind: 'workflow-state',
        sessionId,
        artifactId: 'state-resumed-002',
        schemaVersion: 1,
        createdAt: '2026-05-20T00:00:00.000Z',
        updatedAt: '2026-05-20T00:05:00.000Z',
        label: 'Recovered workflow state',
      },
    }

    window.localStorage.setItem('workflow-state', JSON.stringify({
      activePhaseId: 'requirements',
      statePointer: { artifactId: 'stale-local-state' },
    }))
    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Resumed Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:05:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Resumed Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'resume workflow', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    const panel = screen.getByTestId('workflow-status-panel')
    expect(panel).toHaveTextContent(/plan/i)
    expect(panel).toHaveTextContent(/\u7b2c 3 \u6b65.*Plan/)
    expect(panel).toHaveTextContent(/\u7b49\u5f85\u786e\u8ba4/)
    expect(panel).not.toHaveTextContent(/state-resumed-002/i)
    expect(panel).not.toHaveTextContent(/claude-opus-4/i)
    expect(panel).not.toHaveTextContent(/claude-sonnet-4/i)
    expect(panel).not.toHaveTextContent(/requested phase model is unavailable/i)
    expect(panel).not.toHaveTextContent(/stale-local-state/i)
    expect(screen.getByRole('button', { name: /继续使用这个结果/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /我要调整当前结果/ })).toBeInTheDocument()

  })

  it('renders pending confirmation artifact evidence, model provenance, and read-only artifact history', () => {
    const sessionId = 'workflow-pending-artifact-session'
    const workflow = {
      ...WORKFLOW_SUMMARY,
      status: 'pending-confirmation',
      activePhaseId: 'plan',
      activePhaseIndex: 2,
      stateVersion: 21,
      pendingConfirmation: true,
      transitionAuthority: 'user-confirmation',
      model: {
        requestedModel: 'anthropic:claude-opus-4',
        actualModel: 'anthropic:claude-sonnet-4',
        providerId: 'anthropic',
        source: 'phase-request',
        fallbackApplied: true,
        fallbackReason: 'Requested phase model is unavailable; using the current session default.',
        resolvedAt: '2026-05-20T00:05:00.000Z',
      },
      pendingArtifact: PENDING_ARTIFACT,
      artifactHistory: ARTIFACT_HISTORY,
      statePointer: {
        ...WORKFLOW_SUMMARY.statePointer,
        sessionId,
        artifactId: 'state-pending-artifact-003',
      },
    } satisfies WorkflowSessionSummary & {
      stateVersion: number
      pendingArtifact: WorkflowPhaseArtifact
      artifactHistory: WorkflowPhaseArtifact[]
    }

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Pending Artifact Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:06:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Pending Artifact Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'plan ready', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    const panel = screen.getByTestId('workflow-status-panel')
    expect(panel).not.toHaveTextContent(/claude-opus-4/i)
    expect(within(panel).queryByTestId('workflow-pending-artifact')).not.toBeInTheDocument()
    expect(within(panel).queryByTestId('workflow-artifact-history')).not.toBeInTheDocument()
    expect(panel).toHaveTextContent(/\u5f00\u53d1\u6d41\u7a0b/)
    expect(panel).toHaveTextContent(/\u5236\u5b9a\u8ba1\u5212.*Plan/)
    expect(panel).not.toHaveTextContent(/claude-opus-4/i)
    expect(screen.queryByTestId('workflow-artifact-history')).not.toBeInTheDocument()
    expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /edit|save|delete/i })).not.toBeInTheDocument()
  })

  it.each([
    ['stale-template', '\u6a21\u677f\u9700\u66f4\u65b0'],
    ['missing-template', '\u6a21\u677f\u7f3a\u5931'],
  ] as const)('surfaces %s recovery state on the active workflow session', (status, expectedLabel) => {
    const sessionId = `workflow-${status}-session`

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Recovery Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:05:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow: {
          ...WORKFLOW_SUMMARY,
          status,
          statePointer: {
            ...WORKFLOW_SUMMARY.statePointer,
            sessionId,
            artifactId: `${status}-state`,
          },
        },
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Recovery Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'recover workflow', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    expect(screen.getByTestId('workflow-status-panel')).toHaveTextContent(new RegExp(expectedLabel, 'i'))
  })

  it('renders final report availability from the server-provided workflow pointer', () => {
    const sessionId = 'workflow-completed-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Completed Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:10:00.000Z',
        messageCount: 2,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow: {
          ...WORKFLOW_SUMMARY,
          status: 'completed',
          activePhaseId: null,
          activePhaseIndex: 4,
          statePointer: {
            ...WORKFLOW_SUMMARY.statePointer,
            sessionId,
            artifactId: 'state-completed-005',
          },
          reportPointer: {
            kind: 'final-report',
            sessionId,
            artifactId: 'report-001',
            schemaVersion: 1,
            createdAt: '2026-05-20T00:10:00.000Z',
            label: 'Final workflow report',
          },
        },
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Completed Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'final summary', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    const reportButton = screen.getByRole('button', { name: /final workflow report/i })
    expect(reportButton).toHaveAttribute('data-compact', 'true')
    expect(screen.queryByText(/report-001/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('workflow-status-panel')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /完成当前阶段/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('keeps completed workflow artifact history read-only when showing final report actions after resume', () => {
    const sessionId = 'workflow-completed-history-session'
    const workflow = {
      ...WORKFLOW_SUMMARY,
      status: 'completed',
      activePhaseId: null,
      activePhaseIndex: 4,
      pendingConfirmation: false,
      artifactHistory: ARTIFACT_HISTORY.filter((artifact) => artifact.status !== 'pending'),
      statePointer: {
        ...WORKFLOW_SUMMARY.statePointer,
        sessionId,
        artifactId: 'state-completed-history-006',
      },
      reportPointer: {
        kind: 'final-report',
        sessionId,
        artifactId: 'final',
        schemaVersion: 1,
        createdAt: '2026-05-20T00:10:00.000Z',
        label: 'Final workflow report',
      },
    } satisfies WorkflowSessionSummary & {
      artifactHistory: WorkflowPhaseArtifact[]
    }

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Completed History Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:10:00.000Z',
        messageCount: 2,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Completed History Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'final summary', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    expect(screen.getByRole('button', { name: /final workflow report/i })).toHaveAttribute('data-compact', 'true')
    expect(screen.queryByTestId('workflow-artifact-history')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /details/i }))

    const history = screen.getByTestId('workflow-artifact-history')
    expect(history).toHaveTextContent(/specification accepted for planning/i)
    expect(history).toHaveTextContent(/earlier plan omitted rollback evidence/i)
    expect(history).toHaveTextContent(/retry replaced this older plan artifact/i)
    expect(within(history).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(history).queryByRole('button', { name: /edit|save|delete/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /完成当前阶段|确认当前阶段|我要调整当前结果|重试当前阶段/ })).not.toBeInTheDocument()
  })

  it('sends workflow transition commands over the live session websocket', async () => {
    const sessionId = 'workflow-pending-session'
    const workflow: WorkflowSessionSummary = {
      ...WORKFLOW_SUMMARY,
      status: 'pending-confirmation',
      pendingConfirmation: true,
      activePhaseId: 'specify',
      statePointer: {
        ...WORKFLOW_SUMMARY.statePointer,
        sessionId,
      },
    }

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Pending Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:00:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Pending Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'confirm next phase', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    const sendWorkflowTransition = vi.fn()
    const originalSendWorkflowTransition = useChatStore.getState().sendWorkflowTransition
    useChatStore.setState({ sendWorkflowTransition })

    render(<ActiveSession />)

    fireEvent.click(screen.getByRole('button', { name: /继续使用这个结果/ }))

    await waitFor(() => {
      expect(sendWorkflowTransition).toHaveBeenCalledWith(sessionId, expect.objectContaining({
        phaseId: 'specify',
        action: 'confirm',
        stateVersion: 12,
      }))
    })
    expect(apiMocks.transitionWorkflow).not.toHaveBeenCalled()
    useChatStore.setState({ sendWorkflowTransition: originalSendWorkflowTransition })
  })

  it('locks pending artifact transition controls after the first action', async () => {
    const sessionId = 'workflow-pending-actions-session'
    const workflow = {
      ...WORKFLOW_SUMMARY,
      status: 'pending-confirmation',
      pendingConfirmation: true,
      activePhaseId: 'plan',
      activePhaseIndex: 2,
      stateVersion: 21,
      pendingArtifact: PENDING_ARTIFACT,
      artifactHistory: ARTIFACT_HISTORY,
      statePointer: {
        ...WORKFLOW_SUMMARY.statePointer,
        sessionId,
      },
    } satisfies WorkflowSessionSummary & {
      stateVersion: number
      pendingArtifact: WorkflowPhaseArtifact
      artifactHistory: WorkflowPhaseArtifact[]
    }

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Pending Actions Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:06:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Pending Actions Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'plan ready', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    const sendWorkflowTransition = vi.fn()
    const originalSendWorkflowTransition = useChatStore.getState().sendWorkflowTransition
    useChatStore.setState({ sendWorkflowTransition })

    try {
      render(<ActiveSession />)

      fireEvent.click(screen.getByRole('button', { name: /继续使用这个结果/ }))
      fireEvent.click(screen.getByRole('button', { name: /我要调整当前结果/ }))
      fireEvent.click(screen.getByRole('button', { name: /暂停工作流/ }))

      await waitFor(() => {
        expect(sendWorkflowTransition).toHaveBeenCalledTimes(1)
        expect(sendWorkflowTransition).toHaveBeenCalledWith(sessionId, expect.objectContaining({
          phaseId: 'plan',
          action: 'confirm',
          transitionId: 'workflow-transition:plan:21:confirm',
          stateVersion: 21,
        }))
      })

    } finally {
      useChatStore.setState({ sendWorkflowTransition: originalSendWorkflowTransition })
    }
  })

  it('does not show pending confirmation controls for running workflows', () => {
    const sessionId = 'workflow-running-session'
    const workflow: WorkflowSessionSummary = {
      ...WORKFLOW_SUMMARY,
      status: 'running',
      pendingConfirmation: false,
      activePhaseId: 'discussion',
      activePhaseIndex: 0,
      statePointer: {
        ...WORKFLOW_SUMMARY.statePointer,
        sessionId,
      },
    }

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Running Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:00:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Running Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'requirements done', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    const sendWorkflowTransition = vi.fn()
    const originalSendWorkflowTransition = useChatStore.getState().sendWorkflowTransition
    useChatStore.setState({ sendWorkflowTransition })

    render(<ActiveSession />)

    expect(screen.queryByRole('button', { name: /继续使用这个结果/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /complete discussion phase/i })).not.toBeInTheDocument()
    expect(sendWorkflowTransition).not.toHaveBeenCalled()
    expect(apiMocks.transitionWorkflow).not.toHaveBeenCalled()
    useChatStore.setState({ sendWorkflowTransition: originalSendWorkflowTransition })
  })

  it.each([
    [
      'blocked',
      BLOCKED_ARTIFACT,
      'Waiting for the user to select an OAuth account.',
      /oauth account selection is missing/i,
    ],
    [
      'unable',
      UNABLE_ARTIFACT,
      'The phase cannot continue because implementation notes are unavailable.',
      /implementation notes could not be read/i,
    ],
  ] as const)('renders %s workflow status evidence without unsafe advancement controls', async (
    blockedStatus,
    artifact,
    blockedReason,
    evidencePattern,
  ) => {
    const sessionId = `workflow-${blockedStatus}-status-session`
    const workflow = {
      ...WORKFLOW_SUMMARY,
      status: 'idle',
      pendingConfirmation: false,
      activePhaseId: 'plan',
      activePhaseIndex: 2,
      blockedStatus,
      blockedReason,
      blockedArtifact: artifact,
      artifactHistory: [artifact],
      statePointer: {
        ...WORKFLOW_SUMMARY.statePointer,
        sessionId,
      },
    }

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Blocked Status Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:08:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow: workflow as unknown as WorkflowSessionSummary,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Blocked Status Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'workflow blocked', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    const sendWorkflowTransition = vi.fn()
    const originalSendWorkflowTransition = useChatStore.getState().sendWorkflowTransition
    useChatStore.setState({ sendWorkflowTransition })

    try {
      render(<ActiveSession />)

      const panel = screen.getByTestId('workflow-status-panel')
      expect(panel).toHaveTextContent(/\u5236\u5b9a\u8ba1\u5212.*Plan/)
      expect(panel).not.toHaveTextContent(blockedReason)
      const confirmationCard = screen.getByTestId('workflow-phase-confirmation-card')
      expect(confirmationCard).toHaveTextContent(blockedReason)
      expect(confirmationCard).not.toHaveTextContent(evidencePattern)
      expect(screen.queryByRole('button', { name: /继续使用这个结果/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /我要调整当前结果/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /完成当前阶段/ })).not.toBeInTheDocument()

      const retry = screen.getByRole('button', { name: /重试当前阶段/ })
      fireEvent.click(retry)

      await waitFor(() => {
        expect(sendWorkflowTransition).toHaveBeenCalledWith(sessionId, expect.objectContaining({
          phaseId: 'plan',
          action: 'retry',
          stateVersion: 12,
        }))
      })
      expect(apiMocks.transitionWorkflow).not.toHaveBeenCalled()
    } finally {
      useChatStore.setState({ sendWorkflowTransition: originalSendWorkflowTransition })
    }
  })

  it('keeps pending confirmation controls ahead of stale blocked recovery in active session', () => {
    const sessionId = 'workflow-pending-stale-blocked-session'
    const workflow = {
      ...WORKFLOW_SUMMARY,
      status: 'pending-confirmation',
      pendingConfirmation: true,
      activePhaseId: 'plan',
      activePhaseIndex: 2,
      blockedStatus: 'blocked',
      blockedReason: 'Old blocked recovery reason.',
      statePointer: {
        ...WORKFLOW_SUMMARY.statePointer,
        sessionId,
      },
    }

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workflow Pending Confirmation Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:08:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
        workflow: workflow as unknown as WorkflowSessionSummary,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workflow Pending Confirmation Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'workflow pending', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    const panel = screen.getByTestId('workflow-status-panel')
    expect(panel).toHaveTextContent(/\u5f00\u53d1\u6d41\u7a0b/)
    expect(panel).not.toHaveTextContent(/old blocked recovery reason/i)
    expect(screen.getByRole('button', { name: /继续使用这个结果/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /我要调整当前结果/ })).toBeInTheDocument()
  })

  it('treats a persisted historical session as non-empty before messages finish loading', () => {
    const sessionId = 'history-loading-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'History Loading Session',
        createdAt: '2026-05-07T00:00:00.000Z',
        modifiedAt: '2026-05-07T00:00:00.000Z',
        messageCount: 2,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'History Loading Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    expect(screen.getByTestId('message-list')).toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-variant', 'default')
  })

  it('renders the current goal as a lightweight header strip without a page-level panel', () => {
    const sessionId = 'goal-visible-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Goal Visible Session',
        createdAt: '2026-05-07T00:00:00.000Z',
        modifiedAt: '2026-05-07T00:00:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Goal Visible Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{
            id: 'goal-event',
            type: 'goal_event',
            action: 'created',
            status: 'active',
            objective: 'ship the smoke test',
            budget: '0 / 2,000 tokens',
            continuations: '0',
            timestamp: 1,
          }],
          activeGoal: {
            action: 'created',
            status: 'active',
            objective: 'ship the smoke test',
            budget: '0 / 2,000 tokens',
            continuations: '0',
            updatedAt: 1,
          },
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    expect(screen.queryByTestId('active-goal-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('active-goal-strip')).toBeInTheDocument()
    expect(screen.getByTestId('active-goal-strip')).toHaveTextContent('ship the smoke test')
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
  })

  it('does not keep a completed goal pinned in the header', () => {
    const sessionId = 'goal-completed-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Goal Completed Session',
        createdAt: '2026-05-07T00:00:00.000Z',
        modifiedAt: '2026-05-07T00:00:00.000Z',
        messageCount: 3,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Goal Completed Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{
            id: 'goal-completed-event',
            type: 'goal_event',
            action: 'completed',
            status: 'complete',
            message: 'Goal marked complete.',
            timestamp: 3,
          }],
          activeGoal: {
            action: 'completed',
            status: 'complete',
            message: 'Goal marked complete.',
            updatedAt: 3,
          },
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    expect(screen.queryByTestId('active-goal-strip')).not.toBeInTheDocument()
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
  })

  it('does not render background agent progress as a page-level panel', () => {
    const sessionId = 'background-agent-visible-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Background Agent Session',
        createdAt: '2026-05-07T00:00:00.000Z',
        modifiedAt: '2026-05-07T00:00:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Background Agent Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [],
          activeGoal: {
            action: 'created',
            status: 'active',
            objective: 'ship the smoke test',
            updatedAt: 1,
          },
          backgroundAgentTasks: {
            'agent-task-1': {
              taskId: 'agent-task-1',
              toolUseId: 'agent-tool-1',
              status: 'completed',
              taskType: 'in_process_teammate',
              description: 'Background agent: introduce self',
              summary: 'Background agent completed introduction',
              startedAt: 1,
              updatedAt: 2,
            },
          },
          chatState: 'tool_executing',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    expect(screen.queryByTestId('background-agent-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
  })

  it('keeps the session header active while a background task is still running after the turn completes', () => {
    const sessionId = 'background-shell-running-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Background Shell Session',
        createdAt: '2026-05-07T00:00:00.000Z',
        modifiedAt: new Date().toISOString(),
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Background Shell Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'task started', timestamp: 1 }],
          backgroundAgentTasks: {
            'bash-task-1': {
              taskId: 'bash-task-1',
              toolUseId: 'bash-tool-1',
              status: 'running',
              taskType: 'local_bash',
              description: 'Run page integration checks',
              startedAt: 1,
              updatedAt: 2,
            },
          },
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    expect(screen.getByText(/Background Shell Session/i)).toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-variant', 'default')
  })

  it('does not render a page-level panel for completed background agent tasks', () => {
    const sessionId = 'background-agent-completed-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Background Agent Completed Session',
        createdAt: '2026-05-07T00:00:00.000Z',
        modifiedAt: '2026-05-07T00:00:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Background Agent Completed Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [],
          backgroundAgentTasks: {
            'agent-task-1': {
              taskId: 'agent-task-1',
              toolUseId: 'agent-tool-1',
              status: 'completed',
              taskType: 'in_process_teammate',
              description: 'Background agent: introduce self',
              summary: 'Background agent completed introduction',
              startedAt: 1,
              updatedAt: 2,
            },
          },
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    render(<ActiveSession />)

    expect(screen.queryByTestId('background-agent-panel')).not.toBeInTheDocument()
    expect(screen.queryByText('Background agent completed introduction')).not.toBeInTheDocument()
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
  })

  it('refreshes CLI tasks repeatedly while a turn is active', async () => {
    vi.useFakeTimers()

    const sessionId = 'polling-session'
    const originalCliTaskState = useCLITaskStore.getState()
    const fetchSessionTasks = vi.fn().mockResolvedValue(undefined)

    useCLITaskStore.setState({
      sessionId,
      tasks: [],
      fetchSessionTasks,
    })

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Polling Session',
        createdAt: '2026-04-10T00:00:00.000Z',
        modifiedAt: '2026-04-10T00:00:00.000Z',
        messageCount: 1,
        projectPath: '',
        workDir: null,
        workDirExists: true,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Polling Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [],
          chatState: 'thinking',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    const { unmount } = render(<ActiveSession />)

    expect(fetchSessionTasks).toHaveBeenCalledWith(sessionId)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2200)
    })

    expect(
      fetchSessionTasks.mock.calls.filter(([currentSessionId]) => currentSessionId === sessionId),
    ).toHaveLength(4)

    unmount()
    useCLITaskStore.setState(originalCliTaskState)
  })

  it('keeps member sessions interactive and skips leader task polling', () => {
    const memberSessionId = 'team-member:security-reviewer@test-team'
    const originalCliTaskState = useCLITaskStore.getState()
    const fetchSessionTasks = vi.fn().mockResolvedValue(undefined)

    useCLITaskStore.setState({
      sessionId: null,
      tasks: [],
      fetchSessionTasks,
    })

    useTeamStore.setState({
      teams: [],
      activeTeam: {
        name: 'test-team',
        leadAgentId: 'team-lead@test-team',
        leadSessionId: 'leader-session',
        members: [
          {
            agentId: 'team-lead@test-team',
            role: 'team-lead',
            status: 'idle',
            sessionId: 'leader-session',
          },
          {
            agentId: 'security-reviewer@test-team',
            role: 'security-reviewer',
            status: 'idle',
          },
        ],
      },
      memberColors: new Map(),
      error: null,
      refreshMemberSession: vi.fn().mockResolvedValue(undefined),
      startMemberPolling: vi.fn(),
    })

    useTabStore.setState({
      tabs: [{ sessionId: memberSessionId, title: 'security-reviewer', type: 'session', status: 'idle' }],
      activeTabId: memberSessionId,
    })

    useChatStore.setState({
      sessions: {
        [memberSessionId]: {
          messages: [],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    const { queryByTestId, unmount } = render(<ActiveSession />)

    expect(queryByTestId('chat-input')).toBeInTheDocument()
    expect(queryByTestId('session-task-bar')).not.toBeInTheDocument()
    expect(fetchSessionTasks).not.toHaveBeenCalled()

    unmount()
    useCLITaskStore.setState(originalCliTaskState)
  })

  it('refreshes a member transcript and resumes polling when returning to an open member tab', async () => {
    const memberSessionId = 'team-member:security-reviewer@test-team'
    const regularSessionId = 'regular-session'
    const refreshMemberSession = vi.fn().mockResolvedValue(undefined)
    const startMemberPolling = vi.fn()

    useTeamStore.setState({
      teams: [],
      activeTeam: {
        name: 'test-team',
        leadAgentId: 'team-lead@test-team',
        leadSessionId: 'leader-session',
        members: [
          {
            agentId: 'team-lead@test-team',
            role: 'team-lead',
            status: 'idle',
            sessionId: 'leader-session',
          },
          {
            agentId: 'security-reviewer@test-team',
            role: 'security-reviewer',
            status: 'idle',
          },
        ],
      },
      memberColors: new Map(),
      error: null,
      refreshMemberSession,
      startMemberPolling,
    })

    useSessionStore.setState({
      sessions: [{
        id: regularSessionId,
        title: 'Regular Session',
        createdAt: '2026-05-07T00:00:00.000Z',
        modifiedAt: '2026-05-07T00:00:00.000Z',
        messageCount: 1,
        projectPath: '/workspace/project',
        workDir: '/workspace/project',
        workDirExists: true,
      }],
      activeSessionId: regularSessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [
        { sessionId: memberSessionId, title: 'security-reviewer', type: 'session', status: 'idle' },
        { sessionId: regularSessionId, title: 'Regular Session', type: 'session', status: 'idle' },
      ],
      activeTabId: memberSessionId,
    })
    useChatStore.setState({
      sessions: {
        [memberSessionId]: {
          messages: [{ id: 'member-old', type: 'assistant_text', content: 'stale transcript', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
        [regularSessionId]: {
          messages: [{ id: 'regular-msg', type: 'assistant_text', content: 'regular transcript', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    const { rerender } = render(<ActiveSession />)

    refreshMemberSession.mockClear()
    startMemberPolling.mockClear()

    act(() => {
      useTabStore.setState({ activeTabId: regularSessionId })
      rerender(<ActiveSession />)
    })
    act(() => {
      useTabStore.setState({ activeTabId: memberSessionId })
      rerender(<ActiveSession />)
    })

    await waitFor(() => {
      expect(refreshMemberSession).toHaveBeenCalledWith(memberSessionId)
    })
    expect(startMemberPolling).toHaveBeenCalledWith(memberSessionId)
  })

  it('shows disconnected read-only copy for deleted member sessions', () => {
    const memberSessionId = 'team-member:security-reviewer@test-team'

    useTabStore.setState({
      tabs: [{ sessionId: memberSessionId, title: 'security-reviewer', type: 'session', status: 'idle' }],
      activeTabId: memberSessionId,
    })
    useChatStore.setState({
      sessions: {
        [memberSessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'Previous result', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'disconnected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })
    useTeamStore.setState({
      teams: [],
      activeTeam: null,
      memberColors: new Map(),
      error: null,
    })

    render(<ActiveSession />)

    expect(screen.getByText(/\u8fd9\u4e2a\u6210\u5458\u4f1a\u8bdd\u5df2\u65ad\u5f00/)).toBeInTheDocument()
    expect(screen.getByText('security-reviewer')).toBeInTheDocument()
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
    expect(screen.queryByTestId('session-task-bar')).not.toBeInTheDocument()
  })

  it('renders the workspace panel to the right of chat and supports resizing', () => {
    const sessionId = 'workspace-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Workspace Session',
        createdAt: '2026-04-10T00:00:00.000Z',
        modifiedAt: '2026-04-10T00:00:00.000Z',
        messageCount: 1,
        projectPath: '',
        workDir: '/tmp/project',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Workspace Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'hello', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })
    useWorkspacePanelStore.getState().openPanel(sessionId)

    render(<ActiveSession />)

    const contentRow = screen.getByTestId('active-session-content-row')
    const chatColumn = screen.getByTestId('active-session-chat-column')
    const resizeHandle = screen.getByTestId('workspace-resize-handle')

    expect(within(contentRow).getByTestId('message-list')).toBeInTheDocument()
    expect(within(contentRow).getByTestId('message-list')).toHaveAttribute('data-compact', 'true')
    expect(within(contentRow).getByTestId('workspace-panel')).toHaveTextContent(`workspace:${sessionId}`)
    expect(within(chatColumn).getByTestId('chat-input')).toBeInTheDocument()
    expect(within(chatColumn).getByTestId('chat-input')).toHaveAttribute('data-compact', 'true')
    expect(chatColumn).toHaveClass('flex-1')
    expect(chatColumn).not.toHaveClass('shrink-0')
    expect(contentRow.children[0]).toBe(chatColumn)
    expect(contentRow.children[1]).toBe(resizeHandle)
    expect(contentRow.children[2]).toBe(screen.getByTestId('workspace-panel'))

    act(() => {
      fireEvent.keyDown(resizeHandle, { key: 'ArrowLeft' })
    })

    expect(useWorkspacePanelStore.getState().width).toBe(WORKSPACE_PANEL_DEFAULT_WIDTH + 32)
  })

  it('does not render the workspace panel when closed or for member sessions', () => {
    const regularSessionId = 'regular-session'

    useSessionStore.setState({
      sessions: [{
        id: regularSessionId,
        title: 'Regular Session',
        createdAt: '2026-04-10T00:00:00.000Z',
        modifiedAt: '2026-04-10T00:00:00.000Z',
        messageCount: 0,
        projectPath: '',
        workDir: '/tmp/project',
        workDirExists: true,
      }],
      activeSessionId: regularSessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId: regularSessionId, title: 'Regular Session', type: 'session', status: 'idle' }],
      activeTabId: regularSessionId,
    })
    useChatStore.setState({
      sessions: {
        [regularSessionId]: {
          messages: [],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })

    const { rerender } = render(<ActiveSession />)
    expect(screen.queryByTestId('workspace-panel')).not.toBeInTheDocument()

    const memberSessionId = 'team-member:security-reviewer@test-team'
    act(() => {
      useTeamStore.setState({
        teams: [],
        activeTeam: {
          name: 'test-team',
          leadAgentId: 'team-lead@test-team',
          leadSessionId: 'leader-session',
          members: [
            {
              agentId: 'team-lead@test-team',
              role: 'team-lead',
              status: 'idle',
              sessionId: 'leader-session',
            },
            {
              agentId: 'security-reviewer@test-team',
              role: 'security-reviewer',
              status: 'idle',
            },
          ],
      },
      memberColors: new Map(),
      error: null,
      refreshMemberSession: vi.fn().mockResolvedValue(undefined),
      startMemberPolling: vi.fn(),
    })
      useTabStore.setState({
        tabs: [{ sessionId: memberSessionId, title: 'security-reviewer', type: 'session', status: 'idle' }],
        activeTabId: memberSessionId,
      })
      useChatStore.setState({
        sessions: {
          [memberSessionId]: {
            messages: [{ id: 'msg-2', type: 'assistant_text', content: 'hello', timestamp: 1 }],
            chatState: 'idle',
            connectionState: 'connected',
            streamingText: '',
            streamingToolInput: '',
            activeToolUseId: null,
            activeToolName: null,
            activeThinkingId: null,
            pendingPermission: null,
            pendingComputerUsePermission: null,
            tokenUsage: { input_tokens: 0, output_tokens: 0 },
            elapsedSeconds: 0,
            statusVerb: '',
            slashCommands: [],
            agentTaskNotifications: {},
            elapsedTimer: null,
          },
        },
      })
      useWorkspacePanelStore.getState().openPanel(memberSessionId)
      rerender(<ActiveSession />)
    })

    expect(screen.queryByTestId('workspace-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
  })

  it('keeps chat as the primary surface on mobile by hiding workspace and terminal panels', () => {
    const sessionId = 'mobile-session'
    viewportMocks.isMobile = true

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Mobile Session',
        createdAt: '2026-04-10T00:00:00.000Z',
        modifiedAt: '2026-04-10T00:00:00.000Z',
        messageCount: 1,
        projectPath: '/tmp/project-root',
        workDir: '/tmp/project-root',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Mobile Session', type: 'session', status: 'idle' }],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'hello', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })
    useWorkspacePanelStore.getState().openPanel(sessionId)
    useTerminalPanelStore.getState().openPanel(sessionId)

    render(<ActiveSession />)

    expect(screen.getByTestId('active-session-chat-column')).toHaveClass('min-w-0')
    expect(screen.getByTestId('message-list')).toHaveAttribute('data-compact', 'false')
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-compact', 'false')
    expect(screen.queryByRole('heading', { name: 'Mobile Session' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('workspace-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('workspace-resize-handle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('session-terminal-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('terminal-resize-handle')).not.toBeInTheDocument()
  })

  it('renders a bottom terminal panel in the current session cwd and can promote it to a tab', async () => {
    const sessionId = 'terminal-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Terminal Session',
        createdAt: '2026-04-10T00:00:00.000Z',
        modifiedAt: '2026-04-10T00:00:00.000Z',
        messageCount: 1,
        projectPath: '/tmp/project-root',
        workDir: '/tmp/project-root/packages/app',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({
      tabs: [{ sessionId, title: 'Terminal Session', status: 'idle' } as ReturnType<typeof useTabStore.getState>['tabs'][number]],
      activeTabId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'hello', timestamp: 1 }],
          chatState: 'idle',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: null,
          pendingComputerUsePermission: null,
          tokenUsage: { input_tokens: 0, output_tokens: 0 },
          elapsedSeconds: 0,
          statusVerb: '',
          slashCommands: [],
          agentTaskNotifications: {},
          elapsedTimer: null,
        },
      },
    })
    useTerminalPanelStore.getState().openPanel(sessionId)

    render(<ActiveSession />)

    const panel = screen.getByTestId('session-terminal-panel')
    const resizeHandle = screen.getByTestId('terminal-resize-handle')
    const host = screen.getByTestId(`session-terminal-host-${sessionId}`)

    expect(panel).toHaveStyle({ height: `${TERMINAL_PANEL_DEFAULT_HEIGHT}px` })
    expect(host).toHaveAttribute('data-cwd', '/tmp/project-root/packages/app')
    expect(resizeHandle).toHaveAttribute('aria-valuemin', `${TERMINAL_PANEL_MIN_HEIGHT}`)
    expect(resizeHandle).toHaveAttribute('aria-valuemax', `${TERMINAL_PANEL_MAX_HEIGHT}`)

    act(() => {
      fireEvent.keyDown(resizeHandle, { key: 'ArrowUp' })
    })
    expect(useTerminalPanelStore.getState().height).toBe(TERMINAL_PANEL_DEFAULT_HEIGHT + 24)

    await act(async () => {
      const pointerDown = createEvent.pointerDown(resizeHandle)
      Object.defineProperty(pointerDown, 'button', { value: 0 })
      Object.defineProperty(pointerDown, 'clientY', { value: 300 })
      fireEvent(resizeHandle, pointerDown)
    })

    await act(async () => {
      const pointerMove = new Event('pointermove')
      Object.defineProperty(pointerMove, 'clientY', { value: 260 })
      window.dispatchEvent(pointerMove)
      window.dispatchEvent(new Event('pointerup'))
    })
    expect(useTerminalPanelStore.getState().height).toBe(TERMINAL_PANEL_DEFAULT_HEIGHT + 64)

    act(() => {
      fireEvent.keyDown(resizeHandle, { key: 'End' })
    })
    expect(useTerminalPanelStore.getState().height).toBe(TERMINAL_PANEL_MAX_HEIGHT)

    act(() => {
      fireEvent.keyDown(resizeHandle, { key: 'Home' })
    })
    expect(useTerminalPanelStore.getState().height).toBe(TERMINAL_PANEL_MIN_HEIGHT)

    act(() => {
      fireEvent.doubleClick(resizeHandle)
    })
    expect(useTerminalPanelStore.getState().height).toBe(TERMINAL_PANEL_DEFAULT_HEIGHT)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open in Tab' }))
      await Promise.resolve()
    })

    const terminalTab = useTabStore.getState().tabs.find((tab) => tab.type === 'terminal')
    expect(useTerminalPanelStore.getState().isPanelOpen(sessionId)).toBe(false)
    expect(terminalTab?.terminalCwd).toBe('/tmp/project-root/packages/app')
    expect(useTabStore.getState().activeTabId).toBe(terminalTab?.sessionId)
  })
})
