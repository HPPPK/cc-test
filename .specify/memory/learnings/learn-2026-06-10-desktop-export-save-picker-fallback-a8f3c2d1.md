# Desktop Export Save Picker Fallback

## Metadata

- Type: `pitfall`
- Source Command: `sp-quick`
- Recurrence Key: `desktop-export-save-picker-fallback`
- Applies To: `sp-quick`, `sp-implement`, `desktop settings ui`
- First Seen: `2026-06-10T12:03:00Z`

## Problem

Desktop export flows that ask for "save file" can accidentally degrade into a plain browser download if the implementation does not verify that the app has a usable file-write path.

## Lesson

For desktop settings export modals, first check the available write surface. In this project, `dialog:allow-save` was enabled, but there was no Tauri FS write plugin or server write endpoint for arbitrary selected paths. The provider export modal therefore uses the browser File System Access save picker when available and falls back to a download link when unavailable.

Keep a same-area test for the save-picker branch so future UI work does not silently regress to download-only behavior.

## Evidence

- Quick workspace: `.planning/quick/20260610-provider-import-export-modals/`
- Code path: `desktop/src/pages/Settings.tsx`
- Test path: `desktop/src/__tests__/generalSettings.test.tsx`
- Verification: `bun run check:desktop` passed with 98 desktop test files and 853 tests, then typecheck and Vite build.
