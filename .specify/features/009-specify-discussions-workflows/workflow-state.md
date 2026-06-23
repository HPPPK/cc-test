# Workflow State: Workflow Phase Execution Contracts

## Current Command

- active_command: sp-tasks
- status: complete

## Phase Mode

- phase_mode: task-generation-only
- summary: Converted the completed workflow phase execution contract plan package into dependency-aware tasks, guardrails, task packets, and implementation handoff metadata. No source code, tests, runtime behavior, dependencies, generated output, or repository configuration were edited.

## Stage State

- current_stage: task-generation-complete
- current_domain: integration
- next_action: Run `/sp.implement` using `tasks.md`, `handoff-to-tasks.json`, `task-index.json`, and `task-packets/*.json`.
- blocker_reason: None
- final_handoff_decision: /sp.implement

## Review State

- last_user_reviewed_artifact_state: approved
- source_files_read: discussion sources, spec package, project cognition status/query, passive learnings, and targeted live repository context read
- source_signal_disposition_status: complete

## Unknown Handling

- hard_unknown_count: 0
- soft_unknown_count: 3
- next_unknown_to_resolve: Implementation tasks must classify exact existing, missing, incomplete, and hardening work before code changes.

## Reopen Contract

- reopen_source: none
- reopen_target: none
- reopen_reason: None

## Analyze Gate

- gate_status: not-run
- gate_cycle: 0
- highest_invalid_stage: none
- blocker_bundle:
  - none
- blocker_attribution_values: none
- artifact_fingerprint_basis:
  - spec.md: canonical workflow phase execution contract draft
  - context.md: live-read-backed implementation context and consequence analysis
  - plan.md: implementation plan generated for workflow phase execution contracts
  - tasks.md: generated dependency-aware implementation task package with 18 tasks

## Handoff Files

- handoff_to_specify: .specify/discussions/workflows/handoff-to-specify.md
- handoff_to_plan: .specify/features/009-specify-discussions-workflows/brainstorming/handoff-to-specify.json
- handoff_to_tasks: .specify/features/009-specify-discussions-workflows/handoff-to-tasks.json
- handoff_to_implement: .specify/features/009-specify-discussions-workflows/handoff-to-tasks.json

## Allowed Artifact Writes

- .specify/features/009-specify-discussions-workflows/tasks.md
- .specify/features/009-specify-discussions-workflows/handoff-to-tasks.json
- .specify/features/009-specify-discussions-workflows/task-index.json
- .specify/features/009-specify-discussions-workflows/task-packets/*.json
- .specify/features/009-specify-discussions-workflows/task-generation/handoffs/*.json
- .specify/features/009-specify-discussions-workflows/task-generation/evidence-index.json
- .specify/features/009-specify-discussions-workflows/task-generation/checkpoints.ndjson
- .specify/features/009-specify-discussions-workflows/workflow-state.md

## Forbidden Actions

- Do not edit source code.
- Do not edit tests.
- Do not implement behavior.
- Do not change dependencies.
- Do not start execution from task-generation artifacts.
- Do not treat task generation as permission to mutate runtime, server, desktop, SkillTool, or API behavior.

## Authoritative Files

- .specify/features/009-specify-discussions-workflows/spec.md
- .specify/features/009-specify-discussions-workflows/alignment.md
- .specify/features/009-specify-discussions-workflows/context.md
- .specify/features/009-specify-discussions-workflows/references.md
- .specify/features/009-specify-discussions-workflows/plan.md
- .specify/features/009-specify-discussions-workflows/research.md
- .specify/features/009-specify-discussions-workflows/data-model.md
- .specify/features/009-specify-discussions-workflows/quickstart.md
- .specify/features/009-specify-discussions-workflows/contracts/
- .specify/features/009-specify-discussions-workflows/plan-contract.json
- .specify/features/009-specify-discussions-workflows/tasks.md
- .specify/features/009-specify-discussions-workflows/handoff-to-tasks.json
- .specify/features/009-specify-discussions-workflows/task-index.json
- .specify/features/009-specify-discussions-workflows/task-packets/*.json
- .specify/features/009-specify-discussions-workflows/brainstorming/handoff-to-specify.json
- .specify/memory/constitution.md
- .specify/memory/project-rules.md
- .specify/memory/learnings/INDEX.md
- Project cognition query result: readiness `review`, recommended action `review_project_cognition_update`, selected `SkillTool - Skill Invocation` plus broad coverage-gap node; product workflow runtime/editor surfaces require live reads.
- Live repository reads:
  - src/server/services/workflowTypes.ts
  - src/server/services/workflowTemplateValidation.ts
  - src/server/services/workflowRuntimeService.ts
  - src/server/services/workflowToolPolicy.ts
  - src/server/services/workflowTemplateRegistryService.ts
  - src/server/services/workflowSessionCreateService.ts
  - src/server/services/workflowPhaseSkillResolver.ts
  - src/server/api/workflowTemplates.ts
  - src/server/api/skills.ts
  - src/skills/loadSkillsDir.ts
  - src/tools/SkillTool/SkillTool.ts
  - src/tools/SkillTool/prompt.ts
  - desktop/src/types/skill.ts
  - desktop/src/types/session.ts
  - desktop/src/api/skills.ts
  - desktop/src/stores/skillStore.ts
  - desktop/src/components/workflow/WorkflowTemplateEditor.tsx
  - desktop/src/components/workflow/WorkflowImportExportDialog.tsx
  - desktop/src/components/workflow/WorkflowTemplatePicker.tsx
  - desktop/src/components/workflow/WorkflowStatusPanel.tsx
  - desktop/src/components/workflow/WorkflowTransitionControls.tsx
  - desktop/src/components/workflow/WorkflowComponents.test.tsx
  - desktop/src/pages/ActiveSession.tsx

## Scenario Profile Inputs

- active_profile: Standard Delivery
- source: sp-specify workflow-state and approved spec package
- required_sections: plan summary, locked decisions, must-preserve carry-forward, implementation target boundary, technical context, implementation constitution, operational consequence design, dispatch compilation hints, alignment inputs, research inputs, constitution check, project structure, risk tracking
- activated_gates: project cognition advisory, senior consequence analysis, capability preservation planning, constitution check, same-area test planning, persistence compatibility guard
- task_shaping_rules: classify each requirement as existing baseline, missing, incomplete, or hardening; preserve MP and CA IDs; generate same-area server and desktop test tasks; avoid source mutation until `/sp.tasks` and `/sp.implement`
- required_evidence: live code references, same-area tests, old-template fixtures, `bun run check:server`, `bun run check:desktop`, and `bun run verify`
- transition_policy: planning may hand off only to `/sp.tasks` after generated artifacts are self-reviewed and `workflow-state.md` records completion

## Adaptive Dispatch Decision

- execution_model: adaptive
- execution_mode: standard
- workflow_status: ready
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- capability_degraded: true
- blocked_reason: none
- delegated_planning_lanes: none
- dispatch_rationale: The feature is cross-boundary planning work, but native subagent spawning is not available under the current tool policy without explicit user authorization. The work remains design-only and can continue leader-inline with targeted live evidence.

## Generated Planning Artifacts

- .specify/features/009-specify-discussions-workflows/plan.md
- .specify/features/009-specify-discussions-workflows/research.md
- .specify/features/009-specify-discussions-workflows/data-model.md
- .specify/features/009-specify-discussions-workflows/contracts/workflow-phase-contract.md
- .specify/features/009-specify-discussions-workflows/contracts/workflow-skill-dependency-manifest.md
- .specify/features/009-specify-discussions-workflows/contracts/workflow-transition-submission.md
- .specify/features/009-specify-discussions-workflows/quickstart.md
- .specify/features/009-specify-discussions-workflows/plan-contract.json

## Generated Task Artifacts

- .specify/features/009-specify-discussions-workflows/tasks.md
- .specify/features/009-specify-discussions-workflows/handoff-to-tasks.json
- .specify/features/009-specify-discussions-workflows/task-index.json
- .specify/features/009-specify-discussions-workflows/task-packets/T001.json through T018.json
- .specify/features/009-specify-discussions-workflows/task-generation/evidence-index.json
- .specify/features/009-specify-discussions-workflows/task-generation/checkpoints.ndjson

## Planning Verification

- plan_contract_json_parse: passed
- placeholder_scan: passed
- agent_context_update: ran `.specify/scripts/powershell/update-agent-context.ps1 -AgentType codex`; no `AGENTS.md` diff remained after the script
- learning_capture: `specify learning capture-auto --command plan` returned `no-op`
- source_or_test_edits: none from `sp-plan`
- delegated_planning_lanes: none

## Task Generation Verification

- tasks_md_generated: passed
- handoff_to_tasks_json_parse: passed
- task_index_json_parse: passed
- task_packet_json_parse: passed for 18/18 packets
- task_id_packet_count_match: passed, 18 checklist tasks and 18 task packets
- dependency_reference_check: passed
- parallel_write_set_conflict_check: passed for batch-a and batch-b
- placeholder_scan: passed
- learning_capture: `specify learning capture-auto --command tasks` returned `no-op`
- source_or_test_edits: none from `sp-tasks`
- delegated_task_generation_lanes: none; capability_degraded recorded because subagent spawning requires explicit user authorization

## Capability Split

- Capability 1: Phase contract field model with grouped `intent`, `contract`, and `evidencePolicy` semantics while preserving existing flat field compatibility.
- Capability 2: Constraint strength semantics that distinguish guidance, policy, evidence, and gate behavior.
- Capability 3: Recommended phase skill bindings to existing skills, including soft audit and permission-preserving SkillTool semantics.
- Capability 4: Dependency-aware workflow package sharing with template export/import diagnostics and no default skill content bundling.
- Capability 5: Lifecycle and completion submission model with recoverable blocked/unable outcomes, pending confirmation, stateVersion protection, and transition history.
- Capability 6: Runtime and editor UI behavior for grouped authoring, dependency diagnostics, status, recommended skill evidence, and safe controls.
- Capability 7: Compatibility and validation coverage, including old templates, unknown-field preservation, session snapshots, and regression tests.

## Planning Advisory

- Project cognition remains useful for route selection but cannot prove completion. Plan and downstream tasks must use live code, tests, scripts, configuration, or authoritative docs as evidence.
- Existing workflow behavior covers parts of the contract; downstream task generation must avoid greenfield rewrite language and must separate confirmation of existing behavior from missing or hardening work.
- Passive learnings to preserve: pending confirmation must outrank stale running lifecycle state in UI controls; workflow authoring skill creation must stay catalog-visible; linked workflow source checks can drift across desktop/server boundaries; desktop export UX needs a proven write path or explicit fallback.

## Exit Criteria

- met: `tasks.md` is generated with guardrail index, MP/CA mapping, four user-story phases, dependencies, parallel batches, enriched task contracts, and readiness audit.
- met: `handoff-to-tasks.json` records `/sp.implement` route, task count, dispatch decision, join points, guardrails, verification gates, and scope limits.
- met: `task-index.json` records all 18 task IDs, packets, dependencies, write scopes, guardrails, parallel batches, and join points.
- met: `task-packets/T001.json` through `T018.json` parse as JSON and include agent, dependency, scope, output, anti-goal, acceptance, verification, handoff, retry, and escalation fields.
- met: Task IDs, packet files, dependency references, placeholder scan, and parallel write-set checks passed.
- met: No source code, tests, dependency files, runtime configuration, or generated build output were modified by `sp-tasks`.

## Next Command

- `/sp.implement`
