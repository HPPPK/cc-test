---
name: "sp-debug"
description: "Use when a bug, regression, failed verification, or unexpected runtime behavior needs a resumable investigation and fix workflow."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/debug.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A defect or failed verification needs structured root-cause investigation instead of ad hoc fixes.
- **Primary objective**: Build a resumable debug session that gathers evidence, identifies root cause, applies a fix, and verifies the result.
- **Primary outputs**: Debug-session state, evidence, verified fix artifacts when justified, and an honest blocked/resolved status.
- **Default handoff**: Stay inside the debug session until resolved or blocked; route back to execution only after the defect contract is satisfied.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Drive a resumable debugging workflow that finds the real failure mechanism before any fix is accepted.

## Context

- Primary inputs: the user's report, the active debug-session state, the failing runtime or verification evidence, and the task-local project cognition query bundle with readiness and returned `minimal_live_reads`.
- The debug session file under `.planning/debug/` is the durable state source of truth for this workflow.
- Delegated helpers are evidence collectors, not owners of the overall investigation.


## Codex Project Cognition Hard Gate

**Crucial First Step**: You MUST use agent-assisted project cognition query planning first: retrieve the map lexicon with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition lexicon --intent debug --query=\"$ARGUMENTS\" --format json`, translate the raw user intent into a query_plan using returned map terms, then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition query --intent debug --query-plan \"<query_plan_json>\" --format json` before any investigation or fixes. Use the returned readiness, task-local bundle, and `minimal_live_reads`.
- Interpret returned readiness: `ready` continues with the task-local bundle; `review` permits only returned `minimal_live_reads`; `ambiguous` asks the user to choose; `needs_update` routes through `{{invoke:map-update}}`; `needs_rebuild` routes through `{{invoke:map-scan}}`, then `{{invoke:map-build}}`; `blocked` stops with the runtime issue.
- Treat the project cognition query bundle as the primary brownfield context surface; do not fall back to chat memory or ad hoc repository instincts when query-backed runtime coverage should be the source of truth.
- Treat this as a hard gate, not a best-effort reminder; do not continue until the returned readiness and task-local bundle are strong enough for the workflow.
- A project-cognition query is not complete when it returns JSON. It is complete only when readiness drives routing, `minimal_live_reads` constrains inspection, and relevant facts are carried into the next workflow artifact or execution state.
- Carry forward the selected capability or symptom, evidence routes, minimal reads, competing truths, and unresolved coverage gaps into debug session state before root-cause claims.

## Process

- Recover or initialize the debug session and current hypothesis.
- Gather evidence through the current investigation strategy.
- For consequence-sensitive failures, trace affected objects, dependency loops, control/observation states, adjacent risk targets, and any `CA-###` stop-and-reopen conditions before accepting a fix.
- Apply a fix only after the failure mechanism is understood well enough to justify it.
- Verify the result and update the session state before any resolution claim.

## Output Contract

- Keep the debug session state, current hypothesis, evidence, and verification outcome explicit.
- Produce a verified fix only when the evidence supports it.
- Report blocked or unresolved states honestly when the investigation cannot yet close.

## Guardrails

- No speculative fixes before evidence supports the failure mechanism.
- No final resolution without fresh verification evidence.
- No subagent may take ownership of the debug session state.

## Senior Consequence Analysis Gate

Run this gate whenever the request, artifact set, defect, or planned change can affect lifecycle operations, running objects, concurrent work, destructive behavior, shared state, downstream consumers, compatibility, security-sensitive behavior, or multiple plausible product behaviors.

Project cognition first. Use the project cognition runtime to identify ownership, consumers, state surfaces, change-propagation facts, verification routes, conflicts, known unknowns, and coverage gaps. Senior consequence analysis second. Turn those facts into explicit product and implementation obligations instead of treating the graph as the decision-maker.

Project cognition readiness drives routing. If readiness is `ready`, continue with the returned task-local bundle. If readiness is `review`, inspect only the returned `minimal_live_reads` before continuing. If readiness is `ambiguous`, `needs_update`, `needs_rebuild`, or `blocked`, follow the workflow's routing rules before asserting consequence behavior. Carry relevant project cognition facts, returned `minimal_live_reads`, inference notes, and coverage gaps into the workflow's artifacts or durable state.

Required output when the gate triggers:

- **Affected Object Map**: name each object, record, worker, queue, artifact, command, API, file surface, user-visible state, or downstream consumer that can be affected.
- **State-Behavior Matrix**: describe behavior for each important lifecycle state, including created, queued, running, paused, failed, cancelled, completed, resumed, archived, missing, stale, or partially refreshed states when relevant.
- **Dependency Impact Table**: map direct dependencies, indirect consumers, shared state, compatibility surfaces, validation routes, and adjacent workflows that can break if semantics change.
- **Recovery And Validation Contract**: state rollback, retry, idempotency, cleanup, migration, observability, and validation evidence required before handoff or completion.
- **Coverage Gaps**: list what project cognition or live evidence cannot prove, who must resolve each gap, the latest safe resolve phase, the stop-and-reopen condition, and the routing decision: current workflow may continue with an assumption, must ask the user, must route to clarification or deep research, or must request map maintenance.
- **Consequence Obligations**: assign stable `CA-###` IDs to every obligation that must survive downstream handoff, task generation, worker packets, verification, or debug closeout. Each `CA-###` must include claim, affected objects, owner workflow, latest resolve phase, status, and stop-and-reopen condition.

Stand down only for docs-only wording changes, trivial isolated fixes, or local refactors that cannot affect lifecycle operations, running state, destructive operations, shared state, downstream consumers, compatibility, security, or multiple behavior choices. Record the no-trigger reason or stand-down reason in the workflow's durable artifact or closeout before skipping the required outputs.

If the gate triggers and the current workflow cannot preserve the required outputs, stop and route to the workflow that can. Do not mark ready, resolved, handoff-ready, planning-ready, or complete while triggered consequence obligations remain unresolved, unmapped, or unsupported by validation evidence.

## Mandatory Subagent Execution

All substantive tasks in ordinary `sp-*` workflows default to and must use subagents.

The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format.

Use `execution_model: subagent-mandatory`.
Use `dispatch_shape: one-subagent | parallel-subagents`.
Use `execution_surface: native-subagents`.


## Role
You are the debug session leader. Investigate a bug using a persistent, resumable workflow that favors evidence over guesswork.

- The user is the reporter. They describe symptoms and confirm whether the final behavior is fixed.
- You are the workflow leader and orchestrator.
- You own routing, task splitting, task contracts, dispatch, join points, integration, verification, and state updates.
- Subagents own the substantive task lanes assigned through task contracts.
- The leader owns the session file, the current hypothesis, all state transitions, the final fix decision, and the verification checkpoint.
- Evidence-collection subagents do not own the investigation and must not decide that the bug is resolved.
- You are not the default evidence worker for every lane; substantive evidence work belongs on subagent lanes after observer framing and task contracts are ready.
- When the investigation splits into safe bounded lanes, route, integrate, and decide rather than manually performing every lane sequentially.

## Operating Principles

- **Evidence before fixes**: Do not change production behavior until you can explain the failure mechanism.
- **Find truth ownership before chasing symptoms**: Identify which layer owns the critical truth and which layers only reflect, cache, or project it.
- **One active hypothesis at a time**: Parallel evidence gathering is allowed; parallel root-cause theories are not.
- **Observability before speculation**: Read existing logs and outputs first. If they are too weak to explain the failure, improve logging or tracing before attempting a fix.
- **Logs are a first-class evidence source**: When existing logs, stderr/stdout, test output, or trace files materially narrow the issue, append it to `Evidence` with `source_type: log` (or the closest concrete source type) and a concrete `source_ref`.
- **Existing logs first**: Before asking for new output or adding new probes, check whether the repository, runtime, deploy target, browser console, worker output, or prior test artifacts already contain decisive signals for the active candidate queue.
- **Control state is not observation state**: Keep scheduling, admission, allocation, and ownership state separate from UI, logs, event streams, caches, and snapshots.
- **Persistence is memory**: The debug session file in `.planning/debug/[slug].md` is the source of truth. Update it before each action.
- **Leader-led investigation**: The leader integrates evidence and decides what happens next. Delegated helpers only gather bounded facts.
- **Project-map first**: When the project cognition query returns a usable task-local bundle, use it as the default intake surface instead of rebuilding a broad outsider map from scratch.
- **Map-backed minimum intake**: A ready/review cognition bundle may directly populate a minimum causal map, investigation contract, log plan, transition memo, primary candidate, and contrarian candidate.
- **Deep intake is fallback, not the default**: Use Stage 1A and Stage 1B only when project cognition is missing, stale, ambiguous, insufficient for the failing area, or the lightweight investigation exposes competing truth owners.
- **Stage 1A: Causal Map**: In fallback/deep mode, the first subagent builds a family-spanning causal map before contract generation begins.
- **Stage 1B: Investigation Contract**: In fallback/deep mode, the second subagent converts the causal map into the minimum contract the investigator must consume.
- **The second stage must consume the candidate queue**: When deep intake is used, investigation cannot skip the Stage 1B contract and jump straight to freeform fixes.
- **Family coverage scales with intake strength**: Map-backed intake needs a primary and contrarian candidate; deep fallback still needs broader family coverage and falsifiers.
- **Observer framing remains the bridge artifact**: Whether map-backed or deep, record `primary suspected loop`, `recommended first probe`, and a `contrarian candidate` before evidence collection begins.
- **Debug the loop, not just the point**: Validate the path from input event to control decision to resource allocation to state transition to external observation.
- **Escalate diagnostics when the loop is still ambiguous**: If two investigation rounds do not converge, stop layering plausible small fixes and add decisive instrumentation.
- **Root-cause mode is mandatory after repeated failure**: After two automated verification failures, stop adding point fixes and switch the session into `root-cause mode`.
- **Related-risk review is part of closeout**: Do not close the session until nearest-neighbor related risk targets have been reviewed.
- **Execution intent stays explicit**: Record the current verification outcome, active constraints, and required success evidence in the session file before and during verification so resume decisions do not depend on chat memory.

## Debug Consequence Loop

When a defect touches lifecycle, running-state, shared-state, destructive behavior, downstream consumers, compatibility, security, or multiple plausible behavior choices, run the Senior Consequence Analysis Gate as part of the investigation contract.

- Model the dependency loop from trigger to affected objects to control state to observation state to downstream consumers.
- Use the Affected Object Map to separate truth owners, cached projections, queues, workers, artifacts, commands, APIs, and adjacent risk targets.
- Extend the State-Behavior Matrix with the failing lifecycle state and the expected behavior after the fix.
- Use the Dependency Impact Table to identify adjacent risk targets and related-risk review scope before closeout.
- Preserve the Recovery And Validation Contract as loop restoration proof, including repro, regression tests, observability, cleanup, idempotency, and rollback evidence.
- Record Coverage Gaps and `CA-###` obligations when the debug session exposes missing product semantics that must be reopened upstream.
- Reject surface-only fixes: a fix that only changes observation state without repairing the dependency loop, affected objects, or owning control state cannot satisfy the debug consequence loop.

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify learning start --command debug --format json` when available so passive learning files exist and the current debug run sees relevant shared project memory.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader command-local context.
- Open only learning detail docs linked from debug-relevant index entries, especially repeated pitfalls, recovery paths, or project constraints for the failing area.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- [AGENT] When investigation friction exposes retries, hypothesis changes, validation failures, false starts, hidden dependencies, rejected paths, decisive signals, root-cause families, or reusable constraints, make sure the debug session captures that durable context.
- [AGENT] For structured path learning not already captured in durable state, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.
- Treat this as passive shared memory, not as a separate user-visible debug workflow.

## Workflow Quality Requirements

- Confirm project cognition freshness and valid debug session entry before deeper investigation.
- Keep the debug session file current as the durable source of truth for evidence, active hypothesis, candidate queue, verification outcome, and terminal status.
- Preserve evidence gates: do not skip observer framing, bypass decisive evidence, or accept a fix without recorded verification.
- Update durable state before compaction-risk transitions, investigation join points, long evidence synthesis, or any stop where resume will depend on more than the visible conversation.

### Required Context Inputs

- `.specify/memory/constitution.md`
- `.specify/memory/project-rules.md`
- `.specify/memory/learnings/INDEX.md`
- Relevant linked learning detail docs
- the active feature's `spec.md`, `plan.md`, and `tasks.md`
- if `context.md` exists for the active feature, read it before proposing a fix


## Codex Leader Gate

When running `sp-debug` in Codex, you are the **leader**, not a freeform debugger.

**Crucial First Step**: You MUST use agent-assisted project cognition query planning first: retrieve the map lexicon with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition lexicon --intent debug --query=\"$ARGUMENTS\" --format json`, translate the raw user intent into a query_plan using returned map terms, then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition query --intent debug --query-plan \"<query_plan_json>\" --format json` before any investigation or fixes. Use the returned readiness, task-local bundle, and `minimal_live_reads`.

Before applying fixes or running multiple independent investigation actions yourself:
- Read the current debug session state and identify whether the investigation has two or more independent evidence-gathering lanes.
- If the current stage is `investigating` and there are two or more bounded evidence-gathering lanes, you **MUST** dispatch subagents before continuing with more sequential evidence collection yourself.
- Rejoin only at the current investigation join point, then integrate returned results on the leader path.
- If subagent evidence collection is unavailable or unsuitable, record `subagent-blocked` and use the managed team workflow before widening leader-inline investigation work.
- Do **not** skip subagents just because the evidence tasks look easy; use managed-team or `subagent-blocked` only when the current investigation does not have safe parallel lanes.


## Codex Deep Debug Intake Dispatch

When running `sp-debug` in Codex, use the project cognition query bundle as the default intake source. If the **Gathering** stage can build `map-backed-minimum-intake`, continue directly into evidence investigation with the primary candidate, contrarian candidate, transition memo, and log plan already recorded.

If project cognition is missing, ambiguous, stale, or insufficient for the failing area, Gathering may return an `await_input` containing a `think_subagent_prompt`. This prompt is a self-contained deep fallback reasoning task for a fresh subagent.

**When you receive a think_subagent_prompt:**
- Spawn a subagent with the exact prompt text via `spawn_agent`.
- The think subagent does NOT read source code and does NOT run commands — it is a pure reasoning agent.
- Use `wait_agent` to wait for the think subagent's result.
- The result is hybrid: free-text analysis followed by `---` and a YAML block.
- Parse the YAML block after `---` and populate these fields in the debug state:
  - `causal_map` (symptom_anchor, closed_loop_path, break_edges, bypass_paths, family_coverage, candidates, adjacent_risk_targets, dimension_scan, candidate_board)
- Ensure Stage 1A covers at least 3 families and every family includes a falsifier.
- These Stage 1A candidates are still the observer-framing alternative cause candidates; do not collapse them into one family too early.
- Set `causal_map_completed` to `True`.
- Then continue the debug session — the next GatheringNode run will request the contract planner stage.
- If Gathering returns `contract_subagent_prompt`, use it for the contract-planner subagent and feed its result back into `observer_framing`, `transition_memo`, `investigation_contract`, and top-level `log_investigation_plan`.
- Treat the causal-map output as Stage 1A and the contract-planner output as Stage 1B. Investigation starts only after both stages are complete, unless map-backed minimum intake already completed those fields.
- Stage 1B must still produce a primary suspected loop, a contrarian candidate, and a recommended first probe before investigation begins.
- Do NOT skip the think subagent once the runtime requested deep fallback. Context isolation is the purpose of that step.

**Hard rule:** During `investigating`, the leader must not let subagents mutate the debug file, declare the root cause final, or advance the session state.

## Session Lifecycle

1. **Check for Active Session**
   - Look for existing files in `.planning/debug/*.md` (excluding `resolved/`).
   - If a session exists and no new issue is described, resume it.
   - If a new issue is described, start a new session.
   - If the active session is `awaiting_human_verify` and the user reports another problem, classify it as `same_issue`, `derived_issue`, or `unrelated_issue`.
   - Default to `same_issue` unless repository evidence proves the other two classes.
   - `same_issue` reopens the parent session.
   - `derived_issue` starts a linked follow-up session instead of replacing the parent session.
   - In other words, when repository evidence supports `derived_issue`, start a linked follow-up session rather than reopening the parent directly.
   - `unrelated_issue` starts a separate session and does not auto-close the parent.
   - Record the parent/child relationship in both session files, and after a `derived_issue` follow-up session is resolved, return to the parent session to finish the original human verification before archiving it.

2. **Initialize or Resume**
   - [AGENT] Create or read the session file in `.planning/debug/[slug].md`.
   - Announce the current status, current hypothesis, and immediate next action.

3. **Run the Investigation Protocol**
   - Move through the investigation stages below, starting with the map-backed intake contract before evidence collection begins.
   - **Hard gate**: Do not enter reproduction, log review, test inspection, source-code reads, evidence collection, or fixing until the debug session records `causal_map_completed: true`, `investigation_contract_completed: true`, `log_investigation_plan_completed: true`, and `observer_framing_completed: true`.
   - Update the debug file before each action.
   - Append every confirmed finding to `Evidence`.
   - Append every disproven theory to `Eliminated`.

4. **Fix and Verify**
   - Packetize the smallest safe fix that addresses the confirmed root cause and delegate it through a validated subagent lane.
   - If the fix lane cannot be safely packetized or dispatched, record `subagent-blocked` with the escalation or recovery reason instead of making the fix directly.
   - Verify with the reproduction steps and relevant tests.

5. **Human Verification**
   - Once the fix is verified by the agent, move into a formal human verification stage instead of resolving immediately.
   - The session closes only after explicit human confirmation or an evidence-backed classification into `same_issue`, `derived_issue`, or `unrelated_issue`.

6. **Archive and Commit**
   - After human confirmation, move the session file to `resolved/`.
   - Commit the fix and the debug documentation.

## Required Context Inputs

## Project Cognition Gate

This command must treat the project cognition runtime as the mandatory pre-source knowledge base.

### Hard Rule

Do not inspect implementation source, run reproduction or tests, compile a
plan, prepare a fix, or emit technical recommendations until the cognition gate has
passed.

### Required Project Cognition Query

Use the launcher-backed project cognition query planning flow required by this
command's workflow contract to retrieve the task-local project cognition bundle:
run `project-cognition lexicon`, inspect the returned `concept_candidates`,
select the task-relevant `selected_concepts`, record non-selected or unsafe
`rejected_concepts`, and write a `selection_reason` for both inclusion and
exclusion choices. Then construct a `query_plan` containing
`selected_concepts`, `rejected_concepts`, `expanded_queries`, and `paths`, and
run `project-cognition query --query-plan`. Treat raw graph JSON artifacts as obsolete runtime surfaces.

### Concept Selection

`concept_candidates` are not a flat keyword list. Treat them as structured
project concept candidates with ownership, route, alias, `matched_terms`,
`colloquial_matches`, domain, disambiguation, and confidence signals.
Select concepts that match the user's intent and the workflow objective, reject
concepts that are unrelated or unsafe to assume, and preserve the
`selection_reason` so downstream artifacts can understand why the query was
bounded that way.

When candidate concepts conflict, are too broad, or remain unknown, follow the
returned readiness state instead of guessing. Do not bypass `route_pack` or
`minimal_live_reads` by expanding into broad repository reads merely because a
candidate concept looks interesting.

### Fixed Bundle Consumption

Every workflow must consume the readiness and task-local bundle returned by the
project cognition query explicitly required by its command contract.
Do not replace bundle consumption with broad freeform repository rereads when the runtime already covers the touched area.

### Query Completion

A project-cognition query is not complete when it returns JSON. It is complete
only when readiness drives routing, minimal_live_reads constrains inspection,
and relevant facts are carried into the next workflow artifact or execution state.

Extract and carry forward the selected concepts, rejected concepts,
`selection_reason`, matched capability or symptom, affected nodes and subgraph,
`route_pack`, `minimal_live_reads`, missing coverage, evidence traces,
verification routes, ambiguity, conflicts, and weak coverage.

### Command Tier Depth

Tier determines how deeply the workflow must continue through the returned bundle
and minimal live reads after the minimum gate, not whether it may skip cognition-runtime consumption.

- `trivial`: minimum required artifact set only
- `light`: minimum artifact set plus relevant routing or playbook artifacts
- `heavy`: minimum artifact set plus all relevant collaboration, propagation, and verification artifacts

### Freshness

Treat runtime freshness as a gate:

- `missing` -> block and refresh through `sp-map-scan -> sp-map-build`
- `stale` -> block and refresh through `sp-map-update`
- `stale` with changed paths missing from `path_index` -> block and rebuild through `sp-map-scan -> sp-map-build`; repeating `sp-map-update` cannot create absent path coverage
- `support_drift` -> stop and tell the user to resolve support-surface drift; do not reflexively route to `sp-map-update`
- `partial_refresh` -> tell the user the refresh was recorded but readiness did not pass; follow `recommended_next_action`
- `possibly_stale` -> inspect the returned affected scope; if the touched area is not safely covered, route through `sp-map-update`

Preserve the distinction between the machine freshness field and public state
guidance: consume `freshness` as the factual state and use
`recommended_next_action` for the operator-facing next step.

### Primary Read Restriction

Do not treat handbook-first or layered project-map files as the primary runtime read surfaces. If query-returned
coverage is insufficient, refresh the cognition runtime through `sp-map-update`; reserve `sp-map-scan -> sp-map-build` for missing, unusable, schema-incompatible, explicitly rebuilt, or architecture-replaced baselines
instead of forcing a second handbook traversal phase.

**This command tier: light.** Pass the cognition gate before investigation
moves into reproduction, logs, tests, or source-code reads.

## Debug Cognition Gate

**Project cognition gate:** query the active project's runtime before broad
repository reads.

Run or emulate:

```text
uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition lexicon --intent debug --query=\"$ARGUMENTS\" --format json
# Agent: generate <query_plan_json> from raw user intent plus returned map terms.
uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition query --intent debug --query-plan \"<query_plan_json>\" --format json
```

Use the returned readiness:

- `ready`: continue with the returned task-local bundle.
- `review`: perform only the returned `minimal_live_reads` before continuing.
- `ambiguous`: ask the user to select the intended candidate.
- `needs_update`: route through `$sp-map-update`.
- `needs_rebuild`: route through `$sp-map-scan`, then `$sp-map-build`.
- `blocked`: stop and report the blocking runtime issue.
- **CARRY FORWARD**: Write the selected capability or symptom, evidence routes,
  minimal reads, competing truths, and unresolved coverage gaps into debug
  session state before making root-cause claims.

## Investigation Protocol

### Intake Inputs
- Read `.planning/debug/[slug].md` before each resumed action; treat it as the investigation source of truth.
- Query project cognition with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition lexicon --intent debug --query=\"$ARGUMENTS\" --format json`, then generate a query_plan from returned map terms, then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition query --intent debug --query-plan \"<query_plan_json>\" --format json` before trusting existing brownfield routing assumptions.
- If truth ownership, competing truths, stale assumptions, or contradiction signals remain ambiguous, perform only the returned `minimal_live_reads` before continuing.
- [AGENT] If cognition freshness is `missing`, stop and tell the user to run `$sp-map-scan`, then `$sp-map-build`; wait for that rebuild before root-cause analysis continues.
- [AGENT] If cognition freshness is `stale`, stop and tell the user to use `$sp-map-update`; wait for that refresh before root-cause analysis continues.
- [AGENT] If cognition freshness is `support_drift`, stop and tell the user to resolve support-surface drift; do not reflexively route to `$sp-map-update`.
- [AGENT] If cognition freshness is `partial_refresh`, stop and tell the user the refresh was recorded but readiness did not pass; follow `recommended_next_action`.
- [AGENT] If cognition freshness is `possibly_stale`, inspect the changed paths, reasons, and slice coverage. Use `$sp-map-update` with the changed paths; rebuild through `$sp-map-scan`, then `$sp-map-build` only when the baseline is missing, unusable, schema-incompatible, explicitly requested for rebuild, or invalidated by broad architecture replacement.
- Treat task-relevant cognition coverage as insufficient when the failing area is named only vaguely, lacks ownership or placement guidance, or lacks workflow, constraint, integration, or regression-sensitive testing guidance.
- [AGENT] If task-relevant cognition coverage is insufficient for the failing area, stop and tell the user to refresh through `$sp-map-update` with changed paths or affected surfaces; rebuild through `$sp-map-scan`, then `$sp-map-build` only when the baseline is missing, unusable, schema-incompatible, explicitly being rebuilt, or invalidated by broad architecture replacement; wait for that refresh before root-cause analysis continues.
- Use the debug cognition slice to identify likely truth-owning layers, adjacent workflows, and observability entry points before forming a hypothesis.
- Read `.specify/memory/constitution.md` if present before forming or validating a fix so the investigation honors project-level MUST/SHOULD constraints.
- Read `.specify/memory/project-rules.md` if present before forming or validating a fix.
- Read `.specify/memory/learnings/INDEX.md` if present before forming or validating a fix.
- Open only linked learning detail docs relevant to the failing area so repeated pitfalls, recovery paths, and project constraints are not rediscovered from scratch.
- The causal map is produced by a **think subagent** (dispatched automatically by the graph engine at Stage 1A). The constraints below apply to that subagent, not to the leader.
- During observer framing, the think subagent must not read source files, test files, log files, or feature-specific planning artifacts such as `spec.md`, `plan.md`, `tasks.md`, or `context.md`.
- The think subagent must not read test files or test outputs; save those for the investigator phase.
- The think subagent must not inspect logs or runtime output; keep the analysis at the system-map level.
- The think subagent must not run reproduction commands, test commands, or instrumentation.
- The think subagent uses only the user report plus the current system map to reason about likely owning layers, truth owners, workflow boundaries, and possible failure loops.
- If critical information is still missing during observer framing, ask at most one concise missing-information question before moving on.

## Pre-Analysis Protocol

Shared "understand before acting" framework. Used by sp-specify and sp-debug.
Each command defines only its specialized phases; this format is the common output.

### Required Output Fields

- **Scope boundary**: What is in scope? What is explicitly out of scope?
- **Key constraints**: What must not change? What invariants must hold?
- **Affected surface area**: Which modules, files, APIs, or contracts are touched?
- **Known unknowns**: What is unclear? What needs verification before proceeding?
- **Recommended next step**: Based on the analysis, what is the safest next action?

### Inter-Command Recognition

If a pre-analysis output already exists from a prior command (e.g., sp-specify completed before sp-debug), read that output. Do not re-analyze the same surface. Add only the specialized analysis your command requires.

### Debug Note

`sp-debug` now uses a project-map-backed intake contract by default and deep Stage 1A/1B intake as fallback. Do not use this shared partial to justify bypassing the debug workflow's completed intake fields. Reproduction, log review, test inspection, source-code reads, evidence collection, and fixing still wait on the canonical intake artifacts described by the debug workflow itself.

## Mandatory Intake Contract

All new `sp-debug` sessions follow this default intake path:

`Project Cognition Query -> Map-Backed Minimum Intake -> Evidence Investigation -> Fixing -> Verifying -> Human Verify`

Deep fallback path:

`Stage 1A Causal Map -> Stage 1B Investigation Contract + Log Investigation Plan -> Evidence Investigation -> Fixing -> Verifying -> Human Verify`

Canonical stage map:

- `Default Intake: Map-Backed Minimum Intake`
- `Stage 1A: Causal Map`
- `Stage 1B: Investigation Contract + Log Investigation Plan`
- `Stage 2: Evidence Investigation`
- `Stage 3: Fix`
- `Stage 4: Verify`

Do not enter reproduction, log review, test inspection, source-code reads, evidence collection, or fixing until the session records all of the following:

- `causal_map_completed: true`
- `investigation_contract_completed: true`
- `log_investigation_plan_completed: true`
- `observer_framing_completed: true`

Repeated failure does not reopen observer-shape choices. It upgrades downstream investigation strength only, including `root_cause` mode and stronger instrumentation requirements.

### Default Intake: Map-Backed Minimum Intake

- Use the returned project cognition task-local bundle as the default intake source when readiness is `ready` or `review`.
- Write the selected capability/symptom, route pack, returned `minimal_live_reads`, competing truths, and coverage gaps into the debug session before source-level work.
- Generate the smallest sufficient intake package:
  - primary map-backed candidate,
  - materially different contrarian candidate,
  - first probe,
  - existing logs or command output to inspect,
  - candidate-separating signals,
  - nearest-neighbor related-risk target.
- Set `causal_map_completed: true`, `investigation_contract_completed: true`, `log_investigation_plan_completed: true`, and `observer_framing_completed: true` from this package only when the map clearly names an owner, boundary, or minimal read path.
- Record `skip_observer_reason: map-backed-minimum-intake` when the deep Stage 1A/1B subagents are not needed.
- Do not use broad repository reads to compensate for a vague map. If the query bundle lacks ownership, placement, constraints, regression-sensitive tests, or minimal reads, route to `$sp-map-update` or use the deep fallback below.

### Deep Fallback Intake

### Stage 1A: Causal Map (Think Subagent)

- This stage is **fallback/deep mode**, not the normal map-backed path. The graph engine (GatheringNode) will return an `await_input` containing a `think_subagent_prompt` when `causal_map_completed` is not yet `true`.
- **Leader's responsibility**: When you receive the `think_subagent_prompt`:
  1. Dispatch a think subagent with the exact prompt text (use your runtime's subagent dispatch mechanism).
  2. Wait for the subagent's structured result.
  3. The result is hybrid: free-text analysis followed by `---` and a YAML block.
  4. Parse the YAML block after `---` and populate `causal_map`, including `dimension_scan` and `candidate_board`.
  5. Set `causal_map_completed: true`.
- The think subagent produces a causal map based on the user report plus the current system map. It does NOT read source code, logs, or run commands.
- The causal map must include:
  - `symptom_anchor`
  - `closed_loop_path`
  - `break_edges`
  - `bypass_paths`
  - `family_coverage`
  - `candidates`
  - `adjacent_risk_targets`
  - `dimension_scan`
  - `candidate_board`
- The causal map candidates are the widened alternative cause candidates for the observer-framing phase.
- Cover at least 3 failure families.
- Produce at least 3 candidates.
- Produce at least 3 alternative cause candidates.
- Each family must include a falsifier, not just a plausible guess.
- Stage 1A is still intake-only fallback work: no source-code reads, test reads, log reads, or repro commands are allowed while `observer_framing_completed` is not `true`.

### Stage 1B: Investigation Contract + Log Investigation Plan

- After Stage 1A completes in fallback/deep mode, Gathering returns an `await_input` containing `contract_subagent_prompt`.
- **Leader's responsibility**: When you receive `contract_subagent_prompt`:
  1. Dispatch a contract-planner subagent with the exact prompt text.
  2. Wait for the structured result.
  3. Parse the YAML block after `---` and populate `observer_framing`, `transition_memo`, `investigation_contract`, and top-level `log_investigation_plan`.
  4. Set `investigation_contract_completed: true` and `log_investigation_plan_completed: true`.
  5. Set `observer_framing_completed: true` only after Stage 1A and Stage 1B artifacts are present.
- The contract planner does not widen the hypothesis space. It converts the causal map into:
  - `primary suspected loop`
  - `primary_candidate`
  - `contrarian_candidate`
  - `candidate_queue`
  - `related_risk_targets`
  - `transition_memo`
  - `top_candidates`
  - `log_investigation_plan`
- The contract planner must preserve candidate-board ordering and runtime-log intent instead of collapsing them into a generic probe note.
- Stage 1B must still leave the session with a clear `contrarian candidate`, a `recommended first probe`, and a transition memo that can automatically continue into evidence investigation.

### Stage 2: Evidence Investigation

- The transition memo is produced by the contract-planner subagent as part of its YAML output (included in the `---` block).
- **Leader's responsibility**: After parsing the contract-planner result, populate `transition_memo` fields: `first_candidate_to_test`, `why_first`, `evidence_unlock`, and `carry_forward_notes`.
- After writing the Stage 1B package, automatically continue into evidence investigation. Do not stop for confirmation unless human action is required.
- Treat the transition memo as the bridge between the outsider view and the investigator view. The later evidence phase must carry the observer framing forward instead of discarding it.

### Observer Gate
- Before evidence investigation begins, verify all of the following in the debug session:
  - `causal_map_completed: true`
  - `investigation_contract_completed: true`
  - `log_investigation_plan_completed: true`
  - `observer_framing_completed: true`
  - `Causal Map` contains `dimension_scan`, `candidate_board`, family coverage, and falsifiers
  - `Observer Framing` contains the required outsider-analysis fields
  - `Transition Memo` contains `first_candidate_to_test`, `why_first`, and at least one `evidence_unlock` entry
  - `Investigation Contract` contains `primary_candidate_id`, `candidate_queue`, and related-risk targets
  - `Log Investigation Plan` contains existing log targets, candidate signal mapping, and observability escalation guidance
- If any observer-gate item is missing, return to Stage 1 or Stage 2 instead of reading code, logs, tests, or running reproduction.
- No source-code reads, test reads, log reads, or repro commands are allowed while `observer_framing_completed` is not `true`.

### Stage 3: Reproduction Gate
- Capture expected behavior, actual behavior, reproduction steps, and observed errors in the session file before running the first repro.
- Confirm that the bug is reproducible through a command, script, or explicit manual sequence.
- If reproduction is not yet verified, stop and gather what is missing before theorizing.

### Stage 4: Log Review
- Inspect existing logs, error output, and test output before changing code.
- Logs are a first-class evidence source and existing logs come first.
- Treat logs as evidence, not background noise: if a log line materially changes the hypothesis space, record it in the session `Evidence` section with its source path/command.
- Identify whether the current observability already shows:
  - where the failure occurs,
  - which inputs or branches matter,
  - what external dependencies returned,
  - and what state changed immediately before failure.
- Read the active feature's `spec.md`, `plan.md`, and `tasks.md` when available to recover intended behavior, locked planning decisions, and implementation boundaries relevant to the bug.
- If `context.md` exists for the active feature, read it before proposing a fix so locked decisions, canonical references, and user-signaled constraints are not bypassed during debugging.
- For runtime bugs, use the investigation contract's `log_investigation_plan` log investigation plan to decide:
  - which existing log targets to inspect first,
  - which candidate-specific signals should appear there,
  - whether logs are sufficient,
  - and whether instrumentation or a user log request must happen before fixing.

### Required Framing Before Hypothesis
- Before committing to a root-cause theory, write a **Truth Ownership Map** in the debug session:
  - which layer owns the decision truth,
  - which layers only reflect or cache it,
  - and what evidence supports that ownership claim.
- Split state into **Control State** and **Observation State**:
  - `Control State` covers counters, queues, admission sets, scheduler slots, ownership sets, and other values used to make decisions.
  - `Observation State` covers UI status, logs, task tables, snapshots, event streams, and other externally visible projections.
- Write the expected **Closed Loop** in the session file:
  - input event -> control decision -> resource allocation -> state transition -> external observation
- Prefer hypotheses that explain the control-plane truth, not just the visible symptom layer.

### Stage 5: Observability Assessment
- If the current logs cannot answer those questions, treat observability as insufficient.
- During `investigating`, you may add or refine diagnostic logging, tracing, or instrumentation, then rerun the reproduction or tests to collect stronger evidence.
- If logs are insufficient during a runtime bug investigation, you cannot directly enter fixing until the work either extracts decisive signals from existing logs or records an instrumentation / user log request escalation.
- Prefer diagnostic logging that clarifies boundaries, inputs, branches, outputs, and state transitions.
- Prefer **decisive signals** over broad debug noise:
  - queue contents,
  - ownership sets,
  - running/admitted collections,
  - resource counters,
  - and the exact handoff points between decision layers.
- Bias your instrumentation to the active problem profile when one is apparent:
  - **scheduler/admission**: queues, running/admitted sets, slot counters, promotion handoffs
  - **cache/snapshot drift**: authoritative state versus cached state, invalidation timing, refresh paths
  - **UI projection**: source-of-truth state, publish boundary, transformed view-model state, render/polling output
- For runtime bug investigations where the leader cannot access the needed logs directly, produce a concrete user log request packet before fixing. Include the time window, target system, identifiers or correlation keys, exact log sources, and the expected candidate-separating signals.
- If two hypothesis/experiment cycles fail to converge, escalate observability explicitly. Add instrumentation that can directly falsify the remaining competing explanations instead of applying another surface-level fix.

### Stage 6: Hypothesis Formation
- Form one specific, falsifiable hypothesis from the evidence.
- Record the hypothesis, the test to run, and the expected result in `Current Focus`.
- State how the hypothesis relates back to the observer framing board: does it confirm, refine, or eliminate one of the observer candidates?
- State why the hypothesis targets the owning layer or control state rather than a downstream projection.

### Stage 7: Experiment Loop
- Run one experiment for the active hypothesis.
- Append the observed result to `Evidence`.
- If the result disproves the hypothesis, append it to `Eliminated` and return to Stage 5.
- If the result confirms the failure mechanism, record the root cause and continue to fixing.
- Before leaving this stage, record which plausible causes were considered and which were ruled out so the session shows real causal spread instead of a single-path guess.
- Record any **rejected surface fixes** that improved symptoms without restoring the control loop, so future resumes do not mistake symptom relief for root-cause resolution.

### Stage 8: Root Cause Confirmation
- Before entering fixing, be able to explain:
  - what failed,
  - why it failed,
  - why the active hypothesis is stronger than the eliminated alternatives,
  - which layer owned the broken truth,
  - which decisive signals ruled out the competing explanations,
  - whether the issue was in control state, observation state, or the boundary between them,
  - and what behavior change should resolve the full loop instead of only a local inconsistency.
- Record explicit causal coverage before fixing:
  - `alternative_hypotheses_considered`
  - `alternative_hypotheses_ruled_out`
  - `root_cause_confidence`
- Use `root_cause_confidence: confirmed` only when the current explanation is stronger than the ruled-out alternatives and the decisive signals directly support it.
- Record the root cause in structured form:
  - `summary`
  - `owning_layer`
  - `broken_control_state`
  - `failure_mechanism`
  - `loop_break`
  - `decisive_signal`

## Capability-Aware Investigation

- During `investigating`, the current candidate queue is the execution contract for the stage. The leader should not drift into unrelated freeform probing while the active primary candidate is still unresolved.
- Candidate queue entries must be consumed explicitly: confirm them, rule them out, or deprioritize them with evidence. Do not let high-priority candidates silently disappear from the session.

- During `investigating`, determine whether the current investigation has one or more safe evidence-collection lanes before running multiple independent evidence-gathering actions sequentially.
- [AGENT] Use the shared policy function with the current capability snapshot: `choose_subagent_dispatch(command_name="debug", snapshot, workload_shape)`.
- Persist the decision fields exactly: `execution_model: subagent-mandatory`, `dispatch_shape: one-subagent | parallel-subagents`, `execution_surface: native-subagents`.
- Treat runtime safety as a dispatch-blocking decision. If a validated evidence lane cannot be packetized or dispatched safely, use `subagent-blocked` and stop instead of widening brittle native fan-out.
- Debug routing decision order:
  - One safe validated evidence lane -> `one-subagent` on `native-subagents` when available.
  - Two or more independent evidence lanes -> `parallel-subagents` on `native-subagents` when available.  - No safe lane, shared mutable state, missing contract, incomplete packet, or unavailable delegation -> `subagent-blocked` with a recorded reason.
- Dispatch that single subagent only when the evidence-lane contract is complete: probe intent, required evidence, authoritative inputs, and validation targets must all be recorded before dispatch.
- If that subagent-readiness bar is not met, compile the missing evidence-lane contract before dispatch; if the lane cannot be made safe, record `subagent-blocked` and stop for escalation or recovery.
- `parallel-subagents` means the leader dispatches bounded evidence-gathering subagents and rejoins at an explicit join point.
- `native-subagents` means the leader uses the current runtime native subagent surface for dispatched evidence lanes.
- The durable team workflow remains separate from ordinary debug dispatch and is not the execution surface for this command.
- Suitable subagent tasks include:
  - running targeted tests or repro commands,
  - collecting logs and exit codes,
  - searching for error text,
  - tracing isolated code paths,
  - comparing independent modules or configurations,
  - assessing whether existing logs are sufficient,
  - and gathering output after temporary or durable diagnostic logging has been added.
- Keep the debug session leader-led: subagents return facts, command results, and observations for the current hypothesis.
- Subagents must not redo observer framing from scratch; they inherit the observer framing and transition memo as the current outsider model.
- Subagents must not mutate the debug session state, declare the root cause final, or archive the session.
- Before dispatching subagent investigation work, update the debug file to reflect the exact current focus and what evidence is being gathered next.
- Use `.specify/templates/worker-prompts/debug-investigator.md` as the default evidence-collector contract whenever the current integration can dispatch a debug subagent.
- If the current runtime supports structured subagent results, prefer a stable evidence payload over freeform summaries so the leader can merge findings without reinterpretation.
- If the current integration exposes a runtime-managed result channel, use that channel. Otherwise write the normalized evidence/result envelope to `.planning/debug/results/<session-slug>/<lane-id>.json`
- When the local CLI is available and no runtime-managed result channel exists, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify result path` to compute the canonical handoff target and `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify result submit` to normalize and write the evidence/result envelope.
- Preserve `reported_status` when normalizing subagent language such as `DONE_WITH_CONCERNS` or `NEEDS_CONTEXT` into canonical orchestration state.
- Idle subagent is not an accepted result.
- [AGENT] The leader must wait for and consume the structured handoff before closing the join point, declaring completion, requesting shutdown, or interrupting subagent execution.

## Debug File Protocol

- **Location**: `.planning/debug/[slug].md`
- **causal_map_completed**: `false` until the Stage 1A causal map, dimension scan, and candidate board are written.
- **investigation_contract_completed**: `false` until the Stage 1B investigation contract is written.
- **log_investigation_plan_completed**: `false` until the Stage 1B log investigation plan is written as its own section.
- **observer_framing_completed**: `false` until the canonical intake package is complete.
- **legacy_session_needs_reintake**: `true` only when a resumed legacy session cannot safely satisfy the canonical intake gate.
- **Current Focus**: OVERWRITE on every update. Reflects exactly what the leader is doing now.
- **Evidence**: APPEND confirmed findings only.
- **Eliminated**: APPEND disproven theories only.
- **Update Rule**: Update the file before taking an action.
- No source-code reads, test reads, log reads, or repro commands are allowed while `observer_framing_completed` is not `true`.

The session file must always make it clear:
- what the observer framing concluded,
- what the active hypothesis is,
- what experiment is being run,
- why the current logs are sufficient or insufficient,
- which layer owns the relevant truth,
- which state is control state versus observation state,
- where the closed loop is currently believed to break,
- and what the next action is if the session resumes later.

## Fix and Verify Protocol

- Enter `fixing` only after the root cause is confirmed.
- Write a failing automated repro test before changing production code.
- Do not modify production behavior until the RED state is proven.
- If no reliable automated test surface exists for the failing behavior, add the missing harness first or route through `/sp-quick` or `/sp-specify` before code changes.
- Apply the minimum code change needed to address that root cause.
- Fix the owning control-plane failure first. Do not treat a UI/status smoothing change as sufficient unless the closed loop is proven healthy end-to-end.
- Classify the fix before verification:
  - write the classification to `fix_scope`
  - `truth-owner`
  - `control-boundary`
  - `observation-boundary`
  - `surface-only`
- `surface-only` means the change smooths or hides the symptom without repairing the owning truth or the broken handoff. A `surface-only` fix cannot satisfy the debug contract.
- After changing code, rerun:
  - the reproduction path,
  - the most relevant tests,
  - and any logging-enhanced repro flow needed to prove the mechanism changed.
- Verify the full control loop, not only one function or field:
  - triggering input,
  - control decision,
  - resource allocation,
  - resulting state transition,
  - and external observation.
- Record `loop_restoration_proof` before moving to `resolved`. This loop restoration proof should show why the full loop is healthy now, not merely why one surface looks better.
- If verification fails, return to `investigating` with updated evidence. Do not keep layering fixes without updating the hypothesis.
- If automated verification or human verification fails repeatedly without producing a stronger causal explanation, stop the local fix loop and create or refresh `.planning/debug/[slug].research.md` before another code change.
- Use that debug-local research checkpoint to record the missing contract facts, environment assumptions, external references, or repository evidence needed to break the loop.
- Treat the returned `project-cognition query` bundle and readiness as the truth source for brownfield debug runtime coverage; use only returned `minimal_live_reads` when needed.
- Before moving to `awaiting_human_verify` or `resolved`, record `changed_code_paths` with modified, added, deleted, and renamed paths; `changed_behavior_surfaces` for affected commands, APIs, templates, generated assets, state files, tests, docs, validators, packets, or runtime assumptions; `verification_evidence`; and `project_cognition_refresh` recommending `$sp-map-update` with those changed paths whenever project cognition might be affected.
- If the fix changed truth-owning surfaces, shared surfaces, command/route/contract boundaries, verification entry points, runtime assumptions, or other cognition coverage facts, and verification is truthfully green and no explicit blocker prevents completion, refresh the project cognition runtime through `$sp-map-update` using the changed paths before moving to `awaiting_human_verify` or `resolved`. Do not rebuild for ordinary uncertain closure; `sp-map-update` records partial/low-confidence facts, known unknowns, and `minimal_live_reads`. Rebuild through `$sp-map-scan`, then `$sp-map-build` only when the baseline is missing, unusable, schema-incompatible, explicitly requested for rebuild, or invalidated by broad architecture replacement; then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition validate-build --format json` and `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition complete-refresh --format json` only when build acceptance passes.
- If that refresh cannot be completed now, use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition mark-dirty --reason \"<reason>\" --format json` as the manual override/fallback and tell the user to run `$sp-map-update` with the changed paths before later brownfield work proceeds, escalating to `$sp-map-scan`, then `$sp-map-build` only for the explicit rebuild conditions above.
- [AGENT] Resolved debug sessions should auto-capture reusable lessons from the persisted debug session state into index/detail entries.
- [AGENT] If you are finalizing outside the normal debug CLI closeout path, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify learning capture-auto --command debug --session-file .planning/debug/[slug].md --format json`.
- [AGENT] If the auto-capture pass produced no captured lesson but you still discovered a reusable `pitfall`, `recovery_path`, or `project_constraint`, use the manual `learning capture` helper surface to create or merge an index/detail entry.
  Required options: `--command`, `--type`, `--summary`, `--evidence`
- [AGENT] Before leaving the debug session in a terminal state, apply the Learning Reflex and record any reusable `pitfall`, `recovery_path`, `tooling_trap`, `false_lead_pattern`, or `project_constraint` in `.specify/memory/learnings/INDEX.md` plus a linked detail document when durable state did not already preserve it.
- Treat one-off findings as no reusable lesson; store reusable lessons as index/detail entries, and use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify learning promote --target learning ...` only after explicit confirmation or proven recurrence.
- Only ask for confirmation when a new learning is highest-signal, such as an explicit user default, clear cross-stage reuse, or repeated recurrence that should become shared project memory.

## Checkpoint Protocol

Return a `## CHECKPOINT REACHED` block when user action or confirmation is required.

- **Type**: `human-verify`, `human-action`, or `decision`
- **Progress**: concise summary of the root cause, key evidence, and eliminated hypotheses
- **Awaiting**: exactly what the user must do next

Use `human-verify` after the agent has verified the fix and needs the user to confirm the bug is resolved in their environment.

To begin the debug session:
`EXECUTE_COMMAND: debug`

## Codex Investigation Routing Contract

When running `sp-debug` in Codex, treat the `investigating` stage as a leader-led `subagents-first` routing decision.
- Dispatch shape: `parallel-subagents` for independent evidence lanes, or `subagent-blocked` with a recorded reason when delegation is unavailable or unsafe.
- Execution surface: `native-subagents` first, `managed-team` only when durable team state is needed, and `leader-inline` only as fallback.
- Subagent dispatch: No subagent dispatch path for this session.
- Integration-native join point: Stay on the leader path or use the managed team workflow.
- Fallback path: No managed team workflow is currently available; use leader-inline fallback only when subagents cannot proceed safely.
- If there are two or more independent evidence-gathering lanes, dispatch subagents whenever the current runtime can support it safely.
- Suitable subagent tasks include running targeted tests or repro commands, collecting logs and exit codes, searching for error text, tracing isolated code paths, and gathering evidence after diagnostic logging has been added.
- Read `diagnostic_profile` from the debug session before choosing subagent lanes.
- Subagents must return facts, command results, and observations; they must not update the debug file, declare the root cause final, or transition the session state.
- Keep fixing, verification, `awaiting_human_verify`, and final session resolution on the leader path.

## Codex Subagent Dispatch Contract

- Execution model: `subagents-first`
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`
- Delegation surface contract: preserve the native dispatch, fallback, worker result contract, and handoff path below.
- Native subagent dispatch: No subagent dispatch path for this session.
- Join behavior: Stay on the leader path or use the managed team workflow.
- Managed-team fallback: No managed team workflow is currently available; use leader-inline fallback only when subagents cannot proceed safely.
- Leader-inline fallback: record the reason before local execution.
- Worker result contract: Fact-only evidence payload: hypothesis tested, commands run, files inspected, observations, confidence, blocker.
- Result contract: Fact-only evidence payload: hypothesis tested, commands run, files inspected, observations, confidence, blocker.
- Result handoff path: .specify/teams/state/results/<request-id>.json

## Codex Subagent Result Contract

- Worker result contract: preserve the shared `WorkerTaskResult` semantics even when the runtime calls lanes subagents.
- Preferred result contract: Fact-only evidence payload: hypothesis tested, commands run, files inspected, observations, confidence, blocker.
- Result file handoff path: .specify/teams/state/results/<request-id>.json
- Normalize subagent-reported statuses like `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, and `NEEDS_CONTEXT` into the shared `WorkerTaskResult` contract before the leader accepts the handoff.
- Keep `reported_status` when normalization occurs so runtime-specific subagent language can be reconciled with canonical orchestration state.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Treat `DONE_WITH_CONCERNS` as completed work plus follow-up concerns, not as silent success.
- Treat `NEEDS_CONTEXT` as a blocked handoff that must carry the missing context or failed assumption explicitly.

## Codex Structured Question Preference

- If the runtime's native structured question tool is available for the current turn, you must use it.
- Do not render the textual fallback block when the native tool is available.
- Do not self-authorize textual fallback because the question seems simple, short, or easy to phrase manually.
- Treat the template's textual question format as fallback-only guidance; use it to shape the question content, but do not render the textual block unless the native tool is unavailable in the current runtime or the tool call fails.
- Ask only the minimum number of questions required by this workflow's existing contract.
- Keep the user-visible question text in the user's current language and keep option labels short.
- Do not emit both a native tool question and the textual fallback block in the same turn. The user should see the active question exactly once.
- If the native tool is unavailable in the current runtime or the tool call fails, ask one concise missing-information question in plain text during observer framing before entering reproduction work.
- In `debug`, use this preference for:
  - missing-information questions during map-backed intake
  - deep Stage 1A/1B fallback when project cognition is insufficient
- Native tool target: `request_user_input` if the current Codex runtime exposes it
- Question count: 1-3 short questions per call
- Option count: 2-3 options per question
- Required question fields: `header`, `id`, `question`, `options`
- Option fields: `label`, `description`
- Put the recommended option first and suffix its label with `(Recommended)` when that distinction matters.
- Use this native surface for one bounded clarification or selection step; if it is unavailable or too narrow for the needed interaction, fall back immediately to the template's textual question format.

## Codex Subagent Evidence Collection

When running `sp-debug` in Codex, treat the `investigating` stage as leader-led `subagents-first` evidence collection.
- Use `parallel-subagents` on `native-subagents` when there are two or more independent evidence-gathering lanes.
- Use `subagent-blocked` only after recording why evidence delegation is unavailable, unsafe, or not packetized.
- If there are two or more independent evidence-gathering lanes, dispatch subagents through `spawn_agent` instead of doing manual sequential investigation.
- Suitable subagent tasks include running targeted tests or repro commands, collecting logs and exit codes, searching for error text, tracing isolated code paths, and gathering evidence after diagnostic logging has been added.
- Read `diagnostic_profile` from the debug session before choosing subagent lanes.
- The leader **MUST** update the debug file's `Current Focus` before dispatching subagents and treat subagent work as evidence collection for the current hypothesis.
- The think-subagent output is an investigation contract, not advisory prose.
- The investigating stage must consume the candidate queue and primary candidate before freeform fixes begin.
- After two automated verification failures, switch the session into root-cause mode and stop layering point fixes.
- Do not close the session until nearest-neighbor related risk targets have been reviewed.
- Subagents must return facts, command results, and observations; they must not update the debug file, declare the root cause final, or transition the session state.
- Wait for every subagent's structured handoff before accepting the join point or changing the investigation stage.
- Wait for every delegated lane's structured handoff before accepting the join point or changing the investigation stage.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the evidence lane is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Use `wait_agent` only after the current investigation fan-out reaches its join point.
- Use `close_agent` after integrating finished subagent results.
- Do not resolve the session directly from successful automated verification. Successful automated verification must hand off into formal human verification.
- If human feedback reports another problem, classify it as `same_issue`, `derived_issue`, or `unrelated_issue`.
- Default to `same_issue` unless strong evidence proves the other classes.
- Keep fixing, agent verification, `awaiting_human_verify`, and final session resolution on the leader path.
