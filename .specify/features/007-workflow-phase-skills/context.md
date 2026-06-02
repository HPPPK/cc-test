# Planning Context: Workflow Phase Skills

**Feature Branch**: `007-workflow-phase-skills`
**Created**: 2026-05-29
**Status**: Ready for user review
**Derived From**: `spec.md`, `alignment.md`, discussion sources, project cognition advisory output, and live repository evidence

## Planning Context

- Scope is one coherent feature: recommended workflow phase skill bindings over existing skills.
- The confirmed implementation boundary spans workflow template schema/validation, shared skill catalog/resolver, workflow import/export, active runtime prompt assembly, runtime evidence/reporting, and desktop workflow authoring/status UI.
- Default behavior is recommended-first. Do not introduce required/contract skills, automatic execution, default bundling, or plugin-primary bindings in the first implementation plan.
- Source cognition is stale/blocked; plan must verify all implementation facts with live code and tests.

## Relevant Repository Context

- `src/tools/SkillTool/prompt.ts`: SkillTool prompt instructs the agent to invoke a matching skill before any other response when a skill applies.
- `src/tools/SkillTool/SkillTool.ts`: validates skills by name, handles inline and `context=fork` execution, records skill usage, and can apply allowed-tool/model/effort context modifiers.
- `src/skills/loadSkillsDir.ts`: parses skill metadata such as `allowed-tools`, `disable-model-invocation`, `user-invocable`, `hooks`, `context=fork`, `agent`, `effort`, `shell`, and source/loaded path details.
- `src/server/services/workflowTypes.ts`: current `WorkflowSkillDeclaration` is `source: 'template'` plus `guidance` and provenance; it is not a resolved skill reference.
- `src/server/services/workflowRuntimeService.ts`: start phase copies `definition.skillDeclarations` into `phase.skillProvenance`; prompt assembly renders them as `Skill guidance`.
- `src/server/services/workflowToolPolicy.ts`: explicitly states current workflow skill declarations are prompt-level guidance and do not enable SkillTool globally.
- `src/server/api/workflowTemplates.ts`: import/export path currently wraps templates with `schemaVersion`, `exportedAt`, and `templates`; there is no skill dependency manifest.
- `src/server/api/skills.ts`: Settings skill API currently collects user, project, and plugin skills and supports detail lookup for those sources.
- `desktop/src/types/skill.ts`: frontend skill source model includes `user`, `project`, `plugin`, `mcp`, and `bundled`.
- `desktop/src/stores/skillStore.ts` and `desktop/src/api/skills.ts`: Settings skill list/detail state and API client.
- `desktop/src/components/skills/SkillList.tsx`: Settings groups skills by source.
- `desktop/src/components/plugins/PluginDetail.tsx`: plugin-provided skills navigate into the shared skill detail flow when plugin capabilities are enabled.
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`: current phase skills field is an advanced freeform textarea that maps lines into `{ name }` or `{ name, reason }`.
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`: current import preview/export generation surfaces exist and are the natural dependency diagnostics UI.
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`: runtime status panel currently shows workflow/model/artifact details but not phase skill status/evidence.
- `src/server/services/workflowFinalReport.ts` and `src/server/services/workflowReportStore.ts`: final reports persist `skillProvenance` and are the likely report evidence integration point.
- `src/server/api/sessions.ts`: workflow session API owns state retrieval, transition handling, resume projection, final report creation, and workflow report retrieval.

## Existing Patterns And Reuse Notes

- Template validation and registry writing already preserve unknown fields. Preserve this for old `skills` entries and future phase skill metadata.
- Workflow import/export already has preview and commit phases. Add dependency diagnostics to preview rather than creating a separate import flow.
- Workflow manager already centralizes Settings workflow template management. Keep phase skill authoring inside the selected phase editor.
- Plugin details already model plugins as containers for skills, commands, agents, hooks, MCP, and LSP. Workflow should reference skill entries, not plugin entries.
- Final report already aggregates phase `skillProvenance`; migrate or extend semantics carefully so old reports remain understandable.

## Integration Boundaries

- **Skill resolver boundary**: must bridge Settings skills API, runtime SkillTool command resolution, plugin skill names, and broader runtime sources.
- **Template boundary**: `phases[].skills` must remain compatible with existing arrays while gaining first-class reference/status semantics.
- **Import/export boundary**: export package gains dependency manifest; import preview resolves against local catalog and returns diagnostics.
- **Runtime prompt boundary**: active workflow prompt gains recommended phase skill emphasis but must not alter global tool permission semantics.
- **Session/report boundary**: runtime evidence must survive state writes, final report creation, resume, and compaction.
- **Desktop UI boundary**: editor, import/export dialog, and status panel consume diagnostics from server APIs rather than each inventing a skill inventory.

## Product Boundary Constraints

- Recommended skills are advisory/high-attention, not mandatory.
- Missing recommended skills are degraded state, not import blockers.
- Source/provenance metadata supports diagnostics and portability; it is not a requirement to fully qualify every binding.
- No default skill content bundling.
- No safety boundary weakening.

## Affected Object Map

Obligation ID: CA-001
Object / State Surface: phase skill binding identity and dependency manifest
Owner: `/sp.plan`
Consumers: workflow templates, import/export, runtime, desktop editor
Evidence: `workflowTypes.ts`, `workflowTemplateValidation.ts`, `workflowTemplates.ts`, `loadSkillsDir.ts`
Coverage Gap: exact fields unresolved

Obligation ID: CA-002
Object / State Surface: active phase prompt and SkillTool attention
Owner: `/sp.plan`
Consumers: agent runtime, SkillTool, workflow users
Evidence: `workflowRuntimeService.ts`, `SkillTool/prompt.ts`, `workflowToolPolicy.ts`
Coverage Gap: exact prompt wording and ranking/attention implementation unresolved

Obligation ID: CA-003
Object / State Surface: resolver statuses for missing/stale/disabled/invalid/unavailable skills
Owner: `/sp.plan`
Consumers: editor, import preview, runtime prompt, status panel
Evidence: `src/server/api/skills.ts`, `WorkflowImportExportDialog.tsx`, `WorkflowStatusPanel.tsx`
Coverage Gap: shared resolver does not yet exist

Obligation ID: CA-004
Object / State Surface: permission handling for skill-derived tool/model/effort/fork/hook/shell effects
Owner: `/sp.plan`
Consumers: SkillTool, permissions, workflow runtime
Evidence: `SkillTool.ts`, `loadSkillsDir.ts`, `workflowToolPolicy.ts`
Coverage Gap: implementation must prove no bypass

Obligation ID: CA-005
Object / State Surface: session snapshot/provenance for running, pending, completed, resumed, stale-template, missing-template states
Owner: `/sp.plan`
Consumers: sessions API, final reports, resume, status UI
Evidence: `workflowTypes.ts`, `sessions.ts`, `workflowFinalReport.ts`, `workflowReportStore.ts`
Coverage Gap: evidence storage location unresolved

Obligation ID: CA-006
Object / State Surface: observable used/skipped/unavailable evidence
Owner: `/sp.plan`
Consumers: final report, status panel, phase completion
Evidence: `workflowFinalReport.ts`, `WorkflowStatusPanel.tsx`, `workflowRuntimeService.ts`
Coverage Gap: evidence vocabulary and persistence shape unresolved

Obligation ID: CA-007
Object / State Surface: authoring/import/export validation
Owner: `/sp.plan`
Consumers: template API, desktop import/export, template editor
Evidence: `workflowTemplateValidation.ts`, `workflowTemplates.ts`, `WorkflowTemplateEditor.tsx`
Coverage Gap: resolver-backed diagnostics not present

Obligation ID: CA-008
Object / State Surface: authoring and inspection UI
Owner: `/sp.plan`
Consumers: workflow authors and runners
Evidence: `WorkflowTemplateEditor.tsx`, `WorkflowImportExportDialog.tsx`, `WorkflowStatusPanel.tsx`
Coverage Gap: final UX copy/layout unresolved

Obligation ID: CA-009
Object / State Surface: compaction/resume evidence preservation
Owner: `/sp.plan`
Consumers: resumed sessions and downstream phases
Evidence: `sessions.ts`, `src/services/compact/workflowSummaryCarryover.test.ts` path exists for workflow carryover coverage
Coverage Gap: exact carryover field unresolved

Obligation ID: CA-010
Object / State Surface: nested/recursive skill invocation behavior
Owner: `/sp.plan`
Consumers: SkillTool, agent loop, workflow runtime
Evidence: `SkillTool.ts` telemetry includes nested-skill depth; auto-exec is out of scope
Coverage Gap: no new loop guard required if auto-exec remains out of scope

## Consequence Notes

- `CA-001`: Resolve stable identity before UI work, otherwise import/export and runtime will drift.
- `CA-002`: Wording must be product-tested as stronger than prose but weaker than requirement.
- `CA-003`: Missing and plugin-disabled states must preserve references and remain visible.
- `CA-004`: The workflow runtime can recommend skills but cannot pre-grant skill effects.
- `CA-005`: Session state must explain which skill definition influenced a phase even after template/source changes.
- `CA-006`: Evidence must be signal-bearing and bounded.
- `CA-007`: Validation must run on create, update, duplicate, import preview, import commit, export, session start, and resume where relevant.
- `CA-008`: UI must avoid treating import/export as the primary authoring surface.
- `CA-009`: Resume/compaction cannot drop evidence required for later phase decisions.
- `CA-010`: No automatic nested skill orchestration in first scope.

## Dependency Impact Table

Obligation ID: CA-001
Upstream / Downstream Surface: `src/server/services/workflowTypes.ts` -> server API/desktop types
Impact: schema and type propagation
Required Handling: versioned compatible phase skill binding shape

Obligation ID: CA-003
Upstream / Downstream Surface: skill loader/API -> workflow import/export/runtime
Impact: divergent source universes can cause false missing/available states
Required Handling: shared resolver or explicit unsupported-source diagnostics

Obligation ID: CA-004
Upstream / Downstream Surface: SkillTool permission path -> workflow prompt/runtime
Impact: unsafe behavior if workflow grants capabilities directly
Required Handling: keep invocation through SkillTool and existing permission checks

Obligation ID: CA-005
Upstream / Downstream Surface: template/session snapshots -> resume/final report
Impact: source skill edits could silently alter active sessions
Required Handling: snapshot/provenance policy and stale diagnostics

Obligation ID: CA-008
Upstream / Downstream Surface: server diagnostics -> desktop editor/import/status UI
Impact: UI drift if status vocabulary differs
Required Handling: shared status types and tests

## Change Propagation Matrix

Change Surface: workflow template schema
Upstream Inputs: existing user/builtin templates and imports
Downstream Consumers: registry, editor, export, runtime
Constraint / Risk: must preserve unknown fields and old exports

Change Surface: skill catalog/resolver
Upstream Inputs: user/project/plugin/MCP/bundled/managed skill sources
Downstream Consumers: Settings, authoring, import/export, runtime
Constraint / Risk: server and runtime source coverage mismatch

Change Surface: runtime prompt assembly
Upstream Inputs: active phase state and resolved skill status
Downstream Consumers: agent behavior and SkillTool decisions
Constraint / Risk: must not become hidden auto-execution

Change Surface: final report/evidence
Upstream Inputs: phase completion and SkillTool use/non-use
Downstream Consumers: workflow status, report store, resume/compaction
Constraint / Risk: old `skillProvenance` meaning may conflict with new evidence semantics

Change Surface: desktop workflow UI
Upstream Inputs: catalog and diagnostics APIs
Downstream Consumers: workflow authors and runners
Constraint / Risk: avoid noisy checklist UI and nested card-heavy surfaces

## Locked Decisions Carry-Forward

- Use Approach A recommended binding.
- Bind to skills, not plugins.
- Use shared skill catalog/resolver aligned with Settings > Skills.
- Preserve names-first references with optional qualified metadata.
- Do not duplicate skill-owned applicability metadata.
- Export dependency manifest; do not bundle skill contents by default.
- Missing recommended skills import with warnings and degraded runtime state.
- Phase-local selector is the primary authoring UI.
- Runtime evidence is lightweight and bounded.

## Must-Preserve Carry-Forward

- `MP-001` through `MP-015`: preserve as first-scope constraints.
- `MP-016`: deferred future bundle mode only.
- `MP-017`: resolve schema/resolver/evidence details during plan without changing product semantics.
- Stop-and-reopen conditions:
  - if implementation requires auto-execution by default,
  - if workflow binds to plugins instead of skills,
  - if missing recommended skills block import or are silently dropped,
  - if permission/safety boundaries are bypassed,
  - if export implies skill contents are bundled.

## Verification Entry Points

- Server:
  - `src/server/__tests__/workflowTemplates.test.ts`
  - `src/server/__tests__/skills.test.ts`
  - `src/server/__tests__/sessions.test.ts`
  - `src/server/services/workflowRuntimeService.test.ts`
  - `src/server/services/workflowFinalReport.test.ts`
  - `src/server/services/workflowReportStore.test.ts`
  - `src/server/services/workflowTemplateRegistryService.test.ts`
  - `src/server/services/workflowToolPolicy.test.ts`
  - `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`
- Desktop:
  - `desktop/src/components/workflow/WorkflowComponents.test.tsx`
  - `desktop/src/__tests__/skillsSettings.test.tsx`
  - `desktop/src/__tests__/pluginsSettings.test.tsx`
  - `desktop/src/api/sessions.test.ts`
  - `desktop/src/stores/sessionStore.test.ts`
- Compact/resume:
  - `src/services/compact/workflowSummaryCarryover.test.ts`
- Gate expectation:
  - run narrow same-area checks first, then `bun run verify` before implementation completion.

## Canonical References

- `.specify/discussions/workflows/handoff-to-specify.md`
- `.specify/discussions/workflows/handoff-to-specify.json`
- `.specify/discussions/workflows/discussion-log.md`
- `.specify/discussions/workflows/requirements.md`
- `.specify/discussions/workflows/open-questions.md`
- `.specify/discussions/workflows/technical-options.md`
- `.specify/discussions/workflows/project-context.md`
- `.specify/discussions/workflows/discussion-state.md`
- `.specify/project-cognition/status.json`

## Outstanding Questions

- Exact phase skill binding fields.
- Exact shared catalog/resolver module boundary.
- Exact evidence storage location and final report shape.
- Whether first implementation fully supports all runtime skill sources or starts with diagnostics for unsupported sources.

These are planning details, not product blockers, as long as they preserve the locked decisions.

## Deferred / Future Ideas

- Required/contract phase skills.
- Default skill package bundling.
- Automatic installation or marketplace repair for missing dependencies.
- Capability graph scheduling or automatic phase skill execution.
