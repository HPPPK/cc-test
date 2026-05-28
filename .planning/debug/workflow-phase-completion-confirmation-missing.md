---
status: resolved
created: 2026-05-28T14:17:09+08:00
updated: 2026-05-28T15:21:48+08:00
reported_by: user
symptom: User reports no visible confirmation prompt after submitting phase completion; repeated submit returns `Workflow already has a pending completion`, while visible UI only shows `Complete Phase`.
execution_model: leader-inline
dispatch_shape: leader-inline
execution_surface: leader-inline
dispatch_reason: Small focused investigation with one workflow action, one pending-completion control state, and one desktop status/control UI surface.
blocked_reason: none
causal_map_completed: true
investigation_contract_completed: true
log_investigation_plan_completed: true
observer_framing_completed: true
skip_observer_reason: map-backed-minimum-intake with stale cognition advisory plus live route paths
---

# Debug Session: Workflow Phase Completion Confirmation Missing

## Current Focus

stage: resolved
hypothesis: "Confirmed. `WorkflowTransitionControls` renders the manual `Complete Phase` branch before the pending-confirmation branch. With `pendingConfirmation: true`, `status: running`, and `transitionAuthority: user-confirmation`, the UI shows the duplicate submit affordance instead of confirm/reject controls."
next_action: "Session closed after user verified the fix."

## User Report

- User invoked `$sp-debug`.
- During a workflow plan phase completion, the assistant told the user to approve a confirmation prompt.
- User cannot find a `confirm` button.
- Re-submitting `submit_phase_completion` returns `Workflow already has a pending completion`.
- User sees a `Complete Phase` button, but says that is not the confirm control.

## Project Cognition Intake

- lexicon readiness: blocked
- query readiness: blocked
- freshness: stale
- recommended_next_action: run_map_update
- selected_concepts: `confirmation`, `prompt`, `pending`, `phase`, `completion`, `complete`, `button`
- rejected_concepts: `-debug`, `not`, `visible`
- selection_reason: Bound query to phase-completion confirmation UI/control-state terms and rejected invocation/stopword concepts.
- route_pack / affected nodes:
  - `desktop/src/api/sessions.ts`
  - `desktop/src/api/sessions.test.ts`
  - `desktop/src/types/session.ts`
  - `desktop/src/components/workflow/WorkflowStatusPanel.tsx`
  - `desktop/src/components/workflow/WorkflowTransitionControls.tsx`
  - `desktop/src/components/workflow/WorkflowReportLink.tsx`
  - related workflow settings/template UI files
- minimal_live_reads returned by stale cognition:
  - `.specify/project-cognition/status.json`
  - `.specify/project-cognition/project-cognition.db`
- coverage_gap: Project cognition is stale/dirty from workflow status panel changes. Continue with live repository evidence for this user-visible regression and recommend `$sp-map-update` after the fix.

## Observer Framing

- primary_suspected_loop: phase-ready tool call -> server/runtime pending completion state -> desktop fetch/subscription receives pending completion -> UI renders explicit confirmation affordance -> user approves -> runtime advances to next phase.
- primary_candidate: `WorkflowTransitionControls` or nearby status panel renders only the initial `Complete Phase` submit action and lacks a distinct pending approval control for `pending_completion`.
- contrarian_candidate: Server/API does not expose the pending completion state or approval endpoint to desktop, so the UI cannot render a confirmation even if components are correct.
- recommended_first_probe: Read workflow session types/API client and `WorkflowTransitionControls` to identify whether pending completion state and approval/rejection actions are represented.
- candidate_separating_signals:
  - Desktop types/API expose pending completion but controls do not render approval UI: UI observation-layer bug.
  - API/types lack pending completion or approval endpoints: contract/control-boundary bug.
  - Controls render approval UI but only in a collapsed/hidden panel: placement/copy/accessibility bug.
- nearest_neighbor_related_risk_target: Workflow status compact display and phase transition controls for `ready`, `running`, `blocked`, and already-pending states.

## Consequence Analysis

trigger_status: triggered
trigger_reason: Bug affects lifecycle transition approval, pending shared state, user-visible controls, workflow runtime idempotency, and duplicate submit behavior.

### Affected Object Map

- Workflow phase completion request: tool/server action that creates pending completion.
- Pending completion state: control-plane lock preventing duplicate submit.
- Desktop session API client/types: observation and mutation contract for workflow session state.
- `WorkflowTransitionControls`: user-visible command/approval controls.
- `WorkflowStatusPanel`: adjacent status display that may host pending-state messaging.
- User task flow: plan -> approve/confirm -> implementation phase.
- Duplicate submit error: observation state proving pending control state exists.

### State-Behavior Matrix

- created/no workflow: no phase controls.
- running phase: no completion approval unless phase status allows it.
- ready phase/no pending completion: show submit/complete action.
- pending completion: hide or disable duplicate completion submit and show explicit approval/confirmation plus cancel/reject where supported.
- approved/completed: advance to next phase and clear pending state.
- rejected/cancelled: clear pending state and keep or reopen current phase according to runtime contract.
- failed API action: show actionable error without losing pending state.
- stale/polling snapshot: reflect pending state once next session fetch/event arrives.

### Dependency Impact Table

- Server/runtime state -> desktop API session shape -> transition controls -> user approval action.
- Duplicate submit handling depends on pending completion idempotency and should remain intact.
- UI copy/labels affect whether users can distinguish submitting completion from confirming an existing completion.
- Tests must cover both no-pending ready state and pending state to avoid regressing the normal `Complete Phase` flow.

### Recovery And Validation Contract

- Reproduce with focused component/API-state test using a session containing pending completion.
- Add regression coverage that proves pending state renders an explicit confirm/approve affordance and suppresses duplicate completion submit.
- Verify normal ready/no-pending completion still renders `Complete Phase`.
- Verify focused desktop workflow tests pass.
- Record cognition dirty/update outcome for changed workflow UI/API contract paths.

### Coverage Gaps

- The exact state property name for pending completion is not yet confirmed by live code.
- Whether server already provides approve/reject endpoints is not yet confirmed.
- Whether the user was viewing desktop UI, agent transcript tool cards, or both is inferred from the reported `Complete Phase` button and must be validated against local UI surfaces.

### Consequence Obligations

- DBG-CA-001: Pending completion must produce an explicit confirmation/approval affordance distinct from the initial `Complete Phase` submit action. Owner: sp-debug. Latest resolve phase: verification. Stop-and-reopen: pending completion exists but UI only offers duplicate submit or no visible confirmation.
- DBG-CA-002: Duplicate submit protection must remain intact. Owner: sp-debug. Latest resolve phase: verification. Stop-and-reopen: user can create multiple pending completions or repeated submit no longer reports/blocks safely.
- DBG-CA-003: Normal no-pending ready phase completion must remain usable. Owner: sp-debug. Latest resolve phase: verification. Stop-and-reopen: fix hides or breaks `Complete Phase` for ready/no-pending states.

## Truth Ownership Map

- Decision truth owner: workflow runtime/server session state owns whether a phase has a pending completion and whether it can be approved.
- Reflection/cache layers: desktop API client/types reflect session state; status/transition controls project it into UI actions.
- Evidence status: pending live source/test inspection.

## Control State vs Observation State

- Control State: current phase status, pending completion record, stateVersion, allowed transition actions, idempotency guard.
- Observation State: `Complete Phase` button, confirmation/approval controls, tool error `Workflow already has a pending completion`, status panel messages.

## Closed Loop

phase completion submit -> runtime creates pending completion and blocks duplicates -> desktop observes pending completion -> user approves/confirm -> runtime clears pending and advances phase -> desktop observes next phase.

## Evidence

- User-provided tool output: repeated `submit_phase_completion` returned `Workflow already has a pending completion`, proving a pending completion control state already exists.
- User observation: no visible `confirm` button; visible control is `Complete Phase`, which user says is not the confirmation affordance.
- Project cognition query returned workflow API/client and runtime status/transition components as likely affected paths, but the graph is stale/blocked and cannot be treated as evidence.
- Live source evidence: `desktop/src/types/session.ts` defines `WorkflowSessionSummary.pendingConfirmation`, lifecycle status `pending-confirmation`, and transition action `confirm`.
- Live source evidence: `desktop/src/api/sessions.ts` exposes `transitionWorkflow(sessionId, body)` to POST workflow transition actions.
- Live source evidence: `desktop/src/components/workflow/WorkflowTransitionControls.tsx` renders `Confirm`, `Reject`, and `Retry` when `workflow.status === 'pending-confirmation' || workflow.pendingConfirmation`.
- Existing test evidence: `desktop/src/components/workflow/WorkflowComponents.test.tsx` has coverage that pending confirmation controls call `confirm`, `reject`, and `retry` with stateVersion/transitionId.
- Live source evidence: `WorkflowTransitionControls` currently evaluates `canRequestConfirmation` and returns the `Complete Phase` manual-completion UI before it evaluates the `pending` branch.
- Live source evidence: `canRequestConfirmation` is true for `workflow.status === 'running'` plus `transitionAuthority === 'user-confirmation'`.
- Live source evidence: `src/server/services/workflowRuntimeService.ts` sets pending control state on ready completion and throws `Workflow already has a pending completion.` on repeated ready submissions.
- Live source evidence: `src/server/api/sessions.ts` and `src/server/ws/handler.ts` both route workflow state notifications through `workflowNotificationForDesktop`, and `src/server/services/workflowSummary.ts` maps pending state to `pendingConfirmation: Boolean(...)`.
- RED verification: `bun run test -- src/components/workflow/WorkflowComponents.test.tsx --run -t "prioritizes pending confirmation controls"` failed as expected. The rendered DOM contained only `Complete Phase` and no `Waiting for confirmation`/`Confirm` controls for `pendingConfirmation: true` with stale `status: running`.
- Fix applied: `desktop/src/components/workflow/WorkflowTransitionControls.tsx` now returns the pending-confirmation controls before evaluating the manual `Complete Phase` branch.
- GREEN verification: `bun run test -- src/components/workflow/WorkflowComponents.test.tsx --run -t "prioritizes pending confirmation controls"` passed after the fix.
- Regression verification: `bun run test -- src/components/workflow/WorkflowComponents.test.tsx --run` passed, including the existing manual completion flow and pending confirmation transition tests.
- Desktop gate verification: `bun run check:desktop` passed. It ran desktop lint, 94 Vitest files / 788 tests, and Vite production build. Existing React `act(...)` warnings were printed from unrelated GeneralSettings tests.
- Full gate verification: `bun run verify` failed with no terminal summary. Latest quality report path identified as `artifacts/quality-runs/2026-05-28T06-26-58-592Z/report.md`; latest coverage report path identified as `artifacts/coverage/2026-05-28T06-30-43-660Z`.
- Quality report evidence: `bun run verify` summary was 8 passed, 1 failed, 2 skipped. The only failed lane was `Native desktop checks`; desktop checks, server checks, coverage gate, policy checks, quarantine, workflow smoke, and persistence upgrade checks passed.
- Native lane log evidence: `bun run check:native` built sidecars, then `cargo check` failed inside Tauri custom build script with `PermissionDenied` / `拒绝访问` from `tauri-build-2.5.6`, before Rust compilation evidence tied to this React component change.
- Native retry evidence: direct `bun run check:native` reproduced the same `tauri-build-2.5.6` custom build script `PermissionDenied` failure.
- Native diagnosis evidence: `RUST_BACKTRACE=1 cargo check` shows the panic in `tauri_build::copy_binaries`, and line 80 removes an existing copied external binary. Process inspection shows running local `tauri.exe dev`, `claude-code-desktop.exe`, and `claude-sidecar.exe` from `desktop/src-tauri/target/debug/claude-sidecar.exe`, so Windows denies replacing the default target sidecar while the dev app is running.
- Native alternate-target verification: `CARGO_TARGET_DIR=F:\github\cc-jiangxia\desktop\src-tauri\target-check bun run check:native` passed. This proves the native failure in the full gate is a local default-target file lock from the running dev app, not a source regression in this UI fix.

## Changed Code Paths

- modified: `desktop/src/components/workflow/WorkflowTransitionControls.tsx`
- modified: `desktop/src/components/workflow/WorkflowComponents.test.tsx`
- added: `.planning/debug/workflow-phase-completion-confirmation-missing.md`

## Changed Behavior Surfaces

- desktop workflow transition controls
- pending phase completion confirmation affordance
- desktop workflow component regression tests

## Verification Evidence

- RED: `bun run test -- src/components/workflow/WorkflowComponents.test.tsx --run -t "prioritizes pending confirmation controls"` failed before the fix, rendering only `Complete Phase`.
- GREEN: same focused test passed after the fix.
- Regression: `bun run test -- src/components/workflow/WorkflowComponents.test.tsx --run` passed, 36 tests.
- Desktop gate: `bun run check:desktop` passed, 94 test files / 788 tests plus lint and Vite build.
- Full gate: `bun run verify` ran and produced report `artifacts/quality-runs/2026-05-28T06-26-58-592Z/report.md`; result 8 passed, 1 failed, 2 skipped. The only failure was `Native desktop checks`.
- Native diagnosis: direct `bun run check:native` failed because running local `tauri dev` held `desktop/src-tauri/target/debug/claude-sidecar.exe`, preventing Tauri from replacing that generated sidecar.
- Native proof with isolated target: `CARGO_TARGET_DIR=F:\github\cc-jiangxia\desktop\src-tauri\target-check bun run check:native` passed.

## Loop Restoration Proof

- Triggering input: an agent submits phase completion and runtime creates pending control state.
- Control decision: server/runtime already sets `pendingConfirmation` and blocks duplicate submissions.
- Resource/resulting state: desktop summary may temporarily observe `pendingConfirmation: true` while lifecycle `status` remains `running`.
- External observation after fix: transition controls now treat `pendingConfirmation` as the controlling state and render `Waiting for confirmation`, `Confirm`, `Reject`, and `Retry` before considering the manual `Complete Phase` branch.
- Adjacent behavior preserved: no-pending running user-confirmation phases still render `Complete Phase`; blocked/failed flows still render retry behavior.

## Project Cognition Refresh

- `project-cognition mark-dirty` completed. Runtime status remains stale/blocked with recommended next action `run_map_update`.
- reason: `sp-debug workflow phase completion confirmation control priority changed in desktop/src/components/workflow/WorkflowTransitionControls.tsx; follow up with sp-map-update for desktop workflow UI after unrelated workspace changes are separated`.

## Human Verification Checkpoint

type: human-verify
progress: Root cause found and fixed in desktop workflow controls. Automated desktop, coverage, server, and native alternate-target checks are green; full `verify` is blocked only by the currently running local Tauri dev app locking default `target/debug/claude-sidecar.exe`.
awaiting: User should reload/restart the desktop app build and verify that an already pending phase completion displays `Confirm`, `Reject`, and `Retry` rather than only `Complete Phase`.

## Human Verification Result

- User reported: `这个解决了`.
- Outcome: same issue resolved.
- Terminal state: resolved.

## Fix Classification

fix_scope: observation-boundary
classification_reason: The server/runtime control state already records the pending completion and blocks duplicate submissions. The broken handoff is the desktop control projection choosing the manual completion observation branch before the pending-confirmation branch when lifecycle status is stale.

## Eliminated

- pending

## Verification Plan

- Inspect `desktop/src/types/session.ts`, `desktop/src/api/sessions.ts`, `desktop/src/components/workflow/WorkflowTransitionControls.tsx`, and adjacent focused tests.
- Add a failing component/API test for pending completion confirmation visibility.
- Apply the smallest fix in the truth-owning UI/API contract layer identified by live evidence.
- Run focused desktop workflow tests, then `bun run check:desktop` if production desktop code changes.
