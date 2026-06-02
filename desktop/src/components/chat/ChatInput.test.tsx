import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { act } from 'react'

const viewportMocks = vi.hoisted(() => ({
  isMobile: false,
}))

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  startLinkedWorkflowSession: vi.fn(),
  list: vi.fn(),
  listWorkflowTemplates: vi.fn(),
  getMessages: vi.fn(),
  getGitInfo: vi.fn(),
  getSlashCommands: vi.fn(),
  getRepositoryContext: vi.fn(),
  getRecentProjects: vi.fn(),
  search: vi.fn(),
  browse: vi.fn(),
  wsSend: vi.fn(),
  dialogOpen: vi.fn(),
  permissionModeSelectorRender: vi.fn(),
  webviewDragHandlers: [] as Array<(event: { payload: unknown }) => void>,
  webviewUnlisten: vi.fn(),
}))

vi.mock('../../api/sessions', () => ({
  sessionsApi: {
    create: mocks.create,
    delete: mocks.delete,
    startLinkedWorkflowSession: mocks.startLinkedWorkflowSession,
    list: mocks.list,
    listWorkflowTemplates: mocks.listWorkflowTemplates,
    getMessages: mocks.getMessages,
    getGitInfo: mocks.getGitInfo,
    getSlashCommands: mocks.getSlashCommands,
    getRepositoryContext: mocks.getRepositoryContext,
    getRecentProjects: mocks.getRecentProjects,
  },
}))

vi.mock('../../api/filesystem', () => ({
  filesystemApi: {
    search: mocks.search,
    browse: mocks.browse,
  },
}))

vi.mock('../../api/websocket', () => ({
  wsManager: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    clearHandlers: vi.fn(),
    send: mocks.wsSend,
  },
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: mocks.dialogOpen,
}))

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn(async (handler: (event: { payload: unknown }) => void) => {
      mocks.webviewDragHandlers.push(handler)
      return mocks.webviewUnlisten
    }),
  }),
}))

vi.mock('../../hooks/useMobileViewport', () => ({
  useMobileViewport: () => viewportMocks.isMobile,
}))

vi.mock('../controls/PermissionModeSelector', () => ({
  PermissionModeSelector: () => {
    mocks.permissionModeSelectorRender()
    return <button type="button">Permissions</button>
  },
}))

vi.mock('../controls/ModelSelector', () => ({
  ModelSelector: () => <button type="button">Model</button>,
}))

import { ChatInput } from './ChatInput'
import { useChatStore } from '../../stores/chatStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTabStore } from '../../stores/tabStore'
import { useTeamStore } from '../../stores/teamStore'
import { useUIStore } from '../../stores/uiStore'
import { useWorkspaceChatContextStore } from '../../stores/workspaceChatContextStore'

const BUILTIN_WORKFLOW_TEMPLATE = {
  id: 'requirements-to-implementation',
  source: 'builtin' as const,
  version: '1.0.0',
  name: 'Requirements to Implementation',
  description: 'Clarify, design, plan, implement, and verify.',
  phaseCount: 5,
  firstPhaseId: 'requirements-clarification',
  phaseNames: [
    'Requirements clarification',
    'Technical design',
    'Implementation planning',
    'Implementation',
    'Verification',
  ],
}

const LINKED_WORKFLOW_SUMMARY = {
  mode: 'workflow' as const,
  templateId: BUILTIN_WORKFLOW_TEMPLATE.id,
  templateVersion: '1.0.0',
  templateSource: BUILTIN_WORKFLOW_TEMPLATE.source,
  templateSnapshotId: 'requirements-to-implementation-v1',
  status: 'created' as const,
  activePhaseId: BUILTIN_WORKFLOW_TEMPLATE.firstPhaseId,
  activePhaseIndex: 0,
  phaseCount: BUILTIN_WORKFLOW_TEMPLATE.phaseCount,
  pendingConfirmation: false,
  statePointer: {
    kind: 'workflow-state' as const,
    sessionId: 'linked-workflow-session',
    artifactId: 'state',
    schemaVersion: 1,
    createdAt: '2026-05-26T00:00:00.000Z',
    label: 'Workflow state',
  },
}

function okRepositoryContext() {
  return {
    state: 'ok' as const,
    workDir: '/repo',
    repoRoot: '/repo',
    repoName: 'repo',
    currentBranch: 'main',
    defaultBranch: 'main',
    dirty: false,
    branches: [
      {
        name: 'main',
        current: true,
        local: true,
        remote: false,
        checkedOut: true,
        worktreePath: '/repo',
      },
      {
        name: 'feature/a',
        current: false,
        local: true,
        remote: false,
        checkedOut: false,
      },
    ],
    worktrees: [{
      path: '/repo',
      branch: 'main',
      current: true,
    }],
  }
}

describe('ChatInput file mentions', () => {
  const sessionId = 'session-file-mention'
  const initialChatState = useChatStore.getInitialState()
  const initialSessionState = useSessionStore.getInitialState()
  const initialTabState = useTabStore.getInitialState()
  const initialTeamState = useTeamStore.getInitialState()
  const initialUIState = useUIStore.getInitialState()
  const initialWorkspaceContextState = useWorkspaceChatContextStore.getInitialState()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.webviewDragHandlers.length = 0
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    viewportMocks.isMobile = false
    useSettingsStore.setState({ locale: 'en' })
    useChatStore.setState(initialChatState, true)
    useSessionStore.setState(initialSessionState, true)
    useTabStore.setState(initialTabState, true)
    useTeamStore.setState(initialTeamState, true)
    useUIStore.setState(initialUIState, true)
    useWorkspaceChatContextStore.setState(initialWorkspaceContextState, true)

    useTabStore.setState({
      activeTabId: sessionId,
      tabs: [{ sessionId, title: 'Project', type: 'session', status: 'idle' }],
    })
    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Project',
        createdAt: '2026-05-01T00:00:00.000Z',
        modifiedAt: '2026-05-01T00:00:00.000Z',
        messageCount: 1,
        projectPath: '/repo',
        workDir: '/repo',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          messages: [{ id: 'existing', type: 'assistant_text', content: 'ready', timestamp: 1 }],
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
    mocks.getGitInfo.mockResolvedValue({ branch: 'main', repoName: 'repo', workDir: '/repo', changedFiles: 0 })
    mocks.getRepositoryContext.mockResolvedValue(okRepositoryContext())
    mocks.getRecentProjects.mockResolvedValue({ projects: [] })
    mocks.create.mockResolvedValue({ sessionId: 'created-session', workDir: '/repo' })
    mocks.delete.mockResolvedValue({ ok: true })
    mocks.startLinkedWorkflowSession.mockResolvedValue({
      sessionId: 'linked-workflow-session',
      workDir: '/repo',
      workflow: LINKED_WORKFLOW_SUMMARY,
      link: {
        sourceSessionId: sessionId,
        targetSessionId: 'linked-workflow-session',
        contextStrategy: 'clear',
        sourceMessageCount: 1,
        createdAt: '2026-05-26T00:00:00.000Z',
      },
    })
    mocks.list.mockResolvedValue({ sessions: [], total: 0 })
    mocks.listWorkflowTemplates.mockResolvedValue({
      templates: [BUILTIN_WORKFLOW_TEMPLATE],
      invalidTemplates: [],
    })
    mocks.getMessages.mockResolvedValue({ messages: [] })
    mocks.getSlashCommands.mockResolvedValue({ commands: [] })
  })

  it('keeps deleted team member sessions read-only after they disconnect', () => {
    const memberSessionId = 'team-member:worker@test-team'
    useTabStore.setState({
      activeTabId: memberSessionId,
      tabs: [{ sessionId: memberSessionId, title: 'worker', type: 'session', status: 'idle' }],
    })
    useSessionStore.setState({
      sessions: [],
      activeSessionId: memberSessionId,
    })
    useChatStore.setState({
      sessions: {
        [memberSessionId]: {
          messages: [{ id: 'existing', type: 'assistant_text', content: 'done', timestamp: 1 }],
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

    render(<ChatInput />)

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('placeholder', 'This teammate session is disconnected. History is view-only.')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Open composer tools' })).not.toBeInTheDocument()
  })

  it('keeps unsent composer drafts isolated when switching between session tabs', async () => {
    const historySessionId = 'history-session'
    useTabStore.setState({
      activeTabId: sessionId,
      tabs: [
        { sessionId, title: 'New session', type: 'session', status: 'idle' },
        { sessionId: historySessionId, title: 'History session', type: 'session', status: 'idle' },
      ],
    })
    useSessionStore.setState({
      sessions: [
        {
          id: sessionId,
          title: 'New session',
          createdAt: '2026-05-01T00:00:00.000Z',
          modifiedAt: '2026-05-01T00:00:00.000Z',
          messageCount: 0,
          projectPath: '/repo',
          workDir: '/repo',
          workDirExists: true,
        },
        {
          id: historySessionId,
          title: 'History session',
          createdAt: '2026-05-01T00:00:00.000Z',
          modifiedAt: '2026-05-01T00:00:00.000Z',
          messageCount: 1,
          projectPath: '/repo',
          workDir: '/repo',
          workDirExists: true,
        },
      ],
      activeSessionId: sessionId,
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
        [historySessionId]: {
          messages: [{ id: 'history-message', type: 'assistant_text', content: 'ready', timestamp: 1 }],
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

    render(<ChatInput variant="hero" />)

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: { value: 'new tab draft', selectionStart: 13 },
    })
    expect(input.value).toBe('new tab draft')

    act(() => {
      useTabStore.setState({ activeTabId: historySessionId })
    })

    await waitFor(() => {
      expect(input.value).toBe('')
    })

    fireEvent.change(input, {
      target: { value: 'history tab draft', selectionStart: 17 },
    })

    act(() => {
      useTabStore.setState({ activeTabId: sessionId })
    })

    await waitFor(() => {
      expect(input.value).toBe('new tab draft')
    })

    act(() => {
      useTabStore.setState({ activeTabId: historySessionId })
    })

    await waitFor(() => {
      expect(input.value).toBe('history tab draft')
    })
  })

  it('restores an unsent composer draft after the composer unmounts', async () => {
    const { unmount } = render(<ChatInput compact />)

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: { value: 'keep this prompt while I inspect another tab', selectionStart: 43 },
    })
    expect(input.value).toBe('keep this prompt while I inspect another tab')

    unmount()
    render(<ChatInput compact />)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('keep this prompt while I inspect another tab')
    })
  })

  it('shows branch and worktree launch controls for an empty active Git session', async () => {
    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Project',
        createdAt: '2026-05-01T00:00:00.000Z',
        modifiedAt: '2026-05-01T00:00:00.000Z',
        messageCount: 0,
        projectPath: '/repo',
        workDir: '/repo',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
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

    render(<ChatInput variant="hero" />)

    const panel = screen.getByTestId('chat-input-panel')
    expect(panel).toHaveClass('rounded-xl')
    expect(panel).not.toHaveClass('rounded-b-none')

    expect(await screen.findByRole('button', { name: /Select branch: main/ })).toBeInTheDocument()
    expect(screen.getByText('Current worktree')).toBeInTheDocument()
    expect(screen.queryByText('Select a project...')).not.toBeInTheDocument()
    const branchButton = screen.getByRole('button', { name: /Select branch: main/ })
    expect(panel).toContainElement(branchButton.parentElement)
    expect(branchButton.parentElement).toHaveClass('bg-transparent')
  })

  it('uses the persisted message count to keep reopened sessions in context mode while history loads', async () => {
    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Project',
        createdAt: '2026-05-01T00:00:00.000Z',
        modifiedAt: '2026-05-01T00:00:00.000Z',
        messageCount: 2,
        projectPath: '/repo',
        workDir: '/repo',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
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

    render(<ChatInput variant="hero" />)

    expect(await screen.findByText('repo')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Select branch:/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Current worktree')).not.toBeInTheDocument()
  })

  it('does not rerender the composer controls for unrelated chat session updates', async () => {
    render(<ChatInput compact />)

    await waitFor(() => {
      expect(mocks.getGitInfo).toHaveBeenCalledWith(sessionId)
    })
    mocks.permissionModeSelectorRender.mockClear()

    act(() => {
      const current = useChatStore.getState().sessions
      useChatStore.setState({
        sessions: {
          ...current,
          'background-session': {
            messages: [{ id: 'bg-message', type: 'assistant_text', content: 'background update', timestamp: 1 }],
            chatState: 'streaming',
            connectionState: 'connected',
            streamingText: 'background token',
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
    })

    expect(mocks.permissionModeSelectorRender).not.toHaveBeenCalled()
  })

  it('does not rerender the composer controls for active streaming text updates', async () => {
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          ...useChatStore.getState().sessions[sessionId]!,
          chatState: 'streaming',
          streamingText: 'first token',
        },
      },
    })

    render(<ChatInput compact />)

    await waitFor(() => {
      expect(mocks.getGitInfo).toHaveBeenCalledWith(sessionId)
    })
    mocks.permissionModeSelectorRender.mockClear()

    act(() => {
      const current = useChatStore.getState().sessions
      useChatStore.setState({
        sessions: {
          ...current,
          [sessionId]: {
            ...current[sessionId]!,
            streamingText: 'first token second token',
          },
        },
      })
    })

    expect(mocks.permissionModeSelectorRender).not.toHaveBeenCalled()
  })

  it('starts an empty active session on the selected branch without an isolated worktree', async () => {
    mocks.create.mockResolvedValueOnce({ sessionId: 'created-direct', workDir: '/repo' })
    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Project',
        createdAt: '2026-05-01T00:00:00.000Z',
        modifiedAt: '2026-05-01T00:00:00.000Z',
        messageCount: 0,
        projectPath: '/repo',
        workDir: '/repo',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
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

    render(<ChatInput variant="hero" />)

    fireEvent.click(await screen.findByRole('button', { name: /Select branch: main/ }))
    fireEvent.click(await screen.findByRole('option', { name: /feature\/a/ }))
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'run on feature branch', selectionStart: 21 } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith({
        workDir: '/repo',
        repository: { branch: 'feature/a', worktree: false },
      })
    })
    expect(mocks.delete).toHaveBeenCalledWith(sessionId)
    expect(mocks.wsSend).toHaveBeenCalledWith('created-direct', {
      type: 'user_message',
      content: 'run on feature branch',
      attachments: [],
    })
  })

  it('opens workflows from the plus menu in an empty active session and starts a workflow session', async () => {
    mocks.create.mockResolvedValueOnce({
      sessionId: 'created-workflow',
      workDir: '/repo',
      workflow: {
        templateId: BUILTIN_WORKFLOW_TEMPLATE.id,
        templateSource: BUILTIN_WORKFLOW_TEMPLATE.source,
        currentPhaseId: BUILTIN_WORKFLOW_TEMPLATE.firstPhaseId,
        stateVersion: 1,
      },
    })
    mocks.list.mockResolvedValueOnce({
      sessions: [{
        id: 'created-workflow',
        title: 'New Session',
        createdAt: '2026-05-01T00:00:00.000Z',
        modifiedAt: '2026-05-01T00:00:00.000Z',
        messageCount: 0,
        projectPath: '/repo',
        workDir: '/repo',
        workDirExists: true,
        workflow: {
          templateId: BUILTIN_WORKFLOW_TEMPLATE.id,
          templateSource: BUILTIN_WORKFLOW_TEMPLATE.source,
          currentPhaseId: BUILTIN_WORKFLOW_TEMPLATE.firstPhaseId,
          stateVersion: 1,
        },
      }],
      total: 1,
    })
    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Project',
        createdAt: '2026-05-01T00:00:00.000Z',
        modifiedAt: '2026-05-01T00:00:00.000Z',
        messageCount: 0,
        projectPath: '/repo',
        workDir: '/repo',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
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

    render(<ChatInput variant="hero" />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /Workflows/ }))

    const dialog = await screen.findByTestId('workflow-start-dialog')
    expect(within(dialog).getByRole('heading', { name: 'Start workflow' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /Requirements to Implementation/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith({
        workDir: '/repo',
        workflow: {
          templateId: BUILTIN_WORKFLOW_TEMPLATE.id,
          templateSource: BUILTIN_WORKFLOW_TEMPLATE.source,
          initialPhaseId: BUILTIN_WORKFLOW_TEMPLATE.firstPhaseId,
        },
      })
    })
    expect(mocks.delete).toHaveBeenCalledWith(sessionId)
    expect(useTabStore.getState().activeTabId).toBe('created-workflow')
    expect(useSessionStore.getState().sessions[0]).toMatchObject({
      id: 'created-workflow',
      workflow: expect.objectContaining({
        templateId: BUILTIN_WORKFLOW_TEMPLATE.id,
        currentPhaseId: BUILTIN_WORKFLOW_TEMPLATE.firstPhaseId,
      }),
    })
    expect(mocks.wsSend).not.toHaveBeenCalledWith('created-workflow', expect.objectContaining({
      type: 'user_message',
    }))
  })

  it('opens workflows from the plus menu in a non-empty session and requires a context strategy', async () => {
    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /Workflows/ }))

    const workflowDialog = await screen.findByTestId('workflow-start-dialog')
    fireEvent.click(within(workflowDialog).getByRole('button', { name: /Requirements to Implementation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    const strategyDialog = await screen.findByTestId('workflow-context-strategy-dialog')
    expect(within(strategyDialog).getByRole('heading', { name: 'Choose source context' })).toBeInTheDocument()
    expect(within(strategyDialog).getByRole('button', { name: /Start clean/ })).toBeInTheDocument()
    expect(within(strategyDialog).getByRole('button', { name: /Inherit visible context/ })).toBeInTheDocument()
    expect(within(strategyDialog).getByRole('button', { name: /Summarize context/ })).toBeInTheDocument()
    expect(mocks.startLinkedWorkflowSession).not.toHaveBeenCalled()
  })

  it.each([
    ['clear' as const, /Start clean/, undefined],
    ['inherit' as const, /Inherit visible context/, undefined],
    ['summarize' as const, /Summarize context/, 'Preserve risks and decisions.'],
  ])('starts a linked workflow with %s context and opens the returned session', async (
    strategy,
    buttonName,
    summaryInstructions,
  ) => {
    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /Workflows/ }))
    const workflowDialog = await screen.findByTestId('workflow-start-dialog')
    fireEvent.click(within(workflowDialog).getByRole('button', { name: /Requirements to Implementation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    const strategyDialog = await screen.findByTestId('workflow-context-strategy-dialog')
    if (summaryInstructions) {
      fireEvent.change(within(strategyDialog).getByLabelText('Summary instructions'), {
        target: { value: summaryInstructions },
      })
    }
    fireEvent.click(within(strategyDialog).getByRole('button', { name: buttonName }))

    await waitFor(() => {
      expect(mocks.startLinkedWorkflowSession).toHaveBeenCalledWith(sessionId, expect.objectContaining({
        workflow: {
          templateId: BUILTIN_WORKFLOW_TEMPLATE.id,
          templateSource: BUILTIN_WORKFLOW_TEMPLATE.source,
          initialPhaseId: BUILTIN_WORKFLOW_TEMPLATE.firstPhaseId,
        },
        contextStrategy: strategy,
      }))
    })
    const payload = mocks.startLinkedWorkflowSession.mock.calls[0]?.[1]
    expect(payload).toBeDefined()
    if (summaryInstructions) {
      expect(payload?.summaryInstructions).toBe(summaryInstructions)
    } else {
      expect(payload?.summaryInstructions).toBeUndefined()
    }
    expect(payload?.clientRequestId).toEqual(expect.stringMatching(/^desktop-linked-workflow-session-file-mention-\d+$/))
    expect(useTabStore.getState().activeTabId).toBe('linked-workflow-session')
    expect(useSessionStore.getState().sessions[0]).toMatchObject({
      id: 'linked-workflow-session',
      workDir: '/repo',
      workflow: expect.objectContaining({
        templateId: BUILTIN_WORKFLOW_TEMPLATE.id,
        activePhaseId: BUILTIN_WORKFLOW_TEMPLATE.firstPhaseId,
      }),
    })
    expect(mocks.wsSend).not.toHaveBeenCalledWith('linked-workflow-session', expect.objectContaining({
      type: 'user_message',
    }))
  })

  it('does not start a linked workflow while the source chat is active', async () => {
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          ...useChatStore.getState().sessions[sessionId]!,
          chatState: 'thinking',
        },
      },
    })

    render(<ChatInput compact />)

    await waitFor(() => {
      expect(mocks.listWorkflowTemplates).toHaveBeenCalled()
    })
    fireEvent.click(screen.getByLabelText('Open composer tools'))
    const workflowsButton = screen.getByRole('button', { name: /Workflows/ })
    expect(workflowsButton).toBeDisabled()
    fireEvent.click(workflowsButton)

    expect(mocks.startLinkedWorkflowSession).not.toHaveBeenCalled()
    expect(useTabStore.getState().activeTabId).toBe(sessionId)
    expect(useSessionStore.getState().sessions[0]?.id).toBe(sessionId)
  })

  it('restores the submitted prompt to the composer when the active turn is immediately stopped', async () => {
    render(<ChatInput compact />)

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: {
        value: '我想做个飞机大战于系',
        selectionStart: '我想做个飞机大战于系'.length,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() => {
      expect(input).toHaveValue('我想做个飞机大战于系')
    })
    expect(useChatStore.getState().sessions[sessionId]?.chatState).toBe('idle')
    expect(mocks.wsSend).toHaveBeenCalledWith(sessionId, { type: 'stop_generation' })
  })

  it('keeps the source chat unchanged and shows an actionable error when linked workflow start fails', async () => {
    mocks.startLinkedWorkflowSession.mockRejectedValueOnce(new Error('summary provider unavailable'))

    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /Workflows/ }))
    const workflowDialog = await screen.findByTestId('workflow-start-dialog')
    fireEvent.click(within(workflowDialog).getByRole('button', { name: /Requirements to Implementation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    const strategyDialog = await screen.findByTestId('workflow-context-strategy-dialog')
    fireEvent.click(within(strategyDialog).getByRole('button', { name: /Summarize context/ }))

    await waitFor(() => {
      const toasts = useUIStore.getState().toasts
      expect(toasts[toasts.length - 1]).toMatchObject({
        type: 'error',
        message: 'Could not start workflow: summary provider unavailable',
      })
    })
    expect(useTabStore.getState().activeTabId).toBe(sessionId)
    expect(useSessionStore.getState().sessions).toHaveLength(1)
    const sourceSession = useSessionStore.getState().sessions[0]
    expect(sourceSession).toMatchObject({
      id: sessionId,
      messageCount: 1,
    })
    expect(sourceSession?.workflow).toBeUndefined()
    expect(screen.getByTestId('workflow-context-strategy-dialog')).toBeInTheDocument()
  })

  it('starts an empty active session on the selected branch inside an isolated worktree', async () => {
    mocks.create.mockResolvedValueOnce({
      sessionId: 'created-worktree',
      workDir: '/repo/.claude/worktrees/desktop-feature-a-12345678',
    })
    mocks.list.mockImplementationOnce(() => new Promise(() => {}))
    useSessionStore.setState({
      sessions: [{
        id: sessionId,
        title: 'Project',
        createdAt: '2026-05-01T00:00:00.000Z',
        modifiedAt: '2026-05-01T00:00:00.000Z',
        messageCount: 0,
        projectPath: '/repo',
        workDir: '/repo',
        workDirExists: true,
      }],
      activeSessionId: sessionId,
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

    render(<ChatInput variant="hero" />)

    fireEvent.click(await screen.findByRole('button', { name: /Select branch: main/ }))
    fireEvent.click(await screen.findByRole('option', { name: /feature\/a/ }))
    fireEvent.click(screen.getByRole('button', { name: /Select worktree mode: Current worktree/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Isolated worktree' }))
    expect(screen.getByText('Isolated worktree')).toBeInTheDocument()
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'run in a worktree', selectionStart: 17 } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith({
        workDir: '/repo',
        repository: { branch: 'feature/a', worktree: true },
      })
    })
    expect(mocks.delete).toHaveBeenCalledWith(sessionId)
    expect(mocks.wsSend).toHaveBeenCalledWith('created-worktree', {
      type: 'user_message',
      content: 'run in a worktree',
      attachments: [],
    })
    expect(useSessionStore.getState().sessions[0]?.workDir)
      .toBe('/repo/.claude/worktrees/desktop-feature-a-12345678')
  })

  it('turns a selected @ file into a chip without corrupting the typed path', async () => {
    mocks.search.mockResolvedValueOnce({
      currentPath: '/repo/backend/src',
      parentPath: '/repo/backend',
      query: 'conditions.py',
      entries: [
        { name: 'conditions.py', path: '/repo/backend/src/conditions.py', isDirectory: false },
      ],
    })

    render(<ChatInput compact />)

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    const mention = '@backend/src/conditions.py'
    fireEvent.change(input, {
      target: {
        value: `${mention} 记一下这个文件讲了什么东西。`,
        selectionStart: mention.length,
      },
    })

    fireEvent.click(await screen.findByText('backend/src/conditions.py'))

    await waitFor(() => {
      expect(input.value).toBe('记一下这个文件讲了什么东西。')
    })
    expect(screen.getByText('conditions.py')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mocks.wsSend).toHaveBeenCalledWith(sessionId, {
      type: 'user_message',
      content: '记一下这个文件讲了什么东西。',
      attachments: [{
        type: 'file',
        name: 'conditions.py',
        path: '/repo/backend/src/conditions.py',
        isDirectory: false,
        lineStart: undefined,
        lineEnd: undefined,
        note: undefined,
        quote: undefined,
      }],
    })
    const messages = useChatStore.getState().sessions[sessionId]?.messages ?? []
    expect(messages[messages.length - 1]).toMatchObject({
      type: 'user_text',
      content: '记一下这个文件讲了什么东西。',
      modelContent: '@"/repo/backend/src/conditions.py" 记一下这个文件讲了什么东西。',
      attachments: [{ name: 'conditions.py', path: '/repo/backend/src/conditions.py' }],
    })
  })

  it('turns a selected @ directory into a workspace chip and model path reference', async () => {
    mocks.search.mockResolvedValueOnce({
      currentPath: '/repo',
      parentPath: '/',
      query: 'backend',
      entries: [
        { name: 'backend', path: '/repo/backend', relativePath: 'backend', isDirectory: true },
      ],
    })

    render(<ChatInput compact />)

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: {
        value: '@backend 讲一下这个目录。',
        selectionStart: '@backend'.length,
      },
    })

    fireEvent.click(await screen.findByRole('option', { name: /backend/i }))

    await waitFor(() => {
      expect(input.value).toBe('讲一下这个目录。')
    })
    expect(screen.getByText('backend/')).toBeInTheDocument()
    expect(screen.getByText('folder')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mocks.wsSend).toHaveBeenCalledWith(sessionId, {
      type: 'user_message',
      content: '讲一下这个目录。',
      attachments: [{
        type: 'file',
        name: 'backend/',
        path: '/repo/backend',
        isDirectory: true,
        lineStart: undefined,
        lineEnd: undefined,
        note: undefined,
        quote: undefined,
      }],
    })
    const messages = useChatStore.getState().sessions[sessionId]?.messages ?? []
    expect(messages[messages.length - 1]).toMatchObject({
      type: 'user_text',
      content: '讲一下这个目录。',
      modelContent: '@"/repo/backend" 讲一下这个目录。',
      attachments: [{ name: 'backend/', path: '/repo/backend' }],
    })
  })

  it('uses native desktop file paths instead of inlining selected files', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    mocks.dialogOpen.mockResolvedValueOnce([
      '/Users/nanmi/tmp/large-a.log',
      'C:\\Users\\Nanmi\\Desktop\\large-b.zip',
    ])

    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByText('Add files or photos'))

    expect(await screen.findByText('large-a.log')).toBeInTheDocument()
    expect(await screen.findByText('large-b.zip')).toBeInTheDocument()

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: {
        value: 'analyze these',
        selectionStart: 'analyze these'.length,
      },
    })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mocks.wsSend).toHaveBeenCalledWith(sessionId, {
      type: 'user_message',
      content: 'analyze these',
      attachments: [
        expect.objectContaining({
          type: 'file',
          name: 'large-a.log',
          path: '/Users/nanmi/tmp/large-a.log',
          data: undefined,
        }),
        expect.objectContaining({
          type: 'file',
          name: 'large-b.zip',
          path: 'C:\\Users\\Nanmi\\Desktop\\large-b.zip',
          data: undefined,
        }),
      ],
    })
  })

  it('accepts native desktop file drops on the active session composer as path-only attachments', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })

    render(<ChatInput compact />)

    const panel = screen.getByTestId('chat-input-panel')
    Object.defineProperty(panel, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 640,
        bottom: 180,
        width: 640,
        height: 180,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })

    await waitFor(() => {
      expect(mocks.webviewDragHandlers).toHaveLength(1)
    })

    act(() => {
      mocks.webviewDragHandlers[0]?.({
        payload: { type: 'over', position: { x: 24, y: 24 } },
      })
    })
    expect(screen.getByTestId('chat-input-drop-overlay')).toBeInTheDocument()

    act(() => {
      mocks.webviewDragHandlers[0]?.({
        payload: {
          type: 'drop',
          position: { x: 24, y: 24 },
          paths: ['/Users/nanmi/drop/large-a.log'],
        },
      })
    })

    expect(await screen.findByText('large-a.log')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-input-drop-overlay')).not.toBeInTheDocument()

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: {
        value: 'analyze dropped file',
        selectionStart: 'analyze dropped file'.length,
      },
    })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mocks.wsSend).toHaveBeenCalledWith(sessionId, {
      type: 'user_message',
      content: 'analyze dropped file',
      attachments: [
        expect.objectContaining({
          type: 'file',
          name: 'large-a.log',
          path: '/Users/nanmi/drop/large-a.log',
          data: undefined,
        }),
      ],
    })
  })

  it('keeps slash and @ popovers outside the drop target clipping context', async () => {
    mocks.search.mockResolvedValueOnce({
      currentPath: '/repo',
      parentPath: null,
      query: '',
      entries: [
        { name: 'README.md', path: '/repo/README.md', isDirectory: false },
      ],
    })

    render(<ChatInput compact />)

    const panel = screen.getByTestId('chat-input-panel')
    const input = screen.getByRole('textbox') as HTMLTextAreaElement

    fireEvent.change(input, {
      target: {
        value: '/',
        selectionStart: 1,
      },
    })
    expect(await screen.findByText('/mcp')).toBeInTheDocument()
    expect(panel).toHaveClass('overflow-visible')
    expect(panel).not.toHaveClass('overflow-hidden')

    fireEvent.change(input, {
      target: {
        value: '@readme',
        selectionStart: 7,
      },
    })
    expect(await screen.findByText('README.md')).toBeInTheDocument()
    expect(panel).toHaveClass('overflow-visible')
    expect(panel).not.toHaveClass('overflow-hidden')
  })

  it('uses larger icon-only mobile action buttons for browser H5 access', async () => {
    viewportMocks.isMobile = true
    mocks.search.mockResolvedValueOnce({
      currentPath: '/repo',
      parentPath: null,
      query: 'cond',
      entries: [
        { name: 'conditions.py', path: '/repo/conditions.py', isDirectory: false },
      ],
    })

    render(<ChatInput />)

    await waitFor(() => {
      expect(mocks.getGitInfo).toHaveBeenCalledWith(sessionId)
    })

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'ship it', selectionStart: 7 },
    })

    expect(screen.getByRole('button', { name: 'Open composer tools' })).toHaveClass('h-11', 'w-11')
    expect(screen.getByRole('button', { name: 'Run' })).toHaveClass('h-11', 'w-11')
    expect(screen.queryByText('Run')).not.toBeInTheDocument()
    expect(screen.getByTestId('chat-input-shell')).toHaveClass('px-3')
    expect(screen.getByTestId('chat-input-shell').className).toContain('safe-area-inset-bottom')
    expect(screen.getByTestId('chat-input-panel')).toHaveClass('rounded-2xl')
    expect(screen.getByTestId('chat-input-panel')).not.toHaveClass('rounded-b-none')

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '@cond', selectionStart: 5 },
    })

    expect(await screen.findByText('conditions.py')).toBeInTheDocument()
    const fileSearchMenu = document.getElementById('file-search-menu')
    expect(fileSearchMenu).toHaveClass('min-w-0')
    expect(fileSearchMenu).not.toHaveClass('min-w-[480px]')
    expect(fileSearchMenu).not.toHaveTextContent('Navigate')
  })

  it('prioritizes active-session slash commands by command name when filtering', async () => {
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          ...useChatStore.getState().sessions[sessionId]!,
          slashCommands: [
            {
              name: 'agent-team-orchestrator',
              description: 'Agent Teams can use Subagent orchestration.',
            },
            {
              name: 'lark-calendar',
              description: 'Includes suggestion helpers.',
            },
            {
              name: 'superpowers:brainstorming',
              description: 'Creative work planning.',
            },
          ],
        },
      },
    })

    render(<ChatInput />)

    await waitFor(() => {
      expect(mocks.getGitInfo).toHaveBeenCalledWith(sessionId)
    })

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '/su', selectionStart: 3 },
    })

    await waitFor(() => {
      const commandButtons = screen
        .getAllByRole('button')
        .filter((button) => button.textContent?.startsWith('/'))
      expect(commandButtons[0]).toHaveTextContent('/superpowers:brainstorming')
    })
  })
})
