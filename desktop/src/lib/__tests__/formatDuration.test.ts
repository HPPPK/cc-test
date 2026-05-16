import { describe, it, expect } from 'vitest'
import { formatDuration } from '../formatDuration'

describe('formatDuration', () => {
  it('returns "--" for negative values', () => {
    expect(formatDuration(-1000)).toBe('--')
  })

  it('returns "--" for NaN', () => {
    expect(formatDuration(NaN)).toBe('--')
  })

  it('returns "--" for Infinity', () => {
    expect(formatDuration(Infinity)).toBe('--')
  })

  it('formats seconds only for durations under a minute', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(500)).toBe('0s')
    expect(formatDuration(1000)).toBe('1s')
    expect(formatDuration(30000)).toBe('30s')
    expect(formatDuration(59000)).toBe('59s')
  })

  it('formats minutes and seconds for durations under an hour', () => {
    expect(formatDuration(60000)).toBe('1m 0s')
    expect(formatDuration(90000)).toBe('1m 30s')
    expect(formatDuration(330000)).toBe('5m 30s')
    expect(formatDuration(3599000)).toBe('59m 59s')
  })

  it('formats hours and minutes for durations over an hour', () => {
    expect(formatDuration(3600000)).toBe('1h 0m')
    expect(formatDuration(4800000)).toBe('1h 20m')
    expect(formatDuration(7200000)).toBe('2h 0m')
    expect(formatDuration(3720000)).toBe('1h 2m')
  })

  it('caps at two units (hours and minutes)', () => {
    // 1h 30m 45s -> should show 1h 30m
    expect(formatDuration(5445000)).toBe('1h 30m')
  })
})
