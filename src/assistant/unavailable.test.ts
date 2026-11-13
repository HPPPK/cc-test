import { expect, test } from 'bun:test'
import { isAssistantMode, isAssistantForced, initializeAssistantTeam, markAssistantForced } from './index.js'
import { isKairosEnabled } from './gate.js'
import { discoverAssistantSessions } from './sessionDiscovery.js'

test('assistant capability stays disabled and activation is rejected', async () => {
  expect(isAssistantMode()).toBe(false)
  expect(isAssistantForced()).toBe(false)
  expect(await isKairosEnabled()).toBe(false)
  for (const operation of [initializeAssistantTeam, markAssistantForced, discoverAssistantSessions]) expect(operation).toThrow('assistant is unavailable in this build')
})
