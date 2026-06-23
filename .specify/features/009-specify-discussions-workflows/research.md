# Research: Workflow Phase Execution Contracts

**Date**: 2026-06-12
**Input**: `spec.md`, `alignment.md`, `context.md`, `references.md`, project cognition query, passive learnings, and targeted live repository reads

## Summary

The safest implementation approach is to extend existing workflow template, session runtime, phase skill resolver, SkillTool, import/export, and desktop workflow UI boundaries. Several target behaviors already exist, but they must be classified, hardened, and covered by same-area tests rather than assumed complete. Project cognition is useful for route selection but remains partial for workflow runtime/editor facts, so live code and tests are the proof surface.

## Decisions

### Compatibility-First Phase Contract

- **Recommendation**: expose grouped `intent`, `contract`, and `evidencePolicy` semantics as a compatibility projection over existing flat fields before any persisted grouped migration.
- **Rationale**: `workflowTemplateValidation.ts` and the desktop editor already normalize phase objective, instructions, intake, handoff, execution rules, output artifact, completion criteria, and transition authority. A destructive storage change would violate MP-011 and repository persistence rules.
- **Alternatives Considered**:
  - Direct grouped persistence: rejected for first scope because old-template fixtures and migration tests must come first.
  - Editor-only grouping: rejected because runtime prompt, validation, import/export, and final report must preserve the same semantics.
- **Source Confidence**: verified

### Recommended Skills Stay Advisory

- **Recommendation**: use existing `WorkflowPhaseSkillReference`, resolver statuses, prompt guidance, and SkillTool permission checks. Recommended skills influence phase context and evidence, not execution authority.
- **Rationale**: `workflowToolPolicy.ts` already states that recommended skills do not grant permissions or enable SkillTool globally, and `SkillTool.ts` owns invocation validation plus permission checks.
- **Alternatives Considered**:
  - Auto-run recommended skills: rejected as out of scope.
  - Required default gates: rejected as future scope.
  - Plugin-first identity: rejected because plugins are provenance/dependency, not the primary binding target.
- **Source Confidence**: verified

### Names-First Skill Identity With Provenance Qualifiers

- **Recommendation**: keep skill references names-first with optional source, pluginName, namespace, version, contentHash, and referenceId. Ambiguity must surface through diagnostics.
- **Rationale**: `workflowPhaseSkillResolver.ts` already supports available, missing, ambiguous, unsupported-source, plugin-disabled, invalid-reference, and installable statuses. Desktop editor tests already preserve same-name skills by source/provenance.
- **Alternatives Considered**:
  - Stable opaque ID only: rejected because portability across environments depends on names and source hints.
  - Name-only matching: rejected because duplicate names across user/project/plugin/managed/bundled/MCP sources can be ambiguous.
- **Source Confidence**: verified

### Dependency Manifest, Not Skill Bundle

- **Recommendation**: keep workflow export as template data plus dependency manifest, and keep import preview diagnostics as the receiver-side resolution surface.
- **Rationale**: `workflowTemplates.ts` exports `schemaVersion: 2` with `dependencyManifest` and computes import diagnostics against the receiver catalog. This matches MP-007.
- **Alternatives Considered**:
  - Bundle arbitrary skill content by default: rejected for security and scope.
  - Drop unresolved references: rejected because importers must see degraded state.
- **Source Confidence**: verified

### Completion Submission State Machine

- **Recommendation**: keep `CompletionSubmission` with `ready`, `blocked`, and `unable`; use `pendingConfirmation`, stateVersion, transition history, artifact lifecycle, and final report pointers for durable behavior.
- **Rationale**: `workflowRuntimeService.ts` already validates submissions, blocks duplicate pending ready submissions, records artifacts, and handles confirm/reject/retry/manual completion.
- **Alternatives Considered**:
  - Treat `blocked` or `unable` as workflow failure: rejected because they are recoverable.
  - Let ready submissions advance immediately by default: rejected unless phase authority allows auto behavior.
- **Source Confidence**: verified

### UI Mirrors Runtime Authority

- **Recommendation**: desktop components should render grouped authoring, dependency diagnostics, recommended skill status/evidence, pending/blocked/unable controls, stale/missing labels, and read-only artifacts from server state.
- **Rationale**: existing components already cover many of these states. Passive learning shows pending confirmation must outrank stale running state in controls.
- **Alternatives Considered**:
  - UI-only fixes: rejected because server guards and stateVersion are authoritative.
  - Runtime-only fixes: rejected because users need visible state and safe controls.
- **Source Confidence**: verified

## Standard Stack

- TypeScript/Bun server services and API routes: workflow types, validation, registry, resolver, runtime, tool policy, and import/export.
- Existing SkillTool and skill loader: skill invocation, permissions, allowed tools, model/effort effects, and skill discovery.
- React/Zustand desktop UI: workflow editor, import/export dialog, template picker, status panel, transition controls, active session integration, skill store.
- Vitest/Testing Library and Bun tests: same-area coverage for server and desktop behavior.

## Don't Hand-Roll

- Skill resolver: use `workflowPhaseSkillResolver.ts`.
- Skill execution and permissions: use `SkillTool.ts`.
- Skill catalog: use `/api/skills`, `collectTemplateSkillCatalog`, and existing skill store/catalog paths.
- Workflow runtime state: use `WorkflowSessionState` and `workflowRuntimeService.ts`.
- Import/export: use `src/server/api/workflowTemplates.ts`.
- Desktop state model: use `desktop/src/types/session.ts` and existing workflow components.

## Common Pitfalls

- Assuming an existing type proves the feature is complete. Types are baseline evidence, not completion proof.
- Letting recommended skills imply auto-execution or permission grants.
- Losing source/provenance when same-name skills exist across sources.
- Treating missing recommended skills as hard import blockers rather than warnings.
- Treating invalid skill references as warnings rather than validation errors.
- Showing manual completion when pending confirmation is already true but lifecycle status still says running.
- Recording noisy "unused" evidence for every recommended skill.
- Adding grouped persistence without old-template fixtures and migration tests.

## Assumptions Log

- Current template field shape can support grouped contract projection without immediate persistence migration. Validate with old-template fixtures.
- Current final report and artifact pointer model can carry materially relevant skill audit evidence. Validate with runtime/report tests.
- Current skill catalog coverage is sufficient for workflow authoring and import/runtime diagnostics. Validate with resolver/API/desktop tests.
- Existing desktop import/export dialog can remain JSON-based for workflow packages. If save-file UX is changed, use the desktop export learning about a proven write path and fallback.

## Validation Notes

- Build a requirement-to-test matrix before implementation edits.
- Add same-area server tests for validation/resolver/import/export/session/runtime/report surfaces.
- Add same-area desktop tests for editor grouping, skill picker provenance, import/export diagnostics, status, evidence, and controls.
- Run `bun run check:server`, `bun run check:desktop`, then `bun run verify`.
- Preserve quality report paths and coverage paths in the implementation handoff.

## Environment / Dependency Notes

- No new dependency is required by the plan.
- `bun run check:docs` is only needed if docs change and should not run in parallel with gates that depend on root `node_modules`.
- Live provider gates are not part of planning. Use them during implementation only if provider/runtime or core agent-loop behavior changes and credentials are available.

## Sources

- `.specify/features/009-specify-discussions-workflows/spec.md`
- `.specify/features/009-specify-discussions-workflows/alignment.md`
- `.specify/features/009-specify-discussions-workflows/context.md`
- `.specify/features/009-specify-discussions-workflows/references.md`
- `.specify/memory/constitution.md`
- `.specify/memory/learnings/learn-2026-05-28-desktop-workflow-pending-confirmation-over-running-statu-b45c8345ca.md`
- `.specify/memory/learnings/learn-2026-06-03-workflow-authoring-skill-create-catalog-visibility-7d1a6f0c2b.md`
- `.specify/memory/learnings/learn-2026-06-04-workflow-linked-source-terminal-status-74f4db59dd.md`
- `.specify/memory/learnings/learn-2026-06-10-desktop-export-save-picker-fallback-a8f3c2d1.md`
- `src/server/services/workflowTypes.ts`
- `src/server/services/workflowTemplateValidation.ts`
- `src/server/services/workflowTemplateRegistryService.ts`
- `src/server/services/workflowPhaseSkillResolver.ts`
- `src/server/services/workflowSessionCreateService.ts`
- `src/server/services/workflowRuntimeService.ts`
- `src/server/services/workflowToolPolicy.ts`
- `src/server/api/workflowTemplates.ts`
- `src/server/api/skills.ts`
- `src/skills/loadSkillsDir.ts`
- `src/tools/SkillTool/SkillTool.ts`
- `src/tools/SkillTool/prompt.ts`
- `desktop/src/types/session.ts`
- `desktop/src/types/skill.ts`
- `desktop/src/api/skills.ts`
- `desktop/src/stores/skillStore.ts`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`
- `desktop/src/components/workflow/WorkflowTransitionControls.tsx`
- `desktop/src/pages/ActiveSession.tsx`
- `desktop/src/components/workflow/WorkflowComponents.test.tsx`
