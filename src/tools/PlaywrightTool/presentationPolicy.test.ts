import { describe, expect, test } from 'bun:test'
import { initialWindowPresentationTarget, managedPresentationLaunchArgs } from './presentationPolicy.js'

describe('Playwright presentation policy', () => {
  test('assistable background starts minimized exactly once through launch policy', () => {
    expect(initialWindowPresentationTarget('assistable_background')).toBe('minimized')
    expect(managedPresentationLaunchArgs('assistable_background')).toEqual([
      '--start-minimized',
      '--window-position=-32000,-32000',
      '--window-size=1,1',
    ])
  })

  test('always-visible and unspecified sessions do not receive background launch arguments', () => {
    expect(initialWindowPresentationTarget('always_visible')).toBe('foreground')
    expect(managedPresentationLaunchArgs('always_visible')).toEqual([])
    expect(managedPresentationLaunchArgs(undefined)).toEqual([])
  })
})
