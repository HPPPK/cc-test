import { expect, test } from 'bun:test'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { Attachment } from './attachments.js'
import type { QueuedCommand } from '../types/textInputTypes.js'
import { extractAtMentionedFiles, getQueuedCommandAttachments } from './attachments.js'
import { normalizeAttachmentForAPI, normalizeMessages, createAssistantMessage, createUserMessage } from './messages.js'

test('queued attachment contracts preserve provenance independently of transport and content shape', async () => {
  const contents: Array<string | ContentBlockParam[]> = ['quoted text', [{ type: 'text', text: 'quoted text' }]]
  for (const value of contents) {
    const command: QueuedCommand = { mode: 'prompt', value, messageKind: 'user_input', isSynthetic: true, isCompactSummary: false, origin: { kind: 'task-notification' } }
    const attachments = await getQueuedCommandAttachments([command])
    expect(attachments).toHaveLength(1)
    const attachment = attachments[0]!
    expect(attachment.type).toBe('queued_command')
    const rows = normalizeAttachmentForAPI(attachment)
    expect(rows[0]).toMatchObject({ messageKind: 'user_input', isSynthetic: true, isCompactSummary: false })
    expect(rows[0]?.type).toBe('user')
  }
})

test('legacy generated queued attachment remains an internal notification', () => {
  const legacy: Attachment = { type: 'queued_command', prompt: 'legacy', commandMode: 'task-notification' }
  expect(normalizeAttachmentForAPI(legacy)[0]).toMatchObject({ type: 'user', messageKind: 'internal_notification' })
})

test('normalization narrows mixed assistant and user envelopes without losing roles', () => {
  const normalized = normalizeMessages([createAssistantMessage({ content: 'answer' }), createUserMessage({ content: 'input' })])
  expect(normalized.map(value => value.message.role)).toEqual(['assistant', 'user'])
})

test('mention extraction handles no matches, quoted paths and agent mentions', () => {
  expect(extractAtMentionedFiles('no mentions')).toEqual([])
  expect(extractAtMentionedFiles('read @src/index.ts and @"folder/a b.ts" and @"Reviewer (agent)"')).toEqual(['folder/a b.ts', 'src/index.ts'])
})
