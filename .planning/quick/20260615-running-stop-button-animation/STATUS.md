---
id: 20260615-running-stop-button-animation
slug: running-stop-button-animation
title: Running conversation button animation
status: resolved
trigger: "$sp-quick [Image #1] 这个在对话中的按钮，能不能有一个动画效果，就是看起来会话正在运行中的感觉"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: native-subagents
created: 2026-06-15T15:28:17+08:00
updated: 2026-06-15T16:03:00+08:00
---

## Current Focus

goal: Add a subtle running-state animation to the in-conversation stop/running action button shown while a session is executing.
current_focus: Bounded ChatInput running-button whole-button asynchronous light animation is implemented and verified.
next_action: Final handoff to user.

## Execution Intent

intent_outcome: The stop/running control in the conversation composer should visually communicate that the session is actively running.
intent_constraints:
  - Keep the change scoped to the desktop conversation composer/running action UI.
  - Preserve the stop button action, disabled states, model selector, progress indicator, and layout.
  - Avoid heavy motion, layout shift, or a distracting effect.
success_evidence:
  - Focused component/unit test or existing desktop check proving the running control renders the new animated affordance only while active.
  - Desktop typecheck or scoped component test passes.
cognition_facts:
  selected_capability: concept:GEN-20260610T112843.959253900Z:N-030, broad coverage paths not in existing nodes
  minimal_reads:
    - desktop/src/components/chat/ChatInput.tsx
    - desktop/src/components/chat/ChatInput.test.tsx
    - desktop/src/pages/ActiveSession.tsx
    - desktop/src/pages/ActiveSession.test.tsx
    - desktop/src/theme/globals.css
    - .env.example
  validation_route: focused ChatInput component test plus desktop TypeScript/lint.
  known_risk: Project cognition readiness is review and freshness is partial_refresh; the selected concept is broad, so live code reads are the evidence source.

## Understanding Checkpoint

confirmed_problem: Confirmed - the Stop button in the conversation composer changes label/color while a chat is running, but it does not visually communicate ongoing activity strongly enough.
confirmed_outcome: Confirmed - add a subtle running-state animation to that Stop control so the user can tell the session is active at a glance.
confirmed_scope_boundary:
  - Confirmed - do not change stop behavior, session lifecycle, backend state, model selector, context usage indicator, or composer layout.
  - Confirmed - keep the motion restrained and support reduced-motion behavior.
  - Confirmed - do not add a new animation library or broad theme redesign.
confirmed_execution_approach:
  - Confirmed - update desktop/src/components/chat/ChatInput.tsx and, if needed, desktop/src/theme/globals.css using existing class/CSS patterns.
  - Confirmed - add or update a focused ChatInput.test.tsx assertion that the running button exposes the animated running affordance only while active.
confirmed_validation:
  - Confirmed - run the focused ChatInput test and cd desktop; bun run lint.

## Execution

active_lane: implementation-lane-001 completed via native subagent Peirce (019eca33-26d7-7e80-bb54-19c3df42dcc5), then revised by leader after visual feedback
join_point: subagent handoff consumed, agent closed, leader visual refinement and verification complete
files_or_surfaces: desktop conversation composer running/stop button UI
blocked_dispatch: none
blockers: none
recovery_action: none
retry_attempts: 0
blocker_reason:

## Validation

planned_checks:
  - focused desktop component test or existing test around the composer action controls
  - cd desktop; bun run lint
completed_checks:
  - Read constitution, project rules, learning index, and started passive learning for quick.
  - Project cognition lexicon/query completed with readiness review and partial_refresh.
  - Minimal live reads inspected for ChatInput, ChatInput tests, ActiveSession, ActiveSession tests, and globals CSS.
  - Dispatched implementation-lane-001 to native subagent Peirce.
  - Initially implemented showStopAction and an aria-hidden in-button running indicator in ChatInput.tsx.
  - After user visual feedback, removed the small indicator and changed the affordance to a whole-button edge-flow animation.
  - After follow-up visual feedback, changed the fixed edge flow into asynchronous multi-layer highlights with varied timing and opacity.
  - Added a focused ChatInput.test.tsx regression for active Stop whole-button animation class, idle Run absence, and no indicator marker.
  - Added chat-input-stop-running CSS using fixed-size asynchronous edge and surface highlight animation with reduced-motion handling.
  - Command cd desktop; bun test src/components/chat/ChatInput.test.tsx -t running failed before test execution because Bun native runner does not expose vi.hoisted.
  - Subagent ran cd desktop; bun run test src/components/chat/ChatInput.test.tsx -t running; passed, 1 test passed, 26 skipped.
  - Leader reran cd desktop; bun run test src/components/chat/ChatInput.test.tsx -t running after whole-button revision; passed, 1 test passed, 26 skipped.
  - Leader ran cd desktop; bun run test vite-config.test.ts after CSS revision; passed, 2 tests passed.
  - Leader reran cd desktop; bun run lint after whole-button revision; passed tsc --noEmit.
  - First final bun run check:desktop exposed project CSS rule rejecting color-mix; revised animation to avoid color-mix.
  - Final bun run check:desktop passed desktop lint, full desktop Vitest suite, and production build.
  - Follow-up natural-light revision reran cd desktop; bun run test src/components/chat/ChatInput.test.tsx -t running; passed, 1 test passed, 26 skipped.
  - Follow-up natural-light revision reran cd desktop; bun run test vite-config.test.ts; passed, 2 tests passed.
  - Follow-up natural-light revision reran cd desktop; bun run lint; passed tsc --noEmit.
  - Follow-up natural-light revision reran bun run check:desktop; passed desktop lint, full desktop Vitest suite, and production build.
  - Project cognition closeout reran after natural-light revision with update id upd-20260615T080329.136110600Z; result_state partial_refresh, review still recommended for map freshness.
  - Learning capture follow-up was skipped because the current specify CLI exposes init/check/version/extension only and has no learning subcommand.

## Senior Consequence Analysis

gate_status: stand_down
stand_down_reason: The requested change is a local desktop visual affordance for an already-running conversation control; it should not change lifecycle, persistence, API contracts, destructive behavior, permissions, or session execution semantics.
affected_objects:
  - desktop conversation composer running/stop button visual state
state_behavior_matrix:
  - idle -> no running animation should show
  - running -> stop/running action should show a subtle activity animation without changing click behavior
  - disabled/submitting edge states -> existing disabled and stop behavior should be preserved
dependency_impact:
  - desktop tests/typecheck -> must continue passing
recovery_and_validation:
  - Keep the visual change reversible and CSS/component-local.
  - Add or update a focused test if a stable test surface exists.
project_cognition_evidence:
  - Query readiness review; baseline brownfield_full; freshness partial_refresh.
  - Minimal live reads identified ChatInput as the stop button owner.
  - Live read - ChatInput.tsx derives isActive from chatState not idle and switches the action button to stop behavior.
  - Live read - ChatInput.test.tsx already covers Run to Stop and immediate stop behavior.
coverage_gaps:
  - Project cognition remains partial_refresh because the broader working tree has many stale dirty paths; live code and focused tests are the completion evidence for this quick task.
consequence_obligations:
  - none; gate stood down
escalation_decision: stay quick

## Summary Pointer

summary_path: .planning/quick/20260615-running-stop-button-animation/SUMMARY.md
resume_decision: resolved
