# Feature Specification: Workflows Template Management And Chat Entry

**Feature Branch**: `005-specify-discussions-workflow`  
**Created**: 2026-05-26  
**Status**: User review requested  
**Input**: `.specify/discussions/workflow-template-management/handoff-to-specify.md` and `.json`

## Overview

### Feature Goal

Add a unified user-facing `Workflows` surface that lets desktop users manage workflow templates in Settings and start workflow sessions from Chat without manually editing `~/.claude/cc-jiangxia/workflows.json`.

### Intended Users and Value

- **Primary users / roles**: Desktop users who create, inspect, customize, import, export, and launch staged agent workflows.
- **Problem or opportunity**: Workflow templates already exist as runtime configuration, but users lack a safe Settings management surface and a clear Chat entry point for choosing Workflows.
- **Confirmed product outcome**: Users can manage global user-level workflow templates, preserve protected built-ins, define staged phase contracts, and launch Workflows from the composer `+` menu with explicit context handling.

## Confirmed Scope

### In Scope

- A Settings tab or item labeled `Workflows`.
- Listing built-in and user workflow templates with source, phase count, startability, and invalid-template diagnostics.
- Global user-level user-template CRUD: create, duplicate/copy, edit, delete, validate, and save.
- Built-in templates are read-only/protected; customization happens by copying a built-in into a user template.
- JSON import/export for workflow templates, including import preview, selectable import entries, validation before write, and automatic rename for conflicts by default.
- A standard staged workflow contract where each workflow contains ordered phases and each phase has required intake, work, output artifact, handoff, completion, transition, and recovery semantics.
- Chat composer `+ > Workflows` entry that opens a workflow-template selection dialog.
- Empty/new sessions reuse the current launch flow when starting a Workflow.
- Non-empty normal chats require explicit context handling before Workflows: inherit current context, summarize current context with `/compact`-style semantics, or clear context and start fresh.
- Inherit and summarize from non-empty normal chats create a linked new workflow session carrying the chosen context; the original normal chat is not mutated in place.

### Out of Scope

- Renaming or changing the existing built-in workflow identity.
- Editing built-in templates in place.
- Project-level workflow template storage, discovery, merge precedence, or conflict rules for this version.
- Retroactively mutating existing workflow session snapshots when source templates are edited.
- Cloning an unverified external Claude Code `/workflow` feature contract.
- Prompt-only workflow authoring that cannot validate phase output artifacts and handoff contracts.

### Deferred Or Future Scope

- Exact raw JSON editing depth in the Settings editor: defer to planning unless implementation scope requires a product decision.
- Shortcut from invalid-template warnings in session creation to Settings: defer to planning/spec refinement; reopen if discoverability becomes a core acceptance criterion.
- Internal API shape for linked workflow session creation and compact-style summary carry-over: defer to planning while preserving CA-005.

## Must-Preserve Discussion Inputs

- **Source**: `.specify/discussions/workflow-template-management/handoff-to-specify.md`
- **Coverage Status**: upstream coverage complete; no hard unknowns remain.
- **Planning Gate Status**: upstream handoff-ready and user-confirmed; this spec is ready for user review before `/sp.plan`.

### Mapped Must-Preserve Items

- `MP-001` goal -> Preserved by unified scope covering Settings management and Chat entry.
- `MP-002` decision -> User-facing labels use `Workflows`.
- `MP-003` decision -> First version uses global user-level custom templates only.
- `MP-004` decision -> Built-ins are protected and copyable into user templates.
- `MP-005` decision -> Settings management uses CRUD with schema-aware form behavior.
- `MP-006` decision -> JSON import/export is in scope with preview, selection, validation, and auto-rename conflicts.
- `MP-007` decision -> Workflows are staged execution contracts, not prompt collections.
- `MP-008` decision -> Every phase requires explicit output artifact and handoff contract.
- `MP-009` decision -> Phase editor presents common fields first and advanced fields collapsed.
- `MP-010` decision -> Chat exposes `Workflows` from composer `+` and opens a selection dialog.
- `MP-011` decision -> Non-empty chats require explicit context handling choices.
- `MP-012` decision -> Inherit/summarize creates a linked workflow session and leaves the original chat unchanged.
- `MP-013` non-goal -> Existing workflow session snapshots are not mutated by template edits.
- `MP-014` reference -> Claude Code Skills/Commands can inspire UX; no unverified `/workflow` contract is normative.
- `MP-015` blocking question -> No hard unknowns remain; soft details are carried to planning.

### Discussion Conflicts

No open conflicts remain. Planning must reopen specification if any out-of-scope item is reintroduced without user confirmation.

## Scenarios and Usage Paths

### Primary Scenario - Manage Workflow Templates In Settings

A desktop user opens Settings, selects `Workflows`, reviews built-in and user templates, edits a user template, validates it, and saves it for future workflow sessions.

**Usage Path**:
1. User opens Settings and selects `Workflows`.
2. System lists built-in and user templates with source, validity/startability, phase count, and diagnostics.
3. User creates a new template, copies a built-in, edits an existing user template, validates changes, and saves.
4. System persists only global user-level template changes and refreshes the visible template list.

**Acceptance Signals**:
- Built-in templates display as read-only and remain startable.
- User templates can be created, copied, edited, deleted, validated, and saved.
- Invalid templates show actionable diagnostics and cannot be started or saved as valid.
- Writes preserve unknown fields in cc-jiangxia-owned workflow config.

### Secondary Scenario - Import And Export Templates

A user exports templates for backup or sharing, then imports workflow JSON and selects which workflows to add.

**Usage Path**:
1. User chooses export for selected templates or user workflow config.
2. User imports workflow template JSON or workflow config JSON.
3. System previews discovered workflows, validation issues, and conflict rename outcomes.
4. User selects templates to import; system validates before write and saves selected user templates.

**Acceptance Signals**:
- Import preview lists workflows found in JSON and lets users select entries.
- Conflicts default to automatic rename, not overwrite.
- Import cannot shadow built-in ids and must not silently destroy existing user content.

### Secondary Scenario - Start Workflows From Chat

A user opens the composer `+` menu, selects `Workflows`, chooses a template, and starts a workflow session.

**Usage Path**:
1. User clicks composer `+` and chooses `Workflows`.
2. System opens a workflow template dialog with template source, phase count, phase list, validity, and start action.
3. In an empty/new session, starting a Workflow reuses the current launch flow.
4. In a non-empty normal chat, system asks how to handle context before creating a linked workflow session.

**Acceptance Signals**:
- Chat workflow entry is explicit and cannot accidentally start workflow mode.
- Non-empty chats are not silently converted, cleared, or overwritten.
- Inherit/summarize creates a linked workflow session carrying chosen context.
- Existing workflow sessions continue to show workflow status, phase state, transition controls, and report links.

### Edge Cases and Failure Paths

- Missing user workflow config: built-in template remains visible and startable.
- Malformed user workflow config: built-in remains startable, diagnostics are visible, and writes must not silently destroy malformed user content.
- Invalid user template: visible with diagnostics, not startable, and rejected by save/import validation.
- Built-in id conflict: rejected on save/import.
- Duplicate user ids: rejected or surfaced as invalid.
- Unsupported branching, loops, parallel, or nested workflow definitions: rejected for this version.
- Running, completed, stale-template, and missing-template workflow sessions continue from their snapshots; source-template edits apply only to future sessions.
- Active streaming chat must not allow unsafe workflow start/conversion unless planning explicitly designs and tests that state.

## Capability Decomposition

### Capability Map

- **Capability 1: Settings Workflows Management**  
  Supports: managing global user-level templates safely.  
  Depends on: workflow template registry, Settings navigation, i18n labels, validation diagnostics.  
  Delivery note: core.

- **Capability 2: Standard Workflow Contract Authoring**  
  Supports: schema-aware workflow and phase editing.  
  Depends on: workflow type fields, runtime phase prompt model, validation rules.  
  Delivery note: core.

- **Capability 3: JSON Import/Export**  
  Supports: backup, sharing, selected import, and conflict-safe onboarding.  
  Depends on: registry validation and unknown-field preservation.  
  Delivery note: core.

- **Capability 4: Chat Workflows Entry**  
  Supports: launching Workflows from composer `+` and template selection.  
  Depends on: current session creation flow, workflow template list API, ChatInput/EmptySession/ActiveSession behavior.  
  Delivery note: core.

- **Capability 5: Context Strategy And Linked Workflow Sessions**  
  Supports: entering Workflows from non-empty normal chats without mutating the original chat.  
  Depends on: session creation semantics, transcript/context handling, `/compact`-style summary behavior.  
  Delivery note: integration-critical.

### Capability Relationships

- Settings management and Chat entry share the same template registry and validation semantics.
- Standard workflow contract authoring is required before CRUD can be treated as real workflow authoring rather than prompt editing.
- Import/export must use the same validation and built-in protection rules as Settings save.
- Linked workflow sessions depend on a planning-approved API contract that preserves original chat transcripts and workflow snapshot semantics.

## Requirements

### Functional Requirements

- **FR-001**: The desktop Settings UI MUST expose a `Workflows` settings surface.
- **FR-002**: The `Workflows` surface MUST list built-in and user templates with source, name, id, version, phase count, validity/startability, and invalid diagnostics.
- **FR-003**: The system MUST support create, duplicate/copy, edit, delete, validate, and save for user templates.
- **FR-004**: Built-in templates MUST be read-only and copyable into user templates, but not directly editable or deletable.
- **FR-005**: User templates MUST be global user-level templates only for this version.
- **FR-006**: Save/import validation MUST reject built-in id shadowing, duplicate ids, missing required fields, missing required phase output/handoff contracts, and unsupported branching/loop/parallel/nested definitions.
- **FR-007**: Workflow phase editing MUST support common fields first: id, display name, role/type, instructions, objective, required intake, expected output artifact, handoff rules, execution rules, completion criteria, transition authority.
- **FR-008**: Advanced phase fields MUST be available behind an expandable advanced section when supported: handoff intake, output sections, completion/stop rules, required artifacts, action policy, requested model, skill guidance, recovery/retry/reopen notes.
- **FR-009**: JSON export MUST allow exporting selected templates and/or user workflow config in a reusable JSON form.
- **FR-010**: JSON import MUST preview discovered workflows, validation issues, selected import entries, and automatic rename outcomes before write.
- **FR-011**: JSON import MUST default conflicts to automatic rename and MUST NOT overwrite existing user templates by default.
- **FR-012**: The composer `+` menu MUST include `Workflows`.
- **FR-013**: `+ > Workflows` MUST open a workflow selection dialog with template source, phase count, phase list, invalid warnings, and start action.
- **FR-014**: Starting a Workflow from an empty/new session MUST reuse the current launch flow/session behavior where possible.
- **FR-015**: Starting a Workflow from a non-empty normal chat MUST require explicit context handling: inherit, summarize with `/compact`-style semantics, or clear.
- **FR-016**: Inherit and summarize from a non-empty normal chat MUST create a linked new workflow session carrying chosen context and MUST NOT mutate the original normal chat in place.
- **FR-017**: Existing workflow sessions MUST continue to use their workflow snapshots and MUST NOT be retroactively mutated when source templates change.
- **FR-018**: Active workflow sessions MUST keep showing workflow status, current phase, transition controls, and report status.

### Non-Functional Requirements

- Preserve unknown fields in cc-jiangxia-owned `workflows.json` on every write path.
- Validate all JSON import and API mutation payloads at the server boundary.
- Keep protected files outside cc-jiangxia-owned workflow config read-only for this feature.
- Provide accessible dialogs, controls, validation messages, and keyboard-accessible workflows.
- Keep error and diagnostic messages actionable without exposing secrets or unrelated user-owned state.

### Boundary Constraints

- This workflow is specification-only; implementation is deferred to later commands.
- Production implementation under `desktop/src`, `src/server`, or workflow runtime surfaces must include same-area tests and pass relevant project quality gates.
- `/compact`-style summary behavior may reuse slash-command semantics or an equivalent internal compaction path, but planning must prove the selected route preserves the confirmed user-visible semantics.

## Acceptance Proof

### Acceptance Signals

- Users can understand which templates are startable and why invalid templates are invalid.
- Invalid user config does not break the built-in Agent Development preset.
- Workflow session creation remains compatible with selected template id, source, and first phase id.
- Template edits apply to future sessions and do not mutate existing workflow session snapshots.
- Import validates before write and does not silently overwrite existing user templates.
- Template validation rejects prompt-only phases that lack output artifact or handoff contract definitions.
- Chat workflow entry requires explicit intent and context handling for non-empty chats.
- Summarize-current-context uses `/compact`-style semantics or an equivalent internal path.

### Measurable Success Criteria

- **SC-001**: A user can create, validate, save, duplicate, delete, import, and export user templates from Settings without manually editing JSON files.
- **SC-002**: A malformed or invalid user workflow config still leaves the built-in workflow visible and startable.
- **SC-003**: A non-empty normal chat can start a linked workflow session through explicit context strategy selection while the original chat remains unchanged.
- **SC-004**: Existing workflow sessions continue from their stored snapshots after source templates are edited.

## Decision Capture

### Locked Decisions

- Write one unified spec for Settings management, staged workflow contracts, and Chat composer entry.
- Use `Workflows` as the user-facing label.
- Use global user-level custom templates only in the first version.
- Protect built-in templates from direct mutation and allow copy-to-user-template customization.
- Use schema-aware CRUD management rather than view-only or raw JSON-only management.
- Include JSON import/export with preview and auto-rename conflicts.
- Require output artifact and handoff contract on every phase.
- Use composer `+ > Workflows` as the Chat entry point.
- For non-empty normal chats, inherit/summarize creates a linked workflow session and preserves the original chat.

### User-Confirmed Deferrals

- Project-level workflow templates -> deferred; reopen if project-level storage enters scope.
- Retroactive workflow session migration after template edits -> deferred; reopen if running/completed session mutation is proposed.
- Raw JSON editing depth -> planning-level detail; reopen if UX scope cannot be planned safely.
- Invalid-warning shortcut to Settings -> planning-level detail; reopen if discoverability becomes core acceptance.

### Canonical References

- `.specify/discussions/workflow-template-management/handoff-to-specify.md`
- `.specify/discussions/workflow-template-management/handoff-to-specify.json`
- `.specify/discussions/workflow-template-management/requirements.md`
- `.specify/discussions/workflow-template-management/open-questions.md`
- `.specify/discussions/workflow-template-management/technical-options.md`
- `.specify/discussions/workflow-template-management/project-context.md`

## Consequence Analysis

### Lifecycle And State Behavior

- `CA-001`: Built-in templates remain startable when user config is missing, malformed, or contains invalid templates.
- `CA-002`: Write paths preserve unknown fields in `~/.claude/cc-jiangxia/workflows.json`.
- `CA-003`: Built-ins are protected and user templates cannot shadow built-in ids.
- `CA-004`: Source template edits do not mutate running, completed, stale, or missing-template workflow session snapshots.
- `CA-005`: Chat workflow entry from non-empty normal chats requires explicit context choice and linked-session behavior.
- `CA-006`: Custom workflow authoring preserves phase output artifacts and handoff contracts as first-class schema.

### Recovery And Validation

- Reset registry cache after successful writes.
- Reject invalid template structures before save/import writes.
- Keep diagnostics visible when user config is malformed or templates are invalid.
- Make linked workflow session creation explicit, recoverable, and testable.
- Preserve original normal chat transcripts when Workflows are started from existing chats.

## Risks and Gaps

### Planning Risks

- The Settings editor can become too broad if every advanced schema field is treated as first-screen UI instead of progressive disclosure.
- Linked workflow session creation crosses UI, API, transcript, and workflow state surfaces; planning must define provenance, navigation, and recovery behavior.
- Summary carry-over must not duplicate or bypass `/compact` semantics accidentally.
- Import/export write paths are persistence-sensitive and must preserve unknown fields.

### Information Gaps

- Exact mutation endpoint shape is intentionally deferred to `/sp.plan`.
- Exact UI affordance for raw JSON editing is deferred to planning.
- Exact shortcut behavior from invalid warnings to Settings is deferred to planning.
