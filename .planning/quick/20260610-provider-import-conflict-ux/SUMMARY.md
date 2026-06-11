# Provider Import Conflict UX Cleanup

## Outcome

Improved the Settings > Providers import preview so duplicate/conflict states are presented in user-facing language instead of raw backend diagnostics, and replaced the per-provider native resolution select with explicit action buttons.

## Changed Code Paths

- Modified: `desktop/src/pages/Settings.tsx`
- Modified: `desktop/src/__tests__/generalSettings.test.tsx`
- Modified: `desktop/src/i18n/locales/en.ts`
- Modified: `desktop/src/i18n/locales/zh.ts`

## Changed Behavior Surfaces

- Provider import preview conflict copy now uses localized user-facing messages.
- Provider import candidate diagnostics no longer render severity/code/path fields by default.
- Provider conflict chip now displays a friendly duplicate label instead of raw conflict type.
- Provider import resolution is now selected through explicit action buttons for add, rename, overwrite, and skip.
- Existing import semantics are preserved: commit resolutions still send `add`, `rename`, `overwrite`, and `skip`.
- Rename and overwrite follow-up fields remain visible only when those actions are selected.

## Verification Evidence

- Worker: `cd desktop; bun run test -- --run src/__tests__/generalSettings.test.tsx -t "Settings > Providers tab"` -> passed, 17 passed / 37 skipped.
- Worker: `cd desktop; bun run lint` -> passed.
- Leader: `cd desktop; bun run test -- --run src/__tests__/generalSettings.test.tsx -t "Settings > Providers tab"` -> passed, 17 passed / 37 skipped.
- Leader: `cd desktop; bun run lint` -> passed.
- Leader: `cd desktop; bun run test -- --run src/__tests__/generalSettings.test.tsx` -> passed, 54 passed, with pre-existing GeneralSettings act warnings.
- Leader: `bun run check:desktop` -> passed, 98 test files and 853 tests passed; production build passed, with pre-existing GeneralSettings act warnings.
- Leader: `git diff --check -- desktop/src/pages/Settings.tsx desktop/src/__tests__/generalSettings.test.tsx desktop/src/i18n/locales/en.ts desktop/src/i18n/locales/zh.ts .planning/quick/20260610-provider-import-conflict-ux/STATUS.md` -> passed.
- Leader: `Invoke-WebRequest http://127.0.0.1:5173/` -> 200.

## Surface Sweep

- Implementation: fixed in this quick task.
- Tests: fixed in this quick task.
- i18n: fixed in this quick task.
- API/server contracts: confirmed unchanged in this quick task.
- Full repo gate: not rerun after this task; previous same-session `bun run verify` was blocked by the running desktop sidecar locking `desktop/src-tauri/target/debug/claude-sidecar.exe`. The native compile itself passed with a temporary `CARGO_TARGET_DIR`.

## Residual Risk

- The workspace already contains broader uncommitted provider import/export and settings changes outside this quick task. This task worked with those files and did not revert unrelated changes.
- No browser screenshot was captured because the available verification path for this pass was component tests plus desktop build.

## Project Cognition Refresh

- Inline closeout update ran with `.specify/project-cognition/updates/20260610-provider-import-conflict-ux.json`.
- Result: `partial_refresh`, readiness `review`, update id `upd-20260610T124434.718378000Z`.
- Returned minimal live reads: `desktop/src/pages/Settings.tsx`, `desktop/src/__tests__/generalSettings.test.tsx`, `desktop/src/i18n/locales/en.ts`, `desktop/src/i18n/locales/zh.ts`, `desktop/src/api/providers.ts`, `desktop/src/types/providerImportExport.ts`.
