import { describe, expect, it, vi } from 'vitest'
import { buildExpertOutputDirectory, createPlaceholderExpertRun } from './experts'

describe('generic expert package helpers', () => {
  it('builds the standard expert output directory without an expert-specific branch', () => {
    expect(buildExpertOutputDirectory('C:/repo', 'run-1', 'custom-expert')).toBe('C:/repo/.workflow/intake/expert-runs/run-1/custom-expert')
  })

  it('creates a generic placeholder run for any ZIP-defined expert', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.123456)
    const run = createPlaceholderExpertRun('custom-expert', new Date('2026-07-07T12:34:56.789Z'))
    expect(run.expertId).toBe('custom-expert')
    expect(run.materialFiles).toContain('material.json')
    vi.restoreAllMocks()
  })
})
