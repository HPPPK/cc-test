# Workflow State: Agent Workflow Authoring Tools

## Current Command

- active_command: sp-tasks
- status: handoff-ready

## Phase Mode

- phase_mode: task-generation-only
- summary: Decompose the approved plan package into implementation-ready tasks, task packets, guardrails, dependencies, parallel batches, and join points. This workflow writes task artifacts only and does not implement source/test behavior.

## Stage State

- current_stage: tasks-self-reviewed
- current_domain: integration
- next_action: Run `/sp.implement` to execute the generated task package.
- blocker_reason: None
- final_handoff_decision: /sp.implement

## Review State

- last_user_reviewed_artifact_state: approved-for-plan-by-user-invoked-sp-plan
- source_files_read: discussion handoff/source files, project memory, project cognition planning query, and targeted live reads for workflow tool registry, template registry/API, runtime policy, desktop env/API/types, Settings Workflows UI, editor, server API tests, registry tests, phase-policy tests, and existing workflow tool tests
- source_signal_disposition_status: complete

## Unknown Handling

- hard_unknown_count: 0
- soft_unknown_count: 0
- next_unknown_to_resolve: none
- resolved_soft_unknowns:
  - MP-021 desktop runtime path: use local desktop/server authoring endpoint when `CC_JIANGXIA_DESKTOP_SERVER_URL` is configured; no silent fallback to direct file writes on endpoint failure.
  - MP-022 field guide source: use a colocated static guide with validation-alignment drift tests for the first implementation.

## Reopen Contract

- reopen_source: sp-discussion
- reopen_target: sp-discussion or sp-specify
- reopen_reason: Reopen only if implementation requires mandatory preview-only persistence, direct builtin mutation/deletion/shadowing, writes outside workflow template config, active session snapshot mutation, global authoring writes that bypass phase policy, untestable field guide drift, or unsupported non-linear workflow shapes.

## Analyze Gate

- gate_status: not-run
- gate_cycle: 0
- highest_invalid_stage: none
- blocker_bundle: []
- blocker_attribution_values: none
- artifact_fingerprint_basis:
  - spec.md: written and user-confirmed for planning
  - context.md: written and user-confirmed for planning
  - plan.md: written and self-reviewed
  - research.md: written and self-reviewed
  - data-model.md: written and self-reviewed
  - contracts/: written and self-reviewed
  - quickstart.md: written and self-reviewed
  - plan-contract.json: written and JSON-parse checked
  - tasks.md: written and self-reviewed
  - handoff-to-tasks.json: written and JSON-parse checked
  - task-index.json: written and JSON-parse checked
  - task-packets/: 16 packets written and JSON-parse checked

## Artifact Self-Review

- self_review_status: passed
- reviewed_artifacts:
  - .specify/features/006-agent-workflow-authoring-tools/plan.md
  - .specify/features/006-agent-workflow-authoring-tools/research.md
  - .specify/features/006-agent-workflow-authoring-tools/data-model.md
  - .specify/features/006-agent-workflow-authoring-tools/contracts/workflow-authoring-tool.md
  - .specify/features/006-agent-workflow-authoring-tools/contracts/workflow-authoring-api.md
  - .specify/features/006-agent-workflow-authoring-tools/quickstart.md
  - .specify/features/006-agent-workflow-authoring-tools/plan-contract.json
  - .specify/features/006-agent-workflow-authoring-tools/brainstorming/handoff-to-specify.json
  - .specify/features/006-agent-workflow-authoring-tools/workflow-state.md
- checks:
  - `plan-contract.json` parses as JSON and reports `status: ready-for-tasks`, `route: sp-plan`, `handoff_to_tasks_ready: true`, and `recommended_next_command: /sp.tasks`.
  - Feature handoff JSON parses and includes `handoff_goal`, `context_boundary`, `planning_gate_status: ready`, `quality_gate.user_confirmed: true`, `hard_unknown_count: 0`, and `open_conflict_count: 0`.
  - Required plan artifacts are present: `plan.md`, `research.md`, `data-model.md`, `contracts/workflow-authoring-tool.md`, `contracts/workflow-authoring-api.md`, `quickstart.md`, and `plan-contract.json`.
  - Placeholder scan passed for formal plan output set.
  - MP-001 through MP-022 coverage scan passed in `plan.md`.
  - CA-001 through CA-011 coverage scan passed in `plan.md`.
  - `.specify/extensions.yml` is absent; no before-plan or after-plan extension hook is registered.
  - `.specify/scripts/powershell/update-agent-context.ps1 -AgentType codex` completed successfully; `git diff -- AGENTS.md` showed no tracked AGENTS.md content diff after the script run.
- residual_risks:
  - Exact implementation route may choose to extend existing workflow template API endpoints instead of adding `/api/workflows/templates/authoring`, but it must preserve the single-operation authoring contract and desktop server cache requirement.
  - Project cognition is advisory. Actual source/runtime changes in later implementation may require `/sp-map-update`.
  - Desktop frontend source remains optional; if implementation touches `desktop/src/**`, same-area desktop tests and `bun run check:desktop` become required.

## Plan Entry State

- user_review_confirmation: confirmed_by_user_invoked_sp-plan
- user_review_confirmed_at: 2026-05-27T16:24:21.6018805+08:00
- execution_model: adaptive
- execution_mode: standard
- workflow_status: ready
- dispatch_shape: parallel-subagents
- execution_surface: native-subagents
- capability_degraded: false
- blocked_reason: none
- delegated_task_generation_lanes:
  - story-phase-decomposition
  - dependency-graph-analysis
  - write-set-parallel-safety
- dispatch_reason: Standard task-generation workload with isolated story, dependency, and write-set lanes. Native subagents wrote structured handoffs that were consumed before final synthesis.

## Handoff Files

- handoff_to_specify: .specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.md
- handoff_to_plan: .specify/features/006-agent-workflow-authoring-tools/brainstorming/handoff-to-specify.json
- handoff_to_tasks: .specify/features/006-agent-workflow-authoring-tools/plan-contract.json
- handoff_to_implement: .specify/features/006-agent-workflow-authoring-tools/handoff-to-tasks.json

## Allowed Artifact Writes

- .specify/features/006-agent-workflow-authoring-tools/spec.md
- .specify/features/006-agent-workflow-authoring-tools/alignment.md
- .specify/features/006-agent-workflow-authoring-tools/context.md
- .specify/features/006-agent-workflow-authoring-tools/references.md
- .specify/features/006-agent-workflow-authoring-tools/workflow-state.md
- .specify/features/006-agent-workflow-authoring-tools/checklists/requirements.md
- .specify/features/006-agent-workflow-authoring-tools/brainstorming/handoff-to-specify.json
- .specify/features/006-agent-workflow-authoring-tools/plan.md
- .specify/features/006-agent-workflow-authoring-tools/research.md
- .specify/features/006-agent-workflow-authoring-tools/data-model.md
- .specify/features/006-agent-workflow-authoring-tools/contracts/
- .specify/features/006-agent-workflow-authoring-tools/quickstart.md
- .specify/features/006-agent-workflow-authoring-tools/plan-contract.json
- .specify/features/006-agent-workflow-authoring-tools/tasks.md
- .specify/features/006-agent-workflow-authoring-tools/handoff-to-tasks.json
- .specify/features/006-agent-workflow-authoring-tools/task-index.json
- .specify/features/006-agent-workflow-authoring-tools/task-packets/
- .specify/features/006-agent-workflow-authoring-tools/task-generation/handoffs/
- .specify/features/006-agent-workflow-authoring-tools/task-generation/evidence-index.json
- .specify/features/006-agent-workflow-authoring-tools/task-generation/checkpoints.ndjson
- .specify/features/006-agent-workflow-authoring-tools/tasks.md
- .specify/features/006-agent-workflow-authoring-tools/handoff-to-tasks.json
- .specify/features/006-agent-workflow-authoring-tools/task-index.json
- .specify/features/006-agent-workflow-authoring-tools/task-packets/
- .specify/features/006-agent-workflow-authoring-tools/task-generation/handoffs/
- .specify/features/006-agent-workflow-authoring-tools/task-generation/evidence-index.json
- .specify/features/006-agent-workflow-authoring-tools/task-generation/checkpoints.ndjson

## Forbidden Actions

- edit source code
- edit tests
- create implementation files
- run implementation-oriented fix loops
- start task generation before `/sp.tasks`
- mutate project cognition as a side effect of artifact-only planning work
- revert unrelated dirty worktree changes

## Authoritative Files

- .specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.md
- .specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.json
- .specify/discussions/agent-workflow-authoring-tools/discussion-log.md
- .specify/discussions/agent-workflow-authoring-tools/requirements.md
- .specify/discussions/agent-workflow-authoring-tools/open-questions.md
- .specify/discussions/agent-workflow-authoring-tools/technical-options.md
- .specify/discussions/agent-workflow-authoring-tools/project-context.md
- .specify/features/006-agent-workflow-authoring-tools/spec.md
- .specify/features/006-agent-workflow-authoring-tools/alignment.md
- .specify/features/006-agent-workflow-authoring-tools/context.md
- .specify/features/006-agent-workflow-authoring-tools/references.md
- .specify/features/006-agent-workflow-authoring-tools/brainstorming/handoff-to-specify.json
- .specify/features/006-agent-workflow-authoring-tools/plan.md
- .specify/features/006-agent-workflow-authoring-tools/research.md
- .specify/features/006-agent-workflow-authoring-tools/data-model.md
- .specify/features/006-agent-workflow-authoring-tools/contracts/workflow-authoring-tool.md
- .specify/features/006-agent-workflow-authoring-tools/contracts/workflow-authoring-api.md
- .specify/features/006-agent-workflow-authoring-tools/quickstart.md
- .specify/features/006-agent-workflow-authoring-tools/plan-contract.json

## Exit Criteria

- Task package generated and self-reviewed.
- `tasks.md`, `handoff-to-tasks.json`, `task-index.json`, 16 `task-packets/*.json`, and task-generation evidence written.
- JSON artifacts parse successfully.
- Checklist rows follow required `- [ ] T### [P?] [US?] Description with file path` format.
- No implementation/source/test edits performed by this workflow.

## Next Command

- /sp.implement
