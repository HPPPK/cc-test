import { expect, test } from 'bun:test'
import { readOptionalUrlEvent } from './protocolHandler.js'

test('optional URL event reader ignores absent and malformed modules without launching a terminal', async () => {
  expect(await readOptionalUrlEvent(async () => { throw new Error('missing') })).toBeNull()
  expect(await readOptionalUrlEvent(async () => ({ waitForUrlEvent: true }))).toBeNull()
  expect(await readOptionalUrlEvent(async () => ({ waitForUrlEvent: () => 7 }))).toBeNull()
  expect(await readOptionalUrlEvent(async () => ({ waitForUrlEvent: () => 'claude-cli://prompt?q=fixture' }))).toBe('claude-cli://prompt?q=fixture')
})
