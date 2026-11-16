import { expect, test } from 'bun:test'
import { connectInkDevtools, isInkDevtoolsAvailable } from './devtools.js'

test('missing Ink developer tools do not claim a working connection', () => {
  expect(isInkDevtoolsAvailable()).toBe(false)
  expect(() => connectInkDevtools()).toThrow('unavailable')
})
