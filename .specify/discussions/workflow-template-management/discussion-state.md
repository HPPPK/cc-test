# Discussion State: Workflow Template Management

## Current Command

- active_command: sp-discussion
- state_surface: discussion-state
- status: handoff-ready
- slug: workflow-template-management
- updated_at: 2026-05-26T15:38:04.5270349+08:00

## Phase Mode

- phase_mode: discussion-only
- summary: User wants a user-facing `Workflows` surface covering workflow template management plus chat-page workflow entry. The core abstraction is a staged workflow contract. Chat entry is through the composer `+` menu: choose `Workflows`, open a template-selection dialog, and for non-empty chats ask whether to inherit current context, summarize current context using `/compact`-style semantics, or clear context. Inherit/summarize should create a linked new workflow session carrying the chosen context rather than mutate the original chat in place.

## Session Routing

- current_stage: handoff-ready
- current_topic: Draft handoff review
- next_question: none
- blocker_reason: none
- readiness_note: Draft handoff package passed self-review and was user-confirmed. It is ready for downstream specification.
- ui_discussion_status: accepted

## Lightweight Recovery

- latest_event_checkpoint: 2026-05-26T15:26:25.0529811+08:00
- last_compaction_checkpoint: none
- compact_summary_status: current
- ordinary_turn_write_policy: append compact event only
- structured_refresh_policy: semantic-checkpoint-only

## Context Boundary

- context_boundary_status: locked
- current_project_root: F:\github\cc-jiangxia
- current_project_roles:
  - role: implementation-target
    scope: Desktop Settings UI, server workflow template registry/API, desktop session creation flow
    evidence_source: user request plus live repository reads
    notes: The requested settings page lives in the active repository.
- target_project_root: F:\github\cc-jiangxia
- target_project_roles:
  - role: implementation-target
    scope: Add or adjust desktop UI/API behavior for workflow template management
    evidence_source: user request plus live repository reads
    notes: No cross-project transfer requested.
- reference_sources:
  - active repository live files
- external_systems: []
- boundary_blockers: []
- path_status: target-read-confirmed
- boundary_confidence: high

## Evidence Navigation

- latest_cognition_intent: discussion
- latest_cognition_readiness: query_ready
- latest_minimal_live_reads:
  - desktop/src/pages/Settings.tsx
  - desktop/src/pages/EmptySession.tsx
  - desktop/src/components/workflow/WorkflowTemplatePicker.tsx
  - desktop/src/api/sessions.ts
  - desktop/src/types/session.ts
  - src/server/services/workflowTemplateRegistryService.ts
  - src/server/api/sessions.ts
  - src/server/services/workflowTypes.ts
  - desktop/src/components/chat/ChatInput.tsx
  - desktop/src/pages/ActiveSession.tsx
  - desktop/src/stores/chatStore.ts
  - src/server/api/sessions.ts
- latest_live_evidence:
  - desktop/src/pages/Settings.tsx currently defines Settings tabs and content routing.
  - desktop/src/stores/uiStore.ts currently defines the SettingsTab union.
  - desktop/src/pages/EmptySession.tsx currently loads workflow templates and passes them to WorkflowTemplatePicker for session creation.
  - desktop/src/components/workflow/WorkflowTemplatePicker.tsx currently renders startable templates and invalid template issues.
  - desktop/src/api/sessions.ts currently exposes listWorkflowTemplates() against `/api/workflows/templates`.
  - src/server/api/sessions.ts currently handles GET-only workflow template listing.
  - src/server/services/workflowTemplateRegistryService.ts currently reads and writes user workflow templates under cc-jiangxia-owned `workflows.json`, preserves unknown fields, rejects builtin id shadowing, and keeps builtin templates startable when user config is invalid.
  - src/server/services/workflowRuntimeService.ts currently assembles workflow phase context from phase instructions, structured phasePrompt, action policy, required artifacts, completion criteria, skill guidance, and model selection.
  - desktop/src/components/chat/ChatInput.tsx currently loads workflow templates for the hero composer launch controls and sends selected workflow template info when creating a session.
  - desktop/src/pages/ActiveSession.tsx currently shows workflow status, transition controls, and report links only when the session already has workflow metadata.
  - src/server/api/sessions.ts currently creates workflow metadata only during session creation when the POST body includes `workflow`.
  - src/commands/compact/index.ts defines `/compact` as clearing conversation history while keeping a summary in context, with optional summarization instructions.
  - src/commands/compact/compact.ts routes `/compact` through session-memory, reactive, or traditional compaction paths and returns a compaction result.
- cognition_authority_rule: project cognition navigates; live repository evidence proves
- unresolved_evidence_conflicts: []

## Session Selection

- incomplete_statuses: active, blocked, handoff-ready
- resume_rule: resume only when exactly one incomplete discussion is available or the user selected a slug
- collision_rule: append date or short numeric suffix when a generated slug already exists

## Handoff Assessment

- handoff_assessment_status: ready-for-specify
- handoff_assessment_path: .specify/discussions/workflow-template-management/handoff-assessment.md
- handoff_assessment_decided_at: 2026-05-26T15:20:33.5855977+08:00
- handoff_scope_shape: unified

## Handoff Review

- handoff_review_status: user-confirmed
- handoff_user_confirmed_at: 2026-05-26T15:38:04.5270349+08:00
- handoff_blocker_reason: none
- handoff_quality_gate: draft

## Allowed Artifact Writes

- discussion-state.md
- discussion-log.md
- requirements.md
- technical-options.md
- project-context.md
- open-questions.md
- handoff-assessment.md only after explicit user request
- handoff-to-specify.md draft after explicit user request and boundary lock; mark handoff-ready only after self-review pass and user confirmation
- handoff-to-specify.json draft after explicit user request and boundary lock; mark handoff-ready only after self-review pass and user confirmation

## Forbidden Actions

- create feature branch
- create feature directory
- write spec.md
- write plan.md
- write tasks.md
- edit source code
- edit tests
- run implementation-oriented fix loops
- automatically invoke sp-specify
- infer handoff readiness without explicit user instruction
- add, recommend, or route to sp-split
- write separate split planning artifacts
- write candidate-specific handoff Markdown or JSON
- write pointer-only handoff-to-specify.md or handoff-to-specify.json
- use current project cognition to prove another project's implementation facts

## Authoritative Files

- discussion-state.md
- discussion-log.md
- requirements.md
- technical-options.md
- project-context.md
- open-questions.md
- handoff-assessment.md when present
- handoff-to-specify.md when draft or user-confirmed, according to handoff_review_status
- handoff-to-specify.json when draft or user-confirmed, according to handoff_review_status

## Senior Consequence Analysis

- consequence_gate_status: triggered
- trigger_reason: Managing workflow templates can affect template persistence, workflow session creation, existing startable templates, invalid-template diagnostics, user-owned config preservation, and downstream workflow session compatibility.
- stand_down_reason: none
- active_consequence_obligations:
  - CA-001
  - CA-002
  - CA-003
  - CA-004
  - CA-005
  - CA-006
- latest_consequence_handoff: none
- coverage_gap_count: 1

## Handoff

- handoff_to_specify: .specify/discussions/workflow-template-management/handoff-to-specify.md
- handoff_to_specify_json: .specify/discussions/workflow-template-management/handoff-to-specify.json
- handoff_goal: Specify a unified Workflows feature that adds Settings workflow template management and Chat composer workflow entry in the current project.
- quality_gate_status: user-confirmed
- handoff_requested_by_user: true
- next_command: none
