# Implementation Plan: Settings Provider Import Export

**Branch**: `008-specify-discussions-settings` | **Date**: 2026-06-10 | **Spec**: `spec.md`
**Input**: Feature specification from `.specify/features/008-specify-discussions-settings/spec.md`

## Summary

Add provider-specific import/export to Settings > Providers by introducing a server-owned provider bundle schema, export routes, import preview, and import commit flow. The desktop will add provider import/export controls and dialogs, but the server owns validation, redaction, conflict decisions, generated IDs, and the rule that import/export never transfers active/default provider selection.

The default export path is secret-free. Secret-including export remains possible only through a separate dangerous action with explicit confirmation and credential-bearing artifact labeling.

## Locked Planning Decisions

- Provider import/export covers saved provider records only.
- Default provider export is secret-free and server-redacted.
- Secret-including export is a separate dangerous action, not a remembered checkbox.
- Imported providers do not auto-activate and do not write active provider env.
- Active/default provider selection is not exported or imported.
- Import preview is side-effect free.
- Import commit validates server-side and is additive by default.
- Conflicts default to add/rename; overwrite requires explicit user resolution.
- New imports use generated local IDs by default.
- Workflow import/export is an interaction precedent only, not a provider data model.

## Must-Preserve Carry-Forward

| MP ID | Type | Planning Obligation | Plan Location | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- |
| MP-001 | goal | Keep provider configuration sharing as the product goal. | Summary, Project Structure | Feature becomes unrelated settings backup. |
| MP-002 | scope | Scope bundle schema to saved provider records only. | Data Model, Boundary Ownership | Plan includes chat, MCP, skills, workflows, plugins, or global settings. |
| MP-003 | decision | Support both secret-free and secret-including export paths. | API Contract, Operational Consequence Design | Secret export is omitted or made default. |
| MP-004 | decision | Default export must redact credentials server-side. | Architecture Invariants, Validation | Default export includes API keys or tokens. |
| MP-005 | decision | Secret export must be high-friction and labeled. | API Contract, UI Plan, Quickstart | Secret export is remembered, casual, or unlabeled. |
| MP-006 | decision | Conflict default is add/rename; overwrite is explicit. | Data Model, Import Commit Contract | Import silently overwrites. |
| MP-007 | non_goal | Active/default provider selection is excluded. | Data Model, CA-003 | Import changes active provider selection. |
| MP-008 | scenario | Import preview diagnoses entries before commit. | API Contract, Quickstart | Preview writes or hides diagnostics. |
| MP-009 | reference | Reuse workflow dialog interaction shape only. | Research Inputs, UI Plan | Workflow template semantics leak into provider bundle schema. |
| MP-010 | evidence gap | Resolve raw-vs-masked API key behavior by requiring server-owned export redaction. | Architecture Invariants, Risks | Export relies only on frontend masking. |

## Implementation Target Boundary

- **Current project root**: `F:/github/cc-jiangxia`
- **Current project roles**: discussion host and implementation target.
- **Target project root**: `F:/github/cc-jiangxia`
- **Target project roles**: implementation target for Settings > Providers UI, provider API/store/types, server provider REST API/service/types, provider persistence, and managed settings sync.
- **Target paths/modules**:
  - `src/server/types/provider.ts` or colocated provider import/export schema module
  - `src/server/services/providerService.ts`
  - `src/server/api/providers.ts`
  - `src/server/__tests__/providers.test.ts`
  - `desktop/src/types/provider.ts`
  - `desktop/src/api/providers.ts`
  - `desktop/src/stores/providerStore.ts`
  - `desktop/src/pages/Settings.tsx` or a new provider-specific dialog component imported by Settings
  - `desktop/src/i18n/locales/en.ts`
  - `desktop/src/i18n/locales/zh.ts`
  - focused desktop provider/settings tests
- **Target evidence status**: Live repository reads verified current provider CRUD/test/activation behavior and absence of import/export.
- **Reference sources**: Workflow import/export dialog as interaction precedent only.
- **Cognition scope rule**: Project cognition is blocked because `.specify/project-cognition/project-cognition.db` is missing. Plan uses live repository evidence and carries this gap forward.
- **Stop condition**: Stop and return to specification if implementation needs whole-app backup, active/default selection transfer, or official OAuth/login migration.

## Scenario Profile Inputs

### Active Profile

- `Standard Delivery`.
- Source artifact: `workflow-state.md` does not record a specialized reference-implementation profile. The feature is cross-boundary and security-sensitive, but it is a normal product feature rather than a rewrite/fidelity project.

### Profile-Driven Implementation Constraints

- Standard plan artifacts are required: `plan.md`, `research.md`, `data-model.md`, API contract, `quickstart.md`, and `plan-contract.json`.
- The plan must preserve security and state consequences through `CA-###` obligations and task-level validation.

## Technical Context

**Language/Version**: TypeScript, ESM, Bun runtime.
**Primary Dependencies**: Existing server provider API/service/types, Zod validation, React desktop UI, Zustand provider store, Testing Library/Vitest for desktop tests.
**Storage**: File-backed provider index under `~/.claude/cc-jiangxia/providers.json`; managed settings under `~/.claude/cc-jiangxia/settings.json`.
**Testing**: Bun/Vitest suites through same-area server and desktop checks; final non-live gate remains `bun run verify` for implementation readiness.
**Target Platform**: Desktop app plus local Bun server API.
**Project Type**: Bun CLI/local server with React desktop frontend.
**Performance Goals**: Provider import/export should be immediate for normal user-scale provider lists; no streaming or background job required.
**Constraints**: Security-by-default, no secret leakage in default export, no active provider mutation during import, preserve unknown fields in user-owned settings surfaces, and avoid unrelated refactors.
**Scale/Scope**: Small provider lists in a local configuration file; optimize for correctness and recoverability over bulk throughput.

## Implementation Constitution

### Architecture Invariants

- Server-side schemas validate every bundle, preview request, and commit request.
- Server-side export redaction is mandatory. Desktop masking is only presentation, not a security boundary.
- Import preview and import commit are separate operations. Preview must not write provider persistence or managed settings.
- Import commit revalidates the bundle and requested resolutions; it cannot trust stale client preview data.
- Import commit never calls provider activation or active settings sync.
- Export/import schema excludes active provider IDs as local selection, even if the bundle records source IDs for diagnostics.
- Provider bundle versioning must exist so unsupported bundles fail clearly.

### Boundary Ownership

- Provider persistence owner: `src/server/services/providerService.ts`.
- Provider API owner: `src/server/api/providers.ts`.
- Provider schema owner: `src/server/types/provider.ts` or a new colocated provider import/export type module.
- Desktop API owner: `desktop/src/api/providers.ts`.
- Desktop state owner: `desktop/src/stores/providerStore.ts`.
- Desktop interaction owner: Settings > Providers in `desktop/src/pages/Settings.tsx`, with extraction to a provider import/export component if needed to keep the file reviewable.
- Locale owner: `desktop/src/i18n/locales/en.ts` and `desktop/src/i18n/locales/zh.ts`.

### Forbidden Implementation Drift

- Do not implement provider sharing as raw Settings JSON import/export.
- Do not include `activeId`, default provider selection, official OAuth/login state, chat/session/plugin/skill/MCP/workflow state, or global app settings in the provider bundle.
- Do not silently overwrite existing providers.
- Do not implement secret export as a remembered checkbox.
- Do not rely on frontend `apiKey` masking comments for export safety.
- Do not mutate `~/.claude/settings.json` as part of provider import.

### Required Implementation References

- `src/server/services/providerService.ts`
- `src/server/api/providers.ts`
- `src/server/types/provider.ts`
- `src/server/__tests__/providers.test.ts`
- `desktop/src/pages/Settings.tsx`
- `desktop/src/api/providers.ts`
- `desktop/src/stores/providerStore.ts`
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- `desktop/src/lib/providerSettingsJson.ts`
- `desktop/src/i18n/locales/en.ts`
- `desktop/src/i18n/locales/zh.ts`

### Review Focus

- Verify default export never includes stored credentials.
- Verify secret export has an explicit separate path and second confirmation.
- Verify import preview writes nothing.
- Verify import commit does not change `activeId` or managed active provider env.
- Verify overwrite can only happen through explicit resolution.
- Verify imported new providers receive generated local IDs.
- Verify desktop warnings and diagnostics do not reveal secret values unnecessarily.

## Operational Consequence Design

| Obligation ID | State Machine / Ordering Decision | Concurrency And Idempotency | Recovery Path | Validation Evidence |
| --- | --- | --- | --- | --- |
| CA-001 | Export reads current provider index and builds a bundle; default path strips credential fields. | Export is read-only and idempotent for the same provider state. | No rollback needed; failed export returns error without writes. | Server tests assert secret-free bundle lacks raw keys/tokens. |
| CA-002 | Preview parses bundle, validates candidates, detects conflicts, and returns diagnostics without writes. | Preview may be repeated; it must not reserve IDs or persist preview state. | Invalid bundle returns diagnostics; no cleanup needed. | Server tests assert provider index and settings remain unchanged after preview. |
| CA-003 | Commit imports selected providers without activation; active provider state is not part of bundle semantics. | Commit must read current index at write time; active ID remains unchanged. | Failed commit returns errors and active settings remain unchanged. | Server tests assert `activeId` and managed env unchanged. |
| CA-004 | Conflicts are previewed and require explicit resolution; default is add/rename. | Commit revalidates target IDs/names to avoid stale overwrite assumptions. | Stale conflict returns a commit error or refreshed diagnostics. | Server tests cover add/rename default and explicit overwrite. |
| CA-005 | New import creates generated local IDs and preserves source IDs only as diagnostics/source metadata. | Repeated import creates distinct local providers unless explicit overwrite is selected. | User can delete unwanted duplicate provider through existing UI. | Server tests assert generated IDs differ from source IDs for add/import. |
| CA-006 | Raw-vs-masked API key conflict is contained by making export redaction server-owned. | Existing list behavior may remain for compatibility until separately changed, but export must not expose secrets by default. | If masking behavior changes, update same-area tests and desktop edit flow expectations. | Tests prove export redaction independent of provider list response shape. |
| CA-007 | Secret export route/action requires explicit confirmation and labels bundle as credential-bearing. | Choice is per request and not stored in server or desktop state. | Canceling confirmation produces no bundle; no state cleanup. | Desktop tests cover confirmation; server tests require explicit secret export flag/confirmation. |

## Capability Preservation Plan

- Export selected/all saved providers maps to `POST /api/providers/export` and desktop provider export actions.
- Export with secrets maps to a separate API contract and separate desktop action, not a persistent option.
- Import preview maps to `POST /api/providers/import/preview` and returns candidate diagnostics.
- Import commit maps to `POST /api/providers/import/commit` and revalidates bundle plus resolutions.
- Provider list refresh maps to `providerStore` import action calling `fetchProviders()` after successful commit.
- Missing secret state maps to preview diagnostics and an imported provider saved with empty credential field until edited.

## Dispatch Compilation Hints

### Boundary Owner

- Server provider import/export behavior: `ProviderService`.
- Desktop interaction behavior: Settings > Providers UI and provider store.

### Required Packet References

- `.specify/features/008-specify-discussions-settings/spec.md`
- `.specify/features/008-specify-discussions-settings/plan.md`
- `.specify/features/008-specify-discussions-settings/data-model.md`
- `.specify/features/008-specify-discussions-settings/contracts/provider-import-export-api.md`
- `src/server/services/providerService.ts`
- `src/server/api/providers.ts`
- `src/server/types/provider.ts`
- `desktop/src/pages/Settings.tsx`
- `desktop/src/api/providers.ts`
- `desktop/src/stores/providerStore.ts`

### Packet Validation Gates

- Server/provider packet: `bun run check:server`.
- Desktop/provider packet: `bun run check:desktop`.
- Final PR readiness: `bun run verify`.
- Coverage-sensitive implementation: `bun run check:coverage` if changed-line coverage is not already included in the selected gate.

### Task-Level Quality Floor

- Each production change under `src/server` and `desktop/src` needs same-area tests.
- Every changed executable production line must be covered enough to satisfy the repository changed-line coverage gate.
- No implementation task may claim completion without stating which CA/MP obligations it preserves.

## Alignment Inputs

### Canonical References

- `spec.md`
- `alignment.md`
- `context.md`
- `references.md`
- `brainstorming/handoff-to-specify.json`
- `.specify/discussions/settings-provider-import-export/handoff-to-specify.md`

### Input Risks From Alignment

- Project cognition is unavailable; planning relies on targeted live reads.
- Raw-vs-masked `apiKey` behavior conflicts with frontend comments and server tests. The design mitigates by requiring server-owned export redaction.
- Exact UI text and placement are implementation details, but the UI must preserve warnings, confirmation, preview, conflict resolution, and accessibility states.

## Research Inputs

### Standard Stack

- Use existing TypeScript/Zod server schema patterns for bundle validation.
- Use existing provider API/service/store patterns rather than adding a new subsystem.
- Use existing Settings modal/dialog/button patterns and workflow import/export interaction precedent.

### Don't Hand-Roll

- Do not parse JSON with ad hoc string inspection; use Zod/object validation at the API/service boundary.
- Do not make desktop-only security decisions; credentials must be included/excluded by server-controlled bundle creation.
- Do not build a persisted preview cache unless commit requirements later prove it necessary. Stateless preview plus commit revalidation is enough.

### Common Pitfalls

- Accidentally exporting `activeId` because it lives beside providers in the provider index.
- Treating `sourceProviderId` as a local ID during import and colliding with existing records.
- Marking secret presence by rendering actual secret values in diagnostics.
- Reusing workflow template import/export data assumptions for provider records.

### Assumptions To Validate

- Existing `apiKey: ""` service behavior is acceptable for imported providers that need credentials before test/activation.
- Same-area desktop tests can cover the provider import/export dialog without requiring full browser smoke.
- Server tests can inspect temp provider/settings files to prove preview and failed commit side effects.

### Environment / Dependency Notes

- No new runtime dependency is required for the planned implementation.
- No live provider credential is required for non-live import/export tests.
- Project cognition maintenance is a separate follow-up; this plan preserves the gap but does not require map repair before task generation.

## Constitution Check

*GATE: Must pass before task generation.*

- Specification-first delivery: pass. User-confirmed `spec.md`, `alignment.md`, and `context.md` exist.
- Simplicity and scope discipline: pass. Plan extends existing provider service/API/store/UI surfaces and avoids whole-app backup.
- Test-backed changes: pass. Plan requires same-area server and desktop tests plus final verification gate.
- Security by default: pass. Default export redacts credentials and secret export is high-friction.
- Reviewable, reversible delivery: pass. Plan splits server contracts, desktop integration, and tests into bounded surfaces.
- Evidence before completion: pass for planning. Live repository evidence was inspected; implementation must run gates before completion.
- No unrequested fallbacks: pass. Plan preserves user-confirmed optional secret export and does not substitute encryption or whole-app backup.

## Project Structure

### Documentation (this feature)

```text
.specify/features/008-specify-discussions-settings/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── provider-import-export-api.md
├── plan-contract.json
└── tasks.md              # created later by /sp.tasks
```

### Source Code (repository root)

```text
src/server/
├── api/providers.ts
├── services/providerService.ts
├── types/provider.ts
└── __tests__/providers.test.ts

desktop/src/
├── api/providers.ts
├── stores/providerStore.ts
├── types/provider.ts
├── pages/Settings.tsx
├── i18n/locales/en.ts
├── i18n/locales/zh.ts
└── same-area provider/settings tests
```

## Phase Plan

### Phase 0 - Contract And Test Shape

- Define provider bundle schema and export/import request/response types.
- Add RED server tests for default redaction, secret export confirmation, preview side effects, conflict behavior, generated IDs, and active-state non-mutation.
- Add desktop/store RED tests for API/store actions and warning/preview states.

### Phase 1 - Server Behavior

- Implement bundle construction and credential redaction in ProviderService.
- Implement import preview classification.
- Implement import commit with generated IDs, conflict resolution, server-side revalidation, and no activation side effects.
- Add routes and Zod validation.

### Phase 2 - Desktop Integration

- Add desktop API types and calls.
- Add provider store actions.
- Add Settings > Providers controls/dialogs for export, secret export confirmation, import preview, conflict resolution, and commit.
- Add i18n strings.

### Phase 3 - Verification And Hardening

- Run focused server and desktop checks.
- Run `bun run verify`.
- Inspect coverage report and changed-line failures if any.

## Complexity Tracking

- Cross-boundary surfaces: server API/service/types, desktop API/store/UI, provider persistence.
- Security-sensitive behavior: credential export.
- Shared state behavior: active provider ID and managed settings env.
- Planning complexity: standard-to-high, but artifact-only design can proceed leader-inline because source/test mutation is forbidden in this phase.

## Risks

- Changing provider list masking behavior could affect existing edit flows. Treat list masking as a separate compatibility decision unless required by export implementation.
- Import commit needs careful stale-conflict handling so explicit overwrite cannot become accidental overwrite.
- Large Settings.tsx changes could reduce reviewability. Prefer extracting provider import/export dialog logic when implementation diff grows.

## Next Phase Handoff

- `plan-contract.json` is the machine-readable handoff to `/sp.tasks`.
- Recommended next command after user review is `/sp.tasks`.
