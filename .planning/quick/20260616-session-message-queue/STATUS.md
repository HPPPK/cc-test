---
id: 20260616-session-message-queue
slug: session-message-queue
title: Desktop session message queue UX
status: completed
trigger: "$sp-quick 我觉得得有一个session消息排队机制，如果没有在进行中，那消息马上触发，如果有消息在处理中，那消息默认是排队状态，除非点击引导按钮，类似这样[Image #1] 我红框框那里就是在排队的消息"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: subagent-blocked
execution_surface: leader-inline
created: 2026-06-16T00:00:00+08:00
updated: 2026-06-16T16:01:54+08:00
---

## Current Focus

goal: Add a bounded desktop session message queue behavior so messages sent while a session is busy are visibly queued in the composer instead of appearing as immediately submitted transcript work.
current_focus: Complete. Desktop queue behavior, composer-owned queued message list, queued Delete, running composer action split, non-interrupting Guide promotion, stop/status-idle queue drain, tests, validation, and project cognition closeout are recorded.
next_action: None for this quick task. Future work may define explicit stop/cancel behavior for queued messages if product scope asks for it.

## Execution Intent

intent_outcome: Idle sessions send immediately; active sessions show newly submitted user messages as queued/pending in a dedicated composer queue and submit them when the active turn is ready, with explicit Guide and Delete actions.
intent_constraints:
  - Do not silently interrupt an active agent turn by default.
  - Do not change workflow phase semantics unless existing session queue plumbing requires it.
  - Do not use computer-use automation for implementation.
  - Guide must not interrupt the current turn; it may promote the queued message for processing only after the active tool/turn reaches a safe boundary.
success_evidence:
  - Same-area desktop tests cover busy-session queued message rendering and idle immediate send.
  - Server/CLI queue assumptions are checked against live code and covered if changed.
  - Narrow desktop check passes; broader verification is selected after implementation scope is known.
cognition_facts:
  selected_capability: concept:GEN-20260610T112843.959253900Z:N-030 selected only as broad path coverage, not behavior evidence.
  minimal_reads:
    - desktop/src/stores/chatStore.ts
    - desktop/src/components/chat/MessageList.tsx
    - desktop/src/components/chat/UserMessage.tsx
    - desktop/src/components/chat/ChatInput.tsx
    - desktop/src/api/websocket.ts
    - src/server/ws/handler.ts
    - src/server/services/conversationService.ts
    - src/cli/print.ts
    - src/utils/messageQueueManager.ts
    - src/utils/handlePromptSubmit.ts
    - .env.example
  validation_route: desktop Vitest same-area tests first; server/CLI tests only if those surfaces change.
  known_risk: project cognition coverage is broad/weak; "引导" button semantics are ambiguous.

## Understanding Checkpoint

confirmed_problem: Desktop chat does not make second/subsequent messages visibly queued while the agent is already processing.
confirmed_outcome: Idle sessions send immediately; busy sessions show new user messages as queued/pending and process them later without interrupting the current tool/turn.
confirmed_scope_boundary:
  - Do not default to interrupting the current agent turn.
  - Do not change workflow phase semantics.
  - Keep this bounded to desktop session queue UX/state unless live evidence requires a minimal backend metadata change.
confirmed_execution_approach:
  - Start with RED same-area desktop tests.
  - Prefer a desktop-first queued message state/rendering change.
  - Preserve existing backend/CLI queue semantics unless they conflict with the confirmed UX.
confirmed_validation:
  - Focused desktop Vitest for busy-session queued rendering and idle immediate send.
  - Run bun run check:desktop if desktop production code changes.

## Execution

active_lane: desktop-session-queue-red-green
join_point: none
files_or_surfaces: desktop chat store/components; websocket session messaging; CLI queue semantics; tests
blocked_dispatch: native spawn_agent exists but tool policy requires explicit user request for subagents/parallel delegation; current user invoked sp-quick but did not explicitly ask for subagents.
blockers: none for scoped code patch; full PR readiness remains policy-blocked by the broader dirty worktree, and final project-cognition update is blocked by DB schema_version mismatch.
recovery_action: If native subagents are unavailable, record the concrete blocker and continue leader-inline with RED tests because the lane is bounded.
retry_attempts: 0
blocker_reason:

## Validation

planned_checks:
  - targeted desktop tests for chat queue state/rendering
  - bun run check:desktop if desktop production code changes
completed_checks:
  - constitution, project rules, learning index read
  - project-cognition lexicon/query returned readiness=review and minimal_live_reads
  - minimal live reads confirmed existing desktop sendMessage, UserMessage rendering, websocket send buffering, server user_message forwarding, and CLI command queue behavior
  - RED focused desktop tests failed as expected: busy send still calls websocket immediately, guideQueuedMessage is missing, queued UserMessage UI is missing
  - 'GREEN focused desktop tests: cd desktop; bun run test -- src/components/chat/ChatInput.test.tsx src/stores/chatStore.test.ts src/components/chat/MessageList.test.tsx src/components/chat/UserMessage.test.tsx -> 162 passed'
  - 'bun run check:desktop -> passed desktop lint, 98 Vitest files / 879 tests, and production build'
  - 'git diff --check -> exit 0 with line-ending warnings only'
  - 'bugfix focused tests: cd desktop; bun run test -- src/stores/chatStore.test.ts src/components/chat/ChatInput.test.tsx src/components/chat/MessageList.test.tsx -> 161 passed'
  - 'bugfix bun run check:desktop -> passed desktop lint, 98 Vitest files / 880 tests, and production build'
  - 'bugfix git diff --check -> exit 0 with line-ending warnings only'
  - 'default bun run verify -> failed only in native lane because default Tauri target was locked by a running local Tauri dev/desktop process'
  - 'isolated native check: CARGO_TARGET_DIR=%TEMP%\cc-jiangxia-codex-cargo-target-session-message-queue bun run check:native -> passed'
  - 'isolated bun run verify -> report artifacts/quality-runs/2026-06-16T06-29-33-653Z/report.md, 9 passed / 0 failed / 2 skipped; command exit remained 1 because the broader dirty worktree is policy-blocked and not PR-ready'
  - 'follow-up isolated bun run verify after composer queue/delete changes -> timed out after 15 minutes in artifacts/quality-runs/2026-06-16T07-34-35-081Z with no report.md; server-checks.log only contained the check:server command line; exact verify-chain PIDs were identified by command line and stopped'
  - 'project-cognition inline update -> upd-20260616T040237.709894600Z, result_state partial_refresh, readiness review'
  - 'final project-cognition update after composer queue/delete follow-up -> blocked: project-cognition.db metadata schema_version has 1, expected 2; mark-dirty fallback hit the same blocker'
  - 'final project-cognition update after stop/status-idle bugfix -> blocked: project-cognition.db metadata schema_version has 1, expected 2; mark-dirty fallback hit the same blocker'
  - 'learning capture-auto -> no-op; no high-signal auto-capture patterns matched'

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason:
affected_objects:
  - desktop per-session chat state
  - desktop composer primary action state
  - queued user message composer queue rows
  - ChatInput submission behavior
  - WebSocket user_message transport
  - ConversationService SDK user message transport
  - CLI command queue / active turn handling
  - stop_generation and explicit guide/interrupt affordance
state_behavior_matrix:
  - idle -> new user message submits immediately and appears as normal submitted message
  - thinking/streaming/tool_executing/permission_pending -> new user message appears as queued/pending and must not silently interrupt by default
  - active with empty composer -> primary composer action remains Stop/running
  - active with composer payload -> primary composer action switches to Run so the payload can be queued
  - queued -> message remains visible in the composer queue, ordered, guide/delete capable, and later submits exactly once unless deleted
  - completed/current turn idle -> queued messages drain in FIFO order unless user action changes priority
  - stopped/cancelled -> existing Stop semantics preserved; queued-message cancel behavior is out of scope and should be specified before changing
  - stopped/status-idle -> the next queued message drains immediately after the server idle acknowledgement; a guided queued item is promoted first and then drained
dependency_impact:
  - desktop chatStore -> owns user-visible per-session state transitions
  - chat rendering components -> must keep queued messages out of transcript while the composer displays and controls them
  - websocket/client/server user_message route -> may need queue metadata only if desktop-only queue is insufficient
  - CLI messageQueueManager/handlePromptSubmit -> existing queue semantics must not be contradicted
  - tests -> same-area coverage required by project quality contract
recovery_and_validation:
  - Prefer frontend-only queue state if backend already serializes safely.
  - Add RED test before production edits.
  - Preserve existing Stop behavior as separate from queued-message guide behavior unless confirmed otherwise.
  - Run smallest meaningful desktop tests, then check:desktop if code changes are in desktop/src.
project_cognition_evidence:
  - readiness=review
  - selected concept is weak broad path coverage only
  - minimal_live_reads listed in Execution Intent
coverage_gaps:
  - Resolved: exact visual copy/action behavior for queued guide/delete actions covered by ChatInput and store tests.
  - Carried: project cognition still lacks a precise adopted desktop queue concept; earlier inline update left readiness=review, and the final ChatInput follow-up update is blocked by project-cognition.db schema_version v1 expected v2.
consequence_obligations:
  - CA-001 claim: Busy-session messages must queue visibly and not silently interrupt; owner=quick; latest resolve phase=implementation validation; status=resolved; stop-and-reopen=tests or live reads show default interrupt behavior remains exposed as normal send.
  - CA-002 claim: Idle-session messages must preserve immediate send behavior; owner=quick; latest resolve phase=implementation validation; status=resolved; stop-and-reopen=regression in idle send tests/manual check.
  - CA-003 claim: Guide action must not interrupt and must only affect processing after a safe boundary; owner=quick; latest resolve phase=implementation validation; status=resolved; stop-and-reopen=implementation requires active-turn interruption.
  - CA-004 claim: Busy-session composer must show Stop only when no payload is present and Run when the user has typed/attached a payload; owner=quick; latest resolve phase=implementation validation; status=resolved; stop-and-reopen=running composer still forces Stop while typed content is present.
  - CA-005 claim: Queued messages must be owned by the composer queue, support Delete, and stay out of the transcript until actually submitted; owner=quick; latest resolve phase=implementation validation; status=resolved; stop-and-reopen=queued messages render in MessageList transcript or deletion removes only visible UI but leaves outbound payload queued.
  - CA-006 claim: Stop/status-idle must drain exactly the next queued message, honoring Guide priority without sending during stop-pending state; owner=quick; latest resolve phase=bugfix validation; status=resolved; stop-and-reopen=after Stop/status idle queued prompts remain in composer or multiple queued prompts submit at once.
escalation_decision: stay quick unless guide semantics require broad cross-process behavior or workflow/session architecture changes.

## Summary Pointer

summary_path: .planning/quick/20260616-session-message-queue/SUMMARY.md
resume_decision: no resume needed for scoped quick task; broader repository PR readiness remains a separate dirty-worktree issue
