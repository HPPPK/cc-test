# Feature Specification: Workflow Phase Skills

**Feature Branch**: `007-workflow-phase-skills`
**Created**: 2026-05-29
**Status**: Review Draft
**Input**: User description: `.specify/discussions/workflows/handoff-to-specify.md`

## Overview

### Feature Goal

Workflow phases must be able to recommend real existing skills as first-class phase bindings instead of storing only prose skill guidance. A recommended phase skill is a phase-local reference to an existing skill package. It makes that skill more salient for the active phase, lets import/export and runtime diagnose whether the skill is available, and leaves lightweight evidence when the skill is used or clearly relevant but skipped or unavailable.

The first release uses recommended-first semantics. It does not automatically execute skills, does not make recommended skills completion gates, and does not create a separate workflow-only skill format.

### Intended Users and Value

- **Workflow authors**: select phase-recommended skills from the same available skill catalog users see in Settings > Skills and plugin capability navigation.
- **Workflow runners and agents**: receive active-phase prompt emphasis that says which selected skills deserve special attention when deciding whether a skill applies.
- **Workflow recipients**: import shared workflows with dependency diagnostics instead of discovering missing skills only at runtime.
- **Maintainers and reviewers**: get explicit schema, safety, runtime evidence, and compatibility requirements before implementation planning.

### Confirmed Product Outcome

A workflow template can bind each phase to existing skills as recommended phase skills. These bindings are resolved through a shared skill catalog, exported as dependencies, imported with warnings when missing, emphasized in active workflow prompts when available, and summarized only when they materially mattered.

## Confirmed Scope

### In Scope

- A first-class phase skill binding model over existing skills.
- Recommended-first phase skill semantics:
  - phase-selected skills are fixed in the phase definition,
  - the agent should pay special attention to them when deciding whether a skill applies,
  - the agent invokes a phase skill only when the current task matches the skill,
  - irrelevant phase skills are not invoked,
  - recommended skills do not block phase completion by default.
- A shared skill catalog and resolver used by workflow authoring, import/export, runtime resolution, and Settings-backed skill surfaces.
- Names-first skill references with source/provenance metadata only when needed for ambiguity, portability, or diagnostics.
- Dependency-aware workflow export and import preview.
- Import-with-warnings for missing recommended phase skills while preserving unresolved references.
- Runtime prompt emphasis and unavailable-state marking for active phase skills.
- Lightweight evidence for used recommended skills and clearly relevant skipped or unavailable skills.
- Desktop UI:
  - phase-local skill selector in `WorkflowTemplateEditor`,
  - import/export dependency diagnostics,
  - concise runtime skill status or expandable evidence in `WorkflowStatusPanel`.
- Compatibility with existing template unknown-field preservation and existing `skills` arrays.

### Out of Scope

- Automatic execution of recommended phase skills.
- Making recommended phase skills hard phase-start or phase-completion gates.
- Binding workflow phases directly to plugins as the primary object.
- Duplicating skill-owned description, applicability, reason, assets, scripts, or templates into workflow templates.
- Bundling arbitrary skill package contents into workflow exports by default.
- Granting tools, shell behavior, hooks, forked agents, model changes, or effort changes outside normal SkillTool and permission boundaries.
- Replacing existing workflow phase action policies or workflow-scoped tool rules.
- Recursive or unbounded skill orchestration.

### Deferred Or Future Scope

- Required or contract phase skills that can block phase start or completion.
  Reopen when a phase needs mandatory evidence or explicit skip approval.
- Explicit skill bundle mode for reviewed project-owned skills.
  Reopen only with a visible file list, provenance review, and security review.
- Automatic install or marketplace resolution for missing skill dependencies.
  Reopen after dependency manifest diagnostics are proven.
- Capability graph scheduling, skill preloading, or workflow-engine orchestration.
  Reopen only after recommended bindings prove insufficient.

## Must-Preserve Discussion Inputs

- **Source**: `.specify/discussions/workflows/handoff-to-specify.md`
- **Coverage Status**: source-grounded-discussion; project-cognition-stale-blocked
- **Planning Gate Status**: ready-for-specify-user-confirmed

### Mapped Must-Preserve Items

- `MP-001` goal: real recommended bindings, not prompt-only guidance -> preserved in feature goal, FR-001, FR-006, FR-014.
- `MP-002` scope: recommended skills, shared catalog, import/export, prompt emphasis, evidence -> preserved in confirmed scope and capability map.
- `MP-003` non-goal: no auto-exec or default completion block -> preserved in out-of-scope, FR-003, FR-021.
- `MP-004` decision: bind to skills, not plugins -> preserved in FR-002, FR-010.
- `MP-005` decision: shared catalog behind Settings > Skills -> preserved in FR-005 and UI requirements.
- `MP-006` decision: names-first references with metadata only when needed -> preserved in FR-004.
- `MP-007` decision: do not duplicate skill-owned metadata -> preserved in FR-007 and compatibility notes.
- `MP-008` decision: active prompt emphasis semantics -> preserved in FR-014.
- `MP-009` decision: bounded soft audit -> preserved in FR-016 and acceptance proof.
- `MP-010` decision: export template plus dependency manifest, no default bundle -> preserved in FR-011, FR-012.
- `MP-011` decision: missing recommended skills import with warnings -> preserved in FR-013 and edge cases.
- `MP-012` decision: phase-local selector in `WorkflowTemplateEditor` -> preserved in FR-017.
- `MP-013` decision: import/export diagnostics -> preserved in FR-018.
- `MP-014` decision: lightweight runtime status/evidence -> preserved in FR-019.
- `MP-015` non-goal: preserve SkillTool permission and safety boundaries -> preserved in security requirements and CA-004.
- `MP-016` tradeoff: future explicit bundle mode only for reviewed project-owned skills -> deferred.
- `MP-017` soft details: exact schema, resolver boundary, evidence storage -> resolved as product requirements here, with final storage design left to `/sp.plan`.

### Discussion Conflicts

No open discussion conflicts remain. Narrowing conflicts are recorded in `alignment.md#Out-Of-Scope Conflicts`.

## Scenarios and Usage Paths

### Primary Scenario - Author Adds Recommended Phase Skills

A workflow author edits a phase and selects skills that should receive active-phase attention.

**Usage Path**:
1. The author opens a workflow template in `WorkflowTemplateEditor`.
2. The author selects a phase and opens the recommended skills selector.
3. The selector shows skills from the shared catalog, grouped by source and marked with availability/provenance.
4. The author adds one or more skills to the phase.
5. The template saves the phase skill references without copying skill descriptions or trigger text.

**Acceptance Signals**:
- Selected skills persist as phase bindings.
- The phase does not store duplicated skill instructions as the source of applicability.
- Ambiguous or unavailable references are visible before save or start.

### Secondary Scenario - Share And Import A Workflow

A user exports a workflow that references phase skills and another user imports it.

**Usage Path**:
1. The exporter generates a workflow package.
2. The package includes the workflow template and a skill dependency manifest.
3. The importer previews the package.
4. Import preview resolves dependencies against the importer's shared catalog.
5. Missing recommended skills produce warnings, not import failure.
6. Import preserves missing references and marks them unavailable until resolved.

**Acceptance Signals**:
- The export does not imply skill package contents are bundled.
- Import preview reports available, missing, ambiguous, unsupported-source, and plugin-disabled states when applicable.
- Missing recommended skills remain in the imported template.

### Secondary Scenario - Agent Runs An Active Phase

An active workflow phase has recommended skills.

**Usage Path**:
1. Runtime resolves the active phase's selected skill references.
2. The active workflow prompt includes a distinct recommended phase skills block.
3. The prompt tells the agent to pay special attention to these skills when deciding whether a skill applies.
4. The agent invokes a recommended phase skill only when the current task matches its purpose.
5. Phase completion or report evidence records only used skills and clearly relevant skipped or unavailable skills.

**Acceptance Signals**:
- The active prompt is materially stronger than generic phase prose.
- Recommended skills do not override user, developer, system, security, or permission rules.
- Irrelevant recommended skills are not mechanically listed as unused.

### Edge Cases and Failure Paths

- Missing recommended skill at import: allow import, warn, preserve reference, mark unavailable.
- Missing recommended skill at runtime: mark unavailable in prompt/status; do not pretend invocation is possible.
- Ambiguous skill name: require source/provenance disambiguation before treating it as resolved.
- Plugin-provided skill with disabled plugin: report plugin-disabled and preserve the skill reference.
- Unsupported source on another machine: report unsupported-source and preserve the reference.
- Skill definition changed since workflow start: do not silently change running session semantics; report stale or changed provenance.
- Existing template has `skills` entries with `reason`: preserve compatible data, but do not treat `reason` as the new applicability source.
- Skill invocation requests tools/model/effort/fork/hooks/shell behavior: use normal SkillTool permission and safety behavior.

## Capability Decomposition

### Capability Map

- **Capability 1: Phase Skill Binding Identity**
  Supports: authoring, import/export, runtime resolution.
  Depends on: existing workflow template `skills` arrays and skill loader/source metadata.
  Delivery note: core.

- **Capability 2: Shared Skill Catalog And Resolver**
  Supports: Settings, workflow authoring, dependency diagnostics, runtime resolution.
  Depends on: `/api/skills`, `loadSkillsDir`, plugin skill metadata, and SkillTool command resolution.
  Delivery note: core.

- **Capability 3: Phase-Local Authoring UI**
  Supports: author adds recommended phase skills.
  Depends on: shared catalog and existing `WorkflowTemplateEditor`.
  Delivery note: enabling.

- **Capability 4: Workflow Package Dependency Manifest**
  Supports: workflow sharing and import preview.
  Depends on: workflow template export/import API and resolver status model.
  Delivery note: core.

- **Capability 5: Active Phase Prompt Emphasis**
  Supports: runtime agent behavior.
  Depends on: workflow runtime prompt assembly and SkillTool availability.
  Delivery note: core.

- **Capability 6: Lightweight Skill Evidence**
  Supports: phase completion, final report, runtime inspection, compaction/resume.
  Depends on: workflow session state, phase state, final report, report store, and desktop status panel.
  Delivery note: validation-oriented.

- **Capability 7: Compatibility, Safety, And Lifecycle Guardrails**
  Supports: safe migration, running sessions, resume, stale templates, missing templates.
  Depends on: template validation/registry, session state, workflow action policy, and SkillTool permissions.
  Delivery note: core.

### Capability Relationships

- Binding identity and shared resolver must land before authoring UI can be complete.
- Import/export diagnostics and runtime prompt behavior must use the same resolver status vocabulary.
- Runtime evidence must be stored where final reports and resume/compaction can preserve it.
- Safety and lifecycle rules constrain every capability; they are not optional UI polish.

## Requirements

### Functional Requirements

- **FR-001**: The system must model workflow phase skills as first-class references to existing skills, not as prompt-only prose guidance.
- **FR-002**: A phase skill binding must target a skill. If the skill comes from a plugin, plugin identity must be stored only as provenance/dependency metadata.
- **FR-003**: The default phase skill mode must be `recommended`; recommended bindings must not auto-execute and must not block import, phase start, or phase completion by default.
- **FR-004**: Skill references must be names-first. Source, plugin, namespace, version, content hash, or other qualified metadata must be added only for ambiguity, portability, provenance, or diagnostics.
- **FR-005**: Workflow authoring, import/export, and runtime resolution must consume a shared skill catalog/resolver aligned with Settings > Skills and plugin skill navigation.
- **FR-006**: The resolver must report at least `available`, `missing`, `ambiguous`, `unsupported-source`, `plugin-disabled`, and `invalid-reference` statuses. It may report `installable` when a known installer/source exists.
- **FR-007**: Phase bindings must not duplicate or become authoritative for skill-owned description, reason, when-to-use, assets, scripts, references, agents, or tools.
- **FR-008**: Existing template `skills` entries, including legacy `reason` fields and unknown fields, must remain readable and writable without data loss.
- **FR-009**: Template validation must validate phase skill reference shape and resolver diagnostics without rejecting missing recommended skills solely because they are unavailable.
- **FR-010**: Plugin-provided skill bindings must remain skill bindings; disabling or missing a plugin must produce dependency diagnostics rather than converting the binding into a plugin binding.
- **FR-011**: Workflow export must produce a package containing the workflow template plus a skill dependency manifest for referenced phase skills.
- **FR-012**: Workflow export must not bundle skill package contents by default and must not imply that referenced skills are included.
- **FR-013**: Workflow import preview must allow valid templates with missing recommended skills to be imported with warnings while preserving unresolved references.
- **FR-014**: Runtime prompt assembly must include a distinct active-phase recommended skills block that tells the agent these skills are selected for the phase, deserve special attention when deciding whether a skill applies, should be invoked when the current task matches, and should not be invoked when irrelevant.
- **FR-015**: Runtime prompt assembly must mark unavailable recommended phase skills as unavailable instead of presenting them as invocable skills.
- **FR-016**: Phase completion, workflow status, or final report evidence must record only recommended skills that were used or clearly relevant but skipped/unavailable, with concise rationale.
- **FR-017**: `WorkflowTemplateEditor` must provide phase-local recommended skill selection from the shared catalog, replacing or augmenting the existing advanced freeform skills textarea.
- **FR-018**: Workflow import/export UI must show dependency diagnostics for phase skills before import commit and before sharing.
- **FR-019**: Active workflow status UI must show recommended skill status/evidence only as a concise strip or expandable detail, not as a full checklist for every recommended skill.
- **FR-020**: Running, pending, completed, resumed, stale-template, and missing-template sessions must preserve enough skill reference/provenance state to explain which phase skill bindings shaped behavior.
- **FR-021**: Recommended phase skills must not globally enable SkillTool or grant any tool/model/effort/fork/hook/shell capability outside normal SkillTool invocation and permission handling.
- **FR-022**: Recursive or nested skill invocation risk must be bounded by preserving existing SkillTool protections and by leaving automatic orchestration out of scope.
- **FR-023**: Start/resume/runtime diagnostics must distinguish workflow failure from skill resolution failure or skill unavailability.
- **FR-024**: Existing workflow exports without dependency manifests must remain importable through the current validation path.

### Non-Functional Requirements

- **Security**: Skill-derived tool permissions, shell expansion, hooks, forked agents, model overrides, and effort overrides must remain subject to existing SkillTool and permission policies.
- **Compatibility**: Existing workflow templates and unknown fields must survive read/write/import/export. Old exports must remain accepted.
- **Observability**: Runtime and final report evidence must explain used/relevant-skipped/relevant-unavailable phase skills without logging sensitive skill file contents.
- **Accessibility**: Skill selector chips, dependency warnings, and runtime status must be keyboard reachable and not color-only.
- **Reliability**: Resolver status vocabulary must be stable across authoring, import/export, session start, resume, and final report.
- **Portability**: Dependency manifests must expose enough source/provenance metadata for another environment to understand what is missing or ambiguous.

### Boundary Constraints

- Project cognition is stale/blocked for this area; planning must verify implementation facts with live code.
- Server Settings skills API currently covers user/project/plugin while frontend types and runtime skill loading account for broader sources. Planning must align or explicitly diagnose the gap.
- Workflow status/report surfaces already store `skillProvenance` as template guidance; implementation must migrate semantics without losing existing reports.
- This spec is specification-only and does not authorize source edits.

## Acceptance Proof

### Acceptance Signals

- Authoring a phase skill through UI persists a skill reference and does not copy the skill's own instructions.
- Export output includes a dependency manifest listing every referenced phase skill.
- Import preview shows dependency status and still allows import when only recommended skills are missing.
- Active prompt includes recommended phase skills in a distinct, stronger-than-prose block and marks unavailable references.
- Final report or phase evidence includes used/relevant-skipped/relevant-unavailable skills only when signal-bearing.
- Recommended skills do not create phase-completion blockers unless a future required mode is explicitly added.

### Measurable Success Criteria

- **SC-001**: A workflow author can select and save phase recommended skills from the shared catalog without typing raw lines.
- **SC-002**: A workflow package imported into an environment missing one recommended skill produces a warning, preserves the reference, and remains importable.
- **SC-003**: A workflow run with available recommended skills includes active-phase prompt emphasis and can complete without invoking irrelevant recommended skills.
- **SC-004**: A workflow run with a clearly relevant unavailable recommended skill records that unavailable status in bounded evidence.
- **SC-005**: Same-area tests cover server validation/import/export/runtime prompt/final report and desktop editor/import-export/status behavior.

## Decision Capture

### Locked Decisions

- Approach A, recommended binding, is selected for this spec.
- Workflow phase skills bind to existing skills, not plugins.
- Recommended phase skills do not auto-execute or block completion by default.
- Missing recommended phase skills are import warnings and degraded runtime state, not import blockers.
- Workflow exports include dependency manifests and do not bundle skill package contents by default.
- The phase binding must not duplicate skill-owned applicability metadata.
- UI authoring belongs at the phase level in `WorkflowTemplateEditor`.

### User-Confirmed Deferrals

- Required/contract phase skills -> confirmed future mode -> reopen when a phase needs mandatory skill evidence.
- Default skill bundling -> confirmed out of first scope -> reopen only for reviewed project-owned bundle mode.
- Automatic execution/capability scheduling -> confirmed out of first scope -> reopen only if recommended bindings fail to meet product goals.

### Canonical References

- `.specify/discussions/workflows/handoff-to-specify.md`
- `.specify/discussions/workflows/handoff-to-specify.json`
- `.specify/discussions/workflows/requirements.md`
- `.specify/discussions/workflows/technical-options.md`
- `.specify/discussions/workflows/project-context.md`
- `src/tools/SkillTool/SkillTool.ts`
- `src/tools/SkillTool/prompt.ts`
- `src/skills/loadSkillsDir.ts`
- `src/server/services/workflowTypes.ts`
- `src/server/services/workflowRuntimeService.ts`
- `src/server/services/workflowToolPolicy.ts`
- `src/server/api/workflowTemplates.ts`
- `src/server/api/skills.ts`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`

## Consequence Analysis

### Lifecycle And State Behavior

- `CA-001`: Skill binding identity -> authoring/import/export/runtime must identify skills stably across user, project, plugin, managed, bundled, and MCP-like sources, or explicitly diagnose unsupported sources.
- `CA-002`: Priority precedence -> phase recommendation must be stronger than generic phase prose but must not override system, developer, user, permission, or security rules.
- `CA-003`: Missing/stale/disabled/invalid/unavailable skills -> import and runtime must preserve references and report degraded state.
- `CA-004`: Skill-derived capability effects -> normal SkillTool permission handling remains authoritative.
- `CA-005`: Session lifecycle -> running, pending, completed, resumed, stale-template, and missing-template sessions must preserve skill provenance/snapshot evidence.
- `CA-006`: Observability -> used, relevant-skipped, and relevant-unavailable recommended skills must be visible in bounded evidence.
- `CA-007`: Validation -> authoring and import/export must validate references and status without silently dropping unresolved dependencies.
- `CA-008`: UI -> authoring and inspection surfaces must show source, availability, and plugin provenance when relevant.
- `CA-009`: Compaction/resume -> evidence needed for later phase decisions must survive resume and report paths.
- `CA-010`: Recursion -> recommended bindings must not create automatic nested skill loops.

### Recovery And Validation

- Preserve old template fields and unknown fields to allow rollback.
- Accept old export payloads that lack manifests.
- Keep unresolved recommended skill references until the user explicitly removes or resolves them.
- Use same-area tests for server workflow templates, runtime prompt, report/evidence, sessions/resume, desktop workflow components, skills settings, and plugin skill navigation.
- Stop and reopen specification if any implementation plan requires auto-execution, plugin-primary bindings, default bundling, or safety-boundary weakening.

## Risks and Gaps

### Planning Risks

- The Settings skill API and runtime SkillTool loader do not currently expose identical source universes; planning must decide whether to extract a shared resolver or add explicit unsupported-source diagnostics.
- Existing `skillProvenance` currently means template guidance; implementation must avoid confusing old reports with new resolved skill evidence.
- Runtime evidence storage must be placed where final report, compaction, and resume can preserve it.
- Prompt emphasis must be strong enough to matter but not so strong that recommended skills become de facto mandatory.

### Information Gaps

- Exact schema field names for binding identity and dependency manifest are left to `/sp.plan`.
- Exact evidence storage location is left to `/sp.plan`, constrained by CA-005 and CA-009.
- Project cognition remains stale/blocked; planners must rely on live code until map maintenance catches up.
