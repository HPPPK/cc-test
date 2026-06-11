# Technical Options: Settings Provider Import Export

## Verified Project Facts

- Provider API/client/store currently support list, presets, auth status, settings get/update, create, update, delete, activate, activate official, and test. They do not expose provider import/export today.
- Providers are persisted under the cc-jiangxia app config providers index, and active provider activation syncs provider-managed env into cc-jiangxia managed settings.
- Provider objects include API keys/tokens. This makes export a security-sensitive feature.
- Existing workflow import/export UI demonstrates preview, selected export, import candidate diagnostics, conflict resolution, and commit flow.

## Option 1: Secret-Free Provider Bundle (Recommended)

Product behavior:
Export a JSON bundle of selected/all non-official saved providers with secrets removed. Import previews candidates, validates them, lets users add/rename/overwrite, and marks imported providers as needing credentials before test/activation.

Why this fits:
It satisfies sharing while avoiding the highest-risk failure mode: accidentally giving someone your API key. It matches the existing UI pattern of preview-before-commit.

Likely impacted surfaces:
- desktop provider API wrapper and store
- Settings > Providers UI
- server provider API and service
- provider type/schema definitions
- provider tests and desktop tests

Compatibility:
Existing provider index remains the persistence source. Imported providers should use generated IDs unless the user chooses overwrite. Active/default provider selection is not part of the import/export package.

Confirmed conflict behavior:
Import conflicts default to add/rename. Overwrite must be explicitly selected in preview.

Testing strategy:
Server tests for export redaction, import preview validation, conflict handling, commit behavior, active-provider non-mutation, and malformed payload handling. Desktop tests for dialog flow, warning states, and store refresh.

Risks:
Users may expect a fully working provider after import but still need to paste an API key. This must be explicit in the preview and provider card state.

Rollback/recovery:
Import should be additive by default and should support cancel before commit. Overwrite should re-read current provider state before write and report conflicts.

## Option 2: Secret-Including Export With Explicit Dangerous Mode

Product behavior:
Default remains secret-free, but an advanced export mode can include API keys after a strong warning and second confirmation.

Why this might fit:
It supports private team sharing where the same key is intentionally distributed.

Compatibility:
Requires a stronger export contract, redaction controls, visible danger copy, and likely audit-worthy tests proving secrets are excluded unless explicitly requested.

Confirmed scope:
The user confirmed that choosing whether to export keys should be supported.

Confirmed protection level:
Use the recommended pattern: separate "export with secrets" action, warning, second confirmation, no remembered choice, and clear credential-bearing artifact labeling.

Testing strategy:
Everything in Option 1 plus tests that default export never includes secrets, secret export requires explicit flag/confirmation, and UI copy cannot accidentally default to including keys.

Risks:
High. Users may leak paid API credentials. Shared bundles can be forwarded. Screenshots/logs/clipboard can capture secrets.

Recommendation:
Include this as a separate "export with secrets" dangerous path. Do not make it a normal checkbox that can stay selected across exports.

## Option 3: Import/Export Existing Settings JSON Only

Product behavior:
Lean on the existing Settings JSON editor: users copy/paste env-shaped JSON and the form parses it.

Why it is smaller:
The project already has provider settings JSON helpers and masking tests.

Risks:
This is not a good match for the product goal. It shares runtime env snapshots rather than provider records, does not naturally support multiple providers, conflict handling, active-provider metadata, or reusable provider bundles. It can also blur provider config with unrelated settings.

Recommendation:
Do not choose as the main solution. Reuse the JSON helper ideas, not the user-facing shape.

## Senior Consequence Analysis

### Affected Object Map

- Provider records in cc-jiangxia providers index.
- Active provider ID.
- cc-jiangxia managed settings env written during activation.
- Settings > Providers user-visible list, modals, tests, and error states.
- Connected sessions whose runtime selection is refreshed after provider updates.
- Provider test/proxy runtime path.
- Exported JSON bundle as a shareable artifact.
- Import preview candidates, conflicts, and invalid entries.

### State-Behavior Matrix

- missing provider index: export returns empty custom provider list; import can create the index.
- malformed provider index: existing recovery behavior should remain; import/export must not make recovery worse.
- no saved providers: export shows empty or disabled state.
- inactive provider: exportable; import overwrite is allowed only with explicit resolution.
- active provider: provider record is exportable, but active/default selection is not exported and import must not activate it.
- imported without API key: saved as incomplete or credential-needed; test should fail clearly until a key is provided.
- conflict with existing provider: preview must show add/rename/overwrite choices; default should be rename/add, not overwrite.
- partially invalid bundle: valid candidates remain previewable; invalid entries are shown and not selectable.
- failed commit: existing providers and active settings should remain unchanged or be recoverable.

### Dependency Impact Table

- `ProviderService` persistence: add import/export without bypassing validation, ID generation, or active-provider rules.
- `ManagedSettingsService` sync: import should not write provider env unless user activates a provider.
- `providerStore`: import commit should refresh providers and preserve runtime refresh semantics for updates.
- `Settings.tsx` provider UI: add controls/dialog without disrupting existing create/edit/test/delete.
- `providerSettingsJson` helpers: can inform redaction, but provider bundles need provider-record redaction too.
- Workflow import/export UI: reusable interaction precedent, not a shared domain model.
- Tests: server provider tests and desktop provider/settings tests must cover security and conflict behavior.

### Recovery And Validation Contract

- Export must redact secrets unless an explicit, user-confirmed dangerous mode is chosen.
- Secret-including exports must be visibly labeled as containing credentials.
- Import preview must be side-effect free.
- Commit must validate payload shape and candidate resolutions server-side.
- Commit should be additive by default and must not change active-provider selection.
- Overwrite should detect current-state conflicts or at least re-read before write.
- Failed import should not leave active settings env changed.
- Tests must prove no default secret leak.

### Coverage Gaps

- CG-001: Project cognition database is missing, so navigation coverage is incomplete. Routing decision: current discussion may continue with live evidence; handoff should carry the coverage gap unless cognition is rebuilt later.
- CG-002: There is an evidence conflict between the frontend `apiKey` masking comment and server tests expecting raw API key in provider list responses. Routing decision: downstream must resolve before implementation finalizes export security behavior.

### Consequence Obligations

- CA-001: Default provider export must not include API keys, auth tokens, OAuth tokens, or official login state. Optional secret-including export is allowed only after explicit user choice. Owner workflow: sp-specify/sp-plan. Latest resolve phase: spec acceptance criteria. Status: pending. Stop-and-reopen condition: any proposed default export includes secrets or remembers the secret-export choice.
- CA-002: Import preview must be side-effect free and must not write providers or settings before explicit commit. Owner workflow: sp-specify/sp-plan. Latest resolve phase: plan. Status: pending. Stop-and-reopen condition: preview route mutates persistence.
- CA-003: Import/export must not carry active/default provider selection and import commit must not mutate active runtime env. Owner workflow: sp-specify/sp-plan. Latest resolve phase: spec. Status: mapped. Stop-and-reopen condition: imported provider metadata changes active provider selection or writes active-provider env during import.
- CA-004: Conflict handling must be explicit for existing providers; default resolution is add/rename and overwrite cannot be silent. Owner workflow: sp-specify/sp-plan. Latest resolve phase: tasks. Status: mapped. Stop-and-reopen condition: import replaces records based only on matching ID/name.
- CA-005: Provider ID semantics must avoid sharing machine-local IDs by default; generated IDs should be used for new imports. Owner workflow: sp-specify/sp-plan. Latest resolve phase: plan. Status: pending. Stop-and-reopen condition: imported IDs can collide or shadow without preview resolution.
- CA-006: The raw-vs-masked API key evidence conflict must be resolved before declaring the implementation secure. Owner workflow: sp-specify/sp-plan. Latest resolve phase: implementation design. Status: pending. Stop-and-reopen condition: export or list behavior relies on an unverified masking assumption.
- CA-007: Secret-including export must use the confirmed high-friction protection pattern: separate action plus warning and second confirmation; no remembered choice; exported artifact clearly identifies that it contains credentials. Owner workflow: sp-specify/sp-plan. Latest resolve phase: specification. Status: mapped. Stop-and-reopen condition: secret export is implemented as a casual remembered checkbox or produces an unlabeled credential-bearing artifact.
