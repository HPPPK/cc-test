import { expect, test } from 'bun:test'
import { MemoryUsageIndicator } from './MemoryUsageIndicator.js'

test('external builds hide the internal memory indicator without starting a polling hook', () => {
  // Calling outside a React render would throw if the disabled branch invoked hooks.
  expect(MemoryUsageIndicator()).toBeNull()
})
