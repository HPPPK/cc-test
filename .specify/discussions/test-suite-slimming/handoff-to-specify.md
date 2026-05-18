---
source_command: sp-discussion
discussion_slug: test-suite-slimming
status: handoff-ready
updated_at: 2026-05-17T23:31:32+08:00
source_files:
  - .specify/discussions/test-suite-slimming/discussion-state.md
  - .specify/discussions/test-suite-slimming/discussion-log.md
  - .specify/discussions/test-suite-slimming/requirements.md
  - .specify/discussions/test-suite-slimming/technical-options.md
  - .specify/discussions/test-suite-slimming/project-context.md
  - .specify/discussions/test-suite-slimming/open-questions.md
  - .specify/discussions/test-suite-slimming/handoff-assessment.md
coverage_status: product-and-technical-discussion-covered
planning_gate_status: ready-for-specify
hard_unknown_count: 0
open_conflict_count: 0
---

# Handoff To sp-specify: Layered Test Verification

## Candidate Scope

Specify one bounded feature: add a layered test verification workflow that provides an under-1-minute fast feedback lane and reorganizes ordinary PR/verify feedback toward a 5-minute target without weakening the project's quality contract.

## Confirmed Product Goal And Users

Primary users:

- Contributors and maintainers running local checks.
- AI coding agents that need fast but trustworthy verification before handoff.

Goal:

- Make tests lighter and faster while preserving high-quality signal.
- Improve both local development feedback and ordinary PR/verify speed.

## In Scope

- Add a fast lane targeting seconds to under 1 minute.
- Reorganize ordinary `bun run verify` / `quality:pr` toward a 5-minute target for routine changes.
- Reuse the existing `impact-report`, `change-policy`, and `quality-gate` lane architecture.
- Use changed-area high-signal unit tests plus a tiny fixed core smoke set as fast-lane evidence.
- Keep E2E, live-provider, and release-gate evidence conditional for ordinary PR/verify.
- Preserve existing quality contracts around same-area tests, quarantine governance, persistence upgrade checks, coverage policy, and release confidence.
- Make output clear that fast-lane success is a development signal, not full PR readiness.

## Out Of Scope

- Do not implement a full expansion-ready test impact graph in the first slice.
- Do not delete tests merely to reduce runtime.
- Do not weaken coverage baselines or thresholds without explicit maintainer approval.
- Do not make live-provider, broad E2E, or release gates part of the default fast lane.
- Do not replace `bun run verify` as the PR readiness entrypoint.

## Acceptance Signals

- A routine local change can run a fast lane in seconds to under 1 minute.
- Ordinary PR/verify has a credible path toward under 5 minutes for non-high-risk changes.
- Fast-lane routing is explained by changed files and risk notes.
- High-risk paths still trigger heavier checks.
- E2E/live-provider/release evidence is retained as conditional confidence, not removed.
- Reports and command output clearly distinguish fast feedback from PR readiness.
- Regression tests prove lane routing does not skip required checks for desktop, server, adapter, docs, native, provider/runtime, and release-sensitive paths.

## Project-Context Evidence And Inference Notes

Fresh cognition evidence:

- `.specify/project-cognition/status.json` reports `freshness: fresh`, `baseline_state: ready`, and `last_refresh_reason: map-build`.
- `.specify/project-cognition/coverage.json` classifies project surfaces and identifies test surfaces and coverage gaps.

Source-grounded implementation surfaces:

- `package.json` maps `bun run verify` to `bun run quality:pr`.
- `scripts/quality-gate/modes.ts` defines PR, baseline, and release lanes.
- `scripts/quality-gate/runner.ts` already supports lane selection and impact-based skipping for area-specific command lanes.
- `scripts/pr/impact-report.ts` emits required local checks, coverage signals, risk notes, and agent/model testing policy.
- `scripts/pr/change-policy.ts` classifies changed paths and enforces same-area test signals.
- `scripts/quality-gate/coverage.ts` enforces coverage suites, ratchet, thresholds, and changed-line coverage.

Inference:

- The safest implementation path is to extend the existing impact-aware quality gate instead of adding a separate unrelated test runner.

## Open Questions

No hard blocking questions.

Soft planning question:

- Exact handling of full coverage in the 5-minute ordinary PR target should be resolved during specification/planning. The downstream rule is: do not weaken coverage policy silently; if full coverage cannot fit the target, specify an explicit conditional or changed-line coverage strategy and preserve full coverage in an appropriate heavier gate.

## Must-Preserve Ledger

| id | type | claim | source | downstream_requirement | blocking_level | owner | latest_resolve_phase | status | deferred_to | stop_and_reopen_condition | superseded_by | mapped_to |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MP-001 | goal | Make this project's tests lighter and faster while preserving high-quality signal. | User idea in `discussion-log.md` | `sp-specify` must frame the feature around speed plus quality, not speed alone. | hard | user | sp-specify | mapped |  | Reopen if the feature becomes only a test-deletion or bypass effort. |  |  |
| MP-002 | scope | First scope adds an under-1-minute fast lane and reorganizes ordinary PR/verify toward a 5-minute target. | `requirements.md` | Spec must include both local fast feedback and PR/verify layering. | hard | user | sp-specify | mapped |  | Reopen if either fast lane or PR/verify layering is dropped. |  |  |
| MP-003 | decision | Preferred technical direction is Option B: Layered PR Gate using existing impact-report/change-policy/quality-gate architecture. | `technical-options.md` user confirmation | Spec must reuse or extend existing gate architecture unless it explicitly justifies a safer alternative. | hard | user | sp-specify | mapped |  | Reopen if implementation proposes an unrelated parallel test system. |  |  |
| MP-004 | decision | Fast-lane evidence should be changed-area high-signal unit tests plus a tiny fixed core smoke set. | `requirements.md` and `technical-options.md` | Spec must define how changed-area tests and core smoke tests are selected. | hard | user | sp-specify | mapped |  | Reopen if fast lane is only lint/typecheck or only a broad test run. |  |  |
| MP-005 | decision | Preserve `bun run verify` / `quality:pr` as the PR readiness entrypoint. | `requirements.md` | Spec must avoid replacing the existing readiness command with an incompatible path. | hard | downstream-contract | sp-specify | mapped |  | Reopen if PR readiness is moved to an undocumented command. |  |  |
| MP-006 | decision | E2E, live-provider, and release-gate evidence should be conditional for ordinary PR/verify, not removed. | `requirements.md` | Spec must define risk triggers for these checks. | hard | user | sp-specify | mapped |  | Reopen if heavy evidence is silently deleted or always skipped. |  |  |
| MP-007 | decision | High quality means critical-path regression protection, low flaky rate, and changed-area coverage. | `requirements.md` | Spec acceptance criteria must use this quality definition. | hard | user | sp-specify | mapped |  | Reopen if quality is reduced to runtime alone. |  |  |
| MP-008 | non_goal | Do not weaken coverage baselines, thresholds, same-area test policy, persistence checks, quarantine governance, or release confidence without explicit approval. | `requirements.md`, `project-context.md` | Spec must preserve quality contracts and mark any policy change as explicit. | hard | downstream-contract | sp-specify | mapped |  | Reopen if coverage or governance checks are bypassed by default. |  |  |
| MP-009 | reference | Existing source-grounded surfaces include `package.json`, `scripts/quality-gate/modes.ts`, `runner.ts`, `coverage.ts`, `scripts/pr/impact-report.ts`, and `scripts/pr/change-policy.ts`. | `project-context.md` | Spec must cite these as likely implementation surfaces. | soft | evidence | sp-plan | mapped |  | Reopen if planning ignores existing gate infrastructure. |  |  |
| MP-010 | tradeoff | Fast-lane success is a development signal, not full PR readiness. | `requirements.md`, `technical-options.md` | Spec must require command/report wording that prevents false readiness claims. | hard | downstream-contract | sp-specify | mapped |  | Reopen if fast pass is presented as merge-ready. |  |  |
| MP-011 | tradeoff | Expansion-ready test impact graph is deferred; start with layered PR gate first. | `technical-options.md` | Spec must keep first slice medium-complexity and avoid requiring durable impact-graph metadata. | soft | user | sp-plan | deferred | future-feature | Reopen if implementation scope expands into a full impact graph before fast lane works. |  |  |
| MP-012 | blocking_question | Exact full-coverage handling under the 5-minute PR target is a soft planning question; coverage must not be weakened silently. | `technical-options.md`, `handoff-assessment.md` | `sp-specify` or `sp-plan` must decide whether coverage remains mandatory, becomes changed-line-first, or is conditionally escalated, with explicit acceptance criteria. | soft | downstream-contract | sp-plan | deferred | sp-plan | Reopen if the selected coverage strategy weakens ratchets/baselines without explicit approval. |  |  |

## Coverage And Planning Fields

- coverage_status: product-and-technical-discussion-covered
- planning_gate_status: ready-for-specify
- hard_unknown_count: 0
- open_conflict_count: 0

## Instructions For sp-specify

Use this handoff as the source of truth for a bounded feature specification. Preserve every Must-Preserve Ledger item. Do not route directly to implementation until the specification captures the fast lane, PR/verify layering, risk-triggered heavy evidence, quality definition, and coverage-policy handling.
