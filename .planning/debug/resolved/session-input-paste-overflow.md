---
slug: session-input-paste-overflow
status: resolved
trigger: "$sp-debug session input paste overflow"
diagnostic_profile: ui-projection
causal_map_completed: true
investigation_contract_completed: true
log_investigation_plan_completed: true
observer_framing_completed: true
framing_gate_passed: true
legacy_session_needs_reintake: false
execution_model: leader-inline
dispatch_shape: leader-inline
execution_surface: leader-inline
dispatch_reason: "Small focused desktop UI bug with one short evidence chain: textarea/input height recalculation on paste versus keyboard input."
blocked_reason: none
waiting_on_child_human_followup: false
skip_observer_reason: map-unavailable-minimum-intake-from-user-report
atlas_read_completed: false
current_node_id: resolved
created: 2026-06-17T17:00:00+08:00
updated: 2026-06-17T17:44:58+08:00
---

# Debug Session: session-input-paste-overflow

## Status

- state: resolved
- created: 2026-06-17
- user_report: In the session input box, keyboard typing expands the box height, but pasting a large block at once can leave the box too small and text overflows outside the input box.
- behavior_surface: desktop chat/session input UI
- project_cognition_status: blocked
- project_cognition_blocker: `project-cognition.exe lexicon --intent debug ...` failed because `project-cognition.db` metadata `schema_version` is `1`, expected `2`.
- cognition_routing_decision: Continue with live repository evidence only; carry coverage gap. Recommend map rebuild separately only if cognition maintenance is requested.

## Execution Routing

- execution_model: leader-inline
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- dispatch_reason: Small focused desktop UI bug with one short evidence chain: textarea/input height recalculation on paste versus keyboard input.
- blocked_reason:

## Intake Gate

- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- skip_observer_reason: map-unavailable-minimum-intake-from-user-report
- legacy_session_needs_reintake: false

## Pre-Analysis

- Scope boundary: Fix the session/chat input composer height behavior when large text is pasted. Keep message submission, shortcuts, model/runtime behavior, and server session state out of scope unless live evidence proves coupling.
- Key constraints: Preserve existing keyboard-input autosize behavior; do not introduce layout shifts or change persisted chat/session data; add same-area regression coverage.
- Affected surface area: Desktop chat/session input component, its textarea autosize logic, and focused desktop tests.
- Known unknowns: Exact owning component and whether paste uses `textarea` `input`/`change` state, React event order, a CSS height constraint, or a deferred render measurement race.
- Recommended next step: Locate the chat input textarea owner, inspect existing autosize implementation and tests, then write a failing paste regression.

## Observer Framing

- symptom_anchor: Large paste into session input leaves rendered input height stale, causing pasted text to overflow.
- primary_suspected_loop: paste event -> text state update -> textarea scrollHeight measurement -> height style update -> composer layout observation.
- primary_candidate: Autosize measurement runs before React commits the pasted value, so it uses the old scrollHeight.
- contrarian_candidate: CSS max-height/overflow rules allow visual overflow even when height recalculation runs correctly.
- recommended_first_probe: Inspect ChatInput/session input component for autosize timing, paste handling, textarea refs, and existing tests around multiline input.
- candidate_separating_signals:
  - If measurement happens in `onChange` before DOM value/state commit, tests can show `style.height` not updated after paste without an extra layout pass.
  - If CSS is the cause, computed rules will show overflow visible or missing max-height/scroll behavior independent of event timing.
- nearest_neighbor_related_risk_target: Keyboard typing Enter/Shift+Enter behavior and existing autosize behavior for ordinary multiline input.

## Investigation Contract

- primary_candidate_id: paste-autosize-measurement-timing
- candidate_queue:
  1. paste-autosize-measurement-timing
  2. css-overflow-or-max-height-mismatch
  3. textarea test environment missing scrollHeight simulation
- related_risk_targets:
  - desktop chat keyboard input autosize
  - send button/Enter submit behavior
  - message composer layout stability

## Log Investigation Plan

- existing_log_targets: none expected for local UI layout bug
- source_targets:
  - desktop chat/session input component
  - same-area ChatInput tests
  - desktop global/chat CSS affecting textarea overflow
- candidate_signal_mapping:
  - paste-autosize-measurement-timing: event handlers and effects around textarea height updates
  - css-overflow-or-max-height-mismatch: textarea/composer CSS overflow, min/max height, resize, line-height
  - test-environment-gap: existing test helper patterns for mocking scrollHeight/clientHeight
- observability_escalation: If source and unit tests cannot reproduce the visual issue, use Playwright against `http://localhost:1420` with a large paste payload and inspect textarea dimensions.

## Senior Consequence Analysis

- trigger: stood-down
- stand_down_reason: Isolated desktop composer visual sizing bug; no lifecycle operations, destructive behavior, persisted state migration, security boundary, or server/runtime contract change expected.

## Current Focus

Archive after user confirmed the fixed composer no longer lets pasted text render under the toolbar.

## Evidence

- Project cognition lexicon command failed before returning a bundle: schema v1 database where schema v2 alias catalog is required. Live code evidence is required for all claims.
- Live source: `desktop/src/components/chat/ChatInput.tsx` owns active-session composer autosize with `useEffect([input])` setting textarea height from `scrollHeight` capped at 200px.
- Live source: `ChatInput.handlePaste` only handles pasted images for normal sessions; non-image text paste returns without synchronizing composer state, caret, slash/file trigger state, or textarea measurement in the paste handler.
- Live source: active-session textarea height cap has no explicit `overflowY` state, so capped large content relies on browser defaults instead of a controlled scroll/containment mode.
- RED: `bun run test --run src/components/chat/ChatInput.test.tsx -t "resizes the composer immediately when a large text block is pasted"` failed because the textarea value remained `before after` after paste, proving the component did not process text paste in the controlled composer path.
- Fix applied: `ChatInput` now uses a shared textarea resize function in `useLayoutEffect`, explicitly handles non-image text paste by inserting clipboard text into controlled state, restores caret, runs slash/@ trigger detection, and sets `overflowY` to `auto` only when the capped height is reached.
- GREEN: focused paste regression passed with `bun run test --run src/components/chat/ChatInput.test.tsx -t "resizes the composer immediately when a large text block is pasted"`.
- GREEN: full same-area `bun run test --run src/components/chat/ChatInput.test.tsx` passed, 31 tests.
- GREEN: `bun run check:desktop` passed, including `tsc --noEmit`, Vitest with 98 files / 888 tests, and `tsc -b && vite build`.
- Project cognition closeout update failed: `project-cognition.exe update --payload-file .specify/project-cognition/updates/20260617-session-input-paste-overflow.json --reason workflow-finalize --format json` was blocked by schema v1 metadata where schema v2 is required.
- Project cognition dirty marker failed: `project-cognition.exe mark-dirty ... --format json` was blocked by the same schema v1 metadata agreement failure.
- Human verification failed with screenshot evidence: after enough lines, the last visible text row appears inside the bottom action toolbar area. This is the same issue loop, not an unrelated defect.
- Second fix applied: non-hero active-session composer now reserves the absolute bottom toolbar space with textarea `margin-bottom` (`mb-14`, or `mb-16` on mobile) instead of relying on large internal textarea bottom padding. This keeps the textarea scroll viewport above the toolbar.
- GREEN after second fix: focused paste/layout regression passed.
- GREEN after second fix: full `ChatInput` test file passed, 31 tests.
- GREEN after second fix: `bun run check:desktop` passed again, including `tsc --noEmit`, Vitest with 98 files / 888 tests, and `tsc -b && vite build`.

## Eliminated

- css-only overflow mismatch as sole cause: RED showed the text paste did not update controlled textarea value at all.
- image paste branch regression: image handling remains isolated behind `hasImage` and returns before text insertion.

## Truth Ownership Map

- Decision truth owner: desktop textarea DOM measurement plus React component state.
- Reflect/cache layers: visible composer container and CSS layout.
- Evidence: pending live source inspection.

## Control State / Observation State

- Control State: textarea value, measured scrollHeight, inline height or sizing state.
- Observation State: rendered input box height and whether pasted text visually overflows.

## Expected Closed Loop

Input event -> React value/state update -> textarea height recalculation from committed DOM value -> composer layout update -> user sees all text contained or scrollable within the input area.

## Current Hypothesis

The paste path updates textarea value in one event batch, but autosize runs against stale DOM/value timing or only on key-driven events, so large pasted content does not trigger the same height recalculation as keyboard input.

## Root Cause

- summary: Normal-session `ChatInput.handlePaste` special-cased images and otherwise returned, leaving text paste to browser default insertion. That path does not explicitly update the controlled composer state, caret, trigger state, or deterministic autosize/overflow handling at the paste boundary.
- owning_layer: desktop `ChatInput` composer event handling and textarea measurement.
- broken_control_state: controlled composer `input` state and measured textarea height can remain stale immediately after text paste.
- failure_mechanism: Large paste bypasses component-owned insertion and resize logic; height recalculation relies on later/default browser behavior and lacks explicit capped overflow containment.
- loop_break: paste event -> component control decision missing for text -> state/measurement not synchronized -> visible composer box can remain too small.
- decisive_signal: RED test shows paste event leaves controlled textarea value unchanged.
- alternative_hypotheses_considered:
  - CSS-only overflow/max-height mismatch.
  - Text paste bypassing controlled composer state.
  - Test environment missing browser default paste insertion.
- alternative_hypotheses_ruled_out:
  - CSS-only overflow/max-height mismatch cannot explain unchanged controlled textarea value after paste.
- root_cause_confidence: confirmed
- refinement_after_human_verify: The first fix repaired paste state synchronization and capped overflow, but the non-hero composer still used bottom padding inside a textarea whose box extends under an absolute bottom toolbar. Browser caret scrolling can still position the final text line at the textarea bottom edge, which is visually behind the toolbar. The second fix reserves toolbar space outside the textarea scroll viewport.

## Fix Classification

- fix_scope: control-boundary
- rationale: The fix makes paste insertion update the component-owned composer state and layout measurement before relying on the visible textarea projection.
- rejected_surface_fixes:
  - CSS-only overflow changes without text paste state synchronization.

## Loop Restoration Proof

- input event: non-image text paste is now handled by `handlePaste`.
- control decision: paste text is inserted into the controlled composer value at the current selection.
- resource allocation: textarea height is recalculated from committed input state in `useLayoutEffect`.
- state transition: large content caps height at 200px and switches `overflowY` to `auto`; non-hero composer reserves toolbar space outside the textarea with bottom margin.
- external observation: focused regression verifies pasted text is present, height is `200px`, overflow containment is internal scrolling, and the compact composer uses `mb-14` instead of `pb-14`.

## Verification Plan

- Add focused same-area regression for large paste expanding the chat input.
- Run the focused desktop test file.
- Run `bun run check:desktop` if the focused test and TypeScript surface pass.

## Changed Code Paths

- modified:
  - `desktop/src/components/chat/ChatInput.tsx`
  - `desktop/src/components/chat/ChatInput.test.tsx`
  - `.planning/debug/resolved/session-input-paste-overflow.md`
- added:
  - `.specify/project-cognition/updates/20260617-session-input-paste-overflow.json`

## Verification Evidence

- `bun run test --run src/components/chat/ChatInput.test.tsx -t "resizes the composer immediately when a large text block is pasted"`: passed.
- `bun run test --run src/components/chat/ChatInput.test.tsx`: passed, 31 tests.
- `bun run check:desktop`: passed, 98 test files / 888 tests, `tsc --noEmit`, `tsc -b`, and `vite build`.
- After second layout fix, reran:
  - `bun run test --run src/components/chat/ChatInput.test.tsx -t "resizes the composer immediately when a large text block is pasted"`: passed.
  - `bun run test --run src/components/chat/ChatInput.test.tsx`: passed, 31 tests.
  - `bun run check:desktop`: passed, 98 test files / 888 tests, `tsc --noEmit`, `tsc -b`, and `vite build`.

## Project Cognition Refresh

- payload_file: `.specify/project-cognition/updates/20260617-session-input-paste-overflow.json`
- update_status: blocked
- dirty_marker_status: blocked
- blocker: `project-cognition.db` metadata `schema_version` is `1`, expected `2`.
- recovery: run `sp-map-scan -> sp-map-build` or otherwise migrate/rebuild the project cognition baseline before retrying closeout update.

## Learning Capture

- auto_capture_status: blocked
- blocker: `specify learning capture-auto` requires CLI-parseable YAML section bodies; this manually maintained debug session contains markdown bullets/code spans in sections such as `Status`.
- recovery: use the CLI-native debug persistence format for future sessions that must be consumed by `learning capture-auto`, or add a converter before retrying.

## Human Verification

- status: passed
- previous_result: user screenshot showed final text line could render behind the bottom toolbar after enough lines.
- result: User confirmed "可以了" after the second same-issue layout fix.
