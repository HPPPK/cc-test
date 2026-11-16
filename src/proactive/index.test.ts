import { expect, test } from 'bun:test'
import { activateProactive, deactivateProactive, pauseProactive, resumeProactive, setContextBlocked, subscribeToProactiveChanges, isProactiveActive, isProactivePaused, getNextTickAt, UnsupportedFeatureError } from './index.js'

test('public build reports proactive capability inactive with no scheduled tick', () => {
  expect(isProactiveActive()).toBe(false)
  expect(isProactivePaused()).toBe(false)
  expect(getNextTickAt()).toBeNull()
})
test('unavailable proactive operations reject explicitly and cannot enable state', () => {
  for (const operation of [() => activateProactive('command'), deactivateProactive, pauseProactive, resumeProactive, () => setContextBlocked(true), () => subscribeToProactiveChanges(() => {})]) {
    expect(operation).toThrow(UnsupportedFeatureError)
    expect(operation).toThrow('Proactive mode is unavailable in this build')
    expect(isProactiveActive()).toBe(false)
  }
})
