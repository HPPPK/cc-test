import { afterEach, describe, expect, test } from 'bun:test'
import type { ToolUseContext } from '../Tool.js'
import type { AttachmentMessage } from '../types/message.js'
import { AGENT_TOOL_NAME } from '../tools/AgentTool/constants.js'
import { getTeammateRuntimeProviderAttachments } from './attachments.js'

const originalAgentTeams = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS

afterEach(() => {
  if (originalAgentTeams === undefined) {
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
  } else {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = originalAgentTeams
  }
})

function createContext(overrides?: Partial<ToolUseContext>): ToolUseContext {
  return {
    agentId: undefined,
    options: {
      tools: [{ name: AGENT_TOOL_NAME }],
    },
    ...overrides,
  } as ToolUseContext
}

describe('teammate runtime provider attachments', () => {
  test('does not emit when agent teams are disabled', async () => {
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS

    const attachments = await getTeammateRuntimeProviderAttachments(
      createContext(),
      [],
    )

    expect(attachments).toEqual([])
  })

  test('does not emit without Agent tool access', async () => {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'

    const attachments = await getTeammateRuntimeProviderAttachments(
      createContext({ options: { tools: [] } } as Partial<ToolUseContext>),
      [],
    )

    expect(attachments).toEqual([])
  })

  test('does not emit for subagents', async () => {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'

    const attachments = await getTeammateRuntimeProviderAttachments(
      createContext({ agentId: 'subagent-id' } as Partial<ToolUseContext>),
      [],
    )

    expect(attachments).toEqual([])
  })

  test('emits initial roster and skips unchanged fingerprints', async () => {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'

    const [attachment] = await getTeammateRuntimeProviderAttachments(
      createContext(),
      [],
    )

    expect(attachment?.type).toBe('teammate_runtime_providers')

    const previousMessage = {
      type: 'attachment',
      attachment,
      uuid: 'previous',
      timestamp: '2026-05-17T00:00:00.000Z',
    } as AttachmentMessage

    const repeated = await getTeammateRuntimeProviderAttachments(
      createContext(),
      [previousMessage],
    )

    expect(repeated).toEqual([])
  })
})
