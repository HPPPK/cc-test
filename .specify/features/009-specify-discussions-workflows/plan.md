# Implementation Plan: Workflow Phase Execution Contracts

**Branch**: `009-specify-discussions-workflows` | **Date**: 2026-06-12 | **Spec**: `.specify/features/009-specify-discussions-workflows/spec.md`
**Input**: Feature specification from `.specify/features/009-specify-discussions-workflows/spec.md`

## Summary

Implement workflow phases as explicit execution contracts across the existing cc-jiangxia workflow template, session runtime, SkillTool, import/export, and desktop UI surfaces. This is not greenfield work: live reads show existing lifecycle types, completion submission handling, phase skill references/resolution, dependency manifests, editor skill selection, import/export diagnostics, status panels, transition controls, and tests. Implementation must classify each requirement as existing baseline, incomplete, missing, or hardening work before mutating code.

## Locked Planning Decisions

- Preserve the approved unified feature boundary: grouped phase fields, constraint strengths, recommended skills, dependency-aware sharing, lifecycle/completion rules, runtime/editor UI, compatibility, and validation are one product contract.
- Use compatibility-first field adaptation from current flat template fields. Do not introduce a destructive grouped persistence migration in this scope.
- Treat recommended phase skills as advisory phase bindings to existing skills. They may influence prompt attention and evidence expectations, but they do not auto-run, grant tools, change model/effort, fork agents, install hooks, or bypass SkillTool permissions.
- Keep plugin identity as provenance/dependency metadata for plugin-provided skills, not as the primary workflow binding target.
- Export workflow template data plus a dependency manifest by default. Do not bundle arbitrary skill package contents.
- Keep lifecycle state separate from completion submission status. `blocked` and `unable` are recoverable completion outcomes, not runtime/system failures.
- Keep `pending-confirmation` as a blocking state that exposes Confirm, Reject, and Retry only and blocks duplicate ready submissions.
- Keep session snapshots authoritative for active, resumed, stale-template, and missing-template states.
- Same-area server and desktop tests are required before PR readiness, followed by `bun run verify`.

## Must-Preserve Carry-Forward

| MP ID | Type | Planning Obligation | Plan Location | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- |
| MP-001 | goal | Preserve workflows as phase execution contracts, not cosmetic grouping or skill hints. | `plan.md#implementation-constitution` | Contract semantics are reduced to editor-only layout. |
| MP-002 | scope | Preserve one unified boundary across fields, constraints, skills, sharing, lifecycle, UI, compatibility, and validation. | `plan.md#capability-preservation-plan` | Lifecycle or UI controls are split away and lose consistency. |
| MP-003 | data-shape | Preserve grouped `intent`, `contract`, `evidencePolicy`, and session-owned `runtimeState`. | `data-model.md#workflow-phase-contract-projection` | Runtime state becomes editable template data. |
| MP-004 | policy | Preserve guidance, policy, evidence, and gate strengths with sparse hard gates. | `contracts/workflow-phase-contract.md#constraint-strengths` | Every instruction becomes a hard machine gate. |
| MP-005 | integration | Recommended skills bind to existing skills and stay soft by default. | `contracts/workflow-phase-contract.md#recommended-skill-bindings` | Plugins become primary target or recommended skills auto-run. |
| MP-006 | evidence | Preserve bounded soft audit for used or clearly relevant skipped/unavailable recommended skills. | `data-model.md#workflow-phase-skill-evidence` | Audit lists every recommended skill mechanically or records nothing. |
| MP-007 | sharing | Export template data plus dependency manifest, not skill package contents. | `contracts/workflow-skill-dependency-manifest.md#export-contract` | Import silently drops missing references or export implies bundled skills. |
| MP-008 | lifecycle | Preserve lifecycle status separate from completion submission outcome. | `data-model.md#state-transitions` | Blocked/unable outcomes become terminal failures. |
| MP-009 | lifecycle | Preserve pending confirmation Confirm/Reject/Retry and duplicate ready conflict. | `contracts/workflow-transition-submission.md#pending-confirmation-contract` | Pending ready submissions can overwrite silently. |
| MP-010 | UI | Preserve safe runtime controls and authority labels. | `quickstart.md#desktop-validation` | UI mixes manual completion with pending confirmation. |
| MP-011 | compatibility | Preserve compatibility adapter before grouped persistence migration. | `plan.md#implementation-phases` | Destructive migration lands without old-template fixtures. |
| MP-012 | non-goal | Do not build scheduler, auto-execution, required gates, bundles, or destructive migration. | `plan.md#forbidden-implementation-drift` | Scope expands into execution engine or capability system. |
| MP-013 | evidence | Use live repository evidence while project cognition remains partial/stale for this area. | `plan.md#project-cognition-advisory` | Plan claims completion from project cognition alone. |

## Implementation Target Boundary

- **Current project root**: `F:\github\cc-jiangxia`
- **Current project roles**: the current repository is both specification owner and implementation target.
- **Target project root**: `F:\github\cc-jiangxia`
- **Target project roles**: server workflow runtime/API, SkillTool runtime, desktop workflow UI, and same-area test suites.
- **Target paths/modules**:
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
  - `desktop/src/components/workflow/WorkflowTemplatePicker.tsx`
  - `desktop/src/components/workflow/WorkflowStatusPanel.tsx`
  - `desktop/src/components/workflow/WorkflowTransitionControls.tsx`
  - `desktop/src/pages/ActiveSession.tsx`
  - `desktop/src/components/workflow/WorkflowComponents.test.tsx`
- **Target evidence status**: project cognition returned `review` and `review_project_cognition_update`; all implementation claims in this plan are backed by live reads, not by cognition output alone.
- **Reference sources**: `.specify/discussions/workflows/*`, `spec.md`, `alignment.md`, `context.md`, `references.md`, and passive learning files.
- **Cognition scope rule**: current project cognition is advisory only and cannot prove completion.
- **Stop condition**: if a required runtime, API, SkillTool, or desktop boundary cannot be confirmed by live reads during implementation, stop and route back to planning or clarification before changing behavior.

## Reference Fidelity Inputs

### Reference Object

- No external reference implementation is required. The live repository is baseline evidence only.

### Behavior-Level Fidelity Inventory

- Existing pending-confirmation priority behavior must be preserved and hardened, not redesigned.
- Existing SkillTool permission behavior must remain authoritative.
- Existing import/export dependency manifest behavior is the starting point for diagnostics and compatibility.
- Existing editor skill picker and provenance-preserving reference identity are the starting point for authoring.

## Scenario Profile Inputs

### Active Profile

- `Standard Delivery`
- Source: `.specify/features/009-specify-discussions-workflows/workflow-state.md`
- No special reference-fidelity profile is active.

### Profile-Driven Implementation Constraints

- Keep the standard planning artifact contract.
- Preserve MP and CA IDs in task generation.
- Require same-area tests for all production changes under `src/server`, `src/tools`, `src/utils`, and `desktop/src`.
- Use live evidence and focused tests before broad gates.

## Technical Context

**Language/Version**: TypeScript, Bun runtime, React desktop UI, Tauri desktop shell
**Primary Dependencies**: Bun, TypeScript, React, Zustand, Testing Library, Vitest, existing server/API utilities, existing SkillTool and skills loader
**Storage**: local JSON/config surfaces, workflow template registry, session JSONL metadata, workflow state artifacts, artifact pointers, desktop local state where already used
**Testing**: Bun test runner, Vitest/Testing Library for desktop, repository quality gates
**Target Platform**: local CLI/server plus desktop app
**Project Type**: Bun CLI/local server plus React/Tauri desktop app
**Performance Goals**: keep workflow authoring, import preview, skill catalog lookup, and status rendering responsive under existing local-app expectations; avoid repeated full skill detail loads in common editor flows
**Constraints**: preserve unknown fields, preserve user-owned state, keep SkillTool permissions explicit, avoid destructive persistence migration, keep recommended skills advisory, keep import/export diagnostics actionable, protect stateVersion transitions
**Scale/Scope**: workflow templates with ordered phases, recommended phase skill references, session snapshots, transition history, final report evidence, and desktop authoring/runtime UI

## Implementation Constitution

### Architecture Invariants

- Workflow templates own authorable phase contract fields and recommended skill references. Workflow sessions own runtime state, pending confirmation, artifact lifecycle, transition history, snapshots, and final report pointers.
- Existing flat fields remain the compatibility source for first-scope grouped semantics. New grouped projections may be exposed, but persisted migration must not be destructive.
- `WorkflowPhaseSkillReference` remains names-first with optional source/provenance qualifiers. Ambiguity must be diagnosed rather than silently guessed.
- `workflowPhaseSkillResolver` and the shared skill catalog are the skill binding boundary. Do not duplicate Settings UI logic as a second resolver.
- `SkillTool` owns invocation validation, permission checks, tool/model/effort effects, forked execution, and usage recording. Workflow recommendations cannot bypass this boundary.
- `workflowTemplates` import/export owns dependency manifest diagnostics. It does not own skill package bundling by default.
- Desktop UI mirrors runtime state. It must not invent stronger controls than the runtime supports.

### Boundary Ownership

- Template schema and validation: `workflowTypes.ts`, `workflowTemplateValidation.ts`, `workflowTemplateRegistryService.ts`
- Skill identity and resolution: `workflowPhaseSkillResolver.ts`, `collectTemplateSkillCatalog`, `/api/skills`, desktop `skillStore`
- Runtime lifecycle and evidence: `workflowRuntimeService.ts`, `workflowToolPolicy.ts`, workflow state/artifact types
- Sharing contract: `src/server/api/workflowTemplates.ts`, desktop import/export dialog, desktop session types
- Skill permissions: `src/tools/SkillTool/SkillTool.ts`, `src/tools/SkillTool/prompt.ts`, `src/skills/loadSkillsDir.ts`
- Desktop authoring/runtime views: workflow editor, import/export dialog, picker, status panel, transition controls, active session wiring

### Forbidden Implementation Drift

- Do not add a parallel workflow state machine outside `WorkflowSessionState`.
- Do not store session runtime state as editable template data.
- Do not make recommended skills required gates unless a later spec explicitly adds required-skill mode.
- Do not auto-execute skills from workflow recommendations.
- Do not use plugin identity as the primary reference when a skill identity is available.
- Do not bundle arbitrary skill package contents into export output.
- Do not allow pending ready submissions to overwrite each other.
- Do not treat `blocked` or `unable` as terminal runtime failure.
- Do not lower coverage thresholds or bypass same-area tests for production changes.

### Required Implementation References

- `spec.md#requirements`
- `alignment.md#senior-consequence-analysis`
- `context.md#relevant-repository-context`
- `references.md#live-repository-reads`
- `src/server/services/workflowTypes.ts`
- `src/server/services/workflowTemplateValidation.ts`
- `src/server/services/workflowPhaseSkillResolver.ts`
- `src/server/services/workflowRuntimeService.ts`
- `src/server/services/workflowToolPolicy.ts`
- `src/server/api/workflowTemplates.ts`
- `src/tools/SkillTool/SkillTool.ts`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`
- `desktop/src/components/workflow/WorkflowTransitionControls.tsx`
- `desktop/src/components/workflow/WorkflowComponents.test.tsx`

### Review Focus

- Verify template/session boundary and unknown-field preservation.
- Verify recommended skills stay advisory and do not alter SkillTool permissions.
- Verify dependency manifest warnings/errors match the specified import behavior.
- Verify pending-confirmation and stateVersion behavior across stale UI actions.
- Verify desktop controls cannot advance blocked/unable/pending/stale/missing states unsafely.
- Verify final reports and artifacts retain completion evidence and materially relevant skill audit data.

## Operational Consequence Design

| Obligation ID | State Machine / Ordering Decision | Concurrency And Idempotency | Recovery Path | Validation Evidence |
| --- | --- | --- | --- | --- |
| CA-001 | Skill references resolve names-first with optional source, plugin, namespace, version, contentHash, or referenceId qualifiers. | Resolver must return ambiguous rather than choose multiple matches. | Author/importer adds provenance or keeps unresolved reference with diagnostics. | Resolver and validation tests for duplicate names, missing, ambiguous, plugin-disabled, installable, and invalid-reference. |
| CA-002 | Recommended skill priority is prompt attention plus status/evidence, not permission override. | SkillTool invocation remains separately permission checked. | If a recommendation cannot run, record relevant unavailable/skip evidence when material. | Runtime prompt/tool policy tests proving no global SkillTool enablement or auto-exec wording. |
| CA-003 | Missing/degraded skill states remain visible in import preview and runtime status. | Import preview should dedupe diagnostics and avoid race-sensitive catalog assumptions. | Missing skills allow import by default; invalid references block selectable import. | API import/export tests plus desktop diagnostics tests. |
| CA-004 | SkillTool remains the only execution boundary for skills. | Workflow context must not mutate `toolPermissionContext` directly for recommendations. | Permission denial stays visible as SkillTool denial, not workflow failure unless material. | SkillTool permission regression and workflow prompt guidance tests. |
| CA-005 | Session start snapshots template identity and phase skill resolutions. | Active sessions use snapshot data even when source template changes. | Stale/missing templates warn while keeping session snapshot authoritative. | Session creation, resume/stale-template, and final report tests. |
| CA-006 | Skill use/skip/unavailable evidence is recorded only when materially relevant. | Evidence writes must attach to phase/session/version and avoid mechanical unused lists. | Relevant unavailable/skip evidence can be added to completion artifact/report. | Completion artifact/report tests for used, relevant-skipped, and relevant-unavailable outcomes. |
| CA-007 | Validation runs on authoring, duplicate/update, import preview/commit, and session start. | Import preview and save paths must validate the same reference shape. | Invalid reference blocks save/import; missing reference remains warning when importable. | Server request-shape tests and desktop editor tests. |
| CA-008 | Desktop UI labels/affordances reflect runtime authority. | `pendingConfirmation` outranks stale `running` status for controls. | Retry returns to running; reject supersedes pending artifact; blocked/unable do not advance. | `WorkflowComponents.test.tsx` additions for grouped UI, labels, status priority, and safe controls. |
| CA-009 | Evidence survives resume, compaction, final report, and import/export boundaries. | Artifact lifecycle updates must be idempotent by transitionId/stateVersion. | Missing report/state pointer is diagnosed; accepted evidence remains read-only. | Runtime artifact/final report tests and desktop read-only artifact history tests. |
| CA-010 | Nested invocation limits are preserved by non-goal decisions. | No auto/required skill invocation is added, so no new recursion loop exists. | If future required/auto skill mode appears, reopen spec for depth/loop limits. | Tests should assert this feature does not schedule tool calls from recommendations. |

## Dispatch Compilation Hints

### Boundary Owner

- Server workflow runtime/API and SkillTool permission boundary are the primary owners. Desktop components consume server state and must not define independent runtime semantics.

### Required Packet References

- `plan.md#implementation-constitution`
- `data-model.md#state-transitions`
- `contracts/workflow-phase-contract.md`
- `contracts/workflow-skill-dependency-manifest.md`
- `contracts/workflow-transition-submission.md`
- `quickstart.md#validation-sequence`

### Packet Validation Gates

- Server/runtime changes: `bun run check:server`
- Desktop UI/store/API changes: `bun run check:desktop`
- Full PR readiness after narrow checks: `bun run verify`
- Live provider baseline only when provider credentials are available and the implementation changes agent-loop/provider execution paths.

### Task-Level Quality Floor

- Every changed production file under `src/server`, `src/tools`, `src/utils`, or `desktop/src` must have same-area tests or an explicit maintainer-approved exception.
- Old-template compatibility fixtures are required for storage or import/export shape changes.
- No task may claim completion from project cognition alone.

### Adaptive Dispatch

- execution_model: adaptive
- execution_mode: standard
- workflow_status: ready
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- capability_degraded: true
- blocked_reason: none
- delegated_planning_lanes: none
- rationale: native subagent spawning is not available under the current tool contract without an explicit user request; the design-only plan remains feasible leader-inline using targeted live reads.

## Capability Preservation Plan

| Capability | Entry Point / Owner | Design Artifact | Proof Required |
| --- | --- | --- | --- |
| Phase contract authoring | Desktop editor plus workflow template API | `contracts/workflow-phase-contract.md` | Editor tests, validation tests, old-template fixture |
| Constraint semantics | Validation, runtime prompt, completion rules | `contracts/workflow-phase-contract.md#constraint-strengths` | Prompt/tool policy tests and completion tests |
| Recommended skills | Skill catalog, resolver, runtime prompt, SkillTool | `data-model.md#workflow-phase-skill-reference` | Resolver/API/UI/SkillTool boundary tests |
| Dependency-aware sharing | `workflowTemplates` export/import API and dialog | `contracts/workflow-skill-dependency-manifest.md` | Export/import request-shape tests and desktop diagnostics |
| Lifecycle/completion | `workflowRuntimeService`, `workflowToolPolicy`, transition controls | `contracts/workflow-transition-submission.md` | StateVersion, pending conflict, blocked/unable, confirm/reject/retry tests |
| Runtime/editor UI | workflow editor/status/controls/active session | `quickstart.md#desktop-validation` | Testing Library coverage for authoring and runtime states |
| Compatibility/validation | old templates, unknown fields, session snapshots, reports | `data-model.md#compatibility-and-migration` | Same-area server and desktop fixtures plus `bun run verify` |

## Alignment Inputs

### Canonical References

- `.specify/features/009-specify-discussions-workflows/spec.md`
- `.specify/features/009-specify-discussions-workflows/alignment.md`
- `.specify/features/009-specify-discussions-workflows/context.md`
- `.specify/features/009-specify-discussions-workflows/references.md`
- `.specify/discussions/workflows/handoff-to-specify.md`
- `.specify/discussions/workflows/handoff-to-specify.json`
- `.specify/memory/constitution.md`
- Passive learning files for workflow pending priority, skill catalog visibility, linked source terminal status, and desktop export fallback.

### Input Risks From Alignment

- Existing behavior can be incomplete even when matching names/types exist. Implementation tasks must classify work before changing code.
- Project cognition coverage is partial for workflow runtime/editor. Live reads and tests are authoritative.
- Exact runtime skill audit storage and final report provenance need implementation-level classification.
- Exact UI copy/layout can be implemented within existing component patterns, but must preserve semantics.
- Coverage matrix is not complete yet; `/sp.tasks` must create tasks for missing server and desktop tests.

## Research Inputs

### Standard Stack

- Extend existing TypeScript/Bun server services, API routes, React/Zustand desktop components, and Vitest/Testing Library tests.

### Don't Hand-Roll

- Do not build a new skill resolver, permission system, workflow scheduler, import system, or UI state machine. Reuse existing services and component boundaries.

### Common Pitfalls

- A repeated ready submission can conflict with stale UI if pending state is not prioritized.
- A workflow skill reference can look valid by name while resolving ambiguously across sources.
- A dependency manifest can accidentally imply skill content bundling if export copy is unclear.
- A desktop export/import UI can appear complete while server validation paths remain weak.

### Assumptions To Validate

- Current workflow template schema can expose grouped semantics as a compatibility projection before direct grouped persistence.
- Current final report/artifact paths can carry relevant skill audit evidence without a new storage subsystem.
- Current skill catalog coverage is sufficient for workflow authoring and runtime diagnostics once provenance is preserved.

### Environment / Dependency Notes

- No new runtime dependency is planned.
- `bun run check:docs` is not required unless implementation changes docs; if used, run it sequentially because it uses `npm ci`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Specification-first delivery: PASS. Spec, alignment, context, and plan artifacts exist before implementation.
- Simplicity and scope discipline: PASS with constraints. Reuse existing workflow, SkillTool, API, and desktop surfaces.
- Test-backed changes: PASS as a planning requirement. Same-area tests and `bun run verify` are required before PR readiness.
- Security by default: PASS with SkillTool boundary rules and import validation requirements.
- Reviewable, reversible delivery: PASS. Feature decomposes into bounded server/runtime/API/desktop tasks.
- Evidence before completion: PASS as a planning requirement. Completion requires narrow checks plus `bun run verify`.
- No unrequested fallbacks: PASS. Missing skills warn/preserve references by confirmed scope; no silent alternate execution path is introduced.

Post-design re-check: PASS. Generated design artifacts preserve the constitution constraints and name required verification.

## Implementation Phases

### Phase 0 - Classification And Test Inventory

- Build a requirement-to-surface matrix from FR-001 through FR-030.
- Mark each requirement as existing baseline, incomplete, missing, or hardening.
- Create the same-area test plan before production edits.

### Phase 1 - Contract And Compatibility Model

- Add or harden grouped phase contract projection for `intent`, `contract`, and `evidencePolicy` while preserving existing flat fields and unknown fields.
- Preserve `runtimeState` as session-owned only.
- Add old-template and unknown-field fixtures.

### Phase 2 - Skill Binding And Dependency Diagnostics

- Harden stable skill reference/provenance behavior across catalog, validation, resolver, authoring, import/export, session start, runtime prompt, and reports.
- Ensure missing/degraded/invalid states are visible and correctly importable or blocking.
- Prove recommended skills remain advisory and permission-preserving.

### Phase 3 - Lifecycle, Completion, Evidence, And Report Durability

- Harden `submit_phase_completion`, pending confirmation, blocked/unable recovery, stateVersion protection, transition history, artifact lifecycle, and final report evidence.
- Add tests for duplicate ready conflict, stale actions, blocked/unable artifacts, and report provenance.

### Phase 4 - Desktop Authoring And Runtime UI

- Expose grouped authoring semantics clearly within existing workflow editor patterns.
- Preserve recommended skill selection from the shared catalog.
- Render dependency/runtime skill diagnostics, evidence, stale/missing source warnings, pending/blocked/unable states, and safe controls.
- Keep artifacts read-only in runtime/status views.

### Phase 5 - Verification And Handoff

- Run focused server and desktop checks first.
- Run `bun run verify` before PR-ready completion.
- Record report paths, pass/fail/skip counts, coverage report path, E2E/live blockers, and remaining risk in the implementation closeout.

## Project Structure

### Documentation (this feature)

```text
.specify/features/009-specify-discussions-workflows/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- plan-contract.json
|-- contracts/
|   |-- workflow-phase-contract.md
|   |-- workflow-skill-dependency-manifest.md
|   `-- workflow-transition-submission.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/server/services/
|-- workflowTypes.ts
|-- workflowTemplateValidation.ts
|-- workflowTemplateRegistryService.ts
|-- workflowPhaseSkillResolver.ts
|-- workflowSessionCreateService.ts
|-- workflowRuntimeService.ts
`-- workflowToolPolicy.ts

src/server/api/
|-- workflowTemplates.ts
`-- skills.ts

src/skills/
`-- loadSkillsDir.ts

src/tools/SkillTool/
|-- SkillTool.ts
`-- prompt.ts

desktop/src/types/
|-- session.ts
`-- skill.ts

desktop/src/api/
`-- skills.ts

desktop/src/stores/
`-- skillStore.ts

desktop/src/components/workflow/
|-- WorkflowTemplateEditor.tsx
|-- WorkflowImportExportDialog.tsx
|-- WorkflowTemplatePicker.tsx
|-- WorkflowStatusPanel.tsx
|-- WorkflowTransitionControls.tsx
`-- WorkflowComponents.test.tsx

desktop/src/pages/
`-- ActiveSession.tsx
```

## Risk Tracking

| Risk | Mitigation | Stop Condition |
| --- | --- | --- |
| Grouped fields become destructive migration | Implement compatibility projection first and preserve flat fields/unknown fields | Any task requires deleting or rewriting old persisted fields without fixtures |
| Recommended skills imply permission bypass | Keep SkillTool permission tests and workflow prompt guidance separate | Any task mutates SkillTool permissions from workflow references |
| Skill audit becomes noisy | Record only used/relevant skipped/unavailable evidence | Any implementation lists every recommendation mechanically |
| Import/export silently loses dependency references | Keep manifest diagnostics and unresolved references | Any import drops unresolved references without diagnostics |
| UI advances unsafe states | Pending, blocked, unable, stale, and missing states have explicit controls/labels | Any UI shows confirm/complete for blocked/unable or hides pending confirmation |
| Report/resume loses evidence | Attach evidence to artifacts, transitions, snapshots, and final report | Any resume/report path cannot explain phase evidence/provenance |

## Verification Strategy

- Server unit/request tests for template validation, resolver statuses, dependency manifests, import preview/commit, session snapshots, runtime prompt/tool policy, completion submissions, pending conflict, transitions, blocked/unable, and final reports.
- Desktop Vitest/Testing Library tests for grouped editor fields, skill picker provenance, import/export diagnostics, status labels, recommended skill evidence, pending priority, read-only artifacts, manual completion, retry, and unsafe-control absence.
- Old-template fixture tests for flat fields, unknown fields, legacy skill references, import/export, and session snapshot compatibility.
- Narrow commands first: `bun run check:server` and `bun run check:desktop`.
- Final local PR gate: `bun run verify`.
- Live provider baseline: only when implementation changes agent-loop/provider execution or provider credentials are available and required by maintainers.

## Project Cognition Advisory

- Entry status: `.specify/project-cognition/status.json` reports `review` with `partial_refresh` and `review_project_cognition_update`.
- Selected concepts: `SkillTool - Skill Invocation` and broad coverage-gap node.
- Routing decision: continue with live repository evidence; no project cognition update is required for artifact-only `sp-plan`.
- Follow-up advisory: after source/runtime/test changes in implementation, inline project cognition closeout or a recorded update may be required by the implementation workflow.

## Generated Artifacts

- `research.md`
- `data-model.md`
- `contracts/workflow-phase-contract.md`
- `contracts/workflow-skill-dependency-manifest.md`
- `contracts/workflow-transition-submission.md`
- `quickstart.md`
- `plan-contract.json`

## Handoff

- Planning status: ready for `/sp.tasks`
- delegated_planning_lanes: none
- Next command: `/sp.tasks`
