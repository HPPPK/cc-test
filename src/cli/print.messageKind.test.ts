import { describe, expect, test } from 'bun:test'
import { canBatchWith } from './print.js'
import type { QueuedCommand } from '../types/textInputTypes.js'

const prompt = (metadata: Partial<QueuedCommand> = {}): QueuedCommand => ({ mode: 'prompt', value: 'continue', ...metadata })

describe('CLI prompt provenance batching', () => {
  test('never coalesces human prompts with internal context or notifications', () => {
    expect(canBatchWith(prompt({ messageKind: 'user_input' }), prompt({ messageKind: 'context_summary' }))).toBe(false)
    expect(canBatchWith(prompt(), prompt({ isMeta: true }))).toBe(false)
    expect(canBatchWith(prompt(), prompt({ messageKind: 'user_input' }))).toBe(true)
    expect(canBatchWith(prompt({ messageKind: 'user_input' }), prompt({ messageKind: 'user_input' }))).toBe(true)
  })
  test('retains independent legacy flags rather than overwriting them with the batch head', () => {
    expect(canBatchWith(prompt({ messageKind: 'user_input', isSynthetic: false }), prompt({ messageKind: 'user_input', isSynthetic: true }))).toBe(false)
    expect(canBatchWith(prompt({ isCompactSummary: true }), prompt({ messageKind: 'context_summary' }))).toBe(false)
  })
})
