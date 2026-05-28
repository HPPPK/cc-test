# Requirements: Workflow Template Management

## Confirmed Goal

- Add a user-facing `Workflows` surface for managing workflow templates and starting workflow sessions from chat.

## Naming

- User-facing navigation and mode labels should use `Workflows`.
- Settings tab label: `Workflows`.
- Chat mode label: `Workflows`.
- Internal implementation and detailed UI can still distinguish workflow templates, workflow sessions, phases, and artifacts.

## Reference Product Principles

- `Workflows` should be discoverable like a command/skill surface, not hidden as a raw JSON setting.
- A workflow should have a clear user-invoked entry point, similar to slash-command skills.
- Side-effecting or high-control workflows should require explicit user choice rather than automatic invocation.
- Workflows may later borrow concepts from skill metadata: arguments, model/effort preference, allowed tools/action policy, hooks, and fork/subagent execution mode.
- Do not model the feature as a clone of an unconfirmed Claude Code `/workflow` feature.
- Custom workflow authoring should guide users through the standard workflow contract instead of exposing only raw prompt text.

## Working Product Interpretation

- The target user is a desktop user who wants to inspect and maintain Workflows without editing `~/.claude/cc-jiangxia/workflows.json` manually.
- The feature is UI-facing and should preserve the current session creation flow that lets users pick a workflow template before starting a workflow session.
- Workflows are not just prompt collections. A Workflow is a staged execution contract where each phase has a defined responsibility, intake, output, handoff, transition, and recovery behavior.

## Standard Workflow Model

- Workflow: a named staged process template.
- Phase: one ordered step in the workflow, responsible for a distinct kind of work.
- Phase role: the job of the phase, such as discuss, specify, plan, task, implement, verify, review, release, or custom.
- Phase intake: what the phase receives from the user, previous phase artifacts, current project evidence, or external references.
- Phase work definition: what the agent should do in the phase, including instructions, rules, allowed/forbidden actions, model preference, and optional skills.
- Phase output artifact: the required durable result expected from the phase.
- Handoff contract: the required payload passed to the next phase, including required fields, artifact references, assumptions, unresolved questions, and quality gate status.
- Completion criteria: conditions that make the phase ready to advance, block, retry, or stop.
- Transition rule: whether the phase advances automatically or requires user confirmation.
- Recovery behavior: what happens when the phase is blocked, rejected, stale, missing artifacts, or unable to complete.

## Standard Phase Contract

- Identity: id/slug, display name, role/type, short description.
- Intake contract: required inputs, optional inputs, previous phase artifacts consumed, evidence/source expectations.
- Work contract: phase instructions, objective, execution rules, allowed/forbidden actions, model preference, skill guidance.
- Output contract: required artifact name, artifact type or format, required sections/fields, validation requirements.
- Handoff contract: required summary to next phase, artifact references, preserved decisions, assumptions, unresolved questions, blocking/soft unknown policy, quality gate status.
- Transition contract: completion criteria, auto or user-confirmed transition, reject/retry behavior, stop/reopen conditions.

## Candidate Scope

### Settings Workflows Management

- A Settings tab or settings item labeled `Workflows`.
- A list of available built-in and user workflow templates.
- Visibility into invalid user template issues already reported by the registry.
- CRUD form management for user templates: create, copy/duplicate, edit, delete, validate, and save.
- JSON import/export for workflow templates is in scope for the first version.
- Custom workflow templates are global user-level templates in the first version, backed by existing cc-jiangxia-owned user workflow config storage.
- Built-in templates are protected/read-only and must keep stable identity. Users customize workflows by copying a built-in template into a user template, then editing the user template.
- A template can define a workflow such as `spec-workflow` with configurable ordered phases.
- Each phase needs editable prompt/instruction behavior, not only a phase name.
- Each phase must define a required output artifact and required handoff contract.
- The phase editor should expose common fields first and put advanced fields behind an expandable advanced section.

### Chat Workflows Entry

- Chat page must expose `Workflows` from the composer `+` menu.
- Clicking `+ > Workflows` opens a dialog for choosing a workflow template.
- The dialog shows selected template name, source, phase count, phase list, and invalid-template warnings.
- If the current session has existing content, the dialog must ask how to handle current context before entering Workflows.
- Existing context can be valuable and should be available for inheritance into the Workflow when the user chooses it.
- The user must be able to summarize current context before entering Workflows. Product semantics should match `/compact`: clear conversation history while keeping a summary in context, with optional summarization instructions if exposed by the UI.
- The user must be able to clear current context before entering Workflows when they want a fresh start.
- If the current session is a new empty session, starting a Workflow reuses the current launch flow/session instead of creating another empty tab first.
- Once a session is in workflow mode, the active chat page should show workflow status, current phase, transition controls, and report status.
- Existing normal chats must not be converted into Workflows silently; conversion requires explicit user confirmation and context handling selection.
- When entering Workflows from a non-empty normal chat with inherited or summarized context, create a linked new workflow session carrying the chosen context rather than mutating the original chat in place.

## Recommended Template Fields

- Template identity: id/slug, display name, description, version.
- Template source/status: built-in read-only or user editable.
- Ordered phases: add, remove, duplicate, reorder, and edit phase details.

## Recommended Phase Fields

- Default phase editor fields:
  - Phase identity: id/slug and display name.
  - Phase role/type.
  - Phase instructions: concise plain-language instruction shown to the agent for that phase.
  - Phase objective.
  - Required intake.
  - Expected output artifact.
  - Handoff summary/rules.
  - Execution rules.
  - Completion criteria.
  - Transition authority: automatic advance or user confirmation.
- Advanced phase editor fields:
  - Handoff intake rules.
  - Required output artifact name and sections.
  - Completion and stop rules.
  - Required artifacts.
  - Action policy: allowed and forbidden action lists.
  - Requested model: optional phase-specific model preference.
  - Skill guidance: optional skills or capability hints for the phase.
  - Recovery/retry/reopen notes.

## Runtime Field Mapping

- Structured phase prompt/protocol maps to:
  - objective
  - handoff intake
  - execution rules
  - required output artifact name and sections
  - completion and stop rules
- Phase instructions map to the existing phase `instructions` field.
- Completion criteria maps to the existing `completionCriteria` field.
- Transition authority maps to the existing `transition.authority` / `transitionAuthority` runtime field.

## Confirmed Non-Goals

- Do not rename or change the existing built-in workflow identity as part of this feature.
- Do not edit built-in templates in place.
- Do not mutate existing workflow session snapshots when source templates are edited.
- Do not add project-level workflow template storage or precedence/merge rules in the first version.

## Non-Goals Not Yet Confirmed

- Whether the first version should include a full visual template editor.
- Whether raw JSON editing is in scope.
- Whether running workflow sessions should react to template edits beyond future-session behavior.
- Whether every advanced phase field should appear in the default form or be hidden behind an advanced section.
- How JSON import should resolve template id conflicts.

## Acceptance Signals To Preserve

- Users can understand which templates are startable and why invalid templates are invalid.
- Any write path must preserve unknown fields in user-owned workflow config.
- Invalid user config must not break the built-in Agent Development preset.
- The workflow session creation UI must remain compatible with selected template id, source, and first phase id.
- Template edits apply to future sessions and must not mutate existing workflow session snapshots.
- Built-in templates remain available and startable even when user templates are invalid.
- Import must validate before write and must not silently overwrite existing user templates.
- Template validation must reject prompt-only phases that lack output artifact or handoff contract definitions.
- Chat workflow entry must not accidentally start workflow mode when the user only wants normal chat.
- Existing normal chats must not enter Workflows without explicit user intent and a defined context handling contract.
- The UI must not silently discard existing context when entering Workflows.
- The summarize-current-context option should reuse the existing `/compact` behavior or an equivalent internal compaction path rather than inventing a separate summary concept.
- Existing normal chats should remain available as normal chats after starting a linked workflow session from them.

## Import/Export Expectations

- Export can provide a selected template JSON and/or the user workflow config JSON.
- Import accepts workflow template JSON or a workflow config JSON containing templates.
- Import preview must list workflows/templates found in the JSON and allow selecting which ones to import.
- If an imported selected workflow conflicts with an existing name/id, the default behavior is automatic rename rather than overwrite.
- Import does not ask users to resolve every conflict before import; users can delete or edit imported templates afterward.
- Import must run the same validation rules used by the registry before saving.
- Import must not allow a user template to shadow a built-in id.
- Import must preview validation errors and automatic rename outcomes before write.
- Import writes only to global user-level workflow template storage.

## UI Discussion Status

- ui_discussion_status: accepted
- Confirmed UI decision: phase editor uses a core/default section plus an advanced collapsed section.

## ASCII Sketch

```text
Settings > Workflows

[Template List]                         [Template Editor]
- Agent Development     builtin         Name: My Spec Workflow
- My Spec Workflow      user      *     ID: spec-workflow
- Broken Template       invalid         Description: ...

Actions: [New] [Copy Built-in] [Delete] Phases
                                         1. Discussion        [edit] [duplicate]
                                         2. Specify           [edit] [duplicate]
                                         3. Plan              [edit] [duplicate]
                                         [+ Add phase]

Phase Editor
  Name: Specify
  ID: specify
  Instructions: ...
  Objective: ...
  Execution rules: ...
  Completion criteria: ...
  Transition: ( ) auto  (x) user confirmation

  Advanced
    Handoff intake
    Output artifact
    Required artifacts
    Allowed / forbidden actions
    Requested model
    Skill guidance
```

## Chat Page Sketch

```text
New Chat

Composer +

[ Attach files ]
[ Slash commands ]
[ Workflows ]

When Workflows selected:
  Dialog: Choose Workflow
  Workflow template: [ Agent Development v ]   5 phases
  Source: builtin
  Phases: Discussion -> Specify -> Plan -> Tasks -> Implement

  Message:
  [ Describe what you want to do...                         ]
  [ Start workflow ]

Behavior:
  - Empty/new current session: start workflow in current launch flow.
  - Existing current session: ask how to handle current context, then create a linked workflow session.
      ( ) Inherit current context
      ( ) Summarize current context, then start
      ( ) Clear context and start fresh

Active workflow session:
  Workflow: Agent Development     Phase 2/5: Specify     pending confirmation
  [Confirm] [Request changes] [Retry]

  Chat transcript...
```
