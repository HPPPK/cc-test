import { expect, test } from 'bun:test'
import { requireSessionValue } from './main.contracts.js'

test('resume/session boundaries preserve present values and reject missing results', () => {
  const result = { messages: [], fullPath: '/fixture/session.jsonl' }
  expect(requireSessionValue(result, 'missing')).toBe(result)
  expect(() => requireSessionValue(null, 'Conversation could not be loaded')).toThrow('Conversation could not be loaded')
  expect(() => requireSessionValue(undefined, 'Session ID unavailable')).toThrow('Session ID unavailable')
})
