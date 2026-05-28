# Research: Workflows Template Management And Chat Entry

**Date**: 2026-05-26  
**Input**: `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\spec.md`, `alignment.md`, `context.md`, project cognition status/query, and targeted live repository reads.

## Summary

The feature should reuse the existing workflow registry, session creation, workflow snapshot, and desktop Settings/Chat patterns. The main planning hazards are lossless writes to `workflows.json`, preventing built-in mutation, and implementing compact-style context carryover without mutating the source normal chat.

## Decisions

### Workflow Template Persistence

- **Recommendation**: Extend `WorkflowTemplateRegistryService` as the persistence and validation owner for create/update/delete/import/export.
- **Rationale**: Live reads show it already loads built-in and user templates, validates malformed/invalid user config while keeping built-ins startable, prevents built-in id shadowing, preserves unknown fields through `writeTemplates()`, and resets cache after writes.
- **Alternatives Considered**:
  - New desktop-side JSON writer: rejected because Settings must not write files directly and would bypass server validation.
  - New workflow config file: rejected because it would split truth from current runtime.
- **Source Confidence**: verified from `src/server/services/workflowTemplateRegistryService.ts` and `workflowTemplateRegistryService.test.ts`.

### Workflow Template API Shape

- **Recommendation**: Keep `GET /api/workflows/templates` compatible and add mutation/preview/export routes under `/api/workflows/templates`.
- **Rationale**: Existing desktop client and tests already use `/api/workflows/templates`. Additive routes preserve current list behavior while enabling Settings management.
- **Alternatives Considered**:
  - Put all operations in `src/server/api/sessions.ts`: rejected for maintainability because sessions API is already broad.
  - Create unrelated `/api/settings/workflows` route: rejected because workflow templates are runtime workflow resources, not generic settings.
- **Source Confidence**: verified from `src/server/router.ts`, `src/server/api/sessions.ts`, `desktop/src/api/sessions.ts`, and `desktop/src/api/sessions.test.ts`.

### Settings UI Structure

- **Recommendation**: Add a `Workflows` Settings tab and a focused Workflows manager component that uses list/detail/editor/import/export dialogs.
- **Rationale**: `Settings.tsx` already routes tabs through `SettingsTab`, `TabButton`, localized labels, and page-local components. A focused component keeps Settings reviewable and avoids adding a large editor inline.
- **Alternatives Considered**:
  - Place all template controls into the existing composer picker: rejected because management belongs in Settings and picker is a launch surface.
  - Raw JSON editor as primary UI: rejected because the spec requires schema-aware CRUD.
- **Source Confidence**: verified from `desktop/src/pages/Settings.tsx`, `desktop/src/stores/uiStore.ts`, and locale files.

### Workflow Phase Authoring Model

- **Recommendation**: Store edited phases in the existing registry shape while mapping user-facing fields into `phasePrompt`, `requiredArtifacts`, `completionCriteria`, `transition`, `actionPolicy`, `requestedModel`, and `skills`.
- **Rationale**: Runtime prompt assembly already consumes structured phase prompt/action policy/artifact/completion fields. Authoring should preserve these first-class fields instead of flattening them into instructions.
- **Alternatives Considered**:
  - Prompt-only phase text: rejected by MP-007, MP-008, CA-006, and runtime evidence.
  - Fully open JSON schema UI on first screen: rejected because advanced fields should be collapsed.
- **Source Confidence**: verified from `workflowTypes.ts`, `workflowRuntimeService.ts`, and the built-in template registry shape.

### Chat Workflows Entry

- **Recommendation**: Add composer `+ > Workflows` that opens a workflow selection dialog. For empty sessions, reuse current `createSession(..., { workflow })`/replacement flow. For non-empty normal chats, require context strategy and call a linked-session API.
- **Rationale**: Empty session workflow launch already exists in `EmptySession.tsx` and hero `ChatInput.tsx`; current composer hides workflow selection when message count is non-zero. The feature needs a deliberate non-empty flow rather than implicit conversion.
- **Alternatives Considered**:
  - Keep only the current empty-session picker: rejected by FR-012 through FR-016.
  - Convert the active chat in place: rejected by MP-012 and CA-005.
- **Source Confidence**: verified from `desktop/src/components/chat/ChatInput.tsx`, `desktop/src/pages/EmptySession.tsx`, and `desktop/src/pages/ActiveSession.tsx`.

### Linked Workflow Session API

- **Recommendation**: Add `POST /api/sessions/:id/workflow/start` to create a new workflow session from a source session with `{ workflow, contextStrategy, clientRequestId }`.
- **Rationale**: This keeps source-session context handling explicit, attaches provenance to the created workflow session, and avoids overloading plain `POST /api/sessions`. It also makes non-empty chat behavior testable independently from empty session creation.
- **Alternatives Considered**:
  - Add source fields to `POST /api/sessions`: rejected because it mixes collection creation with source-session lifecycle checks.
  - WebSocket-only workflow start: rejected because Settings/desktop start needs an auditable request/response contract.
- **Source Confidence**: verified for existing session creation; API shape is planned.

### Compact-Style Summary Carryover

- **Recommendation**: Extract or wrap compact prompt/summary logic for a non-mutating "summary preview/fork" path. Do not execute `/compact` against the source session.
- **Rationale**: The `/compact` command clears conversation history while keeping a summary in context. That is the semantic reference, but direct execution would mutate the source chat and violate FR-016/CA-005.
- **Alternatives Considered**:
  - Directly call `/compact` on the source session: rejected because it mutates source transcript/state.
  - Ask the user to write a manual summary: rejected as the only summarize path because the spec requests `/compact`-style semantics.
- **Source Confidence**: verified from `src/commands/compact/index.ts`, `src/commands/compact/compact.ts`, and `src/services/compact/compact.ts`; non-mutating helper is an implementation design requirement.

### Import Conflict Handling

- **Recommendation**: Import preview computes deterministic auto-rename ids before commit and defaults every conflict to `rename`, not overwrite.
- **Rationale**: The spec explicitly forbids overwrite-by-default. Preview needs to show discovered templates, validation issues, selection state, and rename outcomes before write.
- **Alternatives Considered**:
  - Immediate import write: rejected because it bypasses preview and makes rollback harder.
  - Overwrite conflict default: rejected by MP-006 and FR-011.
- **Source Confidence**: verified from spec and existing registry validation constraints; exact rename algorithm is planned.

## Standard Stack

- TypeScript/Bun server modules: workflow registry, APIs, and session services.
- React + Zustand desktop frontend: Settings, ChatInput, session store, and API client.
- Existing shared UI: `Modal`, `ConfirmDialog`, `Input`, `Button`, `Dropdown`, workflow components, Material Symbols, and existing Lucide usage.
- Existing quality gates: `bun run check:server`, `bun run check:desktop`, `bun run check:coverage`, `bun run verify`.

## Don't Hand-Roll

- Do not create a second workflow schema or persistence file.
- Do not write `workflows.json` from the desktop frontend.
- Do not implement a bespoke summary prompt that diverges from compact semantics.
- Do not duplicate workflow session snapshot creation logic between `POST /api/sessions` and linked start; extract shared service logic.
- Do not introduce new validation libraries unless existing TypeScript validation becomes unmaintainable.

## Common Pitfalls

- **Source chat mutation during summarize**: direct `/compact` mutates history; linked summarize must be a fork/preview path.
- **Lossy JSON writes**: replacing templates without merging unknown fields violates persistence compatibility.
- **Hidden invalid templates**: filtering invalid templates out of the Settings view loses required diagnostics.
- **Built-in shadowing**: allowing a user template with `agent-development` breaks built-in protection.
- **Prompt-only phases**: saving only instructions loses output artifact/handoff contracts needed by runtime and downstream workflow stages.
- **Stale active workflow UI**: template management should not rewrite active workflow state; status panels remain driven by session metadata/state.

## Assumptions Log

- A non-mutating compact-style helper can be implemented by sharing compact prompt semantics and message normalization without applying post-compact cleanup to the source session. If this is false, implementation must stop and route to `$sp-deep-research` or specification revision before shipping summarize.
- Inherit strategy can carry bounded source context into the new workflow startup prompt. If the source transcript is too large to carry safely, the API should return an actionable error asking the user to choose summarize.
- A direct invalid-warning link from launch surfaces to Settings is not required for first acceptance; diagnostics visibility is required.

## Validation Notes

- Registry tests must cover malformed config, invalid templates, built-in id conflict, duplicate ids, non-linear definitions, unknown-field preservation, delete/update/import writes, and cache reset.
- API tests must cover all new template mutation/export/import preview routes and linked session creation outcomes.
- Desktop tests must cover Settings Workflows tab, schema-aware editor required fields, import preview selection/rename, composer `+ > Workflows`, empty launch reuse, non-empty strategy dialog, and source chat preservation.
- Quality gate evidence must include `bun run check:server`, `bun run check:desktop`, `bun run check:coverage`, and `bun run verify` unless blocked by local environment.

## Environment / Dependency Notes

- No external web/API research is required for this plan; repository evidence and the existing spec are sufficient.
- Summary carryover may require live provider access at runtime. The implementation must handle missing provider/auth/quota by returning a visible error and preserving the source chat.
- Artifact-only planning did not mark project cognition dirty. Actual source/runtime changes that add new routes/services should be followed by `$sp-map-update`.

## Sources

- `F:\github\cc-jiangxia\src\server\services\workflowTemplateRegistryService.ts`
- `F:\github\cc-jiangxia\src\server\services\workflowTemplateRegistryService.test.ts`
- `F:\github\cc-jiangxia\src\server\api\sessions.ts`
- `F:\github\cc-jiangxia\src\server\router.ts`
- `F:\github\cc-jiangxia\src\server\services\workflowTypes.ts`
- `F:\github\cc-jiangxia\src\server\services\workflowRuntimeService.ts`
- `F:\github\cc-jiangxia\src\server\services\sessionService.ts`
- `F:\github\cc-jiangxia\src\services\compact\compact.ts`
- `F:\github\cc-jiangxia\src\commands\compact\compact.ts`
- `F:\github\cc-jiangxia\desktop\src\pages\Settings.tsx`
- `F:\github\cc-jiangxia\desktop\src\components\chat\ChatInput.tsx`
- `F:\github\cc-jiangxia\desktop\src\pages\EmptySession.tsx`
- `F:\github\cc-jiangxia\desktop\src\pages\ActiveSession.tsx`
- `F:\github\cc-jiangxia\desktop\src\components\workflow\WorkflowTemplatePicker.tsx`
- `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\spec.md`
- `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\alignment.md`
- `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\context.md`
