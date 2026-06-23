---
slug: workflow-authoring-skill-selection-semantics
status: awaiting-human-verify
created: 2026-06-15T11:23:56+08:00
updated: 2026-06-15T12:00:00+08:00
source_command: sp-debug
execution_model: leader-inline
dispatch_shape: leader-inline
execution_surface: leader-inline
dispatch_reason: "Focused workflow authoring defect with one owning contract chain: authoring tool/service, template validation, skill catalog resolution, and editor display."
blocked_reason:
causal_map_completed: true
investigation_contract_completed: true
log_investigation_plan_completed: true
observer_framing_completed: true
skip_observer_reason: map-backed-minimum-intake
previous_session_classification: unrelated_issue
previous_session_reference: .planning/debug/workflow-editor-buttons-hover-disappear.md
---

# Workflow Authoring Skill Selection Semantics

## User Report

The workflow built-in authoring tool has two related problems:
- When creating workflow phases, skill selection can include "void" skills that do not exist.
- A phase's skill references are passive/auxiliary hints; they cannot represent the workflow process or phase control flow.

## Project Cognition Intake

- readiness: `review`
- freshness: `partial_refresh`
- selected concept: `concept:GEN-20260610T112843.959253900Z:N-030`
- selection reason: broad coverage-gap concept includes workflow authoring tool/service, workflow template validation, workflow editor, skill store/API, and tests.
- rejected concepts: git history / branch / contributor concepts because they do not own workflow authoring behavior.
- normalized query: Workflow template authoring tool and editor allow or generate phase recommended skill references that are not present in the skill catalog; phase recommended skills should remain auxiliary/passive metadata and must not define workflow control flow.
- negative constraints:
  - Do not reintroduce builtin workflow templates.
  - Do not make recommended skills mandatory execution steps.
  - Do not treat skill choice as the workflow phase order or transition contract.
- repository search terms:
  - `WorkflowTemplateAuthoringTool`
  - `recommendedSkills`
  - `recommended skill`
  - `skill catalog`
  - `availableSkills`
  - `WorkflowTemplateEditor`
  - `workflowTemplateValidation`
  - `phase contract`
  - `transitionAuthority`
- minimal live reads:
  - `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.ts`
  - `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`
  - `src/server/services/workflowTemplateAuthoringService.ts`
  - `src/server/services/workflowTemplateAuthoringService.test.ts`
  - `src/server/services/workflowTemplateAuthoringGuide.ts`
  - `src/server/services/workflowTemplateAuthoringGuide.test.ts`
  - `src/server/services/workflowTemplateValidation.ts`
  - `src/server/__tests__/workflowTemplates.test.ts`
  - `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
  - `desktop/src/components/workflow/WorkflowComponents.test.tsx`
  - `desktop/src/stores/skillStore.ts`
  - `desktop/src/api/skills.ts`

## Scope Boundary

In scope:
- Server-side workflow template authoring tool/service behavior around phase `recommendedSkills`.
- Validation and diagnostics for nonexistent skill references.
- Desktop editor selector semantics if it allows free-form nonexistent skill references.
- Text/guide wording that could cause agents to confuse recommended skills with workflow phases.

Out of scope:
- Reintroducing builtin workflow presets.
- Changing workflow runtime phase order, transition authority, or completion semantics unless live evidence proves recommended skills currently control them.
- Installing or creating missing skills automatically.
- Deleting existing user templates.

## Observer Framing

Primary suspected loop:
author requests workflow creation -> authoring tool/guide accepts or invents `phase.recommendedSkills` -> validation does not require catalog resolution, or only warns -> persisted template contains nonexistent skill references -> desktop/editor shows selected skills as if valid -> later runtime treats them as recommended auxiliary metadata, not workflow control.

Contrarian candidate:
the authoring service may already preserve skill references only as optional diagnostics, and the real defect is wording/UI affordance that makes users believe skill selection defines the workflow process.

Recommended first probe:
inspect the authoring tool/service, authoring guide, validator, and editor selector to find which layer owns skill-reference admission and whether the UI/API distinguishes valid catalog skills from unresolved auxiliary recommendations.

Candidate-separating signals:
- If authoring service normalizes arbitrary names into `recommendedSkills` without catalog validation, the owner is server authoring admission.
- If validation only marks nonexistent skills as warnings and the editor displays them as normal selections, the owner is validation severity/display.
- If runtime phase transitions ignore recommended skills, the "skill represents workflow process" part is product semantics/wording rather than control-plane failure.

Nearest-neighbor related-risk targets:
- workflow import/export dependency manifest diagnostics
- workflow start dialog skill status display
- final report/evidence around recommended skill usage

## Senior Consequence Analysis

### Affected Object Map

- Workflow template phase records: `recommendedSkills` entries and any legacy skill reference fields.
- Workflow authoring tool API: creates/updates templates from agent-authored drafts.
- Workflow authoring service: normalizes, validates, and persists workflow drafts.
- Workflow template validation: reports skill dependency diagnostics and schema errors.
- Desktop workflow editor: lets users select recommended skills and may round-trip unknown references.
- Skill catalog/store/API: truth source for currently existing skills.
- Workflow runtime/status display: observes recommended skill availability; must not use it as phase control flow.
- Import/export manifests: downstream consumer of skill dependency references.

### State-Behavior Matrix

- Created draft: skill references should be admitted only when they are existing catalog entries or explicitly unresolved auxiliary references with diagnostics.
- Saved template: persisted `recommendedSkills` should not imply phase order or execution authority.
- Imported template: missing skills may be diagnosable dependencies, but must not silently look like valid selected skills.
- Running workflow: phase transition and completion are owned by phase contract/runtime state, not recommended skills.
- Missing/stale skill catalog: diagnostics may be warnings/blockers depending on owner contract; authoring must not invent non-catalog choices as normal selections.
- Completed workflow: recommended skill evidence is observational metadata, not proof that the workflow phase itself ran because of that skill.

### Dependency Impact Table

- Authoring tool -> authoring service -> validation -> persisted template: admission path for invalid skill references.
- Desktop editor -> skill store/API -> template save: UI path for creating or preserving skill references.
- Validator -> import/export/start diagnostics: downstream clarity for missing or unresolved skills.
- Runtime/status panels -> recommended skill evidence: must remain passive observation, not control state.
- Tests -> server and desktop workflow suites: regression targets for catalog resolution and wording.

### Recovery And Validation Contract

- Add a failing test before changing production behavior.
- Verify authoring tool/service no longer treats invented skill names as normal valid selections.
- Verify recommended skills remain auxiliary and do not become phase control flow.
- Verify desktop/editor or validation diagnostics keep missing skills visible without silently converting them into valid selections.
- Run focused server and desktop workflow tests, then the relevant desktop/server check if production surfaces change.

### Coverage Gaps

- `CG-001`: Project cognition has only broad coverage for this area; live code must prove the actual owner. Routing decision: continue with minimal live reads.
- `CG-002`: User did not provide the exact nonexistent skill names or reproduction payload. Routing decision: continue by reproducing through authoring tests and ask only if evidence cannot isolate.
- `CG-003`: Product severity for imported missing recommended skills may be warning rather than hard error. Latest safe resolve phase: before fix. Routing decision: infer from existing validation/tests, ask if code is ambiguous.

### Consequence Obligations

- `CA-001`: Nonexistent recommended skills must not be treated as valid selected catalog skills in author-created templates. Affected objects: authoring tool/service, validation, editor. Owner workflow: sp-debug. Latest resolve phase: fix. Stop-and-reopen condition: a save/create path can still silently accept an invented skill as normal selected catalog data.
- `CA-002`: Recommended skills must remain passive auxiliary metadata and must not define phase order, transition authority, or workflow process. Affected objects: workflow template schema, runtime/status, authoring guide. Owner workflow: sp-debug. Latest resolve phase: fix. Stop-and-reopen condition: implementation makes recommended skills mandatory execution/control state.
- `CA-003`: Missing imported/user skill references need clear diagnostics without deleting user-owned unknown fields unexpectedly. Affected objects: validation, import/export, editor round-trip. Owner workflow: sp-debug. Latest resolve phase: verify. Stop-and-reopen condition: compatibility tests show legacy/unknown skill references are destructively dropped without reviewed migration.

## Investigation Contract

primary_candidate_id: `C1-authoring-admits-void-skills`

candidate_queue:
- `C1-authoring-admits-void-skills`: authoring tool/service or editor admits arbitrary nonexistent skill names as ordinary `recommendedSkills`.
- `C2-validator-severity-display-gap`: validation detects missing skills but classifies or displays them in a way that looks valid.
- `C3-wording-control-flow-confusion`: guide/UI wording encourages agents/users to encode workflow process in recommended skills instead of phases/contracts.

related_risk_targets:
- `src/server/services/workflowTemplateAuthoringService.ts`
- `src/server/services/workflowTemplateValidation.ts`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- workflow import/export dependency diagnostics
- workflow runtime/status recommended skill evidence

## Log Investigation Plan

Existing logs are unlikely to explain this unless a failing authoring request was captured. Use tests and live source as primary evidence. If the authoring service behavior is ambiguous, add focused test probes around create/update payloads with nonexistent skill references and around catalog-backed skill selection.

## Truth Ownership Map

Decision truth owner:
- Workflow phase order and control flow: workflow template `phases`, phase contract, transition authority, and runtime state.
- Skill existence: skill catalog/store/API.
- Skill reference admission: authoring service and workflow template validation.

Reflection/cache layers:
- Desktop editor displays selected/recommended skill references and skill catalog availability.
- Runtime status panels display recommended skill resolution/evidence.
- Import/export manifests preserve dependency diagnostics.

Expected closed loop:
author input -> authoring service validates/catalog-resolves recommended skills -> template persists phase contracts plus auxiliary skill metadata -> runtime uses phases/contracts for control flow -> UI reports skill availability/evidence as observation.

Control State:
- phase list/order, phase IDs, dependencies, transition authority, completion criteria.
- catalog-resolved skill identity when a recommended skill is selected from the catalog.

Observation State:
- recommended skill labels/status badges, dependency diagnostics, evidence summaries, import/export manifest warnings.

## Current Focus

Add RED tests for the agent-facing authoring guide/prompt requiring explicit passive/auxiliary skill semantics and a rule to omit phase skills when no catalog or created skill fits.

## Evidence

- Project cognition query returned `review` and minimal reads covering authoring tool/service, validation, editor, skill store/API, and tests.
- User clarified product semantics: phase skill references are passive auxiliary helpers and must not represent the workflow process.
- Learning detail `learn-2026-06-03-workflow-authoring-skill-create-catalog-visibility` says workflow phase skill authoring must run `skill_catalog` before adding phase skills; if no installed skill fits, create a user skill and reference the returned `recommendedReference`.
- Feature alignment states recommended phase skills bind to existing SkillTool skills, are advisory phase bindings, and explicitly exclude default auto-execution, default hard gates, permission bypass, and forced invocation.
- Feature context states recommended phase skills are soft by default, missing recommended skills are degraded/visible, invalid references are validation errors, and SkillTool owns invocation/permissions/effects.
- `007-workflow-phase-skills` spec requires `WorkflowTemplateEditor` to select phase-local recommended skills from the shared catalog, keep missing recommendations as warnings/degraded runtime state, and preserve unresolved references on import.
- Live source: authoring `create` and `update` call `validateTemplatePhaseSkillAvailability` before writes and reject `WORKFLOW_PHASE_SKILL_MISSING` with `persisted:false`.
- Live tests already cover server create rejection for missing phase skills and repair guidance through `skill_catalog` / `skill_create`.
- Live desktop editor uses a catalog-backed `SkillPickerModal`; search filters catalog entries and does not create new raw skill references, while preserving existing unresolved references with an unresolved label.
- Live runtime/policy strings state recommended phase skills are advisory, do not grant permissions, do not enable SkillTool globally, and do not schedule SkillTool calls.
- Actual user workflow storage currently contains one valid `sp-discussion-to-implement` template and no persisted phase skill references in the inspected output.
- Running sidecar API at `http://127.0.0.1:55470/api/workflows/templates` reports the template as valid/startable with `invalidTemplates: []`.

## Active Hypothesis 2026-06-15T11:44:00+08:00

`C3-wording-control-flow-confusion` refines the root cause: the owning create/update path rejects unavailable recommended skills, and the editor is catalog-backed, but the agent-facing tool prompt and authoring guide do not explicitly say that `phases[].skills` are auxiliary attention metadata and must not be used to model workflow phases, command steps, or missing instructions. Because `template` is intentionally schema-loose, the guide/prompt is the first-line control for preventing agents from proposing void skill names before server rejection.

Experiment:
- Add failing tests that require both the tool prompt and authoring guide to state:
  - recommended phase skills are auxiliary attention metadata only, not workflow flow/control.
  - omit `phases[].skills` when no catalog entry or created skill fits instead of inventing names.

## Red Evidence 2026-06-15T11:47:00+08:00

Command:
- `bun test src/server/services/workflowTemplateAuthoringGuide.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`

Result:
- 2 failed, 27 passed.
- `workflowTemplateAuthoringGuide.test.ts` failed because model/skills guidance did not contain `auxiliary attention metadata only`.
- `WorkflowTemplateAuthoringTool.test.ts` failed because tool prompt did not contain `phases[].skills are auxiliary attention metadata`.

Interpretation:
- Confirms the agent-facing authoring contract lacks the explicit passive/auxiliary and non-control-flow rule requested by the user.

## Fix Evidence 2026-06-15T11:52:00+08:00

Changed:
- `src/server/services/workflowTemplateAuthoringGuide.ts`: model/skills guidance now says recommended phase skills are auxiliary attention metadata only, do not define workflow flow/phase order/transition/completion/permissions, and should be omitted when no installed or newly created skill fits.
- `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx`: tool prompt now carries the same rule for agents before create/update.

Green checks:
- `bun test src/server/services/workflowTemplateAuthoringGuide.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts` passed: 29 pass.
- `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/server/__tests__/workflowTemplates.test.ts` passed: 83 pass.
- `bun test src/server/services/workflowToolPolicy.test.ts src/server/services/workflowRuntimeService.test.ts` passed: 58 pass.
- `bun run check:server` passed. Full log: `C:\Users\11034\AppData\Local\Temp\cc-jiangxia-check-server-workflow-authoring.log`.
- `git diff --check -- src/server/services/workflowTemplateAuthoringGuide.ts src/server/services/workflowTemplateAuthoringGuide.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts` passed with line-ending warnings only.

Root cause:
- Agent-facing workflow authoring guidance already prevented guessed names in a narrow sense and server writes rejected missing skills, but it did not explicitly distinguish `phases[].skills` as auxiliary attention metadata rather than workflow phase/control-flow semantics. The schema intentionally accepts loose template objects, so the prompt/guide must carry this product boundary before the server rejection path.

## Terminal Status 2026-06-15T12:00:00+08:00

Status: awaiting-human-verify

Resolution:
- Tightened the agent-facing authoring contract so workflow phase skill references must be catalog-backed or created first, and must remain auxiliary/passive metadata.
- Preserved the existing service/API/runtime boundaries: create/update rejects unavailable recommended skills before persistence; imported or legacy unresolved skills remain visible dependency diagnostics; runtime phase flow remains controlled by phases, transitions, completion rules, and policy.

Human verification prompt:
- Re-run the built-in workflow authoring flow that previously proposed non-existent phase skills.
- Expected result: the agent should call or rely on `skill_catalog` / `skill_create` before assigning `phases[].skills`, and should omit `phases[].skills` entirely when no real skill fits the phase.

Learning capture:
- `specify learning capture-auto --command debug --session-file .planning/debug/workflow-authoring-skill-selection-semantics.md --format json` did not complete because the current debug session file is freeform Markdown, while the capture parser expects YAML-compatible section bodies.
- Durable learning for this change was instead recorded through project cognition update `upd-20260615T034331.770618100Z`.

## Expected Behavior

- Author-created workflow phase skill references should come from the shared skill catalog, or from a newly created skill that is then visible in that catalog.
- Importing someone else's workflow may preserve unresolved recommended skill references as warnings, because they are external dependencies.
- Recommended phase skills should only influence prompt attention/evidence; they must not define phase order, transitions, completion authority, tool permissions, or auto-execution.

## Eliminated

- `C1-authoring-admits-void-skills` as a persisted write bug: create/update live code and tests reject missing skills before writing.
- `C2-validator-severity-display-gap` for the current persisted template: storage/API show no invalid templates or persisted skill references in the inspected workflow.
