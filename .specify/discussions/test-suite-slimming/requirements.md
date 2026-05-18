# Requirements

## Current Product Goal

Design a lighter, faster test approach for this project while preserving very high test quality.

## Confirmed Priority

- Primary optimization target: test speed.
- First affected workflows: local development feedback and PR/verify feedback.
- Fast feedback target: seconds to under 1 minute.
- Ordinary PR/verify target: under 5 minutes for routine changes.
- Default fast-lane evidence: changed-area high-signal unit tests plus a tiny fixed core smoke set.
- First-stage scope: add the fast lane and reorganize verify into a layered feedback model that uses it.
- Preferred technical direction: Layered PR Gate using the existing impact-report, change-policy, and quality-gate lane architecture.
- Heavy-evidence policy: E2E, live-provider, and release-gate checks should be conditional for ordinary PR/verify.
- Quality definition: critical-path regression protection, low flaky rate, and changed-area coverage.
- Quality expectation: high test quality must be preserved while reducing runtime; the goal is not to bypass or weaken meaningful checks.

## Desired Qualities

- Tests should be lightweight enough to run frequently during normal development.
- Fast feedback should not come at the cost of weak coverage, false confidence, or broad bypasses.
- Fast feedback should preserve strong behavior signal for the current change, not merely execute a minimal command.
- The strategy should distinguish fast local checks from heavier PR, coverage, E2E, live-provider, or release gates.
- The project should keep high-value regression protection for critical behavior while reducing redundant, slow, flaky, or low-signal work.

## Candidate Requirement Themes

- Define a fast default test lane that catches common regressions quickly.
- Treat the under-1-minute lane as frequent development feedback, not as the only readiness gate.
- Integrate the fast lane into the verify path as an early, cheap failure signal.
- Preserve `bun run verify` / `quality:pr` as the PR readiness entrypoint while making its ordinary path faster.
- Keep full typecheck, coverage ratchet, broad E2E, live-provider baseline, and release gates outside the high-frequency lane unless source evidence proves they can fit without breaking the time target.
- Do not run E2E, live-provider, or release gates by default for ordinary PR/verify.
- Trigger E2E, live-provider, or release gates for core-path, high-risk, provider/runtime, release, or explicitly routed changes.
- Keep a quality gate that remains trustworthy for PR readiness.
- Separate everyday fast feedback from heavier confidence gates.
- Make the PR/verify path faster where possible without hiding required evidence.
- Use explicit risk-based escalation for checks that cannot fit the 5-minute ordinary PR/verify target.
- Preserve stricter coverage and live/E2E evidence where the changed surface genuinely requires it.
- Make test selection explainable so contributors and agents know which check to run for a given change.
- Avoid quality theater: tests should assert meaningful behavior rather than only executing code paths.
- Reduce flakiness and environmental dependence in the fast lane.
- Prefer stable, high-signal tests over broad but flaky or low-value checks in fast and ordinary PR lanes.

## Early Non-Goals

- No source code or test changes are in scope during this discussion phase.
- No formal feature handoff has been requested.
- No project-specific test lane recommendations are final until project cognition is refreshed or otherwise safely grounded.

## Acceptance Signals To Refine

- A routine change can be validated with a narrow fast lane before the full PR gate.
- The PR/verify workflow benefits from fast-lane results instead of duplicating or ignoring them.
- The fast lane catches obvious changed-area behavior regressions and a small number of critical workflow failures.
- The full quality gate remains available and meaningful for readiness claims.
- PR feedback becomes faster for ordinary changes without making risky changes look ready prematurely.
- Ordinary PR/verify can complete under 5 minutes when the change does not touch high-risk surfaces.
- E2E/live-provider/release evidence remains available and is triggered by risk instead of being removed.
- Critical user paths and high-risk areas retain appropriate test coverage.
- Test failures are easier to diagnose because lanes are smaller and responsibilities are clearer.
- The faster lanes have a documented definition of quality: critical-path regression protection, low flake rate, and changed-area coverage.
- The test strategy has explicit rules for when to run unit, integration, E2E, live-provider, native, desktop, server, adapter, docs, and release checks.
