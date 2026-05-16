import { describe, it, expect } from 'vitest'
import { formatCompact } from '../formatCompact'

describe('formatCompact', () => {
  it('returns string representation for numbers under 1000', () => {
    expect(formatCompact(0)).toBe('0')
    expect(formatCompact(1)).toBe('1')
    expect(formatCompact(999)).toBe('999')
  })

  it('formats thousands with k suffix', () => {
    expect(formatCompact(1000)).toBe('1k')
    expect(formatCompact(1200)).toBe('1.2k')
    expect(formatCompact(1234)).toBe('1.2k')
    expect(formatCompact(1500)).toBe('1.5k')
    expect(formatCompact(9999)).toBe('10k')
    expect(formatCompact(12345)).toBe('12.3k')
  })

  it('removes trailing .0 for whole thousands', () => {
    expect(formatCompact(2000)).toBe('2k')
    expect(formatCompact(10000)).toBe('10k')
    expect(formatCompact(15000)).toBe('15k')
  })

  it('handles large numbers', () => {
    expect(formatCompact(100000)).toBe('100k')
    expect(formatCompact(123456)).toBe('123.5k')
    expect(formatCompact(999999)).toBe('1000k')
  })

  it('handles negative numbers', () => {
    expect(formatCompact(-500)).toBe('-500')
    expect(formatCompact(-1500)).toBe('-1.5k')
  })

  it('handles decimal input', () => {
    expect(formatCompact(1234.56)).toBe('1.2k')
    expect(formatCompact(0.5)).toBe('0.5')
  })
})
