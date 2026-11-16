import { describe, expect, test } from 'bun:test'
import { processTextPrompt } from './processTextPrompt.js'

describe('processTextPrompt provenance', () => {
  test('marks genuine human text and pasted-image input explicitly', () => {
    for (const images of [[], [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } }]] as const) {
      const result = processTextPrompt('Task completed: human quotation', [...images] as any, [], [], 'human-id')
      expect(result.messages[0]).toMatchObject({ uuid: 'human-id', messageKind: 'user_input' })
    }
  })

  test('retains explicit runtime provenance and independent legacy flags for both content shapes', () => {
    for (const input of ['background event', [{ type: 'text', text: 'background event' }]] as const) {
      const result = processTextPrompt(input as any, [], [], [], undefined, undefined, false, {
        messageKind: 'system_event', isSynthetic: true, isVisibleInTranscriptOnly: true,
      })
      expect(result.messages[0]).toMatchObject({
        messageKind: 'system_event', isSynthetic: true, isVisibleInTranscriptOnly: true,
      })
    }
  })

  test('honors explicit user provenance even when isMeta is independently present', () => {
    const result = processTextPrompt('typed command', [], [], [], undefined, undefined, true, { messageKind: 'user_input' })
    expect(result.messages[0]).toMatchObject({ messageKind: 'user_input', isMeta: true })
  })

  test('classifies legacy hidden prompts as internal notifications', () => {
    const result = processTextPrompt('scheduled task', [], [], [], undefined, undefined, true)
    expect(result.messages[0]).toMatchObject({ messageKind: 'internal_notification', isMeta: true })
  })
})
