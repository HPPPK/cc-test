import { expect, spyOn, test } from 'bun:test'
import { pickQuip } from './observer.js'
import { createAssistantMessage, createUserMessage, createSystemMessage } from '../utils/messages.js'

test('companion observes assistant envelope text and ignores later user/system events', () => {
  const random = spyOn(Math, 'random').mockReturnValue(0)
  try {
    expect(pickQuip([createAssistantMessage({ content: 'Fixed a bug' }), createUserMessage({ content: 'hello' }), createSystemMessage('event', 'info')])).toBe('Found it!')
    expect(pickQuip([createUserMessage({ content: 'bug' })])).toBeUndefined()
  } finally { random.mockRestore() }
})
