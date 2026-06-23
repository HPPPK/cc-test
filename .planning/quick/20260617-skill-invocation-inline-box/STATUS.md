---
id: 20260617-inline
slug: skill-invocation-inline-box
title: Inline skill invocation marker in composer and sent messages
status: resolved
trigger: "$sp-quick [Image #1] 我说的这个红框框这个技能特殊标记，不是另外一个地方标记，而是在对话框就标记红色框框矿主的，包括发送出去也是要标记的"
understanding_confirmed: true
execution_model: subagent-preferred
dispatch_shape: one-subagent
execution_surface: leader-inline
created: 2026-06-17T20:00:00+08:00
updated: 2026-06-17T20:58:00+08:00
---

## Current Focus

goal: Change the desktop skill invocation marker so the slash skill token itself is highlighted inside the composer text area using the current skill marker styling and remains highlighted in sent user messages.
current_focus: Complete. The composer now marks the leading skill token inline using the existing skill marker color treatment, and sent user messages keep the leading skill token marker.
next_action: No implementation follow-up required for this quick task. Project cognition closeout returned partial_refresh and should be reviewed before treating the map as clean.

## Execution Intent

intent_outcome: A skill token such as `/update-config` is visually marked where the user typed it, using the current skill marker colors/style rather than a new red treatment, and the same token remains marked in the submitted conversation message.
intent_constraints:
  - This is a desktop UI display change only.
  - The marker must appear in the input/composer text area, not only in a separate toolbar chip, footer badge, or another location.
  - Keep the existing skill marker color treatment; the red box in the screenshot is an annotation, not the desired UI color.
  - Sent messages must preserve the marker around the leading skill token.
  - Do not change skill execution semantics, server routing, provider behavior, prompt text, or persistence format unless live evidence proves it is required.
  - Preserve normal slash command entry, editing, caret behavior, and message submission.
success_evidence:
  - Focused desktop tests fail before the UI change for inline composer marking and sent-message marking.
  - Focused desktop tests pass after implementation.
  - Run `bun run check:desktop` or the smallest same-area desktop validation required by touched files.
cognition_facts:
  selected_capability: weak compass match; returned workflow-skill nodes rather than desktop chat owners.
  minimal_reads:
    - .codex/skills/sp-quick/SKILL.md
    - .codex/skills/sp-implement/SKILL.md
  validation_route: desktop Vitest / Testing Library for chat composer and user message rendering.
  known_risk: Previous quick task deliberately used a separate composer chip because textarea inline token styling may require an overlay or contenteditable-style render layer.

## Understanding Checkpoint

checkpoint:
  issue: Previous skill marker appears in the wrong place; the requested visual marker belongs on the skill token inside the chat input itself, like the screenshot's `/update-config` location, and it should also appear after sending.
  expected_or_target: Render the skill command token itself, such as `/update-config`, with the current skill marker color/style inside the composer and in the sent user message.
  in_scope:
    - Desktop chat composer skill token display.
    - Sent user message rendering for leading skill invocation tokens.
    - Same-area tests around chat input/message rendering.
  out_of_scope:
    - Separate chips/badges outside the input as the primary solution.
    - Skill execution behavior, provider/model routing, server workflow policy, persistence schema changes, or prompt semantics.
    - Broad redesign of the whole composer unless inline marking is impossible with the current control.
  next_action: Confirm scope, then inspect the existing desktop chat input/message rendering and implement a tested inline red-box marker.
  done_or_progress_signal:
    - RED test demonstrates the current composer does not mark `/update-config` inline.
    - GREEN focused tests pass for composer and sent message rendering.
    - Desktop validation command passes or any blocker is recorded.
  user_corrections:
    - 2026-06-17T20:00:00+08:00: User clarified the marker must be in the dialog/input text itself and in sent messages, not in another location.
    - 2026-06-17T20:05:00+08:00: User clarified the screenshot red box is not the desired UI color; keep the current marker colors.
    - 2026-06-17T20:08:00+08:00: User confirmed the corrected quick checkpoint.

## Execution

active_lane: focused-composer-message-inline-marker
join_point:
files_or_surfaces: desktop chat composer, skill/slash token parser, user message rendering, same-area tests.
blocked_dispatch: native subagent tools are available, but the current tool contract permits spawn_agent only when the user explicitly asks for subagents/delegation/parallel agent work; light-tier quick fallback is leader-inline.
blockers:
recovery_action: Proceed leader-inline with the same focused scope and verification gates.
retry_attempts: 0
blocker_reason:

## Validation

planned_checks:
  - Focused desktop test for inline composer skill token marker.
  - Focused desktop test for sent message skill token marker.
  - `bun run check:desktop` if shared chat UI files are touched.
completed_checks:
  - Project cognition compass completed with query_ready / usable_with_review, but result was weak for desktop chat ownership.
  - Constitution, project rules, learning index, and passive learning start completed before implementation.
  - Existing resolved quick task `.planning/quick/20260617-skill-invocation-highlight` reviewed as prior implementation context.
  - Native subagent capability discovered; spawn_agent use is unsafe under current explicit-user-request rule, so light-tier quick fallback switched to leader-inline.
  - RED focused test captured the existing incorrect behavior: no inline composer editor marker was available and the separate toolbar chip remained.
  - GREEN focused test passed for `ChatInput.test.tsx` inline composer skill token marking.
  - Related chat tests passed: `cd desktop && bun run test --run src/components/chat/ChatInput.test.tsx src/components/chat/UserMessage.test.tsx src/components/chat/composerUtils.test.ts` passed 3 files / 48 tests.
  - Desktop validation passed: `bun run check:desktop` passed 98 test files / 890 tests, TypeScript no-emit, and Vite build.
  - Whitespace validation passed for touched quick-task files via `git diff --check`.
  - First `bun run verify` failed only in native checks because Windows denied access to the default Tauri target directory.
  - Recovery native check passed with isolated `CARGO_TARGET_DIR=%TEMP%\cc-jiangxia-tauri-target-inline-marker`.
  - Second `bun run verify` with the isolated Cargo target reported 9 passed / 0 failed / 2 skipped, with coverage failures none, but exited non-zero because policy marked the dirty 742-file worktree as PR-not-ready and escalated live-provider checks were not run.
  - Project cognition update ran from the changed paths and verification evidence; result_state was `partial_refresh`, so the map closeout is recorded but not clean.
  - Browser screenshot was not captured because the in-app browser control tool was not available in this runtime and the repo does not expose a Playwright dependency for an equivalent local screenshot pass.

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason:
affected_objects:
  - Desktop chat composer visual state for slash skill invocations.
  - Skill token parsing and highlighting behavior.
  - Sent user message display.
  - Same-area desktop tests.
state_behavior_matrix:
  - empty input -> normal composer display.
  - non-skill slash/path text -> no false skill marker.
  - leading skill token while editing -> token is visibly marked with the current skill marker styling without breaking editing or submission.
  - message sent with leading skill token -> sent message shows the same token marker.
  - resumed historical message -> leading skill token remains readable; no new persistence expected unless live evidence proves metadata is required.
dependency_impact:
  - chat input rendering -> may need an overlay/contenteditable strategy if the current native textarea cannot style partial text.
  - slash command selection -> must keep selection and replacement behavior unchanged.
  - message renderer -> should reuse the token parser where possible.
  - tests -> must cover both composer and sent message behavior.
recovery_and_validation:
  - Revert remains local to desktop UI/test changes if no persistence or runtime semantics change.
  - Validation must prove existing submission behavior and new inline marker.
  - If inline composer marking requires a broad editor rewrite, stop and escalate before expanding scope.
project_cognition_evidence:
  - Compass readiness query_ready; bundle weakly matched workflow skill docs, not chat UI owners.
  - Previous quick summary records textarea inline coloring as not checked and lower-risk chip as chosen.
coverage_gaps:
  - Exact implementation owner must be proven from live source after confirmation.
  - Screenshot establishes desired marker placement, not a new red color; design tokens/color values must follow the existing desktop skill marker style.
consequence_obligations:
  - CA-001 claim: Marker must be inline on the skill token in the composer, not primarily outside the input, while preserving the current marker color style; owner sp-quick; latest resolve phase implementation; status open; stop-and-reopen if current composer cannot support this without broad rewrite.
  - CA-002 claim: Sent user messages must preserve the skill-token marker; owner sp-quick; latest resolve phase validation; status open; stop-and-reopen if message persistence lacks enough data to distinguish skill invocations safely.
  - CA-003 claim: Slash selection, text editing, and message submission behavior must remain unchanged; owner sp-quick; latest resolve phase validation; status open; stop-and-reopen if tests show editor behavior coupling.
escalation_decision: stay quick unless inline composer marking requires a broad editor architecture change.

## Summary Pointer

summary_path: .planning/quick/20260617-skill-invocation-inline-box/SUMMARY.md
resume_decision: resolved; do not resume unless the user reports a visual mismatch in the running desktop app or project cognition review requires follow-up.

## Terminal Outcome

result: fixed in this quick task
changed_behavior:
  - A selected slash skill such as `/update-config` is marked directly inside the composer text area using the existing skill marker colors.
  - The previous separate composer toolbar chip is no longer the primary skill invocation marker.
  - Sent user messages continue to mark the leading slash skill token.
verification_status:
  desktop_chat_surface: confirmed correct by focused and same-area Vitest coverage.
  desktop_build_surface: confirmed correct by `bun run check:desktop`.
  full_local_gate: local lanes passed, but PR readiness remains blocked by unrelated dirty-worktree policy and skipped live checks.
  project_cognition_closeout: partial_refresh; review required before claiming clean cognition freshness.
