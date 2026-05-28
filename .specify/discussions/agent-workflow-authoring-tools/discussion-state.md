# Discussion State: Agent Workflow Authoring Tools

## Current Command

- active_command: sp-discussion
- state_surface: discussion-state
- status: handoff-ready
- slug: agent-workflow-authoring-tools
- updated_at: 2026-05-27T14:38:41.6559401+08:00

## Phase Mode

- phase_mode: discussion-only
- summary: User wants an internal agent tool surface that lets the agent create, add, edit, modify, optimize, and delete workflow templates through conversation. This is a follow-on capability to the already implemented manual Workflows management surface. The confirmed product shape is direct conversational authoring: the tool is globally available in normal chat, the user can describe a new workflow with phases or critique an existing workflow, the agent can retrieve explicit workflow field guidance, fills the workflow template fields, validates, writes the user workflow template immediately when valid, and Settings Workflows reflects the update without a separate preview step. Builtin templates such as `agent-development` remain read-only; modifying them means creating an editable user-owned copy and applying changes to that copy. Builtin copy IDs default to `<builtin-id>-custom`, with `-2`, `-3`, etc. on conflicts; default names use `<Builtin Name> Custom` unless the user supplied a specific purpose/name. Delete is in first scope only for uniquely identified user templates and must be treated as destructive. Update/delete must re-read before write and reject stale changes when the current template differs from the agent's basis; create only needs current ID conflict checks.

## Session Routing

- current_stage: handoff-user-review
- current_topic: Agent-managed workflow template authoring
- next_question: none
- blocker_reason: none
- readiness_note: User confirmed the self-reviewed handoff pair. Discussion is handoff-ready for later `sp-specify` input; `sp-specify` was not run automatically.
- ui_discussion_status: not_applicable

## Lightweight Recovery

- latest_event_checkpoint: 2026-05-27T14:38:41.6559401+08:00
- last_compaction_checkpoint: none
- compact_summary_status: current
- ordinary_turn_write_policy: append compact event only
- structured_refresh_policy: semantic-checkpoint-only

## Context Boundary

- context_boundary_status: locked
- current_project_root: F:\github\cc-jiangxia
- current_project_roles:
  - role: implementation-target
    scope: Built-in agent tools, workflow template registry/API, workflow template persistence, and desktop workflow management surfaces.
    evidence_source: user request plus live repository reads.
    notes: The user is extending the current repository's Workflows feature, not transferring behavior to another project.
- target_project_root: F:\github\cc-jiangxia
- target_project_roles:
  - role: implementation-target
    scope: Add an internal tool capability so agents can author and mutate workflow templates.
    evidence_source: user request plus live repository reads.
    notes: No cross-project reference or external target was requested.
- reference_sources:
  - .specify/discussions/workflow-template-management/
  - active repository live files
- external_systems: []
- boundary_blockers: []
- path_status: target-read-confirmed
- boundary_confidence: high

## Evidence Navigation

- latest_cognition_intent: discussion
- latest_cognition_readiness: blocked
- latest_minimal_live_reads:
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
- latest_live_evidence:
  - src/tools.ts assembles built-in tools and separately adds workflow-scoped tools. The only current workflow-scoped tool is SubmitPhaseCompletionTool.
  - src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.tsx is scoped to active workflow sessions and records phase completion, not template authoring.
  - src/server/api/workflowTemplates.ts exposes workflow template list/detail/validate/create/update/delete/duplicate/import/export endpoints.
  - src/server/services/workflowTemplateRegistryService.ts reads and writes user workflow templates under the cc-jiangxia workflows config, preserves unknown fields, blocks invalid existing config overwrites, rejects builtin id shadowing, and caches list results.
  - src/server/services/workflowTemplateRegistryService.ts also proves the core authoring field contract: template identity plus non-empty phases; each phase needs id/name/instructions, handoff intake/rules, output artifact, completion criteria, and transition authority.
  - src/server/services/workflowTypes.ts defines workflow template/session/state contracts and lifecycle/status values.
  - src/server/services/workflowToolPolicy.ts denies implementation tools in non-implementation phases and exposes only submit_phase_completion as a workflow-scoped tool today.
  - desktop/src/api/sessions.ts already wraps the workflow template API for manual UI operations.
  - desktop/src/components/workflow/WorkflowTemplateManager.tsx and WorkflowTemplateEditor.tsx provide manual template management and editing.
  - src/server/__tests__/workflowTemplates.test.ts covers current API validation, create/update/delete/duplicate/import/export, conflict behavior, and no-write validation expectations.
- cognition_authority_rule: project cognition navigates; live repository evidence proves
- unresolved_evidence_conflicts: []

## Session Selection

- incomplete_statuses: active, blocked, handoff-ready
- resume_rule: resume only when exactly one incomplete discussion is available or the user selected a slug
- collision_rule: append date or short numeric suffix when a generated slug already exists

## Handoff Assessment

- handoff_assessment_status: ready-for-specify
- handoff_assessment_path: .specify/discussions/agent-workflow-authoring-tools/handoff-assessment.md
- handoff_assessment_decided_at: 2026-05-27T12:53:44.0184349+08:00
- handoff_scope_shape: unified

## Handoff Review

- handoff_review_status: user-confirmed
- handoff_user_confirmed_at: 2026-05-27T14:38:41.6559401+08:00
- handoff_blocker_reason: none
- handoff_quality_gate: user-confirmed

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
- trigger_reason: Agent-authored workflow changes can mutate user workflow templates, alter future workflow execution semantics, affect active or resumed workflow sessions, interact with manual Settings edits, and change which tools/actions are allowed inside phases.
- stand_down_reason: none
- active_consequence_obligations:
  - CA-001
  - CA-002
  - CA-003
  - CA-004
  - CA-005
  - CA-006
  - CA-007
  - CA-008
  - CA-009
  - CA-010
  - CA-011
- latest_consequence_handoff: .specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.md
- coverage_gap_count: 0

## Handoff

- handoff_to_specify: .specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.md
- handoff_to_specify_json: .specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.json
- handoff_goal: Specify a globally available internal agent tool capability that lets the agent inspect, explain, validate, create, update, duplicate/copy, and delete workflow templates through conversation while preserving existing Workflows validation, persistence, field guidance, permission, and session-snapshot safety rules.
- quality_gate_status: user-confirmed
- handoff_requested_by_user: true
- next_command: /sp.specify with .specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.md when the user explicitly requests it
