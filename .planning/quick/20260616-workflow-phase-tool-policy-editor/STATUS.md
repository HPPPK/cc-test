---
id: 20260616
slug: workflow-phase-tool-policy-editor
title: Editable workflow phase tool policy
status: implemented
trigger: "$sp-quick 我觉得这个得开放出来啊 并且可以编辑，每个phase能用什么工具，应该是用户去决定的；包括workflow内置工具开放给agent的也要同步支持的"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: subagent-blocked
execution_surface: leader-inline
created: 2026-06-16T17:12:00+08:00
updated: 2026-06-16T18:25:00+08:00
---

## Current Focus

goal: Expose workflow phase runtime tool policy in the workflow template editor and allow users to edit which managed tools and workflow built-in tools each phase can use.
current_focus: Implemented and locally validated. Closeout artifacts written; project cognition refresh blocked by local DB schema mismatch.
next_action: Handoff with validation evidence and cognition blocker.

## Execution Intent

intent_outcome: User-authored workflow templates can define per-phase tool access, including managed runtime tools and workflow built-in tools exposed to agents, and workflow runtime applies that policy when starting or restarting an agent session.
intent_constraints:
  - Keep existing default behavior for templates that do not define a custom tool policy.
  - Keep the editable surface limited to known managed runtime tools first: Write, Edit, MultiEdit, NotebookEdit, Bash, PowerShell, Agent.
  - Also support workflow built-in tools exposed to agents, including submit_phase_completion and workflow_template_authoring where applicable.
  - Warn or guard when a phase disables submit_phase_completion because that can prevent normal workflow phase completion.
  - Do not let workflow editor changes silently bypass validation or persist unknown unsafe payload shapes.
  - Builtin or non-editable templates remain read-only in the existing editor model.
success_evidence:
  - Server policy tests prove custom per-phase tool policy overrides default phase-derived restrictions.
  - Server workflow scoped-tool tests prove workflow built-in tools are included/excluded from the agent tool surface by phase policy.
  - WebSocket launch tests prove custom policy changes CLI disallowedTools.
  - Desktop editor tests prove the settings UI can view and persist per-phase tool choices.
  - Relevant server and desktop checks pass.
cognition_facts:
  selected_capability: workflow phase runtime tool policy, workflow built-in tool exposure, and workflow template editor
  minimal_reads:
    - project-cognition lexicon attempted; blocked by project-cognition.db schema_version 1, expected 2
    - live code evidence from workflowToolPolicy, workflowTypes, workflowTemplateValidation, WorkflowTemplateEditor
  validation_route: focused server policy/WebSocket tests, desktop workflow editor tests, then check:server/check:desktop
  known_risk: changing tool permissions is a security-sensitive runtime behavior and must remain validated and reviewable

## Understanding Checkpoint

confirmed_problem: Workflow phase tool availability is currently hidden in runtime policy and cannot be edited per phase in Settings.
confirmed_outcome: Each workflow phase can expose an editable tool policy covering managed runtime tools and workflow built-in tools available to the agent.
confirmed_scope_boundary:
  - Keep first implementation to known managed tools and known workflow built-in tools.
  - Preserve existing defaults when templates do not define a tool policy.
  - Do not implement arbitrary MCP/plugin/native dynamic tool discovery in this quick task.
confirmed_execution_approach:
  - Add validated template schema fields, server runtime policy support, and desktop editor controls.
  - Start with RED tests before production changes.
confirmed_validation:
  - Focused server policy/WebSocket/scoped-tool tests.
  - Focused desktop workflow editor tests.
  - Run relevant server and desktop checks.

## Execution

active_lane: closeout
join_point: none
files_or_surfaces: server workflow tool policy, workflow scoped-tool exposure, workflow template validation/types, desktop workflow template editor, tests
blocked_dispatch: native subagent tools are discoverable, but tool contract restricts spawn_agent to explicit user requests for subagents; using leader-inline fallback for this confirmed quick task
blockers: project cognition closeout update and mark-dirty both blocked by local project-cognition.db schema_version 1 expected 2
recovery_action: None for implementation. Full PR readiness remains policy-blocked by broader dirty-worktree CLI-core/provider changes requiring maintainer flow.
retry_attempts: 0
blocker_reason:

## Validation

planned_checks:
  - bun test src/server/services/workflowToolPolicy.test.ts
  - bun test src/server/__tests__/websocket-handler.test.ts
  - desktop focused workflow editor tests
  - bun run check:server
  - bun run check:desktop
completed_checks:
  - command: bun test src/server/services/workflowToolPolicy.test.ts src/server/services/workflowTemplateRegistryService.test.ts src/server/__tests__/websocket-handler.test.ts src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts
    result: passed
    log: .planning/quick/20260616-workflow-phase-tool-policy-editor/server-focused.log
  - command: cd desktop; bun test src/components/workflow/WorkflowComponents.test.tsx -t "per-phase runtime"
    result: passed
    log: .planning/quick/20260616-workflow-phase-tool-policy-editor/desktop-tool-policy-only.log
  - command: bun run check:server
    result: passed
    log: .planning/quick/20260616-workflow-phase-tool-policy-editor/check-server.log
  - command: bun run check:desktop
    result: passed
    log: .planning/quick/20260616-workflow-phase-tool-policy-editor/check-desktop.log
  - command: bun run check:native
    result: passed after stopping exact repo sidecar PIDs 64536, 32172, 11908 that locked desktop/src-tauri/target/debug/claude-sidecar.exe
    log: .planning/quick/20260616-workflow-phase-tool-policy-editor/check-native.log
  - command: bun run verify
    result: all executed lanes passed on rerun, but process exited 1 because impact report is policy-blocked by broader dirty-worktree CLI-core/provider changes and live-provider escalation
    report: artifacts/quality-runs/2026-06-16T10-10-14-960Z/report.md
  - command: project-cognition update --payload-file ".specify/project-cognition/updates/20260616-workflow-phase-tool-policy-editor.json" --reason workflow-finalize --format json
    result: failed; project-cognition.db metadata schema_version has "1", expected "2"
  - command: project-cognition mark-dirty --reason "workflow-phase-tool-policy-editor closeout update blocked by project-cognition.db schema_version 1 expected 2" --format json
    result: failed; project-cognition.db metadata schema_version has "1", expected "2"

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason:
affected_objects:
  - workflow template phase schema and persisted user workflow templates
  - workflow template validation and import/export compatibility
  - workflow runtime tool gating and CLI launch options
  - workflow built-in tool exposure to agent sessions
  - desktop settings workflow editor
  - running workflow sessions started after policy changes
state_behavior_matrix:
  - no custom policy -> preserve existing phase-derived defaults
  - custom phase policy -> compute disallowedTools from user-selected managed tools and workflow built-in tool exposure from user-selected workflow tools
  - submit_phase_completion disabled -> phase cannot be completed through the normal agent tool unless the UI warns or another completion path remains available
  - unknown or invalid tool name -> reject or sanitize at validation boundary
  - active already-running session -> new policy applies after restart/retry, not retroactively to an already launched CLI
dependency_impact:
  - server policy -> affects Write/Edit/Bash/Agent exposure in agent sessions
  - workflow scoped tool policy -> affects submit_phase_completion and workflow_template_authoring availability in agent sessions
  - desktop editor -> affects user-authored workflow template payloads
  - validation/import/export -> must preserve compatibility and prevent malformed policy shapes
recovery_and_validation:
  - regression tests before production edits
  - defaults must be reversible by clearing custom policy
  - existing templates without policy must continue to validate and behave unchanged
project_cognition_evidence:
  - cognition query blocked by local DB schema mismatch; live code evidence will be used
coverage_gaps:
  - exact UI control shape needs user confirmation before implementation
  - disabling submit_phase_completion needs a deliberate warning/guard because it changes phase completion recovery behavior
consequence_obligations:
  - CA-001 claim: Per-phase tool policy must be explicit, validated, and backwards compatible; owner: sp-quick; latest resolve phase: implementation; status: resolved by template validation, compatibility-preserving editor save behavior, and tests; stop-and-reopen condition: unknown tools or existing templates break validation.
  - CA-002 claim: User changes must affect runtime CLI disallowedTools deterministically; owner: sp-quick; latest resolve phase: validation; status: resolved by workflow policy and WebSocket launch tests; stop-and-reopen condition: WebSocket launch still ignores custom policy.
  - CA-003 claim: Workflow built-in tool exposure must be configurable without trapping users in an unfinishable phase; owner: sp-quick; latest resolve phase: validation; status: resolved by scoped-tool policy tests and desktop warning when submit_phase_completion is disabled; stop-and-reopen condition: submit_phase_completion can be disabled without warning or recovery path.
escalation_decision: stay quick if user confirms the bounded known-tool and workflow-built-in editor; upgrade to specify if the desired policy model includes arbitrary plugin/MCP/native tool discovery, role-specific permissions, or multi-user governance.

## Summary Pointer

summary_path: .planning/quick/20260616-workflow-phase-tool-policy-editor/SUMMARY.md
resume_decision: resume here
