---
name: "sp-quick"
description: "Use when a task is small but non-trivial and needs lightweight tracked planning, validation, or resumable execution outside the full workflow."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/quick.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: The task is too large or risky for `sp-fast` but does not justify the full `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify -> plan -> tasks -> implement` flow.
- **Primary objective**: Keep the task resumable and tracked while applying only the minimum planning, research, and validation depth it needs.
- **Primary outputs**: `.planning/quick/<id>-<slug>/STATUS.md`, quick-task summary artifacts, and the scoped implementation changes for the task.
- **Default handoff**: Resume the quick task until resolved, or escalate to /sp.specify if the scope grows into multi-capability or acceptance-criteria-heavy work.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Execute a small, ad-hoc task through a lightweight planning and validation path without entering the full `specify -> plan -> tasks` workflow.

This command will skip the full feature-spec workflow while preserving lightweight planning and verification.

Use this for work that is too large for `sp-fast` but still too small or too well understood to justify a full spec flow: small bug fixes, small features, focused UX adjustments, template tweaks, or narrow CLI behavior changes.

## Context

- Primary inputs: the user's request, quick-task workspace state, passive learning files, the task-local project cognition query bundle with readiness and returned `minimal_live_reads`, and the smallest workflow-local state files needed for the touched area.
- The leader owns `STATUS.md`, lane selection, join points, validation, and final summary state.
- Quick mode is the resumable middle lane between `sp-fast` and the full specification workflow.
- Continue in quick only when any `CA-###` consequence obligations are bounded in `STATUS.md` with affected objects, lifecycle states, dependency impact, recovery/validation proof, coverage gaps, and stop-and-reopen conditions.

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

## Dispatch Mode

Dispatch mode follows command tier, not a uniform rule.

| Tier | Dispatch Mode | Rule |
|------|---------------|------|
| trivial | leader-direct | No subagent dispatch. Leader performs and verifies the change directly. |
| light | subagent-preferred | Dispatch to one subagent; leader-inline fallback allowed if dispatch unavailable. |
| heavy | subagent-mandatory | Must dispatch. If dispatch unavailable, record reason and escalate. |

### Fallback (light tier only)

When subagent dispatch is unavailable for a light-tier command:
1. Record the reason in workflow state
2. Switch to `execution_surface: leader-inline`
3. Proceed with the same scope and verification gates

This is a designed fallback path, not an exception.

**This command tier: light. Dispatch mode: subagent-preferred.**

Dispatch one safe validated lane as `one-subagent` or multiple safe isolated lanes as `parallel-subagents`; otherwise record `subagent-blocked` with the concrete reason and stop for escalation or recovery.


## Leader Role

- You are the workflow leader and orchestrator.
- You own routing, task splitting, task contracts, dispatch, join points, integration, verification, and state updates.
- Subagents own the substantive task lanes assigned through task contracts.
- You are the quick-task leader. You own scope control, `STATUS.md`, lane selection, validation, and the final summary artifact.
- You are not the default implementer for the quick task; substantive task work belongs on subagent lanes once scope and contracts are locked.
- Use `execution_model: subagent-mandatory` once the quick task has a bounded execution lane.
- Dispatch `one-subagent` for one safe delegated lane and `parallel-subagents` for isolated lanes that can run concurrently.
- Compile a validated `WorkerTaskPacket` or equivalent execution contract before dispatch.

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

**Project cognition gate:** query the active project's runtime before broad
repository reads.

Run or emulate:

```text
uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition lexicon --intent implement --query=\"$ARGUMENTS\" --format json
# Agent: generate <query_plan_json> from raw user intent plus returned map terms.
uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition query --intent implement --query-plan \"<query_plan_json>\" --format json
```

Use the returned readiness:

- `ready`: continue with the returned task-local bundle.
- `review`: perform only the returned `minimal_live_reads` before continuing.
- `ambiguous`: ask the user to select the intended candidate.
- `needs_update`: route through `$sp-map-update`.
- `needs_rebuild`: route through `$sp-map-scan`, then `$sp-map-build`.
- `blocked`: stop and report the blocking runtime issue.
- **CARRY FORWARD**: Write the selected capability, minimal reads, validation route,
  and known risk into quick-task `STATUS.md` before implementation
  proceeds.

Treat task-relevant coverage as insufficient when the touched area still lacks
ownership, placement, workflow, integration, or verification guidance before
choosing the quick-task lane shape.

## Workflow Quality Requirements

- Confirm project cognition freshness and valid quick-task entry before deeper execution.
- Keep `STATUS.md` current as the durable quick-task source of truth for scope, lane state, blockers, verification, and terminal status.
- Validate each `WorkerTaskPacket` or equivalent execution contract before dispatch and require a structured handoff before accepting delegated work.
- Update durable state before compaction-risk transitions, join points, delegated fan-out, or any stop where resume will depend on more than the visible conversation.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader quick-task context.
- Open only learning detail docs linked from quick-task-relevant index entries.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.

## Scope Gate

Use `sp-quick` when all of these are true:
- The task is bounded and clearly described.
- The work is small but non-trivial.
- A lightweight plan is useful, but a full spec package would be overhead.
- Use this path when you want to skip the full `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify -> plan -> tasks -> implement` workflow for a bounded task.
- The task does not require a new long-lived feature spec under `.specify/features/<feature>/`.

If the task is trivial and local:
- Use `$sp-fast`.

If the task changes architecture, introduces broad product decisions, or needs a durable feature specification:
- Use `$sp-specify`.

If the task is a bug fix or regression but the root cause is still unknown:
- Use `$sp-debug` instead of treating `sp-quick` as a symptom-fix lane.

## Escalation Triggers

Upgrade to `$sp-specify` immediately if:
- The Senior Consequence Analysis Gate triggers and the work needs user-level lifecycle decisions, broad compatibility handling, multi-capability scope, destructive policy, shared-state semantics, downstream consumer negotiation, or acceptance criteria that cannot fit one bounded quick task.
- The task changes architecture or introduces cross-cutting behavior across multiple modules, workflows, or shared surfaces.
- The task touches a change-propagation hotspot, a truth-owning shared surface, or an area whose known unknowns make lightweight planning unsafe.
- The request now spans multiple independent capabilities, release tracks, or user journeys that no longer fit one bounded quick-task workspace.
- The work needs a new durable spec package, a long-lived feature boundary, or planning artifacts intended to survive beyond the quick task.
- The change has rollout, migration, compatibility, or neighboring-workflow impact that must be locked before implementation.
- The expected behavior cannot be stated with concrete acceptance criteria without first doing feature-level requirement alignment.
- The work started as a bug fix, but root-cause analysis is still unresolved, competing causes are still plausible, or the next safe step is diagnostic investigation rather than a bounded repair. In that case, route to `$sp-debug`.

## Quick Consequence Boundary

Continue in quick only when the consequence model is bounded: affected objects are few, lifecycle choices are local, dependency impact is limited, recovery is obvious, validation can run inside the quick-task loop, and every `CA-###` obligation can be recorded in `STATUS.md`.

- If the gate stands down, record the stand-down reason in `STATUS.md`.
- If the gate triggers but remains bounded, record affected objects, state behavior, dependency impact, recovery and validation, project cognition evidence, coverage gaps, and escalation decision before dispatch.
- If consequence analysis reveals user-level lifecycle decisions, broad compatibility handling, multi-capability scope, destructive policy, shared-state semantics, or downstream consumer negotiation, upgrade to `$sp-specify` immediately.
- If the task is a defect and the dependency loop is unknown, use `$sp-debug` rather than resolving consequence semantics inside `sp-quick`.

## Execution Modes

The following flags are available and composable:
- `--discuss`: Do a lightweight clarification pass before planning.
- `--research`: Investigate implementation approaches before planning.
- `--validate`: Add plan checking and post-execution verification.
- `--full`: Equivalent to `--discuss --research --validate`.

## Coordinator Model

- The invoking runtime is the leader for the quick task. It owns scope decisions, the lightweight plan, execution strategy selection, join-point handling, validation, and the final summary artifact.
- The leader should not blur planning, execution, and validation into a long conversational loop when the task can be dispatched through a bounded subagent.
- Constitution first: read `.specify/memory/constitution.md` before workspace setup, clarification, lane selection, subagent dispatch, or local analysis.
- If the project cognition runtime is missing, rebuild it through `$sp-map-scan`, then `$sp-map-build` before `STATUS.md` initialization or touched-area analysis proceeds.
- Before the first subagent is dispatched, the leader may gather only the minimum context needed to choose scope, lane shape, and execution strategy. Do not perform broad repository analysis or implementation design locally before creating `STATUS.md` and selecting the first subagent path.
- Before implementation work starts, identify whether the quick task is best handled by one bounded subagent or by two or more independent subagents that can safely proceed in parallel.
- [AGENT] Use the shared policy function before execution begins and again at each join point: `choose_subagent_dispatch(command_name="quick", snapshot, workload_shape)`.
- Persist the decision fields exactly: `execution_model: subagent-mandatory`, `dispatch_shape: one-subagent | parallel-subagents`, `execution_surface: native-subagents`.
- Treat `snapshot.delegation_confidence` as a runtime/model reliability signal for the current subagent path. If confidence is `low`, prefer the native subagent workflow or record `subagent-blocked` over fragile dispatch.
- Decision order:
  - One safe validated lane -> `one-subagent` on `native-subagents` when available.
  - Two or more safe isolated lanes -> `parallel-subagents` on `native-subagents` when available.  - No safe lane, overlapping writes, missing contract, low confidence, or unavailable delegation -> `subagent-blocked` with a recorded reason.
- Substantive quick-task lanes must use subagent execution once a validated `WorkerTaskPacket` or equivalent execution contract preserves quality. If that readiness bar is not met, compile the missing contract before dispatch; if the contract cannot be made safe, record `subagent-blocked` and stop for escalation or recovery.
- If two or more independent subagent lanes can safely run in parallel and that fan-out materially improves throughput, dispatch multiple subagents instead of serial execution.
- `subagent-blocked` is an exception path, not a strategy choice. Use it only when the current quick-task batch cannot proceed through subagents or the native subagent workflow.
- If subagent-blocked status is used, record the concrete reason in `STATUS.md`, including which subagent path was unavailable or blocked for the current batch.
- The first actionable execution step after scope lock is to dispatch the first subagent batch, not to continue local deep-dive analysis.
- Use `.specify/templates/worker-prompts/quick-worker.md` as the default contract for quick-task subagents so the subagent returns enough state for the leader to keep `STATUS.md` accurate.
- Prefer structured subagent results compatible with the shared `WorkerTaskResult` contract when the current runtime supports them.
- If the current integration exposes a runtime-managed result channel, use that channel. Otherwise write the normalized subagent result envelope to `.planning/quick/<id>-<slug>/worker-results/<lane-id>.json`
- When the local CLI is available and no runtime-managed result channel exists, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify result path` to compute the canonical handoff target and `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify result submit` to normalize and write the subagent result envelope.
- Preserve `reported_status` when normalizing subagent language such as `DONE_WITH_CONCERNS` or `NEEDS_CONTEXT` into canonical orchestration state.
- Idle subagent is not an accepted result.
- The leader must wait for and consume the structured handoff before closing the join point, declaring completion, requesting shutdown, or interrupting subagent execution.

## Quick-Task Workspace Protocol

- Every quick task must have a dedicated id-based workspace under `.planning/quick/<id>-<slug>/`.
- If a matching active workspace already exists, resume it instead of creating a second parallel quick-task directory for the same goal.
- The minimum artifact set is:
  - `STATUS.md`: the source of truth for the current quick-task state.
  - `SUMMARY.md`: the final outcome, `changed_code_paths`, `changed_behavior_surfaces`, verification evidence, residual risk, and `project_cognition_refresh` recommendation.
  - Optional lightweight support artifacts only when needed for the task shape, such as `PLAN.md`, `RESEARCH.md`, or `DISCUSSION.md`.
- `STATUS.md` is the lifecycle source of truth for the quick task. `.planning/quick/index.json` is a derived projection for management and recovery commands.
- The quick-task directory format is `<id>-<slug>`. Do not use slug-only workspace names for the enhanced quick flow.
- Constitution read is the first hard gate. `STATUS.md` initialization comes immediately after it.
- `STATUS.md` must stay compact and overwrite the active state rather than growing into a long log. It must always make these fields obvious:
  - current focus
  - execution strategy
  - active lane or batch
  - join point, if any
  - blocked dispatch or escalation state, if any
  - next action
  - recovery action
  - retry attempts
  - blocker reason
  - blockers, if any
- Update `STATUS.md` before each material phase transition: after scope lock, after planning, before delegation, after each join point, before validation, and before final summary.
- After the constitution gate, `STATUS.md` initialization is the next hard gate. Do not perform substantial repository analysis, implementation design, or code reading beyond scope-lock context until the workspace exists and the first lane is recorded.
- When the quick task completes, preserve `SUMMARY.md` and move resolved state under `.planning/quick/resolved/` if the local project convention prefers archiving over keeping active quick-task folders in place.

## STATUS.md Template

Use this as the default structure for `.planning/quick/<id>-<slug>/STATUS.md`:

```markdown
---
id: [quick-task id]
slug: [quick-task slug]
title: [short quick-task title]
status: gathering | planned | executing | validating | blocked | resolved
trigger: "[verbatim user input]"
execution_model: subagent-mandatory
dispatch_shape: one-subagent | parallel-subagents
execution_surface: native-subagents
created: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Focus
<!-- OVERWRITE on each update -->

goal: [bounded quick-task objective]
current_focus: [what the leader is doing now]
next_action: [immediate next step]

## Execution Intent
<!-- OVERWRITE/REFINE when the lane shape or validation target changes -->

intent_outcome: [the bounded behavior change or recovery target for this quick task]
intent_constraints:
  - [constraints, forbidden drift, or scope boundaries that must stay active]
success_evidence:
  - [the checks or observations required before the quick task can be treated as resolved]
cognition_facts:
  selected_capability: [capability, route, symptom, or unknown]
  minimal_reads:
    - [project-cognition minimal_live_reads entry used before wider inspection]
  validation_route: [test, command, manual check, or unknown]
  known_risk: [ambiguity, weak coverage, forbidden drift, or none]

## Execution
<!-- OVERWRITE/REFINE as the lane or batch changes -->

active_lane: [single lane name or current batch]
join_point: [empty if none]
files_or_surfaces: [primary files, modules, or shared surfaces in play]
blocked_dispatch: [none by default; if subagent-blocked, record why native subagent dispatch was unavailable or unsafe]
blockers: [empty if none]
recovery_action: [next self-recovery step before asking for help]
retry_attempts: [0 if none]
blocker_reason: [empty if none]

## Validation
<!-- OVERWRITE/REFINE as checks complete -->

planned_checks:
  - [smallest meaningful verification command or manual check]
completed_checks:
  - [verification already run]

## Senior Consequence Analysis
<!-- OVERWRITE/REFINE when the gate stands down, triggers, or escalates -->

gate_status: not_evaluated | stand_down | triggered_bounded | escalated
stand_down_reason: [why lifecycle, running-state, destructive, shared-state, downstream-consumer, compatibility, security, or multiple-behavior semantics do not apply]
affected_objects:
  - [object, state surface, consumer, command, API, artifact, or workflow]
state_behavior_matrix:
  - [state -> expected behavior]
dependency_impact:
  - [dependency or consumer -> impact]
recovery_and_validation:
  - [rollback, retry, cleanup, idempotency, observability, or validation requirement]
project_cognition_evidence:
  - [project cognition fact, live read, or coverage source]
coverage_gaps:
  - [gap, owner, latest safe resolve phase, stop-and-reopen condition]
consequence_obligations:
  - [CA-### claim, owner, mapped lane/task/check]
escalation_decision: [stay quick | upgrade to specify | route to debug | blocked]

## Summary Pointer
<!-- OVERWRITE when terminal state is reached -->

summary_path: [.planning/quick/<id>-<slug>/SUMMARY.md]
resume_decision: [resume here | blocked waiting | resolved]
```

## Recovery Routing

- `sp-quick <description>` creates a new quick task.
- Empty `sp-quick` should look for unfinished quick tasks before asking for a new description.
- If exactly one unfinished quick task exists, resume it automatically.
- If multiple unfinished quick tasks exist, ask the user which quick task to continue.
- The selection list should show `id`, title, current status, and `next_action`.
- Treat `gathering`, `planned`, `executing`, `validating`, and `blocked` as unfinished quick-task states for recovery routing.
- If resuming a `blocked` quick task, prioritize `blocker_reason`, `recovery_action`, and `next_action` before widening scope.

## Lifecycle Commands

- `close` controls lifecycle semantics. Use it to place a quick task into `resolved` or `blocked`.
- `archive` controls storage semantics. Use it only after the quick task has already been closed.
- Do not treat archive as an implied synonym for resolved. Closure says what happened; archive says where the closed task now lives.

## Autonomous Execution Contract

- The leader must continue automatically until the quick task is complete or a concrete blocker prevents further safe progress.
- Do not stop after a single edit, single command, or single failed attempt when the next recovery step is obvious and low-risk.
- Dispatch subagents when `snapshot.native_subagents` is true and the workload has one or more safe validated lanes.
- Substantive quick-task lanes must use subagent execution once a validated `WorkerTaskPacket` or equivalent execution contract preserves quality. If that readiness bar is not met, finish compiling the missing contract first; if the contract cannot be made safe, record `subagent-blocked` and stop for escalation or recovery.
- After `STATUS.md` is initialized and the first lane is defined, dispatch that subagent path before doing any further local repository deep dive.
- If multiple safe subagent lanes exist and they can improve throughput without creating write conflicts, dispatch them in parallel instead of artificially serializing the work.
- Use `subagent-blocked` only after subagent execution is concretely unavailable for the current batch and the native subagent workflow is also unavailable or unsuitable.
- Re-evaluate after every join point, recovery step, and validation result instead of assuming the first plan still holds.
- A quick task reaches a terminal state only when `STATUS.md` shows either `resolved` or `blocked`.

## Recovery Before Blocking

- When execution hits friction, attempt the smallest safe recovery step before declaring the task blocked.
- Default recovery order:
  - read additional local context that directly touches the failing area
  - run the smallest meaningful verification or repro command
  - inspect the immediate error output, logs, or failing test result
  - make one focused repair attempt that matches the evidence
  - if uncertainty remains high, use `--research`-style focused investigation for the narrow blocker rather than abandoning the task immediately
- Record each recovery step in `STATUS.md` under `recovery_action` and increment `retry_attempts`.
- If subagent execution is failing, attempt the next safe path before switching to subagent-blocked status:
  - retry the bounded subagent lane when the failure looks transient
  - retry or recompile the same native-subagent path when contract or context was insufficient
  - only then consider subagent-blocked status if no safe subagent path is currently available
- Escalate to `blocked` only when:
  - required credentials, services, permissions, or external systems are unavailable
  - the requirement remains high-impact ambiguous after the minimum safe clarification pass
  - repeated focused recovery attempts still leave no safe next step
  - the next action would be high-risk or destructive without user confirmation
- When blocked, write the concrete blocker reason to `blocker_reason`, preserve the best known next action, and stop only after the blocker is explicit.

## Surface Sweep Rule

- Treat every quick task as a small-scope complete sweep, not as an opportunistic one-file patch.
- Before editing, name the affected surfaces for this pass. Start from the smallest relevant set and expand until the task has a defendable boundary.
- Include propagation hotspots, consumer surfaces, verification entry points, and known unknowns from project cognition slices whenever they materially affect the quick task.
- For interface or contract changes, default sweep surfaces are:
  - implementation
  - export or declaration layer
  - docs
  - examples
  - tests
  - key callsites or consuming paths
- For other quick tasks, still name the concrete surfaces in play rather than implying coverage from a partial read.
- The leader must be able to say which surfaces were intentionally checked before claiming completion.
- For each named surface, record one explicit status conclusion:
  - `confirmed correct`
  - `fixed in this quick task`
  - `not checked in this pass (with reason)`
- Do not collapse `not checked` into silence. If a surface was not verified, say so explicitly and explain why it stayed outside the current pass.

## Completion Standard

- Quick completion means a small, transparent closed loop: sweep the affected surfaces, make the required change, run at least one meaningful verification step, and record the resulting coverage truthfully.
- Completion requires all three:
  - the change itself is implemented in code, docs, config, or templates as needed
  - at least one smallest meaningful executable verification step has run
  - any unverified surface or remaining gap is called out explicitly instead of being implied away
- The final `SUMMARY.md` must include `changed_code_paths` with modified, added, deleted, and renamed paths; `changed_behavior_surfaces` for affected commands, APIs, templates, generated assets, state files, tests, docs, validators, packets, or runtime assumptions; `verification_evidence`; and `project_cognition_refresh` recommending `$sp-map-update` with those changed paths whenever project cognition might be affected.
- `should be fine`, `likely unaffected`, or `not expected to break` are not completion evidence.
- If the change is implemented but verification or coverage is incomplete, do not claim the task is complete. Mark the remaining gap explicitly and continue the sweep or leave the task blocked with the concrete reason.
- If the quick task changed truth-owning surfaces, shared surfaces, command/route/contract boundaries, verification entry points, runtime assumptions, or other map-level coverage facts, and verification is truthfully green and no explicit blocker prevents completion, refresh the project cognition runtime through `$sp-map-update` using the changed paths before marking the quick task `resolved`. Do not rebuild for ordinary uncertain closure; `sp-map-update` records partial/low-confidence facts, known unknowns, and `minimal_live_reads`. Rebuild through `$sp-map-scan`, then `$sp-map-build` only when the baseline is missing, unusable, schema-incompatible, explicitly requested for rebuild, or invalidated by broad architecture replacement; then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition validate-build --format json` and `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition complete-refresh --format json` only when build acceptance passes.
- If a refresh cannot be completed now, use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition mark-dirty --reason \"<reason>\" --format json` as the manual override/fallback with command shape `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition mark-dirty --reason \"<reason>\" --format json`, and tell the user to run `$sp-map-update` with the changed paths before the next brownfield workflow proceeds, escalating to `$sp-map-scan`, then `$sp-map-build` only for the explicit rebuild conditions above.

## Propagating Change Rule

- Treat interface signature changes, return-type changes, sync-to-async conversions, renamed commands, renamed config keys, path changes, and similar high-spread edits as a propagating change.
- For any propagating change, the leader must write a minimal plan before editing.
- That plan must name the affected surfaces to sweep, at minimum:
  - implementation
  - wrappers or bindings
  - examples
  - tests
  - docs
  - callsites
- Do not collapse a propagating change into ad-hoc search-and-edit work. The leader must be able to state what will be checked and how completion will be proven.

## Coverage Before Completion

- For propagating changes, sampling is not sufficient.
- Completion requires either:
  - a full-coverage check of every affected callsite or surface
  - or a scripted or pattern-based verification that covers the entire affected set
- If the current pass only covers representative examples, do not claim completion.
- If coverage is still incomplete, continue the sweep, add stronger search or verification, or mark the task blocked with the exact remaining gap.
- `All affected surfaces` means the declared sweep set, not just the files already inspected.

## Output Contract

- Keep `STATUS.md` accurate enough that another session can resume without chat memory.
- Produce scoped implementation changes, verification evidence, and a truthful resolved/blocked state for the quick task.
- `SUMMARY.md` reports changed code paths, changed behavior surfaces, verification evidence, residual risk, and the recommended `$sp-map-update` refresh when project cognition might be affected.
- Preserve escalation history so it is clear why the task stayed quick or needed to grow.

## Passive Project Learning Layer

- Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify learning start --command quick --format json` when available so passive learning files exist and the current quick task sees relevant shared project memory.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader quick-task context.
- Open only learning detail docs linked from quick-task-relevant index entries.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail document without asking for routine permission.
- Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify learning capture-auto --command quick --format json` when `STATUS.md` already preserves route reasons, false starts, hidden dependencies, validation gaps, or reusable constraints.
- When durable state does not capture the reusable lesson cleanly, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.
- Treat this as passive shared memory, not as a separate user-visible quick-task command.

**This command tier: light.** Auto-capture learnings on resolution only. No review, no signal.


## Codex Project Cognition Hard Gate

**Crucial First Step**: You MUST use agent-assisted project cognition query planning first: retrieve the map lexicon with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition lexicon --intent implement --query=\"$ARGUMENTS\" --format json`, translate the raw user intent into a query_plan using returned map terms, then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition query --intent implement --query-plan \"<query_plan_json>\" --format json` before repository analysis or implementation. Use the returned readiness, task-local bundle, and `minimal_live_reads`.
- Interpret returned readiness: `ready` continues with the task-local bundle; `review` permits only returned `minimal_live_reads`; `ambiguous` asks the user to choose; `needs_update` routes through `{{invoke:map-update}}`; `needs_rebuild` routes through `{{invoke:map-scan}}`, then `{{invoke:map-build}}`; `blocked` stops with the runtime issue.
- Treat the project cognition query bundle as the primary brownfield context surface; do not fall back to chat memory or ad hoc repository instincts when query-backed runtime coverage should be the source of truth.
- Treat this as a hard gate, not a best-effort reminder; do not continue until the returned readiness and task-local bundle are strong enough for the workflow.
- A project-cognition query is not complete when it returns JSON. It is complete only when readiness drives routing, `minimal_live_reads` constrains inspection, and relevant facts are carried into the next workflow artifact or execution state.
- Carry forward the selected capability, minimal reads, validation route, and known risk into quick-task `STATUS.md` before implementation proceeds.


## Codex Leader Gate

When running `sp-quick` in Codex, you are the **leader**, not the concrete implementer.

**Crucial First Step**: You MUST use agent-assisted project cognition query planning first: retrieve the map lexicon with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition lexicon --intent implement --query=\"$ARGUMENTS\" --format json`, translate the raw user intent into a query_plan using returned map terms, then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition query --intent implement --query-plan \"<query_plan_json>\" --format json` before repository analysis or implementation. Use the returned readiness, task-local bundle, and `minimal_live_reads`.

Before code edits, test edits, or implementation commands:
- Read `.specify/memory/constitution.md` first if it exists.
- Read `STATUS.md` for the active quick-task workspace, or create it if this quick task is new.
- Before choosing the next lane, read `STATUS.md` and any quick-task summary artifacts so resume truth comes from durable state instead of chat narration.
- Define the smallest safe delegated lane or ready batch, and choose the `subagents-first` dispatch shape for that batch.
- Dispatch `one-subagent` when one validated `WorkerTaskPacket` or equivalent execution contract preserves quality.
- Dispatch `parallel-subagents` when two or more safe subagent lanes would materially improve throughput.
- Use the current runtime's `native-subagents` path before considering any fallback path.
- If that bar is not met, keep the lane on the leader path until the missing context, constraints, validation target, or handoff expectations are explicit.
- Use the current integration's join point to integrate returned results before choosing the next action.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Use `managed-team` only when durable team state is needed beyond one in-session subagent burst.
- Use `subagent-blocked` only when subagent dispatch and the managed team workflow are both unavailable or unsafe.
- When `subagent-blocked` is used, you **MUST** write the concrete blocker reason into `STATUS.md` before escalating or stopping locally.

**Hard rule:** The leader must keep scope control, strategy selection, join-point handling, validation, summary ownership, and `STATUS.md` accuracy while subagent execution is active.

## Process

1. **Scope gate**
   - Read `.specify/memory/constitution.md` first if present. Do not continue until this gate is satisfied.
   - Confirm the task is small but non-trivial.
   - Redirect to `$sp-fast` or `$sp-specify` if the task is outside the quick-task band.

2. **Create lightweight quick-task context**
   - Create or resume an id-based workspace under `.planning/quick/<id>-<slug>/`.
   - Keep quick-task artifacts separate from the main phase/spec workflow.
   - Initialize `STATUS.md` as the recoverable source of truth for the quick task.
   - Rebuild or refresh `.planning/quick/index.json` as a derived management projection when needed.
   - Do not continue into broad repository analysis or implementation planning until this workspace exists and the initial lane or batch is recorded.

3. **Optional pre-execution phases**
   - If `--discuss` is present, clarify assumptions and lock the minimum decisions needed.
   - If `--research` is present, gather focused implementation guidance.

4. **Lightweight planning**
   - Produce only the plan needed to execute this ad-hoc task safely.
   - Keep the work atomic and self-contained.
   - Keep local planning shallow until the first subagent batch has been launched.
   - Identify the smallest safe execution lanes and choose the current execution strategy before implementation starts.
   - For behavior-changing work, bug fixes, and refactors, the first executable lane must produce a failing automated test or failing repro check before production edits begin.
   - Do not write production code until the RED state is captured and recorded in `STATUS.md`.
   - If no reliable automated test surface exists for the touched behavior, bootstrap the smallest viable test surface first. If that bootstrap is no longer a bounded quick-task step, stop and escalate to `$sp-specify`.
   - For bug fixes and regressions, record the current root-cause explanation before implementation starts. If the root cause is not yet known, or if multiple plausible causes are still in play, stop and route to `$sp-debug` instead of applying a quick symptom patch.
   - A `surface-only` or symptom-only change cannot satisfy the quick-task contract for a bug fix unless the user explicitly scoped the work to temporary mitigation.
   - Name the affected surfaces for this quick-task pass and decide how each one will be checked.
   - If multiple safe lanes would materially improve throughput, plan the first fan-out as parallel subagents instead of defaulting to serial execution.
   - If the task includes a propagating change, write the minimal sweep plan first and list the affected surfaces that must be checked before completion.

5. **Execution**
   - Execute the current quick-task lane or ready batch through the selected dispatch shape and execution surface.
   - For `one-subagent`, dispatch one subagent once the subagent-readiness bar is satisfied; otherwise finish compiling the missing contract before dispatch. If the contract cannot be made safe, record `subagent-blocked` and stop for escalation or recovery.
   - The first concrete execution action should normally be dispatching that subagent batch, not continuing local repository analysis.
   - If multiple subagent lanes are safe and useful, dispatch them in parallel as the current ready batch instead of holding back fan-out without a concrete coordination reason.
   - Keep changes tightly scoped to the quick-task goal.
   - Re-evaluate dispatch at each join point instead of assuming the first choice remains correct.
   - Only use `subagent-blocked` after subagent execution and the native subagent workflow are unavailable or blocked for the current batch, and record the blocked dispatch reason explicitly in `STATUS.md`.
   - Continue automatically until the quick task is complete or a concrete blocker prevents further safe progress.
   - If execution hits friction, attempt the smallest safe recovery step before declaring the task blocked.

6. **Validation**
   - If `--validate` or `--full` is present, perform plan checking and post-execution verification.
   - Otherwise still verify the change with the smallest meaningful executable check.
   - Do not skip verification just because the quick-task scope is small.

7. **Summary**
   - Write a concise summary artifact for what changed, how it was verified, and which surfaces were left unverified.
   - Prefer `SUMMARY.md` in `.planning/quick/<id>-<slug>/`.
   - Separate `verified` coverage from `not checked` coverage so readers can tell what was actually proven versus what is only expected to be safe.
   - For each declared surface, give the terminal status conclusion: `confirmed correct`, `fixed in this quick task`, or `not checked in this pass (with reason)`.
   - Make sure the final `STATUS.md` points to the summary, records the terminal state, and makes a future resume decision obvious.

## Guardrails

- Do not create a new full feature spec for quick tasks.
- Keep quick-task tracking under `.planning/quick/`.
- Preserve a lightweight planning and validation path rather than skipping discipline entirely.
- Keep quick tasks atomic and self-contained.
- Keep leader responsibilities explicit: the leader owns scope, strategy selection, join points, validation, and summary while substantive task work remains packetized for subagent lanes.
- Keep concrete execution on subagent lanes whenever possible. `subagent-blocked` is the final blocked status after recovery options are exhausted, not the default path.
- Quick-task state must be resumable from `STATUS.md` without depending on chat history.

## Codex Quick Execution Routing

When running `sp-quick` in Codex, use `subagents-first` execution after `STATUS.md` exists.
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`.
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`.
- Subagent dispatch: No subagent dispatch path for this session.
- Integration-native join point: Stay on the leader path or use the managed team workflow.
- Fallback path: No managed team workflow is currently available; use leader-inline fallback only when subagents cannot proceed safely.
- Once the first lane is chosen, dispatch it before continuing any leader-inline deep-dive analysis of the repository.
- If multiple safe subagent lanes exist and they materially improve throughput, dispatch them in parallel.
- Keep `.planning/quick/<id>-<slug>/STATUS.md` as the leader-owned source of truth.
- Before compaction-risk transitions or join points, update `STATUS.md` and any summary artifacts needed for clean resume.
- Subagents may return evidence, patches, and verification output, but they must not become the authority for resume state; the leader updates `STATUS.md` before and after each join point.
- Decision order for Codex `sp-quick`: safe packetized subagents -> `managed-team` when durable state is needed -> `subagent-blocked` with reason.
- Prefer subagent execution only when a validated `WorkerTaskPacket` or equivalent execution contract preserves quality.
- Re-check strategy after every join point and continue automatically until the quick task is complete or blocked.

## Codex Subagent Dispatch Contract

- Execution model: `subagents-first`
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`
- Delegation surface contract: preserve the native dispatch, fallback, worker result contract, and handoff path below.
- Native subagent dispatch: No subagent dispatch path for this session.
- Join behavior: Stay on the leader path or use the managed team workflow.
- Managed-team fallback: No managed team workflow is currently available; use leader-inline fallback only when subagents cannot proceed safely.
- Leader-inline fallback: record the reason before local execution.
- Worker result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result handoff path: .specify/teams/state/results/<request-id>.json

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

## Codex Structured Question Preference

- If the runtime's native structured question tool is available for the current turn, you must use it.
- Do not render the textual fallback block when the native tool is available.
- Do not self-authorize textual fallback because the question seems simple, short, or easy to phrase manually.
- Treat the template's textual question format as fallback-only guidance; use it to shape the question content, but do not render the textual block unless the native tool is unavailable in the current runtime or the tool call fails.
- Ask only the minimum number of questions required by this workflow's existing contract.
- Keep the user-visible question text in the user's current language and keep option labels short.
- Do not emit both a native tool question and the textual fallback block in the same turn. The user should see the active question exactly once.
- If the native tool is unavailable in the current runtime or the tool call fails, use the template's existing concise plain-text clarification or quick-task selection wording.
- In `quick`, use this preference for:
  - lightweight clarification when `--discuss` is active
  - resume selection when multiple unfinished quick tasks exist
- Native tool target: `request_user_input` if the current Codex runtime exposes it
- Question count: 1-3 short questions per call
- Option count: 2-3 options per question
- Required question fields: `header`, `id`, `question`, `options`
- Option fields: `label`, `description`
- Put the recommended option first and suffix its label with `(Recommended)` when that distinction matters.
- Use this native surface for one bounded clarification or selection step; if it is unavailable or too narrow for the needed interaction, fall back immediately to the template's textual question format.

## Codex Quick-Task Subagent Execution

When running `sp-quick` in Codex, use `subagents-first` execution after `STATUS.md` exists.
- Dispatch `one-subagent` or `parallel-subagents` before broad leader-inline repository analysis.
- Use `subagent-blocked` only after native subagents and the managed-team path are unavailable or unsafe, and record the blocker reason in `STATUS.md`.
- Use `spawn_agent` for bounded lanes such as focused repository analysis, targeted implementation, regression test updates, or validation command runs.
- Once the first lane is chosen, dispatch it before continuing any leader-inline deep-dive analysis of the repository.
- If multiple safe subagent lanes exist and they materially improve throughput, dispatch them in parallel.
- Use `wait_agent` only at the documented join point for the current quick-task batch.
- Use `close_agent` after integrating finished subagent results.
- Keep `.planning/quick/<id>-<slug>/STATUS.md` as the leader-owned source of truth.
- Subagents may return evidence, patches, and verification output, but they must not become the authority for resume state; the leader updates `STATUS.md` before and after each join point.
- Decision order for Codex `sp-quick`: safe packetized subagents -> `managed-team` when durable state is needed -> `subagent-blocked` with reason.
- Prefer subagent execution only when a validated `WorkerTaskPacket` or equivalent execution contract preserves quality.
- Re-check strategy after every join point and continue automatically until the quick task is complete or blocked.
