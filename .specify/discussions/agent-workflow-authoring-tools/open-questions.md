# Open Questions: Agent Workflow Authoring Tools

## Hard Questions

### Q-001: Agent mutation approval model

- status: resolved
- owner: user
- latest_resolve_phase: discussion
- question: Should agent-authored workflow changes be persisted only after an explicit draft/preview/commit approval step, or should the agent be allowed to write directly when it decides the request is clear?
- resolution: Direct write is confirmed for valid user workflow template create/update operations. The agent should understand the request, fill the workflow template fields, validate, and persist without a separate preview step. Settings Workflows should show the created or updated template after refresh/reload. If the result is not good, the user expects to delete or modify it afterward.
- why_it_matters: This determines tool schema, permission behavior, transcript UX, delete/update safety, and downstream tests.
- stop_and_reopen_condition: Reopen if downstream design adds a mandatory preview-only workflow before writing user templates.

### Q-005: Builtin template edit behavior

- status: resolved
- owner: user
- latest_resolve_phase: discussion
- question: When the user asks the agent to modify builtin `agent-development`, should the agent create an editable user copy, create a user override with the same display identity, or should the product allow direct builtin mutation?
- resolution: The agent should create an editable user-owned copy and apply modifications to the copy. Builtin templates remain read-only and builtin ID shadowing remains invalid.
- evidence: Current live code treats `agent-development` as builtin, marks builtin templates non-editable, rejects user templates that shadow builtin IDs, and only permits PUT/DELETE routes for `source === 'user'`.
- why_it_matters: The user's example names `agent-development`, but the existing implementation intentionally protects builtin templates from direct mutation.
- stop_and_reopen_condition: Reopen if downstream design attempts direct builtin mutation or user-template shadowing instead of copy-then-edit.

## Soft Questions

### Q-006: Workflow field guidance for agent authoring

- status: resolved
- owner: user
- latest_resolve_phase: discussion
- question: Should the agent have explicit workflow field descriptions/guidance before writing templates, or rely on implicit schema knowledge and validation errors?
- resolution: The tool should expose field descriptions and authoring guidance so the agent knows how to write effective workflow templates. This guidance should explain every supported workflow template field, required/optional status, allowed values, inter-field relationships, examples, and quality heuristics.
- evidence: User asked that each workflow field be introduced because otherwise the agent will not know how to write workflows well. Live code shows required template/phase fields and validation rules in `workflowTemplateRegistryService.ts` and editor field mapping in `WorkflowTemplateEditor.tsx`.
- why_it_matters: Without a discoverable field guide, the agent may omit required phase contracts, invent unsupported shapes, or generate low-quality templates that only fail after validation.
- stop_and_reopen_condition: Reopen if downstream design relies only on model memory, omits a read-only guide/schema operation, or lets guide content drift from validation.

### Q-002: Tool exposure scope

- status: resolved
- owner: user
- latest_resolve_phase: discussion
- question: Should the workflow authoring tool be globally available, feature-flagged, workflow-session scoped, or available only in selected workflow phases?
- resolution: The workflow authoring tool should be globally available so users can ask for workflow creation or modification from ordinary chat. Downstream design must still ensure workflow phase action policy is not bypassed when the tool is used inside an active workflow phase.
- why_it_matters: Overexposure can violate phase action policy, but underscoping may make conversational authoring hard to access.
- stop_and_reopen_condition: Reopen if downstream design scopes the tool only to Settings/workflow sessions, hides it behind a default-off feature flag, or makes it bypass active workflow phase restrictions.

### Q-003: Optimize in place or create revised copy

- status: resolved
- owner: user
- latest_resolve_phase: discussion
- question: When optimizing an existing user workflow, should the default be update in place or create a revised copy?
- resolution: Existing user templates should be modified directly. Builtin templates should be copied to an editable user-owned template and then modified.
- why_it_matters: In-place edits are convenient but risk disrupting future starts of an existing workflow; copies preserve rollback and comparison.
- stop_and_reopen_condition: Reopen if downstream design creates revised copies for every user-template optimization by default.

### Q-004: Delete support in first release

- status: resolved
- owner: user
- latest_resolve_phase: discussion
- question: Should the agent tool support deleting user templates in the first release, or should deletion remain manual UI-only?
- resolution: Include delete in first release, but only for `source: user` templates. Delete must be treated as destructive, builtin templates remain undeletable, and ambiguous references such as "delete the one from before" require a unique target from recent tool results or current template list; otherwise the agent must ask before deleting.
- why_it_matters: Delete is the most destructive workflow-template operation and may need stronger confirmation.
- stop_and_reopen_condition: Reopen if downstream design deletes builtin templates, deletes ambiguous targets, or exposes delete without destructive-operation permission behavior.
