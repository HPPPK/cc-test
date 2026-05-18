# Debug Session: background-agent-panel-stale

## Status
- stage: `awaiting_human_verify`
- terminal_status: `agent_verified`
- behavior_surface: `desktop`
- created: `2026-05-17`
- issue: Desktop session top "后台 Agent" panel still shows `in_process_teammate` running/recent tasks after agents have ended; user wants the panel removed or collapsible.

## Project Cognition Gate
- lexicon_readiness: `ready`
- query_readiness: `ambiguous`
- selected_primary_candidate: `n-cap-desktop` / Desktop App (Tauri 2 + React)
- secondary_candidate: `n-cap-agent` / Multi-Agent Orchestration
- selection_reason: User described a visual panel at the top of the session; desktop UI projection is the primary failing surface while agent lifecycle state is the upstream truth candidate.
- affected_nodes:
  - `n-cap-agent`
  - `n-cap-desktop`
  - `n-desktop-api`
  - `n-desktop-app`
  - `n-desktop-components`
  - `n-desktop-stores`
  - `n-src-server-services`
  - `n-src-server-ws`
- minimal_live_reads:
  - `desktop/src/App.tsx`
  - `desktop/src/api/`
  - `desktop/src/components/`
  - `desktop/src/stores/`
  - `src/server/services/`
  - `src/server/ws/`
- unresolved_coverage_gaps: none returned.
- competing_truths:
  - Desktop UI/store may keep a stale observation projection.
  - Agent/team server lifecycle may still report tasks as running/recent.
  - The panel may be intentionally sticky because there is no collapse/dismiss state.

## Intake Gates
- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- legacy_session_needs_reintake: false

## Scope Boundary
- In scope: desktop top-of-session background agent/task panel visibility, collapse/dismiss affordance, and the state projection that feeds it.
- In scope: upstream team/agent status only as needed to distinguish stale UI projection from stale authoritative lifecycle.
- Out of scope: changing agent execution semantics, model/provider behavior, team scheduling, or protected persistence formats unless evidence proves they own the defect.

## Key Constraints
- Preserve existing desktop UI patterns and avoid broad redesign.
- Do not mutate protected user-owned persistence formats.
- Add same-area regression coverage for desktop behavior.
- Prefer a minimal fix that restores the UI loop without masking a broken control-plane truth.

## Affected Surface Area
- Primary: desktop React UI components and Zustand stores.
- Secondary: desktop API client, server services, server WebSocket event projection.
- Verification: desktop Vitest/Testing Library tests.

## Known Unknowns
- Which component renders the "后台 Agent" panel.
- Whether completed agent tasks are still in authoritative server state or only in a desktop view model.
- Whether there is already a user preference/collapse pattern for this panel.
- Whether "recent tasks" are intentionally retained and only need a collapse default.

## Current Focus
Agent verification complete. Await user confirmation that the top background Agent panel is acceptable in the desktop UI.

## Causal Map
- symptom_anchor: Desktop top panel/window continues to show `$sp-debug` background Agent entries (`2 running or recent tasks`, two `in_process_teammate` rows marked running) after the user believes both agents ended; user asks whether the panel can be removed or collapsed.
- closed_loop_path:
  1. Agent lifecycle changes from running to terminal.
  2. Server/team orchestration records authoritative lifecycle/status truth.
  3. Server API/WebSocket publishes current running/recent task snapshot or events.
  4. Desktop API/store receives and normalizes team/agent task status.
  5. Desktop top panel derives visibility and rows from store projection.
  6. User observes panel as still running/recent or lacking collapse/dismiss control.
- family_coverage:
  - Desktop UI/store projection drift. Falsifier: fresh desktop store snapshot after reconnect has no stale running rows and panel hides or renders terminal state.
  - Server/team lifecycle truth stale. Falsifier: authoritative server/team status reports no active/recent tasks while desktop still shows active.
  - Intentional sticky recent-task UX or missing collapse affordance. Falsifier: existing collapse/dismiss/auto-hide contract should apply but is ignored.
  - Event ordering/reconnect race. Falsifier: replay/snapshot reconciliation includes terminal state and removes stale entries after reconnect.
- candidate_board:
  - C1: Desktop stale observation projection. First falsifier: compare authoritative status snapshot to desktop store/rendered panel state.
  - C2: Server/team status still reports `in_process_teammate`. First falsifier: authoritative lifecycle/status source reports terminal/no-active entries.
  - C3: Panel intentionally sticky without collapse/dismiss state. First falsifier: existing collapse/dismiss or auto-hide contract exists and should suppress the panel.
  - C4: Missed terminal event or stale replay ordering. First falsifier: complete replay/snapshot applies terminal update but stale rows persist.
- adjacent_risk_targets:
  - Other desktop background task panels or banners consuming team/agent task projections.
  - Agent team status counters such as running/recent totals.
  - WebSocket reconnect and snapshot reconciliation behavior.
  - Task lifecycle cleanup for cancelled, failed, interrupted, or completed subagents.
  - Persisted desktop UI state for banners, panels, and session overlays.
- dimension_scan:
  - truth_owner: unknown at observer stage; likely server/team lifecycle if it still reports running, otherwise desktop store/render policy owns stale observation.
  - control_state: agent lifecycle records, running/admitted sets, recent-task collections, server-side team/session status.
  - observation_state: desktop top panel rows, task labels, running/recent count, local store projection, visible collapse/dismiss state.
  - ambiguity: "running or recent" may intentionally retain terminal work, but rows marked "running" suggest a stronger stale-state issue.

## Observer Framing
- primary_suspected_loop: agent lifecycle terminal -> server/team authoritative lifecycle/status -> API/WebSocket snapshot/events -> desktop API/store projection -> top panel visibility/render policy -> user observation.
- primary_candidate: C1 Desktop stale observation projection.
- contrarian_candidate: C2 Server/team status still reports `in_process_teammate`.
- candidate_queue:
  - C1: Desktop stale observation projection. Falsifier: authoritative server/team status is terminal or has no active entries while desktop store/rendered panel still shows `in_process_teammate`.
  - C2: Server/team status still reports `in_process_teammate`. Falsifier: authoritative lifecycle/status reports terminal/no-active entries for the same tasks.
  - C3: Panel intentionally sticky without collapse/dismiss state. Falsifier: existing collapse/dismiss/auto-hide contract exists and should suppress the panel.
  - C4: Missed terminal event or stale replay ordering. Falsifier: complete replay/snapshot applies terminal updates correctly, but stale rows persist anyway.
- related_risk_targets:
  - Other desktop task banners or counters using the same status projection.
  - WebSocket reconnect and snapshot reconciliation.
  - Task lifecycle cleanup after terminal states.
  - Persisted UI state for panel visibility, dismissal, or collapse.
- recommended_first_probe: Compare the authoritative team/task status snapshot against the desktop store/view-model and rendered top panel state for the reported `in_process_teammate` entries.

## Transition Memo
- first_candidate_to_test: C1 Desktop stale observation projection.
- why_first: It separates an observation-layer/UI projection problem from a true server/team lifecycle problem while matching the user-visible stale panel symptom.
- evidence_unlock:
  - If server/team status is terminal but desktop still renders active rows, investigate desktop API/store projection and render visibility policy.
  - If server/team status still reports active rows, shift to C2 and inspect lifecycle/status ownership.
  - If both authoritative and desktop state are terminal but the panel remains visible, shift to C3 sticky visibility/collapse policy.
- carry_forward_notes:
  - Do not treat the panel as removable until truth ownership is established.
  - Keep control state separate from observation state: server/team lifecycle is candidate control truth; desktop panel/store is candidate observation truth.
  - Required verification route remains desktop same-area tests.

## Investigation Contract
- primary_candidate_id: C1
- primary_candidate: Desktop stale observation projection.
- contrarian_candidate: Server/team status still reports `in_process_teammate`.
- candidate_queue: C1 -> C2 -> C3 -> C4.
- primary_candidate_probe:
  - objective: Determine whether the desktop top panel is rendering stale active-agent/task state after authoritative lifecycle completion.
  - authoritative_inputs:
    - Authoritative server/team lifecycle/status snapshot for the reported agents/tasks.
    - Desktop API/WebSocket snapshot or event payload consumed by the app.
    - Desktop store/view-model state that drives the top panel.
    - Rendered panel visibility and row status.
  - pass_condition: Evidence identifies whether stale active rows originate before or after the desktop projection boundary.
  - fail_condition: No comparison is made between authoritative status and desktop rendered/store state.
- scope_boundaries:
  - included: desktop top panel visibility/render policy; desktop API/store projection of agent/task status; server/team status as comparison truth; WebSocket snapshot/event handoff only if needed.
  - excluded_until_evidence_requires: broad scheduler redesign; unrelated desktop banners; permanent panel removal without confirming intended lifecycle behavior.
- required_verification: Desktop same-area tests covering terminal task state suppressing/collapsing the panel, plus store/reconciliation coverage if that mechanism is confirmed.

## Log Investigation Plan
- existing_log_status_targets:
  - server/team lifecycle or status reporting: confirm whether `in_process_teammate` remains authoritative after agents end.
  - API/WebSocket snapshot and event stream: confirm whether terminal state is published and whether stale active entries are replayed.
  - desktop store/projection state: confirm whether consumed status is transformed into stale top-panel rows.
  - desktop rendered panel visibility state: confirm whether visibility persists despite terminal/empty active state.
- candidate_signal_mapping:
  - C1 expected signal: authoritative status terminal/inactive but desktop store/rendered panel still shows `in_process_teammate`; next action traces desktop API/store and visibility logic.
  - C2 expected signal: authoritative status still reports `in_process_teammate`; next action traces server/team lifecycle cleanup and status ownership.
  - C3 expected signal: state terminal/empty but panel remains by design due to recent-task/sticky policy without usable collapse/dismiss behavior; next action clarifies or implements collapse/auto-hide contract with tests.
  - C4 expected signal: terminal event exists but reconnect/replay/snapshot ordering restores stale active rows; next action traces event ordering and reconciliation.
- observability_escalation_guidance:
  - Use existing logs/status snapshots first.
  - If comparison cannot be made, add targeted diagnostics at authoritative status, API/WebSocket payload, desktop store, and rendered visibility boundaries.
  - Prefer task ids, agent labels, lifecycle status, active/recent membership, event sequence/order, snapshot timestamp, and panel visibility reason.

## Truth Ownership Map
- Server/team lifecycle owns upstream control truth for teammate/member active vs idle/running status.
- Desktop `chatStore` owns the session-local background agent task observation projection from WebSocket `system_notification` task events.
- `ActiveSession` / `BackgroundAgentTasksPanel` owns the visible top-panel observation and should not force users to keep terminal/recent work expanded.
- Evidence supports an observation-boundary issue for this user request: terminal background tasks remain in `backgroundAgentTasks`, and the panel only hides when the collection is empty.

## Control State / Observation State
- Control State: agent lifecycle records, running/admitted sets, recent-task collections, server-side team/session status.
- Observation State: desktop top panel rows, task labels, running/recent count, local store projection, collapse/dismiss visibility state.

## Expected Closed Loop
agent/subagent terminal event -> authoritative team/session lifecycle state update -> API/WebSocket publishes current snapshot/event -> desktop store reconciles active/recent rows -> top panel hides, collapses, or renders terminal/recent state accurately -> user no longer sees stale running entries.

## Evidence
- Cognition query returned desktop and agent orchestration as competing candidates, with minimal reads constrained to desktop UI/store/API and server services/WebSocket paths.
- Stage 1A/1B subagents produced a candidate queue C1 -> C2 -> C3 -> C4 and first probe requiring comparison between authoritative status and desktop rendered/store state.
- UI/store evidence: `BackgroundAgentTasksPanel` in `desktop/src/pages/ActiveSession.tsx` renders `data-testid="background-agent-panel"` before `MessageList`, fed by `sessionState?.backgroundAgentTasks` from `useChatStore`.
- UI/store evidence: render gate is only `if (tasks.length === 0) return null`; terminal statuses `completed`, `failed`, and `stopped` remain rendered while stored.
- UI/store evidence: the panel has no collapse state, dismiss button, close button, persisted hidden flag, or auto-hide timer. The separate `SessionTaskBar` does have collapse/dismiss behavior, but it is for CLI todo/task state, not background agents.
- Store evidence: `chatStore` handles WebSocket `system_notification` subtypes `task_started`, `task_progress`, and `task_notification`, normalizes them, and merges into `backgroundAgentTasks`.
- Server/WS evidence: team status publish path is `teamWatcher` -> WebSocket `team_update` / `team_created` / `team_deleted`; server derivation mostly emits `running` or `idle`, while desktop types support terminal statuses that the inspected server path does not emit.
- Server/WS evidence: no inspected bridge connected generic task service or coordinator terminal statuses to the desktop background-agent panel status.
- Test surface evidence: direct UI regression location is `desktop/src/pages/ActiveSession.test.tsx`; direct lifecycle projection location is `desktop/src/stores/chatStore.test.ts`.
- Fix evidence: `BackgroundAgentTasksPanel` now keeps running task sets expanded, defaults terminal-only task sets to collapsed, and exposes an icon button with localized expand/collapse labels.
- Regression evidence: `desktop/src/pages/ActiveSession.test.tsx` covers completed background Agent tasks defaulting to collapsed and toggling open/closed.
- Verification evidence: `cd desktop && bun run test -- ActiveSession.test.tsx` passed 11 tests.
- Verification evidence: `cd desktop && bun run lint` passed TypeScript no-emit.
- Verification evidence: `bun run check:desktop` passed lint, 89 test files / 637 tests, and production desktop build.
- Incidental gate fix evidence: `desktop/src/theme/globals.test.ts` now normalizes CRLF to LF before raw CSS selector matching, unblocking Windows desktop checks without product behavior changes.
- Cognition maintenance: `project-cognition mark-dirty` recorded a stale runtime because desktop `ActiveSession` background Agent UI/test behavior changed; recommended next action is `$sp-map-update` before future cognition-dependent brownfield work.

## Eliminated
- Existing collapse/dismiss behavior for the background Agent panel: eliminated. Evidence found no such control in the panel.
- `SessionTaskBar` as the reported panel: eliminated. It is a separate CLI task bar with its own store.
- Pure server-only fix as the first change: deprioritized. Server lifecycle may have adjacent issues, but the user-visible request is a desktop panel that lacks hide/collapse behavior for recent/terminal entries.

## Current Hypothesis
- The stale top frame persists because `BackgroundAgentTasksPanel` treats any stored background task, including terminal "recent" tasks, as sufficient to keep the panel fully visible and expanded. The correct minimal fix is an observation-boundary UI control: keep running tasks visible, but allow the user to collapse the panel and default terminal-only task sets to collapsed so completed agents do not keep a large top frame open.

## Root Cause
- summary: `BackgroundAgentTasksPanel` has no collapsed/dismissed state and renders all retained `backgroundAgentTasks` until the whole collection is cleared.
- owning_layer: desktop observation boundary.
- broken_control_state: missing local visibility/collapse state for background Agent panel.
- failure_mechanism: terminal/recent background tasks remain in store for visibility/history, and the render policy expands them indefinitely.
- loop_break: desktop store -> top panel render policy.
- decisive_signal: panel hides only when `tasks.length === 0`; no collapse/dismiss logic exists for background Agent tasks.
- alternative_hypotheses_considered: C1, C2, C3, C4.
- alternative_hypotheses_ruled_out: existing background-panel collapse control; `SessionTaskBar` ownership.
- root_cause_confidence: confirmed for the UI control gap; upstream team lifecycle remains an adjacent risk target.

## Fix Scope
- fix_scope: observation-boundary
- files_changed:
  - `desktop/src/pages/ActiveSession.tsx`
  - `desktop/src/pages/ActiveSession.test.tsx`
  - `desktop/src/i18n/locales/zh.ts`
  - `desktop/src/i18n/locales/en.ts`
  - `desktop/src/theme/globals.test.ts`
- loop_restoration_proof: Stored terminal/recent background Agent tasks no longer force a fully expanded top frame. Running tasks still expand automatically, while completed-only task sets collapse to a compact header and can be expanded by the user.
- related_risk_review:
  - Other task bars: `SessionTaskBar` already had separate collapse/dismiss behavior and was not changed.
  - Store lifecycle projection: `chatStore` retains task history; the fix does not remove history or mutate persisted state.
  - Server/team lifecycle: adjacent binary running/idle status behavior remains a separate upstream risk, not required for this UI control fix.

## Subagent Dispatch
- execution_model: `subagent-mandatory`
- dispatch_shape: `parallel-subagents`
- execution_surface: `native-subagents`
- completed_lanes:
  - `stage-1a-causal-map`
  - `stage-1b-investigation-contract`
  - `ui-store-panel-path`
  - `server-status-ws-path`
  - `desktop-test-surface`
- current_lane: `stage-1b-investigation-contract`
- current_lane: `stage-2-evidence-join`
- current_lane: `stage-3-fix`
- next_evidence_lanes:
  - `ui-store-panel-path`
  - `server-status-ws-path`
  - `desktop-test-surface`

## Verification Outcome
- focused_active_session_test: passed
- desktop_lint: passed
- check_desktop: passed
- human_verification: pending
- project_cognition_refresh: marked_dirty_pending_map_update
