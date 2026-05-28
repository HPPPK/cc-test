# Contract: Local Workflow Template Authoring API

**Date**: 2026-05-27  
**Owner Surface**: `src/server/api/workflowTemplates.ts`  
**Consumer**: `workflow_template_authoring` tool when `CC_JIANGXIA_DESKTOP_SERVER_URL` is configured.

## Purpose

Provide a local desktop/server-backed path for workflow template authoring operations. This avoids cross-process registry cache drift when a desktop-launched CLI child process authors templates that Settings Workflows later refetches through the desktop server.

## Endpoint

```text
POST /api/workflows/templates/authoring
```

This is an internal local server contract, not a public external API. It should call `WorkflowTemplateAuthoringService` in the server process and return the same result envelope as the tool service.

## Request

The request body is the same operation union described in `contracts/workflow-authoring-tool.md`.

Example:

```json
{
  "operation": "update",
  "selector": {
    "source": "user",
    "id": "agent-development-custom"
  },
  "basisHash": "sha256:...",
  "template": {
    "schemaVersion": 1,
    "id": "agent-development-custom",
    "version": "1.0.1",
    "name": "Agent Development Custom",
    "description": "Customized agent development workflow.",
    "phases": []
  }
}
```

## Response

Success and handled rejection responses return a `WorkflowTemplateAuthoringResult` JSON body.

Example handled stale rejection:

```json
{
  "operation": "update",
  "status": "rejected",
  "persisted": false,
  "affectedTemplate": {
    "source": "user",
    "id": "agent-development-custom",
    "basisHash": "sha256:current"
  },
  "validation": {
    "valid": false,
    "issues": [
      {
        "path": "$.basisHash",
        "code": "WORKFLOW_TEMPLATE_STALE_BASIS",
        "message": "Workflow template changed since the agent inspected it.",
        "severity": "error",
        "templateId": "agent-development-custom",
        "source": "authoring"
      }
    ]
  },
  "nextAction": "inspect-and-retry",
  "message": "Template changed before update; inspect the current template before retrying."
}
```

## HTTP Status Guidance

- `200`: read operation success, update/delete success, or handled no-write rejection.
- `201`: create/duplicate success.
- `400`: malformed request body that cannot be interpreted as an operation.
- `404`: missing selected template when the service chooses to surface target absence as transport error.
- `409`: conflict/stale/builtin protection may be returned as transport error only if existing API style requires it; otherwise prefer handled `status:"rejected"` with `persisted:false`.
- `500`: unexpected server failure.

The tool should treat any non-2xx response as `status:"failed"`, `persisted:false`, and `nextAction:"retry-after-server-available"` unless the response body is a valid authoring result.

## Cache And Persistence Requirements

- The endpoint must execute in the server process and write through `WorkflowTemplateRegistryService`.
- Successful mutations must invalidate the registry cache through the existing writer.
- The endpoint must not write to desktop localStorage, session transcripts, provider config, MCP config, OAuth tokens, skills, plugin state, adapters, or active workflow sessions.

## Stale-Write Requirements

- Update and delete requests must include `basisHash`.
- The server must re-read current registry state before mutation.
- The server must reject mismatch with no write.
- The server must return enough current metadata for the agent to inspect and retry.

## Compatibility With Existing API

The existing manual endpoints remain supported:

- `GET /api/workflows/templates`
- `GET /api/workflows/templates/:source/:id`
- `POST /api/workflows/templates/validate`
- `POST /api/workflows/templates`
- `PUT /api/workflows/templates/user/:id`
- `DELETE /api/workflows/templates/user/:id`
- `POST /api/workflows/templates/duplicate`

The authoring endpoint may share service code with those endpoints. If implementation instead extends existing endpoints with precondition support, it must still preserve the single-operation authoring contract for the tool path and document the final route choice before `/sp.implement`.
