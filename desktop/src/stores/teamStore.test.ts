import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getMock, listMock, deleteMemberMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  listMock: vi.fn(),
  deleteMemberMock: vi.fn(),
}))

vi.mock('../api/teams', () => ({
  teamsApi: {
    list: listMock,
    get: getMock,
    getMemberTranscript: vi.fn(),
    sendMemberMessage: vi.fn(),
    deleteMember: deleteMemberMock,
    stopMember: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useTeamStore } from './teamStore'
import { useChatStore } from './chatStore'

const initialState = useTeamStore.getState()

describe('teamStore team detail projection', () => {
  beforeEach(() => {
    getMock.mockReset()
    listMock.mockReset()
    deleteMemberMock.mockReset()
    useTeamStore.setState({
      ...initialState,
      teams: [],
      activeTeam: null,
      memberColors: new Map(),
      error: null,
      wsDisconnected: false,
    })
    useChatStore.setState({ sessions: {} })
    localStorage.clear()
  })

  afterEach(() => {
    useTeamStore.setState(initialState)
    useChatStore.setState({ sessions: {} })
    localStorage.clear()
  })

  it('preserves runtime and token metrics from REST team detail', async () => {
    getMock.mockResolvedValue({
      name: 'metrics-team',
      leadAgentId: 'lead-agent',
      leadSessionId: 'lead-session',
      createdAt: 1700000000000,
      members: [
        {
          agentId: 'worker-agent',
          name: 'Worker Agent',
          status: 'running',
          joinedAt: 1700000001000,
          inputTokens: 12000,
          outputTokens: 345,
        },
      ],
    })

    await useTeamStore.getState().fetchTeamDetail('metrics-team')

    expect(useTeamStore.getState().activeTeam?.members[0]).toMatchObject({
      agentId: 'worker-agent',
      joinedAt: '2023-11-14T22:13:21.000Z',
      inputTokens: 12000,
      outputTokens: 345,
    })
  })

  it('keeps existing metrics when a WebSocket update omits them', () => {
    useTeamStore.setState({
      activeTeam: {
        name: 'metrics-team',
        leadAgentId: 'lead-agent',
        leadSessionId: 'lead-session',
        members: [
          {
            agentId: 'worker-agent',
            role: 'Worker Agent',
            status: 'running',
            joinedAt: '2026-05-16T00:00:00.000Z',
            inputTokens: 12000,
            outputTokens: 345,
          },
        ],
      },
      memberColors: new Map(),
    })

    useTeamStore.getState().handleTeamUpdate('metrics-team', [
      {
        agentId: 'worker-agent',
        role: 'Worker Agent',
        status: 'idle',
      },
    ])

    expect(useTeamStore.getState().activeTeam?.members[0]).toMatchObject({
      status: 'idle',
      joinedAt: '2026-05-16T00:00:00.000Z',
      inputTokens: 12000,
      outputTokens: 345,
    })
  })

  it('marks an open member session disconnected when that member is deleted', async () => {
    deleteMemberMock.mockResolvedValue({ ok: true })
    const memberSessionId = 'team-member:worker-agent'

    useTeamStore.setState({
      activeTeam: {
        name: 'metrics-team',
        leadAgentId: 'lead-agent',
        leadSessionId: 'lead-session',
        members: [
          {
            agentId: 'worker-agent',
            role: 'Worker Agent',
            status: 'running',
          },
        ],
      },
      memberColors: new Map(),
    })
    useChatStore.setState({
      sessions: {
        [memberSessionId]: {
          messages: [{ id: 'msg-1', type: 'assistant_text', content: 'History', timestamp: 1 }],
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

    await useTeamStore.getState().deleteMember('worker-agent')

    expect(useChatStore.getState().sessions[memberSessionId]).toMatchObject({
      chatState: 'idle',
      connectionState: 'disconnected',
      messages: [{ id: 'msg-1', type: 'assistant_text', content: 'History', timestamp: 1 }],
    })
  })
})
