# GUI Smoothness Latency Quick Fix Summary

## Behavior Surface

- desktop
- desktop chat composer rendering

## Root Cause Found

`desktop/src/components/chat/ChatInput.tsx` subscribed to the entire chat store through `useChatStore()` and also subscribed to the whole active session object. That made the composer controls rerender for unrelated chat store updates and for high-frequency active session fields such as `streamingText`.

## Change Made

- Replaced broad chat store subscription with scoped selectors for `sendMessage` and `stopGeneration`.
- Replaced whole-session selection with narrow selectors for the fields the composer actually uses:
  - `chatState`
  - `slashCommands`
  - `composerPrefill`
  - `connectionState`
  - `loadedMessageCount`
- Added regression coverage proving composer controls stay stable during unrelated session updates and active streaming-text updates.

## Files Changed

- `desktop/src/components/chat/ChatInput.tsx`
- `desktop/src/components/chat/ChatInput.test.tsx`
- `.planning/debug/gui-smoothness-latency.md`
- `.planning/quick/002-gui-smoothness-latency/STATUS.md`
- `.planning/quick/002-gui-smoothness-latency/SUMMARY.md`

## Verification

- RED: `cd desktop; bun run test -- src/components/chat/ChatInput.test.tsx -t "does not rerender the composer controls for unrelated chat session updates"` failed before the scoped selector fix.
- RED: `cd desktop; bun run test -- src/components/chat/ChatInput.test.tsx -t "active streaming text updates"` failed before the active-session selector narrowing.
- GREEN: `cd desktop; bun run test -- src/components/chat/ChatInput.test.tsx -t "does not rerender the composer controls"` passed.
- GREEN: `cd desktop; bun run test -- src/components/chat/ChatInput.test.tsx` passed, 24 tests.
- GREEN: `cd desktop; bun run lint` passed.
- GREEN: `bun run check:desktop` passed, 94 test files and 801 tests, plus production build.
- BLOCKED: `bun run verify` failed outside the changed desktop surface.
  - Report: `artifacts/quality-runs/2026-05-28T14-05-21-609Z/report.md`
  - Coverage: `artifacts/coverage/2026-05-28T14-06-02-717Z/coverage-report.md`
  - Result: 6 passed, 2 failed, 3 skipped.
  - Failed lanes:
    - Coverage gate failed in root server/tool coverage because `WorkflowTemplateAuthoringTool.test.ts` required `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`.
    - Native check failed in Tauri build script with Windows `PermissionDenied`.
  - Desktop checks and changed-line coverage passed.

## Project Cognition

Inline cognition update completed:

- `update_id`: `upd-20260528T141233.741662900Z`
- Readiness remained blocked/review because the project cognition database still needs review/adoption work unrelated to this fix.

## Residual Risk

This addresses the proven chat composer render hot path. The earlier existing log also showed a React maximum update-depth warning and repeated scheduled-task notification fetch warnings, so broader GUI smoothness work may still need runtime profiling if lag remains visible outside chat/composer interactions.
