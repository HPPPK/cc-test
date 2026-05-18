# Discussion State: Agent Teams Capabilities

## Current Command

- active_command: sp-discussion
- state_surface: discussion-state
- status: active
- slug: agent-teams-capabilities
- updated_at: 2026-05-16T23:21:58+08:00

## Phase Mode

- phase_mode: discussion-only
- summary: Source-grounded discussion of current teammate capabilities. User selected first-stage per-teammate runtime support in both Agent tool spawn parameters and desktop Team UI, with Agent tool as the underlying capability.

## Session Routing

- current_stage: requirements-synthesis
- current_topic: Per-teammate cross-provider model selection
- next_question: Should the teammate capability contract restore custom-agent hooks/skills/MCP parity in the same feature slice, or keep runtime selection separate?
- blocker_reason: none
- readiness_note: Not ready for handoff. Current behavior is understood enough for discussion, but no implementation handoff has been requested.

## Session Selection

- incomplete_statuses: active, blocked, handoff-ready
- resume_rule: resume only when exactly one incomplete discussion is available or the user selected a slug
- collision_rule: append date or short numeric suffix when a generated slug already exists

## Handoff Assessment

- handoff_assessment_status: not-run
- handoff_assessment_path: none
- handoff_assessment_decided_at: none

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

- handoff_to_specify: none
- handoff_to_specify_json: none
- active_candidate_handoff: none
- active_candidate_handoff_json: none
- handoff_requested_by_user: false
- next_command: none
