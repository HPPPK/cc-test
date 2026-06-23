# Desktop Session Message Queue UX

## Outcome

Implemented desktop-first queued user messages for active sessions. When a non-team desktop session is not idle, a new user message now appears in a dedicated composer queue as queued/pending and is not sent over the WebSocket until the active turn reaches `message_complete`.

- Idle sessions still submit immediately.
- Busy sessions (`thinking`, `streaming`, `tool_executing`, or `permission_pending`) queue locally.
- While a session is busy, an empty composer shows the running Stop action; typing new content switches the action back to Run so the new content can be queued.
- The composer queue exposes `Guide` and `Delete` actions per queued row.
- `Guide` promotes that queued message to the front of the local queue without interrupting the current turn.
- `Delete` removes the queued message from both visible state and the outbound payload queue.
- Queued messages are kept out of the `MessageList` transcript until they are actually submitted.
- When a stopped session receives `status: idle`, the next queued message drains immediately; if a queued message was guided, that guided message drains first.
- Queued outbound payloads are cleaned when sessions are disconnected, cleared, or removed from store state.

## Changed Code Paths

- modified: `desktop/src/stores/chatStore.ts`
- modified: `desktop/src/stores/chatStore.test.ts`
- modified: `desktop/src/components/chat/ChatInput.tsx`
- modified: `desktop/src/components/chat/ChatInput.test.tsx`
- modified: `desktop/src/components/chat/UserMessage.tsx`
- modified: `desktop/src/components/chat/UserMessage.test.tsx`
- modified: `desktop/src/components/chat/MessageList.tsx`
- modified: `desktop/src/components/chat/MessageList.test.tsx`
- modified: `desktop/src/types/chat.ts`
- modified: `desktop/src/i18n/locales/en.ts`
- modified: `desktop/src/i18n/locales/zh.ts`
- added: `.planning/quick/20260616-session-message-queue/STATUS.md`
- added: `.planning/quick/20260616-session-message-queue/SUMMARY.md`
- added: `.specify/project-cognition/updates/20260616-session-message-queue.json`

## Changed Behavior Surfaces

- Desktop per-session chat submission state.
- Desktop composer primary action state while a session is running.
- Desktop WebSocket `user_message` timing for busy sessions.
- Composer queue rendering for queued state, guide promotion, and deletion.
- Transcript rendering excludes queued user messages until submit time.
- Same-area desktop store/component regression coverage.

## Verification Evidence

- RED focused desktop: `cd desktop; bun run test -- src/stores/chatStore.test.ts src/components/chat/UserMessage.test.tsx` failed as expected before production changes because busy send still called WebSocket immediately, `guideQueuedMessage` was missing, and queued UI was missing.
- GREEN focused desktop: `cd desktop; bun run test -- src/components/chat/ChatInput.test.tsx src/stores/chatStore.test.ts src/components/chat/MessageList.test.tsx src/components/chat/UserMessage.test.tsx` passed 162 tests.
- `bun run check:desktop` passed: desktop lint, 98 Vitest files / 879 tests, and production build.
- `git diff --check` exited 0 with line-ending warnings only.
- Bugfix focused desktop: `cd desktop; bun run test -- src/stores/chatStore.test.ts src/components/chat/ChatInput.test.tsx src/components/chat/MessageList.test.tsx` passed 161 tests.
- Bugfix `bun run check:desktop` passed: desktop lint, 98 Vitest files / 880 tests, and production build.
- Bugfix `git diff --check` exited 0 with line-ending warnings only.
- Initial `bun run verify` failed only in `check:native` because the default Tauri target was locked by a running local `tauri dev` / desktop process.
- `CARGO_TARGET_DIR=%TEMP%\cc-jiangxia-codex-cargo-target-session-message-queue bun run check:native` passed.
- Earlier `bun run verify` with the same isolated `CARGO_TARGET_DIR` produced report `artifacts/quality-runs/2026-06-16T06-29-33-653Z/report.md`: 9 passed, 0 failed, 2 skipped. The command still exited 1 because the whole worktree had 710 changed files and policy marked the PR not ready; this was before the composer queue/delete follow-up.
- Follow-up `bun run verify` after the composer queue/delete changes timed out after 15 minutes while running the server-checks lane. It created `artifacts/quality-runs/2026-06-16T07-34-35-081Z/` but no `report.md`; the verify-chain PIDs were identified by command line and stopped, with no residual verify/check:server process left running.

## Surface Conclusions

- Desktop busy-session queue semantics: fixed in this quick task.
- Desktop running composer primary action: fixed in this quick task.
- Desktop idle send semantics: confirmed correct by existing and new store tests.
- Guide action semantics: confirmed non-interrupting; it promotes queue order and drains only after `message_complete`.
- Delete action semantics: confirmed to remove both the composer row and queued outbound payload.
- Stop/status-idle semantics: confirmed to drain exactly the guided next queued message after the server idle acknowledgement.
- Desktop UI rendering: fixed in this quick task; queued messages are composer-owned, not transcript-owned.
- Full repository PR readiness: not clean because the broader dirty worktree is policy-blocked and the follow-up full verify timed out before writing a report. The desktop lane for this scoped change passed.

## Project Cognition Refresh

Inline update payload: `.specify/project-cognition/updates/20260616-session-message-queue.json`.

Earlier inline update succeeded with:

- `update_id`: `upd-20260616T040237.709894600Z`
- `result_state`: `partial_refresh`
- `readiness`: `review`
- `recommended_next_action`: `review_project_cognition_update`

After the composer queue/delete follow-up, the payload was updated to include ChatInput, MessageList, chatStore, tests, and i18n labels, but both final inline update and `mark-dirty` fallback were blocked by the project cognition agreement layer:

`project-cognition.db metadata schema_version has "1", expected "2"`

After the Stop/status-idle bugfix, the latest inline update and `mark-dirty` fallback were attempted again with the same blocker.

Code validation is complete; project cognition needs schema/map maintenance before it can accept the final follow-up update.

## Learning Capture

`specify learning capture-auto --command quick --workspace .planning/quick/20260616-session-message-queue --format json` returned `no-op`; no high-signal auto-capture pattern matched.
