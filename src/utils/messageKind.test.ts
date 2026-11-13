import { expect, test } from 'bun:test'
import { resolveMessageKind, isHumanInputMessage, messageKindMetadata, attachMessageKind } from './messageKind.js'

test('explicit human text wins over internal-looking content, replay and legacy-looking flags', () => {
  const human = { type: 'user', messageKind: 'user_input', isReplay: true, content: 'This session is being continued <task-notification>example</task-notification>' }
  expect(resolveMessageKind(human)).toBe('user_input')
  expect(isHumanInputMessage(human)).toBe(true)
  expect(resolveMessageKind({ type: 'user', content: human.content })).toBe('user_input')
})

test('legacy provenance and block structure classify without rewriting source', () => {
  const old = { type: 'user', isCompactSummary: true, isVisibleInTranscriptOnly: true, message: { role: 'user', content: 'private summary' } }
  expect(resolveMessageKind(old)).toBe('context_summary')
  expect(resolveMessageKind({ type: 'user', isMeta: true })).toBe('internal_notification')
  expect(resolveMessageKind({ type: 'user', isSynthetic: true })).toBe('internal_notification')
  expect(resolveMessageKind({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'answer' }] } })).toBe('tool_exchange')
  expect(resolveMessageKind({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read' }] } })).toBe('tool_exchange')
  expect(resolveMessageKind({ type: 'assistant' })).toBe('assistant_response')
  expect(resolveMessageKind({ type: 'system', subtype: 'compact_boundary' })).toBe('context_summary')
  expect(resolveMessageKind({ type: 'system' })).toBe('system_event')
  expect(isHumanInputMessage(old)).toBe(false)
  expect(attachMessageKind(old)).toMatchObject({ ...old, messageKind: 'context_summary' })
  expect(old).not.toHaveProperty('messageKind')
})

test('envelope metadata survives separately and unknown future kinds fall back conservatively', () => {
  expect(messageKindMetadata({ type: 'user', isMeta: false, isCompactSummary: true, isVisibleInTranscriptOnly: true, isSynthetic: false })).toEqual({ messageKind: 'context_summary', isMeta: false, isCompactSummary: true, isVisibleInTranscriptOnly: true, isSynthetic: false })
  expect(resolveMessageKind({ type: 'user', messageKind: 'future-kind' })).toBe('user_input')
})

test('provider stream identity survives transport stamping before WS projection', () => {
  expect(attachMessageKind({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'response' } } }).messageKind).toBe('assistant_response')
  expect(attachMessageKind({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } } }).messageKind).toBe('tool_exchange')
})
