---
id: 20260602
slug: workflow-chat-ui-compact
title: Compact workflow UI on desktop chat page
status: resolved
trigger: "$sp-quick [Image #1] workflow运行中这个还是占用太多空间了，看看能不能折叠呢？默认折叠，然后展示必要信息，也可以选择展开这样？"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: native-subagents
created: 2026-06-02T16:52:37.5085953+08:00
updated: 2026-06-03T16:36:35+08:00
---

## Current Focus

goal: Make the running desktop workflow status panel compact by default while preserving essential workflow state and a clear expand affordance.
current_focus: Active workflow panel default-collapsed behavior is implemented, focused tests and desktop gate passed, and project cognition closeout recorded as partial_refresh/review.
next_action: none for this scoped quick task; full PR readiness still depends on unrelated repository-wide verify blockers if a merge-ready claim is needed.

## Execution Intent

intent_outcome: The active workflow panel should render collapsed by default, showing only necessary status/progress/phase information and a visible expand control for details/actions.
intent_constraints:
  - Keep scope to desktop workflow status/presentation surfaces.
  - Do not change workflow execution semantics, task persistence, server lifecycle behavior, or skill recommendation data.
  - Preserve access to workflow details, recommended skills, progress, status, and phase completion controls when expanded.
success_evidence:
  - Focused desktop component/unit test proves active workflow status renders collapsed by default and can expand.
  - `bun run check:desktop` passes.
cognition_facts:
  selected_capability: desktop.workflow.runtime-status; graph coverage is weak for the exact screenshot panel, so live desktop UI reads are required.
  minimal_reads:
    - desktop/src
    - desktop/src/components/workflow/WorkflowStatusPanel.tsx
    - desktop/src/components/workflow/WorkflowTransitionControls.tsx
    - desktop/src/components/workflow/WorkflowReportLink.tsx
    - desktop/src/api/sessions.ts
    - desktop/src/types/session.ts
  validation_route: desktop Vitest/Testing Library focused workflow component test, then `cd desktop && bun run lint` or targeted desktop check if practical.
  known_risk: Project cognition readiness is review/partial_refresh and selected concept is partly unmapped; exact owner must be proven through live reads after confirmation.

## Understanding Checkpoint

confirmed_problem: The running workflow panel at the top of the desktop chat page takes too much vertical space.
confirmed_outcome: Make the active workflow panel collapsed by default, with necessary info visible and details available on expand.
confirmed_scope_boundary:
  - Keep the quick task to desktop workflow status presentation unless live evidence proves the component is elsewhere.
  - Do not change workflow execution, persistence, provider/runtime, skill resolution, or task lifecycle semantics.
confirmed_execution_approach:
  - Locate the concrete active workflow status panel component through the project-cognition minimal reads.
  - Add or update focused desktop test coverage for default-collapsed and expanded rendering.
  - Apply the smallest UI/rendering change that makes running workflow details compact without hiding critical state.
confirmed_validation:
  - Run the focused desktop workflow component/unit test.
  - Run a narrow desktop check when practical after the patch.

## Execution

active_lane: active-workflow-panel-collapse
join_point: completed and integrated
files_or_surfaces: desktop workflow runtime status panel, workflow transition controls if nested, workflow status tests
blocked_dispatch: none; native subagent tooling discovered through tool_search and one executor lane completed.
blockers: []
recovery_action: none
retry_attempts: 0
blocker_reason: none for this resumed UI scope; prior full `bun run verify` blocker was expired quarantine windows unrelated to UI.

## Validation

planned_checks:
  - focused desktop component/unit test for active workflow status collapsed-by-default rendering
  - narrow desktop lint/test/build command as needed
completed_checks:
  - resumed quick-task workspace and refreshed project cognition query for active workflow panel collapse
  - user confirmed renewed Understanding Checkpoint
  - native subagent capability discovered via tool_search
  - executor lane returned DONE with scoped changes in WorkflowStatusPanel and same-area tests
  - leader reviewed scoped diff and confirmed only desktop workflow UI/test surfaces changed
  - `cd desktop && bun run test -- WorkflowComponents.test.tsx ActiveSession.test.tsx` passed: 2 files, 74 tests
  - `bun run check:desktop` passed: desktop lint/typecheck, 96 test files / 828 tests, and Vite build
  - project cognition inline update ran with payload `.specify/project-cognition/updates/20260603-active-workflow-panel-collapse.json`; result_state=partial_refresh, readiness=review, update_id=upd-20260603T083635.794205300Z
  - project cognition lexicon/query completed; readiness=review
  - user confirmed understanding checkpoint
  - leader minimal live read confirmed ActiveSession owns top workflow panel and completed background agent panel; MessageList already filters agent background task transcript cards
  - bun run test ActiveSession.test.tsx passed: 30 tests
  - bun run test WorkflowComponents.test.tsx passed: 44 tests
  - bun run test MessageList.test.tsx passed: 56 tests
  - bun run check:desktop passed: 96 test files, 828 tests, desktop build/typecheck
  - bun run check:native passed after stopping exact repo-owned Tauri/dev/sidecar PIDs that held target/debug executables
  - bun run verify failed: latest report artifacts/quality-runs/2026-06-02T09-18-53-814Z/report.md, passed=5 failed=3 skipped=3; remaining failures all trace to expired quarantine entries

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason: n/a
affected_objects:
  - desktop active workflow status panel
  - workflow details/recommended skills visibility
  - workflow progress/status/action affordances
state_behavior_matrix:
  - running -> default collapsed with title/status/progress/phase summary visible, details/actions available on expand
  - pending confirmation/manual action -> keep the action discoverable; do not hide required completion controls irrecoverably
  - completed/failed -> preserve existing compact handling and failure visibility unless live reads show the same panel path controls it
dependency_impact:
  - desktop tests -> must cover default collapsed and expanded rendering
  - server/session workflow API -> expected unchanged
  - workflow settings/data model -> expected unchanged
recovery_and_validation:
  - Revert UI-only changes if tests or visual/manual evidence show critical workflow state or completion controls are hidden.
project_cognition_evidence:
  - lexicon readiness=review with no exact graph concept match
  - query selected unmapped-desktop-workflow-panel and returned desktop.workflow.runtime-status candidates
  - minimal live reads recorded above
coverage_gaps:
  - Exact screenshot component owner not proven by cognition; resolve through minimal live reads after confirmation.
consequence_obligations:
  - CA-001 resolved: WorkflowTransitionControls remains outside the collapsed panel and ActiveSession tests keep Confirm/Reject reachable; stop-and-reopen if default collapse hides Complete Phase or pending-confirmation controls without an obvious expand path.
  - CA-002 resolved: collapsed panel tests assert workflow title, phase/progress, and status remain visible; stop-and-reopen if collapsed state removes phase/status/progress context.
escalation_decision: stay quick

## Summary Pointer

summary_path: .planning/quick/20260602-workflow-chat-ui-compact/SUMMARY.md
resume_decision: resolved
