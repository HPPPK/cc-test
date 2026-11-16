import { expect, test } from 'bun:test'
import { copyTextOf, isNavigableMessage } from '../messageActions.js'
import { isNullRenderingAttachment } from './nullRenderingAttachments.js'
import { createAttachmentMessage } from '../../utils/attachments.js'
import { createUserMessage, createSystemMessage, createMemorySavedMessage, normalizeMessages } from '../../utils/messages.js'

test('model-only attachment deltas do not consume visible message slots', () => {
  expect(isNullRenderingAttachment(createAttachmentMessage({ type: 'agent_listing_delta', addedTypes: [], addedLines: [], removedTypes: [], isInitial: true, showConcurrencyNote: false }))).toBe(true)
  expect(isNullRenderingAttachment(createAttachmentMessage({ type: 'bagel_console', errorCount: 0, warningCount: 1, sample: 'fixture' }))).toBe(true)
})

test('navigation and copying narrow display envelopes and tolerate content-free statuses', () => {
  const [human] = normalizeMessages([createUserMessage({ content: 'actual prompt' })])
  expect(isNavigableMessage(human!)).toBe(true)
  expect(copyTextOf(human!)).toBe('actual prompt')
  const memory = createMemorySavedMessage([])
  expect(isNavigableMessage(memory)).toBe(false)
  expect(copyTextOf(memory)).toBe('memory_saved')
  expect(copyTextOf(createSystemMessage('saved status', 'info'))).toBe('saved status')
})
