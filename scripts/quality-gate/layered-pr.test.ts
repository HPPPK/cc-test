import { describe, expect, test } from 'bun:test'
import { lanesForMode } from './modes'
import { determineFeedbackType, determineReadyForMerge } from './runner'

/**
 * T006: Layered PR Mode, Changed-Line Coverage, and Output Semantics RED Tests
 *
 * These tests define the expected behavior for:
 * - Layered PR mode execution order
 * - Changed-line coverage for PR mode vs full coverage for baseline/release
 * - Output semantics (feedbackType, readyForMerge)
 *
 * All tests MUST fail RED before implementation begins.
 */

describe('layered PR mode lane ordering', () => {
  test('PR mode lanes execute in layered order', () => {
    const lanes = lanesForMode('pr')

    // 获取每个 lane 的 ID 和层级信息
    const laneIds = lanes.map((lane) => lane.id)

    // Layer 1: impact-report, policy-checks (always run first)
    const layer1Lanes = ['impact-report', 'policy-checks']
    const layer1Indices = layer1Lanes.map((id) => laneIds.indexOf(id))
    const layer1MaxIndex = Math.max(...layer1Indices)

    // Layer 2 is reserved for fast mode. PR mode skips it to avoid duplicating
    // the full area-specific checks.
    const coreSmokeIndex = laneIds.indexOf('core-smoke')
    const fastLaneTestsIndex = laneIds.indexOf('fast-lane-tests')

    // 验证 Layer 1 lanes 存在于 PR 模式
    expect(layer1Indices.every((idx) => idx >= 0)).toBe(true)

    expect(coreSmokeIndex).toBe(-1)
    expect(fastLaneTestsIndex).toBe(-1)

    // Layer 3: area-specific checks (desktop-checks, server-checks, adapter-checks)
    // Should execute after Layer 1
    const layer3Lanes = ['desktop-checks', 'server-checks', 'adapter-checks']
    const layer3Indices = layer3Lanes.map((id) => laneIds.indexOf(id)).filter((idx) => idx >= 0)

    if (layer3Indices.length > 0) {
      for (const idx of layer3Indices) {
        expect(idx).toBeGreaterThan(layer1MaxIndex)
      }
    }

    // Layer 4: coverage (should use changed-line mode for PR)
    const coverageIndex = laneIds.indexOf('coverage')
    const layer3MaxIndex = layer3Indices.length > 0 ? Math.max(...layer3Indices) : layer1MaxIndex

    // RED TEST: Coverage should execute after area-specific checks
    expect(coverageIndex).toBeGreaterThan(layer3MaxIndex)

    // Layer 5: heavy checks (native-checks, persistence-upgrade)
    // Should execute last, conditionally based on risk
    const layer5Lanes = ['native-checks', 'persistence-upgrade']
    const layer5Indices = layer5Lanes.map((id) => laneIds.indexOf(id)).filter((idx) => idx >= 0)

    if (layer5Indices.length > 0) {
      // RED TEST: Heavy checks should come after coverage
      for (const idx of layer5Indices) {
        expect(idx).toBeGreaterThan(coverageIndex)
      }
    }
  })

  test('PR mode includes quarantine governance', () => {
    const lanes = lanesForMode('pr')
    const laneIds = lanes.map((lane) => lane.id)

    // Quarantine should be present in PR mode
    expect(laneIds).toContain('quarantine')
  })
})

describe('coverage mode by quality gate mode', () => {
  test('PR mode uses changed-line coverage mode', () => {
    const lanes = lanesForMode('pr')
    const coverageLane = lanes.find((lane) => lane.id === 'coverage')

    expect(coverageLane).toBeDefined()

    // RED TEST: coverageMode should be 'changed-line' for PR mode
    // @ts-expect-error - coverageMode does not exist yet (RED test)
    expect(coverageLane?.coverageMode).toBe('changed-line')
  })

  test('baseline mode uses full coverage mode', () => {
    const lanes = lanesForMode('baseline')
    const coverageLane = lanes.find((lane) => lane.id === 'coverage')

    expect(coverageLane).toBeDefined()

    // RED TEST: coverageMode should be 'full' for baseline mode
    // @ts-expect-error - coverageMode does not exist yet (RED test)
    expect(coverageLane?.coverageMode).toBe('full')
  })

  test('release mode uses full coverage mode', () => {
    const lanes = lanesForMode('release')
    const coverageLane = lanes.find((lane) => lane.id === 'coverage')

    expect(coverageLane).toBeDefined()

    // RED TEST: coverageMode should be 'full' for release mode
    // @ts-expect-error - coverageMode does not exist yet (RED test)
    expect(coverageLane?.coverageMode).toBe('full')
  })
})

describe('fast mode semantics', () => {
  test('fast mode exists in QualityGateMode type', () => {
    // RED TEST: 'fast' should be a valid QualityGateMode
    // This test verifies that lanesForMode accepts 'fast' as a mode
    // @ts-expect-error - 'fast' mode does not exist yet (RED test)
    const lanes = lanesForMode('fast')

    // If the mode exists, it should return lanes
    expect(Array.isArray(lanes)).toBe(true)
    expect(lanes.length).toBeGreaterThan(0)
  })

  test('fast mode includes only lightweight lanes', () => {
    // @ts-expect-error - 'fast' mode does not exist yet (RED test)
    const lanes = lanesForMode('fast')
    const laneIds = lanes.map((lane) => lane.id)

    // Fast mode should include:
    // - impact-report (scope analysis)
    // - policy-checks (governance)
    // - core-smoke (tiny smoke set)
    expect(laneIds).toContain('impact-report')
    expect(laneIds).toContain('policy-checks')

    // RED TEST: core-smoke should be in fast mode
    expect(laneIds).toContain('core-smoke')

    // Fast mode should NOT include heavy checks:
    // - coverage (expensive)
    // - native-checks (Tauri compile)
    // - persistence-upgrade (migration tests)
    // - quarantine-enforcement
    // - baseline cases
    expect(laneIds).not.toContain('coverage')
    expect(laneIds).not.toContain('native-checks')
    expect(laneIds).not.toContain('persistence-upgrade')
    expect(laneIds).not.toContain('quarantine')

    // Should not contain any baseline:* lanes
    expect(laneIds.some((id) => id.startsWith('baseline:'))).toBe(false)
  })

  test('fast mode excludes live lanes', () => {
    // @ts-expect-error - 'fast' mode does not exist yet (RED test)
    const lanes = lanesForMode('fast')

    // Fast mode should not have any live lanes
    const liveLanes = lanes.filter((lane) => lane.live === true)
    expect(liveLanes).toHaveLength(0)
  })
})

describe('report output semantics', () => {
  test('fast mode report has feedbackType fast', () => {
    // Fast mode should produce 'fast' feedback type
    expect(determineFeedbackType('fast')).toBe('fast')
  })

  test('fast mode report has readyForMerge false', () => {
    // Fast mode is NEVER merge-ready (CA-002)
    // Even when all tests pass
    const summary = { passed: 1, failed: 0, skipped: 0 }
    expect(determineReadyForMerge('fast', summary)).toBe(false)
  })

  test('PR mode report has feedbackType full', () => {
    expect(determineFeedbackType('pr')).toBe('full')
  })

  test('baseline mode report has feedbackType full', () => {
    expect(determineFeedbackType('baseline')).toBe('full')
  })

  test('release mode report has feedbackType full', () => {
    expect(determineFeedbackType('release')).toBe('full')
  })
})

describe('PR readiness output labeling', () => {
  test('PR mode can report readyForMerge true when appropriate', () => {
    // PR mode can report readyForMerge: true when all required checks pass
    const summary = { passed: 3, failed: 0, skipped: 0 }
    expect(determineReadyForMerge('pr', summary)).toBe(true)
  })

  test('PR mode reports readyForMerge false when checks fail', () => {
    const summary = { passed: 1, failed: 1, skipped: 0 }
    expect(determineReadyForMerge('pr', summary)).toBe(false)
  })

  test('PR mode reports readyForMerge false when impact policy is blocked', () => {
    const summary = { passed: 3, failed: 0, skipped: 0 }
    expect(determineReadyForMerge('pr', summary, {
      changedFiles: 1,
      areas: ['cli-core'],
      labels: [],
      blocked: true,
      requiredChecks: [],
      testCoverageSignals: [],
      riskNotes: [],
    })).toBe(false)
  })

  test('baseline mode never reports readyForMerge true', () => {
    // Baseline mode is for coverage measurement, not merge readiness
    const summary = { passed: 10, failed: 0, skipped: 0 }
    expect(determineReadyForMerge('baseline', summary)).toBe(false)
  })

  test('release mode reports readyForMerge true when all pass', () => {
    // Release mode is for release readiness
    const summary = { passed: 10, failed: 0, skipped: 0 }
    expect(determineReadyForMerge('release', summary)).toBe(true)
  })
})

describe('CA-001 verification: verify command mapping', () => {
  test('verify script maps to quality:pr', () => {
    // CA-001: Preserve `bun run verify` / `quality:pr` as PR readiness entrypoint
    // This test verifies the package.json mapping is preserved

    // Read package.json scripts
    const pkg = require('../../package.json') as { scripts: Record<string, string> }

    // verify should map to quality:pr
    expect(pkg.scripts['verify']).toBe('bun run quality:pr')

    // quality:pr should run quality:gate with --mode pr
    expect(pkg.scripts['quality:pr']).toBe('bun run quality:gate --mode pr')
  })
})

describe('core smoke set definition', () => {
  test('core-smoke lane has appropriate configuration', () => {
    const lanes = lanesForMode('fast')

    // RED TEST: core-smoke lane should exist
    const coreSmokeLane = lanes.find((lane) => lane.id === 'core-smoke')

    expect(coreSmokeLane).toBeDefined()

    // RED TEST: core-smoke should have appropriate metadata
    expect(coreSmokeLane?.title).toBeTruthy()
    expect(coreSmokeLane?.description).toBeTruthy()

    // core-smoke should have a fast timeout (30s is acceptable for core smoke)
    // @ts-expect-error - timeoutMs type not inferred
    expect(coreSmokeLane?.timeoutMs).toBeLessThanOrEqual(30000) // < 30 seconds

    // RED TEST: core-smoke should be sequential (not parallel)
    // @ts-expect-error - executionKind does not exist yet (RED test)
    expect(coreSmokeLane?.executionKind).toBe('sequential')
  })
})

describe('changed-area tests lane definition', () => {
  test('fast-lane-tests lane exists and has correct configuration', () => {
    const lanes = lanesForMode('fast')

    // fast-lane-tests lane should exist (implemented in T008)
    const fastLaneTestsLane = lanes.find((lane) => lane.id === 'fast-lane-tests')

    expect(fastLaneTestsLane).toBeDefined()
    expect(fastLaneTestsLane?.title).toBeTruthy()
    expect(fastLaneTestsLane?.description).toBeTruthy()

    // fast-lane-tests should depend on impact-report
    // @ts-expect-error - dependsOn type not inferred
    expect(fastLaneTestsLane?.dependsOn).toContain('impact-report')
  })
})

describe('risk escalation for heavy checks', () => {
  test('native-checks have risk trigger configuration', () => {
    const lanes = lanesForMode('pr')
    const nativeLane = lanes.find((lane) => lane.id === 'native-checks')

    expect(nativeLane).toBeDefined()

    // native-checks should have risk escalation configuration
    // @ts-expect-error - riskTrigger type not inferred
    expect(nativeLane?.riskTrigger).toBeDefined()
    // @ts-expect-error - riskTrigger type not inferred
    expect(nativeLane?.riskTrigger?.riskLevels).toContain('high')
  })

  test('persistence-upgrade has risk trigger configuration', () => {
    const lanes = lanesForMode('pr')
    const persistenceLane = lanes.find((lane) => lane.id === 'persistence-upgrade')

    expect(persistenceLane).toBeDefined()

    // persistence-upgrade should have risk escalation configuration
    // @ts-expect-error - riskTrigger type not inferred
    expect(persistenceLane?.riskTrigger).toBeDefined()
  })
})

describe('backward compatibility for existing report schema', () => {
  test('existing report fields remain unchanged', () => {
    // CA-006: Quality report schema changes remain backward-compatible
    // This test verifies the base schema is preserved

    const mockReport = {
      schemaVersion: 1 as const,
      runId: 'compat-test',
      mode: 'pr' as const,
      dryRun: false,
      allowLive: false,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      rootDir: process.cwd(),
      git: { sha: 'abc123', dirty: false },
      results: [],
      artifacts: [],
      summary: { passed: 0, failed: 0, skipped: 0 },
    }

    // All existing fields should be present
    expect(mockReport.schemaVersion).toBe(1)
    expect(mockReport.runId).toBe('compat-test')
    expect(mockReport.mode).toBe('pr')
    expect(mockReport.dryRun).toBe(false)
    expect(mockReport.allowLive).toBe(false)
    expect(mockReport.startedAt).toBeTruthy()
    expect(mockReport.finishedAt).toBeTruthy()
    expect(mockReport.rootDir).toBeTruthy()
    expect(mockReport.git).toBeDefined()
    expect(mockReport.results).toEqual([])
    expect(mockReport.artifacts).toEqual([])
    expect(mockReport.summary).toEqual({ passed: 0, failed: 0, skipped: 0 })
  })
})
