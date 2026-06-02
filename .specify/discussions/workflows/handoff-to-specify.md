# Handoff To sp-specify: Workflow Phase Skills

- discussion_slug: workflows
- drafted_at: 2026-05-29T15:35:05.2241333+08:00
- handoff_goal: Specify workflow phase skills as recommended bindings to existing skills, including shared-catalog authoring, dependency-aware import/export, active-phase prompt behavior, and lightweight runtime evidence.
- handoff_status: handoff-ready
- quality_gate.status: user-confirmed
- user_review_required: true
- user_confirmed_at: 2026-05-29T15:54:40.6502152+08:00

## Context Boundary

- current_project_root: `F:\github\cc-jiangxia`
- target_project_root: `F:\github\cc-jiangxia`
- path_status: user-confirmed
- boundary_confidence: medium
- reference_projects: none
- external_systems: none
- boundary_unknowns: none blocking

### Current Project Roles

- role: discussion-host
  - scope: Stores this `sp-discussion` session and durable artifacts.
  - evidence_source: current working directory and `.specify/discussions/workflows/`
  - notes: The active repository is the discussion host.
- role: product-context
  - scope: Overall `cc-jiangxia` workflows product and agent capability direction.
  - evidence_source: user selected a fresh overall workflow direction.
  - notes: Discussion is not resuming prior handoff-ready workflow discussions.

### Target Project Roles

- role: implementation-target
  - scope: `cc-jiangxia` workflow template, runtime, import/export, skill catalog, and desktop workflow authoring surfaces.
  - evidence_source: user direction plus live reads in `project-context.md`
  - notes: Current project cognition was stale/blocked; live repository evidence is authoritative.

## Implementation Target

Target the existing workflow and skill surfaces in `F:\github\cc-jiangxia`.

Likely target paths to verify during specification/planning:

- `src/server/services/workflowTypes.ts`
- `src/server/services/workflowTemplateValidation.ts`
- `src/server/services/workflowRuntimeService.ts`
- `src/server/services/workflowToolPolicy.ts`
- `src/server/services/workflowTemplateRegistryService.ts`
- `src/server/api/workflowTemplates.ts`
- `src/server/api/skills.ts`
- `src/skills/loadSkillsDir.ts`
- `src/tools/SkillTool/SkillTool.ts`
- `src/tools/SkillTool/prompt.ts`
- `desktop/src/types/skill.ts`
- `desktop/src/types/session.ts`
- `desktop/src/api/skills.ts`
- `desktop/src/stores/skillStore.ts`
- `desktop/src/components/skills/SkillList.tsx`
- `desktop/src/components/plugins/PluginDetail.tsx`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- `desktop/src/components/workflow/WorkflowTemplateManager.tsx`
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`
- corresponding same-area tests under `src/server/__tests__`, `src/server/services/*.test.ts`, `desktop/src/__tests__`, and `desktop/src/components/workflow/*.test.tsx`

Target paths still to verify:

- Whether a new shared skill catalog service should be extracted from `src/server/api/skills.ts` and `src/skills/loadSkillsDir.ts`.
- Whether active workflow runtime evidence belongs in session state, phase run records, final report records, or all three.

Current project cognition status: blocked/stale. Treat project cognition as advisory only; prove implementation facts with live code before changing behavior.

## Source Evidence

- source_type: live-code
  - evidence_status: proved
  - source: `src/tools/SkillTool/prompt.ts`
  - claim: Matching skills are a blocking requirement for the agent to consider before responding.
- source_type: live-code
  - evidence_status: proved
  - source: `src/tools/SkillTool/SkillTool.ts`
  - claim: Existing skills can be invoked by name and may affect allowed tools, model, effort, inline context, or forked execution.
- source_type: live-code
  - evidence_status: proved
  - source: `src/skills/loadSkillsDir.ts`
  - claim: Runtime skill sources include broader origins than current workflow template skill validation, including plugin, managed, bundled, and MCP.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/services/workflowTypes.ts`
  - claim: Current `WorkflowSkillDeclaration` is prompt guidance from templates, not an executable skill binding.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/services/workflowRuntimeService.ts`
  - claim: Runtime prompt assembly currently renders workflow skill guidance as guidance.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/services/workflowToolPolicy.ts`
  - claim: Current policy explicitly says workflow skill declarations do not enable SkillTool globally.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/services/workflowTemplateValidation.ts`
  - claim: Current phase `skills` normalization allows objects with `name`, limited source values, optional `reason`, and unknown fields.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/api/workflowTemplates.ts`
  - claim: Current workflow export exports template JSON and does not bundle skill package contents.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/api/skills.ts`, `desktop/src/api/skills.ts`, `desktop/src/stores/skillStore.ts`
  - claim: Settings > Skills is backed by a skills API and desktop skill store, but current server collection primarily covers user/project/plugin skills.
- source_type: live-code
  - evidence_status: proved
  - source: `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
  - claim: Phase skills are currently edited through an advanced freeform textarea and converted line-by-line into skill declarations.
- source_type: user-confirmation
  - evidence_status: confirmed
  - source: discussion log
  - claim: User confirmed phase skills should bind to skills, not plugins; plugin identity is provenance/dependency only.
- source_type: user-confirmation
  - evidence_status: confirmed
  - source: discussion log
  - claim: User confirmed import-with-warnings for missing recommended phase skills.
- source_type: user-confirmation
  - evidence_status: confirmed
  - source: discussion log
  - claim: User confirmed UI mainline: phase-local selector, import/export diagnostics, lightweight runtime status.

## Must-Preserve Ledger

| id | type | claim | source | downstream_requirement | blocking_level | owner | latest_resolve_phase | status | deferred_to | stop_and_reopen_condition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MP-001 | goal | Workflow phase skills should become real recommended bindings to existing skills, not prompt-only workflow guidance. | user confirmations; `requirements.md` | Spec must define phase skill as a first-class binding concept over existing skills. | hard | downstream-contract | specification | mapped |  | Reopen if phase skills are represented only as prose guidance. |
| MP-002 | scope | First scope targets recommended phase skills, shared-catalog authoring, dependency-aware import/export, active-phase prompt emphasis, and lightweight runtime evidence. | `requirements.md` | Keep scope unified and do not expand into full workflow engine scheduling. | hard | downstream-contract | specification | mapped |  | Reopen if scope expands to auto-execution or workflow engine orchestration by default. |
| MP-003 | non_goal | Recommended phase skills must not auto-execute or block phase completion by default. | user confirmations | Spec must reserve blocking behavior for future required/contract mode. | hard | downstream-contract | specification | mapped |  | Reopen if recommended skills become mandatory completion gates. |
| MP-004 | decision | Workflow phase bindings target skills, not plugins; plugin identity is provenance/dependency for plugin-provided skills. | user confirmation | Schema and UI must store skill identity first and plugin metadata second. | hard | downstream-contract | specification | mapped |  | Reopen if workflow templates bind to plugins as the primary object. |
| MP-005 | decision | Phase skill selection comes from the shared capability catalog behind Settings > Skills and plugin capability navigation. | user confirmation; live code | Spec must define or align a shared catalog/resolver consumed by settings, workflow authoring, import/export, and runtime. | hard | downstream-contract | specification | mapped |  | Reopen if workflow authoring uses a separate skill inventory. |
| MP-006 | decision | Skill references are names-first; source/qualified metadata is added only when ambiguity or portability requires it. | user confirmation | Schema should keep authoring simple while preserving disambiguation fields. | hard | downstream-contract | specification | mapped |  | Reopen if schema requires verbose fully-qualified references for all skills without need. |
| MP-007 | decision | The phase binding must not duplicate skill-owned description, reason, or appliesWhen semantics. | user confirmation | New UI/schema should not copy skill instructions into workflow templates; existing `reason` must not become the canonical trigger source. | hard | downstream-contract | specification | mapped |  | Reopen if templates duplicate skill descriptions/triggers as source of truth. |
| MP-008 | decision | Active phase prompt semantics: selected skills are for this phase; pay special attention; invoke when current task matches; do not invoke when irrelevant. | user confirmation | Runtime prompt assembly must include this behavior without overriding user/system/developer/safety rules. | hard | downstream-contract | specification | mapped |  | Reopen if prompt semantics are weaker than normal guidance or stronger than mandatory invocation. |
| MP-009 | decision | Soft audit records used recommended skills and clearly relevant skipped/unavailable skills only. | user confirmation | Completion/report design must avoid exhaustive noisy checklists. | hard | downstream-contract | specification | mapped |  | Reopen if every recommended skill is mechanically listed as not relevant. |
| MP-010 | decision | Workflow sharing exports template plus skill dependency manifest and does not bundle skill package contents by default. | user confirmation | Export/import spec must include dependency metadata and avoid copying arbitrary skill files. | hard | downstream-contract | specification | mapped |  | Reopen if export silently implies skills are bundled. |
| MP-011 | decision | Missing recommended phase skills allow import with warnings; references are preserved and marked unavailable. | user confirmation | Import preview and runtime must show degraded state without blocking import by default. | hard | downstream-contract | specification | mapped |  | Reopen if missing recommended skills are silently dropped or block import. |
| MP-012 | decision | UI first scope is a phase-local skill selector in `WorkflowTemplateEditor`. | user confirmation; live code | Desktop spec should replace or augment the advanced skills textarea with a shared-catalog selector. | hard | downstream-contract | specification | mapped |  | Reopen if authoring moves to only a workflow-level dependency page. |
| MP-013 | decision | Import/export surfaces show dependency diagnostics as supporting UI. | user confirmation | `WorkflowImportExportDialog` spec should expose available/missing/ambiguous/unsupported/installable statuses. | hard | downstream-contract | specification | mapped |  | Reopen if imported workflows hide dependency problems. |
| MP-014 | decision | Runtime UI should show lightweight recommended skill status/evidence only when useful. | user confirmation | Active workflow status should avoid full checklist UX. | soft | downstream-contract | specification | mapped |  | Reopen if runtime UI becomes noisy or hides unavailable relevant skills. |
| MP-015 | non_goal | Skill-derived permissions, shell behavior, hooks, forked agents, model changes, and effort changes must not bypass existing permission/safety boundaries. | Senior Consequence Analysis | Spec and plan must keep SkillTool permission semantics explicit. | hard | downstream-contract | planning | mapped |  | Reopen if workflows can indirectly grant tools or run skill effects without normal checks. |
| MP-016 | tradeoff | Future explicit bundle mode may exist only for reviewed project-owned skills with visible file list/security review. | discussion decision | Keep bundling out of default first scope. | soft | downstream-contract | specification | deferred | future-extension | Reopen if first scope tries to bundle user/plugin/MCP skill package contents. |
| MP-017 | blocking_question | Exact schema fields, catalog coverage, and runtime evidence storage are unresolved implementation details, not product blockers. | assessment | Resolve during specification/planning without changing confirmed behavior. | soft | downstream-contract | planning | deferred | specification/planning | Reopen if these details require changing confirmed product semantics. |

## Functional Requirements For sp-specify

1. Define a first-class workflow phase skill binding model over existing skills.
2. Preserve recommended-first semantics as the default mode.
3. Add active phase prompt emphasis for selected recommended skills.
4. Integrate phase skill resolution with a shared skill catalog/resolver aligned with Settings > Skills.
5. Preserve plugin identity only as provenance/dependency for plugin-provided skills.
6. Validate phase skill references on create, update, duplicate, import preview, import commit, export, session start, and resume.
7. Add workflow package export with skill dependency manifest.
8. Import workflows with missing recommended phase skills using warnings and degraded state, not import failure.
9. Keep missing skill references in templates/snapshots until resolved or explicitly removed.
10. Record lightweight soft audit evidence for used or clearly relevant skipped/unavailable recommended phase skills.
11. Upgrade desktop workflow template authoring to select phase skills from the shared skill catalog.
12. Show dependency diagnostics in workflow import/export.
13. Show only lightweight active runtime skill status/evidence.

## Non-Goals

- Do not auto-execute recommended phase skills.
- Do not make recommended phase skills hard completion gates.
- Do not duplicate skill descriptions, triggers, or assets into workflow templates.
- Do not bind workflow phases directly to plugins.
- Do not bundle arbitrary skill package contents in workflow export by default.
- Do not override system, developer, security, or explicit user safety boundaries.
- Do not silently mutate running/resumed sessions when underlying skill definitions change.

## UI Discussion

- ui_discussion_status: completed
- ui_sketches_present: false
- ui_sketch_summary: none
- ui_sketch_reference: none

Confirmed UI requirements:

- Phase skill selection belongs in the selected phase area of `WorkflowTemplateEditor`.
- The selector should use the shared skill catalog, grouped by source.
- Selected skills should display compact chips/list items with name, source, availability, and plugin provenance when relevant.
- Import/export should show workflow-level skill dependency diagnostics.
- Runtime workflow status should show recommended skill status only as a concise strip or expandable evidence section.
- UI should avoid full checklist behavior for every recommended skill.

## Blocking Unknowns

Hard unknowns: none.

Soft unknowns:

- Exact phase skill binding schema fields.
- Exact shared catalog service/resolver boundary.
- Whether first implementation aligns all runtime skill sources or starts with user/project/plugin plus explicit unsupported-source diagnostics.
- Exact runtime evidence storage and report shape.
- Future required/contract phase skill behavior.

## Downstream Instructions

- Treat this as one coherent feature, not separate unrelated changes.
- Preserve current workflow template unknown-field compatibility and migration safety.
- Prefer schema evolution that can read existing `skills` arrays.
- Decide whether existing `reason` fields are preserved as unknown/legacy metadata, deprecated, or migrated, but do not make them the new source of skill applicability.
- Use live code as authority because project cognition was stale/blocked.
- Add tests proportional to affected surfaces: server validation/import/export/runtime prompt/session resume and desktop editor/import/export/status UI.
- Include regression coverage for missing, ambiguous, unavailable, plugin-disabled, stale, and resolved skills.
- Include permission/safety coverage for any skill-derived allowed tools, shell behavior, forked agents, model, or effort effects.

## Senior Consequence Analysis

### Affected Object Map

- Skill catalog entries from user, project, plugin, managed, bundled, and MCP sources.
- Skill metadata including allowed tools, model, effort, `context=fork`, agent, hooks, shell expansion, user invocability, and disable-model-invocation.
- SkillTool invocation records and context modifiers.
- Workflow templates and phase skill declarations.
- Workflow template validation, registry writes, unknown-field preservation, import/export wrappers, and desktop authoring APIs.
- Workflow session state, phase runs, template snapshots, active prompts, final reports, and resume/stale/missing-template states.
- Desktop Settings > Skills, Plugin Detail capability navigation, Workflow Template Editor, Workflow Import/Export Dialog, Workflow Manager, and Workflow Status Panel.

### State-Behavior Matrix

- created: resolve selected phase skill references and record diagnostics before phase work starts.
- running: surface recommended skills in active phase prompt; mark unavailable skills explicitly.
- pending-confirmation: preserve used/skipped/unavailable evidence before transition approval.
- failed: distinguish workflow failure from skill resolution/execution failure.
- cancelled: do not retry skill resolution/execution automatically.
- completed: final report preserves relevant phase skill evidence.
- resumed: use session snapshot/provenance and re-resolve carefully; do not silently change behavior from edited skill definitions.
- stale-template: avoid replacing session skill bindings with newer template bindings without a defined policy.
- missing-template: preserve snapshot skill bindings if available and report missing source template separately.

### Dependency Impact Table

- `src/tools/SkillTool/SkillTool.ts`: invocation, permissions, forked behavior, model/effort context modifiers, audit.
- `src/tools/SkillTool/prompt.ts`: matching skill invocation expectations.
- `src/skills/loadSkillsDir.ts`: actual runtime skill sources and metadata.
- `src/server/api/skills.ts`: current Settings skill catalog API; likely needs shared resolver extraction or alignment.
- `src/server/services/workflowTypes.ts`: workflow schema/session/final report contracts.
- `src/server/services/workflowTemplateValidation.ts`: template skill reference validation and normalization.
- `src/server/services/workflowRuntimeService.ts`: active phase prompt assembly and runtime evidence.
- `src/server/services/workflowToolPolicy.ts`: current boundary between prompt guidance and tool/SkillTool capability.
- `src/server/api/workflowTemplates.ts`: export/import package and dependency diagnostics.
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`: primary authoring UI.
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`: dependency diagnostics UI.
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`: active runtime status/evidence UI.

### Recovery And Validation Contract

- Add stable schema and migration/compatibility handling before changing authoring UI.
- Validate skill references without requiring missing recommended skills to block import.
- Preserve unresolved references in templates and session snapshots.
- Record resolution status and soft audit evidence in durable state/report paths.
- Keep permission prompts explicit for skill-derived tools, shell behavior, hooks, forked agents, model changes, and effort changes.
- Provide rollback by preserving old template fields and unknown fields.
- Verify with unit tests, server request-shape tests, desktop component tests, and targeted workflow runtime tests.

### Coverage Gaps

- Project cognition was stale/blocked; downstream must use live code reads and may refresh cognition later.
- Current Settings skill API and runtime skill loader may not expose identical source universes.
- Exact storage location for skill resolution/evidence is not selected.
- Required/contract phase skill behavior is intentionally future scope.

### Consequence Obligations

- CA-001: Define stable workflow skill binding identity across local, bundled, plugin, managed, and MCP sources. Owner workflow: sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if a spec lacks source/version semantics.
- CA-002: Define priority precedence without overriding system, developer, security, or explicit user safety boundaries. Owner workflow: sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if "higher priority" implies unsafe override.
- CA-003: Define behavior for missing, stale, disabled, invalid, or unavailable workflow skills. Owner workflow: sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if missing skills silently degrade to plain prompt text.
- CA-004: Preserve explicit permission handling for skill-derived tools, shell expansion, hooks, forked agents, model changes, and effort changes. Owner workflow: sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if workflow skill execution bypasses existing SkillTool permission semantics.
- CA-005: Snapshot or preserve workflow skill provenance for running, pending, completed, resumed, stale-template, and missing-template sessions. Owner workflow: sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if source skill edits can silently change an active session.
- CA-006: Make workflow skill execution or non-use observable to the user and downstream artifacts. Owner workflow: sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if relevant skill use/skip/unavailability is invisible.
- CA-007: Validate workflow skill bindings in workflow template authoring and import/export paths. Owner workflow: sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if invalid references persist without diagnostics.
- CA-008: Define UI requirements for authoring and inspecting workflow skill bindings. Owner workflow: sp-specify. Latest resolve phase: specification. Status: mapped. Stop-and-reopen: if UI state labels for missing/unavailable/used/skipped are absent.
- CA-009: Preserve workflow skill evidence through compaction and resume. Owner workflow: sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if compaction drops evidence required for later phase decisions.
- CA-010: Prevent recursive or unbounded nested skill invocation. Owner workflow: sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if auto-invocation or required invocation is introduced without depth, loop, or retry limits.

## Quality Gate

- status: user-confirmed
- self_reviewed_at: 2026-05-29T15:35:05.2241333+08:00
- user_review_required: true
- user_confirmed_at: 2026-05-29T15:54:40.6502152+08:00
- coverage_status: source-grounded-discussion; project-cognition-stale-blocked
- planning_gate_status: ready-for-specify-user-confirmed
- hard_unknown_count: 0
- open_conflict_count: 0
- blocked_reasons: []

## Next Step

This handoff is user-confirmed and handoff-ready. Use the generated integration's `sp-specify` command form with `.specify/discussions/workflows/handoff-to-specify.md` only when the user explicitly requests the next stage.
