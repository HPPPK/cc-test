# Tasks: Workflows Template Management And Chat Entry

**Input**: Design documents from `.specify/features/005-specify-discussions-workflow/`  
**Prerequisites**: `plan.md`, `spec.md`, `alignment.md`, `context.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `plan-contract.json`, `workflow-state.md`  
**Target root**: `F:\github\cc-jiangxia`  
**Recommended next command**: `$sp-implement`

## Planning Inputs

- **Active profile**: Standard Delivery with lifecycle consequence gate.
- **Confirmed delivery boundary**: one unified `Workflows` feature covering Settings template management, JSON import/export, staged workflow contract authoring, Chat composer `+ > Workflows`, empty-session workflow start, and non-empty linked workflow start.
- **Implementation target boundary**: current repository is the target. No external implementation target is in scope.
- **Locked decisions**: user-facing label is `Workflows`; user templates are global user-level only; built-ins are read-only/protected and copyable; Settings management is schema-aware CRUD; import/export uses preview, selection, validation, and rename-by-default conflicts; workflows are staged contracts with output artifact and handoff semantics; non-empty chats require explicit context strategy and create linked workflow sessions; existing workflow snapshots are not retroactively mutated.
- **Consequence obligations**: CA-001 through CA-006 are implementation obligations and are mapped below.
- **Cognition advisory**: project cognition freshness is `fresh/query_ready`; query coverage returned path-level minimal live reads and no relationship nodes. Live repository reads backed the write scopes and verification routes.
- **Delegated task-generation lanes**: `task-generation/handoffs/story-phase-decomposition.json`, `task-generation/handoffs/dependency-graph-analysis.json`, and `task-generation/handoffs/write-set-parallel-safety.json` shaped the task list, dependency graph, write sets, guardrails, and join points.

## Implementation Target Boundary

- **Target root**: `F:\github\cc-jiangxia`
- **Target-relative paths**: all paths in task descriptions are relative to `F:\github\cc-jiangxia`.
- **Evidence status**: plan package plus project cognition query, delegated task-generation lanes, and live reads of server workflow, session, compact, desktop Settings, Chat, API, type, store, i18n, and test surfaces.
- **Boundary constraints**: implementation must extend existing Bun/TypeScript server services, React/Zustand desktop UI, workflow registry/runtime, session API, and compaction semantics.
- **Reference-only paths**: `.specify/discussions/workflow-template-management/*` and external Claude Code `/workflow` references are decision evidence only, not implementation write targets.
- **Forbidden drift**: project-level templates, built-in in-place mutation, overwrite-by-default imports, prompt-only phases, source-session `/compact` mutation, retroactive snapshot mutation, direct desktop writes to `workflows.json`, protected-file mutation, and coverage gate bypass.

## Task Guardrail Index

- **G1 Target boundary**: implement only in `F:\github\cc-jiangxia`; reference artifacts stay reference-only. Applies to all tasks.
- **G2 Server-owned persistence**: desktop never writes `~/.claude/cc-jiangxia/workflows.json`; mutation goes through server registry/API. Applies to T003-T015.
- **G3 Built-in protection**: built-ins are read-only/copyable; user templates cannot shadow built-in ids. Applies to T003, T006, T007, T010-T015, T024.
- **G4 Lossless writes**: preserve unknown fields and never silently overwrite malformed config. Applies to T003, T006, T007, T012-T015, T024.
- **G5 Snapshot compatibility**: template edits/import/delete affect future sessions only. Applies to T018, T020-T024.
- **G6 Linked-session source preservation**: non-empty chat start creates a new linked workflow session and leaves source chat unchanged. Applies to T018-T023.
- **G7 Non-mutating summarize**: summarize uses compact-style semantics without source-session `/compact` cleanup/mutation. Applies to T019, T021, T022, T024.
- **G8 Structured phase contract**: output artifacts and handoff contracts are first-class, not prompt-only. Applies to T003, T006, T010, T012, T014, T024.
- **G9 Same-area tests and gates**: source changes under `src/server` or `desktop/src` require same-area tests and narrow gates before final `bun run verify`. Applies to all implementation tasks.
- **G10 Protected files**: do not touch `.env`, credentials, OAuth/provider configs, Claude transcripts, `.mcp.json`, managed MCP config, skills/plugins/teams, `node_modules`, or generated quality artifacts. Applies to all tasks.

## Task-Generation Evidence Index

- `task-generation/evidence-index.json`
- `task-generation/checkpoints.ndjson`
- `task-generation/handoffs/story-phase-decomposition.json`
- `task-generation/handoffs/dependency-graph-analysis.json`
- `task-generation/handoffs/write-set-parallel-safety.json`

## Reference Fidelity Mapping

- Existing `GET /api/workflows/templates` list behavior: T004, T007, JP1.
- Built-in `agent-development` remains visible/startable when user config is missing or invalid: T003, T006, T007, T010, T017, JP1, JP4.
- Workflow sessions snapshot templates at creation and are not mutated by template source changes: T018, T020, T022, T024, JP5.
- Active workflow sessions keep status, transition controls, pending artifacts, and report links: T016, T017, T024, JP4.
- `/compact` is semantic reference only for summarize; linked-session summarize must be non-mutating: T019, T021, T022, JP5.

## Consequence Obligation Mapping

| Obligation ID | Task IDs | Affected State / Dependency | Required References | Validation | Stop And Reopen |
| --- | --- | --- | --- | --- | --- |
| CA-001 | T003, T006, T007, T010, T017, T024 | Built-in template list/startability, diagnostics | `plan.md#Operational Consequence Design`, `contracts/workflow-template-api.md`, `workflowTemplateRegistryService.ts` | `bun run check:server`, `bun run check:desktop` | Invalid user config blocks built-ins. |
| CA-002 | T003, T006, T007, T012, T014, T015, T024 | `workflows.json` writes, import/export, unknown fields | `data-model.md#Workflow Template Document`, `contracts/workflow-template-api.md` | `bun run check:server` | Any write path is lossy or mutates protected files. |
| CA-003 | T003, T006, T007, T010-T015, T024 | Built-in protection and id conflicts | `plan.md#Implementation Constitution`, `contracts/workflow-template-api.md` | `bun run check:server`, `bun run check:desktop` | UI/API permits built-in edit/delete or `agent-development` shadowing. |
| CA-004 | T018, T020, T022, T024 | Workflow session snapshots and status display | `data-model.md#Snapshot Compatibility`, `contracts/linked-workflow-session.md` | `bun run check:server`, `bun run check:desktop` | Template edits scan or rewrite existing workflow sessions. |
| CA-005 | T018-T023, T024 | Non-empty chat context strategy, linked session, source transcript | `contracts/linked-workflow-session.md`, `research.md#Compact-Style Summary Carryover` | `bun run check:server`, `bun run check:desktop`, quickstart smoke | Non-empty start lacks explicit strategy or mutates source chat. |
| CA-006 | T003, T006, T010, T012, T014, T024 | Phase output/handoff schema and editor mapping | `data-model.md#Workflow Phase Contract`, `plan.md#Implementation Constitution` | `bun run check:server`, `bun run check:desktop` | Editor/API saves prompt-only phases. |

## Analyze Remediation Mapping

| Finding ID | Disposition | Task/Section Evidence | Notes |
|------------|-------------|-----------------------|-------|
| No prior analyze blockers | not_applicable | First task-generation pass | No remediation mapping required |

## Phase 0: Implementation Guardrails

**Purpose**: Confirm target boundaries, forbidden drift, and verification evidence before code work.

- [X] T001 Read and record implementation guardrails from `.specify/features/005-specify-discussions-workflow/plan.md`, `.specify/features/005-specify-discussions-workflow/plan-contract.json`, and `.specify/memory/constitution.md`
- [X] T002 Confirm target write boundaries and protected paths before implementation in `.specify/features/005-specify-discussions-workflow/handoff-to-tasks.json`

**Checkpoint 0**: Implementation guardrails captured. Downstream agents can start setup tasks without asking for scope clarification.

## Phase 1: Setup

**Purpose**: Establish failing tests and type/client contract fixtures before production implementation.

- [X] T003 [P] Add registry validation and persistence regression tests in `src/server/services/workflowTemplateRegistryService.test.ts`
- [X] T004 [P] Add workflow template API contract tests in `src/server/__tests__/workflowTemplates.test.ts`
- [X] T005 [P] Add linked workflow session contract tests in `src/server/__tests__/sessions.test.ts`
- [X] T006 [P] Add desktop workflow template API/client tests in `desktop/src/api/sessions.test.ts`

**Parallel Batch 1**: T003, T004, T005, T006 can run together because their primary write sets are isolated test files.  
**Join Point 1**: Confirm tests fail for missing behavior rather than setup/type errors before production implementation.

## Phase 2: Foundational

**Purpose**: Server and desktop client foundations that block all user-story UI work.

- [X] T007 Extend workflow template registry validation and lossless write behavior in `src/server/services/workflowTemplateRegistryService.ts`
- [X] T008 Add workflow template mutation API and route integration in `src/server/api/workflowTemplates.ts` and `src/server/router.ts`
- [X] T009 Add desktop workflow template API methods and types in `desktop/src/api/sessions.ts` and `desktop/src/types/session.ts`

**Checkpoint JP1**: Server template contract stable.  
Validation target: registry validation/write preservation and workflow template routes.  
Validation command: `bun run check:server`  
Pass condition: registry and API tests cover CA-001, CA-002, CA-003, CA-006; existing `GET /api/workflows/templates` remains compatible.

## Phase 3: User Story 1 - Manage Workflow Templates In Settings (Priority: P1)

**Goal**: Users manage global user-level workflow templates in Settings using schema-aware CRUD while built-ins stay protected.
**Independent Test**: Settings shows `Workflows`, lists built-in/user templates with diagnostics, supports copy/create/edit/delete/validate/save for user templates, blocks invalid prompt-only phases, and never writes files from desktop.

- [X] T010 [P] [US1] Add Settings Workflows tab routing and localized labels in `desktop/src/pages/Settings.tsx`, `desktop/src/stores/uiStore.ts`, `desktop/src/i18n/locales/en.ts`, and `desktop/src/i18n/locales/zh.ts`
- [X] T011 [US1] Add Workflows manager list, diagnostics, and built-in copy affordances in `desktop/src/components/workflow/WorkflowTemplateManager.tsx`
- [X] T012 [US1] Add schema-aware workflow template editor with common fields first and advanced disclosure in `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- [X] T013 [US1] Wire Settings save/delete/duplicate/validate flows to server APIs in `desktop/src/components/workflow/WorkflowTemplateManager.tsx`

**Checkpoint JP2**: Settings CRUD independently validatable.  
Validation target: Settings Workflows tab, CRUD, diagnostics, built-in protection, editor validation, i18n.  
Validation command: `bun run check:desktop`  
Pass condition: desktop tests cover FR-001 through FR-008 and CA-001/CA-003/CA-006.

## Phase 4: User Story 2 - Import And Export Templates (Priority: P2)

**Goal**: Users export workflow templates and import selected JSON candidates through preview, validation, rename-by-default conflicts, and server-owned commit.
**Independent Test**: Import preview writes nothing, conflicts default to rename, built-in id shadowing cannot commit as-is, selected commit persists only valid user templates, export excludes unrelated protected state.

- [X] T014 [P] [US2] Add server import/export preview and commit service coverage in `src/server/services/workflowTemplateRegistryService.ts` and `src/server/__tests__/workflowTemplates.test.ts`
- [X] T015 [US2] Add Settings import/export dialogs in `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`

**Checkpoint JP3**: Import/export independently validatable.  
Validation target: server preview/commit/export and desktop selection/rename UI.  
Validation commands: `bun run check:server`, `bun run check:desktop`  
Pass condition: CA-002/CA-003/CA-006 and FR-009 through FR-011 pass with no overwrite-by-default behavior.

## Phase 5: User Story 3 - Start Workflows From Empty Chat (Priority: P2)

**Goal**: Users open composer `+ > Workflows` in empty/new sessions, choose a startable template, and start workflow mode using existing launch behavior.
**Independent Test**: Empty/new session selection opens a Workflows dialog with template metadata and invalid warnings, rejects invalid templates, creates workflow sessions through the existing create/replacement path, and ActiveSession workflow status still renders.

- [X] T016 [P] [US3] Add reusable Workflow start dialog for empty-session launch in `desktop/src/components/workflow/WorkflowStartDialog.tsx`
- [X] T017 [US3] Wire empty/new composer `+ > Workflows` launch in `desktop/src/components/chat/ChatInput.tsx` and `desktop/src/pages/EmptySession.tsx`

**Checkpoint JP4**: Empty chat workflow start independently validatable.  
Validation target: composer entry, template dialog, startable filtering, existing workflow status display.  
Validation command: `bun run check:desktop`  
Pass condition: FR-012 through FR-014 and FR-018 pass without regressing existing workflow picker/status tests.

## Phase 6: User Story 4 - Start Linked Workflows From Non-Empty Chat (Priority: P1)

**Goal**: Users start Workflows from non-empty normal chats only after choosing inherit, summarize, or clear; the system creates a linked workflow session and leaves the original chat unchanged.
**Independent Test**: Server rejects unsupported/active source sessions, clear/inherit/summarize create target workflow sessions with snapshots/provenance, summarize is non-mutating or visibly unavailable, and desktop opens the target while preserving the source chat.

- [X] T018 [P] [US4] Extract shared workflow session creation helper in `src/server/services/workflowSessionCreateService.ts`
- [X] T019 [P] [US4] Add non-mutating compact-style summary helper in `src/services/compact/workflowSummaryCarryover.ts`
- [X] T020 [US4] Add linked workflow session service in `src/server/services/workflowSessionLinkService.ts`
- [X] T021 [US4] Add linked workflow start API route in `src/server/api/sessions.ts`
- [X] T022 [US4] Add desktop linked workflow start API/types in `desktop/src/api/sessions.ts` and `desktop/src/types/session.ts`
- [X] T023 [US4] Wire non-empty Chat `+ > Workflows` context strategy UI in `desktop/src/components/chat/ChatInput.tsx` and `desktop/src/pages/ActiveSession.tsx`

**Checkpoint JP5**: Linked non-empty workflow start validatable across server and desktop.  
Validation target: clear/inherit/summarize behavior, source preservation, target snapshot/provenance, active source rejection, visible summary failures, desktop navigation.  
Validation commands: `bun run check:server`, `bun run check:desktop`  
Pass condition: CA-004/CA-005 and FR-015 through FR-018 pass; no source-session `/compact` mutation is used.

## Final Phase: Polish & Cross-Cutting Verification

**Purpose**: Prove complete feature behavior, coverage, and handoff evidence.

- [X] T024 Run integration verification, quickstart smoke, coverage, and PR gate evidence in `artifacts/quality-runs/` and `artifacts/coverage/`

**Checkpoint JP6**: Feature implementation evidence complete.  
Validation target: all user stories, CA-001 through CA-006, MP-001 through MP-015, same-area tests, coverage, and verify report.  
Validation commands: `bun run check:server`, `bun run check:desktop`, `bun run check:coverage`, `bun run verify`  
Pass condition: gates pass or exact blocker is recorded for provider-backed live summarize evidence; generated quality artifacts are not committed.

## Dependencies & Execution Order

- T001-T002 must complete before implementation tasks.
- T003-T006 can run in parallel after guardrails.
- T007 depends on T003.
- T008 depends on T004 and T007.
- T009 depends on T006 and T008.
- US1 tasks T010-T013 depend on T009.
- US2 tasks T014-T015 depend on T007, T008, and T013.
- US3 tasks T016-T017 depend on T009.
- US4 server tasks T018-T021 depend on T005, T007, and T008.
- US4 desktop tasks T022-T023 depend on T009, T017, and T021.
- T024 depends on T013, T015, T017, and T023.

## Parallel Opportunities

- **Batch 1**: T003, T004, T005, T006.
- **Batch 2**: T010, T014, T016, T018, T019 after JP1 and T009 where applicable; keep i18n and shared workflow component edits coordinated.
- **Batch 3**: T015 and T020 after their server/UI prerequisites; no overlapping write scopes.
- **Batch 4**: US1 and US3 can proceed in parallel after desktop API/types stabilize.
- **Current ready batch dispatch**: `parallel-subagents` for T003-T006 when entering `$sp-implement`.

## Parallel Execution Examples

```bash
# Batch 1
T003: registry tests
T004: workflow template API tests
T005: linked session contract tests
T006: desktop API tests

# Join Point 1
bun run check:server
```

```bash
# After JP1 and T009
T010: Settings tab/i18n wiring
T016: WorkflowStartDialog for empty chat
T018: workflowSessionCreateService extraction
T019: non-mutating summary helper
```

## Implementation Dispatch

- **Feature delivery shape**: serial foundational phases with intra-phase parallel batches, then parallel-ready Settings/empty-chat/linked-session lanes after server contracts stabilize.
- **execution_model**: adaptive
- **execution_mode**: standard
- **workflow_status**: ready
- **dispatch_shape**: parallel-subagents
- **execution_surface**: native-subagents
- **capability_degraded**: false
- **blocked_reason**: none
- **delegated_task_generation_lanes**: `story-phase-decomposition`, `dependency-graph-analysis`, `write-set-parallel-safety`

## Enriched Task Contracts

Each task packet under `task-packets/T###.json` is authoritative for full subagent execution fields. Summary matrix:

| Task | agent | depends_on | parallel_safe | write_scope | verify_commands | Guardrails |
| --- | --- | --- | --- | --- | --- | --- |
| T001 | executor | none | false | `workflow-state.md`, `handoff-to-tasks.json` | manual artifact review | G1, G10 |
| T002 | security-reviewer | T001 | false | `handoff-to-tasks.json` | manual protected-path review | G1, G10 |
| T003 | test-engineer | T001, T002 | true | `src/server/services/workflowTemplateRegistryService.test.ts` | `bun run check:server` | G3, G4, G8, G9 |
| T004 | test-engineer | T001, T002 | true | `src/server/__tests__/workflowTemplates.test.ts` | `bun run check:server` | G2, G3, G4, G8, G9 |
| T005 | test-engineer | T001, T002 | true | `src/server/__tests__/sessions.test.ts` | `bun run check:server` | G5, G6, G7, G9 |
| T006 | test-engineer | T001, T002 | true | `desktop/src/api/sessions.test.ts` | `bun run check:desktop` | G2, G9 |
| T007 | executor | T003 | false | `src/server/services/workflowTemplateRegistryService.ts`, `src/server/services/workflowTemplateRegistryService.test.ts` | `bun run check:server` | G3, G4, G8, G9 |
| T008 | api-reviewer | T004, T007 | false | `src/server/api/workflowTemplates.ts`, `src/server/router.ts`, `src/server/__tests__/workflowTemplates.test.ts` | `bun run check:server` | G2, G3, G4, G8, G9 |
| T009 | executor | T006, T008 | false | `desktop/src/api/sessions.ts`, `desktop/src/types/session.ts`, `desktop/src/api/sessions.test.ts` | `bun run check:desktop` | G2, G9 |
| T010 | executor | T009 | true | `desktop/src/pages/Settings.tsx`, `desktop/src/stores/uiStore.ts`, locale files, tests | `bun run check:desktop` | G1, G9 |
| T011 | executor | T010 | false | `desktop/src/components/workflow/WorkflowTemplateManager.tsx`, tests | `bun run check:desktop` | G2, G3, G9 |
| T012 | executor | T011 | false | `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`, tests | `bun run check:desktop` | G4, G8, G9 |
| T013 | executor | T011, T012 | false | `WorkflowTemplateManager.tsx`, Settings workflow tests | `bun run check:desktop` | G2, G3, G4, G8, G9 |
| T014 | executor | T007, T008 | true | registry/API import-export implementation and tests | `bun run check:server` | G3, G4, G8, G9 |
| T015 | executor | T013, T014 | false | `WorkflowImportExportDialog.tsx`, locale files, tests | `bun run check:desktop` | G2, G3, G4, G9 |
| T016 | executor | T009 | true | `WorkflowStartDialog.tsx`, workflow component tests | `bun run check:desktop` | G1, G3, G9 |
| T017 | executor | T016 | false | `ChatInput.tsx`, `EmptySession.tsx`, tests | `bun run check:desktop` | G3, G5, G9 |
| T018 | executor | T005, T007, T008 | true | `workflowSessionCreateService.ts`, server session tests | `bun run check:server` | G5, G9 |
| T019 | executor | T005 | true | `workflowSummaryCarryover.ts`, compact tests | `bun run check:server` | G7, G9 |
| T020 | executor | T018, T019 | false | `workflowSessionLinkService.ts`, server session tests | `bun run check:server` | G5, G6, G7, G9 |
| T021 | api-reviewer | T020 | false | `src/server/api/sessions.ts`, linked route tests | `bun run check:server` | G5, G6, G7, G9 |
| T022 | executor | T009, T021 | false | `desktop/src/api/sessions.ts`, `desktop/src/types/session.ts`, tests | `bun run check:desktop` | G6, G9 |
| T023 | executor | T017, T022 | false | `ChatInput.tsx`, `ActiveSession.tsx`, session store/tests | `bun run check:desktop` | G6, G7, G9 |
| T024 | quality-reviewer | T013, T015, T017, T023 | false | existing touched files only; no generated artifacts committed | all final gates | G1-G10 |

## Implementation-Readiness Task Self-Audit

- **Buildable FR coverage**: PASS. FR-001 through FR-018 map to T007-T024 with story checkpoints.
- **Success criteria coverage**: PASS. SC-001 maps to US1/US2, SC-002 to T003/T006/T007, SC-003 to US4, SC-004 to T018/T020/T024.
- **Locked decision preservation**: PASS. MP-001 through MP-015 are in guardrails, consequence mapping, and task packets.
- **Guardrail mapping**: PASS. G1 through G10 map to concrete tasks.
- **DP1/DP2/DP3 packet readiness**: PASS for task generation. Each task has target root, write/read scope, forbidden paths, dependencies, verification, acceptance, and handoff format in `task-packets/`.
- **Reference fidelity mapping**: PASS. Existing registry, workflow session snapshot, ActiveSession status, and compact semantics are mapped above.
- **Unmapped task status**: PASS. T001/T002 are guardrail setup; T024 is verification/polish.
- **Write-set conflict status**: PASS. Shared surfaces are serialized through dependencies and join points.

## No-New-Test Rationale

No production behavior task omits tests. T001 and T002 are artifact/guardrail setup tasks and use manual artifact review. T024 is verification-only and may modify only previously touched files to fix integration defects found by gates.
