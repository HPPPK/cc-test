import { describe, expect, test } from 'bun:test'
import { messagesAfterAreOnlySynthetic, selectableUserMessagesFilter } from './MessageSelector.js'
import { isNavigableMessage } from './messageActions.js'

const user = (metadata: Record<string, unknown> = {}, text = 'human prompt') => ({ type: 'user', uuid: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, ...metadata }) as any

describe('TUI identity selectors', () => {
  test('rewind does not treat context summaries or internal notices as human followups', () => {
    expect(messagesAfterAreOnlySynthetic([user(), user({ messageKind: 'context_summary' })], 0)).toBe(true)
    expect(messagesAfterAreOnlySynthetic([user(), user({ messageKind: 'internal_notification' })], 0)).toBe(true)
  })
  test('explicit human input remains meaningful even when quoting interruption text or old flags', () => {
    const quoted = user({ messageKind: 'user_input', isMeta: true }, '[Request interrupted by user]')
    expect(selectableUserMessagesFilter(quoted)).toBe(true)
    expect(isNavigableMessage(quoted)).toBe(true)
    expect(messagesAfterAreOnlySynthetic([user(), quoted], 0)).toBe(false)
  })
  test('user selector remains a sound type guard even with inconsistent external role metadata', () => {
    expect(selectableUserMessagesFilter({ ...user({ messageKind: 'user_input' }), type: 'assistant' })).toBe(false)
  })
  test('assistant internal notices are not navigation targets', () => {
    expect(isNavigableMessage({ ...user({ messageKind: 'internal_notification' }), type: 'assistant' })).toBe(false)
  })
})
