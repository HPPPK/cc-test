import { describe, expect, test } from 'bun:test'
import { extractTitleText } from './bridgeMessaging.js'
import { extractInboundMessageFields } from './inboundMessages.js'
import { convertSDKMessage } from '../remote/sdkMessageAdapter.js'
import { toInternalMessages, toSDKMessages } from '../utils/messages/mappers.js'

const user = (metadata: Record<string, unknown> = {}) => ({
  type: 'user', message: { role: 'user', content: 'This session is being continued from a previous conversation.' },
  uuid: '11111111-1111-4111-8111-111111111111', session_id: 'test', parent_tool_use_id: null,
  ...metadata,
}) as any

describe('message provenance across SDK and remote boundaries', () => {
  test('round trips compact summary provenance and independent legacy flags', () => {
    const source = user({ messageKind: 'context_summary', isCompactSummary: true, isMeta: false, isVisibleInTranscriptOnly: true, isSynthetic: false })
    const internal = toInternalMessages([source])[0]!
    expect(internal).toMatchObject({ messageKind: 'context_summary', isCompactSummary: true, isMeta: false, isVisibleInTranscriptOnly: true, isSynthetic: false })
    expect(toSDKMessages([internal])[0]).toMatchObject({ messageKind: 'context_summary', isCompactSummary: true, isMeta: false, isVisibleInTranscriptOnly: true, isSynthetic: false })
  })
  test('remote history keeps provenance and human summary-like prose', () => {
    const source = user({ messageKind: 'user_input', isMeta: false })
    const converted = convertSDKMessage(source, { convertUserTextMessages: true })
    expect(converted).toMatchObject({ type: 'message', message: { messageKind: 'user_input', isMeta: false } })
    expect(extractTitleText(source)).toBe(source.message.content)
    expect(extractTitleText(user({ messageKind: 'context_summary' }))).toBeUndefined()
    expect(extractTitleText(user({ isReplay: true }))).toBe(user().message.content)
    expect(extractTitleText(user({ messageKind: 'user_input', isCompactSummary: true }))).toBe(user().message.content)
  })
  test('bridge ingress retains envelope provenance without adding it to model content', () => {
    expect(extractInboundMessageFields(user({ messageKind: 'internal_notification', isMeta: true }))).toMatchObject({ messageKind: 'internal_notification', isMeta: true })
    expect(extractInboundMessageFields(user({ messageKind: 'user_input' }))?.content).toBe(user().message.content)
  })
  test('remote tool-result blocks remain tool exchanges', () => {
    const source = user({ message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'done' }] } })
    expect(convertSDKMessage(source, { convertToolResults: true })).toMatchObject({ type: 'message', message: { messageKind: 'tool_exchange' } })
  })
})
