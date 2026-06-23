---
id: 20260612
slug: remove-builtin-workflows
title: Remove builtin workflow templates from product surface
status: completed
trigger: "$sp-quick 这个内置的workflow不要了吧 因为内置这个东西不太好去定制，统一是自己创建或者导入别人的"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: native-subagents
created: 2026-06-12T16:11:00+08:00
updated: 2026-06-12T17:07:58+08:00
---

## Current Focus

goal: Remove builtin workflow template availability so workflows come from user creation or import.
current_focus: Completed. Builtin workflow template registration and reserved-id behavior were removed from the active product/API surface.
next_action: None for this quick task; see summary and verification notes.

## Execution Intent

intent_outcome: The Workflows product surface no longer exposes builtin workflow templates by default; user-created and imported templates remain the supported path.
intent_constraints:
  - Do not remove user-created workflow templates.
  - Do not remove create/import/export/editor capabilities.
  - Do not change persisted user template compatibility unless live evidence proves it is required.
  - Do not treat git workflow or branch strategy concepts as relevant.
success_evidence:
  - A focused RED test proves builtin templates are no longer expected.
  - Server workflow template registry/API tests pass.
  - Desktop workflow component tests pass.
  - Typecheck passes for touched desktop/server surfaces.
cognition_facts:
  selected_capability: concept:GEN-20260610T112843.959253900Z:N-030 as weak coverage-gap route for workflow template paths.
  minimal_reads:
    - src/server/services/workflowTemplateRegistryService.ts
    - src/server/services/workflowTemplateRegistryService.test.ts
    - src/server/api/workflowTemplates.ts
    - desktop/src/components/workflow/WorkflowTemplateManager.tsx
    - desktop/src/components/workflow/WorkflowTemplatePicker.tsx
    - desktop/src/components/workflow/WorkflowStartDialog.tsx
    - desktop/src/components/workflow/WorkflowComponents.test.tsx
    - desktop/src/api/sessions.ts
    - desktop/src/types/session.ts
    - desktop/src/i18n/locales/en.ts
    - desktop/src/i18n/locales/zh.ts
  validation_route: focused server registry/API tests, desktop workflow component tests, and relevant typecheck.
  known_risk: Cognition readiness is review/partial_refresh and the selected concept is broad; live code must prove ownership and propagation.

## Understanding Checkpoint

confirmed_problem: User wants the default builtin workflow template removed because builtin workflows are hard to customize; workflows should be created by the user or imported from others.
confirmed_outcome: Stop registering/displaying the builtin Agent Development workflow as an available template, while keeping user-created and imported workflows as the primary supported path.
confirmed_scope_boundary:
  - Do not remove create/import/export/editor support.
  - Do not delete or migrate user workflow config.
  - Do not remove legacy `builtin` source recognition from all types/protocols unless live validation proves it is safe; old workflow sessions/import conflict handling should not break in this quick task.
confirmed_execution_approach:
  - Add/update focused tests first to expect no builtin template in registry/list UI/start picker.
  - Change the registry/API surface so default list results come only from user config.
  - Update desktop workflow tests/copy expectations that currently assume the builtin Agent Development preset exists.
confirmed_validation:
  - Run focused server workflow template registry/API tests.
  - Run desktop workflow component tests.
  - Run relevant typecheck/lint if production TS surfaces change.

## Execution

active_lane: completed remove-builtin-workflows via native subagent 019ebaec-fb1f-7ef1-a771-828906b2790c plus leader integration/validation
join_point: worker handoff integrated, validation completed, closeout recorded
files_or_surfaces: server workflow template registry/API, desktop workflow template management/start picker/import-create surfaces, same-area tests, locales if copy changes are needed
blocked_dispatch: none; native subagent dispatch available
blockers: none
recovery_action: If native subagents are unavailable, record subagent-blocked and proceed only if a safe leader-inline fallback is justified by current tools.
retry_attempts: 0
blocker_reason:

## Validation

planned_checks:
  - focused failing test before production edits
  - server workflow template registry/API tests
  - desktop workflow component tests
  - relevant typecheck
completed_checks:
  - native subagent dispatch created: 019ebaec-fb1f-7ef1-a771-828906b2790c
  - native subagent handoff received and closed
  - focused server tests: `bun test src/server/services/workflowTemplateRegistryService.test.ts src/server/__tests__/workflowTemplates.test.ts src/server/services/workflowTemplateAuthoringGuide.test.ts src/server/services/workflowTemplateAuthoringService.test.ts scripts/quality-gate/workflow-session-mode-smoke.test.ts` -> 118 pass
  - focused session API tests: `bun test src/server/__tests__/sessions.test.ts` -> 146 pass
  - focused desktop workflow tests: `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx src/pages/EmptySession.test.tsx src/api/sessions.test.ts` -> 90 pass across 3 files
  - desktop lint/typecheck: `cd desktop; bun run lint` -> pass
  - server check: `bun run check:server` -> 1161 pass, 7 skip
  - desktop check: `bun run check:desktop` -> 98 files passed, 861 tests passed, typecheck and Vite build pass
  - narrow diff whitespace check for touched files: `git diff --check -- <touched workflow files>` -> only existing Windows LF/CRLF conversion warnings
  - project cognition inline update: `project-cognition update --payload-file .specify/project-cognition/updates/20260612-remove-builtin-workflows.json --reason workflow-finalize --format json` -> result_state `partial_refresh`, readiness `review`, update_id `upd-20260612T090909.451923900Z`

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason:
affected_objects:
  - builtin workflow template source
  - workflow template registry/list API
  - desktop Settings > Workflows template manager
  - workflow start template picker/dialog
  - user-created and imported workflow templates
state_behavior_matrix:
  - builtin template source -> should not appear as an available template.
  - user-created/imported templates -> remain available, editable, exportable, deletable, and startable when valid.
  - empty template list -> creation/import remains the intended path.
dependency_impact:
  - workflow registry/API -> list/get behavior may need to stop returning builtin templates while preserving user template contracts.
  - desktop UI/tests -> copy and expectations may need to stop advertising builtin templates.
  - imports -> remain the supported way to reuse other people's workflows.
recovery_and_validation:
  - Revert is localized to registry/UI/test changes if validation fails.
  - Tests must prove user templates still work and builtin templates are absent.
project_cognition_evidence:
  - readiness review/partial_refresh; minimal live reads recorded above.
  - live read: `WorkflowTemplateRegistryService.loadTemplates()` currently always starts from `cloneTemplate(builtinTemplate)`.
  - live read: desktop workflow manager/start picker render API-returned templates and tests currently assert builtin Agent Development visibility.
  - closeout update: `upd-20260612T090909.451923900Z` recorded this quick task's changed paths; result_state is `partial_refresh` and readiness remains `review`.
coverage_gaps:
  - Exact builtin owner path must be confirmed by live source reads before implementation.
consequence_obligations:
  - CA-001: Remove builtin workflow availability without breaking user-created/imported template CRUD/start behavior; owner sp-quick; latest resolve phase implementation validation; status resolved by server/desktop checks.
  - CA-002: Release former builtin workflow ids for normal user/imported templates while preserving legacy builtin source recognition; owner sp-quick; latest resolve phase integration review; status resolved by registry/API/authoring/smoke tests.
escalation_decision: stay quick unless live reads show broad migration or compatibility impact.

## Summary Pointer

summary_path: .planning/quick/20260612-remove-builtin-workflows/SUMMARY.md
resume_decision: complete
