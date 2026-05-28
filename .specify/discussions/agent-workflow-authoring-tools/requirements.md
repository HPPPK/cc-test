# Requirements: Agent Workflow Authoring Tools

## Current Goal

Provide an internal agent tool capability that lets the agent collaboratively create, edit, modify, and optimize workflow templates through conversation, while preserving the manual Workflows management surface and existing workflow execution safety rules.

## Confirmed Context

- The existing Workflows implementation can already be manually configured through the desktop Settings UI and server workflow template API.
- The new capability should complement manual configuration by letting the agent translate a user's natural-language workflow idea or critique into a valid workflow template change.
- The implementation target is the current repository at `F:\github\cc-jiangxia`.

## Initial Functional Requirements

- The agent should be able to inspect current workflow templates and explain their phase structure, handoff rules, required artifacts, transition authority, and validation issues.
- The agent should be able to retrieve a workflow template authoring guide that explains each supported template and phase field before creating or editing a workflow. The guide should cover field purpose, required/optional status, allowed values, field relationships, quality heuristics, and compact examples.
- The authoring guide should be schema-aligned with the same workflow template validation contract used by the registry/API/manual editor, so the agent does not invent unsupported fields or omit required first-class contracts such as handoff intake, handoff rules, output artifact, completion criteria, and transition authority.
- The authoring tool should be globally available to the main agent in ordinary chat so users can request workflow creation or modification without first opening a workflow-specific mode.
- The agent should be able to draft a new user workflow template from conversation.
- The agent should be able to optimize an existing user workflow template by making concrete validated changes to phases, instructions, handoff rules, output artifacts, completion criteria, skills, and action policies.
- Agent-authored valid user workflow template create/update operations should persist immediately through the tool; there is no mandatory preview step before writing.
- The Settings Workflows page should be able to show agent-created or agent-updated templates after it reloads/refetches workflow template data.
- Builtin templates must not be modified or deleted directly. If the user wants to change a builtin workflow, the agent should create an editable user-owned copy and apply modifications to that copy.
- Every create/update/delete operation must use the same validation and persistence semantics as the existing manual workflow template API.
- Delete is included in first scope only for user templates. The tool must mark delete as destructive and must not delete unless the target template is uniquely identified by `source: user` and `id` or by an unambiguous recent tool result/list match.
- Invalid candidate templates must return actionable diagnostics and must not modify persisted workflow config.
- Agent-authored changes must preserve unknown fields in the workflow config and in existing templates wherever the current registry service preserves them.
- The tool must make conflict behavior explicit: existing user template IDs cannot be overwritten silently, and builtin ID shadowing remains invalid.
- Running workflow sessions must not be mutated in place by template edits. Existing sessions should keep their template snapshot semantics; future sessions can use the updated template after commit.
- The tool result should be useful for conversation: include the operation outcome, validation issues, affected template IDs, before/after summary, and next suggested action.
- Tool validation diagnostics should reference the same field names and authoring-guide concepts so the agent can repair invalid templates without guessing.
- When the user asks to modify a builtin template such as `agent-development`, the tool should interpret this as copy-then-edit: duplicate the builtin into a non-conflicting user template ID/name, then modify the user copy.
- Builtin copy-then-edit default naming should use `id: <builtin-id>-custom`, then `-2`, `-3`, etc. on conflicts. Default display name should use `<Builtin Name> Custom`, unless the user supplied a specific purpose/name that can produce a clearer non-conflicting slug/name.
- Global availability must not bypass active workflow phase restrictions. If the agent is currently inside a workflow phase whose action policy forbids this kind of write, the tool must be gated or denied consistently with the phase policy.
- Update/delete must use write-before-read conflict protection: before mutating an existing user template, re-read the current template and compare it to the agent's original basis. If the template has changed, reject the write and tell the agent to re-analyze or ask the user to confirm against the new current version. Create operations only need a current ID conflict check.

## Initial Non-Goals

- Do not bypass user-owned persistence protections for `~/.claude/settings.json`, chat transcripts, providers, MCP config, OAuth tokens, skills, plugin state, adapter sessions, or team/session records.
- Do not enable unsupported workflow shapes if current validation rejects them, including parallel, nested, branching, or loop workflows, unless a later explicit scope expands the workflow schema.
- Do not make the agent change implementation source files as part of authoring a workflow template.
- Do not silently change active workflow session state, phase history, pending confirmations, or final reports when a template is edited.

## Success Signals

- A user can describe an ideal workflow in chat and receive a valid persisted user template after the chosen approval model is satisfied.
- A user can say what is bad about an existing workflow and get a concrete validated update or safe copy.
- The agent can ask the tool for field guidance and then produce a higher-quality workflow template with complete phase contracts instead of relying on implicit schema knowledge.
- Invalid or risky changes are blocked before persistence and explained in terms the user can act on.
- Manual Settings workflow management remains compatible with agent-authored templates.
- Existing workflow template API and registry tests can be extended rather than replaced.

## Senior Consequence Analysis

### Affected Object Map

- User workflow config: `~/.claude/cc-jiangxia/workflows.json` or the active `CLAUDE_CONFIG_DIR` equivalent.
- Builtin workflow template: `agent-development`.
- User workflow templates and their phases, required artifacts, handoff rules, skills, transition policies, action policies, and unknown extension fields.
- Workflow template registry cache and write path in `WorkflowTemplateRegistryService`.
- Server workflow template API under `/api/workflows/templates`.
- Desktop Settings Workflows UI and API client.
- Built-in agent tool pool and permission system.
- Workflow session template snapshots, source template status, and resumed-session compatibility.
- Workflow phase tool policy and workflow-scoped tools.
- Workflow template field guidance exposed to the agent through tool schema/help output.
- Workflow template tests, server route tests, and any future tool-level tests.

### State-Behavior Matrix

| State | Required behavior |
| --- | --- |
| Missing workflow config | Listing remains valid with builtin templates. Agent commit may create the cc-jiangxia workflow config only for a validated user-template mutation. |
| Malformed or invalid existing config | Agent writes are blocked; diagnostics are returned. Existing invalid config must not be overwritten by a generated template. |
| Draft candidate | Candidate may exist transiently while the agent fills required fields, but valid user-template create/update should persist directly once the tool is called. |
| Field-guide request | Return a read-only description of supported workflow template and phase fields, allowed values, required relationships, examples, and quality guidance. No workflow config is mutated. |
| Validation failed | No write. Return issue codes, paths, messages, and a repair suggestion. |
| Create valid user template | Persist after validation and conflict checks. Return refreshed list metadata. |
| Update existing user template | Route ID and template ID must match; unknown fields are preserved where registry semantics preserve them. |
| Delete user template | Delete only uniquely identified user templates. Builtin deletion remains disallowed. Ambiguous deletion requests must ask for clarification. Tool metadata must mark delete as destructive. |
| Builtin edit request | Create an editable user-owned copy with a non-conflicting ID/name, then apply modifications to that copy. Existing builtin remains unchanged. |
| ID conflict | Reject or propose a non-conflicting rename; never silently overwrite. |
| Active/running workflow session | Keep session template snapshot stable. Template edits affect future sessions, not in-place running state. |
| Resumed stale/missing template session | Preserve existing stale/missing template recovery semantics. |
| Concurrent manual and agent edits | Update/delete re-read the current template before writing. If the current template differs from the agent's original basis, reject the write and require re-analysis. Create checks current ID conflicts. |

### Dependency Impact Table

| Dependency | Impact if semantics drift | Required handling |
| --- | --- | --- |
| `WorkflowTemplateRegistryService` | Invalid writes can corrupt user templates or drop unknown fields. | Reuse registry validation/write semantics or factor shared validator/write helpers. |
| `/api/workflows/templates` | Desktop and agent paths can diverge. | Keep server API and internal tool behavior aligned. |
| `src/tools.ts` tool assembly | Tool may be exposed in unsafe contexts. | Gate tool availability and permissions deliberately. |
| Workflow sessions | Editing templates could be mistaken for editing active sessions. | Preserve snapshot behavior and explain affected future sessions only. |
| Desktop Settings UI | Manual refresh may show agent changes unexpectedly. | Return refreshed metadata and ensure UI can reload. |
| Workflow tool policy | Generated phases can alter which actions are allowed. | Validate generated action policies and preserve phase safety intent. |
| Workflow field guide | If field documentation drifts from validation, the agent may write poor or invalid templates. | Generate or co-locate the guide with validation/schema definitions and cover it with tests. |
| Tests and quality gates | Hidden write behavior needs coverage. | Add same-area server/tool tests and narrow desktop/API tests in downstream implementation. |

### Recovery And Validation Contract

- Writes must be atomic enough that invalid candidate data does not leave a partial workflow config.
- The tool must be idempotent for retried tool calls where practical, or explicitly reject duplicate conflict-prone retries.
- A failed validation or permission denial must leave persisted workflow config unchanged.
- A rejected, ambiguous, or permission-denied delete must leave persisted workflow config unchanged.
- A stale update/delete rejection must leave persisted workflow config unchanged and return a clear conflict result that includes the affected template id/source and instructs the agent to re-read/re-analyze before retry.
- Registry cache must be invalidated after successful mutations.
- Tool output must include enough metadata for the user or UI to recover: operation, template id/source, validation issues, and whether persistence happened.
- The authoring guide must be read-only, deterministic enough for tests, and updated in lockstep with validation when required fields or allowed values change.
- Verification should include server API tests, registry service tests, built-in tool tests, and desktop API/client tests if the desktop path changes.

### Coverage Gaps

- Gap 1: Resolved by user confirmation of write-before-read conflict protection: update/delete re-read and compare before write; stale changes are rejected; create checks current ID conflicts.
- Gap 2: Resolved by user confirmation of default builtin copy naming: `<builtin-id>-custom`, conflict suffixes `-2`, `-3`, and display name `<Builtin Name> Custom` unless a user-supplied purpose/name is clearer.

### Consequence Obligations

- CA-001: Agent-authored valid user-template create/update mutations should persist directly without a mandatory preview step, while validation failure or tool rejection leaves config unchanged. Affected objects: user workflow config, agent tool permission surface. Owner workflow: sp-discussion. Latest resolve phase: discussion. Status: resolved. Stop-and-reopen condition: downstream design reintroduces mandatory preview-only persistence.
- CA-002: Agent writes must preserve user-owned workflow config fields and must not mutate protected non-workflow config surfaces. Affected objects: `workflows.json`, protected config files. Owner workflow: downstream specification. Latest resolve phase: specify. Status: mapped. Stop-and-reopen condition: proposed implementation writes outside the cc-jiangxia workflow template config.
- CA-003: The tool must share validation semantics with the existing template registry/API and block invalid writes. Affected objects: registry service, workflow template API, tool implementation. Owner workflow: downstream specification/plan. Latest resolve phase: plan. Status: mapped. Stop-and-reopen condition: a separate validator diverges from existing API behavior.
- CA-004: Builtin templates remain read-only mutation targets; modifying a builtin requires creating a non-conflicting user-owned copy and applying changes to that copy. Affected objects: builtin template, user templates. Owner workflow: sp-discussion. Latest resolve phase: discussion. Status: resolved. Stop-and-reopen condition: downstream design attempts direct builtin mutation or builtin ID shadowing.
- CA-005: Template edits must not mutate active or historical workflow session snapshots. Affected objects: workflow sessions, template snapshots, stale/missing template recovery. Owner workflow: downstream plan. Latest resolve phase: plan. Status: mapped. Stop-and-reopen condition: design updates active session state as a side effect of template update.
- CA-006: Tool results must make persistence state auditable in the transcript. Affected objects: agent transcript, tool results, user review. Owner workflow: downstream specification. Latest resolve phase: specify. Status: mapped. Stop-and-reopen condition: tool returns only generic success/failure without operation and affected-template metadata.
- CA-007: Concurrent manual and agent edits require write-before-read conflict protection: update/delete re-read the current template and reject stale writes when it differs from the agent's original basis; create checks current ID conflicts. Affected objects: workflow config, desktop Settings UI, agent tool. Owner workflow: sp-discussion. Latest resolve phase: discussion. Status: resolved. Stop-and-reopen condition: update/delete path writes based on stale list state without detection or documented conflict behavior.
- CA-008: The workflow authoring tool should be globally available in ordinary chat, but must align with active workflow phase action policy so workflow authoring is denied or gated when it would violate the phase's allowed actions. Affected objects: tool pool, workflow tool policy, generated workflow phases. Owner workflow: downstream specification/plan. Latest resolve phase: plan. Status: mapped. Stop-and-reopen condition: tool is globally available with no phase/permission gating decision.
- CA-009: Delete is in first scope only for uniquely identified user templates and must be marked destructive; builtin or ambiguous deletes must be rejected or clarified before any write. Affected objects: user templates, builtin templates, workflow config, permission prompts. Owner workflow: sp-discussion. Latest resolve phase: discussion. Status: resolved. Stop-and-reopen condition: downstream design allows builtin deletion, ambiguous target deletion, or non-destructive delete execution.
- CA-010: Builtin copy-then-edit default naming must use `<builtin-id>-custom` with conflict suffixes and `<Builtin Name> Custom` unless the user's requested purpose/name produces a clearer non-conflicting copy. Affected objects: builtin templates, copied user templates, Settings Workflows list. Owner workflow: sp-discussion. Latest resolve phase: discussion. Status: resolved. Stop-and-reopen condition: copied builtin templates receive confusing IDs/names or collide with existing user templates.
- CA-011: The agent must have a discoverable workflow template field guide before authoring or repairing templates. The guide must explain required fields, optional fields, allowed values, inter-field relationships, examples, and writing heuristics, and it must stay aligned with registry/API validation. Affected objects: tool schema/help output, workflow template validator, manual editor field contract, validation diagnostics. Owner workflow: downstream specification/plan. Latest resolve phase: plan. Status: mapped. Stop-and-reopen condition: downstream design relies on undocumented model knowledge or a stale hand-written field list that can drift from validation.

## Workflow Field Guide Requirements

The downstream tool should expose a read-only guide operation, or equivalent schema/help surface, that gives the agent enough information to create and edit high-quality workflow templates:

| Field group | Fields to explain | Authoring guidance to preserve |
| --- | --- | --- |
| Template identity | `schemaVersion`, `id`, `source`, `version`, `name`, `description` | Use stable slug IDs without path separators. User templates must use `source: user`; builtin ID shadowing is invalid. Names should be user-readable; descriptions should clarify when to choose the workflow. |
| Phase identity | `phases[]`, `id`, `name`, optional `role` | Phases are a non-empty ordered linear array. IDs must be unique within the template and stable. Names should be short and user-readable. Role can describe the phase's responsibility when it improves clarity. |
| Phase intent | `instructions`, optional `objective` | Instructions should tell the agent what to do and what not to do in that phase. Objective should be a compact goal statement when present. |
| Handoff contract | `requiredIntake`, `handoffRules` | Every phase needs first-class intake and handoff rules. Intake describes what the phase must receive or verify before work; handoff rules describe what must be passed to the next phase or user. |
| Execution contract | `executionRules`, optional `phasePrompt` | Execution rules should constrain behavior, permissions, evidence, and stopping points. `phasePrompt` can provide richer runtime guidance, including objective, handoff input, output artifact sections, and completion rules. |
| Output contract | `outputArtifact`, `requiredArtifacts` | Every phase needs a first-class required output artifact with `id`, `name`, `kind`, `description`, and `required: true`. Required artifacts should match what downstream phases need. |
| Completion contract | `completionCriteria` | Must include a supported `type` (`manual-checklist`, `artifact-required`, or `agent-reported`) and a concrete description of what completion means. |
| Transition contract | `transition.authority` | Supported authorities are `user-confirmation` and `auto`. Default to `user-confirmation` when phase completion should be reviewed before advancing. |
| Tool/action safety | optional `actionPolicy.allowedActions`, `actionPolicy.forbiddenActions` | Policies should express which tool/action categories are allowed or forbidden in a phase and must not bypass global tool safety rules. |
| Model/skills | optional `requestedModel`, `skills` | Requested model is optional. Skills should include a name and reason when a phase benefits from explicit skill guidance. |
| Unsupported shapes | top-level/transition parallel, nested, branching, loop fields | The first release remains linear-only. The guide should explicitly warn that parallel, nested, branching, and looping workflow shapes are unsupported. |
