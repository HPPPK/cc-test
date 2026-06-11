# Research: Settings Provider Import Export

**Date**: 2026-06-10
**Input**: `spec.md`, `alignment.md`, `context.md`, `references.md`, and targeted live repository reads

## Summary

Provider import/export should extend the existing provider service/API/store/UI path rather than introduce a separate backup subsystem. The safest design is a server-owned provider bundle schema with default credential redaction, a separate high-friction secret export path, side-effect-free import preview, and commit-time revalidation. Existing workflow import/export UI is useful only as an interaction precedent.

## Decisions

### Provider Bundle Ownership

- **Recommendation**: Own bundle construction, validation, redaction, preview, and commit in the server provider layer.
- **Rationale**: Provider records include credentials and active provider state lives next to provider records in the index. Server ownership prevents desktop-only masking from becoming the security boundary.
- **Alternatives Considered**:
  - Desktop-only JSON export/import: rejected because it cannot reliably enforce redaction, preview side effects, or commit validation.
  - Whole-app settings backup: rejected because it exceeds provider-record scope.
- **Source Confidence**: verified.

### Bundle Shape

- **Recommendation**: Use a versioned provider-specific bundle with `containsSecrets`, `providers`, and source metadata. Include `sourceProviderId` only as metadata; generate local IDs for new imports.
- **Rationale**: Versioning enables clean rejection of unsupported bundles. Source IDs help diagnostics but must not collide with local IDs.
- **Alternatives Considered**:
  - Reuse `ProvidersIndexSchema`: rejected because it includes `activeId` and local persistence semantics.
  - Omit source IDs entirely: rejected because overwrite diagnostics benefit from source identity.
- **Source Confidence**: verified.

### Secret Export

- **Recommendation**: Keep `POST /api/providers/export` secret-free by default and require a separate secret export contract with explicit confirmation.
- **Rationale**: User confirmed optional secret export, but default leakage is the largest irreversible failure mode.
- **Alternatives Considered**:
  - Checkbox in main export dialog: rejected because it can become casual or remembered.
  - Encryption/password protection now: deferred because user confirmed high-friction warning/confirmation, not encryption.
- **Source Confidence**: verified.

### Import Preview And Commit

- **Recommendation**: Implement stateless preview and commit revalidation. Commit receives the bundle and selected resolutions again, then re-reads current provider state before writing.
- **Rationale**: This avoids persisted preview caches and stale state assumptions while preserving side-effect-free preview.
- **Alternatives Considered**:
  - Persist preview token/cache: rejected until scale or file-size concerns require it.
  - Commit client-preview results only: rejected because conflicts can change after preview.
- **Source Confidence**: verified.

### Conflict Semantics

- **Recommendation**: Detect conflicts by local ID when explicitly targeting overwrite and by display-name collision for default add/rename. Default resolution suggests a generated unique name.
- **Rationale**: The spec requires add/rename by default and explicit overwrite. Name collision is the most visible user conflict; local IDs should not be trusted for new imports.
- **Alternatives Considered**:
  - Overwrite by matching source ID automatically: rejected due to collision/shadowing risk.
  - Skip all conflicts by default: safe but less useful; add/rename better preserves user intent.
- **Source Confidence**: assumed with live-code support.

## Standard Stack

- TypeScript and existing Bun server modules: continue project style.
- Zod schemas in provider type layer: request/response validation and bundle parsing.
- React Settings UI and existing UI primitives: import/export controls and dialogs.
- Vitest/Bun tests: same-area server and desktop coverage.

## Don't Hand-Roll

- JSON validation: use structured schemas and typed transforms, not string checks.
- Credential handling: use server-owned redaction/inclusion paths, not UI-only masking.
- UI preview state: reuse existing dialog/preview patterns conceptually; do not copy workflow template schema.

## Common Pitfalls

- Accidentally exporting `activeId` because it is stored with provider records.
- Storing preview state and then trusting stale target IDs on commit.
- Rendering secret values in diagnostics or logs.
- Letting imported source IDs become local IDs.
- Updating active provider env during import by reusing activation/update code paths without guards.

## Assumptions Log

- Imported providers with missing secrets can be stored with empty `apiKey` and later edited. Existing provider service tests show providers can have empty keys for some auth strategies, but implementation must validate exact behavior for providers that need keys.
- Provider import/export UI can be tested with Testing Library/Vitest without full browser smoke unless implementation crosses native/browser file APIs in a way unit tests cannot cover.
- Exact endpoint names may be adjusted during implementation, but the contracts in `contracts/provider-import-export-api.md` define required behavior.

## Validation Notes

- Server tests must inspect persisted provider index and managed settings files before/after preview and commit.
- Desktop tests must verify warning text, second confirmation path, preview diagnostics, conflict resolution defaults, and store refresh.
- Final implementation should run narrow checks first (`bun run check:server`, `bun run check:desktop`), then `bun run verify`.

## Environment / Dependency Notes

- No external network access or provider credentials are needed for import/export tests.
- No new package dependency is planned.
- Project cognition is blocked because the DB is missing; live repository evidence is the planning authority.

## Sources

- `.specify/features/008-specify-discussions-settings/spec.md`
- `.specify/features/008-specify-discussions-settings/alignment.md`
- `.specify/features/008-specify-discussions-settings/context.md`
- `.specify/features/008-specify-discussions-settings/references.md`
- `src/server/services/providerService.ts`
- `src/server/api/providers.ts`
- `src/server/types/provider.ts`
- `src/server/__tests__/providers.test.ts`
- `desktop/src/pages/Settings.tsx`
- `desktop/src/api/providers.ts`
- `desktop/src/stores/providerStore.ts`
- `desktop/src/types/provider.ts`
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- `desktop/src/lib/providerSettingsJson.ts`
