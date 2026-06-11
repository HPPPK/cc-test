---
id: 20260605
slug: env-variable-management
workflow: sp-quick
status: resolved-with-server-gate-blocker
created: 2026-06-05
---

# Summary

Added a desktop Settings > Environment page for managing Agent environment variables. The page stores values in the existing `settings.env` user settings shape, keeps values hidden by default, validates names before save, supports add/edit/delete, and updates the desktop settings store without introducing a new persistence key.

The server now detects `settings.env` changes on `PUT /api/settings/user`, computes a diff, and broadcasts runtime environment updates to all active Agent sessions through the existing `update_environment_variables` control message. Runtime messages accept `string | null` values so changed variables are set and deleted variables are unset inside the running CLI process environment.

# Changed Code Paths

- `desktop/src/pages/EnvironmentSettings.tsx`
- `desktop/src/pages/EnvironmentSettings.test.tsx`
- `desktop/src/pages/Settings.tsx`
- `desktop/src/pages/Settings.test.tsx`
- `desktop/src/stores/settingsStore.ts`
- `desktop/src/stores/settingsStore.test.ts`
- `desktop/src/stores/uiStore.ts`
- `desktop/src/types/settings.ts`
- `desktop/src/i18n/locales/en.ts`
- `desktop/src/i18n/locales/zh.ts`
- `src/server/api/settings.ts`
- `src/server/services/conversationService.ts`
- `src/server/__tests__/settings.test.ts`
- `src/server/__tests__/conversations.test.ts`
- `src/entrypoints/sdk/controlSchemas.ts`
- `src/cli/structuredIO.ts`
- `src/cli/structuredIO.test.ts`

# Behavior Surfaces

- Desktop settings navigation now includes an Environment tab.
- Desktop settings state hydrates and persists `settings.env`.
- Server settings API preserves existing user settings merge behavior while normalizing `env`.
- Active Agent sessions receive added, changed, and removed environment variables without app restart.
- CLI structured IO applies runtime env changes to `process.env` and unsets keys when the server sends `null`.

# Runtime Semantics

Running Agent sessions receive the new environment map over the existing SDK control channel. The running CLI process updates its own `process.env`, so future tool/runtime reads and child processes started after the update see the new values. This does not claim impossible OS-level mutation of an already-started external subprocess that has already copied its environment.

# Verification Evidence

- RED then GREEN: `bun test src/server/__tests__/conversations.test.ts -t "environment variable updates"`
- RED then GREEN: `bun test src/server/__tests__/settings.test.ts -t "sync settings env"`
- RED then GREEN: `cd desktop && bun run test -- --run src/stores/settingsStore.test.ts -t "agent environment"`
- GREEN: `bun test src/cli/structuredIO.test.ts`
- GREEN: `bun test src/server/__tests__/conversations.test.ts src/server/__tests__/settings.test.ts src/cli/structuredIO.test.ts` passed 3 files / 107 tests.
- GREEN: `cd desktop && bun run test -- --run src/pages/EnvironmentSettings.test.tsx src/pages/Settings.test.tsx`
- GREEN: `bun run check:desktop` passed desktop `tsc`, 97 Vitest files / 834 tests, and production build. Existing GeneralSettings act warnings remained warnings.
- UI smoke: desktop preview served `http://127.0.0.1:4173` with HTTP 200 and content length 4518.
- BLOCKED: `bun run check:server` failed before test execution because repository quarantine entries are expired and require review: `server:cron-scheduler`, `server:providers-real`, `server:tasks`, `server:e2e:business-flow`, `server:e2e:full-flow`.

# Project Cognition

Initial lexicon lookup was blocked by an `active_generation_id` mismatch between `status.json` and the project cognition DB. An inline update payload was prepared at `.specify/project-cognition/updates/20260605-env-variable-management.json`, but both `project-cognition update` and `project-cognition mark-dirty` failed with the same agreement blocker.

# Residual Risk

The broad server check could not run until the existing quarantine manifest review dates are resolved. Project cognition refresh also remains blocked by the local active generation mismatch. Focused server and CLI tests for the changed runtime behavior pass.
