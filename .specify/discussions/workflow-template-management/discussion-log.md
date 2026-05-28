# Discussion Log: Workflow Template Management

## Event 2026-05-26T11:40:38.6971425+08:00

- kind: semantic-checkpoint
- user_input_summary: User invoked `$sp-discussion` and wants to add an item in Settings to manage workflow templates.
- classifier: product_intent, current_project_fact
- agent_conclusion: Create a new discussion session with current repository as both implementation target and evidence source. Product scope is not yet locked.
- evidence_used:
  - `.specify/project-cognition/status.json`
  - project-cognition lexicon/query for workflow
  - `desktop/src/pages/Settings.tsx`
  - `desktop/src/stores/uiStore.ts`
  - `desktop/src/pages/EmptySession.tsx`
  - `desktop/src/components/workflow/WorkflowTemplatePicker.tsx`
  - `desktop/src/api/sessions.ts`
  - `desktop/src/types/session.ts`
  - `src/server/api/sessions.ts`
  - `src/server/services/workflowTemplateRegistryService.ts`
  - `src/server/services/workflowTypes.ts`
- open_question_delta: Added one hard product-scope question about what "manage" must include in the first version.
- semantic_checkpoint_required: yes

## Event 2026-05-26T11:50:25.6095244+08:00

- kind: semantic-checkpoint
- user_input_summary: User selected first-version scope 1, CRUD form management. User clarified that a workflow such as `spec-workflow` should allow specifying phase count and each phase's system prompt, then asked what else belongs in the phase definition.
- classifier: product_intent, current_project_fact
- agent_conclusion: Record CRUD form as the selected first-version scope. Based on live runtime evidence, "system prompt" should be modeled as a structured phase prompt/protocol plus phase instructions rather than a single opaque field only.
- evidence_used:
  - `src/server/services/workflowTypes.ts`
  - `src/server/services/workflowTemplateRegistryService.ts`
  - `src/server/services/workflowRuntimeService.ts`
- open_question_delta: Q-001 resolved. Added a decision question about phase editor field grouping.
- semantic_checkpoint_required: yes

## Event 2026-05-26T11:53:50.9712205+08:00

- kind: semantic-checkpoint
- user_input_summary: User confirmed the proposed phase editor grouping is acceptable.
- classifier: product_intent
- agent_conclusion: Phase editor should expose a default/core field set and keep advanced fields collapsed by default.
- evidence_used:
  - user confirmation
- open_question_delta: Q-005 resolved. Added next question about built-in `spec-workflow` identity.
- semantic_checkpoint_required: yes

## Event 2026-05-26T12:57:33.6233312+08:00

- kind: semantic-checkpoint
- user_input_summary: User clarified not to rename or change the built-in workflow. It should remain built-in and be used as a template for later user-defined workflows.
- classifier: product_intent
- agent_conclusion: Built-in templates stay protected/read-only with stable identity. Custom workflows are created as user templates by copying or starting from built-ins.
- evidence_used:
  - user confirmation
- open_question_delta: Q-006 resolved. Q-003 resolved. Added storage-scope question.
- semantic_checkpoint_required: yes

## Event 2026-05-26T12:59:02.5486476+08:00

- kind: semantic-checkpoint
- user_input_summary: User confirmed custom workflow templates should be global.
- classifier: product_intent
- agent_conclusion: First version should store/manage custom workflow templates as global user-level templates only, using existing cc-jiangxia-owned workflow config storage. Do not add project-level template scope in this feature.
- evidence_used:
  - user confirmation
  - existing evidence that `WorkflowTemplateRegistryService` reads `~/.claude/cc-jiangxia/workflows.json`
- open_question_delta: Q-007 resolved. Added question about import/export JSON.
- semantic_checkpoint_required: yes

## Event 2026-05-26T13:53:33.1545700+08:00

- kind: semantic-checkpoint
- user_input_summary: User said JSON import/export can be included and should not be especially complex.
- classifier: product_intent
- agent_conclusion: Include JSON import/export in the first version, scoped to global user-level templates. Import must have validation and conflict handling before writing.
- evidence_used:
  - user confirmation
  - existing registry validation and write-preservation evidence
- open_question_delta: Q-008 resolved. Added import id conflict policy question.
- semantic_checkpoint_required: yes

## Event 2026-05-26T13:56:55.0827816+08:00

- kind: semantic-checkpoint
- user_input_summary: User clarified import should let the user choose which workflows from a JSON file to import; if a selected workflow conflicts by name/id, default to renaming rather than replacing, and users can delete/edit after import.
- classifier: product_intent
- agent_conclusion: Import preview must support selecting specific workflow templates, default conflict handling is automatic rename, and import must not overwrite existing user templates by default.
- evidence_used:
  - user confirmation
- open_question_delta: Q-009 resolved. No hard product blockers remain.
- semantic_checkpoint_required: yes

## Event 2026-05-26T14:00:22.7495963+08:00

- kind: semantic-checkpoint
- user_input_summary: User clarified workflow template management is only one part; another part is how the chat page chooses workflow or switches into workflow mode.
- classifier: product_intent, current_project_fact
- agent_conclusion: Existing implementation supports workflow selection at session creation and displays workflow controls for workflow sessions. It does not currently prove safe in-place conversion of an existing normal chat into a workflow session. Need user decision on creation-time mode lock versus conversion.
- evidence_used:
  - project-cognition lexicon/query for chat, workflow, mode
  - `desktop/src/components/chat/ChatInput.tsx`
  - `desktop/src/pages/EmptySession.tsx`
  - `desktop/src/pages/ActiveSession.tsx`
  - `desktop/src/components/workflow/WorkflowTemplatePicker.tsx`
  - `desktop/src/components/workflow/WorkflowStatusPanel.tsx`
  - `desktop/src/components/workflow/WorkflowTransitionControls.tsx`
  - `desktop/src/stores/chatStore.ts`
  - `desktop/src/api/sessions.ts`
  - `src/server/api/sessions.ts`
- open_question_delta: Added hard question about workflow mode switching/conversion semantics.
- semantic_checkpoint_required: yes

## Event 2026-05-26T14:20:49.2011356+08:00

- kind: semantic-checkpoint
- user_input_summary: User clarified the user-facing name should be `Workflows`.
- classifier: product_intent
- agent_conclusion: Use `Workflows` as the user-visible product surface name for settings entry and chat mode, while preserving internal implementation terms like workflow template and workflow session where useful.
- evidence_used:
  - user confirmation
- open_question_delta: No hard question resolved; naming decision recorded.
- semantic_checkpoint_required: yes

## Event 2026-05-26T14:24:00+08:00

- kind: evidence-checkpoint
- user_input_summary: User asked whether Claude Code has a new `workflows` feature that can be referenced.
- classifier: reference_boundary, current_external_fact
- agent_conclusion: Current official Claude Code docs provide useful workflow-related references, especially Skills as reusable workflows, bundled skills such as `/batch`, `/loop`, `/run`, `/verify`, `/run-skill-generator`, command discoverability, hooks, subagents, and schedules. No stable official standalone `/workflow` feature was found in current public docs.
- evidence_used:
  - `https://code.claude.com/docs/en/features-overview`
  - `https://code.claude.com/docs/en/commands`
  - `https://code.claude.com/docs/en/skills`
  - `https://code.claude.com/docs/en/changelog`
  - `https://support.claude.com/en/articles/12138966-release-notes`
- open_question_delta: No decision changed. Added external reference guidance to project context.
- semantic_checkpoint_required: yes

## Event 2026-05-26T14:27:42.4597245+08:00

- kind: semantic-checkpoint
- user_input_summary: User clarified Workflows should be a standard staged abstraction: phases do different work, every phase needs handoff and handoff rules, and custom workflow authoring needs a standard for defining what each phase does.
- classifier: product_intent
- agent_conclusion: Elevate Workflows from prompt editing to a standard staged workflow contract. Each phase should define responsibility, intake, work instructions, output, handoff, completion/transition semantics, and recovery rules.
- evidence_used:
  - user confirmation
  - existing runtime fields for phase instructions, phasePrompt, requiredArtifacts, completionCriteria, transitionAuthority, and actionPolicy
- open_question_delta: Added hard question about whether every phase must require an explicit output artifact and handoff contract.
- semantic_checkpoint_required: yes

## Event 2026-05-26T14:34:58.5045285+08:00

- kind: semantic-checkpoint
- user_input_summary: User confirmed every Workflow phase should require an explicit output artifact and handoff contract.
- classifier: product_intent
- agent_conclusion: Make output artifact and handoff contract required parts of the standard phase contract and validation model.
- evidence_used:
  - user confirmation
- open_question_delta: Q-011 resolved.
- semantic_checkpoint_required: yes

## Event 2026-05-26T14:51:17.7971679+08:00

- kind: semantic-checkpoint
- user_input_summary: User proposed chat entry via the composer plus menu: add `Workflows`; clicking opens a dialog to choose workflows. If the current session has content, create a new session; if it is a new empty session, reuse it.
- classifier: product_intent, current_project_fact
- agent_conclusion: Confirm chat Workflows entry should be a `+` menu action with a selection dialog. Existing message count/launch-flow evidence supports reusing the empty session path and creating a new workflow session when current chat has content.
- evidence_used:
  - `desktop/src/components/chat/ChatInput.tsx`
  - `desktop/src/pages/ActiveSession.tsx`
  - user confirmation
- open_question_delta: Q-010 resolved in favor of explicit new-session creation from existing chats, not in-place conversion. Added question about whether to carry current chat context into the new workflow.
- semantic_checkpoint_required: yes

## Event 2026-05-26T14:55:29.7691052+08:00

- kind: semantic-checkpoint
- user_input_summary: User revised chat entry behavior: after selecting Workflows, do not default to creating a new session. Instead ask whether to clear context, because existing context can be valuable for workflow inheritance.
- classifier: product_intent
- agent_conclusion: Reopen and revise chat-entry semantics. Existing chats may explicitly enter Workflows after a confirmation/context handling choice. The UI must not silently create a new session or discard context by default.
- evidence_used:
  - user confirmation
- open_question_delta: Revised Q-010 resolution; replaced Q-012 with context handling options.
- semantic_checkpoint_required: yes

## Event 2026-05-26T14:59:42.8810949+08:00

- kind: semantic-checkpoint
- user_input_summary: User confirmed the summarize option is effectively `/compact`.
- classifier: product_intent, current_project_fact
- agent_conclusion: Context handling for non-empty chats should offer three explicit choices: inherit current context, summarize current context using `/compact`-style semantics, or clear context and start fresh. Existing `/compact` behavior clears conversation history while keeping a summary in context.
- evidence_used:
  - user confirmation
  - `src/commands/compact/index.ts`
  - `src/commands/compact/compact.ts`
- open_question_delta: Q-012 resolved. Added Q-013 about whether inherit/summarize should start Workflows in the current session or in a linked new workflow session carrying the chosen context.
- semantic_checkpoint_required: yes

## Event 2026-05-26T15:15:39.4267077+08:00

- kind: semantic-checkpoint
- user_input_summary: User accepted the recommendation that inherited or summarized context should start a linked new workflow session rather than mutate the current normal chat.
- classifier: product_intent
- agent_conclusion: For non-empty normal chats, `+ > Workflows` should ask how to handle context, then create a linked workflow session carrying inherited/summarized context or starting fresh. The original normal chat remains unchanged.
- evidence_used:
  - user confirmation
- open_question_delta: Q-013 resolved.
- semantic_checkpoint_required: yes

## Event 2026-05-26T15:26:25.0529811+08:00

- kind: handoff-checkpoint
- user_input_summary: User asked to look at the next step.
- classifier: handoff_request
- agent_conclusion: Handoff assessment concluded the feature is ready for a unified draft handoff. Draft Markdown and JSON handoff pair were written and self-reviewed; user confirmation is still required before marking handoff-ready.
- evidence_used:
  - `.specify/discussions/workflow-template-management/handoff-assessment.md`
  - `.specify/discussions/workflow-template-management/handoff-to-specify.md`
  - `.specify/discussions/workflow-template-management/handoff-to-specify.json`
- open_question_delta: No hard unknowns remain. Soft unknowns are deferred to downstream specification/planning.
- semantic_checkpoint_required: yes

## Event 2026-05-26T15:36:00.2880210+08:00

- kind: ordinary-turn
- user_input_summary: User asked for a full walkthrough of what this version does before confirming the draft handoff.
- classifier: continuation_or_resume
- agent_conclusion: Provide a concise product-scope walkthrough from the current draft handoff; do not change handoff readiness yet.
- evidence_used:
  - `.specify/discussions/workflow-template-management/handoff-to-specify.md`
  - `.specify/discussions/workflow-template-management/requirements.md`
- open_question_delta: No change.
- semantic_checkpoint_required: no

## Event 2026-05-26T15:38:04.5270349+08:00

- kind: handoff-confirmation
- user_input_summary: User confirmed the reviewed version with "可以".
- classifier: handoff_request
- agent_conclusion: Marked the handoff package as user-confirmed and handoff-ready.
- evidence_used:
  - user confirmation
  - `.specify/discussions/workflow-template-management/handoff-to-specify.md`
  - `.specify/discussions/workflow-template-management/handoff-to-specify.json`
- open_question_delta: No hard unknowns remain.
- semantic_checkpoint_required: yes
