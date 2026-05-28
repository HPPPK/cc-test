---
status: awaiting_human_verify
created: 2026-05-27T00:00:00+08:00
updated: 2026-05-27T00:00:00+08:00
reported_by: user
symptom: Settings Workflows page renders only the title and subtitle.
execution_model: leader-inline
dispatch_shape: leader-inline
execution_surface: leader-inline
dispatch_reason: Small focused investigation with one visible desktop route, one component subtree, and one API dependency.
blocked_reason: none
causal_map_completed: true
investigation_contract_completed: true
log_investigation_plan_completed: true
observer_framing_completed: true
skip_observer_reason: map-backed-minimum-intake with stale cognition advisory plus live route paths
---

# Debug Session: Settings Workflows Blank

## Current Focus

stage: awaiting_human_verify
classification: same_issue
hypothesis: Fixed in agent verification. Settings Workflows now mounts the manager and Chinese locale localizes the visible Workflows manager/editor surface while preserving raw workflow IDs and API source values.
next_action: Ask user to re-check Settings -> 工作流 in the running desktop window; if English still appears in that surface, classify the remaining text as same issue and inspect that exact component.

## User Report

- User invoked `$sp-debug`.
- User sees Settings -> Workflows show only:
  - `Workflows`
  - `管理工作流模板和分阶段执行契约。`
- The rest of the page is blank.

## Project Cognition Intake

- lexicon readiness: blocked
- query readiness: blocked
- freshness: stale
- recommended_next_action: run_map_update
- selected_concepts: `term:settings`, `term:workflows`, `term:blank`, `term:desktop`
- rejected_concepts: `term:page`
- selection_reason: User reports the newly implemented desktop Settings Workflows page renders only the Workflows header/subtitle; route is bounded to desktop Settings workflow components and the workflow template API they call.
- minimal_live_reads:
  - `desktop/src/pages/Settings.tsx`
  - `desktop/src/components/workflow`
  - `desktop/src/api/sessions.ts`
  - `desktop/src/types/session.ts`
  - `src/server/api/workflowTemplates.ts`
  - `src/server/services/workflowTemplateRegistryService.ts`
- coverage_gap: Project cognition is stale after the recent implementation. Continue with live repository/runtime evidence for this user-visible regression and recommend `$sp-map-update` after the fix.

## Observer Framing

- primary_suspected_loop: Settings tab selection -> Workflows header render -> WorkflowTemplateManager mount -> template API request/state transition -> manager list/actions render.
- primary_candidate: WorkflowTemplateManager runtime exception or import/export contract mismatch prevents the subtree after the header from rendering.
- contrarian_candidate: Data/API returns an empty or malformed state that the component treats as loading/empty without visible fallback, while no exception occurs.
- recommended_first_probe: Inspect existing Tauri/Vite logs and browser console output for errors after opening Settings -> Workflows.
- candidate_separating_signals:
  - render/effect exception in logs confirms component/API contract mismatch.
  - successful API response plus no exception shifts suspicion to conditional rendering or CSS/layout.
  - API 404/500 shifts ownership to server route registration/sidecar base URL.
- nearest_neighbor_related_risk_target: Empty-session and chat Workflows picker use nearby template API/client types and should be smoke-checked if the API contract is changed.

## Consequence Analysis

trigger_status: triggered
trigger_reason: Bug affects user-facing Settings workflow template management, server-owned workflow template API, desktop state, and recently implemented workflow session contracts.

### Affected Object Map

- Desktop Settings `Workflows` tab: user-visible management surface.
- `WorkflowTemplateManager` subtree: list, diagnostics, duplicate/create/import/export actions.
- Desktop workflow template API client: source of template data and mutation calls.
- Server `/api/workflows/templates` routes: truth owner for built-in/user template registry data.
- `~/.claude/cc-jiangxia/workflows.json`: protected user-level registry, server-owned mutation only.
- Tauri sidecar API server: desktop runtime transport.
- Verification consumers: focused desktop component tests, server template API tests, and targeted runtime smoke.

### State-Behavior Matrix

- missing/empty user config: built-in templates should still render; page must not be blank.
- malformed user config: diagnostics should render while built-ins remain visible/startable.
- API unavailable: page should show an actionable error/loading state, not only header text.
- valid API response: manager list/actions should render.
- render exception: page may appear blank after header if an error boundary catches only subtree failure.

### Dependency Impact Table

- Settings tab -> WorkflowTemplateManager -> desktop API client -> Tauri sidecar/server route -> registry service.
- WorkflowTemplateManager changes can affect Settings tests and workflow import/export UI.
- API/client changes can affect chat workflow start dialogs and linked workflow flows.

### Recovery And Validation Contract

- Reproduce with existing runtime/logs before fixing.
- Add or update focused regression coverage that would fail when the manager body disappears after the header.
- Verify Settings Workflows renders manager content and existing workflow template API tests remain green.
- Avoid mutating protected registry files except through existing test fixtures.

### Coverage Gaps

- The exact runtime error is not yet known.
- User environment route state is known only from screenshot/text report; agent must reproduce via logs/tests/browser where possible.

### Consequence Obligations

- DBG-CA-001: Settings Workflows must render a non-blank manager body for missing/empty/malformed user config states. Owner: sp-debug. Latest resolve phase: verification. Stop-and-reopen: header renders but list/actions/error state absent.
- DBG-CA-002: Fix must preserve server-owned workflow template persistence and built-in protection. Owner: sp-debug. Latest resolve phase: verification. Stop-and-reopen: desktop writes registry directly or built-ins become mutable.

## Truth Ownership Map

- Decision truth owner: server workflow template registry/API owns template availability, built-in/user distinction, diagnostics, and mutation permission.
- Reflection/cache layers: desktop API client reflects server payload; WorkflowTemplateManager projects it into UI; Settings tab only selects the subtree.
- Evidence status: pending live log/API/source inspection.

## Control State vs Observation State

- Control State: active settings tab, manager fetch status, templates/diagnostics state, API success/error state.
- Observation State: visible header/subtitle, list/actions/error text, Vite/Tauri logs, desktop window.

## Closed Loop

input event -> Settings Workflows tab active -> WorkflowTemplateManager mounted -> API request resolves/rejects -> manager state transitions -> list/actions/error body rendered.

## Evidence

- Runtime API probe: `GET http://127.0.0.1:60108/api/workflows/templates` returned 200 with built-in `agent-development`; server-owned registry data is available.
- Existing Tauri/Vite logs show startup and unrelated scheduled task fetch warnings, but no visible WorkflowTemplateManager render exception yet.
- User-visible observation: Settings Workflows body shows only title/subtitle, no list/actions/error body.
- Source evidence: `desktop/src/pages/Settings.tsx` `WorkflowsSettings` renders only `settings.workflows.title` and `settings.workflows.description`; it does not import or mount `WorkflowTemplateManager`.
- Source evidence: `desktop/src/components/workflow/WorkflowTemplateManager.tsx` already implements the manager body and `sessionsApi.listWorkflowTemplates()` integration.
- RED verification: `cd desktop && bun run test -- src/pages/Settings.test.tsx --run` failed because `[data-testid="workflow-template-manager"]` was absent after selecting Workflows.
- Fix evidence: `desktop/src/pages/Settings.tsx` now imports and renders `WorkflowTemplateManager` below the Workflows description.
- GREEN verification: focused Settings test passed with `3 tests`.
- GREEN verification: focused workflow component test passed with `34 tests`.
- GREEN verification: `bun run check:desktop` passed with `94 test files`, `786 tests`, TypeScript no-emit, and Vite build.
- Human verification failed for a related symptom: Settings -> Workflows is no longer blank, but the Chinese UI appears mostly English.
- Project cognition re-query for the localization symptom returned readiness `blocked` with minimal live reads `desktop/src/pages/Settings.tsx`, `desktop/src/components/workflow`, `desktop/src/i18n/locales/zh.ts`, and `desktop/src/i18n/locales/en.ts`; continue with live evidence and recommend `$sp-map-update`.
- Source evidence: `desktop/src/i18n/locales/zh.ts` still has English values for Workflows editor labels such as `Template ID`, `Phase ID`, `Instructions`, `Output artifact name`, `Transition authority`, `Advanced fields`, and related validation messages.
- Source evidence: `desktop/src/components/workflow/WorkflowTemplateManager.tsx` renders `template.source`, `template.name`, and `template.description` directly, so Chinese locale shows raw server metadata such as `builtin`, `Agent Development`, and `Discussion to implementation workflow.`.
- RED verification: `cd desktop && bun run test -- src/components/workflow/WorkflowComponents.test.tsx --run -t "localizes builtin template display"` failed because the row still contained `Agent Development`, `builtin`, and `Discussion to implementation workflow.` in Chinese locale.
- Fix evidence: added desktop display-layer localization for built-in workflow template metadata and template source labels while preserving raw `source`/`id` values for API operations.
- Fix evidence: translated missing Chinese Workflows editor labels and validation messages, and localized the Chinese Settings tab/title to `工作流`.
- GREEN verification: `cd desktop && bun run test -- src/components/workflow/WorkflowComponents.test.tsx --run -t "localizes builtin template display"` passed.
- GREEN verification: `cd desktop && bun run test -- src/components/workflow/WorkflowComponents.test.tsx --run` passed with `35 tests`.
- GREEN verification: `cd desktop && bun run test -- src/pages/Settings.test.tsx --run` passed with `3 tests`.
- GREEN verification: `bun run check:desktop` passed with `94 test files`, `787 tests`, TypeScript no-emit, and Vite build.
- Runtime projection evidence: running Vite/Tauri dev logs show HMR updates for Workflows Settings and workflow component files after the localization changes.

## Root Cause

- summary: Settings Workflows route was wired to a placeholder section, then the newly mounted manager exposed raw English metadata in Chinese locale.
- owning_layer: desktop Settings tab composition and desktop Workflows display/i18n projection.
- broken_control_state: active `workflows` tab selected `WorkflowsSettings`, but that component omitted the manager subtree; after mounting it, the Chinese display path still used untranslated zh keys and raw template `source`/built-in metadata.
- failure_mechanism: the first failure rendered only the static header; the follow-up localization failure rendered manager content but leaked server-owned English metadata and placeholder English labels.
- loop_break: Settings tab selection -> WorkflowsSettings render -> manager/display localization projection -> external observation was blank first, then mixed English in Chinese locale.
- decisive_signal: live API returned templates, source showed missing manager mount, and RED localization test showed raw `Agent Development`, `builtin`, and English editor labels in Chinese locale.

## Eliminated

- pending

## Verification Plan

- Inspect current `artifacts/local-run/tauri-dev-20260527-003438.*.log`.
- Probe workflow template API in the running sidecar if route/port is discoverable.
- Run focused desktop tests around Settings/WorkflowComponents after any fix.
- Run narrow server workflow template route tests if API contract changes.

## Changed Code Paths

- modified: `desktop/src/pages/Settings.tsx`
- modified: `desktop/src/pages/Settings.test.tsx`
- modified: `desktop/src/components/workflow/WorkflowTemplateManager.tsx`
- modified: `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- modified: `desktop/src/components/workflow/WorkflowTemplatePicker.tsx`
- modified: `desktop/src/components/workflow/WorkflowStartDialog.tsx`
- modified: `desktop/src/components/workflow/WorkflowComponents.test.tsx`
- added: `desktop/src/components/workflow/workflowTemplateDisplay.ts`
- modified: `desktop/src/i18n/locales/en.ts`
- modified: `desktop/src/i18n/locales/zh.ts`
- added debug state: `.planning/debug/settings-workflows-blank.md`

## Changed Behavior Surfaces

- Desktop Settings Workflows tab now renders the workflow template manager body under the header/description.
- Chinese locale displays Settings Workflows as `工作流`, localizes manager/editor labels, and localizes built-in `agent-development` visible name/description/source labels.
- Workflow template IDs and source enum values remain unchanged for API calls and persisted registry semantics.
- Workflow template API behavior unchanged.

## Verification Evidence

- `cd desktop && bun run test -- src/pages/Settings.test.tsx --run`: passed, 3 tests.
- `cd desktop && bun run test -- src/components/workflow/WorkflowComponents.test.tsx --run -t "localizes builtin template display"`: passed, 1 focused test.
- `cd desktop && bun run test -- src/components/workflow/WorkflowComponents.test.tsx --run`: passed, 35 tests.
- `bun run check:desktop`: passed, 94 files and 787 tests, plus TypeScript no-emit and Vite build.

## Project Cognition Refresh

- Project cognition was already stale from the recent implementation.
- `project-cognition.exe mark-dirty --reason "sp-debug Settings Workflows localization/display paths changed; run sp-map-update after human verification"` completed; readiness remains `blocked`, recommended next action remains `run_map_update`.
- Recommend `$sp-map-update` for the changed Workflows Settings and i18n/display paths after human verification.

## Human Verification

- status: awaiting_user
- request: Confirm Settings -> 工作流 now shows the manager controls/list and no longer looks mostly English in Chinese locale.
