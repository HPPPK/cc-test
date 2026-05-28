# Quickstart: Workflows Template Management And Chat Entry

**Feature Dir**: `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow`  
**Purpose**: Representative implementation and validation path for the planned feature.

## Prerequisites

- Install root dependencies with `bun install`.
- If touching desktop UI, install desktop dependencies under `F:\github\cc-jiangxia\desktop`.
- Use an isolated `CLAUDE_CONFIG_DIR` for manual persistence checks when possible.
- Follow `docs/starup/haha-startup.md` before starting desktop/server processes.

## Narrow Validation During Implementation

Run targeted checks first:

```powershell
bun run check:server
```

```powershell
bun run check:desktop
```

Persistence or workflow config shape changes also require:

```powershell
bun run check:persistence-upgrade
```

Before claiming implementation complete:

```powershell
bun run check:coverage
bun run verify
```

## Server Scenario

1. Set `CLAUDE_CONFIG_DIR` to a temp directory.
2. Call `GET /api/workflows/templates`.
3. Confirm built-in `agent-development` is present and startable.
4. Write a malformed `cc-jiangxia/workflows.json`.
5. Call `GET /api/workflows/templates` again.
6. Confirm built-in remains present and diagnostics mention malformed user config.
7. Validate a user template missing output/handoff contract.
8. Confirm validation returns errors and no write occurs.
9. Create a valid user template, update it, export it, delete it.
10. Confirm unknown fields in the config survive update and import commit.

## Desktop Settings Scenario

1. Open Settings.
2. Select `Workflows`.
3. Confirm built-ins and user templates show source, id, version, phase count, and diagnostics.
4. Copy built-in `Agent Development` to a user template.
5. Edit common phase fields.
6. Expand advanced fields and edit an action policy or model/skill hint.
7. Remove a required output artifact or handoff rule.
8. Confirm validation blocks save with an actionable message.
9. Restore required fields and save.
10. Confirm list refreshes and built-in remains read-only.

## Import/Export Scenario

1. Export the copied user template.
2. Import JSON containing a template id that conflicts with an existing user template.
3. Confirm preview defaults to auto-rename and does not overwrite.
4. Select one candidate and commit.
5. Confirm the renamed template appears in Settings.
6. Import JSON attempting to shadow `agent-development`.
7. Confirm preview/commit rejects shadowing unless renamed.

## Empty Chat Workflow Start

1. Open an empty/new session.
2. Open composer `+ > Workflows`.
3. Select a startable template.
4. Start the workflow.
5. Confirm session creation uses the current launch flow.
6. Confirm ActiveSession shows workflow status, phase state, transition controls, and report status.

## Non-Empty Chat Workflow Start

1. Open a normal chat with at least one visible message.
2. Open composer `+ > Workflows`.
3. Select a workflow template.
4. Confirm the context strategy dialog appears with `inherit`, `summarize`, and `clear`.
5. Choose `clear`.
6. Confirm a new workflow session opens and the original chat remains unchanged.
7. Repeat with `inherit`; confirm source context is carried or an actionable too-large error appears.
8. Repeat with `summarize`; confirm summary generation is compact-style and non-mutating, or a visible provider/runtime error appears.

## Regression Checks

- Existing `WorkflowTemplatePicker` tests continue to pass.
- Existing `POST /api/sessions` workflow creation remains compatible.
- Existing normal dialogue `POST /api/sessions` response still omits `workflow`.
- Existing ActiveSession workflow status tests continue to pass.
- Existing workflow session snapshots are unchanged after source template edits.

## Evidence To Record In Handoff

- Changed files.
- Tests added by area.
- Narrow check command outputs.
- `bun run verify` report path.
- Coverage report path.
- Any skipped live/provider summarize evidence with exact blocker.
