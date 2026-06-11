# Data Model: Settings Provider Import Export

## Overview

The import/export feature uses a provider-specific bundle model separate from the persisted provider index. The bundle may carry source metadata for diagnostics, but new imports generate local IDs and never transfer active/default provider selection.

## Entity: ProviderBundle

- `schemaVersion`: number. First version is `1`.
- `kind`: literal `cc-jiangxia-provider-bundle`.
- `exportedAt`: ISO timestamp string.
- `app`: optional metadata for product/version when available.
- `containsSecrets`: boolean. `false` for default export, `true` for explicit secret export.
- `providers`: array of `ProviderBundleProvider`.

Validation:

- Unknown `kind` or unsupported `schemaVersion` blocks import.
- `containsSecrets` must match the credential payload state. A bundle marked secret-free must not include credential values.
- Active/default provider fields are not part of this entity.

## Entity: ProviderBundleProvider

- `sourceProviderId`: string, optional diagnostic/source metadata.
- `name`: string.
- `presetId`: string.
- `baseUrl`: string.
- `apiFormat`: `anthropic`, `openai_chat`, or `openai_responses`.
- `authStrategy`: provider auth strategy when present.
- `models`: model mapping with at least `main`.
- `autoCompactWindow`: optional number.
- `modelContextWindows`: optional model-to-window map.
- `notes`: optional string.
- `credential`: `ProviderBundleCredential`.

Validation:

- Must contain enough non-secret fields to create or update a provider.
- Source IDs are never used as local IDs for default add/import.
- `models.main` is required.
- Invalid candidate remains previewable as an invalid entry but cannot be selected for commit.

## Entity: ProviderBundleCredential

- `status`: `redacted`, `present`, or `missing`.
- `apiKey`: optional string, only allowed when `status` is `present` and `ProviderBundle.containsSecrets` is `true`.

Rules:

- Secret-free export writes `status: redacted` or `missing` and omits raw credential values.
- Secret export may write `status: present` with the current credential value.
- Import diagnostics may show credential status but must not reveal the credential value.
- Official OAuth/login state is never represented.

## Entity: ProviderImportPreview

- `bundle`: summary of version, provider count, and `containsSecrets`.
- `candidates`: array of `ProviderImportCandidate`.
- `errors`: bundle-level validation errors.
- `canCommit`: boolean.

Rules:

- Preview is side-effect free.
- Preview does not reserve IDs.
- Preview classifies all parseable candidates, including invalid ones.

## Entity: ProviderImportCandidate

- `candidateId`: stable ID within the preview response, derived from candidate position or source ID for client selection only.
- `sourceProviderId`: optional source ID from bundle.
- `name`: candidate display name.
- `credentialStatus`: `redacted`, `present`, or `missing`.
- `valid`: boolean.
- `diagnostics`: array of validation or warning messages.
- `conflict`: optional `ProviderImportConflict`.
- `defaultResolution`: `add`, `rename`, `skip`, or `overwrite`.
- `suggestedName`: optional string for rename/add resolution.

Rules:

- Candidates with invalid required fields cannot be committed.
- Candidate diagnostics never include raw secret values.
- Default conflict resolution is add/rename, not overwrite.

## Entity: ProviderImportConflict

- `type`: `name`, `id`, or `equivalent-config`.
- `targetProviderId`: local provider ID when an existing provider is involved.
- `targetProviderName`: local provider name when available.
- `reason`: human-readable diagnostic.

Rules:

- `id` conflict does not imply overwrite for new imports.
- Overwrite requires explicit `targetProviderId`.
- Name conflicts should produce a suggested unique name.

## Entity: ProviderImportResolution

- `candidateId`: candidate identifier from preview.
- `action`: `add`, `rename`, `overwrite`, or `skip`.
- `name`: required for `rename`; optional for `add` when the client accepts a suggested name.
- `targetProviderId`: required for `overwrite`.

Validation:

- `overwrite` is valid only when a target local provider exists and the request explicitly selects overwrite.
- `add` and `rename` always generate a new local provider ID.
- `skip` writes nothing for that candidate.

## Entity: ProviderImportCommitResult

- `created`: array of saved provider summaries.
- `updated`: array of saved provider summaries.
- `skipped`: array of candidate IDs and reasons.
- `errors`: array of candidate or commit errors.
- `providers`: refreshed provider list, or a signal that the client should refetch.
- `activeId`: unchanged active provider ID.

Rules:

- Commit revalidates the bundle and current provider state before writing.
- Commit does not activate providers.
- Commit does not write active provider managed env.

## Persistence Notes

- Existing provider persistence remains the source of truth.
- Bundle import should use existing ProviderService write path or equivalent atomic write behavior.
- Unknown provider index fields, if any, must not be lost by unrelated code changes.
- Import errors should avoid partial silent overwrite. If partial success is supported, the result must explicitly list created/updated/skipped/errors.

## Redaction Notes

- The server must construct secret-free bundles from raw provider state and remove credential values before response.
- The desktop may additionally mask display text, but desktop masking is not trusted for export safety.
- Logs, diagnostics, and test snapshots must not include real-looking secrets except controlled fixture strings in tests.
