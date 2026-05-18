# Tasks: Layered Test Verification

**Feature Branch**: `003-layered-test-verify`
**Created**: 2026-05-18
**Status**: Ready for `/sp.analyze`
**Plan**: `.specify/features/003-layered-test-verify/plan.md`

## Summary

Generate an immediately executable task package for the layered test verification feature. Implementation remains blocked until `/sp.analyze` validates this package. The graph is parallel-ready for isolated tests and some independent implementation lanes, but shared source surfaces are serialized through explicit join points.

## Planning Inputs

- **Active profile**: Standard Delivery. No reference implementation fidelity contract is active.
- **Execution model**: `subagent-mandatory`; execution surface: `native-subagents`.
- **Current ready batch dispatch**: `dispatch_shape: parallel-subagents` for T001/T002 because both tasks are read-only.
- **Cognition advisory**: project cognition query returned `needs_update` only for missing `.specify/testing/` coverage. Artifact-only `sp-tasks` continues with minimal live reads and records this as advisory, not a runtime refresh requirement.
- **Locked decisions**: LD-001 fast mode in `modes.ts`; LD-002 changed-area selection in `impact-report.ts`; LD-003 tiny core smoke; LD-004 changed-line PR coverage with full baseline/release coverage; LD-005 risk escalation in `change-policy.ts`; LD-006 output semantics in reporter; LD-007 `bun run verify` remains PR readiness entrypoint.
- **Implementation constitution**: Extend existing quality-gate architecture only. No parallel test system, no silent bypass, no coverage weakening, and no fast report claiming merge readiness.
- **Missing optional artifacts**: `data-model.md` and `contracts/` are absent. Task-local contract surfaces are `package.json` scripts, `scripts/quality-gate/types.ts`, quality report artifacts, and PR impact output sections.

## Consequence Analysis

### Affected Object Map

- Commands: `bun run verify`, `quality:pr`, `quality:gate --mode pr`, new `quality:fast`, `check:coverage`, `check:quarantine`, `check:native`, live baseline/smoke modes.
- Files: `package.json`, `scripts/quality-gate/types.ts`, `modes.ts`, `runner.ts`, `reporter.ts`, `scripts/pr/change-policy.ts`, `scripts/pr/impact-report.ts`, focused test files, `quickstart.md`.
- Consumers: local contributors, AI coding agents, CI workflows, quality report readers, release maintainers, coverage/quarantine governance.

### State-Behavior Matrix

| State | Required behavior |
| --- | --- |
| created | New fast mode exists only after T008/T009 and must not replace verify. |
| queued | Parallel tasks may run only when write scopes do not overlap; shared surfaces wait for joins. |
| running | Impact-based skips must log the reason in lane logs and report output. |
| failed | Fast/PR failures preserve existing nonzero exit semantics and actionable lane logs. |
| completed | Fast completion is development signal only; PR completion remains readiness signal. |
| stale | If coverage/risk runtime evidence contradicts assumptions, reopen plan or tasks before implementation continues. |
| partially refreshed | Missing cognition coverage for `.specify/testing/` stays advisory during artifact-only work. |

### Dependency Impact Table

| Surface | Direct dependency | Indirect consumers | Validation route |
| --- | --- | --- | --- |
| `types.ts` | modes, runner, reporter, tests | report JSON consumers | `bun test scripts/quality-gate/runner.test.ts` |
| `modes.ts` | runner lane selection | CI and local quality scripts | `fast-mode.test.ts`, `layered-pr.test.ts`, dry-run gates |
| `runner.ts` | modes, impact report logs, coverage | `artifacts/quality-runs` reports | runner/layered/coverage tests |
| `change-policy.ts` | impact-report, PR policy tests | GitHub workflow labels and required checks | PR tests and fixture paths |
| `impact-report.ts` | changed files and policy result | runner `impactRequiredCheck` decisions | impact tests and `check:impact --files` |
| `reporter.ts` | `QualityGateReport` fields | humans, markdown/JUnit consumers | layered output tests |

### Recovery And Validation Contract

- Rollback: each shared surface has one owning task at a time; repair the smallest owning task before downstream joins continue.
- Retry/idempotency: quality dry-runs and focused tests must be repeatable without live credentials.
- Cleanup: generated `artifacts/quality-runs/` are validation evidence only and must not be committed.
- Observability: every skip, escalation, and readiness label must appear in report output or lane logs.
- Validation: final focused commands are in T020; release/live confidence remains explicit blocker unless provider credentials exist.

### Coverage Gaps

| Gap | Owner | Latest safe resolve phase | Routing decision |
| --- | --- | --- | --- |
| `.specify/testing/` absent from cognition index | future map maintenance | before future testing-control-plane work | Continue now with advisory; do not refresh runtime for artifact-only tasks. |
| Fast-lane and PR runtime budgets unmeasured | T020 implementer | before T021 quickstart update | Continue with explicit measurement task. |
| Changed-line coverage signal strength assumed | T013/T020 implementers | before final validation | Continue; reopen if ratchet signal is weak or slow. |
| Live provider/release confidence unavailable in normal PR gate | maintainer | before release readiness | Continue; report live blocker instead of claiming release confidence. |

### Consequence Obligation Mapping

| CA ID | Claim | Affected objects | Tasks / join points | Stop-and-reopen condition |
| --- | --- | --- | --- | --- |
| CA-001 | Preserve `bun run verify` / `quality:pr` as the PR readiness entrypoint. | `package.json`, CI workflows, contributors | T009, T012, T020, JP-3, JP-4 | Any task replaces verify with `quality:fast` or presents fast lane as PR readiness. |
| CA-002 | Fast-lane success remains a development signal and never merge-ready. | report JSON, report markdown, terminal output, quickstart | T003, T008, T009, T017, T018, T021, JP-5 | Fast report has `readyForMerge: true` or lacks NOT PR READY labeling. |
| CA-003 | Skipped lanes must be explainable through impact/risk assessment, not silent bypass. | impact logs, runner filtering, report matrix | T002, T004, T010, T011, T013, T015, JP-3, JP-4 | A required check can be skipped without a visible reason. |
| CA-004 | Coverage ratchets, quarantine governance, same-area tests, and release confidence are preserved. | coverage, quarantine, baseline, release modes | T003, T006, T007, T012, T013, T016, T020, JP-4 | Coverage, quarantine, or release checks are removed without approval. |
| CA-005 | High-risk native, provider/runtime, release-sensitive, desktop, server, adapter, and docs paths escalate to the right checks. | change policy, impact report, modes | T005, T014, T015, T016, JP-4 | A high-risk fixture path routes to low-risk checks or skips required evidence. |
| CA-006 | Quality report schema changes remain backward-compatible for existing report consumers. | `report.json`, `report.md`, `junit.xml` | T001, T006, T007, T017, T018, JP-5 | Existing report fields are removed or schema changes without migration guidance. |

## Analyze Remediation Mapping

| Finding ID | Disposition | Task/Section Evidence | Notes |
| --- | --- | --- | --- |
| No prior analyze blockers | not_applicable | `workflow-state.md` gate_status was cleared before this refreshed task pass | No remediation blocker bundle was open. |

## Task Guardrail Index

| Tasks | Guardrails |
| --- | --- |
| T001-T002 | Confirm existing architecture; no source writes; MP-003, MP-009, CA-001, CA-003. |
| T003-T006 | RED tests first; tests must fail only for missing planned behavior; SC-001..SC-006. |
| T007 | Serial shared type surface; backward-compatible report schema; CA-006. |
| T008-T011 | Fast lane must be changed-area tests plus core smoke; fast success not PR-ready; MP-004, MP-010. |
| T012-T016 | PR mode remains verify entrypoint; coverage ratchets preserved; high-risk paths escalate; CA-001, CA-004, CA-005. |
| T017-T018 | Output labels are mandatory; fast mode `readyForMerge=false`; CA-002, CA-006. |
| T019-T021 | Review/validation/docs only; do not claim live release readiness without evidence. |

## Reference Fidelity Mapping

No reference implementation fidelity profile is active. Existing repository surfaces are the boundary-defining references: `modes.ts`, `runner.ts`, `types.ts`, `reporter.ts`, `impact-report.ts`, `change-policy.ts`, and `package.json`.

## Task Defaults

- **Default forbidden paths**: `.env`, `.env.*`, `**/*.secret`, `**/credentials/**`, `**/secrets/**`, `node_modules/**`, `desktop/node_modules/**`, `adapters/**/node_modules/**`, `artifacts/**`, `.git/**`, task-generation artifacts unless explicitly owned.
- **Default context pointers**: `spec.md#Scenarios and Usage Paths`, `spec.md#Success Criteria`, `plan.md#Locked Planning Decisions`, `plan.md#Implementation Constitution`, `context.md#Affected Surfaces`, `package.json#scripts`, `scripts/quality-gate/types.ts#QualityGateReport`.
- **Default handoff format**: `status`, `changed_files`, `validation_output`, `concerns`, `recovery_hints`.

## Tasks
### Phase 0: Implementation Guardrails

**Goal**: Confirm existing architecture before edits and preserve the no-parallel-system guardrail.

- [X] T001 [P] [Agent: executor] Confirm quality-gate mode, runner, and reporter patterns in scripts/quality-gate/modes.ts, scripts/quality-gate/runner.ts, scripts/quality-gate/reporter.ts
  - agent: executor
  - depends_on: none
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | plan.md#Implementation Constitution |
    | Task-specific reference | scripts/quality-gate/modes.ts#lanesForMode |
    | Task-specific reference | scripts/quality-gate/runner.ts#runQualityGateLanes |
    | Task-specific reference | scripts/quality-gate/reporter.ts#renderMarkdownReport |
  - write_scope: []
  - read_scope: [scripts/quality-gate/modes.ts, scripts/quality-gate/runner.ts, scripts/quality-gate/reporter.ts, scripts/quality-gate/types.ts, .specify/features/003-layered-test-verify/plan.md, .specify/features/003-layered-test-verify/context.md]
  - forbidden: default forbidden paths; all source writes
  - expected_outputs: [Worker handoff notes only (no file writes)]
  - anti_goals: [Do not modify files, do not invent a second quality-gate architecture]
  - acceptance_criteria: [Handoff names existing mode definition shape, impactRequiredCheck filtering, and report writing responsibilities; no files are modified]
  - verify_commands: [`bun test scripts/quality-gate/runner.test.ts`]
  - consequence_obligations: [CA-001, CA-003, CA-006]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T002 [P] [Agent: executor] Confirm PR impact and path policy patterns in scripts/pr/impact-report.ts and scripts/pr/change-policy.ts
  - agent: executor
  - depends_on: none
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | plan.md#Implementation Constitution |
    | Task-specific reference | scripts/pr/change-policy.ts#evaluateChangePolicy |
    | Task-specific reference | scripts/pr/impact-report.ts#Required local checks |
  - write_scope: []
  - read_scope: [scripts/pr/impact-report.ts, scripts/pr/change-policy.ts, scripts/pr/change-policy.test.ts, .specify/features/003-layered-test-verify/plan.md, .specify/features/003-layered-test-verify/context.md]
  - forbidden: default forbidden paths; all source writes
  - expected_outputs: [Worker handoff notes only (no file writes)]
  - anti_goals: [Do not modify files, do not add a standalone impact graph]
  - acceptance_criteria: [Handoff identifies evaluateChangePolicy, current areas, required checks, coverage signals, risk notes, and areasForPath export status; no files are modified]
  - verify_commands: [`bun test scripts/pr/change-policy.test.ts`]
  - consequence_obligations: [CA-003, CA-005]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

**Join Point JP-0: Guardrails Confirmed**
- validation_target: Existing quality-gate and PR policy patterns are named in handoffs.
- validation_command: Review T001/T002 handoffs; no file diffs except task artifacts.
- pass_condition: No implementation work starts until mode, runner, reporter, impact, and policy ownership is understood.

### Phase 1: RED Tests And Contract Locks

**Goal**: Write failing focused tests first for fast mode, test selection, risk escalation, PR layering, coverage strategy, and output semantics.

- [X] T003 [P] [US1] [Agent: test-engineer] Create fast-mode composition RED tests in scripts/quality-gate/fast-mode.test.ts
  - agent: test-engineer
  - depends_on: T001: quality-gate patterns confirmed
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | spec.md#Primary Scenario - Fast Local Verification |
    | Task-specific reference | spec.md#SC-001 |
    | Task-specific reference | plan.md#Phase 1: Fast Lane Mode Definition |
    | Task-specific reference | scripts/quality-gate/runner.test.ts#quality gate modes |
  - write_scope: [scripts/quality-gate/fast-mode.test.ts]
  - read_scope: [scripts/quality-gate/runner.test.ts, scripts/quality-gate/modes.ts, scripts/quality-gate/types.ts, .specify/features/003-layered-test-verify/spec.md, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; implementation files
  - expected_outputs: [scripts/quality-gate/fast-mode.test.ts (new)]
  - anti_goals: [Do not modify implementation files, do not assert fast lane is PR-ready]
  - acceptance_criteria: [Tests assert fast mode includes impact-report/policy-checks/core-smoke/fast-lane-tests, excludes heavy lanes, and fail RED for expected missing fast mode only]
  - verify_commands: [`bun test scripts/quality-gate/fast-mode.test.ts`]
  - consequence_obligations: [CA-002, CA-004]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T004 [P] [US1] [Agent: test-engineer] Create changed-area fast-lane selection RED tests in scripts/pr/fast-lane-selection.test.ts
  - agent: test-engineer
  - depends_on: T002: PR policy patterns confirmed
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | research.md#D-002: Changed-Area Test Selection Strategy |
    | Task-specific reference | spec.md#SC-003 |
    | Task-specific reference | scripts/pr/change-policy.test.ts#evaluateChangePolicy |
  - write_scope: [scripts/pr/fast-lane-selection.test.ts]
  - read_scope: [scripts/pr/change-policy.test.ts, scripts/pr/change-policy.ts, scripts/pr/impact-report.ts, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; implementation files
  - expected_outputs: [scripts/pr/fast-lane-selection.test.ts (new)]
  - anti_goals: [Do not modify implementation files, do not encode a broad impact graph]
  - acceptance_criteria: [Tests cover server, desktop, adapter, docs, and no-change selection cases; tests require explainable output]
  - verify_commands: [`bun test scripts/pr/fast-lane-selection.test.ts`]
  - consequence_obligations: [CA-003, CA-005]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T005 [P] [US2] [Agent: test-engineer] Create risk escalation RED tests in scripts/pr/risk-escalation.test.ts
  - agent: test-engineer
  - depends_on: T002: PR policy patterns confirmed
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | research.md#D-005: Risk-Based Escalation for Heavy Checks |
    | Task-specific reference | spec.md#Edge Cases and Failure Paths |
    | Task-specific reference | spec.md#SC-004 |
  - write_scope: [scripts/pr/risk-escalation.test.ts]
  - read_scope: [scripts/pr/change-policy.test.ts, scripts/pr/change-policy.ts, scripts/pr/impact-report.ts, .specify/features/003-layered-test-verify/spec.md, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; implementation files
  - expected_outputs: [scripts/pr/risk-escalation.test.ts (new)]
  - anti_goals: [Do not modify implementation files, do not make heavy checks always-on for low-risk paths]
  - acceptance_criteria: [Tests assert native/Tauri, provider/runtime, release-sensitive, desktop state/API, server, adapter, and docs paths produce intended risk metadata; low-risk paths do not trigger heavy checks]
  - verify_commands: [`bun test scripts/pr/risk-escalation.test.ts`]
  - consequence_obligations: [CA-003, CA-005]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T006 [P] [US2] [Agent: test-engineer] Create layered PR, changed-line coverage, and output semantics RED tests in scripts/quality-gate/layered-pr.test.ts
  - agent: test-engineer
  - depends_on: T001: quality-gate patterns confirmed
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | plan.md#Phase 4: Layered PR Mode Refinement |
    | Task-specific reference | plan.md#Phase 7: Coverage Strategy Implementation |
    | Task-specific reference | plan.md#Phase 6: Output Semantics |
    | Task-specific reference | scripts/quality-gate/runner.test.ts#runQualityGate |
  - write_scope: [scripts/quality-gate/layered-pr.test.ts]
  - read_scope: [scripts/quality-gate/runner.test.ts, scripts/quality-gate/modes.ts, scripts/quality-gate/runner.ts, scripts/quality-gate/reporter.ts, scripts/quality-gate/coverage.test.ts, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; implementation files
  - expected_outputs: [scripts/quality-gate/layered-pr.test.ts (new)]
  - anti_goals: [Do not modify implementation files, do not remove baseline/release coverage expectations]
  - acceptance_criteria: [Tests assert PR lane order, changed-line PR coverage, full baseline/release coverage, fast feedbackType/readyForMerge semantics, and PR readiness output]
  - verify_commands: [`bun test scripts/quality-gate/layered-pr.test.ts`]
  - consequence_obligations: [CA-001, CA-002, CA-004, CA-006]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

**Join Point JP-1: RED Contracts Written**
- validation_target: Focused tests exist and fail only for missing planned behavior.
- validation_command: `bun test scripts/quality-gate/fast-mode.test.ts scripts/quality-gate/layered-pr.test.ts scripts/pr/fast-lane-selection.test.ts scripts/pr/risk-escalation.test.ts`
- pass_condition: Failures are expected RED failures, not syntax/import/setup errors.

### Phase 2: Shared Type Foundation

**Goal**: Serialize all shared type additions into one task so later workers do not race on `types.ts`.

- [X] T007 [Agent: executor] Add shared quality-gate type extensions in scripts/quality-gate/types.ts
  - agent: executor
  - depends_on: T003: fast-mode tests written; T005: risk tests written; T006: layered PR tests written
  - parallel_safe: false
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | plan.md#Boundary Ownership |
    | Task-specific reference | plan.md#Implementation Constitution |
    | Task-specific reference | scripts/quality-gate/types.ts#QualityGateReport |
  - write_scope: [scripts/quality-gate/types.ts]
  - read_scope: [scripts/quality-gate/types.ts, scripts/quality-gate/fast-mode.test.ts, scripts/pr/risk-escalation.test.ts, scripts/quality-gate/layered-pr.test.ts, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; scripts/quality-gate/modes.ts; scripts/quality-gate/runner.ts; scripts/quality-gate/reporter.ts; scripts/pr/change-policy.ts; scripts/pr/impact-report.ts
  - expected_outputs: [scripts/quality-gate/types.ts (modified)]
  - anti_goals: [Do not touch modes/runner/reporter/policy/impact files, do not remove existing report fields]
  - acceptance_criteria: [QualityGateMode includes fast; lane/report types support risk level, feedbackType, readyForMerge, coverageMode, and escalated-check metadata; existing runner tests pass]
  - verify_commands: [`bun test scripts/quality-gate/runner.test.ts`]
  - consequence_obligations: [CA-002, CA-004, CA-006]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

**Join Point JP-2: Shared Types Stable**
- validation_target: QualityGateMode, lane metadata, risk, report, and coverage types are available.
- validation_command: `bun test scripts/quality-gate/runner.test.ts`
- pass_condition: Existing runner tests pass and downstream type consumers compile.
### Phase 3: User Story 1 - Fast Local Verification (Priority: P1)

**Goal**: Deliver the under-1-minute fast local verification lane with changed-area tests and core smoke.
**Independent Test**: `bun run quality:fast --dry-run` plus `bun test scripts/quality-gate/fast-mode.test.ts scripts/pr/fast-lane-selection.test.ts`.

- [X] T008 [P] [US1] [Agent: executor] Add fast mode, core-smoke lane, and fast-lane-tests lane definitions in scripts/quality-gate/modes.ts
  - agent: executor
  - depends_on: T003: fast-mode tests written; T007: shared types updated
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | plan.md#Phase 1: Fast Lane Mode Definition |
    | Task-specific reference | research.md#D-003: Core Smoke Set Definition |
    | Task-specific reference | scripts/quality-gate/modes.ts#lanesForMode |
  - write_scope: [scripts/quality-gate/modes.ts]
  - read_scope: [scripts/quality-gate/modes.ts, scripts/quality-gate/types.ts, scripts/quality-gate/fast-mode.test.ts, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; package.json; scripts/quality-gate/runner.ts; scripts/pr/change-policy.ts; scripts/pr/impact-report.ts
  - expected_outputs: [scripts/quality-gate/modes.ts (modified)]
  - anti_goals: [Do not add coverage/native/persistence/quarantine/baseline/live lanes to fast mode, do not modify package.json]
  - acceptance_criteria: [lanesForMode('fast') returns impact-report, policy-checks, core-smoke, and fast-lane-tests only; core smoke uses existing local test commands; pr/baseline/release remain available]
  - verify_commands: [`bun test scripts/quality-gate/fast-mode.test.ts scripts/quality-gate/runner.test.ts`]
  - consequence_obligations: [CA-002, CA-004]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T009 [P] [US1] [Agent: executor] Register the quality:fast script in package.json without changing verify or quality:pr
  - agent: executor
  - depends_on: T008: fast mode exists
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | plan.md#Locked Planning Decisions |
    | Task-specific reference | package.json#scripts |
    | Task-specific reference | scripts/quality-gate/index.ts#readMode |
  - write_scope: [package.json]
  - read_scope: [package.json, scripts/quality-gate/index.ts, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; every source file; existing verify/quality:pr entries
  - expected_outputs: [package.json (modified)]
  - anti_goals: [Do not change verify, quality:pr, quality:baseline, quality:release, quality:smoke, check:* entries, or dependencies]
  - acceptance_criteria: [package.json scripts includes quality:fast mapped to `bun run quality:gate --mode fast`; `bun run verify` still maps to quality:pr; quality:fast dry-run resolves]
  - verify_commands: [`bun run quality:fast --dry-run`]
  - consequence_obligations: [CA-001, CA-002]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T010 [P] [US1] [Agent: executor] Expose or reuse path area helpers for fast-lane selection in scripts/pr/change-policy.ts
  - agent: executor
  - depends_on: T004: selection tests written; T007: shared types updated
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | research.md#D-002: Changed-Area Test Selection Strategy |
    | Task-specific reference | scripts/pr/change-policy.ts#areasForPath |
    | Task-specific reference | scripts/pr/change-policy.test.ts#evaluateChangePolicy |
  - write_scope: [scripts/pr/change-policy.ts]
  - read_scope: [scripts/pr/change-policy.ts, scripts/pr/change-policy.test.ts, scripts/pr/fast-lane-selection.test.ts, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; scripts/quality-gate/**; package.json
  - expected_outputs: [scripts/pr/change-policy.ts (modified)]
  - anti_goals: [Do not add static file-to-test graph, do not weaken same-area missing-test blocking, do not change package scripts]
  - acceptance_criteria: [Fast-lane selection can use existing area classification without duplicate path rules; evaluateChangePolicy behavior remains compatible; no circular import is introduced]
  - verify_commands: [`bun test scripts/pr/change-policy.test.ts`]
  - consequence_obligations: [CA-003, CA-005]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T011 [P] [US1] [Agent: executor] Emit fast-lane test selections from scripts/pr/impact-report.ts
  - agent: executor
  - depends_on: T004: selection tests written; T010: area helper available
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | quickstart.md#Scenario: Fast Local Verification |
    | Task-specific reference | scripts/pr/impact-report.ts#Required local checks |
    | Task-specific reference | spec.md#SC-003 |
  - write_scope: [scripts/pr/impact-report.ts]
  - read_scope: [scripts/pr/impact-report.ts, scripts/pr/change-policy.ts, scripts/pr/fast-lane-selection.test.ts, .specify/features/003-layered-test-verify/quickstart.md]
  - forbidden: default forbidden paths; scripts/quality-gate/**; package.json
  - expected_outputs: [scripts/pr/impact-report.ts (modified)]
  - anti_goals: [Do not remove Required local checks/Test coverage signals/Risk notes/Agent model policy sections, do not silently skip changed-area tests]
  - acceptance_criteria: [Impact report emits Fast-lane tests section with selected server, desktop, adapter, docs, or none entries; output explains selection by changed paths/areas; existing required checks remain intact]
  - verify_commands: [`bun test scripts/pr/fast-lane-selection.test.ts`, `bun run check:impact --files src/server/services/teamService.ts`]
  - consequence_obligations: [CA-003]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

**Join Point JP-3: Fast Lane Complete**
- validation_target: `quality:fast` dry-run resolves and impact report emits fast-lane tests.
- validation_command: `bun run quality:fast --dry-run; bun test scripts/quality-gate/fast-mode.test.ts scripts/pr/fast-lane-selection.test.ts`
- pass_condition: Fast mode is lightweight, explainable, and not PR-ready.

### Phase 4: User Story 2 - Layered PR Verification And Risk Escalation (Priority: P2)

**Goal**: Deliver layered PR/verify behavior, changed-line PR coverage, and conditional high-risk escalation.
**Independent Test**: `bun run quality:gate --mode pr --dry-run` plus `bun test scripts/quality-gate/layered-pr.test.ts scripts/pr/risk-escalation.test.ts`.

- [X] T012 [P] [US2] [Agent: executor] Restructure PR lane ordering and coverageMode assignments in scripts/quality-gate/modes.ts
  - agent: executor
  - depends_on: T006: layered PR tests written; T008: fast lanes defined; T011: fast-lane selections emitted
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | plan.md#Phase 4: Layered PR Mode Refinement |
    | Task-specific reference | plan.md#Phase 7: Coverage Strategy Implementation |
    | Task-specific reference | scripts/quality-gate/modes.ts#lanesForMode |
  - write_scope: [scripts/quality-gate/modes.ts]
  - read_scope: [scripts/quality-gate/modes.ts, scripts/quality-gate/types.ts, scripts/quality-gate/layered-pr.test.ts, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; package.json; scripts/quality-gate/runner.ts; scripts/pr/**
  - expected_outputs: [scripts/quality-gate/modes.ts (modified)]
  - anti_goals: [Do not remove existing PR lanes, do not remove full coverage from baseline/release, do not make heavy checks always-on for low-risk PRs]
  - acceptance_criteria: [PR mode order is impact-report, policy-checks, core-smoke, fast-lane-tests, area checks, changed-line coverage, conditional heavy checks; baseline/release coverage remains full]
  - verify_commands: [`bun test scripts/quality-gate/fast-mode.test.ts scripts/quality-gate/layered-pr.test.ts`]
  - consequence_obligations: [CA-001, CA-004]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T013 [P] [US2] [Agent: executor] Update layered lane filtering and changed-line coverage execution in scripts/quality-gate/runner.ts
  - agent: executor
  - depends_on: T006: layered PR tests written; T012: PR mode and coverageMode set
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | plan.md#Boundary Ownership |
    | Task-specific reference | scripts/quality-gate/runner.ts#runCommandLane |
    | Task-specific reference | scripts/quality-gate/coverage.ts#changed-line coverage helpers |
  - write_scope: [scripts/quality-gate/runner.ts]
  - read_scope: [scripts/quality-gate/runner.ts, scripts/quality-gate/modes.ts, scripts/quality-gate/coverage.ts, scripts/quality-gate/layered-pr.test.ts, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; scripts/quality-gate/modes.ts; scripts/quality-gate/reporter.ts; scripts/pr/**; package.json
  - expected_outputs: [scripts/quality-gate/runner.ts (modified)]
  - anti_goals: [Do not break --only/--skip selectors, do not hide missing impact reports, do not bypass coverage ratchets]
  - acceptance_criteria: [Runner preserves impactRequiredCheck skip explanations; changed-line coverage only applies when lane coverageMode is changed-line; dry-run and runner tests pass]
  - verify_commands: [`bun test scripts/quality-gate/layered-pr.test.ts scripts/quality-gate/coverage.test.ts scripts/quality-gate/runner.test.ts`]
  - consequence_obligations: [CA-003, CA-004, CA-006]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T014 [P] [US2] [Agent: executor] Add risk escalation rules for high-risk paths in scripts/pr/change-policy.ts
  - agent: executor
  - depends_on: T005: risk escalation tests written; T010: area helper available
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | plan.md#Phase 5: Risk-Based Escalation |
    | Task-specific reference | spec.md#Edge Cases and Failure Paths |
    | Task-specific reference | scripts/pr/change-policy.ts#evaluateChangePolicy |
  - write_scope: [scripts/pr/change-policy.ts]
  - read_scope: [scripts/pr/change-policy.ts, scripts/pr/risk-escalation.test.ts, .specify/features/003-layered-test-verify/spec.md, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; scripts/quality-gate/**; package.json
  - expected_outputs: [scripts/pr/change-policy.ts (modified)]
  - anti_goals: [Do not remove blocking reasons, do not require live providers in default PR gate, do not make low-risk paths high-risk by default]
  - acceptance_criteria: [Native/Tauri paths escalate native checks; provider/runtime paths escalate maintainer live-provider evidence; release-sensitive paths escalate release checks; desktop state/API paths produce medium-risk guidance]
  - verify_commands: [`bun test scripts/pr/risk-escalation.test.ts scripts/pr/change-policy.test.ts`]
  - consequence_obligations: [CA-003, CA-005]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T015 [P] [US2] [Agent: executor] Emit escalatedChecks and risk explanations from scripts/pr/impact-report.ts
  - agent: executor
  - depends_on: T005: risk escalation tests written; T011: fast-lane output exists; T014: risk rules exist
  - parallel_safe: true
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | quickstart.md#Scenario: High-Risk Change |
    | Task-specific reference | scripts/pr/impact-report.ts#Risk notes |
    | Task-specific reference | research.md#D-005: Risk-Based Escalation for Heavy Checks |
  - write_scope: [scripts/pr/impact-report.ts]
  - read_scope: [scripts/pr/impact-report.ts, scripts/pr/change-policy.ts, scripts/pr/risk-escalation.test.ts, .specify/features/003-layered-test-verify/quickstart.md]
  - forbidden: default forbidden paths; scripts/quality-gate/**; package.json
  - expected_outputs: [scripts/pr/impact-report.ts (modified)]
  - anti_goals: [Do not remove Fast-lane tests output, do not hide high-risk reasons, do not call real providers]
  - acceptance_criteria: [Impact report emits Escalated checks section for high-risk paths; output explains triggering path; low-risk reports show no escalated checks]
  - verify_commands: [`bun test scripts/pr/risk-escalation.test.ts`, `bun run check:impact --files desktop/src-tauri/Cargo.toml`]
  - consequence_obligations: [CA-003, CA-005]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T016 [US2] [Agent: executor] Wire escalated heavy-check lanes in scripts/quality-gate/modes.ts
  - agent: executor
  - depends_on: T012: PR lane order set; T015: escalatedChecks emitted
  - parallel_safe: false
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | spec.md#Capability 5: Risk-Based Escalation |
    | Task-specific reference | scripts/quality-gate/modes.ts#lanesForMode |
    | Task-specific reference | context.md#Critical Adjacent Effects |
  - write_scope: [scripts/quality-gate/modes.ts]
  - read_scope: [scripts/quality-gate/modes.ts, scripts/pr/impact-report.ts, scripts/quality-gate/layered-pr.test.ts, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; scripts/quality-gate/runner.ts; scripts/pr/**; package.json
  - expected_outputs: [scripts/quality-gate/modes.ts (modified)]
  - anti_goals: [Do not make native/provider/release/baseline/live lanes always-on in fast mode, do not remove heavy checks from release mode]
  - acceptance_criteria: [PR mode consumes escalated risk metadata through report-visible gating; native/release/provider fixtures select intended heavy lanes; fast mode remains lightweight]
  - verify_commands: [`bun test scripts/quality-gate/layered-pr.test.ts scripts/quality-gate/fast-mode.test.ts`]
  - consequence_obligations: [CA-004, CA-005]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

**Join Point JP-4: Layered PR And Escalation Complete**
- validation_target: PR layering, changed-line coverage, and escalated checks are wired.
- validation_command: `bun test scripts/quality-gate/layered-pr.test.ts scripts/pr/risk-escalation.test.ts`
- pass_condition: Low-risk PRs skip heavy checks with reasons; high-risk fixtures trigger heavy checks.

### Phase 5: Cross-Story Output Semantics

**Goal**: Make report output semantics unambiguous across fast and full verification modes.

- [X] T017 [US2] [Agent: executor] Set feedbackType and readyForMerge report semantics in scripts/quality-gate/runner.ts
  - agent: executor
  - depends_on: T013: runner layered execution updated; T016: escalated lanes wired
  - parallel_safe: false
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | plan.md#Phase 6: Output Semantics |
    | Task-specific reference | scripts/quality-gate/runner.ts#QualityGateReport assembly |
    | Task-specific reference | spec.md#SC-005 |
  - write_scope: [scripts/quality-gate/runner.ts]
  - read_scope: [scripts/quality-gate/runner.ts, scripts/quality-gate/types.ts, scripts/quality-gate/layered-pr.test.ts, .specify/features/003-layered-test-verify/plan.md]
  - forbidden: default forbidden paths; scripts/quality-gate/modes.ts; scripts/quality-gate/reporter.ts; scripts/pr/**; package.json
  - expected_outputs: [scripts/quality-gate/runner.ts (modified)]
  - anti_goals: [Do not set readyForMerge true for fast mode, do not remove report fields, do not change schemaVersion without migration]
  - acceptance_criteria: [Fast reports feedbackType=fast and readyForMerge=false; PR/baseline/release reports feedbackType=full; escalation metadata preserved]
  - verify_commands: [`bun test scripts/quality-gate/layered-pr.test.ts scripts/quality-gate/runner.test.ts`]
  - consequence_obligations: [CA-002, CA-006]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T018 [US2] [Agent: executor] Render fast feedback, PR readiness, and escalated-check banners in scripts/quality-gate/reporter.ts
  - agent: executor
  - depends_on: T006: output tests written; T017: report semantics set
  - parallel_safe: false
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | quickstart.md#Output Semantics Reference |
    | Task-specific reference | scripts/quality-gate/reporter.ts#renderMarkdownReport |
    | Task-specific reference | research.md#D-006: Output Semantics Implementation |
  - write_scope: [scripts/quality-gate/reporter.ts]
  - read_scope: [scripts/quality-gate/reporter.ts, scripts/quality-gate/types.ts, scripts/quality-gate/layered-pr.test.ts, .specify/features/003-layered-test-verify/quickstart.md]
  - forbidden: default forbidden paths; scripts/quality-gate/runner.ts; scripts/pr/**; package.json
  - expected_outputs: [scripts/quality-gate/reporter.ts (modified)]
  - anti_goals: [Do not remove Result Matrix/Coverage/Artifacts/Lanes sections, do not use merge-ready wording for fast mode]
  - acceptance_criteria: [Fast reports contain DEVELOPMENT SIGNAL and NOT PR READY; PR reports contain PR READINESS; escalated output contains ESCALATED CHECKS; JSON/JUnit generation remains intact]
  - verify_commands: [`bun test scripts/quality-gate/layered-pr.test.ts scripts/quality-gate/runner.test.ts`]
  - consequence_obligations: [CA-002, CA-006]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

**Join Point JP-5: Output Semantics Clear**
- validation_target: Fast/full reports have clear readiness labels.
- validation_command: `bun test scripts/quality-gate/layered-pr.test.ts scripts/quality-gate/runner.test.ts`
- pass_condition: Fast mode reports `readyForMerge=false` and NOT PR READY; PR mode reports PR READINESS.

### Phase 6: Polish And Validation

**Goal**: Review, validate, and update quickstart evidence without changing implementation behavior.

- [X] T019 [Agent: quality-reviewer] Review shared-surface diffs for quality-contract preservation across scripts/quality-gate and scripts/pr
  - agent: quality-reviewer
  - depends_on: T013: runner updated; T015: impact escalations emitted; T016: modes escalations wired; T018: reporter banners rendered
  - parallel_safe: false
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | plan.md#Review Focus |
    | Task-specific reference | tasks.md#Consequence Obligation Mapping |
    | Task-specific reference | context.md#Must-Preserve Execution Constraints |
  - write_scope: []
  - read_scope: [scripts/quality-gate/types.ts, scripts/quality-gate/modes.ts, scripts/quality-gate/runner.ts, scripts/quality-gate/reporter.ts, scripts/pr/change-policy.ts, scripts/pr/impact-report.ts, package.json]
  - forbidden: default forbidden paths; all file writes
  - expected_outputs: [Review handoff notes only (no file writes)]
  - anti_goals: [Do not modify files during review, do not approve unresolved CA stop conditions]
  - acceptance_criteria: [Review confirms verify entrypoint preserved, fast output not PR-ready, skipped lanes explainable, coverage/quarantine/release gates preserved, and report schema backward compatible]
  - verify_commands: [`bun test scripts/quality-gate/fast-mode.test.ts scripts/quality-gate/layered-pr.test.ts scripts/pr/fast-lane-selection.test.ts scripts/pr/risk-escalation.test.ts`]
  - consequence_obligations: [CA-001, CA-002, CA-003, CA-004, CA-005, CA-006]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 2
  - escalation: debugger

- [X] T020 [Agent: executor] Run focused final validation for layered verification in scripts/quality-gate and scripts/pr
  - agent: executor
  - depends_on: T019: quality review passed
  - parallel_safe: false
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | quickstart.md#Validation Commands |
    | Task-specific reference | AGENTS.md#Quality Gate Automation |
    | Task-specific reference | .specify/memory/constitution.md#VI. Evidence Before Completion (NON-NEGOTIABLE) |
  - write_scope: []
  - read_scope: [scripts/quality-gate/, scripts/pr/, package.json, .specify/features/003-layered-test-verify/quickstart.md]
  - forbidden: default forbidden paths; all file writes
  - expected_outputs: [Validation handoff notes with command output summaries (no file writes)]
  - anti_goals: [Do not edit implementation while validating, do not claim release readiness without live baseline credentials]
  - acceptance_criteria: [Focused tests pass; quality:fast dry-run completes; PR dry-run completes; check:policy remains green; runtime timing evidence is captured]
  - verify_commands: [`bun test scripts/quality-gate/fast-mode.test.ts scripts/quality-gate/layered-pr.test.ts scripts/pr/fast-lane-selection.test.ts scripts/pr/risk-escalation.test.ts`, `bun run quality:fast --dry-run`, `bun run quality:gate --mode pr --dry-run`, `bun run check:policy`]
  - consequence_obligations: [CA-001, CA-004]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 1
  - escalation: debugger

- [X] T021 [Agent: executor] Update validation evidence and timing notes in .specify/features/003-layered-test-verify/quickstart.md
  - agent: executor
  - depends_on: T020: focused validation output captured
  - parallel_safe: false
  - context_navigation:
    | Need | Location |
    | --- | --- |
    | Relevant design decision | plan.md#Locked Planning Decisions |
    | Implementation constitution | plan.md#Implementation Constitution |
    | Data model entity | N/A - no data-model.md is present; quality-gate lane/report entities live in scripts/quality-gate/types.ts |
    | API/contract surface | package.json#scripts and scripts/quality-gate/types.ts#QualityGateReport |
    | Task-specific reference | quickstart.md#Overview |
    | Task-specific reference | .specify/memory/constitution.md#VI. Evidence Before Completion (NON-NEGOTIABLE) |
    | Task-specific reference | tasks.md#Summary |
  - write_scope: [.specify/features/003-layered-test-verify/quickstart.md]
  - read_scope: [.specify/features/003-layered-test-verify/quickstart.md, .specify/features/003-layered-test-verify/tasks.md, artifacts/quality-runs/]
  - forbidden: default forbidden paths; source code; tests; package scripts
  - expected_outputs: [.specify/features/003-layered-test-verify/quickstart.md (modified)]
  - anti_goals: [Do not edit source code/tests/package scripts/plan/spec decisions, do not invent timing numbers]
  - acceptance_criteria: [Quickstart reflects actual validation commands and observed timing/evidence from T020; fast lane remains development signal; live/release blockers are explicit if credentials are unavailable]
  - verify_commands: [`Select-String -Path .specify/features/003-layered-test-verify/quickstart.md -Pattern "DEVELOPMENT SIGNAL","NOT PR READY","bun run verify","quality:fast"`]
  - consequence_obligations: [CA-002, CA-004]
  - handoff_format: status, changed_files, validation_output, concerns, recovery_hints
  - retry_max: 1
  - escalation: debugger

**Join Point JP-6: Final Validation Evidence Ready**
- validation_target: Focused tests, dry-run gates, and policy checks have recorded output.
- validation_command: Commands listed in T020.
- pass_condition: Validation output is available for quickstart and handoff; live/release gaps are explicit.
## Dependencies

```text
T001,T002 -> T003,T004,T005,T006 -> T007
T007 -> T008,T010
T008 -> T009
T010 -> T011,T014
T008,T011 -> T012
T012 -> T013,T016
T014,T011 -> T015
T013,T015,T016 -> T017 -> T018 -> T019 -> T020 -> T021
```

## Parallel Batches And Join Points

| Batch | Tasks | Objective | Write sets | Join point |
| --- | --- | --- | --- | --- |
| PB-0 | T001, T002 | Read-only guardrail confirmation | read-only | JP-0 |
| PB-1 | T003, T004, T005, T006 | Independent RED tests in separate files | `fast-mode.test.ts`, `fast-lane-selection.test.ts`, `risk-escalation.test.ts`, `layered-pr.test.ts` | JP-1 |
| PB-2 | T008, T010 | Parallel fast-mode lane setup and PR area helper update after shared types are stable | `modes.ts`, `change-policy.ts` | JP-2 follow-up |
| PB-3 | T009, T011 | Parallel package script registration and impact fast-lane output | `package.json`, `impact-report.ts` | JP-3 |
| PB-4 | T012, T014 | Parallel PR mode layering and risk policy update | `modes.ts`, `change-policy.ts` | JP-4 partial |
| PB-5 | T013, T015 | Parallel runner execution update and impact escalation output | `runner.ts`, `impact-report.ts` | JP-4 partial |

## Success Criteria Coverage

| SC ID | Covered by |
| --- | --- |
| SC-001 | T003, T008, T009, T020 |
| SC-002 | T006, T012, T013, T020 |
| SC-003 | T004, T011, T015 |
| SC-004 | T005, T014, T015, T016 |
| SC-005 | T006, T017, T018 |
| SC-006 | T003, T004, T005, T006, T020 |

## Must-Preserve Invariants

| MP ID | Enforcement |
| --- | --- |
| MP-001 | T003-T020 preserve quality while speeding verification |
| MP-002 | T008, T009, T020 |
| MP-003 | T001, T008, T012 |
| MP-004 | T003, T004, T008, T011 |
| MP-005 | T009, T012, T020 |
| MP-006 | T005, T014, T015, T016 |
| MP-007 | T006, T012, T013, T020 |
| MP-008 | Task anti-goals plus T019 review |
| MP-009 | T001, T002 |
| MP-010 | T006, T017, T018, T021 |
| MP-011 | T004, T010, T011 anti-goals defer impact graph |
| MP-012 | T006, T012, T013 |

## Implementation Dispatch

- **Feature delivery shape**: serial shared-surface joins with intra-phase parallel batches for isolated tests, policy, impact, package, and runner work.
- **Current ready batch**: T001 and T002.
- **execution_model**: subagent-mandatory
- **dispatch_shape**: parallel-subagents
- **execution_surface**: native-subagents
- **policy reason**: safe-parallel-subagents; both ready tasks are read-only and have disjoint handoff-only outputs.
- **Suggested first release scope**: T001-T011 plus T017-T018 output semantics if product-facing fast-lane messaging is exposed. Do not present the fast lane as public-ready without NOT PR READY output.

## Analyze-Compatible Task Self-Audit

| Check | Status | Evidence |
| --- | --- | --- |
| buildable SC coverage | pass | SC-001..SC-006 mapped above and in task packets. |
| locked decision preservation | pass | LD-001..LD-007 mapped to tasks and guardrails. |
| guardrail mapping | pass | Task Guardrail Index and CA mapping present. |
| DP1 packet readiness | pass | 21 task packets generated under `task-packets/`. |
| DP2 dependency/readiness | pass | Shared types/modes/runner surfaces serialized; parallel batches have disjoint write scopes. |
| DP3 execution block | pass | workflow-state and tasks.md route next to `/sp.analyze`, not `/sp.implement`. |
| reference fidelity | pass | Standard Delivery profile; no reference-fidelity inventory active. |
| unmapped tasks | pass | T001-T002 guardrails, T019-T021 review/validation/docs are justified cross-cutting work. |
| write-set conflicts | pass | Known conflicts resolved through serial owners and join points. |

## Next Command

- `/sp.analyze` (verify task package before implementation)
