# Workflow Discussion Phase Tools Unavailable

## Status

root-cause-identified

## User Symptom

In a Superspec Development Workflow session:

- Active phase: `Sp Discussion · Phase 1 of 5`
- The agent tried to call `Bash` and `Write`.
- Tool calls failed with `No such tool available: Bash` and `No such tool available: Write`.

## Evidence

- `src/server/services/workflowToolPolicy.ts` defaults non-implementation workflow phases to disallow:
  - `Write`
  - `Edit`
  - `MultiEdit`
  - `NotebookEdit`
  - `Bash`
  - `PowerShell`
  - `Agent`
- The same file treats only implementation phase ids as unrestricted by default.
- The user's active workflow phase is `sp-discussion`, not `sp-implement`.
- The user's `superspec-development-workflow` template has no explicit `toolPolicy` on `sp-discussion`.
- The same template's `actionPolicy.allowedActions` says discussion can write `.superspec/discussions/<slug>/` artifacts, which conflicts with the runtime default tool policy that denies the write-capable tools.

## Root Cause

This is not an operating-system permission issue and not evidence that `Bash` or `Write` are missing globally.

The active workflow phase did not expose those tools to the agent. The runtime phase policy removed them from the tool surface, so the tool executor correctly returned `No such tool available`.

The deeper product mismatch is that the SuperSpec discussion phase's action policy permits discussion artifact writes, while the default phase tool policy denies the tools required to perform those writes.

## Resolution Options

1. Add an explicit `toolPolicy.allowedTools` to `sp-discussion` and other artifact-writing planning phases.
2. Use the workflow editor's per-phase tool access controls to enable the required tools.
3. Start or retry the workflow after saving the template, because already-running agent turns do not retroactively gain a newly edited tool surface.

## Related Prior Fix

The previous phase-5 issue was separate: `sp-implement` was not recognized as an implementation phase alias. That was fixed by including `sp-implement` and related normalized aliases in the implementation phase id set.
