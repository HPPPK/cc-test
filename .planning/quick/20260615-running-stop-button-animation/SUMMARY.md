# Running Stop Button Animation

## Status

Resolved.

## Changed Files

- `desktop/src/components/chat/ChatInput.tsx` - Adds a local `showStopAction` branch and applies the running animation class to the active Stop button.
- `desktop/src/components/chat/ChatInput.test.tsx` - Adds focused coverage that idle Run has no running class, active Stop has the whole-button animation class, and no small indicator marker is rendered.
- `desktop/src/theme/globals.css` - Adds a fixed-size asynchronous multi-layer edge/surface highlight animation for the running Stop button with reduced-motion handling and no `color-mix()`.
- `.specify/project-cognition/updates/20260615-running-stop-button-animation.json` - Records workflow closeout evidence for project cognition.

## Verification

- `cd desktop; bun test src/components/chat/ChatInput.test.tsx -t "running"` - Failed before test execution because Bun native test runner does not support `vi.hoisted`.
- `cd desktop; bun run test src/components/chat/ChatInput.test.tsx -t "running"` - Passed after whole-button revision, 1 test passed and 26 skipped.
- `cd desktop; bun run test vite-config.test.ts` - Passed, 2 tests passed.
- `cd desktop; bun run lint` - Passed after whole-button revision, `tsc --noEmit`.
- `bun run check:desktop` - First rerun caught a forbidden `color-mix()` CSS usage; final rerun passed desktop lint, full desktop Vitest suite, and production build.
- Natural-light follow-up reran `cd desktop; bun run test src/components/chat/ChatInput.test.tsx -t "running"` - Passed, 1 test passed and 26 skipped.
- Natural-light follow-up reran `cd desktop; bun run test vite-config.test.ts` - Passed, 2 tests passed.
- Natural-light follow-up reran `cd desktop; bun run lint` - Passed, `tsc --noEmit`.
- Natural-light follow-up reran `bun run check:desktop` - Passed desktop lint, full desktop Vitest suite, and production build.
- `project-cognition update --payload-file .specify/project-cognition/updates/20260615-running-stop-button-animation.json --reason workflow-finalize --format json` - Latest rerun completed with `update_id: upd-20260615T080329.136110600Z` and `result_state: partial_refresh`.
- `specify learning capture-auto --command quick --workspace .planning/quick/20260615-running-stop-button-animation` - Skipped; current `specify --help` exposes no `learning` subcommand.

## Notes

- No backend, session lifecycle, store, model selector, context usage indicator, or layout dimension was changed.
- Existing unrelated dirty changes remain in `desktop/src/theme/globals.css`; this task only added the running Stop button animation block there.
- Cognition remains partial because the broader working tree has many stale dirty workflow/UI paths; live code and focused tests are the completion evidence for this quick task.
