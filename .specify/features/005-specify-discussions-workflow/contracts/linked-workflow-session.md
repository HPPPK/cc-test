# Contract: Linked Workflow Session Start

**Route**: `POST /api/sessions/:id/workflow/start`  
**Owner**: `src/server/api/sessions.ts` or a focused workflow-session API module routed under sessions  
**Service Owner**: `src/server/services/workflowSessionLinkService.ts`

## Purpose

Start a workflow from an existing normal chat without converting or mutating that source chat. The route creates a new workflow session, snapshots the selected template, records provenance, and optionally carries source context into the new session.

## Request

```http
POST /api/sessions/:sourceSessionId/workflow/start
Content-Type: application/json
```

```json
{
  "workflow": {
    "templateId": "agent-development",
    "templateSource": "builtin",
    "initialPhaseId": "discussion"
  },
  "contextStrategy": "summarize",
  "summaryInstructions": "Preserve decisions and unresolved implementation constraints.",
  "clientRequestId": "ui-20260526-0001"
}
```

Fields:

- `workflow.templateId`: required.
- `workflow.templateSource`: optional, `builtin` or `user`.
- `workflow.initialPhaseId`: optional; if present it must equal the template first phase id.
- `contextStrategy`: required, `inherit`, `summarize`, or `clear`.
- `summaryInstructions`: optional and only meaningful for `summarize`.
- `clientRequestId`: optional idempotency key from the desktop UI.

## Response

```json
{
  "sessionId": "new-workflow-session-id",
  "workDir": "F:\\github\\cc-jiangxia",
  "workflow": {
    "mode": "workflow",
    "templateId": "agent-development",
    "templateVersion": "1",
    "templateSource": "builtin",
    "templateSnapshotId": "agent-development-v1",
    "status": "created",
    "activePhaseId": "discussion",
    "activePhaseIndex": 0,
    "phaseCount": 5,
    "pendingConfirmation": false,
    "statePointer": {
      "kind": "workflow-state",
      "sessionId": "new-workflow-session-id",
      "artifactId": "state",
      "schemaVersion": 1,
      "createdAt": "2026-05-26T00:00:00.000Z",
      "updatedAt": "2026-05-26T00:00:00.000Z",
      "label": "Workflow state"
    }
  },
  "link": {
    "sourceSessionId": "source-session-id",
    "targetSessionId": "new-workflow-session-id",
    "contextStrategy": "summarize",
    "summaryArtifactId": "context-carryover",
    "sourceMessageCount": 12,
    "createdAt": "2026-05-26T00:00:00.000Z"
  }
}
```

## State Rules

- Source session must remain a normal dialogue session.
- Source transcript file must not be rewritten for workflow metadata.
- Target session gets workflow metadata and template snapshot through the same service used by `POST /api/sessions` workflow creation.
- Target session may receive a carryover artifact or queued initial prompt. The source session does not.
- Existing active workflow sessions are not valid source sessions for this first release unless a future spec explicitly extends behavior.

## Context Strategy Behavior

### clear

- Creates a linked workflow session with provenance but no source-context content.
- Does not send source transcript text to the new workflow.
- Original session unchanged.

### inherit

- Carries bounded visible source context into the new workflow startup context.
- If source context is too large or unsafe to include, return a visible error asking the user to choose summarize.
- Original session unchanged.

### summarize

- Generates a compact-style summary from source messages without applying `/compact` to the source session.
- The implementation may extract/reuse compact prompt and message normalization, but must not call the source-session command path that clears history or runs post-compact cleanup.
- If summary generation fails because provider/auth/quota/runtime is unavailable, return an error and do not silently fall back to clear or inherit.
- Original session unchanged.

## Error Codes

- `404 SESSION_NOT_FOUND`: source session does not exist.
- `400 WORKFLOW_TEMPLATE_INVALID`: workflow request shape is invalid.
- `400 WORKFLOW_TEMPLATE_NOT_FOUND`: selected template does not exist.
- `400 WORKFLOW_SOURCE_INVALID`: source is a workflow session or unsupported session type.
- `409 WORKFLOW_SOURCE_ACTIVE`: source session is streaming, thinking, or tool-executing.
- `409 WORKFLOW_LINK_DUPLICATE`: `clientRequestId` already created a target session.
- `422 WORKFLOW_CONTEXT_TOO_LARGE`: inherit cannot safely carry source context.
- `503 WORKFLOW_CONTEXT_SUMMARY_UNAVAILABLE`: summarize cannot run due to provider/runtime unavailability.

## Desktop Flow Contract

1. User opens composer `+`.
2. User selects `Workflows`.
3. Desktop opens workflow selection dialog with source, phase count, phase list, invalid warnings, and start action.
4. If current session is empty, desktop may use the existing create/replacement flow with `workflow`.
5. If current normal chat is non-empty, desktop shows context strategy choices before calling this route.
6. On success, desktop opens the returned target session tab and connects it.
7. On failure, desktop shows an actionable toast/dialog and keeps the source chat unchanged.

## Verification Contract

- Server contract tests must assert source transcript/workflow metadata remain unchanged for `clear`, `inherit`, and `summarize`.
- Tests must assert created target workflow session has snapshot metadata and provenance.
- Active source session must be rejected or disabled in UI.
- Desktop tests must cover the non-empty strategy dialog, route call, tab replacement/open behavior, and no source-chat clearing.
