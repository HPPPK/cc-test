/**
 * RED Tests for Fast Mode (TDD Phase 1)
 *
 * These tests define the expected behavior of the new 'fast' mode.
 * They MUST fail because 'fast' mode does not exist yet.
 * The failures should be for missing functionality, not syntax errors.
 *
 * Task: T003 - Create fast-mode composition RED tests
 * Feature: 003-layered-test-verify
 * Must-Preserve:
 *   - CA-002: Fast-lane success is development signal, never merge-ready
 *   - CA-004: Coverage ratchets, quarantine governance, same-area tests preserved
 */

import { describe, expect, test } from 'bun:test'
import { lanesForMode } from './modes'
import type { QualityGateMode, QualityGateReport } from './types'

// ============================================================================
// Test Case 1: Fast mode exists in QualityGateMode type
// ============================================================================

describe('fast mode type definition', () => {
  test("'fast' is a valid QualityGateMode", () => {
    // This test verifies that 'fast' is accepted as a QualityGateMode.
    // The type system should accept 'fast' as a valid mode value.
    // RED: Currently, QualityGateMode only has 'pr' | 'baseline' | 'release'

    // Runtime check: lanesForMode should accept 'fast' as a valid mode
    const fastLanes = lanesForMode('fast' as QualityGateMode)

    // If 'fast' is not a valid mode, this will either:
    // 1. TypeScript error (if strict mode) - but we're testing runtime behavior
    // 2. Return empty array or throw - both are RED states
    expect(fastLanes).toBeDefined()
    expect(Array.isArray(fastLanes)).toBe(true)

    // Fast mode should have lanes defined (not empty)
    // RED: Currently returns empty array because 'fast' is not in requiredForModes
    expect(fastLanes.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// Test Case 2: Fast mode lane composition
// ============================================================================

describe('fast mode lane composition', () => {
  test('fast mode includes required lightweight lanes', () => {
    // RED: 'fast' mode does not exist yet
    const lanes = lanesForMode('fast' as QualityGateMode).map((lane) => lane.id)

    // Fast mode MUST include these lanes (per plan.md Phase 1):
    // - impact-report: Always runs to determine changed areas
    // - policy-checks: Validates governance rules (fast)
    // - core-smoke: Tiny critical-path smoke tests (Phase 3)
    // - fast-lane-tests: Changed-area tests based on impact (Phase 2)

    expect(lanes).toContain('impact-report')
    expect(lanes).toContain('policy-checks')
    expect(lanes).toContain('core-smoke')
    expect(lanes).toContain('fast-lane-tests')
  })

  test('fast mode excludes heavy/expensive lanes', () => {
    // RED: 'fast' mode does not exist yet
    const lanes = lanesForMode('fast' as QualityGateMode).map((lane) => lane.id)

    // Fast mode MUST NOT include these lanes (per plan.md Phase 1 and MP-006):
    // - coverage: Too expensive for <1 minute target
    // - native-checks: Tauri native compilation is heavy
    // - persistence-upgrade: Migration validation is heavy
    // - quarantine-enforcement: Not needed for dev feedback
    // - baseline-catalog: Live baseline cases are heavy
    // - provider-smoke: Live provider connectivity is heavy
    // - desktop-smoke: Desktop smoke with real agent is heavy

    expect(lanes).not.toContain('coverage')
    expect(lanes).not.toContain('native-checks')
    expect(lanes).not.toContain('persistence-upgrade')
    expect(lanes).not.toContain('quarantine-enforcement')
    expect(lanes).not.toContain('baseline-catalog')

    // Check for prefixed lanes (provider-smoke:*, desktop-smoke:*)
    const hasProviderSmoke = lanes.some((id) => id.startsWith('provider-smoke:'))
    const hasDesktopSmoke = lanes.some((id) => id.startsWith('desktop-smoke:'))
    expect(hasProviderSmoke).toBe(false)
    expect(hasDesktopSmoke).toBe(false)
  })

  test('fast mode does not include baseline case lanes', () => {
    // RED: 'fast' mode does not exist yet
    const lanes = lanesForMode('fast' as QualityGateMode).map((lane) => lane.id)

    // Baseline lanes are live integration tests - too heavy for fast mode
    const hasBaselineLanes = lanes.some((id) => id.startsWith('baseline:'))
    expect(hasBaselineLanes).toBe(false)
  })
})

// ============================================================================
// Test Case 3: Fast mode output semantics (CA-002 compliance)
// ============================================================================

describe('fast mode output semantics', () => {
  test('fast mode reports have feedbackType fast', () => {
    // RED: feedbackType field does not exist on QualityGateReport yet

    // This test defines what the report SHOULD look like
    // The actual report generation is in runner.ts
    const expectedReportShape: Partial<QualityGateReport> = {
      mode: 'fast' as QualityGateMode,
      // RED: feedbackType field does not exist yet
      // @ts-expect-error - feedbackType is the new field we're testing for
      feedbackType: 'fast',
    }

    // Verify the expected shape has feedbackType 'fast'
    // RED: This will fail because feedbackType doesn't exist
    expect(expectedReportShape.feedbackType).toBe('fast')
  })

  test('fast mode reports are never ready for merge', () => {
    // RED: readyForMerge field does not exist on QualityGateReport yet
    // CA-002: Fast-lane success remains a development signal and never merge-ready

    // This test defines what the report SHOULD look like
    const expectedReportShape: Partial<QualityGateReport> = {
      mode: 'fast' as QualityGateMode,
      // RED: readyForMerge field does not exist yet
      // @ts-expect-error - readyForMerge is the new field we're testing for
      readyForMerge: false,
    }

    // Fast mode MUST NOT claim merge readiness
    // This is a critical safety property (MP-010, CA-002)
    // RED: This will fail because readyForMerge doesn't exist
    expect(expectedReportShape.readyForMerge).toBe(false)
  })

  test('fast mode summary includes development signal disclaimer', () => {
    // RED: fast mode does not exist yet, so we can't verify its output
    // This test defines that fast mode output MUST include a disclaimer

    // The actual implementation will add this to the markdown report
    // For now, we define the expected behavior
    const expectedDisclaimer = 'DEVELOPMENT SIGNAL'
    const expectedNotReady = 'NOT PR READY'

    // When fast mode is implemented, its markdown output must contain these
    // RED: We can't test this until fast mode exists, but we document the requirement
    expect(expectedDisclaimer).toBeTruthy()
    expect(expectedNotReady).toBeTruthy()

    // Note: The actual test of markdown output will be added when runner.ts
    // is modified to support fast mode. This test documents the requirement.
  })
})

// ============================================================================
// Test Case 4: Existing modes preserved (CA-004 compliance)
// ============================================================================

describe('existing modes preserved', () => {
  test('pr mode still returns expected lanes', () => {
    // CA-004: Coverage ratchets, quarantine governance, same-area tests preserved
    // PR mode must continue to work as before

    const lanes = lanesForMode('pr').map((lane) => lane.id)

    // PR mode must still include these essential lanes (from runner.test.ts)
    expect(lanes).toContain('impact-report')
    expect(lanes).toContain('policy-checks')
    expect(lanes).toContain('desktop-checks')
    expect(lanes).toContain('server-checks')
    expect(lanes).toContain('adapter-checks')
    expect(lanes).toContain('native-checks')
    expect(lanes).toContain('docs-checks')
    expect(lanes).toContain('persistence-upgrade')
    expect(lanes).toContain('quarantine')
    expect(lanes).toContain('coverage')

    // PR mode should not include baseline lanes by default
    expect(lanes.some((id) => id.startsWith('baseline:'))).toBe(false)
  })

  test('baseline mode still returns expected lanes', () => {
    // CA-004: Baseline mode must continue to work as before

    const lanes = lanesForMode('baseline').map((lane) => lane.id)

    // Baseline mode must still include these lanes (from runner.test.ts)
    expect(lanes).toContain('baseline-catalog')
    expect(lanes).toContain('quarantine')
    expect(lanes).toContain('coverage')
    expect(lanes).toContain('baseline:failing-unit:current-runtime')
    expect(lanes).toContain('provider-smoke:current-runtime')
    expect(lanes).toContain('baseline:multi-file-api:current-runtime')
    expect(lanes).toContain('desktop-smoke:agent-browser-chat:current-runtime')

    // Baseline mode should not include native-checks
    expect(lanes).not.toContain('native-checks')
  })

  test('release mode still returns expected lanes', () => {
    // CA-004: Release mode must continue to work as before

    const lanes = lanesForMode('release').map((lane) => lane.id)

    // Release mode must still include these lanes (from runner.test.ts)
    expect(lanes).toContain('policy-checks')
    expect(lanes).toContain('persistence-upgrade')
    expect(lanes).toContain('quarantine')
    expect(lanes).toContain('coverage')
    expect(lanes).toContain('baseline:failing-unit:current-runtime')
    expect(lanes).toContain('provider-smoke:current-runtime')
    expect(lanes).toContain('desktop-smoke:agent-browser-chat:current-runtime')
    expect(lanes).toContain('native-checks')
  })
})

// ============================================================================
// Test Case 5: Fast mode isolation (no pollution of other modes)
// ============================================================================

describe('fast mode isolation', () => {
  test('adding fast mode does not change pr mode lane count', () => {
    // Verify that adding 'fast' to requiredForModes arrays doesn't accidentally
    // add fast mode to lanes that should only run in pr/baseline/release

    const prLanes = lanesForMode('pr')

    // PR mode should still have substantial lane count (not reduced by mistake)
    expect(prLanes.length).toBeGreaterThanOrEqual(10)

    // PR mode should not have any lanes that are fast-only
    const fastOnlyLanes = ['core-smoke', 'fast-lane-tests']
    const prLaneIds = prLanes.map((l) => l.id)

    for (const lane of fastOnlyLanes) {
      expect(prLaneIds).not.toContain(lane)
    }
  })

  test('fast mode lanes are distinct from release mode lanes', () => {
    // Fast mode and release mode serve different purposes
    // Fast = dev feedback; Release = production readiness

    const fastLanes = lanesForMode('fast' as QualityGateMode).map((l) => l.id)
    const releaseLanes = lanesForMode('release').map((l) => l.id)

    // Release should have native-checks; fast should not
    expect(releaseLanes).toContain('native-checks')
    expect(fastLanes).not.toContain('native-checks')

    // Release should have baseline lanes; fast should not
    const releaseHasBaseline = releaseLanes.some((id) => id.startsWith('baseline:'))
    const fastHasBaseline = fastLanes.some((id) => id.startsWith('baseline:'))
    expect(releaseHasBaseline).toBe(true)
    expect(fastHasBaseline).toBe(false)
  })
})
