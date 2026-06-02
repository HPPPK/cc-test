# Data Model: Workflow Phase Skills

## Entity: WorkflowPhaseSkillReference

Phase-local reference to an existing skill.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | Names-first skill reference. Must be non-empty. |
| `mode` | `"recommended"` | no | Defaults to `recommended`; future modes are out of scope. |
| `source` | enum | no | `user`, `project`, `plugin`, `managed`, `bundled`, `mcp`, or `unknown`. |
| `pluginName` | string | no | Provenance for plugin-provided skills; not the primary binding. |
| `namespace` | string | no | Optional disambiguation. |
| `version` | string | no | Optional provenance. |
| `contentHash` | string | no | Optional snapshot/staleness marker; must not expose file contents. |
| `referenceId` | string | no | Optional stable resolver/reference identifier. |
| `reason` | string | no | Legacy compatibility only; not authoritative applicability. |
| unknown fields | unknown | no | Must be preserved on read/write/import/export. |

### Validation Rules

- `name` is required and trimmed.
- `mode` defaults to `recommended`; other modes are invalid until required/contract skills are explicitly scoped.
- Missing recommended skills are warnings, not template invalidity.
- Ambiguous names require qualifying metadata before being treated as `available`.
- Plugin metadata can disambiguate provenance but cannot turn the binding into a plugin binding.

## Entity: WorkflowSkillDependencyManifest

Export-time manifest describing phase skill dependencies without bundling skill contents.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Manifest schema version, starting at `1`. |
| `generatedAt` | ISO timestamp | yes | Export timestamp. |
| `templates` | array | yes | Dependency groups by template. |
| `resolverVersion` | string | no | Optional resolver schema/version marker. |

### WorkflowSkillDependency

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `templateId` | string | yes | Template owning the phase. |
| `phaseId` | string | yes | Phase owning the reference. |
| `reference` | `WorkflowPhaseSkillReference` | yes | Preserved names-first reference. |
| `exportStatus` | `WorkflowPhaseSkillResolutionStatus` | yes | Export-time status. |
| `resolvedSource` | string | no | Source from resolver when available. |
| `pluginName` | string | no | Plugin provenance when relevant. |
| `contentHash` | string | no | Optional staleness marker. |
| `diagnostic` | string | no | Human-readable warning; no skill file contents. |

## Entity: WorkflowPhaseSkillResolution

Shared resolver output used by authoring, validation, import/export, runtime, status, and reports.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `reference` | `WorkflowPhaseSkillReference` | yes | Input reference after normalization. |
| `status` | enum | yes | See status vocabulary below. |
| `checkedAt` | ISO timestamp | yes | Resolver check timestamp. |
| `resolvedSkill` | object | no | Minimal catalog metadata: name, source, plugin, display label. |
| `candidates` | array | no | Ambiguous candidate summaries only. |
| `diagnostic` | object | no | Structured code/message/severity. |
| `provenance` | object | no | Source/plugin/hash/version metadata. |

### Status Vocabulary

- `available`: reference resolves to one skill.
- `missing`: no matching skill is present.
- `ambiguous`: more than one candidate matches names-first data.
- `unsupported-source`: source/provenance exists but this environment cannot resolve it.
- `plugin-disabled`: skill is plugin-provided and the plugin is disabled/unavailable.
- `invalid-reference`: reference shape is malformed.
- `installable`: optional future-compatible status when an installer/source is known.

## Entity: WorkflowPhaseSkillSnapshot

Persisted interpretation of phase skill references for a running or completed workflow.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `phaseId` | string | yes | Phase snapshot owner. |
| `references` | array | yes | Normalized references. |
| `resolutions` | array | yes | Resolver results used by runtime. |
| `snapshottedAt` | ISO timestamp | yes | Snapshot time. |
| `templateContentHash` | string | no | Optional template staleness marker. |
| `resolverVersion` | string | no | Optional resolver version. |

### Lifecycle Rules

- Created/session-start states may resolve lazily, but running prompt assembly must use a snapshot.
- Resume uses the persisted snapshot and reports staleness separately.
- Completed reports keep enough snapshot data to explain behavior without re-reading skill files.

## Entity: WorkflowPhaseSkillEvidence

Bounded evidence for recommended skills that materially mattered.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `phaseId` | string | yes | Phase where evidence was recorded. |
| `name` | string | yes | Skill reference name. |
| `outcome` | enum | yes | `used`, `relevant-skipped`, or `relevant-unavailable`. |
| `rationale` | string | yes | Concise reason; no secret or skill-file content. |
| `recordedAt` | ISO timestamp | yes | Evidence timestamp. |
| `source` | string | no | Skill source/provenance. |
| `resolutionStatus` | string | no | Resolver status at time of evidence. |
| `toolUseId` | string | no | Optional SkillTool usage reference. |
| `artifactRef` | string | no | Optional workflow artifact reference. |

### Evidence Rules

- Irrelevant recommendations are omitted.
- Evidence must not be required for completion in this release.
- Evidence must survive final report creation, resume, and compaction summaries where relevant.

## Entity: WorkflowImportDependencyDiagnostic

Import/export UI diagnostic for dependency status.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `templateId` | string | yes | Template being imported/exported. |
| `phaseId` | string | yes | Phase owning the dependency. |
| `reference` | `WorkflowPhaseSkillReference` | yes | Skill dependency reference. |
| `status` | `WorkflowPhaseSkillResolutionStatus` | yes | Local resolver status. |
| `severity` | `"info" | "warning" | "error"` | yes | Missing recommended skills are warnings. |
| `message` | string | yes | User-facing concise diagnostic. |
| `canImport` | boolean | yes | False only for invalid template/error conditions. |

## Compatibility Matrix

| Existing Shape | New Behavior |
| --- | --- |
| `skills: []` | Valid; no dependency manifest entries for that phase. |
| `skills: [{ "name": "x" }]` | Valid recommended reference to `x`. |
| `skills: [{ "name": "x", "reason": "..." }]` | Valid; `reason` preserved as legacy advisory text. |
| Unknown skill fields | Preserved. |
| Old export with no manifest | Importable; resolver diagnostics generated locally. |
| Plugin skill reference with disabled plugin | Preserved as skill reference with `plugin-disabled`. |
| Unsupported source | Preserved as `unsupported-source`, not silently missing. |
