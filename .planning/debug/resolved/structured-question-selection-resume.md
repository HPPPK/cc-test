---
status: resolved
created: 2026-05-28T16:04:00+08:00
updated: 2026-05-28T16:53:00+08:00
reported_by: user
symptom: User selected an answer in the native structured question / askquestion UI, but after re-entering the session the question card appears unselected.
execution_model: leader-inline
dispatch_shape: leader-inline
execution_surface: leader-inline
dispatch_reason: "Focused investigation through one structured-question state chain: tool question render -> user answer submit -> persisted transcript/session state -> resumed desktop render."
blocked_reason: none
causal_map_completed: true
investigation_contract_completed: true
log_investigation_plan_completed: true
observer_framing_completed: true
skip_observer_reason: map-backed-minimum-intake with stale cognition advisory plus user report and focused live-read plan
---

# Debug Session: Structured Question Selection Resume

## Current Focus

stage: resolved
hypothesis: "Confirmed. `AskUserQuestion` restored answered state only from a structured `{ answers }` result object, but persisted transcript/tool-result content stores AskUserQuestion answers as text."
next_action: "Closed after explicit user confirmation that the behavior is acceptable."

## User Report

- User invoked `$sp-debug`.
- User saw a structured `askquestion` / `request_user_input` card asking how workflow phases should transition.
- User selected an option and submitted it.
- After re-entering the conversation/session, the UI no longer shows the prior selected state; it appears as an unselected question again.

## Project Cognition Intake

- lexicon readiness: blocked
- query readiness: blocked
- freshness: stale
- recommended_next_action: run_map_update
- selected_concepts: `askquestion`, `request_user_input`, `structured`, `question`, `selected`, `state`, `restored`, `session`
- rejected_concepts: `not`, `after`
- selection_reason: Bound query to native structured question UI/tool state, answer persistence, and resumed session rendering.
- route_pack / affected nodes included broad `src` and `desktop/src`, with candidate areas:
  - agent/tool runtime and API service layers under `src/`
  - conversation compaction/resume surfaces under `src/services/compact/`
  - desktop session/chat rendering under `desktop/src/`
- minimal_live_reads returned by stale cognition:
  - `src`
  - `desktop/src`
- coverage_gap: Project cognition is stale/blocked and does not name the concrete structured-question owner. Continue with live repository evidence and record dirty/update outcome if source/runtime truth changes.

## Observer Framing

- primary_suspected_loop: assistant emits native structured question -> desktop renders selectable options -> user submits answer -> answer/result is appended to durable conversation state -> session resume loads transcript -> desktop renders the same question card with answered/selected state.
- primary_candidate: The user answer is stored only in ephemeral UI state or runtime control state, while resumed rendering reads only the original question request payload.
- contrarian_candidate: The answer is persisted in transcript/tool result data, but the desktop renderer does not associate the result message with the earlier question card after resume.
- recommended_first_probe: Search for `request_user_input`, structured question card rendering, and answer/tool-result persistence fields; then read the smallest owner files.
- candidate_separating_signals:
  - Submit handler updates local component state but no durable transcript/state field: persistence boundary bug.
  - Transcript contains tool result answer but renderer ignores it on resume: observation/rehydration bug.
  - Tool result is stored under a different id/session key than the question request: correlation-key bug.
- nearest_neighbor_related_risk_target: Other tool cards with post-submit UI state such as permission prompts, confirmations, and workflow transition prompts.

## Consequence Analysis

trigger_status: triggered
trigger_reason: Bug affects session resume, durable conversation state, user-visible selected answers, and structured question workflow control decisions.

### Affected Object Map

- Structured question request: native tool input payload displayed as a card.
- Structured question answer: user-selected option or free-form response submitted back to the agent/runtime.
- Tool result / transcript record: durable state that should survive session reload.
- Desktop chat/message renderer: observation layer that projects request/result state into selected UI.
- Session resume loader: API/client path that reconstructs conversation messages.
- Workflow engine using question answers: downstream consumer that may rely on phase-transition mode.

### State-Behavior Matrix

- created/unanswered: card shows options with no selected state and submit enabled.
- answered/submitted: card shows selected answer and disables or clearly marks submitted state.
- resumed after answered: card still shows selected answer from durable transcript/result state.
- stale/missing result: card should show unanswered only when no answer/result exists.
- duplicate/partial result: renderer must choose a deterministic correlated answer or surface ambiguity safely.
- archived/compacted: selected answer should remain visible if the prompt remains visible or be represented in summary state.

### Dependency Impact Table

- Tool definition -> runtime request id -> desktop message card -> user answer submit -> durable message/result -> resume renderer.
- A change to answer persistence can affect agent-loop control flow and transcript compatibility.
- A change to renderer correlation can affect adjacent tool cards that pair request/result messages.
- Tests should cover answered resume state without requiring a live provider.

### Recovery And Validation Contract

- Reproduce with a focused fixture/test representing a structured question plus submitted answer after session reload.
- Add regression coverage in the owner layer that would fail when a selected answer is not restored.
- Keep unanswered structured question behavior unchanged.
- Verify the selected option is restored from durable state, not only component-local state.
- Record map dirty/update outcome if source/runtime ownership changes.

### Coverage Gaps

- Exact structured question message shape is not yet confirmed by live code.
- Exact persistence surface for submitted answers is not yet confirmed by live code.
- Whether this occurs in desktop UI only or also CLI/TUI is inferred from the user-visible card behavior and must be validated.

### Consequence Obligations

- DBG-CA-001: Answered structured question cards must restore selected/submitted state after session resume. Owner: sp-debug. Latest resolve phase: verification. Stop-and-reopen: resumed card appears unanswered despite prior submission.
- DBG-CA-002: Unanswered structured question cards must remain usable and not show phantom selections. Owner: sp-debug. Latest resolve phase: verification. Stop-and-reopen: initial prompt renders with a stale or incorrect selection.
- DBG-CA-003: Answer correlation must use a durable identifier or transcript order that survives reload/compaction. Owner: sp-debug. Latest resolve phase: verification. Stop-and-reopen: answer attaches to the wrong prompt or disappears after reload.

## Truth Ownership Map

- Decision truth owner: durable conversation/tool-result transcript owns whether a structured question has been answered after reload.
- Reflection/cache layers: desktop component-local selection state only reflects current interaction and cannot be the resume source of truth.
- Evidence status: confirmed by live source inspection and focused regression tests.

## Control State vs Observation State

- Control State: structured question request id, pending question state, submitted answer payload, transcript/tool result record, session id.
- Observation State: selected radio/option styling, submitted label, disabled/enabled submit button, restored card state in the chat UI.

## Closed Loop

structured question emitted -> user selects and submits -> runtime records answer/result -> session history persists result -> resume loader returns request plus answer/result -> renderer correlates and displays selected/submitted state.

## Evidence

- User observation: after choosing an answer and sending it, re-entering the session shows the structured question as unselected.
- Project cognition query returned only stale/blocked broad route hints (`src`, `desktop/src`), so live source evidence is required before root-cause claims.
- Live search evidence: `desktop/src/components/chat/AskUserQuestion.tsx` renders the structured question; `AskUserQuestion.test.tsx` already includes historical-answer behavior; `MessageList.tsx` wires `toolUseId`, `input`, and `result`; `chatStore.ts` tracks pending AskUserQuestion requests separately.
- Live source evidence: `AskUserQuestion` derives historical answered state only from `result.answers` when `result` is an object.
- Live source evidence: `AskUserQuestionTool.mapToolResultToToolResultBlockParam` persists the answer as a text tool_result string: `User has answered your questions: "question"="answer"...`.
- Live source evidence: `chatStore.mapHistoryMessagesToUiMessages` passes persisted `tool_result` block `content` through as `UIMessage.content`, so resumed rendering receives text content rather than the tool's structured `data`.
- RED verification: `bun run test -- src/components/chat/AskUserQuestion.test.tsx --run -t "restores answered state from persisted tool result text"` failed before the fix; rendered DOM showed `Claude needs your input`, option buttons, and disabled `Submit` instead of answered summary.
- Fix applied: `AskUserQuestion` now normalizes historical results from either structured `{ answers }` objects or persisted tool_result text/array text blocks, matching answers by current question text.
- GREEN verification: focused persisted-result test passed after the fix.
- Regression verification: `bun run test -- src/components/chat/AskUserQuestion.test.tsx --run` passed, 8 tests.
- Desktop gate verification: `bun run check:desktop` passed. It ran TypeScript no-emit, 94 Vitest files / 789 tests, and Vite production build. Existing React `act(...)` warnings were printed from unrelated GeneralSettings tests.
- Full gate verification: `bun run verify` completed with 8 passed, 1 failed, and 2 skipped lanes. The only failed lane was `Native desktop checks`.
- Native failure triage: the full gate's default-target native lane failed inside `tauri-build` with Windows `PermissionDenied` while processing `binaries\claude-sidecar-x86_64-pc-windows-msvc.exe`.
- Native isolation verification: rerunning `bun run check:native` with `CARGO_TARGET_DIR` set to a temporary target directory passed, which isolates the full-gate native failure to the default Tauri target/output directory rather than this React resume fix.

## Changed Code Paths

- modified: `desktop/src/components/chat/AskUserQuestion.tsx`
- modified: `desktop/src/components/chat/AskUserQuestion.test.tsx`
- added: `.planning/debug/structured-question-selection-resume.md`

## Changed Behavior Surfaces

- desktop chat structured question rendering
- persisted AskUserQuestion tool_result resume behavior
- desktop AskUserQuestion regression tests

## Verification Evidence

- RED: `bun run test -- src/components/chat/AskUserQuestion.test.tsx --run -t "restores answered state from persisted tool result text"` failed before the fix and rendered the unanswered prompt.
- GREEN: same focused test passed after the fix.
- Regression: `bun run test -- src/components/chat/AskUserQuestion.test.tsx --run` passed, 8 tests.
- Desktop gate: `bun run check:desktop` passed, including TypeScript, 94 test files / 789 tests, and Vite build.
- Full gate: `bun run verify` wrote `artifacts/quality-runs/2026-05-28T07-32-02-930Z/report.md`; summary was 8 passed, 1 failed, 2 skipped. Failed lane was default-target native checks only.
- Coverage gate: full verify wrote `artifacts/coverage/2026-05-28T07-36-03-610Z/coverage-report.md`; changed-line coverage passed at 92.58% (985/1064), minimum 90%, failures none.
- Native isolation: `CARGO_TARGET_DIR=%TEMP%\cc-jiangxia-target-check-structured-question bun run check:native` passed.

## Project Cognition Refresh

- `project-cognition mark-dirty` completed.
- Runtime status remains stale/blocked with recommended next action `run_map_update`.
- reason: `sp-debug changed desktop AskUserQuestion persisted tool_result resume behavior in desktop/src/components/chat/AskUserQuestion.tsx and regression test coverage in desktop/src/components/chat/AskUserQuestion.test.tsx; run sp-map-update for desktop chat structured question coverage.`

## Loop Restoration Proof

- Triggering input: user answers the AskUserQuestion card through the desktop permission response.
- Control decision: runtime executes AskUserQuestion with `updatedInput.answers`.
- Resulting state: the tool_result persists the answer as text in transcript history.
- Resume load: desktop receives the tool_result content as `UIMessage.content`.
- External observation after fix: AskUserQuestion recognizes persisted result text and renders the answered summary instead of a new unanswered prompt.

## Root Cause

summary: `AskUserQuestion` had a mismatch between live structured tool result shape and persisted transcript result shape.
owning_layer: desktop chat observation/rehydration layer
broken_control_state: none; the runtime answer submission and tool execution already record the answer into the tool result.
failure_mechanism: resumed desktop rendering receives persisted tool_result text, but answered-state detection only recognized an object with `answers`.
loop_break: transcript resume -> UI correlation/rendering.
decisive_signal: a focused test using real persisted tool_result text reproduced the unselected prompt, then passed after text-result normalization.

## Alternative Hypotheses Considered

- Answer stored only in component-local state: refined. Live code shows the answer is sent as `updatedInput.answers` and tool result text is persisted.
- MessageList fails to associate tool_result with AskUserQuestion tool_use: not supported by current evidence; it passes `toolResult?.content` to `AskUserQuestion`.
- Server/session history drops the tool_result: not supported by current evidence; history mapping emits `tool_result` UI messages from persisted blocks.

## Fix Classification

fix_scope: observation-boundary
classification_reason: The submitted answer already reaches the tool result; the broken behavior is desktop rehydration failing to recognize the persisted representation.

## Eliminated

- Answer stored only in component-local state: eliminated by tool submit/result persistence evidence.
- Tool result missing from resumed history: eliminated by `chatStore` history mapping and `MessageList` result wiring evidence.
- Source regression in native code: eliminated for this change by an isolated `CARGO_TARGET_DIR` native check passing after the full gate failed only in the default target/output directory.

## Verification Plan

- Search live code for `request_user_input`, `askquestion`, structured question rendering, and answer submission persistence.
- Add a failing focused regression test for answered structured question resume/render behavior.
- Apply the smallest fix at the confirmed ownership boundary.
- Run the focused test and relevant desktop/server gate depending on touched files.
- Run full repository verification and triage any failed lane to source regression or local environment/output-state failure.
- Reach human verification checkpoint for the original re-entry/reload scenario.

## Human Verification Checkpoint

type: human-verify
progress: Root cause confirmed and fixed at the desktop structured-question rehydration boundary. Focused RED/GREEN, full component regression, desktop gate, coverage gate, and isolated native check have passed.
awaiting: User should reload or re-enter a session containing an already answered AskUserQuestion card and confirm it renders the answered/selected summary instead of the unselected prompt.

## Human Verification Result

- 2026-05-28: User confirmed "可以了", accepting the fixed behavior in the target environment.

## Related-Risk Review

- nearest_neighbor_related_risk_target: Other tool cards with post-submit UI state such as permission prompts, confirmations, and workflow transition prompts.
- review_result: This fix is scoped to `AskUserQuestion` result normalization and does not change shared `MessageList`, transcript mapping, permission submission, or other tool-card renderers.
- residual_risk: If future AskUserQuestion tool_result text changes format or allows unescaped quote characters inside answers, resume parsing may need a structured persisted result or stronger parser.

## Closeout

- terminal_status: resolved
- human_confirmation: passed
- learning_capture: manual candidate captured as `LRN-20260528-074835-235191` because `capture-auto` could not parse this human-readable debug Markdown as strict YAML section state.
- learning_detail: `.specify/memory/learnings/learn-2026-05-28-desktop-askuserquestion-persisted-tool-result-text-2c908b1efc.md`
- commit_status: not committed by agent because the repository contains many unrelated dirty worktree changes and no commit was explicitly requested.
- map_status: project cognition marked dirty; run `$sp-map-update` for desktop chat structured question coverage before relying on map freshness for related brownfield work.
