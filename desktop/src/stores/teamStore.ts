import { create } from 'zustand'
import { teamsApi } from '../api/teams'
import type { TeamSummary, TeamDetail, TeamMember, AgentColor } from '../types/team'
import { AGENT_COLORS } from '../types/team'
import type { TeamMemberStatus, UIMessage } from '../types/chat'
import { useChatStore, mapHistoryMessagesToUiMessages } from './chatStore'
import { useTabStore } from './tabStore'

const MEMBER_POLL_INTERVAL_MS = 1500
const MEMBER_TRANSCRIPT_MATCH_WINDOW_MS = 120_000
const ACTIVE_TEAM_STORAGE_KEY = 'cc-haha-active-team'

/** Check if a member name is valid (not a CLI flag, API method, or empty string) */
function isValidMemberName(name: string | undefined): boolean {
  if (!name || name.trim() === '') return false
  // Filter out CLI flags like `--`, `-h`, `--help`, etc.
  if (name.startsWith('-')) return false
  // Filter out API method names and CLI tokens that might be mistakenly used as member names
  const invalidNames = new Set([
    'null', 'undefined',
    // API methods
    'SendMessage', 'TeamCreate', 'TeamDelete', 'TeamUpdate', 'TeamList',
    // CLI tokens
    'Agent', 'Team', 'Create', 'Delete', 'Update', 'List', 'Get', 'Set',
    // Common commands
    'help', 'version', 'init', 'start', 'stop', 'run', 'build', 'test'
  ])
  if (invalidNames.has(name)) return false
  return true
}

/** Generate a synthetic sessionId for team member tabs */
const memberSessionId = (agentId: string) => `team-member:${agentId}`
const TEAM_MEMBER_SESSION_PREFIX = 'team-member:'
const disconnectedMemberCache = new Map<string, TeamMember>()

/** Module-level timer for polling member transcript */
let memberPollTimer: ReturnType<typeof setInterval> | null = null
let polledMemberSessionId: string | null = null

function createMemberSessionState() {
  return {
    messages: [] as UIMessage[],
    chatState: 'idle' as const,
    connectionState: 'connected' as const,
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
  }
}

function normalizeMemberStatus(status: string | undefined): TeamMember['status'] {
  if (status === 'running' || status === 'idle' || status === 'completed') {
    return status
  }
  return status === 'failed' ? 'error' : 'idle'
}

function normalizeJoinedAt(value: unknown): string | undefined {
  if (typeof value === 'number') return new Date(value).toISOString()
  return typeof value === 'string' ? value : undefined
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function toTeamMember(raw: Record<string, unknown>): TeamMember {
  return {
    agentId: (raw.agentId as string) || '',
    name: raw.name as string | undefined,
    role:
      (raw.name as string) ||
      (raw.agentType as string) ||
      (raw.role as string) ||
      (raw.agentId as string) ||
      '',
    status: normalizeMemberStatus(raw.status as string | undefined),
    currentTask: raw.currentTask as string | undefined,
    color: raw.color as AgentColor | undefined,
    sessionId: raw.sessionId as string | undefined,
    joinedAt: normalizeJoinedAt(raw.joinedAt),
    inputTokens: normalizeOptionalNumber(raw.inputTokens),
    outputTokens: normalizeOptionalNumber(raw.outputTokens),
  }
}

function isPendingMemberMessage(message: UIMessage): message is Extract<UIMessage, { type: 'user_text' }> & { pending: true } {
  return message.type === 'user_text' && message.pending === true
}

function transcriptAlreadyContainsMessage(
  transcriptMessages: UIMessage[],
  pendingMessage: Extract<UIMessage, { type: 'user_text' }> & { pending: true },
): boolean {
  return transcriptMessages.some((message) => (
    message.type === 'user_text' &&
    message.pending !== true &&
    message.content === pendingMessage.content &&
    Math.abs(message.timestamp - pendingMessage.timestamp) <= MEMBER_TRANSCRIPT_MATCH_WINDOW_MS
  ))
}

function mergeMemberTranscriptMessages(
  existingMessages: UIMessage[],
  transcriptMessages: UIMessage[],
): UIMessage[] {
  const pendingMessages = existingMessages.filter(isPendingMemberMessage).filter(
    (message) => !transcriptAlreadyContainsMessage(transcriptMessages, message),
  )

  return pendingMessages.length > 0
    ? [...transcriptMessages, ...pendingMessages]
    : transcriptMessages
}

function syncMemberSessionMessages(
  sessionId: string,
  memberStatus: TeamMember['status'],
  messages: UIMessage[],
) {
  const hasPendingMessages = messages.some(isPendingMemberMessage)
  useChatStore.setState((state) => {
    const existing = state.sessions[sessionId]
    const nextState = existing ?? createMemberSessionState()
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...nextState,
          messages,
          connectionState: 'connected',
          chatState:
            memberStatus === 'running' || hasPendingMessages
              ? 'thinking'
              : 'idle',
        },
      },
    }
  })
}

function markMemberSessionsDisconnected(agentIds: string[]) {
  const targetSessionIds = new Set(agentIds.map(memberSessionId))
  if (targetSessionIds.size === 0) return

  useChatStore.setState((state) => ({
    sessions: Object.fromEntries(
      Object.entries(state.sessions).map(([sessionId, session]) => [
        sessionId,
        targetSessionIds.has(sessionId)
          ? {
              ...session,
              chatState: 'idle' as const,
              connectionState: 'disconnected' as const,
              streamingText: '',
              streamingToolInput: '',
              activeToolUseId: null,
              activeToolName: null,
              activeThinkingId: null,
              pendingPermission: null,
              pendingComputerUsePermission: null,
              statusVerb: '',
            }
          : session,
      ]),
    ),
  }))
}

function disconnectedMemberFromSessionId(sessionId: string): TeamMember {
  const cached = disconnectedMemberCache.get(sessionId)
  if (cached) return cached

  const agentId = sessionId.slice(TEAM_MEMBER_SESSION_PREFIX.length)
  const displayRole = agentId.split('@')[0] || agentId
  const member: TeamMember = {
    agentId,
    role: displayRole,
    status: 'error',
  }
  disconnectedMemberCache.set(sessionId, member)
  return member
}

type TeamStore = {
  teams: TeamSummary[]
  activeTeam: TeamDetail | null
  memberColors: Map<string, AgentColor>
  error: string | null
  wsDisconnected: boolean

  fetchTeams: () => Promise<void>
  fetchTeamDetail: (name: string) => Promise<void>
  getMemberBySessionId: (sessionId: string) => TeamMember | null
  refreshMemberSession: (sessionId: string) => Promise<void>
  openMemberSession: (member: TeamMember) => void
  sendMessageToMember: (sessionId: string, content: string) => Promise<void>
  startMemberPolling: (sessionId: string, force?: boolean) => void
  stopMemberPolling: () => void
  clearTeam: () => void
  saveActiveTeam: () => void
  restoreActiveTeam: () => Promise<void>
  deleteMember: (agentId: string) => Promise<void>
  stopMember: (agentId: string) => Promise<void>
  deleteTeam: (force?: boolean) => Promise<void>
  setWsDisconnected: (disconnected: boolean) => void

  // WebSocket handlers
  handleTeamCreated: (teamName: string) => void
  handleTeamUpdate: (teamName: string, members: TeamMemberStatus[]) => void
  handleTeamDeleted: (teamName: string) => void
}

export const useTeamStore = create<TeamStore>((set, get) => ({
  teams: [],
  activeTeam: null,
  memberColors: new Map(),
  error: null,
  wsDisconnected: false,

  fetchTeams: async () => {
    set({ error: null })
    try {
      const { teams } = await teamsApi.list()
      set({ teams })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  fetchTeamDetail: async (name: string) => {
    set({ error: null })
    try {
      const raw = await teamsApi.get(name) as Record<string, unknown>
      const rawMembers = Array.isArray(raw.members) ? raw.members : []
      const members: TeamMember[] = rawMembers
        .map((m: Record<string, unknown>) => toTeamMember(m))
        .filter((m) => isValidMemberName(m.name) && isValidMemberName(m.role))
      const detail: TeamDetail = {
        name: raw.name as string,
        leadAgentId: raw.leadAgentId as string | undefined,
        leadSessionId: raw.leadSessionId as string | undefined,
        members,
        createdAt: raw.createdAt != null ? String(raw.createdAt) : undefined,
      }
      // Assign colors to members
      const colors = new Map<string, AgentColor>()
      detail.members.forEach((m, i) => {
        colors.set(m.agentId, AGENT_COLORS[i % AGENT_COLORS.length]!)
      })
      set({ activeTeam: detail, memberColors: colors })
      // Persist active team name
      get().saveActiveTeam()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  getMemberBySessionId: (sessionId: string) => {
    const team = get().activeTeam
    if (!team && sessionId.startsWith(TEAM_MEMBER_SESSION_PREFIX)) {
      return disconnectedMemberFromSessionId(sessionId)
    }
    if (!team) return null
    return team.members.find(
      (m) => m.sessionId === sessionId || memberSessionId(m.agentId) === sessionId,
    ) ?? (sessionId.startsWith(TEAM_MEMBER_SESSION_PREFIX)
      ? disconnectedMemberFromSessionId(sessionId)
      : null)
  },

  refreshMemberSession: async (sessionId) => {
    const team = get().activeTeam
    const member = get().getMemberBySessionId(sessionId)
    if (!team || !member) return

    try {
      const { messages } = await teamsApi.getMemberTranscript(team.name, member.agentId)
      const asEntries = messages.map((msg) => ({
        id: msg.id,
        type: msg.type,
        content: msg.content,
        timestamp: msg.timestamp,
        model: msg.model,
        parentToolUseId: msg.parentToolUseId,
      }))
      const transcriptMessages = mapHistoryMessagesToUiMessages(
        asEntries as Parameters<typeof mapHistoryMessagesToUiMessages>[0],
        { includeTeammateMessages: true },
      )
      const existingMessages = useChatStore.getState().sessions[sessionId]?.messages ?? []
      const mergedMessages = mergeMemberTranscriptMessages(
        existingMessages,
        transcriptMessages,
      )
      syncMemberSessionMessages(sessionId, member.status, mergedMessages)
    } catch (error) {
      console.error('[teamStore] Failed to refresh member session transcript:', {
        teamName: team.name,
        agentId: member.agentId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
      const existingMessages = useChatStore.getState().sessions[sessionId]?.messages ?? []
      syncMemberSessionMessages(sessionId, member.status, existingMessages)
    }
  },

  openMemberSession: (member: TeamMember) => {
    const team = get().activeTeam
    if (!team) return

    get().stopMemberPolling()

    const tabId = memberSessionId(member.agentId)
    useTabStore.getState().openTab(tabId, member.role, 'session')
    void get().refreshMemberSession(tabId)
    get().startMemberPolling(tabId)
  },

  sendMessageToMember: async (sessionId, content) => {
    const team = get().activeTeam
    const member = get().getMemberBySessionId(sessionId)
    if (!team || !member) {
      throw new Error('Team member session is no longer available')
    }

    await teamsApi.sendMemberMessage(team.name, member.agentId, content)
    get().startMemberPolling(sessionId, true)
    await get().refreshMemberSession(sessionId)
  },

  startMemberPolling: (sessionId, force = false) => {
    const member = get().getMemberBySessionId(sessionId)
    if (!member) return

    const hasPendingMessages =
      useChatStore.getState().sessions[sessionId]?.messages.some(isPendingMemberMessage) ?? false

    if (!force && polledMemberSessionId === sessionId && memberPollTimer) {
      return
    }

    // Allow polling for completed/idle members so users can view their history.
    // Only skip if there is genuinely nothing to poll (no pending messages and
    // the member is in a terminal state with no reason to expect updates).
    // For completed/idle members, use a longer interval to reduce overhead.
    const isTerminal = member.status === 'completed' || member.status === 'error'
    if (isTerminal && !hasPendingMessages) {
      // Terminal members still need one final transcript refresh
      // so the user can see their conversation history.
      void get().refreshMemberSession(sessionId)
      // Don't start a poll timer for truly terminal members
      get().stopMemberPolling()
      return
    }

    // For idle members, keep polling at a reduced rate so messages stay current
    const pollInterval = member.status === 'idle'
      ? MEMBER_POLL_INTERVAL_MS * 4  // 6s for idle members
      : MEMBER_POLL_INTERVAL_MS      // 1.5s for running members

    get().stopMemberPolling()
    polledMemberSessionId = sessionId
    memberPollTimer = setInterval(() => {
      const currentTabId = useTabStore.getState().activeTabId
      if (currentTabId !== sessionId) {
        get().stopMemberPolling()
        return
      }

      // Re-check member status on each tick — transition to longer interval
      // when the member becomes idle, or stop when truly terminal
      const currentMember = get().getMemberBySessionId(sessionId)
      if (!currentMember) {
        get().stopMemberPolling()
        return
      }

      // Stop polling for terminal states (completed/error) after a final refresh
      if (
        (currentMember.status === 'completed' || currentMember.status === 'error') &&
        !useChatStore.getState().sessions[sessionId]?.messages.some(isPendingMemberMessage)
      ) {
        void get().refreshMemberSession(sessionId)
        get().stopMemberPolling()
        return
      }

      void get().refreshMemberSession(sessionId)
    }, pollInterval)
  },

  stopMemberPolling: () => {
    if (memberPollTimer) {
      clearInterval(memberPollTimer)
      memberPollTimer = null
    }
    polledMemberSessionId = null
  },

  clearTeam: () => {
    get().stopMemberPolling()
    set({ activeTeam: null, memberColors: new Map() })
    // Clear persisted active team
    try {
      localStorage.removeItem(ACTIVE_TEAM_STORAGE_KEY)
    } catch { /* noop */ }
  },

  saveActiveTeam: () => {
    const { activeTeam } = get()
    if (activeTeam) {
      try {
        localStorage.setItem(ACTIVE_TEAM_STORAGE_KEY, activeTeam.name)
      } catch { /* noop */ }
    } else {
      try {
        localStorage.removeItem(ACTIVE_TEAM_STORAGE_KEY)
      } catch { /* noop */ }
    }
  },

  restoreActiveTeam: async () => {
    try {
      const teamName = localStorage.getItem(ACTIVE_TEAM_STORAGE_KEY)
      if (!teamName) return

      // Check if team still exists
      const { teams } = await teamsApi.list()
      if (teams.some((t) => t.name === teamName)) {
        await get().fetchTeamDetail(teamName)
      } else {
        // Team no longer exists, clear storage
        localStorage.removeItem(ACTIVE_TEAM_STORAGE_KEY)
      }
    } catch { /* noop */ }
  },

  handleTeamCreated: (teamName: string) => {
    set((s) => ({
      teams: [...s.teams, { name: teamName, memberCount: 0 }],
    }))
    get().fetchTeamDetail(teamName)
    setTimeout(() => get().fetchTeamDetail(teamName), 1500)
    setTimeout(() => get().fetchTeamDetail(teamName), 4000)
    setTimeout(() => get().fetchTeamDetail(teamName), 8000)
  },

  handleTeamUpdate: (teamName: string, members: TeamMemberStatus[]) => {
    const team = get().activeTeam
    if (team && team.name === teamName) {
      if (members.length === 0) return

      if (members.length > team.members.length) {
        get().fetchTeamDetail(teamName)
      }

      const colors = get().memberColors
      const existingMap = new Map(team.members.map((m) => [m.agentId, m]))
      const incomingIds = new Set(members.map((m) => m.agentId))
      const kept = team.members.filter((m) => !incomingIds.has(m.agentId))
      const updatedMembers: TeamMember[] = [
        ...kept,
        ...members.map((m, i) => {
          const existing = existingMap.get(m.agentId)
          return {
            ...(existing ?? {}),
            name: existing?.name,
            agentId: m.agentId,
            role: m.role,
            status: normalizeMemberStatus(m.status),
            currentTask: m.currentTask,
            color: colors.get(m.agentId) ?? AGENT_COLORS[i % AGENT_COLORS.length]!,
            sessionId: existing?.sessionId,
            joinedAt: m.joinedAt ?? existing?.joinedAt,
            inputTokens: m.inputTokens ?? existing?.inputTokens,
            outputTokens: m.outputTokens ?? existing?.outputTokens,
          }
        }),
      ]
      set({ activeTeam: { ...team, members: updatedMembers } })

      // Check if all members have completed - if so, clear team state after a delay
      const allCompleted = updatedMembers.length > 0 && updatedMembers.every(
        (m) => m.status === 'completed' || m.status === 'error'
      )
      if (allCompleted) {
        // Clear team state after 5 seconds so user can see final status
        setTimeout(() => {
          const currentTeam = get().activeTeam
          if (currentTeam?.name === teamName) {
            const stillAllCompleted = currentTeam.members.every(
              (m) => m.status === 'completed' || m.status === 'error'
            )
            if (stillAllCompleted) {
              get().clearTeam()
            }
          }
        }, 5000)
      }

      const currentTabId = useTabStore.getState().activeTabId
      if (currentTabId) {
        const viewedMember = get().getMemberBySessionId(currentTabId)
        if (viewedMember) {
          void get().refreshMemberSession(currentTabId)
          get().startMemberPolling(currentTabId)
        }
      }
    }
  },

  handleTeamDeleted: (teamName: string) => {
    get().stopMemberPolling()
    set((s) => {
      const isActiveTeam = s.activeTeam?.name === teamName
      if (isActiveTeam) {
        markMemberSessionsDisconnected(s.activeTeam?.members.map((m) => m.agentId) ?? [])
        try {
          localStorage.removeItem(ACTIVE_TEAM_STORAGE_KEY)
        } catch { /* noop */ }
      }
      return {
        teams: s.teams.filter((t) => t.name !== teamName),
        activeTeam: isActiveTeam ? null : s.activeTeam,
      }
    })
  },

  deleteMember: async (agentId: string) => {
    const team = get().activeTeam
    if (!team) {
      throw new Error('No active team')
    }

    await teamsApi.stopMember(team.name, agentId)
    // The member will be updated via WebSocket team_update event
  },

  deleteTeam: async (force?: boolean) => {
    const team = get().activeTeam
    if (!team) {
      throw new Error('No active team')
    }

    await teamsApi.delete(team.name, force)
    markMemberSessionsDisconnected(team.members.map((m) => m.agentId))

    // Clear team state
    get().clearTeam()
  },

  setWsDisconnected: (disconnected: boolean) => {
    set({ wsDisconnected: disconnected })
  },
}))
