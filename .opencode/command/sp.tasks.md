---
description: Use when plan artifacts exist and execution needs dependency-aware tasks, guardrails, and parallelization guidance before implementation.
workflow_contract:
  when_to_use: Planning artifacts already exist and the remaining gap is concrete execution slicing rather than more design work.
  primary_objective: Produce `tasks.md` with dependency ordering, guardrail carry-forward, execution batches, and join points.
  primary_outputs: '`FEATURE_DIR/tasks.md`, `FEATURE_DIR/handoff-to-tasks.json`, `FEATURE_DIR/task-index.json`, `FEATURE_DIR/task-packets/*.json`, `FEATURE_DIR/task-generation/handoffs/<lane-id>.json`, `FEATURE_DIR/task-generation/evidence-index.json`, `FEATURE_DIR/task-generation/checkpoints.ndjson`, and `workflow-state.md`.'
  default_handoff: '/sp.analyze for normal completed or non-escalated task generation; /sp.plan, /sp.clarify, or /sp.deep-research when escalated remediation exposes missing upstream truth; only continue to /sp.implement after analyze clears upstream drift.'
handoffs:
  - label: Analyze For Consistency
    agent: sp.analyze
    prompt: Run a project analysis for consistency
    send: false
---

## Workflow Contract Summary

- **When to use**: Planning artifacts already exist and the remaining gap is concrete execution slicing rather than more design work.
- **Primary objective**: Produce `tasks.md` with dependency ordering, guardrail carry-forward, execution batches, and join points.
- **Primary outputs**: `FEATURE_DIR/tasks.md`, `FEATURE_DIR/handoff-to-tasks.json`, `FEATURE_DIR/task-index.json`, `FEATURE_DIR/task-packets/*.json`, `FEATURE_DIR/task-generation/handoffs/<lane-id>.json`, `FEATURE_DIR/task-generation/evidence-index.json`, `FEATURE_DIR/task-generation/checkpoints.ndjson`, and `workflow-state.md`.
- **Default handoff**: /sp.analyze for normal completed or non-escalated task generation; /sp.plan, /sp.clarify, or /sp.deep-research when escalated remediation exposes missing upstream truth; only continue to /sp.implement after analyze clears upstream drift.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Convert the plan package into dependency-aware execution tasks that preserve planning guardrails, expose parallel-safe batches, and make implementation resumable.

## Context

- Primary inputs: `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `context.md`, `plan-contract.json` when present, and the task-local project cognition query bundle with readiness and returned `minimal_live_reads`.
- Working state lives in `FEATURE_DIR/tasks.md` plus durable decomposition metadata for later analysis or implementation routing: `handoff-to-tasks.json`, `task-index.json`, `task-packets/`, `task-generation/handoffs/`, `task-generation/evidence-index.json`, and `task-generation/checkpoints.ndjson`.
- This command is task-generation-only. It should not cross into execution.

## Process

- Load the current plan package and recover the active workflow-state context.
- Carry locked planning decisions and implementation constitution rules forward into execution slices.
- Map every open `CA-###` consequence obligation to tasks, packet fields, validation commands, join points, or explicit stop-and-reopen conditions.
- Generate dependency ordering, parallel-safe batches, join points, and guardrail indexes.
- Validate the resulting task graph before handing off to analysis or implementation.

## Output Contract

- Write `tasks.md` as the authoritative execution breakdown for the current feature.
- Produce both human-readable `tasks.md` and machine-readable execution packets: `handoff-to-tasks.json`, `task-index.json`, and per-task JSON under `task-packets/` for downstream implementers.
- Persist task-generation lane evidence before synthesis: every delegated decomposition lane writes `task-generation/handoffs/<lane-id>.json`, the leader updates `task-generation/evidence-index.json`, and checkpoint records go to `task-generation/checkpoints.ndjson`.
- Consume every accepted task-generation handoff before final synthesis: each accepted handoff must shape at least one task, dependency edge, write-set decision, parallel batch, join point, guardrail, packet field, or explicit escalation/deferral.
- Make execution ordering, parallelization boundaries, and required verification steps explicit.
- Preserve the guardrail information later subagent execution packets and leaders must consume.

### Subagent-Ready Task Contract

Every task written into `tasks.md` MUST carry the enriched fields below so that a worker subagent can read a single task body and begin work immediately — without asking the leader for clarification, without exploring the codebase to discover conventions, and without guessing acceptance criteria.

**Identity & Ordering**

- `agent`: Role from the agent-teams pool assigned to this task. Choose from: `security-reviewer`, `test-engineer`, `style-reviewer`, `performance-reviewer`, `quality-reviewer`, `api-reviewer`, `debugger`, `code-simplifier`, `build-fixer`, `git-master`, `executor`. Default to `executor` when no specialist role matches.
- `depends_on`: List of task IDs (with one-line descriptions) that must complete before this task can start.
- `parallel_safe`: `true` when this task's `write_scope` has zero overlap with any other task in the same ready batch, and no shared-state conflicts exist. Otherwise `false`.

**Context Navigation (pointers only — do not duplicate content)**

- Provide a table mapping each piece of knowledge the worker needs to its precise location: `file.md#section-heading`. Include at minimum: the relevant design decision from plan.md, the data model entity from data-model.md, the API contract from contracts/, and a reference implementation in the repo that follows the same pattern (if one exists).

**Scope Boundaries**

- `write_scope`: Exact list of files this task will create or modify.
- `read_scope`: Files and directories the worker may read but not modify.
- `forbidden`: Paths the worker MUST NOT touch. Always include `.env`, credential files, secrets directories, and any config surfaces the task does not own.

**Expected Outputs & Anti-Goals**

- `expected_outputs`: Concrete file list with annotations: `（新建）` or `（修改）`.
- `anti_goals`: Behaviors explicitly forbidden for this task. Examples: "do not introduce new dependencies", "do not modify the public API surface", "do not touch the database schema".

**Acceptance & Verification**

- `acceptance_criteria`: Verifiable, objective conditions — not subjective judgments.
- `verify_commands`: Runnable shell commands the worker executes to self-validate before handing off. Include the exact test runner, linter, and type-check commands.

**Handoff Format**

- `status`: `success` | `failed` | `blocked`
- `changed_files`: Precise list of paths modified
- `validation_output`: Map of command → output for each verify command
- `concerns`: Issues the leader should know about (empty list if none)
- `recovery_hints`: If failed or blocked, the smallest safe recovery step

**Failure & Escalation**

- `retry_max`: Maximum retry attempts before escalation (default `2`).
- `escalation`: Role to escalate to after retries are exhausted (default `debugger`).

### Independent Executability Gate

Before finalizing any task, confirm: a single subagent, reading only this task body plus the pointed-to context files, can complete the work without asking the leader a single question. If the answer is no, the task is not ready — refine it until it is.

## Guardrails

- Do not implement code, edit tests, or treat task generation as implicit execution approval.
- Do not emit raw task lists that lose boundary rules, locked decisions, or verification expectations.
- Do not assume stale or overly broad project cognition query coverage is good enough for decomposition.

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

All substantive work in ordinary `sp-*` workflows MUST use subagents once a validated lane exists.

The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

Before dispatch, every subagent lane MUST have a task contract with:
- objective
- authoritative inputs
- allowed read scope
- allowed write scope
- forbidden paths or forbidden drift
- acceptance checks
- required validation evidence
- structured handoff format

A lane is dispatch-ready only when its validated packet or equivalent execution contract contains all required fields.

If a validated lane exists, leader-inline execution of that lane's substantive work is forbidden.

If no validated lane can be packetized safely, the workflow MUST mark `subagent-blocked` and stop.

Idle, silent, or prose-only subagent output is not an accepted result.

A workflow MAY continue past a join point only after the required structured handoff and required evidence are present.

Keep delegated lanes bounded and role-specific. Use fixed analysis or verification roles when the parent workflow defines them explicitly, rather than ad hoc managed-team structures.

Use `execution_model: subagent-mandatory`.
Use `dispatch_shape: one-subagent | parallel-subagents`.
Use `execution_surface: native-subagents`.

Do not rely on leader-inline fallback semantics or managed-team lifecycle language in this shared partial. The parent workflow must state any command-specific analysis roles, join points, or escalation rules directly.


## Pre-Execution Checks

**Check for extension hooks (before tasks generation)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_tasks` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable.
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently.

**Maintain workflow quality without hook choreography**:
- Confirm project cognition freshness and valid workflow entry before decomposition continues.
- Keep `workflow-state.md` current as the durable source of truth for phase, allowed artifact writes, next action, and exit criteria.
- Verify the final `tasks.md` and `workflow-state.md` outputs before handoff instead of relying on chat narration.
- Update durable state before compaction-risk transitions, major task-batch synthesis handoffs, or any stop where resume will depend on more than the visible conversation.

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify learning start --command tasks --format json` when available so passive learning files exist, the current task-generation run sees relevant shared project memory, and repeated high-signal lessons can be surfaced through the learning index at start.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader task-generation context.
- Open only learning detail docs linked from task-generation-relevant index entries, especially repeated workflow gaps, project constraints, or validation misses that should influence task decomposition.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- [AGENT] When task-shaping friction exposes artifact rewrites, route changes, false starts, hidden dependencies, validation gaps, or reusable constraints, make sure `workflow-state.md` captures that durable context.
- [AGENT] Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify learning capture-auto --command tasks --feature-dir \"$FEATURE_DIR\" --format json` when `workflow-state.md` already preserves route reasons, false starts, hidden dependencies, or reusable constraints.
- [AGENT] When the durable state does not capture the reusable lesson cleanly, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.
- Treat this as passive shared memory, not as a separate user-visible workflow.

## Workflow Phase Lock

- [AGENT] Create or resume `WORKFLOW_STATE_FILE` before substantial task-generation analysis.
- Read `.specify/templates/workflow-state-template.md`.
- If `WORKFLOW_STATE_FILE` is missing, recreate it from the template and the current spec/plan package instead of continuing from chat memory alone.
- Treat `WORKFLOW_STATE_FILE` as the stage-state source of truth on resume after compaction for the current command, allowed artifact writes, forbidden actions, authoritative files, next action, and exit criteria.
- Set or update the state for this run with at least:
  - `active_command: sp-tasks`
  - `phase_mode: task-generation-only`
  - `forbidden_actions: edit source code, edit tests, implement behavior, start execution from task-generation artifacts`
- Do not implement code, edit source files, edit tests, or treat task generation as permission to start execution.
- Implementation remains blocked until `/sp.analyze` confirms the current task package does not need upstream regeneration.
- If `WORKFLOW_STATE_FILE` records a blocked `sp-analyze` gate with `next_command: /sp.tasks`, enter remediation mode before regenerating `tasks.md`.
- In remediation mode, read the prior `Analyze Gate` blocker bundle first. Do not start from a blank task-generation pass.
- No more than one task-layer remediation cycle is expected. If repeated `sp-tasks -> sp-analyze` loops occur for blockers that were detectable before remediation, treat that as a previous analyze miss or a tasks self-audit failure. Do not treat repeated task/analyze loops as normal workflow.
- Do not hand off directly to `/sp.implement` from `sp-tasks`; the analyze gate is mandatory unless the user is explicitly resuming a previously cleared execution state.
- When resuming after compaction, re-read `WORKFLOW_STATE_FILE` before proceeding.

## Outline

1. **Setup**: Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").
   - If `FEATURE_DIR` is not already explicit, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify lane resolve --command tasks --ensure-worktree` before guessing from branch-only context.
   - When lane resolution returns a materialized lane worktree, continue task generation from that isolated worktree context so downstream execution packets inherit the same lane boundary.
   - Set `WORKFLOW_STATE_FILE` to `FEATURE_DIR/workflow-state.md`.
   - [AGENT] Create or resume `WORKFLOW_STATE_FILE` before substantial task-generation analysis.
   - Read `.specify/templates/workflow-state-template.md`.
   - If `WORKFLOW_STATE_FILE` already exists, read it first and preserve still-valid `next_action`, `exit_criteria`, and `next_command` details instead of relying on chat memory alone.
   - Persist at least these fields for the active pass:
     - `active_command: sp-tasks`
     - `phase_mode: task-generation-only`
     - `allowed_artifact_writes: tasks.md, handoff-to-tasks.json, task-index.json, task-packets/*.json, task-generation/handoffs/*.json, task-generation/evidence-index.json, task-generation/checkpoints.ndjson, workflow-state.md`
     - `forbidden_actions: edit source code, edit tests, implement behavior, start execution from task-generation artifacts`
     - `authoritative_files: spec.md, alignment.md, context.md, plan.md, tasks.md, handoff-to-tasks.json, task-index.json, task-packets/*.json, task-generation/handoffs/*.json, task-generation/evidence-index.json`
   - When resuming after compaction, re-read `WORKFLOW_STATE_FILE` before proceeding.

2. **Ensure project cognition runtime exists and record planning advisory state**:
   - Check whether `.specify/project-cognition/status.json` exists.
   - If it exists, use the project cognition freshness helper for the active script variant to assess freshness before trusting the current project cognition baseline.
   - [AGENT] If freshness is `missing`, stop and tell the user to run `/sp.map-scan`, then `/sp.map-build`; wait for that rebuild before continuing.
   - [AGENT] If freshness is `stale`, record a planning advisory, continue with minimal live reads from the query result, and do not require `/sp.map-update` during artifact-only `sp-tasks` work.
   - [AGENT] If freshness is `support_drift`, record a planning advisory about support-surface drift and continue only with evidence-backed reads; do not reflexively route to `/sp.map-update`.
   - [AGENT] If freshness is `partial_refresh`, record a planning advisory that the refresh was incomplete, preserve `recommended_next_action`, and continue only when query results plus minimal live reads are sufficient for task generation.
   - [AGENT] If freshness is `possibly_stale`, inspect the reported changed paths and reasons plus `must_refresh_topics` and `review_topics`. For artifact-only `sp-tasks` work, record a planning advisory for any overlapping topics, review those topic files and minimal live reads, and continue without requiring `/sp.map-scan`/`/sp.map-build`.
   - Check whether `.specify/project-cognition/status.json` exists at the repository root.
   - [AGENT] If the project cognition runtime is missing, stop and tell the user to run `/sp.map-scan`, then `/sp.map-build`; wait for that refresh before continuing.
   - Treat task-relevant coverage as insufficient when the touched area is named only vaguely, lacks ownership or placement guidance, or lacks workflow, constraint, integration, or regression-sensitive testing guidance.
   - [AGENT] If task-relevant coverage is insufficient for the current task-generation request, record a planning advisory, continue with minimal live reads and explicit task assumptions, and do not require a project cognition refresh during `sp-tasks`.

3. **Load design documents**: Read from FEATURE_DIR:
   - **Required**: plan.md (tech stack, libraries, structure), spec.md (user stories with priorities), context.md (implementation context)
   - **Required when present**: plan-contract.json (authoritative route, intent, complexity, must-preserve invariants, allowed optimization scope, and planning obligations)
   - **Required when present**: planning/evidence-index.json and accepted planning/handoffs/*.json (planning lane decisions, constraints, generated artifact contributions, deferrals, and blockers that shaped the plan package)
   - **Required when present**: alignment.md (locked decisions, outstanding questions, planning gate context)
   - **Required when present**: brainstorming/handoff-to-tasks.json (route, intent, complexity, task packet shaping, and handoff constraints)
   - **Required when present**: workflow-state.md (current phase lock, allowed actions, forbidden actions, resume contract, active profile, activated gates, task-shaping rules, and required evidence)
   - **Required when present**: `.specify/testing/TESTING_CONTRACT.md` (project-level testing rules and required regression behavior)
   - **Required when present**: `.specify/testing/TESTING_PLAYBOOK.md` (canonical test and coverage commands)
   - **Required when present**: `.specify/testing/COVERAGE_BASELINE.json` (baseline or threshold context by module)
   - **Optional**: references.md (retained sources, reusable insights, spec impact mapping)
   - **Required when present**: `plan.md#Must-Preserve Carry-Forward` and `MP-*` obligations from `brainstorming/handoff-to-specify.json`
   - **Optional**: data-model.md (entities), contracts/ (interface contracts), research.md (decisions), quickstart.md (test scenarios)
   - **Required when present**: `.specify/memory/constitution.md` (project constitution and mandatory principles that tasks must preserve)
   - **Required when present**: `.specify/memory/project-rules.md` (shared project defaults that task generation should preserve)
   - **Required when present**: `.specify/memory/learnings/INDEX.md` (searchable reusable learning index that may shape decomposition, validation, or guardrails)
   - **Required when relevant index entries exist**: open only the linked learning detail docs relevant to task generation so repeated workflow gaps, project constraints, and validation misses are not rediscovered from scratch
   - **Required**: [AGENT] Query project cognition with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition lexicon --intent plan --query=\"$ARGUMENTS\" --format json`, then generate a query_plan from returned map terms, then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition query --intent plan --query-plan \"<query_plan_json>\" --format json`.
   - **If topical coverage is missing/stale/too broad or task-relevant coverage is insufficient**: record a planning advisory in the feature artifacts, inspect the minimum live files still needed to replace guesswork with evidence, and carry explicit assumptions or follow-up tasks instead of requiring a project cognition refresh during artifact-only task generation
   - **Required**: Read `.specify/templates/workflow-state-template.md`
   - Note: Not all projects have all documents. Generate tasks based on what's available.

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
uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition lexicon --intent plan --query=\"$ARGUMENTS\" --format json
# Agent: generate <query_plan_json> from raw user intent plus returned map terms.
uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition query --intent plan --query-plan \"<query_plan_json>\" --format json
```

Use the returned readiness:

- `ready`: continue with the returned task-local bundle.
- `review`: perform only the returned `minimal_live_reads` before continuing.
- `ambiguous`: ask the user to select the intended candidate.
- `needs_update`: record a planning advisory, perform the returned `minimal_live_reads`, and continue without requiring `/sp.map-update` during `sp-tasks`.
- `needs_rebuild`: route through `/sp.map-scan`, then `/sp.map-build`.
- `blocked`: stop and report the blocking runtime issue.
- **CARRY FORWARD**: Carry cognition-derived required references, write scopes,
  validation commands, forbidden drift, and known unknowns into `tasks.md`,
  `task-index.json`, and task packets.

Task generation may stay focused on the plan artifacts afterward, but it may not skip the query-backed cognition gate.

## Consequence Obligation Mapping

Before the task package is complete, map every triggered `CA-###` consequence obligation into executable work or an explicit downstream stop condition.

- Read upstream consequence analysis from `spec.md`, `alignment.md`, `context.md`, `references.md`, `plan.md`, `plan-contract.json`, and any handoff JSON present.
- For each `CA-###`, name the affected objects, required state behavior, dependency impact, recovery and validation requirement, owning task or join point, and latest safe resolve phase.
- Map each obligation to at least one task, packet field, join point, validation task, review checkpoint, or explicit deferral with a stop-and-reopen condition.
- Each mapped task or packet must include objective, write set, affected state or dependency, required references, forbidden drift, validation command or concrete manual check, done condition, and stop-and-reopen condition.
- Emit the mapping in `tasks.md`, `handoff-to-tasks.json`, `task-index.json`, and per-task JSON under `task-packets/` when those machine-readable artifacts are generated.
- Preserve `CA-###` IDs verbatim in `tasks.md`, handoff-to-tasks metadata, task-index metadata, and worker packet shaping instructions so `sp-analyze` and `sp-implement` cannot drop them.
- If a consequence obligation is unmapped, do not emit a normal `/sp.analyze` handoff. Repair the task package or route back to `/sp.plan`, `/sp.clarify`, or `/sp.deep-research` with the unmapped obligation named.

4. **Execute task generation workflow**:
    - [AGENT] Before task decomposition begins, split work only into the supported task-generation lanes: `story and phase decomposition`, `dependency graph analysis`, and `write-set and parallel-safety analysis`.
    - [AGENT] Before dispatch begins, assess workload shape and the current agent capability snapshot, then apply the shared policy contract: `choose_subagent_dispatch(command_name="tasks", snapshot, workload_shape)`
    - Before emitting high-risk batches, classify whether they need extra review: `classify_review_gate_policy(workload_shape)`
    - The chosen dispatch shape applies to the **current ready batch**, not automatically to the entire feature or task graph.
    - Primary decomposition goal: maximize safe native-subagent throughput for later `sp-implement` runs by isolating write sets and turning ready work into a dispatch-ready lane packet instead of a vague checklist.
    - Before dispatching any task-generation lane, persist a `task_generation_checkpoint` record to `task-generation/checkpoints.ndjson` with the lane id, dispatch shape, authoritative inputs, expected handoff path, and current workflow-state summary.
   - Each delegated lane must persist the lane's structured handoff to `task-generation/handoffs/<lane-id>.json` before the leader accepts the lane, waits at a join point, or synthesizes `tasks.md`.
   - Update `task-generation/evidence-index.json` after each accepted lane handoff with lane id, handoff path, source artifacts inspected, decisions or constraints contributed, affected task IDs or batch IDs, blocker status, and integration status.
    - Consume `task-generation/evidence-index.json` before final task synthesis: for every accepted handoff, mark the handoff as `integrated`, `deferred`, or `blocked`, and name the target task ID, dependency edge, write-set decision, parallel batch, join point, guardrail, packet field, or escalation that consumed it.
    - Do not synthesize `tasks.md` from chat-only lane results. If a lane reports only prose, idle state, or an unwritten handoff, mark `subagent-blocked`, write the blocker to `workflow-state.md`, and stop or re-dispatch with a valid handoff path.
    - When resuming after compaction, re-read `workflow-state.md`, `task-generation/checkpoints.ndjson`, `task-generation/evidence-index.json`, and all accepted `task-generation/handoffs/<lane-id>.json` files before continuing task synthesis.
    - Persist the decision fields exactly: `execution_model: subagent-mandatory`, `dispatch_shape: one-subagent | parallel-subagents`, `execution_surface: native-subagents`.
    - Decision order is fixed:
      - If exactly one validated isolated lane exists, dispatch `one-subagent`.
      - If two or more validated isolated lanes exist, dispatch `parallel-subagents`.
      - If overlap or missing contract prevents safe dispatch, mark `subagent-blocked` and stop.
    - Leader-only decomposition is forbidden once a validated lane exists.
    - Task-generation collaboration is determined only by validated lane count and write-set isolation. Do not make a separate judgment about whether collaboration is justified.
    - Required join points:
      - before writing `tasks.md`
      - before emitting canonical parallel batches and join points
    - Record the chosen dispatch shape, blocked reason if any, selected lanes, and join points in the generated report and implementation strategy section.
    - Extract the active profile, activated gates, task-shaping rules, and required evidence obligations from `workflow-state.md`; `sp-tasks` consumes the same profile contract or active profile that `sp-specify`/`sp-plan` persisted, not a newly invented taxonomy.
    - Read `plan-contract.json` as authoritative task-generation input when present.
    - Read `planning/evidence-index.json` and all accepted `planning/handoffs/*.json` when present; treat accepted planning lane contributions as upstream planning inputs, not discarded background evidence.
    - Emit `handoff-to-tasks.json`, `task-index.json`, and per-task packet JSON under `task-packets/` alongside `tasks.md`.
    - In `handoff-to-tasks.json` and `task-index.json`, include references to the accepted `task-generation/handoffs/<lane-id>.json` files that shaped each task, dependency edge, write-set decision, parallel batch, join point, guardrail, or escalation.
    - Do not mark task generation complete while `task-generation/evidence-index.json` contains an accepted handoff without an explicit consuming task, packet field, dependency edge, deferral, escalation, or blocker reason.
    - Carry complexity level, must-preserve invariants, allowed optimization scope, and stop-and-reopen conditions into each task packet.
    - Keep `sp-tasks` aligned with the persisted first-release profile contract: `active_profile` must be one of the two supported profiles, `Standard Delivery` or `Reference-Implementation`.
    - If `workflow-state.md` presents an unsupported `active_profile` during first release, `sp-tasks` stops before decomposition and tells the operator to repair/re-run upstream routing state before task generation continues.
    - Treat `Scenario profile inputs` as task-shaping inputs: active profile, routing reason, activated gates, fidelity obligations, deviation review requirements, and required evidence.
    - **Analyze remediation mode**: If `workflow-state.md` contains an open `Analyze Gate` blocker bundle for `sp-tasks`, map each task-layer finding to exactly one disposition: `resolved | deferred | not_applicable | escalated`.
    - `resolved`: fix the issue in this task pass and name the task, guardrail, checkpoint, packet field, or section evidence.
    - `deferred`: keep the issue explicit with the downstream condition that must clear it.
    - `not_applicable`: state why the prior finding no longer applies and cite the artifact evidence.
    - `escalated`: stop task generation for the current pass because the missing truth belongs to `plan`, `clarify`, or `deep-research`.
    - Escalation is terminal for the current `sp-tasks` run. If required upstream truth is missing, write the escalation evidence into `workflow-state.md` and set `next_command` directly to `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`. This sets `next_command` directly to `/sp.plan`, `/sp.clarify`, or `/sp.deep-research` instead of sending the user back through `/sp.analyze` first.
    - Load plan.md and extract tech stack, libraries, project structure
    - Extract `Locked Planning Decisions`, `Implementation Constitution`, `Canonical References`, `Input Risks From Alignment`, `Must-Preserve Carry-Forward`, and `Decision Preservation Check` from plan.md when present
    - Carry implementation-shaping `MP-*` items into task guardrails, required references, validation checkpoints, task packets, or explicit deferred notes.
    - If a task would violate an `MP-*` non-goal, decision, reference obligation, or trade-off rationale, stop and route back to the user conflict decision instead of silently generating divergent tasks.
    - If `Reference Fidelity Inputs` or `Reference Behavior Inventory` exist, map every preserved or redesigned reference behavior to at least one task, checkpoint, join point, or explicit deferred note before `tasks.md` is finalized.
    - Load spec.md and extract user stories with their priorities (P1, P2, P3, etc.) plus capability decomposition
    - If alignment.md exists: treat `Locked Decisions For Planning`, `Outstanding Questions`, and `Remaining Risks` as task-shaping inputs rather than historical notes
    - If `.specify/memory/constitution.md` exists: treat its MUST/SHOULD principles as task-shaping constraints and preserve them explicitly in execution ordering, validation tasks, or phase notes
    - If references.md exists: use it to preserve source-driven constraints and reusable examples while generating tasks
    - If data-model.md exists: Extract entities and map to user stories
    - If contracts/ exists: Map interface contracts to user stories
    - If research.md exists: Extract decisions for setup tasks
    - If quickstart.md exists: extract validation scenarios that should appear as verification-oriented tasks or explicit task completion criteria
    - If active profile is `Reference-Implementation`, add explicit fidelity checkpoints before implementation batches that can materially change the reference-preserved surface. Each fidelity checkpoint must identify the preserved surface, the reference evidence to compare against, the validation command or manual check, and the pass condition.
    - If implementation may intentionally diverge from the reference contract, add a `Deviation Review` join point before downstream work continues. The join point must capture the divergence rationale, affected contract or reference surface, approval or re-planning requirement, and downstream task adjustments.
    - **Missing design artifacts**: If any design artifact required by the current scope is missing, stop and route back to `/sp.plan`.
    - Do not generate `tasks.md` from an artifact set that is missing required design inputs.
    - Only optional artifacts may be absent without blocking task generation.
    - Generate tasks organized by user story (see Task Generation Rules below)
    - Whether or not `.specify/testing/TESTING_CONTRACT.md` exists, treat tests as default deliverables for behavior changes, bug fixes, and refactors
    - If the testing contract names required regression or coverage work for an affected module, preserve that requirement explicitly in the task list
    - If the touched area lacks a reliable automated test surface, add explicit bootstrap tasks to establish the smallest runnable test surface first before implementation tasks for that slice
    - Top-level tasks should fit one bounded implementation slice: roughly 10-20 minutes, one stable objective, one isolated write set, and one verification path
    - A subagent can still execute the task internally through smaller 2-5 minute atomic steps, but do not explode the public task list into coordinator-hostile micro-tasks
    - Stop decomposition once the current executable window is atomic. Leave later phases at the coarser story or phase level when their exact shape depends on earlier join-point evidence
    - If later work still depends on upstream evidence, add a refinement checkpoint instead of guessing detailed downstream tasks too early
    - Carry profile-required evidence into task completion criteria instead of relying only on generic behavior validation. When the active profile requires screenshots, trace IDs, reference comparisons, migration proof, or other required evidence, attach that evidence obligation to the relevant task done condition or join point pass condition.
    - If `Implementation Constitution` defines boundary-defining references or forbidden drift, add an implementation-guardrails phase before setup so implementers must confirm the existing pattern before changing code
    - **Task Guardrail Index**: Add task-to-guardrail mapping when tasks inherit execution rules from plan.md or constitution.md. Keep the mapping compact so downstream execution can resolve applicable hard rules per task.
    - Treat `[P]` as a lane-level parallel-eligible marker, not as permission to collapse multiple tasks into one batch-owner execution lane.
    - For every `[P]` task or parallel batch, include: objective, write set, required references, forbidden drift, validation command, and done condition — the information downstream execution needs to dispatch work safely
    - Generate dependency graph showing user story completion order
    - Derive a write set for each task (files or shared registration surfaces it will modify)
    - Group ready tasks into each phase's parallel batches using those write sets
    - A `parallel batch` is the current ready set of isolated lane-level tasks bounded by a join point.
    - Batch range labels such as `T012-T021` are summaries, not executable lane identities.
    - Each `[P]` task remains a lane-level execution unit unless an explicit wrapper task defines a serial coordination step.
    - Identify the member lanes of a parallel batch explicitly enough that downstream execution does not infer one batch-owner implementer task from the range label alone.
    - Grouped parallelism is the default when multiple ready tasks have isolated write sets and do not depend on each other's outputs
    - Prefer moving shared registrations, export barrels, schema indexes, router tables, and other coordination edits into explicit serial join tasks so the surrounding feature work can stay parallel-ready
    - Pipeline is preferred when outputs flow linearly from one bounded lane to the next, for example transform -> generate -> validate
    - Every pipeline stage still needs an explicit checkpoint before downstream stages continue so stale assumptions do not propagate silently
    - If `classify_review_gate_policy(workload_shape)` requires a review gate, add an explicit high-risk review checkpoint before downstream tasks continue
    - High-risk review gates are usually required for shared registration surfaces, schema or migration changes, protocol seams, native/plugin bridges, or generated API surfaces
    - If a peer-review lane is available and the review can stay read-only, recommend one peer-review lane for the batch; otherwise make the leader responsible only for acceptance criteria, review coordination, and the checkpoint decision
    - Add explicit join points after every parallel batch so downstream tasks know where synchronization happens
    - For every explicit join point, include a validation target, a validation command or concrete manual check, and a pass condition
    - Create parallel execution examples per user story
    - **Analyze-Compatible Task Self-Audit**: Before finalizing `tasks.md`, run the task-layer subset of the `sp-analyze` checks against the generated task package.
    - Confirm every buildable `FR-*` and buildable success criterion has at least one task, checkpoint, or explicit deferred note.
    - Confirm every locked planning decision that affects implementation, compatibility, rollout, validation, sequencing, architecture shape, or guardrails appears in `tasks.md`.
    - Confirm `Implementation Constitution` rules from `plan.md` are preserved through a guardrail phase, `Task Guardrail Index`, task notes, or explicit escalation.
    - Confirm the `Task Guardrail Index` maps applicable guardrails to concrete implementation tasks.
    - Confirm each `[P]` task or explicit parallel batch has objective, write set, required references, forbidden drift, validation command, and done condition.
    - Confirm task packet readiness covers `DP1`, `DP2`, and `DP3` as far as task generation can determine before implementation.
    - Confirm reference fidelity behavior items map to task IDs, checkpoints, join points, or explicit deferred notes.
    - Confirm unmapped tasks are justified as setup, polish, verification, or cross-cutting work, or remove them.
    - Confirm task dependencies and parallel batches do not contain obvious write-set conflicts.
    - If the self-audit finds task-layer defects, repair them before completing `sp-tasks`. If the defect requires missing upstream truth, escalate instead of producing speculative tasks.
    - Validate task completeness (each user story has all needed tasks, independently testable)
    - Validate decision preservation: if a locked planning decision or implementation constitution rule affects implementation, compatibility, rollout, validation, sequencing, or architecture shape, at least one task or phase note must preserve it explicitly instead of silently dropping it
    - Validate reference behavior preservation: if a preserved or redesigned reference behavior exists in the spec/plan package, at least one task, checkpoint, or explicit deferred note must account for it before task generation can complete

    **Feature delivery shape**: Classify the whole task graph in plain language (e.g., `serial phases with intra-phase parallel batches`, `mostly sequential`, `pipeline-heavy`, `parallel-ready after foundational work`). If later batches are parallelizable but the current batch is not, state that explicitly.

5. **Generate tasks.md**: Use `.specify/templates/tasks-template.md` as structure, fill with:
   - Correct feature name from plan.md
   - Phase 1: Setup tasks (project initialization)
   - Phase 2: Foundational tasks (blocking prerequisites for all user stories)
   - Phase 3+: One phase per user story (in priority order from spec.md)
   - Each phase includes: story goal, independent test criteria, required test tasks for behavior changes/bug fixes/refactors/regression-sensitive modules, implementation tasks
   - Final Phase: Polish & cross-cutting concerns
   - All tasks must follow the strict checklist format (see Task Generation Rules below)
   - Clear file paths for each task
   - Dependencies section showing story completion order
   - Parallel batches and join points for each phase where they matter
   - Join point validation notes whenever a join point gates downstream implementation or shared-surface merge work
   - Scenario profile inputs section showing the active profile, activated gates, task-shaping rules, and required evidence when they materially shape execution
   - Fidelity checkpoints before `Reference-Implementation` batches that can materially change the reference-preserved surface
   - Deviation Review join points before downstream work continues when an implementation may intentionally diverge from the reference contract
   - Task completion criteria that carry required evidence from the active profile instead of relying only on generic behavior validation
   - Analyze Remediation Mapping section when regenerating tasks after a blocked `sp-analyze` gate
   - Parallel execution examples per story
    - Planning inputs section showing locked decisions, carried risks, and required validation references when they materially shape execution
    - Planning inputs section showing implementation constitution rules when they materially shape execution
    - `Task Guardrail Index` entries or equivalent task-to-guardrail mapping when subagent work must inherit explicit execution rules
    - Implementation strategy section (phased delivery, priority-ordered delivery, capability-aware parallel execution)

6. **Report**: Output path to generated tasks.md and summary:
    - Total task count
    - Task count per user story
    - task-generation evidence paths: `task-generation/evidence-index.json`, `task-generation/checkpoints.ndjson`, and accepted `task-generation/handoffs/<lane-id>.json` files
    - Feature delivery shape (whole task graph)
    - Parallel opportunities identified
    - Parallel batch count and the join points that gate downstream work
    - Independent test criteria for each story
    - Suggested first release scope (based on the smallest coherent release slice, not automatically limited to just User Story 1)
    - Confirm first-release profile scope stayed within the two supported profiles: `Standard Delivery` and `Reference-Implementation`
    - Format validation: Confirm ALL tasks follow the checklist format (checkbox, ID, labels, file paths)
    - workflow-state path
    - Analyze remediation summary when remediation mode is active:
      - handled previous analyze findings count
      - resolved count
      - deferred count
      - not_applicable count
      - escalated count
      - evidence sections or task IDs for resolved findings
    - Analyze-Compatible Task Self-Audit result:
      - coverage mapping status
      - locked decision preservation status
      - guardrail mapping status
      - DP1/DP2/DP3 packet-readiness status
      - reference fidelity mapping status
      - unmapped task status
      - write-set conflict status
    - Recommended next command: `/sp.analyze` for normal completed or non-escalated task generation.
    - For escalated remediation: preserve the upstream `next_command` (`/sp.plan`, `/sp.clarify`, or `/sp.deep-research`) and stop without an analyze handoff.
    - cognition follow-up: if artifact-only task generation exposes future shared surfaces, workflow joins, or validation entry points that the current project cognition runtime does not yet encode, record that as an advisory in `workflow-state.md` or `tasks.md`; do not mark project cognition dirty or require a refresh until actual source/runtime changes make the runtime truth out of date.
   - before final completion text, write or update `WORKFLOW_STATE_FILE` so it records:
     - `active_command: sp-tasks`
     - `phase_mode: task-generation-only`
     - current authoritative files
     - exit criteria for task-generation completion
     - the next action required before handoff
     - `next_command: /sp.analyze` only for normal completed or non-escalated task generation
     - escalated remediation preserves the upstream `next_command` (`/sp.plan`, `/sp.clarify`, or `/sp.deep-research`) and stops without an analyze handoff

7. **Check for extension hooks**: After tasks.md is generated, check if `.specify/extensions.yml` exists in the project root.
   - If it exists, read it and look for entries under the `hooks.after_tasks` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable.
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently.

Context for task generation: $ARGUMENTS

The tasks.md should be immediately executable - each task must be specific enough that an LLM can complete it without additional context.

## Task Generation Rules

**CRITICAL**: Tasks MUST be organized by user story to enable independent implementation and testing.

**Tests are contract-driven**: If `.specify/testing/TESTING_CONTRACT.md` exists, generate test tasks by default for affected behavior changes, bug fixes, and regression-sensitive modules. Only omit tests when the change is clearly docs-only/process-only or the testing contract explicitly allows the omission.

When the testing control plane is present, generate test work that preserves its terminology:
- `small tests`: narrow unit or helper-level checks that give cheap local confidence.
- `medium tests`: local integration checks around adapter, filesystem, process, network, database, CLI, or workflow seams.
- `fast smoke`: the cheapest command-tier signal for a lane or touched module.
- `focused`: the lane acceptance command; validation_command remains the focused lane acceptance command.
- `full`: the broader regression command for final or risk-sensitive verification.

### Checklist Format (REQUIRED)

Every task MUST strictly follow this format:

```text
- [ ] [TaskID] [P?] [Story?] Description with file path
```

**Format Components**:

1. **Checkbox**: ALWAYS start with `- [ ]` (markdown checkbox)
2. **Task ID**: Sequential number (T001, T002, T003...) in execution order
3. **[P] marker**: Include ONLY if task is parallelizable
   - Parallelizable means the task has an isolated write set, no dependencies on incomplete tasks, stable upstream inputs, and an independent verification path
   - Treat shared registration files, index/exports, router tables, dependency injection containers, and other coordination surfaces as part of the write set
   - `[P]` means the task is parallel-eligible as one lane-level execution unit; it does not turn a task range or phase label into one executable lane
4. **[Story] label**: REQUIRED for user story phase tasks only
   - Format: [US1], [US2], [US3], etc. (maps to user stories from spec.md)
   - Setup phase: NO story label
   - Foundational phase: NO story label  
   - User Story phases: MUST have story label
   - Polish phase: NO story label
5. **Description**: Clear action with exact file path

### Task Granularity Contract

- Top-level tasks should usually fit one bounded implementation slice:
  - roughly 10-20 minutes
  - one stable objective
  - one isolated write set
  - one verification path
- Delegated workers may still break a task into smaller 2-5 minute atomic internal steps, but `tasks.md` should stop at the smallest unit worth explicit coordination.
- If a task can obviously be split into two independently verifiable write sets, split it.
- If splitting further would only create coordination overhead, stop and keep the task atomic.
- When later work depends on upstream execution evidence, keep that future work at the story or phase level and insert a refinement checkpoint instead of guessing detailed downstream tasks too early.

**Examples**:

- ✅ CORRECT: `- [ ] T001 Create project structure per implementation plan`
- ✅ CORRECT: `- [ ] T005 [P] Implement authentication middleware in src/middleware/auth.py`
- ✅ CORRECT: `- [ ] T012 [P] [US1] Create User model in src/models/user.py`
- ✅ CORRECT: `- [ ] T014 [US1] Implement UserService in src/services/user_service.py`
- ❌ WRONG: `- [ ] Create User model` (missing ID and Story label)
- ❌ WRONG: `T001 [US1] Create model` (missing checkbox)
- ❌ WRONG: `- [ ] [US1] Create User model` (missing Task ID)
- ❌ WRONG: `- [ ] T001 [US1] Create model` (missing file path)

### Task Organization

1. **From User Stories (spec.md)** - PRIMARY ORGANIZATION:
   - Each user story (P1, P2, P3...) gets its own phase
   - Map all related components to their story:
     - Models needed for that story
     - Services needed for that story
     - Interfaces/UI needed for that story
     - Tests specific to that story for behavior changes, bug fixes, refactors, and regression-sensitive modules
   - Mark story dependencies (most stories should be independent)

2. **From Contracts**:
   - Map each interface contract → to the user story it serves
   - For behavior changes, bug fixes, refactors, and regression-sensitive modules: Each affected interface contract → contract test tasks by default before implementation in that story's phase

3. **From Data Model**:
   - Map each entity to the user story(ies) that need it
   - If entity serves multiple stories: Put in earliest story or Setup phase
   - Relationships → service layer tasks in appropriate story phase

4. **From Setup/Infrastructure**:
   - Shared infrastructure → Setup phase (Phase 1)
   - Foundational/blocking tasks → Foundational phase (Phase 2)
   - Story-specific setup → within that story's phase

### Parallelization Rules

- Prefer parallel tasks that unblock more downstream work before consumer tasks
- Only place tasks in the same parallel batch when their write sets do not overlap
- Do not batch tasks together if they rely on changing contracts, schemas, or interfaces that are not yet stable
- Grouped parallelism is the default when multiple ready tasks have isolated write sets and stable upstream inputs
- Use a pipeline shape when outputs must flow stage-by-stage from one bounded task to the next
- Even pipeline tasks should still stop at explicit checkpoints between stages before downstream work continues
- Add a high-risk review checkpoint when the batch touches shared registration surfaces, schema changes, protocol seams, native/plugin bridges, or generated API surfaces
- Use a peer-review lane only for those high-risk batches when the review can stay read-only and independent
- Every parallel batch MUST be followed by a join point before dependent tasks continue
- If a task touches a shared registration file, it should usually be the join point task or run after the batch sequentially

### Phase Structure

- **Phase 1**: Setup (project initialization)
- **Phase 2**: Foundational (blocking prerequisites - MUST complete before user stories)
- **Phase 3+**: User Stories in priority order (P1, P2, P3...)
  - Within each story: Required tests → Models → Services → Endpoints → Integration
  - Each phase should be a complete, independently testable increment
- **Final Phase**: Polish & Cross-Cutting Concerns
