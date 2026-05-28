# Contract: `workflow_template_authoring` Tool

**Date**: 2026-05-27  
**Owner Surface**: `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx`

## Purpose

Provide one globally available internal agent tool for workflow template authoring. The tool supports read-only guide/list/inspect/validate operations and mutating create/update/duplicate/delete operations.

## Tool Metadata

- **Name**: `workflow_template_authoring`
- **Search Hint**: workflow template authoring and validation
- **Global registration**: included in `getAllBaseTools()` and ordinary assembled tool pools.
- **Read-only operations**: `guide`, `list`, `inspect`, `validate`
- **Mutating operations**: `create`, `update`, `duplicate`, `delete`
- **Destructive operations**: `delete`
- **Concurrency**: not concurrency safe

## Input Contract

All inputs use a discriminated `operation` field.

### Guide

```json
{
  "operation": "guide",
  "topic": "all"
}
```

`topic` is optional and may narrow output to a field group. Unknown topics return the full guide plus a warning, not a write.

### List

```json
{
  "operation": "list",
  "source": "all"
}
```

`source` may be `all`, `builtin`, or `user`.

### Inspect

```json
{
  "operation": "inspect",
  "selector": {
    "source": "user",
    "id": "custom-workflow"
  }
}
```

### Validate

```json
{
  "operation": "validate",
  "template": {
    "schemaVersion": 1,
    "id": "custom-workflow",
    "version": "1.0.0",
    "name": "Custom Workflow",
    "description": "A workflow created through conversation.",
    "phases": []
  },
  "allowExistingId": null
}
```

`allowExistingId` is only valid for update-style validation.

### Create

```json
{
  "operation": "create",
  "template": {
    "schemaVersion": 1,
    "id": "custom-workflow",
    "version": "1.0.0",
    "name": "Custom Workflow",
    "description": "A workflow created through conversation.",
    "phases": []
  }
}
```

### Update

```json
{
  "operation": "update",
  "selector": {
    "source": "user",
    "id": "custom-workflow"
  },
  "basisHash": "sha256:...",
  "template": {
    "schemaVersion": 1,
    "id": "custom-workflow",
    "version": "1.0.1",
    "name": "Custom Workflow",
    "description": "Updated through conversation.",
    "phases": []
  }
}
```

Rules:

- `selector.source` must be `user`.
- `template.id` must match `selector.id`.
- `basisHash` must match the current registry template hash.

### Duplicate

```json
{
  "operation": "duplicate",
  "selector": {
    "source": "builtin",
    "id": "agent-development"
  },
  "target": {
    "id": "agent-development-custom",
    "name": "Agent Development Custom"
  }
}
```

Rules:

- `target` is optional for builtin source.
- Default builtin target id is `<builtin-id>-custom`, then `-2`, `-3`.
- Default builtin target name is `<Builtin Name> Custom`.
- Target id must be user-owned, non-conflicting, and not a builtin id.

### Delete

```json
{
  "operation": "delete",
  "selector": {
    "source": "user",
    "id": "custom-workflow"
  },
  "basisHash": "sha256:..."
}
```

Rules:

- `selector.source` must be `user`.
- Target must exist and be unique.
- `basisHash` must match current template hash.
- Tool metadata must return `isDestructive=true`.

## Output Contract

All outputs share this envelope:

```json
{
  "operation": "inspect",
  "status": "succeeded",
  "persisted": false,
  "affectedTemplate": {
    "source": "user",
    "id": "custom-workflow",
    "name": "Custom Workflow",
    "version": "1.0.0",
    "basisHash": "sha256:..."
  },
  "validation": {
    "valid": true,
    "issues": []
  },
  "invalidTemplates": [],
  "nextAction": "none",
  "message": "Workflow template inspected."
}
```

Allowed `status` values:

- `succeeded`
- `validated`
- `rejected`
- `failed`

Allowed `nextAction` values:

- `none`
- `inspect-and-retry`
- `repair-and-validate`
- `choose-unique-target`
- `copy-builtin-first`
- `ask-user-to-disambiguate`
- `retry-after-server-available`

## No-Write Rejection Contract

The tool must return `persisted:false` and leave config unchanged for:

- invalid candidate template
- malformed existing config
- builtin update/delete
- builtin id shadowing
- user id conflict
- missing target
- ambiguous target
- stale basis hash
- active workflow phase-policy denial
- desktop server authoring endpoint failure

## Permission And Phase Policy

- `isReadOnly(input)` is true only for guide/list/inspect/validate.
- `isDestructive(input)` is true only for delete.
- Mutating operations must fail closed when active workflow phase policy denies workflow template authoring.
- Read-only operations must remain available even when mutation is denied.

## Transcript Rendering Requirements

The rendered tool-use/result should show:

- operation
- selected or affected template id/source
- persisted state
- validation status
- issue count and primary issue codes when rejected
- before/after summary for successful mutations
- next recommended agent action
