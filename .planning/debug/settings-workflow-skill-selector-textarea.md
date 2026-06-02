# Debug Session: Settings Workflow Skill Selector Textarea

## Status

- state: awaiting_human_verify
- user_report: Settings page workflow creation/editing still shows the phase skill area as a text edit box.
- command: sp-debug
- started_at: 2026-05-30
- cognition_status: blocked
- cognition_blocker: `project-cognition.db metadata missing baseline_kind`
- cognition_routing: advisory blocked state recorded; continuing with live repository evidence because the defect targets a running UI surface and the feature artifacts explicitly name the owner path.
- execution_model: leader-inline
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- dispatch_reason: Small focused investigation with one UI surface, one expected control type, and short evidence chain.
- blocked_reason: none

## Intake Gates

- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- skip_observer_reason: map-backed-minimum-intake-from-feature-artifacts-and-user-report

## Scope Boundary

- In scope: desktop Settings workflow template authoring UI for phase recommended skills.
- Out of scope: changing phase skill semantics, runtime auto-execution, import/export dependency behavior, or SkillTool permissions.

## Key Constraints

- Workflow phase skills are recommended references to existing skills, not prompt-only prose.
- UI authoring belongs at phase level in `WorkflowTemplateEditor`.
- Do not duplicate skill-owned metadata as authoritative workflow text.
- Preserve legacy `reason` data and existing workflow template compatibility.

## Affected Surface Area

- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- Existing same-area desktop workflow tests.
- Potentially skill catalog store/API types if the editor is not consuming the shared catalog correctly.

## Known Unknowns

- Whether the editor implemented a selector but the Settings route renders a legacy field or stale branch.
- Whether the component has a selector hidden behind missing catalog state.
- Whether tests cover visible control semantics instead of only persistence.

## Map-Backed Minimum Intake

- selected_symptom: phase recommended skill authoring still rendered as a text input/textarea.
- primary_candidate: `WorkflowTemplateEditor` still renders a legacy freeform `phase.skills` text field in the Settings workflow template creation path.
- contrarian_candidate: selector exists, but Settings route supplies no skill catalog data or renders a different component path.
- first_probe: inspect `WorkflowTemplateEditor` skill field rendering and same-area tests.
- log_investigation_plan: no runtime logs expected to distinguish this static UI defect; use component tests and live source evidence first.
- nearest_neighbor_related_risk_target: legacy `reason` round-trip and old `skills` array preservation.

## Truth Ownership Map

- decision_truth_owner: workflow template editor component decides what authoring control is rendered for phase skill bindings.
- reflected_or_cached_layers: Settings page route, stores/API skill catalog data, persisted template JSON.
- evidence_needed: source evidence of rendered control and regression test proving selector behavior.

## Control State And Observation State

- Control State: phase skill reference list in template editor state.
- Observation State: visible authoring control in Settings workflow creation/editing UI.

## Closed Loop

Settings workflow new/edit action -> `WorkflowTemplateEditor` builds phase editor controls -> skill catalog/phase state determines rendered control -> user selects recommended skills -> template persists skill references.

## Current Focus

Awaiting human verification in the running desktop client. Agent verification passed; the Settings workflow template editor no longer exposes the phase skills textarea in Advanced Fields, phase skills are selected through a searchable multi-select dialog, the dialog keeps all selected skills visible in one selected-summary area with direct removal controls, and the agent-facing workflow template authoring tool now exposes a read-only `skill_catalog` operation so agents can select existing skills before creating or updating workflow templates.

## Evidence

- Feature spec requires a phase-local skill selector in `WorkflowTemplateEditor`.
- Implementation plan target boundary names `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`.
- `project-cognition lexicon` failed before returning a bundle with `project-cognition.db metadata missing baseline_kind`; live evidence is required.
- `WorkflowTemplateEditor` renders `RecommendedSkillsSelector`, but also renders advanced `TextArea id="workflow-phase-skills"` labeled `Skills`.
- `toWorkflowPhase` currently saves `skills: toSkills(draft.skills, draft.skillReferences)`, so the hidden/advanced freeform text remains a control-state input.
- RED regression: `cd desktop; bun run test -- --run src/components/workflow/WorkflowComponents.test.tsx -t "schema-aware common fields"` failed because `workflow-phase-skills` textarea was present.
- Follow-up usability issue: inline catalog listing inside each phase is too noisy; phase selection should open a dedicated searchable multi-select dialog.
- Follow-up usability issue: selected skills inside the dialog were only reflected by scattered checked rows in the full list, so users could not quickly review what was selected.
- Follow-up authoring-tool gap: `workflow_template_authoring` create/update could persist `phases[].skills`, but the agent had no read-only skill catalog operation and the guide still encouraged writing `reason`; this made agent-authored workflow skills depend on guessed names or duplicated skill metadata.

## Active Hypothesis

The visible text edit box remains because the legacy `skills` advanced field was not removed after the selector was introduced. Removing that field and making selector references the sole authoring control restores the intended UI while preserving legacy metadata through `skillReferences`.

## Root Cause

- summary: The old freeform phase skills textarea survived inside Advanced Fields after the phase-local recommended skill selector was added.
- owning_layer: `WorkflowTemplateEditor`
- broken_control_state: `PhaseDraft.skills` text remains an authoring input for `WorkflowTemplatePhase.skills`.
- failure_mechanism: opening Advanced Fields exposes a textarea labeled Skills, and save prefers parsing that text through `toSkills`.
- loop_break: selector state is no longer the sole control state for phase skill references.
- decisive_signal: source renders `workflow-phase-skills` textarea and save calls `toSkills(draft.skills, draft.skillReferences)`.
- follow_up_tool_root_cause: the agent-facing authoring surface lagged the UI semantics; the schema allowed template objects with `phases[].skills`, but the tool guide did not point agents to catalog selection and no operation returned selectable recommended skill references.
- follow_up_selected_summary_root_cause: `SkillPickerModal` had draft selected names and checked list rows, but no independent selected-summary view; filtering or scrolling the catalog separated the user's selected set from the visible rows.

## Eliminated

- Contrarian candidate eliminated: the Settings route was not rendering a separate editor path; the text box came from the same `WorkflowTemplateEditor` advanced field.
- Surface-only fix rejected: hiding text visually while continuing to parse `draft.skills` would leave the old text control path as control state.

## Verification Plan

- Add or update same-area desktop component test that fails when phase skills are rendered as a freeform text edit box instead of catalog-backed selectable controls.
- Run the focused desktop test.
- If production code changes, run `cd desktop && bun run test -- --run <focused test>`.

## Changed Code Paths

- modified: `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- modified: `desktop/src/components/workflow/WorkflowComponents.test.tsx`
- modified: `src/server/services/workflowTemplateAuthoringGuide.ts`
- modified: `src/server/services/workflowTemplateAuthoringGuide.test.ts`
- modified: `src/server/services/workflowTemplateAuthoringService.ts`
- modified: `src/server/services/workflowTemplateAuthoringService.test.ts`
- modified: `src/server/services/workflowToolPolicy.ts`
- modified: `src/server/services/workflowToolPolicy.test.ts`
- modified: `src/server/api/workflowTemplates.ts`
- modified: `src/server/__tests__/workflowTemplates.test.ts`
- modified: `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx`
- modified: `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`
- modified: `.planning/debug/settings-workflow-skill-selector-textarea.md`

## Verification Evidence

- RED: focused component test failed before production fix because `Skills` textarea existed in Advanced Fields.
- GREEN: focused component test passed after removing freeform skills authoring and saving from `skillReferences`.
- Focused same-area suite: `cd desktop; bun run test -- --run src/components/workflow/WorkflowComponents.test.tsx` passed, 43 tests.
- Desktop gate: `bun run check:desktop` passed, 96 test files / 823 tests, `tsc --noEmit`, and production `vite build`.
- Dialog UX follow-up: focused test now verifies phase card shows only selected summary, opens `Choose recommended skills for <phase> phase`, supports search via `Search skills`, supports multi-select checkboxes, and applies selections per phase.
- Selected-summary follow-up: focused test verifies the picker dialog has a `Selected skills` group that remains visible while searching, shows selected count, lists selected skills together, supports removing a selected skill from that group, and keeps the list checkbox state synchronized.
- Selected-summary verification: `cd desktop; bun run test -- --run src/components/workflow/WorkflowComponents.test.tsx -t "lets authors select recommended skills per phase"` passed, 1 test / 42 skipped.
- Selected-summary same-area suite: `cd desktop; bun run test -- --run src/components/workflow/WorkflowComponents.test.tsx` passed, 43 tests.
- Selected-summary desktop checks: `cd desktop; bun run lint` passed and `bun run check:desktop` passed, 96 test files / 823 tests, `tsc --noEmit`, and production `vite build`. Existing React `act(...)` warnings remain in `generalSettings.test.tsx`.
- Agent authoring tool focused tests: `bun test src/server/services/workflowTemplateAuthoringGuide.test.ts src/server/services/workflowTemplateAuthoringService.test.ts src/server/services/workflowToolPolicy.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts` passed, 64 tests.
- API authoring endpoint test: `bun test src/server/__tests__/workflowTemplates.test.ts` passed, 46 tests, including `POST /api/workflows/templates/authoring` `skill_catalog`.
- Server gate attempt: `bun run check:server` exits non-zero because Bun 1.3.13 crashes with `panic(main thread): integer overflow`; the two files reported by isolated mode (`src/server/__tests__/workspace-service.test.ts`, `src/tools/AgentTool/loadAgentsDir.cache.test.ts`) pass when run individually.

## Loop Restoration Proof

- Triggering input: user opens Settings workflow template creation/editing and expands Advanced Fields.
- Control decision: `WorkflowTemplateEditor` now keeps phase skill authoring state in `skillReferences` only.
- Resource allocation: catalog-backed `RecommendedSkillsSelector` opens a searchable multi-select dialog instead of rendering the full catalog inline.
- Reviewability: `SkillPickerModal` now derives selected skill summaries from `draftNames` and renders them together above the filtered catalog, so selected skills remain visible even when search hides their catalog rows.
- State transition: save writes `WorkflowTemplatePhase.skills` from `draft.skillReferences`.
- Agent authoring loop: `workflow_template_authoring skill_catalog` now returns selectable `recommendedReference` objects, guide text tells agents to use the catalog before assigning `phases[].skills`, and create/update still validate through the same registry path.
- External observation: component regression asserts the `Skills` textarea is not rendered after Advanced Fields is opened and the phase skill catalog is selected through the dialog; tool/API regression tests assert agent-visible catalog selection is read-only and persisted templates are not written by catalog lookup.

## Project Cognition Refresh

- query_status: blocked
- update_status: blocked
- mark_dirty_status: blocked
- blocker: `project-cognition.db metadata missing baseline_kind`
- attempted_update: `project-cognition update --changed-path desktop/src/components/workflow/WorkflowTemplateEditor.tsx --changed-path desktop/src/components/workflow/WorkflowComponents.test.tsx --scope "desktop workflow template editor recommended skill selector" --reason workflow-finalize --format json`
- attempted_selected_summary_update: `project-cognition update --changed-path desktop/src/components/workflow/WorkflowTemplateEditor.tsx --changed-path desktop/src/components/workflow/WorkflowComponents.test.tsx --scope "desktop workflow template editor selected skill picker summary" --reason workflow-finalize --format json`
- attempted_dirty_fallback: `project-cognition mark-dirty --reason "workflow-finalize blocked for settings workflow skill selector debug: project-cognition.db metadata missing baseline_kind" --format json`
- attempted_selected_summary_dirty_fallback: `project-cognition mark-dirty --reason "workflow-finalize blocked for selected skill picker summary: project-cognition.db metadata missing baseline_kind" --format json`
- closeout_decision: code and desktop verification are complete; cognition closeout is blocked by runtime metadata state.
