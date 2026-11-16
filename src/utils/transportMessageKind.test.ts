import { describe, expect, test } from 'bun:test'
import { normalizeMessage } from './queryHelpers.js'
import { createStreamlinedTransformer } from './streamlinedTransform.js'
import { toSDKMessages, localCommandOutputToSDKAssistantMessage } from './messages/mappers.js'

const assistant = (metadata: Record<string, unknown> = {}) => ({ type: 'assistant', uuid: '11111111-1111-4111-8111-111111111111', timestamp: '2026-11-10T00:00:00Z', message: { id: 'a', type: 'message', role: 'assistant', model: 'test', content: [{ type: 'text', text: 'response' }], usage: { input_tokens: 0, output_tokens: 0 }, stop_reason: 'end_turn' }, ...metadata }) as any

describe('SDK output envelope provenance', () => {
  test('stream-json and bridge emitters retain identity outside provider payload', () => {
    const source = assistant({ messageKind: 'internal_notification', isMeta: false, isSynthetic: true })
    for (const emitted of [...normalizeMessage(source), ...toSDKMessages([source])]) {
      expect(emitted).toMatchObject({ messageKind: 'internal_notification', isMeta: false, isSynthetic: true })
      expect((emitted as any).message).not.toHaveProperty('messageKind')
    }
  })
  test('streamlined transforms preserve provenance while distilling content', () => {
    const source = { ...toSDKMessages([assistant({ messageKind: 'internal_notification', isSynthetic: true })])[0] }
    expect(createStreamlinedTransformer()(source as any)).toMatchObject({ type: 'streamlined_text', text: 'response', messageKind: 'internal_notification', isSynthetic: true })
  })
  test('local command output stays a system event despite assistant transport role', () => {
    expect(localCommandOutputToSDKAssistantMessage('<local-command-stdout>cost</local-command-stdout>', '11111111-1111-4111-8111-111111111111')).toMatchObject({ type: 'assistant', messageKind: 'system_event' })
  })
})
