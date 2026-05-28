# Data Model: Agent Workflow Authoring Tools

**Date**: 2026-05-27  
**Scope**: Internal tool input/output, authoring service operation model, stale-write preconditions, and field guide data structures. This document does not define a new workflow template persistence format.

## Existing Persistence Model

The canonical persisted workflow template store remains the existing cc-jiangxia workflow config:

```text
CLAUDE_CONFIG_DIR || ~/.claude
└── cc-jiangxia/
    └── workflows.json
```

`WorkflowTemplateRegistryService` remains responsible for reading, validating, normalizing, preserving unknown fields, writing, and cache invalidation. The new authoring feature consumes existing registry templates and writes through that service only.

## Entity: WorkflowTemplateAuthoringOperation

Operation union accepted by the tool and local authoring endpoint.

| Operation | Kind | Writes? | Destructive? | Required Input | Primary Output |
| --- | --- | --- | --- | --- | --- |
| `guide` | read | no | no | optional topic/filter | `WorkflowTemplateAuthoringGuide` |
| `list` | read | no | no | optional source filter | template summaries, invalid diagnostics |
| `inspect` | read | no | no | `selector` | full template, editability, `basisHash` |
| `validate` | read | no | no | `template` | normalized template or validation issues |
| `create` | mutation | yes | no | `template` | created user template |
| `update` | mutation | yes | no | `selector`, `basisHash`, `template` | updated user template |
| `duplicate` | mutation | yes | no | source `selector`, optional target id/name | created user copy |
| `delete` | mutation | yes | yes | `selector`, `basisHash` | refreshed list metadata |

## Entity: WorkflowTemplateSelector

Identifies a current template.

```ts
type WorkflowTemplateSelector = {
  source: 'builtin' | 'user'
  id: string
}
```

Rules:

- `source` is required for mutating operations; natural-language ambiguity is resolved before tool call.
- `update` and `delete` only accept `source: 'user'`.
- `duplicate` accepts builtin or user source.
- Direct builtin update/delete always reject without writing.

## Entity: WorkflowTemplateBasis

Stale-write precondition.

```ts
type WorkflowTemplateBasis = {
  source: 'builtin' | 'user'
  id: string
  basisHash: string // sha256:<hex>
}
```

Rules:

- `inspect` returns a `basisHash` for the selected template.
- `list` may return `basisHash` for user summaries; `inspect` is the preferred basis capture before update/delete.
- `update` and `delete` require `basisHash`.
- Service re-reads registry immediately before mutation and rejects if current hash differs.
- Hash input is canonical sorted JSON of current registry template content plus source/id identity.

## Entity: WorkflowTemplateDraft

Candidate template payload used by validate/create/update/duplicate internals. It follows the existing workflow template draft semantics and normalizes into `WorkflowTemplateRegistryTemplate`.

Required top-level fields:

- `schemaVersion`: `1`
- `id`: stable slug, no path separators, no builtin shadowing
- `version`: non-empty string
- `name`: non-empty string
- `description`: string, recommended for Settings readability
- `phases`: non-empty ordered array

Required phase fields:

- `id`
- `name`
- `instructions`
- `requiredIntake`
- `handoffRules`
- `outputArtifact` with `required: true`
- `completionCriteria`
- `transition.authority`

Rejected shape fields:

- parallel workflow declarations
- branching workflow declarations
- loop workflow declarations
- nested workflow declarations

## Entity: WorkflowTemplateAuthoringGuide

Read-only structured guidance returned by `guide`.

```ts
type WorkflowTemplateAuthoringGuide = {
  schemaVersion: 1
  fieldGroups: Array<{
    id: string
    title: string
    requiredFields: string[]
    optionalFields: string[]
    guidance: string[]
    examples?: Record<string, unknown>[]
  }>
  allowedValues: {
    completionCriteriaTypes: string[]
    transitionAuthorities: string[]
  }
  unsupportedShapes: string[]
  repairHintsByIssueCode: Record<string, string[]>
}
```

Required guide groups:

- template identity
- phase identity
- phase intent
- handoff contract
- execution contract
- output contract
- completion contract
- transition contract
- tool/action safety
- model/skills
- unsupported shapes

## Entity: WorkflowTemplateAuthoringResult

Common tool/API result shape.

```ts
type WorkflowTemplateAuthoringResult = {
  operation: WorkflowTemplateAuthoringOperation['operation']
  status: 'succeeded' | 'validated' | 'rejected' | 'failed'
  persisted: boolean
  affectedTemplate?: {
    source: 'builtin' | 'user'
    id: string
    name?: string
    version?: string
    basisHash?: string
  }
  beforeSummary?: WorkflowTemplateSummary
  afterSummary?: WorkflowTemplateSummary
  validation?: {
    valid: boolean
    issues: WorkflowTemplateAuthoringIssue[]
  }
  templates?: WorkflowTemplateSummary[]
  invalidTemplates?: WorkflowTemplateAuthoringIssue[]
  guide?: WorkflowTemplateAuthoringGuide
  nextAction:
    | 'none'
    | 'inspect-and-retry'
    | 'repair-and-validate'
    | 'choose-unique-target'
    | 'copy-builtin-first'
    | 'ask-user-to-disambiguate'
    | 'retry-after-server-available'
  message: string
}
```

Rules:

- Successful mutation has `persisted: true`.
- Read-only operations always have `persisted: false`.
- Rejections and failures have `persisted: false`.
- The result must be deterministic enough for snapshot or shape tests.

## Entity: WorkflowTemplateAuthoringIssue

Diagnostic issue returned by validation, stale checks, permission denial, conflict checks, invalid config, and target resolution.

```ts
type WorkflowTemplateAuthoringIssue = {
  path: string
  code: string
  message: string
  severity: 'error' | 'warning'
  templateId?: string
  source?: 'request' | 'import' | 'user-config' | 'builtin' | 'authoring'
}
```

Required issue families:

- validation required/malformed fields
- builtin id conflicts
- user id conflicts
- unsupported non-linear shapes
- stale basis conflict
- builtin mutation/delete rejection
- ambiguous or missing target
- phase-policy denial
- desktop server unavailable

## State Transitions

### Create

1. Read current registry.
2. Validate candidate with current conflict context.
3. Reject if validation fails or id conflicts.
4. Write through registry service with existing user templates plus candidate.
5. Re-read registry and return created summary.

### Update

1. Read current registry.
2. Resolve `source:user` target by id.
3. Compare current `basisHash` to input `basisHash`.
4. Validate candidate with `allowExistingId`.
5. Reject if stale, invalid, missing, or id mismatch.
6. Write mapped user templates through registry service.
7. Re-read registry and return updated summary.

### Duplicate

1. Read current registry.
2. Resolve source template.
3. Choose target id/name or validate caller-provided target.
4. Validate user copy against current registry.
5. Reject conflict or validation failure.
6. Write user copy through registry service.
7. Re-read registry and return created summary.

### Delete

1. Read current registry.
2. Resolve unique `source:user` target.
3. Compare current `basisHash` to input `basisHash`.
4. Reject missing, builtin, ambiguous, or stale target.
5. Write all user templates except target through registry service.
6. Re-read registry and return refreshed list metadata.

## Invariants

- Builtin templates are never persisted as edited/deleted templates.
- User template ids must not shadow builtin ids.
- Mutations write only through workflow template registry service.
- No operation writes when validation, conflict, stale, permission, or target resolution fails.
- Active workflow session snapshots are not touched.
- The authoring guide is read-only and deterministic.
- Desktop server path failure is visible and no-write.
