---
id: 20260605
slug: env-variable-management
title: Desktop environment variable management
status: resolved
trigger: "$sp-quick 我们这个客户端软件，可以支持设置环境变量吗？因为AGENT用到一些东西会需要用到环境变量，我想我们在设置页加一个环境变量管理页可以添加环境变量并实时生效，看看可以不"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: native-subagents
created: 2026-06-05T15:04:03.0223993+08:00
updated: 2026-06-05T15:29:00.0000000+08:00
---

## Current Focus

goal: Add a bounded desktop settings feature for managing agent environment variables with live propagation to running Agent sessions.
current_focus: Implementation and focused verification complete; broad server check is blocked by pre-existing expired quarantine entries before tests run.
next_action: Hand off summary, verification evidence, and residual server-gate blocker.

## Execution Intent

intent_outcome: Add a desktop settings environment-variable management surface that persists variables and makes them available to both future and already-running Agent sessions without requiring an app restart, within operating-system/runtime limits.
intent_constraints:
  - Keep scope to desktop/client-managed agent environment variables.
  - Do not expose secrets in logs, transcripts, diagnostics, or fixtures.
  - Do not mutate user-owned global shell/profile environment variables.
  - Preserve existing provider/model/MCP/skills configuration ownership boundaries.
  - Escalate to sp-specify if true in-place mutation of already-started external child processes is required or if implementation requires broad multi-process lifecycle redesign.
success_evidence:
  - Regression test or executable repro first for the selected behavior.
  - Focused desktop/server tests covering persistence, validation, and runtime application.
  - Relevant quality check for the touched surface before completion.
cognition_facts:
  selected_capability: unknown - project-cognition lexicon was blocked before candidate selection.
  minimal_reads:
    - none returned; project-cognition blocked before query due active_generation_id mismatch.
  validation_route: likely desktop Vitest/server tests, to be proven from live code after confirmation.
  known_risk: Project cognition advisory index is unavailable for this task; source claims must come from live repository evidence.

## Understanding Checkpoint

confirmed_problem: The desktop client currently lacks a user-facing way to manage environment variables needed by Agent work.
confirmed_outcome: Add a settings environment-variable manager whose changes are persisted and become visible to future and already-running Agent sessions without an app restart.
confirmed_scope_boundary:
  - Do not mutate machine/global shell environment variables.
  - Do not expose secret values through logs, transcripts, diagnostics, or committed fixtures.
  - Do not silently change provider/MCP/skills configuration ownership.
  - Do not claim OS-level mutation of an already-started external child process env block; if that is the only interpretation available, escalate.
confirmed_execution_approach:
  - Locate desktop settings, persistence, server/agent runtime env construction, and active-session refresh points from live code.
  - Add a focused failing test or executable repro before production edits.
  - Implement the smallest UI/storage/runtime path that supports confirmed live semantics.
confirmed_validation:
  - Focused tests for settings CRUD/persistence and runtime env visibility.
  - A relevant local check lane for the touched desktop/server surfaces.

## Execution

active_lane: handoff
join_point: explorer handoff consumed
files_or_surfaces: desktop settings UI; desktop settings store/types/API; user settings env persistence; server active-session env broadcast; focused tests
blocked_dispatch: none before confirmation
blockers: check:server is blocked before test execution by expired quarantine entries requiring review.
recovery_action: If source architecture cannot support running-session refresh inside quick scope, stop and escalate to sp-specify with evidence.
retry_attempts: 0
blocker_reason: Repository quarantine manifest has expired entries: server:cron-scheduler, server:providers-real, server:tasks, server:e2e:business-flow, server:e2e:full-flow.

## Validation

planned_checks:
  - Start with a failing focused test or executable repro after owner discovery.
completed_checks:
  - Project cognition lexicon attempted; blocked by active_generation_id mismatch.
  - RED: bun test src/server/__tests__/conversations.test.ts -t "environment variable updates" failed because updateEnvironmentVariables is missing.
  - RED: bun test src/server/__tests__/settings.test.ts -t "sync settings env" failed because settings env did not sync active sessions.
  - RED: cd desktop && bun run test -- --run src/stores/settingsStore.test.ts -t "agent environment" failed because agentEnvironmentVariables state is missing.
  - GREEN: bun test src/server/__tests__/conversations.test.ts -t "environment variable updates" passed.
  - GREEN: bun test src/server/__tests__/settings.test.ts -t "sync settings env" passed.
  - GREEN: bun test src/cli/structuredIO.test.ts passed.
  - GREEN: bun test src/server/__tests__/conversations.test.ts src/server/__tests__/settings.test.ts src/cli/structuredIO.test.ts passed, 3 files and 107 tests.
  - GREEN: cd desktop && bun run test -- --run src/pages/EnvironmentSettings.test.tsx src/pages/Settings.test.tsx passed, 2 files and 5 tests.
  - GREEN: bun run check:desktop passed, including desktop tsc, 97 Vitest files / 834 tests, and production build. Existing act warnings in generalSettings tests remained warnings.
  - UI smoke: desktop preview served http://127.0.0.1:4173 with HTTP 200 and content length 4518. In-app browser tooling was not exposed in this turn.
  - BLOCKED: bun run check:server failed before tests due expired quarantine entries requiring review: server:cron-scheduler, server:providers-real, server:tasks, server:e2e:business-flow, server:e2e:full-flow.
  - BLOCKED: project-cognition update and mark-dirty both failed due active_generation_id mismatch between status.json and DB.

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason: n/a - environment variables affect shared runtime state and security-sensitive values.
affected_objects:
  - Desktop settings page and navigation.
  - Persistent client/app settings for user-defined environment variables.
  - Agent process or runtime environment used by tool execution/providers/MCP as applicable.
  - Diagnostics/logging surfaces that might accidentally expose values.
  - Tests and verification gates for desktop/server behavior.
state_behavior_matrix:
  - created -> a new variable is validated, stored, and becomes available to subsequently started or refreshed agent runtime work.
  - updated -> changed value replaces the previous runtime value without requiring an app restart where the architecture supports live propagation.
  - deleted -> removed variable no longer applies to new/refreshable agent runtime work.
  - running -> existing running work may require bounded semantics; stop and clarify/escalate if live mutation of already-running child processes is required.
  - missing/stale -> invalid or unavailable persisted data should fail closed or be ignored with safe diagnostics, not crash the client.
dependency_impact:
  - Desktop UI/store -> must preserve settings UX and persistence compatibility.
  - Server/API/runtime -> must define where agent environment is merged and when it is read.
  - Existing provider/MCP/skills config -> must not be overwritten or leaked.
  - Quality gates -> require same-area tests for production behavior changes.
recovery_and_validation:
  - Rollback by removing the new settings UI/storage/runtime injection changes.
  - Validate with focused tests and the relevant local check lane after implementation.
  - Redact or avoid secret values in test fixtures, logs, and UI diagnostics.
  - Record real-time semantics explicitly if existing running agents cannot be mutated in place.
project_cognition_evidence:
  - project-cognition lexicon blocked: active_generation_id mismatch between status.json and DB.
  - Explorer subagent handoff identified existing settings.env live reload and update_environment_variables protocol from live code.
coverage_gaps:
  - Owner files and exact runtime injection point unknown until post-confirmation live source reads; leader resolves before dispatch.
  - Real-time effect semantics for already-running agents unknown; latest safe resolve phase is before implementation. Stop and reopen/escalate if current architecture cannot support it within quick scope.
consequence_obligations:
  - CA-001: Environment variable values must not leak through logs, transcripts, diagnostics, or committed fixtures. Owner quick workflow. Latest resolve phase validation. Stop if a required surface cannot be redacted.
  - CA-002: Persisted env configuration must preserve unknown existing settings and avoid global shell/profile mutation. Owner quick workflow. Latest resolve phase implementation. Stop if storage format needs broad migration.
  - CA-003: Runtime application semantics must satisfy user-confirmed already-running Agent visibility without claiming impossible OS child-process env mutation. Owner quick workflow. Latest resolve phase implementation. Stop if true in-place mutation of already-started external processes is required and not locally supported.
escalation_decision: stay quick pending user confirmation; upgrade to sp-specify if architecture or lifecycle semantics exceed a bounded settings/runtime injection change.

## Summary Pointer

summary_path: .planning/quick/20260605-env-variable-management/SUMMARY.md
resume_decision: resolved
