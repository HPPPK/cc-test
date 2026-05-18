import { afterEach, describe, expect, test } from 'bun:test'
import type { Attachment } from './attachments.js'
import { normalizeAttachmentForAPI } from './messages.js'

const originalAgentTeams = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS

afterEach(() => {
  if (originalAgentTeams === undefined) {
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
  } else {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = originalAgentTeams
  }
})

describe('team context attachment rendering', () => {
  test('lists known teammate names and tells teammates to use SendMessage', () => {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'

    const [message] = normalizeAttachmentForAPI({
      type: 'team_context',
      agentId: 'xiao-yue@social-test',
      agentName: 'xiao-yue',
      teamName: 'social-test',
      teamConfigPath: '/teams/social-test/config.json',
      taskListPath: '/tasks/social-test',
      teammateNames: ['team-lead', 'xiao-ming'],
    } satisfies Attachment)

    const content = String(message?.message.content ?? '')

    expect(content).toContain('Known teammates right now: "team-lead", "xiao-ming"')
    expect(content).toContain('do that with SendMessage first')
    expect(content).toContain('plain text in your own transcript is not visible')
  })
})
