import { expect, test } from 'bun:test'
import { extractUserMessages } from './skillify.js'
import { createUserMessage } from '../../utils/messages.js'

test('skillify learns from actual human messages and keeps explicit identity authoritative', () => {
  expect(extractUserMessages([
    createUserMessage({ content: 'typed preference', messageKind: 'user_input', isMeta: true }),
    createUserMessage({ content: 'generated instruction', messageKind: 'internal_notification' }),
    createUserMessage({ content: 'summary', isCompactSummary: true }),
    createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'fixture', content: 'result' }, { type: 'text', text: 'tool context' }] }),
    { type: 'system', content: '/typed-command', messageKind: 'user_input' },
  ] as any)).toEqual(['typed preference', '/typed-command'])
})

test('skillify reads human queued envelopes without learning generated queue delivery text', async () => {
  const { createAttachmentMessage } = await import('../../utils/attachments.js')
  const human = { ...createAttachmentMessage({ type: 'queued_command', prompt: [{ type: 'text', text: 'Keep the summary concise' }] }), messageKind: 'user_input' as const }
  const generated = { ...createAttachmentMessage({ type: 'queued_command', prompt: 'Task completed' }), messageKind: 'internal_notification' as const }
  expect(extractUserMessages([human, generated])).toEqual(['Keep the summary concise'])
})
