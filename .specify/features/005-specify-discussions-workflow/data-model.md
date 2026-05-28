# Data Model: Workflows Template Management And Chat Entry

**Date**: 2026-05-26  
**Feature Dir**: `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow`

## Overview

This model extends the existing workflow registry and session metadata concepts. It does not introduce project-level template storage and does not mutate existing workflow session snapshots after template edits.

## Workflow Template Document

Persistence owner: `F:\github\cc-jiangxia\src\server\services\workflowTemplateRegistryService.ts`  
Storage path: `~/.claude/cc-jiangxia/workflows.json`

```ts
type WorkflowTemplateRegistryDocument = {
  schemaVersion: 1
  templates: WorkflowTemplateDraft[]
  [unknownTopLevelField: string]: unknown
}
```

Rules:

- Only user templates are persisted in this document.
- Built-in templates are code-owned and merged into list responses at runtime.
- Unknown top-level fields must be preserved on all writes.
- Missing document means no user templates; built-ins remain startable.
- Malformed document means built-ins remain startable and diagnostics are returned; mutation APIs must not silently overwrite malformed content.

## Workflow Template Draft

```ts
type WorkflowTemplateDraft = {
  schemaVersion: 1
  id: string
  version: string
  name: string
  description?: string
  phases: WorkflowPhaseContract[]
  [unknownTemplateField: string]: unknown
}
```

Rules:

- `id` must be a stable slug with no path separators.
- `id` cannot equal a built-in template id such as `agent-development`.
- User template ids must be unique.
- `source` is computed as `user` for persisted user templates and must not be trusted from client payloads.
- Unknown template fields are preserved when updating the same template.

## Workflow Phase Contract

```ts
type WorkflowPhaseContract = {
  id: string
  name: string
  role?: string
  instructions: string
  objective?: string
  requiredIntake?: string[]
  handoffRules?: string[]
  executionRules?: string[]
  outputArtifact: WorkflowOutputArtifactContract
  completionCriteria: {
    type: 'manual-checklist' | 'artifact-required' | 'agent-reported'
    description: string
    [unknownCompletionField: string]: unknown
  }
  transition: {
    authority: 'auto' | 'user-confirmation'
    [unknownTransitionField: string]: unknown
  }
  phasePrompt?: WorkflowPhasePrompt
  requiredArtifacts?: WorkflowRequiredArtifact[]
  actionPolicy?: WorkflowPhaseActionPolicy
  requestedModel?: string
  skills?: WorkflowTemplateSkillDeclaration[]
  recovery?: WorkflowPhaseRecoveryContract
  [unknownPhaseField: string]: unknown
}
```

Rules:

- `id`, `name`, `instructions`, `completionCriteria`, `transition`, `outputArtifact`, and handoff semantics are required for valid saves/imports.
- Phase ids must be unique within a template.
- First release supports linear ordered phases only.
- Branching, loop, parallel, and nested definitions remain invalid.
- Common editor fields map into first-class structured properties. Advanced fields stay available behind a disclosure UI.
- Unknown phase, skill, artifact, completion, and transition fields must be preserved where an existing matching field can be identified.

## Workflow Output Artifact Contract

```ts
type WorkflowOutputArtifactContract = {
  id: string
  name: string
  kind: 'markdown' | 'json' | 'file-ref' | string
  description: string
  required: true
  sections?: string[]
}
```

Rules:

- At least one required output artifact is required per phase.
- A phase without output artifact semantics is invalid even if it has instructions.
- Runtime mapping may convert this into existing `requiredArtifacts` and `phasePrompt.outputArtifact`.

## Workflow Handoff Contract

```ts
type WorkflowHandoffContract = {
  intake: string[]
  outputSummaryRequired: boolean
  evidenceRequired: boolean
  nextPhaseReadinessRule?: string
}
```

Rules:

- Handoff rules must be explicit enough that later phases can consume prior output.
- Handoff is a first-class validation surface, not prose hidden inside `instructions`.

## Workflow Template Validation Issue

Existing shape should be preserved and extended only additively:

```ts
type WorkflowTemplateValidationIssue = {
  source: 'user-config' | 'builtin' | 'request' | 'import'
  templateId?: string
  path: string
  code: string
  message: string
  severity: 'error' | 'warning'
}
```

Rules:

- Errors block save/start for the affected template.
- Warnings can be displayed but do not necessarily block save/start.
- Diagnostics must be visible in Settings and launch selection flows.

## Import Preview

```ts
type WorkflowTemplateImportPreview = {
  schemaVersion: 1
  candidates: WorkflowTemplateImportCandidate[]
  invalidTemplates: WorkflowTemplateValidationIssue[]
  canCommit: boolean
}

type WorkflowTemplateImportCandidate = {
  importId: string
  originalId: string
  proposedId: string
  name: string
  version: string
  phaseCount: number
  conflict: 'none' | 'user-template' | 'builtin-template'
  defaultResolution: 'add' | 'rename' | 'skip'
  selectable: boolean
  issues: WorkflowTemplateValidationIssue[]
}
```

Rules:

- Conflict default is `rename`, not overwrite.
- Built-in id conflicts cannot commit as-is.
- Commit request must include selected `importId`s and chosen resolutions from the preview.
- Preview does not write to disk.

## Export Payload

```ts
type WorkflowTemplateExportPayload = {
  schemaVersion: 1
  exportedAt: string
  templates: WorkflowTemplateDraft[]
}
```

Rules:

- Selected built-in templates may be exported as reusable template JSON, but importing them back as user templates must require a user-safe id.
- Full user config export may preserve unknown top-level fields when exporting the user config document.

## Linked Workflow Session Request

```ts
type LinkedWorkflowSessionCreateRequest = {
  workflow: {
    templateId: string
    templateSource?: 'builtin' | 'user'
    initialPhaseId?: string
  }
  contextStrategy: 'inherit' | 'summarize' | 'clear'
  summaryInstructions?: string
  clientRequestId?: string
}
```

Rules:

- Source session id comes from `/api/sessions/:id/workflow/start`.
- Source session must be a normal dialogue session for first release.
- Active streaming/generating source sessions should be rejected with 409 or disabled in UI.
- `summarize` requires a non-mutating compact-style summary route.

## Linked Workflow Session Provenance

```ts
type LinkedWorkflowSessionProvenance = {
  sourceSessionId: string
  sourceSessionTitle?: string
  sourceMessageCount: number
  contextStrategy: 'inherit' | 'summarize' | 'clear'
  summaryArtifactId?: string
  createdAt: string
  clientRequestId?: string
}
```

Rules:

- Provenance should be written into the new workflow session metadata/state, not the source session.
- The source session remains unchanged.
- For `clear`, provenance still links the sessions but carries no source context.

## Context Carryover Artifact

```ts
type WorkflowContextCarryoverArtifact = {
  schemaVersion: 1
  sourceSessionId: string
  targetSessionId: string
  strategy: 'inherit' | 'summarize' | 'clear'
  content: string
  createdAt: string
  sourceMessageIds?: string[]
}
```

Rules:

- `summarize` content comes from compact-style summary generation.
- `inherit` content is bounded context assembled from source visible transcript.
- `clear` content is empty or omitted from the startup prompt.
- Carryover artifacts are stored under the new workflow session's workflow artifacts, not the source transcript.

## Snapshot Compatibility

Existing workflow sessions already contain `templateSnapshot` and `templateIdentity`. This feature must not change the meaning of existing snapshots.

Rules:

- Template CRUD/import/export changes only future session creation.
- No migration scans `workflow-sessions/*` for template updates.
- Existing workflow status display remains server-summary driven.

## State Transitions

### Template Draft Lifecycle

```text
new draft -> local validation -> save request -> server validation -> persisted user template -> list refresh
                                          └-> validation issues -> draft remains local
```

### Import Lifecycle

```text
JSON selected -> preview request -> candidate selection/resolution -> commit request -> server validation -> persisted selected templates -> list refresh
                                                               └-> validation/write error -> no partial overwrite by default
```

### Linked Workflow Session Lifecycle

```text
source normal chat -> Workflows dialog -> template selected -> context strategy selected -> linked start request
  -> validate source/session/template/strategy
  -> create new workflow session with snapshot
  -> write carryover provenance/artifact or startup prompt
  -> return new session summary
  -> desktop opens/connects target session
```

## Migration And Persistence Notes

- No global schema version migration is required if `workflows.json` remains `schemaVersion: 1` and changes are additive.
- If implementation changes persisted shape incompatibly, it must add a forward migration, an old-fixture regression test, and run the persistence upgrade gate.
- Protected files listed in repository guidelines remain diagnosis-only for this feature.
