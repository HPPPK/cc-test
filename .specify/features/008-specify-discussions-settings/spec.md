# Feature Specification: Settings Provider Import Export

**Feature Branch**: `008-specify-discussions-settings`
**Created**: 2026-06-10
**Status**: Review requested
**Input**: User description: ".specify/discussions/settings-provider-import-export/handoff-to-specify.md"

## Overview

### Feature Goal

Add import and export support to Settings > Providers so users can share saved provider configurations with another person or move them to another machine without turning the feature into a whole-app backup/restore system.

The feature must make the safe path easy: default exports do not include credentials. Users may intentionally export credentials only through a separate high-friction path that is clearly labeled and never remembered.

### Intended Users and Value

- **Primary users / roles**: Users who configure custom AI providers in the desktop Settings > Providers surface.
- **Problem or opportunity**: Provider setup contains reusable non-secret configuration such as provider identity, API format, base URL, models, context windows, and notes, but there is no provider-specific sharing workflow.
- **Confirmed product outcome**: A user can export selected or all saved provider records, share the resulting provider bundle, and another user can import it through a preview that validates candidates, explains credential status, handles conflicts, and commits only the chosen changes.

## Confirmed Scope

### In Scope

- Export saved provider records from Settings > Providers as a provider-specific JSON bundle.
- Export selected providers and all saved providers.
- Secret-free export is the default and must remove or redact API keys, auth tokens, OAuth tokens, and equivalent credentials.
- Optional secret-including export is in scope only as a separate dangerous action with warning, second confirmation, no remembered choice, and credential-bearing artifact labeling.
- Import provider bundles through parse, validation, side-effect-free preview, conflict resolution, and explicit commit.
- Import can add providers, rename/add on conflicts by default, skip invalid entries, and overwrite only when the user explicitly chooses overwrite.
- Import refreshes the provider list after commit.
- Import preserves existing provider CRUD, test, activation, and connected-session refresh semantics.

### Out of Scope

- Export/import of active/default provider selection.
- Automatic activation of imported providers.
- Export/import of official Claude login state, OAuth session state, or browser/auth session state.
- Whole-app backup/restore, including chat history, sessions, agents, plugins, skills, MCP config, workflow templates, or unrelated global settings.
- Silent overwrite of existing providers.
- Any import path that directly mutates the original user-owned `~/.claude/settings.json`.

### Deferred Or Future Scope

- Password-protected or encrypted provider bundles. Reopen if users need to share credentials through files in less trusted channels.
- Audit trail or explicit local export history. Reopen if support or compliance workflows require export traceability.
- Import/export of whole application settings. Reopen only as a separate backup/restore feature.
- Provider sharing formats for external apps. Reopen if the bundle needs a public cross-product compatibility contract.

## Must-Preserve Discussion Inputs

- **Source**: `.specify/discussions/settings-provider-import-export/handoff-to-specify.md`
- **Coverage Status**: `live-evidence-with-cognition-gap`
- **Planning Gate Status**: `handoff-ready`

### Mapped Must-Preserve Items

- `MP-001` goal: Add Settings > Providers import/export for shareable provider configuration -> preserved by the feature goal and primary scenarios.
- `MP-002` scope: Saved provider records only -> preserved by In Scope and Out of Scope.
- `MP-003` decision: Users may choose whether to export API keys/secrets -> preserved by secret-free and secret-including export requirements.
- `MP-004` decision: Secret-free export is default -> preserved by FR-004 and CA-001.
- `MP-005` decision: Secret export is a separate dangerous action with warning, second confirmation, no remembered choice, and labeling -> preserved by FR-005 and CA-007.
- `MP-006` decision: Import conflicts default to add/rename; overwrite requires explicit selection -> preserved by FR-012 and CA-004.
- `MP-007` non-goal: Active/default provider selection is not exported or imported -> preserved by Out of Scope, FR-014, and CA-003.
- `MP-008` scenario: Import uses preview before commit with diagnostics -> preserved by Primary Scenario 3 and FR-009 through FR-013.
- `MP-009` reference: Workflow import/export dialog is process precedent, not provider schema source -> preserved by Context and Decision Capture.
- `MP-010` evidence question: Resolve raw-vs-masked provider API key behavior before secure implementation claims -> preserved by Risks, CA-006, and planning stop condition.

### Discussion Conflicts

- `CG-002` / `MP-010`: Frontend type comments say provider API keys are masked from the server, while existing server tests expect raw API keys in provider list responses. This does not block the product specification, but downstream planning and implementation must make export redaction server-owned and must not rely only on frontend masking assumptions.

## Scenarios and Usage Paths

### Primary Scenario - Export A Secret-Free Provider Bundle

A user wants to share provider configuration without sharing their credentials.

**Usage Path**:
1. The user opens Settings > Providers.
2. The user chooses providers to export, or chooses export all saved providers.
3. The app creates a provider bundle that contains reusable provider configuration and excludes credentials by default.
4. The exported artifact clearly indicates that it is secret-free.

**Acceptance Signals**:
- The exported JSON contains provider identity/configuration fields and no API keys, auth tokens, OAuth tokens, or official login state.
- Export is read-only and does not modify providers, active provider selection, or managed settings.
- If no saved providers can be exported, the UI gives an empty or disabled state instead of producing a misleading bundle.

### Primary Scenario - Export With Secrets Intentionally

A user intentionally wants to send a complete provider record, including credentials, to a trusted recipient.

**Usage Path**:
1. The user chooses a separate "export with secrets" path, not the normal default export action.
2. The app shows a warning that the bundle can expose paid or sensitive credentials.
3. The user gives a second confirmation for this export only.
4. The app creates a credential-bearing bundle and labels it clearly as containing secrets.

**Acceptance Signals**:
- Secret export cannot be triggered by a remembered checkbox or previous preference.
- The user must confirm the specific secret export action each time.
- Diagnostics and preview text indicate credential presence without casually revealing secret values.

### Primary Scenario - Import With Preview And Conflict Handling

A user receives a provider bundle and wants to add providers safely.

**Usage Path**:
1. The user chooses import in Settings > Providers and provides a bundle JSON file or JSON content.
2. The app validates bundle structure and provider candidates without writing persistence.
3. The preview shows valid candidates, invalid candidates, conflicts, missing credential status, and credential-bearing status.
4. The user selects import resolutions, with add/rename as the default for conflicts and overwrite only by explicit choice.
5. The user commits the import.
6. The app writes only the selected changes, refreshes the provider list, and leaves active/default provider selection unchanged.

**Acceptance Signals**:
- Preview is side-effect free.
- Invalid candidates are not committed.
- Conflicting providers are not overwritten unless the user explicitly chose overwrite in the preview.
- Imported providers without credentials are visible as needing credentials before successful test or activation.
- Import commit does not activate imported providers or write active-provider environment settings.

### Edge Cases and Failure Paths

- Invalid JSON or unsupported bundle version shows a blocking validation error and writes nothing.
- A partially valid bundle previews valid and invalid entries separately; invalid entries are not selectable for commit.
- A secret-free imported provider can be saved but must require the user to add a key before test/activation can succeed.
- A credential-bearing imported provider previews credential presence without exposing the secret value in routine diagnostics.
- Existing provider ID/name conflicts default to add/rename; overwrite is an explicit per-candidate resolution.
- Commit failure must not silently change active provider selection or active provider managed env.
- Importing from a bundle that includes active/default provider metadata must ignore that metadata and show that active selection is local-only.

## Capability Decomposition

### Capability Map

- **Capability 1: Provider bundle export**
  Supports: secret-free export and intentional secret export scenarios.
  Depends on: saved provider records, provider schema, server-side credential redaction.
  Delivery note: core.

- **Capability 2: Provider bundle validation and import preview**
  Supports: import preview, invalid entry diagnostics, credential status, and conflict resolution.
  Depends on: bundle schema, current provider index, provider identity and name matching rules.
  Delivery note: core.

- **Capability 3: Provider import commit**
  Supports: adding providers, explicit overwrite, generated IDs, and provider list refresh.
  Depends on: validated preview results and server-side commit validation.
  Delivery note: core.

- **Capability 4: Secret-safety and active-state guardrails**
  Supports: default redaction, high-friction secret export, active/default exclusion, and no activation on import.
  Depends on: server-owned export/import behavior and tests that prove no default credential leak.
  Delivery note: validation-oriented.

- **Capability 5: Settings > Providers interaction**
  Supports: user-visible controls, dialogs, warnings, preview, resolution selection, and accessibility.
  Depends on: desktop API/store wrappers and provider UI placement.
  Delivery note: enabling.

### Capability Relationships

- Export schema and import schema must be one contract: a bundle exported by this feature should be importable by the same app version unless the preview reports a clear version incompatibility.
- Import preview and commit must use compatible validation logic; commit must not trust stale client-only preview data.
- Secret handling is not just UI copy. Redaction and inclusion semantics must be enforced on the server side.
- Active/default provider selection is local runtime state and must remain outside every capability.

## Requirements

### Functional Requirements

- **FR-001**: The Settings > Providers surface must expose import and export entry points for saved provider records.
- **FR-002**: The export flow must allow exporting all saved providers and a chosen subset of saved providers.
- **FR-003**: The provider bundle must include reusable non-secret provider configuration: provider preset/source identity, display name, base URL, API format, auth strategy, model mappings, auto compact window when present, model context windows when present, and notes when present.
- **FR-004**: The default export path must exclude or redact all credentials, including API keys, auth tokens, OAuth tokens, and official login state.
- **FR-005**: Secret-including export must be a separate dangerous action that requires a warning, second confirmation, no remembered preference, and a clearly credential-bearing artifact label.
- **FR-006**: Export must not include active/default provider selection.
- **FR-007**: Export must be read-only and must not modify provider persistence, active selection, or managed settings.
- **FR-008**: The import flow must accept provider bundle JSON and reject malformed JSON or unsupported bundle versions without side effects.
- **FR-009**: Import preview must classify candidates as valid, invalid, conflicting, missing credentials, or credential-bearing before commit.
- **FR-010**: Import preview must be side-effect free and must not create, update, delete, activate, or test providers.
- **FR-011**: Import commit must validate candidate resolutions server-side before writing.
- **FR-012**: Conflict handling must default to add/rename and require explicit user selection before overwrite.
- **FR-013**: New imported providers must receive generated local IDs by default.
- **FR-014**: Import commit must not activate imported providers, change active/default provider selection, or write active-provider env settings.
- **FR-015**: After successful import commit, the desktop provider store/list must refresh so new or updated providers are visible.
- **FR-016**: Import and export errors must be shown as actionable diagnostics without revealing credential values unnecessarily.

### Non-Functional Requirements

- Security: Default behavior must prevent credential leakage. Secret export must be explicit, high-friction, and labeled.
- Reliability: Import preview and commit must handle malformed bundles, partial validity, conflicts, and commit failures without corrupting provider state.
- Compatibility: Existing provider CRUD, delete-active conflict, activation sync, provider test, proxy runtime, and connected-session refresh behavior must continue to work.
- Accessibility: Import/export controls and dialogs must be keyboard reachable; warning and error states must not rely on color alone.
- Observability/supportability: Errors should distinguish malformed bundle, unsupported version, invalid candidate, conflict, and commit failure.

### Boundary Constraints

- Provider import/export is scoped to the current cc-jiangxia app and current provider persistence model.
- The existing workflow import/export dialog is a UI/process precedent only; provider bundles require provider-specific schema and validation.
- The raw-vs-masked API key behavior conflict must be resolved by downstream implementation design before claiming secure export behavior.
- Same-area tests are required for production changes in desktop UI/store/API and server provider API/service/types.

## Acceptance Proof

### Acceptance Signals

- Secret-free export of a provider that has an API key produces a bundle with no raw key or token.
- Secret export of the same provider is possible only through the separate dangerous path and the result is labeled credential-bearing.
- Import preview of a mixed bundle shows valid entries, invalid entries, conflicts, missing credentials, and credential-bearing entries before any write occurs.
- Import commit adds providers by default, applies explicit overwrites only when selected, and refreshes the provider list.
- Active/default provider selection and active-provider managed env remain unchanged after import.
- Existing provider CRUD/test/activation behavior remains covered and passing.

### Measurable Success Criteria

- **SC-001**: A user can export at least one saved provider and another user can import it as a new provider without manually editing JSON.
- **SC-002**: Automated tests prove default export never includes stored API keys or auth tokens.
- **SC-003**: Automated tests prove import preview performs no persistence writes.
- **SC-004**: Automated tests prove importing a provider bundle does not change active provider selection or managed active-provider env.
- **SC-005**: Desktop tests cover the warning/confirmation path for secret export and preview/commit path for import.

## Decision Capture

### Locked Decisions

- Use a provider-specific bundle and preview/commit workflow.
- Default export is secret-free.
- Secret-including export is allowed only as a separate high-friction dangerous action.
- Active/default provider selection is not exported or imported.
- Import does not auto-activate providers.
- Conflict default is add/rename; overwrite is explicit.
- New imported providers get generated local IDs by default.
- Workflow import/export is a UI/process precedent, not the provider bundle data model.
- `sp-auto` accepted the single recommended approach and section shape because it preserved all user-confirmed scope and did not defer or drop upstream capability signals.

### User-Confirmed Deferrals

- Encryption/password-protected bundles -> deferred by choosing high-friction confirmation instead -> reopen if credential bundles must be shared through untrusted storage or channels.
- Official OAuth/login state export/import -> excluded by confirmed provider-record scope -> reopen only with a new explicit auth migration requirement.
- Active/default provider selection export/import -> excluded by user confirmation -> reopen if users explicitly request a separate "suggested default" metadata feature that never auto-activates.
- Whole-app backup/restore -> excluded by provider-only scope -> reopen as separate feature.

### Canonical References

- `.specify/discussions/settings-provider-import-export/handoff-to-specify.md`
- `.specify/discussions/settings-provider-import-export/handoff-to-specify.json`
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx` as interaction precedent only.
- `src/server/services/providerService.ts` as current provider persistence and activation-sync authority.
- `src/server/__tests__/providers.test.ts` as current server provider behavior evidence and raw-key conflict evidence.

## Consequence Analysis

### Lifecycle And State Behavior

- `CA-001`: Provider export -> default state -> credentials are excluded/redacted unless the separate secret export action is confirmed.
- `CA-002`: Import preview -> preview state -> parse, validate, classify, and resolve candidates without persistence writes.
- `CA-003`: Active provider state -> import/export state -> active/default selection is never included and import never writes active provider env.
- `CA-004`: Provider conflict -> conflict state -> default add/rename; overwrite requires explicit per-candidate resolution.
- `CA-005`: Imported provider ID -> new import state -> generated local ID by default to avoid machine-local ID collision/shadowing.
- `CA-006`: Provider API key exposure -> implementation design state -> server-owned redaction must be verified before security-ready implementation claims.
- `CA-007`: Secret export artifact -> credential-bearing state -> separate action, warning, second confirmation, no remembered preference, and artifact label.

### Recovery And Validation

- Export rollback is unnecessary because export is read-only.
- Import preview cancellation must leave provider persistence and active settings unchanged.
- Import commit must validate resolutions server-side and fail without silent overwrite or active env mutation.
- If overwrite is supported, commit should re-read current provider state or otherwise detect stale conflict assumptions before replacing data.
- Verification must include server tests for schema, redaction, preview side effects, conflict handling, active-state non-mutation, and commit behavior, plus desktop tests for UI state and warnings.

## Risks and Gaps

### Planning Risks

- The existing provider list may currently expose raw API keys despite frontend comments about masking. Implementation must not build export safety on that assumption.
- Exact UI placement and extraction boundaries are not locked; planning should choose the least disruptive Settings > Providers placement while covering all required states.
- Secret-bearing export is intentionally supported but inherently risky; warnings and tests must prove it is never the default.

### Information Gaps

- `CG-001`: Project cognition is blocked because `.specify/project-cognition/project-cognition.db` is missing. This spec proceeds with live repository evidence.
- `CG-002`: Raw-vs-masked provider API key behavior needs implementation-design resolution before claiming secure provider export behavior.
- Exact i18n keys, dialog component split, and wording remain downstream UI design details as long as the warning, confirmation, preview, conflict, and accessibility requirements remain intact.
