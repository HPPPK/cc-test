---
status: resolved
created: 2026-06-16T16:35:00+08:00
updated: 2026-06-16T16:55:00+08:00
reported_by: user
symptom: In a Superspec workflow session at Sp Implement phase 5 of 5, the agent says Write/Edit/Bash are unavailable and falls back to computer-use/manual copy instructions.
execution_model: leader-inline
dispatch_shape: leader-inline
execution_surface: leader-inline
dispatch_reason: Focused workflow tool-policy/tool-surface bug with one likely server policy path and one desktop-observable session startup path.
blocked_reason: none
causal_map_completed: true
investigation_contract_completed: true
log_investigation_plan_completed: true
observer_framing_completed: true
skip_observer_reason: cognition blocked by schema mismatch; live search identifies workflow tool policy and websocket launch path.
---

# Debug Session: Workflow Implement Phase Tools Unavailable

## Current Focus

stage: fixed
hypothesis: "Confirmed. The user SuperSpec template uses active phase id `sp-implement`, but workflow tool policy only recognized `implementation` and `implement` as implementation phases."
next_action: "Restart/retry the affected workflow runtime so the new CLI launch settings are applied to the active session."

## User Report

- User invoked `$sp-debug`.
- Screenshot shows Superspec Development Workflow: `Sp Implement · Phase 5 of 5`, status `Running`, authority `User confirmation required`.
- The assistant in that session says Write/Edit/Bash are unavailable and offers manual copy or computer-use fallback.
- User asks why there is no permission and reports that workflow reaches the fifth phase then cannot use some tools.
- Local workflow config confirms the active template `superspec-development-workflow` uses phase ids `sp-discussion`, `sp-specify`, `sp-plan`, `sp-tasks`, and `sp-implement`.

## Project Cognition Intake

- `project-cognition lexicon` blocked by local DB metadata mismatch: `schema_version` 1, expected 2.
- Route: continue with live repository evidence.
- Project-language search terms used: workflow tool policy, disallowedTools, workflow phase, implement phase, Write/Edit/Bash, tool surface, websocket launch.

## Observer Framing

- primary_suspected_loop: workflow active phase -> server computes disallowed tools -> CLI starts with a restricted tool set -> provider/tool registry omits Write/Edit/Bash -> model reports missing tools.
- primary_candidate: confirmed. `getWorkflowPhaseDisallowedTools` only recognized `implementation`/`implement` and missed the actual phase id `sp-implement`.
- contrarian_candidate: the CLI/provider runtime never exposes file tools in this environment, independent of workflow phase.
- recommended_first_probe: inspect `workflowToolPolicy.ts`, websocket launch tests, and any phase id normalization.

## Consequence Analysis

trigger_status: triggered
trigger_reason: Workflow tool policy affects lifecycle execution, mutation permissions, file writes, shell access, user-visible agent behavior, and safety boundaries.

## Evidence

- User-provided transcript: the model reports `Write/Edit/Bash` are absent and tries `mcp__computer-use`.
- Live search evidence: `src/server/services/workflowToolPolicy.ts` defines phase-based disallowed mutating tools.
- Live search evidence: `src/server/__tests__/websocket-handler.test.ts` has launch coverage for requirements phase mutating tools being denied.
- RED evidence: `bun test src/server/services/workflowToolPolicy.test.ts -t "SuperSpec implementation"` failed because `getWorkflowPhaseActionPolicy(stateFor('sp-implement'))` returned `null`.
- RED evidence: `bun test src/server/__tests__/websocket-handler.test.ts -t "SuperSpec implementation workflow sessions"` failed because CLI launch options still included `disallowedTools: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent']`.
- Fix: normalize workflow phase ids and classify `sp-implement` / `sp_implement` as implementation aliases while preserving `implementation-planning` as a restricted planning phase.
- Fix: reuse implementation action policy for implementation aliases so runtime prompts and mutation policy agree with the tool surface.

## Verification

- PASS: `bun test src/server/services/workflowToolPolicy.test.ts -t "SuperSpec implementation"`
- PASS: `bun test src/server/__tests__/websocket-handler.test.ts -t "SuperSpec implementation workflow sessions"`
- PASS: `bun test src/server/services/workflowToolPolicy.test.ts`
- PASS: `bun test src/server/__tests__/websocket-handler.test.ts`
- PASS: `bun run check:server` (`1173 pass`, `7 skip`, `0 fail`)

## Closeout Notes

- Project cognition inline update attempted with changed paths and verification evidence, but failed because `project-cognition.db` metadata has `schema_version` 1 while the runtime expects 2.
- Project cognition `mark-dirty` fallback attempted for the same scope and failed with the same schema mismatch.
- This cognition maintenance failure predates the fix path; live code and test evidence were used for the resolved debug conclusion.
- Reusable lesson captured in `.specify/memory/learnings/learn-2026-06-16-workflow-implement-phase-tool-gating-alias-4d8a2c1b.md`.
