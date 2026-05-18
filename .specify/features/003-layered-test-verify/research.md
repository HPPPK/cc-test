# Research: Layered Test Verification

**Feature Branch**: `003-layered-test-verify`
**Created**: 2026-05-17
**Status**: Complete

## Executive Summary

This research confirms that the existing quality-gate architecture provides a solid foundation for implementing layered test verification. The key findings support extending `modes.ts` and `runner.ts` to add a fast-lane mode, and leveraging existing `impact-report.ts` and `change-policy.ts` for test selection.

## Decision Log

### D-001: Fast Lane Mode Implementation

**Decision**: Add a new `fast` mode in `modes.ts` that runs only impact-report and a minimal fast-checks lane.

**Rationale**: The existing architecture already supports mode-based lane selection. Adding a `fast` mode is the cleanest extension that preserves backward compatibility.

**Alternatives Considered**:
- New parallel test system: Rejected (MP-003 requires reusing existing architecture)
- Separate CLI command: Considered but would duplicate lane selection logic

**Source Confidence**: verified (codebase inspection)

**Validation Notes**: Verify fast mode runs under 1 minute with test fixtures.

---

### D-002: Changed-Area Test Selection Strategy

**Decision**: Extend `impact-report.ts` to emit fast-lane test selection based on changed files and `change-policy.ts` area classification.

**Rationale**: `change-policy.ts` already classifies paths into areas (desktop, server, adapters, etc.) and determines which checks are required. The `impact-report.ts` already emits "Required local checks". We can add a "Fast-lane tests" section.

**Alternatives Considered**:
- Test impact graph: Rejected (MP-011 defers to future)
- Simple file-to-test mapping: Too brittle for cross-module risks

**Source Confidence**: verified (codebase inspection)

**Validation Notes**: Verify test selection covers changed-area tests for all major paths.

---

### D-003: Core Smoke Set Definition

**Decision**: Define a tiny fixed set of critical-path smoke tests that always run in fast lane.

**Rationale**: A minimal core set ensures basic system integrity regardless of what changed. The existing `provider-smoke` and `desktop-smoke` lanes provide patterns for smoke tests.

**Composition Recommendation**:
- Policy/quarantine governance tests (fast, validates gate infrastructure)
- A small subset of server core tests (authentication, WebSocket basics)
- Optional: one desktop store test (if desktop area touched)

**Source Confidence**: inferred (pattern from existing smoke lanes)

**Validation Notes**: Measure core smoke set runtime to ensure it fits fast-lane budget.

---

### D-004: Coverage Strategy Under 5-Minute Target

**Decision**: Implement changed-line coverage for PR mode; preserve full coverage in baseline and release modes.

**Rationale**: Full coverage may not fit the 5-minute target. Changed-line coverage provides meaningful signal for PR changes while preserving full coverage in heavier gates.

**Alternatives Considered**:
- Skip coverage entirely: Rejected (MP-008 forbids weakening coverage)
- Make coverage optional: Rejected (weakens quality signal)
- Always run full coverage: May exceed 5-minute target

**Source Confidence**: assumed (runtime estimates)

**Validation Notes**: Measure changed-line coverage runtime; escalate to full coverage if changed-line is too fast or too weak.

---

### D-005: Risk-Based Escalation for Heavy Checks

**Decision**: Define explicit risk triggers in `change-policy.ts` that escalate E2E, live-provider, and release gates.

**Rationale**: The existing `change-policy.ts` already has path classification logic. We can add risk escalation rules that mark certain paths as "high-risk" and trigger heavy checks even in fast PR mode.

**Risk Triggers**:
- Tauri/native code changes
- Provider/runtime paths
- Release-sensitive paths (CI workflows, release scripts)
- Desktop state/API layer changes (may need integration tests)

**Source Confidence**: verified (existing `riskNotes()` function in impact-report.ts)

**Validation Notes**: Regression tests must verify high-risk paths trigger heavy checks.

---

### D-006: Output Semantics Implementation

**Decision**: Extend quality-gate reporter to emit clear "fast feedback" vs "PR readiness" labels.

**Rationale**: The reporter already emits structured output. We can add `feedbackType: 'fast' | 'full'` and enforce that fast-lane reports never claim "PR-ready".

**Source Confidence**: verified (reporter.ts patterns)

**Validation Notes**: User testing with output samples to verify clarity.

---

## Common Pitfalls to Avoid

1. **Silent bypass of quality checks**: Every skipped check must be explainable via risk assessment
2. **Fast success = merge-ready**: Reports must explicitly label fast feedback as development signal
3. **Over-optimistic time budgets**: Measure actual runtime before committing to targets
4. **Test selection overfit**: Simple file-to-test mapping misses cross-module risks
5. **Coverage weakening**: Any coverage change must be explicit, not accidental

## Environment and Dependency Notes

- Bun runtime required for scripts
- Existing test infrastructure (Vitest for desktop, Bun test for server)
- Coverage tools already configured
- No new external dependencies required

## Assumptions Log

| Assumption | Status | Impact if Wrong |
|------------|--------|-----------------|
| Fast lane can complete in <1 minute | unverified | May need smaller core smoke set |
| Changed-line coverage is meaningful | assumed | May need fallback to full coverage |
| Desktop build can be split | unverified | May need to keep desktop build in heavy gate |

## Validation Strategy

1. Implement fast mode with minimal lanes
2. Measure runtime with representative changes
3. Adjust core smoke set size if needed
4. Verify coverage strategy produces meaningful signal
5. Test risk escalation with high-risk path fixtures
