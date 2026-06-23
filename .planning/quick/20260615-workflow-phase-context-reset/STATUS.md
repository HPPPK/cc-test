---
id: 20260615-workflow-phase-context-reset
slug: workflow-phase-context-reset
title: Workflow phase context reset option
status: resolved
trigger: "$sp-quick 然后就是我们的workflow，还有个小问题，就是我们不是很多阶段嘛？如果进入下一阶段我们实际上还是会保留当前上下文，但是如果第二阶段知道第一阶段的handoff相关的资料，那么是不是可以在进入第二阶段的时候选择清空上下文，而不是默认继承当前上下文。"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: native-subagents
created: 2026-06-15T12:20:00+08:00
updated: 2026-06-15T15:05:00+08:00
---

## Current Focus

goal: Add a bounded workflow phase-transition option that can start the next phase with clean conversation context when the handoff artifact is sufficient.
current_focus: Quick task resolved.
next_action: None; sidecar binary rebuilt, running desktop window still needs a Tauri restart before the active sidecar process picks up the rebuilt binary.

## Execution Intent

intent_outcome: A backward-compatible workflow phase context reset policy that preserves workflow state and handoff artifacts while allowing the next phase to avoid inheriting all prior conversation context.
intent_constraints:
  - Default behavior must remain context inheritance unless a template/transition explicitly opts into reset.
  - Do not delete user-visible chat history, workflow handoff artifacts, outputs, final reports, or audit state.
  - Do not change phase recommended skill semantics or reintroduce builtin workflow templates.
  - Do not treat context reset as a substitute for missing handoff content.
success_evidence:
  - RED test or executable repro demonstrating the missing context-reset option before production edits.
  - Green server/runtime tests proving transition behavior and handoff preservation.
  - Desktop/API tests only if the selected implementation exposes user-facing controls or schema fields.
cognition_facts:
  selected_capability: concept:GEN-20260610T112843.959253900Z:N-030, broad workflow coverage gap
  minimal_reads:
    - src/server/services/workflowRuntimeService.ts
    - src/server/services/workflowRuntimeService.test.ts
    - src/server/services/workflowSessionStateService.ts
    - src/server/services/workflowSessionStateService.test.ts
    - src/server/services/workflowTypes.ts
    - src/server/__tests__/sessions.test.ts
    - desktop/src/components/workflow/WorkflowTransitionControls.tsx
    - desktop/src/components/workflow/WorkflowStatusPanel.tsx
    - desktop/src/components/workflow/WorkflowComponents.test.tsx
    - src/services/compact/workflowSummaryCarryover.test.ts
    - .env.example
  validation_route: focused workflow runtime/session tests first, desktop workflow component tests if UI is touched, then check:server or check:desktop as appropriate.
  known_risk: Project cognition is partial-refresh and broad; live reads must prove exact ownership.

## Understanding Checkpoint

confirmed_problem: Confirmed - phase transitions currently keep using the same ongoing session context; the user wants an explicit way to enter the next phase with clean context when the prior phase handoff carries the needed material.
confirmed_outcome: Confirmed - add an opt-in phase-transition context policy, `inherit` by default and `clear` from a confirmation-time checkbox, that preserves workflow state/handoff artifacts while starting the next phase from handoff instead of full prior conversation.
confirmed_scope_boundary:
  - Proposed: do not delete transcript history, workflow state, handoff artifacts, output artifacts, final reports, or audit records.
  - Proposed: do not make clear-context the default for existing templates/sessions.
  - Proposed: do not change workflow template skill semantics or reintroduce builtin workflow templates.
  - Proposed: do not implement broad summarize/compact policy unless live code shows it is already the narrowest safe hook.
confirmed_execution_approach:
  - Proposed: add RED tests around transition confirm/manual-complete behavior, then implement the smallest server/runtime state and API command shape needed for opt-in clear context.
  - Proposed: expose the choice as a confirmation-time checkbox in desktop transition controls when the current phase can advance to a next phase.
  - Proposed: keep the checkbox default unchecked/inherit; checked means the next phase starts from accepted handoff/prior artifact summaries rather than inherited full conversation context.
confirmed_validation:
  - Proposed: focused workflow runtime/session tests, focused API transition test if request shape changes, and desktop component test if UI changes.

## Execution

active_lane: implementation-lane-001 completed and integrated
join_point: closed
files_or_surfaces: workflow runtime phase transition, workflow session state, handoff artifacts, desktop transition controls if needed
blocked_dispatch: none
blockers: none
recovery_action: none
retry_attempts: 0
blocker_reason:

## Validation

planned_checks:
  - focused RED/green workflow runtime/session test
  - focused desktop workflow component test only if UI controls change
completed_checks:
  - Project cognition lexicon/query completed with readiness review and partial_refresh.
  - Minimal live reads inspected for workflow runtime, session state, desktop transition controls, session API tests, and compact carryover tests.
  - Executor handoff consumed and native subagent closed.
  - Executor reported RED first in runtime tests, then focused runtime/API/websocket/desktop checks and check:server passed.
  - Leader reran `bun test src/server/services/workflowRuntimeService.test.ts`: 47 pass.
  - Leader reran `bun test src/server/__tests__/sessions.test.ts -t workflow`: 45 pass, 101 filtered.
  - Leader reran `bun test src/server/__tests__/websocket-handler.test.ts -t workflow`: 21 pass, 5 filtered.
  - Leader reran `cd desktop; bun test src/components/workflow/WorkflowComponents.test.tsx -t WorkflowTransitionControls`: 10 pass, 43 filtered.
  - Leader reran `cd desktop; bun run lint`: pass.
  - Leader added REST transition clear-context regression and reran `bun test src/server/__tests__/sessions.test.ts -t "workflow/transition"`: 16 pass, 131 filtered.
  - Leader added WebSocket auto-continue clear-context regression and reran `bun test src/server/__tests__/websocket-handler.test.ts -t "clear-context boundary"`: 1 pass, 26 filtered.
  - Final `bun run check:server`: pass, log `C:\Users\11034\AppData\Local\Temp\cc-jiangxia-phase-context-check-server-final.log`.
  - Final `bun run check:desktop`: pass, log `C:\Users\11034\AppData\Local\Temp\cc-jiangxia-phase-context-check-desktop-final.log`.
  - Rebuilt desktop sidecar with `cd desktop; bun run build:sidecars`: pass.
  - Inline project cognition update completed with `update_id` upd-20260615T065732.619899300Z and `result_state` partial_refresh.
  - Learning capture completed as no-op; no high-signal auto-capture patterns matched this quick task state.

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason:
affected_objects:
  - workflow session lifecycle state
  - phase transition confirmation path
  - phase handoff artifacts and outputs
  - conversation/session context inherited by the next phase
  - desktop workflow transition controls if the option is user-visible
state_behavior_matrix:
  - created/queued -> no reset effect until a workflow phase transition occurs
  - running -> default continues inheriting context unless a reset policy is selected
  - pending confirmation -> handoff remains the authority for next phase intake; reset choice must not lose pending artifact details
  - completed -> final report and archived workflow state remain unchanged
  - resumed -> reset policy must be reconstructable from persisted workflow/session state
  - stale/partial cognition -> continue from live reads and record coverage truthfully
dependency_impact:
  - workflow runtime -> owns transition and prompt assembly behavior
  - workflow session state -> owns persisted/resumable state shape
  - desktop controls -> may expose or display reset choice
  - compaction/carryover -> may interact with summary handoff and context inheritance
  - tests -> must prove no handoff artifact loss
recovery_and_validation:
  - keep inheritance as default rollback path
  - preserve handoff/output artifacts as durable audit state
  - add focused RED test before production changes
  - rerun scoped server/runtime tests after implementation
project_cognition_evidence:
  - readiness review, freshness partial_refresh
  - selected broad workflow coverage-gap concept N-030
  - minimal live reads listed above
  - Live reads show WorkflowTransitionRequest/WorkflowTransitionCommand currently have no context policy field.
  - Live reads show confirmTransition accepts pending artifacts and calls advanceToPhase without context reset behavior.
  - Live reads show linked workflow start already has contextStrategy clear/inherit/summarize, but that applies to new workflow sessions, not intra-workflow phase transitions.
  - Live reads show transcript clear tests preserve workflow metadata pointers, so any reset must avoid destructive companion-state mutation.
  - User proposed the UI placement as a checkbox during confirmation to enter the next phase.
coverage_gaps:
  - precise reset owner is not represented by a narrow cognition node; owner is this quick task, latest safe resolve before implementation, stop/reopen if live reads reveal multiple incompatible product paths
consequence_obligations:
  - CA-001 claim: context reset must not delete workflow state, handoff artifacts, outputs, final reports, or user-visible chat history; owner sp-quick; latest resolve implementation; stop if design requires destructive session mutation
  - CA-002 claim: inheritance remains default for existing templates/sessions; owner sp-quick; latest resolve tests; stop if migration or compatibility policy is required
  - CA-003 claim: next phase must receive enough handoff/phase-output context after reset; owner sp-quick; latest resolve runtime tests; stop if handoff content cannot be proven sufficient
escalation_decision: stay quick unless live reads show the feature requires broad session architecture or migration decisions

## Summary Pointer

summary_path: .planning/quick/20260615-workflow-phase-context-reset/SUMMARY.md
resume_decision: resolved
