# Implementation Plan: Workflow Phase Skills

**Branch**: `007-workflow-phase-skills` | **Date**: 2026-05-29 | **Spec**: `.specify/features/007-workflow-phase-skills/spec.md`
**Input**: Feature specification from `.specify/features/007-workflow-phase-skills/spec.md`

## Summary

Implement first-class recommended workflow phase skill bindings over existing skills. The plan extends the current workflow template `phases[].skills` surface with names-first skill references, resolves them through a shared server-side catalog/resolver, exports dependency manifests, imports missing recommended skills with warnings, renders active-phase prompt emphasis, and stores bounded evidence for used or clearly relevant skipped/unavailable skills.

This is a cross-boundary workflow/server/desktop change. It must preserve existing template unknown-field behavior, old exports, SkillTool permissions, and the recommended-first semantics selected in `alignment.md`.

## Locked Planning Decisions

- Use Approach A: recommended phase skill bindings.
- Bind workflow phases to skills, not plugins. Plugin identity is provenance/dependency only.
- Recommended skills never auto-execute and never block import, phase start, or phase completion by default.
- Missing recommended skills produce warnings and degraded runtime state, not default blockers.
- Export workflow templates with skill dependency manifests, but do not bundle skill package contents by default.
- Do not duplicate skill-owned description, applicability, assets, tools, hooks, agents, model, or effort metadata into workflow templates.
- UI authoring belongs at the phase level in `WorkflowTemplateEditor`.

## Must-Preserve Carry-Forward

| MP ID | Type | Planning Obligation | Plan Location | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- |
| MP-001 | goal | Make phase skills real references, not prompt-only prose. | Summary, Data Model, Runtime Prompt Contract | Reopen if phase skills are represented only as guidance text. |
| MP-002 | scope | Preserve recommended skills, shared catalog, import/export, prompt emphasis, evidence. | Capability Preservation Plan | Reopen if any core capability is dropped. |
| MP-003 | non_goal | No auto-execution or default completion gate. | Constitution, CA-010 | Reopen if runtime auto-invokes or blocks on recommendations. |
| MP-004 | decision | Bind to skills, not plugins. | Data Model, Contracts | Reopen if plugin becomes the primary binding target. |
| MP-005 | decision | Use shared Settings-aligned skill catalog. | Boundary Ownership, Contracts | Reopen if workflow owns a separate skill inventory. |
| MP-006 | decision | Keep names-first references with metadata only when needed. | Data Model | Reopen if every binding requires verbose qualification. |
| MP-007 | decision | Do not duplicate skill-owned metadata. | Constitution, Validation Rules | Reopen if workflow stores applicability as authoritative. |
| MP-008 | decision | Runtime prompt must boost active-phase attention without mandating use. | Runtime Prompt Contract | Reopen if wording is weaker than prose or stronger than recommended. |
| MP-009 | decision | Evidence is bounded to used/relevant skipped/unavailable skills. | Evidence Model, Status UI | Reopen if evidence becomes an exhaustive checklist. |
| MP-010 | decision | Export template plus dependency manifest; no default contents bundle. | Import/Export Contract | Reopen if export emits names only or bundles arbitrary files. |
| MP-011 | decision | Missing recommended skills allow import with warnings and preserved references. | Import/Export Contract, State Matrix | Reopen if import blocks or drops unresolved recommendations. |
| MP-012 | decision | Add phase-local selector in `WorkflowTemplateEditor`. | Desktop Boundary | Reopen if authoring is workflow-level only. |
| MP-013 | decision | Add import/export diagnostics. | Import/Export Contract | Reopen if sharing hides dependency state. |
| MP-014 | decision | Add lightweight runtime status/evidence. | Status UI Contract | Reopen if status becomes noisy or checklist-like. |
| MP-015 | non_goal | Preserve SkillTool permission and safety boundaries. | Security Boundary, CA-004 | Reopen if workflow grants skill capabilities directly. |
| MP-016 | tradeoff | Keep skill bundle mode deferred and reviewed. | Deferred Scope | Reopen only for explicit reviewed bundle-mode work. |
| MP-017 | planning_detail | Resolve schema, resolver boundary, and evidence storage without changing semantics. | Data Model, Contracts, Consequence Design | Reopen if implementation design requires mandatory skills or auto-exec. |

## Implementation Target Boundary

- **Current project root**: `F:\github\cc-jiangxia`
- **Current project roles**: source project and implementation target; evidence from `.specify/features/007-workflow-phase-skills/*` plus live reads under `src/` and `desktop/src/`.
- **Target project root**: `F:\github\cc-jiangxia`
- **Target project roles**: same repository; no external implementation target.
- **Target paths/modules**:
  - `src/server/services/workflowTypes.ts`
  - `src/server/services/workflowTemplateValidation.ts`
  - `src/server/services/workflowTemplateRegistryService.ts`
  - `src/server/services/workflowSessionCreateService.ts`
  - `src/server/services/workflowRuntimeService.ts`
  - `src/server/services/workflowSummary.ts`
  - `src/server/services/workflowFinalReport.ts`
  - `src/server/api/workflowTemplates.ts`
  - `src/server/api/skills.ts`
  - `src/server/api/sessions.ts`
  - `src/tools/SkillTool/SkillTool.ts`
  - `src/tools/SkillTool/prompt.ts`
  - `src/skills/loadSkillsDir.ts`
  - `desktop/src/types/session.ts`
  - `desktop/src/types/skill.ts`
  - `desktop/src/api/sessions.ts`
  - `desktop/src/api/skills.ts`
  - `desktop/src/stores/skillStore.ts`
  - `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
  - `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
  - `desktop/src/components/workflow/WorkflowStatusPanel.tsx`
- **Target evidence status**: Project cognition is stale/blocked and advisory only. Live code reads were used for implementation facts.
- **Reference sources**: `spec.md`, `alignment.md`, `context.md`, `references.md`, `brainstorming/handoff-to-specify.json`, planning handoffs under `planning/handoffs/`.
- **Cognition scope rule**: Current project cognition cannot prove implementation facts without live file evidence.
- **Stop condition**: Stop and return to specification if implementation requires auto-execution, default gating, plugin-primary binding, default skill bundling, or SkillTool permission bypass.

## Scenario Profile Inputs

### Active Profile

- `Standard Delivery`.
- Source: `spec.md`, `alignment.md`, and `context.md`. No Reference Fidelity profile applies.

### Profile-Driven Implementation Constraints

- Same-area tests are required for server workflow/template/runtime/report changes and desktop workflow UI/API changes.
- Implement in the smallest compatible path: extend existing workflow schema, import/export, runtime, and UI surfaces rather than creating a parallel workflow skill system.

## Technical Context

**Language/Version**: TypeScript with Bun for CLI/server; React/TypeScript desktop frontend; Tauri/Rust not expected unless desktop native packaging is touched.
**Primary Dependencies**: Existing Bun runtime, React, Zustand stores, Vitest/Testing Library, workflow services, SkillTool, local skill loader. No new dependency is planned.
**Storage**: Existing local JSON workflow templates, workflow session state, and final report JSON. Preserve unknown fields and existing user-owned state rules.
**Testing**: Bun server tests, desktop Vitest/Testing Library, `bun run check:server`, `bun run check:desktop`, `bun run check:coverage`, `bun run verify`.
**Target Platform**: Local CLI/server plus desktop web/Tauri UI.
**Project Type**: Bun CLI/local server with React desktop frontend.
**Performance Goals**: Resolver work should be bounded by the current local skill catalog and per-template/phase references; no remote install or marketplace lookup in this scope.
**Constraints**: Backward-compatible templates and exports, no skill content logging, no permission bypass, no automatic skill orchestration, no default bundling.
**Scale/Scope**: Workflow templates with phase-local skill references across local user/project/plugin/runtime skill sources; first scope supports diagnostics rather than installation.

## Implementation Constitution

### Architecture Invariants

- `SkillTool` remains the only boundary that validates and invokes skills and applies skill-derived tool/model/effort/fork behavior.
- `phases[].skills` remains the compatible template location for phase skill references; old `{ name, reason }` entries must round-trip.
- Template registry and validation must continue preserving unknown template, phase, skill, artifact, and final-report fields.
- Workflow transition/report persistence keeps existing serialization and idempotency protections.
- Desktop UI consumes server diagnostics and shared types; it must not invent a separate skill availability model.

### Boundary Ownership

- **Skill catalog/resolver**: new or extracted server service near `src/server/services/`, backed by existing skill loader/API evidence and consumed by workflow validation, import/export, runtime, and desktop APIs.
- **Template validation/import/export**: `workflowTemplateValidation.ts`, `workflowTemplateRegistryService.ts`, and `workflowTemplates.ts`.
- **Runtime prompt/state**: `workflowRuntimeService.ts`, `workflowSessionCreateService.ts`, `workflowSummary.ts`, `sessions.ts`.
- **Evidence/final reports**: `workflowFinalReport.ts`, `workflowReportStore.ts`, session state types.
- **Desktop authoring/status**: `WorkflowTemplateEditor.tsx`, `WorkflowImportExportDialog.tsx`, `WorkflowStatusPanel.tsx`, `desktop/src/types/session.ts`.

### Forbidden Implementation Drift

- Do not bind a workflow phase directly to a plugin as the primary object.
- Do not copy skill descriptions, "when to use" instructions, assets, scripts, templates, hooks, agents, tools, model, or effort settings into workflow templates.
- Do not auto-execute recommended skills or mark them required in this scope.
- Do not globally enable SkillTool or pre-grant permissions because a skill is recommended.
- Do not bundle skill package files in workflow exports by default.
- Do not replace import preview/commit with a separate workflow sharing flow.

### Required Implementation References

- `src/tools/SkillTool/SkillTool.ts`
- `src/tools/SkillTool/prompt.ts`
- `src/skills/loadSkillsDir.ts`
- `src/server/services/workflowTypes.ts`
- `src/server/services/workflowTemplateValidation.ts`
- `src/server/services/workflowRuntimeService.ts`
- `src/server/services/workflowToolPolicy.ts`
- `src/server/api/workflowTemplates.ts`
- `src/server/api/skills.ts`
- `src/server/api/sessions.ts`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`

### Review Focus

- Verify the resolver is shared by authoring/import/export/runtime and not duplicated in desktop UI.
- Verify old templates and old exports import unchanged.
- Verify missing recommended skills are warnings/degraded state, not blockers.
- Verify SkillTool permission behavior is untouched except for normal invocation through existing paths.
- Verify runtime/status evidence is bounded and avoids listing every unused recommendation.

## Operational Consequence Design

| Obligation ID | State Machine / Ordering Decision | Concurrency And Idempotency | Recovery Path | Validation Evidence |
| --- | --- | --- | --- | --- |
| CA-001 | Resolve each phase skill reference into a stable `WorkflowPhaseSkillResolution` and export dependency manifest entries. | Resolver is pure/idempotent for a catalog snapshot; exports derive from template state. | Preserve unresolved references; add metadata only when needed. | Template validation/export tests. |
| CA-002 | Runtime prompt uses a distinct recommended skills block for the active phase. | Prompt assembly reads session snapshot and does not mutate catalog state. | If resolution unavailable, mark unavailable rather than invocable. | Runtime prompt tests. |
| CA-003 | Missing, ambiguous, unsupported-source, plugin-disabled, invalid-reference statuses share one vocabulary. | Import preview, save validation, and session start call same resolver service. | Missing/disabled/unsupported are warnings; malformed references are validation errors. | Import/export and resolver tests. |
| CA-004 | Skill-derived effects remain behind SkillTool invocation. | Workflow runtime never writes allowed tools/model/effort from references. | Reject or review any change that applies capabilities outside SkillTool. | Workflow tool policy and SkillTool regression tests. |
| CA-005 | Session start snapshots phase skill resolutions/provenance for running phases. | Existing transition serialization in `sessions.ts` remains authoritative. | Resume uses snapshot; source changes become stale diagnostics, not silent semantic changes. | Session lifecycle/resume tests. |
| CA-006 | Store only used, relevant-skipped, or relevant-unavailable evidence. | Evidence append/update is tied to phase completion/report state, not background scanning. | Omit irrelevant recommendations; preserve rationale for signal-bearing cases. | Final report/status tests. |
| CA-007 | Validate references at authoring, import preview/commit, export, session start/resume. | Validation is deterministic and preserves unknown fields. | Invalid shape blocks save/import; unavailable recommended skill warns and preserves. | Template validation tests. |
| CA-008 | UI shows source/provenance/status concisely. | Desktop consumes API payloads and store state; no separate resolver. | Show warnings and expandable detail; keep phase-local selector. | Desktop component/API tests. |
| CA-009 | Compaction/resume carries enough snapshot/evidence for later phases and reports. | Existing session projection remains single source of truth. | If template is stale/missing, preserve snapshot and flag template state separately. | Workflow summary carryover tests. |
| CA-010 | No automatic nested skill orchestration is added. | Recommended references do not schedule SkillTool calls. | Existing nested skill protections remain sufficient unless future auto-exec scope opens. | Negative runtime tests proving no auto-call. |

## Dispatch Compilation Hints

### Boundary Owner

- Server workflow resolver/template/runtime/report services own semantic truth.
- Desktop owns presentation only and must consume server/status contracts.

### Required Packet References

- Each implementation packet must include the relevant files listed in Required Implementation References plus the matching test files from Quickstart.

### Packet Validation Gates

- Server packet: focused Bun tests for touched workflow services/API, then `bun run check:server`.
- Desktop packet: focused Vitest/Testing Library tests for touched UI/API/store files, then `bun run check:desktop`.
- Completion packet: `bun run check:coverage` and `bun run verify`.

### Task-Level Quality Floor

- Every production behavior change must include same-area tests. Do not use `allow-missing-tests` or lower coverage thresholds for this feature.

## Alignment Inputs

### Canonical References

- `.specify/features/007-workflow-phase-skills/spec.md`
- `.specify/features/007-workflow-phase-skills/alignment.md`
- `.specify/features/007-workflow-phase-skills/context.md`
- `.specify/features/007-workflow-phase-skills/references.md`
- `.specify/features/007-workflow-phase-skills/brainstorming/handoff-to-specify.json`

### Input Risks From Alignment

- The Settings skill API and runtime SkillTool loader currently expose different source vocabularies. The plan mitigates this with a shared resolver plus explicit unsupported-source diagnostics where full parity is too risky for the first slice.
- Existing `skillProvenance` means template guidance today. Implementation must distinguish legacy guidance from resolved skill snapshots/evidence.
- Prompt emphasis must be strong enough to affect attention but cannot become a hidden requirement.

## Research Inputs

### Standard Stack

- Use existing TypeScript server services, Bun tests, React desktop components, and Vitest/Testing Library. No new framework or dependency is needed.

### Don't Hand-Roll

- Do not build a desktop-only resolver. Extend/extract server-side resolver logic and use it everywhere workflow dependency status is needed.
- Do not hand-roll permission behavior in workflow runtime. Keep invocation and capability effects in SkillTool.

### Common Pitfalls

- Divergent source vocabularies can make a skill appear available in Settings but unavailable at runtime, or the reverse.
- Treating missing recommended skills as errors would contradict import-with-warnings.
- Treating every unused recommendation as evidence would create noisy reports.
- Desktop workflow state priority must keep pending confirmation ahead of stale running status when status UI is extended.

### Assumptions To Validate

- A content hash or version marker can be derived from available skill metadata or file contents without logging sensitive skill content.
- First implementation may report `unsupported-source` for sources not safely resolvable through the shared server service.
- Old `skills[].reason` can be preserved as legacy display/context without becoming authoritative applicability metadata.

### Environment / Dependency Notes

- Bun is the root runtime. Desktop checks run through existing desktop package scripts via root quality commands.
- No live provider/model baseline is required for this design artifact. Implementation affecting agent loop/core runtime may later require live baseline evidence when provider credentials are available.

## Constitution Check

- Specification-first delivery: pass. `spec.md`, `alignment.md`, and this plan govern the change before implementation.
- Simplicity and scope discipline: pass. Reuses existing workflow template, API, runtime, and UI surfaces.
- Test-backed changes: pass for planning. Implementation tasks must add same-area tests and run required gates.
- Security by default: pass. SkillTool remains the permission boundary and default bundling/auto-exec are out of scope.
- Reviewable, reversible delivery: pass. Plan preserves old templates/exports and unknown fields.
- Evidence before completion: pass for planning artifacts after validation; implementation still must run code gates.
- No unrequested fallbacks: pass. Unsupported sources are explicit diagnostics, not silent behavior substitution.

## Project Structure

### Documentation (this feature)

```text
.specify/features/007-workflow-phase-skills/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── workflow-phase-skills-api.md
├── plan-contract.json
├── planning/
│   ├── checkpoints.ndjson
│   ├── evidence-index.json
│   └── handoffs/
│       ├── research.json
│       ├── data-model.json
│       ├── contracts.json
│       └── quickstart-validation.json
└── tasks.md              # created later by /sp.tasks
```

### Source Code (repository root)

```text
src/
├── skills/
│   └── loadSkillsDir.ts
├── tools/
│   └── SkillTool/
├── server/
│   ├── api/
│   │   ├── skills.ts
│   │   ├── sessions.ts
│   │   └── workflowTemplates.ts
│   ├── __tests__/
│   └── services/
│       ├── workflowTypes.ts
│       ├── workflowTemplateValidation.ts
│       ├── workflowTemplateRegistryService.ts
│       ├── workflowSessionCreateService.ts
│       ├── workflowRuntimeService.ts
│       ├── workflowSummary.ts
│       ├── workflowFinalReport.ts
│       └── workflowToolPolicy.ts

desktop/src/
├── api/
│   ├── sessions.ts
│   └── skills.ts
├── stores/
│   └── skillStore.ts
├── types/
│   ├── session.ts
│   └── skill.ts
└── components/workflow/
    ├── WorkflowTemplateEditor.tsx
    ├── WorkflowImportExportDialog.tsx
    └── WorkflowStatusPanel.tsx
```

**Structure Decision**: Keep this feature inside existing server workflow services/API and desktop workflow components. Add a shared resolver service rather than a new package or separate workflow skill subsystem.

## State-Behavior Matrix

| State | Expected Skill Behavior | Required Persistence | UI/Diagnostic Behavior |
| --- | --- | --- | --- |
| Authoring draft | Resolve references as best-effort diagnostics. | Preserve old and new `skills` entries. | Phase-local selector shows availability/source. |
| Import preview | Resolve dependency manifest and template references. | No write until commit. | Warnings for missing/disabled/unsupported recommended skills. |
| Imported/saved template | Store references and unknown fields. | Preserve unresolved references. | Show degraded state without dropping entries. |
| Session created | Snapshot template references for phases. | Store initial resolution snapshot when phase starts. | Summary can show pending availability. |
| Running phase | Prompt uses snapshot and status. | Preserve phase snapshot and bounded evidence. | Status strip shows available/unavailable counts. |
| Pending confirmation | Preserve completion evidence and recommended skill status. | Do not recompute semantics from changed source files. | Pending confirmation remains the higher-priority UI state. |
| Failed/cancelled | Keep snapshot/evidence for explanation. | Report/status can explain degraded skill state. | Do not prompt for repair as a blocker. |
| Completed | Final report summarizes signal-bearing evidence only. | Persist final report snapshot/evidence. | Expandable report evidence. |
| Resumed | Use persisted snapshot; flag stale/missing template separately. | Carry compact summary fields. | Distinguish workflow resume from skill resolution issues. |
| Missing/stale template | Do not discard phase skill snapshot. | Preserve source-template diagnostics separately. | Show template state and skill state independently. |
| Missing skill | Keep reference with `missing`. | Do not remove reference. | Warning/degraded status only. |
| Plugin disabled | Keep skill binding with plugin provenance. | Do not convert to plugin binding. | `plugin-disabled` diagnostic. |
| Ambiguous skill | Require disambiguating metadata before treating as available. | Preserve candidate diagnostics. | Author/import warning or validation error depending save path. |

## Capability Preservation Plan

| Capability | Implementation Surface | Validation |
| --- | --- | --- |
| Phase Skill Binding Identity | `WorkflowPhaseSkillReference`, template validation/registry | Schema and round-trip tests |
| Shared Skill Catalog And Resolver | server resolver service, `/api/skills` integration, workflow APIs | Resolver and API tests |
| Phase-Local Authoring UI | `WorkflowTemplateEditor`, skill store/API | Component tests and keyboard/accessibility checks |
| Workflow Package Dependency Manifest | `workflowTemplates.ts`, desktop import/export dialog | Export/import preview tests |
| Active Phase Prompt Emphasis | `workflowRuntimeService.ts` | Prompt assembly tests |
| Lightweight Skill Evidence | session state, summary, final report, status panel | Final report/status/resume tests |
| Compatibility, Safety, Lifecycle Guardrails | validation, sessions, SkillTool policy | Old fixture tests and negative permission tests |

## Adaptive Dispatch Decision

- `execution_model`: adaptive
- `execution_mode`: standard
- `workflow_status`: ready
- `dispatch_shape`: leader-inline
- `execution_surface`: leader-inline
- `delegated_planning_lanes`: none
- `capability_degraded`: true
- `degradation_reason`: native multi-agent tools are visible, but current tool policy permits spawning only when the user explicitly asks for delegation. The `$sp-plan` request did not authorize subagent dispatch, so planning lanes were compiled inline with durable handoff files.

## Decision Preservation Check

- Approach A recommended binding -> Summary, Data Model, Contracts, Runtime Prompt Contract.
- Skills not plugins -> Data Model and Import/Export Contract.
- No auto-exec/default gate -> Constitution, CA-004, CA-010, Quickstart negative validation.
- Missing recommendations warn/preserve -> Contracts, State Matrix, Import/Export tests.
- Export dependency manifest/no default bundle -> Contracts and Quickstart.
- No duplicated skill-owned metadata -> Data Model validation and Review Focus.
- Phase-local UI -> Desktop Boundary and Capability Preservation Plan.

## Research Adoption Check

- Shared resolver decision -> used in Boundary Ownership, Contracts, and task sequencing.
- Prompt emphasis decision -> used in CA-002 and Runtime Prompt Contract.
- Signal-bearing evidence decision -> used in Evidence Model, Final Report, and Status UI.
- Permission boundary warning -> used in CA-004 and Forbidden Implementation Drift.
- Source-vocabulary mismatch risk -> used in Assumptions, Contracts, and validation plan.

## Recovery And Validation Contract

- Add old-template and old-export fixtures before changing persistence behavior.
- Add resolver tests covering `available`, `missing`, `ambiguous`, `unsupported-source`, `plugin-disabled`, and `invalid-reference`.
- Add runtime prompt tests proving recommended skills are highlighted and unavailable skills are marked unavailable.
- Add negative tests proving workflow runtime does not enable SkillTool permissions or invoke skills automatically.
- Add desktop tests for selector save behavior, import/export diagnostics, and concise status/evidence rendering.
- Run focused tests while implementing, then `bun run check:server`, `bun run check:desktop`, `bun run check:coverage`, and `bun run verify` before completion.

## Complexity Tracking

No constitution violations are accepted in this plan.
