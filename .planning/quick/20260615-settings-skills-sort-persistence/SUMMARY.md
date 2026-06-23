# Settings Skills Sort Persistence

## Outcome

Fixed the desktop Settings skills page so the selected sort option remains active when the user leaves the Skills tab and returns during the same Settings session.

- `SkillList` now receives the selected sort and change handler from its parent instead of owning sort state locally.
- `Settings` owns the Skills sort state and passes it through `SkillSettings`, so tab switches no longer reset the selection to `name`.
- Added a regression test for selecting `Updated newest`, switching to `General`, and returning to `Skills`.

## Changed Code Paths

- modified: `desktop/src/components/skills/SkillList.tsx`
- modified: `desktop/src/pages/Settings.tsx`
- modified: `desktop/src/__tests__/skillsSettings.test.tsx`
- added: `.planning/quick/20260615-settings-skills-sort-persistence/STATUS.md`
- added: `.planning/quick/20260615-settings-skills-sort-persistence/SUMMARY.md`

## Changed Behavior Surfaces

- Desktop Settings skills list sort state
- Desktop Settings tab navigation return behavior
- Same-area skills settings regression coverage

## Verification Evidence

- RED focused desktop: `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx -t "keeps the selected skill sort"` failed because the sort select returned to `name`.
- GREEN focused desktop: `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx -t "keeps the selected skill sort"` passed.
- GREEN same-area desktop file: `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx` passed 10 tests.
- `cd desktop; bun run lint` passed.
- `cd desktop; bun run build` passed.
- `git diff --check -- desktop/src/components/skills/SkillList.tsx desktop/src/pages/Settings.tsx desktop/src/__tests__/skillsSettings.test.tsx .planning/quick/20260615-settings-skills-sort-persistence/STATUS.md` passed with CRLF warnings only.

## Full Desktop Gate

`bun run check:desktop` did not pass because `vite-config.test.ts` rejects `color-mix(` in `desktop/src/theme/globals.css`. That CSS change belongs to the existing running-stop-button animation work and is outside this Skills sort persistence patch. The skills settings test file passed within that run.

## Surface Conclusions

- Desktop Settings skills sort state: fixed in this quick task.
- Desktop Settings skills search/sort behavior: confirmed correct by same-area tests.
- Desktop lint/typecheck: confirmed correct.
- Desktop production build: confirmed correct.
- Full desktop test gate: not clean in this pass due to unrelated `desktop/src/theme/globals.css` compatibility failure.

## Project Cognition Refresh

Inline update ran with payload `.specify/project-cognition/updates/20260615-settings-skills-sort-persistence.json`.

- `update_id`: `upd-20260615T075309.896683500Z`
- `result_state`: `partial_refresh`
- `readiness`: `review`
- `recommended_next_action`: `review_project_cognition_update`
- `minimal_live_reads`: `desktop/src/__tests__/skillsSettings.test.tsx`, `desktop/src/components/skills`, `desktop/src/components/skills/SkillList.tsx`, `desktop/src/pages/Settings.tsx`

This is a partial cognition closeout, not a clean `ready` closeout.

## Learning Capture

`specify learning capture-auto --command quick --workspace .planning\quick\20260615-settings-skills-sort-persistence --format json` returned `no-op`; no high-signal auto-capture pattern matched.
