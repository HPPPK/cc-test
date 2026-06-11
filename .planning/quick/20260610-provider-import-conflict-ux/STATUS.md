---
id: 20260610-provider-import-conflict-ux
slug: provider-import-conflict-ux
title: Provider import conflict UX cleanup
status: resolved
trigger: "$sp-quick [Image #1] 这个导入服务商的交互，感觉呢这个冲突提示不是太好，太具有专业性了，然后就是行为这个UI不是很好看"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: native-subagents
created: 2026-06-10T20:24:00+08:00
updated: 2026-06-10T20:45:00+08:00
---

## Current Focus

goal: Improve the provider import dialog conflict messaging and action selection UI.
current_focus: Provider import conflict UX update is implemented and verified for the desktop surface.
next_action: Final handoff to user.

## Execution Intent

intent_outcome: Replace overly technical import conflict diagnostics and awkward per-provider action controls with a clearer, user-facing import review experience.
intent_constraints:
  - Keep the work scoped to the Settings provider import dialog and related tests/translations.
  - Do not change the provider import data contract or server-side import semantics unless live evidence proves the UI cannot be improved safely without it.
  - Preserve credential safety and explicit user selection before import.
success_evidence:
  - Same-area desktop tests cover the revised conflict text and action UI.
  - Desktop lint/typecheck or `check:desktop` passes.
cognition_facts:
  selected_capability: desktop Settings providers import dialog, weakly covered by project cognition
  minimal_reads:
    - desktop/src/pages/Settings.tsx
    - desktop/src/__tests__/generalSettings.test.tsx
    - desktop/src/i18n/locales/en.ts
    - desktop/src/i18n/locales/zh.ts
    - desktop/src/api/providers.ts
  validation_route: focused Settings provider tests, desktop lint, and check:desktop
  known_risk: project cognition selected a weak workflow concept and reported semantic_intake_partial_facet_coverage; live code confirms the owner paths

## Understanding Checkpoint

confirmed_problem: The provider import preview exposes technical conflict diagnostics and uses an awkward per-row native select for import behavior choices.
confirmed_outcome: The import preview should explain conflicts in user-facing language and present per-candidate import actions with a cleaner explicit UI.
confirmed_scope_boundary:
  - Only change the provider import dialog, same-area tests, and zh/en strings.
  - Do not change import API contracts, server conflict semantics, credential handling, or export dialog behavior.
confirmed_execution_approach:
  - Add a failing same-area test for hiding technical diagnostics and using a friendlier action UI.
  - Update Settings.tsx and locale strings to match the confirmed UX.
confirmed_validation:
  - Focused Providers Settings test.
  - Desktop lint.
  - check:desktop when the focused loop is green.

## Execution

active_lane: import-dialog-ux
join_point: closed
files_or_surfaces: desktop Settings provider import dialog, provider import tests, zh/en translations
blocked_dispatch: none
blockers: none
recovery_action: none
retry_attempts: 0
blocker_reason: none

## Validation

planned_checks:
  - cd desktop; bun run test -- --run src/__tests__/generalSettings.test.tsx -t "Settings > Providers tab"
  - cd desktop; bun run lint
  - bun run check:desktop
completed_checks:
  - worker: cd desktop; bun run test -- --run src/__tests__/generalSettings.test.tsx -t "Settings > Providers tab" -> passed, 17 passed / 37 skipped
  - worker: cd desktop; bun run lint -> passed
  - leader: cd desktop; bun run test -- --run src/__tests__/generalSettings.test.tsx -t "Settings > Providers tab" -> passed, 17 passed / 37 skipped
  - leader: cd desktop; bun run lint -> passed
  - leader: cd desktop; bun run test -- --run src/__tests__/generalSettings.test.tsx -> passed, 54 passed with pre-existing GeneralSettings act warnings
  - leader: bun run check:desktop -> passed, 98 test files and 853 tests passed; production build passed
  - leader: git diff --check for touched files and quick status -> passed
  - leader: Invoke-WebRequest http://127.0.0.1:5173/ -> 200
  - project cognition update -> partial_refresh, readiness review, update id upd-20260610T124434.718378000Z

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason: n/a
affected_objects:
  - desktop Settings provider import modal
  - import preview conflict diagnostics shown to users
  - per-provider import action selection controls
  - provider import tests and i18n strings
state_behavior_matrix:
  - no JSON pasted -> import preview remains unavailable
  - valid JSON previewed without conflicts -> clear candidate list and straightforward import action
  - valid JSON previewed with conflicts -> user-facing conflict message explains duplicate provider and available action
  - selected/imported -> import still uses existing preview and selected action semantics
dependency_impact:
  - desktop/src/pages/Settings.tsx -> primary UI owner
  - desktop/src/api/providers.ts -> expected to remain contract-compatible unless evidence says otherwise
  - desktop/src/__tests__/generalSettings.test.tsx -> same-area regression surface
  - desktop/src/i18n/locales/en.ts and zh.ts -> user-facing copy
recovery_and_validation:
  - rollback by reverting the scoped UI/test/translation edits
  - validate with focused provider Settings tests, lint, and desktop gate
project_cognition_evidence:
  - lexicon readiness review; precise import-dialog concept not found
  - query readiness review; returned minimal live reads included Settings.tsx, provider API, generalSettings tests, and zh/en locale files
  - live reads found ProviderImportDialog and ProviderImportPreviewPanel in desktop/src/pages/Settings.tsx
  - live reads found current diagnostics list rendering severity/code/path/message and raw conflict reason
coverage_gaps:
  - project cognition selected an unrelated workflow concept; live repository evidence must remain the source for owner and validation claims
consequence_obligations:
  - CA-001 claim: conflict diagnostics must become user-facing without hiding import conflict semantics; owner workflow sp-quick; latest resolve phase validation; status resolved by UI copy and regression test; stop-and-reopen if import API semantics need to change
  - CA-002 claim: action selection UI must remain explicit per candidate and accessible; owner workflow sp-quick; latest resolve phase validation; status resolved by action buttons and regression test; stop-and-reopen if test surface cannot exercise the control
escalation_decision: stay quick

## Summary Pointer

summary_path: .planning/quick/20260610-provider-import-conflict-ux/SUMMARY.md
resume_decision: resolved
