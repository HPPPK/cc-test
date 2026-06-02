# Research: Workflow Phase Skills

## Research Scope

This research resolved implementation-shaping questions left by `spec.md`:

- Where the shared skill resolver belongs.
- How phase bindings should identify existing skills without duplicating skill metadata.
- How import/export should represent dependencies.
- How runtime prompt emphasis should interact with SkillTool.
- Where bounded evidence should live.
- How to preserve compatibility and safety boundaries.

Project cognition was stale/blocked, so all implementation facts below are backed by live code reads.

## Decision RD-001: Shared Server Resolver Is Authoritative

**Decision**: Create or extract a server-side workflow phase skill resolver service and consume it from authoring, validation, import/export, runtime prompt assembly, summary/report state, and desktop APIs.

**Rationale**: `src/server/api/skills.ts` currently exposes user/project/plugin skill metadata for Settings. `desktop/src/types/skill.ts` already has broader source vocabulary (`mcp`, `bundled`), while `src/skills/loadSkillsDir.ts` and `src/tools/SkillTool/SkillTool.ts` account for managed, bundled, MCP, plugin, conditional, and dynamic skills. A shared resolver prevents desktop, import/export, and runtime from developing inconsistent availability rules.

**Alternatives considered**:

- Desktop-only resolution through `skillStore`: rejected because import/export and runtime need server diagnostics.
- Fully qualified references everywhere: rejected because the selected product model is names-first with metadata only when needed.
- Treat unsupported runtime sources as missing: rejected because unsupported-source is more truthful and preserves future portability.

**Validation need**: resolver tests for `available`, `missing`, `ambiguous`, `unsupported-source`, `plugin-disabled`, `invalid-reference`, and optional `installable`.

## Decision RD-002: Names-First Binding With Optional Provenance

**Decision**: Extend existing `phases[].skills` entries into `WorkflowPhaseSkillReference` while preserving old `{ name, reason }` entries and unknown fields.

**Rationale**: `workflowTemplateValidation.ts` and `workflowTemplateRegistryService.ts` already preserve unknown fields and normalize phase `skills`. Reusing that surface keeps old templates valid and avoids a parallel schema. `reason` can remain legacy data, but it must not become authoritative skill applicability.

**Core shape**:

- `name`: required skill name/reference.
- `mode`: defaults to `recommended`.
- `source`, `pluginName`, `namespace`, `version`, `contentHash`, `referenceId`: optional disambiguation/provenance.
- `reason`: legacy compatibility only.
- unknown fields: preserved.

**Rejected**: copying skill descriptions, "when to use" text, assets, scripts, tools, hooks, model, effort, or agents into the workflow template.

## Decision RD-003: Dependency Manifest On Export, No Default Bundle

**Decision**: Workflow export should include the template package plus a skill dependency manifest with resolver snapshots, but not skill package contents.

**Rationale**: `src/server/api/workflowTemplates.ts` currently exports `{ schemaVersion, exportedAt, templates }`. The new manifest can be additive/versioned while old exports remain importable. Default bundling would create security and provenance risk and is explicitly deferred.

**Compatibility**:

- Import must accept old packages without a manifest.
- Import must accept valid templates with missing recommended skills.
- Missing, plugin-disabled, or unsupported-source recommended skills are warnings unless the reference shape is invalid.

## Decision RD-004: Runtime Prompt Uses Recommendation Snapshot

**Decision**: On phase start/session start, resolve phase skill references into a persisted snapshot. `workflowRuntimeService.ts` should render a distinct active-phase "Recommended phase skills" prompt block from the snapshot instead of only generic `Skill guidance`.

**Rationale**: Current `workflowRuntimeService.ts` copies `definition.skillDeclarations` into `phase.skillProvenance` and renders them as `Skill guidance`. `workflowToolPolicy.ts` explicitly says current workflow skill declarations are prompt-level guidance and do not enable SkillTool globally. The new prompt block must be stronger than ordinary prose but not mandatory.

**Prompt semantics**:

- These skills are selected for the active phase.
- Pay special attention when deciding whether a skill applies.
- Invoke through normal SkillTool only when the current task matches.
- Do not invoke when irrelevant.
- Mark unavailable recommendations as unavailable.

## Decision RD-005: Evidence Is Bounded And Signal-Bearing

**Decision**: Store evidence only for recommended skills that were used, clearly relevant but skipped, or clearly relevant but unavailable.

**Rationale**: The spec requires lightweight evidence. A checklist of every unused recommendation would be noisy and would weaken reports. Existing final report/session surfaces can carry phase evidence once the runtime state shape is extended.

**Evidence outcomes**:

- `used`
- `relevant-skipped`
- `relevant-unavailable`

**Rejected**: storing every recommendation as `unused`.

## Decision RD-006: SkillTool Remains The Safety Boundary

**Decision**: Workflow runtime must never apply skill-derived tools, shell behavior, hooks, forked agents, model, or effort changes directly. It may recommend skills in prompt/status, but invocation remains through `SkillTool`.

**Rationale**: `SkillTool.ts` validates skill names, checks permission rules, applies context modifiers, handles forked execution, and records usage. `loadSkillsDir.ts` shows that skill metadata can affect tools, hooks, shell, model, effort, and agents. Applying those effects from workflow recommendations would bypass the reviewed boundary.

**Validation need**: negative tests proving recommended phase skills do not auto-invoke and do not globally enable SkillTool.

## Decision RD-007: UI Uses Existing Workflow Surfaces

**Decision**: Implement desktop UX in the existing workflow surfaces:

- `WorkflowTemplateEditor`: phase-local recommended skill selector backed by catalog/resolver data.
- `WorkflowImportExportDialog`: dependency diagnostics for export and import preview.
- `WorkflowStatusPanel`: concise status strip or expandable evidence detail.

**Rationale**: These are the existing surfaces for template authoring, sharing, and runtime workflow inspection. Creating a new workflow skill management page would duplicate navigation and blur ownership.

## Assumptions To Validate During Implementation

- Content hash/version can be derived from existing skill metadata or source file content without logging skill contents.
- First implementation may return `unsupported-source` for sources not safely covered by the shared resolver.
- Existing `skillProvenance` can be extended or migrated without confusing old final reports.
- Existing completion/report flows can store bounded evidence without changing phase completion semantics.

## Live Evidence Read

- `src/tools/SkillTool/prompt.ts`
- `src/tools/SkillTool/SkillTool.ts`
- `src/skills/loadSkillsDir.ts`
- `src/server/api/skills.ts`
- `src/server/api/sessions.ts`
- `src/server/api/workflowTemplates.ts`
- `src/server/services/workflowTypes.ts`
- `src/server/services/workflowTemplateValidation.ts`
- `src/server/services/workflowTemplateRegistryService.ts`
- `src/server/services/workflowSessionCreateService.ts`
- `src/server/services/workflowRuntimeService.ts`
- `src/server/services/workflowToolPolicy.ts`
- `src/server/services/workflowSummary.ts`
- `src/server/services/workflowFinalReport.ts`
- `src/server/services/workflowReportStore.ts`
- `desktop/src/types/skill.ts`
- `desktop/src/types/session.ts`
- `desktop/src/api/skills.ts`
- `desktop/src/api/sessions.ts`
- `desktop/src/stores/skillStore.ts`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`
