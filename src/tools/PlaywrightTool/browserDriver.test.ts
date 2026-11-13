import { describe, expect, test } from 'bun:test'
import { selectManagedChromium, loadManagedChromium } from './browserDriver.js'

describe('managed research Chromium driver', () => {
  const drivers = { playwright: { name: 'original' }, patchright: { name: 'candidate' } }
  test('uses the validated candidate by default', () => {
    expect(selectManagedChromium(drivers, {})).toBe(drivers.patchright)
  })
  test('supports explicit process-level rollback without changing saved user configuration', () => {
    expect(selectManagedChromium(drivers, { CC_JIANGXIA_BROWSER_DRIVER: 'playwright' })).toBe(drivers.playwright)
    expect(selectManagedChromium(drivers, { CC_JIANGXIA_BROWSER_DRIVER: 'patchright' })).toBe(drivers.patchright)
  })
  test('rejects misspelled overrides instead of silently switching drivers', () => {
    expect(() => selectManagedChromium(drivers, { CC_JIANGXIA_BROWSER_DRIVER: 'unknown' })).toThrow('CC_JIANGXIA_BROWSER_DRIVER')
  })
})

test('rollback loads the original driver without importing the candidate', async () => {
  const original = { name: 'original-only' } as any
  expect(await loadManagedChromium(original, { CC_JIANGXIA_BROWSER_DRIVER: 'playwright' })).toBe(original)
})

test('loads the pinned candidate for the managed default', async () => {
  const original = { name: 'unused-original' } as any
  expect(await loadManagedChromium(original, {})).toBe((await import('patchright')).chromium)
})
