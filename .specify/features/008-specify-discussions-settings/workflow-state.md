# Workflow State: Settings Provider Import Export

## Current Command

- active_command: sp-tasks
- status: handoff-ready
- routed_by: user
- routed_command: /sp.tasks

## Phase Mode

- phase_mode: task-generation-only
- summary: Generate dependency-aware implementation tasks and task packets for Settings > Providers import/export. This pass writes task-generation artifacts only and does not edit source or tests.

## Stage State

- current_stage: tasks-self-reviewed
- current_domain: security
- next_action: Run `/sp.implement` to execute the generated task package.
- blocker_reason: None
- final_handoff_decision: /sp.implement

## Review State

- last_user_reviewed_artifact_state: approved
- source_files_read: plan package, project memory, targeted live repository files
- source_signal_disposition_status: complete
- artifact_self_review_status: passed

## Unknown Handling

- hard_unknown_count: 0
- soft_unknown_count: 1
- next_unknown_to_resolve: Raw-vs-masked provider API key behavior must be resolved by server-side export redaction tests and implementation design.

## Reopen Contract

- reopen_source: sp-tasks
- reopen_target: sp-plan or sp-specify
- reopen_reason: Reopen if tasks require default credential export, active/default selection transfer, automatic activation on import, silent overwrite, official OAuth migration, whole-app backup/restore, or frontend-only credential redaction.

## Analyze Gate

- gate_status: not-run
- gate_cycle: 0
- highest_invalid_stage: none
- blocker_bundle: []
- blocker_attribution_values: none
- artifact_fingerprint_basis:
  - spec.md: user-confirmed provider import/export spec with secret-safe defaults and import preview/commit requirements
  - context.md: repository context and consequence obligations recorded
  - plan.md: written; implementation approach, boundaries, consequence design, validation gates, and task handoff guidance recorded
  - tasks.md: written; 16 dependency-aware implementation tasks with guardrails, packets, join points, and validation gates recorded

## Handoff Files

- handoff_to_specify: .specify/discussions/settings-provider-import-export/handoff-to-specify.md
- handoff_to_plan: .specify/features/008-specify-discussions-settings/brainstorming/handoff-to-specify.json
- handoff_to_tasks: .specify/features/008-specify-discussions-settings/plan-contract.json
- handoff_to_implement: .specify/features/008-specify-discussions-settings/handoff-to-tasks.json

## Allowed Artifact Writes

- .specify/features/008-specify-discussions-settings/tasks.md
- .specify/features/008-specify-discussions-settings/handoff-to-tasks.json
- .specify/features/008-specify-discussions-settings/task-index.json
- .specify/features/008-specify-discussions-settings/task-packets/*.json
- .specify/features/008-specify-discussions-settings/task-generation/handoffs/*.json
- .specify/features/008-specify-discussions-settings/task-generation/evidence-index.json
- .specify/features/008-specify-discussions-settings/task-generation/checkpoints.ndjson
- .specify/features/008-specify-discussions-settings/workflow-state.md

## Forbidden Actions

- edit source code
- edit tests
- implement behavior
- start execution from task-generation artifacts
- mutate provider configuration
- run implementation-oriented fix loops
- invoke sp-implement automatically

## Authoritative Files

- .specify/features/008-specify-discussions-settings/spec.md
- .specify/features/008-specify-discussions-settings/alignment.md
- .specify/features/008-specify-discussions-settings/context.md
- .specify/features/008-specify-discussions-settings/references.md
- .specify/features/008-specify-discussions-settings/plan.md
- .specify/features/008-specify-discussions-settings/research.md
- .specify/features/008-specify-discussions-settings/data-model.md
- .specify/features/008-specify-discussions-settings/contracts/provider-import-export-api.md
- .specify/features/008-specify-discussions-settings/quickstart.md
- .specify/features/008-specify-discussions-settings/plan-contract.json
- .specify/features/008-specify-discussions-settings/brainstorming/handoff-to-specify.json
- .specify/memory/constitution.md
- .specify/memory/project-rules.md
- .specify/memory/learnings/INDEX.md

## Project Cognition

- status: blocked
- advisory_note: `project-cognition lexicon` failed because `.specify/project-cognition/project-cognition.db` is missing. This artifact-only task-generation pass may continue with live evidence and must carry the coverage gap into task artifacts.
- recommended_external_maintenance: run `$sp-map-scan`, then `$sp-map-build` when project cognition maintenance is requested separately.

## Adaptive Dispatch

- execution_model: adaptive
- execution_mode: standard
- workflow_status: ready
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- capability_degraded: true
- delegated_task_generation_lanes: none
- blocked_reason: none
- dispatch_reason: Task generation is cross-boundary and security-sensitive, but this pass is artifact-only. Native subagent tools are discoverable from the runtime, yet the active `spawn_agent` contract permits spawning only when the user explicitly asks for subagents/delegation/parallel agent work. The user invoked `$sp-tasks`, not subagent delegation, so task generation proceeds leader-inline with explicit high-risk review checkpoints in the task package.

## Task Generation Entry Gate

- prerequisites_script: passed
- available_docs: context.md, research.md, data-model.md, contracts/, quickstart.md
- plan_contract_status: ready-for-tasks
- hard_unknown_count: 0
- open_conflict_count: 0

## Task Artifacts

- tasks_md: .specify/features/008-specify-discussions-settings/tasks.md
- handoff_to_tasks: .specify/features/008-specify-discussions-settings/handoff-to-tasks.json
- task_index: .specify/features/008-specify-discussions-settings/task-index.json
- task_packets: .specify/features/008-specify-discussions-settings/task-packets/T001.json through T016.json
- evidence_index: .specify/features/008-specify-discussions-settings/task-generation/evidence-index.json
- checkpoints: .specify/features/008-specify-discussions-settings/task-generation/checkpoints.ndjson

## Task Generation Validation

- json_parse: passed for 19 JSON files and 2 NDJSON checkpoint rows
- checklist_rows: passed, 16 task rows found in tasks.md
- placeholder_scan: passed, no unresolved template placeholders found
- dependency_consistency: passed, task-index dependencies match task packet depends_on values
- parallel_batches: passed, 7 batches with no intra-batch task dependencies
- handoff_index_consistency: passed, parallel batch lists match between handoff-to-tasks.json and task-index.json
- delegated_lanes: none
- task_generation_hooks: none, .specify/extensions.yml was absent
- learning_capture: no-op, no high-signal auto-capture patterns matched
- source_or_test_edits_performed: none

## Next Command

- /sp.implement
