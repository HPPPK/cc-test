# Settings Skills Search And Sort

## Outcome

Implemented search and sorting for the desktop Settings skills page.

- Added a search field that matches skill name, display name, description, source label, version, plugin name, namespace, and reference id.
- Added sorting by name A-Z/Z-A, updated newest/oldest, created newest/oldest, and largest content first.
- Changed the rendered skills list to a single globally sorted result list while preserving source badges/labels on each skill.
- Added an empty-match state and English/Chinese UI strings.
- Added read-only `createdAt` and `updatedAt` metadata to `/api/skills` using the local `SKILL.md` file birth time and modified time.

## Changed Surfaces

- `desktop/src/components/skills/SkillList.tsx`
- `desktop/src/types/skill.ts`
- `desktop/src/i18n/locales/en.ts`
- `desktop/src/i18n/locales/zh.ts`
- `desktop/src/__tests__/skillsSettings.test.tsx`
- `src/server/api/skills.ts`
- `src/server/__tests__/skills.test.ts`

## Verification

- RED desktop: `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx --run` failed before implementation because the search control did not exist.
- RED server: `bun test src/server/__tests__/skills.test.ts` failed before implementation because `/api/skills` omitted `createdAt` and `updatedAt`.
- GREEN focused desktop: `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx --run` passed 7 tests after the global sort fix.
- GREEN focused server: `bun test src/server/__tests__/skills.test.ts` passed 5 tests.
- Desktop gate: `bun run check:desktop` passed after implementation.
- Server gate: `bun run check:server` passed after implementation.
- Coverage gate: `bun run check:coverage --changed` passed.
  - Latest coverage report: `artifacts/coverage/2026-06-01T07-27-17-176Z/coverage-report.md`
  - Changed-line coverage: 97.16% (1606/1653), failures none.

## Unified Gate Status

`bun run verify` produced `artifacts/quality-runs/2026-06-01T07-06-33-741Z/report.md`.

- Passed: 9
- Failed: 1
- Skipped: 1
- PR readiness: NOT READY

The failed lane is `Native desktop checks` / `bun run check:native`. The native log shows the Tauri build script panicked inside `tauri-build-2.5.6` with Windows `PermissionDenied` (`拒绝访问。`) while running `cargo check`. This is outside the scoped Settings skills UI/API change, but it blocks a clean PR-ready claim.

## Project Cognition Closeout

- Entry project cognition query was blocked by `project-cognition.db metadata missing baseline_kind`, so live repository evidence drove implementation.
- Inline `project-cognition update` was run with the changed paths and returned `readiness: blocked` / `recommended_next_action: review_project_cognition_update`.
- Fallback `project-cognition mark-dirty` was run for the changed skills UI/API/test scopes. Current recommendation is `run_map_update`.

## Surface Conclusions

- Desktop Settings skills search/sort: fixed in this quick task.
- `/api/skills` timestamp metadata: fixed in this quick task.
- Same-area desktop and server regression coverage: confirmed correct.
- Full repository PR gate: not checked as clean in this pass; unified report is blocked by the native Tauri permission failure above.
