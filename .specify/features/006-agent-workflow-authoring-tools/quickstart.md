# Quickstart: Agent Workflow Authoring Tools

**Date**: 2026-05-27  
**Purpose**: Representative validation flow for implementation and review. This is not an implementation script.

## Prerequisites

- Install root dependencies with `bun install`.
- Use an isolated `CLAUDE_CONFIG_DIR` for manual/local verification so real user workflow config is not modified.
- Start the local server only for desktop/server-path verification:

```powershell
$env:SERVER_PORT='3456'
bun run src/server/index.ts
```

## Scenario 1: Create From Conversation

1. Ask the agent to create a three-phase workflow.
2. Agent calls `workflow_template_authoring` with `operation:"guide"`.
3. Agent calls `operation:"validate"` with the candidate template.
4. Agent calls `operation:"create"` when validation is clean.
5. Verify result:
   - `status` is `succeeded`
   - `persisted` is `true`
   - `affectedTemplate.source` is `user`
   - Settings Workflows list/refetch sees the template through `/api/workflows/templates`

## Scenario 2: Update With Fresh Basis

1. Agent calls `operation:"inspect"` for `source:"user"` and records `basisHash`.
2. Agent validates an updated template.
3. Agent calls `operation:"update"` with the same selector and `basisHash`.
4. Verify result:
   - update succeeds
   - unknown existing template/phase fields remain preserved
   - active workflow sessions are not modified

## Scenario 3: Stale Update Rejection

1. Agent inspects a user template and records `basisHash`.
2. Simulate a manual Settings edit to the same template before the agent writes.
3. Agent calls `operation:"update"` with the old `basisHash`.
4. Verify result:
   - `status` is `rejected`
   - `persisted` is `false`
   - issue code includes `WORKFLOW_TEMPLATE_STALE_BASIS`
   - persisted workflow config remains at the manual edit
   - `nextAction` is `inspect-and-retry`

## Scenario 4: Builtin Copy Then Edit

1. User asks to change builtin `agent-development`.
2. Agent calls `operation:"duplicate"` with selector `{ "source": "builtin", "id": "agent-development" }`.
3. Verify default target id/name:
   - first copy id: `agent-development-custom`
   - later conflicts: `agent-development-custom-2`, `agent-development-custom-3`
   - default name: `Agent Development Custom`
4. Agent updates only the copied `source:"user"` template.
5. Verify builtin remains read-only and unchanged.

## Scenario 5: Delete User Template

1. Agent inspects the user template and records `basisHash`.
2. Agent calls `operation:"delete"` with source user, id, and hash.
3. Verify result:
   - tool metadata marks delete destructive
   - delete succeeds only for `source:"user"`
   - builtin and ambiguous delete attempts reject without writing

## Scenario 6: Desktop Server Path

1. Launch or simulate a tool process with `CC_JIANGXIA_DESKTOP_SERVER_URL=http://127.0.0.1:3456`.
2. Call a mutating tool operation.
3. Verify the tool sends `POST /api/workflows/templates/authoring`.
4. Verify it does not direct-write if the server returns an error.
5. Verify Settings Workflows refetch through the server sees successful mutations.

## Focused Verification Commands

Run narrow checks while implementing:

```powershell
bun test src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts
bun test src/server/services/workflowTemplateAuthoringService.test.ts
bun test src/server/services/workflowTemplateRegistryService.test.ts
bun test src/server/services/workflowToolPolicy.test.ts
bun test src/server/__tests__/workflowTemplates.test.ts
bun run check:server
```

Run desktop checks only if desktop source changes:

```powershell
bun run check:desktop
```

Before implementation handoff:

```powershell
bun run verify
```

## Expected Evidence For Handoff

- Changed files list.
- Tests added for tool, service, API, policy, and guide.
- Coverage report path from the final quality run.
- Pass/fail/skip counts from `bun run verify`.
- Explicit blocker if desktop live/server path cannot be run locally.
