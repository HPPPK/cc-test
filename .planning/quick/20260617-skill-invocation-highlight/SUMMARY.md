---
id: 20260617
slug: skill-invocation-highlight
status: resolved
created: 2026-06-17T18:00:41+08:00
updated: 2026-06-17T18:15:17+08:00
---

# Skill Invocation Highlight Summary

## Outcome

Selected slash skills now get a display-only visual marker:

- The composer shows a compact `Skills /<skill>` chip when the current input starts with a known session slash skill such as `/sp-quick`.
- Sent user messages that begin with a command-like slash skill render the leading token as a colored monospace badge.
- The parser only highlights leading command-like `/tokens` followed by whitespace or end-of-string, so paths such as `/Users/name` are not treated as skill invocations.

## Changed Code Paths

modified:
- `desktop/src/components/chat/composerUtils.ts`
- `desktop/src/components/chat/ChatInput.tsx`
- `desktop/src/components/chat/ChatInput.test.tsx`
- `desktop/src/components/chat/UserMessage.tsx`
- `desktop/src/components/chat/UserMessage.test.tsx`
- `.planning/quick/20260617-skill-invocation-highlight/STATUS.md`

added:
- `.planning/quick/20260617-skill-invocation-highlight/SUMMARY.md`
- `.specify/project-cognition/updates/20260617-skill-invocation-highlight.json`

deleted: []

renamed: []

## Changed Behavior Surfaces

- `desktop chat composer`: known slash skills selected through `/...` are marked with a visible chip in the composer control area.
- `desktop user message rendering`: a leading slash skill token is highlighted in the user message bubble.
- `desktop slash parsing helper`: leading slash invocation detection is centralized in `composerUtils`.
- `desktop tests`: same-area coverage was added for both composer marker and sent-message badge.

## Surface Sweep

- composer implementation: fixed in this quick task.
- sent user message rendering: fixed in this quick task.
- slash command parsing helper: fixed in this quick task.
- same-area tests: fixed in this quick task.
- server/runtime/persistence: not checked in this pass because the confirmed scope was display-only and no persistence or execution semantics were changed.
- textarea inline coloring: not checked in this pass because native `textarea` cannot safely color partial text without an overlay/contenteditable rewrite; this quick task used a lower-risk composer chip instead.

## Verification Evidence

- RED: `bun run test --run src/components/chat/UserMessage.test.tsx -t "highlights a leading skill invocation"` failed before implementation because no `user-message-skill-invocation` marker existed.
- RED: `bun run test --run src/components/chat/ChatInput.test.tsx -t "shows a distinct composer marker"` failed before implementation because no `chat-input-skill-invocation` marker existed.
- GREEN: `bun run test --run src/components/chat/UserMessage.test.tsx -t "highlights a leading skill invocation"` passed.
- GREEN: `bun run test --run src/components/chat/ChatInput.test.tsx -t "shows a distinct composer marker"` passed.
- `bun run test --run src/components/chat/UserMessage.test.tsx src/components/chat/ChatInput.test.tsx src/components/chat/composerUtils.test.ts`: passed, 3 files / 48 tests.
- `bun run check:desktop`: passed, 98 test files / 890 tests, TypeScript, and Vite build.
- Local app reachability: `fetch http://localhost:1420` returned status 200 with app root present.
- `git diff --check` on touched files: passed with only existing LF-to-CRLF warnings.

## Project Cognition Refresh

- payload_file: `.specify/project-cognition/updates/20260617-skill-invocation-highlight.json`
- inline_update_status: blocked
- dirty_marker_status: blocked
- blocker: `project-cognition.db` metadata `schema_version` is `1`, expected `2`.
- recovery: rebuild or migrate the project cognition baseline before retrying the update; for this schema failure, run `sp-map-scan -> sp-map-build` when a usable brownfield cognition baseline is needed.

## Learning Capture

- auto_capture_status: blocked
- blocker: `specify learning capture-auto --command quick --workspace .planning/quick/20260617-skill-invocation-highlight --format json` could not parse Markdown/code-span check entries inside `STATUS.md` as YAML section bodies.
- manual_learning_update: not added; this quick task did not produce a stable project-level rule beyond the local implementation summary.

## Residual Risk

- Visual browser screenshot was not captured because Playwright is not installed in this workspace. Component tests verify the DOM badge/chip and the local app is reachable.
- Several desktop files were already dirty before this quick task; this summary records only the incremental changes made for skill invocation highlighting.
