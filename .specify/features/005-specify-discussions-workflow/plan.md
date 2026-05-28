# Implementation Plan: Workflows Template Management And Chat Entry

**Branch**: `005-specify-discussions-workflow` | **Date**: 2026-05-26 | **Spec**: `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\spec.md`  
**Input**: Feature specification from `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\spec.md`

## Summary

Add one unified desktop `Workflows` capability: Settings manages global user workflow templates with schema-aware CRUD/import/export, and Chat starts workflow sessions from the composer `+` menu. The implementation should extend the existing workflow registry, workflow session snapshot path, Settings tab pattern, and desktop session APIs rather than creating a parallel workflow system.

Planning approval source: upstream discussion handoff was user-confirmed, and the user invoked `$sp-plan` after the user-review-requested spec handoff on 2026-05-26. This plan treats that invocation as approval to proceed from specification review into design-only planning.

## Locked Planning Decisions

- User-facing product label is `Workflows`.
- First version custom templates are global user-level templates stored only in cc-jiangxia-owned workflow config.
- Built-in templates are protected, read-only, and copyable into user templates; they cannot be edited or deleted in place.
- Settings management is schema-aware CRUD, not view-only and not raw JSON-only.
- JSON import/export is in scope with preview, per-template selection, validation before write, and automatic rename for conflicts by default.
- Workflows are staged execution contracts with ordered phases, output artifact contracts, handoff contracts, completion rules, and transition authority.
- Chat entry is composer `+ > Workflows`.
- Empty/new session workflow starts reuse the current session creation flow where possible.
- Non-empty normal chats require an explicit context strategy before workflow start: `inherit`, `summarize`, or `clear`.
- Inherit/summarize/clear from a non-empty normal chat creates a new linked workflow session and leaves the original chat unchanged.
- Existing workflow sessions continue from their stored template snapshots after source templates change.
- External Claude Code `/workflow` behavior is reference-only and not a normative contract for this feature.

## Must-Preserve Carry-Forward

| MP ID | Type | Planning Obligation | Plan Location | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- |
| MP-001 | goal | Preserve unified Settings management plus Chat start surface. | `plan.md#Summary`, `plan.md#Project Structure` | Settings or Chat scope is dropped. |
| MP-002 | decision | Use `Workflows` as user-facing label. | `plan.md#Locked Planning Decisions` | Label changes without user confirmation. |
| MP-003 | scope | Store custom templates as global user-level templates only. | `plan.md#Implementation Constitution` | Project-level template scope enters first version. |
| MP-004 | decision | Keep built-ins read-only/protected and copyable. | `plan.md#Operational Consequence Design` | Built-ins become editable or deletable in place. |
| MP-005 | decision | Build schema-aware CRUD Settings management. | `plan.md#Implementation Target Boundary`, `data-model.md#Workflow Template Draft` | Management becomes view-only or raw-only. |
| MP-006 | decision | Preserve JSON import/export with preview, selection, validation, and auto-rename conflicts. | `contracts/workflow-template-api.md#Import Preview` | Import overwrites by default or omits selection. |
| MP-007 | decision | Treat Workflows as staged execution contracts. | `data-model.md#Workflow Phase Contract` | Authoring becomes prompt-only. |
| MP-008 | decision | Require output artifact and handoff contract per phase. | `data-model.md#Workflow Phase Contract`, `plan.md#Operational Consequence Design` | Phases can save without output or handoff. |
| MP-009 | decision | Put common phase fields first and advanced fields behind disclosure. | `plan.md#Research Inputs`, `quickstart.md#Manual Smoke Scenarios` | UI exposes all advanced fields flat by default. |
| MP-010 | decision | Use composer `+ > Workflows` as Chat entry. | `contracts/linked-workflow-session.md#Desktop Flow Contract` | Entry moves without user confirmation. |
| MP-011 | scenario | Require explicit context handling for non-empty normal chats. | `contracts/linked-workflow-session.md#Request` | Workflow starts from non-empty chat without strategy. |
| MP-012 | decision | Create linked new workflow session for inherit/summarize/clear and preserve original chat. | `contracts/linked-workflow-session.md#Response`, `plan.md#Operational Consequence Design` | Original chat is converted in place. |
| MP-013 | non-goal | Do not mutate existing workflow snapshots after source template edits. | `plan.md#Implementation Constitution`, `data-model.md#Snapshot Compatibility` | Retroactive snapshot mutation is proposed. |
| MP-014 | reference | Do not anchor to unverified external `/workflow` behavior. | `plan.md#Alignment Inputs` | External behavior becomes a hard contract without fresh evidence. |
| MP-015 | gate | No hard unknowns remain; soft details are planned here. | `plan.md#Decision Preservation Check` | A soft detail becomes a product contradiction. |

## Implementation Target Boundary

- **Current project root**: `F:\github\cc-jiangxia`
- **Current project roles**: implementation owner for Bun CLI/server, desktop React app, workflow registry/runtime, and planning artifacts.
- **Target project root**: `F:\github\cc-jiangxia`; no external target project is in scope.
- **Target project roles**: same repository owns the desktop UI, server APIs, workflow runtime, session metadata, workflow config persistence, and test gates.
- **Target paths/modules**:
  - `F:\github\cc-jiangxia\src\server\services\workflowTemplateRegistryService.ts`
  - `F:\github\cc-jiangxia\src\server\services\workflowTypes.ts`
  - `F:\github\cc-jiangxia\src\server\services\workflowSessionStateService.ts`
  - `F:\github\cc-jiangxia\src\server\services\sessionService.ts`
  - `F:\github\cc-jiangxia\src\server\api\sessions.ts`
  - `F:\github\cc-jiangxia\src\server\router.ts`
  - `F:\github\cc-jiangxia\src\services\compact\compact.ts`
  - `F:\github\cc-jiangxia\src\commands\compact\compact.ts`
  - `F:\github\cc-jiangxia\desktop\src\pages\Settings.tsx`
  - `F:\github\cc-jiangxia\desktop\src\stores\uiStore.ts`
  - `F:\github\cc-jiangxia\desktop\src\api\sessions.ts`
  - `F:\github\cc-jiangxia\desktop\src\types\session.ts`
  - `F:\github\cc-jiangxia\desktop\src\pages\EmptySession.tsx`
  - `F:\github\cc-jiangxia\desktop\src\pages\ActiveSession.tsx`
  - `F:\github\cc-jiangxia\desktop\src\components\chat\ChatInput.tsx`
  - `F:\github\cc-jiangxia\desktop\src\components\workflow\*`
  - `F:\github\cc-jiangxia\desktop\src\i18n\locales\en.ts`
  - `F:\github\cc-jiangxia\desktop\src\i18n\locales\zh.ts`
- **Target evidence status**: project cognition status is fresh/query-ready; query returned path-level coverage and no graph nodes, so implementation facts are backed by live reads of the paths above.
- **Reference sources**: `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\spec.md`, `alignment.md`, `context.md`, and upstream discussion handoff artifacts.
- **Cognition scope rule**: current project cognition is advisory navigation only; live source/tests define implementation truth.
- **Stop condition**: stop and return to specification if implementation requires project-level templates, in-place built-in edits, retroactive workflow snapshot mutation, or a source-mutating summarize path.

## Reference Fidelity Inputs

### Reference Object

The reference object is the existing cc-jiangxia workflow stack, not an external `/workflow` feature: `WorkflowTemplateRegistryService`, `WorkflowSessionStateService`, `WorkflowRuntimeService`, `POST /api/sessions` workflow creation, `WorkflowTemplatePicker`, `WorkflowStatusPanel`, and `/compact` semantics.

### Behavior-Level Fidelity Inventory

- Existing `GET /api/workflows/templates` list behavior is preserved and extended additively.
- Built-in `agent-development` remains visible and startable when user config is missing or invalid.
- Workflow sessions snapshot templates at creation; future template edits do not mutate existing workflow state.
- Active workflow sessions still render status, transition controls, pending artifacts, and final report state from server summaries.
- `/compact` is the semantic reference for summarize-current-context, but the linked-session flow must use a non-mutating summary path.

## Scenario Profile Inputs

### Active Profile

- **Standard Delivery with lifecycle consequence gate**. Source: `alignment.md` and `context.md`.
- The feature is not a reference-implementation clone; it is a brownfield cross-boundary feature touching Settings, server API, persistence, session creation, workflow state, and compaction semantics.

### Profile-Driven Implementation Constraints

- Planning and tasks must preserve CA-001 through CA-006 as explicit implementation obligations.
- Implementation must use existing repository patterns before adding new abstractions.
- All production code changes under `desktop/src` and `src/server` require same-area tests and quality-gate evidence.
- No implementation may directly mutate protected Claude-owned files or existing workflow session snapshots.

## Technical Context

**Language/Version**: TypeScript, ESM, Bun-based root CLI/server; React/TypeScript desktop frontend.  
**Primary Dependencies**: Bun runtime, React, Zustand stores, existing desktop shared components, existing server API/service modules, existing workflow registry/runtime services.  
**Storage**: cc-jiangxia-owned JSON file `~/.claude/cc-jiangxia/workflows.json`; workflow session state under `~/.claude/cc-jiangxia/workflow-sessions/<sessionId>/`; session transcripts under `~/.claude/projects/**`.  
**Testing**: Bun test for root/server; Vitest/Testing Library for desktop; existing gates `bun run check:server`, `bun run check:desktop`, `bun run check:coverage`, and `bun run verify`.  
**Target Platform**: Local desktop app plus local Bun server; Windows-safe paths are required.  
**Project Type**: Desktop app with local server, CLI/runtime integration, and shared JSONL persistence.  
**Performance Goals**: Workflow template list/edit/import operations should remain local-file operations; import/export should validate before write and avoid blocking active chat streams.  
**Constraints**: Lossless writes for unknown workflow config fields; no raw file writes from desktop frontend; non-mutating linked-session context carryover; no new external dependencies unless existing utilities cannot validate the payload shape.  
**Scale/Scope**: First release supports linear workflow templates only, matching existing registry validation.

## Project Cognition And Live Evidence

- Cognition status: `fresh`, `query_ready`, `dirty: false` from `F:\github\cc-jiangxia\.specify\project-cognition\status.json`.
- Query command used `C:\Users\11034\.specify\bin\project-cognition.exe` with selected concepts `term:workflows`, `term:workflow`, `term:template`, `term:settings`, and `term:crud`.
- Query result returned path-level `minimal_live_reads` with no graph nodes; this is sufficient for route guidance but not for ownership proof.
- Live reads confirmed existing registry validation/write behavior, GET-only workflow template API, Settings tab pattern, composer workflow picker behavior, session creation snapshot behavior, and compact command mutation semantics.
- Coverage gap: project cognition did not return relationship-level nodes for the selected query; no map refresh is required for artifact-only planning, but implementation changes to new API/service boundaries should be followed by `$sp-map-update`.

## Adaptive Dispatch

- `execution_model: adaptive`
- `execution_mode: standard`
- `workflow_status: ready`
- `dispatch_shape: leader-inline`
- `execution_surface: leader-inline`
- `capability_degraded: true`
- `blocked_reason: none`
- `delegated_planning_lanes: none`

Native subagents are available in the runtime, but the current tool policy permits spawning only when the user explicitly requests sub-agents, delegation, or parallel agent work. The user invoked `$sp-plan` without requesting delegation, so planning remains leader-inline. This is a capability degradation from standard native dispatch, not a planning blocker, because the work is bounded and not safety-critical enough to require heavy-mode delegation.

## Implementation Constitution

### Architecture Invariants

- `WorkflowTemplateRegistryService` remains the truth owner for loading, validation, write preservation, built-in id protection, and registry cache invalidation.
- Workflow template mutation APIs must be server-owned; the desktop UI must not write `workflows.json` directly.
- Built-in templates remain code-owned and read-only; user templates cannot shadow built-in ids.
- Workflow session creation must snapshot the selected template exactly once at new session creation.
- Existing workflow sessions must continue from `WorkflowSessionState.templateSnapshot`; source template edits are future-session-only.
- Linked workflow session creation must create a new session and preserve the source normal chat transcript.
- Summarize-current-context must use a non-mutating summary path. Directly executing `/compact` against the source session is forbidden because `/compact` clears conversation history.

### Boundary Ownership

- Server workflow template API: add or extract `src/server/api/workflowTemplates.ts` and route it from `src/server/router.ts`.
- Workflow template persistence: extend `src/server/services/workflowTemplateRegistryService.ts`.
- Workflow creation reuse: extract workflow create helpers from `src/server/api/sessions.ts` into a service such as `src/server/services/workflowSessionCreateService.ts`.
- Linked workflow sessions: add a focused service such as `src/server/services/workflowSessionLinkService.ts` to coordinate source transcript read, context strategy, new session creation, provenance, and startup prompt generation.
- Desktop Settings UI: add a Workflows settings page/component and route it through `SettingsTab`.
- Desktop Chat UI: add a composer `+ > Workflows` dialog and reuse workflow picker/status components where possible.

### Forbidden Implementation Drift

- Do not add project-level template storage, precedence, or discovery in this version.
- Do not add direct built-in edit/delete endpoints.
- Do not overwrite user templates by default during import.
- Do not convert an existing normal chat into a workflow session in place.
- Do not run source-session `/compact` as summarize-current-context.
- Do not save prompt-only phases without output artifact and handoff contract fields.
- Do not lower coverage gates or bypass same-area tests.

### Required Implementation References

- `F:\github\cc-jiangxia\src\server\services\workflowTemplateRegistryService.ts`
- `F:\github\cc-jiangxia\src\server\services\workflowTemplateRegistryService.test.ts`
- `F:\github\cc-jiangxia\src\server\api\sessions.ts`
- `F:\github\cc-jiangxia\src\server\__tests__\sessions.test.ts`
- `F:\github\cc-jiangxia\src\server\services\workflowTypes.ts`
- `F:\github\cc-jiangxia\src\server\services\workflowRuntimeService.ts`
- `F:\github\cc-jiangxia\src\server\services\sessionService.ts`
- `F:\github\cc-jiangxia\src\services\compact\compact.ts`
- `F:\github\cc-jiangxia\desktop\src\pages\Settings.tsx`
- `F:\github\cc-jiangxia\desktop\src\components\chat\ChatInput.tsx`
- `F:\github\cc-jiangxia\desktop\src\pages\EmptySession.tsx`
- `F:\github\cc-jiangxia\desktop\src\pages\ActiveSession.tsx`
- `F:\github\cc-jiangxia\desktop\src\api\sessions.ts`
- `F:\github\cc-jiangxia\desktop\src\types\session.ts`

### Review Focus

- Verify all template mutation paths preserve unknown fields and reset registry cache.
- Verify invalid user config never blocks the built-in workflow.
- Verify all public route payloads validate at the server boundary.
- Verify import preview and commit use the same validation and conflict rules.
- Verify source chat transcripts are unchanged after linked workflow start.
- Verify summarization is non-mutating and has visible failure states instead of silent fallback.
- Verify desktop UI remains keyboard accessible and localized in English and Chinese.

## Operational Consequence Design

| Obligation ID | State Machine / Ordering Decision | Concurrency And Idempotency | Recovery Path | Validation Evidence |
| --- | --- | --- | --- | --- |
| CA-001 | Template list starts with built-in templates, then adds valid user templates; invalid user config contributes diagnostics only. | Registry load must not short-circuit built-ins on malformed user config. | If user config is corrupt, show diagnostics and keep built-ins startable. | Server registry tests and `GET /api/workflows/templates` API test for malformed config. |
| CA-002 | Every write reads existing config, merges unknown fields, writes atomically or with existing safe-write pattern, then clears registry cache. | Writes should be serialized per config path or made last-write deterministic; repeated save of same draft is idempotent. | On validation failure, return issues and do not write. On write failure, leave previous config intact where filesystem allows. | Registry write tests for top-level/template/phase/skill/artifact/transition unknown fields; import/delete/update tests. |
| CA-003 | Built-ins have no mutation route; user templates with built-in ids are rejected by validation and import preview. | Duplicate create/import with built-in id is rejected before write. | UI offers copy-to-user-template with a new id; never edits source built-in. | API and UI tests for copy, blocked edit/delete, and built-in id conflict. |
| CA-004 | Workflow sessions use stored template snapshots and source-template status; template edits affect only future sessions. | Template writes do not iterate workflow session directories. | Existing sessions continue from stored state; stale/missing-template status remains display-only. | Regression tests around workflow session creation/list/detail before and after template update. |
| CA-005 | Non-empty normal chat start opens context strategy dialog; endpoint creates a new linked session and returns/open target session. | Use `clientRequestId` for linked creation idempotency or reject duplicate in-flight requests per source session and template. Active streaming chats return 409 or disable start. | If context carryover fails, original session remains unchanged and no partial workflow metadata is advertised. If new session creation succeeds but startup prompt send fails, desktop keeps new session visible with retryable prefill. | Server linked-session contract tests, desktop ChatInput/ActiveSession tests, manual smoke. |
| CA-006 | Template editor maps phase fields into `WorkflowPhasePrompt`, `requiredArtifacts`, `completionCriteria`, `transition`, `actionPolicy`, skills, and recovery notes. | Save validates the normalized phase contract before write; duplicate phase ids rejected. | Invalid drafts stay local with validation issues; no persisted invalid template is treated startable. | Registry validation tests plus Settings editor tests for missing output/handoff rejection. |

## Dispatch Compilation Hints

### Boundary Owner

- Template mutation owner: `src/server/services/workflowTemplateRegistryService.ts`
- Workflow session owner: `src/server/services/workflowSessionStateService.ts`, `src/server/services/workflowRuntimeService.ts`, and new create/link services.
- Desktop owner: `desktop/src/pages/Settings.tsx`, `desktop/src/components/workflow/*`, and `desktop/src/components/chat/ChatInput.tsx`.

### Required Packet References

- Every implementation packet touching templates must read `contracts/workflow-template-api.md`, `data-model.md#Workflow Template Document`, and `workflowTemplateRegistryService.test.ts`.
- Every implementation packet touching linked sessions must read `contracts/linked-workflow-session.md`, `sessionService.ts`, `workflowSessionStateService.ts`, and `src/services/compact/compact.ts`.
- Every desktop packet must read existing tests in the same area and keep localized strings in `en.ts` and `zh.ts`.

### Packet Validation Gates

- Server/API changes: `bun run check:server`.
- Desktop UI/store/client changes: `bun run check:desktop`.
- Persistence changes: include `bun run check:persistence-upgrade` if persistence shape changes beyond additive cc-jiangxia-owned `workflows.json` fields.
- Feature completion: `bun run check:coverage` and `bun run verify`.

### Task-Level Quality Floor

- Same-area tests are mandatory for production changes under `src/server` and `desktop/src`.
- Tests must prove changed-line coverage and protect CA-001 through CA-006.
- No generated quality artifacts should be committed.

## Alignment Inputs

### Canonical References

- `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\spec.md`
- `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\alignment.md`
- `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\context.md`
- `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\references.md`
- `F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\brainstorming\handoff-to-specify.json`
- `F:\github\cc-jiangxia\.specify\memory\constitution.md`

### Input Risks From Alignment

- Settings editor can become too broad if advanced fields are first-screen UI.
- Linked workflow session creation crosses UI, API, transcript, and workflow state surfaces.
- Summary carry-over must not accidentally mutate the original chat or implement a meaningfully different `/compact` behavior.
- Import/export write paths are persistence-sensitive and must preserve unknown fields.
- Project cognition returned path guidance but no detailed subgraph nodes for this query.

## Research Inputs

### Standard Stack

- Extend existing TypeScript/Bun server services and React/Zustand desktop patterns.
- Use existing registry validation and shared workflow types as canonical schema.
- Use existing Button/Input/Modal/ConfirmDialog/Dropdown and Material Symbols/Lucide patterns for UI.

### Don't Hand-Roll

- Do not hand-roll a separate workflow schema or storage file; extend registry normalization.
- Do not hand-roll a parallel session list/state model; use `sessionsApi`, `sessionStore`, and server session metadata.
- Do not invent a separate compaction behavior; reuse compact prompt/summary semantics or extract a non-mutating summary helper.

### Common Pitfalls

- Running `/compact` on the source chat mutates source transcript and violates CA-005.
- Saving normalized templates without merge preservation violates CA-002.
- Returning only startable templates hides diagnostics and violates FR-002.
- Adding Settings Workflows without `SettingsTab` and i18n updates breaks navigation and slash-settings routing.

### Assumptions To Validate

- A non-mutating compact-style summary path can be implemented by extracting/reusing compact prompt semantics without requiring source-session mutation.
- Inherit strategy can safely carry source chat context through a bounded startup prompt; if transcript is too large, implementation must return a visible error and route user to summarize.
- Invalid-template warning shortcut to Settings is useful but not required for first acceptance unless discoverability is reopened.

### Environment / Dependency Notes

- No new runtime dependencies are planned.
- Summary generation may depend on provider/runtime access; implementation must surface unavailable summary generation instead of silently switching to clear or inherit.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Specification-first delivery: PASS. `spec.md`, `alignment.md`, `context.md`, this `plan.md`, and contract artifacts exist before implementation.
- Simplicity and scope discipline: PASS. Plan extends existing workflow registry/session/UI patterns and explicitly excludes project-level templates and retroactive migration.
- Test-backed changes: PASS with requirement. Implementation must add server and desktop same-area tests and run relevant gates.
- Security by default: PASS with requirement. All imports/API payloads validate server-side; protected files remain read-only.
- Reviewable, reversible delivery: PASS. Plan splits API, service, data model, UI, and linked-session contracts into reviewable surfaces.
- Evidence before completion: PASS with requirement. Completion requires narrow checks plus `bun run verify`.
- No unrequested fallbacks: PASS. Summary unavailable must be visible; no silent clear/inherit fallback.

## Project Structure

### Documentation (this feature)

```text
F:\github\cc-jiangxia\.specify\features\005-specify-discussions-workflow\
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── plan-contract.json
├── contracts\
│   ├── workflow-template-api.md
│   └── linked-workflow-session.md
└── tasks.md
```

### Source Code (repository root)

```text
F:\github\cc-jiangxia\
├── src\
│   └── server\
│       ├── api\
│       │   ├── sessions.ts
│       │   └── workflowTemplates.ts
│       ├── router.ts
│       ├── services\
│       │   ├── workflowTemplateRegistryService.ts
│       │   ├── workflowSessionCreateService.ts
│       │   ├── workflowSessionLinkService.ts
│       │   ├── workflowSessionStateService.ts
│       │   ├── workflowRuntimeService.ts
│       │   └── sessionService.ts
│       └── __tests__\
│           └── sessions.test.ts
├── src\
│   └── services\
│       └── compact\
│           ├── compact.ts
│           └── prompt.ts
└── desktop\
    └── src\
        ├── api\
        │   └── sessions.ts
        ├── types\
        │   └── session.ts
        ├── stores\
        │   ├── uiStore.ts
        │   └── sessionStore.ts
        ├── pages\
        │   ├── Settings.tsx
        │   ├── EmptySession.tsx
        │   └── ActiveSession.tsx
        ├── components\
        │   ├── chat\
        │   │   └── ChatInput.tsx
        │   └── workflow\
        │       ├── WorkflowTemplatePicker.tsx
        │       ├── WorkflowTemplateManager.tsx
        │       └── WorkflowStartDialog.tsx
        └── i18n\
            └── locales\
                ├── en.ts
                └── zh.ts
```

**Structure Decision**: Use the existing single-repository desktop-plus-server layout. Add a focused workflow template API module and workflow create/link services to avoid further bloating `src/server/api/sessions.ts`, while preserving existing route compatibility.

## Decision Preservation Check

- Unified scope -> `plan.md#Summary`, `contracts/workflow-template-api.md`, `contracts/linked-workflow-session.md`.
- `Workflows` label -> `plan.md#Locked Planning Decisions`, desktop i18n requirement.
- Global user templates only -> `data-model.md#Workflow Template Document`.
- Built-in protection -> `plan.md#Operational Consequence Design`, API contract errors.
- Schema-aware CRUD/import/export -> `data-model.md`, `contracts/workflow-template-api.md`.
- Output artifact/handoff per phase -> `data-model.md#Workflow Phase Contract`.
- Composer `+ > Workflows` -> `contracts/linked-workflow-session.md#Desktop Flow Contract`.
- Linked new session, original unchanged -> `contracts/linked-workflow-session.md#Response`.
- Existing workflow snapshots unchanged -> `plan.md#Implementation Constitution`.

## Research Adoption Check

- Existing registry already supports validation and lossless write merge -> plan extends it instead of new storage.
- Existing `GET /api/workflows/templates` is GET-only -> plan adds mutation routes under the same `/api/workflows/templates` resource.
- Existing `/compact` mutates context after summary -> plan forbids direct source-session `/compact` and requires a non-mutating summary helper.
- Existing ChatInput only shows workflow picker for empty launch controls -> plan adds dialog flow for non-empty normal chats.
- Existing ActiveSession workflow display is summary-driven -> plan leaves workflow status panels unchanged.

## Complexity Tracking

No constitution violations are accepted. Added services are justified by existing `sessions.ts` size and by the need to share workflow creation between standard session create and linked-session create without duplicate snapshot logic.
