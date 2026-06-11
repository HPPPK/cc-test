---
id: 20260604-workflow-plus-menu-continuation
slug: workflow-plus-menu-continuation
title: Workflow plus menu continuation
status: resolved
trigger: "$sp-quick 现在还有个问题，workflow结束后，我想把当前会话带过去重新开一个workflow但是＋号没有workflow的选择"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: native-subagents
created: 2026-06-04T02:56:00.0000000Z
updated: 2026-06-04T03:07:36.1052162Z
---

## Current Focus

goal: Let users start another workflow from a completed workflow session through the current session plus menu while preserving current conversation context.
current_focus: Quick task resolved after subagent implementation and focused validation.
next_action: Optional browser/manual verification or broader desktop check if desired.

## Execution Intent

intent_outcome: The session plus menu exposes a workflow-start option after workflow completion so the user can continue from the current conversation instead of starting from an empty session only.
intent_constraints:
  - Do not change workflow state-machine semantics.
  - Do not mutate existing persisted transcripts.
  - Do not add a full feature spec.
  - Keep the change scoped to desktop session UI and existing workflow launcher/API surfaces.
success_evidence:
  - Focused regression proves a completed workflow session plus menu can expose/start workflow selection.
  - Focused ChatInput test passed after the fix.
cognition_facts:
  selected_capability: desktop.workflow.empty-session, partial match only
  minimal_reads:
    - desktop/src/components/chat
    - desktop/src/pages/ActiveSession.tsx
    - desktop/src/pages/EmptySession.tsx
    - desktop/src/components/workflow
    - desktop/src/api/sessions.ts
    - desktop/src/api/workflowTemplates.ts
    - desktop/src/pages/EmptySession.test.tsx
  validation_route: focused Vitest around ChatInput plus menu linked workflow path
  known_risk: project cognition has partial facet coverage and does not directly map the plus-menu workflow launcher

## Understanding Checkpoint

confirmed_problem: Completed workflow sessions cannot start another workflow from the current session plus menu, so continuing with existing conversation context is blocked.
confirmed_outcome: The current session plus menu exposes a workflow continuation/start option for completed workflow sessions while preserving normal menu behavior.
confirmed_scope_boundary:
  - Do not change workflow state-machine semantics.
  - Do not mutate existing persisted transcripts.
  - Do not redesign the full input menu.
confirmed_execution_approach:
  - Inspect cognition-returned minimal live reads only.
  - Reuse existing workflow launcher/API surfaces where possible.
  - Add the smallest safe UI bridge for completed workflow sessions.
confirmed_validation:
  - Focused UI regression for plus-menu workflow visibility or launch path.
  - Smallest relevant desktop test command for the touched files.

## Execution

active_lane: workflow-plus-menu-continuation
join_point: agent 019e9094-926d-71d2-9fb2-6c9438b2b5ca completed and closed
files_or_surfaces: desktop chat input plus menu, ActiveSession workflow session surface, EmptySession workflow launcher, workflow template API client
blocked_dispatch: none; native subagent dispatch succeeded after two parameter retries
blockers: none
recovery_action: none
retry_attempts: 2
blocker_reason: none

## Validation

planned_checks:
  - cd desktop; bun run test -- ChatInput.test.tsx -t "opens workflows from the plus menu after the current workflow is completed"
completed_checks:
  - RED failed before production change because the Workflows button was absent.
  - GREEN passed after production change: 1 test passed, 24 skipped.

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason: n/a
affected_objects:
  - completed workflow session UI
  - chat input plus menu
  - workflow launcher / template picker
  - session context passed into a new workflow start
state_behavior_matrix:
  - running workflow -> existing workflow controls remain unchanged and plus-menu workflow start remains blocked
  - completed workflow -> plus menu allows starting another workflow from current session context
  - non-workflow session -> existing plus menu behavior remains unchanged
  - empty session -> existing workflow launcher remains unchanged
dependency_impact:
  - desktop chat input -> fixed in this quick task
  - ActiveSession -> not modified; existing ChatInput path consumes active session summary
  - EmptySession workflow launcher -> not modified; existing launcher pattern reused
  - workflowTemplates API client -> path did not exist; sessions API surface used by existing implementation remained unchanged
recovery_and_validation:
  - command payloads/API contracts unchanged
  - focused regression passed
project_cognition_evidence:
  - readiness review; selected desktop.workflow.empty-session as partial capability
  - missing facet: current conversation context, resolved with live ChatInput evidence
coverage_gaps:
  - browser visual verification not run; latest safe resolve phase is optional post-task manual QA
  - full desktop suite not run; latest safe resolve phase is pre-PR gate
consequence_obligations:
  - CA-001 resolved: Completed workflow sessions expose workflow continuation without changing non-workflow plus menu behavior.
escalation_decision: stay quick

## Summary Pointer

summary_path: .planning/quick/20260604-workflow-plus-menu-continuation/SUMMARY.md
resume_decision: resolved
