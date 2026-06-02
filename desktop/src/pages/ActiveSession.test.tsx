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
  transitionWorkflow: vi.fn(),
}))

vi.mock('../hooks/useMobileViewport', () => ({
  useMobileViewport: () => viewportMocks.isMobile,
}))

vi.mock('../api/sessions', () => ({
  sessionsApi: {
    getMessages: apiMocks.getMessages,
    getSlashCommands: apiMocks.getSlashCommands,
    transitionWorkflow: apiMocks.transitionWorkflow,
  },
}))

vi.mock('../components/chat/MessageList', () => ({
  MessageList: ({ compact }: { compact?: boolean }) => (
    <div data-testid="message-list" data-compact={compact ? 'true' : 'false'} />
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

import { ActiveSession } from './ActiveSession'
import { useChatStore } from '../stores/chatStore'
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
import type { WorkflowSessionSummary } from '../types/session'

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
  apiMocks.getMessages.mockResolvedValue({ messages: [] })
  apiMocks.getSlashCommands.mockResolvedValue({ commands: [] })
  apiMocks.transitionWorkflow.mockResolvedValue({
    ok: true,
    workflow: WORKFLOW_SUMMARY,
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
})

describe('ActiveSession task polling', () => {
  it('does not render workflow controls for a normal dialogue active chat', () => {
    const sessionId = 'dialogue-session'

    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Dialogue Session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:00:00.000Z',
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

  it('renders the workflow status panel only for staged workflow sessions', () => {
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
      tabs: [{ sessionId, title: 'Workflow Session', type: 'session', status: 'idle' }],
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
    expect(panel).toHaveTextContent(/agent development/i)
    expect(panel).toHaveTextContent(/specify/i)
    expect(panel).toHaveTextContent(/phase 2 of 5/i)
    expect(panel).toHaveTextContent(/state-001/i)
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
    expect(statusPanel).toHaveTextContent(/phase 2 of 5/i)
    const detailsToggle = within(statusPanel).getByRole('button', { name: /workflow details/i })
    expect(detailsToggle).toHaveAttribute('aria-expanded', 'false')
    const details = statusPanel.querySelector('#workflow-status-details')
    expect(details).toHaveAttribute('hidden')
    expect(details).toHaveTextContent(/state-001/i)
    expect(screen.queryByText(/final report not ready/i)).not.toBeInTheDocument()
    expect(within(chatColumn).getByTestId('message-list')).toBeInTheDocument()
    expect(within(chatColumn).getByTestId('chat-input')).toBeInTheDocument()
    expect(chatColumn.children[0]).toContainElement(statusPanel)
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
    const skillStatus = within(panel).getByTestId('workflow-recommended-skill-status')
    expect(skillStatus).toHaveTextContent(/recommended skills/i)
    expect(skillStatus).toHaveTextContent(/2 available/i)
    expect(skillStatus).toHaveTextContent(/1 unavailable/i)
    expect(skillStatus).toHaveTextContent(/1 degraded/i)
    expect(skillStatus).toHaveTextContent(/3 evidence/i)
    expect(skillStatus).toHaveTextContent(/sp-specify/i)
    expect(skillStatus).toHaveTextContent(/security-review/i)
    expect(skillStatus).toHaveTextContent(/plugin-helper/i)
    expect(skillStatus).not.toHaveTextContent(/style-pass-unused|bundle-default-unused/i)
    expect(skillStatus).not.toHaveTextContent(/auto.?exec|auto.?run|default gate|plugin-primary|default bundle|permission bypass/i)
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
    expect(panel).toHaveTextContent(/phase 3 of 5/i)
    expect(panel).toHaveTextContent(/waiting for confirmation/i)
    expect(panel).toHaveTextContent(/state-resumed-002/i)
    expect(panel).toHaveTextContent(/claude-opus-4/i)
    expect(panel).toHaveTextContent(/claude-sonnet-4/i)
    expect(panel).toHaveTextContent(/requested phase model is unavailable/i)
    expect(panel).not.toHaveTextContent(/stale-local-state/i)
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
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
    expect(panel).toHaveTextContent(/claude-opus-4/i)
    expect(panel).toHaveTextContent(/claude-sonnet-4/i)
    expect(panel).toHaveTextContent(/provider/i)
    expect(panel).toHaveTextContent(/phase-request/i)
    expect(panel).toHaveTextContent(/fallback applied/i)
    expect(panel).toHaveTextContent(/requested phase model is unavailable/i)

    const pendingArtifact = within(panel).getByTestId('workflow-pending-artifact')
    expect(pendingArtifact).toHaveTextContent(/plan handoff/i)
    expect(pendingArtifact).toHaveTextContent(/validated requirements/i)
    expect(pendingArtifact).toHaveTextContent(/agent-ready/i)

    const history = within(panel).getByTestId('workflow-artifact-history')
    for (const status of ['pending', 'accepted', 'rejected', 'superseded']) {
      expect(history).toHaveTextContent(new RegExp(status, 'i'))
    }
    expect(history).toHaveTextContent(/specification accepted for planning/i)
    expect(history).toHaveTextContent(/earlier plan omitted rollback evidence/i)
    expect(history).toHaveTextContent(/retry replaced this older plan artifact/i)
    expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /edit|save|delete/i })).not.toBeInTheDocument()
  })

  it.each([
    ['stale-template', 'Template source is stale'],
    ['missing-template', 'Template source is missing'],
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

    const reportLink = screen.getByRole('link', { name: /final workflow report/i })
    expect(reportLink).toHaveAttribute('href', 'report-001')
    expect(screen.getByText(/report-001/i)).toBeInTheDocument()
    expect(screen.getByTestId('workflow-status-panel')).toHaveTextContent(/state-completed-005/i)
    expect(screen.queryByRole('button', { name: /complete phase/i })).not.toBeInTheDocument()
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

    expect(screen.getByRole('link', { name: /final workflow report/i })).toHaveAttribute('href', 'final')
    const history = screen.getByTestId('workflow-artifact-history')
    expect(history).toHaveTextContent(/specification accepted for planning/i)
    expect(history).toHaveTextContent(/earlier plan omitted rollback evidence/i)
    expect(history).toHaveTextContent(/retry replaced this older plan artifact/i)
    expect(within(history).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(history).queryByRole('button', { name: /edit|save|delete/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /complete phase|confirm|reject|retry/i })).not.toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

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

  it('sends stateVersion with confirm, reject, and retry actions for pending artifacts', async () => {
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

      fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
      fireEvent.click(screen.getByRole('button', { name: /reject/i }))
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))

      await waitFor(() => {
        expect(sendWorkflowTransition).toHaveBeenCalledWith(sessionId, expect.objectContaining({
          phaseId: 'plan',
          action: 'confirm',
          stateVersion: 21,
        }))
        expect(sendWorkflowTransition).toHaveBeenCalledWith(sessionId, expect.objectContaining({
          phaseId: 'plan',
          action: 'reject',
          stateVersion: 21,
        }))
        expect(sendWorkflowTransition).toHaveBeenCalledWith(sessionId, expect.objectContaining({
          phaseId: 'plan',
          action: 'retry',
          stateVersion: 21,
        }))
      })
    } finally {
      useChatStore.setState({ sendWorkflowTransition: originalSendWorkflowTransition })
    }
  })

  it('confirms manual completion and sends optional summary and evidence payload', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /complete phase/i }))

    expect(sendWorkflowTransition).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: /complete discussion phase/i })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/summary/i), {
      target: { value: 'Discussion scope and acceptance criteria were reviewed.' },
    })
    fireEvent.change(screen.getByLabelText(/evidence/i), {
      target: { value: '.specify/features/004-workflow-session-mode/spec.md' },
    })
    fireEvent.click(screen.getByRole('button', { name: /confirm completion/i }))

    await waitFor(() => {
      expect(sendWorkflowTransition).toHaveBeenCalledWith(sessionId, expect.objectContaining({
        phaseId: 'discussion',
        action: 'manual_complete',
        stateVersion: 12,
        handoff: {
          summary: 'Discussion scope and acceptance criteria were reviewed.',
          artifacts: [],
        },
        rationale: 'User manually confirmed this phase is complete.',
        evidence: [
          {
            kind: 'manual',
            label: 'Manual completion evidence',
            ref: '.specify/features/004-workflow-session-mode/spec.md',
          },
        ],
      }))
    })
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
      status: 'running',
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
      expect(panel).toHaveTextContent(blockedReason)
      expect(panel).toHaveTextContent(new RegExp(blockedStatus, 'i'))
      expect(panel).toHaveTextContent(evidencePattern)
      expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /complete phase/i })).not.toBeInTheDocument()

      const retry = screen.getByRole('button', { name: /retry/i })
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
      tabs: [{ sessionId, title: 'Goal Visible Session', type: 'session', status: 'running' }],
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
      tabs: [{ sessionId, title: 'Background Agent Session', type: 'session', status: 'running' }],
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
              status: 'running',
              taskType: 'local_agent',
              description: 'Verify the todo app',
              summary: 'Running Playwright checks',
              usage: {
                totalTokens: 1200,
                toolUses: 4,
                durationMs: 45000,
              },
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

    expect(screen.getByText(/session active|会话活跃中/)).toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-variant', 'default')
  })

  it('collapses completed background agent tasks by default and can be expanded', () => {
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
              description: '小明: 介绍自己',
              summary: '小明已完成介绍',
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

    const panel = screen.getByTestId('background-agent-panel')
    expect(panel).toHaveTextContent('后台 Agent')
    expect(panel).toHaveTextContent('1 个运行中或最近任务')
    expect(screen.queryByText('小明已完成介绍')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('展开后台 Agent'))

    expect(screen.getByText('小明已完成介绍')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('折叠后台 Agent'))

    expect(screen.queryByText('小明已完成介绍')).not.toBeInTheDocument()
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
            status: 'running',
            sessionId: 'leader-session',
          },
          {
            agentId: 'security-reviewer@test-team',
            role: 'security-reviewer',
            status: 'running',
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
            status: 'running',
            sessionId: 'leader-session',
          },
          {
            agentId: 'security-reviewer@test-team',
            role: 'security-reviewer',
            status: 'running',
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

    expect(screen.getByText(/成员会话已断开/)).toBeInTheDocument()
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
              status: 'running',
              sessionId: 'leader-session',
            },
            {
              agentId: 'security-reviewer@test-team',
              role: 'security-reviewer',
              status: 'running',
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
