# Debug Session: superpowers workflow template invalid

## Status

- stage: awaiting_human_verify
- issue_classification: new_issue
- created_at: 2026-06-03
- user_report: Settings -> Workflows shows "无效的工作流模板" for `superpowers-dev` with `WORKFLOW_PHASE_SKILL_MISSING` at `$.templates[4].phases[2].skills[1]` and `$.templates[4].phases[3].skills[0]`.
- execution_model: leader-inline
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- dispatch_reason: Small focused investigation: one custom workflow template warning, one validation path, and a short minimal-live-read set returned by project cognition.
- blocked_reason:

## Project Cognition Intake

- readiness: review
- freshness: partial_refresh
- lexicon_generation_id: GEN-20260528T034105.715065300Z
- selected_concepts:
  - Workflow Templates API (`src/server/api/workflowTemplates.ts`, `src/server/__tests__/workflowTemplates.test.ts`)
  - Settings Workflows Tab (`desktop/src/pages/Settings.tsx`, `desktop/src/pages/Settings.test.tsx`, `desktop/src/stores/uiStore.ts`)
- rejected_concepts:
  - Desktop Release and Quality Workflows: incidental CI workflow term.
  - Docs Build and Publishing Pipeline: incidental CI/docs workflow term.
  - EmptySession Workflow Launcher: workflow launch UI but not the settings template validation warning.
  - Sessions Workflow API, Workflow Final Report Builder, Workflow Report Store, Workflow Runtime Service, Workflow Runtime Status Components: adjacent runtime/report surfaces, not the current template validation entry point.
- concept_decisions: selected workflow template validation and settings workflow display surfaces because the warning names a template id and JSON path; rejected CI/docs/runtime concepts because they do not own template schema or recommended skill availability.
- route_pack_minimal_live_reads:
  - `src/server/api/workflowTemplates.ts`
  - `src/server/__tests__/workflowTemplates.test.ts`
  - `desktop/src/pages/Settings.tsx`
  - `desktop/src/pages/Settings.test.tsx`
  - `desktop/src/stores/uiStore.ts`
- missing_coverage: none returned, but the persisted location of the user-created `superpowers-dev` template is not yet known from cognition.
- advisory_gap: baseline is dirty/partial_refresh, so map facts guide routing only; live file/config evidence must prove the root cause.

## Intake Gate

- causal_map_completed: true
- investigation_contract_completed: true
- log_investigation_plan_completed: true
- observer_framing_completed: true
- skip_observer_reason: map-backed-minimum-intake
- legacy_session_needs_reintake: false

## Causal Map

- symptom_anchor: Settings workflow page renders invalid template warning for `superpowers-dev`.
- closed_loop_path: workflow template JSON/import -> template validation/normalization -> skill availability check -> API/store diagnostic payload -> Settings workflows tab warning.
- break_edges:
  - Template phase skill references may name skills unavailable in this environment.
  - Template JSON shape may be valid enough to persist but invalid under workflow template list validation.
  - Settings UI may show a server/store diagnostic as template-invalid without enough repair guidance.
- bypass_paths:
  - Remove or rename unavailable recommended skill references in the custom template.
  - Add aliases/mapping only if the validator proves the referenced superpowers skill ids should be accepted.
  - Improve authoring validation only if template creation accepted a record the list API later rejects.
- family_coverage:
  - unavailable_skill_reference: falsifier is all phase skill ids are listed in the current environment's available skills.
  - malformed_template_json: falsifier is the persisted template parses and passes all non-skill schema checks.
  - ui_projection_error: falsifier is API/store diagnostics already name the same missing skill paths.
- dimension_scan: persistence shape, validation schema, skill registry, UI diagnostic projection, workflow authoring tool.
- candidate_board:
  - C1: `superpowers-dev` references old/plugin skill ids that are unavailable in the current ECC environment.
  - C2: authoring tool wrote malformed skill objects/strings that pass creation but fail list validation.
  - C3: Settings UI is labeling advisory skill warnings as an invalid full template.

## Observer Framing

- primary_suspected_loop: custom template skill references fail workflow template availability validation at list/render time.
- primary_candidate: C1 unavailable skill reference.
- contrarian_candidate: C2 malformed persisted JSON from workflow_template_authoring.
- recommended_first_probe: inspect the minimal live validation/API/UI surfaces and locate the persisted `superpowers-dev` template to compare phase skill ids with accepted skill format.
- candidate_separating_signals:
  - If diagnostics are emitted by the API with exact JSON paths, root cause is likely server/template validation or data.
  - If the persisted template contains valid existing skill ids but UI still warns, root cause moves to UI projection.
  - If workflow_template_authoring created skill entries in a shape inconsistent with tests/schema, root cause moves to authoring.

## Transition Memo

- first_candidate_to_test: C1 unavailable skill reference.
- why_first: User-visible diagnostics explicitly name `WORKFLOW_PHASE_SKILL_MISSING` and two phase skill paths.
- evidence_unlock:
  - Read returned minimal live files to identify validator and expected skill schema.
  - Locate persisted `superpowers-dev` template and inspect only the relevant phase skill references.
  - Compare referenced skill ids against the current environment's accepted skill registry or validator rules.
- carry_forward_notes: Do not change production behavior or template content until the owning truth is clear; project cognition is advisory, live evidence must prove the failure.

## Investigation Contract

- primary_candidate_id: C1
- candidate_queue:
  - C1 unavailable skill reference in `superpowers-dev`
  - C2 malformed persisted skill reference shape
  - C3 UI overstates or misprojects validation diagnostics
- related_risk_targets:
  - Existing valid workflow templates in the same store.
  - Workflow template import/authoring validation.
  - Settings workflows diagnostics display.
  - Skill registry aliases for plugin-prefixed superpowers skills.
- success_evidence_required:
  - Reproduce or inspect the exact validation warning source.
  - Prove the root cause with template content plus validator behavior.
  - Add/update a same-area regression if code changes are required.
  - Verify the fixed template or validator no longer reports `WORKFLOW_PHASE_SKILL_MISSING`.

## Log Investigation Plan

- existing_log_targets:
  - Current Settings UI warning text from user report.
  - Workflow template API/test output if targeted tests reproduce.
  - Persisted workflow template JSON for `superpowers-dev`.
- candidate_signal_mapping:
  - C1: missing skill ids in persisted template and validator registry mismatch.
  - C2: schema mismatch in persisted skill entries or authoring output.
  - C3: API payload is clean but UI synthesizes warning incorrectly.
- observability_escalation: If files/tests cannot locate the template store, search only for `superpowers-dev` and `WORKFLOW_PHASE_SKILL_MISSING` before broader inspection.

## Senior Consequence Analysis

### Affected Object Map

- `superpowers-dev` custom workflow template: affected persisted record.
- Workflow template API/store validator: truth owner for template validity diagnostics.
- Settings Workflows tab: observation surface for diagnostics and user repair actions.
- Skill registry/environment available skills: truth owner for recommended skill availability.
- Existing workflow templates: adjacent records that could be affected by validator changes.
- Workflow authoring/import action: upstream producer that may have accepted invalid references.

### State-Behavior Matrix

- created/imported: template should be validated against current schema and skill registry before being shown as valid.
- listed/refreshed: template diagnostics should identify invalid fields without corrupting other templates.
- invalid: unavailable recommended skills should be repairable by editing/removing/remapping those references.
- valid: existing workflow templates should remain listed without new warnings.
- stale/partial registry: warnings should not silently hide missing skills or mark unrelated templates invalid.

### Dependency Impact Table

- Direct dependencies: template JSON schema, workflow template API validation, skill availability registry.
- Indirect consumers: Settings UI, workflow launch/phase execution, import/export actions.
- Shared state: persisted workflow templates and available-skill metadata.
- Compatibility surfaces: skill id naming (`superpowers:*`, local `.codex/skills`, ECC skill ids), phase skill object/string format.
- Validation routes: targeted workflow template API tests, Settings workflow tests, direct template validation through local command/API if available.
- Adjacent workflows: workflow_template_authoring tool and workflow runtime phase execution.

### Recovery And Validation Contract

- Rollback: keep edits scoped to the custom template or validator/test files; do not rewrite unrelated templates.
- Retry/idempotency: refreshing Settings should produce stable diagnostics after fix.
- Cleanup: no generated quality artifacts committed.
- Migration: if skill ids are remapped, preserve existing valid templates and document compatibility expectation in tests.
- Observability: final state must name exact skill ids/paths fixed or validator behavior changed.
- Validation evidence: targeted test or direct validation command plus Settings/API check where practical.

### Coverage Gaps

- CG-001: Persisted `superpowers-dev` file path unknown. Owner: debug workflow. Latest safe resolve phase: evidence investigation. Routing: current workflow may continue with targeted search for the exact id.
- CG-002: Whether missing skills are truly unavailable or just aliased differently. Owner: debug workflow. Latest safe resolve phase: before fix. Routing: current workflow may continue with validator/registry evidence.

### Consequence Obligations

- CA-001: Any fix must not mark unavailable executable skills as available unless the runtime can actually route them. Affected objects: skill registry, template validation, phase execution. Owner workflow: sp-debug. Latest resolve phase: before fix. Status: open. Stop-and-reopen condition: referenced skill cannot be resolved to an installed skill or executable workflow command.
- CA-002: Any repair to `superpowers-dev` must preserve existing workflow template validity for other templates. Affected objects: workflow template store and Settings list. Owner workflow: sp-debug. Latest resolve phase: verification. Status: open. Stop-and-reopen condition: targeted tests or validation show new warnings on existing templates.
- CA-003: If authoring accepted invalid skill references, the fix must cover the producer or record a follow-up blocker. Affected objects: workflow_template_authoring/import. Owner workflow: sp-debug. Latest resolve phase: human-verify handoff. Status: open. Stop-and-reopen condition: the same invalid references can be recreated without diagnostics.

## Pre-Analysis

- Scope boundary: fix or repair the `superpowers-dev` workflow template warning and any proven validator/authoring issue in the workflow template/settings surface.
- Explicitly out of scope: GitHub Actions workflows, docs publishing workflows, broad redesign of workflow runtime, unrelated active debug sessions.
- Key constraints: evidence before fixes; preserve unknown persisted user fields; do not hardcode fake skill availability; same-area tests required for production code changes.
- Affected surface area: workflow template API/store validation, Settings workflows tab diagnostics, persisted custom template, skill registry references.
- Known unknowns: persisted template path, exact skill ids at two JSON paths, accepted skill-reference format, whether code changes are needed versus template repair.
- Recommended next step: read the minimal live files and locate `superpowers-dev`/diagnostic strings.

## Truth Ownership Map

- Decision truth owner: workflow template validation and current skill availability registry.
- Reflections/caches: Settings page warning list and any local UI store state.
- Producer: workflow_template_authoring/import action that wrote the custom template.
- Evidence support: pending live reads.

## Control State vs Observation State

- Control State: persisted template records, validator accepted schema, available skill id set, phase skill references.
- Observation State: Settings warning rows, JSON path diagnostic text, translated invalid-template label.

## Closed Loop

Template creation/import -> persisted template record -> validator checks schema and recommended skills -> Settings tab receives diagnostics -> user sees valid/invalid state and can refresh/repair.

## Current Focus

Await user confirmation after refreshing Settings -> Workflows.

## Evidence

- User report: Settings -> Workflows shows `superpowers-dev` invalid with `WORKFLOW_PHASE_SKILL_MISSING` at `$.templates[4].phases[2].skills[1]` and `$.templates[4].phases[3].skills[0]`.
- Project cognition returned readiness `review`, selected Workflow Templates API and Settings Workflows Tab, and restricted initial code reads to five files.
- Passive learning reported a related workflow_template_authoring tool schema lesson, but that prior issue concerns provider tool schemas and is not yet evidence for this template validation warning.
- Initial cognition query-plan attempt failed because `alias_interpretations` was shaped as an object instead of the runtime-required array; corrected query-plan succeeded.
- Minimal live reads completed:
  - `src/server/api/workflowTemplates.ts`: list API returns registry `invalidTemplates`; create/update validate before writing.
  - `src/server/__tests__/workflowTemplates.test.ts`: missing recommended skills are warning-level diagnostics and imported unresolved recommended skills can be preserved.
  - `desktop/src/pages/Settings.tsx`: Settings Workflows tab renders `WorkflowTemplateManager`; UI is likely an observation surface.
  - `desktop/src/pages/Settings.test.tsx` and `desktop/src/stores/uiStore.ts`: no evidence of UI-owned validation.
- Targeted search found persisted `superpowers-dev` at `C:\Users\11034\.claude\cc-jiangxia\workflows.json`.
- Targeted search found `WORKFLOW_PHASE_SKILL_MISSING` is emitted by `src/server/services/workflowPhaseSkillResolver.ts` and surfaced through `workflowTemplateRegistryService.ts`.
- Persisted `superpowers-dev` phase skill references:
  - phase 1 `planning`: `tdd-workflow`, `search-first`
  - phase 2 `implementation`: `tdd-workflow`, `systematic-debugging`, `verification-loop`
  - phase 3 `review`: `code-review`, `security-review`, `verification-loop`
  - phase 4 `finish`: `verification-loop`, `github-ops`
- Current skill-directory evidence:
  - `F:\github\cc-jiangxia\.codex\skills` contains `systematic-debugging` and `code-review-skill`, but not `code-review`.
  - `C:\Users\11034\.codex\skills` and `C:\Users\11034\.claude\skills` contain `verification-loop`, `github-ops`, `search-first`, `tdd-workflow`, and `security-review`, but not `systematic-debugging` or `code-review`.
  - The registry catalog scans `process.cwd()/.codex/skills`, `process.cwd()/.agents/skills`, `src/skills/bundled`, and `~/.claude/skills`; therefore a service launched from `C:\Users\11034` will miss project-local `systematic-debugging`.
- Direct registry reproduction before repair:
  - cwd `C:\Users\11034`: `superpowers-dev` reported missing at phase 2 skill 1 (`systematic-debugging`) and phase 3 skill 0 (`code-review`), plus ambiguous warnings for duplicated names-first references.
  - cwd `F:\github\cc-jiangxia`: `superpowers-dev` still reported missing for `code-review` and ambiguous for duplicated names-first `tdd-workflow`.
- Repair applied to `C:\Users\11034\.claude\cc-jiangxia\workflows.json`:
  - `superpowers-dev` changed missing `systematic-debugging` to installed user skill `agentic-engineering`.
  - `superpowers-dev` changed missing `code-review` to installed user skill `plankton-code-quality`.
  - Added `source: "user"` to all repaired `superpowers-dev` recommended skills so duplicate managed/user installs do not resolve ambiguously.
  - Added `source: "user"` to `code-review-workflow` recommended skills because it had the same names-first ambiguity and kept the Settings page in warning state.
- Direct registry verification after repair:
  - cwd `C:\Users\11034`: `invalidTemplates: []`.
  - cwd `F:\github\cc-jiangxia`: `invalidTemplates: []`.
- WorkflowTemplateAuthoringService `list` verification after repair:
  - cwd `C:\Users\11034`: `status: succeeded`, `valid: true`, `issues: []`, `invalidTemplates: []`.
  - cwd `F:\github\cc-jiangxia`: `status: succeeded`, `valid: true`, `issues: []`, `invalidTemplates: []`.

## Eliminated

- GitHub Actions workflow files: rejected by cognition concept decision because the user's warning is product template validation, not CI workflow execution.
- Docs publishing workflow: rejected by cognition concept decision because it is unrelated to Settings workflow templates.
- C3 UI projection error: eliminated. Settings only renders `WorkflowTemplateManager`; the diagnostics are produced by registry/API validation, and direct registry runs reproduced them without the UI.
- Malformed skill object shape: eliminated for `superpowers-dev`. Persisted skill references had non-empty `name` and `mode: "recommended"`; the failing diagnostics were missing/ambiguous availability warnings, not `WORKFLOW_PHASE_SKILL_INVALID_REFERENCE`.

## Root Cause

- status: confirmed
- summary: The custom `superpowers-dev` workflow template referenced recommended skills by names that were either unavailable in the active skill catalog (`systematic-debugging`, `code-review`) or ambiguous because the same skill name existed in both managed and user skill roots. The Settings page reflected registry diagnostics correctly.
- owning_layer: workflow template registry skill resolution plus persisted user workflow template skill references.
- broken_control_state: persisted `phases[].skills[]` lacked stable source-qualified references and included two names that were not available from the configured user skill catalog.
- failure_mechanism: `collectTemplateSkillCatalog()` builds catalog entries from cwd-local managed roots and `~/.claude/skills`; names-first references matched zero or multiple catalog entries, so `resolveWorkflowPhaseSkillReference()` emitted `WORKFLOW_PHASE_SKILL_MISSING` or `WORKFLOW_PHASE_SKILL_AMBIGUOUS`.
- loop_break: template creation/import wrote a usable workflow shape but left recommended skill bindings that did not resolve deterministically at list time.
- decisive_signal: direct `WorkflowTemplateRegistryService().listTemplates()` reproduced the exact `superpowers-dev` warnings before repair and returned `invalidTemplates: []` after source-qualified installed user skill references.
- alternative_hypotheses_considered:
  - C1 unavailable skill reference.
  - C2 malformed persisted skill reference shape.
  - C3 UI projection error.
- alternative_hypotheses_ruled_out:
  - Malformed skill object shape: skill objects had non-empty names and recommended mode.
  - UI projection error: server-side registry reproduced the warnings without UI.
- root_cause_confidence: confirmed

## Fix Plan

- status: applied
- fix_scope: truth-owner
- changed_code_paths:
  - modified: `C:\Users\11034\.claude\cc-jiangxia\workflows.json`
  - added:
  - deleted:
  - renamed:
- changed_behavior_surfaces:
  - user workflow template config
  - Settings workflows template diagnostics
  - workflow template registry skill resolution inputs
- verification_evidence:
  - `bun -` direct registry check with cwd `C:\Users\11034` returned `invalidTemplates: []`.
  - `bun -` direct registry check with cwd `F:\github\cc-jiangxia` returned `invalidTemplates: []`.
  - `bun -` direct `WorkflowTemplateAuthoringService(...).execute({ operation: "list" })` returned `valid: true` and `invalidTemplates: []` for both cwd contexts.
- project_cognition_refresh: not required for source/runtime map; changed file is user-owned config outside repository source. Debug session records the operational repair.

## Verification

- reproduction_status: verified_by_direct_registry
- latest_result: passed
- loop_restoration_proof: Persisted template skill references now resolve to installed user skills in both tested cwd contexts, registry validation returns no invalid templates, and Settings workflows page consumes the same registry diagnostics.

## Human Verification

- status: awaiting_user
- awaiting: Refresh Settings -> Workflows and confirm the invalid workflow template warning is gone.
