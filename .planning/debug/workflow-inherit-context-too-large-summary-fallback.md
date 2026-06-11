# Debug Session: workflow inherit context too large summary fallback

## Metadata

- status: awaiting_human_verify
- created: 2026-06-04T00:00:00.0000000Z
- updated: 2026-06-04T00:00:00.0000000Z
- trigger: `$sp-debug` Existing session -> Workflows -> inherit visible context reports that the current conversation is too large to inherit directly and asks to use summarize context.
- parent_session: `.planning/debug/workflow-linked-source-completed-session.md`
- issue_classification: derived_issue
- classification_reason: The parent session fixed linked workflow source validation; this report reaches a different downstream context-size guard with a different error message.
- execution_model: leader-inline
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- dispatch_reason: small focused investigation with one observed error, one context strategy boundary, and a short likely path from desktop context choice to server/session context preparation
- blocked_reason: none

## Intake State

- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- skip_observer_reason: map-backed-minimum-intake plus linked parent-session evidence
- legacy_session_needs_reintake: false

## Current Focus

Await human verification of the desktop workflow context recovery behavior, with repository-level blockers recorded.

Next action: user should retry the existing-session workflow start flow and choose `Summarize context` after the oversized direct-inherit alert appears.

## Scope Boundary

In scope:
- linked workflow context strategy selection from an existing session
- direct visible-context inheritance size guard
- summarized-context fallback availability and request payload
- server/client error mapping for linked workflow creation

Out of scope:
- redesigning workflow templates
- changing provider context-window limits globally
- mutating existing persisted transcripts
- allowing silent fallback if the user explicitly chose a non-summary mode and product intent requires explicit consent

## Key Constraints

- Preserve explicit user choice semantics: direct inherit and summarized inherit must remain distinguishable unless product code already defines automatic fallback.
- Do not hide oversized-context failures behind unrelated workflow-source validation.
- Add a regression that proves the selected context mode can reach the intended server behavior.
- Treat project cognition as advisory; live code and tests must prove root cause and fix.

## Map-Backed Intake

readiness: review
freshness: partial_refresh
selected_concepts:
- Conversation Compaction Engine (`node.compaction`)
- AgentTool Entrypoint (`node.agent_tool`)

rejected_concepts:
- API Service Layer: too broad without live evidence
- Adapter WebSocket Bridge: no transport symptom yet
- docs corpus: documentation does not own runtime behavior
- analytics, attachment, auto-dream, built-in catalog, release assets: unrelated or incidental

concept_decisions:
- `node.compaction` selected because the reported message distinguishes direct inheritance from summarized context.
- `node.agent_tool` selected with low confidence because workflow launch may share agent/tool context plumbing.

minimal_live_reads:
- `desktop/src`
- `src/services/compact`
- `src/tools/AgentTool`
- `src`
- `src/services/compact/compact.ts`
- `src/tools/AgentTool/AgentTool.tsx`

coverage_gaps:
- Cognition did not directly map the desktop workflow context picker or linked workflow API owner.
- Parent session suggests the linked workflow source-validation layer is adjacent but not necessarily causal.

## Observer Framing

primary_suspected_loop: Desktop exposes a linked workflow context choice named "inherit visible context"; when the selected source conversation exceeds the direct-inherit payload limit, the request reaches a guard that rejects direct inheritance and only tells the user to use summarized context, instead of making the summary strategy usable from the workflow-start path.

primary_candidate: context-strategy-mismatch
contrarian_candidate: summary-strategy-unavailable-or-broken
recommended_first_probe: Search the exact oversized-context error text, identify whether it is thrown by the server before or after request payload validation, then inspect the desktop request mode for direct versus summary context selection.
related_risk_targets:
- completed workflow source sessions from the parent issue
- non-workflow existing sessions
- running or pending workflow sessions that must remain blocked as sources
- desktop plus-menu workflow launcher
- server linked workflow creation API
- conversation compaction/summarization path

## Transition Memo

first_candidate_to_test: context-strategy-mismatch
why_first: The user selected direct visible-context inheritance and received an actionable message to use summary, so the first boundary to prove is whether the workflow-start path offers/sends the summary mode or always sends direct inherit.
evidence_unlock:
- exact error text location proves the owning layer
- request payload constants prove which strategy the UI sends
- focused regression can prove summary mode bypasses the direct-size guard
carry_forward_notes:
- Do not regress the parent fix: completed workflow source sessions must remain valid historical sources.
- If the exact error is only server-side and the desktop already has a summary mode, inspect UI state and option wiring before changing server behavior.

## Truth Ownership Map

Control State:
- server linked workflow creation validates the source session and chosen context strategy
- context preparation owns direct versus summarized inheritance and size limits

Observation State:
- desktop workflow launcher/context dialog displays available context choices
- desktop toast displays server or client error text
- prior parent session state records source-session validation as already fixed but awaiting human verification

Closed Loop:
- user selects Workflows on an existing session -> desktop opens context strategy selector -> user chooses inherit visible context -> desktop sends linked workflow start payload -> server validates source and context strategy -> context preparation either copies visible context directly, summarizes it, or rejects oversized direct inheritance -> desktop opens new workflow session or displays the actionable error.

## Investigation Contract

primary_candidate_id: context-strategy-mismatch
candidate_queue:
- context-strategy-mismatch: desktop/start payload chooses direct visible-context inheritance when the intended recovery is summarized context, or the UI does not expose the summary option in this linked workflow path.
- summary-strategy-unavailable-or-broken: desktop sends summary mode but server still routes through the direct-inherit size guard.
- stale-parent-source-state: the request is still using a completed workflow source edge but failure text changed after source validation; preserve as adjacent risk, not primary.

first_probe: search exact error text and context strategy enum names within cognition minimal live-read scope.

## Log Investigation Plan

existing_log_targets:
- user-reported toast/error message
- focused test output for linked workflow context strategy
- server/client regression output around linked workflow start

candidate_signal_mapping:
- exact error text in server context preparation -> server owns the direct-size guard
- desktop request sends direct mode while summary is expected -> client owns option wiring
- summary-mode test still hits direct guard -> server strategy dispatch bug
- no exact text in repo -> inspect API error mapping and runtime logs before fixing

observability_escalation:
- If code and tests cannot identify the guard, add a narrow diagnostic around linked workflow context strategy and source transcript size before fixing.

## Reproduction Gate

expected_behavior: When the direct visible context is too large, the workflow-start flow should let the user use summarized context and should not dead-end on an error that only says to choose a different unavailable or unwired mode.
actual_behavior: Existing session -> Workflows -> inherit visible context reports that the conversation is too large to inherit directly and asks to use summarize context.
reproduction_steps:
- Open an existing large conversation session.
- Use the current session plus/menu workflow launcher.
- Select a workflow.
- Select inherit visible context.
- Observe the oversized direct-inherit error.
observed_errors:
- "current conversation is too large to inherit directly; use summarize context" (translated from user report)

## Evidence

- user_report: Existing session workflow start with inherit visible context reaches an oversized direct-context error and asks for summarized context.
- project_cognition: readiness review; selected `node.compaction` and `node.agent_tool`; minimal live reads include desktop, compaction, AgentTool, and src.
- learning: prior parent issue fixed server linked workflow source validation for completed workflow sessions; this is a likely downstream context-strategy gap.
- live_search: exact server error is in `src/server/services/workflowSessionLinkService.ts` as `Source context is too large to inherit; choose summarize instead`.
- live_search: desktop maps `WORKFLOW_CONTEXT_TOO_LARGE` to `workflows.linkedStart.error.contextTooLarge`, displayed as "This chat is too large to inherit directly. Choose Summarize context instead."
- live_search: desktop `ChatInput` has `inherit`, `summarize`, and `clear` context strategy buttons, and server tests include oversize inherit plus summarize behavior.
- code_read: `WorkflowSessionLinkService.prepareCarryover` rejects only `inherit` when formatted source context exceeds `inheritMaxCharacters`; `summarize` is a distinct explicit strategy.
- code_read: desktop `ChatInput.handleStartLinkedWorkflow` catches linked workflow start errors, writes only a toast, leaves the context dialog open, and records no in-dialog recovery state.
- code_read: default server API `WorkflowSessionLinkService` has no `summaryContext`, so summary availability remains a separate 503 path; this debug fix should not silently auto-fallback.
- red_test: `cd desktop; bun run test src/components/chat/ChatInput.test.tsx -t "keeps summary recovery visible"` failed because no `role="alert"` existed in the context strategy dialog after `WORKFLOW_CONTEXT_TOO_LARGE`.
- fix: `ChatInput` now records `WORKFLOW_CONTEXT_TOO_LARGE` as a dialog-local recovery state and renders the existing localized context-too-large copy as an accessible alert in the summary context section.
- green_test: `cd desktop; bun run test src/components/chat/ChatInput.test.tsx -t "keeps summary recovery visible"` passed after the fix.
- regression_suite: `cd desktop; bun run test src/components/chat/ChatInput.test.tsx` passed 26 tests.
- verification_failure: `bun run check:desktop` failed in unrelated `src/pages/ActiveSession.test.tsx` test `confirms manual completion and sends optional summary and evidence payload`; failure could not find the `Complete Phase` button.
- unrelated_test_fix: `desktop/src/pages/ActiveSession.test.tsx` now opens workflow details before clicking `Complete Phase`, matching `WorkflowStatusPanel` current placement for manual completion actions.
- green_test: `cd desktop; bun run test src/pages/ActiveSession.test.tsx -t "confirms manual completion"` passed after the test adjustment.
- desktop_gate: `bun run check:desktop` passed after the test adjustment; it ran desktop lint, Vitest, and production build.
- verification_failure: `bun run verify` failed with report `artifacts/quality-runs/2026-06-04T06-08-58-611Z/report.md`; summary passed=4 failed=5 skipped=2.
- verification_analysis: policy, server, coverage, and quarantine lanes all fail because quarantined entries have expired review dates: `server:cron-scheduler`, `server:providers-real`, `server:tasks`, `server:e2e:business-flow`, `server:e2e:full-flow`.
- verification_analysis: native lane failed independently in Tauri `cargo check` build script with Windows `PermissionDenied` from `tauri-build`.
- diff_review: `git diff --check` returned exit code 0; warnings were line-ending normalization notices only.
- project_cognition_closeout: inline update `upd-20260604T061109.533494300Z` returned `result_state: partial_refresh`; recorded but not clean. Minimal live reads returned: `desktop/src/components/chat`, `desktop/src/components/chat/ChatInput.test.tsx`, `desktop/src/components/chat/ChatInput.tsx`, `desktop/src/pages`, `desktop/src/pages/ActiveSession.test.tsx`.

## Eliminated

None yet.

## Hypothesis

Active hypothesis: oversize direct inheritance is an expected server guard, but the desktop only surfaces it as a toast and does not preserve a durable in-dialog recovery state pointing the user at the summary option.
Expected experiment result: a focused ChatInput test fails before the fix because `WORKFLOW_CONTEXT_TOO_LARGE` does not render any context-dialog recovery alert after the failed inherit attempt.

## Senior Consequence Analysis

Affected Object Map:
- source session transcript and visible context payload
- linked workflow start request
- context strategy enum/contract
- server context preparation path
- generated workflow session
- desktop workflow context selector and toast
- conversation compaction/summarization helper

State-Behavior Matrix:
- small existing session + direct inherit: should continue to work without summary overhead
- large existing session + direct inherit: may reject with an actionable route if summary is explicitly available
- large existing session + summarized context: should create a workflow session using summarized context if compaction succeeds
- completed workflow source session: should remain accepted as a historical source per parent fix
- running/pending workflow source session: should remain rejected unless product semantics change
- failed summarization: should report summary failure, not direct-inherit size failure
- missing transcript/source: should fail with source/session-not-found semantics, not context-size semantics

Dependency Impact Table:
- desktop workflow launcher -> sends selected context strategy and observes API result
- desktop API client -> serializes context strategy request
- server sessions workflow API -> validates source and starts linked workflow session
- context/compact services -> prepare summary or direct visible context
- provider/runtime prompt path -> consumes created workflow session context
- tests/quality gate -> must cover changed server or desktop behavior

Recovery And Validation Contract:
- Start with a RED regression around the failing context strategy.
- Keep direct small-context behavior unchanged.
- Keep completed-workflow source-session behavior from the parent session intact.
- Verify summary mode through the narrowest server/client test that owns the broken contract.
- Record changed paths, verification evidence, and cognition closeout if source changes.

Coverage Gaps:
- CG-001: Whether product intent is explicit user selection only or automatic fallback from direct to summary. Owner: debug. Latest safe resolve phase: before fix. Routing: continue with code evidence; ask only if code does not define existing semantics.
- CG-002: Exact owner of summary strategy option in desktop UI versus server API. Owner: debug. Latest safe resolve phase: investigation. Routing: inspect minimal live reads.

Consequence Obligations:
- CA-001: Preserve direct inherit behavior for small sessions. Affected objects: source transcript, linked workflow request, context preparation. Owner workflow: sp-debug. Latest resolve phase: verification. Status: satisfied by unchanged direct-inherit tests in `ChatInput.test.tsx` and desktop gate. Stop-and-reopen condition: direct small-session regression or forced summary for all sessions without product evidence.
- CA-002: Preserve parent completed-source-session acceptance while maintaining active workflow source rejection. Affected objects: source session lifecycle validation. Owner workflow: sp-debug. Latest resolve phase: verification. Status: satisfied by no server production change and existing desktop/source workflow tests in `check:desktop`; parent server validation was not modified. Stop-and-reopen condition: source validation behavior changes without guard tests.
- CA-003: Make summary-context recovery reachable and correctly labeled for oversized conversations. Affected objects: desktop selector, request payload, server context strategy. Owner workflow: sp-debug. Latest resolve phase: fix. Status: awaiting human verification after automated desktop regression passed. Stop-and-reopen condition: user still receives an error telling them to choose a mode that cannot be selected or does not work.

## Verification Plan

- RED: focused regression reproducing oversized direct inherit and expected summarized-context path behavior.
- GREEN: focused same-area tests after fix.
- Guard: rerun parent source-session validation test if server workflow API changes.

## Changed Code Paths

- modified: `desktop/src/components/chat/ChatInput.tsx`
- modified: `desktop/src/components/chat/ChatInput.test.tsx`
- modified: `desktop/src/pages/ActiveSession.test.tsx`
- added: `.planning/debug/workflow-inherit-context-too-large-summary-fallback.md`
- modified: `.planning/debug/workflow-linked-source-completed-session.md`

## Changed Behavior Surfaces

- desktop linked workflow context strategy dialog
- desktop linked workflow start error handling
- desktop workflow details test coverage for manual completion controls
- debug workflow artifacts

## Verification Evidence

- `cd desktop; bun run test src/components/chat/ChatInput.test.tsx -t "keeps summary recovery visible"`: passed 1 focused test after RED failure.
- `cd desktop; bun run test src/components/chat/ChatInput.test.tsx`: passed 26 tests.
- `cd desktop; bun run test src/pages/ActiveSession.test.tsx -t "confirms manual completion"`: passed 1 focused test after unrelated test alignment.
- `bun run check:desktop`: passed desktop lint, Vitest, and production build.
- `bun run verify`: failed; report `artifacts/quality-runs/2026-06-04T06-08-58-611Z/report.md`, passed=4 failed=5 skipped=2. Blockers are expired quarantine review dates and native Windows permission denied, not the changed desktop lane.

## Project Cognition Refresh

- update_id: `upd-20260604T061109.533494300Z`
- result_state: `partial_refresh`
- readiness: `review`
- recommended_next_action: `review_project_cognition_update`
- minimal_live_reads:
  - `desktop/src/components/chat`
  - `desktop/src/components/chat/ChatInput.test.tsx`
  - `desktop/src/components/chat/ChatInput.tsx`
  - `desktop/src/pages`
  - `desktop/src/pages/ActiveSession.test.tsx`
- note: partial cognition closeout is recorded but not clean because the broader project cognition state already has stale paths from other workflow-finalize updates.

## Human Verification

Status: awaiting_human_verify

Packet:
- Open an existing large conversation.
- Use the current session plus/menu workflow launcher.
- Select a workflow.
- Choose `Inherit visible context`.
- Expected: the dialog remains open and shows an inline warning in the `Summarize context` section.
- Then choose `Summarize context`.
- Expected: the flow proceeds to summary-mode start behavior; if the server summary runtime is unavailable, the error should be the summary-unavailable message rather than the direct-inherit-too-large message.
