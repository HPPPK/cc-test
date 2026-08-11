import { describe, expect, test } from 'bun:test'
import { shouldSchedulePlaywrightIdleClose } from './verificationSessionPolicy.js'

describe('Playwright verification session policy', () => {
  test('does not schedule idle closure while a human verification page is waiting', () => {
    expect(shouldSchedulePlaywrightIdleClose(true)).toBe(false)
  })

  test('returns to ordinary idle cleanup once verification is resolved', () => {
    expect(shouldSchedulePlaywrightIdleClose(false)).toBe(true)
  })
})
