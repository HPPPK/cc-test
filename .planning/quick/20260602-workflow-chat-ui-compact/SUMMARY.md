---
id: 20260602
slug: workflow-chat-ui-compact
status: resolved
completed_at: 2026-06-03T16:36:35+08:00
---

## Outcome

2026-06-03 resumed outcome for the active/running workflow panel:

- Running workflow status renders as a collapsed summary by default.
- The collapsed summary keeps the workflow title, current phase/progress, and status visible.
- Full workflow details, recommended skill status, model/state metadata, pending artifacts, and artifact history are shown only after using the details toggle.
- Phase action controls remain outside the collapsed detail body, so pending confirmation and manual completion controls stay reachable.

Earlier 2026-06-02 outcome preserved in this quick task:

Desktop conversation workflow/task presentation is now less intrusive:

- Completed workflow sessions render as a single compact strip instead of the full workflow status panel.
- Final workflow report access remains available through the compact report link.
- Completed workflow artifact history remains available behind a Details toggle instead of occupying the conversation page by default.
- Completed background agent tasks no longer render a page-level panel after they finish.
- Completed agent tool result summaries are no longer shown inline by default; the result remains available through View result.

## Changed Code Paths

Modified in the 2026-06-03 resumed pass:

- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`
- `desktop/src/components/workflow/WorkflowComponents.test.tsx`
- `desktop/src/pages/ActiveSession.test.tsx`

Modified in the earlier 2026-06-02 pass:

- `desktop/src/pages/ActiveSession.tsx`
- `desktop/src/pages/ActiveSession.test.tsx`
- `desktop/src/components/chat/MessageList.test.tsx`
- `desktop/src/components/workflow/WorkflowReportLink.tsx`
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`

Added:

- `.planning/quick/20260602-workflow-chat-ui-compact/STATUS.md`
- `.planning/quick/20260602-workflow-chat-ui-compact/SUMMARY.md`
- `.specify/project-cognition/updates/20260603-active-workflow-panel-collapse.json`

Deleted: none

Renamed: none

## Changed Behavior Surfaces

- `desktop`: active/running workflow status panel is collapsed by default and expandable on demand.
- `desktop`: workflow recommended skills, state/model details, and artifact evidence no longer occupy the top chat area until expanded.
- `desktop`: active session chat page workflow header and completed background-agent/task presentation.
- `desktop`: compact workflow report link rendering.
- `desktop tests`: ActiveSession and MessageList expectations for completed workflow/task result visibility.

## Surface Sweep

- Active/running WorkflowStatusPanel summary: fixed in this quick task.
- Workflow detail expansion and recommended skills visibility: fixed in this quick task.
- WorkflowTransitionControls reachability: confirmed correct through ActiveSession tests; controls remain outside the collapsed details body.
- ActiveSession workflow header: fixed in this quick task.
- Completed background agent panel: fixed in this quick task.
- MessageList completed agent result inline behavior: confirmed aligned through updated tests.
- WorkflowStatusPanel/WorkflowReportLink component compatibility: confirmed correct through component tests and desktop check.
- Server/session workflow API: not checked in this pass; no server data contract or lifecycle semantics were changed.

## Verification Evidence

- `cd desktop && bun run test -- WorkflowComponents.test.tsx ActiveSession.test.tsx` passed: 2 files, 74 tests.
- `bun run check:desktop` passed on 2026-06-03: desktop lint/typecheck, 96 test files, 828 tests, and Vite build.
- `cd desktop && bun run test ActiveSession.test.tsx` passed: 30 tests.
- `cd desktop && bun run test WorkflowComponents.test.tsx` passed: 44 tests.
- `cd desktop && bun run test MessageList.test.tsx` passed: 56 tests.
- `bun run check:desktop` passed: 96 test files, 828 tests, desktop build/typecheck.
- `bun run check:native` passed after stopping exact repo-owned Tauri/dev/sidecar PIDs that held `desktop/src-tauri/target/debug` executables.
- `bun run verify` failed: latest report `artifacts/quality-runs/2026-06-02T09-18-53-814Z/report.md`, summary passed=5 failed=3 skipped=3.

## Residual Risk

- No new screenshot/browser smoke was recorded for the 2026-06-03 resumed pass. The component tests prove rendering behavior, and `check:desktop` proves the desktop build, but final visual polish has not been captured as an artifact.
- Existing unrelated dirty files were present before closeout and were not reverted.
- Full PR readiness is blocked by expired quarantine review windows in `scripts/quality-gate/quarantine.json`: `server:cron-scheduler`, `server:providers-real`, `server:tasks`, `server:e2e:business-flow`, and `server:e2e:full-flow`. This is a maintainer governance review item, not a desktop UI regression.

## Project Cognition Refresh

2026-06-03 resumed pass:

Inline update ran with payload `.specify/project-cognition/updates/20260603-active-workflow-panel-collapse.json`.

- `update_id`: `upd-20260603T083635.794205300Z`
- `result_state`: `partial_refresh`
- `readiness`: `review`
- `recommended_next_action`: `review_project_cognition_update`
- `review_paths`: `desktop/src/components/workflow`, `desktop/src/components/workflow/WorkflowComponents.test.tsx`, `desktop/src/components/workflow/WorkflowStatusPanel.tsx`, `desktop/src/pages/ActiveSession.test.tsx`

This is recorded as partial cognition closeout, not clean cognition freshness.

Earlier 2026-06-02 pass:

Inline update ran with payload `.specify/project-cognition/updates/20260602-workflow-chat-ui-compact.json`.

- `update_id`: `upd-20260602T091540.727483000Z`
- `result_state`: `partial_refresh`
- `readiness`: `review`
- `recommended_next_action`: `review_project_cognition_update`

This was also recorded as partial cognition closeout, not clean cognition freshness.
