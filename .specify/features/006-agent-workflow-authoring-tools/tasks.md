# Tasks: Agent Workflow Authoring Tools

**Input**: `.specify/features/006-agent-workflow-authoring-tools/plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and `plan-contract.json`  
**Feature Directory**: `.specify/features/006-agent-workflow-authoring-tools/`  
**Execution Mode**: adaptive / standard  
**Task Generation Dispatch**: `parallel-subagents` on native subagents  
**Implementation Target**: `F:\github\cc-jiangxia`  
**Phase Mode**: task-generation-only; no source or test implementation is performed by this workflow.

## Task-Generation Evidence Index

- Accepted lane handoffs:
  - `.specify/features/006-agent-workflow-authoring-tools/task-generation/handoffs/story-phase-decomposition.json`
  - `.specify/features/006-agent-workflow-authoring-tools/task-generation/handoffs/dependency-graph-analysis.json`
  - `.specify/features/006-agent-workflow-authoring-tools/task-generation/handoffs/write-set-parallel-safety.json`
- Checkpoints: `.specify/features/006-agent-workflow-authoring-tools/task-generation/checkpoints.ndjson`
- Evidence index: `.specify/features/006-agent-workflow-authoring-tools/task-generation/evidence-index.json`
- Per-task execution packets: `.specify/features/006-agent-workflow-authoring-tools/task-packets/*.json`

The story lane shaped user-story phases and capability coverage. The dependency lane shaped task order, join points, and verification gates. The write-set lane shaped packet scopes, shared-surface ownership, forbidden paths, and desktop optionality.

## Planning Inputs

- Locked decisions preserved: direct validated create/update writes, one global operation-discriminated `workflow_template_authoring` tool, shared validation, builtin copy-then-edit, stale update/delete via `basisHash`, destructive user-only delete, local desktop/server authoring endpoint when `CC_JIANGXIA_DESKTOP_SERVER_URL` is set, no active-session snapshot mutation, and no mandatory preview-only flow.
- Implementation constitution preserved: `WorkflowTemplateRegistryService` remains the storage writer, validation cannot drift between registry/API/tool, phase-policy gating is operation-level, desktop server failure is visible and no-write, and protected non-workflow state is out of scope.
- Active scenario profile: `Standard Delivery`.
- Project cognition: fresh/query-ready. Selected concepts were workflow, template, authoring, tool, shared, validation, registry, service, api, and desktop. Minimal live reads were consumed before decomposition; code and tests remain the implementation authority.
- Desktop scope: desktop frontend changes are optional. Do not touch `desktop/src/**` unless implementation proves a concrete desktop client/type behavior change is required; if touched, add same-area tests and run `bun run check:desktop`.

## Task Guardrail Index

| Guardrail | Applies To | Rule |
| --- | --- | --- |
| G-REGISTRY-WRITER-ONLY | T002, T005, T007, T010, T012, T014, T015 | All persisted workflow template mutations must write through `WorkflowTemplateRegistryService.writeTemplates`; no separate file writer, localStorage key, or tool-private store. |
| G-SHARED-VALIDATION | T002, T003, T005, T006, T007, T009, T011, T013 | Registry, manual API, authoring service, and tool must share validation helpers/constants instead of copy-pasted validators. |
| G-NO-WRITE-FAILURES | T001, T005-T015 | Invalid, malformed, stale, denied, ambiguous, missing-target, builtin-protected, and desktop-server-failure paths return diagnostics with `persisted:false` and leave config unchanged. |
| G-BUILTIN-READONLY | T002, T011, T012, T013, T014 | Builtins are never edited, deleted, or shadowed; modification intent uses duplicate-to-user first. |
| G-STALE-BASIS | T005, T009, T010, T013, T014 | Update/delete require `selector.source:user` plus current `basisHash`; mismatch returns `WORKFLOW_TEMPLATE_STALE_BASIS` and `nextAction: inspect-and-retry`. |
| G-DESKTOP-SERVER-NO-FALLBACK | T007, T008, T015 | When `CC_JIANGXIA_DESKTOP_SERVER_URL` is configured, the tool uses the local authoring endpoint and does not silently direct-write on endpoint failure. |
| G-PHASE-POLICY-OPERATIONAL | T004, T008, T010, T012, T014 | Read-only operations remain available; mutating operations obey active workflow phase policy. |
| G-SESSION-SNAPSHOT-SAFETY | T005, T015 | Authoring operations do not call `WorkflowRuntimeService` or mutate active, resumed, historical, pending, or completed workflow sessions. |
| G-NO-CAPABILITY-REMOVAL | T003-T015 | Do not remove or defer guide, list, inspect, validate, create, update, duplicate, or delete. |

## Implementation Target Boundary

- Target root: `F:\github\cc-jiangxia`
- Primary source paths: `src/tools.ts`, `src/Tool.ts`, `src/tools/WorkflowTemplateAuthoringTool/`, `src/server/services/workflowTemplateAuthoringService.ts`, `src/server/services/workflowTemplateValidation.ts`, `src/server/services/workflowTemplateAuthoringGuide.ts`, `src/server/services/workflowTemplateRegistryService.ts`, `src/server/services/workflowToolPolicy.ts`, `src/server/api/workflowTemplates.ts`
- Primary tests: `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`, `src/server/services/workflowTemplateAuthoringService.test.ts`, `src/server/services/workflowTemplateAuthoringGuide.test.ts`, `src/server/services/workflowTemplateRegistryService.test.ts`, `src/server/services/workflowToolPolicy.test.ts`, `src/server/__tests__/workflowTemplates.test.ts`
- Reference-only paths: `.specify/discussions/workflow-template-management/`
- Forbidden protected state: `.env`, credentials, `~/.claude/settings.json`, `~/.claude/projects/**/*.jsonl`, providers, MCP config, OAuth files, skills, plugins, adapters, teams, session records, and desktop localStorage.

## Phase 1: Setup And Test Fixtures

**Purpose**: Establish reusable test fixtures and no-write assertions before production refactors.

- [X] T001 Create shared workflow authoring fixtures and no-write helpers in `src/server/services/workflowTemplateAuthoringService.test.ts`

## Phase 2: Foundational Blocking Work

**Purpose**: Build the shared validation, guide, policy, and service foundation that all user stories require.

- [X] T002 Extract shared workflow template validation and wire registry/API consumers in `src/server/services/workflowTemplateValidation.ts`
- [X] T003 [P] Create deterministic authoring guide and guide drift tests in `src/server/services/workflowTemplateAuthoringGuide.ts`
- [X] T004 [P] Add operation-level workflow authoring phase-policy helper and tests in `src/server/services/workflowToolPolicy.ts`
- [X] T005 Add authoring service result envelope, read-only operations, `basisHash` helpers, and tests in `src/server/services/workflowTemplateAuthoringService.ts`

**Checkpoint JP1**: Foundation ready.  
Validation command: `bun test src/server/services/workflowTemplateRegistryService.test.ts src/server/__tests__/workflowTemplates.test.ts src/server/services/workflowTemplateAuthoringGuide.test.ts src/server/services/workflowToolPolicy.test.ts src/server/services/workflowTemplateAuthoringService.test.ts`  
Pass condition: shared validation parity, guide drift coverage, read-only policy access, and read-only authoring result shape all pass.

## Phase 3: User Story 1 - Create From Conversation (P1)

**Goal**: The agent can use guide/list/validate/create to persist a valid user workflow template from rough conversational phase intent.  
**Independent Test**: In an isolated `CLAUDE_CONFIG_DIR`, validate and create a three-phase user template, verify `persisted:true`, verify invalid/conflicting create is no-write, and verify `/api/workflows/templates` lists the template after refetch.

- [X] T006 [US1] Add failing guide/list/validate/create service, API, and tool tests in `src/server/services/workflowTemplateAuthoringService.test.ts`
- [X] T007 [US1] Implement create operation and local authoring API route in `src/server/api/workflowTemplates.ts`
- [X] T008 [US1] Implement global `workflow_template_authoring` tool schema, routing, rendering, and registration in `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx`

**Checkpoint JP2**: Create story independently usable.  
Validation command: `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/server/__tests__/workflowTemplates.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`  
Pass condition: guide/list/validate/create work through service/API/tool, invalid candidates do not write, and tool appears globally with correct read-only and mutating metadata.

## Phase 4: User Story 2 - Optimize Existing User Workflow (P2)

**Goal**: The agent can inspect a user workflow, capture `basisHash`, update it only when fresh, preserve unknown fields, and reject stale writes.  
**Independent Test**: Inspect a user template, update with a matching hash, verify success and unknown-field preservation, then simulate manual edit and verify old hash rejects with `WORKFLOW_TEMPLATE_STALE_BASIS` and unchanged config.

- [X] T009 [US2] Add inspect/update `basisHash`, stale rejection, and unknown-field preservation tests in `src/server/services/workflowTemplateAuthoringService.test.ts`
- [X] T010 [US2] Implement inspect/update stale-write behavior through service, API, and tool in `src/server/services/workflowTemplateAuthoringService.ts`

**Checkpoint JP3**: Update story independently usable.  
Validation command: `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/server/services/workflowTemplateRegistryService.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`  
Pass condition: fresh update succeeds, stale update rejects without writing, builtin update rejects with copy guidance, and read-only operations remain available under phase policy.

## Phase 5: User Story 3 - Modify Builtin Workflow Safely (P3)

**Goal**: Builtin edit intent creates a non-conflicting user-owned copy first, then future edits target the copy.  
**Independent Test**: Duplicate builtin `agent-development`, verify default id/name and suffix behavior, verify builtin remains unchanged, and verify direct builtin update/delete remains rejected.

- [X] T011 [US3] Add duplicate builtin copy-then-edit, naming, conflict, and immutability tests in `src/server/services/workflowTemplateAuthoringService.test.ts`
- [X] T012 [US3] Implement duplicate/copy behavior through service, API, and tool in `src/server/services/workflowTemplateAuthoringService.ts`

**Checkpoint JP4**: Builtin copy story independently usable.  
Validation command: `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/server/__tests__/workflowTemplates.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`  
Pass condition: copy creates user templates using `<builtin-id>-custom`, then `-2`, `-3`; builtin is unchanged; requested target conflicts reject no-write.

## Phase 6: User Story 4 - Delete User Template (P4)

**Goal**: The agent can delete only a uniquely identified user template with destructive metadata and stale/current target checks.  
**Independent Test**: Inspect a user template, delete with source/id/hash, verify refreshed list metadata and destructive tool metadata, then verify builtin/missing/ambiguous/stale delete attempts are no-write.

- [X] T013 [US4] Add destructive delete and no-write rejection tests in `src/server/services/workflowTemplateAuthoringService.test.ts`
- [X] T014 [US4] Implement delete operation and destructive tool metadata in `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx`

**Checkpoint JP5**: Delete story independently usable.  
Validation command: `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/server/__tests__/workflowTemplates.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`  
Pass condition: delete succeeds only for fresh `source:user`, `isDestructive` is true only for delete, and all rejected deletes leave config unchanged.

## Phase 7: Cross-Cutting Integration And Verification

**Purpose**: Prove desktop/server routing, no silent fallback, session snapshot safety, and final project gates.

- [X] T015 Add desktop-server routing, no-fallback, Settings refetch, and runtime snapshot safety tests in `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`
- [X] T016 Run final server and project verification, recording reports under `artifacts/quality-runs/`

**Checkpoint JP6**: Implementation ready for handoff.  
Validation command: `bun run check:server && bun run verify`  
Pass condition: final non-live gates pass, or blocker paths and failed lane logs are recorded explicitly.

## Task Contract Matrix

Common context for every task: `spec.md#requirements`, `plan.md#implementation-constitution`, `plan.md#design-overview`, `data-model.md`, `contracts/workflow-authoring-tool.md`, `contracts/workflow-authoring-api.md`, `quickstart.md`, and `plan-contract.json`.

| Task | agent | depends_on | parallel_safe | context navigation |
| --- | --- | --- | --- | --- |
| T001 | test-engineer | none | false | Common plus `src/server/__tests__/workflowTemplates.test.ts`, `src/server/services/workflowTemplateRegistryService.test.ts` |
| T002 | executor | T001 | false | Common plus `plan.md#shared-validation-and-service-plan`, `src/server/services/workflowTemplateRegistryService.ts`, `src/server/api/workflowTemplates.ts` |
| T003 | test-engineer | T002 | true | Common plus `plan.md#field-guide-design`, `data-model.md#entity-workflowtemplateauthoringguide` |
| T004 | security-reviewer | T002 | true | Common plus `plan.md#phase-policy-integration`, `src/server/services/workflowToolPolicy.ts` |
| T005 | executor | T002, T003 | false | Common plus `data-model.md#entity-workflowtemplateauthoringresult`, `data-model.md#entity-workflowtemplatebasis` |
| T006 | test-engineer | T005 | false | Common plus `quickstart.md#scenario-1-create-from-conversation`, `contracts/workflow-authoring-tool.md#create` |
| T007 | api-reviewer | T006 | false | Common plus `contracts/workflow-authoring-api.md#endpoint`, `src/server/api/workflowTemplates.ts` |
| T008 | executor | T004, T007 | false | Common plus `src/Tool.ts`, `src/tools.ts`, `src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.tsx` |
| T009 | test-engineer | T008 | false | Common plus `quickstart.md#scenario-2-update-with-fresh-basis`, `quickstart.md#scenario-3-stale-update-rejection` |
| T010 | executor | T009 | false | Common plus `plan.md#stale-write-protocol`, `data-model.md#entity-workflowtemplatebasis` |
| T011 | test-engineer | T010 | false | Common plus `quickstart.md#scenario-4-builtin-copy-then-edit`, `plan.md#builtin-copy-design` |
| T012 | executor | T011 | false | Common plus `contracts/workflow-authoring-tool.md#duplicate`, `src/server/api/workflowTemplates.ts` |
| T013 | test-engineer | T012 | false | Common plus `quickstart.md#scenario-5-delete-user-template`, `contracts/workflow-authoring-tool.md#delete` |
| T014 | security-reviewer | T013 | false | Common plus `plan.md#tool-operation-contract`, `src/Tool.ts` |
| T015 | verifier | T014 | false | Common plus `quickstart.md#scenario-6-desktop-server-path`, `src/server/services/workflowRuntimeService.ts`, `desktop/src/components/workflow/WorkflowTemplateManager.tsx` |
| T016 | quality-reviewer | T015 | false | Common plus `quickstart.md#focused-verification-commands`, repository `AGENTS.md` quality gate rules |

## Scope, Acceptance, And Handoff Matrix

| Task | write_scope | expected_outputs | capability_operations | acceptance_criteria | verify_commands |
| --- | --- | --- | --- | --- | --- |
| T001 | `src/server/services/workflowTemplateAuthoringService.test.ts`; may add shared fixture helpers in existing server test files | reusable valid template fixtures, no-write helper, isolated config helpers | validate, create, update, duplicate, delete | fixtures use isolated `CLAUDE_CONFIG_DIR`; no-write helper compares config before/after; no production code changed | `bun test src/server/services/workflowTemplateAuthoringService.test.ts` |
| T002 | `src/server/services/workflowTemplateValidation.ts`, `src/server/services/workflowTemplateRegistryService.ts`, `src/server/api/workflowTemplates.ts`, related tests | shared validator, exported constants/types, registry/API consumers wired | validate | existing API/registry tests still pass; issue codes and paths stay stable; no tool-only validator | `bun test src/server/services/workflowTemplateRegistryService.test.ts src/server/__tests__/workflowTemplates.test.ts` |
| T003 | `src/server/services/workflowTemplateAuthoringGuide.ts`, `src/server/services/workflowTemplateAuthoringGuide.test.ts` | deterministic guide object and drift tests | guide, validate | guide includes required groups, allowed values, unsupported shapes, repair hints tied to validation codes | `bun test src/server/services/workflowTemplateAuthoringGuide.test.ts` |
| T004 | `src/server/services/workflowToolPolicy.ts`, `src/server/services/workflowToolPolicy.test.ts` | operation-level mutation policy helper | guide, list, inspect, validate, create, update, duplicate, delete | read-only operations allowed; mutations denied outside allowed phases; no whole-tool over-blocking | `bun test src/server/services/workflowToolPolicy.test.ts` |
| T005 | `src/server/services/workflowTemplateAuthoringService.ts`, `src/server/services/workflowTemplateAuthoringService.test.ts` | result envelope, guide/list/inspect/validate, `sha256:` basis hash | guide, list, inspect, validate | deterministic result shape; read-only operations never write; inspect returns basis hash | `bun test src/server/services/workflowTemplateAuthoringService.test.ts` |
| T006 | service/API/tool test files | failing create-path tests for service/API/tool | guide, list, validate, create | tests prove valid create, invalid no-write, id conflict no-write, list/refetch visibility | `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/server/__tests__/workflowTemplates.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts` |
| T007 | `src/server/services/workflowTemplateAuthoringService.ts`, `src/server/api/workflowTemplates.ts`, related tests | create implementation and `POST /api/workflows/templates/authoring` route | validate, create, list | valid create writes same store; handled rejection returns `persisted:false`; malformed body is transport error | `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/server/__tests__/workflowTemplates.test.ts` |
| T008 | `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx`, `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`, `src/tools.ts`; `src/Tool.ts` only if needed | global tool with schema, metadata, direct/server routing, rendering | guide, list, validate, create | tool is globally registered; read-only metadata correct; create mutating; transcript result is auditable | `bun test src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts` |
| T009 | service/API/tool test files | failing inspect/update/stale/unknown-field tests | inspect, validate, update | fresh update succeeds; stale update no-write; unknown fields preserved; builtin update rejects | `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/server/services/workflowTemplateRegistryService.test.ts` |
| T010 | service/API/tool implementation files and tests | inspect/update implementation with stale checks | inspect, validate, update | selector/id/source checked; current registry re-read before write; stale returns `inspect-and-retry` | `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts` |
| T011 | service/API/tool test files | failing duplicate/copy tests | duplicate, inspect, validate, update | default builtin copy naming and suffixes covered; builtin unchanged; target conflicts no-write | `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/server/__tests__/workflowTemplates.test.ts` |
| T012 | service/API/tool implementation files and tests | duplicate implementation | duplicate | builtin/user source copied to user template; target validation shares validator; copy result includes basis/hash metadata | `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/server/__tests__/workflowTemplates.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts` |
| T013 | service/API/tool test files | failing delete tests | inspect, delete, list | destructive metadata tested; builtin, missing, ambiguous, stale, malformed config all no-write | `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts` |
| T014 | service/API/tool implementation files and tests | delete implementation and rendering | delete, list | fresh user delete succeeds; refreshed list returned; `isDestructive` true only for delete | `bun test src/server/services/workflowTemplateAuthoringService.test.ts src/server/__tests__/workflowTemplates.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts` |
| T015 | tool/API/service tests and implementation only as needed; desktop files read-only unless proven necessary | desktop URL routing/no-fallback tests; session snapshot safety tests | create, update, duplicate, delete | desktop URL posts to authoring endpoint; endpoint failure no-write; Settings refetch sees writes; runtime snapshots untouched | `bun test src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts src/server/__tests__/workflowTemplates.test.ts src/server/services/workflowTemplateAuthoringService.test.ts` |
| T016 | `artifacts/quality-runs/` generated reports only | final command outputs and handoff evidence | all | `bun run check:server` and `bun run verify` pass or blockers recorded with report/log paths | `bun run check:server`; `bun run verify` |

All tasks inherit these anti-goals: do not add new dependencies, do not lower coverage gates, do not mutate protected non-workflow state, do not create a separate workflow template store, do not support non-linear workflow shapes, do not direct-write builtins, and do not remove any confirmed operation. Handoff format for every task: `status`, `changed_files`, `validation_output`, `concerns`, and `recovery_hints`. Default `retry_max` is `2`; default escalation is `debugger`, except security/policy tasks escalate to `security-reviewer`.

## Consequence Obligation Mapping

| Obligation ID | Task IDs | Required validation | Stop and reopen |
| --- | --- | --- | --- |
| CA-001 | T006, T007, T009, T010 | create/update success and invalid/stale no-write tests | valid writes become preview-only or rejected operations can write |
| CA-002 | T001, T002, T005, T010 | protected-state and unknown-field preservation tests | writes leave workflow template config/service boundary |
| CA-003 | T002, T006, T007 | registry/API/tool parity tests | tool accepts templates registry/API reject |
| CA-004 | T011, T012 | builtin copy and builtin rejection tests | direct builtin mutation/delete/shadowing |
| CA-005 | T005, T015 | runtime snapshot safety tests/review | active or historical sessions are migrated/mutated |
| CA-006 | T005, T008, T014 | result shape and rendering tests | tool results become opaque or non-auditable |
| CA-007 | T005, T009, T010, T013, T014 | stale update/delete tests | update/delete can proceed without fresh basis |
| CA-008 | T004, T008, T010, T014 | policy tests and tool validation tests | global tool bypasses active phase policy |
| CA-009 | T013, T014 | destructive metadata and target rejection tests | builtin or ambiguous delete is allowed |
| CA-010 | T011, T012 | copy naming suffix tests | copy IDs collide or shadow builtin IDs |
| CA-011 | T003, T005, T006 | guide drift tests and validate repair hints | guide cannot be tested against validation concepts |

## Must-Preserve Mapping

| MP Range | Task Evidence |
| --- | --- |
| MP-001, MP-004, MP-017 | T005, T008, T016 preserve one global authoring tool and all operations. |
| MP-002, MP-005, MP-019, MP-021 | T006, T007, T008, T015 preserve direct create and same-store desktop/server visibility. |
| MP-003, MP-008, MP-018 | T009, T010, T013, T014 preserve stale-write and no-write failure semantics. |
| MP-006 | T004, T008, T010, T014 preserve phase-policy gating. |
| MP-007, MP-010 | T011, T012 preserve builtin copy-then-edit and naming. |
| MP-009 | T013, T014 preserve destructive user-only delete. |
| MP-011, MP-022 | T003, T005, T006 preserve field guide and drift tests. |
| MP-012, MP-014 | T001, T005, T015 preserve protected-state and session snapshot boundaries. |
| MP-013, MP-015 | T002, T003, T006 preserve linear-only and shared validation. |
| MP-016, MP-020 | T008, T016 preserve live-evidence and transcript-auditable result obligations. |

## Dependencies And Execution Order

- Phase 1 starts with T001.
- Phase 2 depends on T001. T003 and T004 may run in parallel after T002 because they touch distinct files and stable shared validation constants.
- US1 depends on T005 and T004. T006 must fail for missing behavior before T007/T008 implement it.
- US2 depends on US1 tool/service/API shape. T009 must fail before T010.
- US3 depends on US2 shared mutation primitives. T011 must fail before T012.
- US4 depends on duplicate/update primitives and `basisHash`. T013 must fail before T014.
- T015 depends on all mutating operations existing.
- T016 depends on T015.

## Parallel Opportunities

- Batch B1: T003 and T004 after T002. Join at JP1.
- Later implementation may split test-authoring substeps internally, but top-level tasks T006/T009/T011/T013 intentionally share test files and should remain serial.
- Shared surfaces `src/tools.ts`, `src/server/api/workflowTemplates.ts`, `src/server/services/workflowTemplateRegistryService.ts`, and `src/server/services/workflowToolPolicy.ts` are join-owner files and should not be edited concurrently by separate workers.

## Implementation Dispatch

Feature delivery shape: serial phases with one foundational parallel batch and story-by-story TDD slices.  
Current ready implementation batch: T001 only.  
Current batch dispatch recommendation:

- execution_model: subagent-mandatory
- dispatch_shape: one-subagent
- execution_surface: native-subagents
- policy_reason: safe-one-subagent

Confirmed delivery boundary:

1. Complete setup and foundational tasks.
2. Complete US1 create, US2 update, US3 duplicate, and US4 delete in order.
3. Run cross-cutting desktop/server and snapshot safety checks.
4. Run `bun run check:server` and `bun run verify`.
5. Stop and report evidence; do not claim ready without report paths or an explicit blocker.

## Analyze Remediation Mapping

| Finding ID | Disposition | Task/Section Evidence | Notes |
| --- | --- | --- | --- |
| No prior analyze blockers | not_applicable | First task-generation pass | No remediation mapping required |

## Implementation-Readiness Task Self-Audit

- Buildable FR coverage: passed; FR-001 through FR-015 map to T002-T016.
- Locked decision preservation: passed; direct writes, builtin copy, stale checks, delete, desktop path, and field guide are task-mapped.
- Guardrail mapping: passed; every shared boundary and no-write rule is mapped.
- DP1/DP2/DP3 packet readiness: passed; task packets include target boundary, dependency order, write scope, validation, and handoff requirements.
- Reference fidelity mapping: passed; manual Workflows API/registry/Settings refetch behavior maps to T002, T007, T015.
- Unmapped task status: passed; T001 is setup and T016 is verification.
- Write-set conflicts: passed with serial shared-surface owners; only T003/T004 are marked parallel.

## Recommended Next Command

`/sp.implement`
