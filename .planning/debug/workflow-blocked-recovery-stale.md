---
status: resolved
created: 2026-06-16T00:00:00+08:00
updated: 2026-06-16T16:27:00+08:00
reported_by: user
symptom: Desktop Superspec workflow card keeps showing a red blocked recovery panel after the user continued and the phase completion is waiting for confirmation.
execution_model: leader-inline
dispatch_shape: leader-inline
execution_surface: leader-inline
dispatch_reason: Focused workflow state projection defect with one runtime summary path and one desktop rendering path.
blocked_reason: none
---

# Debug Session: Workflow Blocked Recovery Stale

## Current Focus

stage: resolved
hypothesis: "Confirmed. A stale blocked completion submission stayed in the active phase artifact history and was projected as current recovery even after a ready submission created `pendingConfirmation`. Desktop also treated any `blockedStatus` as active recovery before honoring pending confirmation."
next_action: "User should refresh/reload the desktop view if an old snapshot is already rendered; new workflow summaries and component projections no longer show the stale recovery panel while pending confirmation is active."

## User Report

- User invoked `$sp-debug`.
- Screenshot 1 shows a Superspec workflow card with `Recovery: blocked · Authority: Automatic transition` and a red error panel.
- Screenshot 2 shows the same workflow status as `Waiting for confirmation`, but the red blocked panel remains.
- User says the underlying problem was already solved/continued, yet the blocked state stays visible.

## Project Cognition Intake

- lexicon/query attempt: blocked by local project-cognition metadata schema mismatch (`schema_version` 1, expected 2).
- route: continue with live repository evidence.
- prior learning: `learn-2026-05-28-desktop-workflow-pending-confirmation-over-running-statu-b45c8345ca` says desktop workflow UI must let `pendingConfirmation` override stale lifecycle status.

## Observer Framing

- primary_suspected_loop: agent submits blocked completion -> runtime records blocked submission/recovery artifact -> user continues and agent submits ready completion -> runtime creates `pendingConfirmation` -> server/desktop still projects old blocked artifact -> UI shows contradictory recovery panel.
- primary_candidate: server summary or desktop rendering treats old `blockedReason`/`blockedStatus` as active even when `pendingConfirmation` exists.
- contrarian_candidate: runtime failed to clear the actual active blocked control state, so the UI is reflecting a real unresolved blocked state rather than stale observation.
- recommended_first_probe: read `src/server/ws/handler.ts`, `src/server/services/workflowRuntimeService.ts`, `desktop/src/components/workflow/WorkflowTransitionControls.tsx`, `desktop/src/components/workflow/WorkflowStatusPanel.tsx`, and focused tests.

## Consequence Analysis

trigger_status: triggered
trigger_reason: This affects workflow lifecycle state, pending user confirmation, recovery/retry controls, and user-visible authority/action semantics.

## Evidence

- User screenshot evidence: workflow header reports `Waiting for confirmation` while the recovery panel still reports `blocked`.
- Prior resolved debug evidence: `pendingConfirmation` can coexist with stale lifecycle/display fields and must take priority in desktop controls.
- Live search evidence: `WorkflowTransitionControls` currently calculates `blocked` from status, `blockedStatus`, or `blockedReason`, and renders the red recovery block from `workflow.blockedReason`.
- Live search evidence: `src/server/ws/handler.ts` derives summary `blockedReason`/`blockedStatus` from `getActiveBlockedSubmission(state)`.
- RED verification: `bun test src/server/__tests__/websocket-handler.test.ts -t "stale blocked recovery"` failed because websocket desktop summary included `blockedReason: "Old blocked recovery reason."` while `pendingConfirmation: true`.
- RED verification: `cd desktop; bun run test -- src/components/workflow/WorkflowComponents.test.tsx --run -t "stale blocked recovery"` failed because `WorkflowStatusPanel` rendered the old blocked reason inside a pending-confirmation card.
- RED verification: `cd desktop; bun run test -- src/pages/ActiveSession.test.tsx --run -t "stale blocked recovery"` failed because `ActiveSession` rendered `Recovery: blocked` and `Retry` while the header said `Waiting for confirmation`.
- Fix applied: websocket summary suppresses active blocked projection when `summary.pendingConfirmation` is true.
- Fix applied: workflow metadata summary suppresses stale `blockedReason` while pending confirmation is active.
- Fix applied: `WorkflowStatusPanel` treats blocked recovery as active only when there is no pending confirmation.
- Fix applied: `ActiveSession` no longer converts pending-confirmation workflows with `blockedStatus` into failed recovery controls.
- GREEN verification: the three focused stale blocked recovery tests passed.
- Regression verification: `bun test src/server/__tests__/websocket-handler.test.ts src/server/services/workflowSummary.test.ts` passed, 32 tests.
- Regression verification: `cd desktop; bun run test -- src/components/workflow/WorkflowComponents.test.tsx src/pages/ActiveSession.test.tsx --run` passed, 85 tests.
- Gate verification: `bun run check:server` passed, 1171 tests, 7 skipped.
- Gate verification: `bun run check:desktop` passed, 98 desktop test files / 882 tests plus typecheck and production build. Existing React `act(...)` warnings and one Tauri notification-permission test warning were printed but did not fail the gate.

## Changed Code Paths

- `src/server/ws/handler.ts`
- `src/server/services/workflowSummary.ts`
- `src/server/__tests__/websocket-handler.test.ts`
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`
- `desktop/src/components/workflow/WorkflowComponents.test.tsx`
- `desktop/src/pages/ActiveSession.tsx`
- `desktop/src/pages/ActiveSession.test.tsx`
- `.planning/debug/workflow-blocked-recovery-stale.md`

## Root Cause

The runtime correctly clears the active phase blocked reason when a ready submission creates pending confirmation, but the websocket summary separately scanned active phase artifact history for the newest blocked submission. If the phase history contained an older blocked submission plus a newer ready/pending artifact, the scan skipped the ready submission and returned the old blocked submission as if recovery were still active. Desktop then compounded this by coercing any workflow with `blockedStatus` into failed recovery controls for `ActiveSession`, and by rendering `blockedReason` even when `pendingConfirmation` was already true.

## Loop Restoration Proof

blocked completion submission -> old blocked artifact remains in history -> ready submission creates pending confirmation -> websocket summary no longer projects old blocked artifact as active recovery -> desktop pending state remains the controlling UI state -> user sees confirmation controls without the stale red recovery panel.

## Project Cognition Refresh

- Attempted: `project-cognition mark-dirty --reason ... --format json`.
- Result: blocked by existing local project cognition metadata mismatch: `project-cognition.db metadata schema_version has "1", expected "2"`.
- Follow-up: project cognition needs schema/runtime repair or rebuild outside this debug fix; source-level verification is complete.

## Verification Plan

- Add or update a regression test for pending-confirmation workflow data that also contains stale blocked recovery fields.
- Fix the truth projection so pending confirmation suppresses stale active-recovery display.
- Run focused desktop/server tests for the touched area.
