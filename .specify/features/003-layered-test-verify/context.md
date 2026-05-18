# Impact and Constraint Map: Layered Test Verification

**Feature Branch**: `003-layered-test-verify`  
**Created**: 2026-05-17  
**Status**: Ready for planning  
**Derived From**: `spec.md`, `alignment.md`, discussion handoff, and project cognition

## Brainstorming-Derived Execution Context

- **Truth Owner**: repo
- **Primary Route**: feature-extension
- **Complexity Level**: T2-Structured
- **Compatibility Constraints**:
  - Preserve `bun run verify` as PR readiness entrypoint
  - Preserve quality contracts (coverage, same-area, quarantine, release)
  - Maintain backward-compatible report schema
- **Must-Preserve Invariants**:
  - Fast-lane success is NOT merge-ready signal
  - Same-area test requirements preserved
  - Coverage baselines not weakened without approval
  - Quarantine governance preserved
  - Release confidence gates preserved
- **Allowed Internal Redesign**:
  - Yes: Refine lane selection, test selection, risk triggers within existing architecture
- **Allowed Optimization Scope**:
  - Add fast-lane mode definition
  - Extend impact-report for fast-lane signals
  - Refine change-policy risk triggers
  - Optimize test selection without deleting high-signal tests
- **Stop-And-Reopen Conditions**:
  - Implementation weakens quality contracts
  - Fast-lane success presented as PR readiness
  - Implementation ignores existing architecture for parallel system
  - Either fast lane or PR/verify layering dropped

## Must-Preserve Execution Constraints

- `MP-005`: Preserve `bun run verify` / `quality:pr` as PR readiness entrypoint
  - Stop-and-reopen: PR readiness moved to undocumented command
- `MP-008`: Do not weaken coverage baselines, same-area tests, quarantine, or release confidence
  - Stop-and-reopen: Coverage or governance checks bypassed by default
- `MP-010`: Fast-lane success is development signal, not PR readiness
  - Stop-and-reopen: Fast pass presented as merge-ready

## Affected Surfaces

- **Primary**: scripts/quality-gate/modes.ts (new fast mode, refined PR mode)
- **Primary**: scripts/quality-gate/runner.ts (lane selection, early-fail semantics)
- **Primary**: scripts/pr/impact-report.ts (fast-lane signals)
- **Primary**: scripts/pr/change-policy.ts (risk triggers)
- **Secondary**: scripts/quality-gate/types.ts (lane metadata)
- **Secondary**: package.json (new fast-lane script)
- **Secondary**: scripts/quality-gate/*.test.ts, scripts/pr/*.test.ts (regression tests)

## Upstream Dependencies

- Existing quality-gate architecture (modes.ts, runner.ts, coverage.ts)
- Existing impact-report and change-policy infrastructure
- Project cognition (fresh, provides architectural context)
- Existing test surfaces (server, desktop, adapter tests)

## Downstream Dependencies and Consumers

- CI workflows calling `bun run verify`
- Contributors running local fast checks
- AI coding agents using fast verification before handoff
- Quality report consumers (artifacts/quality-runs/)

## Product Boundary Constraints

- First slice: fast lane + PR/verify layering only
- Deferred: expansion-ready test impact graph
- Quality contracts must be preserved or explicitly changed with maintainer approval

## Domain-Expected Completeness Checks

- Fast lane must include meaningful test signal (not just lint/typecheck)
- PR/verify must preserve same-area test requirements
- Output must prevent false readiness claims
- Risk triggers must cover desktop, server, adapter, native, provider/runtime, release-sensitive paths

## Critical Adjacent Effects

- Desktop build may need splitting to meet time targets
- Coverage strategy decision affects PR/verify behavior
- Test selection affects which tests run for given changes

## Existing Capability and Reuse Notes

- Existing impact-aware quality gate (runner.ts already supports lane selection and impact-based skipping)
- Existing path classification (change-policy.ts classifies desktop/server/adapter/docs/release paths)
- Existing coverage enforcement (coverage.ts enforces suites, ratchet, thresholds, changed-line coverage)
- Existing smoke infrastructure (provider-smoke, desktop-smoke)

## Change Propagation Matrix

| Change Surface | Upstream Inputs | Downstream Consumers | Constraint / Risk |
| --- | --- | --- | --- |
| scripts/quality-gate/modes.ts | mode definitions | runner.ts, CI workflows | Must preserve existing modes |
| scripts/quality-gate/runner.ts | modes, impact-report | CI workflows, reports | Backward-compatible behavior |
| scripts/pr/impact-report.ts | changed files | runner.ts, change-policy | Existing contract preserved |
| scripts/pr/change-policy.ts | changed paths | impact-report, runner | Risk triggers must be correct |
| package.json scripts | mode flags | contributors, CI | verify must remain entrypoint |

## Locked Decisions Carry-Forward

- LD-001: Use existing quality-gate architecture
- LD-002: Fast lane = changed-area tests + core smoke
- LD-003: Preserve `bun run verify` as PR readiness entrypoint
- LD-004: E2E/live-provider/release gates conditional
- LD-005: Quality = regression protection + low flake + changed-area coverage
- LD-006: Fast success ≠ merge-ready
- LD-007: Impact graph deferred

## Canonical References

- `.specify/discussions/test-suite-slimming/technical-options.md` - Option B confirmed
- `.specify/project-cognition/status.json` - Fresh cognition evidence
- `.specify/project-cognition/coverage.json` - Test surface classification
- `scripts/quality-gate/modes.ts` - Existing lane definitions
- `scripts/quality-gate/runner.ts` - Existing runner
- `scripts/pr/impact-report.ts` - Existing impact infrastructure
- `scripts/pr/change-policy.ts` - Existing path classification

## Outstanding Questions

- **UR-001**: Exact coverage handling under 5-minute PR target
  - Owner: sp-plan
  - Options: mandatory coverage, changed-line-first, conditional escalation
  - Constraint: Must not weaken ratchets/baselines without explicit approval

## Deferred / Future Ideas

- Expansion-ready test impact graph with durable metadata
- Historical lane duration tracking for adaptive budgets
- Flake signal integration for test selection
