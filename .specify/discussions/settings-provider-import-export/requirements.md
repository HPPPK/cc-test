# Requirements: Settings Provider Import Export

## Goal

Let users export provider configuration from Settings > Providers and import it on another machine or share it with another person.

## Confirmed Scope

- Target surface: Settings > Providers in the current cc-jiangxia desktop app.
- Export reusable provider configuration:
  - provider preset/source identity
  - display name
  - base URL
  - API format
  - auth strategy
  - model mappings
  - optional auto compact window
  - optional model context windows
  - optional notes
- Import should parse JSON, validate shape, preview candidates before writing, and support conflict handling.
- Import should preserve unrelated settings and should not mutate protected/global Claude settings directly.

## Confirmed Product Decision

- Users may choose whether to include API keys/secrets in exported provider bundles.
- Secret-free export remains the default sharing path.
- Secret-including export is a high-risk path and must be explicit.
- Secret-including export must use the recommended protection level: separate dangerous action, warning, second confirmation, no remembered choice, and clear artifact labeling.
- Import conflicts default to add/rename; overwrite requires explicit user selection.
- Active/default provider selection is not exported or imported.

## Recommended Requirement Direction

- Default export is secret-free. API keys, auth tokens, OAuth tokens, and official login state are not exported unless the user explicitly chooses secret-including export.
- The UI must not remember or preselect "include secrets" from a previous export.
- The export artifact should clearly indicate whether secrets are included.
- Secret-including export should not be presented as a routine checkbox in the primary export path.
- Imported providers that lack secrets are allowed but should be clearly marked as needing an API key before successful testing or activation.
- Imported providers that include secrets should still be previewed before commit and should clearly show that credentials are present without revealing them unnecessarily in diagnostics.
- Import should not automatically activate an imported provider.
- Imported providers should get new IDs by default; overwrite must be explicit.
- Conflict preview should explain whether a provider will be added, renamed, skipped, or overwritten before commit.

## Non-Goals

- Do not export official Claude login/OAuth state.
- Do not export unrelated app settings, chat history, sessions, agents, plugins, skills, MCP config, or workflow templates as part of this provider-only feature.
- Do not silently overwrite existing providers.
- Do not silently activate an imported provider.
- Do not export or import local active/default provider selection.
- Do not write to the original user-owned `~/.claude/settings.json` as part of import.

## Acceptance Signals

- A user can export selected or all custom providers into a shareable JSON document.
- A second user can paste/import that JSON and see a preview with valid providers, invalid entries, conflicts, and missing secret warnings.
- Import can add providers without breaking existing providers or active runtime settings.
- Import does not silently overwrite existing providers.
- Export does not leak API keys in the default path.
- Secret-including export is possible only after explicit user choice and warning.
- Secret-including export requires second confirmation and does not persist the user's choice for future exports.
- Existing provider CRUD, test, activation, and connected-session refresh behavior continue to work.

## UI Discussion Status

- ui_discussion_status: offered
- confirmed_ui_decisions: []
- deferred_ui_decisions:
  - Exact placement of import/export controls in Settings > Providers.
  - Whether export appears as a single dialog with selected/all options or separate buttons.
  - Warning copy for secret-free exports and missing API keys after import.
