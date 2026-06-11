# Handoff To Specify: Settings Provider Import Export

- discussion_slug: settings-provider-import-export
- handoff_goal: Specify Settings > Providers import/export for shareable provider configuration bundles, including optional high-friction secret export, previewed import with conflict handling, and no active/default provider transfer.
- created_at: 2026-06-10T13:51:52.7189300+08:00
- self_review_status: passed
- user_confirmation_status: confirmed

## Context Boundary

- current_project_root: `F:\github\cc-jiangxia`
- target_project_root: `F:\github\cc-jiangxia`
- path_status: target-read-confirmed
- boundary_confidence: high
- external_systems: none

### Current Project Roles

| Role | Scope | Evidence Source | Notes |
| --- | --- | --- | --- |
| discussion-host | Store the discussion and handoff artifacts. | User confirmation and current working directory. | Prior Workflows discussions are not the target. |
| implementation-target | Desktop Settings > Providers UI, provider API/store/types, server provider REST API/service/types, provider persistence and managed settings sync. | Live repository reads. | No cross-project transfer requested. |

### Target Project Roles

| Role | Scope | Evidence Source | Notes |
| --- | --- | --- | --- |
| implementation-target | Add provider import/export capability for the current app's Settings provider surface. | User request plus live repository reads. | Sharing is provider-record focused, not local active state transfer. |

## Implementation Target

Target paths or modules expected to be involved:

- `desktop/src/pages/Settings.tsx`
- `desktop/src/api/providers.ts`
- `desktop/src/stores/providerStore.ts`
- `desktop/src/types/provider.ts`
- `desktop/src/lib/providerSettingsJson.ts`
- `src/server/api/providers.ts`
- `src/server/services/providerService.ts`
- `src/server/types/provider.ts`
- `src/server/__tests__/providers.test.ts`
- Desktop provider/settings tests near `desktop/src/__tests__/generalSettings.test.tsx`, `desktop/src/stores/providerStore.test.ts`, or a new same-area provider import/export test.

Target paths still to verify:

- Exact i18n keys and location for new Settings provider dialog text.
- Whether import/export logic should be extracted from `Settings.tsx` into a provider-specific component.

Target project cognition status:

- `blocked`, because `.specify/project-cognition/project-cognition.db` is missing.
- Project cognition is advisory only; live file reads above are the authority for current behavior.

## Source Evidence

| Source Type | Status | Source | Claim |
| --- | --- | --- | --- |
| live_code | verified | `desktop/src/pages/Settings.tsx` | Settings defaults to the providers tab and renders ProviderSettings for provider CRUD/test/activation/delete. |
| live_code | verified | `desktop/src/api/providers.ts` | Provider API wrapper has CRUD/test/settings methods but no provider import/export wrappers. |
| live_code | verified | `desktop/src/stores/providerStore.ts` | Provider store wraps CRUD/test/activation and refreshes connected sessions after provider updates. |
| live_code | verified | `desktop/src/types/provider.ts` | SavedProvider contains credential-bearing `apiKey` plus preset, base URL, API format, model mappings, context windows, and notes. |
| live_code | verified | `src/server/api/providers.ts` | Provider REST API has no import/export routes today. |
| live_code | verified | `src/server/services/providerService.ts` | Providers are persisted in the cc-jiangxia app config providers index; activation syncs provider-managed env into managed settings. |
| live_code | verified | `desktop/src/lib/providerSettingsJson.ts` | Existing helpers mask/restore provider-related secret env values for Settings JSON. |
| live_code | verified | `desktop/src/components/workflow/WorkflowImportExportDialog.tsx` | Existing import/export interaction precedent includes JSON export, preview, diagnostics, conflict handling, and commit. |
| test | verified | `src/server/__tests__/providers.test.ts` | Provider tests cover CRUD, activation sync, active deletion conflict, malformed settings recovery, auth strategies, and proxy behavior. |
| project_cognition | blocked | `.specify/project-cognition/status.json` and lexicon command | Cognition graph is unavailable because the database is missing. |

## Blocking Unknowns

### Hard Unknowns

None for specification entry.

### Soft Unknowns

| ID | Unknown | Owner | Latest Resolve Phase | Stop And Reopen Condition |
| --- | --- | --- | --- | --- |
| SU-001 | Exact UI placement, dialog layout, and warning copy. | downstream-contract | specification | Spec cannot express import/export states or warnings clearly. |
| SU-002 | Raw-vs-masked provider API key behavior conflict. | evidence | implementation design | Export security relies on an unverified frontend masking assumption. |

## Downstream Instructions

Settled decisions to preserve:

- Provider import/export covers saved provider records only.
- Active/default provider selection is excluded from export and import.
- Default export is secret-free.
- Users may choose secret-including export.
- Secret-including export is a separate dangerous action with warning and second confirmation.
- The app must not remember or preselect secret export.
- Secret-bearing export artifacts must be clearly labeled.
- Import uses preview before commit.
- Conflict default is add/rename; overwrite requires explicit selection.
- Import does not auto-activate imported providers or write active-provider env.
- Imported providers should get generated IDs by default.
- Official login/OAuth state is not exported.

Capability map:

- Export selected/all saved provider records.
- Export secret-free bundle by default.
- Export with secrets through high-friction path.
- Parse and validate provider bundle JSON.
- Preview valid, invalid, conflicting, secret-bearing, and secret-missing entries.
- Commit selected import candidates with add/rename/overwrite resolutions.
- Refresh provider list after commit.

Recommended sequence:

1. Define provider bundle schema and redaction semantics.
2. Define server-side export and import preview/commit contracts.
3. Add provider service import/export logic with validation and tests.
4. Add desktop API/store wrappers.
5. Add Settings > Providers UI controls and dialog.
6. Add focused desktop tests for interaction states and warnings.

Deferred scope:

- Encryption/password-protected bundles. User chose high-friction confirmation, not encryption.
- Export/import of official OAuth login state.
- Export/import of active/default provider selection.
- Whole-app settings backup/restore.

Reopen conditions:

- A later artifact makes default export include credentials.
- Secret export becomes a remembered checkbox or unlabeled artifact.
- Import changes active provider selection.
- Import silently overwrites provider records.
- Implementation relies on unresolved API key masking behavior.

## UI Discussion

- ui_discussion_status: deferred
- confirmed_ui_decisions:
  - Provider import/export lives in Settings > Providers.
  - Secret export must not be casual or remembered.
  - Import preview must show conflicts and credential status before commit.
- deferred_ui_decisions:
  - Exact placement of import/export controls.
  - Exact dialog copy.
  - Whether export selected/all is one dialog or separate actions.
- interaction_expectations:
  - Use a preview step before import commit.
  - Display explicit warnings for secret-bearing exports and imports.
  - Avoid revealing secrets in routine diagnostics.
- state_requirements:
  - empty provider list
  - export selected/all
  - export no selection
  - export with secrets confirmation
  - invalid JSON import
  - valid candidates
  - invalid candidates
  - conflicts
  - missing secrets
  - secret-bearing import
  - commit success/failure
- accessibility_expectations:
  - Dialog controls must be keyboard reachable.
  - Warning and error states must be announced in text, not color alone.
- ui_sketches_present: false
- ui_sketch_reference: none

## Must-Preserve Ledger

| ID | Type | Claim | Source | Downstream Requirement | Blocking Level | Owner | Latest Resolve Phase | Status | Deferred To | Stop And Reopen Condition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MP-001 | goal | Add Settings > Providers import/export so provider configurations can be shared with other people. | user request | Spec must center provider configuration sharing. | hard | downstream-contract | specification | mapped | none | Feature becomes unrelated settings backup. |
| MP-002 | scope | Import/export covers saved provider records only. | user discussion | Bundle schema excludes unrelated app state. | hard | downstream-contract | specification | mapped | none | Spec includes chat, MCP, skills, workflows, plugins, or global settings. |
| MP-003 | decision | Users may choose whether to export API keys/secrets. | user confirmation | Spec includes both secret-free and secret-including export paths. | hard | downstream-contract | specification | mapped | none | Secret export is omitted or made default. |
| MP-004 | decision | Secret-free export is the default. | user discussion and risk review | Default export redacts credentials. | hard | downstream-contract | specification | mapped | none | Default export includes API keys or tokens. |
| MP-005 | decision | Secret-including export requires a separate dangerous action, warning, second confirmation, no remembered choice, and clear artifact labeling. | user selected recommendation | Spec must encode high-friction protection. | hard | downstream-contract | specification | mapped | none | Secret export is a remembered checkbox or unlabeled artifact. |
| MP-006 | decision | Import conflicts default to add/rename; overwrite requires explicit selection. | user confirmation | Spec must include previewed conflict resolutions. | hard | downstream-contract | specification | mapped | none | Import silently overwrites an existing provider. |
| MP-007 | non_goal | Active/default provider selection is not exported or imported. | user confirmation | Bundle schema excludes activeId/default selection. | hard | downstream-contract | specification | mapped | none | Import changes active provider selection. |
| MP-008 | scenario | Import uses preview before commit with diagnostics for invalid entries, conflicts, missing secrets, and secret-bearing entries. | discussion and workflow UI precedent | Spec must require side-effect-free preview. | hard | downstream-contract | specification | mapped | none | Import writes during preview or lacks diagnostics. |
| MP-009 | reference | Existing workflow import/export dialog is a useful UI/process precedent, not a domain model to reuse blindly. | live code evidence | Spec may borrow interaction shape while defining provider-specific schema. | soft | evidence | plan | mapped | none | Workflow template semantics leak into provider bundle design. |
| MP-010 | blocking_question | Resolve raw-vs-masked provider API key behavior before claiming export security. | live code/test conflict | Plan or implementation design must verify and handle server-side redaction. | soft | evidence | implementation design | deferred | implementation design | Export security relies only on frontend masking assumptions. |

## Senior Consequence Analysis

- triggered: true
- trigger_reason: Provider import/export can expose credentials by explicit user choice, mutate provider persistence, affect active runtime settings if implemented incorrectly, collide with existing providers, and interact with managed settings preservation.

### Affected Object Map

- Provider records in cc-jiangxia providers index.
- Provider API responses and provider bundle artifacts.
- Active provider ID, by exclusion from import/export.
- cc-jiangxia managed settings env, by ensuring import does not activate or sync env.
- Settings > Providers list, dialogs, and warning states.
- Connected sessions that currently refresh on provider update.
- Provider test/proxy runtime path.

### State-Behavior Matrix

- no providers: export empty/disabled state; import can add providers.
- inactive provider: exportable and importable.
- active provider: provider record exportable, but active selection excluded.
- secret-free export: credentials redacted/omitted and artifact marked secret-free.
- secret export: requires separate action, warning, second confirmation, no remembered choice, and artifact marked credential-bearing.
- import missing secrets: candidate can be imported but requires key before successful test/activation.
- import with secrets: preview indicates credentials present without casually revealing values.
- conflict: default add/rename, overwrite only by explicit selection.
- failed import: no active env change and no partial silent overwrite.

### Dependency Impact Table

| Dependency | Impact | Validation Route |
| --- | --- | --- |
| ProviderService | Needs export, preview, and commit behavior without bypassing validation. | Server unit tests. |
| ManagedSettingsService | Import must not write active provider env. | Server tests asserting settings unchanged. |
| providerStore | Needs import/export actions and refresh after commit. | Store/UI tests. |
| Settings Provider UI | Needs controls, dialogs, warnings, preview, commit states. | Testing Library/Vitest tests. |
| providerSettingsJson helpers | May inform redaction but provider bundle redaction must be server-side too. | Unit tests. |

### Recovery And Validation Contract

- Export is read-only.
- Import preview is side-effect free.
- Import commit is validated server-side.
- Import commit is additive by default.
- Overwrite is explicit and should re-read current provider state.
- Import never changes active/default provider selection.
- Failed import must not mutate managed settings env.
- Tests prove default export redacts secrets and secret export requires explicit flag/path.

### Coverage Gaps

| ID | Gap | Owner | Latest Resolve Phase | Routing Decision | Stop And Reopen Condition |
| --- | --- | --- | --- | --- | --- |
| CG-001 | Project cognition database is missing. | evidence | specification | Continue with live evidence; carry gap. | Spec claims graph-proven ownership without live evidence. |
| CG-002 | Provider API key masking behavior has conflicting evidence. | evidence | implementation design | Resolve before security-ready implementation. | Export security relies only on frontend masking. |

### Consequence Obligations

| ID | Claim | Affected Objects | Owner Workflow | Latest Resolve Phase | Status | Stop And Reopen Condition |
| --- | --- | --- | --- | --- | --- | --- |
| CA-001 | Default export must not include credentials; optional secret export is explicit only. | Provider records, export artifact | sp-specify/sp-plan | specification | mapped | Default export includes secrets. |
| CA-002 | Import preview must be side-effect free. | Provider index, settings env | sp-specify/sp-plan | plan | mapped | Preview writes persistence. |
| CA-003 | Import/export must not carry active/default provider selection or mutate active runtime env. | activeId, managed settings env | sp-specify/sp-plan | specification | mapped | Import changes active provider or active env. |
| CA-004 | Conflict handling defaults to add/rename; overwrite is explicit. | Provider records | sp-specify/sp-plan | tasks | mapped | Import silently overwrites records. |
| CA-005 | New imports use generated IDs by default. | Provider IDs | sp-specify/sp-plan | plan | pending | Imported IDs collide or shadow without preview resolution. |
| CA-006 | Resolve raw-vs-masked API key evidence conflict before claiming security. | Provider API/list/export | sp-specify/sp-plan | implementation design | pending | Export relies on unverified masking. |
| CA-007 | Secret export uses high-friction protection and credential-bearing artifact labeling. | Export UI, artifact | sp-specify/sp-plan | specification | mapped | Secret export is casual, remembered, or unlabeled. |

## Quality Gate

- status: user_confirmed
- self_reviewed_at: 2026-06-10T13:51:52.7189300+08:00
- user_review_required: true
- user_confirmed_at: 2026-06-10T13:58:44.8314216+08:00
- blocked_reasons: []
- coverage_status: live-evidence-with-cognition-gap
- planning_gate_status: handoff-ready
- hard_unknown_count: 0
- open_conflict_count: 1

## Self-Review

- Handoff goal is concrete.
- Context boundary is locked to the current repository.
- Current and target roles are explicit role objects.
- Source evidence includes live code/test paths and cognition gap.
- Hard unknowns are absent for specification entry.
- Soft unknowns have owners, latest resolve phases, and stop/reopen conditions.
- Must-Preserve Ledger includes goal, scope, non-goals, decisions, scenario, reference, and blocking evidence question.
- Senior Consequence Analysis obligations are preserved.
- Markdown and JSON companion were written together.
- User confirmation was received at 2026-06-10T13:58:44.8314216+08:00.
