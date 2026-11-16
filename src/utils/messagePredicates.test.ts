import { expect, test } from 'bun:test'
import { isHumanTurn } from './messagePredicates.js'

test('human-turn predicate agrees on legacy summaries, tool results and explicit human pastes', () => {
  const message = { type: 'user', message: { role: 'user', content: 'text' } }
  expect(isHumanTurn({ ...message, isCompactSummary: true } as any)).toBe(false)
  expect(isHumanTurn({ ...message, toolUseResult: 'legacy tool result' } as any)).toBe(false)
  expect(isHumanTurn({ ...message, messageKind: 'internal_notification' } as any)).toBe(false)
  expect(isHumanTurn({ ...message, messageKind: 'user_input', isMeta: true } as any)).toBe(true)
})
