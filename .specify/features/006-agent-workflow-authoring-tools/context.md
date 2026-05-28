# Planning Context: Agent Workflow Authoring Tools

**Feature Branch**: `006-agent-workflow-authoring-tools`  
**Created**: 2026-05-27  
**Status**: Ready for user review  
**Derived From**: `spec.md`, `alignment.md`, discussion handoff files, project memory, project cognition navigation, and targeted live repository reads.

## Planning Context

- Planning boundary: add an internal agent workflow-template authoring capability; do not implement from this workflow.
- Confirmed product scope: read-only guide/list/inspect/validate plus mutating create/update/duplicate/delete for workflow templates.
- Mutation boundary: only user workflow templates are mutable; builtin templates are copied to user-owned templates before modification.
- Failure boundary: validation failure, stale conflicts, permission denial, ambiguous delete, builtin delete, and unsupported shapes are all no-write outcomes.
- Current next command after user review: `/sp.plan`.

## Relevant Repository Context

- `src/tools.ts` centrally assembles built-in tools and separately adds workflow-scoped tools.
- `src/Tool.ts` defines tool schema, permission, read-only/destructive metadata, validation hooks, transcript rendering, and result mapping.
- `src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.tsx` is the existing workflow-specific tool precedent; it submits phase completion but does not mutate workflow templates.
- `src/server/services/workflowTemplateRegistryService.ts` owns template validation, builtin template definition, user workflow config reads/writes, unknown-field preservation, cache invalidation, and builtin ID protection.
- `src/server/api/workflowTemplates.ts` exposes manual workflow template list/detail/validate/create/update/delete/duplicate/import/export semantics.
- `src/server/services/workflowTypes.ts` defines template/session/source status and template snapshot state.
- `src/server/services/workflowRuntimeService.ts` proves active sessions use template snapshots; template edits should affect future sessions only.
- `src/server/services/workflowToolPolicy.ts` owns phase action policies and currently denies implementation tools in non-implementation phases.
- `desktop/src/api/sessions.ts`, `desktop/src/types/session.ts`, `WorkflowTemplateManager.tsx`, and `WorkflowTemplateEditor.tsx` are the manual Settings Workflows consumer surfaces.
- `src/server/__tests__/workflowTemplates.test.ts` already covers API validation, builtin readonly behavior, conflicts, create/update/delete/duplicate/import/export, and no-write validation paths.

## Existing Patterns And Reuse Notes

- Reuse or factor existing registry/API validation semantics; do not create a separate tool-only validator that can drift.
- Preserve registry unknown-field merge behavior for existing config/templates.
- Reuse existing builtin-copy conflict patterns where possible, while preserving the new confirmed default `<builtin-id>-custom`, then numeric suffixes.
- Keep Settings Workflows compatibility by using the same persisted registry/store. A separate tool-local store is not acceptable.
- Tool result shape should be conversation-readable and testable.

## Integration Boundaries

- Agent tool boundary: global tool pool registration and permission metadata.
- Workflow phase policy boundary: active workflow phase action policy may deny or gate mutating workflow authoring operations.
- Persistence boundary: cc-jiangxia workflow template config path or the existing registry/API abstraction only.
- Desktop boundary: if desktop-launched agent sessions cannot safely access direct registry writes, plan must route through the desktop/server API without changing product behavior.
- Runtime session boundary: current and historical workflow sessions retain template snapshots.

## Product Boundary Constraints

- No source-code editing is part of workflow-template authoring operations.
- No protected non-workflow user state mutation is allowed.
- No parallel/nested/branching/looping workflow support in first scope.
- No direct builtin mutation, deletion, or shadowing.
- No mandatory preview-only persistence for valid user-template create/update.

## Affected Object Map

Obligation ID: CA-001  
Object / State Surface: user workflow config and agent tool write path  
Owner: downstream implementation  
Consumers: agent transcript, Settings Workflows, workflow registry  
Evidence: handoff Q-001; `workflowTemplateRegistryService.ts`; `workflowTemplates.ts`  
Coverage Gap: no blocker; implement tests must prove no-write failures and direct valid writes

Obligation ID: CA-002  
Object / State Surface: `~/.claude/cc-jiangxia/workflows.json` or active `CLAUDE_CONFIG_DIR` equivalent  
Owner: downstream implementation  
Consumers: server API, desktop Settings, future workflow sessions  
Evidence: project rules and registry write path  
Coverage Gap: implementation must avoid non-workflow config surfaces

Obligation ID: CA-003  
Object / State Surface: registry/API validation semantics  
Owner: downstream plan  
Consumers: tool, manual API, Settings editor  
Evidence: `workflowTemplateRegistryService.ts`, `workflowTemplates.ts`, `workflowTemplates.test.ts`  
Coverage Gap: choose shared/factored validation path during plan

Obligation ID: CA-004  
Object / State Surface: builtin templates and copied user templates  
Owner: downstream implementation  
Consumers: tool, Settings list, future workflow sessions  
Evidence: builtin protection in registry/API and user confirmation  
Coverage Gap: copy-then-edit behavior needs tool tests

Obligation ID: CA-005  
Object / State Surface: active/historical workflow session snapshots  
Owner: downstream plan  
Consumers: workflow runtime, resumed sessions, reports  
Evidence: `workflowTypes.ts`, `workflowRuntimeService.ts`  
Coverage Gap: plan must avoid active session migration

Obligation ID: CA-006  
Object / State Surface: tool result and transcript  
Owner: downstream implementation  
Consumers: user, agent repair loop, audit trail  
Evidence: user confirmation and Tool contract  
Coverage Gap: result shape must be specified/tested in plan/tasks

Obligation ID: CA-007  
Object / State Surface: concurrent manual/agent edits  
Owner: downstream implementation  
Consumers: Settings editor, agent tool  
Evidence: Q-003/Q stale-write confirmation  
Coverage Gap: stale comparison representation must be designed during plan

Obligation ID: CA-008  
Object / State Surface: global tool availability and workflow phase policy  
Owner: downstream plan  
Consumers: main agent, active workflow sessions  
Evidence: `src/tools.ts`, `workflowToolPolicy.ts`  
Coverage Gap: define exact gating integration during plan

Obligation ID: CA-009  
Object / State Surface: delete operation  
Owner: downstream implementation  
Consumers: user templates, permission system  
Evidence: Q-004 and Tool destructive metadata support  
Coverage Gap: destructive/ambiguous delete tests required

Obligation ID: CA-010  
Object / State Surface: copied builtin template identity  
Owner: downstream implementation  
Consumers: Settings list, future starts, user references  
Evidence: user confirmation  
Coverage Gap: conflict suffix algorithm tests required

Obligation ID: CA-011  
Object / State Surface: field guide/schema help  
Owner: downstream plan  
Consumers: agent authoring quality, validation repair loop  
Evidence: Q-006; registry/editor required fields  
Coverage Gap: decide guide source-of-truth during plan

## Dependency Impact Table

| Obligation ID | Upstream / Downstream Surface | Impact | Required Handling |
| --- | --- | --- | --- |
| CA-001 | Registry write path -> Settings list | Valid writes must appear after refetch | Write through same registry/store and invalidate cache |
| CA-002 | Tool -> user config | Wrong path can corrupt protected state | Restrict writes to workflow template config/service |
| CA-003 | Registry/API -> tool validation | Divergence creates inconsistent behavior | Share/factor validation or test parity tightly |
| CA-004 | Builtin registry -> user copy | Direct mutation breaks builtin protection | Reject builtin mutation and copy to user template |
| CA-005 | Template updates -> runtime sessions | Active snapshots must stay stable | Do not rewrite session state during template mutation |
| CA-006 | Tool result -> transcript | Opaque result blocks audit/repair | Return structured operation and diagnostics summary |
| CA-007 | Settings editor -> agent update/delete | Concurrent writes can overwrite user changes | Re-read and compare basis before mutation |
| CA-008 | Global tool pool -> workflow phase policy | Tool could bypass phase restrictions | Integrate policy checks for mutating operations |
| CA-009 | Delete -> workflow config | Destructive ambiguity can delete wrong template | Require unique user target and destructive metadata |
| CA-010 | Builtin copy -> Settings identity | Collisions/confusing names reduce usability | Implement confirmed id/name algorithm |
| CA-011 | Field guide -> validator | Drift yields invalid generated templates | Co-locate/generate/test guide content |

## Change Propagation Matrix

| Change Surface | Upstream Inputs | Downstream Consumers | Constraint / Risk |
| --- | --- | --- | --- |
| New workflow authoring tool | user chat, registry/API | main agent, permission system, transcript | Must expose correct read-only/write/destructive behavior |
| Registry validation/write helpers | template payloads | manual API, tool, Settings | Must not break existing API tests |
| Field guide | validation schema/metadata | agent authoring loop | Must stay aligned with validation |
| Builtin copy logic | builtin template and target naming | user templates, Settings list | Must avoid id conflicts and builtin shadowing |
| Phase-policy gating | active workflow state | global tool availability | Must deny/gate writes in forbidden phases |
| Desktop path | desktop-launched sessions | server API, Settings | Must preserve same product semantics |

## Locked Decisions Carry-Forward

- Option A is selected: direct validated internal authoring tool.
- No mandatory preview step for valid user-template create/update.
- Global ordinary-chat availability, subject to phase-policy and permission gating.
- Builtins are read-only; modification means copy-then-edit.
- Delete is in scope only for uniquely identified user templates and must be destructive.
- Update/delete require stale-write protection.
- Settings compatibility is same persisted registry/store visible after reload/refetch.
- Template edits affect future sessions only.

## Must-Preserve Carry-Forward

- `MP-001` through `MP-020`: mapped or resolved in `spec.md` and `alignment.md`.
- `MP-021`: defer runtime write-path decision to `/sp.plan`.
- `MP-022`: defer field-guide source-of-truth decision to `/sp.plan`.

Stop-and-reopen conditions:
- Reopen if implementation proposes mandatory preview-only writes.
- Reopen if implementation writes outside workflow template config.
- Reopen if direct builtin mutation, deletion, or ID shadowing is proposed.
- Reopen if active/historical sessions are mutated by template edits.
- Reopen if global tool bypasses phase action policy.
- Reopen if the field guide can drift from validation.

## Canonical References

- `.specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.md`
- `.specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.json`
- `.specify/discussions/agent-workflow-authoring-tools/requirements.md`
- `.specify/discussions/agent-workflow-authoring-tools/open-questions.md`
- `.specify/discussions/agent-workflow-authoring-tools/technical-options.md`
- `.specify/discussions/agent-workflow-authoring-tools/project-context.md`
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

## Outstanding Questions

- Runtime path for desktop-launched sessions: direct registry writes, desktop-server-backed API calls, or shared abstraction. Resolve in `/sp.plan`.
- Field guide source of truth: shared schema metadata, validator annotations, or static tested guide colocated with validation. Resolve in `/sp.plan`.

## Deferred / Future Ideas

- Support parallel, nested, branching, or looping workflows only after an explicit product decision and validation expansion.
- New Settings UI feedback for agent-authored changes is not required by this spec, but can be planned if implementation touches desktop UX.
