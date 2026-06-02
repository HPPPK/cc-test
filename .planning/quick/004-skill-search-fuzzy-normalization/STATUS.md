---
id: 004
slug: skill-search-fuzzy-normalization
title: Skill search fuzzy normalization
status: resolved
trigger: "$sp-quick 技能页搜索支持模糊匹配，例如 skill 名 sp-debug 时输入 spdebug 也能匹配"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: leader-inline
created: 2026-06-02T11:13:42.4115873+08:00
updated: 2026-06-02T11:36:00+08:00
---

## Current Focus

goal: Make Settings skills search match separator-insensitive queries such as `spdebug` against `sp-debug`.
current_focus: Separator-insensitive search implementation is complete with focused and desktop checks passing; summary written.
next_action: No quick-task code work remains. Repository coverage gate needs quarantine review-date maintenance before it can run cleanly.

## Execution Intent

intent_outcome: The desktop Settings skills search should match skill identifiers even when users omit punctuation separators.
intent_constraints:
  - Keep scope to the Settings skills search behavior and same-area regression test.
  - Do not add fuzzy ranking, typo distance matching, new dependencies, backend search, or broader search UI redesign.
  - Preserve existing case-insensitive substring search behavior.
success_evidence:
  - Focused desktop test proves `spdebug` matches a skill named `sp-debug`.
  - Focused desktop skills settings test suite passes after the fix.
cognition_facts:
  selected_capability: unknown; project cognition lexicon returned unrelated candidates.
  minimal_reads:
    - none returned; readiness blocked with `no_graph_candidate_matched_query`.
  validation_route: focused desktop Vitest for `desktop/src/__tests__/skillsSettings.test.tsx`.
  known_risk: project cognition remains stale/blocked and must be handled as advisory; live code/test evidence is required.

## Understanding Checkpoint

confirmed_problem: Skills page search currently uses plain matching, so `spdebug` does not match a skill named `sp-debug`.
confirmed_outcome: Skills search should be separator-insensitive for skill identifiers while preserving existing case-insensitive substring search.
confirmed_scope_boundary:
  - Only change Settings skills search behavior and same-area tests.
  - Do not add typo correction, semantic search, ranking, backend search, dependencies, or broader UI redesign.
confirmed_execution_approach:
  - Add a RED test for `spdebug` matching `sp-debug`.
  - Implement minimal query/search text normalization in `SkillList`.
confirmed_validation:
  - Run `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx --run`.

## Execution

active_lane: skill-search-normalization-worker
join_point: none
files_or_surfaces: desktop Settings skills search UI and tests
blocked_dispatch: native subagent tool contract only allows spawning when explicitly requested for subagents/delegation; using leader-inline fallback for this light quick task.
blockers: none
recovery_action: none for this quick task; coverage gate blocker requires quarantine manifest review outside this scoped UI change.
retry_attempts: 0
blocker_reason: none

## Validation

planned_checks:
  - `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx --run`
completed_checks:
  - read `.specify/memory/constitution.md`
  - read `.specify/memory/project-rules.md`
  - read `.specify/memory/learnings/INDEX.md`
  - project cognition lexicon returned `readiness: blocked`, `recommended_next_action: review_project_cognition_update`, `missing_coverage: no_graph_candidate_matched_query`
  - RED focused desktop: `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx --run` failed because `spdebug` did not find `Debug Workflow`
  - GREEN focused desktop: `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx --run` passed 8 tests
  - `bun run check:desktop` passed: lint, 96 Vitest files / 826 tests, and production build
  - inline project cognition update returned `result_state: partial_refresh`, `readiness: review`, and minimal live reads for `desktop/src/components/skills/SkillList.tsx` and `desktop/src/__tests__/skillsSettings.test.tsx`
  - `bun run check:coverage --changed` failed before coverage collection because existing quarantined server tests have expired `reviewAfter` dates: `server:cron-scheduler`, `server:providers-real`, `server:tasks`, `server:e2e:business-flow`, `server:e2e:full-flow`

## Senior Consequence Analysis

gate_status: stand_down
stand_down_reason: This is a bounded local desktop list-filtering change; it does not affect lifecycle operations, running-state semantics, destructive actions, persistence, security boundaries, backend contracts, or downstream APIs.
affected_objects:
  - desktop Settings skills search filter
  - desktop skills settings regression test
state_behavior_matrix:
  - query contains separators -> existing substring search remains supported
  - query omits separators -> normalized matching should still find separator-containing skill identifiers
  - query does not match -> existing no-matches state remains supported
dependency_impact:
  - desktop Settings skills list -> local filtering only
  - no backend, persistence, or API contract impact expected
recovery_and_validation:
  - rollback is normal git revert of the two scoped files
  - verify with focused desktop skills settings test
project_cognition_evidence:
  - cognition lexicon did not identify a relevant concept and is currently blocked/stale
  - live code/test inspection will be used after confirmation
coverage_gaps:
  - project cognition cannot prove placement/ownership for this specific UI search helper; quick owner resolved implementation through live read and focused test.
  - project cognition closeout is partial_refresh/review, not a clean ready/no_op closeout.
consequence_obligations:
  - none
escalation_decision: stay quick

## Summary Pointer

summary_path: .planning/quick/004-skill-search-fuzzy-normalization/SUMMARY.md
resume_decision: resolved; coverage gate blocker remains outside this quick-task scope
