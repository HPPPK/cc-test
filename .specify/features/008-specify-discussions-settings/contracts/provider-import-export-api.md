# Contract: Provider Import Export API

## Scope

This contract extends the existing `/api/providers` surface. Endpoint names may be adjusted during implementation, but the behavior and safety rules are binding for tasks.

## POST /api/providers/export

Secret-free export path.

### Request

```json
{
  "providerIds": ["provider-id"],
  "all": false
}
```

Rules:

- `providerIds` selects specific saved providers.
- `all: true` exports all saved providers and ignores empty `providerIds`.
- Request does not include `includeSecrets`.
- Empty selection returns a validation error or an empty export state, not a misleading bundle.

### Response

```json
{
  "bundle": {
    "schemaVersion": 1,
    "kind": "cc-jiangxia-provider-bundle",
    "exportedAt": "2026-06-10T00:00:00.000Z",
    "containsSecrets": false,
    "providers": []
  }
}
```

Required behavior:

- Response must not include raw API keys, auth tokens, OAuth tokens, or official login state.
- Export is read-only.
- Active/default provider selection is excluded.

## POST /api/providers/export-with-secrets

Credential-bearing export path.

### Request

```json
{
  "providerIds": ["provider-id"],
  "all": false,
  "confirmation": {
    "acknowledgedCredentialExposure": true
  }
}
```

Required behavior:

- The endpoint rejects missing or false confirmation.
- The endpoint does not store a remembered preference.
- The returned bundle sets `containsSecrets: true`.
- The returned artifact metadata clearly identifies that credentials are present.
- Official OAuth/login state remains excluded.

## POST /api/providers/import/preview

Side-effect-free validation and diagnostics.

### Request

```json
{
  "bundle": {
    "schemaVersion": 1,
    "kind": "cc-jiangxia-provider-bundle",
    "containsSecrets": false,
    "providers": []
  }
}
```

### Response

```json
{
  "preview": {
    "bundle": {
      "schemaVersion": 1,
      "containsSecrets": false,
      "providerCount": 1
    },
    "candidates": [
      {
        "candidateId": "0",
        "sourceProviderId": "source-id",
        "name": "Example Provider",
        "credentialStatus": "redacted",
        "valid": true,
        "diagnostics": [],
        "conflict": null,
        "defaultResolution": "add",
        "suggestedName": "Example Provider"
      }
    ],
    "errors": [],
    "canCommit": true
  }
}
```

Required behavior:

- Must not write provider persistence.
- Must not write managed settings.
- Must classify invalid entries, conflicts, missing credentials, and credential-bearing entries.
- Diagnostics must not reveal raw credential values.

## POST /api/providers/import/commit

Commit selected candidates after revalidation.

### Request

```json
{
  "bundle": {
    "schemaVersion": 1,
    "kind": "cc-jiangxia-provider-bundle",
    "containsSecrets": false,
    "providers": []
  },
  "resolutions": [
    {
      "candidateId": "0",
      "action": "add"
    }
  ]
}
```

Resolution actions:

- `add`: create a new provider with a generated local ID.
- `rename`: create a new provider with supplied or suggested unique name.
- `overwrite`: update an existing local provider; requires explicit `targetProviderId`.
- `skip`: write nothing for the candidate.

### Response

```json
{
  "result": {
    "created": [],
    "updated": [],
    "skipped": [],
    "errors": [],
    "activeId": null
  }
}
```

Required behavior:

- Commit revalidates the bundle and resolutions server-side.
- Commit reads current provider state before writing.
- Commit never activates imported providers.
- Commit never writes active-provider env settings.
- Overwrite occurs only for explicit `overwrite` resolution with a valid target.
- Add/rename creates generated local IDs.
- Partial success, if supported, must be explicit in `created`, `updated`, `skipped`, and `errors`.

## Desktop API/Store Contract

- `providersApi.exportProviders(input)` calls the secret-free export endpoint.
- `providersApi.exportProvidersWithSecrets(input)` calls the dangerous export endpoint.
- `providersApi.previewProviderImport(input)` calls preview.
- `providersApi.commitProviderImport(input)` calls commit.
- `providerStore` exposes matching actions and refreshes providers after successful commit.
- Store actions must not activate providers after commit.

## Error Codes / Diagnostics

Recommended diagnostic categories:

- `BUNDLE_INVALID_JSON`
- `BUNDLE_UNSUPPORTED_VERSION`
- `BUNDLE_INVALID_PROVIDER`
- `PROVIDER_CONFLICT`
- `SECRET_EXPORT_CONFIRMATION_REQUIRED`
- `IMPORT_RESOLUTION_INVALID`
- `IMPORT_TARGET_STALE`

Diagnostics must be actionable and must not include raw secret values.
