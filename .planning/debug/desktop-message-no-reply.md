# Debug Session: Desktop Message No Reply

status: awaiting_human_verify
stage: Stage 4: Verification Checkpoint
created: 2026-05-17
updated: 2026-05-17
slug: desktop-message-no-reply
user_report: "桌面端现在发消息不回复；本地 Claude Code 正常。"

## Gate State

- cognition_gate: passed
- cognition_readiness: ready
- selected_capability: n-cap-desktop / Desktop App (Tauri 2 + React)
- related_capabilities: n-src-server, n-src-server-api, n-src-server-services, n-src-server-ws, n-src-query-engine, n-src-services, n-risk-oauth, n-cap-agent, n-cap-tui
- minimal_live_reads:
  - desktop/src/
  - desktop/src/api/
  - desktop/src/pages/
  - desktop/src/stores/
  - src/query.ts
  - src/server/
  - src/server/api/
  - src/server/services/
  - src/server/ws/
  - src/services/
- missing_coverage: []
- competing_truths:
  - desktop UI/store observation state may show sent message while server/session control state never starts or completes agent execution.
  - server/WebSocket may execute but fail to publish reply events back to desktop.
  - provider/model/auth/env selection may differ between desktop server path and local Claude Code CLI.
- unresolved_coverage_gaps: []

## Required Intake Flags

- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- legacy_session_needs_reintake: false

## Current Focus

Static WebSocket path is healthy under mock CLI. Live desktop diagnostics show the real child process reaches the Claude SDK and receives a terminal authentication error from stale provider routing env that official mode failed to suppress.

## Project Memory Inputs

- constitution: specification-first, test-backed changes, diagnostics before guessing, evidence before completion.
- project_rules: no additional promoted rules.
- relevant_learning: runtime env overlay model/provider selection pitfall; model selectors can bypass runtime overlay by reading process.env directly.

## Causal Map

symptom_anchor: Desktop app accepts/sends a user message, but no assistant reply becomes visible; local Claude Code CLI works normally.

closed_loop_path:
- Desktop input event captures user message.
- Desktop UI/store records or displays sent message as observation state.
- desktop/src/api submits message/session request to local server.
- src/server/api accepts request and maps it to session/control state.
- src/server/services or src/query.ts starts agent/message-loop execution.
- Provider/model/auth/runtime configuration is resolved for the desktop server path.
- Assistant response is produced or failure is surfaced.
- src/server/ws publishes reply/error/status events.
- Desktop WebSocket/API subscription receives event.
- desktop/src/stores transitions assistant message into observable UI state.
- desktop/src/pages renders assistant reply.

break_edges:
- Observation-only send: desktop store shows the user message, but server control state never starts execution.
- Control execution break: server session starts, but query/message loop stalls, fails, or waits without producing a terminal reply/error.
- Runtime selection break: desktop server path uses different provider/model/auth/env than working local Claude Code CLI.
- Publication break: assistant response exists in server/control state, but no reply event is emitted over WebSocket.
- Observation break: reply event is emitted, but desktop subscription/store/page fails to record or render it.

bypass_paths:
- Local Claude Code CLI may bypass the desktop local server, desktop API client, desktop WebSocket, and desktop stores.
- CLI may use a different provider/model/auth/env resolution path than the desktop server process.
- Desktop UI may optimistically render sent messages independent of server-side session state.
- Server may log or store a response without publishing the event shape the desktop observes.

family_coverage:
- family: Desktop request/session handoff
  owning_layer: Desktop App, desktop/src/api, desktop/src/stores, src/server/api
  plausible_break: UI records outbound message, but request is not sent, is sent to the wrong endpoint/session, or is accepted without runnable server control state.
  falsifier: Server-side request/session evidence shows a valid message request was received, bound to the intended session, and transitioned into execution.
- family: Agent execution/control loop
  owning_layer: src/server/services, src/query.ts QueryEngine/message loop, src/services
  plausible_break: Server accepts the message but never starts, advances, or completes the assistant execution loop.
  falsifier: Execution evidence shows the desktop message entered the query/message loop and produced either an assistant result or a concrete terminal error.
- family: Provider/model/auth/runtime divergence
  owning_layer: Provider/runtime, OAuth/auth risk, src/services, src/server/services
  plausible_break: Desktop server path resolves provider, model, OAuth token, environment overlay, or runtime settings differently from the working local Claude Code CLI.
  falsifier: Desktop server execution uses the same effective provider/model/auth/env as the working CLI, and provider calls succeed or return a valid response.
- family: Server-to-desktop event publication
  owning_layer: src/server/ws, desktop/src/api, desktop/src/stores
  plausible_break: Assistant result or error exists server-side but is not emitted, is emitted on the wrong channel/session, or has an event shape the desktop does not consume.
  falsifier: A correctly shaped assistant reply/error event for the active desktop session is observed leaving the server and entering the desktop store.
- family: Desktop observation/rendering
  owning_layer: desktop/src/stores, desktop/src/pages, desktop tests
  plausible_break: Desktop receives a reply event, but store state, filtering, ordering, active-session selection, or page rendering prevents it from appearing.
  falsifier: The received assistant event is present in desktop observable state for the active conversation and is rendered in the page.

candidates:
- id: C1
  family: Desktop request/session handoff
  summary: Optimistic desktop observation state shows the sent message, while server/session control state never starts execution.
  owning_layer: desktop/src/api, desktop/src/stores, src/server/api
  decisive_evidence_needed: Correlated desktop send action to server request receipt, session binding, and execution-start transition.
  falsifier: Server evidence shows the desktop message request is received for the correct session and execution starts.
- id: C2
  family: Server-to-desktop event publication
  summary: Server executes or completes, but assistant reply/error events are not published or not delivered to the desktop.
  owning_layer: src/server/ws, desktop/src/api, desktop/src/stores
  decisive_evidence_needed: End-to-end event trace from server result creation through WebSocket publish to desktop store receipt.
  falsifier: Correct assistant reply event reaches the active desktop store and is available to render.
- id: C3
  family: Provider/model/auth/runtime divergence
  summary: Desktop server path uses a different effective provider/model/auth/env configuration than the working local Claude Code CLI.
  owning_layer: src/server/services, src/services, OAuth/auth risk, provider/runtime
  decisive_evidence_needed: Effective provider/model/auth/env comparison between desktop server execution and known-working CLI path.
  falsifier: Desktop server uses the same effective runtime selection and successfully receives provider output.
- id: C4
  family: Agent execution/control loop
  summary: The message enters server control state, but the query/message loop stalls, waits, or fails before producing an assistant result.
  owning_layer: src/query.ts QueryEngine/message loop, src/server/services
  decisive_evidence_needed: Execution lifecycle evidence showing started, progressed, completed, failed, or remained pending.
  falsifier: The loop produces a terminal assistant result or explicit error for the desktop message.
- id: C5
  family: Desktop observation/rendering
  summary: Reply event reaches desktop, but active conversation filtering, store transition, or page rendering hides it.
  owning_layer: desktop/src/stores, desktop/src/pages
  decisive_evidence_needed: Desktop state snapshot showing whether the assistant event is stored under the active session and renderable.
  falsifier: The active page renders the assistant event after receipt.

adjacent_risk_targets:
- OAuth/auth token freshness and token source used by desktop server.
- Runtime env overlay and direct process.env reads bypassing configured model/provider selectors.
- Session identity mismatch between desktop store, server API, and WebSocket channel.
- WebSocket reconnect/subscription timing after send.
- Silent error handling where provider/server errors are not surfaced as assistant-visible or UI-visible errors.
- Multi-Agent orchestration routing selecting a non-replying or waiting control path.
- Terminal UI path differing from desktop app path despite shared backend concepts.

dimension_scan:
- input_event: Desktop send action may be captured and rendered optimistically without proving backend execution.
- control_decision: Server must decide or route the message into a valid session, provider, model, and agent/message loop.
- resource_allocation: Desktop server path may lack provider credentials, OAuth state, model selector, environment overlay, or WebSocket subscription resources available to CLI.
- state_transition: Expected transition is sent/queued -> executing -> assistant reply or explicit error; a stuck queued/executing state distinguishes control failure from render failure.
- external_observation: Visible desktop message list is observation state; it must be correlated with server control state and WebSocket events before inferring the break.

candidate_board:
- priority: 1
  candidate_id: C1
  why: It explains the split where the desktop appears to send but no backend-controlled assistant reply is possible.
  first_probe: Correlate one desktop send with server receipt, session id, and execution-start evidence.
- priority: 2
  candidate_id: C2
  why: It preserves the possibility that execution succeeds but the desktop-specific observation channel is broken.
  first_probe: Trace a completed server result or error through WebSocket publication and desktop store receipt.
- priority: 3
  candidate_id: C3
  why: Project memory flags runtime overlay/model selector pitfalls, and the working CLI does not prove the desktop server uses the same effective runtime.
  first_probe: Compare effective provider/model/auth/env for desktop server path against the working CLI path.
- alternative: C4
  reason_to_keep: A server-side control loop stall can produce no reply even when desktop handoff and provider configuration are nominal.
  falsifier: Lifecycle evidence shows the query/message loop completes with an assistant result or explicit error.
- alternative: C5
  reason_to_keep: A UI/store/rendering mismatch can hide a valid assistant event while server behavior is healthy.
  falsifier: The active desktop page renders the assistant event once received in store state.
- alternative: C6
  reason_to_keep: Multi-Agent orchestration may route the desktop message into a waiting, delegated, or non-user-visible path.
  falsifier: Routing evidence shows the desktop message uses the normal single reply-producing path or produces a user-visible terminal event.

## Observer Framing

scope_boundary: Investigate why the Desktop App sends a user message but receives no visible assistant reply, using Stage 1A candidates only.

key_constraints:
- Preserve Stage 1A candidate-board ordering.
- Begin with existing evidence/log inspection once investigation starts.
- Do not assume the desktop sent-message UI state means server execution started.
- Do not collapse provider/model/auth/runtime divergence into a generic log probe.
- Compare desktop server path against the user's working local Claude Code CLI only through explicit effective runtime selection evidence.

affected_surface_area:
- Desktop App
- desktop/src/api
- desktop/src/pages
- desktop/src/stores
- desktop tests
- src/server
- src/server/api
- src/server/services
- src/server/ws
- src/query.ts QueryEngine/message loop
- src/services
- OAuth/auth risk
- Multi-Agent Orchestration
- Terminal UI

known_unknowns:
- Whether the server receives the desktop message with the expected session id and payload.
- Whether server-side execution starts after receipt.
- Whether the query/message loop produces an assistant result or explicit error.
- Whether a completed result/error is published over WebSocket.
- Whether the desktop store receives the reply/error event.
- Whether active conversation filtering or rendering hides an otherwise received event.
- Whether desktop server path uses a different provider/model/auth/env from the working Claude Code CLI.
- Whether multi-agent routing sends the message into a waiting, delegated, or non-visible path.

primary_suspected_loop: Desktop optimistic observation state records the sent message, but server/session control state either never receives the actionable request or never starts assistant execution for that session.

recommended_first_probe: Correlate one desktop send end-to-end through existing logs: desktop send/API request, server receipt, normalized session id, execution-start evidence, and first query/message-loop transition.

primary_candidate: C1 Desktop request/session handoff

contrarian_candidate: C2 Server-to-desktop event publication

## Transition Memo

first_candidate_to_test: C1 Desktop request/session handoff

why_first: It is the earliest boundary after the visible symptom. If C1 is true, downstream publication, provider, query-loop, rendering, and multi-agent explanations may be secondary or irrelevant.

evidence_unlock:
- A single correlated message id or timestamp across desktop send and server receipt.
- The session id used by desktop and server for the same send.
- Server evidence that execution did or did not start.
- Any immediate server-side validation, routing, or session-state rejection.

carry_forward_notes:
- If C1 is falsified, move immediately to C2 before provider/runtime analysis.
- If execution starts but no terminal result/error appears, C4 becomes more likely.
- If execution completes and publishes, C5 becomes more likely.
- If provider/runtime evidence diverges from CLI, C3 remains a high-risk parallel branch.
- Preserve C6 for routing anomalies, especially if the event path is valid but user-visible reply semantics differ.

## Investigation Contract

primary_candidate_id: C1

candidate_queue:
- id: C1
  status: pending
  probe_intent: Determine whether a desktop-sent message crosses from optimistic UI/store state into server/session control state and starts execution.
  required_evidence:
  - Desktop send event or API request timestamp.
  - Request payload shape including conversation/session id.
  - Server API receipt for the same message.
  - Server-side normalized session id.
  - Execution-start marker for that session/message.
  falsifier: Server receives the correct session message and execution starts.
- id: C2
  status: pending
  probe_intent: Determine whether server execution completes but assistant reply/error events are not published to or delivered by the desktop WebSocket path.
  required_evidence:
  - Server terminal assistant result or explicit error for the message.
  - WebSocket publication attempt with event type and session id.
  - Desktop WebSocket receipt for the same event.
  - Desktop store mutation after receipt.
  falsifier: Correct assistant reply/error event reaches the active desktop store.
- id: C3
  status: pending
  probe_intent: Compare effective provider/model/auth/env selection for desktop server path against the working local Claude Code CLI path.
  required_evidence:
  - Effective provider selected by desktop server path.
  - Effective model selected by desktop server path.
  - Auth source used by desktop server path.
  - Relevant runtime/env overlay values applied to desktop server path.
  - Equivalent provider/model/auth/env evidence from the working CLI path.
  - Provider output or explicit provider error from desktop path.
  falsifier: Desktop path uses the same effective runtime selection as the CLI and provider output succeeds.
- id: C4
  status: pending
  probe_intent: Determine whether the message enters server control but the query/message loop stalls, drops, or fails without a user-visible terminal event.
  required_evidence:
  - Server control-loop entry for the message.
  - QueryEngine/message-loop transition markers.
  - Tool/provider invocation start and completion/error.
  - Terminal assistant result or explicit error emission.
  falsifier: Loop produces a terminal assistant result or explicit error.
- id: C5
  status: pending
  probe_intent: Determine whether the reply/error reaches desktop state but active conversation filtering, store selection, or rendering hides it.
  required_evidence:
  - Desktop receipt of assistant reply/error event.
  - Store state mutation containing the assistant event.
  - Active conversation/session id at render time.
  - Rendered message list decision for the active page.
  falsifier: Active page renders the received assistant event.
- id: C6
  status: pending
  probe_intent: Determine whether multi-agent orchestration routes the message into a waiting, delegated, or non-visible path instead of a normal reply-producing path.
  required_evidence:
  - Routing decision for the desktop message.
  - Agent/team/session orchestration state after send.
  - Delegation or waiting-state markers.
  - User-visible terminal event or absence thereof.
  falsifier: Routing evidence shows a normal reply-producing path or a user-visible terminal event.

related_risk_targets:
- Runtime env overlay model/provider selection pitfall.
- Provider selectors reading process.env directly and bypassing runtime overlay.
- OAuth/auth divergence between desktop server path and local CLI path.
- Session id mismatch between desktop store, server API, WebSocket subscription, and query loop.
- WebSocket subscription scoped to a stale or different session.
- Optimistic desktop state masking server-side rejection or no-op.
- Multi-agent orchestration creating non-visible waiting/delegated states.

execution_model: subagent-mandatory
dispatch_shape: parallel-subagents
execution_surface: native-subagents

success_criteria:
- One desktop send is correlated across all available existing evidence before code inspection.
- C1 is either confirmed or falsified with session id and execution-start evidence.
- If C1 is falsified, C2 is tested with publication and desktop receipt evidence.
- C3 explicitly compares effective provider/model/auth/env between desktop path and working CLI path.
- Every remaining candidate has a concrete next evidence requirement or is deprioritized by a falsifier.
- Investigation produces a minimal causal narrowing before implementation begins.

## Log Investigation Plan

existing_log_targets:
- Desktop UI send/action logs for the exact user message timestamp.
- desktop/src/api request logs or network traces for message send payload and response.
- desktop store/state logs for optimistic user message insertion and active conversation id.
- Server API request logs under src/server/api for message receipt.
- Server session/control logs under src/server/services for session lookup and execution start.
- WebSocket logs under src/server/ws for subscription, publication, and delivery attempts.
- QueryEngine/message-loop logs around src/query.ts for loop entry, provider call, result, or error.
- Provider/runtime selection logs under src/services showing effective provider, model, auth source, and env overlay.
- OAuth/auth diagnostics relevant to desktop server path.
- Multi-agent orchestration logs for routing, delegation, waiting, or terminal event state.
- Desktop WebSocket receipt logs and store mutation logs for assistant/error events.
- Desktop page/render logs showing active conversation filtering and rendered message list.

candidate_signal_mapping:
- candidate_id: C1
  expected_signals:
  - Desktop send timestamp matches server API receipt.
  - Payload includes expected message text and session/conversation id.
  - Server normalizes to the same actionable session id.
  - Execution-start marker appears after receipt.
  decisive_absence: No matching server receipt or no execution-start marker after valid receipt.
- candidate_id: C2
  expected_signals:
  - Server has terminal assistant result or explicit error.
  - WebSocket publication is attempted with the correct session id.
  - Desktop WebSocket receives the event.
  - Desktop store applies the event.
  decisive_absence: Terminal server result exists but no matching WebSocket publication or no desktop receipt.
- candidate_id: C3
  expected_signals:
  - Desktop path effective provider/model/auth/env are logged.
  - CLI path effective provider/model/auth/env are comparable.
  - Provider output or provider error is visible for desktop path.
  decisive_absence: Desktop effective runtime selection is missing, differs from CLI, or bypasses runtime overlay through direct process.env reads.
- candidate_id: C4
  expected_signals:
  - Message enters server control loop.
  - QueryEngine/message loop advances through expected states.
  - Provider/tool call returns assistant result or explicit error.
  decisive_absence: Control-loop entry exists but no terminal assistant result/error and no visible downstream event.
- candidate_id: C5
  expected_signals:
  - Desktop receives assistant/error event.
  - Store contains the event under expected session.
  - Active page selects the same session.
  - Renderer includes the assistant event.
  decisive_absence: Event exists in desktop state but active conversation selection or rendering excludes it.
- candidate_id: C6
  expected_signals:
  - Routing decision identifies normal reply path or multi-agent path.
  - Delegated/waiting/non-visible state is explicit if used.
  - A user-visible terminal event is emitted or absent.
  decisive_absence: Message is routed into delegated/waiting/non-visible orchestration without a user-visible terminal reply/error.

observability_escalation:
- If existing logs cannot correlate a single send, add temporary correlation id logging at desktop send, server receipt, execution start, WebSocket publish, desktop receipt, and render decision points.
- If runtime selection is opaque, add explicit effective provider/model/auth/env diagnostics with secret redaction.
- If WebSocket delivery is ambiguous, add event id, session id, subscriber count, and delivery acknowledgement diagnostics.
- If query loop state is opaque, add bounded lifecycle markers for loop entry, provider/tool start, provider/tool completion, terminal result, and terminal error.
- If desktop rendering is ambiguous, add active session id and message-count diagnostics around selector/render boundary.

## Truth Ownership Map

- desktop observation truth: `desktop/src/stores/chatStore.ts` can optimistically record the outbound user message before backend execution succeeds.
- transport/control truth: `src/server/ws/handler.ts` owns the `user_message` -> `thinking` -> `ensureCliSessionStarted` -> `conversationService.sendMessage` transition.
- runtime/auth truth: `src/server/services/conversationService.ts` builds the child CLI env, while `src/utils/managedEnv.ts` applies `~/.claude/cc-haha/settings.json` provider env inside the child process.
- provider result truth: live diagnostics under `~/.claude/cc-haha/diagnostics` record SDK assistant/result errors after the provider call returns.

## Control State vs Observation State

- observation_state: Desktop accepts the send and records a user message.
- control_state: The desktop server path starts a per-session CLI child and the child reaches SDK/provider execution.
- broken_transition: Provider/auth execution returns `authentication_failed` / HTTP 401 instead of assistant content.
- user_visible_effect: The user sees no assistant reply because the terminal event is an auth error rather than a model response.

## Expected Closed Loop

- expected: desktop sends `user_message` over `/ws/<sessionId>` -> server starts/reuses CLI -> child resolves provider/auth/model -> SDK returns assistant content -> server publishes `content_*` and `message_complete` -> desktop renders reply.
- observed: desktop sends through the WebSocket path -> child reaches SDK -> SDK returns `401 invalid api key` for key tail `e99b` -> no assistant content is produced.

## Evidence

- source_type: cognition
  source_ref: project-cognition query
  finding: Ready bundle targets desktop UI/API/stores, server API/services/ws, query engine, services, provider/auth risk.
- source_type: subagent
  source_ref: C1 Desktop request/session handoff lane
  finding: Desktop chat sends over WebSocket, not REST. `ChatInput.handleSubmit` calls `chatStore.sendMessage`, which optimistically appends a user message and sends `user_message` over `/ws/<sessionId>`.
- source_type: subagent
  source_ref: C1 Desktop request/session handoff lane
  finding: Server handles `user_message` by emitting `thinking`, starting or resuming a per-session CLI child via `ensureCliSessionStarted`, rebinding output, and calling `conversationService.sendMessage`. The first executable control marker is `conversationService.sendMessage`.
- source_type: subagent
  source_ref: C1 Desktop request/session handoff lane
  finding: REST `POST /api/sessions/:id/chat` is non-streaming/status-only and does not start execution; desktop no-reply should focus on WebSocket path.
- source_type: subagent
  source_ref: C2/C5 WS publication/render lane
  finding: Server and desktop share message types for `content_start`, `content_delta`, `message_complete`, `status`, and `error`; desktop store/render tests cover assistant text and error display.
- source_type: subagent
  source_ref: C2/C5 WS publication/render lane
  finding: Publication/observation risk remains around session/socket binding because most streamed events are applied through the socket-bound session id rather than carrying a session id in every payload.
- source_type: subagent
  source_ref: C3/C4/C6 runtime lane
  finding: Desktop runtime selection is assembled before child CLI spawn through runtime settings, CLI args, and child env; local CLI and desktop child converge on shared `query()` after bootstrap/env.
- source_type: subagent
  source_ref: C3/C4/C6 runtime lane
  finding: Important provider/auth helpers use runtime-env overlay accessors, but the actual failing runtime still needs a one-turn diagnostic capture to distinguish provider/env divergence, no terminal `result`, and delegated/waiting behavior.
- source_type: test
  source_ref: `bun test src/server/__tests__/conversations.test.ts -t "should send user_message and receive streamed SDK response"`
  finding: PASS. Mock CLI WebSocket integration produces streamed response and `message_complete`, so the basic desktop WS transport and translator are not generally broken.
- source_type: live-diagnostics
  source_ref: `http://127.0.0.1:52997/api/diagnostics/events?limit=8`
  finding: Latest active desktop session `8cf840ea-4d9f-4a0d-b5d6-07797363a08f` recorded `sdk_api_error` and `sdk_result_error` at `2026-05-17T06:59:31.107Z` with `authentication_failed` / HTTP 401 and provider text `Authentication Fails, Your api key: ****e99b is invalid`.
- source_type: live-runtime
  source_ref: `http://127.0.0.1:52997/api/providers`
  finding: Desktop provider index reports `providers: []` and `activeId: null`.
- source_type: live-runtime
  source_ref: `http://127.0.0.1:52997/api/providers/auth-status`
  finding: Desktop sidecar reports `hasAuth: true`, `source: env`; this means the sidecar process still has an auth source even though no cc-haha provider is active.
- source_type: local-config-diagnostic
  source_ref: sanitized read of `~/.claude/cc-haha/settings.json`
  finding: Managed cc-haha settings contain provider-routing env keys including `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, default model vars, and `ANTHROPIC_AUTH_TOKEN`; values were not printed.
- source_type: code-inspection
  source_ref: `src/utils/managedEnv.ts`
  finding: The child CLI applies env from `~/.claude/cc-haha/settings.json` after normal user settings, so isolated desktop provider env can override the working local Claude Code path.
- source_type: code-inspection
  source_ref: `src/server/services/providerService.ts`
  finding: `activateOfficial()` clears provider-managed env from cc-haha settings; current live state has no active provider but still has provider-routing env, which is consistent with stale or manually edited desktop provider/auth configuration.
- source_type: code-inspection
  source_ref: `src/server/services/conversationService.ts` and `src/utils/managedEnv.ts`
  finding: Official mode sets `CLAUDE_CODE_ENTRYPOINT=claude-desktop`, but did not set `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`; therefore `managedEnv.ts` did not filter stale `~/.claude/cc-haha/settings.json` provider-routing env inside the child process.
- source_type: live-runtime
  source_ref: `~/.claude/cc-haha/providers.json` metadata
  finding: The providers index exists and reports official mode (`providers: []`, `activeId: null`), so the desktop UI can appear to be on "Claude 官方" while stale provider env still remains in isolated settings.
- source_type: test
  source_ref: `bun test src/server/__tests__/conversation-service.test.ts`
  finding: PASS after fix. `16 pass`, `0 fail`, `60 expect() calls`.
- source_type: test
  source_ref: `bun test src/server/__tests__/conversations.test.ts -t "should send user_message and receive streamed SDK response"`
  finding: PASS after fix. `1 pass`, `0 fail`, `7 expect() calls`.
- source_type: gate
  source_ref: `bun run check:server`
  finding: BLOCKED/TIMED OUT. The server-side aggregate check did not complete within 10 minutes in this environment and left test-owned `mock-sdk-cli.ts`/temporary server processes, which were identified by exact command line and cleaned up.

## Eliminated

- REST chat execution path as the primary desktop send path. Static evidence shows desktop streaming chat uses WebSocket `user_message`; REST `/api/sessions/:id/chat` only queues/statuses and does not execute.
- C1 Desktop request/session handoff as primary cause. Live diagnostics show the message path reaches SDK execution.
- C2 WebSocket publication as primary cause. The terminal event is an SDK auth error, not missing assistant content publication after a successful provider response.
- C4 agent/query loop stall as primary cause. The loop reaches a terminal provider error.
- C5 render-only failure as primary cause. A render issue could still make the error less visible, but it is not the cause of missing assistant content.

## Confirmed Root Cause

C3 Provider/model/auth/runtime divergence is confirmed for the observed failure. In official provider mode, the desktop child process can still apply stale provider-routing env from `~/.claude/cc-haha/settings.json`; the provider rejects that stale auth path with HTTP 401 invalid API key.

## Fix Packet

- owner: subagent `019e34ce-d4a3-74e0-8de7-91c07a2b00df`
- write_scope:
  - `src/server/services/conversationService.ts`
  - `src/server/__tests__/conversation-service.test.ts`
- intent: When official managed OAuth mode is selected, also set `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1` so settings-sourced provider-routing env is filtered inside the child CLI.
- required_regression: providers index official mode (`activeId: null`, `providers: []`) plus stale cc-haha settings env must still launch with official entrypoint and host-managed provider filtering.

## Subagent Dispatch Decisions

- Stage 1A: execution_model=subagent-mandatory, dispatch_shape=one-subagent, execution_surface=native-subagents.
- Stage 1B: execution_model=subagent-mandatory, dispatch_shape=one-subagent, execution_surface=native-subagents.

## Verification Outcome

- narrow_static_ws_check: PASS (`bun test src/server/__tests__/conversations.test.ts -t "should send user_message and receive streamed SDK response"`)
- live_desktop_diagnostics: CONFIRMED provider auth failure (`authentication_failed`, HTTP 401, key tail `e99b`)
- code_fix_status: implemented and awaiting human verification; no user configuration mutated.
- implemented_fix:
  - `ConversationService.buildChildEnv` computes official managed OAuth once and sets `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1` whenever official mode is selected.
  - `ConversationService.shouldMarkManagedOAuth` treats a providers index with `activeId: null` as explicit official mode, even if stale cc-haha settings env exists.
  - Regression coverage now models `providers.json` official mode plus stale cc-haha settings provider env.
- human_verification_required: User should restart the desktop-side session/process or start a new desktop chat session, then send a message and confirm an assistant reply appears without the previous 401 invalid key diagnostic.
