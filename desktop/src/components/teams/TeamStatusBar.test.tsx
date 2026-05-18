import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamStatusBar } from './TeamStatusBar'
import { useTabStore } from '../../stores/tabStore'
import { useTeamStore } from '../../stores/teamStore'

vi.mock('../../i18n', () => ({
  useTranslation: () => (key: string) => key,
}))

const initialTeamState = useTeamStore.getState()

describe('TeamStatusBar destructive actions', () => {
  beforeEach(() => {
    useTeamStore.setState({
      ...initialTeamState,
      activeTeam: {
        name: 'debug-team',
        leadAgentId: 'lead-agent',
        leadSessionId: 'lead-session',
        members: [
          {
            agentId: 'lead-agent',
            role: 'Lead Agent',
            status: 'running',
          },
          {
            agentId: 'worker-agent',
            role: 'Worker Agent',
            status: 'running',
            joinedAt: '2026-05-16T00:00:00.000Z',
            inputTokens: 1200,
            outputTokens: 45,
            providerId: 'openrouter',
            modelId: 'openai/gpt-5.4',
          },
        ],
      },
      memberColors: new Map(),
      error: null,
      wsDisconnected: false,
      openMemberSession: vi.fn(),
      deleteTeam: vi.fn().mockResolvedValue(undefined),
      deleteMember: vi.fn().mockResolvedValue(undefined),
      stopMember: vi.fn().mockResolvedValue(undefined),
    })
    useTabStore.setState({ activeTabId: 'lead-session' })
  })

  afterEach(() => {
    cleanup()
    useTeamStore.setState(initialTeamState)
    useTabStore.setState({ activeTabId: null })
  })

  it('force-deletes the team from the stop-all-and-delete confirmation', async () => {
    render(<TeamStatusBar />)

    fireEvent.click(screen.getByTitle('teams.deleteTeam'))
    fireEvent.click(screen.getByRole('button', { name: 'teams.stopAndDeleteTeam' }))

    await waitFor(() => {
      expect(useTeamStore.getState().deleteTeam).toHaveBeenCalledWith(true)
    })
    expect(useTeamStore.getState().stopMember).not.toHaveBeenCalled()
  })

  it('deletes a running member from the stop-and-delete confirmation', async () => {
    render(<TeamStatusBar />)

    fireEvent.click(screen.getByTitle('teams.deleteMember'))
    fireEvent.click(screen.getByRole('button', { name: 'teams.stopAndDeleteMember' }))

    await waitFor(() => {
      expect(useTeamStore.getState().deleteMember).toHaveBeenCalledWith('worker-agent')
    })
    expect(useTeamStore.getState().stopMember).not.toHaveBeenCalled()
  })

  it('renders member token metrics when they are present', () => {
    render(<TeamStatusBar />)

    expect(screen.getByText('1.2k / 45')).toBeTruthy()
  })

  it('renders member provider and model runtime selection', () => {
    render(<TeamStatusBar />)

    expect(screen.getByText('openrouter / openai/gpt-5.4')).toBeTruthy()
  })
})
