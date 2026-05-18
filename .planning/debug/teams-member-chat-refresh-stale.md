# Debug Session: teams-member-chat-refresh-stale

## Status

- stage: `resolved`
- terminal_state: `human_verified`
- user_report: Agent Teams member opens an agent session to view chat history; chat history does not live refresh, especially after switching sessions away and back. Clicking the Teams member box above the chat navigates to the corresponding agent session and then the latest chat history appears.
- current_hypothesis: Fixed C1 with a member-tab activation effect in `ActiveSession` that refreshes the member transcript and resumes polling whenever an existing member tab becomes active.
- next_action: None for this bug; run `$sp-map-update` before later cognition-dependent brownfield work, and address unrelated server lane failures before claiming full PR readiness.

## Cognition Gate

- lexicon_readiness: `ready`
- query_readiness: `ready`
- recommended_next_action: `retry_current_workflow`
- selected_capability_or_symptom: `n-cap-desktop` Desktop App (Tauri 2 + React)
- competing_truths:
  - `n-cap-agent`: Multi-Agent Orchestration
  - `n-cap-desktop`: Desktop App (Tauri 2 + React)
- affected_nodes:
  - `n-cap-agent`
  - `n-cap-desktop`
  - `n-desktop-api`
  - `n-desktop-components`
  - `n-desktop-pages`
  - `n-desktop-stores`
  - `n-desktop-tests`
  - `n-server-tests`
  - `n-src-server-api`
  - `n-src-server-services`
  - `n-src-server-ws`
- minimal_live_reads:
  - `desktop/src/`
  - `desktop/src/api/`
  - `desktop/src/components/`
  - `desktop/src/pages/`
  - `desktop/src/stores/`
  - `src/server/__tests__/`
  - `src/server/api/`
  - `src/server/services/`
  - `src/server/ws/`
- missing_coverage: none after replacing `desktop/src/__tests__/` with indexed `desktop/src/`
- freshness_note: Project cognition build acceptance now validates as `query_ready` after synchronizing status metadata with DB metadata. Global freshness check still reports `partial_refresh` because broad working-tree drift exists, but the selected Desktop App query returned readiness `ready` with no missing coverage.

## Intake Flags

- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- legacy_session_needs_reintake: false

## Current Focus

Focused RED/GREEN and desktop gate are complete. Project cognition is marked dirty for this localized desktop behavior change. The desktop Teams member transcript flow passed human verification. Full PR verification remains blocked by server lane failures outside this localized desktop fix.

## Evidence

- 2026-05-17: `project-cognition lexicon` returned readiness `ready` and matched Agent Teams, Multi-Agent Orchestration, Desktop App, desktop source areas, server API/services/ws, and related test surfaces.
- 2026-05-17: First `project-cognition query` used an invalid rich query-plan shape; runtime parsed an empty plan and returned `needs_update`.
- 2026-05-17: Corrected `query_plan` schema to `raw_query`, `expanded_queries`, and `paths`; query returned affected desktop/server nodes but `needs_update` due to uncatalogued `desktop/src/__tests__/`.
- 2026-05-17: Replaced uncatalogued `desktop/src/__tests__/` with indexed `desktop/src/`; query returned no missing coverage and readiness `ambiguous` with candidates `Multi-Agent Orchestration` and `Desktop App`.
- 2026-05-17: Reporter selected option `1`, interpreted as `Desktop App`, for the primary debug surface.
- 2026-05-17: `project-cognition update` for selected Desktop App paths returned readiness `ready` with update id `UPDATE-37fdd3b79abe4a3f8c993a683aaacd42`.
- 2026-05-17: `project-cognition validate-build` remained blocked: status metadata requires `graph_ready: true` and `graph_store_path: .specify/project-cognition/project-cognition.db`. Validation details showed SQLite smoke query readiness `ready`.
- 2026-05-17: `project-cognition record-refresh` returned `partial_refresh`, cleared manual stale/dirty flags, and recommended `run_map_scan_build` because runtime readiness remains blocked for the touched area.
- 2026-05-17: `project-cognition validate-scan` returned `status=ok, readiness=scan_ready`; no full scan was needed.
- 2026-05-17: Existing DB metadata reported `baseline_state=ready`, `graph_ready=true`, `graph_store_path=.specify/project-cognition/project-cognition.db`, `active_generation_id=gen-003`, and `query_contract_version=2`.
- 2026-05-17: Synchronized `.specify/project-cognition/status.json` runtime metadata with DB metadata; `project-cognition validate-build` returned `status=ok, readiness=query_ready`.
- 2026-05-17: Re-ran selected Desktop App cognition query; readiness returned `ready`, primary candidate `n-cap-desktop` score `0.9`, no missing coverage.
- 2026-05-17: Desktop lifecycle/store evidence found `ActiveSession` renders by `useTabStore().activeTabId`, detects member tabs via `useTeamStore().getMemberBySessionId(activeTabId)`, skips `connectToSession` for member sessions, and has no matching re-entry effect to call `refreshMemberSession` or `startMemberPolling` when returning to an existing member tab.
- 2026-05-17: Desktop lifecycle/store evidence found `startMemberPolling` stops itself when `useTabStore.getState().activeTabId !== sessionId`; after polling stops on switch-away, ordinary tab return has no inspected automatic restart path.
- 2026-05-17: Desktop lifecycle/store evidence found member-row click path `openMemberSession(...)` calls `refreshMemberSession(tabId)` and `startMemberPolling(tabId)`, explaining why clicking the Teams member box shows latest history.
- 2026-05-17: Server evidence confirmed two identity spaces (`sessionId` for canonical sessions and `agentId` / synthetic member ids for team members) and `team_update` omits `sessionId`, but server transcript retrieval exists through `TeamService.getMemberTranscript`; no inspected server code rewrites to a wrong session id.
- 2026-05-17: Test-surface evidence found no existing desktop test for member transcript refresh after switching away and back; narrowest RED target is `desktop/src/pages/ActiveSession.test.tsx`.
- 2026-05-17: Marked project cognition dirty with reason `desktop member session transcript refresh behavior changed; run sp-map-update before future cognition-dependent work`; freshness returned `stale`, readiness `blocked`, recommended next action `run_map_update`.
- 2026-05-17: Reporter confirmed the desktop Teams member transcript refresh behavior works after the fix.

## Eliminated

- Invalid query-plan schema as the blocker for cognition query consumption. Correct schema was confirmed through `project-cognition query --help` and a successful populated query response.
- Manual stale flag as the sole blocker. It was cleared, but build acceptance still blocks the cognition gate due to graph readiness metadata/runtime-truth drift.
- Missing scan package as a blocker. `validate-scan` returned `scan_ready`.
- Build acceptance metadata as a blocker. Status metadata synchronization made `validate-build` pass with `query_ready`.
- C2 as primary root cause. Store/cache staleness is downstream of missing member-tab refresh/poll restart; evidence shows cached messages persist because the lifecycle path is not reactivated.
- C3 as primary root cause. Server identity separation is an adjacent risk, but transcript retrieval exists and the concrete bypass is desktop `openMemberSession` refreshing/restarting polling.

## Truth Ownership Map

- `TeamService.getMemberTranscript` owns persisted member transcript truth on the server.
- `teamStore` owns desktop member transcript refresh/poll control state for synthetic member tabs.
- `tabStore.activeTabId` owns the currently rendered desktop chat tab identity.
- `chatStore.sessions[memberTabId].messages` owns the desktop observation cache rendered by `ActiveSession`.
- `ActiveSession` owns the page lifecycle bridge that should resume member transcript refresh when a member tab becomes active again.

## Control State / Observation State

- Control State: active tab id, member tab id, active team/member identity, member polling timer, refresh invocation, server transcript lookup.
- Observation State: cached messages under `chatStore.sessions[memberTabId]`, rendered message list, team status/member row.

## Expected Closed Loop

member tab becomes active -> desktop detects active tab is a team member session -> refreshes member transcript -> starts/resumes member polling while active -> `chatStore.sessions[memberTabId].messages` updates -> `ActiveSession` renders latest messages.

## Root Cause

- summary: Existing member-session refresh starts when the user opens/clicks a Teams member, but after tab switch-away the member polling loop stops and ordinary tab return does not restart refresh/polling.
- owning_layer: desktop lifecycle/control boundary.
- broken_control_state: missing member-tab activation effect in `ActiveSession`.
- failure_mechanism: `startMemberPolling` stops when another tab becomes active; only `openMemberSession`, `sendMessageToMember`, current-tab `handleTeamUpdate`, or terminal polling refresh can restart it, so a cached member transcript stays stale after returning to an already-open member tab.
- loop_break: desktop tab activation -> teamStore member refresh/poll restart.
- decisive_signal: `openMemberSession` performs `refreshMemberSession` + `startMemberPolling`, while `ActiveSession` only calls `connectToSession` for non-member tabs and has no member-tab re-entry equivalent.
- alternative_hypotheses_considered: C1, C2, C3, C4, C5.
- alternative_hypotheses_ruled_out: C2 primary cache bug, C3 primary server targeting bug.
- root_cause_confidence: confirmed.

## Observer Framing

Stage 1A causal map:

- symptom_anchor: Desktop Agent Teams member chat history does not live refresh after opening an agent session, especially after switching away and returning; clicking the Teams member box navigates to the corresponding agent session and latest history appears.
- closed_loop_path: agent runtime emits chat update -> server services persist/update session -> server WS/API exposes update -> desktop API/store receives update -> desktop components/pages render refreshed chat history.
- observed_break: team-member session view remains stale while explicit navigation reloads or reselects fresh history.
- bypass_paths:
  - Teams member box click -> corresponding agent session -> latest chat appears.
  - Manual route/session change may bypass stale team-member view state by using canonical session identity.
  - Server/API persisted history is likely intact because latest chat can be recovered through navigation.
- family_coverage:
  - desktop subscription lifecycle: listener remains bound to previous session after switching; falsifier is receiving and rendering correct-session events without remount/navigation.
  - desktop store identity/cache: selector/memoized history remains keyed to stale session/team member id; falsifier is store state changing with fresh current-session messages while only display is stale.
  - routing/view lifecycle: return preserves component state and skips effect that loads/subscribes active agent session; falsifier is full route re-entry without Teams member click re-subscribing correctly.
  - desktop API fetch policy: fetch after return is skipped or stale cached until explicit navigation; falsifier is comparable views updating solely from WS without fetch.
  - server WS/session targeting: updates emitted under canonical agent session id while team-member view listens to team/session id; falsifier is desktop store receiving correctly targeted events.
  - agent/team projection: Agent Teams projection diverges from canonical agent session history; falsifier is both views reading the same persisted conversation/session record.
- candidate_board:
  - C1 high: desktop subscription lifecycle break at desktop pages/components -> desktop stores.
  - C2 high: desktop store identity/cache break at desktop stores -> desktop components.
  - C3 medium: server WS/session targeting break at server WS -> desktop stores.
  - C4 medium: desktop API fetch policy break at desktop stores -> desktop API.
  - C5 low: agent/team projection break at agent capability -> server services.
- dimension_scan: identity, lifecycle, transport, cache, projection, race, tests.

Stage 1B observer framing:

- scope_boundary: Desktop App Agent Teams member chat history live refresh after switching away and returning. Source, logs, tests, and commands were not read during intake.
- key_constraints:
  - Preserve Stage 1A candidate ordering.
  - Later reads stay within minimal live-read paths.
  - Separate desktop subscription/render failures from server event delivery failures.
- affected_surface_area: desktop api, desktop components/pages, desktop stores, server api/services/ws, desktop/server tests, adjacent agent capability.
- known_unknowns:
  - Whether stale view keeps the correct active session/team-member subscription after return.
  - Whether WS events arrive for the Teams member identity while stale.
  - Whether store state updates while selectors/rendering stay pinned to an old key.
  - Whether click-through forces canonical agent session identity, refetch, or both.
- recommended_next_step: Probe C1 first by tracing active chat view subscription lifecycle across initial open, switch away, return, incoming update, and click-through repair.
- primary_suspected_loop: desktop page/component active session key -> desktop store subscription/selector -> desktop API/WS update ingestion -> component render.
- primary_candidate: C1 desktop subscription lifecycle break.
- contrarian_candidate: C3 server WS/session targeting break.
- top_candidates: C1, C2, C3, C4, C5.

## Transition Memo

- first_candidate_to_test: C1
- why_first: Symptom is navigation-sensitive; switching away/back preserves staleness, while Teams member click repairs the view by navigating to the corresponding agent session.
- evidence_unlock: If stale view lacks or holds the wrong active subscription, C1 becomes lead fix lane; if correct subscription receives updates, move to C2/C3.
- carry_forward_notes:
  - Record identifiers used by Teams member view and canonical agent session view.
  - Treat click-through as control state because it makes latest history appear.
  - Do not assume server fault until desktop subscription and store identity are falsified.

## Investigation Contract

- primary_candidate_id: C1
- candidate_queue: C1 -> C2 -> C3 -> C4 -> C5
- truth_ownership_map_prompt: Identify owning truth for active team member id, canonical agent session id, selected chat id, store conversation cache, and rendered message list.
- control_state_prompt: Working path is click Teams member box above chat -> navigate to corresponding agent session -> latest history/live refresh visible.
- observation_state_prompt: Failing path is open Teams member agent session -> switch to another session -> return -> wait/generate chat history -> stale render.
- closed_loop_prompt: For failing/control paths, connect event delivery, store mutation, selector output, and rendered message count/timestamps.
- related_risk_targets:
  - Duplicate session identifiers between Teams member projection and canonical agent session.
  - Unsubscribe cleanup on route/session switch.
  - Selector memoization keyed by stale route params.
  - Cache/refetch policy that only refreshes on explicit navigation.
  - WS channel subscription bound to previous session.
- evidence_lanes:
  - Desktop lifecycle lane: page/component mount, route param changes, subscribe/unsubscribe calls.
  - Store lane: active id, cache key, message array mutation, selector recomputation.
  - Transport lane: WS event identity, delivery timing, handler dispatch.
  - Fetch lane: API refetch trigger on open/return/click-through.
  - Projection lane: Teams member session vs canonical agent session persistence identity.
- acceptance_checks:
  - C1 accepted only if stale state correlates with missing/wrong subscription after return.
  - C1 falsified if correct-session subscription remains active and receives updates while stale.
  - C2 accepted only if store has fresh correct-key data but component reads stale/wrong cache.
  - C3 accepted only if expected events are not delivered or are delivered under mismatched identity.
  - No fix lane starts until one candidate has direct evidence and at least one neighboring candidate is checked.

## Log Investigation Plan

- existing_log_targets:
  - desktop route/session selection changes.
  - desktop store subscription registration and cleanup.
  - desktop store message cache keys and update timestamps.
  - desktop API chat-history fetch calls and cache/refetch decisions.
  - server WS event emit/receive records with session/team identifiers.
  - server service records for team member to canonical agent session mapping.
- candidate_signal_mapping:
  - C1: component/page lifecycle, store subscribe/unsubscribe, active session id changes; look for missing restored subscription or click-through creating a correct subscription.
  - C2: store selectors, message cache keys, rendered message props; look for fresh messages under correct id while selector/render uses stale key.
  - C3: server WS emit, desktop WS receive/dispatch, session/team payloads; look for events emitted only under canonical id or stopping after switch/return.
  - C4: desktop API fetch and cache/refetch policy; look for stale cache on return and fetch on click-through.
  - C5: server service projection mapping and persisted records; look for team projection and canonical session reading different records.
- observability_sufficiency_rule: Evidence is sufficient when one failing path and one repaired control path show the same identifiers across route, store, fetch/WS, and render boundaries, or expose the exact boundary where they diverge.
- escalation_guidance: If desktop lifecycle/store evidence is inconclusive, dispatch a narrow server WS identity probe for C3 before deeper agent projection behavior for C5.

## Verification

- RED: `cd desktop && bun run test -- ActiveSession.test.tsx` failed as expected on the new test `refreshes a member transcript and resumes polling when returning to an open member tab`; `refreshMemberSession` had 0 calls.
- GREEN: same focused command passed 12 tests after adding the member-tab activation effect.
- desktop_gate: `bun run check:desktop` passed with 89 test files, 638 tests, TypeScript no-emit, and production desktop build.
- full_verify: attempted with `bun run verify`; command exceeded the 20 minute tool timeout. The generated run directory is `artifacts/quality-runs/2026-05-17T12-01-07-807Z/`.
- full_verify_blocker: latest generated server lane log `artifacts/quality-runs/2026-05-17T12-01-07-807Z/logs/server-checks.log` ended with `check:server` failing: 736 pass, 3 skip, 29 fail, 9 errors across 77 files. The first failure was `Adapters API > writes adapter credentials with owner-only permissions`, expecting `0o600` and receiving `0o666`. This is outside the localized desktop member-tab activation fix.
- human_verify: passed; reporter confirmed the issue no longer reproduces in the desktop Teams member transcript flow.

## Fix Scope

- fix_scope: control-boundary
- files_changed:
  - `desktop/src/pages/ActiveSession.tsx`
  - `desktop/src/pages/ActiveSession.test.tsx`
- workflow_artifacts_changed:
  - `.planning/debug/teams-member-chat-refresh-stale.md`
  - `.specify/project-cognition/status.json`
- behavior_change: When an already-open member tab becomes active, `ActiveSession` now refreshes that member transcript and starts member polling, matching the behavior users previously got only by clicking the Teams member row.
- loop_restoration_proof: active member tab -> `refreshMemberSession(activeTabId)` -> `startMemberPolling(activeTabId)` -> `chatStore.sessions[memberTabId].messages` can update -> `MessageList` renders fresh transcript.
- related_risk_review:
  - Regular sessions still use `connectToSession` and CLI task polling; member sessions remain excluded from regular session connection/task polling.
  - Server identity split remains an adjacent risk but is not required for this fix because server transcript retrieval already exists.
  - Terminal/completed member polling behavior remains controlled by `teamStore.startMemberPolling`.
