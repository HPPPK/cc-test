# Contract: Workflow Skill Dependency Manifest

## Purpose

Define workflow package sharing as template data plus dependency diagnostics. The manifest makes referenced recommended skills visible across environments without bundling arbitrary skill package contents.

## Export Contract

Workflow template export returns:

```json
{
  "schemaVersion": 2,
  "exportedAt": "2026-06-12T00:00:00.000Z",
  "templates": [],
  "dependencyManifest": {
    "schemaVersion": 1,
    "generatedAt": "2026-06-12T00:00:00.000Z",
    "dependencies": [
      {
        "templateId": "agent-development",
        "phaseId": "specify",
        "reference": {
          "name": "sp-specify",
          "mode": "recommended",
          "source": "managed"
        },
        "exportStatus": "available",
        "resolvedSource": "managed",
        "pluginName": null,
        "contentHash": null,
        "diagnostic": null
      }
    ]
  }
}
```

Rules:

- `templates[]` contains workflow template data only.
- `dependencyManifest.dependencies[]` is generated from resolver results.
- No arbitrary skill package contents are bundled by default.
- Invalid references remain manifest entries with error status.

## Import Preview Contract

Import preview must:

- parse template candidates from exported package or single-template payload
- validate template shape
- combine manifest diagnostics with receiver-side resolver diagnostics
- preserve unresolved references when import is allowed
- set candidate `selectable` false when validation errors or non-importable dependency errors exist

Candidate shape:

```json
{
  "importId": "candidate-1",
  "originalId": "agent-development",
  "proposedId": "agent-development-imported",
  "name": "Agent Development",
  "version": "1",
  "phaseCount": 5,
  "conflict": "none | user-template | builtin-template",
  "defaultResolution": "add | rename",
  "selectable": true,
  "issues": [],
  "dependencyDiagnostics": []
}
```

## Dependency Diagnostics

| Status | Severity | Can Import | Required Behavior |
| --- | --- | --- | --- |
| available | info | true | Show available or omit from blocking UI. |
| installable | info | true | Show installable but do not auto-install. |
| missing | warning | true | Preserve reference and show degraded state. |
| ambiguous | warning | true | Ask author/importer to disambiguate before relying on it. |
| unsupported-source | warning | true | Preserve reference and explain source mismatch. |
| plugin-disabled | warning | true | Preserve reference and explain disabled plugin. |
| invalid-reference | error | false | Block selectable import or template validity. |

## Commit Contract

Import commit must:

- accept only selected valid candidates
- reject overwrite resolution in this scope
- allow add/rename according to preview
- preserve dependency references and unknown fields
- return imported template summaries and validation results

## Desktop Contract

Desktop import/export UI must:

- render dependency diagnostics before commit
- distinguish errors from warnings without color-only communication
- preserve copyable JSON export output
- avoid implying that skills are bundled
- keep save-file behavior honest if a file write path is later added

## Stop And Reopen Conditions

- Export includes arbitrary skill package contents by default.
- Import drops missing or ambiguous references silently.
- Invalid references become importable without error.
- Desktop UI suggests missing skills were installed or bundled.
