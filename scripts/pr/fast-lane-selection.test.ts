import { describe, expect, test } from 'bun:test'
import { selectFastLaneTests } from './change-policy.js'
import type { FastLaneTestSelection, RiskLevel } from '../quality-gate/types.js'

/**
 * Fast-Lane Test Selection Tests
 *
 * Tests for fast-lane test selection based on changed files.
 *
 * Contract obligations from plan.md:
 * - CA-003: Skipped lanes must be explainable through impact/risk assessment
 * - CA-005: High-risk paths escalate to the right checks
 */

/**
 * Helper to get selected areas from the result.
 */
function getSelectedAreas(result: FastLaneTestSelection): string[] {
  const areas: string[] = []
  if (result.selectedTests.server) areas.push('server')
  if (result.selectedTests.desktop) areas.push('desktop')
  if (result.selectedTests.adapters) areas.push('adapters')
  if (result.selectedTests.docs) areas.push('docs')
  return areas
}

describe('selectFastLaneTests', () => {
  describe('area-based test selection', () => {
    test('server file change selects server tests', () => {
      // Given: a server file change
      const files = ['src/server/services/teamService.ts']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: server tests should be selected
      expect(result.selectedTests.server).toBeDefined()
      expect(result.selectedTests.server!.length).toBeGreaterThan(0)

      // And: core smoke should always be included
      expect(result.coreSmoke).toBeDefined()
      expect(result.coreSmoke.length).toBeGreaterThan(0)
    })

    test('desktop file change selects desktop tests', () => {
      // Given: a desktop file change
      const files = ['desktop/src/components/Header.tsx']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: desktop tests should be selected
      expect(result.selectedTests.desktop).toBeDefined()
      expect(result.selectedTests.desktop!.length).toBeGreaterThan(0)

      // And: core smoke should always be included
      expect(result.coreSmoke).toBeDefined()
    })

    test('adapter file change selects adapter tests', () => {
      // Given: an adapter file change
      const files = ['adapters/anthropic/adapter.ts']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: adapter tests should be selected
      expect(result.selectedTests.adapters).toBeDefined()
      expect(result.selectedTests.adapters!.length).toBeGreaterThan(0)

      // And: core smoke should always be included
      expect(result.coreSmoke).toBeDefined()
    })

    test('docs file change selects docs tests or minimal selection', () => {
      // Given: a docs file change
      const files = ['docs/api.md']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: docs area should be recognized (docs changes are low risk)
      // Note: docs tests are optional, so we just verify core smoke runs
      expect(result.coreSmoke).toBeDefined()

      // And: selection should be low risk (docs changes are low risk)
      expect(result.riskLevel).toBe('low')
    })

    test('multiple file changes select multiple test areas', () => {
      // Given: changes across multiple areas
      const files = [
        'src/server/services/teamService.ts',
        'desktop/src/components/Header.tsx',
        'adapters/anthropic/adapter.ts',
      ]

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: all affected areas should be selected
      const areas = getSelectedAreas(result)
      expect(areas).toContain('server')
      expect(areas).toContain('desktop')
      expect(areas).toContain('adapters')
    })
  })

  describe('no changes scenario', () => {
    test('empty file list selects core smoke only', () => {
      // Given: no files changed
      const files: string[] = []

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: only core smoke should run (no area tests)
      const areas = getSelectedAreas(result)
      expect(areas).toEqual([])

      // And: core smoke should always run
      expect(result.coreSmoke).toBeDefined()
      expect(result.coreSmoke.length).toBeGreaterThan(0)
    })
  })

  describe('explanable output (CA-003 compliance)', () => {
    test('skipped tests include explanation', () => {
      // Given: a server-only change (skips other areas)
      const files = ['src/server/services/teamService.ts']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: skipped lanes should be explained
      expect(result.skipped.length).toBeGreaterThan(0)

      // Each skipped entry should have area and reason
      for (const skipped of result.skipped) {
        expect(skipped.area).toBeDefined()
        expect(skipped.reason).toBeDefined()
        expect(skipped.reason.length).toBeGreaterThan(0)
      }
    })

    test('all non-selected areas are explained as skipped', () => {
      // Given: a server-only change
      const files = ['src/server/services/teamService.ts']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: skipped should include desktop, adapters, docs
      const skippedAreas = result.skipped.map((s) => s.area)
      expect(skippedAreas).toContain('desktop')
      expect(skippedAreas).toContain('adapters')
      expect(skippedAreas).toContain('docs')
    })
  })

  describe('high-risk path escalation (CA-005 compliance)', () => {
    test('Tauri/native path changes trigger high risk level', () => {
      // Given: a Tauri native code change
      const files = ['desktop/src-tauri/src/main.rs']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: risk level should be high
      expect(result.riskLevel).toBe('high')

      // And: escalated checks should be present
      expect(result.escalatedChecks).toBeDefined()
      expect(result.escalatedChecks!.length).toBeGreaterThan(0)
    })

    test('provider/runtime path changes trigger high risk level', () => {
      // Given: a provider code change
      const files = ['src/server/services/conversation/provider-selector.ts']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: risk level should be high
      expect(result.riskLevel).toBe('high')

      // And: escalated checks should mention provider
      expect(result.escalatedChecks).toBeDefined()
      expect(result.escalatedChecks!.some((c) => c.toLowerCase().includes('provider'))).toBe(true)
    })

    test('release-sensitive paths trigger high risk level', () => {
      // Given: a release-sensitive file change
      const files = ['.github/workflows/release-desktop.yml']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: risk level should be high
      expect(result.riskLevel).toBe('high')

      // And: escalated checks should be present
      expect(result.escalatedChecks).toBeDefined()
      expect(result.escalatedChecks!.length).toBeGreaterThan(0)
    })

    test('low-risk changes do not trigger escalation', () => {
      // Given: a low-risk file change
      const files = ['docs/api.md']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: risk level should be low
      expect(result.riskLevel).toBe('low')

      // And: no escalated checks
      expect(result.escalatedChecks).toBeUndefined()
    })
  })

  describe('integration with change-policy', () => {
    test('uses change-policy area classification', () => {
      // Given: files that map to different areas via change-policy
      const files = [
        'src/server/ws/handler.ts',
        'desktop/src/pages/Settings.tsx',
      ]

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: areas should match change-policy classification
      const areas = getSelectedAreas(result)
      expect(areas).toContain('server')
      expect(areas).toContain('desktop')
    })

    test('normalizes paths before classification', () => {
      // Given: Windows-style paths
      const files = ['.\\src\\server\\services\\teamService.ts']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: paths should be normalized and classified correctly
      expect(result.selectedTests.server).toBeDefined()
    })
  })

  describe('test pattern generation', () => {
    test('server test patterns match server test file conventions', () => {
      // Given: a server file change
      const files = ['src/server/services/teamService.ts']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: test patterns should follow server test conventions
      expect(result.selectedTests.server).toBeDefined()

      // Patterns should match server test files
      const hasServerPattern = result.selectedTests.server!.some(
        (p) => p.includes('server') || p.includes('.test.') || p.includes('__tests__'),
      )
      expect(hasServerPattern).toBe(true)
    })

    test('desktop test patterns match desktop test file conventions', () => {
      // Given: a desktop file change
      const files = ['desktop/src/components/Header.tsx']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: test patterns should follow desktop test conventions
      expect(result.selectedTests.desktop).toBeDefined()

      // Patterns should match desktop test files
      const hasDesktopPattern = result.selectedTests.desktop!.some(
        (p) => p.includes('desktop') || p.includes('.test.') || p.includes('.spec.'),
      )
      expect(hasDesktopPattern).toBe(true)
    })

    test('adapter test patterns match adapter test file conventions', () => {
      // Given: an adapter file change
      const files = ['adapters/anthropic/adapter.ts']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: test patterns should follow adapter test conventions
      expect(result.selectedTests.adapters).toBeDefined()

      // Patterns should match adapter test files
      const hasAdapterPattern = result.selectedTests.adapters!.some(
        (p) => p.includes('adapter') || p.includes('.test.') || p.includes('__tests__'),
      )
      expect(hasAdapterPattern).toBe(true)
    })
  })

  describe('core smoke set', () => {
    test('core smoke tests are always included', () => {
      // Given: any file change
      const files = ['src/server/services/teamService.ts']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: core smoke should be defined
      expect(result.coreSmoke).toBeDefined()
      expect(result.coreSmoke.length).toBeGreaterThan(0)
    })

    test('core smoke tests run even with no changes', () => {
      // Given: no file changes
      const files: string[] = []

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: core smoke should still be defined
      expect(result.coreSmoke).toBeDefined()
      expect(result.coreSmoke.length).toBeGreaterThan(0)
    })

    test('core smoke includes policy checks', () => {
      // Given: any file change
      const files = ['src/server/services/teamService.ts']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: core smoke should include policy-related tests
      const hasPolicyTest = result.coreSmoke.some(
        (p) => p.includes('change-policy') || p.includes('quality-gate'),
      )
      expect(hasPolicyTest).toBe(true)
    })

    test('core smoke excludes baseline and smoke fixtures', () => {
      const result = selectFastLaneTests(['docs/api.md'])

      expect(result.coreSmoke.some(p => p.includes('fixtures'))).toBe(false)
      expect(result.coreSmoke.some(p => p.includes('baseline/fixtures'))).toBe(false)
      expect(result.coreSmoke.some(p => p.includes('desktop-smoke/fixtures'))).toBe(false)
    })

    test('core smoke remains bounded for large PRs', () => {
      const result = selectFastLaneTests(
        Array.from({ length: 500 }, (_, index) => `src/server/example-${index}.ts`),
      )

      expect(result.coreSmoke.length).toBeLessThanOrEqual(5)
      expect(Object.values(result.selectedTests).flat().length).toBeLessThanOrEqual(8)
    })
  })

  describe('risk level assessment', () => {
    test('desktop state/API changes trigger medium risk', () => {
      // Given: a desktop state layer change
      const files = ['desktop/src/stores/settingsStore.ts']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: risk level should be medium or higher
      expect(['medium', 'high']).toContain(result.riskLevel)
    })

    test('server WebSocket changes are classified as server area', () => {
      // Given: a server WebSocket change
      const files = ['src/server/ws/handler.ts']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: should be classified as server area
      expect(result.selectedTests.server).toBeDefined()

      // Note: WebSocket changes don't currently trigger elevated risk
      // Risk escalation for runtime paths will be added in T014
    })

    test('CI workflow changes are recognized', () => {
      // Given: a CI workflow change
      const files = ['.github/workflows/ci.yml']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: should handle gracefully (no matching test area, but core smoke runs)
      expect(result.coreSmoke.length).toBeGreaterThan(0)

      // Note: CI changes don't trigger elevated risk unless release- prefixed
      // Risk escalation for CI paths will be refined in T014
    })

    test('release workflow changes trigger high risk', () => {
      // Given: a release workflow change
      const files = ['.github/workflows/release-desktop.yml']

      // When: selecting fast-lane tests
      const result = selectFastLaneTests(files)

      // Then: risk level should be high
      expect(result.riskLevel).toBe('high')
      expect(result.escalatedChecks).toBeDefined()
      expect(result.escalatedChecks!.some((c) => c.includes('release'))).toBe(true)
    })
  })
})
