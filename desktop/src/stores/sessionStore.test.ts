import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createMock, listMock, deleteMock, batchDeleteMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  listMock: vi.fn(),
  deleteMock: vi.fn(),
  batchDeleteMock: vi.fn(),
}))

vi.mock('../api/sessions', () => ({
  sessionsApi: {
    create: createMock,
    list: listMock,
    delete: deleteMock,
    batchDelete: batchDeleteMock,
    rename: vi.fn(),
  },
}))

import { useSessionStore } from './sessionStore'
import { useTabStore } from './tabStore'
import type { WorkflowSessionSummary } from '../types/session'

const initialState = useSessionStore.getState()

const workflowSummary: WorkflowSessionSummary = {
  mode: 'workflow',
  templateId: 'requirements-to-implementation',
  templateVersion: '1',
  templateSource: 'builtin',
  templateSnapshotId: 'snapshot-1',
  status: 'created',
  activePhaseId: 'requirements-clarification',
  activePhaseIndex: 0,
  phaseCount: 5,
  pendingConfirmation: false,
  statePointer: {
    kind: 'workflow-state',
    sessionId: 'session-workflow-1',
    artifactId: 'state',
    schemaVersion: 1,
    createdAt: '2026-05-20T00:00:00.000Z',
  },
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function historySession(id: string) {
  return {
    id, title: 'Untitled Session', createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-01T00:00:00Z', messageCount: 0, projectPath: '-fixture',
    workDir: '/fixture', workDirExists: true,
  }
}

describe('sessionStore', () => {
  beforeEach(() => {
    createMock.mockReset()
    listMock.mockReset()
    deleteMock.mockReset()
    batchDeleteMock.mockReset()
    useSessionStore.setState({
      ...initialState,
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      error: null,
    })
    useTabStore.setState({ tabs: [], activeTabId: null })
  })

  afterEach(() => {
    useSessionStore.setState(initialState)
    useTabStore.setState({ tabs: [], activeTabId: null })
  })

  it('loads every history page so select-all is not limited to the newest 100 sessions', async () => {
    const sessions = Array.from({ length: 235 }, (_, i) => ({
      id: `session-${i}`, title: 'Untitled Session', createdAt: '2026-01-01T00:00:00Z',
      modifiedAt: '2026-01-01T00:00:00Z', messageCount: 0, projectPath: '-fixture',
      workDir: '/fixture', workDirExists: true,
    }))
    listMock.mockImplementation(async ({ offset = 0, limit = 100 }) => ({
      sessions: sessions.slice(offset, offset + limit), total: sessions.length,
    }))
    await useSessionStore.getState().fetchSessions('/fixture')
    expect(useSessionStore.getState().sessions).toHaveLength(235)
    expect(listMock.mock.calls.map(([options]) => options)).toEqual([
      { project: '/fixture', limit: 100, offset: 0 },
      { project: '/fixture', limit: 100, offset: 100 },
      { project: '/fixture', limit: 100, offset: 200 },
    ])
  })

  it('does not resurrect deleted sessions from a refresh that started before batch deletion', async () => {
    const stale = createDeferred<{ sessions: Array<{ id: string }>; total: number }>()
    listMock.mockReturnValue(stale.promise)
    const refresh = useSessionStore.getState().fetchSessions()
    batchDeleteMock.mockResolvedValue({ ok: true, successes: ['deleted'], failures: [] })
    await useSessionStore.getState().deleteSessions(['deleted'])
    stale.resolve({ sessions: [{ id: 'deleted' }], total: 1 })
    await refresh
    expect(useSessionStore.getState().sessions).toEqual([])
    expect(useSessionStore.getState().isLoading).toBe(false)
  })

  it('keeps the complete history deleted when a new session triggers a refresh', async () => {
    let saved = Array.from({ length: 235 }, (_, i) => historySession(`history-${i}`))
    listMock.mockImplementation(async ({ offset = 0, limit = 100 }) => ({
      sessions: saved.slice(offset, offset + limit), total: saved.length,
    }))
    batchDeleteMock.mockImplementation(async (ids: string[]) => {
      saved = saved.filter((session) => !ids.includes(session.id))
      return { ok: true, successes: ids, failures: [] }
    })
    await useSessionStore.getState().fetchSessions()
    const ids = useSessionStore.getState().sessions.map((session) => session.id)
    useSessionStore.getState().selectSessions(ids)
    await useSessionStore.getState().deleteSessions([...useSessionStore.getState().selectedSessionIds])
    expect(saved).toHaveLength(0)
    createMock.mockImplementation(async () => {
      saved.push(historySession('new-session'))
      return { sessionId: 'new-session' }
    })
    await useSessionStore.getState().createSession('/fixture')
    await useSessionStore.getState().fetchSessions()
    expect(useSessionStore.getState().sessions.map((session) => session.id)).toEqual(['new-session'])
  })

  it('ignores a stale single-delete refresh and an older failed refresh', async () => {
    const stale = createDeferred<{ sessions: ReturnType<typeof historySession>[]; total: number }>()
    listMock.mockReturnValueOnce(stale.promise)
    const refresh = useSessionStore.getState().fetchSessions()
    deleteMock.mockResolvedValue(undefined)
    await useSessionStore.getState().deleteSession('deleted')
    stale.resolve({ sessions: [historySession('deleted')], total: 1 })
    await refresh
    expect(useSessionStore.getState().sessions).toEqual([])
    let reject!: (error: Error) => void
    listMock.mockReturnValueOnce(new Promise((_, rejectPromise) => { reject = rejectPromise }))
    const old = useSessionStore.getState().fetchSessions()
    listMock.mockResolvedValueOnce({ sessions: [historySession('current')], total: 1 })
    await useSessionStore.getState().fetchSessions()
    reject(new Error('stale failure'))
    await old
    expect(useSessionStore.getState().sessions.map((session) => session.id)).toEqual(['current'])
    expect(useSessionStore.getState().error).toBeNull()
  })

  it('returns a new session id before the background refresh completes', async () => {
    createMock.mockResolvedValue({ sessionId: 'session-optimistic-1' })
    listMock.mockImplementation(() => new Promise(() => {}))

    const result = await Promise.race([
      useSessionStore.getState().createSession('D:/workspace/code/myself_code/cc-jiangxia'),
      delay(100).then(() => 'timed-out'),
    ])

    expect(result).toBe('session-optimistic-1')
    expect(useSessionStore.getState().activeSessionId).toBe('session-optimistic-1')
    expect(useSessionStore.getState().sessions[0]).toMatchObject({
      id: 'session-optimistic-1',
      title: 'New Session',
      workDir: 'D:/workspace/code/myself_code/cc-jiangxia',
      workDirExists: true,
    })
    expect(createMock).toHaveBeenCalledWith({
      workDir: 'D:/workspace/code/myself_code/cc-jiangxia',
    })
    expect(listMock).toHaveBeenCalledOnce()
  })

  it('keeps an optimistic local title when a background refresh still returns a placeholder', async () => {
    const refresh = createDeferred<{
      sessions: Array<{
        id: string
        title: string
        createdAt: string
        modifiedAt: string
        messageCount: number
        projectPath: string
        workDir: string | null
        workDirExists: boolean
      }>
      total: number
    }>()
    createMock.mockResolvedValue({ sessionId: 'session-title-1', workDir: '/workspace/project' })
    listMock.mockReturnValue(refresh.promise)

    await useSessionStore.getState().createSession('/workspace/project')
    useSessionStore.getState().updateSessionTitle('session-title-1', '开始优化UI')

    refresh.resolve({
      sessions: [{
        id: 'session-title-1',
        title: 'Untitled Session',
        createdAt: '2026-05-07T00:00:00.000Z',
        modifiedAt: '2026-05-07T00:00:01.000Z',
        messageCount: 0,
        projectPath: '',
        workDir: '/workspace/project',
        workDirExists: true,
      }],
      total: 1,
    })
    await refresh.promise
    await delay(0)

    expect(useSessionStore.getState().sessions[0]?.title).toBe('开始优化UI')
  })

  it('syncs refreshed session titles into already-open tabs', async () => {
    useTabStore.getState().openTab('session-title-2', '```json {"title":')
    listMock.mockResolvedValue({
      sessions: [{
        id: 'session-title-2',
        title: '使用bash写一个shell，随便写点什么东西',
        createdAt: '2026-05-07T00:00:00.000Z',
        modifiedAt: '2026-05-07T00:00:01.000Z',
        messageCount: 3,
        projectPath: '',
        workDir: '/workspace/project',
        workDirExists: true,
      }],
      total: 1,
    })

    await useSessionStore.getState().fetchSessions()

    expect(useTabStore.getState().tabs[0]?.title).toBe('使用bash写一个shell，随便写点什么东西')
  })

  it('forwards direct branch switch repository options when creating a session', async () => {
    createMock.mockResolvedValue({ sessionId: 'session-branch-switch', workDir: '/workspace/repo' })
    listMock.mockResolvedValue({ sessions: [], total: 0 })

    await useSessionStore.getState().createSession('/workspace/repo', {
      repository: { branch: 'feature/rail', worktree: false },
    })

    expect(createMock).toHaveBeenCalledWith({
      workDir: '/workspace/repo',
      repository: { branch: 'feature/rail', worktree: false },
    })
  })

  it('forwards isolated worktree repository options when creating a session', async () => {
    createMock.mockResolvedValue({
      sessionId: 'session-worktree-launch',
      workDir: '/workspace/repo/.claude/worktrees/desktop-feature-rail-12345678',
    })
    listMock.mockImplementation(() => new Promise(() => {}))

    await useSessionStore.getState().createSession('/workspace/repo', {
      repository: { branch: 'feature/rail', worktree: true },
    })

    expect(createMock).toHaveBeenCalledWith({
      workDir: '/workspace/repo',
      repository: { branch: 'feature/rail', worktree: true },
    })
    expect(useSessionStore.getState().sessions[0]?.workDir)
      .toBe('/workspace/repo/.claude/worktrees/desktop-feature-rail-12345678')
  })

  it('forwards workflow options when creating a workflow session', async () => {
    createMock.mockResolvedValue({
      sessionId: 'session-workflow-1',
      workDir: '/workspace/repo',
      workflow: workflowSummary,
    })
    listMock.mockImplementation(() => new Promise(() => {}))

    await (useSessionStore.getState().createSession as any)('/workspace/repo', {
      workflow: {
        templateId: 'requirements-to-implementation',
        templateSource: 'builtin',
        initialPhaseId: 'requirements-clarification',
      },
    })

    expect(createMock).toHaveBeenCalledWith({
      workDir: '/workspace/repo',
      workflow: {
        templateId: 'requirements-to-implementation',
        templateSource: 'builtin',
        initialPhaseId: 'requirements-clarification',
      },
    })
  })

  it('adds an optimistic workflow summary only when the create response includes one', async () => {
    createMock.mockResolvedValue({
      sessionId: 'session-workflow-1',
      workDir: '/workspace/repo',
      workflow: workflowSummary,
    })
    listMock.mockImplementation(() => new Promise(() => {}))

    await (useSessionStore.getState().createSession as any)('/workspace/repo', {
      workflow: { templateId: 'requirements-to-implementation' },
    })

    expect(useSessionStore.getState().sessions[0]).toMatchObject({
      id: 'session-workflow-1',
      workflow: workflowSummary,
    })
  })

  it('preserves additive recommended skill status fields from workflow create responses', async () => {
    const workflowWithSkillStatus = {
      ...workflowSummary,
      recommendedSkillStatus: {
        total: 3,
        available: 1,
        unavailable: 1,
        degraded: 1,
        evidenceCount: 2,
        activePhaseItems: [
          { name: 'sp-specify', status: 'available', source: 'project' },
          { name: 'security-review', status: 'missing', source: 'user' },
          { name: 'plugin-helper', status: 'plugin-disabled', source: 'plugin', pluginName: 'disabled-plugin' },
        ],
      },
      recommendedSkillEvidence: [
        {
          phaseId: 'requirements-clarification',
          name: 'sp-specify',
          outcome: 'used',
          rationale: 'Used to align the specification.',
          recordedAt: '2026-05-20T00:01:00.000Z',
          source: 'project',
          resolutionStatus: 'available',
        },
        {
          phaseId: 'requirements-clarification',
          name: 'security-review',
          outcome: 'relevant-unavailable',
          rationale: 'Security review was relevant but unavailable.',
          recordedAt: '2026-05-20T00:02:00.000Z',
          source: 'user',
          resolutionStatus: 'missing',
        },
      ],
    }
    createMock.mockResolvedValue({
      sessionId: 'session-workflow-skills',
      workDir: '/workspace/repo',
      workflow: workflowWithSkillStatus,
    })
    listMock.mockImplementation(() => new Promise(() => {}))

    await (useSessionStore.getState().createSession as any)('/workspace/repo', {
      workflow: { templateId: 'requirements-to-implementation' },
    })

    expect(useSessionStore.getState().sessions[0]?.workflow).toMatchObject({
      recommendedSkillStatus: workflowWithSkillStatus.recommendedSkillStatus,
      recommendedSkillEvidence: workflowWithSkillStatus.recommendedSkillEvidence,
    })
  })

  it('does not invent workflow metadata for normal dialogue create responses', async () => {
    createMock.mockResolvedValue({
      sessionId: 'session-dialogue-1',
      workDir: '/workspace/repo',
    })
    listMock.mockImplementation(() => new Promise(() => {}))

    await useSessionStore.getState().createSession('/workspace/repo')

    expect('workflow' in (useSessionStore.getState().sessions[0] as Record<string, unknown>)).toBe(false)
  })

  it('preserves optional workflow summaries when fetched sessions include them', async () => {
    window.localStorage.setItem('workflow-state', JSON.stringify({
      sessionId: 'session-workflow-1',
      activePhaseId: 'stale-local-phase',
      status: 'completed',
    }))
    listMock.mockResolvedValue({
      sessions: [{
        id: 'session-workflow-1',
        title: 'Workflow session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:00:01.000Z',
        messageCount: 0,
        projectPath: '',
        workDir: '/workspace/repo',
        workDirExists: true,
        workflow: workflowSummary,
      }],
      total: 1,
    })

    await useSessionStore.getState().fetchSessions()

    expect(useSessionStore.getState().sessions[0]).toMatchObject({
      id: 'session-workflow-1',
      workflow: workflowSummary,
    })
    expect(useSessionStore.getState().sessions[0]?.workflow?.activePhaseId)
      .toBe('requirements-clarification')
  })

  it('preserves additive recommended skill status fields from fetched workflow sessions', async () => {
    const fetchedWorkflowWithSkillStatus = {
      ...workflowSummary,
      recommendedSkillStatus: {
        total: 4,
        available: 2,
        unavailable: 1,
        degraded: 1,
        evidenceCount: 3,
        activePhaseItems: [
          { name: 'sp-specify', status: 'available', source: 'project' },
          { name: 'test-driven-development', status: 'available', source: 'managed' },
          { name: 'security-review', status: 'missing', source: 'user' },
          { name: 'plugin-helper', status: 'plugin-disabled', source: 'plugin', pluginName: 'disabled-plugin' },
        ],
      },
      recommendedSkillEvidence: [
        {
          phaseId: 'requirements-clarification',
          name: 'sp-specify',
          outcome: 'used',
          rationale: 'Used to align the specification.',
          recordedAt: '2026-05-20T00:01:00.000Z',
          source: 'project',
          resolutionStatus: 'available',
        },
        {
          phaseId: 'requirements-clarification',
          name: 'test-driven-development',
          outcome: 'relevant-skipped',
          rationale: 'Relevant but skipped for this RED-only pass.',
          recordedAt: '2026-05-20T00:02:00.000Z',
          source: 'managed',
          resolutionStatus: 'available',
        },
        {
          phaseId: 'requirements-clarification',
          name: 'security-review',
          outcome: 'relevant-unavailable',
          rationale: 'Security review was relevant but unavailable.',
          recordedAt: '2026-05-20T00:03:00.000Z',
          source: 'user',
          resolutionStatus: 'missing',
        },
      ],
    }
    listMock.mockResolvedValue({
      sessions: [{
        id: 'session-workflow-skills',
        title: 'Workflow session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:00:01.000Z',
        messageCount: 0,
        projectPath: '',
        workDir: '/workspace/repo',
        workDirExists: true,
        workflow: fetchedWorkflowWithSkillStatus,
      }],
      total: 1,
    })

    await useSessionStore.getState().fetchSessions()

    expect(useSessionStore.getState().sessions[0]?.workflow).toMatchObject({
      recommendedSkillStatus: fetchedWorkflowWithSkillStatus.recommendedSkillStatus,
      recommendedSkillEvidence: fetchedWorkflowWithSkillStatus.recommendedSkillEvidence,
    })
  })

  it('keeps a newer live workflow summary when a background refresh returns stale metadata', async () => {
    const liveWorkflow: WorkflowSessionSummary = {
      ...workflowSummary,
      status: 'running',
      transitionAuthority: 'user-confirmation',
      statePointer: {
        ...workflowSummary.statePointer,
        updatedAt: '2026-05-20T00:00:05.000Z',
      },
    }
    useSessionStore.setState({
      sessions: [{
        id: 'session-workflow-1',
        title: 'Workflow session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:00:05.000Z',
        messageCount: 1,
        projectPath: '',
        workDir: '/workspace/repo',
        workDirExists: true,
        workflow: liveWorkflow,
      }],
    })
    listMock.mockResolvedValue({
      sessions: [{
        id: 'session-workflow-1',
        title: 'Workflow session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:00:01.000Z',
        messageCount: 1,
        projectPath: '',
        workDir: '/workspace/repo',
        workDirExists: true,
        workflow: {
          ...workflowSummary,
          statePointer: {
            ...workflowSummary.statePointer,
            updatedAt: '2026-05-20T00:00:00.000Z',
          },
        },
      }],
      total: 1,
    })

    await useSessionStore.getState().fetchSessions()

    expect(useSessionStore.getState().sessions[0]?.workflow).toMatchObject({
      status: 'running',
      transitionAuthority: 'user-confirmation',
      statePointer: {
        updatedAt: '2026-05-20T00:00:05.000Z',
      },
    })
  })


  it('clears stale local expert state when a newer server snapshot has no expert metadata', async () => {
    useSessionStore.setState({
      sessions: [{
        id: 'session-stale-expert',
        title: 'Expert session',
        createdAt: '2026-07-24T03:40:00.000Z',
        modifiedAt: '2026-07-24T03:40:01.000Z',
        messageCount: 1,
        projectPath: '',
        workDir: '/workspace/project',
        workDirExists: true,
        expert: {
          mode: 'expert',
          expertId: 'uiux-design-system',
          expertName: 'UIUX Design System',
          packId: 'builtin-experts',
          packVersion: '1.0.0',
          status: 'active',
          materialRefs: [],
          startedAt: '2026-07-24T03:40:01.000Z',
          updatedAt: '2026-07-24T03:40:01.000Z',
        },
      }],
    })
    listMock.mockResolvedValue({
      sessions: [{
        id: 'session-stale-expert',
        title: 'Expert session',
        createdAt: '2026-07-24T03:40:00.000Z',
        modifiedAt: '2026-07-24T03:40:02.000Z',
        messageCount: 2,
        projectPath: '',
        workDir: '/workspace/project',
        workDirExists: true,
      }],
      total: 1,
    })

    await useSessionStore.getState().fetchSessions()

    expect(useSessionStore.getState().sessions[0]?.expert).toBeUndefined()
  })

  it('does not invent workflow metadata when fetched sessions omit workflow summaries', async () => {
    listMock.mockResolvedValue({
      sessions: [{
        id: 'session-dialogue-1',
        title: 'Dialogue session',
        createdAt: '2026-05-20T00:00:00.000Z',
        modifiedAt: '2026-05-20T00:00:01.000Z',
        messageCount: 0,
        projectPath: '',
        workDir: '/workspace/repo',
        workDirExists: true,
      }],
      total: 1,
    })

    await useSessionStore.getState().fetchSessions()

    expect('workflow' in (useSessionStore.getState().sessions[0] as Record<string, unknown>)).toBe(false)
  })
})
