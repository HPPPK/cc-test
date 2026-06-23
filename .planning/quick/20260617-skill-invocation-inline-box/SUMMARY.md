# Inline Skill Invocation Marker Summary

## Outcome

Fixed in this quick task. The desktop chat composer now displays a leading skill invocation such as `/update-config` as an inline marker at the typed token position, using the existing skill marker color treatment rather than the red annotation color from the screenshot. Sent user messages continue to show the leading slash skill token as a marked token.

## Changed Code Paths

Modified:
- `desktop/src/components/chat/ChatInput.tsx`
- `desktop/src/components/chat/ChatInput.test.tsx`
- `desktop/src/components/chat/UserMessage.test.tsx`
- `.planning/quick/20260617-skill-invocation-inline-box/STATUS.md`
- `.specify/project-cognition/status.json`
- `.specify/project-cognition/project-cognition.db`
- `.specify/project-cognition/workbench/map-state.md`

Added:
- `.planning/quick/20260617-skill-invocation-inline-box/SUMMARY.md`
- `.specify/project-cognition/updates/20260617-skill-invocation-inline-box.json`

Related pre-existing dirty files used by this task:
- `desktop/src/components/chat/UserMessage.tsx`
- `desktop/src/components/chat/composerUtils.ts`

## Behavior Surfaces

Desktop chat composer: fixed in this quick task. The leading skill token is displayed by an overlay layer inside the textarea wrapper. The textarea still owns the actual value, focus, caret, editing, and submit behavior.

Desktop sent user message rendering: confirmed correct. The leading skill token is still rendered as a marked inline token in submitted conversation messages.

Skill execution semantics, provider routing, server behavior, persistence, and prompt text: not changed in this quick task.

## Verification

Focused RED check:
- `cd desktop && bun run test --run src/components/chat/ChatInput.test.tsx -t "shows a distinct inline composer marker"`
- Failed before production edits because the composer did not expose an inline editor marker and the old separate chip remained.

Focused GREEN check:
- `cd desktop && bun run test --run src/components/chat/ChatInput.test.tsx -t "shows a distinct inline composer marker"`
- Passed after the inline overlay implementation.

Same-area chat checks:
- `cd desktop && bun run test --run src/components/chat/ChatInput.test.tsx src/components/chat/UserMessage.test.tsx src/components/chat/composerUtils.test.ts`
- Passed: 3 files / 48 tests.

Desktop validation:
- `bun run check:desktop`
- Passed: 98 test files / 890 tests, TypeScript no-emit, and production Vite build.

Diff hygiene:
- `git diff --check -- desktop/src/components/chat/ChatInput.tsx desktop/src/components/chat/ChatInput.test.tsx desktop/src/components/chat/UserMessage.test.tsx .planning/quick/20260617-skill-invocation-inline-box/STATUS.md`
- Passed. Git reported LF-to-CRLF warnings only.

Quality gate:
- Initial `bun run verify` failed in `Native desktop checks` because Windows denied access to the default `desktop/src-tauri/target` directory.
- Recovery: `cargo check` passed under `desktop/src-tauri` with `CARGO_TARGET_DIR=%TEMP%\cc-jiangxia-tauri-target-inline-marker`.
- Final `bun run verify` with the isolated Cargo target produced `artifacts/quality-runs/2026-06-17T12-47-13-156Z/report.md`.
- Final report summary: 9 passed / 0 failed / 2 skipped.
- Coverage report: `artifacts/coverage/2026-06-17T12-51-21-055Z/coverage-report.md`.
- Coverage failures: none.
- PR readiness remained `NOT READY` because the repository worktree had 742 changed files, live-provider checks were escalated but not run, and adapter/docs lanes were skipped because the impact report did not require them.

## Project Cognition Closeout

Inline update payload:
- `.specify/project-cognition/updates/20260617-skill-invocation-inline-box.json`

Update command result:
- `result_state: partial_refresh`
- `update_id: upd-20260617T123735.183152300Z`
- `readiness: review`

Review paths / minimal live reads returned by closeout:
- `desktop/src/components/chat/ChatInput.test.tsx`
- `desktop/src/components/chat/ChatInput.tsx`
- `desktop/src/components/chat/UserMessage.test.tsx`
- `desktop/src/components/chat/UserMessage.tsx`
- `desktop/src/components/chat/composerUtils.test.ts`
- `desktop/src/components/chat/composerUtils.ts`

Conclusion: project cognition closeout is recorded but not clean. Treat the map as needing review before using it as fresh authoritative routing state.

## Residual Risk

No browser screenshot was captured in this runtime. The in-app browser control tool was not available, and this repo does not expose a Playwright dependency for an equivalent local screenshot pass. The behavior was verified through DOM/component tests, TypeScript checks, desktop build, coverage, and the quality gate lanes listed above.

The repository contains many unrelated pre-existing modifications. This quick task did not attempt to revert or normalize those changes, and the full PR gate remains policy-blocked until the broader dirty worktree and live-check expectations are handled.
