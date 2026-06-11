# Project Context: Settings Provider Import Export

## Boundary

- current_project_root: F:\github\cc-jiangxia
- target_project_root: F:\github\cc-jiangxia
- current repository role: discussion host and implementation target
- target surface: Settings > Providers
- reference pattern: Workflow import/export dialog and server preview/commit model

## Project Cognition Status

- status: blocked
- freshness: missing
- graph_ready: false
- lexicon command failed because `project-cognition.db` is missing.
- Handling: continue with live repository evidence; carry coverage gap forward.

## Live Evidence Checked

- `desktop/src/pages/Settings.tsx`
- `desktop/src/api/providers.ts`
- `desktop/src/stores/providerStore.ts`
- `desktop/src/types/provider.ts`
- `desktop/src/lib/providerSettingsJson.ts`
- `desktop/src/lib/__tests__/providerSettingsJson.test.ts`
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- `src/server/api/providers.ts`
- `src/server/services/providerService.ts`
- `src/server/types/provider.ts`
- `src/server/__tests__/providers.test.ts`

## Verified Project Facts

- Settings defaults to the providers tab and renders `ProviderSettings`.
- ProviderSettings currently supports saved provider list, official provider, create/edit modal, delete confirmation, activation, and testing.
- The desktop provider API wrapper has no provider import/export methods.
- The provider store has no provider import/export actions.
- The server provider API has no provider import/export routes.
- Provider persistence includes API keys and active provider state.
- Activating a provider syncs provider-managed environment variables into cc-jiangxia managed settings.
- Existing provider deletion blocks active-provider deletion.
- Existing settings JSON helpers mask and restore secret env values in the form-level JSON editor.
- Existing workflow import/export UI provides a validated preview and commit model suitable as an interaction precedent.

## Evidence Conflicts

- Frontend `SavedProvider.apiKey` comment says the server masks `apiKey`.
- Server provider API tests currently expect GET `/api/providers` to return the raw API key.
- This conflict directly affects export security assumptions and must be resolved before implementation.

## Advice Confidence

- advice_confidence: medium
- Reason: enough live evidence exists to recommend product shape and risk boundaries, but project cognition is unavailable and the apiKey masking behavior has conflicting evidence.
