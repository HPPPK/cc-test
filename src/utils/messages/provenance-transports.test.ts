import { APIError } from '@anthropic-ai/sdk'
import { asAgentId } from '../../types/ids.js'
import { expect, test, spyOn } from 'bun:test'
import * as messages from '../messages.js'
import { toInternalMessages, toSDKMessages } from './mappers.js'
import { normalizeMessage } from '../queryHelpers.js'
import { createStreamlinedTransformer } from '../streamlinedTransform.js'
import { userMessageToMessageParam } from '../../services/api/claude.js'

// A rendered status must remain a status after it enters history; none of these
// generated messages may be replayed as a fresh human instruction.
const statuses = [
  ['informational', () => messages.createSystemMessage('Paused for review', 'info', 'tool-1', true), { content: 'Paused for review', preventContinuation: true }],
  ['permission_retry', () => messages.createPermissionRetryMessage(['Read', 'Glob']), { commands: ['Read', 'Glob'], content: 'Allowed Read, Glob' }],
  ['bridge_status', () => messages.createBridgeStatusMessage('https://example.invalid', 'upgrade available'), { url: 'https://example.invalid', upgradeNudge: 'upgrade available' }],
  ['scheduled_task_fire', () => messages.createScheduledTaskFireMessage('Daily report'), { content: 'Daily report' }],
  ['stop_hook_summary', () => messages.createStopHookSummaryMessage(1, [], ['blocked'], true, 'review needed', true, 'warning', 'hook-1', 'Review', 42), { hookCount: 1, hookErrors: ['blocked'], preventedContinuation: true, stopReason: 'review needed', totalDurationMs: 42 }],
  ['turn_duration', () => messages.createTurnDurationMessage(123, { tokens: 40, limit: 100, nudges: 2 }, 3), { durationMs: 123, budgetTokens: 40, budgetLimit: 100, budgetNudges: 2, messageCount: 3 }],
  ['away_summary', () => messages.createAwaySummaryMessage('Two files changed'), { content: 'Two files changed' }],
  ['memory_saved', () => messages.createMemorySavedMessage(['memory/preferences.md']), { writtenPaths: ['memory/preferences.md'] }],
  ['agents_killed', () => messages.createAgentsKilledMessage(), {}],
  ['api_metrics', () => messages.createApiMetricsMessage({ ttftMs: 20, otps: 30, toolCount: 2 }), { ttftMs: 20, otps: 30, toolCount: 2 }],
  ['microcompact_boundary', () => messages.createMicrocompactBoundaryMessage('auto', 200, 40, ['read-1'], ['attachment-1']), { microcompactMetadata: { trigger: 'auto', preTokens: 200, tokensSaved: 40, compactedToolIds: ['read-1'], clearedAttachmentUUIDs: ['attachment-1'] } }],
] as const

for (const [subtype, create, payload] of statuses) {
  test(`${subtype} retains display data and system provenance`, () => {
    const row = create()
    expect(row).toMatchObject({ type: 'system', subtype, messageKind: 'system_event', ...payload })
    expect(row.uuid).toBeString()
    expect(Number.isFinite(Date.parse(row.timestamp))).toBe(true)
  })
}

test('retry errors and tool summaries retain diagnostics without inventing human input', () => {
  const cause = new Error('temporary transport failure')
  const error = Object.assign(new APIError(429, undefined, 'retry request', undefined), { cause })
  expect(messages.createSystemAPIErrorMessage(error, 1000, 2, 3)).toMatchObject({
    type: 'system', subtype: 'api_error', messageKind: 'system_event', error, cause,
    retryInMs: 1000, retryAttempt: 2, maxRetries: 3,
  })
  expect(messages.createToolUseSummaryMessage('Read the report', ['read-1'])).toMatchObject({
    type: 'tool_use_summary', messageKind: 'system_event', summary: 'Read the report', precedingToolUseIds: ['read-1'],
  })
})

test('SDK roundtrip preserves synthetic user, assistant and compact-boundary envelope provenance', () => {
  const user = messages.createUserMessage({ content: 'machine notice', messageKind: 'internal_notification', isSynthetic: true })
  const assistant = { ...messages.createAssistantMessage({ content: 'display only' }), messageKind: 'system_event' as const, isVisibleInTranscriptOnly: true as const }
  const boundary = messages.createCompactBoundaryMessage('auto', 123)
  const sdk = toSDKMessages([user, assistant, boundary])
  expect(sdk.map(row => 'messageKind' in row ? row.messageKind : undefined)).toEqual(['internal_notification', 'system_event', 'context_summary'])
  expect(sdk[0]).toMatchObject({ isSynthetic: true })
  expect(sdk[1]).toMatchObject({ isVisibleInTranscriptOnly: true })
  const restored = toInternalMessages(sdk)
  expect(restored.map(row => row.messageKind)).toEqual(['internal_notification', 'system_event', 'context_summary'])
  expect(restored[0]).toMatchObject({ isSynthetic: true, message: user.message })
  expect(restored[1]).toMatchObject({ isVisibleInTranscriptOnly: true })
  expect(restored[2]).toMatchObject({ compactMetadata: { trigger: 'auto', preTokens: 123 } })
  for (const row of sdk.filter(row => row.type === 'user' || row.type === 'assistant')) {
    expect(row.message).not.toHaveProperty('messageKind')
    expect(row.message).not.toHaveProperty('isSynthetic')
  }
})

test('local command output is replayable context without leaking envelope flags into provider payloads', () => {
  const command = messages.createCommandInputMessage('<local-command-stdout>Build passed</local-command-stdout>')
  const [history] = messages.normalizeMessagesForAPI([command])
  expect(history).toMatchObject({ type: 'user', messageKind: 'system_event', uuid: command.uuid })
  if (history?.type !== 'user') throw new Error('Expected replayable user-role command context')
  const provider = userMessageToMessageParam(history, false, false)
  expect(Object.keys(provider).sort()).toEqual(['content', 'role'])
  expect(JSON.stringify(provider)).toContain('Build passed')
  expect(JSON.stringify(provider)).not.toContain('messageKind')
})

test('nested agent and skill progress forward the inner provenance and parent linkage', () => {
  const assistant = { ...messages.createAssistantMessage({ content: 'subagent answer' }), messageKind: 'system_event' as const, isSynthetic: true }
  const user = messages.normalizeMessages([messages.createUserMessage({ content: 'summary context', isCompactSummary: true, isVisibleInTranscriptOnly: true })])[0]!
  for (const [type, inner, kind] of [['agent_progress', assistant, 'system_event'], ['skill_progress', user, 'context_summary']] as const) {
    const progress = messages.createProgressMessage({ toolUseID: 'progress-1', parentToolUseID: 'parent-1', data: { type, message: inner, prompt: 'fixture', agentId: asAgentId('a0123456789abcdef') } })
    expect(progress.messageKind).toBe('system_event')
    const [sdk] = [...normalizeMessage(progress)]
    expect(sdk).toMatchObject({ type: inner.type, messageKind: kind, parent_tool_use_id: 'parent-1' })
    if (!('message' in sdk)) throw new Error('Expected nested SDK message content')
    expect(sdk.message).not.toHaveProperty('messageKind')
    expect(sdk.message).not.toHaveProperty('isSynthetic')
  }
  const [sdkUser] = [...normalizeMessage(user)]
  expect(sdkUser).toMatchObject({ messageKind: 'context_summary', isCompactSummary: true, isVisibleInTranscriptOnly: true, parent_tool_use_id: null })
})

test('remote shell progress is a throttled system event rather than a conversational turn', () => {
  const previousRemote = process.env.CLAUDE_CODE_REMOTE
  const clock = spyOn(Date, 'now').mockReturnValue(1_000_000)
  process.env.CLAUDE_CODE_REMOTE = '1'
  try {
    for (const [type, name] of [['bash_progress', 'Bash'], ['powershell_progress', 'PowerShell']] as const) {
      const progress = messages.createProgressMessage({ toolUseID: crypto.randomUUID(), parentToolUseID: crypto.randomUUID(), data: { type, elapsedTimeSeconds: 12, taskId: 'task-1', output: '', fullOutput: '', totalLines: 0, totalBytes: 0 } })
      expect([...normalizeMessage(progress)]).toMatchObject([{ type: 'tool_progress', messageKind: 'system_event', tool_name: name, elapsed_time_seconds: 12, task_id: 'task-1' }])
      expect([...normalizeMessage(progress)]).toEqual([])
    }
  } finally {
    clock.mockRestore()
    if (previousRemote === undefined) delete process.env.CLAUDE_CODE_REMOTE
    else process.env.CLAUDE_CODE_REMOTE = previousRemote
  }
})

test('streamlined tool counts preserve provenance and reset when assistant text arrives', () => {
  const transform = createStreamlinedTransformer()
  const sdkAssistant = (message: ReturnType<typeof messages.createAssistantMessage>) => {
    const [sdk] = toSDKMessages([message])
    if (sdk?.type !== 'assistant') throw new Error('Expected assistant SDK envelope')
    return sdk
  }
  const tool = (name: string) => sdkAssistant({ ...messages.createAssistantMessage({ content: [{ type: 'tool_use', id: crypto.randomUUID(), name, input: {} }] }), messageKind: 'tool_exchange', isSynthetic: true })
  expect(transform(tool('Read'))).toMatchObject({ type: 'streamlined_tool_use_summary', messageKind: 'tool_exchange', isSynthetic: true, tool_summary: 'Read 1 file' })
  expect(transform(tool('Read'))).toMatchObject({ tool_summary: 'Read 2 files' })
  const text = sdkAssistant(messages.createAssistantMessage({ content: 'Done' }))
  expect(transform(text)).toMatchObject({ type: 'streamlined_text', messageKind: 'assistant_response', text: 'Done' })
  expect(transform(tool('Read'))).toMatchObject({ tool_summary: 'Read 1 file' })
})
