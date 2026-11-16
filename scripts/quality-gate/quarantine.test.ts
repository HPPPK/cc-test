import { describe, expect, test } from 'bun:test'
import { expiredQuarantineEntries, loadQuarantineManifest, quarantinedPathSet, renderQuarantineSummary, validateQuarantineManifest } from './quarantine'

describe('quarantine manifest', () => {
  test('loads the default manifest', () => {
    const manifest = loadQuarantineManifest()
    expect(Array.isArray(manifest.quarantined)).toBe(true)
  })

  test('default manifest review dates are still active', () => {
    validateQuarantineManifest(loadQuarantineManifest(), { enforceReviewDate: true })
  })

  test('an empty reviewed manifest is valid and excludes no tests', () => {
    const manifest = { quarantined: [] }
    validateQuarantineManifest(manifest, { enforceReviewDate: true })
    expect(quarantinedPathSet(manifest).size).toBe(0)
    expect(renderQuarantineSummary(manifest)).toContain('Entries: 0')
  })

  test('exposes only declared quarantined paths as a set', () => {
    const paths = quarantinedPathSet({ quarantined: [{ id: 'fixture', path: 'fixture.test.ts', owner: 'maintainers', reason: 'fixture', reviewAfter: '2099-01-01', exitCriteria: 'pass deterministic suite' }] })
    expect([...paths]).toEqual(['fixture.test.ts'])
    expect(paths.has('src/server/__tests__/providers-real.test.ts')).toBe(false)
  })

  test('rejects duplicate ids', () => {
    expect(() => validateQuarantineManifest({
      quarantined: [
        {
          id: 'duplicate',
          path: 'a.test.ts',
          reason: 'test',
          owner: 'maintainers',
          reviewAfter: '2026-06-01',
          exitCriteria: 'make deterministic',
        },
        {
          id: 'duplicate',
          path: 'b.test.ts',
          reason: 'test',
          owner: 'maintainers',
          reviewAfter: '2026-06-01',
          exitCriteria: 'make deterministic',
        },
      ],
    })).toThrow('duplicate quarantine id')
  })

  test('requires exit criteria and valid review dates', () => {
    expect(() => validateQuarantineManifest({
      quarantined: [
        {
          id: 'missing-exit',
          path: 'a.test.ts',
          reason: 'test',
          owner: 'maintainers',
          reviewAfter: '2026-06-01',
          exitCriteria: '',
        },
      ],
    })).toThrow('invalid quarantine entry')

    expect(() => validateQuarantineManifest({
      quarantined: [
        {
          id: 'bad-date',
          path: 'a.test.ts',
          reason: 'test',
          owner: 'maintainers',
          reviewAfter: 'soon',
          exitCriteria: 'make deterministic',
        },
      ],
    })).toThrow('invalid quarantine reviewAfter date')
  })

  test('detects expired review dates when enforcement is requested', () => {
    const manifest = {
      quarantined: [
        {
          id: 'expired',
          path: 'a.test.ts',
          reason: 'test',
          owner: 'maintainers',
          reviewAfter: '2026-01-01',
          exitCriteria: 'make deterministic',
        },
      ],
    }

    expect(expiredQuarantineEntries(manifest, new Date('2026-05-06T00:00:00.000Z')).map((entry) => entry.id)).toEqual(['expired'])
    expect(() => validateQuarantineManifest(manifest, {
      enforceReviewDate: true,
      asOf: new Date('2026-05-06T00:00:00.000Z'),
    })).toThrow('expired quarantine entries require review')
  })

  test('renders a compact review summary', () => {
    const manifest = {
      quarantined: [
        {
          id: 'expired',
          path: 'a.test.ts',
          reason: 'test',
          owner: 'maintainers',
          reviewAfter: '2026-01-01',
          exitCriteria: 'make deterministic',
        },
      ],
    }

    const summary = renderQuarantineSummary(manifest, new Date('2026-05-06T00:00:00.000Z'))
    expect(summary).toContain('Entries: 1')
    expect(summary).toContain('Expired: 1')
    expect(summary).toContain('expired (a.test.ts, reviewAfter=2026-01-01)')
  })
})
