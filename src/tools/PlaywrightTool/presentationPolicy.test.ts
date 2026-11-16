import { describe, expect, test } from 'bun:test'
import { initialWindowPresentationTarget, managedPresentationLaunchArgs, consumePresentationRequest } from './presentationPolicy.js'

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


describe('explicit browser-open request consumption', () => {
  test('consumes one click once across sibling and recreated browser sessions, then permits a new click', () => {
    const consumed = new Map<string, number>()
    const control = { endpoint: 'http://127.0.0.1/control', sessionId: 'expert', browserKey: 'shared-browser' }
    expect(consumePresentationRequest(consumed, control, 1)).toBe(true)
    expect(consumePresentationRequest(consumed, { ...control }, 1)).toBe(false)
    expect(consumePresentationRequest(consumed, { ...control }, 0)).toBe(false)
    expect(consumePresentationRequest(consumed, { ...control }, 2)).toBe(true)
    expect(consumePresentationRequest(consumed, control, 1)).toBe(false)
  })

  test('keeps independent browser controls independent and rejects invalid generations', () => {
    const consumed = new Map<string, number>()
    const control = { endpoint: 'http://127.0.0.1/control', sessionId: 'expert' }
    for (const value of [0, -1, NaN, Infinity, 1.5]) expect(consumePresentationRequest(consumed, control, value)).toBe(false)
    expect(consumePresentationRequest(consumed, control, 1)).toBe(true)
    expect(consumePresentationRequest(consumed, { ...control, browserKey: 'other' }, 1)).toBe(true)
    expect(consumePresentationRequest(consumed, { ...control, sessionId: 'other' }, 1)).toBe(true)
    expect(consumePresentationRequest(consumed, { ...control, endpoint: 'http://127.0.0.1/other' }, 1)).toBe(true)
  })
})
