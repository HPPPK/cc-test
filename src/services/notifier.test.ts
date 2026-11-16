import { expect, test } from 'bun:test'
import { isTerminalProfileBellDisabled } from './notifier.js'

test('Terminal profile detection requires an explicitly disabled bell in a valid profile object', () => {
  expect(isTerminalProfileBellDisabled({ 'Window Settings': { Basic: { Bell: false } } }, 'Basic')).toBe(true)
  for (const value of [null, [], 'invalid', {}, { 'Window Settings': null }, { 'Window Settings': [] }, { 'Window Settings': { Basic: false } }, { 'Window Settings': { Basic: { Bell: 'false' } } }]) expect(isTerminalProfileBellDisabled(value, 'Basic')).toBe(false)
  expect(isTerminalProfileBellDisabled({ 'Window Settings': { Basic: { Bell: false } } }, 'Other')).toBe(false)
})
