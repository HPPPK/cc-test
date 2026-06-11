# References: Settings Provider Import Export

## Discussion Artifacts

- `.specify/discussions/settings-provider-import-export/handoff-to-specify.md`
- `.specify/discussions/settings-provider-import-export/handoff-to-specify.json`
- `.specify/discussions/settings-provider-import-export/discussion-log.md`
- `.specify/discussions/settings-provider-import-export/requirements.md`
- `.specify/discussions/settings-provider-import-export/technical-options.md`
- `.specify/discussions/settings-provider-import-export/project-context.md`
- `.specify/discussions/settings-provider-import-export/open-questions.md`

## Live Repository Evidence

- `desktop/src/pages/Settings.tsx`: Settings > Providers surface and current provider CRUD/test/activation/delete UI.
- `desktop/src/api/providers.ts`: desktop provider API wrapper; no import/export methods today.
- `desktop/src/stores/providerStore.ts`: provider store and refresh behavior; no import/export actions today.
- `desktop/src/types/provider.ts`: provider record shape and credential-bearing `apiKey` field.
- `desktop/src/lib/providerSettingsJson.ts`: existing Settings JSON secret masking/restore helper.
- `desktop/src/lib/__tests__/providerSettingsJson.test.ts`: existing masking/restore test precedent.
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`: import/export preview and commit interaction precedent.
- `src/server/api/providers.ts`: server provider REST routes; no import/export routes today.
- `src/server/services/providerService.ts`: provider persistence, ID generation, activation sync, and provider runtime lookup.
- `src/server/types/provider.ts`: provider Zod schemas and provider index shape.
- `src/server/__tests__/providers.test.ts`: provider API/service behavior tests and raw API key evidence conflict.

## Project Cognition Evidence

- `.specify/project-cognition/status.json`: reports blocked/missing readiness because `.specify/project-cognition/project-cognition.db` is absent.
- Project cognition lexicon query failed for this feature. This is a coverage gap, not a blocker for artifact-only specification because targeted live repository reads were used.

## Reference Interpretation

- The workflow import/export dialog is only a process/UI precedent.
- ProviderService and server provider schemas are the implementation ownership anchors.
- Existing provider tests are the closest verification precedent.
- The raw-vs-masked API key conflict must be resolved by downstream planning/implementation before security-ready claims.
