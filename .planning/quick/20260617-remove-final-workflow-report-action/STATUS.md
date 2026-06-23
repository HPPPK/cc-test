---
id: 20260617
slug: remove-final-workflow-report-action
title: Make final workflow report action useful
status: implementing
trigger: "$sp-quick workflow完成后的 final workflow report没用吧，点了好像也没什么作用，要不把它移除掉？你看？"
understanding_confirmed: true
execution_model: leader-inline-fallback
dispatch_shape: subagent-blocked
execution_surface: leader-inline
created: 2026-06-17T00:00:00-04:00
updated: 2026-06-17T00:00:00-04:00
---

## Current Focus

goal: Keep the completed-workflow "Final workflow report" affordance and make it open the persisted report.
current_focus: Implement a functional report viewer for the completed-workflow action.
next_action: Add a focused desktop regression test, update the workflow report action, then run same-area checks.

## Execution Intent

intent_outcome: Completed workflow UI opens the final report content from the existing workflow report API.
intent_constraints:
  - Do not remove workflow completion state, final report generation/storage, or machine-readable workflow summary behavior.
  - Keep completed workflow status and any useful completion summary visible.
  - Avoid changing workflow lifecycle semantics or linked workflow start behavior.
success_evidence:
  - Focused test proves the report action fetches and displays the final report.
  - Same-area workflow UI tests pass.
cognition_facts:
  selected_capability: unknown; project cognition blocked by schema v1/v2 mismatch
  minimal_reads:
    - none returned; cognition lexicon failed before query
  validation_route: targeted desktop workflow component/page tests
  known_risk: final report may have downstream report-store/API consumers; live code sweep required after confirmation.

## Understanding Checkpoint

confirmed_problem: The visible "Final workflow report" action is a plain pointer link and may do nothing in the desktop shell.
confirmed_outcome: Keep the action, but make clicking it fetch and show the persisted final workflow report.
confirmed_scope_boundary:
  - Preserve backend report generation/storage and workflow lifecycle semantics.
  - Do not change linked workflow start behavior.
  - Limit implementation to desktop report action/viewer unless tests expose a missing API contract.
confirmed_execution_approach:
  - Use existing GET /api/sessions/:id/workflow/report through sessionsApi.getWorkflowReport.
  - Replace the plain anchor affordance with a button that opens a report dialog and renders the JSON payload.
confirmed_validation:
  - Add/update same-area desktop workflow component tests.
  - Run targeted desktop workflow tests and a desktop build.

## Execution

active_lane: leader-inline report viewer implementation
join_point:
files_or_surfaces: desktop/src/components/workflow/WorkflowReportLink.tsx, desktop/src/components/workflow/WorkflowComponents.test.tsx, desktop/src/pages/ActiveSession.test.tsx
blocked_dispatch: native subagent tool policy permits spawn_agent only when the user explicitly asks for sub-agents/delegation; the user asked for the feature fix, not delegation.
blockers:
recovery_action: If scope expands beyond removing a UI affordance, pause and ask whether to route to specify.
retry_attempts: 0
blocker_reason: subagent dispatch unavailable for this turn under tool policy; light-tier fallback to leader-inline recorded.

## Validation

planned_checks:
  - Targeted desktop workflow UI/component test for completed workflow report action.
  - Same-area desktop workflow tests touched by the change.
completed_checks:
  - none

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason:
affected_objects:
  - completed workflow status panel/header action
  - final workflow report action/button
  - workflow report store/API if the UI action is wired through an API
  - workflow completion summary consumers
state_behavior_matrix:
  - created/running/pending: report action should remain unaffected or absent only where currently irrelevant.
  - completed: final report action should fetch and display the persisted final report, or show a recoverable error if unavailable.
  - failed/cancelled: do not change recovery or report behavior unless the same component shares the affordance and tests require a consistent branch.
dependency_impact:
  - desktop workflow UI -> user-visible completed workflow controls
  - report service/API -> should remain intact unless explicitly scoped out
  - tests -> must distinguish UI action removal from report-generation removal
recovery_and_validation:
  - rollback is a narrow UI restore.
  - verify with focused desktop workflow tests.
  - preserve generated report data for internal/downstream use unless user confirms deletion.
project_cognition_evidence:
  - cognition query unavailable: project-cognition.db metadata schema_version has "1", expected "2"
coverage_gaps:
  - exact owner files and downstream consumers must be identified by targeted live search after confirmation.
  - user confirmation needed on whether removal is UI-only or full report feature removal.
consequence_obligations:
  - CA-001 claim: Make only the user-visible report action functional while preserving report generation and completion semantics; owner sp-quick; latest resolve phase implementation; stop-and-reopen if backend report generation or completion semantics are removed accidentally.
  - CA-002 claim: Completed workflow state and linked workflow continuation must remain usable; owner sp-quick; latest resolve phase validation; stop-and-reopen if completed workflow controls regress.
escalation_decision: stay quick if UI-only; route to specify if full report feature removal is requested.

## Summary Pointer

summary_path: .planning/quick/20260617-remove-final-workflow-report-action/SUMMARY.md
resume_decision: blocked waiting for understanding confirmation
