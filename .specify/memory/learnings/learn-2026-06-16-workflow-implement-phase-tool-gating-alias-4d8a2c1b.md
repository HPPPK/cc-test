# Custom Workflow Implementation Phase Tool Gating Alias

## Metadata

- Type: `recovery_path`
- Source Command: `sp-debug`
- Recurrence Key: `workflow-implement-phase-tool-gating-alias`
- Applies To: `sp-debug`, `sp-implement`, `server workflow runtime`, `workflow tool policy`
- Signal Strength: `high`
- First Seen: `2026-06-16T08:55:00Z`

## Problem

Custom workflow templates can use skill-style phase ids such as `sp-implement`.
If workflow tool gating only recognizes builtin ids such as `implementation` and
`implement`, the active implementation phase is misclassified as a restricted
planning or requirements phase.

## Lesson

When an agent reports that `Write`, `Edit`, `Bash`, or subagent tools are absent
only inside a workflow phase, inspect the server launch options before treating
it as an OS permission or provider capability issue. The likely failure loop is:

workflow active phase -> `getWorkflowPhaseDisallowedTools` -> CLI
`--disallowed-tools` -> provider tool surface omits file/shell tools -> model
truthfully reports the tools are unavailable.

Normalize workflow phase ids and include custom implementation aliases such as
`sp-implement` and `sp_implement`. Preserve restrictive behavior for
look-alike planning phases such as `implementation-planning`.

## Evidence

- User SuperSpec template used phase ids `sp-discussion`, `sp-specify`,
  `sp-plan`, `sp-tasks`, and `sp-implement`.
- RED policy test showed `sp-implement` had no implementation action policy.
- RED WebSocket test showed CLI startup still included
  `disallowedTools: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash',
  'PowerShell', 'Agent']` in the implementation phase.

## Verification

- `bun test src/server/services/workflowToolPolicy.test.ts`
- `bun test src/server/__tests__/websocket-handler.test.ts`
- `bun run check:server`
