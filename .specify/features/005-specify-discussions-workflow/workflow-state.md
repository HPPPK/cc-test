# Workflow State: Workflow Template Management

## Current Command

- active_command: sp-implement
- status: completed

## Phase Mode

- phase_mode: implementation-complete
- summary: Implemented the approved Workflows feature package: Settings workflow template management, import/export, empty-chat workflow start, linked non-empty-chat workflow start, server-owned template APIs, non-mutating summary carryover helper, tests, and final PR verification evidence.

## Stage State

- current_stage: implementation-complete
- current_domain: integration
- next_action: Handoff complete implementation evidence; generated `artifacts/quality-runs/` and `artifacts/coverage/` are local evidence and must not be committed.
- blocker_reason: None
- final_handoff_decision: complete

## Review State

- last_user_reviewed_artifact_state: approved
- source_files_read: discussion source files read and repo context read
- source_signal_disposition_status: complete

## Unknown Handling

- hard_unknown_count: 0
- soft_unknown_count: 3
- next_unknown_to_resolve: raw JSON editing depth, invalid-warning shortcut, and linked-session API shape are planning design choices constrained by spec.

## Reopen Contract

- reopen_source: none
- reopen_target: none
- reopen_reason: none

## Implementation Evidence

- implement_tracker: .specify/features/005-specify-discussions-workflow/implement-tracker.md
- tasks_status: 24 total, 24 complete
- final_quality_report: artifacts/quality-runs/2026-05-26T14-54-27-595Z/report.md
- final_quality_summary: 9 passed, 0 failed, 2 skipped
- final_coverage_report: artifacts/coverage/2026-05-26T14-58-16-612Z/coverage-report.md
- changed_line_coverage: 91.89% (759/826), minimum 90%, no failures
- recovery_note: final native failure was caused by repo-owned `desktop/src-tauri/target/debug/claude-sidecar.exe` process PID 83644 locking a generated Tauri sidecar copy; after stopping that exact verified PID, `bun run check:native` and `bun run verify` passed.
- cognition_follow_up: project cognition marked stale after source/runtime changes; recommended next maintenance command is `$sp-map-update`.

## Analyze Gate

- gate_status: not-run
- gate_cycle: 0
- highest_invalid_stage: none
- blocker_bundle:
  - none
- blocker_attribution_values: none
- artifact_fingerprint_basis:
  - spec.md: written; unified Workflows spec with Settings management, staged workflow contract, Chat entry, MP mapping, and CA obligations
  - context.md: written; repository context, boundaries, affected objects, dependency impacts, and planning gaps recorded
  - plan.md: written; implementation boundaries, cognition evidence, adaptive dispatch result, constitution checks, operational consequence design, and verification gates recorded
  - research.md: written; design decisions, alternatives, and rationale recorded
  - data-model.md: written; template draft, validation, import/export, linked-session, and carryover models recorded
  - contracts/: written; template API and linked workflow session API contracts recorded
  - quickstart.md: written; validation scenarios and expected evidence recorded
  - plan-contract.json: written; machine-readable task handoff contract recorded
  - tasks.md: written; 24 dependency-aware tasks with enriched packet references and CA/MP mappings

## Handoff Files

- handoff_to_specify: .specify/discussions/workflow-template-management/handoff-to-specify.md
- handoff_to_plan: none
- handoff_to_tasks: .specify/features/005-specify-discussions-workflow/handoff-to-tasks.json
- handoff_to_implement: none

## Allowed Artifact Writes

- .specify/features/005-specify-discussions-workflow/workflow-state.md
- .specify/features/005-specify-discussions-workflow/tasks.md
- .specify/features/005-specify-discussions-workflow/handoff-to-tasks.json
- .specify/features/005-specify-discussions-workflow/task-index.json
- .specify/features/005-specify-discussions-workflow/task-packets/*.json
- .specify/features/005-specify-discussions-workflow/task-generation/handoffs/*.json
- .specify/features/005-specify-discussions-workflow/task-generation/evidence-index.json
- .specify/features/005-specify-discussions-workflow/task-generation/checkpoints.ndjson

## Forbidden Actions

- Edit source code, edit tests, implement behavior, or start execution from task-generation artifacts.
- Run implementation-oriented fix loops.
- Treat task generation as permission to mutate runtime/source surfaces.

## Authoritative Files

- .specify/discussions/workflow-template-management/handoff-to-specify.md
- .specify/discussions/workflow-template-management/handoff-to-specify.json
- .specify/discussions/workflow-template-management/discussion-log.md
- .specify/discussions/workflow-template-management/requirements.md
- .specify/discussions/workflow-template-management/open-questions.md
- .specify/discussions/workflow-template-management/technical-options.md
- .specify/discussions/workflow-template-management/project-context.md
- project cognition query for Workflows feature planning
- live reads of Settings, Chat composer, EmptySession, ActiveSession, sessions API/client/types, workflow registry/types/runtime, router, and compact command surfaces
- spec.md, alignment.md, context.md, plan.md, research.md, data-model.md, contracts, quickstart.md, plan-contract.json, tasks.md, handoff-to-tasks.json, task-index.json, task-packets/*.json, and task-generation/evidence-index.json once written

## Task Generation Evidence

- cognition_status: stale_after_implementation; map update recommended
- cognition_selection: selected term:workflows, term:workflow, term:template, term:management, term:chat, term:entry; rejected generic terms term:and, term:task, term:generation and workflow-command term:sp-tasks as non-implementation concepts
- cognition_minimal_live_reads: consumed path-level bundle covering workflow registry/types, sessions API/router/service, compact service, desktop Settings/Chat/EmptySession/ActiveSession/API/types/store/i18n, workflow components, and same-area tests
- adaptive_dispatch_execution_model: adaptive
- adaptive_dispatch_execution_mode: standard
- adaptive_dispatch_workflow_status: ready
- adaptive_dispatch_shape: parallel-subagents
- adaptive_dispatch_surface: native-subagents
- adaptive_dispatch_capability_degraded: false
- delegated_task_generation_lanes: story-phase-decomposition, dependency-graph-analysis, write-set-parallel-safety
- blocked_reason: none
- task_generation_mode: task-generation-only; no source or test edits
- task_generation_evidence_index: .specify/features/005-specify-discussions-workflow/task-generation/evidence-index.json
- task_generation_handoffs: .specify/features/005-specify-discussions-workflow/task-generation/handoffs/story-phase-decomposition.json, .specify/features/005-specify-discussions-workflow/task-generation/handoffs/dependency-graph-analysis.json, .specify/features/005-specify-discussions-workflow/task-generation/handoffs/write-set-parallel-safety.json
- task_generation_checkpoints: .specify/features/005-specify-discussions-workflow/task-generation/checkpoints.ndjson
- total_tasks: 24
- parallel_batches: 2 primary implementation batches recorded in tasks.md and handoff-to-tasks.json
- join_points: JP1-JP6 recorded in tasks.md, handoff-to-tasks.json, and task-generation/evidence-index.json
- implementation_readiness_self_audit: pass

## Task Generation Exit Criteria

- tasks.md contains ordered, independently executable tasks with enriched subagent contract fields: complete.
- CA-001 through CA-006 and MP-001 through MP-015 are mapped to tasks, guardrails, packet fields, validation, or stop-and-reopen conditions: complete.
- task-index.json, handoff-to-tasks.json, and per-task task-packets/*.json are written: complete.
- Delegated task-generation handoffs are persisted and consumed in task-generation/evidence-index.json: complete.
- workflow-state.md records next_command: /sp.implement after a clean self-audit: complete.

## Task Generation Validation

- JSON parse validation: passed for handoff-to-tasks.json, task-index.json, task-generation evidence/handoffs, and 24 task packet files.
- Checklist format validation: passed for 24 `- [ ] T###` rows.
- Delegated handoff consumption: passed; all accepted handoffs are integrated or consumed in task-generation/evidence-index.json.
- After-task extension hooks: none registered.
- Cognition follow-up: artifact-only task generation did not dirty project cognition. After source/runtime route, service, workflow API, or verification entry point changes, run $sp-map-update for changed paths.
- Reusable friction note: `project-cognition query --query-plan` accepts `selected_concepts` and `rejected_concepts` as string arrays in this runtime; structured concept objects caused a schema parse failure and were retried with the accepted shape.

## Plan Evidence

- cognition_status: fresh/query_ready
- cognition_coverage: path-level targeted live-read recommendations; query returned no subgraph nodes
- live_read_scope: workflow registry/types, sessions API/router/service, workflow session/runtime services, compact command/service, desktop sessions API/types/store/UI store, Settings, EmptySession, ActiveSession, ChatInput, WorkflowTemplatePicker, locale files, and existing same-area tests
- adaptive_dispatch_execution_model: adaptive
- adaptive_dispatch_execution_mode: standard
- adaptive_dispatch_shape: leader-inline
- adaptive_dispatch_capability_degraded: true
- delegated_planning_lanes: none
- blocked_reason: none
- agent_context_update: update-agent-context.ps1 -AgentType codex executed; AGENTS.md had no resulting diff
- map_dirty_status: marked-stale-after-implementation

## Next Command

- complete; recommended maintenance follow-up `$sp-map-update`
