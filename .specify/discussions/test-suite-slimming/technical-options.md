# Technical Options

## Status

Project cognition is now fresh enough for broad source-grounded technical options.

Evidence:

- `.specify/project-cognition/status.json` reports `freshness: fresh`, `baseline_state: ready`, and `last_refresh_reason: map-build`.
- `.specify/project-cognition/coverage.json` classifies all project-relevant surfaces and identifies test surfaces and coverage gaps.
- `scripts/quality-gate/modes.ts`, `runner.ts`, `coverage.ts`, `scripts/pr/impact-report.ts`, and `scripts/pr/change-policy.ts` provide an existing impact-aware quality gate architecture.
- `.specify/project-cognition/slices/change.json` is still absent, so these options are broad test architecture options, not current-diff-specific placement claims.

## Current Product-Level Default

Pending source-grounded refinement, the recommended default is:

- Under-1-minute fast lane: changed-area high-signal unit tests plus a tiny fixed core smoke set.
- PR/verify lane: target under 5 minutes for routine changes while preserving broader confidence through conditional escalation.
- Heavy lanes: keep broad E2E, live-provider, and release evidence out of ordinary PR by default, but trigger them for core-path, high-risk, provider/runtime, and release changes.
- Quality rule: optimize for critical-path regression protection, low flaky rate, and changed-area coverage.

This is a product-level decision from the user preference for "又快又好"; it is not yet a project-specific implementation recommendation.

## Option A: Minimal Fast Lane

Product behavior enabled:

- Developers get a clear `fast` command intended to finish in seconds to under 1 minute.
- The command gives quick behavior signal before running full `verify`.

Impacted modules or files:

- `package.json` scripts
- `scripts/pr/changed-files.ts`
- likely a new or extended fast-runner script under `scripts/pr/` or `scripts/quality-gate/`
- focused tests for fast-runner selection behavior

Complexity:

- Low to medium.

Migration or compatibility concerns:

- Low risk if this is additive and does not change `bun run verify` semantics.
- It improves local workflow but does not by itself make PR/verify faster.

Testing strategy:

- Unit tests for changed-file to test-file selection.
- Fixture tests for desktop/server/adapter path routing.
- A small smoke fixture proving the fast lane skips unrelated areas and runs selected tests.

Risks:

- Can become a side command people ignore if it is not integrated into `quality:pr`.
- May overfit simple file-to-test mapping and miss cross-module risks.

Rollback or de-scope path:

- Keep the command additive and remove it from docs/scripts if selection is noisy.

Recommendation rationale:

- Useful first slice if implementation risk must stay very small, but it only partially satisfies the user's "fast PR/verify" goal.

## Option B: Layered PR Gate (Recommended, User Confirmed)

Product behavior enabled:

- Developers get an under-1-minute fast lane and ordinary PR/verify gets a target path under 5 minutes for routine changes.
- The existing impact report becomes the front door for layered verification: fast checks first, then only required area checks, then conditional heavy evidence.

Impacted modules or files:

- `package.json` scripts for a new fast command and possibly renamed/layered quality scripts
- `scripts/quality-gate/modes.ts` for a fast lane and refined PR lanes
- `scripts/quality-gate/runner.ts` if lane dependencies, early-fail semantics, or fast-lane report fields are needed
- `scripts/quality-gate/types.ts` if lane metadata needs speed budgets or risk triggers
- `scripts/pr/impact-report.ts` and `scripts/pr/change-policy.ts` for risk triggers and required fast checks
- `scripts/pr/run-server-tests.ts` or a sibling runner for changed-area server/tools/utils tests
- same-area tests under `scripts/pr/*.test.ts` and `scripts/quality-gate/*.test.ts`

Complexity:

- Medium.

Migration or compatibility concerns:

- Must preserve `bun run verify` as the PR readiness entrypoint.
- Must avoid weakening same-area test requirements, coverage policy, persistence checks, quarantine governance, or release confidence.
- `check:desktop` currently combines typecheck, Vitest, and build; splitting it may be necessary to meet 5 minutes but needs clear risk triggers.
- `check:coverage` is currently a PR lane; if it cannot fit the target, coverage policy needs a separate explicit decision rather than an accidental bypass.

Testing strategy:

- Unit tests for impact-report output and required-check selection.
- Unit tests for lane filtering, fast lane inclusion, and risk-trigger escalation.
- Fixture tests for desktop/server/adapter/docs/native changes.
- Regression tests that high-risk paths still route to heavier checks.
- Keep quality-gate reporter output compatible with existing artifact expectations.

Risks:

- Misclassification risk: a changed path could be routed to too few checks.
- Runtime target risk: desktop build or full coverage may still exceed 5 minutes unless split or made explicitly conditional.
- Policy risk: contributors may treat "fast passed" as "ready" unless output labels it correctly.

Rollback or de-scope path:

- Add the fast lane first, then wire it into PR mode behind an explicit lane selector or mode flag.
- If full PR layering is too risky, keep `quality:pr` semantics unchanged and introduce `quality:fast` plus `quality:pr --only fast*` as an interim step.

Recommendation rationale:

- Best matches the confirmed product goal because the project already has impact-aware policy, lane definitions, and report artifacts. This option improves both local feedback and PR/verify rather than creating an isolated helper.

Decision:

- User confirmed this option on 2026-05-17T23:30:11+08:00.

## Option C: Expansion-Ready Test Impact Graph

Product behavior enabled:

- The project gets a durable test-impact system with speed budgets, historical lane duration, flake signals, and explicit path-to-test ownership.
- Future changes can select tests based on maintained dependency and risk metadata instead of simple path prefixes.

Impacted modules or files:

- Everything in Option B
- new test-impact metadata or generated manifest under `scripts/quality-gate/` or `scripts/pr/`
- quality report schema additions for duration budget and flake/risk evidence
- possible docs updates for maintaining the impact graph

Complexity:

- High.

Migration or compatibility concerns:

- Requires maintenance discipline; stale test-impact metadata can create false confidence.
- Needs a clear owner for updating mappings when modules or tests move.

Testing strategy:

- Golden fixture tests for impact graph resolution.
- Backward compatibility tests for quality report schema.
- Tests for stale metadata detection and fallback-to-heavier-check behavior.

Risks:

- Over-engineering before the simpler lane split proves its value.
- More moving pieces may make failures harder to understand.

Rollback or de-scope path:

- Start with Option B and add telemetry/impact graph pieces only after lane timings prove where selection precision is needed.

Recommendation rationale:

- Strong long-term direction, but too much for the first formal scope if the immediate goal is fast, trustworthy feedback.
