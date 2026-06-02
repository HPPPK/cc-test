# Desktop Immediate Cancel Restores Input

## Outcome

Fixed desktop chat immediate-cancel behavior. A prompt submitted and stopped before assistant output starts is removed from the optimistic message list, restored into the composer, and the session/tab state is forced back to idle so stale thinking/status websocket events do not make the UI look active.

## Root Cause

`sendMessage` optimistically appended the user prompt and set `chatState: 'thinking'`. `stopGeneration` only sent `stop_generation` and made the session idle; it did not know which optimistic prompt was still safe to undo, did not prefill the composer, and late non-idle websocket status could re-enter thinking after cancel.

## Changed Code Paths

modified:
- `desktop/src/stores/chatStore.ts`
- `desktop/src/stores/chatStore.test.ts`
- `desktop/src/components/chat/ChatInput.test.tsx`
- `.specify/project-cognition/status.json`
- `.planning/quick/001-desktop-cancel-restore-input/STATUS.md`

added:
- `.planning/quick/001-desktop-cancel-restore-input/SUMMARY.md`

deleted:
- none

renamed:
- none

## Changed Behavior Surfaces

- desktop chat store send/cancel state: fixed in this quick task.
- desktop composer restore behavior: fixed in this quick task.
- stale local stop/thinking state handling: fixed in this quick task.
- existing partial streamed output after later cancel: confirmed correct by focused tests.
- server/provider lifecycle: not checked in this pass because live desktop evidence showed no server/provider contract change was required.

## Verification Evidence

- RED from worker: `cd desktop && bun run test -- src/stores/chatStore.test.ts src/components/chat/ChatInput.test.tsx --run` failed before production fix with two new tests proving the submitted prompt remained in messages and the composer stayed empty after immediate Stop.
- GREEN focused: `cd desktop && bun run test -- src/stores/chatStore.test.ts src/components/chat/ChatInput.test.tsx --run` passed with 2 files and 90 tests.
- Typecheck: `cd desktop && bun run lint` passed.
- Desktop gate: `bun run check:desktop` passed, including desktop lint, 94 Vitest files / 799 tests, and production build.

## Residual Risk

- Attachment restoration is limited to the existing composer prefill attachment shape; the requested text restoration is covered.
- Project cognition was stale/blocked for this area, so live code and tests drove the fix.
- Existing unrelated React `act(...)` warnings appeared in `generalSettings.test.tsx` during the full desktop test run; they did not fail the gate and are outside this change.

## Project Cognition Refresh

- Attempted `specify map-update`; current CLI exposed it only as a workflow entrypoint/help surface and did not perform a refresh.
- Ran `project-cognition mark-dirty` with the changed desktop chat paths. Project cognition now recommends `$sp-map-update` before future brownfield workflow reliance on this area.
