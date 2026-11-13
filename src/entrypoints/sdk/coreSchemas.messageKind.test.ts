import { describe, expect, test } from 'bun:test'
import { SDKUserMessageSchema, SDKUserMessageReplaySchema, SDKAssistantMessageSchema, SDKCompactBoundaryMessageSchema } from './coreSchemas.js'

const metadata = { messageKind: 'context_summary', isMeta: false, isCompactSummary: true, isVisibleInTranscriptOnly: false, isSynthetic: true }
const envelope = { uuid: '11111111-1111-4111-8111-111111111111', session_id: 'session', parent_tool_use_id: null }

describe('SDK provenance envelope compatibility', () => {
  test('user and replay schemas retain independent metadata, and accept older clients', () => {
    const user = { ...envelope, type: 'user', message: { role: 'user', content: 'hello' } }
    expect(SDKUserMessageSchema().parse({ ...user, ...metadata })).toMatchObject(metadata)
    expect(SDKUserMessageReplaySchema().parse({ ...user, ...metadata, isReplay: true })).toMatchObject(metadata)
    expect(SDKUserMessageSchema().parse(user)).not.toHaveProperty('messageKind')
  })
  test('assistant and system envelopes preserve identity without injecting provider payload metadata', () => {
    const assistant = { ...envelope, type: 'assistant', message: { role: 'assistant', content: [] }, ...metadata }
    const parsed = SDKAssistantMessageSchema().parse(assistant)
    expect(parsed).toMatchObject(metadata)
    expect(parsed.message).not.toHaveProperty('messageKind')
    const boundary = { ...envelope, type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'auto', pre_tokens: 20 }, messageKind: 'system_event' }
    expect(SDKCompactBoundaryMessageSchema().parse(boundary)).toMatchObject({ messageKind: 'system_event' })
  })
  test('unknown identity cannot become a trusted identity through schema validation', () => {
    expect(SDKUserMessageSchema().safeParse({ ...envelope, type: 'user', message: { role: 'user', content: 'x' }, messageKind: 'made_up' }).success).toBe(false)
  })
})
