# Handoff to sp-specify: Agent Workflow Authoring Tools

- discussion_slug: agent-workflow-authoring-tools
- handoff_goal: Specify a globally available internal agent tool capability that lets the agent inspect, explain, validate, create, update, duplicate/copy, and delete workflow templates through conversation while preserving existing Workflows validation, persistence, field guidance, permission, and session-snapshot safety rules.
- handoff_status: handoff-ready
- created_at: 2026-05-27T12:53:44.0184349+08:00
- user_confirmation_status: confirmed
- coverage_status: live-evidence-backed; project cognition stale/blocked and used only as advisory
- planning_gate_status: ready-for-specify-user-confirmed
- hard_unknown_count: 0
- open_conflict_count: 0

## Context Boundary

- current_project_root: `F:\github\cc-jiangxia`
- target_project_root: `F:\github\cc-jiangxia`
- path_status: target-read-confirmed
- boundary_confidence: high
- boundary_unknowns: none
- reference_projects:
  - `.specify/discussions/workflow-template-management/`
- external_systems: none

### Current Project Roles

| Role | Scope | Evidence source | Notes |
| --- | --- | --- | --- |
| implementation-target | Built-in agent tools, workflow template registry/API, workflow template persistence, workflow runtime/session behavior, workflow tool policy, and desktop workflow management surfaces. | User request plus live repository reads. | The user is extending the current repository's Workflows feature. |

### Target Project Roles

| Role | Scope | Evidence source | Notes |
| --- | --- | --- | --- |
| implementation-target | Add an internal tool capability so agents can author and mutate workflow templates from ordinary chat. | User request plus live repository reads. | No cross-project transfer or external target was requested. |

## Implementation Target

- actual_project_to_change: current repository
- local_target_root: `F:\github\cc-jiangxia`
- target_paths_or_modules:
  - `src/tools`
  - `src/tools.ts`
  - `src/Tool.ts`
  - `src/server/services/workflowTemplateRegistryService.ts`
  - `src/server/api/workflowTemplates.ts`
  - `src/server/services/workflowTypes.ts`
  - `src/server/services/workflowRuntimeService.ts`
  - `src/server/services/workflowToolPolicy.ts`
  - `desktop/src/api/sessions.ts`
  - `desktop/src/types/session.ts`
  - `desktop/src/components/workflow/WorkflowTemplateManager.tsx`
  - `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
  - `src/server/__tests__/workflowTemplates.test.ts`
- target_paths_still_to_verify:
  - Exact new tool file/module placement under `src/tools`.
  - Whether desktop-launched sessions need a desktop-server-backed authoring path or can use direct registry-service writes.
  - Whether field guide content should be generated from shared schema metadata, validator annotations, or a static tested guide colocated with validation.
- target_project_cognition_status: stale/blocked; advisory only
- cognition_authority_rule: Current project cognition cannot prove implementation facts. Downstream work must use live repository reads for final code claims.

## Source Evidence

| Source type | Evidence status | Source | Claim |
| --- | --- | --- | --- |
| user-confirmation | confirmed | discussion conversation and `requirements.md` | The desired capability is direct conversational workflow authoring through agent tools. |
| user-confirmation | confirmed | `open-questions.md` Q-001 | Valid user-template create/update should write directly without mandatory preview. |
| user-confirmation | confirmed | `open-questions.md` Q-002 | The tool should be globally available in ordinary chat, with active workflow phase-policy gating. |
| user-confirmation | confirmed | `open-questions.md` Q-003/Q-005 | Existing user templates update in place; builtin templates copy to a user-owned template before editing. |
| user-confirmation | confirmed | `open-questions.md` Q-004 | Delete is first-scope but only for uniquely identified user templates and must be destructive. |
| user-confirmation | confirmed | `open-questions.md` Q-006 | The agent needs explicit field guidance/schema help before authoring workflows. |
| live-code | current | `src/tools.ts` | Built-in tools are assembled centrally and workflow-scoped tools are added separately. |
| live-code | current | `src/Tool.ts` | Tool contract supports schema, validation, permission, read-only/destructive metadata, and transcript rendering hooks. |
| live-code | current | `src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.tsx` | Current workflow-specific tool submits phase completion only; it does not mutate workflow templates. |
| live-code | current | `src/server/services/workflowTemplateRegistryService.ts` | Registry validates templates, preserves unknown fields, writes user workflow config, rejects builtin ID shadowing, and defines the current required field contract. |
| live-code | current | `src/server/api/workflowTemplates.ts` | Manual API already supports list/detail/validate/create/update/delete/duplicate/import/export and protects builtin templates from direct mutation. |
| live-code | current | `src/server/services/workflowTypes.ts` | Workflow template/session types include template snapshots, phase definitions, and lifecycle/source-template statuses. |
| live-code | current | `src/server/services/workflowRuntimeService.ts` | Workflow sessions use template snapshots, supporting the non-goal of in-place session mutation. |
| live-code | current | `src/server/services/workflowToolPolicy.ts` | Existing phase tool policy denies implementation tools in non-implementation phases; new global tool exposure must respect this policy. |
| live-code | current | `desktop/src/api/sessions.ts` | Desktop API client already wraps workflow template API operations. |
| live-code | current | `desktop/src/components/workflow/WorkflowTemplateManager.tsx` and `WorkflowTemplateEditor.tsx` | Manual Settings UI supports workflow template management and maps editor fields into the template draft contract. |
| live-test | current | `src/server/__tests__/workflowTemplates.test.ts` | Existing tests cover API validation, builtin readonly behavior, create/update/delete/duplicate/import/export, conflict handling, and no-write validation. |

## Blocking Unknowns

Hard unknowns: none.

Soft downstream design choices:

| Unknown | Owner | Latest resolve phase | Stop-and-reopen condition |
| --- | --- | --- | --- |
| Whether desktop-launched sessions require a desktop-server-backed tool path in addition to direct registry-service writes. | downstream-contract | plan | Reopen if one runtime path cannot safely access the registry service or preserve desktop API behavior. |
| Whether the field guide is generated from shared schema metadata, validator annotations, or a static tested guide colocated with validation. | downstream-contract | plan | Reopen if the proposed guide can drift from validation or cannot be tested deterministically. |

## Downstream Instructions

### Settled Decisions

- Implement a globally available internal agent workflow authoring tool, using Option A from `technical-options.md`.
- Include read-only operations for listing/inspecting templates and retrieving a field authoring guide/schema help.
- Include validating and mutating operations for user templates: create, update, duplicate/copy, and delete.
- Mutating valid user-template create/update operations persist directly. There is no mandatory preview step.
- Delete is first-scope, destructive, and only valid for uniquely identified user templates.
- Builtin templates such as `agent-development` remain read-only. Edit requests copy the builtin to a user template and then modify that copy.
- Builtin copy defaults: id `<builtin-id>-custom`, then `-2`, `-3`, etc. on conflicts; display name `<Builtin Name> Custom` unless user intent gives a clearer name.
- Update/delete must re-read the current template and reject stale writes when the current version differs from the agent's original basis.
- Active/running/historical workflow sessions keep their template snapshots; template edits affect future sessions only.
- Global availability must respect active workflow phase action policy and permission/destructive metadata.
- Validation diagnostics and tool results must be actionable and auditable in the transcript.

### Capability Map

| Capability | Required behavior |
| --- | --- |
| `authoring_guide` / `describe_schema` | Read-only field guide covering template/phase fields, required relationships, allowed values, examples, unsupported shapes, and quality heuristics. |
| `list` | Return builtin and user templates plus invalid-template diagnostics without writing. |
| `inspect` | Return one template's field contract, phase structure, source, editability, and validation state. |
| `validate` | Validate candidate payloads using the same registry/API semantics and return issue paths/codes/messages without writing. |
| `create` | Create a new user template after validation and current ID conflict check. |
| `update` | Update an existing user template after validation, source/id checks, and stale-write comparison. |
| `duplicate` / copy builtin | Create a non-conflicting user copy, especially for builtin edit requests. |
| `delete` | Delete only uniquely identified user templates; mark destructive; reject builtin or ambiguous targets. |

### Recommended Sequence

1. Specify tool contract, operation schema, permission/read-only/destructive metadata, and transcript result shape.
2. Specify shared validation/write semantics with `WorkflowTemplateRegistryService` and `/api/workflows/templates`.
3. Specify read-only field guide/schema help and how it stays aligned with validation.
4. Specify create/update/duplicate/delete behavior, including builtin copy-then-edit, stale-write rejection, ID conflicts, and delete ambiguity.
5. Specify global registration and active workflow phase-policy gating.
6. Specify tests: tool unit tests, registry/API parity tests, field-guide output tests, stale-write/delete safety tests, builtin copy tests, phase-policy gating tests, and desktop API/client tests only if desktop behavior changes.

### Dependencies

- Existing registry validation and write semantics.
- Existing workflow template API behavior and tests.
- Tool registration and permission metadata.
- Workflow runtime snapshot semantics.
- Workflow phase action policy.
- Settings Workflows compatibility.

### Deferred Scope

- Supporting parallel, nested, branching, or looping workflows.
- Direct builtin template mutation or deletion.
- In-place migration of active workflow sessions after a template edit.
- Source-code edits as part of a workflow-template authoring operation.
- New Settings UI redesign beyond compatibility/refetch behavior.

### Reopen Conditions

Return to `sp-discussion` if downstream work proposes any of these:

- Mandatory preview-only persistence for normal valid user-template create/update.
- Direct builtin mutation or builtin ID shadowing.
- Deleting builtin templates or deleting ambiguous targets.
- Mutating active/historical workflow session snapshots as a side effect of template edits.
- Writing outside the workflow template config or touching protected user state.
- A global authoring tool that bypasses phase action policy.
- A field guide that is not discoverable by the agent or can drift from validation.
- Unsupported workflow shapes without an explicit new product decision.

## UI Discussion

- ui_discussion_status: not_applicable
- confirmed_ui_decisions:
  - Existing Settings Workflows should show agent-created or agent-updated templates after reload/refetch.
  - No new first-class UI design is required for this handoff.
- deferred_ui_decisions:
  - If downstream implementation changes Settings UI feedback, handle it as compatibility behavior in specification/plan.
- interaction_expectations:
  - Tool results should be readable in chat and include operation outcome, affected template IDs/source, validation issues, before/after summary, and suggested next action.
- state_requirements:
  - No preview UI is required before valid user-template writes.
  - Invalid/rejected/stale/permission-denied operations must leave persisted config unchanged.
- accessibility_expectations: not_applicable for the internal tool; preserve existing Settings UI expectations if touched.
- ui_sketches_present: false
- ui_sketch_summary: none
- ui_sketch_reference: none

## Must-Preserve Ledger

| ID | Type | Claim | Source | Downstream requirement | Blocking level | Owner | Latest resolve phase | Status | Stop-and-reopen condition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MP-001 | goal | Provide an internal agent tool capability for conversational workflow template authoring and optimization. | User request; `requirements.md` | Preserve as the primary feature goal. | hard | user | specify | resolved | Reopen if the feature becomes manual UI-only or draft-only. |
| MP-002 | scenario | User can describe a new workflow and phases; the agent fills required fields, validates, persists, and Settings Workflows can show it after refetch. | User request; Q-001 | Specify end-to-end create behavior. | hard | user | specify | resolved | Reopen if create cannot persist valid user templates. |
| MP-003 | scenario | User can critique an existing workflow and the agent can analyze and apply a validated update or safe copy. | User request; Q-003/Q-005 | Specify update and builtin copy-then-edit behavior. | hard | user | specify | resolved | Reopen if builtin edits are direct mutations or user-template updates are not supported. |
| MP-004 | scope | First scope includes list, inspect, field guide, validate, create, update, duplicate/copy, and delete. | `requirements.md`; `technical-options.md` | Preserve the operation surface. | hard | downstream-contract | specify | mapped | Reopen if delete or field guide is dropped without explicit user decision. |
| MP-005 | decision | Valid user-template create/update writes directly without a mandatory preview step. | Q-001 | Specify direct validated writes and no-write failures. | hard | user | specify | resolved | Reopen if mandatory preview-only flow is reintroduced. |
| MP-006 | decision | Tool is globally available in ordinary chat but must respect active workflow phase action policy. | Q-002; `workflowToolPolicy.ts` | Specify registration plus phase-policy gating. | hard | user | plan | resolved | Reopen if global availability bypasses workflow phase restrictions. |
| MP-007 | decision | Builtin templates are read-only mutation targets; builtin edit requests create and modify a user-owned copy. | Q-005 | Specify copy-then-edit and readonly builtin enforcement. | hard | user | specify | resolved | Reopen if direct builtin mutation or builtin ID shadowing is proposed. |
| MP-008 | decision | Update/delete must re-read current template and reject stale writes when it differs from the agent's basis. | User confirmation; CA-007 | Specify stale-write conflict contract. | hard | user | plan | resolved | Reopen if update/delete writes from stale list state. |
| MP-009 | decision | Delete is destructive, first-scope, and only valid for uniquely identified user templates. | Q-004; CA-009 | Specify delete permission/ambiguity behavior. | hard | user | specify | resolved | Reopen if builtin or ambiguous deletes are allowed. |
| MP-010 | decision | Builtin copy IDs default to `<builtin-id>-custom` with numeric suffixes; names default to `<Builtin Name> Custom` unless user intent supplies clearer naming. | User confirmation; CA-010 | Specify copy naming algorithm. | hard | user | plan | resolved | Reopen if copied builtin templates receive confusing IDs/names or collide. |
| MP-011 | decision | Agent must have a discoverable schema-aligned field guide before authoring or repairing templates. | Q-006; CA-011 | Specify read-only guide operation and validation alignment. | hard | user | plan | resolved | Reopen if downstream relies on undocumented model knowledge or stale field docs. |
| MP-012 | non_goal | Do not mutate protected non-workflow user state such as shared settings, transcripts, providers, MCP config, OAuth tokens, skills, plugin state, adapters, or team/session records. | `requirements.md`; project rules | Preserve storage boundary. | hard | downstream-contract | specify | mapped | Reopen if implementation writes outside cc-jiangxia workflow template config. |
| MP-013 | non_goal | Do not support parallel, nested, branching, or loop workflows in first scope. | `requirements.md`; `workflowTemplateRegistryService.ts` | Preserve linear-only validation. | hard | downstream-contract | specify | mapped | Reopen if unsupported workflow shapes are added without explicit scope expansion. |
| MP-014 | non_goal | Do not mutate active or historical workflow session snapshots when templates change. | `requirements.md`; `workflowRuntimeService.ts` | Specify future-session-only effect. | hard | downstream-contract | plan | mapped | Reopen if template edit migrates active session state. |
| MP-015 | reference | Reuse or share existing registry/API validation and persistence semantics. | `workflowTemplateRegistryService.ts`; `workflowTemplates.ts` | Specify validation parity and unknown-field preservation. | hard | evidence | plan | mapped | Reopen if a separate validator drifts from API behavior. |
| MP-016 | reference | Live source evidence, not stale/blocked project cognition, proves current project facts. | `project-context.md` | Preserve evidence provenance. | soft | evidence | specify | mapped | Reopen if downstream relies on cognition as authority without live reads. |
| MP-017 | tradeoff | Option A is selected over preview/commit or manual-only approaches. | `technical-options.md` | Preserve direct tool implementation path. | hard | user | specify | resolved | Reopen if Option B/C replaces Option A without user confirmation. |
| MP-018 | scenario | Invalid, risky, stale, ambiguous, or permission-denied operations must not write and must return actionable diagnostics. | `requirements.md`; CA-001/003/007/009 | Specify recovery and no-write guarantees. | hard | downstream-contract | specify | mapped | Reopen if failures can partially write or return generic errors only. |
| MP-019 | scope | Settings Workflows remains compatible and can display agent-authored templates after reload/refetch. | User request; desktop evidence | Specify compatibility with manual management surface. | hard | user | specify | resolved | Reopen if agent writes use a separate store invisible to Settings. |
| MP-020 | decision | Tool results must make persistence state auditable in the transcript. | CA-006 | Specify result shape with operation, affected IDs, validation issues, before/after summary, and next action. | hard | downstream-contract | specify | mapped | Reopen if tool returns opaque success/failure. |
| MP-021 | blocking_question | Decide whether desktop-launched sessions need a desktop-server-backed path in addition to direct registry writes. | `technical-options.md` | Resolve during plan; not a specification blocker. | soft | downstream-contract | plan | deferred | Reopen if runtime access path cannot preserve registry/API semantics. |
| MP-022 | blocking_question | Decide how the field guide stays aligned with validation: shared schema metadata, validator annotations, or a static tested guide. | `technical-options.md` | Resolve during plan; not a specification blocker. | soft | downstream-contract | plan | deferred | Reopen if the selected guide design can drift from validation. |

## Senior Consequence Analysis

- triggered: true
- trigger_reason: Agent-authored workflow changes can mutate user workflow templates, alter future workflow execution semantics, affect active or resumed workflow sessions, interact with manual Settings edits, and change which tools/actions are allowed inside phases.
- stand_down_reason: none

### Affected Object Map

- User workflow config: `~/.claude/cc-jiangxia/workflows.json` or active `CLAUDE_CONFIG_DIR` equivalent.
- Builtin workflow template: `agent-development`.
- User workflow templates and their phase contracts.
- Workflow template registry cache and write path.
- Server workflow template API.
- Desktop Settings Workflows UI and API client.
- Built-in agent tool pool, permissions, destructive metadata, and transcript rendering.
- Workflow session template snapshots and source-template status recovery.
- Workflow phase tool policy.
- Workflow template field guide/schema help.
- Tests and quality gates.

### State-Behavior Matrix

| State | Required behavior |
| --- | --- |
| Missing workflow config | Listing remains valid with builtin templates; validated user-template mutation may create workflow config. |
| Malformed/invalid existing config | Agent writes are blocked; diagnostics returned; invalid config not overwritten. |
| Field-guide request | Read-only response; no workflow config mutation. |
| Draft candidate | May exist transiently; valid create/update writes when tool is called. |
| Validation failed | No write; return issue codes, paths, messages, and repair guidance. |
| Create valid user template | Persist after validation and current ID conflict check. |
| Update existing user template | Source/id must match; re-read basis; preserve unknown fields where registry does. |
| Delete user template | Only uniquely identified `source: user`; destructive; no builtin or ambiguous delete. |
| Builtin edit request | Copy builtin to non-conflicting user template then edit copy. |
| ID conflict | Reject or propose non-conflicting rename; never silently overwrite. |
| Active/running session | Keep template snapshot stable; edits affect future sessions only. |
| Resumed stale/missing template session | Preserve existing recovery semantics. |
| Concurrent manual/agent edit | Update/delete reject stale writes; create checks current ID conflicts. |

### Dependency Impact Table

| Dependency | Required handling |
| --- | --- |
| `WorkflowTemplateRegistryService` | Reuse/share validation and write semantics; preserve unknown fields. |
| `/api/workflows/templates` | Keep manual API and internal tool behavior aligned. |
| `src/tools.ts` / `src/Tool.ts` | Register the tool globally with deliberate read-only/write/destructive permission behavior. |
| Workflow sessions | Preserve snapshot behavior and future-session-only template effect. |
| Desktop Settings UI | Ensure agent-authored templates remain visible after list refetch. |
| Workflow tool policy | Gate authoring writes when active phase policy forbids them. |
| Field guide | Co-locate/generate/test guide so it does not drift from validation. |
| Tests/quality gates | Add same-area server/tool coverage and desktop/API tests if changed. |

### Recovery and Validation Contract

- Invalid candidate, permission denial, stale conflict, ambiguous delete, builtin delete, or validation failure must leave persisted config unchanged.
- Successful writes must invalidate registry cache.
- Failed writes should report operation, template id/source, issue paths/codes/messages, and whether persistence happened.
- Update/delete stale conflicts should instruct the agent to re-read/re-analyze before retry.
- Field guide must be deterministic and testable.
- Verification should include tool unit tests, registry/API parity tests, field-guide tests, destructive delete tests, stale-write tests, builtin copy tests, phase-policy gating tests, and desktop tests if the desktop path changes.

### Coverage Gaps

| Gap | Status | Owner | Latest resolve phase | Stop-and-reopen condition |
| --- | --- | --- | --- | --- |
| Stale-write behavior | resolved | user | discussion | Reopen if update/delete writes without comparing current template to original basis. |
| Builtin copy naming | resolved | user | discussion | Reopen if copied builtin IDs/names collide or are confusing. |
| Desktop-server-backed path | soft downstream design | downstream-contract | plan | Reopen if the chosen runtime path cannot preserve registry/API semantics. |
| Field-guide implementation source | soft downstream design | downstream-contract | plan | Reopen if field guide can drift from validation. |

### Consequence Obligations

| ID | Claim | Blocking level | Owner workflow | Latest resolve phase | Status | Stop-and-reopen condition |
| --- | --- | --- | --- | --- | --- | --- |
| CA-001 | Agent-authored valid user-template create/update mutations should persist directly without a mandatory preview step, while validation failure or tool rejection leaves config unchanged. | hard | sp-discussion | discussion | resolved | Downstream design reintroduces mandatory preview-only persistence. |
| CA-002 | Agent writes must preserve user-owned workflow config fields and must not mutate protected non-workflow config surfaces. | hard | downstream specification | specify | mapped | Proposed implementation writes outside the cc-jiangxia workflow template config. |
| CA-003 | The tool must share validation semantics with the existing template registry/API and block invalid writes. | hard | downstream specification/plan | plan | mapped | A separate validator diverges from existing API behavior. |
| CA-004 | Builtin templates remain read-only mutation targets; modifying a builtin requires creating a non-conflicting user-owned copy and applying changes to that copy. | hard | sp-discussion | discussion | resolved | Downstream design attempts direct builtin mutation or builtin ID shadowing. |
| CA-005 | Template edits must not mutate active or historical workflow session snapshots. | hard | downstream plan | plan | mapped | Design updates active session state as a side effect of template update. |
| CA-006 | Tool results must make persistence state auditable in the transcript. | hard | downstream specification | specify | mapped | Tool returns only generic success/failure without operation and affected-template metadata. |
| CA-007 | Concurrent manual and agent edits require write-before-read conflict protection: update/delete re-read the current template and reject stale writes when it differs from the agent's original basis; create checks current ID conflicts. | hard | sp-discussion | discussion | resolved | Update/delete path writes based on stale list state without detection. |
| CA-008 | The workflow authoring tool should be globally available in ordinary chat, but must align with active workflow phase action policy. | hard | downstream specification/plan | plan | mapped | Tool is globally available with no phase/permission gating decision. |
| CA-009 | Delete is in first scope only for uniquely identified user templates and must be marked destructive; builtin or ambiguous deletes must be rejected or clarified before any write. | hard | sp-discussion | discussion | resolved | Downstream design allows builtin deletion, ambiguous target deletion, or non-destructive delete execution. |
| CA-010 | Builtin copy-then-edit default naming must use `<builtin-id>-custom` with conflict suffixes and `<Builtin Name> Custom` unless the user's requested purpose/name produces a clearer non-conflicting copy. | hard | sp-discussion | discussion | resolved | Copied builtin templates receive confusing IDs/names or collide with existing user templates. |
| CA-011 | The agent must have a discoverable workflow template field guide before authoring or repairing templates, and it must stay aligned with registry/API validation. | hard | downstream specification/plan | plan | mapped | Downstream design relies on undocumented model knowledge or stale field docs. |

## Quality Gate

- status: user-confirmed
- self_reviewed_at: 2026-05-27T12:53:44.0184349+08:00
- user_review_required: true
- user_confirmed_at: 2026-05-27T14:38:41.6559401+08:00
- blocked_reasons: []
- self_review_summary:
  - Context boundary is locked to `F:\github\cc-jiangxia`.
  - Handoff goal is concrete and unified.
  - Hard unknown count is 0.
  - Open conflict count is 0.
  - Must-Preserve Ledger includes goal, scope, non-goals, scenarios, decisions, references, selected tradeoff, and soft downstream questions.
  - Senior consequence obligations CA-001 through CA-011 are preserved.
  - Markdown and JSON companion must remain synchronized before user confirmation.
