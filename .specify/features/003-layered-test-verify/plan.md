# Implementation Plan: Layered Test Verification

**Branch**: `003-layered-test-verify` | **Date**: 2026-05-17 | **Spec**: `spec.md`
**Input**: Feature specification from `.specify/features/003-layered-test-verify/spec.md`

## Summary

Add a layered test verification workflow with an under-1-minute fast feedback lane and a reorganized PR/verify flow targeting 5 minutes for routine changes. The implementation extends the existing quality-gate architecture (`modes.ts`, `runner.ts`) with a new `fast` mode, leverages `impact-report.ts` and `change-policy.ts` for changed-area test selection, defines a core smoke set, adds risk-based escalation for heavy checks, and enforces clear output semantics distinguishing "development signal" from "PR readiness."

## Locked Planning Decisions

- **LD-001**: Add `fast` mode in `modes.ts` that runs only impact-report + minimal fast-checks lane (source: D-001, verified)
- **LD-002**: Extend `impact-report.ts` to emit fast-lane test selection based on changed files and `change-policy.ts` area classification (source: D-002, verified)
- **LD-003**: Define a tiny fixed core smoke set that always runs in fast lane (source: D-003, inferred)
- **LD-004**: Changed-line coverage for PR mode; preserve full coverage in baseline and release modes (source: D-004, assumed — validate runtime)
- **LD-005**: Define explicit risk triggers in `change-policy.ts` that escalate E2E, live-provider, and release gates (source: D-005, verified)
- **LD-006**: Extend quality-gate reporter to emit clear "fast feedback" vs "PR readiness" labels with `feedbackType: 'fast' | 'full'` (source: D-006, verified)
- **LD-007**: `bun run verify` remains PR readiness entrypoint; fast lane is a separate `bun run quality:fast` command (source: MP-005)

## Must-Preserve Carry-Forward

| MP ID | Type | Planning Obligation | Plan Location | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- |
| MP-001 | goal | Make tests lighter/faster while preserving quality | ## Summary, Phase 1-8 | If fast lane weakens quality |
| MP-002 | scope | Under-1-minute fast lane + 5-minute PR/verify | Phase 1, Phase 4 | If either target cannot be met |
| MP-003 | decision | Layered PR Gate using existing architecture | Phase 1, Phase 4 | If implementation ignores existing architecture |
| MP-004 | decision | Changed-area tests + core smoke as fast evidence | Phase 2, Phase 3 | If test selection becomes static/full |
| MP-005 | decision | Preserve verify as PR entrypoint | Phase 4, Phase 6 | If fast lane replaces verify |
| MP-006 | decision | E2E/live-provider/release conditional | Phase 5 | If heavy checks always run or never run |
| MP-007 | decision | Quality = regression protection + low flake + changed-area coverage | Implementation Constitution | If coverage weakened silently |
| MP-008 | non_goal | Do not weaken quality contracts | Implementation Constitution | If any coverage or gate weakened |
| MP-009 | reference | Existing gate surfaces | Phase 1, Phase 2 | If existing surfaces ignored |
| MP-010 | tradeoff | Fast success ≠ PR readiness | Phase 6 | If fast report claims PR-ready |
| MP-011 | tradeoff | Impact graph deferred | Phase 2 | If test impact graph implemented now |
| MP-012 | blocking_question | Coverage strategy resolved: changed-line for PR, full for baseline/release | Phase 7 | If changed-line coverage proves insufficient |

## Scenario Profile Inputs

### Active Profile

- **Standard Delivery** — no reference implementation or fidelity obligations
- Source: `alignment.md` (no special profile routing)

### Profile-Driven Implementation Constraints

- None beyond the standard planning artifact contract

## Technical Context

**Language/Version**: TypeScript / Bun runtime
**Primary Dependencies**: Vitest (desktop), Bun test (server), existing quality-gate scripts
**Storage**: N/A
**Testing**: Vitest + Bun test; regression tests for routing logic
**Target Platform**: Developer workstation (local CLI)
**Project Type**: CLI quality-gate scripts for desktop+server app
**Performance Goals**: Fast lane < 60s, PR/verify < 300s for routine changes
**Constraints**: No new external dependencies; preserve existing quality contracts
**Scale/Scope**: 8-12 files affected

## Implementation Constitution

### Architecture Invariants

- Quality-gate mode-based lane selection is the sole mechanism for test execution routing
- Impact-report + change-policy are the sole mechanisms for determining which tests run
- `bun run verify` remains the canonical PR readiness entrypoint
- Fast-lane success MUST NOT be presented as PR readiness

### Boundary Ownership

- `modes.ts` owns mode definitions and lane composition
- `runner.ts` owns lane execution and filtering logic
- `impact-report.ts` owns change impact analysis and test selection signals
- `change-policy.ts` owns path classification and area determination
- `types.ts` owns shared type definitions for the quality-gate system

### Forbidden Implementation Drift

- No parallel test system or separate CLI command for lane selection
- No static file-to-test mapping that misses cross-module risks
- No coverage weakening without explicit approval
- No silent bypass of quality checks — every skipped check must be explainable via risk assessment
- No fast-lane report claiming `readyForMerge: true`

### Required Implementation References

- `scripts/quality-gate/modes.ts` — existing lane definitions and mode structure
- `scripts/quality-gate/runner.ts` — lane execution, filtering, and report generation
- `scripts/quality-gate/types.ts` — shared type definitions
- `scripts/pr/impact-report.ts` — impact analysis and risk notes
- `scripts/pr/change-policy.ts` — path classification and area determination
- `package.json` — existing script entries

### Review Focus

- Verify fast-mode lane composition excludes heavy checks appropriately
- Verify output semantics distinguish "development signal" from "PR readiness"
- Verify risk escalation triggers correctly for high-risk paths
- Verify coverage strategy does not weaken baselines

## Dispatch Compilation Hints

### Boundary Owner

- `modes.ts` for mode/lane definitions
- `runner.ts` for execution orchestration
- `impact-report.ts` for test selection signals

### Required Packet References

- `scripts/quality-gate/modes.ts`
- `scripts/quality-gate/runner.ts`
- `scripts/quality-gate/types.ts`
- `scripts/pr/impact-report.ts`
- `scripts/pr/change-policy.ts`

### Packet Validation Gates

- `bun run quality:fast` completes in < 60 seconds with test fixtures
- `bun run verify` completes in < 300 seconds for low-risk changes
- Fast-lane output contains "DEVELOPMENT SIGNAL" and "NOT PR READY"
- High-risk path changes trigger escalated checks

### Task-Level Quality Floor

- Every new mode, lane, or routing rule must have corresponding regression tests
- No quality-gate change ships without verifying existing lanes still work
- Coverage changes must be explicit, never accidental

## Alignment Inputs

### Canonical References

- `spec.md` — feature specification with 6 capabilities and 6 success criteria
- `alignment.md` — confirmed alignment with all MP items
- `research.md` — 6 planning decisions (D-001 through D-006)

### Input Risks From Alignment

- **Soft unknown resolved**: Coverage strategy (MP-012) resolved as changed-line for PR, full for baseline/release. Runtime validation still needed.
- **Fast-lane time budget unverified**: Core smoke set size must be measured to confirm < 1 minute target.

## Research Inputs

### Standard Stack

- Bun runtime for scripts (existing)
- Vitest for desktop tests (existing)
- Bun test for server tests (existing)
- No new external dependencies required

### Don't Hand-Roll

- Test selection must use existing `change-policy.ts` area classification, not a new mapping system
- Risk escalation must extend existing `riskNotes()` in `impact-report.ts`, not a parallel mechanism
- Output semantics must extend existing reporter patterns, not create a new output format

### Common Pitfalls

1. **Silent bypass of quality checks**: Every skipped check must be explainable via risk assessment
2. **Fast success = merge-ready**: Reports must explicitly label fast feedback as development signal only
3. **Over-optimistic time budgets**: Measure actual runtime before committing to targets
4. **Test selection overfit**: Simple file-to-test mapping misses cross-module risks
5. **Coverage weakening**: Any coverage change must be explicit, not accidental

### Assumptions To Validate

- Fast lane can complete in < 1 minute (measure with representative changes)
- Changed-line coverage produces meaningful signal (validate during Phase 7)
- Desktop build can be split for fast vs heavy lanes (verify during Phase 4)

### Environment / Dependency Notes

- Bun runtime required for scripts
- Existing test infrastructure (Vitest for desktop, Bun test for server)
- Coverage tools already configured
- No new external dependencies required

## Implementation Phases

### Phase 1: Fast Lane Mode Definition

**Objective**: Add `fast` mode in `modes.ts` that runs only impact-report and a minimal fast-checks lane.

**Affected Files**: `scripts/quality-gate/modes.ts`, `scripts/quality-gate/types.ts`, `package.json`

**Steps**:
1. Add `fast` to `QualityGateMode` type in `types.ts`
2. Add `fast` mode definition in `modes.ts` with lane composition:
   - `impact-report` lane (always)
   - `policy-checks` lane (always)
   - Changed-area test lane (conditional on impact)
3. Add `quality:fast` script entry in `package.json` pointing to runner with `--mode fast`
4. Ensure `fast` mode does NOT include: coverage, native-checks, persistence-upgrade, quarantine-enforcement

**Acceptance Criteria**:
- `bun run quality:fast` executes and completes
- Fast mode runs only impact-report + policy-checks + changed-area tests
- Existing modes (PR, baseline, release) unchanged

**Validation**: Run `bun run quality:fast` with no changes and verify it completes quickly.

---

### Phase 2: Changed-Area Test Selection

**Objective**: Extend `impact-report.ts` to emit fast-lane test selection based on changed files and `change-policy.ts` area classification.

**Affected Files**: `scripts/pr/impact-report.ts`, `scripts/quality-gate/modes.ts`

**Steps**:
1. Add `fastLaneTests` section to impact-report output
2. Map each changed file to its area via `areasForPath()` from `change-policy.ts`
3. For each affected area, select the relevant test suite:
   - `server` area → server test files matching changed paths
   - `desktop` area → desktop test files matching changed paths
   - `adapters` area → adapter test files matching changed paths
4. Add `fast-lane-tests` lane definition in `modes.ts` that consumes the impact-report selection
5. Wire fast-lane-tests lane into `fast` mode and `pr` mode

**Acceptance Criteria**:
- Impact report emits "Fast-lane tests" section listing relevant test files
- Fast mode runs only changed-area tests
- PR mode includes changed-area tests as a first-pass lane

**Validation**: Modify a server file, run fast lane, verify only server tests execute.

---

### Phase 3: Core Smoke Set

**Objective**: Define a tiny fixed set of critical-path smoke tests that always run in fast lane.

**Affected Files**: `scripts/quality-gate/modes.ts`, `scripts/quality-gate/types.ts`

**Steps**:
1. Define core smoke test list in `modes.ts` or a new `smoke-set.ts`:
   - Policy/quarantine governance tests (fast, validates gate infrastructure)
   - Small subset of server core tests (authentication, WebSocket basics)
2. Add `core-smoke` lane definition with `kind: 'sequential'` and fast timeout
3. Wire `core-smoke` lane as always-required in `fast` mode (before changed-area tests)
4. Measure core smoke set runtime; adjust size if it threatens the 1-minute budget

**Acceptance Criteria**:
- Core smoke set completes in < 20 seconds
- Core smoke set always runs in fast mode regardless of changed files
- Core smoke set provides meaningful system integrity signal

**Validation**: Run fast lane with no changes and measure core smoke duration.

---

### Phase 4: Layered PR Mode Refinement

**Objective**: Reorganize PR mode to run fast checks first, then area-specific checks, then heavy checks only when needed.

**Affected Files**: `scripts/quality-gate/modes.ts`, `scripts/quality-gate/runner.ts`

**Steps**:
1. Restructure PR mode lane ordering:
   - Layer 1: impact-report + policy-checks (always)
   - Layer 2: core-smoke + changed-area tests (always)
   - Layer 3: area-specific checks (conditional on impact)
   - Layer 4: coverage (changed-line)
   - Layer 5: heavy checks (conditional on risk)
2. Update `filterLanesForOptions()` in `runner.ts` to support layered execution
3. Ensure PR mode still runs all required checks for low-risk changes within 5 minutes
4. Verify that high-risk changes correctly escalate to heavy checks

**Acceptance Criteria**:
- PR mode completes in < 5 minutes for low-risk changes
- PR mode includes all necessary area-specific checks
- PR mode correctly escalates for high-risk changes
- `bun run verify` still works as PR entrypoint

**Validation**: Time `bun run verify` with low-risk and high-risk changes.

---

### Phase 5: Risk-Based Escalation

**Objective**: Define explicit risk triggers in `change-policy.ts` that escalate E2E, live-provider, and release gates.

**Affected Files**: `scripts/pr/change-policy.ts`, `scripts/pr/impact-report.ts`, `scripts/quality-gate/modes.ts`

**Steps**:
1. Add `RiskLevel` type to `types.ts`: `'low' | 'medium' | 'high'`
2. Add risk escalation rules to `change-policy.ts`:
   - `high`: Tauri/native code paths → trigger native-checks
   - `high`: Provider/runtime paths → trigger live-provider checks
   - `high`: Release-sensitive paths (CI workflows, release scripts) → trigger release gates
   - `medium`: Desktop state/API layer → may need integration tests
3. Extend `riskNotes()` in `impact-report.ts` to emit `escalatedChecks` section
4. Add `impactRequiredCheck` rules for escalated lanes based on risk level
5. Ensure PR mode respects risk escalation and runs heavy checks when triggered

**Acceptance Criteria**:
- Tauri/native path changes trigger native-checks in PR mode
- Provider path changes trigger live-provider checks
- Release-sensitive path changes trigger release gates
- Low-risk changes skip heavy checks

**Validation**: Create fixture changes for each risk category and verify escalation.

---

### Phase 6: Output Semantics

**Objective**: Extend quality-gate reporter to emit clear "fast feedback" vs "PR readiness" labels.

**Affected Files**: `scripts/quality-gate/runner.ts`, `scripts/quality-gate/types.ts`

**Steps**:
1. Add `feedbackType: 'fast' | 'full'` to report types in `types.ts`
2. Set `feedbackType: 'fast'` for fast mode reports
3. Set `feedbackType: 'full'` for PR, baseline, and release mode reports
4. Add `readyForMerge: boolean` field — always `false` for fast mode
5. Add prominent "DEVELOPMENT SIGNAL - NOT PR READY" banner for fast mode
6. Add "PR READINESS" label for PR mode
7. Add "ESCALATED CHECKS" label when heavy checks are triggered

**Acceptance Criteria**:
- Fast mode output contains "DEVELOPMENT SIGNAL" and "NOT PR READY"
- Fast mode report has `readyForMerge: false`
- PR mode output contains "PR READINESS"
- Escalated output contains "ESCALATED CHECKS"
- JSON report includes `feedbackType` field

**Validation**: Run fast mode and PR mode; inspect output labels.

---

### Phase 7: Coverage Strategy Implementation

**Objective**: Implement changed-line coverage for PR mode while preserving full coverage in baseline and release modes.

**Affected Files**: `scripts/quality-gate/modes.ts`, `scripts/quality-gate/runner.ts`, `scripts/quality-gate/coverage.ts`

**Steps**:
1. Add `coverageMode: 'changed-line' | 'full'` to lane configuration in `modes.ts`
2. Set PR mode coverage lanes to `coverageMode: 'changed-line'`
3. Set baseline and release mode coverage lanes to `coverageMode: 'full'`
4. Extend `runner.ts` to pass `--changed` flag to coverage tooling when `coverageMode: 'changed-line'`
5. Verify changed-line coverage uses git diff to identify relevant lines
6. Ensure coverage ratchet still enforces thresholds for changed lines
7. Measure changed-line coverage runtime; if too fast (weak signal) or too slow, adjust strategy

**Acceptance Criteria**:
- PR mode runs changed-line coverage only
- Baseline mode runs full coverage
- Release mode runs full coverage
- Coverage thresholds enforced for changed lines
- Changed-line coverage runtime fits within 5-minute PR target

**Validation**: Run PR mode with a low-risk change and verify changed-line coverage output.

---

### Phase 8: Regression Tests

**Objective**: Add regression tests that verify routing, escalation, and output semantics work correctly.

**Affected Files**: New test file `scripts/quality-gate/__tests__/routing.test.ts`

**Steps**:
1. Write tests for fast mode lane composition:
   - Fast mode includes core-smoke + changed-area tests
   - Fast mode excludes coverage, native-checks, quarantine
2. Write tests for changed-area test selection:
   - Server file change selects server tests
   - Desktop file change selects desktop tests
   - Adapter file change selects adapter tests
3. Write tests for risk escalation:
   - Native path triggers native-checks
   - Provider path triggers live-provider checks
   - Release path triggers release gates
4. Write tests for output semantics:
   - Fast mode reports have `feedbackType: 'fast'` and `readyForMerge: false`
   - PR mode reports have `feedbackType: 'full'`
5. Write tests for coverage strategy:
   - PR mode uses changed-line coverage
   - Baseline mode uses full coverage
   - Release mode uses full coverage

**Acceptance Criteria**:
- All routing regression tests pass
- Test coverage for routing logic ≥ 80%
- Tests cover all success criteria SC-001 through SC-006

**Validation**: Run `bun test scripts/quality-gate/__tests__/routing.test.ts`

## Success Criteria Traceability

| SC ID | Criterion | Plan Location | Validation |
| --- | --- | --- | --- |
| SC-001 | Fast lane under 1 minute | Phase 1, Phase 3 | Time `bun run quality:fast` |
| SC-002 | PR/verify under 5 minutes for routine changes | Phase 4, Phase 7 | Time `bun run verify` with low-risk change |
| SC-003 | Explainable routing | Phase 2, Phase 5 | Impact report shows test selection reasoning |
| SC-004 | High-risk triggers heavy checks | Phase 5 | Fixture changes verify escalation |
| SC-005 | Clear output semantics | Phase 6 | Output labels and JSON fields |
| SC-006 | Regression tests for routing | Phase 8 | All routing tests pass |

## Decision Preservation Check

- LD-001 (fast mode in modes.ts) → Phase 1
- LD-002 (extend impact-report for test selection) → Phase 2
- LD-003 (core smoke set) → Phase 3
- LD-004 (changed-line coverage for PR) → Phase 7
- LD-005 (risk escalation in change-policy.ts) → Phase 5
- LD-006 (output semantics in reporter) → Phase 6
- LD-007 (verify remains PR entrypoint) → Phase 4
- MP-010 (fast success ≠ PR readiness) → Phase 6 (readyForMerge: false)
- MP-011 (impact graph deferred) → Phase 2 (uses area classification, not impact graph)

## Research Adoption Check

- D-001 (fast mode in modes.ts) → Phase 1 implementation
- D-002 (extend impact-report for test selection) → Phase 2 implementation
- D-003 (core smoke set) → Phase 3 implementation
- D-004 (changed-line coverage) → Phase 7 implementation, runtime validation required
- D-005 (risk escalation) → Phase 5 implementation
- D-006 (output semantics) → Phase 6 implementation
- Pitfall "silent bypass" → Implementation Constitution forbids silent bypass
- Pitfall "fast success = merge-ready" → Phase 6 enforces readyForMerge: false

## Complexity Tracking

No constitution violations requiring justification.
