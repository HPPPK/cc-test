# Feature Specification: Layered Test Verification

**Feature Branch**: `003-layered-test-verify`  
**Created**: 2026-05-17  
**Status**: Aligned: ready for plan  
**Input**: Discussion handoff from `.specify/discussions/test-suite-slimming/handoff-to-specify.md`

## Brainstorming Truth Inputs

- **Route**: feature-extension (extends existing quality-gate architecture)
- **Complexity**: T2-Structured
- **Truth Owner**: repo (fresh project cognition)
- **Must Preserve**:
  - `bun run verify` remains PR readiness entrypoint
  - Quality contracts (coverage, same-area tests, quarantine, release confidence) preserved
  - Fast-lane success is NOT merge-ready signal
- **Allowed Optimization Scope**:
  - Refine lane selection logic
  - Add fast-lane mode definition
  - Extend impact-report and change-policy
  - Optimize test selection without deleting high-signal tests
- **Soft Unknowns Carried**:
  - full_coverage_handling: deferred to sp-plan (coverage strategy under 5-minute target)

## Must-Preserve Discussion Inputs

- **Source**: `.specify/discussions/test-suite-slimming/handoff-to-specify.md`
- **Coverage Status**: product-and-technical-discussion-covered
- **Planning Gate Status**: ready-for-specify

### Mapped Must-Preserve Items

- `MP-001` goal: Make tests lighter/faster while preserving quality → spec.md#feature-goal
- `MP-002` scope: Under-1-minute fast lane + 5-minute PR/verify → spec.md#current-delivery-boundary
- `MP-003` decision: Layered PR Gate using existing architecture → spec.md#decision-capture
- `MP-004` decision: Changed-area tests + core smoke as fast evidence → spec.md#capability-decomposition
- `MP-005` decision: Preserve verify as PR entrypoint → context.md#must-preserve-execution-constraints
- `MP-006` decision: E2E/live-provider/release conditional → spec.md#capability-decomposition
- `MP-007` decision: Quality = regression protection + low flake + changed-area coverage → spec.md#success-criteria
- `MP-008` non_goal: Do not weaken quality contracts → context.md#must-preserve-execution-constraints
- `MP-009` reference: Existing gate surfaces → context.md#canonical-references
- `MP-010` tradeoff: Fast success ≠ PR readiness → spec.md#decision-capture
- `MP-011` tradeoff: Impact graph deferred → spec.md#deferred--future-ideas
- `MP-012` question: Coverage strategy under 5-min target → spec.md#unresolved (deferred to sp-plan)

## Overview *(mandatory)*

### Feature Goal

Add a layered test verification workflow that provides an under-1-minute fast feedback lane for local development and reorganizes ordinary PR/verify feedback toward a 5-minute target for routine changes, without weakening the project's existing quality contracts.

This matters because:
- Contributors and AI coding agents need fast, trustworthy verification during development
- Current PR/verify can be slow for routine changes, discouraging frequent verification
- The project already has sophisticated quality-gate infrastructure that can be extended

### Intended Users and Value

- **Primary users / roles**: 
  - Contributors making local changes who need fast feedback
  - Maintainers reviewing PRs and ensuring quality
  - AI coding agents that need fast but trustworthy verification before handoff
- **Problem or opportunity**: Tests are currently too slow for frequent local runs; PR/verify takes too long for routine changes
- **First-release outcome**: A fast lane (under 1 minute) for local feedback plus a layered PR/verify path (targeting under 5 minutes for routine changes) that preserves all existing quality contracts

## Ideal Complete Requirement Shape

### Complete Capability Shape

- **Fast verification lane**: Changed-area high-signal unit tests plus a tiny fixed core smoke set, completing in seconds to under 1 minute
- **Layered PR/verify**: Early fast signal, then only required area checks, then conditional heavy evidence (E2E, live-provider, release gates)
- **Risk-based escalation**: High-risk paths (desktop, server, adapter, native, provider/runtime, release-sensitive) trigger heavier checks
- **Explainable routing**: Lane selection explained by changed files and risk notes
- **Clear output semantics**: Reports distinguish fast feedback from PR readiness

### Complete Usage Expectations

- Contributor runs fast lane locally before committing → gets under-1-minute feedback on changed-area behavior
- PR/verify runs → fast checks first, then area-specific checks, then conditional heavy evidence based on risk
- High-risk change → heavy checks triggered automatically
- Fast-lane success → clearly labeled as development signal, NOT merge-ready

### Domain-Expected Completeness Checks

- Fast lane must include meaningful test signal, not just lint/typecheck
- PR/verify must preserve same-area test requirements
- Coverage policy must be preserved (or explicitly changed with maintainer approval)
- Release confidence gates must remain available
- Output must prevent false readiness claims

## Current Delivery Boundary

### In Scope

- Add a fast lane targeting seconds to under 1 minute
- Reorganize ordinary `bun run verify` / `quality:pr` toward a 5-minute target for routine changes
- Reuse existing impact-report, change-policy, and quality-gate lane architecture
- Use changed-area high-signal unit tests plus a tiny fixed core smoke set as fast-lane evidence
- Keep E2E, live-provider, and release-gate evidence conditional for ordinary PR/verify
- Preserve quality contracts around same-area tests, quarantine governance, persistence upgrade checks, coverage policy, and release confidence
- Make output clear that fast-lane success is development signal, not PR readiness

### Out of Scope

- Full expansion-ready test impact graph (deferred to future feature)
- Deleting tests merely to reduce runtime
- Weakening coverage baselines or thresholds without explicit maintainer approval
- Making live-provider, broad E2E, or release gates part of the default fast lane
- Replacing `bun run verify` as the PR readiness entrypoint

### Boundary Constraints

- Must preserve `bun run verify` as PR readiness entrypoint
- Must not weaken coverage policy silently
- Must not bypass same-area test requirements
- Must maintain quarantine governance
- Must preserve release confidence gates

## Scenarios and Usage Paths *(mandatory)*

### Primary Scenario - Fast Local Verification

Contributor makes local changes and wants quick feedback before committing.

**Usage Path**:
1. Contributor edits source files (e.g., server route, utility function)
2. Contributor runs `bun run quality:fast` (or equivalent fast-lane command)
3. Fast lane runs changed-area unit tests + core smoke in under 1 minute
4. Contributor sees clear feedback: "Fast check passed (development signal, not PR-ready)"

**Acceptance Signals**:
- Fast lane completes in under 1 minute for routine changes
- Output clearly distinguishes fast feedback from PR readiness
- Changed-area tests are actually executed (not just lint/typecheck)

---

### Secondary Scenario - Layered PR Verification

PR is submitted and CI runs PR/verify gate.

**Usage Path**:
1. PR is opened with changes to server code
2. CI runs `bun run verify` (quality:pr)
3. Fast checks run first (early fail if broken)
4. Area-specific checks run (server tests, not desktop/adapter)
5. Heavy checks (E2E, live-provider, coverage) run only if risk triggers match
6. PR gets feedback in under 5 minutes for routine changes

**Acceptance Signals**:
- PR/verify completes faster for routine changes
- High-risk paths still trigger heavy checks
- Same-area test requirements preserved

---

### Edge Cases and Failure Paths

- **High-risk change**: Desktop core, provider runtime, or release-sensitive path → heavy checks triggered automatically
- **Coverage cannot fit 5-minute target**: Coverage strategy decided explicitly (changed-line-first, conditional, or escalated) - not silently bypassed
- **Fast-lane failure**: Clear failure output with actionable guidance
- **Misclassification risk**: Regression tests prove lane routing does not skip required checks

## Capability Decomposition *(mandatory)*

### Capability Map

- **Capability 1: Fast Lane Definition**
  Purpose: Define and implement under-1-minute fast verification lane
  Supports: Primary Scenario (Fast Local Verification)
  Depends on: Existing quality-gate architecture (modes.ts, runner.ts)
  Delivery note: Core capability

- **Capability 2: Changed-Area Test Selection**
  Purpose: Select high-signal unit tests based on changed files
  Supports: Capability 1, Capability 3
  Depends on: Existing impact-report.ts, change-policy.ts
  Delivery note: Core capability

- **Capability 3: Core Smoke Set**
  Purpose: Tiny fixed set of critical-path smoke tests
  Supports: Capability 1
  Depends on: Existing smoke infrastructure
  Delivery note: Enabling capability

- **Capability 4: Layered PR Mode**
  Purpose: Reorganize PR/verify into fast → area-specific → conditional heavy
  Supports: Secondary Scenario (Layered PR Verification)
  Depends on: Capability 1, Capability 2, existing quality-gate modes
  Delivery note: Core capability

- **Capability 5: Risk-Based Escalation**
  Purpose: Trigger heavy checks for high-risk paths
  Supports: Capability 4
  Depends on: Existing change-policy.ts risk classification
  Delivery note: Core capability

- **Capability 6: Output Semantics**
  Purpose: Clear labeling distinguishing fast feedback from PR readiness
  Supports: All scenarios
  Depends on: Existing quality-gate reporter
  Delivery note: Validation-oriented

### Capability Relationships

- Capability 1 depends on Capability 2 and Capability 3
- Capability 4 depends on Capability 1 and Capability 5
- Capability 6 cross-cuts all capabilities

## Implementation-Oriented Analysis *(mandatory)*

### Preconditions and Dependencies

- Existing quality-gate architecture (scripts/quality-gate/)
- Existing impact-report and change-policy infrastructure (scripts/pr/)
- Fresh project cognition for architectural decisions
- Existing test surfaces: src/server/__tests__/, desktop/src/__tests__/, adapters/__tests__/

### Data, State, and Entity Considerations

- Lane definitions in modes.ts (new fast mode, refined PR mode)
- Test selection metadata (changed-file to test-file mapping)
- Risk trigger configuration (high-risk path patterns)
- Report artifacts must remain compatible with existing expectations

### Event / Trigger Model

- Fast lane: Explicit user command or CI early-fail stage
- PR/verify: CI trigger on PR open/sync
- Heavy checks: Conditional based on risk triggers from changed files

### Protocol / Contract Notes

- `bun run verify` must remain the PR readiness entrypoint
- Quality report schema must remain backward-compatible
- Lane selection must be explainable via changed files and risk notes

### Failure, Retry, and Visibility Semantics

- Fast-lane failure: Clear actionable output, no retry (user fixes and re-runs)
- PR/verify failure: Existing failure semantics preserved
- Heavy check skip: Must be explainable via risk assessment (not silent bypass)

### Configuration and Rollout Notes

- New fast-lane command in package.json scripts
- Potential mode flag for PR/verify to enable layering
- Coverage strategy decision pending (soft unknown)

### Planning-Sensitive Notes

- Coverage strategy under 5-minute target requires explicit decision
- Desktop build may need splitting to meet time targets
- Test selection must not overfit simple file-to-test mapping

## Decision Capture *(mandatory)*

### Locked Decisions

- LD-001: Use existing quality-gate architecture (not new parallel system)
- LD-002: Fast lane = changed-area tests + core smoke (not just lint/typecheck)
- LD-003: Preserve `bun run verify` as PR readiness entrypoint
- LD-004: E2E/live-provider/release gates are conditional (not removed)
- LD-005: Quality = regression protection + low flake + changed-area coverage
- LD-006: Fast success is development signal (NOT merge-ready)
- LD-007: Impact graph deferred to future feature

### Claude Discretion

- Exact test selection algorithm (as long as it targets changed-area high-signal tests)
- Core smoke set composition (as long as it's tiny and covers critical paths)
- Risk trigger patterns (as long as high-risk paths trigger heavy checks)

### Canonical References

- `.specify/discussions/test-suite-slimming/technical-options.md` - Option B confirmed
- `scripts/quality-gate/modes.ts` - Existing lane definitions
- `scripts/quality-gate/runner.ts` - Existing runner with impact-based skipping
- `scripts/pr/impact-report.ts` - Existing impact report infrastructure
- `scripts/pr/change-policy.ts` - Existing path classification and risk triggers

## Deferred / Future Ideas

- Expansion-ready test impact graph with durable metadata
- Historical lane duration tracking
- Flake signal integration

## Alignment State *(mandatory)*

### Confirmed

- Feature goal: speed + quality (not speed alone)
- Scope: fast lane + PR/verify layering
- Technical direction: extend existing gate architecture
- Fast evidence: changed-area tests + core smoke
- Quality contracts preserved
- Output semantics: fast ≠ PR-ready

### Inferred

- Implementation surfaces: scripts/quality-gate/, scripts/pr/, package.json
- Test selection will use existing impact-report/change-policy infrastructure
- Core smoke set will be tiny (planner defines exact composition)

### Unresolved

- **UR-001**: Exact coverage handling under 5-minute PR target
  - Owner: sp-plan
  - Options: mandatory coverage, changed-line-first, conditional escalation
  - Constraint: Must not weaken ratchets/baselines without explicit approval

## Risks and Gaps *(mandatory)*

### Planning Risks

- Misclassification risk: changed path routed to too few checks
- Runtime target risk: desktop build or full coverage may exceed 5 minutes
- Policy risk: contributors may treat "fast passed" as "ready"

### Information Gaps

- Exact coverage strategy under 5-minute target (soft unknown, deferred to sp-plan)
- Desktop build splitting feasibility (planner to assess)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Routine local change can run fast lane in seconds to under 1 minute
- **SC-002**: Ordinary PR/verify has credible path to under 5 minutes for non-high-risk changes
- **SC-003**: Fast-lane routing explained by changed files and risk notes
- **SC-004**: High-risk paths trigger heavier checks (E2E, live-provider, release gates)
- **SC-005**: Reports and output clearly distinguish fast feedback from PR readiness
- **SC-006**: Regression tests prove lane routing does not skip required checks for desktop, server, adapter, docs, native, provider/runtime, and release-sensitive paths
