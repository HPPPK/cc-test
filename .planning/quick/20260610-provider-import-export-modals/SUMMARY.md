# Provider Import/Export Modal Workflow

## Outcome

Status: RESOLVED

The desktop Settings > Providers import/export UX now uses separate entry buttons for Export providers and Import providers. Export opens a dedicated modal with the existing provider export controls, generated JSON textarea, copy action, and save-file action. The save action prefers the browser File System Access picker and falls back to a download when the picker is unavailable. Import opens a dedicated modal with both a JSON file picker and the existing pasted JSON textarea/preview/import flow.

## Changed Files

- `desktop/src/pages/Settings.tsx` - moved provider export controls/output into an export modal; added save-file handling; added JSON file reading to the import modal; preserved existing store/API calls and credential export warning flow.
- `desktop/src/__tests__/generalSettings.test.tsx` - added focused provider settings regression coverage for export modal JSON/save-file and import paste/file inputs; updated credential warning tests to open export from the modal.
- `desktop/src/i18n/locales/en.ts` - added export entry, save-file, and import file labels/errors.
- `desktop/src/i18n/locales/zh.ts` - added matching Chinese labels/errors.

## Verification

- RED: `cd desktop && bun run test -- --run src/__tests__/generalSettings.test.tsx -t "Settings > Providers tab"` failed before production edits because the export modal entry and import file input were missing.
- GREEN narrow: `cd desktop && bun run test -- --run src/__tests__/generalSettings.test.tsx -t "Settings > Providers tab"` -> 16 passed, 37 skipped.
- GREEN same-area: `cd desktop && bun run test -- --run src/__tests__/generalSettings.test.tsx` -> 53 passed.
- Typecheck: `cd desktop && bun run lint` -> passed.
- Build: `cd desktop && bun run build` -> passed.
- Diff hygiene: `git diff --check -- desktop/src/pages/Settings.tsx desktop/src/__tests__/generalSettings.test.tsx desktop/src/i18n/locales/en.ts desktop/src/i18n/locales/zh.ts` -> passed with CRLF conversion warnings only.
- Leader narrow rerun after save-file refinement: `cd desktop && bun run test -- --run src/__tests__/generalSettings.test.tsx -t "Settings > Providers tab"` -> 17 passed, 37 skipped.
- Leader same-area rerun: `cd desktop && bun run test -- --run src/__tests__/generalSettings.test.tsx` -> 54 passed.
- Desktop gate: `bun run check:desktop` -> passed; 98 test files and 853 tests passed, then typecheck and Vite build passed.
- Final diff hygiene: `git diff --check -- desktop/src/pages/Settings.tsx desktop/src/__tests__/generalSettings.test.tsx desktop/src/i18n/locales/en.ts desktop/src/i18n/locales/zh.ts .planning/quick/20260610-provider-import-export-modals/STATUS.md .planning/quick/20260610-provider-import-export-modals/SUMMARY.md` -> passed with CRLF conversion warnings only.

## Notes

- Provider import/export payload semantics and credential safety remain routed through the existing provider store/API methods.
- The worktree contains many unrelated pre-existing modifications; this lane did not revert or edit them.
- Full repository `bun run verify` was not run after `check:desktop`; this quick task changed the desktop settings surface and used the desktop gate as the matching local quality gate.

## Project Cognition Refresh

- `project-cognition update --payload-file .specify/project-cognition/updates/20260610-provider-import-export-modals.json --reason workflow-finalize --format json` completed with `result_state: partial_refresh`.
- Review paths returned: `desktop/src/pages/Settings.tsx`, `desktop/src/__tests__/generalSettings.test.tsx`, `desktop/src/i18n/locales/en.ts`, `desktop/src/i18n/locales/zh.ts`.
- Minimal live reads returned for future review are the same four desktop paths.

## Learning

- `specify learning capture-auto --command quick` was attempted twice; the second attempt supplied the workspace, but the tool failed while parsing command snippets in `STATUS.md` as YAML.
- Manual learning recorded at `.specify/memory/learnings/learn-2026-06-10-desktop-export-save-picker-fallback-a8f3c2d1.md`.

## Local Try-Out

- Vite dev server is running at `http://127.0.0.1:5173/`.
- Listener PID: `99556`.
- HTTP GET `/` returned `200`.
