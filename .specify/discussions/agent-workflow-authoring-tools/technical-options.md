# Technical Options: Agent Workflow Authoring Tools

## Option A: Direct Validated Authoring Tool

Create a globally available built-in internal tool, for example `workflow_template_author`, with operations such as `list`, `inspect`, `validate`, `create`, `update`, `duplicate`, and `delete`. Mutating user-template operations validate and write directly when the tool is called; there is no separate preview/commit phase. Delete is supported only for uniquely identified user templates and must be destructive.

- Product behavior enabled: The agent can collaborate conversationally from ordinary chat, produce a concrete valid workflow, fill required fields, validate, persist immediately, and return a concise operation summary. Settings Workflows can show the result after template data is refetched.
- Field guidance behavior: The same tool should include a read-only `describe_schema`, `authoring_guide`, or equivalent operation that explains each workflow template field, required relationships, supported enum values, unsupported shapes, and examples before the agent drafts or repairs templates.
- Likely implementation surface: `src/tools`, `src/tools.ts`, `src/Tool.ts`, `src/server/services/workflowTemplateRegistryService.ts`, and possibly shared helpers from `src/server/api/workflowTemplates.ts`.
- Complexity: Medium. Most persistence semantics exist already, but the tool needs a clean input/output contract, permission behavior, write-before-read conflict checks, and tests.
- Compatibility: Strongest fit with existing manual UI because it can reuse or share the same registry validation/write behavior.
- Risks: Users may not understand when a workflow was actually changed unless the tool result is very explicit. Global availability can bypass workflow phase policy unless explicitly gated in active workflow sessions. Concurrent manual edits must produce a stale-write conflict instead of silent overwrite. Field guidance can drift from validation unless it is co-located with or tested against the schema/validator.
- Recovery/rollback: Failed validation or denied permission leaves config unchanged. Successful commits return affected template metadata; user can edit/delete via Settings. Rejected or ambiguous deletes leave config unchanged.
- Verification: Unit tests for tool input validation and no-write failures, field-guide/schema output tests, registry tests for unknown-field preservation, server/API regression tests if helpers are refactored, and permission/tool-pool tests.
- Recommendation: Current selected direction for user templates and ordinary-chat access.

## Option B: Draft, Validate, Explicit Commit Tool

Expose the same authoring tool but require a deliberate preview/commit interaction before every persistent create/update/delete.

- Product behavior enabled: Stronger reviewability, but slower than the user's desired flow.
- Field guidance behavior: Still needs the same read-only field guide; preview does not remove the need for authoring semantics.
- Likely implementation surface: same as Option A, plus draft state and approval semantics.
- Complexity: Medium-high.
- Compatibility: Strong but adds UX ceremony.
- Risks: Conflicts with the user's confirmed "no preview" preference for ordinary user-template create/update.
- Recovery/rollback: Failed validation or denied approval leaves config unchanged.
- Verification: Same as Option A plus preview/commit state tests.
- Recommendation: Not selected for ordinary user templates.

## Option C: Agent Drafts, User Saves Through Existing UI/API

Do not add a mutating agent tool. The agent generates a valid workflow template payload and diagnostics in chat; the user applies it manually through existing Settings import/create/edit flows.

- Product behavior enabled: Conversational generation and optimization, but no agent-owned persistence.
- Likely implementation surface: smaller read-only inspector/validator/field-guide wrapper or no mutating tool.
- Complexity: Low.
- Compatibility: Very safe because manual UI remains the only mutation path.
- Risks: Does not satisfy the user's stated goal of letting the agent create/add/edit/modify workflows internally. Workflow authoring remains copy/paste heavy.
- Recovery/rollback: Manual UI handles all persistence.
- Verification: Mostly template validation and UI import/create tests.
- Recommendation: Good fallback if mutation safety is not acceptable, but not the best fit for the requested capability.

## Current Recommendation

Use Option A globally for ordinary chat: direct validated writes with explicit transcript output plus a read-only field authoring guide/schema operation. For builtin templates such as `agent-development`, use copy-then-edit: create a non-conflicting user-owned copy and apply modifications to that copy. Default copy IDs use `<builtin-id>-custom`, then `-2`, `-3`, etc. on conflicts; display names use `<Builtin Name> Custom` unless user intent gives a clearer name. Update/delete re-read and compare before write, rejecting stale changes. In active workflow sessions, the tool must still respect phase action policy.

## Open Technical Decisions

- Whether a desktop-server-backed path is needed in addition to direct registry-service writes for desktop-launched sessions.
- Whether the field guide is produced from a shared schema metadata module, validator annotations, or a static tested guide colocated with `workflowTemplateRegistryService`.
