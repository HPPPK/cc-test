# Planning Context: Settings Provider Import Export

**Feature Branch**: `008-specify-discussions-settings`
**Created**: 2026-06-10
**Status**: Ready for user review
**Derived From**: `spec.md`, `alignment.md`, discussion sources, and targeted live repository evidence

## Planning Context

- Planning boundary: provider import/export for Settings > Providers only.
- Current readiness: artifact package is self-reviewed and ready for user review; if the user confirms the artifacts, the single next command is `/sp.plan`.
- Primary safety invariant: default export is secret-free; optional secret export is a separate high-friction path.
- Primary state invariant: active/default provider selection is local runtime state and is not exported, imported, or applied during import.

## Relevant Repository Context

- Desktop provider UI currently lives in `desktop/src/pages/Settings.tsx`.
- Desktop provider API wrapper currently lives in `desktop/src/api/providers.ts`.
- Desktop provider store currently lives in `desktop/src/stores/providerStore.ts`.
- Desktop provider types currently live in `desktop/src/types/provider.ts`.
- Server provider routes currently live in `src/server/api/providers.ts`.
- Provider persistence and activation sync currently live in `src/server/services/providerService.ts`.
- Provider schemas currently live in `src/server/types/provider.ts`.
- Current same-area server provider tests live in `src/server/__tests__/providers.test.ts`.

## Existing Patterns And Reuse Notes

- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx` is a useful interaction precedent for export, preview, diagnostics, conflict handling, and commit.
- Workflow template import/export is not a provider schema source. Provider bundles need provider-specific fields, redaction semantics, and server-side validation.
- `desktop/src/lib/providerSettingsJson.ts` masks and restores provider-related secret env values for the Settings JSON editor. That pattern can inform UI treatment, but provider bundle export must not depend only on frontend masking.
- Existing provider behavior includes CRUD, active deletion conflict, activation syncing managed provider env, provider testing, and proxy provider lookup. Those behaviors must remain compatible.

## Integration Boundaries

- Export reads provider records and produces a JSON artifact; it must not write provider persistence or active settings.
- Import preview reads a bundle and current provider state; it must not write provider persistence or active settings.
- Import commit writes selected provider changes only after server-side validation.
- Import commit refreshes the provider list but does not activate imported providers.
- Secret export crosses a credential trust boundary and must be treated as a dangerous action.

## Product Boundary Constraints

- Do not broaden this into whole-app backup/restore.
- Do not export or import official OAuth/login state.
- Do not export or import active/default provider selection.
- Do not mutate user-owned `~/.claude/settings.json` as part of provider import.
- Same-area tests are required for production changes under desktop provider UI/store/API and server provider API/service/types.

## Affected Object Map

Obligation ID: CA-001
Object / State Surface: Provider records and export artifact
Owner: provider service and Settings provider UI
Consumers: import flow, users receiving bundles, tests
Evidence: `src/server/services/providerService.ts`, `desktop/src/types/provider.ts`
Coverage Gap: raw-vs-masked API key behavior must be resolved in implementation design

Obligation ID: CA-002
Object / State Surface: Import preview state
Owner: provider API/service and desktop import dialog
Consumers: import commit, provider persistence
Evidence: workflow import/export preview precedent, provider service persistence
Coverage Gap: exact API shape remains planning work

Obligation ID: CA-003
Object / State Surface: `activeId` and managed settings env
Owner: provider service activation sync
Consumers: provider runtime, proxy path, connected sessions
Evidence: `ProviderService` activation behavior and handoff evidence
Coverage Gap: tests must assert import does not mutate active env

Obligation ID: CA-004
Object / State Surface: Existing provider records
Owner: provider service import commit
Consumers: provider list, tests, user configs
Evidence: provider persistence and active deletion conflict tests
Coverage Gap: conflict identity rules need planning detail

Obligation ID: CA-005
Object / State Surface: Provider IDs
Owner: provider service import commit
Consumers: provider store and provider list
Evidence: ProviderService currently creates provider IDs
Coverage Gap: generated-ID contract needs implementation validation

Obligation ID: CA-006
Object / State Surface: Provider API responses and export redaction
Owner: provider service/API
Consumers: desktop provider store, export flow
Evidence: frontend `SavedProvider.apiKey` comment conflicts with server test expectation
Coverage Gap: implementation must verify and correct redaction/list behavior

Obligation ID: CA-007
Object / State Surface: Secret export UI and credential-bearing artifact
Owner: Settings provider UI and export API
Consumers: users, support diagnostics, tests
Evidence: user-confirmed high-friction secret export requirement
Coverage Gap: exact warning copy and i18n keys are downstream UI details

## Consequence Notes

- `CA-001`: Default provider export must not leak credentials. Planning must define bundle schema and redaction before implementation tasks.
- `CA-002`: Preview is not a dry run if it writes state. Planning must keep preview and commit contracts separate.
- `CA-003`: Active runtime state is excluded. Any design that applies active/default provider metadata must reopen scope.
- `CA-004`: Conflict overwrite is dangerous. Tasks must include explicit resolution handling and tests.
- `CA-005`: Imported IDs should be local. Tasks must avoid blindly importing machine-local IDs.
- `CA-006`: Server-owned redaction is mandatory. Tasks must resolve raw/masked evidence conflict before claiming secure implementation.
- `CA-007`: Secret export must not become a remembered checkbox. UI and tests must preserve high-friction behavior.

## Dependency Impact Table

Obligation ID: CA-001
Upstream / Downstream Surface: ProviderService -> export API -> desktop export UI
Impact: Security boundary for credential leakage
Required Handling: Server-side redaction and tests for default export

Obligation ID: CA-002
Upstream / Downstream Surface: import preview API -> import commit API
Impact: Prevents preview from mutating provider persistence
Required Handling: Separate preview/commit contracts and side-effect tests

Obligation ID: CA-003
Upstream / Downstream Surface: ProviderService active sync -> managed settings -> runtime proxy
Impact: Import must not change runtime provider selection
Required Handling: Active selection excluded from schema and commit tests assert unchanged state

Obligation ID: CA-004
Upstream / Downstream Surface: provider index -> conflict preview -> commit resolution
Impact: Prevents silent overwrite
Required Handling: Default add/rename and explicit overwrite

Obligation ID: CA-006
Upstream / Downstream Surface: provider list API -> desktop store -> export flow
Impact: Raw credentials in routine responses could invalidate security assumptions
Required Handling: implementation design must make export redaction server-owned and verify list behavior

## Change Propagation Matrix

Change Surface: Server provider API
Upstream Inputs: provider index, bundle JSON, user-selected resolutions
Downstream Consumers: desktop API/store/UI, server tests
Constraint / Risk: route contracts must preserve secret redaction and active-state non-mutation

Change Surface: ProviderService
Upstream Inputs: saved providers, active provider state, managed settings service
Downstream Consumers: provider API, proxy runtime, desktop provider store
Constraint / Risk: import commit must not bypass validation or active sync rules

Change Surface: Desktop Settings provider UI
Upstream Inputs: export target selection, import bundle, preview result, confirmations
Downstream Consumers: user actions, accessibility expectations, desktop tests
Constraint / Risk: warning states and conflict resolutions must be visible before commit

Change Surface: Provider bundle artifact
Upstream Inputs: export options and provider schema
Downstream Consumers: import validation, shared users
Constraint / Risk: versioning and secret-bearing labels must be clear

## Locked Decisions Carry-Forward

- Provider bundles include saved provider records only.
- Default export is secret-free.
- Secret export is optional but high-friction.
- Active/default provider selection is excluded.
- Import preview is side-effect free.
- Import commit is additive by default.
- Overwrite requires explicit selection.
- New imports use generated local IDs by default.
- Server-side redaction is required; frontend masking is not enough.

## Must-Preserve Carry-Forward

- `MP-001`: Provider configuration sharing is the product goal.
- `MP-002`: Scope is saved provider records only.
- `MP-003`: Users may choose whether to include secrets.
- `MP-004`: Default export is secret-free.
- `MP-005`: Secret export is a dangerous separate action with second confirmation, no remembered choice, and artifact labeling.
- `MP-006`: Conflict default is add/rename; overwrite is explicit.
- `MP-007`: Active/default selection is not transferred.
- `MP-008`: Import preview must show diagnostics before commit.
- `MP-009`: Workflow import/export is only a process precedent.
- `MP-010`: Raw-vs-masked key conflict must be resolved before secure implementation claims.

Stop-and-reopen conditions:

- Default export includes credentials.
- Secret export is casual, remembered, or unlabeled.
- Import changes active/default provider selection.
- Import silently overwrites a provider.
- Implementation relies only on frontend masking for export safety.
- Provider-only scope expands into whole-app backup/restore without user confirmation.

## Canonical References

- `.specify/discussions/settings-provider-import-export/handoff-to-specify.md`
- `.specify/discussions/settings-provider-import-export/handoff-to-specify.json`
- `.specify/discussions/settings-provider-import-export/requirements.md`
- `.specify/discussions/settings-provider-import-export/technical-options.md`
- `.specify/discussions/settings-provider-import-export/project-context.md`
- `.specify/discussions/settings-provider-import-export/open-questions.md`
- `.specify/discussions/settings-provider-import-export/discussion-log.md`
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- `src/server/services/providerService.ts`
- `src/server/__tests__/providers.test.ts`

## Outstanding Questions

- Exact import/export control placement, dialog component split, and warning copy are downstream UI design details.
- Raw-vs-masked provider API key behavior must be resolved during planning/implementation design before security-ready implementation claims.

## Deferred / Future Ideas

- Password-protected or encrypted bundles.
- Official OAuth/login state migration.
- Whole-app settings backup/restore.
- Public provider bundle compatibility format for other applications.
