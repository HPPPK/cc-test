# Tasks: Workflow Phase Execution Contracts

**Input**: Design documents from `.specify/features/009-specify-discussions-workflows/`
**Prerequisites**: `plan.md`, `spec.md`, `alignment.md`, `context.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/`
**Target root**: `F:/github/cc-jiangxia`
**Branch**: `009-specify-discussions-workflows`
**Task generation mode**: task-generation only; implementation begins in `/sp.implement`

## Planning Inputs

- **Locked planning decisions**: Preserve phase contracts as execution contracts, not cosmetic grouping; keep template-owned authorable fields separate from session-owned runtime state; preserve guidance/policy/evidence/gate strengths; keep recommended skills soft by default; export dependency manifests, not skill packages; treat blocked and unable outcomes as recoverable; preserve compatibility-first adaptation before grouped persistence migration.
- **Implementation constitution**: Extend existing workflow boundaries in `src/server/services`, `src/server/api`, `src/tools/SkillTool`, and `desktop/src/components/workflow`. Do not create a parallel workflow engine, scheduler, plugin subsystem, or auto-execution path.
- **Scenario profile**: Brownfield feature extension with compatibility and local workflow UX as the primary fidelity contract. Live repository reads are authoritative because project cognition is helpful but partial for this area.
- **Reference fidelity inventory**: Existing workflow template validation, template authoring, SkillTool permission handling, workflow import/export, session runtime state, status panel, transition controls, and desktop workflow tests remain the reference behavior surfaces.
- **Validation references**: `quickstart.md`, `contracts/workflow-phase-contract.md`, `contracts/workflow-skill-dependency-manifest.md`, `contracts/workflow-transition-submission.md`, and the current same-area tests listed in `plan-contract.json`.
- **Must-preserve obligations**: MP-001 through MP-013 are mapped in the Task Guardrail Index and task packets. None are deferred.

## Implementation Target Boundary

- **Target-relative paths**: implementation tasks are restricted to the write scopes named per task and packet.
- **Evidence status**: project cognition reviewed, then narrowed with live reads of workflow services, API routes, SkillTool, desktop workflow components, API clients, and same-area tests.
- **Boundary constraints**: use existing Bun/TypeScript, server service/API boundaries, desktop React component boundaries, SkillTool permission model, and Vitest coverage patterns.
- **Reference-only paths**: `.specify/features/009-specify-discussions-workflows/**`, `.specify/memory/project-rules.md`, `.specify/memory/learnings/**`, `docs/starup/jiangxia-startup.md`.

## Common Forbidden Scope

Every task inherits this forbidden scope unless the file is explicitly listed in that task's `write_scope`: `.env`, `.env.*`, `*.pem`, `*.key`, `*oauth*.json`, `~/.claude/**`, `.mcp.json`, `.codex/config.toml`, `.specify/project-cognition/**`, `.specify/memory/**`, `.git/**`, `node_modules/**`, `desktop/node_modules/**`, `adapters/**/node_modules/**`, `artifacts/**`, dependency lockfiles, package manifests, release artifacts, generated quality reports, and all source/test files outside the task's write scope.

## Task-Generation Evidence Index

- `task-generation/evidence-index.json`: Records standard leader-inline task generation, no delegated lanes, and consumers for each guardrail, dependency, write set, and join point.
- `task-generation/checkpoints.ndjson`: Records checkpoints for prerequisites, cognition review, synthesis, and validation.
- `task-generation/handoffs/`: No delegated handoffs were created. Multi-agent capability was available only behind an explicit user-request contract, so this package records `capability_degraded: true` and keeps decomposition leader-inline.

## Task Guardrail Index

- `G-CONTRACT`: MP-001, MP-002. Workflow phases are execution contracts across server, runtime, SkillTool, desktop, sharing, lifecycle, and validation.
- `G-STATE`: MP-003, MP-008, MP-009. Templates own authorable contract fields; sessions own runtime state; lifecycle and completion outcomes stay separate.
- `G-STRENGTH`: MP-004. Guidance, policy, evidence, and gate strengths remain distinct and visible.
- `G-SKILL`: MP-005, MP-006, CA-001 through CA-007, CA-010. Recommended skills bind to existing skills, remain soft by default, preserve SkillTool permissions, and surface relevant used/skipped/unavailable evidence.
- `G-SHARE`: MP-007, CA-003, CA-007. Export templates plus dependency manifests only; import surfaces diagnostics and never silently drops references.
- `G-UI`: MP-010, CA-008. Runtime controls are authority-labeled and do not mix manual completion with pending confirmation.
- `G-COMPAT`: MP-011, MP-013. Compatibility-first adaptation and old-template fixtures precede grouped persistence migration; live reads remain authoritative.
- `G-SCOPE`: MP-012. Scheduler, auto-execution, default required gates, skill bundle export, and destructive migration remain out of scope.
- `G-EVIDENCE`: CA-005, CA-006, CA-009. Skill provenance and completion evidence survive session snapshots, compaction, resume, reports, and imports.
- `G-TEST`: SC-001 through SC-004. Same-area tests, old fixtures, narrow checks, coverage gate, and final `bun run verify` are required before ready/complete claims.

## Reference Fidelity Mapping

- Existing template validation and unknown-field preservation: T002, T004, T006.
- Existing desktop workflow editor behavior and compact UI controls: T003, T005, T006.
- SkillTool permission and prompt boundaries: T007, T008, T010.
- Import/export preview and diagnostics behavior: T011, T012, T013, T014.
- Pending confirmation priority over stale running state: T015, T016, T017.
- Workflow final report and compact summary carryover: T015, T016, T018.

## Consequence Obligation Mapping

| Obligation ID | Task IDs | Affected State / Dependency | Required References | Validation | Stop And Reopen |
| --- | --- | --- | --- | --- | --- |
| CA-001 | T007, T008, T011, T012 | Skill references, catalog, resolver, import/export | `data-model.md`, skill manifest contract, `src/server/api/skills.ts` | Skill resolver and import/export tests | Source/provenance semantics remain unspecified |
| CA-002 | T007, T008 | Prompts, SkillTool, permissions | `src/tools/SkillTool/SkillTool.ts`, `prompt.ts`, workflow tool policy | SkillTool boundary tests | Priority implies unsafe permission override |
| CA-003 | T007, T008, T011, T012, T013, T014 | Resolver, validation, import preview, runtime UI | dependency manifest contract | Missing/ambiguous/invalid skill diagnostics tests | Missing skills silently degrade to prose |
| CA-004 | T007, T008 | SkillTool, workflow runtime, tool policy | `workflowToolPolicy.ts`, `SkillTool.ts` | Runtime/tool policy tests | Workflow references bypass SkillTool semantics |
| CA-005 | T008, T015, T016 | Sessions, snapshots, reports | transition contract, existing session fixtures | Session snapshot and final report tests | Source edits silently change active sessions |
| CA-006 | T008, T009, T010, T015, T016 | Completion evidence, runtime UI, reports | phase contract, status panel tests | Status panel and final report tests | Skills run or are skipped invisibly |
| CA-007 | T002, T004, T011, T012 | Editor, API, validation, session creation | validation service, registry service | Validation and import preview tests | Invalid references persist without diagnostics |
| CA-008 | T003, T005, T009, T010, T013, T014, T017 | Editor, import/export, status panel, controls | quickstart, desktop workflow tests | Testing Library assertions | UI states unspecified or misleading |
| CA-009 | T015, T016, T018 | State, artifacts, reports, imports | final report and compact summary tests | Runtime, final report, summary tests | Evidence drops across lifecycle boundaries |
| CA-010 | T007, T008 | SkillTool and future auto/required modes | SkillTool prompt and policy | Boundary tests | Auto/required invocation lacks depth/loop limits |

## Analyze Remediation Mapping

| Finding ID | Disposition | Task/Section Evidence | Notes |
| --- | --- | --- | --- |
| No prior analyze blockers | not_applicable | First task-generation pass | No remediation mapping required |

## Phase 0: Implementation Guardrails

**Purpose**: Freeze the feature implementation matrix before source edits begin.

- [X] T001 [AGENT] Create the implementation matrix in `.specify/features/009-specify-discussions-workflows/implementation-matrix.md`
  - Contract: `agent=quality-reviewer`; `depends_on=[]`; `parallel_safe=false`; `packet=task-packets/T001.json`
  - Context navigation: `spec.md` FR/NFR/SC sections; `plan.md` Constitution Check and Project Structure; `plan-contract.json` `must_preserve`, `capabilities`, `consequence_obligations`, `verification`; `.specify/memory/project-rules.md`
  - Scope: `write_scope=[.specify/features/009-specify-discussions-workflows/implementation-matrix.md]`; `read_scope=[feature artifacts, project memory, same-area test inventory]`; `forbidden=[Common Forbidden Scope]`
  - Expected outputs: implementation matrix mapping FR-001 through FR-030, NFR-001 through NFR-006, SC-001 through SC-004, MP-001 through MP-013, CA-001 through CA-010 to task IDs and verification.
  - Anti-goals: do not edit source, tests, package files, docs, MCP config, memory, or project cognition.
  - Acceptance criteria: every buildable FR and success criterion has at least one owning task or explicit verification checkpoint; no locked MP or CA item is unmapped.
  - Verify commands: `Test-Path .specify/features/009-specify-discussions-workflows/implementation-matrix.md`
  - Handoff format: update the matrix path and unresolved mapping count in the task handoff; `retry_max=1`; `escalation=sp-plan` if any locked obligation cannot be mapped.

**Checkpoint 0**: No implementation task may start until T001 shows complete mapping coverage.

---

## Phase 1: Foundational Compatibility and Authoring Model

**Goal**: Add compatibility-first validation and editor coverage for the grouped phase contract model.

**Independent Test**: Old flat workflow templates still load with unknown fields preserved, grouped contract fields validate, and desktop editor changes round-trip without runtime state becoming editable template data.

- [X] T002 [P] [US1] [AGENT] Add server compatibility and validation tests for grouped phase contracts in `src/server/services/workflowTypes.test.ts`, `src/server/services/workflowTemplateRegistryService.test.ts`, and `src/server/services/__fixtures__/workflow-templates/legacy-flat-phase-contract.json`
  - Contract: `agent=test-engineer`; `depends_on=[T001]`; `parallel_safe=true`; `packet=task-packets/T002.json`
  - Context navigation: `contracts/workflow-phase-contract.md`; `data-model.md` PhaseContract/PhaseRuntimeState; `spec.md` FR-001 through FR-006, FR-025, FR-026; existing workflow template fixtures.
  - Scope: `write_scope=[src/server/services/workflowTypes.test.ts, src/server/services/workflowTemplateRegistryService.test.ts, src/server/services/__fixtures__/workflow-templates/legacy-flat-phase-contract.json]`; `read_scope=[src/server/services/workflowTypes.ts, workflowTemplateValidation.ts, workflowTemplateRegistryService.ts]`; `forbidden=[Common Forbidden Scope, production source files]`
  - Expected outputs: failing-first tests for flat-to-grouped projection, grouped field validation, constraint strength validation, runtimeState exclusion from template persistence, and unknown-field preservation.
  - Anti-goals: do not implement production code; do not delete existing fixture coverage.
  - Acceptance criteria: targeted tests fail only for missing grouped contract behavior before T004 and pass after T004.
  - Verify commands: `bun test src/server/services/workflowTypes.test.ts src/server/services/workflowTemplateRegistryService.test.ts`
  - Handoff format: include failing assertions and fixture path; `retry_max=2`; `escalation=debugger` for setup/syntax failures.

- [X] T003 [P] [US1] [AGENT] Add desktop editor tests for grouped authoring in `desktop/src/components/workflow/WorkflowComponents.test.tsx`
  - Contract: `agent=test-engineer`; `depends_on=[T001]`; `parallel_safe=true`; `packet=task-packets/T003.json`
  - Context navigation: `quickstart.md` author workflow; `contracts/workflow-phase-contract.md`; `spec.md` FR-001 through FR-006, FR-028; existing editor tests.
  - Scope: `write_scope=[desktop/src/components/workflow/WorkflowComponents.test.tsx]`; `read_scope=[WorkflowTemplateEditor.tsx, workflowTemplateDisplay.ts, desktop/src/types/session.ts]`; `forbidden=[Common Forbidden Scope, production source files]`
  - Expected outputs: failing-first tests for Intent, Contract, Evidence Policy, Recommended Skills, and non-editable runtime state groups.
  - Anti-goals: do not alter production UI; do not add marketing/help copy.
  - Acceptance criteria: assertions fail because grouped controls or save payloads are missing, not because test setup is broken.
  - Verify commands: `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx`
  - Handoff format: include test names and expected failure reasons; `retry_max=2`; `escalation=debugger`.

- [X] T004 [US1] [AGENT] Implement grouped phase contract compatibility in `src/server/services/workflowTypes.ts`, `src/server/services/workflowTemplateValidation.ts`, and `src/server/services/workflowTemplateRegistryService.ts`
  - Contract: `agent=executor`; `depends_on=[T002]`; `parallel_safe=false`; `packet=task-packets/T004.json`
  - Context navigation: T002 failing tests; `contracts/workflow-phase-contract.md`; `data-model.md`; `plan-contract.json` CAP-001/CAP-007.
  - Scope: `write_scope=[src/server/services/workflowTypes.ts, src/server/services/workflowTemplateValidation.ts, src/server/services/workflowTemplateRegistryService.ts]`; `read_scope=[server workflow tests and fixtures]`; `forbidden=[Common Forbidden Scope, desktop files, SkillTool files]`
  - Expected outputs: compatibility projection from legacy flat fields to grouped contract shape, validation diagnostics for strength/source/provenance fields, no persisted template-owned runtimeState, unknown-field preservation.
  - Anti-goals: no destructive migration, no database/storage format rewrite, no scheduler or gate executor.
  - Acceptance criteria: T002 tests pass and existing workflow template tests still pass.
  - Verify commands: `bun test src/server/services/workflowTypes.test.ts src/server/services/workflowTemplateRegistryService.test.ts src/server/__tests__/workflowTemplates.test.ts`
  - Handoff format: summarize compatibility behavior and rejected shapes; `retry_max=2`; `escalation=debugger`.

- [X] T005 [US1] [AGENT] Implement grouped authoring UI and payload mapping in `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`, `desktop/src/components/workflow/workflowTemplateDisplay.ts`, `desktop/src/types/session.ts`, and locale files touched by existing workflow editor labels
  - Contract: `agent=executor`; `depends_on=[T003,T004]`; `parallel_safe=false`; `packet=task-packets/T005.json`
  - Context navigation: T003 failing tests; `contracts/workflow-phase-contract.md`; `quickstart.md`; existing editor label patterns.
  - Scope: `write_scope=[desktop/src/components/workflow/WorkflowTemplateEditor.tsx, desktop/src/components/workflow/workflowTemplateDisplay.ts, desktop/src/types/session.ts, desktop/src/i18n/locales/en.ts, desktop/src/i18n/locales/zh.ts]`; `read_scope=[desktop workflow components and API types]`; `forbidden=[Common Forbidden Scope, server runtime files, SkillTool files]`
  - Expected outputs: grouped controls for phase intent/contract/evidence policy/recommended skills, old-template display compatibility, save payload preserving unknown fields and excluding session-owned runtime state.
  - Anti-goals: no new card-heavy layout, no visible feature tutorial text, no runtime execution controls in the editor.
  - Acceptance criteria: T003 tests pass and editor keeps existing authoring workflows usable.
  - Verify commands: `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx`
  - Handoff format: summarize payload shape and UI grouping; `retry_max=2`; `escalation=debugger`.

- [X] T006 [US1] [AGENT] Join and verify US1 compatibility and authoring behavior
  - Contract: `agent=quality-reviewer`; `depends_on=[T004,T005]`; `parallel_safe=false`; `packet=task-packets/T006.json`
  - Context navigation: `implementation-matrix.md`; T002 through T005 handoffs; `quickstart.md` author scenario.
  - Scope: `write_scope=[.specify/features/009-specify-discussions-workflows/implementation-matrix.md]`; `read_scope=[changed server and desktop test output]`; `forbidden=[Common Forbidden Scope, source files, test files]`
  - Expected outputs: matrix updated with US1 evidence, unresolved US1 risks, and any accepted compatibility notes.
  - Anti-goals: do not patch code during join validation.
  - Acceptance criteria: server and desktop US1 tests pass, and no old-template fixture behavior is unaccounted for.
  - Verify commands: `bun test src/server/services/workflowTypes.test.ts src/server/services/workflowTemplateRegistryService.test.ts`; `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx`
  - Handoff format: record pass/fail commands and matrix update; `retry_max=1`; `escalation=debugger` if a regression appears.

---

## Phase 2: User Story 2 - Run A Phase With Recommended Skills (Priority: P2)

**Goal**: Recommended phase skills bind to existing skills, preserve SkillTool boundaries, and surface relevant used/skipped/unavailable evidence at runtime.

**Independent Test**: Starting or running a workflow resolves recommended skills with provenance, never auto-runs them, preserves permission handling, and reports relevant audit state.

- [X] T007 [P] [US2] [AGENT] Add server tests for skill binding, provenance, degraded behavior, and SkillTool boundary protection in `src/server/services/workflowPhaseSkillResolver.test.ts`, `src/server/services/workflowToolPolicy.test.ts`, and `src/server/services/workflowRuntimeService.test.ts`
  - Contract: `agent=test-engineer`; `depends_on=[T006]`; `parallel_safe=true`; `packet=task-packets/T007.json`
  - Context navigation: `contracts/workflow-phase-contract.md`; `contracts/workflow-skill-dependency-manifest.md`; `src/tools/SkillTool/SkillTool.ts`; learning on workflow authoring skill catalog visibility.
  - Scope: `write_scope=[src/server/services/workflowPhaseSkillResolver.test.ts, src/server/services/workflowToolPolicy.test.ts, src/server/services/workflowRuntimeService.test.ts]`; `read_scope=[workflowPhaseSkillResolver.ts, workflowToolPolicy.ts, workflowRuntimeService.ts, SkillTool.ts, prompt.ts]`; `forbidden=[Common Forbidden Scope, production source files]`
  - Expected outputs: failing-first tests for local/bundled/plugin/managed/MCP source identity, priority labels without permission override, unavailable/ambiguous diagnostics, soft-by-default behavior, and recursion/auto-run guardrails.
  - Anti-goals: do not change runtime code or SkillTool implementation in this task.
  - Acceptance criteria: tests fail for missing behavior, not setup; existing permission tests remain intact.
  - Verify commands: `bun test src/server/services/workflowPhaseSkillResolver.test.ts src/server/services/workflowToolPolicy.test.ts src/server/services/workflowRuntimeService.test.ts`
  - Handoff format: list failing behavior categories; `retry_max=2`; `escalation=debugger`.

- [X] T008 [US2] [AGENT] Implement recommended skill binding and runtime audit behavior in `src/server/services/workflowPhaseSkillResolver.ts`, `src/server/services/workflowToolPolicy.ts`, `src/server/services/workflowRuntimeService.ts`, `src/server/services/workflowSessionCreateService.ts`, `src/server/services/workflowFinalReport.ts`, `src/server/services/workflowSummary.ts`, `src/server/api/skills.ts`, `src/skills/loadSkillsDir.ts`, `src/tools/SkillTool/SkillTool.ts`, and `src/tools/SkillTool/prompt.ts`
  - Contract: `agent=executor`; `depends_on=[T007]`; `parallel_safe=false`; `packet=task-packets/T008.json`
  - Context navigation: T007 failing tests; `data-model.md` SkillBinding/SkillDependency/CompletionEvidence; `plan-contract.json` CA-001 through CA-006, CA-010.
  - Scope: `write_scope=[src/server/services/workflowPhaseSkillResolver.ts, src/server/services/workflowToolPolicy.ts, src/server/services/workflowRuntimeService.ts, src/server/services/workflowSessionCreateService.ts, src/server/services/workflowFinalReport.ts, src/server/services/workflowSummary.ts, src/server/api/skills.ts, src/skills/loadSkillsDir.ts, src/tools/SkillTool/SkillTool.ts, src/tools/SkillTool/prompt.ts]`; `read_scope=[same-area tests, skills API, SkillTool prompt]`; `forbidden=[Common Forbidden Scope, desktop files, import/export UI files]`
  - Expected outputs: stable skill identity/provenance, recommended-skill status snapshots, relevant used/skipped/unavailable audit, permission-safe SkillTool invocation language, no auto-run path, bounded recursion/depth guard.
  - Anti-goals: no plugin installer, no bundled skill export, no required/default gate executor.
  - Acceptance criteria: T007 tests and existing server workflow/skills tests pass.
  - Verify commands: `bun test src/server/services/workflowPhaseSkillResolver.test.ts src/server/services/workflowToolPolicy.test.ts src/server/services/workflowRuntimeService.test.ts src/server/services/workflowFinalReport.test.ts src/server/services/workflowSummary.test.ts src/server/__tests__/skills.test.ts`
  - Handoff format: summarize binding identity fields and audit persistence; `retry_max=2`; `escalation=debugger`.

- [X] T009 [P] [US2] [AGENT] Add desktop tests for recommended-skill status, provenance, and evidence visibility in `desktop/src/components/workflow/WorkflowComponents.test.tsx`, `desktop/src/api/skills.test.ts`, and `desktop/src/__tests__/skillsSettings.test.tsx`
  - Contract: `agent=test-engineer`; `depends_on=[T006]`; `parallel_safe=true`; `packet=task-packets/T009.json`
  - Context navigation: `quickstart.md` run workflow scenario; `data-model.md` SkillBinding status fields; existing status panel tests.
  - Scope: `write_scope=[desktop/src/components/workflow/WorkflowComponents.test.tsx, desktop/src/api/skills.test.ts, desktop/src/__tests__/skillsSettings.test.tsx]`; `read_scope=[WorkflowStatusPanel.tsx, desktop/src/api/skills.ts, skillStore.ts, desktop/src/types/skill.ts]`; `forbidden=[Common Forbidden Scope, production source files]`
  - Expected outputs: failing-first tests for source/provenance labels, unavailable/skipped status, relevant audit visibility, and catalog filtering without hidden auto-run affordances.
  - Anti-goals: do not implement UI or API client changes in this task.
  - Acceptance criteria: tests fail only for missing UI/API behavior.
  - Verify commands: `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx src/api/skills.test.ts src/__tests__/skillsSettings.test.tsx`
  - Handoff format: list expected status labels and missing controls; `retry_max=2`; `escalation=debugger`.

- [X] T010 [US2] [AGENT] Implement desktop recommended-skill runtime visibility in `desktop/src/components/workflow/WorkflowStatusPanel.tsx`, `desktop/src/components/workflow/WorkflowStartDialog.tsx`, `desktop/src/components/workflow/WorkflowTemplatePicker.tsx`, `desktop/src/api/skills.ts`, `desktop/src/stores/skillStore.ts`, `desktop/src/types/skill.ts`, and `desktop/src/types/session.ts`
  - Contract: `agent=executor`; `depends_on=[T008,T009]`; `parallel_safe=false`; `packet=task-packets/T010.json`
  - Context navigation: T009 failing tests; `quickstart.md`; `contracts/workflow-phase-contract.md`; desktop skill store/API patterns.
  - Scope: `write_scope=[desktop/src/components/workflow/WorkflowStatusPanel.tsx, desktop/src/components/workflow/WorkflowStartDialog.tsx, desktop/src/components/workflow/WorkflowTemplatePicker.tsx, desktop/src/api/skills.ts, desktop/src/stores/skillStore.ts, desktop/src/types/skill.ts, desktop/src/types/session.ts, desktop/src/i18n/locales/en.ts, desktop/src/i18n/locales/zh.ts]`; `read_scope=[desktop workflow and skill components]`; `forbidden=[Common Forbidden Scope, server files, SkillTool files]`
  - Expected outputs: provenance/status display for recommended skills, unavailable/ambiguous labels, relevant audit visibility, no auto-run or install-now behavior unless existing catalog affordances already support it.
  - Anti-goals: no new plugin manager, no in-app tutorial copy, no hidden mutation of skill config.
  - Acceptance criteria: T009 tests pass and existing desktop skill settings tests remain green.
  - Verify commands: `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx src/api/skills.test.ts src/__tests__/skillsSettings.test.tsx`
  - Handoff format: summarize UI states and API shape; `retry_max=2`; `escalation=debugger`.

**Checkpoint 2**: US2 is independently releasable when T007 through T010 pass and T006 evidence still holds.

---

## Phase 3: User Story 3 - Share And Import A Workflow (Priority: P3)

**Goal**: Workflow export includes a dependency manifest and import preview shows actionable dependency diagnostics without bundling skill contents.

**Independent Test**: Exported JSON contains template metadata and dependency manifest only; import preview classifies available, missing, ambiguous, invalid, unsupported, and disabled dependencies before commit.

- [X] T011 [US3] [AGENT] Add server API tests for dependency-aware import/export in `src/server/__tests__/workflowTemplates.test.ts` and `src/server/services/workflowTemplateRegistryService.test.ts`
  - Contract: `agent=test-engineer`; `depends_on=[T010]`; `parallel_safe=false`; `packet=task-packets/T011.json`
  - Context navigation: `contracts/workflow-skill-dependency-manifest.md`; `spec.md` FR-015 through FR-021, FR-027; existing workflow template route tests.
  - Scope: `write_scope=[src/server/__tests__/workflowTemplates.test.ts, src/server/services/workflowTemplateRegistryService.test.ts, src/server/services/__fixtures__/workflow-templates/export-with-dependency-manifest.json]`; `read_scope=[src/server/api/workflowTemplates.ts, workflowTemplateRegistryService.ts, workflowPhaseSkillResolver.ts]`; `forbidden=[Common Forbidden Scope, production source files]`
  - Expected outputs: failing-first tests for schemaVersion 2 export, dependency manifest source/provenance metadata, no bundled skill contents, import preview diagnostics, blocked commit for invalid bindings, and unknown-field preservation.
  - Anti-goals: do not implement API changes in this task.
  - Acceptance criteria: tests fail for missing manifest/diagnostic behavior only.
  - Verify commands: `bun test src/server/__tests__/workflowTemplates.test.ts src/server/services/workflowTemplateRegistryService.test.ts`
  - Handoff format: include diagnostic matrix and fixture path; `retry_max=2`; `escalation=debugger`.

- [X] T012 [US3] [AGENT] Implement dependency-aware import/export in `src/server/api/workflowTemplates.ts`, `src/server/services/workflowTemplateRegistryService.ts`, `src/server/services/workflowTemplateValidation.ts`, and `src/server/services/workflowPhaseSkillResolver.ts`
  - Contract: `agent=api-reviewer`; `depends_on=[T011]`; `parallel_safe=false`; `packet=task-packets/T012.json`
  - Context navigation: T011 failing tests; dependency manifest contract; data model SkillDependency and WorkflowExportEnvelope.
  - Scope: `write_scope=[src/server/api/workflowTemplates.ts, src/server/services/workflowTemplateRegistryService.ts, src/server/services/workflowTemplateValidation.ts, src/server/services/workflowPhaseSkillResolver.ts]`; `read_scope=[server API tests, skill resolver tests]`; `forbidden=[Common Forbidden Scope, desktop files, SkillTool files]`
  - Expected outputs: export envelope with dependency manifest, import preview diagnostic statuses and severity, commit guard for blocking diagnostics, no skill package serialization.
  - Anti-goals: no network installation, no plugin enablement flow, no silent binding deletion.
  - Acceptance criteria: T011 tests plus existing workflow template API tests pass.
  - Verify commands: `bun test src/server/__tests__/workflowTemplates.test.ts src/server/services/workflowTemplateRegistryService.test.ts src/server/services/workflowPhaseSkillResolver.test.ts`
  - Handoff format: summarize API response shape and blocked/allowed cases; `retry_max=2`; `escalation=debugger`.

- [X] T013 [US3] [AGENT] Add desktop import/export diagnostic tests in `desktop/src/components/workflow/WorkflowComponents.test.tsx`
  - Contract: `agent=test-engineer`; `depends_on=[T010]`; `parallel_safe=false`; `packet=task-packets/T013.json`
  - Context navigation: dependency manifest contract; `quickstart.md` share/import scenario; existing `WorkflowImportExportDialog` tests.
  - Scope: `write_scope=[desktop/src/components/workflow/WorkflowComponents.test.tsx]`; `read_scope=[WorkflowImportExportDialog.tsx, desktop/src/types/session.ts]`; `forbidden=[Common Forbidden Scope, production source files]`
  - Expected outputs: failing-first tests for copyable export JSON, dependency diagnostics table, blocked import commit, non-blocking warnings, and explicit no-bundled-skills language.
  - Anti-goals: do not implement UI changes in this task.
  - Acceptance criteria: tests fail because import/export diagnostics are absent or incomplete.
  - Verify commands: `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx`
  - Handoff format: list diagnostic states and expected visible labels; `retry_max=2`; `escalation=debugger`.

- [X] T014 [US3] [AGENT] Implement desktop import/export diagnostics in `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`, `desktop/src/components/workflow/WorkflowTemplateManager.tsx`, `desktop/src/types/session.ts`, and workflow locale files
  - Contract: `agent=executor`; `depends_on=[T012,T013]`; `parallel_safe=false`; `packet=task-packets/T014.json`
  - Context navigation: T013 failing tests; dependency manifest contract; export save-picker fallback learning to avoid accidental file-write scope expansion.
  - Scope: `write_scope=[desktop/src/components/workflow/WorkflowImportExportDialog.tsx, desktop/src/components/workflow/WorkflowTemplateManager.tsx, desktop/src/types/session.ts, desktop/src/i18n/locales/en.ts, desktop/src/i18n/locales/zh.ts]`; `read_scope=[desktop workflow manager/dialog components]`; `forbidden=[Common Forbidden Scope, server files, filesystem write picker code unless already owned by dialog]`
  - Expected outputs: import preview diagnostics UI, blocked/non-blocking commit affordances, copyable export JSON with dependency manifest, clear statement that skill contents are not bundled.
  - Anti-goals: no automatic install, no hidden localStorage repair, no new save-file fallback behavior.
  - Acceptance criteria: T013 tests pass and existing import/export tests still pass.
  - Verify commands: `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx`
  - Handoff format: summarize import/export user states; `retry_max=2`; `escalation=debugger`.

**Checkpoint 3**: US3 is independently releasable when import/export API and desktop diagnostics pass without scope expansion into skill package installation.

---

## Phase 4: User Story 4 - Complete, Reject, Or Retry A Phase (Priority: P4)

**Goal**: Completion submissions, pending confirmation, blocked/unable outcomes, and final report evidence are durable and authority-labeled.

**Independent Test**: Ready submissions require confirmation, reject and retry preserve evidence and state versions, blocked/unable remain recoverable, and duplicate ready submissions are rejected while pending.

- [X] T015 [US4] [AGENT] Add server runtime and report tests for completion submissions in `src/server/services/workflowRuntimeService.test.ts`, `src/server/services/workflowSessionStateService.test.ts`, `src/server/services/workflowFinalReport.test.ts`, and `src/services/compact/workflowSummaryCarryover.test.ts`
  - Contract: `agent=test-engineer`; `depends_on=[T010]`; `parallel_safe=false`; `packet=task-packets/T015.json`
  - Context navigation: `contracts/workflow-transition-submission.md`; learning on pending confirmation priority; existing workflow session fixtures.
  - Scope: `write_scope=[src/server/services/workflowRuntimeService.test.ts, src/server/services/workflowSessionStateService.test.ts, src/server/services/workflowFinalReport.test.ts, src/services/compact/workflowSummaryCarryover.test.ts, src/server/services/__fixtures__/workflow-sessions/pending-skill-evidence-state.json]`; `read_scope=[workflowRuntimeService.ts, workflowSessionStateService.ts, workflowFinalReport.ts, workflowSummary.ts]`; `forbidden=[Common Forbidden Scope, production source files]`
  - Expected outputs: failing-first tests for ready/blocked/unable submissions, stateVersion idempotency, pending duplicate rejection, confirm/reject/retry, final report evidence, and compact summary carryover.
  - Anti-goals: do not implement runtime changes in this task.
  - Acceptance criteria: tests fail only for missing transition/evidence behavior.
  - Verify commands: `bun test src/server/services/workflowRuntimeService.test.ts src/server/services/workflowSessionStateService.test.ts src/server/services/workflowFinalReport.test.ts src/services/compact/workflowSummaryCarryover.test.ts`
  - Handoff format: list transition cases and expected state snapshots; `retry_max=2`; `escalation=debugger`.

- [X] T016 [US4] [AGENT] Implement completion submission durability in `src/server/services/workflowRuntimeService.ts`, `src/server/services/workflowSessionStateService.ts`, `src/server/services/workflowFinalReport.ts`, `src/server/services/workflowSummary.ts`, and `src/server/services/workflowToolPolicy.ts`
  - Contract: `agent=executor`; `depends_on=[T015]`; `parallel_safe=false`; `packet=task-packets/T016.json`
  - Context navigation: T015 failing tests; transition submission contract; `plan-contract.json` MP-008/MP-009/CA-009.
  - Scope: `write_scope=[src/server/services/workflowRuntimeService.ts, src/server/services/workflowSessionStateService.ts, src/server/services/workflowFinalReport.ts, src/server/services/workflowSummary.ts, src/server/services/workflowToolPolicy.ts]`; `read_scope=[runtime, state, report tests and fixtures]`; `forbidden=[Common Forbidden Scope, desktop files, import/export API files]`
  - Expected outputs: stateVersion checks, recoverable blocked/unable outcomes, duplicate ready rejection while pending, confirm/reject/retry state transitions, final report and compact summary evidence persistence.
  - Anti-goals: no terminal failure mapping for blocked/unable, no silent overwrite, no scheduler.
  - Acceptance criteria: T015 tests pass and existing workflow runtime/report tests pass.
  - Verify commands: `bun test src/server/services/workflowRuntimeService.test.ts src/server/services/workflowSessionStateService.test.ts src/server/services/workflowFinalReport.test.ts src/services/compact/workflowSummaryCarryover.test.ts`
  - Handoff format: summarize transition table and persisted fields; `retry_max=2`; `escalation=debugger`.

- [X] T017 [US4] [AGENT] Add and implement desktop transition-control safety in `desktop/src/components/workflow/WorkflowComponents.test.tsx`, `desktop/src/components/workflow/WorkflowTransitionControls.tsx`, `desktop/src/components/workflow/WorkflowStatusPanel.tsx`, and `desktop/src/types/session.ts`
  - Contract: `agent=executor`; `depends_on=[T016]`; `parallel_safe=false`; `packet=task-packets/T017.json`
  - Context navigation: transition submission contract; pending-confirmation learning; quickstart completion scenario; existing transition control tests.
  - Scope: `write_scope=[desktop/src/components/workflow/WorkflowComponents.test.tsx, desktop/src/components/workflow/WorkflowTransitionControls.tsx, desktop/src/components/workflow/WorkflowStatusPanel.tsx, desktop/src/types/session.ts, desktop/src/i18n/locales/en.ts, desktop/src/i18n/locales/zh.ts]`; `read_scope=[desktop workflow controls/status components]`; `forbidden=[Common Forbidden Scope, server files]`
  - Expected outputs: tests and implementation for Confirm/Reject/Retry when pending, manual completion separated from pending confirmation, stale running state not overriding pending state, blocked/unable recovery controls, explicit authority labels.
  - Anti-goals: no hidden auto-confirm, no duplicate ready submission button while pending, no destructive localStorage repair.
  - Acceptance criteria: desktop transition tests pass and existing status panel evidence remains visible.
  - Verify commands: `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx`
  - Handoff format: summarize control-state matrix and screenshots only if a browser smoke is added; `retry_max=2`; `escalation=debugger`.

**Checkpoint 4**: US4 is independently releasable when runtime and desktop transition behavior pass and pending confirmation remains the highest-priority control state.

---

## Phase 5: Final Verification and Handoff

**Purpose**: Run required quality gates and record implementation evidence without claiming release confidence beyond verified results.

- [X] T018 [AGENT] Run final gates and update `.specify/features/009-specify-discussions-workflows/implementation-matrix.md` with evidence paths, pass/fail/skip counts, and remaining risk
  - Contract: `agent=quality-reviewer`; `depends_on=[T006,T010,T014,T017]`; `parallel_safe=false`; `packet=task-packets/T018.json`
  - Context navigation: `AGENTS.md` Feature Quality Contract; `implementation-matrix.md`; `quickstart.md`; changed file list.
  - Scope: `write_scope=[.specify/features/009-specify-discussions-workflows/implementation-matrix.md]`; `read_scope=[git diff, test output, artifacts/quality-runs latest report, artifacts/coverage latest report]`; `forbidden=[Common Forbidden Scope, source files, test files, generated artifacts edits]`
  - Expected outputs: final evidence section with changed files, same-area tests added, coverage report path, quality report path, E2E/live evidence or explicit blocker, and remaining risk.
  - Anti-goals: do not patch implementation during closeout; do not lower coverage thresholds; do not claim release readiness without live provider evidence when required.
  - Acceptance criteria: `bun run check:server`, `bun run check:desktop`, and `bun run verify` have recorded results, or exact blockers are named.
  - Verify commands: `bun run check:server`; `bun run check:desktop`; `bun run verify`
  - Handoff format: include final report paths and pass/fail/skip counts; `retry_max=1`; `escalation=build-fixer` for quality failures, `sp-debug` for persistent root-cause failures.

## Dependencies

- T001 blocks all implementation tasks.
- T002 and T003 may run in parallel after T001 because their write sets do not overlap.
- T004 depends on T002. T005 depends on T003 and T004. T006 joins T004 and T005.
- T007 and T009 may run in parallel after T006 because they write separate server and desktop tests.
- T008 depends on T007. T010 depends on T008 and T009.
- T011 depends on T010 to keep export/import diagnostics aligned with finalized skill identity fields.
- T012 depends on T011. T013 depends on T010 and may start after T011 is stable if server response shape is known; T014 depends on T012 and T013.
- T015 depends on T010 because completion evidence includes recommended skill state. T016 depends on T015. T017 depends on T016.
- T018 depends on all story joins: T006, T010, T014, and T017.

## Parallel Execution Plan

- **Batch A**: T002 and T003 after T001. Join at T004/T005.
- **Batch B**: T007 and T009 after T006. Join at T010.
- No other tasks are marked `[P]` because they touch shared workflow API/runtime/test surfaces or locale files.

## Implementation-Readiness Task Self-Audit

- Buildable `FR-*`: Covered by T002 through T018. No FR is intentionally deferred.
- Locked planning decisions: MP-001 through MP-013 are preserved in guardrails and task packet fields.
- Task guardrails: G-CONTRACT, G-STATE, G-STRENGTH, G-SKILL, G-SHARE, G-UI, G-COMPAT, G-SCOPE, G-EVIDENCE, and G-TEST are mapped to concrete tasks.
- DP readiness: DP1 has write/read/forbidden scope per task, DP2 has expected outputs and verify commands, DP3 has acceptance and failure handling.
- Reference fidelity: Existing validation, editor, SkillTool, import/export, pending confirmation, and report behaviors map to tasks and checkpoints.
- Unmapped tasks: T001 and T018 are setup/closeout control tasks; all others map to user stories or cross-cutting obligations.
- Write-set conflicts: Parallel batches have non-overlapping write sets; locale and shared workflow test files are serialized.
