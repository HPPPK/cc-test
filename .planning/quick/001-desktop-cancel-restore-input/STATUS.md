---
id: 001
slug: desktop-cancel-restore-input
title: Desktop immediate cancel restores submitted input
status: resolved
trigger: "有个问题，我在对话框发送消息然后立马取消，我记得claude code是支持一定时间可以撤回的，但是我现在这个情况就是我发送立马取消，不仅不会把我刚刚发送的内容撤回到输入框，还会出现思考中，但是实际上是暂停的感觉：我想做个飞机大战于系"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: native-subagents
created: 2026-05-28T11:49:11.1016126Z
updated: 2026-05-28T12:15:00.0000000Z
---

## Current Focus

goal: Fix desktop chat immediate-cancel behavior so a just-submitted prompt can be restored to the input and the stale thinking state is cleared.
current_focus: Quick task resolved with implementation, focused tests, desktop gate, summary, and project cognition dirty closeout recorded.
next_action: None for this quick task; run `$sp-map-update` later to refresh project cognition for the changed desktop chat paths.

## Execution Intent

intent_outcome: Immediate cancel after submitting a desktop chat prompt should behave like a short undo window: restore the just-sent text to the composer, remove or neutralize the transient submitted message state, and clear the misleading thinking indicator when the run is actually paused/cancelled.
intent_constraints:
  - Treat "我想做个飞机大战于系" as the sample prompt content unless the user corrects that it is a separate feature request.
  - Keep scope to desktop chat send/cancel UX and directly required state/API handling.
  - Do not build the airplane game in this quick task.
  - Do not change provider/model execution semantics beyond what is necessary to make cancellation state consistent.
success_evidence:
  - A focused regression test or executable repro proves the current immediate-cancel path fails before production changes.
  - The same focused check passes after the fix.
  - The narrow desktop check for the touched area runs successfully, or any blocker is recorded.
cognition_facts:
  selected_capability: weak route hints term:claude and term:code; project cognition did not return a specific desktop chat cancellation capability.
  minimal_reads:
    - desktop/src
  validation_route: likely desktop Vitest/Testing Library coverage plus targeted desktop check after live code inspection.
  known_risk: project cognition baseline is stale/dirty and returned broad workflow/release nodes unrelated to chat cancellation; live code evidence must drive implementation.

## Understanding Checkpoint

confirmed_problem: Desktop chat immediate cancel after submit does not restore the just-sent text to the composer and leaves a misleading thinking state even though execution appears paused/cancelled.
confirmed_outcome: Restore the just-submitted prompt to the input on immediate cancel, keep message/run status coherent, and clear stale thinking.
confirmed_scope_boundary:
  - Fix only desktop chat send/cancel UX and directly required state synchronization.
  - Treat "我想做个飞机大战于系" as sample prompt text, not a request to build the game in this quick task.
  - Do not redesign broad provider/server lifecycle unless live evidence proves it is required; escalate if so.
confirmed_execution_approach:
  - Use one bounded subagent lane to inspect desktop chat composer/cancel/state surfaces, capture RED with a focused test or repro, implement the smallest fix, and report verification.
confirmed_validation:
  - Focused desktop regression test or executable repro fails before the fix and passes after.
  - Run the smallest relevant desktop verification command for touched files.

## Execution

active_lane: desktop-cancel-restore-worker
join_point: subagent 019e6e6e-27d5-7951-8a22-8f4a38d8fb1a completed, result consumed, and agent closed
files_or_surfaces: desktop chat composer, sent-message state, cancel/abort control, run status/thinking indicator, persistence or session API only if directly implicated by live evidence
blocked_dispatch: none
blockers: none
recovery_action: none
retry_attempts: 1
blocker_reason: none

## Validation

planned_checks:
  - focused failing desktop regression test or executable repro for submit-then-immediate-cancel
  - rerun the focused test after fix
  - run the smallest relevant desktop verification command for touched files
completed_checks:
  - project cognition lexicon/query attempted; query completed with stale/blocked weak coverage and broad minimal_live_reads only
  - worker RED repro: focused store/input tests failed before production fix, proving submitted prompt was not restored
  - focused GREEN: cd desktop && bun run test -- src/stores/chatStore.test.ts src/components/chat/ChatInput.test.tsx --run passed with 90 tests
  - typecheck: cd desktop && bun run lint passed
  - desktop gate: bun run check:desktop passed with desktop lint, 94 Vitest files / 799 tests, and production build

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason: not applicable; this changes lifecycle-visible chat run state, cancellation behavior, composer input state, and user-visible thinking status.
affected_objects:
  - desktop chat composer input value
  - just-submitted user message display state
  - active run/cancellation lifecycle state
  - thinking/loading indicator
  - session persistence/API state if the submitted message is already persisted before cancellation
  - desktop tests covering chat send/cancel behavior
state_behavior_matrix:
  - created/draft -> text remains in composer until submit
  - submitted within undo window -> cancel should restore text to composer and remove or neutralize the transient submitted message
  - queued/running beyond undo window -> cancel should stop/pause execution and clear misleading thinking state without corrupting persisted history
  - paused/cancelled -> UI should show a stable cancelled/idle state, not indefinite thinking
  - completed/failed -> no undo restoration unless live code already supports it safely
dependency_impact:
  - chat UI state store -> must keep composer, message list, and run status synchronized
  - cancellation API/sidecar/server bridge -> must not leave orphaned active state after UI cancel
  - persisted transcript/session records -> must not delete durable history except for the intended immediate-cancel transient message
  - desktop tests -> need regression coverage for immediate cancel and thinking-state cleanup
recovery_and_validation:
  - Prefer state-level idempotent cancel handling; repeated cancel should not duplicate restored input or corrupt messages.
  - Rollback is limited to reverting touched desktop chat files/tests.
  - Verify with a focused red/green test and a targeted desktop check.
project_cognition_evidence:
  - lexicon readiness blocked with only broad term:claude and term:code candidates
  - query baseline dirty/stale/readiness blocked, minimal_live_reads desktop/src, no specific chat cancellation node
  - live code evidence required after confirmation
coverage_gaps:
  - cognition lacks specific ownership for desktop chat cancellation; owner workflow quick; latest safe resolve phase before final summary; stop-and-reopen if live inspection shows server/provider contract changes are required; routing decision stay quick with live evidence.
  - exact undo/cancel grace-window duration is unknown before live inspection; owner workflow quick; latest safe resolve phase before implementation; stop-and-reopen if no existing convention and product decision is needed; routing decision ask user only if live code lacks a clear convention.
consequence_obligations:
  - CA-001 claim: immediate cancel must not leave the UI in thinking when the run is paused/cancelled; owner quick; latest resolve phase validation; status resolved by focused tests and check:desktop; stop-and-reopen if future live testing shows server status can still force non-idle after local stop.
  - CA-002 claim: restored input must exactly preserve the just-submitted prompt content once and avoid duplicate restoration on repeated cancel; owner quick; latest resolve phase validation; status resolved by explicit undoableSubmittedMessage tracking and focused tests; stop-and-reopen if attachment restoration needs broader semantics.
  - CA-003 claim: durable transcript/session history must not be destructively modified outside the immediate-cancel transient message semantics; owner quick; latest resolve phase implementation; status resolved for desktop optimistic state only; stop-and-reopen if server-side persistence changes are later required.
escalation_decision: stay quick unless root cause is unknown after focused repro or the fix requires broad session/provider lifecycle redesign.

## Summary Pointer

summary_path: .planning/quick/001-desktop-cancel-restore-input/SUMMARY.md
resume_decision: resolved
