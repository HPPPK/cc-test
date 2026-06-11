# Tasks: Settings Provider Import Export

**Input**: Design documents from `.specify/features/008-specify-discussions-settings/`
**Prerequisites**: `plan.md`, `spec.md`, `alignment.md`, `context.md`, `research.md`, `data-model.md`, `contracts/provider-import-export-api.md`, `quickstart.md`, `plan-contract.json`
**Feature delivery shape**: serial foundation with intra-story server/desktop parallel batches and explicit high-risk join points
**Recommended next command**: `/sp.implement`

## Planning Inputs

- **Locked planning decisions**: Provider bundles are provider-record-only; default export is secret-free and server-redacted; secret export is separate and high-friction; import preview is side-effect free; import commit never activates providers or writes active provider env; conflicts default to add/rename; overwrite is explicit.
- **Implementation constitution**: Server-side schemas own bundle validation and redaction. Desktop masking is not a security boundary. Import preview and commit stay separate. Commit revalidates current state before write.
- **Scenario profile**: `Standard Delivery`.
- **Alignment risks**: Project cognition is blocked by missing DB; task generation uses live repository evidence. Raw-vs-masked `apiKey` behavior must be resolved by server-owned export redaction tests and implementation.
- **Validation references**: `quickstart.md`, `contracts/provider-import-export-api.md`, and same-area server/desktop tests.
- **Must-preserve obligations**: `MP-001` through `MP-010` are mapped in the Task Guardrail Index and task contract matrix.

## Implementation Target Boundary

- **Target root**: `F:/github/cc-jiangxia`
- **Target-relative paths**: `src/server/types/provider.ts`, `src/server/services/providerService.ts`, `src/server/api/providers.ts`, `src/server/__tests__/providers.test.ts`, `desktop/src/types/provider.ts`, `desktop/src/api/providers.ts`, `desktop/src/stores/providerStore.ts`, `desktop/src/pages/Settings.tsx`, `desktop/src/i18n/locales/en.ts`, `desktop/src/i18n/locales/zh.ts`, and same-area desktop tests.
- **Evidence status**: Project cognition unavailable; targeted live reads verified ownership and current absence of provider import/export.
- **Boundary constraints**: Extend existing provider service/API/store/UI surfaces. Do not create a backup subsystem or Settings JSON import/export replacement.
- **Reference-only paths**: `desktop/src/components/workflow/WorkflowImportExportDialog.tsx` is interaction precedent only, not a schema source.

## Task Guardrail Index

- `G-SEC-REDIRECT`: Server-owned redaction is mandatory; no frontend-only secret handling. Applies to T002, T004, T005, T012, T013, T016. Preserves `MP-004`, `MP-010`, `CA-001`, `CA-006`.
- `G-NO-ACTIVE`: Do not export/import `activeId`, default provider selection, or active provider env. Applies to T002, T005, T008, T009, T016. Preserves `MP-007`, `CA-003`.
- `G-PREVIEW-COMMIT`: Preview writes nothing; commit revalidates and writes only selected resolutions. Applies to T008, T009, T010, T011, T016. Preserves `MP-008`, `CA-002`.
- `G-CONFLICT`: Default conflict behavior is add/rename; overwrite is explicit. Applies to T008, T009, T010, T011. Preserves `MP-006`, `CA-004`, `CA-005`.
- `G-SECRET-EXPORT`: Secret export is separate, second-confirmed, not remembered, and labeled. Applies to T012, T013, T014, T015. Preserves `MP-003`, `MP-005`, `CA-007`.
- `G-SCOPE`: Saved provider records only; no OAuth/login state or whole-app backup. Applies to all tasks. Preserves `MP-001`, `MP-002`, `MP-009`.
- `G-TEST`: Same-area tests are required for every production change. Applies to T004-T016.

## Context Navigation

| Need | Location |
| --- | --- |
| Locked planning decisions | `plan.md#locked-planning-decisions` |
| Architecture invariants | `plan.md#implementation-constitution` |
| Consequence obligations | `plan.md#operational-consequence-design` |
| Provider bundle model | `data-model.md#entity-providerbundle` |
| Import preview model | `data-model.md#entity-providerimportpreview` |
| Import resolution model | `data-model.md#entity-providerimportresolution` |
| API contract | `contracts/provider-import-export-api.md#scope` |
| Validation scenarios | `quickstart.md#purpose` |
| Existing provider service pattern | `src/server/services/providerService.ts` |
| Existing provider routes | `src/server/api/providers.ts` |
| Existing provider tests | `src/server/__tests__/providers.test.ts` |
| Existing provider desktop UI | `desktop/src/pages/Settings.tsx` |
| Workflow import/export precedent | `desktop/src/components/workflow/WorkflowImportExportDialog.tsx` |

## Phase 0: Implementation Guardrails

**Purpose**: Confirm task executor starts from the provider boundary and security invariants before editing source or tests.

- [X] T001 Review provider import/export guardrails in `.specify/features/008-specify-discussions-settings/plan.md` and required provider reference files before source edits

## Phase 1: Foundational Shared Contracts

**Purpose**: Establish typed request/response surfaces that server and desktop tasks can build against.

- [X] T002 [P] Define server provider import/export schemas and types in `src/server/types/providerImportExport.ts`
- [X] T003 [P] Define desktop provider import/export types in `desktop/src/types/providerImportExport.ts`

**Join Point JP1 - Contract Surface Stable**

- Validation target: server and desktop type surfaces exist and do not include active/default provider transfer.
- Validation command: review `src/server/types/providerImportExport.ts` and `desktop/src/types/providerImportExport.ts`; then run `bun run check:server` and `bun run check:desktop` once implementation reaches green state.
- Pass condition: schema fields match `data-model.md` and `contracts/provider-import-export-api.md`; `activeId` is absent from bundle payloads.

## Phase 2: User Story 1 - Secret-Free Provider Export (Priority: P1)

**Goal**: A user can export selected/all saved providers in a shareable JSON bundle that does not include credentials by default.

**Independent Test**: Export a saved provider containing `sk-test-key-123` and assert the serialized bundle has `containsSecrets: false` and does not contain the key or active/default selection.

### Tests for User Story 1

- [X] T004 [P] [US1] Add RED server tests for secret-free provider export in `src/server/__tests__/providers.test.ts`
- [X] T006 [P] [US1] Add RED desktop API/store tests for secret-free provider export in `desktop/src/stores/providerStore.test.ts`

**Join Point JP2 - Export RED Tests**

- Validation target: server and desktop export tests fail for missing provider export behavior, not syntax/setup.
- Validation command: `bun test src/server/__tests__/providers.test.ts` and `cd desktop && bun run test -- providerStore`.
- Pass condition: failures point to missing export service/API/store behavior.

### Implementation for User Story 1

- [X] T005 [P] [US1] Implement secret-free provider export service and API route in `src/server/services/providerService.ts` and `src/server/api/providers.ts`
- [X] T007 [P] [US1] Implement desktop secret-free export API/store/UI and i18n in `desktop/src/api/providers.ts`, `desktop/src/stores/providerStore.ts`, `desktop/src/pages/Settings.tsx`, `desktop/src/i18n/locales/en.ts`, and `desktop/src/i18n/locales/zh.ts`

**Join Point JP3 - Secret-Free Export Works**

- Validation target: US1 is independently usable.
- Validation command: `bun run check:server` and `bun run check:desktop`.
- Pass condition: server export tests prove redaction; desktop tests prove export action is reachable and store/API calls are correct.

## Phase 3: User Story 2 - Import Preview And Commit (Priority: P1)

**Goal**: A user can preview a provider bundle, see diagnostics/conflicts, and commit selected add/rename/overwrite resolutions without changing active provider state.

**Independent Test**: Preview a mixed bundle and verify no persistence writes; commit selected candidates and verify generated IDs, explicit overwrite, and unchanged `activeId`/managed env.

### Tests for User Story 2

- [X] T008 [P] [US2] Add RED server tests for import preview, commit, conflicts, generated IDs, and active-state non-mutation in `src/server/__tests__/providers.test.ts`
- [X] T010 [P] [US2] Add RED desktop tests for import preview, conflict defaults, missing secret diagnostics, and commit refresh in `desktop/src/__tests__/generalSettings.test.tsx`

**Join Point JP4 - Import RED Tests**

- Validation target: import tests fail for missing preview/commit behavior.
- Validation command: `bun test src/server/__tests__/providers.test.ts` and `cd desktop && bun run test -- generalSettings`.
- Pass condition: failures are expected missing behavior failures.

### Implementation for User Story 2

- [X] T009 [P] [US2] Implement provider import preview and commit service/routes in `src/server/services/providerService.ts` and `src/server/api/providers.ts`
- [X] T011 [P] [US2] Implement desktop import preview/commit dialog, store actions, and i18n in `desktop/src/api/providers.ts`, `desktop/src/stores/providerStore.ts`, `desktop/src/pages/Settings.tsx`, `desktop/src/i18n/locales/en.ts`, and `desktop/src/i18n/locales/zh.ts`

**Join Point JP5 - Import Preview/Commit Works**

- Validation target: US2 is independently usable and safe.
- Validation command: `bun run check:server` and `bun run check:desktop`.
- Pass condition: preview writes nothing, commit revalidates, conflicts default add/rename, active provider state remains unchanged.

## Phase 4: User Story 3 - Intentional Secret Export (Priority: P2)

**Goal**: A user can intentionally export a credential-bearing bundle only through a separate dangerous path with warning, second confirmation, no remembered choice, and clear labeling.

**Independent Test**: Secret export without confirmation is rejected; with confirmation it produces `containsSecrets: true` and credential-bearing labeling while official OAuth/login state stays excluded.

### Tests for User Story 3

- [X] T012 [P] [US3] Add RED server tests for secret export confirmation and credential-bearing labeling in `src/server/__tests__/providers.test.ts`
- [X] T014 [P] [US3] Add RED desktop tests for secret export warning, second confirmation, and non-remembered choice in `desktop/src/__tests__/generalSettings.test.tsx`

**Join Point JP6 - Secret Export RED Tests**

- Validation target: secret export tests fail for missing dangerous path behavior.
- Validation command: `bun test src/server/__tests__/providers.test.ts` and `cd desktop && bun run test -- generalSettings`.
- Pass condition: failures point to missing confirmation/labeling behavior.

### Implementation for User Story 3

- [X] T013 [P] [US3] Implement confirmed secret export service and API route in `src/server/services/providerService.ts` and `src/server/api/providers.ts`
- [X] T015 [P] [US3] Implement desktop secret export dangerous action and i18n in `desktop/src/pages/Settings.tsx`, `desktop/src/api/providers.ts`, `desktop/src/stores/providerStore.ts`, `desktop/src/i18n/locales/en.ts`, and `desktop/src/i18n/locales/zh.ts`

**Join Point JP7 - Secret Export Safety Review**

- Validation target: secret export is intentional, high-friction, and labeled.
- Validation command: `bun run check:server` and `bun run check:desktop`.
- Pass condition: tests prove no default credential leak, secret export requires explicit confirmation, and UI does not remember the choice.

## Phase 5: Final Verification And Coverage

**Purpose**: Prove the cross-boundary feature is complete and no safety guardrail was lost.

- [X] T016 Verify provider import/export end-to-end gates and coverage using `bun run check:server`, `bun run check:desktop`, `bun run check:coverage`, and `bun run verify`

## Task Contract Matrix

| Task | agent | depends_on | parallel_safe | write_scope | read_scope | forbidden | expected_outputs | anti_goals / does_not_remove | capability_operations | acceptance_criteria | verify_commands | retry / escalation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | executor | none | false | none | all required references in Context Navigation | `.env`, credential files, provider config files under user home | worker handoff only | Do not edit source/tests; preserve all MP/CA obligations | preserves all operations | Worker handoff lists inspected references and confirms guardrails | no command; review only | 2 / debugger |
| T002 | executor | T001 | true | `src/server/types/providerImportExport.ts` | `src/server/types/provider.ts`, API contract, data model | `.env`, user config, desktop files | new server schema/type file | Do not add active/default fields; do not include OAuth state | implements bundle/preview/commit contract types | Zod/type exports cover bundle, export, preview, commit, diagnostics | `bun run check:server` | 2 / debugger |
| T003 | executor | T001 | true | `desktop/src/types/providerImportExport.ts` | server contract, data model, desktop provider types | `.env`, server files | new desktop type file | Do not create divergent field names from server contract | supports desktop API/store operations | Desktop types mirror contract and exclude active state | `bun run check:desktop` | 2 / debugger |
| T004 | test-engineer | T002 | true | `src/server/__tests__/providers.test.ts` | provider service/API/types, quickstart | `.env`, desktop files | modified server tests | Do not implement behavior in test task | validates secret-free export | Tests fail for missing export and assert no raw keys/active state | `bun test src/server/__tests__/providers.test.ts` | 2 / debugger |
| T005 | executor | T004, T002 | true | `src/server/services/providerService.ts`, `src/server/api/providers.ts`, `src/server/types/provider.ts` if needed | server tests, contract, data model | `.env`, desktop files, user config | modified server service/API | Do not implement secret export here except shared helpers; do not change list masking unless required by tests | implements secret-free export | Secret-free export returns bundle without raw credentials and writes nothing | `bun run check:server` | 2 / debugger |
| T006 | test-engineer | T003 | true | `desktop/src/stores/providerStore.test.ts` | desktop API/store/types, contract | `.env`, server files | modified desktop store tests | Do not implement store behavior in test task | validates desktop export action | Tests fail for missing export API/store action and expected request shape | `cd desktop && bun run test -- providerStore` | 2 / debugger |
| T007 | executor | T003, T006 | true | `desktop/src/api/providers.ts`, `desktop/src/stores/providerStore.ts`, `desktop/src/pages/Settings.tsx`, `desktop/src/i18n/locales/en.ts`, `desktop/src/i18n/locales/zh.ts` | workflow dialog precedent, desktop tests | `.env`, server files | modified desktop export UI/API/store/i18n | Do not implement secret export as remembered checkbox; do not expose secret values | implements selected/all secret-free export | UI can trigger secret-free export; store calls API; tests pass | `bun run check:desktop` | 2 / debugger |
| T008 | test-engineer | T002, JP3 | true | `src/server/__tests__/providers.test.ts` | data model, API contract, provider service | `.env`, desktop files | modified server import tests | Do not implement behavior in test task | validates import preview/commit | Tests fail for missing preview/commit, conflict, generated ID, active-state safeguards | `bun test src/server/__tests__/providers.test.ts` | 2 / debugger |
| T009 | executor | T008, T005 | true | `src/server/services/providerService.ts`, `src/server/api/providers.ts`, `src/server/types/provider.ts` if needed | server tests, contract, data model | `.env`, desktop files, user config | modified server import behavior | Do not call activation; do not silently overwrite | implements preview and commit | Preview writes nothing; commit validates and preserves active state | `bun run check:server` | 2 / debugger |
| T010 | test-engineer | T003, JP3 | true | `desktop/src/__tests__/generalSettings.test.tsx` | Settings UI, provider store/API, contract | `.env`, server files | modified desktop UI tests | Do not implement UI behavior in test task | validates import user flow | Tests fail for missing preview dialog, conflict defaults, missing secret diagnostics, commit refresh | `cd desktop && bun run test -- generalSettings` | 2 / debugger |
| T011 | executor | T010 | true | `desktop/src/api/providers.ts`, `desktop/src/stores/providerStore.ts`, `desktop/src/pages/Settings.tsx`, `desktop/src/i18n/locales/en.ts`, `desktop/src/i18n/locales/zh.ts` | workflow dialog precedent, desktop tests, stable API contract | `.env`, server files | modified desktop import UI/API/store/i18n | Do not auto-activate imported providers; do not reveal secrets in diagnostics | implements import preview/commit flow | Preview/commit UI works; provider list refreshes; diagnostics are clear | `bun run check:desktop` | 2 / debugger |
| T012 | test-engineer | T005, JP5 | true | `src/server/__tests__/providers.test.ts` | export route/service, contract | `.env`, desktop files | modified server secret export tests | Do not implement secret export in test task | validates high-friction secret export | Tests fail for missing confirmation rejection and credential-bearing labeling | `bun test src/server/__tests__/providers.test.ts` | 2 / debugger |
| T013 | executor | T012, T005 | true | `src/server/services/providerService.ts`, `src/server/api/providers.ts`, `src/server/types/provider.ts` if needed | server tests, contract | `.env`, desktop files, user config | modified server secret export behavior | Do not make secret export default; do not store confirmation | implements confirmed secret export | Missing confirmation rejected; confirmed bundle contains secrets and label | `bun run check:server` | 2 / debugger |
| T014 | test-engineer | T007, T009, T011 | true | `desktop/src/__tests__/generalSettings.test.tsx` | Settings UI, provider store/API, contract | `.env`, server files | modified desktop secret export tests | Do not implement UI behavior in test task | validates dangerous action UX | Tests fail for missing warning, second confirmation, non-remembered choice | `cd desktop && bun run test -- generalSettings` | 2 / debugger |
| T015 | executor | T014 | true | `desktop/src/pages/Settings.tsx`, `desktop/src/api/providers.ts`, `desktop/src/stores/providerStore.ts`, `desktop/src/i18n/locales/en.ts`, `desktop/src/i18n/locales/zh.ts` | desktop tests, contract | `.env`, server files | modified desktop secret export UI/API/store/i18n | Do not remember include-secrets choice; do not combine with default export | implements secret export dangerous action | UI warning/confirmation path works and choice resets after export/cancel | `bun run check:desktop` | 2 / debugger |
| T016 | build-fixer | JP7 | false | implementation-touched files only | full repo allowed for verification | `.env`, credential files, user config | verification evidence in final handoff; fixes only if checks reveal task-owned issues | Do not lower coverage thresholds; do not normalize unrelated dirty files | validates all operations | `check:server`, `check:desktop`, `check:coverage`, and `verify` pass or blockers are documented | `bun run check:server`; `bun run check:desktop`; `bun run check:coverage`; `bun run verify` | 2 / debugger |

## Consequence Obligation Mapping

| Obligation ID | Task IDs | Affected State / Dependency | Required References | Validation | Stop And Reopen |
| --- | --- | --- | --- | --- | --- |
| CA-001 | T002, T004, T005, T016 | Provider records, export artifact | `plan.md#operational-consequence-design`, contract export section | server redaction tests and final gates | Default export includes credentials |
| CA-002 | T008, T009, T016 | Provider index, managed settings | data model preview, quickstart scenario 3 | preview side-effect tests | Preview writes persistence |
| CA-003 | T002, T008, T009, T016 | `activeId`, managed env | plan active-state invariant | active ID/env unchanged tests | Import changes active provider or env |
| CA-004 | T008, T009, T010, T011, T016 | Existing provider records | data model conflict/resolution | conflict default and explicit overwrite tests | Import silently overwrites |
| CA-005 | T008, T009, T016 | Provider IDs | data model source/local ID rules | generated local ID tests | Imported IDs collide or shadow silently |
| CA-006 | T004, T005, T012, T013, T016 | Provider API/list/export redaction | alignment risk, plan risk | export redaction independent of list shape | Export relies only on frontend masking |
| CA-007 | T012, T013, T014, T015, T016 | Secret export UI and artifact | secret export contract | confirmation/labeling tests | Secret export is casual, remembered, or unlabeled |

## Dependencies

- Phase 0: T001 must complete before all source/test tasks.
- Phase 1: T002 and T003 may run in parallel after T001. JP1 gates all story work.
- US1: T004 and T006 may run in parallel after JP1. T005 depends on T004/T002. T007 depends on T003/T006 and uses the stable API contract, so it can run in parallel with T005. JP3 gates US2 and US3.
- US2: T008 and T010 may run in parallel after JP3. T009 depends on T008/T005. T011 depends on T010 and uses the stable API contract, so it can run in parallel with T009. JP5 gates US3 desktop/server secret export tests.
- US3: T012 and T014 may run in parallel after JP5. T013 depends on T012/T005. T015 depends on T014 and uses the stable API contract, so it can run in parallel with T013. JP7 gates final verification.
- Final: T016 depends on JP7.

## Parallel Batches And Join Points

- Batch B1: T002, T003. Join: JP1.
- Batch B2: T004, T006. Join: JP2.
- Batch B3: T005, T007. Join: JP3.
- Batch B4: T008, T010. Join: JP4.
- Batch B5: T009, T011. Join: JP5.
- Batch B6: T012, T014. Join: JP6.
- Batch B7: T013, T015. Join: JP7.

## Parallel Execution Examples

- After T001, run T002 and T003 in parallel because server and desktop type files have isolated write scopes.
- After JP1, run T004 and T006 in parallel because server tests and desktop store tests have isolated write scopes.
- After JP4, run T009 and T011 in parallel only if T011 uses the contract and test doubles rather than depending on local server runtime.

## Analyze Remediation Mapping

| Finding ID | Disposition | Task/Section Evidence | Notes |
|------------|-------------|-----------------------|-------|
| No prior analyze blockers | not_applicable | First task-generation pass | No remediation mapping required |

## Implementation-Readiness Task Self-Audit

- Buildable `FR-*` coverage: passed. Export, import preview/commit, secret export, conflict handling, active-state non-mutation, generated IDs, UI, and diagnostics all map to tasks.
- Locked decision preservation: passed. `MP-001` through `MP-010` are mapped to guardrails and tasks.
- Guardrail mapping: passed. `G-SEC-REDIRECT`, `G-NO-ACTIVE`, `G-PREVIEW-COMMIT`, `G-CONFLICT`, `G-SECRET-EXPORT`, `G-SCOPE`, and `G-TEST` map to implementation tasks.
- DP1/DP2/DP3 packet readiness: passed for task-generation. Each task has objective, write scope, dependencies, verification commands, forbidden paths, and handoff expectations.
- Reference fidelity mapping: not_applicable. Active profile is `Standard Delivery`, and workflow import/export is precedent only.
- Unmapped tasks: passed. T001 and T016 are justified as guardrail and verification work.
- Write-set conflict status: passed. Parallel batches have isolated write scopes; shared files are sequenced by story phases and join points.

## Handoff Format For Every Task

Each implementation task must hand back:

```json
{
  "status": "success | failed | blocked",
  "changed_files": [],
  "validation_output": {},
  "concerns": [],
  "recovery_hints": []
}
```

Failure handling: retry at most 2 times, then escalate to `debugger` unless the task matrix names a different specialist.
