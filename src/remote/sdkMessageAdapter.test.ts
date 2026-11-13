import { describe, expect, test } from 'bun:test'
import { convertSDKMessage } from './sdkMessageAdapter.js'
import { createSyntheticAssistantMessage } from './remotePermissionBridge.js'

const user = (metadata: Record<string, unknown> = {}) => ({ type: 'user', message: { role: 'user', content: 'This session is being continued from a previous conversation.' }, uuid: '11111111-1111-4111-8111-111111111111', parent_tool_use_id: null, ...metadata }) as any

describe('remote message provenance', () => {
  test('keeps explicit human provenance even with legacy flags and summary-like wording', () => {
    expect(convertSDKMessage(user({ messageKind: 'user_input', isCompactSummary: true, isSynthetic: false }), { convertUserTextMessages: true })).toMatchObject({ type: 'message', message: { messageKind: 'user_input', isCompactSummary: true, isSynthetic: false } })
  })
  test('restores top-level tool results without mistaking them for human input', () => {
    expect(convertSDKMessage(user({ message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'done' }] } }), { convertToolResults: true })).toMatchObject({ type: 'message', message: { messageKind: 'tool_exchange' } })
  })
  test('remote permission requests are tool exchanges', () => {
    expect(createSyntheticAssistantMessage({ tool_name: 'Read', tool_use_id: 't', input: {} } as any, 'r')).toMatchObject({ messageKind: 'tool_exchange' })
  })
  test('keeps synthetic assistant notices and compact boundaries distinct', () => {
    expect(convertSDKMessage({ type: 'assistant', uuid: 'a', messageKind: 'internal_notification', isSynthetic: true, message: { role: 'assistant', content: [] } } as any)).toMatchObject({ type: 'message', message: { messageKind: 'internal_notification', isSynthetic: true } })
    expect(convertSDKMessage({ type: 'system', subtype: 'compact_boundary', uuid: 'c', compact_metadata: { trigger: 'auto', pre_tokens: 20 } } as any)).toMatchObject({ type: 'message', message: { messageKind: 'context_summary' } })
  })
})

test('normalizes malformed remote assistant IDs before transcript insertion', () => {
  const converted = convertSDKMessage({ type: 'assistant', uuid: 'not-a-uuid', session_id: 'session', parent_tool_use_id: null, message: { role: 'assistant', content: [] } } as any)
  expect(converted.type).toBe('message')
  if (converted.type === 'message') {
    expect(converted.message.uuid).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
    expect(converted.message.uuid).not.toBe('not-a-uuid')
  }
})

test('preserves valid remote message identity and normalizes invalid user identity', () => {
  const valid = '11111111-1111-4111-8111-111111111111'
  const preserved = convertSDKMessage(user(), { convertUserTextMessages: true })
  expect(preserved).toMatchObject({ type: 'message', message: { uuid: valid } })
  const normalized = convertSDKMessage(user({ uuid: 'remote-message-1' }), { convertUserTextMessages: true })
  expect(normalized.type).toBe('message')
  if (normalized.type === 'message') expect(normalized.message.uuid).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
})
