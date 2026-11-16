import { expect, test } from 'bun:test'
import { createUserMessage, createAssistantMessage, createCommandInputMessage, createCompactBoundaryMessage, normalizeMessages } from './messages.js'
import { userMessageToMessageParam, assistantMessageToMessageParam } from '../services/api/claude.js'

test('constructors and assistant block normalization retain provenance on envelopes only', () => {
  const summary = createUserMessage({ content: 'summary', isCompactSummary: true, isVisibleInTranscriptOnly: true })
  expect(summary.messageKind).toBe('context_summary')
  const human = createUserMessage({ content: 'This session is being continued', messageKind: 'user_input' })
  expect(human.messageKind).toBe('user_input')
  expect(createCommandInputMessage('stdout').messageKind).toBe('system_event')
  expect(createCompactBoundaryMessage('auto', 100).messageKind).toBe('context_summary')
  const response = { ...createAssistantMessage({ content: [{ type: 'text', text: 'one', citations: null }, { type: 'text', text: 'two', citations: null }] }), messageKind: 'system_event', isSynthetic: true }
  expect(normalizeMessages([response] as any).every(message => message.messageKind === 'system_event' && message.isSynthetic === true)).toBe(true)
  const userPayload = userMessageToMessageParam(human, false, false)
  const assistantPayload = assistantMessageToMessageParam(response as any, false, false)
  expect(Object.keys(userPayload).sort()).toEqual(['content', 'role'])
  expect(Object.keys(assistantPayload).sort()).toEqual(['content', 'role'])
  expect(JSON.stringify([userPayload, assistantPayload])).not.toContain('messageKind')
})

test('runtime-created user-role prompts never impersonate human input, but real tool results retain their protocol kind', async () => {
  const { createRuntimeUserMessage } = await import('./messages.js')
  expect(createRuntimeUserMessage({ content: 'Continue internal workflow' }).messageKind).toBe('internal_notification')
  expect(createRuntimeUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'fixture', content: 'result' }] }).messageKind).toBe('tool_exchange')
  expect(createRuntimeUserMessage({ content: 'summary', isCompactSummary: true }).messageKind).toBe('context_summary')
})

test('generated interruption and model-switch breadcrumbs cannot become human turns', async () => {
  const { createUserInterruptionMessage, createModelSwitchBreadcrumbs } = await import('./messages.js')
  expect(createUserInterruptionMessage({}).messageKind).toBe('internal_notification')
  expect(createModelSwitchBreadcrumbs('fixture', 'Fixture').every(message => message.messageKind !== 'user_input')).toBe(true)
})

test('splitting multimodal history and draining queued input preserve explicit and legacy kinds', async () => {
  const { normalizeAttachmentForAPI } = await import('./messages.js')
  const source = createUserMessage({ content: [{ type: 'text', text: 'one' }, { type: 'text', text: 'two' }], messageKind: 'context_summary', isCompactSummary: true, isSynthetic: true })
  expect(normalizeMessages([source] as any).every(message => message.messageKind === 'context_summary' && message.isCompactSummary && message.isSynthetic)).toBe(true)
  for (const prompt of ['typed text', [{ type: 'text', text: 'typed text' }]]) {
    const rows = normalizeAttachmentForAPI({ type: 'queued_command', prompt, messageKind: 'user_input', isSynthetic: true, origin: { kind: 'task-notification' } } as any)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ messageKind: 'user_input', isSynthetic: true })
  }
})

test('cancellation tool-result content never carries envelope-only provenance', async () => {
  const { createToolResultStopMessage } = await import('./messages.js')
  expect(createToolResultStopMessage('fixture')).not.toHaveProperty('messageKind')
})

test('resume whitespace cleanup never merges human input into a summary envelope', async () => {
  const { filterWhitespaceOnlyAssistantMessages } = await import('./messages.js')
  const summary = createUserMessage({ content: 'summary', isCompactSummary: true })
  const blank = createAssistantMessage({ content: '  ' })
  const human = createUserMessage({ content: 'actual human' })
  const rows = filterWhitespaceOnlyAssistantMessages([summary, blank, human])
  expect(rows.map(message => message.messageKind)).toEqual(['context_summary', 'user_input'])
})
