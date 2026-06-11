# Debug Session: Provider Model Tier Selector

## Status

- state: awaiting_human_verify
- issue: In the desktop chat model selector, a configured `mimo-v2.5-pro[1m]` provider model appears as one selectable row, while the row hints mention Haiku/Sonnet/Opus tiers and the user expects a way to switch tiers.
- reporter_context: Screenshot shows the bottom chat composer model dropdown with providers `Haiku 4.5`, `GLM-5`, `deepseek-v4-pro`, `deepseek-v4-flash`, and `mimo-v2.5-pro[1m]`; each row may display tier hint text such as `Haiku 模型 · Sonnet 模型 · Opus 模型`.
- derived_followups:
  - .planning/debug/provider-context-window-200k.md
- stage: Stage 2 Evidence Investigation
- execution_model: leader-inline
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- dispatch_reason: Small focused investigation: one visible desktop UI picker plus provider/model config mapping chain.
- blocked_reason: none

## Intake Gates

- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- skip_observer_reason: map-backed-minimum-intake-with-live-evidence-gap
- legacy_session_needs_reintake: false

## Project Cognition Intake

- lexicon_generation_id: GEN-20260528T034105.715065300Z
- readiness: review
- freshness: partial_refresh
- selected_concepts: none
- rejected_concepts: API Service Layer, Adapter WebSocket Bridge, Agent/Desktop docs, AgentTool, analytics, attachment, autodream, built-in agents, compaction, desktop release assets.
- concept_decisions: Lexicon candidates were adjacent or incidental; none directly owned desktop provider model picker behavior.
- route_pack: `desktop/src`, `src/services`, `src/server`
- minimal_live_reads: project cognition returned a broad path set. Use targeted live reads within `desktop/src` first; expand to server/provider runtime only if UI/config evidence cannot explain the symptom.
- coverage_gaps: No graph candidate directly matched provider settings, model aliases, or chat composer model dropdown. Cognition is advisory only; code evidence must prove behavior.

## Map-Backed Minimum Intake

- symptom_anchor: Configured provider model rows expose one visible provider model row, while hint text suggests multiple tier aliases.
- primary_candidate: Desktop model selector builds one option per configured provider model and treats Haiku/Sonnet/Opus as descriptive capability labels, not selectable variants.
- contrarian_candidate: Provider settings stores only one model entry for mimo, so the selector is correctly reflecting configuration and the missing switch is a product semantics/configuration question rather than a UI bug.
- recommended_first_probe: Locate the model selector and provider settings model types; inspect how row options and tier labels are derived.
- candidate_separating_signals:
  - If tier labels are hard-coded descriptive hints while selected value is provider model ID, the dropdown cannot switch tiers without separate configured aliases.
  - If config schema supports per-tier variants but selector collapses them, it is a UI projection bug.
  - If backend request takes a single `model` string only, tier switching must map to distinct model IDs before request submission.
- nearest_neighbor_related_risk_target: Chat submission and persisted session model selection must keep using the selected provider/model value without breaking existing provider configs.

## Senior Consequence Analysis

### Affected Object Map

- desktop chat composer model dropdown: visible selection surface.
- provider settings model definitions: control-state source for available provider/model rows.
- selected model state: control-state value sent with chat/workflow requests.
- provider request payload: downstream consumer of the chosen model ID.
- persisted UI/session state: may cache selected model across sessions.
- tests for desktop settings/chat/model selection: regression surface.

### State-Behavior Matrix

- created provider config: configured models should become selectable.
- selected model: selector should show the chosen provider/model and request payload should use it.
- missing model/tier: UI should not imply an unavailable selectable variant unless it is configured or explicitly mapped.
- stale persisted selection: if selected model no longer exists, UI should fall back predictably.
- completed/running sessions: unrelated to this issue unless model choice is persisted per session.

### Dependency Impact Table

- Direct dependency: provider settings -> selector option list.
- Indirect consumer: chat/session request payload uses selected model identifier.
- Shared state: local/provider config and selected model UI store.
- Compatibility surface: existing custom provider model IDs must remain selectable as-is.
- Validation route: focused unit/component tests for option derivation and selected model behavior; desktop check if production UI changes.

### Recovery And Validation Contract

- Add a regression test before production changes if the root cause is a behavior bug.
- Keep model IDs backward compatible; do not rewrite user-owned provider config.
- Verify the selector shows each intended selectable choice and request state still carries the correct model ID.
- Run scoped desktop tests before asking for human verification.

### Coverage Gaps

- CG-001: Need live code evidence for whether Haiku/Sonnet/Opus are selectable tiers or only hint labels. Owner: current debug workflow. Latest resolve phase: before fixing. Routing: continue with scoped live reads.
- CG-002: Need live code evidence for whether provider settings supports aliases or only raw model entries. Owner: current debug workflow. Latest resolve phase: before fixing. Routing: continue with scoped live reads.

### Consequence Obligations

- CA-001: Preserve custom provider model IDs when modifying the selector. Affected objects: provider config, selected model state, request payload. Owner workflow: sp-debug. Latest resolve phase: verify. Status: open. Stop-and-reopen condition: tests or code show selected model ID is transformed incorrectly.
- CA-002: Do not present non-selectable tier labels as if they are selectable alternatives. Affected objects: dropdown UI and provider settings semantics. Owner workflow: sp-debug. Latest resolve phase: fix. Status: open. Stop-and-reopen condition: UI still implies unavailable tiers after fix or explanation.

## Truth Ownership Map

- Decision truth owner: provider settings/model catalog and chat composer selected model state.
- Reflection/cache layers: dropdown rows, subtitles, and local selected label rendering.
- Downstream consumers: chat/session request payloads and provider runtime.
- Evidence needed: source-level route from provider config to selector options to request payload.

## Control And Observation State

- Control State: configured provider models, selected provider/model value, request payload model field.
- Observation State: dropdown row labels, subtitles, selected model chip, screenshot-visible provider grouping.
- Expected Closed Loop: provider setting -> available model option derivation -> user selection -> selected model state -> chat request payload -> visible selected chip.

## Investigation Contract

- primary_candidate_id: C1
- candidate_queue:
  - C1: selector is one-row-per-configured-model and tier names are descriptive labels.
  - C2: selector collapses configured tier/alias models into one row.
  - C3: settings UI only configures one model, and users need separate configured model aliases or a clarified provider setup path.
- related_risk_targets:
  - selected model persistence
  - provider request model ID mapping
  - custom model display labels
- first_candidate_to_test: C1
- why_first: The screenshot shows tier names in subtitle text under multiple providers, suggesting they may be row metadata rather than selectable children.
- evidence_unlock:
  - find selector row construction
  - find provider/model config schema
  - find selected model state/request mapping

## Log Investigation Plan

- existing_log_targets: none known from screenshot.
- candidate_signal_mapping:
  - C1: source code has option rows keyed by model ID, with subtitle generated from capability/tier metadata.
  - C2: source code reads multiple configured variants but groups/collapses by provider.
  - C3: settings code saves one model entry, no tier alias schema.
- observability_escalation: if source code cannot resolve whether tiers are intended selectable states, ask the user whether they configured four separate mimo model aliases or one raw model ID.

## Current Focus

Explain confirmed behavior to the user: model selector switches actual model IDs, while `main/haiku/sonnet/opus` are provider mapping roles. Identical model IDs are intentionally merged into one row.

## Evidence

- Project cognition lexicon returned no direct model-selector concept and marked the query as unmapped.
- Project cognition query returned readiness `review`, baseline freshness `partial_refresh`, and a broad route pack across `desktop/src`, `src/services`, and `src/server`; this is not sufficient as proof, so live code evidence is required.
- `desktop/src/components/controls/ModelSelector.tsx` builds provider runtime rows from `provider.models.main`, `provider.models.haiku`, `provider.models.sonnet`, and `provider.models.opus`, then groups them in a `Map` by trimmed model ID. Duplicate IDs are merged and their role labels are joined into the row description.
- `desktop/src/pages/Settings.tsx` exposes four provider mapping inputs (`main`, `haiku`, `sonnet`, `opus`) and `normalizeModelMapping` fills blank role slots with `main`, so a provider configured with one Mimo model maps every role to the same model ID unless the user enters distinct IDs.
- `src/server/api/models.ts` uses the same unique-model behavior for active provider model lists via `addUniqueModel`; duplicate role model IDs are not exposed as separate selectable models.
- `RuntimeSelection` and chat runtime state carry `{ providerId, modelId }`, not a role slot. Selecting `sonnet` versus `opus` would be indistinguishable when both resolve to the same model ID.
- Official fallback default is `claude-opus-4-7` in `desktop/src/constants/modelCatalog.ts` and `src/server/api/models.ts`; active provider current model falls back to `activeProvider.models.main`, not Haiku, unless persisted settings or provider `main` points at a Haiku model.

## Eliminated

- C2 eliminated: live code does not show a collapse of distinct configured tier IDs; it only merges duplicate actual model IDs.
- C3 refined: this is expected when only one Mimo model ID is configured for all role slots. The UI is model-ID based, not role-slot based.

## Fix Status

- root_cause:
  - summary: The selector displays unique actual model IDs. If the Mimo provider maps `main`, `haiku`, `sonnet`, and `opus` to `mimo-v2.5-pro[1m]`, the dropdown shows one row with all four role labels in the subtitle.
  - owning_layer: provider model mapping plus desktop model selector option derivation.
  - broken_control_state: none confirmed; the behavior matches current data model semantics.
  - failure_mechanism: User expected role-slot switching, but the product currently switches actual model IDs only.
  - loop_break: expectation/observation mismatch at the dropdown UI; no evidence of runtime/provider failure.
  - decisive_signal: `buildProviderModels` and server `buildProviderModelList` both dedupe by model ID.
- fix_scope: no production code change applied; current behavior is explainable from live source evidence.
- changed_code_paths: none
- changed_behavior_surfaces: none
- verification_evidence: none
- project_cognition_refresh: not started

## Verification

- Source evidence confirms provider role mappings are deduped by actual model ID in both desktop selector and server model-list API.
- User-facing verification needed: user should confirm whether they configured distinct Mimo IDs for Haiku/Sonnet/Opus. If not, the one-row selector is expected.
