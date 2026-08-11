import { describe, expect, test } from 'bun:test'
import {
  initialWindowPresentationTarget,
  shouldCallBringToFront,
  shouldReassertMinimizedAfterAction,
  windowTargetAfterRun,
} from './presentationPolicy.js'

describe('Playwright presentation policy', () => {
  test('assistable background starts minimized and does not bring pages to front', () => {
    expect(initialWindowPresentationTarget('assistable_background')).toBe('minimized')
    expect(shouldCallBringToFront('assistable_background', 'minimized')).toBe(false)
    expect(shouldCallBringToFront('assistable_background', 'foreground')).toBe(true)
  })

  test('always-visible and ordinary browsers keep normal focus behavior', () => {
    expect(initialWindowPresentationTarget('always_visible')).toBe('foreground')
    expect(initialWindowPresentationTarget(undefined)).toBe('foreground')
    expect(shouldCallBringToFront('always_visible', 'minimized')).toBe(true)
    expect(shouldCallBringToFront(undefined, 'minimized')).toBe(true)
  })

  test('reasserts minimize after navigation-class actions only while background research is intended', () => {
    expect(shouldReassertMinimizedAfterAction('assistable_background', 'minimized', 'navigate')).toBe(true)
    expect(shouldReassertMinimizedAfterAction('assistable_background', 'minimized', 'new_tab')).toBe(true)
    expect(shouldReassertMinimizedAfterAction('assistable_background', 'minimized', 'extract')).toBe(false)
    expect(shouldReassertMinimizedAfterAction('assistable_background', 'foreground', 'navigate')).toBe(false)
    expect(shouldReassertMinimizedAfterAction('always_visible', 'minimized', 'navigate')).toBe(false)
  })

  test('keeps the window foreground only while a verification gate is pending', () => {
    expect(windowTargetAfterRun('assistable_background', true)).toBe('foreground')
    expect(windowTargetAfterRun('assistable_background', false)).toBe('minimized')
    expect(windowTargetAfterRun('always_visible', false)).toBeNull()
  })
})
