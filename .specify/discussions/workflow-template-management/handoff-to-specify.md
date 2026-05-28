# Handoff To Specify: Workflow Template Management

- discussion_slug: workflow-template-management
- handoff_goal: Specify a unified `Workflows` feature that adds Settings workflow template management and Chat composer workflow entry in the current project.
- draft_created_at: 2026-05-26T15:22:09.0778846+08:00
- status: handoff-ready

## Context Boundary

- current_project_root: `F:\github\cc-jiangxia`
- target_project_root: `F:\github\cc-jiangxia`
- path_status: target-read-confirmed
- boundary_confidence: high
- boundary_unknowns: none

### Current Project Roles

- role: implementation-target
  - scope: Desktop Settings UI, server workflow template registry/API, desktop session creation flow, chat composer workflow entry
  - evidence_source: user request plus live repository reads
  - notes: Requested feature belongs in the active repository.

### Target Project Roles

- role: implementation-target
  - scope: Add or adjust desktop UI/API behavior for workflow template management and workflow session creation
  - evidence_source: user request plus live repository reads
  - notes: No cross-project transfer requested.

## Implementation Target

Target project: `F:\github\cc-jiangxia`.

Target paths/modules to verify downstream:

- `desktop/src/pages/Settings.tsx`
- `desktop/src/stores/uiStore.ts`
- `desktop/src/i18n/locales/en.ts`
- `desktop/src/i18n/locales/zh.ts`
- `desktop/src/components/chat/ChatInput.tsx`
- `desktop/src/pages/EmptySession.tsx`
- `desktop/src/pages/ActiveSession.tsx`
- `desktop/src/components/workflow/*`
- `desktop/src/api/sessions.ts`
- `desktop/src/types/session.ts`
- `src/server/api/sessions.ts`
- `src/server/router.ts`
- `src/server/services/workflowTemplateRegistryService.ts`
- `src/server/services/workflowTypes.ts`
- `src/server/services/workflowRuntimeService.ts`
- `src/commands/compact/index.ts`
- `src/commands/compact/compact.ts`

Current project cognition status: fresh and query-ready. Project cognition is advisory; live files listed in project context are the evidence for current behavior.

## Product Scope

Add a user-facing `Workflows` surface.

### Settings Workflows Management

- Add a Settings tab or item labeled `Workflows`.
- List built-in and user workflow templates.
- Show template source, phase count, validity/startability, and invalid-template diagnostics.
- Support global user-level workflow template CRUD: create, duplicate/copy, edit, delete, validate, and save.
- Keep built-in templates read-only/protected.
- Allow copying a built-in into a user workflow template for customization.
- Include JSON import/export.
- Import preview lists workflows found in JSON and lets the user select which to import.
- Import conflicts default to automatic rename, not overwrite.
- Import validates before write and cannot shadow built-in ids.
- Custom templates are global user-level only for this version.

### Standard Workflow Contract

Workflows are staged execution contracts, not prompt collections.

Each workflow has ordered phases. Each phase must define:

- identity and display name
- role/type
- instructions
- objective
- required intake
- expected output artifact
- handoff rules/summary
- execution rules
- completion criteria
- transition authority
- recovery/retry/reopen notes where relevant

Advanced phase fields may include:

- handoff intake rules
- required output artifact sections
- completion/stop rules
- required artifacts
- allowed/forbidden actions
- requested model
- skill guidance

Every phase must have an explicit output artifact and handoff contract.

### Chat Workflows Entry

- Add `Workflows` to the composer `+` menu.
- Clicking `+ > Workflows` opens a workflow-template selection dialog.
- Empty/new sessions reuse the current launch flow to start Workflows.
- Non-empty normal chats must ask how to handle current context:
  - inherit current context
  - summarize current context, then start
  - clear context and start fresh
- Summarize-current-context uses `/compact`-style semantics: clear conversation history while keeping a summary in context.
- Inherit/summarize from a non-empty chat creates a linked new workflow session carrying the chosen context.
- Do not mutate the original normal chat in place.
- Existing workflow sessions keep showing workflow status, phase state, transition controls, and report links.

## Non-Goals

- Do not rename or change the existing built-in workflow identity.
- Do not edit built-in templates in place.
- Do not add project-level workflow template storage or merge precedence in the first version.
- Do not mutate existing workflow session snapshots when source templates are edited.
- Do not model this as a clone of an unconfirmed Claude Code `/workflow` feature.

## Source Evidence

- `src/server/services/workflowTemplateRegistryService.ts`: built-in `agent-development`, user config path `~/.claude/cc-jiangxia/workflows.json`, validation, unknown-field preservation, builtin shadow rejection.
- `src/server/api/sessions.ts`: current workflow template API is list-only and workflow metadata is created during session creation when `workflow` is present.
- `src/server/services/workflowTypes.ts`: phase fields include instructions, requested model, skill declarations, required artifacts, completion criteria, transition authority, action policy, and phase prompt.
- `src/server/services/workflowRuntimeService.ts`: runtime assembles phase context from phase instructions, structured phase prompt, action policy, required artifacts, completion criteria, prior artifacts, skills, and model info.
- `desktop/src/components/chat/ChatInput.tsx`: current launch controls load workflow templates and send workflow template metadata only during new session creation.
- `desktop/src/pages/ActiveSession.tsx`: workflow status and controls appear when session workflow metadata exists.
- `desktop/src/stores/chatStore.ts`: workflow summaries use `mode: 'workflow'`, template id, phase index/count, and confirmation state.
- `src/commands/compact/index.ts`: `/compact` clears conversation history but keeps a summary in context, with optional summarization instructions.
- `src/commands/compact/compact.ts`: `/compact` returns a compaction result through available compaction paths.

## Senior Consequence Analysis

Gate status: triggered.

### Affected Object Map

- `~/.claude/cc-jiangxia/workflows.json`
- `WorkflowTemplateRegistryService`
- `/api/workflows/templates` and future mutation endpoints
- Settings navigation and content routing
- Desktop workflow template list/editor UI
- Desktop chat composer `+` menu
- Workflow template picker
- Workflow session creation payloads
- Workflow session state snapshots
- Existing dialogue sessions/transcripts
- `/compact` or equivalent compaction service path
- Invalid-template diagnostics
- Workflow status and transition controls

### State-Behavior Matrix

- Missing user config: built-in workflow remains visible and startable.
- Malformed user config: built-in remains startable; invalid issue is visible; writes must not silently destroy user content.
- Valid user template: visible and startable for future sessions.
- Invalid user template: not startable; issue visible in Settings and creation surfaces.
- Built-in template: read-only unless duplicated into a user template.
- Running/completed workflow session: continues from snapshot; source template edits do not mutate it.
- New empty chat: can start Workflow in current launch flow.
- Existing normal chat: asks context strategy, then creates linked workflow session; original chat remains unchanged.
- Existing workflow chat: remains workflow and shows workflow status/controls.
- Active streaming chat: must not allow unsafe workflow start/conversion unless explicitly designed and tested.

### Dependency Impact Table

- Direct dependencies: desktop Settings UI, chat composer UI, sessions API client, server router, workflow template registry service.
- Indirect consumers: workflow runtime, workflow session state service, session list/detail metadata, tests/fixtures.
- Shared state: cc-jiangxia config directory, registry cache, workflow session snapshots.
- Compatibility surfaces: unknown fields in user config, built-in id rules, linear-only workflow constraints, API response shape, transcript persistence, workflow metadata.

### Recovery And Validation Contract

- Preserve unknown fields on write.
- Do not mutate protected Claude files outside cc-jiangxia-owned workflow config.
- Keep built-ins startable when user config is missing or invalid.
- Reset registry cache after successful writes.
- Reject built-in shadowing, duplicate ids, missing required phase contracts, and unsupported branching/loop/parallel/nested workflow definitions.
- Validate before saving imports.
- Existing workflow sessions must continue from snapshots.
- Linked workflow session creation must be explicit, recoverable, and tested.
- Summarize path must reuse `/compact` semantics or an equivalent internal compaction path.

### Consequence Obligations

- CA-001: Future implementation must keep built-in templates startable even when user workflow config is missing, malformed, or contains invalid templates. Owner workflow: sp-specify/sp-plan. Latest resolve phase: plan. Status: pending. Stop and reopen if a proposed design makes invalid user config block the built-in template.
- CA-002: Future implementation must preserve unknown fields in cc-jiangxia-owned `workflows.json` for any write path. Owner workflow: sp-specify/sp-plan/sp-implement. Latest resolve phase: implement. Status: pending. Stop and reopen if write behavior rewrites the file from a lossy normalized model.
- CA-003: Future implementation must treat built-in templates as protected from direct mutation and prevent user templates from shadowing built-in ids. Owner workflow: sp-specify/sp-plan. Latest resolve phase: plan. Status: pending. Stop and reopen if UI/API permits editing built-in templates in place or saving a user template with `agent-development`.
- CA-004: Future implementation must not mutate existing workflow session snapshots when source templates are edited; changes apply to future sessions unless an explicit migration workflow is separately specified. Owner workflow: sp-specify/sp-plan. Latest resolve phase: specify. Status: pending. Stop and reopen if requirements imply retroactive mutation of running or completed sessions.
- CA-005: Chat-page workflow selection must not silently convert existing normal chats into workflow sessions or silently discard context. Non-empty chats must require explicit user confirmation and one of: inherit context, summarize context with `/compact`-style semantics, or clear context. Inherit/summarize create a linked new workflow session carrying the chosen context instead of mutating the original chat in place. Owner workflow: sp-specify/sp-plan. Latest resolve phase: specify. Status: pending. Stop and reopen if a design enters Workflows from a non-empty chat without explicit user confirmation, context handling selection, and linked-session behavior for inherited/summarized context.
- CA-006: Custom workflow authoring must preserve required phase output artifacts and required phase handoff contracts as first-class schema, not as unstructured prompt text only. Owner workflow: sp-specify/sp-plan. Latest resolve phase: specify. Status: pending. Stop and reopen if a design cannot validate or display each phase's intake, output, handoff, completion, and transition contract.

## UI Discussion

- ui_discussion_status: accepted
- confirmed decisions:
  - Settings label: `Workflows`.
  - Chat menu label: `Workflows`.
  - Phase editor uses a default/common section plus an advanced collapsed section.
  - Chat context dialog offers inherit, summarize, and clear choices.
- deferred decisions:
  - Exact raw JSON editing depth.
  - Whether invalid template warnings should link directly to Settings.

### UI Sketch Reference

Raw sketch source: `.specify/discussions/workflow-template-management/requirements.md`, sections `ASCII Sketch` and `Chat Page Sketch`.

## Blocking Unknowns

None.

## Soft Unknowns

- Q-002: Exact detailed template schema editor versus optional raw JSON editing depth. Owner: downstream specification/planning. Latest resolve phase: planning.
- Q-004: Whether Settings exposes a shortcut from invalid template warnings in session creation. Owner: downstream specification. Latest resolve phase: specification.
- Internal API shape for linked workflow session creation and `/compact`-style summary carry-over. Owner: downstream specification/planning. Latest resolve phase: planning.

## Downstream Instructions

- Preserve all Must-Preserve Ledger items below.
- Treat unresolved soft questions as specification/planning details, not blockers.
- Return to `sp-discussion` if downstream work proposes direct built-in edits, retroactive session mutation, lossy config writes, prompt-only phase authoring, or in-place conversion of normal chats.
- Use the narrowest meaningful tests first, then project verification gate.

## Quality Gate

- status: user-confirmed
- self_reviewed_at: 2026-05-26T15:26:25.0529811+08:00
- user_review_required: true
- user_confirmed_at: 2026-05-26T15:38:04.5270349+08:00
- blocked_reasons: none

Self-review result:

- Markdown and JSON handoff pair both exist.
- Handoff goal is concrete and unified.
- Context boundary is locked to `F:\github\cc-jiangxia`.
- No hard unknowns remain.
- Must-Preserve Ledger contains MP-001 through MP-015.
- Senior consequence obligations contain CA-001 through CA-006.
- UI discussion status and sketch reference are preserved.
- Quality gate remains draft until user review confirms the handoff.

## Must-Preserve Ledger

- MP-001
  - type: goal
  - claim: Add a user-facing `Workflows` surface for managing workflow templates and starting workflow sessions from chat.
  - source: requirements.md
  - downstream_requirement: `sp-specify` must express Settings management and Chat entry as one unified feature.
  - blocking_level: hard
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if scope drops either Settings management or Chat entry without user confirmation.

- MP-002
  - type: decision
  - claim: User-facing names should use `Workflows`.
  - source: user confirmation and requirements.md
  - downstream_requirement: Settings and Chat labels should say `Workflows`.
  - blocking_level: hard
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if downstream naming switches to another product label.

- MP-003
  - type: decision
  - claim: First-version custom workflow templates are global user-level templates only.
  - source: open-questions.md Q-007
  - downstream_requirement: Do not add project-level template storage or precedence rules in this feature.
  - blocking_level: hard
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if project-level templates enter scope.

- MP-004
  - type: decision
  - claim: Built-in templates are read-only/protected and user customization happens by copying built-ins into user templates.
  - source: requirements.md and open-questions.md Q-006/Q-003
  - downstream_requirement: UI/API must prevent direct built-in mutation and support copy-to-user-template behavior.
  - blocking_level: hard
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if built-ins become editable in place.

- MP-005
  - type: decision
  - claim: Settings management uses CRUD for user templates with a schema-aware form.
  - source: technical-options.md Option B
  - downstream_requirement: Specify create, duplicate/copy, edit, delete, validate, and save behavior.
  - blocking_level: hard
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if management becomes view-only or raw JSON-only.

- MP-006
  - type: decision
  - claim: JSON import/export is in scope, import preview lets users choose workflows, and conflicts default to automatic rename rather than overwrite.
  - source: requirements.md and open-questions.md Q-008/Q-009
  - downstream_requirement: Specify export, import preview, validation, selection, auto-rename, and no-overwrite behavior.
  - blocking_level: hard
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if import silently overwrites or does not let users choose imported workflows.

- MP-007
  - type: decision
  - claim: Workflows are staged execution contracts, not prompt collections.
  - source: requirements.md Standard Workflow Model
  - downstream_requirement: Specify workflow/phase schema around responsibility, intake, work, output, handoff, transition, and recovery.
  - blocking_level: hard
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if custom workflow authoring becomes prompt-only.

- MP-008
  - type: decision
  - claim: Every phase must require an explicit output artifact and handoff contract.
  - source: open-questions.md Q-011
  - downstream_requirement: Validation and UI must require these fields.
  - blocking_level: hard
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if phases can save without output/handoff definitions.

- MP-009
  - type: decision
  - claim: Phase editor shows common fields first and advanced schema fields collapsed.
  - source: requirements.md UI Discussion Status
  - downstream_requirement: Specify default and advanced phase editor sections.
  - blocking_level: soft
  - owner: downstream-contract
  - latest_resolve_phase: planning
  - status: pending
  - stop_and_reopen_condition: Reopen if UI exposes all fields flat without a usability decision.

- MP-010
  - type: decision
  - claim: Chat page exposes `Workflows` from the composer `+` menu and opens a workflow selection dialog.
  - source: technical-options.md Option F
  - downstream_requirement: Specify plus-menu item, dialog, template selection, invalid warnings, and start action.
  - blocking_level: hard
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if entry point moves away from composer `+` without user confirmation.

- MP-011
  - type: decision
  - claim: Non-empty chats require explicit context handling: inherit, summarize with `/compact`-style semantics, or clear.
  - source: open-questions.md Q-012
  - downstream_requirement: Specify confirmation dialog and three context strategy behaviors.
  - blocking_level: hard
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if non-empty chats enter Workflows without explicit context choice.

- MP-012
  - type: decision
  - claim: Inherit/summarize from a non-empty normal chat creates a linked new workflow session and does not mutate the original chat in place.
  - source: open-questions.md Q-013
  - downstream_requirement: Specify linked session creation, provenance, navigation, and original-chat preservation.
  - blocking_level: hard
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if design converts original normal chats in place.

- MP-013
  - type: non_goal
  - claim: Existing workflow session snapshots must not be mutated when source templates are edited.
  - source: requirements.md and CA-004
  - downstream_requirement: Specify template edits as future-session behavior.
  - blocking_level: hard
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if requirements imply retroactive mutation of running/completed workflow sessions.

- MP-014
  - type: reference
  - claim: Official Claude Code docs did not provide a stable standalone `/workflow` feature contract; use Skills/Commands as inspiration only.
  - source: project-context.md
  - downstream_requirement: Do not anchor requirements to an unverified external `/workflow` feature.
  - blocking_level: soft
  - owner: downstream-contract
  - latest_resolve_phase: specify
  - status: pending
  - stop_and_reopen_condition: Reopen if a new external feature is used as a hard requirement without fresh evidence.

- MP-015
  - type: blocking_question
  - claim: No hard unknowns remain for handoff; soft UI/API details can be resolved downstream.
  - source: handoff-assessment.md
  - downstream_requirement: Carry soft unknowns but do not block specification on them.
  - blocking_level: soft
  - owner: downstream-contract
  - latest_resolve_phase: planning
  - status: pending
  - stop_and_reopen_condition: Reopen if a soft unknown becomes a product contradiction.
