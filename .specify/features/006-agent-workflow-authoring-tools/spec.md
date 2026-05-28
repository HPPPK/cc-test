# Feature Specification: Agent Workflow Authoring Tools

**Feature Branch**: `006-agent-workflow-authoring-tools`  
**Created**: 2026-05-27  
**Status**: User review requested  
**Input**: User-confirmed `sp-discussion` handoff for conversational workflow template authoring.

## Goal And Users

### Feature Goal

Provide a globally available internal agent tool capability that lets the main agent inspect, explain, validate, create, update, duplicate/copy, and delete workflow templates through conversation. The tool must preserve the existing Workflows validation, persistence, permission, field-guidance, Settings compatibility, and workflow-session snapshot safety rules.

### Intended Users And Value

- **Primary users / roles**: Users who configure cc-jiangxia workflows and want the agent to translate rough workflow ideas or critiques into valid workflow templates.
- **Problem or opportunity**: Workflows can already be manually configured, but the user wants the agent to help author and improve templates without requiring manual JSON or UI-only editing.
- **Confirmed product outcome**: A user can describe a new workflow or request changes to an existing workflow; the agent can use a tool to produce validated persistent user-template changes that Settings Workflows can display after reload/refetch.

## Confirmed Scope

### In Scope

- A globally available internal agent workflow authoring tool or equivalent tool capability.
- Read-only discovery operations: authoring guide/schema help, list templates, inspect one template, explain structure and validation state.
- Validation operation that uses the same workflow template semantics as the existing registry/API and does not write.
- Mutating operations for user templates: create, update, duplicate/copy, and delete.
- Builtin copy-then-edit behavior for requests to modify builtin templates such as `agent-development`.
- Direct validated persistence for valid user-template create/update operations; no mandatory preview/commit step.
- Stale-write protection for update/delete: re-read current template and reject writes when the template differs from the agent's original basis.
- Destructive delete support only for uniquely identified `source: user` templates.
- Transcript-auditable tool results that include operation, affected template id/source, persistence state, validation issues, before/after summary, and suggested next action.
- Compatibility with the existing Settings Workflows page: agent-authored templates must be stored in the same registry/persistence path so Settings can show them after reload/refetch.
- Preservation of workflow runtime template snapshot semantics: template edits affect future sessions only.

### Out Of Scope

- Direct builtin template mutation, builtin deletion, or user-template shadowing of builtin IDs.
- Mandatory preview-only persistence for normal valid create/update operations.
- Parallel, nested, branching, or looping workflow shapes in first scope.
- In-place mutation or migration of active, resumed, historical, pending-confirmation, or completed workflow session snapshots.
- Agent tool operations that edit repository source files as part of authoring a workflow template.
- New Settings UI redesign beyond compatibility with existing manual management and refetch behavior.
- Mutating protected non-workflow user state such as shared settings, transcripts, providers, MCP config, OAuth tokens, skills, plugin state, adapters, or team/session records.

### Deferred Or Future Scope

- Decide during `/sp.plan` whether desktop-launched sessions need a desktop-server-backed authoring path in addition to direct registry-service writes. Reopen if one runtime path cannot preserve registry/API semantics.
- Decide during `/sp.plan` how the field guide stays aligned with validation: shared schema metadata, validator annotations, or a static tested guide colocated with validation. Reopen if the guide can drift from validation or cannot be tested deterministically.
- Any future support for parallel, nested, branching, or looping workflows requires an explicit product decision and validation-schema expansion.

## Scenarios

### Scenario 1 - Create A Workflow From Conversation

The user describes a desired workflow in natural language, such as three stages with rough purposes. The agent retrieves field guidance, fills required workflow and phase fields, validates the candidate, persists a user template, and reports the result.

**Usage Path**:
1. User asks ordinary chat to create a workflow and describes its phases.
2. Agent calls the read-only authoring guide and/or list operation as needed.
3. Agent calls validate and then create when the candidate is valid.
4. Tool persists the user template and returns affected id/source, validation state, and next action.
5. Settings Workflows can show the created template after reload/refetch.

**Acceptance Signals**:
- The created template is `source: user`, has a stable non-conflicting id, includes a non-empty ordered phase array, and passes registry/API validation.
- Invalid candidates do not write and return actionable issue paths/codes/messages.

### Scenario 2 - Optimize An Existing User Workflow

The user critiques an existing user workflow and asks the agent to improve the third phase or another part of the template. The agent inspects the current template, explains the current structure if useful, validates an updated template, checks that the basis is still fresh, and updates the user template in place.

**Usage Path**:
1. User names or unambiguously references a user template.
2. Agent inspects the template and records the original basis used for editing.
3. Agent creates a candidate update and validates it.
4. Before writing, the tool re-reads the current template and compares it to the original basis.
5. If fresh, the tool updates the template; if stale, it rejects the write and tells the agent to re-analyze.

**Acceptance Signals**:
- Updates preserve unknown fields where current registry behavior preserves them.
- Stale conflicts leave persisted config unchanged and include a clear conflict result.

### Scenario 3 - Modify A Builtin Workflow Safely

The user asks to change builtin `agent-development`. Because builtin templates are read-only, the agent copies the builtin to a non-conflicting user template and applies the requested changes to the copy.

**Usage Path**:
1. User references builtin `agent-development` or another builtin template as the template to modify.
2. Tool rejects direct builtin mutation but supports copy-then-edit.
3. Tool creates a user-owned copy using default naming: `<builtin-id>-custom`, then `-2`, `-3`, and display name `<Builtin Name> Custom` unless user intent supplies a clearer name.
4. Agent applies the validated update to that user-owned copy.

**Acceptance Signals**:
- Original builtin remains unchanged, non-editable, and undeletable.
- The copy is visible as a user template and is the only target of subsequent edits.

### Scenario 4 - Delete A User Template

The user asks the agent to delete a workflow template. The tool deletes only a uniquely identified `source: user` template and marks the operation destructive.

**Usage Path**:
1. User names a user template or refers to one unambiguously from a recent list/inspect result.
2. Tool verifies target source and id.
3. Tool applies destructive permission behavior and performs stale/current target checks.
4. Tool deletes the user template and returns refreshed list metadata.

**Acceptance Signals**:
- Builtin deletes and ambiguous deletes are rejected without writing.
- Rejected deletes return a reason and next action.

### Edge Cases And Failure Paths

- Missing workflow config: listing still returns builtin templates; valid create may create the workflow config.
- Malformed or invalid existing config: writes are blocked; diagnostics are returned; invalid config is not overwritten.
- ID conflict: create/duplicate rejects conflict or proposes a non-conflicting id; no silent overwrite.
- Validation failure: no write; result includes issue paths, codes, messages, and repair guidance tied to field-guide concepts.
- Permission or phase-policy denial: no write; result explains the denial.
- Active workflow session: template updates do not mutate the active session snapshot.

## Capability Decomposition

### Capability Map

- **Authoring guide / describe schema**: Read-only field guide for template/phase fields, required relationships, allowed values, unsupported shapes, examples, and quality heuristics.
  Supports: all create/update/repair scenarios.
  Depends on: current registry/API validation contract.
  Delivery note: enabling and validation-oriented.

- **List templates**: Return builtin and user templates plus invalid-template diagnostics without writing.
  Supports: create conflict checks, inspect, update, delete, and user-facing explanation.
  Depends on: existing registry list semantics.
  Delivery note: core.

- **Inspect template**: Return one template's full structure, source, editability, copyability, phase contracts, and validation state.
  Supports: optimization, builtin copy-then-edit, stale-write basis capture.
  Depends on: existing detail API/registry behavior.
  Delivery note: core.

- **Validate candidate**: Validate candidate template payloads using registry/API-equivalent semantics and return diagnostics without writing.
  Supports: create/update/copy/delete safety.
  Depends on: shared validation semantics.
  Delivery note: validation-oriented.

- **Create user template**: Persist a new user template after validation and current id conflict checks.
  Supports: conversational new-workflow authoring.
  Depends on: validation and registry write semantics.
  Delivery note: core.

- **Update user template**: Persist a modified existing user template after source/id checks, validation, and stale-write comparison.
  Supports: workflow optimization and repair.
  Depends on: inspect basis and validation.
  Delivery note: core.

- **Duplicate / copy builtin**: Create a non-conflicting user-owned copy of a builtin or user template, especially for builtin edit requests.
  Supports: safe builtin customization.
  Depends on: list conflict checks and validation.
  Delivery note: core.

- **Delete user template**: Delete only a uniquely identified user template with destructive metadata and no-write rejection for builtin or ambiguous targets.
  Supports: direct cleanup when a generated or existing workflow is unwanted.
  Depends on: list/inspect target resolution and permission policy.
  Delivery note: core and safety-sensitive.

### Capability Relationships

- Authoring guide, list, inspect, and validate are read-only and should be callable without mutating workflow config.
- Create/update/duplicate/delete are write operations and must expose accurate read-only/write/destructive metadata to permission and transcript systems.
- Update/delete require a current-state check immediately before mutation; create requires a current id conflict check.
- Builtin edit requests are not a separate mutation mode; they are copy-then-edit of a user-owned template.

## Workflow Template Field Guide

The tool must expose a discoverable read-only guide operation, or equivalent schema/help surface, before authoring or repairing templates. The guide must describe:

| Field group | Fields | Required guidance |
| --- | --- | --- |
| Template identity | `schemaVersion`, `id`, `source`, `version`, `name`, `description` | Use schema version `1`; use stable slug ids without path separators; user templates must not shadow builtin ids; names/descriptions should help users choose the workflow. |
| Phase identity | `phases[]`, `id`, `name`, optional `role` | Phases are a non-empty ordered linear array; phase ids must be unique within the template; names should be short and readable. |
| Phase intent | `instructions`, optional `objective` | Instructions explain what the agent should do and avoid in the phase; objective is a compact goal when useful. |
| Handoff contract | `requiredIntake`, `handoffRules` | Every phase needs first-class intake and handoff rules; intake describes prerequisite context; handoff rules describe what moves to the user or next phase. |
| Execution contract | `executionRules`, optional `phasePrompt` | Execution rules constrain behavior, evidence, permissions, and stopping points; `phasePrompt` can provide richer runtime guidance. |
| Output contract | `outputArtifact`, `requiredArtifacts` | Every phase needs a first-class required output artifact with `id`, `name`, `kind`, `description`, and `required: true`; required artifacts should match downstream needs. |
| Completion contract | `completionCriteria` | Must include a supported type (`manual-checklist`, `artifact-required`, or `agent-reported`) and concrete completion description. |
| Transition contract | `transition.authority` | Supported authorities are `user-confirmation` and `auto`; default to `user-confirmation` when phase advancement should be reviewed. |
| Tool/action safety | optional `actionPolicy.allowedActions`, `actionPolicy.forbiddenActions` | Policies express allowed/forbidden action categories and must not bypass global tool safety rules. |
| Model/skills | optional `requestedModel`, `skills` | Requested model is optional; skills should include a name and reason when useful. |
| Unsupported shapes | parallel, nested, branching, loop fields | First scope remains linear-only; guide must warn that unsupported shapes are rejected. |

## Requirements

### Functional Requirements

- **FR-001**: The agent must have a globally available internal workflow authoring capability in ordinary chat.
- **FR-002**: The tool must provide a read-only authoring guide/schema help operation aligned with the workflow template validation contract.
- **FR-003**: The tool must list builtin and user workflow templates and include invalid-template diagnostics without writing.
- **FR-004**: The tool must inspect a selected template and return source, editability, copyability, phase structure, field contracts, and validation state.
- **FR-005**: The tool must validate candidate user workflow templates without writing and return stable diagnostic paths, codes, messages, and repair guidance.
- **FR-006**: The tool must create valid user templates after validation and current id conflict checks.
- **FR-007**: The tool must update existing user templates after validation, route/template id match, source check, and stale-write comparison.
- **FR-008**: The tool must duplicate/copy templates into non-conflicting user templates, with builtin edit requests using copy-then-edit.
- **FR-009**: The tool must delete only uniquely identified user templates and must reject builtin, missing, invalid, stale, or ambiguous delete targets without writing.
- **FR-010**: The tool must preserve unknown fields in workflow config and templates wherever the existing registry service preserves them.
- **FR-011**: The tool must persist successful user-template mutations into the same workflow template store used by Settings Workflows and the server API.
- **FR-012**: The tool must return auditable transcript results with operation, affected id/source, before/after summary, validation issues, persistence status, and suggested next action.
- **FR-013**: The tool must preserve active/historical workflow session template snapshot behavior; edits affect future sessions only.
- **FR-014**: Global availability must not bypass active workflow phase action policy or permission/destructive metadata.
- **FR-015**: The field guide and validation diagnostics must use the same field concepts so the agent can repair invalid templates without guessing.

### Non-Functional Requirements

- **NFR-001**: Failure paths must be no-write: invalid, stale, denied, ambiguous, or builtin-protected operations leave persisted workflow config unchanged.
- **NFR-002**: Successful mutations must invalidate or refresh registry state so subsequent list/inspect calls see the updated truth.
- **NFR-003**: Tool output must be deterministic enough for unit testing of operation result shapes, field guide content, validation diagnostics, and safety cases.
- **NFR-004**: Implementation must reuse or share existing validation/write semantics rather than creating a drifting independent validator.
- **NFR-005**: Verification must cover the tool surface, registry/API parity, stale-write rejection, builtin copy behavior, destructive delete behavior, phase-policy gating, and desktop compatibility if desktop code changes.

### Boundary Constraints

- The only persistent user-state mutation in scope is the cc-jiangxia workflow template config path or existing equivalent service path.
- `source: builtin` templates are read-only mutation targets.
- First-scope templates remain linear-only.
- Project cognition is advisory navigation only; implementation facts must be proven with live repository reads and tests.

## Safety, Permission, And Stale-Write Rules

- Read-only operations: authoring guide, list, inspect, validate, and explain.
- Write operations: create, update, duplicate/copy.
- Destructive operation: delete.
- Mutating operations must use tool permission metadata that matches their behavior.
- Delete must never proceed from a vague natural-language reference unless a unique `source: user` target is established from the current list/inspect context.
- Update/delete must compare the current template to the original basis used by the agent. If different, reject and instruct re-read/re-analysis.
- Builtin edit requests must route to copy-then-edit, not direct mutation.
- Active workflow phase policy may deny or gate workflow authoring writes when the current phase forbids that class of action.

## Acceptance Proof

### Acceptance Signals

- A user can ask for a new multi-phase workflow in ordinary chat and the agent creates a valid persisted user template visible to Settings Workflows after reload/refetch.
- A user can ask the agent to improve an existing user workflow and the tool updates it only when the basis is fresh.
- A request to modify `agent-development` creates and edits a non-conflicting user copy; the builtin remains unchanged.
- A delete request removes only a uniquely identified user template and is treated as destructive.
- Invalid, stale, ambiguous, denied, or builtin-protected requests return actionable diagnostics and do not write.
- The agent can request field guidance that explains all required fields and unsupported shapes before authoring.

### Measurable Success Criteria

- **SC-001**: Tool tests prove successful create/update/duplicate/delete operations and no-write failure cases.
- **SC-002**: Registry/API parity tests prove the tool rejects the same invalid template classes as existing manual API behavior.
- **SC-003**: Stale-write tests prove update/delete reject when current template state differs from the original basis.
- **SC-004**: Field-guide tests prove required field groups, allowed values, unsupported shapes, and quality guidance are present.
- **SC-005**: Desktop compatibility evidence proves agent-authored templates use the same store that Settings Workflows lists after refetch, or records why no desktop code changed.

## Decision Capture

### Approach Comparison

- **Option A - Direct validated internal authoring tool**: Recommended and selected. Best preserves the user's request for direct conversational authoring without a mandatory preview, while relying on validation, permissions, and no-write failure behavior for safety.
- **Option B - Preview plus commit tool**: Rejected for first scope because it conflicts with the confirmed direct-write expectation.
- **Option C - Generate JSON for manual UI save**: Rejected because it does not provide an internal agent tool that can create/update/delete workflows itself.

### Locked Decisions

- Direct validated writes for normal valid user-template create/update.
- Global ordinary-chat availability with phase-policy and permission gating.
- Builtin templates are read-only; builtin edit requests copy to user templates before modification.
- Delete is first-scope but only for uniquely identified user templates and must be destructive.
- Update/delete use stale-write protection; create uses current id conflict checks.
- Settings Workflows compatibility means the same persisted registry/store is used; it does not require a new live push subscription.
- Tool results must be auditable in transcript.

### User-Confirmed Deferrals

- Desktop-backed runtime path decision -> defer to `/sp.plan`; reopen if one runtime path cannot preserve registry/API semantics.
- Field-guide alignment implementation source -> defer to `/sp.plan`; reopen if the selected design can drift from validation.

### Canonical References

- `.specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.md`
- `.specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.json`
- `src/tools.ts`
- `src/Tool.ts`
- `src/server/services/workflowTemplateRegistryService.ts`
- `src/server/api/workflowTemplates.ts`
- `src/server/services/workflowRuntimeService.ts`
- `src/server/services/workflowToolPolicy.ts`
- `desktop/src/api/sessions.ts`
- `desktop/src/components/workflow/WorkflowTemplateManager.tsx`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- `src/server/__tests__/workflowTemplates.test.ts`

## Upstream Signal Disposition

| ID | Disposition | Spec preservation |
| --- | --- | --- |
| MP-001 | in_scope | Primary feature goal. |
| MP-002 | in_scope | Scenario 1 and FR-006/FR-011. |
| MP-003 | in_scope | Scenario 2 and FR-007. |
| MP-004 | in_scope | Capability map. |
| MP-005 | preserved | Locked direct-write decision. |
| MP-006 | preserved | Global availability plus phase-policy gating. |
| MP-007 | preserved | Builtin copy-then-edit behavior. |
| MP-008 | preserved | Stale-write rules. |
| MP-009 | preserved | Delete safety rules. |
| MP-010 | preserved | Builtin copy naming. |
| MP-011 | in_scope | Workflow Template Field Guide. |
| MP-012 | preserved | Out-of-scope protected state boundary. |
| MP-013 | preserved | Linear-only boundary. |
| MP-014 | preserved | Future-session-only template effects. |
| MP-015 | preserved | Registry/API validation reuse requirement. |
| MP-016 | preserved | Live evidence authority and references. |
| MP-017 | preserved | Option A selected. |
| MP-018 | in_scope | No-write failure and diagnostics requirements. |
| MP-019 | in_scope | Settings compatibility requirement. |
| MP-020 | in_scope | Transcript-auditable result requirement. |
| MP-021 | deferred | Plan-phase runtime path decision. |
| MP-022 | deferred | Plan-phase field-guide alignment source decision. |

No upstream signal is dropped, and there are no open conflicts.

## Consequence Analysis

### Lifecycle And State Behavior

- `CA-001`: Valid create/update writes directly; validation failure or rejection leaves config unchanged.
- `CA-002`: Writes are limited to workflow template config and must preserve user-owned fields.
- `CA-003`: Tool behavior must share registry/API validation semantics and block invalid writes.
- `CA-004`: Builtin templates remain read-only; modifying builtin requires non-conflicting user copy.
- `CA-005`: Template edits do not mutate active or historical workflow session snapshots.
- `CA-006`: Tool results make persistence state auditable in transcript.
- `CA-007`: Concurrent manual/agent edits require stale-write rejection for update/delete and id conflict checks for create.
- `CA-008`: Global tool availability must align with active workflow phase action policy.
- `CA-009`: Delete only uniquely identified user templates and mark delete destructive.
- `CA-010`: Builtin copy naming uses `<builtin-id>-custom` with numeric suffixes and `<Builtin Name> Custom` unless user intent provides a clearer non-conflicting name.
- `CA-011`: The agent must have discoverable, validation-aligned field guidance.

### Recovery And Validation

- Every failed validation, stale conflict, permission denial, ambiguous delete, builtin delete, or unsupported shape must be a no-write result with actionable diagnostics.
- Successful writes must refresh/invalidate registry state.
- Downstream verification must include same-area tests for server/tool behavior and desktop/client tests if implementation changes desktop behavior.

## Risks And Gaps

### Planning Risks

- The tool may need two runtime write paths: direct registry-service writes for CLI/server contexts and desktop-server-backed calls for desktop-launched sessions.
- A hand-written field guide could drift from validation unless plan chooses a shared/generated/tested source.
- Global tool registration can accidentally expose mutating operations inside non-implementation workflow phases unless phase-policy gating is explicit.

### Information Gaps

- Desktop-launched authoring path is a plan-phase design choice, not a specification blocker.
- Field-guide source-of-truth design is a plan-phase design choice, not a specification blocker.
