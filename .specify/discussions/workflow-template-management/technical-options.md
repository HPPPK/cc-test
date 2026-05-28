# Technical Options: Workflow Template Management

## Status

- Selected direction: Option B, CRUD for user templates with a schema-aware form.
- Context boundary is locked to the current repository.
- Senior consequence analysis is triggered because template management can affect workflow session creation, persistence, compatibility, and user-owned config.

## Option A: View And Diagnostics First

- Product behavior: Add a Settings tab that lists built-in and user templates, phases, source, version, startability, and invalid template issues. Include an "open config file" or copy-path affordance, but no writes.
- Complexity: lowest.
- Compatibility: minimal risk; does not change template persistence semantics.
- Verification: desktop UI test, API client test if needed, existing server template listing tests.
- Risk: may not satisfy "manage" if the user expects create/edit/delete inside the app.
- Recommendation: good first version only if the user's goal is visibility and diagnostics.

## Option B: CRUD For User Templates With Schema-Aware Form

- Product behavior: Add a Settings tab with list, create, duplicate, edit, delete for user templates. Built-ins are read-only but can be duplicated into a user template. Validate before save and show invalid issues inline.
- Complexity: medium-high.
- Compatibility: must preserve unknown fields on edits, prevent built-in id conflicts, avoid breaking existing sessions, and make future sessions use updated templates.
- Verification: server API tests for write/delete/duplicate behavior, frontend API tests, Settings UI tests, registry preservation tests, workflow session creation regression.
- Risk: form coverage for phase prompts/action policies/required artifacts may become large.
- Recommendation: selected by user on 2026-05-26.

### Suggested Form Shape For Option B

- Template list: built-in and user templates, source badge, version, phase count, validity status, and actions.
- Template editor: id/slug, name, description, version, and ordered phases.
- Storage scope: global user templates only; no project-level template storage in first version.
- JSON import/export: included in first version; import validates, lets the user choose which workflows/templates to import, and defaults conflicting names/ids to automatic rename rather than overwrite.
- Workflow authoring model: schema-aware staged workflow contract, not freeform prompt-only editing.
- Phase editor default section:
  - phase id/slug
  - phase name
  - phase role/type
  - phase instructions
  - phase objective
  - intake requirements
  - expected output artifact
  - handoff rules
  - execution rules
  - completion criteria
  - transition authority
- Phase editor advanced section:
  - handoff intake rules
  - required output artifact name and sections
  - completion and stop rules
  - required artifacts
  - allowed/forbidden actions
  - requested model
  - skill guidance
  - recovery/retry/reopen notes
- Built-in template detail: read-only preview plus duplicate/copy-to-user-template action. Built-in ids/names must not be changed by this feature.
- Validation panel: show malformed config, invalid template, duplicate id, built-in id conflict, unsupported branching/loop/parallel/nested rules, and missing required fields.
- Confirmed interaction: phase editor shows default/common fields first and keeps advanced schema fields collapsed unless expanded.

## Option C: Raw JSON Editor Plus Guided Validation

- Product behavior: Add a Settings tab with the current workflow config JSON editor, validate/reload, save, and diagnostics. Built-in template remains read-only and visible as reference.
- Complexity: medium.
- Compatibility: aligns with existing JSON-backed `workflows.json`, but requires careful save validation and backup/recovery messaging.
- Verification: API write/read tests, malformed JSON handling, UI tests for validation failures and successful save.
- Risk: less friendly for non-technical users; accidental edits can invalidate all user templates, though built-in remains startable.
- Recommendation: acceptable if the intended audience is power users and fast delivery matters.

## Chat Workflow Entry Options

### Option D: Creation-Time Workflows Mode Selector

- Product behavior: New chat composer has a clear Chat/Workflows segmented control. Workflows selection reveals a template picker. Sending starts a new workflow session with selected template metadata. After creation, mode is locked for that session.
- Complexity: low-medium because current code already attaches workflow metadata during session creation.
- Compatibility: best alignment with existing session model and workflow snapshots.
- Verification: ChatInput/EmptySession tests for mode selection, selected template create payload, invalid-template display, and normal chat unchanged.
- Risk: users cannot convert an existing normal conversation into workflow mode directly.
- Recommendation: recommended default unless conversion is a hard requirement.

### Option F: Composer Plus Menu Workflows Dialog

- Product behavior: Add `Workflows` to the composer `+` menu. Clicking opens a workflow selection dialog. Starting from an empty/new session reuses the current launch flow. Starting from a non-empty chat asks whether to inherit current context, summarize current context with `/compact`-style semantics, or clear current context before entering Workflows.
- Complexity: medium and aligns with existing composer affordances.
- Compatibility: requires explicit context handling semantics for existing chats, but preserves valuable context when the user chooses inheritance or summary.
- Verification: ChatInput tests for plus-menu item, dialog open/close, empty-session reuse, non-empty-session new workflow session creation, selected template payload, invalid-template display, and unchanged attach/slash behavior.
- Risk: linked-session creation needs clear provenance and navigation so users understand the original chat remains unchanged.
- Recommendation: selected by user on 2026-05-26.
- Confirmed refinement: from non-empty chats, inherit/summarize should create a linked new workflow session carrying the chosen context rather than mutate the original chat in place.

### Option E: Convert Existing Chat To Workflows

- Product behavior: Existing normal chat can be switched into Workflows mode by choosing a template from the chat page.
- Complexity: high because the system must define how prior messages map into initial phase input, how workflow state is created after a transcript exists, and whether the original dialogue session is mutated or forked.
- Compatibility: requires new server API and recovery semantics; must preserve transcript integrity and avoid confusing session metadata.
- Verification: server tests for conversion/forking, desktop tests for confirmation UI, workflow state tests, resume tests, and rewind/session metadata tests.
- Risk: ambiguous behavior for active streams, attachments, existing tool calls, partial tasks, and user expectations.
- Recommendation: do not mutate existing sessions in place. If needed, provide "Start workflow from this chat" that creates a new workflow session using current context as initial prompt or reference.

## Senior Consequence Analysis

### Affected Object Map

- `~/.claude/cc-jiangxia/workflows.json`: user-owned cc-jiangxia workflow template config.
- `WorkflowTemplateRegistryService`: load, validate, cache, and write behavior.
- `/api/workflows/templates`: current list endpoint and any future mutation endpoints.
- `desktop/src/pages/Settings.tsx`: settings navigation and content routing.
- `desktop/src/pages/EmptySession.tsx`: session creation template selection.
- `WorkflowTemplatePicker`: startable/invalid template presentation.
- Workflow session state snapshots: existing sessions keep template snapshots and source template status.
- User-visible invalid-template diagnostics.
- Chat composer workflow mode selector.
- Existing dialogue sessions and transcripts if conversion is introduced.
- Active workflow status and transition controls.

### State-Behavior Matrix

- Missing user config: built-in template remains visible and startable.
- Malformed user config: built-in remains startable; invalid issue is visible; write behavior must not silently destroy user content.
- Valid user template: visible and startable for future workflow session creation.
- Invalid user template: not startable; issue visible in Settings and creation surfaces.
- Built-in template: read-only source of truth unless explicitly duplicated into a user template.
- Running/completed workflow session: must continue from its snapshot; editing source template should not mutate existing session state.
- Stale/missing template on resume: existing recovery semantics must remain visible and not be hidden by Settings changes.
- Partially refreshed registry cache: after writes, cache must reset so UI reads current data.
- New empty chat: can select Chat or Workflow before first message.
- Existing normal chat: `+ > Workflows` opens a dialog and asks how to handle current context before creating a linked workflow session; the original normal chat remains unchanged.
- Existing workflow chat: mode remains workflow and shows status/transition controls.
- Active streaming chat: must not allow unsafe mode changes during an in-flight run unless explicitly designed.

### Dependency Impact Table

- Direct dependencies: desktop Settings UI, desktop session creation UI, sessions API client, server router, workflow template registry service.
- Indirect consumers: workflow runtime, workflow session state service, session list/detail metadata, tests and fixtures under workflow templates/sessions.
- Shared state: cc-jiangxia-owned config directory, registry cache, workflow session snapshots.
- Compatibility surfaces: user config unknown fields, built-in id conflict rules, linear-only first-release constraints, API response shape consumed by desktop.
- Chat/workflow compatibility surfaces: session creation payload, session metadata, transcript persistence, workflow state snapshots, active WebSocket session state, and workflow transition controls.
- Validation routes: `bun run check:server`, `bun run check:desktop`, and final `bun run verify` during implementation.

### Recovery And Validation Contract

- Preserve unknown fields on write.
- Do not mutate protected Claude files outside cc-jiangxia-owned workflow config.
- Keep built-in template startable when user config is missing or invalid.
- Reset registry cache after successful writes.
- Reject or block saves that would shadow built-ins, duplicate ids, remove required fields, or introduce unsupported branching/loop/parallel/nested structures.
- Existing workflow sessions must continue from snapshots and not be rewritten by template edits.
- If existing chat conversion is ever supported, it must be explicit, recoverable, and tested against active/inactive/streaming/error states.
- Workflows launched from non-empty chats must inherit, summarize, or clear context according to explicit user choice.
- The summarize path should use existing `/compact` semantics where feasible: clear conversation history while keeping a summary in context.
- Inherit and summarize paths should create a linked workflow session carrying the selected context instead of mutating the original normal chat in place.

### Coverage Gaps

- CG-001: Import conflict policy was resolved by user confirmation: preview imported workflows, let users choose which ones to import, and auto-rename conflicts by default instead of overwriting. Status: resolved.
- CG-002: Exact UI depth for schema editing versus optional raw JSON affordances remains a soft planning-level UX decision. Owner: downstream specification/planning. Latest safe resolve phase: planning. Routing: carry as soft unknown, not a handoff blocker.
- CG-003: Exact internal API mechanism for linked workflow session creation and `/compact`-style summary carry-over remains a downstream design detail. Owner: downstream specification/planning. Latest safe resolve phase: planning. Routing: carry as soft unknown, not a handoff blocker as long as CA-005 is preserved.

### Confirmed Import Conflict Policy

- Preflight import and list all workflow templates found in the JSON.
- Let the user select which workflows/templates to import.
- For selected templates with name/id conflicts, default to auto-renaming the imported template.
- Do not overwrite existing user templates by default.
- After import, users can edit or delete imported templates as normal.

### Consequence Obligations

- CA-001: Future implementation must keep built-in templates startable even when user workflow config is missing, malformed, or contains invalid templates. Owner workflow: sp-specify/sp-plan. Latest resolve phase: plan. Status: pending. Stop and reopen if a proposed design makes invalid user config block the built-in template.
- CA-002: Future implementation must preserve unknown fields in cc-jiangxia-owned `workflows.json` for any write path. Owner workflow: sp-specify/sp-plan/sp-implement. Latest resolve phase: implement. Status: pending. Stop and reopen if write behavior rewrites the file from a lossy normalized model.
- CA-003: Future implementation must treat built-in templates as protected from direct mutation and prevent user templates from shadowing built-in ids. Owner workflow: sp-specify/sp-plan. Latest resolve phase: plan. Status: pending. Stop and reopen if UI/API permits editing built-in templates in place or saving a user template with `agent-development`.
- CA-004: Future implementation must not mutate existing workflow session snapshots when source templates are edited; changes apply to future sessions unless an explicit migration workflow is separately specified. Owner workflow: sp-specify/sp-plan. Latest resolve phase: specify. Status: pending. Stop and reopen if requirements imply retroactive mutation of running or completed sessions.
- CA-005: Chat-page workflow selection must not silently convert existing normal chats into workflow sessions or silently discard context. Non-empty chats must require explicit user confirmation and one of: inherit context, summarize context with `/compact`-style semantics, or clear context. Inherit/summarize create a linked new workflow session carrying the chosen context instead of mutating the original chat in place. Owner workflow: sp-specify/sp-plan. Latest resolve phase: specify. Status: pending. Stop and reopen if a design enters Workflows from a non-empty chat without explicit user confirmation, context handling selection, and linked-session behavior for inherited/summarized context.
- CA-006: Custom workflow authoring must preserve required phase output artifacts and required phase handoff contracts as first-class schema, not as unstructured prompt text only. Owner workflow: sp-specify/sp-plan. Latest resolve phase: specify. Status: pending. Stop and reopen if a design cannot validate or display each phase's intake, output, handoff, completion, and transition contract.
