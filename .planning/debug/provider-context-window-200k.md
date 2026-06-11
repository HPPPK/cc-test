# Debug Session: Provider Context Window 200K

## Status

- state: awaiting_human_verify
- parent_session: .planning/debug/provider-model-tier-selector.md
- relationship_to_parent: derived_issue
- issue: Selected Mimo model is expected to have 1M context, but the chat/context usage UI reports 200000 and says the context is full.
- reporter_context: User reports the model is `1m` context after selecting/configuring Mimo, but the chat window treats it as 200000.
- stage: Stage 5 Verified Fix
- execution_model: leader-inline
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- dispatch_reason: Focused investigation: context window ownership likely follows one model/context metadata chain from provider settings to context usage UI/server.
- blocked_reason: none

## Intake Gates

- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- skip_observer_reason: map-backed-minimum-intake
- legacy_session_needs_reintake: false

## Project Cognition Intake

- lexicon_generation_id: GEN-20260528T034105.715065300Z
- readiness: review
- freshness: partial_refresh
- selected_concepts:
  - concept:GEN-20260528T034105.715065300Z:node.compaction
  - concept:GEN-20260528T034105.715065300Z:node.services.api
- rejected_concepts: Adapter WebSocket Bridge, Agent/Desktop docs, AgentTool, analytics, attachment, autodream, built-in agents, desktop release assets.
- route_pack: `desktop/src/components/chat`, `desktop/src/pages/Settings.tsx`, `desktop/src/stores/providerStore.ts`, `src/utils`, `src/server`, `src/services/compact`
- minimal_live_reads:
  - desktop/src/components/chat
  - desktop/src/pages/Settings.tsx
  - desktop/src/stores/providerStore.ts
  - src/utils
  - src/server
  - src/services/compact
  - src/services/compact/compact.ts
  - src/services/api/claude.ts
- coverage_gaps: No exact graph concept for context usage indicator or provider-specific model context metadata; live code must prove the failure mechanism.

## Map-Backed Minimum Intake

- symptom_anchor: Context usage thinks selected model has 200000 tokens, while configured/expected Mimo model has 1M tokens.
- primary_candidate: Context usage computes context window from model ID using a built-in fallback/heuristic and does not consume provider-specific `modelContextWindows` for runtime selections.
- contrarian_candidate: Provider settings did not save the Mimo model context window, so 200000 is the documented fallback for unknown models.
- recommended_first_probe: Locate ContextUsageIndicator/API and model context window utility; trace whether selected provider runtime and provider `modelContextWindows` reach the response.
- candidate_separating_signals:
  - If code never passes provider context windows into context usage, it is a projection/control-boundary bug.
  - If provider config lacks `modelContextWindows` for `mimo-v2.5-pro[1m]`, UI is correctly using fallback and user needs to set context window.
  - If model ID parsing drops `[1m]` or brackets and misses a context mapping, fix lookup normalization.
- nearest_neighbor_related_risk_target: Auto-compact/full-context warnings and context progress must not over-trigger for custom 1M provider models.

## Senior Consequence Analysis

### Affected Object Map

- provider model mapping and `modelContextWindows`: authoritative configured model window.
- selected runtime model: provider/model identity used by the current chat session.
- context usage endpoint/service: computes token usage and max context window.
- desktop ContextUsageIndicator: displays max window and full-context warning.
- auto-compact behavior: may use the same context window threshold.
- persisted settings/local state: may store configured context windows and selected runtime.

### State-Behavior Matrix

- created provider config: custom model context window should be available when saved.
- selected runtime model: context usage should use the selected provider/model context window.
- missing context window: unknown custom models may fall back to 200000 and should be explainable.
- stale persisted selection: if selected provider/model changes, context usage should refresh against the new model identity.
- full context: warning should be based on effective window, not fallback when configured window exists.

### Dependency Impact Table

- Direct dependencies: settings provider model windows -> context usage calculation -> UI full warning.
- Indirect consumers: auto-compact, slash inspector, context usage API responses, chat composer warning.
- Shared state: provider config, runtime selection, current model settings.
- Compatibility surfaces: existing custom provider configs and default fallback behavior.
- Validation routes: focused unit/API test for provider model context window lookup; component test if UI request/identity is wrong.

### Recovery And Validation Contract

- Write a failing regression before production changes.
- Preserve fallback 200000 behavior for unknown/unconfigured custom models.
- Verify configured 1M model returns 1000000 in context usage.
- Verify context usage refreshes when selected runtime changes.

### Coverage Gaps

- CG-001: Need live evidence of context usage API shape and how `maxTokens/contextWindow` is computed. Owner: current workflow. Latest resolve phase: before fixing. Routing: continue with scoped live reads.
- CG-002: Need live evidence of whether provider `modelContextWindows` is included in context usage calculation. Owner: current workflow. Latest resolve phase: before fixing. Routing: continue with scoped live reads.

### Consequence Obligations

- CA-001: Context usage must use the effective configured context window for the selected provider/model when one exists. Affected objects: provider config, context usage API/UI, auto-compact warnings. Owner workflow: sp-debug. Latest resolve phase: verify. Status: open. Stop-and-reopen condition: selected custom 1M model still reports 200000 after fix.
- CA-002: Unknown custom models must retain a safe fallback rather than assuming 1M from display text alone. Affected objects: context window utility, provider settings. Owner workflow: sp-debug. Latest resolve phase: verify. Status: open. Stop-and-reopen condition: unconfigured model silently gets inflated window.

## Truth Ownership Map

- Decision truth owner: provider settings `modelContextWindows` for configured custom models; built-in model context utility for known models/fallbacks.
- Reflection/cache layers: ContextUsageIndicator display, context progress bar, full warning.
- Downstream consumers: auto-compact thresholds and context usage/status API consumers.
- Evidence needed: source route from selected runtime model/provider to context window computation.

## Control And Observation State

- Control State: selected `providerId/modelId`, configured model context windows, computed max context window.
- Observation State: UI says `200000`, progress/full state, model label.
- Expected Closed Loop: provider config with 1M window -> runtime model selection -> context usage request/lookup -> max window 1000000 -> UI progress and full warning based on 1M.

## Investigation Contract

- primary_candidate_id: C1
- candidate_queue:
  - C1: context usage ignores provider-specific context window and falls back to 200000.
  - C2: provider settings did not save a 1M window for the Mimo model ID.
  - C3: context window parser/lookup fails on model ID text such as `[1m]`.
- related_risk_targets:
  - auto compact window selection
  - context usage indicator refresh key
  - provider settings context window save/load
- first_candidate_to_test: C1
- why_first: User reports model selected correctly but context window display is wrong; this points to metadata lookup, not selection.
- evidence_unlock:
  - find ContextUsageIndicator request path
  - find server context usage computation
  - find model context window utility/fallback

## Log Investigation Plan

- existing_log_targets: none known.
- candidate_signal_mapping:
  - C1: source code uses generic model ID lookup without provider-specific window map.
  - C2: provider config or settings payload lacks context window entry.
  - C3: lookup normalization strips or mismatches model ID.
- observability_escalation: if source evidence cannot prove saved provider config, ask user to inspect provider edit page context window fields.

## Current Focus

Await human verification in the desktop chat window: after saving the Mimo provider config or reapplying the runtime selection, an idle connected session should restart its CLI runtime and context usage should report the effective 1M window instead of the stale 200000 fallback.

## Evidence

- Project cognition returned readiness `review` and selected only adjacent compaction/API concepts; live code evidence is required.
- `desktop/src/components/chat/ContextUsageIndicator.tsx` fetches `/api/sessions/:id/inspection?includeContext=1&contextOnly=1`; the UI reflects the server/CLI inspection result rather than computing 200000 locally.
- `src/utils/context.ts` resolves model context via `getContextWindowForModel(runtimeModel, getSdkBetas())`; model names containing `[1m]` or `:1m` resolve to 1000000, and otherwise unknown models safely fall back to 200000.
- `src/server/services/providerService.ts` builds `CLAUDE_CODE_MODEL_CONTEXT_WINDOWS` from provider model metadata; a correctly saved 1M provider window can reach the CLI environment on runtime start.
- `desktop/src/stores/providerStore.ts` refreshed idle connected sessions after provider updates, but it resent the same `{ providerId, modelId }` selection.
- `src/server/ws/handler.ts` previously returned early when the new runtime selection matched the previous selection. That skipped CLI restart even when the provider config, context window, base URL, or key changed behind the same model ID.
- RED regression: `bun test src/server/__tests__/websocket-handler.test.ts -t "force-reapplied"` failed before the fix because a `force: true` same-model runtime message did not call `startSession`.
- GREEN regression: the same server test passed after the WebSocket handler honored `force: true`.
- Desktop store regression: `cd desktop; bun run test src/stores/providerStore.test.ts src/stores/chatStore.test.ts` passed with provider updates sending forced runtime refreshes.

## Eliminated

- C1 refined, not primary: context usage does use model/context metadata once the CLI runtime has the right model/env; the failure was stale runtime state after provider config changes.
- C2 retained as an operator check: if the configured model ID lacks `[1m]`, the provider model context window still must be saved as `1000000`.
- C3 eliminated for the reported `[1m]` model: source code recognizes `[1m]` and returns 1000000 on fresh runtime lookup.

## Fix Status

- root_cause:
  - summary: Provider config/context-window changes were not forced through to an already connected chat session when the selected provider/model pair stayed the same.
  - owning_layer: desktop provider update refresh plus server WebSocket runtime override restart logic.
  - broken_control_state: the running CLI child process kept stale runtime environment/state after a provider save.
  - failure_mechanism: `providerStore.updateProvider()` re-sent the same runtime selection, and `handleSetRuntimeConfig()` treated that as no-op, so updated `CLAUDE_CODE_MODEL_CONTEXT_WINDOWS` or a newly saved 1M model configuration did not reach the active CLI runtime. The context usage path could continue reporting the old 200000 window.
  - loop_break: provider settings control state changed, but the runtime process that owns context inspection was not refreshed.
  - decisive_signal: the RED WebSocket regression reproduced the same-model no-op; honoring `force: true` made the CLI restart path execute.
- fix_scope: focused production fix with same-area tests.
- changed_code_paths:
  - `desktop/src/stores/providerStore.ts`
  - `desktop/src/stores/providerStore.test.ts`
  - `desktop/src/stores/chatStore.ts`
  - `desktop/src/stores/chatStore.test.ts`
  - `src/server/ws/events.ts`
  - `src/server/ws/handler.ts`
  - `src/server/__tests__/websocket-handler.test.ts`
- changed_behavior_surfaces:
  - desktop provider update refresh
  - chat runtime WebSocket message shape
  - server runtime override restart behavior
  - provider context-window environment propagation to active CLI sessions
- verification_evidence:
  - `bun test src/server/__tests__/websocket-handler.test.ts -t "force-reapplied"`: RED before fix, GREEN after fix.
  - `bun test src/server/__tests__/websocket-handler.test.ts`: pass, 23 tests.
  - `cd desktop; bun run test src/stores/providerStore.test.ts src/stores/chatStore.test.ts`: pass, 72 tests.
  - `bun run check:server`: blocked by pre-existing expired quarantine review windows before server tests run.
  - `bun run check:desktop`: TypeScript no-emit passed; Vitest failed in unrelated dirty-worktree `src/pages/ActiveSession.test.tsx` because `/complete phase/i` is not rendered.
  - `bun run verify`: not ready, report `artifacts/quality-runs/2026-06-04T04-49-29-138Z/report.md`; passed 3, failed 6, skipped 2. Failures are expired quarantine windows, the unrelated ActiveSession test, and native Cargo `PermissionDenied`.
- project_cognition_refresh:
  - command: `project-cognition.exe update --payload-file .specify/project-cognition/updates/20260604-provider-context-window-runtime-refresh.json --reason workflow-finalize --format json`
  - result: `partial_refresh`
  - readiness: `review`
  - update_id: `upd-20260604T045258.063374800Z`
  - note: Update accepted the changed runtime paths for review, but overall cognition remains stale because the worktree already contains many unrelated stale paths.

## Learning Capture

- command: `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a8f273c8463584b9ef296295fc777783a4ae9096 specify learning capture-auto --command debug --session-file .planning/debug/provider-context-window-200k.md --format json`
- result: failed
- reason: `Invalid debug session file format: Missing YAML frontmatter`
- impact: non-blocking for the code fix; no learning candidate was generated from this session file.

## Human Verification

- Save the Mimo provider config again or reselect/restart the current chat runtime.
- If the current session is busy/streaming, wait until it is idle or start a fresh session; provider saves intentionally refresh only idle connected sessions.
- If the model ID is `mimo-v2.5-pro[1m]`, the fresh runtime should resolve the context window as 1000000. If the ID does not include `[1m]`, the provider model context window field must be saved as `1000000`.
