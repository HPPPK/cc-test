# Tasks: Workflow Phase Skills

**Input**: Design documents from `.specify/features/007-workflow-phase-skills/`
**Prerequisites**: `plan.md`, `spec.md`, `alignment.md`, `context.md`, `research.md`, `data-model.md`, `contracts/workflow-phase-skills-api.md`, `quickstart.md`, `plan-contract.json`
**Tests**: Required by project contract because this feature changes server workflow behavior, desktop UI, import/export contracts, persistence/session state, and SkillTool-adjacent safety semantics.
**Organization**: Tasks are grouped by guardrails, foundation, user stories, and final validation. Every task has a matching execution packet under `task-packets/`.

## Planning Inputs

- **Locked planning decisions**: Approach A recommended bindings; bind to skills not plugins; no auto-execution; no default completion gates; missing recommended skills warn and preserve references; export dependency manifests without skill package contents; phase bindings do not duplicate skill-owned metadata; authoring is phase-local.
- **Implementation constitution**: Extend existing workflow template/API/runtime/report/UI surfaces; keep `SkillTool` as invocation and permission boundary; preserve unknown fields and old exports; keep desktop as a consumer of server diagnostics.
- **Scenario profile inputs**: `Standard Delivery`; no reference-fidelity profile. Required evidence is same-area tests, focused gates, coverage gate, and `bun run verify`.
- **Alignment risks**: Server Settings API, desktop source types, and runtime skill loader have different source universes. Tasks must resolve or explicitly diagnose source gaps. Existing `skillProvenance` must not be confused with new evidence semantics.
- **Validation references**: `quickstart.md` scenarios 1-5, `plan.md#Recovery And Validation Contract`, and `contracts/workflow-phase-skills-api.md`.
- **Must-preserve obligations**: `MP-001` through `MP-015` are in scope, `MP-016` remains deferred, and `MP-017` is resolved through schema/resolver/evidence task slices below.

## Implementation Target Boundary

- **Target root**: `F:\github\cc-jiangxia`
- **Target-relative paths**: server workflow services/API under `src/server/`, skill runtime under `src/skills/` and `src/tools/SkillTool/`, desktop workflow/API/types/store under `desktop/src/`, docs under `docs/skills/` and `docs/en/skills/`.
- **Evidence status**: Project cognition is stale/blocked and advisory only. Task generation used plan artifacts plus live repository evidence from the query-returned minimal paths.
- **Boundary constraints**: Do not change source during task generation. During implementation, keep all skill invocation/capability effects behind `SkillTool`; do not modify protected user-owned persistence paths.
- **MP obligations**: All implementation tasks carry `MP-001` through `MP-015`; `MP-016` remains a deferred anti-goal; `MP-017` maps to T003, T004, T011, T016, and T017.
- **Reference-only paths**: `.specify/features/007-workflow-phase-skills/*` are authoritative planning inputs and must not be rewritten by implementation tasks except through an explicit upstream workflow.

## Task-Generation Evidence Index

- `task-generation/evidence-index.json`: records adaptive task-generation decision and confirms no delegated lanes.
- `task-generation/checkpoints.ndjson`: records pre-synthesis and pre-parallel-batch checkpoints.
- `task-generation/handoffs/`: no delegated task-generation lane handoffs were used.
- `delegated_task_generation_lanes`: none.

## Reference Fidelity Mapping

No `Reference-Implementation` profile applies. Reference fidelity mapping is not required for this Standard Delivery package.

## Consequence Obligation Mapping

| Obligation ID | Task IDs | Affected State / Dependency | Required References | Validation | Stop And Reopen |
| --- | --- | --- | --- | --- | --- |
| CA-001 | T002, T003, T004, T010, T011 | Skill binding identity and dependency manifest | `data-model.md#Entity: WorkflowPhaseSkillReference`, `contracts/workflow-phase-skills-api.md#Export Contract` | `bun test src/server/services/workflowPhaseSkillResolver.test.ts src/server/__tests__/workflowTemplates.test.ts` | Reopen if stable identity requires plugin-primary binding. |
| CA-002 | T015, T016 | Runtime prompt priority and non-mandatory semantics | `plan.md#Operational Consequence Design`, `src/server/services/workflowRuntimeService.ts` | `bun test src/server/services/workflowRuntimeService.test.ts` | Reopen if prompt semantics imply mandatory invocation. |
| CA-003 | T002, T003, T004, T010, T011, T012, T013 | Missing/disabled/invalid/unavailable status vocabulary | `contracts/workflow-phase-skills-api.md#WorkflowPhaseSkillResolution` | resolver, import/export, and desktop dialog tests | Reopen if statuses drift by surface. |
| CA-004 | T001, T015, T016, T022 | Skill-derived capability effects and permissions | `src/tools/SkillTool/SkillTool.ts`, `src/server/services/workflowToolPolicy.ts` | `bun test src/server/services/workflowToolPolicy.test.ts src/server/services/workflowRuntimeService.test.ts` | Reopen if workflow applies tools/model/effort outside SkillTool. |
| CA-005 | T015, T016, T017, T020 | Session lifecycle snapshots | `data-model.md#Entity: WorkflowPhaseSkillSnapshot`, `src/server/api/sessions.ts` | runtime/session/summary tests | Reopen if running/resumed sessions recompute semantics silently. |
| CA-006 | T015, T017, T018, T019, T020 | Bounded used/skipped/unavailable evidence | `data-model.md#Entity: WorkflowPhaseSkillEvidence` | final report/status panel tests | Reopen if every unused recommendation is reported. |
| CA-007 | T002, T004, T010, T011 | Validation, authoring, import/export | `src/server/services/workflowTemplateValidation.ts` | template validation/import tests | Reopen if missing recommended skills block import by default. |
| CA-008 | T006, T007, T008, T012, T013, T018, T019 | Desktop editor, import/export, status UI | workflow component tests | desktop workflow tests | Reopen if UI uses a separate skill inventory. |
| CA-009 | T015, T017, T020 | Compaction/resume evidence preservation | `src/services/compact/workflowSummaryCarryover.ts` | compact carryover tests | Reopen if resume/final report drops needed evidence. |
| CA-010 | T001, T015, T016, T022 | Recursive/nested skill behavior | `src/tools/SkillTool/SkillTool.ts` | negative runtime/policy tests | Reopen if automatic nested orchestration enters scope. |

## Analyze Remediation Mapping

| Finding ID | Disposition | Task/Section Evidence | Notes |
|------------|-------------|-----------------------|-------|
| No prior analyze blockers | not_applicable | First task-generation pass | No remediation mapping required |

## Task Guardrail Index

- `G-SKILLTOOL-BOUNDARY`: T001, T015, T016, T022. Skill invocation and capability effects remain behind `SkillTool`; no auto-exec.
- `G-COMPAT`: T002, T003, T004, T010, T011. Preserve old `skills` entries, unknown fields, and old exports.
- `G-SHARED-RESOLVER`: T002, T003, T004, T006, T007, T010, T011, T012, T013. One server resolver vocabulary feeds all surfaces.
- `G-BOUNDED-EVIDENCE`: T015, T017, T018, T019, T020. Evidence only for used/relevant-skipped/relevant-unavailable skills.
- `G-DESKTOP-STATE-PRIORITY`: T018, T019. Pending confirmation remains higher priority than stale running status.
- `G-NO-BUNDLE`: T010, T011, T013, T021. Dependency manifests only; no default skill file bundle.
- `G-TEST-FIRST`: T002, T006, T010, T012, T015, T018. Add failing tests before implementation.

## Phase 0: Implementation Guardrails

**Purpose**: Freeze architecture constraints, safety boundaries, and verification expectations before source edits.

- [X] T001 Confirm workflow phase skill implementation guardrails against `.specify/features/007-workflow-phase-skills/plan.md` and `src/tools/SkillTool/SkillTool.ts`

### T001 Contract

| Field | Value |
| --- | --- |
| agent | quality-reviewer |
| depends_on | none |
| parallel_safe | false |
| packet | `task-packets/T001.json` |
| write_scope | none; records validation in task handoff only |
| read_scope | `plan.md`, `spec.md`, `contracts/workflow-phase-skills-api.md`, `src/tools/SkillTool/SkillTool.ts`, `src/server/services/workflowToolPolicy.ts` |
| forbidden | source edits, test edits, `.env`, credentials, protected user state |
| verify_commands | `git diff --check -- .specify/features/007-workflow-phase-skills/plan.md` |

**Checkpoint 0**: Guardrails acknowledged before RED test work begins.

## Phase 1: Foundational Resolver, Types, And Validation

**Purpose**: Establish shared server schema/resolver and compatibility behavior that blocks all stories.

- [X] T002 [P] Add RED server tests for workflow phase skill reference, resolver status, legacy `skills` compatibility, and validation behavior in `src/server/services/workflowPhaseSkillResolver.test.ts`, `src/server/services/workflowTypes.test.ts`, `src/server/services/workflowTemplateRegistryService.test.ts`, and `src/server/__tests__/workflowTemplates.test.ts`
- [X] T003 Implement `WorkflowPhaseSkillReference`, `WorkflowPhaseSkillResolution`, and shared resolver in `src/server/services/workflowTypes.ts` and `src/server/services/workflowPhaseSkillResolver.ts`
- [X] T004 Integrate resolver-backed validation, unknown-field preservation, catalog status, and foundation import-preview diagnostics in `src/server/services/workflowTemplateValidation.ts`, `src/server/services/workflowTemplateRegistryService.ts`, `src/server/api/skills.ts`, and `src/server/api/workflowTemplates.ts`
- [X] T005 Run foundation checkpoint tests for resolver, validation, registry, and SkillTool policy using `bun test src/server/services/workflowPhaseSkillResolver.test.ts src/server/services/workflowTypes.test.ts src/server/services/workflowTemplateRegistryService.test.ts src/server/__tests__/workflowTemplates.test.ts src/server/services/workflowToolPolicy.test.ts`

**Join Point 1**: Foundation ready when T005 passes and no implementation task has introduced auto-exec, plugin-primary binding, default bundling, or missing-skill import blockers.

## Phase 2: User Story 1 - Author Adds Recommended Phase Skills (Priority: P1)

**Goal**: A workflow author selects existing skills per phase from the shared catalog, and the template persists references without duplicated skill-owned metadata.

**Independent Test**: Desktop workflow component tests prove selector save/round-trip behavior and server validation tests prove old `skills` entries still work.

- [X] T006 [P] [US1] Add RED desktop authoring tests for phase-local recommended skill selection and legacy `reason` round-trip in `desktop/src/components/workflow/WorkflowComponents.test.tsx` and `desktop/src/__tests__/skillsSettings.test.tsx`
- [X] T007 [P] [US1] Add desktop workflow skill reference and catalog API support in `desktop/src/types/session.ts`, `desktop/src/types/skill.ts`, `desktop/src/api/skills.ts`, and `desktop/src/stores/skillStore.ts`
- [X] T008 [US1] Implement the phase-local recommended skill selector in `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- [X] T009 [US1] Run the authoring checkpoint with `cd desktop && bun run test -- --run src/components/workflow/WorkflowComponents.test.tsx src/__tests__/skillsSettings.test.tsx`

**Checkpoint US1**: Authoring works independently when selected phase skills persist as references, old `reason` data is preserved, and no copied skill instructions become authoritative.

## Phase 3: User Story 2 - Share And Import A Workflow (Priority: P2)

**Goal**: Workflow exports include dependency manifests, and imports show diagnostics while allowing missing recommended skills.

**Independent Test**: Server import/export tests prove manifest generation and warning behavior; desktop dialog tests prove diagnostics are visible before import/export commit.

- [X] T010 [P] [US2] Add RED server import/export dependency-manifest tests in `src/server/__tests__/workflowTemplates.test.ts`
- [X] T011 [P] [US2] Implement workflow dependency manifest export and import-preview diagnostics in `src/server/api/workflowTemplates.ts`
- [X] T012 [US2] Add RED desktop import/export diagnostics tests in `desktop/src/api/sessions.test.ts` and `desktop/src/components/workflow/WorkflowComponents.test.tsx`
- [X] T013 [US2] Implement dependency diagnostics UI/API support in `desktop/src/api/sessions.ts`, `desktop/src/types/session.ts`, and `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- [X] T014 [US2] Run the sharing checkpoint with `bun test src/server/__tests__/workflowTemplates.test.ts` and `cd desktop && bun run test -- --run src/api/sessions.test.ts src/components/workflow/WorkflowComponents.test.tsx`

**Checkpoint US2**: Sharing works independently when exports include manifests, import preview warns for missing recommended skills, and unresolved references survive import.

## Phase 4: User Story 3 - Agent Runs An Active Phase (Priority: P3)

**Goal**: Runtime resolves active phase skills, emphasizes them in the prompt without auto-invocation, and persists bounded evidence/status through report and resume paths.

**Independent Test**: Runtime tests prove prompt/snapshot semantics; report/summary/compact tests prove bounded evidence survival; desktop status tests prove concise UI.

- [X] T015 [P] [US3] Add RED runtime, session, report, summary, compact, and SkillTool-policy tests in `src/server/services/workflowRuntimeService.test.ts`, `src/server/services/workflowFinalReport.test.ts`, `src/server/services/workflowSummary.test.ts`, `src/server/__tests__/sessions.test.ts`, `src/services/compact/workflowSummaryCarryover.test.ts`, and `src/server/services/workflowToolPolicy.test.ts`
- [X] T016 [P] [US3] Implement phase skill resolution snapshot, active-phase recommended skills prompt block, and advisory policy guidance in `src/server/services/workflowSessionCreateService.ts`, `src/server/services/workflowRuntimeService.ts`, and `src/server/services/workflowToolPolicy.ts`
- [X] T017 [US3] Implement bounded skill evidence, final report, workflow summary, session API, and compact/resume carryover in `src/server/services/workflowFinalReport.ts`, `src/server/services/workflowSummary.ts`, `src/server/api/sessions.ts`, and `src/services/compact/workflowSummaryCarryover.ts`
- [X] T018 [US3] Add RED desktop runtime status/evidence tests in `desktop/src/components/workflow/WorkflowComponents.test.tsx`, `desktop/src/pages/ActiveSession.test.tsx`, and `desktop/src/stores/sessionStore.test.ts`
- [X] T019 [US3] Implement concise recommended skill status/evidence UI in `desktop/src/components/workflow/WorkflowStatusPanel.tsx`, `desktop/src/pages/ActiveSession.tsx`, `desktop/src/stores/sessionStore.ts`, and `desktop/src/types/session.ts`
- [X] T020 [US3] Run the runtime checkpoint with `bun test src/server/services/workflowRuntimeService.test.ts src/server/services/workflowFinalReport.test.ts src/server/services/workflowSummary.test.ts src/server/__tests__/sessions.test.ts src/services/compact/workflowSummaryCarryover.test.ts src/server/services/workflowToolPolicy.test.ts` and `cd desktop && bun run test -- --run src/components/workflow/WorkflowComponents.test.tsx src/pages/ActiveSession.test.tsx src/stores/sessionStore.test.ts`

**Checkpoint US3**: Runtime works independently when prompt emphasis is present, unavailable skills are marked, no auto-invocation occurs, and bounded evidence appears in report/status/resume paths.

## Phase 5: Polish, Docs, And Gates

**Purpose**: Sync documentation and run project quality gates before implementation handoff can claim readiness.

- [X] T021 Update skill/workflow documentation for recommended phase skills, dependency manifests, and non-bundling semantics in `docs/skills/01-usage-guide.md`, `docs/skills/02-implementation.md`, `docs/en/skills/01-usage-guide.md`, and `docs/en/skills/02-implementation.md`
- [X] T022 Run and fix server-side quality gate failures for the changed server/runtime surfaces with `bun run check:server`
- [X] T023 Run and fix desktop-side quality gate failures for the changed desktop workflow surfaces with `bun run check:desktop`
- [ ] T024 Run final coverage, PR verification, and provider-baseline availability checks with `bun run check:coverage`, `bun run verify`, `bun run quality:providers`, and live baseline only when a provider selector is available

**Final Checkpoint**: Feature is implementation-ready only when focused tests, server/desktop gates, coverage, and `bun run verify` pass. If no live provider is configured, record the live-baseline blocker explicitly.

## Task Contract Matrix

| Task | Agent | Depends On | Parallel Safe | Packet | Primary Write Scope | Verify Commands |
| --- | --- | --- | --- | --- | --- | --- |
| T001 | quality-reviewer | none | false | `task-packets/T001.json` | none | `git diff --check -- .specify/features/007-workflow-phase-skills/plan.md` |
| T002 | test-engineer | T001 | true | `task-packets/T002.json` | `workflowPhaseSkillResolver.test.ts`, workflow type/registry/template tests | focused server RED tests |
| T003 | executor | T002 | false | `task-packets/T003.json` | `workflowTypes.ts`, `workflowPhaseSkillResolver.ts` | resolver/type tests |
| T004 | api-reviewer | T003 | false | `task-packets/T004.json` | validation, registry, skills API, import preview diagnostics | foundation tests |
| T005 | quality-reviewer | T004 | false | `task-packets/T005.json` | none unless fixing foundation task defects | foundation checkpoint command |
| T006 | test-engineer | T005 | true | `task-packets/T006.json` | desktop workflow and skills settings tests | desktop RED authoring tests |
| T007 | executor | T005, T006 | true | `task-packets/T007.json` | desktop workflow skill types/API/store | desktop authoring tests |
| T008 | executor | T007 | false | `task-packets/T008.json` | `WorkflowTemplateEditor.tsx` | desktop authoring tests |
| T009 | quality-reviewer | T008 | false | `task-packets/T009.json` | none unless fixing US1 defects | US1 checkpoint command |
| T010 | test-engineer | T005 | true | `task-packets/T010.json` | `workflowTemplates.test.ts` | server import/export RED tests |
| T011 | api-reviewer | T010, T004 | true | `task-packets/T011.json` | `workflowTemplates.ts` | server import/export tests |
| T012 | test-engineer | T011 | false | `task-packets/T012.json` | desktop API/dialog tests | desktop import/export RED tests |
| T013 | executor | T012 | false | `task-packets/T013.json` | desktop sessions API/types/dialog | desktop import/export tests |
| T014 | quality-reviewer | T013 | false | `task-packets/T014.json` | none unless fixing US2 defects | US2 checkpoint command |
| T015 | test-engineer | T005 | true | `task-packets/T015.json` | runtime/session/report/compact/policy tests | server runtime RED tests |
| T016 | executor | T015, T003 | true | `task-packets/T016.json` | session create/runtime service and workflow tool policy guidance | runtime prompt tests |
| T017 | executor | T016 | false | `task-packets/T017.json` | final report/summary/sessions/compact | server runtime/report tests |
| T018 | test-engineer | T017, T012 | false | `task-packets/T018.json` | desktop status tests | desktop status RED tests |
| T019 | executor | T018 | false | `task-packets/T019.json` | status panel/active session/store/types | desktop status tests |
| T020 | quality-reviewer | T019 | false | `task-packets/T020.json` | none unless fixing US3 defects | US3 checkpoint command |
| T021 | executor | T014, T020 | false | `task-packets/T021.json` | docs skill guides | `bun run check:docs` when package-lock state allows |
| T022 | build-fixer | T005, T014, T020 | false | `task-packets/T022.json` | changed server files/tests if fixing gate failures | `bun run check:server` |
| T023 | build-fixer | T009, T014, T020 | false | `task-packets/T023.json` | changed desktop files/tests if fixing gate failures | `bun run check:desktop` |
| T024 | quality-reviewer | T021, T022, T023 | false | `task-packets/T024.json` | none unless fixing verification failures | `bun run check:coverage`; `bun run verify`; provider baseline if available |

For every task packet:

- `forbidden`: `.env`, `.env.*`, credentials, OAuth files, `.git/`, `node_modules/`, `desktop/node_modules/`, protected `~/.claude/**` state, generated `artifacts/quality-runs/`, generated `artifacts/coverage/`, and source surfaces outside the task write scope.
- `handoff_format`: status, changed_files, validation_output, concerns, recovery_hints.
- `retry_max`: 2.
- `escalation`: debugger unless packet specifies a stricter role.

## Dependencies & Execution Order

### Phase Dependencies

- Phase 0 guardrails: no dependencies.
- Phase 1 foundation: depends on guardrails and blocks all stories.
- US1 authoring: depends on foundation.
- US2 sharing/import-export: depends on foundation; server tasks can run in parallel with US1 and US3 until desktop test file conflicts arise.
- US3 runtime/status: depends on foundation; desktop status tasks wait until shared desktop workflow tests used by US2 are stable.
- Polish/gates: depends on all desired stories.

### Parallel Batches And Join Points

- **Batch A after T001**: T002 only. Join at T003 because resolver implementation depends on RED tests.
- **Batch B after T005**: T006, T010, T015 can run in parallel with isolated write sets. Join before T007/T011/T016.
- **Batch C after RED tests**: T007, T011, T016 can run in parallel. Join before shared desktop workflow test edits T012/T018 and before summary/report work T017.
- **Batch D**: T008 and T017 may run in parallel after their dependencies. Join before T018/T020.
- **Final serial gates**: T021, T022, T023, T024 are serial to keep docs install/build and quality artifacts from conflicting with source-fix loops.

Join Point Validation:

- T005: foundation server tests pass.
- T009: US1 desktop authoring tests pass.
- T014: US2 server and desktop import/export tests pass.
- T020: US3 runtime and desktop status tests pass.
- T024: coverage and PR verification pass; live baseline either runs or blocker is recorded.

## Parallel Example

```powershell
# After T005, run isolated RED tests in parallel-capable lanes:
# T006 desktop authoring tests
# T010 server import/export tests
# T015 server runtime/report/session tests

# Join before implementing because each implementation task depends on its RED tests.

# After T006/T010/T015 fail for expected missing behavior, run isolated implementation lanes:
# T007 desktop type/API/store support
# T011 server import/export manifest support
# T016 runtime prompt snapshot support
```

## Implementation Dispatch

### Feature Delivery Shape

Serial foundation with intra-phase parallel batches. After the shared resolver foundation is ready, server import/export and runtime work can proceed in parallel with desktop authoring work, but shared desktop test files force explicit join points before later UI slices.

### Current Ready Batch Dispatch

- `execution_model`: adaptive
- `execution_mode`: standard
- `workflow_status`: ready
- `dispatch_shape`: leader-inline
- `execution_surface`: leader-inline
- `capability_degraded`: true
- `blocked_reason`: null
- `reason`: native subagent tools are visible, but current runtime policy allows spawning only when the user explicitly asks for subagents/delegation. `$sp-tasks` is not treated as delegation authorization.

### Confirmed Delivery Boundary

1. Complete guardrails and foundation.
2. Complete US1 authoring, US2 sharing/import-export, and US3 runtime/status/evidence.
3. Update docs for changed behavior.
4. Run focused story checks, `bun run check:server`, `bun run check:desktop`, `bun run check:coverage`, and `bun run verify`.
5. Run live baseline only when provider credentials/selectors are available; otherwise record blocker explicitly.

## Capability Operation Coverage

- Author/select phase skills: T006, T007, T008, T009.
- Save compatible template references: T002, T003, T004, T008.
- Export dependency manifest: T010, T011, T014.
- Import with diagnostics/warnings: T010, T011, T012, T013, T014.
- Runtime prompt emphasis: T015, T016, T020.
- Bounded evidence/final report/status/resume: T015, T017, T018, T019, T020.
- Safety/non-execution/non-bundling: T001, T011, T016, T021, T022, T024.
- Deferred required/contract skills and bundle mode: no implementation task; preserved as anti-goals in packets.

## Implementation-Readiness Task Self-Audit

- Buildable `FR-*` and success criteria coverage: mapped to T002-T024.
- Locked decision preservation: mapped in Task Guardrail Index and packet anti-goals.
- Guardrail mapping: complete for all implementation tasks.
- DP1 packet readiness: each task has objective, write/read/forbidden scope, context pointers, acceptance criteria, and verification command.
- DP2 packet readiness: dependency ordering and parallel safety are recorded in task matrix, packets, and `task-index.json`.
- DP3 packet readiness: handoff format, retry, escalation, and recovery hints are included in every packet.
- Reference fidelity mapping: not applicable under Standard Delivery.
- Unmapped tasks: none; T001/T005/T009/T014/T020/T022/T023/T024 are guardrail/checkpoint/verification tasks.
- Write-set conflicts: no parallel batch contains overlapping write scopes; shared desktop test file edits are serialized.

## Recommended Next Command

- `/sp.implement`
