# Contract: Workflow Template API

**Base Path**: `/api/workflows/templates`  
**Owner**: `src/server/api/workflowTemplates.ts` routed from `src/server/router.ts`  
**Persistence Owner**: `src/server/services/workflowTemplateRegistryService.ts`

## Compatibility

Existing `GET /api/workflows/templates` remains compatible:

```http
GET /api/workflows/templates
```

Response:

```json
{
  "templates": [
    {
      "id": "agent-development",
      "source": "builtin",
      "version": "1",
      "name": "Agent Development",
      "description": "...",
      "phaseCount": 5,
      "firstPhaseId": "discussion",
      "phaseNames": ["Discussion", "Specify", "Plan", "Tasks", "Implement"],
      "startable": true,
      "editable": false,
      "copyable": true
    }
  ],
  "invalidTemplates": []
}
```

Additive fields are allowed. Existing clients must continue to work if they ignore new fields.

## Detail

```http
GET /api/workflows/templates/:source/:id
```

Rules:

- `source` is `builtin` or `user`.
- Built-in detail is read-only.
- User detail returns the normalized editable template plus diagnostics.

Errors:

- `404 WORKFLOW_TEMPLATE_NOT_FOUND`
- `400 WORKFLOW_TEMPLATE_INVALID_SOURCE`

## Validate

```http
POST /api/workflows/templates/validate
Content-Type: application/json
```

Request:

```json
{
  "template": {
    "schemaVersion": 1,
    "id": "my-workflow",
    "version": "1",
    "name": "My Workflow",
    "phases": []
  }
}
```

Response:

```json
{
  "valid": false,
  "template": null,
  "issues": [
    {
      "source": "request",
      "templateId": "my-workflow",
      "path": "$.template.phases",
      "code": "WORKFLOW_TEMPLATE_INVALID_PHASES",
      "message": "Template phases must be a non-empty ordered array.",
      "severity": "error"
    }
  ]
}
```

Rules:

- Validation does not write to disk.
- Built-in id shadowing, duplicate ids, missing output/handoff contracts, and non-linear definitions are errors.

## Create

```http
POST /api/workflows/templates
Content-Type: application/json
```

Request:

```json
{
  "template": { "schemaVersion": 1, "id": "my-workflow", "version": "1", "name": "My Workflow", "phases": [] }
}
```

Response:

```json
{
  "template": { "id": "my-workflow", "source": "user", "version": "1", "name": "My Workflow" },
  "templates": [],
  "invalidTemplates": []
}
```

Rules:

- Source is forced to `user`.
- Existing user id conflict returns 409 unless the request explicitly uses duplicate/copy flow with a new id.
- Built-in ids are rejected.
- No write occurs if validation fails.

## Update

```http
PUT /api/workflows/templates/user/:id
Content-Type: application/json
```

Request:

```json
{
  "template": { "schemaVersion": 1, "id": "my-workflow", "version": "2", "name": "My Workflow", "phases": [] }
}
```

Rules:

- Only `source=user` templates can be updated.
- `:id` must match `template.id` unless a future rename operation is explicitly implemented and tested.
- Unknown fields from the existing template/config must be preserved.
- Existing workflow session snapshots are not touched.

Errors:

- `404 WORKFLOW_TEMPLATE_NOT_FOUND`
- `400 WORKFLOW_TEMPLATE_INVALID`
- `409 WORKFLOW_TEMPLATE_CONFLICT`

## Delete

```http
DELETE /api/workflows/templates/user/:id
```

Rules:

- Only user templates can be deleted.
- Deleting a user template does not mutate existing workflow session snapshots.
- Deleting a missing user template is either 404 or idempotent 200; implementation must choose one and test it. Recommended: 404 for user feedback.

## Duplicate Built-In Or User Template

```http
POST /api/workflows/templates/duplicate
Content-Type: application/json
```

Request:

```json
{
  "source": "builtin",
  "id": "agent-development",
  "targetId": "agent-development-copy",
  "targetName": "Agent Development Copy"
}
```

Rules:

- Source may be `builtin` or `user`.
- Target is always a user template.
- Target id cannot shadow a built-in or existing user template.

## Import Preview

```http
POST /api/workflows/templates/import/preview
Content-Type: application/json
```

Request:

```json
{
  "payload": {
    "schemaVersion": 1,
    "templates": []
  }
}
```

Response:

```json
{
  "schemaVersion": 1,
  "candidates": [
    {
      "importId": "candidate-1",
      "originalId": "agent-development",
      "proposedId": "agent-development-imported",
      "name": "Agent Development",
      "version": "1",
      "phaseCount": 5,
      "conflict": "builtin-template",
      "defaultResolution": "rename",
      "selectable": true,
      "issues": []
    }
  ],
  "invalidTemplates": [],
  "canCommit": true
}
```

Rules:

- Preview accepts either a document with `templates` or a single template object if implementation chooses to support single-template import.
- Preview does not write.
- Conflicts default to rename, never overwrite.
- Built-in id conflicts must propose a safe user id.

## Import Commit

```http
POST /api/workflows/templates/import
Content-Type: application/json
```

Request:

```json
{
  "payload": { "schemaVersion": 1, "templates": [] },
  "selections": [
    {
      "importId": "candidate-1",
      "resolution": "rename",
      "targetId": "agent-development-imported"
    }
  ]
}
```

Rules:

- Server recomputes validation from payload; it must not trust a stale preview object.
- Only selected templates are written.
- Validation failure means no partial write unless implementation explicitly records per-template partial behavior and tests it. Recommended: atomic all-selected commit.
- Unknown fields in existing config and updated matching templates are preserved.

## Export

```http
POST /api/workflows/templates/export
Content-Type: application/json
```

Request:

```json
{
  "templates": [
    { "source": "user", "id": "my-workflow" },
    { "source": "builtin", "id": "agent-development" }
  ],
  "mode": "selected"
}
```

Response:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-05-26T00:00:00.000Z",
  "templates": []
}
```

Rules:

- Export is read-only.
- Secrets or unrelated user-owned state must not be included.
- Built-in exports are reusable JSON, not permission to import as the same protected id.

## Security And Validation

- Reject unsupported methods with 405.
- Validate all JSON request bodies and return stable error codes.
- Never expose absolute protected file paths in normal API responses.
- Do not mutate `~/.claude/settings.json`, project `.claude/settings.json`, transcripts, providers, OAuth tokens, plugins, skills, MCP config, or adapter sessions.

## Test Contract

- Server tests in `src/server/__tests__/sessions.test.ts` or a new workflow template API test file must cover every route.
- Registry tests must cover write preservation and validation.
- Desktop API tests in `desktop/src/api/sessions.test.ts` must cover client methods and route paths.
