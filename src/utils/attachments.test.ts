import { afterEach, describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import { asAgentId } from '../types/ids.js'
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

function createContext(overrides?: { tools?: ToolUseContext['options']['tools']; agentId?: ToolUseContext['agentId'] }): ToolUseContext {
  return {
    options: {
      tools: overrides?.tools ?? [{ name: AGENT_TOOL_NAME }],
    },
    agentId: overrides?.agentId,
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
      createContext({ tools: [] }),
      [],
    )

    expect(attachments).toEqual([])
  })

  test('does not emit for subagents', async () => {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'

    const attachments = await getTeammateRuntimeProviderAttachments(
      createContext({ agentId: asAgentId('a0123456789abcdef') }),
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

    if (!attachment) throw new Error('Expected initial roster attachment')
    const previousMessage: AttachmentMessage = {
      type: 'attachment',
      attachment,
      uuid: randomUUID(),
      timestamp: '2026-05-17T00:00:00.000Z',
    }

    const repeated = await getTeammateRuntimeProviderAttachments(
      createContext(),
      [previousMessage],
    )

    expect(repeated).toEqual([])
  })
})
