# Alignment: Settings Provider Import Export

**Feature Branch**: `008-specify-discussions-settings`
**Created**: 2026-06-10
**Status**: Aligned for user review
**Routed By**: `$sp-auto` -> canonical `/sp.specify`

## Current Understanding

The user wants Settings > Providers to support import/export of saved provider configurations so those configurations can be shared. The scope is provider records, not whole-app settings or local runtime selection. Default export is secret-free. Users can choose a secret-including export only through a high-friction dangerous path. Import is previewed before commit, additive by default, and does not activate providers.

## Auto Continuation Decision

- `sp-auto` routed to `/sp.specify` from `.specify/features/008-specify-discussions-settings/workflow-state.md`.
- The pending stop was a bounded approach/section-shape confirmation with one explicit recommended option.
- `auto_default_recommendation: true` accepted the recommended server-owned bundle + preview/commit approach and the proposed section shape.
- This auto-acceptance did not authorize any new secret-sharing behavior; it preserved the already confirmed safe-default secret policy from the discussion handoff.
- Native subagent tools were discoverable, but `spawn_agent` is unsafe to use in this runtime unless the user explicitly asks for subagents. This pass continued locally and recorded the degraded dispatch surface.

## Semantic Term Decisions

- Term: provider configuration
  - Possible Meanings: saved provider records; active runtime provider selection; whole app settings backup.
  - Selected Meanings: saved provider records with reusable provider fields.
  - Excluded Meanings: active/default provider selection and whole-app backup.
  - User Confirmation: confirmed through discussion and `MP-002`, `MP-007`.

- Term: export
  - Possible Meanings: secret-free shareable bundle; credential-bearing bundle; raw settings JSON snapshot.
  - Selected Meanings: secret-free bundle by default; credential-bearing bundle only through separate dangerous action.
  - Excluded Meanings: raw settings JSON-only export as the primary product shape.
  - User Confirmation: confirmed through `MP-003`, `MP-004`, `MP-005`.

- Term: import
  - Possible Meanings: preview then commit; direct write; auto-activate imported provider.
  - Selected Meanings: side-effect-free preview, explicit commit, no activation.
  - Excluded Meanings: direct write and auto-activation.
  - User Confirmation: confirmed through `MP-006`, `MP-007`, `MP-008`.

- Term: selected/default provider
  - Possible Meanings: local active provider state; provider record included in export selection.
  - Selected Meanings: export selection may choose provider records; local active/default state is not transferred.
  - Excluded Meanings: importing active/default provider state.
  - User Confirmation: user stated selected state does not need export/import; preserved by `MP-007`.

- Term: secrets
  - Possible Meanings: API keys; auth tokens; OAuth/login state; other credential-bearing fields.
  - Selected Meanings: API keys and auth tokens are credentials; OAuth/login state is excluded entirely.
  - Excluded Meanings: official OAuth/login state migration.
  - User Confirmation: confirmed by secret export policy and non-goals.

## Approach Comparison

### Approach A - Recommended: Server-Owned Provider Bundle With Preview/Commit

- Product fit: Best fit. It gives users provider sharing while preserving safe defaults and explicit secret handling.
- Implementation risk: Moderate because API/service/UI tests are required, but boundaries are clear.
- User-visible trade-off: Slightly more structured workflow, but clearer warnings, diagnostics, and conflict handling.
- Compatibility impact: Preserves provider persistence as source of truth and avoids active/default state transfer.
- Verification implication: Server tests can prove redaction, preview side effects, conflict handling, and active-state non-mutation.
- Decision: selected and locked.

### Approach B - Client-Only Settings JSON Import/Export

- Product fit: Poor fit. It shares env-shaped settings rather than provider records.
- Implementation risk: Looks small but pushes validation and redaction risk into the UI.
- User-visible trade-off: More manual and confusing for multi-provider sharing.
- Compatibility impact: Risks blurring provider config with unrelated settings and active runtime state.
- Verification implication: Harder to prove no secret leakage or no active-state mutation.
- Decision: dropped as primary approach; helper ideas may be reused.

### Approach C - Full Backup Or Encrypted Bundle

- Product fit: Larger than the confirmed requirement.
- Implementation risk: High because it introduces encryption/password UX or whole-app restore semantics.
- User-visible trade-off: More powerful but slower to deliver and easier to misunderstand as a complete migration tool.
- Compatibility impact: Crosses into sessions, settings, plugins, MCP, or auth state unless tightly constrained.
- Verification implication: Requires broader security, recovery, and migration tests.
- Decision: deferred.

## Upstream Intent Disposition

| ID | Signal | Source | Disposition | Artifact Location | User Confirmed | Reopen Trigger |
| --- | --- | --- | --- | --- | --- | --- |
| MP-001 | Add provider import/export for sharing | user request | in_scope | `spec.md#overview` | yes | Feature becomes unrelated backup/restore |
| MP-002 | Saved provider records only | discussion | preserved | `spec.md#confirmed-scope` | yes | Scope adds unrelated settings |
| MP-003 | User can choose whether to export secrets | user confirmation | preserved | `spec.md#requirements` | yes | Secret export omitted or made default |
| MP-004 | Secret-free export is default | discussion/risk review | preserved | `spec.md#requirements` | yes | Default export includes credentials |
| MP-005 | Secret export high-friction | user selected recommendation | preserved | `spec.md#requirements` | yes | Secret export remembered/casual/unlabeled |
| MP-006 | Conflict default add/rename, overwrite explicit | user confirmation | preserved | `spec.md#requirements` | yes | Import silently overwrites |
| MP-007 | Active/default provider selection excluded | user confirmation | preserved | `spec.md#confirmed-scope` | yes | Import changes active provider |
| MP-008 | Import preview with diagnostics before commit | discussion/reference | preserved | `spec.md#scenarios-and-usage-paths` | yes | Preview writes or hides diagnostics |
| MP-009 | Workflow import/export is process precedent only | live evidence | preserved | `context.md#existing-patterns-and-reuse-notes` | yes | Workflow schema leaks into provider bundle |
| MP-010 | Raw-vs-masked API key conflict must be resolved | live code/test conflict | deferred | `spec.md#risks-and-gaps` | yes, as downstream evidence gap | Export relies only on frontend masking |

## Out-Of-Scope Conflicts

- Whole-app backup/restore conflicts with provider-only sharing. It is out of scope and must reopen as a separate feature.
- Active/default provider selection transfer conflicts with user-confirmed local-only selection. It is out of scope and must not be implied by bundle metadata.
- Official OAuth/login state export conflicts with the saved-provider-record boundary and secret-safety constraints. It is out of scope.
- Default credential export conflicts with the confirmed safe default. It is blocked unless the feature is reopened upstream.

## Confirmed Facts

- Settings > Providers currently supports provider CRUD/test/activation/delete but not import/export.
- Provider records include credential-bearing fields.
- ProviderService persists providers in the cc-jiangxia app config providers index.
- Provider activation syncs active provider env into managed settings.
- Workflow import/export provides useful UI/process precedent.
- Project cognition is blocked because `.specify/project-cognition/project-cognition.db` is missing.

## Assumptions

- A provider bundle should be versioned so future import can reject unsupported formats cleanly.
- Exact import/export control placement can be resolved during planning/UI design as long as Settings > Providers remains the product surface.
- Imported providers without secrets can be saved and later completed by the receiving user.
- Server-side validation/redaction is required even if desktop UI masks secrets.

## Open Questions And Known Risks

- Raw-vs-masked provider API key behavior is a downstream implementation-design blocker for secure completion claims.
- Exact dialog copy and i18n keys remain implementation details.
- Project cognition coverage is unavailable; live repository evidence is the authority for this specification.

## Readiness Decision

- Source-file sweep status: complete for discussion sources and targeted live repository evidence.
- Source-signal disposition status: complete.
- Hard unknown count: 0.
- Open conflict count: 1 soft evidence conflict, deferred to implementation design with stop-and-reopen condition.
- Readiness: Aligned for user review; if the user confirms, the single next command is `/sp.plan`.
