---
name: "sp-implement-teams"
description: "Use when implementation already fits sp-implement but requires the Codex-only durable team/runtime surface for coordinated team execution."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/implement-teams.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: The work is already ready for `sp-implement`, but you explicitly want the durable teams runtime as the execution backend.
- **Primary objective**: Execute the same implementation contract through the Codex-only teams surface rather than through a lighter runtime path.
- **Primary outputs**: The normal implementation lifecycle artifacts plus team-runtime state, worktrees, and leader-visible progress signals.
- **Default handoff**: Continue coordinated implementation through the teams runtime; use cleanup or recovery only through the internal surfaces named below.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

# Codex Implement Teams

## Objective

Run the existing implementation contract through the durable Codex teams runtime when the current batch needs explicit coordinated team execution.

## Context

- This surface is Codex-only and implementation-phase-only.
- It assumes `tasks.md` is already ready and the work should follow the same shared contract as `sp-implement`.
- The teams runtime is the backend, not a replacement workflow contract.

## Process

- Validate runtime prerequisites, leader workspace state, and extension availability.
- Route the prepared implementation batch through the teams runtime backend.
- Keep the same tracker, packet, join-point, and result-handoff semantics as the canonical implementation workflow.

## Output Contract

- Produce the same implementation lifecycle outcomes as `sp-implement`, plus the expected teams runtime state and visibility artifacts.
- Keep the user-facing narrative framed as coordinated teams execution rather than extension internals.

## Guardrails

- Do not teach internal extension commands as the primary product surface.
- Do not use this command before `tasks.md` is ready.
- Do not weaken the shared `sp-implement` contract just because the runtime backend changed.

User-facing workflow skill:

```text
sp-implement-teams
```

## Boundary

1. Codex-only
2. Implementation-phase entry point only; use it after the active execution batch is known
3. On Windows, support only `native Windows + psmux`
4. Requires a clean leader workspace for runtime worktrees
5. This is the user-facing surface; use `sp-teams` as the runtime surface and do not teach extension internals as the primary product surface

## When To Use

Use this when:

1. `sp-implement` would otherwise need `leader-inline-fallback` or an ad hoc implementation flow
2. you want the current feature implemented through durable coordinated team lanes
3. the work has already been decomposed into task-ready execution slices


## Shared Contract With `sp-implement`

`sp-implement` remains the canonical implementation workflow. `sp-implement-teams` is the same execution contract with the concrete team-managed work pinned to the teams runtime.

When you use `sp-implement-teams`, keep the same leader-owned execution semantics that `sp-implement` requires:

1. keep `FEATURE_DIR/implement-tracker.md` as the execution-state source of truth
2. compile and validate a `WorkerTaskPacket` before assigning each team-managed execution task
3. for implementation-oriented teams flows, preserve the user-visible fields `execution_model`, `dispatch_shape`, and `execution_surface`
4. preserve explicit join point behavior, blocker reporting, retry-pending state, and completion checks
5. preserve the team result contract and canonical result file handoff path
6. preserve final-completion truthfulness: do not describe `core implementation complete`, `implementation complete`, or `ready for integration testing` as overall feature completion while required E2E, Polish, documentation, quickstart, or validation work remains

Every team-managed task in the teams-backed flow must still behave like an explicit execution packet, not a chat-only summary. Preserve these fields whenever the backend exposes task records, mailbox messages, or equivalent runtime-managed assignments:

1. task id and subject
2. write set and shared surfaces
3. required references and forbidden drift
4. explicit verification command or acceptance check
5. canonical result handoff path or runtime-managed result channel expectation
6. completion-handoff protocol covering start, blocker, and final completion evidence
7. platform guardrails such as supported platforms, conditional compilation requirements, or other environment-sensitive constraints

Before the teams runtime starts concrete work, ensure the current ready batch is prepared the same way `sp-implement` would prepare it:

1. the current batch is recorded in `implement-tracker.md`
2. each team-managed task has a validated `WorkerTaskPacket`
3. join point expectations and result handoff expectations are explicit
4. the team-managed lane cannot be treated as complete from a status flip alone; the leader still needs the promised completion handoff or result evidence

Before assigning team-managed work, preserve the same project cognition bundle contract that `sp-implement` uses:

1. run `project-cognition lexicon --intent implement --mode catalog` and include the lexicon result plus schema v2 `alias_index`-backed alias catalog in the execution context bundle
2. normalize user input and write a `semantic_intake` object with `workflow_intent`, `normalized_query`, `intent_facets`, `negative_constraints`, `alias_interpretations`, and `open_semantic_questions`
3. keep `alias_interpretations` object-shaped, for example `{"alias": "<user term>", "meaning": "<project term>", "confidence": "medium"}`, never as a string array
4. build a `query_plan` with `selected_concepts`, `rejected_concepts`, `concept_decisions`, `covered_facets`, `missing_facets`, `match_sources`, `lexicon_generation_id`, `expanded_queries`, `repository_search_terms`, and justified `paths`
5. derive project-language search terms from the alias catalog before source search; do not search only the raw user words; include component names, state names, file names, command names, UI labels, and route names from candidates, aliases, matched terms, returned paths, `normalized_query`, and `expanded_queries`
6. run `project-cognition query --intent implement --query-plan "<query_plan_json>" --format json` and preserve returned readiness, `minimal_live_reads`, and the task-local bundle in every teammate context packet
7. if the query reports diagnostics, preserve `warnings`, `repair_hints`, normalized `query_plan`, structured `errors`, and `expected_shape` so the leader can repair the plan instead of losing the diagnostics in team chat

The only intended difference is the dispatch path:

1. `sp-implement` may route the current ready batch through subagents first
2. `sp-implement-teams` forces the concrete team-managed execution through the teams runtime for the same batch and join-point semantics
3. the teams runtime must not weaken the tracker, packet, validation, or completion contract

## Execution Contract

1. Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` from repo root and parse `FEATURE_DIR` and `AVAILABLE_DOCS` list. All paths must be absolute.
2. If the prerequisites output does not resolve a `FEATURE_DIR` with `tasks.md`, stop and run `sp-tasks` first instead of guessing from chat state.
3. Confirm the current project is using the Codex integration.
4. Create or resume `FEATURE_DIR/implement-tracker.md`, then recover the active execution batch from tracker state before trusting `tasks.md`.
5. Treat `FEATURE_DIR/implement-tracker.md` as the implementation-state source of truth and treat `FEATURE_DIR/tasks.md` as planning input only.
6. Confirm the native runtime backend is ready through the official `sp-teams` runtime checks.
7. Run `sp-teams doctor` before the first teams dispatch for the current feature so executor availability, latest transcript, failed dispatches, and team-state evidence are visible up front.
8. When the runtime was newly installed, recently repaired, or still looks suspect after `doctor`, run `sp-teams live-probe` before touching the real implementation batch.
9. On Windows, require the same native shell to resolve `psmux`, `codex`, `node`, `npm`, `cargo`, and `git`.
10. Route durable execution through `sp-teams` and its runtime/API surfaces.
11. Preserve the shared `sp-implement` contract: tracker continuity, validated `WorkerTaskPacket`s, explicit join points, and structured result handoff discipline.
12. If the current feature already has an active runtime session, resume or reuse it. Do not create a second runtime team for the same feature.
13. If a create/start call fails because the feature already has an active runtime leader, treat that as a resume signal: inspect the existing session, reconcile tracker/task state, and continue from the recorded ready batch.
14. Use `sp-teams result-template --request-id <id>` or `sp-teams submit-result --print-schema` for structured result handoff instead of ad hoc JSON guessing. Treat the generated template as a `pending` placeholder only; do not submit it unchanged.
15. Materialize each subagent lane as an explicit execution packet: write set, required references, forbidden drift, validation command, completion-handoff protocol, and platform guardrails must stay visible to the leader and subagent.
16. Treat a blocked baseline build as a pre-dispatch runtime concern; do not mix existing repo compile debt into the current batch verdict.
17. After managed team execution, use `sp-teams sync-back` when leader-visible results need to be promoted from runtime worktrees back into the active workspace.
18. Distinguish lane-local completion from repo-global verification: `DONE_WITH_CONCERNS` means the lane finished with follow-up concerns, while repo-wide failure may still be caused by baseline debt.
19. Every join point that gates downstream work must have an explicit validation target, validation command or check, and pass condition before the runtime crosses it.
20. After each completed join point or ready batch, re-read the tracker and task state, select the next ready batch and continue automatically. Stop only when no ready work remains, a real blocker stops progress, or an explicit human gate is reached.
21. Planned validation tasks are still ready work. If the remaining tasks are executable tests, E2E checks, security verification, quickstart validation, or other scripted validation work already present in `tasks.md`, continue automatically instead of asking whether validation should start.
22. Do not stop to ask whether validation should start unless a manual-only check or approval step is explicitly recorded in the tracker or task plan.
23. Do not stop after a single completed batch just because the current assignee, subagent, or runtime lane has gone idle; idle without remaining-work analysis is not a terminal condition.
24. If a lane flips to `completed` or drifts into `idle` before the promised result handoff or completion evidence arrives, treat it as a stale lane and recover explicitly instead of counting it as finished work.
25. Use the teams runtime as the execution backend for the prepared batch rather than as a replacement for the `sp-implement` contract.
26. If the user only wants to inspect the Codex runtime surface before implementing, redirect them to `sp-teams` or `$sp-teams`.

## Output Expectations

Successful runs should leave the user with:

1. canonical team state under `.specify/teams/state`
2. worker worktrees under `.specify/teams/worktrees` or the active runtime worktree root
3. leader-visible progress through the team mailbox and monitor snapshot
4. the same implementation lifecycle semantics as `sp-implement`, including tracker continuity, join point visibility, and result handoff discipline
5. executor diagnostics and latest transcript evidence available through `sp-teams doctor`
6. a repeatable minimal runtime acceptance check available through `sp-teams live-probe`
7. implementation framed as "teams execution" through the official `sp-teams` runtime rather than extension internals
8. a formal structured result template via `sp-teams result-template`
9. an official sync-back path when worker worktrees and the main workspace diverge
10. batch outcome visibility that distinguishes lane-local completion from repo-global verification blockers

## Codex Subagent Result Contract

- Worker result contract: preserve the shared `WorkerTaskResult` semantics even when the runtime calls lanes subagents.
- Preferred result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result file handoff path: .specify/teams/state/results/<request-id>.json
- Normalize subagent-reported statuses like `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, and `NEEDS_CONTEXT` into the shared `WorkerTaskResult` contract before the leader accepts the handoff.
- Keep `reported_status` when normalization occurs so runtime-specific subagent language can be reconciled with canonical orchestration state.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Treat `DONE_WITH_CONCERNS` as completed work plus follow-up concerns, not as silent success.
- Treat `NEEDS_CONTEXT` as a blocked handoff that must carry the missing context or failed assumption explicitly.
