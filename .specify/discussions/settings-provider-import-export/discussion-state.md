# Discussion State: Settings Provider Import Export

## Current Command

- active_command: sp-discussion
- state_surface: discussion-state
- status: handoff-ready
- slug: settings-provider-import-export
- updated_at: 2026-06-10T13:58:44.8314216+08:00

## Phase Mode

- phase_mode: discussion-only
- summary: User wants Settings > Providers to support import/export so provider configuration can be shared with other people. This is a new discussion, separate from prior Workflows discussions. Confirmed product decisions: users may choose whether to export API keys/secrets; secret-free export remains default; secret-including export must be a separate dangerous action with warning, second confirmation, clear artifact labeling, and no remembered preference; import conflicts default to add/rename and overwrite requires explicit selection; active/default provider selection is not exported or imported. Import should preview, validate, diagnose conflicts, and let the user confirm selected resolutions before committing.

## Session Routing

- current_stage: handoff-ready
- current_topic: Settings provider import/export
- next_question: none
- blocker_reason: none
- readiness_note: User confirmed the self-reviewed handoff pair. Discussion is handoff-ready for later sp-specify input; sp-specify was not run automatically.
- ui_discussion_status: deferred

## Lightweight Recovery

- latest_event_checkpoint: 2026-06-10T13:58:44.8314216+08:00
- last_compaction_checkpoint: none
- compact_summary_status: current
- ordinary_turn_write_policy: append compact event only
- structured_refresh_policy: semantic-checkpoint-only

## Context Boundary

- context_boundary_status: locked
- current_project_root: F:\github\cc-jiangxia
- current_project_roles:
  - role: discussion-host
    scope: Store the product/technical discussion artifacts for this new provider import/export idea.
    evidence_source: user confirmation "新需求" and current working directory.
    notes: The prior incomplete discussions are handoff-ready Workflows discussions and are not the target.
  - role: implementation-target
    scope: Desktop Settings > Providers UI, desktop provider API/store/types, server provider REST API/service/types, cc-jiangxia provider persistence and managed settings sync.
    evidence_source: live repository reads.
    notes: No cross-project transfer was requested.
- target_project_root: F:\github\cc-jiangxia
- target_project_roles:
  - role: implementation-target
    scope: Add provider import/export capability for the current app's Settings provider surface.
    evidence_source: user request plus live repository reads.
    notes: Sharing is intended for other people, so exported data boundaries matter.
- reference_sources:
  - active repository live files
  - existing workflow import/export UI as an internal pattern reference
- external_systems: []
- boundary_blockers: []
- path_status: target-read-confirmed
- boundary_confidence: high

## Evidence Navigation

- latest_cognition_intent: discussion
- latest_cognition_readiness: blocked
- latest_minimal_live_reads:
  - desktop/src/api/providers.ts
  - desktop/src/stores/providerStore.ts
  - desktop/src/types/provider.ts
  - desktop/src/pages/Settings.tsx
  - desktop/src/lib/providerSettingsJson.ts
  - desktop/src/lib/__tests__/providerSettingsJson.test.ts
  - desktop/src/components/workflow/WorkflowImportExportDialog.tsx
  - src/server/api/providers.ts
  - src/server/services/providerService.ts
  - src/server/types/provider.ts
  - src/server/__tests__/providers.test.ts
- latest_live_evidence:
  - desktop/src/pages/Settings.tsx renders Settings with a providers tab as the default tab and a ProviderSettings surface for listing, creating, editing, testing, activating, and deleting providers.
  - desktop/src/api/providers.ts exposes list, presets, auth-status, get/update settings, create, update, delete, activate, activate official, test saved provider, and test unsaved config. It has no provider import/export API wrapper today.
  - desktop/src/stores/providerStore.ts wraps provider CRUD/test/activation and refreshes connected sessions when an updated provider affects runtime selection.
  - desktop/src/types/provider.ts models SavedProvider with id, presetId, name, apiKey, authStrategy, baseUrl, apiFormat, model mappings, optional autoCompactWindow, optional modelContextWindows, and optional notes. The inline comment says apiKey is masked from server, but server tests currently expect list responses to include the raw apiKey.
  - src/server/api/providers.ts lists current provider REST routes and has no import/export/preview route today.
  - src/server/services/providerService.ts stores providers in the cc-jiangxia app config providers index, writes active provider env into cc-jiangxia managed settings, blocks deletion of active providers, preserves non-provider settings env when syncing, and uses generated IDs for new providers.
  - src/server/types/provider.ts defines validation schemas for saved, create, update, and test provider inputs; no import/export payload schema exists today.
  - desktop/src/lib/providerSettingsJson.ts masks Anthropic secret env vars in Settings JSON, restores placeholders from previous values or form API key, and strips provider-managed env keys before preview merge.
  - desktop/src/lib/__tests__/providerSettingsJson.test.ts covers masking both Anthropic secret env vars, restoring masked values, and stripping provider-managed env vars.
  - desktop/src/components/workflow/WorkflowImportExportDialog.tsx provides a useful in-app pattern for JSON paste/export, preview before commit, conflict resolution, diagnostics, selected exports, and privacy notes.
  - src/server/__tests__/providers.test.ts covers provider CRUD, activation sync, active-provider delete conflict, settings preservation, malformed settings recovery, auth strategy behavior, and proxy-provider auth behavior.
- cognition_authority_rule: project cognition navigates; live repository evidence proves
- unresolved_evidence_conflicts:
  - desktop/src/types/provider.ts says apiKey is masked from server, while src/server/__tests__/providers.test.ts expects GET /api/providers to expose raw apiKey. This must be resolved before designing a safe export surface.

## Truth Pass

- verified_project_facts:
  - Provider import/export is not currently exposed by the provider API/client/store.
  - Provider data includes security-sensitive credentials and active-provider state.
  - The project already has JSON masking helpers and tests for provider-related settings JSON.
  - Workflow import/export already uses preview/diagnostics/commit and is a close UI interaction precedent.
- open_assumptions:
  - Users primarily want to share reusable provider setup, and some users also want an explicit way to share credentials.
  - Imported provider IDs should generally be regenerated unless an overwrite is explicitly chosen.
  - Export should support one, selected, or all custom providers; official login state should not be exported.
- evidence_checked:
  - .specify/project-cognition/status.json
  - project-cognition lexicon command, which failed because the cognition database is missing
  - repository searches for provider/settings/import/export
  - live files listed in latest_minimal_live_reads
- advice_confidence: medium

## Session Selection

- incomplete_statuses: active, blocked, handoff-ready
- resume_rule: resume only when exactly one incomplete discussion is available or the user selected a slug
- collision_rule: append date or short numeric suffix when a generated slug already exists

## Handoff Assessment

- handoff_assessment_status: ready-for-specify
- handoff_assessment_path: .specify/discussions/settings-provider-import-export/handoff-assessment.md
- handoff_assessment_decided_at: 2026-06-10T13:51:52.7189300+08:00
- handoff_scope_shape: unified

## Handoff Review

- handoff_review_status: user-confirmed
- handoff_user_confirmed_at: 2026-06-10T13:58:44.8314216+08:00
- handoff_blocker_reason: none
- handoff_quality_gate: user_confirmed

## Discussion Compass

- discussion_compass_status: current
- current_decision_frame: Define a provider configuration sharing feature for Settings > Providers without leaking secrets or corrupting active runtime settings.
- confirmed_decisions:
  - This is a new requirement, not a continuation of the prior Workflows discussions.
  - The target is the active cc-jiangxia repository.
  - The user wants configurations usable by other people.
  - Users may choose whether to include API keys/secrets in exported provider bundles.
  - Secret-including export uses the recommended protection: separate dangerous action, warning, second confirmation, clear artifact labeling, and no remembered choice.
  - Import conflicts default to add/rename; overwrite requires explicit user selection.
  - Active/default provider selection is not exported or imported.
- changed_recommendations:
  - Initial product idea matured from generic import/export to a provider bundle with preview, validation, conflict handling, and secret policy.
- current_recommended_direction: Build provider-record import/export with secret-free export as the default, a separate high-friction secret export path, explicit import preview, conflict handling, and no active/default provider transfer.
- next_discussion_paths:
  - Optional UI discussion for toolbar placement, dialog states, and warning copy.

## Allowed Artifact Writes

- discussion-state.md
- discussion-log.md
- requirements.md
- technical-options.md
- project-context.md
- open-questions.md
- handoff-assessment.md only after explicit user request
- handoff-to-specify.md draft after explicit user request and boundary lock; mark handoff-ready only after self-review pass and user confirmation
- handoff-to-specify.json draft after explicit user request and boundary lock; mark handoff-ready only after self-review pass and user confirmation

## Forbidden Actions

- create feature branch
- create feature directory
- write spec.md
- write plan.md
- write tasks.md
- edit source code
- edit tests
- run implementation-oriented fix loops
- automatically invoke sp-specify
- infer handoff readiness without explicit user instruction
- add, recommend, or route to sp-split
- write separate split planning artifacts
- write candidate-specific handoff Markdown or JSON
- write pointer-only handoff-to-specify.md or handoff-to-specify.json
- use current project cognition to prove another project's implementation facts

## Authoritative Files

- discussion-state.md
- discussion-log.md
- requirements.md
- technical-options.md
- project-context.md
- open-questions.md
- handoff-assessment.md when present
- handoff-to-specify.md when draft or user-confirmed, according to handoff_review_status
- handoff-to-specify.json when draft or user-confirmed, according to handoff_review_status

## Senior Consequence Analysis

- consequence_gate_status: triggered
- trigger_reason: Provider import/export can expose API keys by explicit user choice, mutate provider persistence, change active-provider runtime env, affect connected or future sessions, collide with existing provider IDs/names, and interact with managed settings preservation.
- stand_down_reason: none
- active_consequence_obligations:
  - CA-001
  - CA-002
  - CA-003
  - CA-004
  - CA-005
  - CA-006
  - CA-007
- latest_consequence_handoff: .specify/discussions/settings-provider-import-export/handoff-to-specify.md
- coverage_gap_count: 2

## Handoff

- handoff_to_specify: .specify/discussions/settings-provider-import-export/handoff-to-specify.md
- handoff_to_specify_json: .specify/discussions/settings-provider-import-export/handoff-to-specify.json
- handoff_goal: Specify Settings > Providers import/export for shareable provider configuration bundles, including optional high-friction secret export, previewed import with conflict handling, and no active/default provider transfer.
- quality_gate_status: user_confirmed
- handoff_requested_by_user: true
- next_command: /sp.specify with .specify/discussions/settings-provider-import-export/handoff-to-specify.md when the user explicitly requests it
