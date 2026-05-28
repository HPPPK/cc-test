# Discussion Log: Agent Workflow Authoring Tools

## Event 2026-05-27T01:45:52.9513916+08:00

- kind: semantic-checkpoint
- user_input_summary: User wants agent-internal tools so the agent can create, add, edit, modify, and optimize workflows through conversation, instead of only manual workflow configuration.
- classifier: product_intent, current_project_fact
- agent_conclusion: Created a new follow-on discussion rather than changing the already user-confirmed workflow-template-management handoff. The target boundary is the current project. Live evidence shows workflow template management is already implemented through server APIs and desktop UI, while the agent-facing workflow tool surface currently only supports phase completion. The next hard decision is the agent mutation/approval model for workflow template changes.
- evidence_used:
  - .specify/discussions/workflow-template-management/discussion-state.md
  - .specify/project-cognition/status.json
  - src/tools.ts
  - src/Tool.ts
  - src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.tsx
  - src/server/services/workflowTemplateRegistryService.ts
  - src/server/api/workflowTemplates.ts
  - src/server/services/workflowTypes.ts
  - src/server/services/workflowRuntimeService.ts
  - src/server/services/workflowToolPolicy.ts
  - src/server/router.ts
  - desktop/src/api/sessions.ts
  - desktop/src/types/session.ts
  - desktop/src/components/workflow/WorkflowTemplateManager.tsx
  - desktop/src/components/workflow/WorkflowTemplateEditor.tsx
  - src/server/__tests__/workflowTemplates.test.ts
- open_question_delta: Added Q-001 as a hard product/safety decision: whether the agent tool should write only after an explicit draft/preview/commit step, write directly with permission prompts, or stay draft-only.
- semantic_checkpoint_required: yes

## Event 2026-05-27T01:54:10.9989193+08:00

- kind: semantic-checkpoint
- user_input_summary: User clarified two desired scenarios: create a workflow from natural-language phase descriptions and directly persist it so Settings Workflows can see it; modify an existing workflow such as agent-development when a phase is not good enough.
- classifier: product_intent, current_project_fact
- agent_conclusion: Resolve Q-001 in favor of direct validated writes for user workflow templates without a mandatory preview step. Record a new hard blocker for builtin edit behavior because live code treats agent-development as builtin/read-only and only permits direct update/delete for user templates.
- evidence_used:
  - user confirmation
  - src/server/api/workflowTemplates.ts
  - src/server/services/workflowTemplateRegistryService.ts
- open_question_delta: Q-001 resolved. Q-005 added for builtin template edit behavior. Q-003 partially resolved for user templates in favor of direct modification.
- semantic_checkpoint_required: yes

## Event 2026-05-27T01:57:54.5074868+08:00

- kind: semantic-checkpoint
- user_input_summary: User selected option 1 for builtin template edit behavior.
- classifier: product_intent
- agent_conclusion: Resolve builtin edit behavior as copy-then-edit. Builtin templates such as agent-development remain read-only; agent modification requests create a non-conflicting editable user-owned copy and apply modifications to that copy.
- evidence_used:
  - user selection
  - src/server/api/workflowTemplates.ts
  - src/server/services/workflowTemplateRegistryService.ts
- open_question_delta: Q-005 resolved. Q-003 fully resolved: user templates update in place; builtin templates copy-then-edit. Q-002 becomes the next hard question because tool exposure scope affects safety and access.
- semantic_checkpoint_required: yes

## Event 2026-05-27T01:59:47.5012398+08:00

- kind: semantic-checkpoint
- user_input_summary: User selected option 1 for tool exposure scope.
- classifier: product_intent
- agent_conclusion: Resolve the tool exposure scope as globally available in ordinary chat, while preserving a downstream constraint that active workflow phase action policies must still gate or deny the tool when authoring would violate the current phase.
- evidence_used:
  - user selection
  - src/tools.ts
  - src/server/services/workflowToolPolicy.ts
- open_question_delta: Q-002 resolved. Remaining open items are downstream specification/plan details rather than blockers for core direction: delete support, stale-write guard, and naming convention for builtin copies.
- semantic_checkpoint_required: yes

## Event 2026-05-27T02:03:47.9481406+08:00

- kind: semantic-checkpoint
- user_input_summary: User selected option 1 for first-release delete support.
- classifier: product_intent
- agent_conclusion: Resolve delete support as included in first scope, but only for uniquely identified user templates. Builtin deletion remains disallowed, ambiguous delete requests must be clarified, and delete must be marked destructive.
- evidence_used:
  - user selection
  - src/server/api/workflowTemplates.ts
  - src/server/services/workflowTemplateRegistryService.ts
- open_question_delta: Q-004 resolved. Added CA-009 to preserve delete safety obligations downstream.
- semantic_checkpoint_required: yes

## Event 2026-05-27T09:38:52.5109470+08:00

- kind: semantic-checkpoint
- user_input_summary: User accepted the proposed builtin copy naming defaults.
- classifier: product_intent
- agent_conclusion: Resolve builtin copy-then-edit naming. Default copy IDs use `<builtin-id>-custom` with numeric suffixes on conflict, and default display names use `<Builtin Name> Custom` unless the user supplied a clearer purpose/name.
- evidence_used:
  - user confirmation
- open_question_delta: Builtin naming gap resolved. Added CA-010. Remaining significant decision is stale-write/concurrent edit behavior for direct writes.
- semantic_checkpoint_required: yes

## Event 2026-05-27T11:06:14.2219673+08:00

- kind: semantic-checkpoint
- user_input_summary: User accepted the proposed stale-write/concurrent edit strategy.
- classifier: product_intent
- agent_conclusion: Resolve concurrent edit behavior. Update/delete must re-read the current template before writing and reject stale writes when current template content differs from the agent's original basis; create operations only need current ID conflict checks.
- evidence_used:
  - user confirmation
- open_question_delta: Stale-write gap resolved. CA-007 marked resolved. No hard discussion blockers remain.
- semantic_checkpoint_required: yes

## Event 2026-05-27T11:48:15.9484956+08:00

- kind: semantic-checkpoint
- user_input_summary: User raised that every workflow field should be introduced/explained so the agent knows how to write workflows effectively.
- classifier: product_intent, current_project_fact
- agent_conclusion: Add a confirmed requirement that the agent-facing authoring tool expose a read-only field guide/schema-help operation. The guide must explain supported template and phase fields, required/optional status, allowed values, field relationships, examples, unsupported shapes, and quality heuristics, and it must stay aligned with existing validation semantics.
- evidence_used:
  - user confirmation
  - src/server/services/workflowTemplateRegistryService.ts
  - src/server/services/workflowTypes.ts
  - desktop/src/components/workflow/WorkflowTemplateEditor.tsx
- open_question_delta: Q-006 added and resolved. Added CA-011 for field-guide/schema alignment. No hard discussion blockers remain.
- semantic_checkpoint_required: yes

## Event 2026-05-27T13:09:42.8807612+08:00

- kind: handoff-draft
- user_input_summary: User asked what the next step is.
- classifier: handoff_request
- agent_conclusion: Ran handoff assessment, determined the discussion is ready for one unified `sp-specify` handoff, and wrote a draft Markdown/JSON handoff pair. Self-review passed for JSON parse, shared handoff goal, MP-001 through MP-022 consistency, CA-001 through CA-011 consistency, hard unknown count 0, and open conflict count 0. Handoff remains draft until user confirmation.
- evidence_used:
  - .specify/discussions/agent-workflow-authoring-tools/handoff-assessment.md
  - .specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.md
  - .specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.json
- open_question_delta: No new product questions. User confirmation is now required before marking handoff-ready.
- semantic_checkpoint_required: yes

## Event 2026-05-27T14:38:41.6559401+08:00

- kind: handoff-user-confirmation
- user_input_summary: User explicitly confirmed the handoff draft can be used as later `sp-specify` input and instructed not to run `sp-specify` automatically.
- classifier: handoff_request
- agent_conclusion: Marked the discussion and handoff pair as handoff-ready/user-confirmed, recorded the confirmation time, and preserved the instruction that `sp-specify` must not be invoked automatically.
- evidence_used:
  - user confirmation
  - .specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.md
  - .specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.json
  - .specify/discussions/agent-workflow-authoring-tools/discussion-state.md
- open_question_delta: No open questions. Handoff is ready for later use only when the user explicitly requests the next workflow.
- semantic_checkpoint_required: yes
