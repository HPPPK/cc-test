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
  previewLinkedWorkflowContext: vi.fn(),
  list: vi.fn(),
  listWorkflowTemplates: vi.fn(),
  getMessages: vi.fn(),
  getChatStatus: vi.fn(),
  getGitInfo: vi.fn(),
  getSlashCommands: vi.fn(),
  getRepositoryContext: vi.fn(),
  getRecentProjects: vi.fn(),
  runRepoHealthCheck: vi.fn(),
  listExperts: vi.fn(),
  listPacks: vi.fn(),
  enterSessionExpertMode: vi.fn(),
  exitSessionExpertMode: vi.fn(),
  writePlaceholderMaterial: vi.fn(),
  exportPack: vi.fn(),
  previewImport: vi.fn(),
  importPack: vi.fn(),
  search: vi.fn(),
  browse: vi.fn(),
  wsSend: vi.fn(),
  dialogOpen: vi.fn(),
  getModelCapability: vi.fn(),
  permissionModeSelectorRender: vi.fn(),
  webviewDragHandlers: [] as Array<(event: { payload: unknown }) => void>,
  webviewUnlisten: vi.fn(),
}))

vi.mock('../../api/sessions', () => ({
  sessionsApi: {
    create: mocks.create,
    delete: mocks.delete,
    startLinkedWorkflowSession: mocks.startLinkedWorkflowSession,
    previewLinkedWorkflowContext: mocks.previewLinkedWorkflowContext,
    list: mocks.list,
    listWorkflowTemplates: mocks.listWorkflowTemplates,
    getMessages: mocks.getMessages,
    getChatStatus: mocks.getChatStatus,
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

vi.mock('../../api/experts', () => ({
  expertsApi: {
    listExperts: mocks.listExperts,
    listPacks: mocks.listPacks,
    enterSessionExpertMode: mocks.enterSessionExpertMode,
    exitSessionExpertMode: mocks.exitSessionExpertMode,
    writePlaceholderMaterial: mocks.writePlaceholderMaterial,
    exportPack: mocks.exportPack,
    previewImport: mocks.previewImport,
    importPack: mocks.importPack,
    runRepoHealthCheck: mocks.runRepoHealthCheck,
  },
}))


vi.mock('../../api/modelCapabilities', () => ({
  modelCapabilitiesApi: {
    get: mocks.getModelCapability,
  },
}))

vi.mock('../../api/websocket', () => ({
  wsManager: {
    connect: vi.fn(),
    isConnected: vi.fn(() => true),
    onConnectionState: vi.fn(() => () => {}),
    clearConnectionStateHandlers: vi.fn(),
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
import { useExpertStore } from '../../stores/expertStore'
import { UNSUPPORTED_IMAGE_INPUT_MESSAGE } from '../../lib/modelCapabilities'

const USER_WORKFLOW_TEMPLATE = {
  id: 'requirements-to-implementation',
  source: 'user' as const,
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
  templateId: USER_WORKFLOW_TEMPLATE.id,
  templateVersion: '1.0.0',
  templateSource: USER_WORKFLOW_TEMPLATE.source,
  templateSnapshotId: 'requirements-to-implementation-v1',
  status: 'created' as const,
  activePhaseId: USER_WORKFLOW_TEMPLATE.firstPhaseId,
  activePhaseIndex: 0,
  phaseCount: USER_WORKFLOW_TEMPLATE.phaseCount,
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
  const initialExpertState = useExpertStore.getInitialState()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.webviewDragHandlers.length = 0
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    viewportMocks.isMobile = false
    mocks.getModelCapability.mockRejectedValue(new Error('dynamic capability unavailable'))
    useSettingsStore.setState({ locale: 'en' })
    useChatStore.setState(initialChatState, true)
    useSessionStore.setState(initialSessionState, true)
    useTabStore.setState(initialTabState, true)
    useTeamStore.setState(initialTeamState, true)
    useUIStore.setState(initialUIState, true)
    useWorkspaceChatContextStore.setState(initialWorkspaceContextState, true)
    useExpertStore.setState(initialExpertState, true)

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
    mocks.previewLinkedWorkflowContext.mockResolvedValue({
      content: 'Summary of the current chat with decisions and open questions.',
      sourceMessageCount: 1,
    })
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
      templates: [USER_WORKFLOW_TEMPLATE],
      invalidTemplates: [],
    })
    mocks.getMessages.mockResolvedValue({ messages: [] })
    mocks.getChatStatus.mockResolvedValue({ state: 'idle' })
    mocks.getSlashCommands.mockResolvedValue({ commands: [] })
    mocks.listExperts.mockResolvedValue({
      experts: [
        {
          id: 'repo-health-check',
          name: '项目体检',
          description: '帮你快速看懂一个已有项目：它是什么、怎么运行、怎么测试、后续修改哪里要小心。',
          statusLabel: '框架已准备',
          packId: 'builtin-expert-starter-pack',
          packName: '内置专家包',
          packVersion: '1.0.0',
          entrypoint: 'experts/repo-health-check/expert.json',
          promptPaths: { system: 'experts/repo-health-check/prompts/system.md' },
          formPaths: ['experts/repo-health-check/forms/intake.json'],
          outputProtocolPath: 'experts/repo-health-check/outputs/material-protocol.json',
          skillIds: ['repo-health-check-guide'],
          hostTools: [{ id: 'AskUserQuestion', name: '提问', purpose: '确认重点' }],
          permissions: [{ id: 'write-expert-output', description: '只写入专家报告目录' }],
          portable: true,
        },
        {
          id: 'product-brief-intake',
          name: '需求梳理',
          description: '把需求文档、Markdown、HTML 原型或大段说明整理成清晰的功能范围、页面、流程和验收标准。',
          statusLabel: '框架已准备',
          packId: 'builtin-expert-starter-pack',
          packName: '内置专家包',
          packVersion: '1.0.0',
          entrypoint: 'experts/product-brief-intake/expert.json',
          promptPaths: { system: 'experts/product-brief-intake/prompts/system.md' },
          formPaths: ['experts/product-brief-intake/forms/intake.json'],
          outputProtocolPath: 'experts/product-brief-intake/outputs/material-protocol.json',
          skillIds: ['product-brief-intake-guide'],
          hostTools: [{ id: 'ExpertIntakeForm', name: '表单', purpose: '收集材料' }],
          permissions: [{ id: 'write-expert-output', description: '只写入专家报告目录' }],
          portable: true,
        },
      ],
    })
    mocks.listPacks.mockResolvedValue({
      packs: [{
        packId: 'builtin-expert-starter-pack',
        name: '内置专家包',
        version: '1.0.0',
        description: '内置专家 Mode 框架包',
        storage: { kind: 'builtin' },
        experts: [],
        importedAt: '2026-07-08T00:00:00.000Z',
      }],
    })
    mocks.enterSessionExpertMode.mockResolvedValue({
      expert: {
        mode: 'expert',
        expertId: 'repo-health-check',
        expertName: '项目体检',
        packId: 'builtin-expert-starter-pack',
        packVersion: '1.0.0',
        status: 'active',
        materialRefs: [],
        startedAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    })
    mocks.runRepoHealthCheck.mockResolvedValue({
      runId: 'repo-health-run-1',
      expertId: 'repo-health-check-expert',
      intentId: 'test-guide',
      status: 'completed',
      outputDirectory: '/repo/.workflow/intake/expert-runs/repo-health-run-1/repo-health-check',
      materialSummaryPath: '/repo/.workflow/intake/expert-runs/repo-health-run-1/repo-health-check/material-summary.md',
      materialJsonPath: '/repo/.workflow/intake/expert-runs/repo-health-run-1/repo-health-check/material.json',
      evidencePath: '/repo/.workflow/intake/expert-runs/repo-health-run-1/repo-health-check/evidence.md',
      material: {
        expertId: 'repo-health-check-expert',
        sourceType: 'existingProject',
        intentId: 'test-guide',
        runId: 'repo-health-run-1',
        createdAt: '2026-07-08T00:00:00.000Z',
        projectRoot: '/repo',
        workspaceValid: true,
        projectSummary: '这是项目体检摘要。',
        projectType: 'Web 前端 / Vite React 项目',
        detectedTechStack: ['Node.js', 'React', 'Vite'],
        packageManagers: ['bun'],
        entrypoints: ['package.json scripts.dev'],
        runCommands: [{ label: 'dev', command: 'bun run dev', source: 'package.json scripts.dev', riskLevel: 'long-running', note: 'vite' }],
        testCommands: [{ label: 'test', command: 'bun run test', source: 'package.json scripts.test', riskLevel: 'safe-check', note: 'vitest' }],
        buildCommands: [{ label: 'build', command: 'bun run build', source: 'package.json scripts.build', riskLevel: 'safe-check', note: 'vite build' }],
        lintCommands: [],
        checkCommands: [],
        databaseNotes: [],
        environmentNotes: [],
        importantDirectories: ['src'],
        importantFiles: ['package.json'],
        riskAreas: [{ title: '启动命令可能是长时间运行服务', level: 'long-running', reason: '会占用端口。', evidence: ['package.json scripts.dev'] }],
        safeNextActions: ['先阅读报告。'],
        suggestedFollowupQuestions: ['怎么测试？'],
        skillsRun: ['workspace-validation', 'material-package-writer'],
        skillsSkipped: ['workflow-start', 'workflow-stage-advance'],
        handoffSummary: '项目上下文',
        limitations: ['静态扫描'],
      },
    })
  })



  it('exposes a stable submit control for browser automation', () => {
    render(<ChatInput />)

    expect(screen.getByTestId('chat-submit-button')).toBeInTheDocument()
  })

  it('blocks pasted image attachments when the selected model lacks image input capability', async () => {
    useSettingsStore.setState({
      locale: 'zh',
      currentModel: { id: 'unknown-text-only-model', name: 'Unknown Text Model' } as never,
    })

    render(<ChatInput />)

    const input = screen.getByRole('textbox')
    const imageFile = new File(['image-bytes'], 'screen.png', { type: 'image/png' })
    fireEvent.paste(input, {
      clipboardData: {
        items: [{ type: 'image/png', getAsFile: () => imageFile }],
        getData: () => '',
      },
    })

    await waitFor(() => {
      expect(useUIStore.getState().toasts).toContainEqual(expect.objectContaining({
        type: 'warning',
        message: UNSUPPORTED_IMAGE_INPUT_MESSAGE,
      }))
    })
    expect(screen.queryByText(/pasted-image/i)).not.toBeInTheDocument()
  })

  it('allows pasted image attachments when the selected model supports image input', async () => {
    useSettingsStore.setState({
      locale: 'en',
      currentModel: { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' } as never,
    })

    render(<ChatInput />)

    const input = screen.getByRole('textbox')
    const imageFile = new File(['image-bytes'], 'screen.png', { type: 'image/png' })
    fireEvent.paste(input, {
      clipboardData: {
        items: [{ type: 'image/png', getAsFile: () => imageFile }],
        getData: () => '',
      },
    })

    expect(await screen.findByAltText(/pasted-image/i)).toBeInTheDocument()
    expect(useUIStore.getState().toasts).not.toContainEqual(expect.objectContaining({
      message: UNSUPPORTED_IMAGE_INPUT_MESSAGE,
    }))
  })

  it('uses server-resolved provider capabilities for models missing from the local registry', async () => {
    mocks.getModelCapability.mockResolvedValue({
      schemaVersion: 1,
      capability: {
        provider: 'custom-provider',
        modelId: 'vendor-vision-model',
        capabilities: {
          textInput: true,
          imageInput: true,
          audioInput: false,
          videoInput: false,
          fileTextInput: true,
          pdfInput: true,
          toolCalling: true,
          structuredOutput: true,
          jsonMode: true,
          longContext: true,
          codeReasoning: true,
        },
        source: 'provider-metadata',
      },
    })
    useSettingsStore.setState({
      locale: 'en',
      currentModel: { id: 'vendor-vision-model', name: 'Vendor Vision Model' } as never,
    })

    render(<ChatInput />)

    await waitFor(() => {
      expect(mocks.getModelCapability).toHaveBeenCalledWith(null, 'vendor-vision-model')
    })

    const input = screen.getByRole('textbox')
    const imageFile = new File(['image-bytes'], 'screen.png', { type: 'image/png' })
    fireEvent.paste(input, {
      clipboardData: {
        items: [{ type: 'image/png', getAsFile: () => imageFile }],
        getData: () => '',
      },
    })

    expect(await screen.findByAltText(/pasted-image/i)).toBeInTheDocument()
    expect(useUIStore.getState().toasts).not.toContainEqual(expect.objectContaining({
      message: UNSUPPORTED_IMAGE_INPUT_MESSAGE,
    }))
  })

  it('probes provider capability on demand before blocking a pasted image', async () => {
    const capabilityResponse = {
      schemaVersion: 1 as const,
      capability: {
        provider: 'custom-provider',
        modelId: 'vendor-vision-model',
        capabilities: {
          textInput: true,
          imageInput: true,
          audioInput: false,
          videoInput: false,
          fileTextInput: true,
          pdfInput: true,
          toolCalling: true,
          structuredOutput: true,
          jsonMode: true,
          longContext: true,
          codeReasoning: true,
        },
        source: 'provider-metadata' as const,
      },
    }
    const resolvers: Array<(value: typeof capabilityResponse) => void> = []
    mocks.getModelCapability.mockImplementation(() => new Promise((resolve) => {
      resolvers.push(resolve)
    }))
    useSettingsStore.setState({
      locale: 'en',
      currentModel: { id: 'vendor-vision-model', name: 'Vendor Vision Model' } as never,
    })

    render(<ChatInput />)

    const input = screen.getByRole('textbox')
    const imageFile = new File(['image-bytes'], 'screen.png', { type: 'image/png' })
    fireEvent.paste(input, {
      clipboardData: {
        items: [{ type: 'image/png', getAsFile: () => imageFile }],
        getData: () => '',
      },
    })

    await waitFor(() => expect(mocks.getModelCapability).toHaveBeenCalled())
    await act(async () => {
      for (const resolve of resolvers) resolve(capabilityResponse)
    })

    expect(await screen.findByAltText(/pasted-image/i)).toBeInTheDocument()
    expect(useUIStore.getState().toasts).not.toContainEqual(expect.objectContaining({
      message: UNSUPPORTED_IMAGE_INPUT_MESSAGE,
    }))
  })

  it('blocks workflow start when required model capabilities are missing', async () => {
    useSettingsStore.setState({
      locale: 'en',
      currentModel: { id: 'unknown-text-only-model', name: 'Unknown Text Model' } as never,
    })
    mocks.listWorkflowTemplates.mockResolvedValue({
      templates: [{
        ...USER_WORKFLOW_TEMPLATE,
        modelRequirements: { required: ['imageInput'] },
      }],
      invalidTemplates: [],
    })

    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /Workflows/ }))
    const workflowDialog = await screen.findByTestId('workflow-start-dialog')
    fireEvent.click(within(workflowDialog).getByRole('button', { name: /Requirements to Implementation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(useUIStore.getState().toasts).toContainEqual(expect.objectContaining({
        type: 'error',
        message: expect.stringContaining('imageInput'),
      }))
    })
    expect(mocks.startLinkedWorkflowSession).not.toHaveBeenCalled()
    expect(screen.queryByTestId('workflow-context-strategy-dialog')).not.toBeInTheDocument()
  })

  it('warns but allows workflow start when only optional model capabilities are missing', async () => {
    useSettingsStore.setState({
      locale: 'en',
      currentModel: { id: 'unknown-text-only-model', name: 'Unknown Text Model' } as never,
    })
    mocks.listWorkflowTemplates.mockResolvedValue({
      templates: [{
        ...USER_WORKFLOW_TEMPLATE,
        modelRequirements: { optional: ['imageInput'] },
      }],
      invalidTemplates: [],
    })

    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /Workflows/ }))
    const workflowDialog = await screen.findByTestId('workflow-start-dialog')
    fireEvent.click(within(workflowDialog).getByRole('button', { name: /Requirements to Implementation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(await screen.findByTestId('workflow-context-strategy-dialog')).toBeInTheDocument()
    expect(useUIStore.getState().toasts).toContainEqual(expect.objectContaining({
      type: 'warning',
      message: expect.stringContaining('imageInput'),
    }))
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

  it('resizes the composer immediately when a large text block is pasted', async () => {
    render(<ChatInput compact />)

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    Object.defineProperty(input, 'scrollHeight', {
      configurable: true,
      get: () => 40 + Math.max(1, input.value.split('\n').length) * 24,
    })

    fireEvent.change(input, {
      target: { value: 'before after', selectionStart: 7, selectionEnd: 7 },
    })
    input.setSelectionRange(7, 7)

    const pastedText = Array.from({ length: 12 }, (_, index) => `pasted line ${index + 1}`).join('\n')
    fireEvent.paste(input, {
      clipboardData: {
        getData: (type: string) => type === 'text/plain' ? pastedText : '',
        items: [],
      },
    })

    const expectedValue = `before ${pastedText}after`
    await waitFor(() => {
      expect(input.value).toBe(expectedValue)
      expect(input.style.height).toBe('200px')
      expect(input.style.overflowY).toBe('auto')
      expect(input).toHaveClass('mb-14')
      expect(input).not.toHaveClass('pb-14')
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
        templateId: USER_WORKFLOW_TEMPLATE.id,
        templateSource: USER_WORKFLOW_TEMPLATE.source,
        currentPhaseId: USER_WORKFLOW_TEMPLATE.firstPhaseId,
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
          templateId: USER_WORKFLOW_TEMPLATE.id,
          templateSource: USER_WORKFLOW_TEMPLATE.source,
          currentPhaseId: USER_WORKFLOW_TEMPLATE.firstPhaseId,
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
        workflow: expect.objectContaining({
          templateId: USER_WORKFLOW_TEMPLATE.id,
          templateSource: USER_WORKFLOW_TEMPLATE.source,
          initialPhaseId: USER_WORKFLOW_TEMPLATE.firstPhaseId,
          request: '',
          labels: ['new-product'],
          effort: 'standard',
        }),
      })
    })
    expect(mocks.delete).toHaveBeenCalledWith(sessionId)
    expect(useTabStore.getState().activeTabId).toBe('created-workflow')
    expect(useSessionStore.getState().sessions[0]).toMatchObject({
      id: 'created-workflow',
      workflow: expect.objectContaining({
        templateId: USER_WORKFLOW_TEMPLATE.id,
        currentPhaseId: USER_WORKFLOW_TEMPLATE.firstPhaseId,
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
    expect(strategyDialog.parentElement).toHaveClass('workflow-content-modal-overlay')
    expect(within(strategyDialog).getByRole('heading', { name: 'Choose how chat context is handled' })).toBeInTheDocument()
    expect(within(strategyDialog).getByRole('button', { name: /Start new clean Workflow/ })).toBeInTheDocument()
    expect(within(strategyDialog).getByRole('button', { name: /Start Workflow in this chat/ })).toBeInTheDocument()
    expect(within(strategyDialog).getByRole('button', { name: /Start new Workflow with summary/ })).toBeInTheDocument()
    expect(mocks.startLinkedWorkflowSession).not.toHaveBeenCalled()
  })

  it('generates a copyable context summary before opening a new workflow session', async () => {
    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /Workflows/ }))
    const workflowDialog = await screen.findByTestId('workflow-start-dialog')
    fireEvent.click(within(workflowDialog).getByRole('button', { name: /Requirements to Implementation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    const strategyDialog = await screen.findByTestId('workflow-context-strategy-dialog')
    fireEvent.change(within(strategyDialog).getByLabelText('Summary instructions'), {
      target: { value: 'Preserve decisions and unresolved questions.' },
    })
    fireEvent.click(within(strategyDialog).getByRole('button', { name: /Start new Workflow with summary/ }))

    await waitFor(() => {
      expect(mocks.previewLinkedWorkflowContext).toHaveBeenCalledWith(sessionId, {
        summaryInstructions: 'Preserve decisions and unresolved questions.',
      })
    })
    expect(mocks.startLinkedWorkflowSession).not.toHaveBeenCalled()
    expect(within(strategyDialog).getByDisplayValue('Summary of the current chat with decisions and open questions.')).toBeInTheDocument()
    expect(within(strategyDialog).getByRole('button', { name: 'Open in new session' })).toBeInTheDocument()
  })

  it('opens the expert panel from the plus menu and enters expert Mode without starting a workflow', async () => {
    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /专家/ }))

    const expertDialog = await screen.findByTestId('expert-selection-dialog')
    const expertList = within(expertDialog).getByRole('region', { name: '专家列表' })
    expect(within(expertDialog).getByRole('heading', { name: '专家' })).toBeInTheDocument()
    expect(within(expertDialog).getByText(/导入或查看专家包也不会运行包内代码/)).toBeInTheDocument()
    expect(within(expertList).getByRole('heading', { name: '项目体检' })).toBeInTheDocument()
    expect(within(expertList).getByRole('heading', { name: '需求梳理' })).toBeInTheDocument()

    fireEvent.click(within(expertDialog).getByRole('button', { name: '进入专家 Mode' }))

    await waitFor(() => {
      expect(mocks.enterSessionExpertMode).toHaveBeenCalledWith(sessionId, 'repo-health-check')
    })
    expect(useSessionStore.getState().sessions[0]?.expert).toMatchObject({
      mode: 'expert',
      expertId: 'repo-health-check',
      expertName: '项目体检',
      status: 'active',
    })
    expect(useSessionStore.getState().sessions[0]?.workflow).toBeUndefined()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.startLinkedWorkflowSession).not.toHaveBeenCalled()
    expect(mocks.runRepoHealthCheck).not.toHaveBeenCalled()
  })

  it('enters the selected package-driven expert instead of a hardcoded runner', async () => {
    mocks.enterSessionExpertMode.mockResolvedValueOnce({
      expert: {
        mode: 'expert',
        expertId: 'product-brief-intake',
        expertName: '需求梳理',
        packId: 'builtin-expert-starter-pack',
        packVersion: '1.0.0',
        status: 'active',
        materialRefs: [],
        startedAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    })
    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /专家/ }))

    const expertDialog = await screen.findByTestId('expert-selection-dialog')
    fireEvent.click(within(expertDialog).getByRole('button', { name: /需求梳理/ }))
    fireEvent.click(within(expertDialog).getByRole('button', { name: '进入专家 Mode' }))

    await waitFor(() => {
      expect(mocks.enterSessionExpertMode).toHaveBeenCalledWith(sessionId, 'product-brief-intake')
    })
    expect(useSessionStore.getState().sessions[0]?.expert).toMatchObject({
      mode: 'expert',
      expertId: 'product-brief-intake',
      expertName: '需求梳理',
      status: 'active',
    })
    expect(useSessionStore.getState().sessions[0]?.workflow).toBeUndefined()
    expect(mocks.runRepoHealthCheck).not.toHaveBeenCalled()
    expect(mocks.startLinkedWorkflowSession).not.toHaveBeenCalled()
  })

  it('retries workflow template loading from the dialog after an earlier API timeout', async () => {
    mocks.listWorkflowTemplates
      .mockRejectedValueOnce(new Error('Request timed out after 30s'))
      .mockRejectedValueOnce(new Error('Request timed out after 30s'))
      .mockResolvedValueOnce({
        templates: [USER_WORKFLOW_TEMPLATE],
        invalidTemplates: [],
      })

    render(<ChatInput compact />)

    await waitFor(() => {
      expect(mocks.listWorkflowTemplates).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /Workflows/ }))

    const workflowDialog = await screen.findByTestId('workflow-start-dialog')
    expect(await within(workflowDialog).findByRole('alert')).toHaveTextContent('Could not load workflows.')

    fireEvent.click(within(workflowDialog).getByRole('button', { name: 'Retry' }))

    expect(await within(workflowDialog).findByRole('button', { name: /Requirements to Implementation/ })).toBeInTheDocument()
    expect(mocks.listWorkflowTemplates).toHaveBeenCalledTimes(3)
  })

  it('opens workflows from the plus menu after the current workflow is completed', async () => {
    useSessionStore.setState({
      sessions: [{
        ...useSessionStore.getState().sessions[0]!,
        workflow: {
          ...LINKED_WORKFLOW_SUMMARY,
          status: 'completed' as const,
          activePhaseId: 'verification',
          activePhaseIndex: 4,
        },
      }],
    })

    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /Workflows/ }))

    const workflowDialog = await screen.findByTestId('workflow-start-dialog')
    fireEvent.click(within(workflowDialog).getByRole('button', { name: /Requirements to Implementation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    const strategyDialog = await screen.findByTestId('workflow-context-strategy-dialog')
    fireEvent.click(within(strategyDialog).getByRole('button', { name: /Start Workflow in this chat/ }))

    await waitFor(() => {
      expect(mocks.startLinkedWorkflowSession).toHaveBeenCalledWith(sessionId, expect.objectContaining({
        workflow: expect.objectContaining({
          templateId: USER_WORKFLOW_TEMPLATE.id,
          templateSource: USER_WORKFLOW_TEMPLATE.source,
          initialPhaseId: USER_WORKFLOW_TEMPLATE.firstPhaseId,
          request: '',
          labels: ['new-product'],
          effort: 'standard',
        }),
        contextStrategy: 'inherit',
      }))
    })
  })

  it.each(['created', 'running', 'pending-confirmation', 'failed'] as const)('starts a fresh workflow from a %s workflow session without linking its context', async (status) => {
    useSessionStore.setState({
      sessions: [{
        ...useSessionStore.getState().sessions[0]!,
        workflow: {
          ...LINKED_WORKFLOW_SUMMARY,
          status,
          activePhaseId: 'technical-design',
          activePhaseIndex: 1,
        },
      }],
    })

    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    const workflowsButton = screen.getByRole('button', { name: /Workflows/ })
    expect(workflowsButton).not.toBeDisabled()
    fireEvent.click(workflowsButton)

    const workflowDialog = await screen.findByTestId('workflow-start-dialog')
    fireEvent.click(within(workflowDialog).getByRole('button', { name: /Requirements to Implementation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith({
        workDir: '/repo',
        workflow: expect.objectContaining({
          templateId: USER_WORKFLOW_TEMPLATE.id,
          templateSource: USER_WORKFLOW_TEMPLATE.source,
          initialPhaseId: USER_WORKFLOW_TEMPLATE.firstPhaseId,
        }),
      })
    })
    expect(mocks.startLinkedWorkflowSession).not.toHaveBeenCalled()
    expect(screen.queryByTestId('workflow-context-strategy-dialog')).not.toBeInTheDocument()
    expect(useTabStore.getState().activeTabId).toBe('created-session')
  })
  it('opens the context strategy dialog when starting a workflow after exiting the current workflow', async () => {
    useSessionStore.setState({
      sessions: [{
        ...useSessionStore.getState().sessions[0]!,
        workflow: {
          ...LINKED_WORKFLOW_SUMMARY,
          status: 'cancelled',
          activePhaseId: 'technical-design',
          activePhaseIndex: 1,
        },
      }],
    })

    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /Workflows/ }))
    const workflowDialog = await screen.findByTestId('workflow-start-dialog')
    fireEvent.click(within(workflowDialog).getByRole('button', { name: /Requirements to Implementation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(await screen.findByTestId('workflow-context-strategy-dialog')).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('reconciles stale active state before starting a workflow from a completed source session', async () => {
    useSessionStore.setState({
      sessions: [{
        ...useSessionStore.getState().sessions[0]!,
        workflow: {
          ...LINKED_WORKFLOW_SUMMARY,
          status: 'completed' as const,
          activePhaseId: 'verification',
          activePhaseIndex: 4,
        },
      }],
    })
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          ...useChatStore.getState().sessions[sessionId]!,
          chatState: 'thinking',
          activeToolUseId: 'stale-tool-use',
          activeToolName: 'Bash',
          statusVerb: 'Thinking',
        },
      },
    })
    mocks.getChatStatus.mockResolvedValueOnce({ state: 'idle' })

    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    const workflowsButton = screen.getByRole('button', { name: /Workflows/ })
    expect(workflowsButton).not.toBeDisabled()
    fireEvent.click(workflowsButton)

    await waitFor(() => {
      expect(mocks.getChatStatus).toHaveBeenCalledWith(sessionId)
    })
    const workflowDialog = await screen.findByTestId('workflow-start-dialog')
    fireEvent.click(within(workflowDialog).getByRole('button', { name: /Requirements to Implementation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    const strategyDialog = await screen.findByTestId('workflow-context-strategy-dialog')
    fireEvent.click(within(strategyDialog).getByRole('button', { name: /Start new clean Workflow/ }))

    await waitFor(() => {
      expect(mocks.startLinkedWorkflowSession).toHaveBeenCalledWith(sessionId, expect.objectContaining({
        contextStrategy: 'clear',
      }))
    })
    expect(useChatStore.getState().sessions[sessionId]).toMatchObject({
      chatState: 'idle',
      activeToolUseId: null,
      activeToolName: null,
    })
  })

  it.each([
    ['clear' as const, /Start new clean Workflow/, undefined],
    ['inherit' as const, /Start Workflow in this chat/, undefined],
    ['summarize' as const, /Start new Workflow with summary/, 'Preserve risks and decisions.'],
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
    if (strategy === 'summarize') {
      await waitFor(() => {
        expect(mocks.previewLinkedWorkflowContext).toHaveBeenCalledWith(sessionId, {
          summaryInstructions,
        })
      })
      fireEvent.click(within(strategyDialog).getByRole('button', { name: 'Open in new session' }))
    }

    await waitFor(() => {
      expect(mocks.startLinkedWorkflowSession).toHaveBeenCalledWith(sessionId, expect.objectContaining({
        workflow: expect.objectContaining({
          templateId: USER_WORKFLOW_TEMPLATE.id,
          templateSource: USER_WORKFLOW_TEMPLATE.source,
          initialPhaseId: USER_WORKFLOW_TEMPLATE.firstPhaseId,
          request: '',
          labels: ['new-product'],
          effort: 'standard',
        }),
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
    if (strategy === 'summarize') {
      expect(payload?.summaryContent).toBe('Summary of the current chat with decisions and open questions.')
    } else {
      expect(payload?.summaryContent).toBeUndefined()
    }
    expect(payload?.clientRequestId).toEqual(expect.stringMatching(/^desktop-linked-workflow-session-file-mention-\d+$/))
    expect(useTabStore.getState().activeTabId).toBe('linked-workflow-session')
    expect(useSessionStore.getState().sessions[0]).toMatchObject({
      id: 'linked-workflow-session',
      workDir: '/repo',
      workflow: expect.objectContaining({
        templateId: USER_WORKFLOW_TEMPLATE.id,
        activePhaseId: USER_WORKFLOW_TEMPLATE.firstPhaseId,
      }),
    })
    if (strategy === 'summarize') {
      expect(mocks.wsSend).toHaveBeenCalledWith('linked-workflow-session', expect.objectContaining({
        type: 'user_message',
        content: expect.stringContaining('Summary of the current chat with decisions and open questions.'),
      }))
    } else {
      expect(mocks.wsSend).not.toHaveBeenCalledWith('linked-workflow-session', expect.objectContaining({
        type: 'user_message',
      }))
    }
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
        value: '鎴戞兂鍋氫釜椋炴満澶ф垬浜庣郴',
        selectionStart: '鎴戞兂鍋氫釜椋炴満澶ф垬浜庣郴'.length,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() => {
      expect(input).toHaveValue('鎴戞兂鍋氫釜椋炴満澶ф垬浜庣郴')
    })
    expect(useChatStore.getState().sessions[sessionId]?.chatState).toBe('idle')
    expect(mocks.wsSend).toHaveBeenCalledWith(sessionId, { type: 'stop_generation' })
  })

  it('shows Run instead of Stop while running when the composer has content', async () => {
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          ...useChatStore.getState().sessions[sessionId]!,
          chatState: 'streaming',
          streamingText: 'current answer is still streaming',
        },
      },
    })

    render(<ChatInput compact />)

    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: { value: 'queue this after the active turn', selectionStart: 32 },
    })

    const runButton = screen.getByRole('button', { name: 'Run' })
    expect(runButton).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()

    fireEvent.click(runButton)

    expect(mocks.wsSend).not.toHaveBeenCalledWith(sessionId, { type: 'stop_generation' })
    expect(mocks.wsSend).not.toHaveBeenCalledWith(sessionId, {
      type: 'user_message',
      content: 'queue this after the active turn',
      attachments: undefined,
    })
    const messages = useChatStore.getState().sessions[sessionId]?.messages ?? []
    expect(messages[messages.length - 1]).toMatchObject({
      type: 'user_text',
      content: 'queue this after the active turn',
      pending: true,
      queued: true,
    })
  })

  it('shows a composer queue with guide and delete actions while the session is running', () => {
    vi.useFakeTimers()
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          ...useChatStore.getState().sessions[sessionId]!,
          chatState: 'streaming',
          streamingText: 'current answer is still streaming',
        },
      },
    })

    useChatStore.getState().sendMessage(sessionId, 'delete this queued message')
    useChatStore.getState().sendMessage(sessionId, 'first queued message')
    useChatStore.getState().sendMessage(sessionId, 'guided queued message')
    mocks.wsSend.mockClear()

    render(<ChatInput compact />)

    const queue = screen.getByTestId('queued-composer-messages')
    expect(within(queue).getByText('delete this queued message')).toBeInTheDocument()
    expect(within(queue).getByText('first queued message')).toBeInTheDocument()
    expect(within(queue).getByText('guided queued message')).toBeInTheDocument()

    const deleteButtons = within(queue).getAllByRole('button', { name: 'Delete queued message' })
    fireEvent.click(deleteButtons[0]!)
    expect(within(queue).queryByText('delete this queued message')).not.toBeInTheDocument()

    const guideButtons = within(queue).getAllByRole('button', { name: 'Guide queued message' })
    fireEvent.click(guideButtons[1]!)
    expect(mocks.wsSend).not.toHaveBeenCalled()

    const reorderedQueueText = screen.getByTestId('queued-composer-messages').textContent ?? ''
    expect(reorderedQueueText.indexOf('guided queued message')).toBeLessThan(
      reorderedQueueText.indexOf('first queued message'),
    )

    act(() => {
      useChatStore.getState().handleServerMessage(sessionId, {
        type: 'message_complete',
        usage: { input_tokens: 2, output_tokens: 4 },
      })
    })

    expect(mocks.wsSend).toHaveBeenCalledTimes(1)
    expect(mocks.wsSend).toHaveBeenCalledWith(sessionId, {
      type: 'user_message',
      content: 'guided queued message',
      attachments: undefined,
    })

    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('animates the whole Stop button only while running', async () => {
    render(<ChatInput compact />)

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: { value: 'run with visible activity', selectionStart: 25 },
    })

    const runButton = screen.getByRole('button', { name: 'Run' })
    expect(runButton).toBeInTheDocument()
    expect(runButton).not.toHaveClass('chat-input-stop-running')

    fireEvent.change(input, {
      target: { value: '', selectionStart: 0 },
    })

    act(() => {
      useChatStore.setState({
        sessions: {
          [sessionId]: {
            ...useChatStore.getState().sessions[sessionId]!,
            chatState: 'streaming',
          },
        },
      })
    })

    const stopButton = await screen.findByRole('button', { name: 'Stop' })
    expect(stopButton).toHaveClass('chat-input-stop-running')
    expect(screen.queryByTestId('chat-input-running-stop-indicator')).not.toBeInTheDocument()
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
    fireEvent.click(within(strategyDialog).getByRole('button', { name: /Start new Workflow with summary/ }))
    await waitFor(() => {
      expect(mocks.previewLinkedWorkflowContext).toHaveBeenCalledWith(sessionId, {})
    })
    fireEvent.click(within(strategyDialog).getByRole('button', { name: 'Open in new session' }))

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

  it('keeps inherit in the current chat instead of opening a linked session', async () => {
    mocks.startLinkedWorkflowSession.mockResolvedValueOnce({
      sessionId,
      workDir: '/repo',
      workflow: LINKED_WORKFLOW_SUMMARY,
      link: {
        sourceSessionId: sessionId,
        targetSessionId: sessionId,
        contextStrategy: 'inherit',
        sourceMessageCount: 1,
        createdAt: '2026-05-26T00:00:00.000Z',
      },
    })

    render(<ChatInput compact />)

    fireEvent.click(screen.getByLabelText('Open composer tools'))
    fireEvent.click(screen.getByRole('button', { name: /Workflows/ }))
    const workflowDialog = await screen.findByTestId('workflow-start-dialog')
    fireEvent.click(within(workflowDialog).getByRole('button', { name: /Requirements to Implementation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    const strategyDialog = await screen.findByTestId('workflow-context-strategy-dialog')
    fireEvent.click(within(strategyDialog).getByRole('button', { name: /Start Workflow in this chat/ }))

    await waitFor(() => {
      expect(mocks.startLinkedWorkflowSession).toHaveBeenCalledWith(sessionId, expect.objectContaining({
        contextStrategy: 'inherit',
      }))
    })
    expect(useTabStore.getState().activeTabId).toBe(sessionId)
    expect(useTabStore.getState().tabs).toHaveLength(1)
    expect(useSessionStore.getState().sessions[0]).toMatchObject({
      id: sessionId,
      workflow: LINKED_WORKFLOW_SUMMARY,
    })
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

  it('shows a distinct inline composer marker after selecting a skill slash command', async () => {
    useChatStore.setState({
      sessions: {
        [sessionId]: {
          ...useChatStore.getState().sessions[sessionId]!,
          slashCommands: [
            {
              name: 'update-config',
              description: 'Update runtime configuration.',
            },
          ],
        },
      },
    })

    render(<ChatInput />)

    await waitFor(() => {
      expect(mocks.getGitInfo).toHaveBeenCalledWith(sessionId)
    })

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: { value: '/update', selectionStart: 7 },
    })

    fireEvent.click(await screen.findByRole('button', { name: /\/update-config/i }))

    const editor = screen.getByTestId('chat-input-editor')
    const marker = within(editor).getByTestId('chat-input-inline-skill-invocation')
    expect(input.value).toBe('/update-config ')
    expect(marker).toHaveTextContent('/update-config')
    expect(marker).toHaveClass('font-mono')
    expect(screen.queryByTestId('chat-input-skill-invocation')).not.toBeInTheDocument()
  })
})
