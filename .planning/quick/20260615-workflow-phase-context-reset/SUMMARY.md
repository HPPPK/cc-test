---
id: 20260615-workflow-phase-context-reset
slug: workflow-phase-context-reset
status: resolved
created: 2026-06-15T12:20:00+08:00
resolved: 2026-06-15T13:28:00+08:00
---

# Workflow Phase Context Reset Option

## Outcome

Added an opt-in next-phase context strategy for workflow transitions:

- Default behavior remains inherited context.
- Pending confirmation and manual completion can send `nextPhaseContextStrategy: "clear"` when the user checks the confirmation-time checkbox.
- Clear strategy preserves transcript history, workflow state, handoff artifacts, output artifacts, final reports, and transition audit records.
- The next phase prompt receives an explicit boundary: use accepted handoff materials and prior workflow artifacts, and do not rely on inherited transcript history unless the user provides it again.

## Changed Code Paths

Modified:
- `src/server/services/workflowTypes.ts`
- `src/server/services/workflowRuntimeService.ts`
- `src/server/services/workflowRuntimeService.test.ts`
- `src/server/api/sessions.ts`
- `src/server/__tests__/sessions.test.ts`
- `src/server/ws/handler.ts`
- `src/server/__tests__/websocket-handler.test.ts`
- `desktop/src/components/workflow/WorkflowTransitionControls.tsx`
- `desktop/src/components/workflow/WorkflowComponents.test.tsx`
- `desktop/src/api/sessions.ts`
- `desktop/src/types/session.ts`
- `desktop/src/types/chat.ts`

Added:
- `.planning/quick/20260615-workflow-phase-context-reset/STATUS.md`
- `.planning/quick/20260615-workflow-phase-context-reset/SUMMARY.md`

## Changed Behavior Surfaces

- Server workflow runtime transition contract now accepts optional `nextPhaseContextStrategy`.
- REST workflow transition API validates and forwards the optional strategy.
- WebSocket workflow transition handling validates and forwards the optional strategy, including auto-continue prompt behavior.
- Desktop transition controls show a checkbox during pending confirmation and manual completion when there is a next phase.
- Final phase confirmation does not show the checkbox.
- Transition records and workflow state preserve the selected clear-context marker for the next active phase.

## Surface Sweep

- Runtime transition behavior: fixed in this quick task and covered by focused runtime tests.
- REST transition API: fixed in this quick task and covered by focused sessions API tests.
- WebSocket transition and auto-continue prompt: fixed in this quick task and covered by focused WebSocket tests.
- Desktop transition controls: fixed in this quick task and covered by focused component tests plus desktop lint/check.
- Transcript and artifact deletion paths: confirmed not touched; grep review found no new destructive transcript or workflow artifact deletion in the changed runtime/API/control files.
- Template defaults and phase skill semantics: intentionally not checked in this pass beyond diff review because they are out of scope and were not changed.

## Verification Evidence

- `bun test src/server/services/workflowRuntimeService.test.ts`: 47 pass.
- `bun test src/server/__tests__/sessions.test.ts -t "workflow/transition"`: 16 pass, 131 filtered.
- `bun test src/server/__tests__/websocket-handler.test.ts -t "clear-context boundary"`: 1 pass, 26 filtered.
- `cd desktop; bun test src/components/workflow/WorkflowComponents.test.tsx -t WorkflowTransitionControls`: 10 pass, 43 filtered.
- `cd desktop; bun run lint`: pass.
- `bun run check:server`: pass, log `C:\Users\11034\AppData\Local\Temp\cc-jiangxia-phase-context-check-server-final.log`.
- `bun run check:desktop`: pass, log `C:\Users\11034\AppData\Local\Temp\cc-jiangxia-phase-context-check-desktop-final.log`.
- `cd desktop; bun run build:sidecars`: pass.
- `git diff --check -- <touched workflow context reset paths>`: no whitespace errors; Windows LF/CRLF conversion warnings only.

## Residual Risk

- The working tree already contained many workflow-related dirty changes before this quick task, including some shared test/type files. This task worked with those changes and did not revert them.
- Full `bun run verify` was not run; the narrower server and desktop gates for the touched surfaces passed.
- The desktop sidecar binary was rebuilt. The currently running Tauri window still needs a restart before its active `target/debug/claude-sidecar.exe` process picks up the rebuilt server logic; I did not force-close the existing window/session.

## Project Cognition Refresh

Inline update completed:
- `project-cognition update --payload-file .specify/project-cognition/updates/20260615-workflow-phase-context-reset.json --reason workflow-finalize --format json`
- `update_id`: `upd-20260615T065732.619899300Z`
- `result_state`: `partial_refresh`
- `readiness`: `review`

The update recorded useful changed-path and contract data, but cognition is not fully clean because the broader working tree still has many stale workflow-related dirty paths. Live code and tests above are the source of truth for this quick-task completion.
