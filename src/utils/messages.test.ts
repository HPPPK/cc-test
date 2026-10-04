import { afterEach, describe, expect, test } from 'bun:test'
import type { Attachment } from './attachments.js'
import { createAssistantMessage, createUserMessage, normalizeAttachmentForAPI, normalizeContentFromAPI, normalizeMessagesForAPI } from './messages.js'

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


test('preserves malformed streamed tool input instead of replacing it with an empty Write', () => {
  const raw = '{"file_path":"report.html","expert_output":{"fields":{"TITLE":"unfinished'
  const blocks = normalizeContentFromAPI([
    { type: 'tool_use', id: 'bad-write', name: 'Write', input: raw },
    { type: 'tool_use', id: 'next-read', name: 'Read', input: '{"file_path":"evidence.md"}' },
    { type: 'text', text: 'Following result is preserved', citations: [] },
  ] as never, [])
  expect((blocks[0] as any).input).toBe(raw)
  expect((blocks[1] as any).input).toEqual({ file_path: 'evidence.md' })
  expect(blocks[2]).toMatchObject({ text: 'Following result is preserved' })
})

test('retains malformed arguments locally but sends an object-shaped error record with its paired result in API history', () => {
  const raw = '{"file_path":"report.html","expert_output":'
  const local = createAssistantMessage({ content: [
    { type: 'tool_use', id: 'bad-write', name: 'Write', input: raw },
    { type: 'tool_use', id: 'next-read', name: 'Read', input: { file_path: 'evidence.md' } },
  ] as never })
  const result = createUserMessage({ content: [
    { type: 'tool_result', tool_use_id: 'bad-write', is_error: true, content: 'TOOL_INPUT_JSON_INVALID: not executed' },
    { type: 'tool_result', tool_use_id: 'next-read', content: 'The evidence remains available' },
  ] })
  const normalized = normalizeMessagesForAPI([local, result])
  const assistant = normalized.find((message) => message.type === 'assistant')!
  expect((assistant.message.content[0] as any).input).toEqual({ _invalid_json: raw })
  expect((local.message.content[0] as any).input).toBe(raw)
  expect((assistant.message.content[1] as any).input).toEqual({ file_path: 'evidence.md' })
  const user = normalized.find((message) => message.type === 'user')!
  expect(user.message.content).toEqual(expect.arrayContaining([
    expect.objectContaining({ tool_use_id: 'bad-write', is_error: true }),
    expect.objectContaining({ tool_use_id: 'next-read', content: 'The evidence remains available' }),
  ]))
})
