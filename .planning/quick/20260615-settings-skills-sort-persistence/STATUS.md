---
id: 20260615
slug: settings-skills-sort-persistence
title: Settings skills sort persistence
status: resolved
trigger: "$sp-quick 设置页 技能页，搜索 我按排序最近更新，然后发现再次回到这个技能页，它又重置了排序规则了"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: leader-inline
created: 2026-06-15T15:44:52.1970468+08:00
updated: 2026-06-15T15:47:00.0000000+08:00
---

## Current Focus

goal: Preserve the Settings skills page sort selection when the user navigates away and returns.
current_focus: Skills sort persistence fix is implemented, scoped verification passed, and partial project cognition closeout is recorded.
next_action: No code work remains for this quick task; unrelated full desktop gate blocker remains in `desktop/src/theme/globals.css`.

## Execution Intent

intent_outcome: The skills page should keep the user-selected sort order, such as recently updated, after search/navigation and returning to the page.
intent_constraints:
  - Keep this quick task scoped to the desktop Settings skills page list state and same-area tests.
  - Do not redesign the settings navigation, skill backend, skill schema, or workflow skill definitions.
  - Do not add broad persistence for unrelated settings unless live code proves this page already uses that pattern.
success_evidence:
  - A focused desktop regression test proves the sort option survives leaving and returning to the skills page.
  - The relevant desktop test/check passes after implementation.
cognition_facts:
  selected_capability: weak match `SkillTool - Skill Invocation`; project cognition did not expose a precise desktop settings skills page concept.
  minimal_reads:
    - desktop/src
    - src/tools/DiscoverSkillsTool/prompt.ts
    - src/tools/SkillTool/SkillTool.ts
    - src/tools/SkillTool/UI.tsx
    - src/tools/SkillTool/constants.ts
    - src/tools/SkillTool/prompt.ts
  validation_route: focused desktop Vitest/Testing Library coverage for the Settings skills page, then the relevant desktop check.
  known_risk: project cognition coverage is partial; live desktop code and tests must prove ownership and behavior.

## Understanding Checkpoint

confirmed_problem: The desktop Settings skills page resets the selected skill sort option after the user navigates away and returns.
confirmed_outcome: Returning to the skills page should preserve the user's selected sort order, such as recently updated, and apply it to searched/filtered results.
confirmed_scope_boundary:
  - Keep this quick task scoped to the desktop Settings skills page list state and same-area tests.
  - Do not change the skill backend, skill schema, workflow skill definitions, or broad settings navigation behavior unless live evidence proves a tiny adapter is required.
confirmed_execution_approach:
  - Locate the current SkillList/settings page state ownership.
  - Add a focused RED regression for leaving and returning with sort set to recently updated.
  - Implement the smallest state retention fix that follows existing desktop patterns.
confirmed_validation:
  - Run the focused desktop regression test.
  - Run the relevant desktop check after the focused test passes.

## Execution

active_lane: leader-inline-red-green
join_point: none
files_or_surfaces: desktop Settings skills page UI, skill list filter/sort state, same-area desktop tests
blocked_dispatch: native subagent tools are visible, but their tool contract allows spawning only when the user explicitly asks for sub-agents/delegation/parallel agent work; using sp-quick light-tier leader-inline fallback.
blockers: none
recovery_action: if native subagents are unavailable, record the fallback and continue leader-inline with RED/GREEN verification
retry_attempts: 0
blocker_reason: none

## Validation

planned_checks:
  - focused desktop regression test for skills page sort persistence
  - relevant desktop check after the focused test passes
completed_checks:
  - read `.specify/memory/constitution.md`
  - read `.specify/memory/project-rules.md`
  - read `.specify/memory/learnings/INDEX.md`
  - ran project cognition lexicon/query; readiness `review`, freshness `partial_refresh`, missing coverage `semantic_intake_partial_facet_coverage`
  - reviewed resolved prior quick task `.planning/quick/003-settings-skills-search-sort`
  - user confirmed understanding checkpoint
  - discovered native multi-agent tools; recorded tool-contract fallback to leader-inline
  - "RED focused desktop: `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx -t \"keeps the selected skill sort\"` failed because the sort select returned to `name`"
  - implemented controlled sort state owned by `Settings` and passed through `SkillSettings` to `SkillList`
  - "GREEN focused desktop: `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx -t \"keeps the selected skill sort\"` passed"
  - "GREEN same-area desktop file: `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx` passed 10 tests"
  - "bun run check:desktop failed in vite-config.test.ts because pre-existing desktop/src/theme/globals.css contains color-mix( in the running-stop-button animation; this is outside the Skills sort persistence change."
  - "cd desktop; bun run lint passed"
  - "cd desktop; bun run build passed"
  - "git diff --check for SkillList, Settings, skillsSettings test, and quick STATUS passed with CRLF warnings only"
  - "inline project cognition update returned result_state partial_refresh, readiness review, update_id upd-20260615T075309.896683500Z"
  - "learning capture-auto returned no-op: no high-signal auto-capture patterns matched"

## Senior Consequence Analysis

gate_status: stand_down
stand_down_reason: This is a bounded desktop UI state-retention bug for a list sort control; it should not affect lifecycle operations, destructive behavior, shared runtime state, security-sensitive behavior, or downstream compatibility beyond local UI state.
affected_objects:
  - desktop Settings skills page list state
  - skills search/filter interaction
  - skills sort control selection
state_behavior_matrix:
  - page first opened -> default sort remains whatever the existing UI defines unless persistence already supplies a previous choice
  - user selects recently updated -> list sorts by recently updated
  - user searches -> current sort continues to apply to filtered results
  - user leaves and returns -> selected sort should still be recently updated
dependency_impact:
  - same-area desktop tests -> add regression coverage
  - settings UI state pattern -> follow existing local or persisted state convention
recovery_and_validation:
  - Rollback is a normal git revert of the scoped UI/test changes.
  - Verify with focused desktop test and relevant desktop check.
project_cognition_evidence:
  - readiness `review`; returned route was weak and mostly skill-tool focused, so live code inspection must prove ownership.
coverage_gaps:
  - Precise desktop settings skills page ownership was not covered by project cognition; owner is this quick task, latest safe resolve phase is before implementation closeout, stop-and-reopen if live code shows broader navigation state contracts.
consequence_obligations:
  - none; gate stood down for lifecycle/security/shared-state consequences.
escalation_decision: stay quick unless live inspection shows the fix requires broader settings navigation or persistence architecture decisions.

## Summary Pointer

summary_path: .planning/quick/20260615-settings-skills-sort-persistence/SUMMARY.md
resume_decision: resolved
