# Discussion State: Test Suite Slimming

## Current Command

- active_command: sp-discussion
- state_surface: discussion-state
- status: handoff-ready
- slug: test-suite-slimming
- updated_at: 2026-05-17T23:31:32+08:00

## Phase Mode

- phase_mode: discussion-only
- summary: Handoff-ready discussion for a layered test verification feature: under-1-minute fast lane plus 5-minute ordinary PR/verify target using existing impact-report/change-policy/quality-gate architecture.

## Session Routing

- current_stage: handoff-on-request
- current_topic: Lightweight high-quality testing strategy
- next_question: none
- blocker_reason: none
- readiness_note: Handoff assessment completed as ready-for-specify; latest-copy handoff-to-specify.md/json written.

## Session Selection

- incomplete_statuses: active, blocked, handoff-ready
- resume_rule: resume only when exactly one incomplete discussion is available or the user selected a slug
- collision_rule: append date or short numeric suffix when a generated slug already exists

## Handoff Assessment

- handoff_assessment_status: ready-for-specify
- handoff_assessment_path: handoff-assessment.md
- handoff_assessment_decided_at: 2026-05-17T23:31:32+08:00

## Split Plan

- split_plan_status: none
- split_plan_path: none
- active_candidate: none
- next_recommended_candidate: none
- backlog_completion_rule: discussion remains incomplete until every candidate is completed, deferred, or explicitly abandoned

## Allowed Artifact Writes

- discussion-state.md
- discussion-log.md
- requirements.md
- technical-options.md
- project-context.md
- open-questions.md
- handoff-to-specify.md only after explicit user request and bounded handoff selection
- handoff-assessment.md only after explicit user request
- split-plan.md only when handoff assessment returns split-required
- handoffs/*.md only after candidate selection
- handoffs/*.json only after candidate selection
- handoff-to-specify.json only after explicit user request and bounded handoff selection

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
- mark discussion completed while split-plan.md has unfinished candidates
- write pointer-only handoff-to-specify.md or handoff-to-specify.json

## Authoritative Files

- discussion-state.md
- discussion-log.md
- requirements.md
- technical-options.md
- project-context.md
- open-questions.md
- handoff-assessment.md when present
- split-plan.md when present
- handoffs/CAND-xxx-handoff-to-specify.md when present
- handoffs/CAND-xxx-handoff-to-specify.json when present

## Handoff

- handoff_to_specify: .specify/discussions/test-suite-slimming/handoff-to-specify.md
- handoff_to_specify_json: .specify/discussions/test-suite-slimming/handoff-to-specify.json
- active_candidate_handoff: none
- active_candidate_handoff_json: none
- handoff_requested_by_user: true
- next_command: /sp.specify
