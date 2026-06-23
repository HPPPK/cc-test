---
id: 20260617
slug: skill-invocation-highlight
title: Skill invocation visual highlight in session composer
status: resolved
trigger: "$sp-quick session输入框，用/xxxx选择了skill，这个skill在输入框或者会话能不能颜色特别一点，表示这是一个skill主动调用，codex app有这种"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: native-subagents
created: 2026-06-17T18:00:41+08:00
updated: 2026-06-17T18:15:17+08:00
---

## Current Focus

goal: Add a distinctive visual treatment for skill invocations chosen through slash input in the desktop session composer and/or conversation display.
current_focus: Quick task resolved with display-only skill invocation markers and passing desktop validation.
next_action: None; ready for user review.

## Execution Intent

intent_outcome: Skill invocations such as `/sp-quick` or selected skills appear visually distinct enough that users can recognize the message as an intentional skill invocation, similar to the Codex app behavior.
intent_constraints:
  - Keep this as a focused desktop UX change.
  - Do not change skill execution semantics, provider routing, server workflow policy, or prompt text unless live evidence proves the display surface requires it.
  - Preserve normal slash command entry and existing message submission behavior.
success_evidence:
  - A same-area desktop test or focused component test proves the selected skill is rendered with distinct styling.
  - The focused desktop test surface passes after the change.
cognition_facts:
  selected_capability: unknown; project cognition lexicon blocked by schema mismatch before concept selection.
  minimal_reads:
    - none returned; project-cognition lexicon failed before query planning.
  validation_route: likely desktop Vitest / Testing Library around chat input or message rendering, to be confirmed from live code.
  known_risk: Project cognition database schema is v1 but runtime expects v2; continue from live repository evidence after confirmation and carry the coverage gap.

## Understanding Checkpoint

confirmed_problem: Session composer skill invocations chosen through `/xxxx` look like ordinary text, so users cannot easily tell that the message is intentionally invoking a skill.
confirmed_outcome: Make selected skill invocations visually distinct, prioritizing the composer token and optionally the sent conversation display when live code supports stable recognition.
confirmed_scope_boundary:
  - Desktop UI display change only.
  - Do not change skill execution semantics, server routing, provider behavior, prompt text, or persistence format unless live evidence proves it is required.
confirmed_execution_approach:
  - Locate slash skill selection and chat composer/message rendering surfaces.
  - Add focused same-area regression coverage before production UI edits.
  - Implement the smallest styling/rendering change that preserves existing slash selection and submission behavior.
confirmed_validation:
  - Run the focused desktop/component test.
  - Run `bun run check:desktop` if the change touches shared chat UI.

## Execution

active_lane: focused-test-and-ui-implementation
join_point:
files_or_surfaces: desktop chat/session input UI, slash skill selection UI, conversation/message rendering, same-area tests.
blocked_dispatch: none; native subagent tools are available.
blockers: Existing desktop chat files are dirty; treat them as user/workspace changes and avoid reverting unrelated edits.
recovery_action: If composer inline token styling requires textarea overlay/contenteditable, defer composer inline coloring and keep the quick task scoped to low-risk display markers.
retry_attempts: 0
blocker_reason:

## Validation

planned_checks:
  - Focused same-area desktop test once the owner component is identified.
completed_checks:
  - Project cognition lexicon attempted and blocked by schema v1/v2 mismatch.
  - Passive learning start completed and relevant learning detail docs were read.
  - Native subagent tool discovery completed; `spawn_agent`, `wait_agent`, and `close_agent` are available.
  - Workspace status checked; desktop chat/input/message files have existing modifications.
  - Explorer subagent handoff accepted and closed; owner surfaces are `ChatInput`, `composerUtils`, `LocalSlashCommandPanel`, `MessageList`, `UserMessage`, and same-area tests.
  - RED: `bun run test --run src/components/chat/UserMessage.test.tsx -t "highlights a leading skill invocation"` failed because the message had no `user-message-skill-invocation` marker.
  - RED: `bun run test --run src/components/chat/ChatInput.test.tsx -t "shows a distinct composer marker"` failed because the composer had no `chat-input-skill-invocation` marker.
  - GREEN: both focused tests pass after implementation.
  - `bun run test --run src/components/chat/UserMessage.test.tsx src/components/chat/ChatInput.test.tsx src/components/chat/composerUtils.test.ts`: passed, 3 files / 48 tests.
  - `bun run check:desktop`: passed, 98 test files / 890 tests, TypeScript, and Vite build.
  - Local app reachability check passed for `http://localhost:1420`.
  - Project cognition update and dirty-marker fallback both blocked by schema v1/v2 mismatch.

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason:
affected_objects:
  - Desktop session composer visual state for slash-selected skills.
  - Skill invocation token or submitted user message display.
  - Conversation/session history rendering if the highlight is shown after send.
  - Same-area desktop tests.
state_behavior_matrix:
  - no skill selected -> normal composer and message styling.
  - skill selected in composer -> skill token should be visually distinct while keeping text editable/submittable.
  - message sent with skill invocation -> conversation may show the skill invocation distinctly if implemented on the message surface.
  - resumed session -> any persisted message rendering should remain readable without requiring new persistence fields unless live evidence requires metadata.
dependency_impact:
  - desktop chat input -> likely implementation owner for live composer state.
  - slash command/skill picker -> must keep selection behavior unchanged.
  - message renderer -> optional surface if highlight should appear in the conversation after send.
  - tests -> same-area coverage required for user-facing desktop behavior.
recovery_and_validation:
  - Revert is limited to desktop UI/test changes if implementation stays display-only.
  - Validation must prove both existing entry behavior and new visual marker.
  - No data migration expected unless live evidence shows skill metadata needs persistence.
project_cognition_evidence:
  - project-cognition lexicon blocked: project-cognition.db metadata schema_version has "1", expected "2".
  - Relevant learning: skill visibility changes should be checked against the same catalog/client surfaces users see.
  - Relevant learning: rerun scoped checks after recovery before resolving quick tasks.
coverage_gaps:
  - Cognition route ownership unavailable; owner paths must be proven from live code after confirmation.
  - Exact Codex-app visual pattern is user-provided reference, not locally sourced design spec.
consequence_obligations:
  - CA-001 claim: Highlight must be display-only unless live code proves metadata is required; owner sp-quick; latest resolve phase implementation; status open; stop-and-reopen if skill execution semantics or persistence need to change.
  - CA-002 claim: Existing slash selection and message submission behavior must remain covered; owner sp-quick; latest resolve phase validation; status open; stop-and-reopen if tests reveal behavior coupling beyond styling.
escalation_decision: stay quick

## Summary Pointer

summary_path: .planning/quick/20260617-skill-invocation-highlight/SUMMARY.md
resume_decision: resolved
