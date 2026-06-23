# Debug Session: Workflow Completed Session Queued Start Blocked

## Metadata

- status: fixed_restarted_awaiting_human_verify
- created: 2026-06-17T00:00:00+08:00
- updated: 2026-06-17T15:16:00+08:00
- trigger: `$sp-debug` completed Superspec workflow session cannot start a new workflow; context picker clicks appear ineffective and toast says to wait for the current reply or tool run.
- execution_model: leader-inline
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- dispatch_reason: small focused desktop workflow-start gating issue with one visible toast, one context picker, and prior linked-workflow lessons.
- blocked_reason: none

## Intake State

- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- skip_observer_reason: project-cognition schema v1 blocked live bundle; prior workflow-start debug records plus user screenshot provide enough minimum intake.
- legacy_session_needs_reintake: false

## Current Focus

stage: fixed_restarted_awaiting_human_verify_after_stop_model_switch_race_fix
hypothesis: "Confirmed. A stop-generation delayed force-kill could target a newer runtime-switch process, causing the model switch to fail with startup code 143 and leaving the session non-idle. The fix binds force-kill to the original process token; restarted client now reports the affected session idle."

Next action: user retries the affected completed workflow session and the stop-then-switch-model flow in the freshly restarted desktop app.

## Project Cognition Intake

- lexicon/query attempt: blocked by local project-cognition metadata mismatch: `project-cognition.db metadata schema_version has "1", expected "2"`.
- route: continue with live repository evidence and carry cognition gap.
- repository_search_terms:
  - `start workflow`
  - `linked workflow`
  - `请选择工作流链接上下文`
  - `请等待当前回复或工具运行结束后再启动工作流`
  - `contextStrategy`
  - `ChatInput`
  - `isLoading`
  - `queued`
- prior learning:
  - completed workflow sessions may be valid historical linked workflow sources.
  - oversized inherit recovery must remain visible in the dialog.
  - pending/terminal workflow UI can show stale observation state if control-state priority is wrong.

## Scope Boundary

In scope:
- desktop workflow start/context picker guard for completed sessions
- queued/running response observation state used to block workflow starts
- linked workflow start payload and UI click behavior
- same-area regression tests

Out of scope:
- changing active workflow lifecycle semantics
- mutating existing persisted transcripts
- changing server source-session terminal validation unless live evidence proves server ownership
- redesigning the context picker

## Key Constraints

- Do not allow starting a new workflow while a real assistant response or tool run is active.
- Completed workflow sessions should not remain blocked only because stale queued/prompt observation state is present.
- Preserve explicit clean/inherit/summarize context choices.
- Add a regression before production behavior changes.

## Observer Framing

primary_suspected_loop: completed workflow session leaves a queued or active-response observation flag in desktop state; user opens workflow context picker; option click calls the same start guard; guard sees stale `isLoading`/queued/tool state and shows the wait toast instead of starting the workflow.

primary_candidate: desktop-start-guard-stale-running-state

contrarian_candidate: context picker option click is not wired to update selection/submit because the modal is disabled by an overlay or state machine path unrelated to queued prompt state.

recommended_first_probe: search the exact wait-toast text and inspect the owning start guard plus focused ChatInput tests.

related_risk_targets:
- real active assistant response
- real active tool execution
- completed workflow source sessions
- context recovery for oversized inherit
- clean-start independent workflow sessions

## Transition Memo

first_candidate_to_test: desktop-start-guard-stale-running-state
why_first: The screenshot shows the context picker is open and the toast explicitly says workflow start is blocked by current reply/tool state, so the owning branch is likely the desktop start precondition.
evidence_unlock:
- exact toast location identifies the owner
- component test can reproduce completed workflow plus stale queued/running state
- production branch should distinguish real active execution from terminal workflow/session observation
carry_forward_notes:
- Preserve blocking when a response or tool run is truly active.
- Do not regress prior completed-source-session server behavior.

## Truth Ownership Map

Control State:
- desktop start guard decides whether workflow start action may be submitted.
- server linked workflow API decides whether a source session is valid and creates the workflow session.

Observation State:
- chat input loading/queued flags
- workflow completed banner
- context picker selection UI
- toast text

Closed Loop:
- user clicks workflow start from completed session -> desktop opens context strategy selector -> user selects a context mode -> desktop start guard checks active execution state -> desktop calls workflow start API or shows wait toast -> server creates new workflow session -> desktop opens new session.

## Investigation Contract

primary_candidate_id: desktop-start-guard-stale-running-state
candidate_queue:
- desktop-start-guard-stale-running-state: stale loading/queued/tool flag blocks completed-session workflow start.
- modal-selection-submit-wiring: option click does not invoke the intended submit path or leaves selection incomplete.
- server-rejects-source: API call happens but server rejects completed workflow source again; less likely because screenshot toast is client-side wait guidance.

first_probe: search exact wait-toast text and inspect the ChatInput workflow start guard and tests.

## Log Investigation Plan

existing_log_targets:
- user screenshot toast and modal text
- focused component/server test output
- existing desktop tests around `ChatInput`

candidate_signal_mapping:
- exact wait text in desktop component -> confirms client-side guard owner
- no API call in test when stale loading flag true -> confirms client-side precondition blocks start
- API test failure with server error -> shifts ownership to server source validation

observability_escalation:
- If exact text is not in source, inspect localization keys and browser console mapping before fixing.

## Senior Consequence Analysis

Affected Object Map:
- completed workflow session record
- chat response/tool execution observation state
- workflow context picker
- linked workflow start request
- generated workflow session
- toast/error surface

State-Behavior Matrix:
- running assistant reply: workflow start should remain blocked.
- running tool call: workflow start should remain blocked.
- queued user prompt that is genuinely awaiting execution: workflow start should remain blocked until execution is settled.
- completed workflow with no active runtime work: workflow start should be allowed.
- completed workflow with stale queued/running observation: workflow start should ignore or clear stale observation only when live execution is absent.
- clean start: should not require current transcript context.
- inherit/summarize: should preserve explicit selected mode semantics.

Dependency Impact Table:
- `ChatInput` action guard -> protects concurrent sends and workflow starts.
- desktop session store/API -> supplies loading and workflow metadata.
- server linked workflow service -> owns source validation and creation.
- tests -> must prove both unblocked completed flow and blocked active-flow guard.

Recovery And Validation Contract:
- Write a RED same-area desktop regression.
- Keep active-response/tool blocking covered.
- Apply the smallest control-state fix.
- Run focused desktop tests, then desktop gate if practical.
- Record project cognition closeout or dirty blocker after mutations.

Coverage Gaps:
- CG-001: Exact state flag that is stale in the screenshot is not known until code inspection. Owner: debug. Latest resolve phase: investigation. Routing: continue with live source evidence.
- CG-002: Whether server receives a request during the reported click is unknown. Owner: debug. Latest resolve phase: investigation. Routing: client exact-toast probe first.

Consequence Obligations:
- CA-001: Preserve real active execution blocking. Affected objects: assistant run, tool run, workflow start request. Owner workflow: sp-debug. Latest resolve phase: verification. Status: open. Stop-and-reopen condition: tests show workflow start can proceed while an active response/tool run is in progress.
- CA-002: Completed workflow sessions must be usable as historical sources for new workflows when no live work is running. Affected objects: completed source session, linked workflow API request, desktop context picker. Owner workflow: sp-debug. Latest resolve phase: verification. Status: open. Stop-and-reopen condition: completed session still shows wait toast without active work.

## Evidence

- user_report: Completed Superspec workflow shows `Completed All 5 phases completed`; starting another workflow opens context picker but interactions lead to toast `请等待当前回复或工具运行结束后再启动工作流`.
- user_reopen: User reports the toast still appears. The same affected session also hit `Failed to switch provider/model: CLI exited during startup with code 143` after the user clicked Stop while talking with `gpt-5.5` and immediately switched to `deepseek-v4-flash`; the model did not appear to switch.
- cognition: project cognition query unavailable because local DB schema is v1, expected v2.
- prior_learning: completed workflow source sessions and linked context handling already had cross-layer state-contract gaps.
- live_code: `ChatInput` derives workflow-start blocking from `isActive = chatState !== 'idle'`; queued prompt guide also only submits when chat state is idle.
- live_code: `chatStore.handleServerMessage` updates desktop workflow metadata on `system_notification.workflow_state`; terminal workflow summaries previously settled stale chat state by auto-draining queued prompts, which could immediately re-enter `thinking` and keep workflow start blocked.
- live_code: `ChatInput` disabled the Workflows plus-menu item whenever `isActive` was true, so an already-stale completed source session could not even run a reconciliation path.
- RED: `cd desktop; bun run test src/stores/chatStore.test.ts -t "settles busy chat state"` failed before the second fix because terminal workflow_state still auto-submitted the queued prompt and left chat state `thinking`.
- RED: `cd desktop; bun run test src/components/chat/ChatInput.test.tsx -t "reconciles stale active state"` failed because the Workflows button was disabled with the source-active wait title.
- fix: `chatStore.settleSessionIdle` clears local thinking/tool/streaming/permission observation fields and tab status without modifying or submitting queued prompts.
- fix: terminal workflow summaries (`completed`, `failed`, `cancelled`) now settle stale chat state only when no active tool, permission, streaming input/text, or pending delta exists; queued prompts remain visible for explicit guide/delete/action.
- fix: `ChatInput` allows a workflow-start attempt from terminal workflow sessions even if local chat state is stale, calls `/api/sessions/:id/chat/status`, and clears local stale busy state only when the server reports `idle`.
- guard: terminal workflow_state still does not interrupt an active tool run.
- GREEN: `cd desktop; bun run test src/stores/chatStore.test.ts -t "settles busy chat state"` passed.
- GREEN: `cd desktop; bun run test src/components/chat/ChatInput.test.tsx -t "reconciles stale active state"` passed.
- GREEN: `cd desktop; bun run test src/stores/chatStore.test.ts` passed 77 tests.
- GREEN: `cd desktop; bun run test src/components/chat/ChatInput.test.tsx` passed 30 tests.
- GREEN: `cd desktop; bun run test src/api/sessions.test.ts` passed 21 tests.
- GREEN: `bun run check:desktop` passed desktop lint, 98 test files / 887 tests, and production build. Existing React `act(...)` warnings and a Tauri notification permission warning were non-failing.
- GREEN with policy caveat: `$env:CARGO_TARGET_DIR='F:\github\cc-jiangxia\.tmp\cargo-target-verify-20260617'; bun run verify` completed all executed lanes with passed=9 failed=0 skipped=2. Report `artifacts/quality-runs/2026-06-17T06-36-45-037Z/report.md`. PR readiness remains policy-blocked because the broader dirty worktree has 725 changed files and CLI-core changes require maintainer override.
- human_verify_failed: User retried and still sees `请等待当前回复或工具运行结束后再启动工作流。`
- live_reopen_probe: after restarting the rebuilt desktop app, `GET /api/sessions/b33564bf-4f54-4826-806b-c44ca6439eda/chat/status` returned `{"state":"idle"}` while `POST /api/sessions/b33564bf-4f54-4826-806b-c44ca6439eda/workflow/start` returned `409 WORKFLOW_SOURCE_ACTIVE`.
- live_code: `src/server/api/sessions.ts` wired linked-workflow `isSourceActive` to `conversationService.hasSession(sessionId)`, but desktop reconnect sends `prewarm_session`, which starts a CLI process without an active user turn.
- live_code: `/api/sessions/:id/chat/status` used a separate `sessionStates` map, and `src/server/ws/handler.ts` did not synchronize WebSocket `status` / `message_complete` events into that map.
- fix2: `src/server/ws/handler.ts` now synchronizes outgoing WebSocket `status` messages, permission requests, and `message_complete` into the shared chat status map.
- fix2: `src/server/api/sessions.ts` now rejects linked workflow starts only when `getSessionChatState(sourceSessionId) !== 'idle'`, so a prewarmed idle source is allowed while real active turns remain blocked.
- RED/GREEN: `bun test src/server/__tests__/sessions.test.ts -t "idle prewarmed"` covers the completed/prewarmed idle-source path that used to 409.
- GREEN: `bun test src/server/__tests__/sessions.test.ts -t "Linked workflow session start contract"` passed 13 linked-workflow tests.
- GREEN: `bun test src/server/__tests__/conversations.test.ts -t "synchronize WebSocket turn status"` passed and proves WS thinking/complete updates `/chat/status`.
- GREEN: `bun run check:server` passed 1180 tests, 7 skipped, 0 failed.
- GREEN: `cd desktop; bun run build` succeeded before restarting the Tauri app.
- live_restart: stopped exact repo-owned Tauri/dev PIDs, rebuilt desktop, and restarted `bun run tauri dev` with wrapper PID `113504`; sidecar server is listening at `http://127.0.0.1:52378`.
- live_postfix_probe: with the restarted app, `GET /api/sessions/b33564bf-4f54-4826-806b-c44ca6439eda/chat/status` returned `{"state":"idle"}`; a missing-template `POST /workflow/start` returned `400 WORKFLOW_TEMPLATE_NOT_FOUND` instead of `409 WORKFLOW_SOURCE_ACTIVE`, proving the active guard no longer blocks clean start.
- live_reopen_process_probe: Process list shows the current dev app still has a `claude-sidecar.exe cli` for session `b5912322-035b-47e7-b937-d49b4e42ca8f` running with `--model gpt-5.5` after the user's stop-then-switch report. This may be a true active turn or stale stop cleanup state; query the server status and logs before restart.
- live_reopen_status_probe: `GET /api/sessions/b5912322-035b-47e7-b937-d49b4e42ca8f/chat/status` on sidecar port `52378` returned `{"state":"thinking"}`, so the workflow-start wait toast is currently protecting a non-idle session according to the server.
- live_log: Tauri log shows the stop/model-switch race in order: `Stop generation requested`, runtime override starts a new CLI for the same session, the old SDK disconnects with code 143, the new SDK connects, then the delayed stop path logs `Force-killing CLI subprocess` and kills the current/new CLI. The runtime override restart then reports `CLI exited during startup with code 143`. This confirms the code 143 model-switch failure can be caused by the stop timeout killing a newer process generation.
- RED: `bun test src/server/__tests__/websocket-handler.test.ts -t "delayed stop force-kill"` failed because the delayed stop timer called `stopSession` a second time after runtime override restart had already started a new CLI.
- fix3: `ConversationService` now exposes a current process token and `stopSessionIfCurrent`; `handleStopGeneration` captures the token before sending interrupt and the 3-second force-kill only stops the session if the same process is still current.
- GREEN: `bun test src/server/__tests__/websocket-handler.test.ts -t "delayed stop force-kill"` passed.
- GREEN: `bun test src/server/__tests__/websocket-handler.test.ts -t "runtime"` passed 27 runtime/workflow-adjacent tests.
- GREEN: `bun test src/server/__tests__/conversations.test.ts -t "synchronize WebSocket turn status"` passed.
- GREEN: `bun run check:server` passed 1181 tests, 7 skipped, 0 failed.
- GREEN: `cd desktop; bun run build` succeeded before restart.
- live_restart2: stopped exact old repo-owned dev-client PIDs `113504, 44436, 99756, 40872, 81728, 28616, 78968, 82580`; restarted `bun run tauri dev` with wrapper PID `40844`, isolated target `.tmp/cargo-target-tauri-dev-20260617-stop-race`, and log `.tmp/tauri-dev-20260617-stop-race.log`.
- live_postfix_probe2: new sidecar API is listening at `http://127.0.0.1:59374`; `GET /api/sessions/b5912322-035b-47e7-b937-d49b4e42ca8f/chat/status` returned `{"state":"idle"}`. A malformed linked-workflow probe returned `400 WORKFLOW_TEMPLATE_INVALID`, not `WORKFLOW_SOURCE_ACTIVE`, so active-source blocking is no longer the server response for this idle prewarmed session.
- live_user_retry_signal: Later process/log probe shows session `b5912322-035b-47e7-b937-d49b4e42ca8f` running `--model deepseek-v4-flash` and `/chat/status` returning `{"state":"thinking"}`. Log tail shows old process exits with code 143 during restart, then new SDK connects and `Restarted CLI ... with runtime override`; there is no new `Failed to restart CLI ... after runtime override` and no stale `Force-killing CLI subprocess` after the new process starts.

## Eliminated

None yet.

## Hypothesis

Confirmed hypothesis: the bug has three layers. The desktop workflow-start guard could be stuck on stale busy observation state, the server linked-workflow guard treated idle prewarmed SDK/CLI processes as active, and a stop-generation timeout can kill a newly restarted runtime-switch CLI because stop ownership is not bound to the process generation it originally targeted.

Expected experiment result: a focused `ChatInput` regression can reproduce a completed workflow source with stale active state where the Workflows button must remain clickable and reconcile via server chat status before start.

## Root Cause

`ChatInput` correctly blocks workflow starts whenever `chatState !== 'idle'`, but it had no recovery path for a source session whose workflow was terminal while local chat observation state was stale. After that was fixed, the server still treated any live `conversationService` session as an active source. Desktop reconnect prewarms completed sessions, so an idle prewarmed source kept returning `WORKFLOW_SOURCE_ACTIVE` even though `/chat/status` was idle.

## Loop Restoration Proof

terminal workflow_state arrives -> desktop session summary shows completed -> chat store checks that no tool, permission, streaming text/input, or pending delta is active -> stale busy chat state is cleared to idle without submitting queued prompts -> queued prompt guide can be used explicitly, and workflow start remains enabled.

completed workflow start click with stale busy state -> Workflows button remains clickable for terminal workflows -> ChatInput asks server `/api/sessions/:id/chat/status` -> server `idle` response authorizes local stale-state cleanup -> context picker/start path continues -> linked workflow API checks the same chat-state source instead of process existence -> idle prewarmed sources can start clean/inherit/summarize workflows. If a real user turn/tool/permission is active, WebSocket state synchronization makes `/chat/status` non-idle and the linked workflow API still returns `WORKFLOW_SOURCE_ACTIVE`.

stop then immediate model switch -> stop captures the current CLI process token before sending interrupt -> runtime override may stop the old process and start a new provider/model process -> delayed stop force-kill compares the captured token with the current process -> if the current process is newer, it skips the kill -> model-switch startup is not failed by the stale stop timer.

## Verification Plan

- RED: focused `chatStore` test for terminal workflow_state not auto-submitting queued prompts.
- RED: focused `ChatInput` test for completed workflow session with stale active state.
- GREEN: focused `chatStore` and `ChatInput` tests after reconciliation fix.
- Guard: existing active-source workflow-start test and active tool terminal-state test still pass.
- RED/GREEN: add server API coverage for idle prewarmed source sessions and WebSocket-to-chat-status synchronization.

## Changed Code Paths

- modified: `desktop/src/stores/chatStore.ts`
- modified: `desktop/src/stores/chatStore.test.ts`
- modified: `desktop/src/api/sessions.ts`
- modified: `desktop/src/components/chat/ChatInput.tsx`
- modified: `desktop/src/components/chat/ChatInput.test.tsx`
- modified: `src/server/api/conversations.ts`
- modified: `src/server/api/sessions.ts`
- modified: `src/server/services/conversationService.ts`
- modified: `src/server/ws/handler.ts`
- modified: `src/server/__tests__/sessions.test.ts`
- modified: `src/server/__tests__/conversations.test.ts`
- modified: `src/server/__tests__/websocket-handler.test.ts`
- modified: `.specify/memory/learnings/INDEX.md`
- modified: `.specify/memory/learnings/learn-2026-06-15-runtime-switch-rollback-and-locked-native-target-a91d4b2c7.md`
- added: `.planning/debug/workflow-completed-session-queued-start-blocked.md`
- added: `.specify/project-cognition/updates/20260617-stop-generation-runtime-switch-race.json`

## Changed Behavior Surfaces

- desktop chat store websocket workflow_state handling
- desktop queued prompt guide behavior after terminal workflow state
- desktop workflow-start busy guard for completed/failed/cancelled workflow source sessions
- desktop session API client status lookup
- server linked workflow source-active guard
- server WebSocket chat-state synchronization

## Verification Evidence

- `cd desktop; bun run test src/stores/chatStore.test.ts -t "settles busy chat state"`: RED before second production fix, then passed after terminal workflow settlement stopped auto-submitting queued prompts.
- `cd desktop; bun run test src/components/chat/ChatInput.test.tsx -t "reconciles stale active state"`: RED before ChatInput reconciliation, then passed.
- `cd desktop; bun run test src/stores/chatStore.test.ts`: passed 77 tests.
- `cd desktop; bun run test src/components/chat/ChatInput.test.tsx`: passed 30 tests.
- `cd desktop; bun run test src/api/sessions.test.ts`: passed 21 tests.
- `bun run check:desktop`: passed desktop lint, 98 test files / 887 tests, and production build.
- `$env:CARGO_TARGET_DIR='F:\github\cc-jiangxia\.tmp\cargo-target-verify-20260617'; bun run verify`: passed all executed lanes (passed=9 failed=0 skipped=2) but report remains `PR READINESS: NOT READY` because impact policy sees 725 changed files and CLI core changes in the pre-existing dirty worktree without maintainer override. Report `artifacts/quality-runs/2026-06-17T06-36-45-037Z/report.md`; coverage `artifacts/coverage/2026-06-17T06-40-34-003Z/coverage-report.md`.
- `bun test src/server/__tests__/sessions.test.ts -t "idle prewarmed"`: passed.
- `bun test src/server/__tests__/sessions.test.ts -t "Linked workflow session start contract"`: passed 13 tests.
- `bun test src/server/__tests__/conversations.test.ts -t "synchronize WebSocket turn status"`: passed.
- `bun run check:server`: passed 1180 tests, 7 skipped, 0 failed.
- `cd desktop; bun run build`: passed.
- Restarted Tauri dev app: wrapper PID `113504`; sidecar API `http://127.0.0.1:52378`; app session `b33564bf-4f54-4826-806b-c44ca6439eda` reconnected and prewarmed.
- Post-restart live probe: `/chat/status` returned idle and `/workflow/start` with a deliberately missing template returned `WORKFLOW_TEMPLATE_NOT_FOUND`, not `WORKFLOW_SOURCE_ACTIVE`.
- RED/GREEN: `bun test src/server/__tests__/websocket-handler.test.ts -t "delayed stop force-kill"` failed before the process-token fix and passed after it.
- GREEN: `bun test src/server/__tests__/websocket-handler.test.ts -t "runtime"` passed 27 tests.
- GREEN: `bun test src/server/__tests__/conversations.test.ts -t "synchronize WebSocket turn status"` passed.
- GREEN: `bun run check:server` passed 1181 tests, 7 skipped.
- GREEN: `cd desktop; bun run build` passed before restart.
- Restarted Tauri dev app after stop/model-switch race fix: wrapper PID `40844`; sidecar API `http://127.0.0.1:59374`; target `.tmp/cargo-target-tauri-dev-20260617-stop-race`.
- Post-restart live probe: session `b5912322-035b-47e7-b937-d49b4e42ca8f` `/chat/status` returned idle; malformed linked-workflow start returned `WORKFLOW_TEMPLATE_INVALID`, not `WORKFLOW_SOURCE_ACTIVE`.
- Live retry signal: the same session later ran under `deepseek-v4-flash`; `/chat/status` was `thinking`, which is a correct workflow-start block while that real turn is active.
- GREEN hygiene: project-cognition payload parsed as valid JSON.
- GREEN hygiene: `git diff --check -- <touched files>` exited 0 with CRLF conversion warnings only.

## Project Cognition Refresh

- payload file: `.specify/project-cognition/updates/20260617-workflow-terminal-chat-state.json`
- update attempt: `project-cognition update --payload-file ".specify/project-cognition/updates/20260617-workflow-terminal-chat-state.json" --reason workflow-finalize --format json`
- update result: blocked earlier by local cognition DB schema mismatch (`schema_version has "1", expected "2"`); latest shell also does not have `project-cognition` on PATH even though `.specify/config.json` points to `C:\Users\11034\.specify\bin\project-cognition.exe`.
- dirty marker attempt: `project-cognition mark-dirty --reason "sp-debug workflow terminal chat state closeout update blocked by local schema v1" --format json`
- dirty marker result: blocked by the same schema mismatch.
- latest payload file: `.specify/project-cognition/updates/20260617-stop-generation-runtime-switch-race.json`
- latest update attempt: `C:\Users\11034\.specify\bin\project-cognition.exe update --payload-file ".specify/project-cognition/updates/20260617-stop-generation-runtime-switch-race.json" --reason workflow-finalize --format json`
- latest update result: blocked by local cognition DB schema mismatch (`project-cognition.db metadata schema_version has "1", expected "2"`).
- latest dirty marker attempt: `C:\Users\11034\.specify\bin\project-cognition.exe mark-dirty --reason "sp-debug stop-generation runtime-switch race closeout update blocked by local schema v1" --format json`
- latest dirty marker result: blocked by the same schema mismatch.
- follow-up: run sp-map-scan -> sp-map-build or otherwise migrate/rebuild project cognition schema v2 before relying on cognition closeout.

## Human Verification

Status: pending retry after third fix

Packet:
- Refresh/reload the desktop app or the affected completed workflow session.
- In the completed Superspec workflow session, use the plus menu -> Workflows.
- Pick a workflow and choose `干净启动` or another context strategy.
- Expected: no `请等待当前回复或工具运行结束后再启动工作流` toast when no assistant/tool work is actually running; queued prompt remains visible and can be guided explicitly, but does not auto-run just because the workflow completed.
- Stop-and-reopen condition: if the toast still appears after refresh while no tool/reply is running, capture whether the message list still shows queued items or active tool UI.

Second reopen packet:
- Use the freshly restarted desktop app backed by sidecar `http://127.0.0.1:59374`.
- Retry the stop-then-switch flow: while a reply is running, click Stop, then switch provider/model.
- Expected: no false `CLI exited during startup with code 143` caused by an old stop timer killing the new runtime-switch process.
- Also retry starting a workflow from the completed Superspec session while `/chat/status` is idle.
- If the session is currently `thinking` on `deepseek-v4-flash`, the workflow-start wait toast is expected until that real turn finishes or is stopped.
