# Contracts: Workflow Phase Skills

## Shared Types

### WorkflowPhaseSkillReference

```ts
type WorkflowPhaseSkillMode = 'recommended'

type WorkflowPhaseSkillSource =
  | 'user'
  | 'project'
  | 'plugin'
  | 'managed'
  | 'bundled'
  | 'mcp'
  | 'unknown'

interface WorkflowPhaseSkillReference {
  name: string
  mode?: WorkflowPhaseSkillMode
  source?: WorkflowPhaseSkillSource
  pluginName?: string
  namespace?: string
  version?: string
  contentHash?: string
  referenceId?: string
  reason?: string
  [key: string]: unknown
}
```

`reason` is legacy-compatible advisory data only. It must not become the source of skill applicability.

### WorkflowPhaseSkillResolution

```ts
type WorkflowPhaseSkillResolutionStatus =
  | 'available'
  | 'missing'
  | 'ambiguous'
  | 'unsupported-source'
  | 'plugin-disabled'
  | 'invalid-reference'
  | 'installable'

interface WorkflowPhaseSkillResolution {
  reference: WorkflowPhaseSkillReference
  status: WorkflowPhaseSkillResolutionStatus
  checkedAt: string
  resolvedSkill?: {
    name: string
    displayName?: string
    source: WorkflowPhaseSkillSource
    pluginName?: string
  }
  candidates?: Array<{
    name: string
    source: WorkflowPhaseSkillSource
    pluginName?: string
  }>
  diagnostic?: {
    code: string
    severity: 'info' | 'warning' | 'error'
    message: string
  }
  provenance?: {
    sourcePath?: string
    version?: string
    contentHash?: string
  }
}
```

## Resolver Contract

The resolver may be exposed through an internal service first. API surfaces that already return workflow template/import/session data must include resolver results from that service rather than recomputing them.

### Resolve Request

```ts
interface ResolveWorkflowPhaseSkillsRequest {
  cwd?: string
  templateId?: string
  phaseId?: string
  references: WorkflowPhaseSkillReference[]
}
```

### Resolve Response

```ts
interface ResolveWorkflowPhaseSkillsResponse {
  schemaVersion: 1
  resolvedAt: string
  resolutions: WorkflowPhaseSkillResolution[]
}
```

## Template Validation Contract

Template validation must:

- Accept old `skills` entries with `{ name }` and `{ name, reason }`.
- Preserve unknown fields.
- Return `invalid-reference` as an error for malformed shape.
- Return missing/plugin-disabled/unsupported-source recommended skills as warnings.
- Require disambiguation before `ambiguous` references count as available.

## Export Contract

Existing export payloads are extended with dependency data. Import must continue accepting older payloads without dependency data.

```ts
interface WorkflowTemplateExportPackageV2 {
  schemaVersion: 2
  exportedAt: string
  templates: WorkflowTemplate[]
  dependencyManifest?: WorkflowSkillDependencyManifest
}

interface WorkflowSkillDependencyManifest {
  schemaVersion: 1
  generatedAt: string
  resolverVersion?: string
  dependencies: WorkflowSkillDependency[]
}

interface WorkflowSkillDependency {
  templateId: string
  phaseId: string
  reference: WorkflowPhaseSkillReference
  exportStatus: WorkflowPhaseSkillResolutionStatus
  resolvedSource?: WorkflowPhaseSkillSource
  pluginName?: string
  contentHash?: string
  diagnostic?: string
}
```

Rules:

- Do not include skill package contents.
- Include every phase skill reference in the manifest.
- Export warnings must be visible in the desktop export dialog when dependencies are missing/degraded.

## Import Preview Contract

```ts
interface WorkflowTemplateImportCandidate {
  id: string
  name: string
  selectable: boolean
  issues: Array<{
    severity: 'info' | 'warning' | 'error'
    message: string
    code?: string
  }>
  dependencyDiagnostics?: WorkflowImportDependencyDiagnostic[]
}

interface WorkflowImportDependencyDiagnostic {
  templateId: string
  phaseId: string
  reference: WorkflowPhaseSkillReference
  status: WorkflowPhaseSkillResolutionStatus
  severity: 'info' | 'warning' | 'error'
  message: string
  canImport: boolean
}
```

Rules:

- Missing recommended skills are warning diagnostics and do not make the candidate unselectable.
- Invalid reference shape is an error and may make the candidate unselectable.
- Import commit must preserve unresolved references.

## Runtime Session Contract

Workflow session state must persist a snapshot that runtime prompt assembly and resume can use without recomputing skill meaning from changed source files.

```ts
interface WorkflowPhaseSkillSnapshot {
  phaseId: string
  references: WorkflowPhaseSkillReference[]
  resolutions: WorkflowPhaseSkillResolution[]
  snapshottedAt: string
  templateContentHash?: string
  resolverVersion?: string
}

interface WorkflowPhaseSkillEvidence {
  phaseId: string
  name: string
  outcome: 'used' | 'relevant-skipped' | 'relevant-unavailable'
  rationale: string
  recordedAt: string
  source?: WorkflowPhaseSkillSource
  resolutionStatus?: WorkflowPhaseSkillResolutionStatus
  toolUseId?: string
  artifactRef?: string
}
```

Runtime prompt assembly must render available and unavailable recommendations distinctly and must not schedule SkillTool calls.

## Workflow Summary/Status Contract

```ts
interface WorkflowRecommendedSkillStatusSummary {
  total: number
  available: number
  unavailable: number
  degraded: number
  evidenceCount: number
  activePhaseItems?: Array<{
    name: string
    status: WorkflowPhaseSkillResolutionStatus
    source?: WorkflowPhaseSkillSource
    pluginName?: string
  }>
}
```

`WorkflowStatusPanel` should render this as a concise strip or expandable detail, not a checklist of every unused recommendation.

## Final Report Contract

Final reports may include:

```ts
interface WorkflowRecommendedSkillReport {
  snapshots: WorkflowPhaseSkillSnapshot[]
  evidence: WorkflowPhaseSkillEvidence[]
}
```

Reports must not include skill file contents or secret-bearing metadata.
