---
description: Use when the current specification package is ready for implementation planning and you need design artifacts before task breakdown or coding.
workflow_contract:
  when_to_use: The current spec package is ready for design work, but implementation should not start until explicit planning artifacts exist.
  primary_objective: Produce the planning artifact set that turns specification intent into an implementation-ready architecture and execution approach.
  primary_outputs: '`plan.md`, `research.md`, `quickstart.md`, `plan-contract.json`, `workflow-state.md`, `planning/handoffs/<lane-id>.json`, `planning/evidence-index.json`, and `planning/checkpoints.ndjson` under the active `FEATURE_DIR`, plus `data-model.md` and `contracts/` when the feature scope demands them.'
  default_handoff: '/sp.tasks for decomposition, optionally /sp.checklist for quality checks on the resulting plan package.'
handoffs:
  - label: Create Tasks
    agent: sp.tasks
    prompt: Break the plan into tasks
    send: true
  - label: Create Checklist
    agent: sp.checklist
    prompt: Create a checklist for the following domain...
---

## Workflow Contract Summary

- **When to use**: The current spec package is ready for design work, but implementation should not start until explicit planning artifacts exist.
- **Primary objective**: Produce the planning artifact set that turns specification intent into an implementation-ready architecture and execution approach.
- **Primary outputs**: `plan.md`, `research.md`, `quickstart.md`, `plan-contract.json`, `workflow-state.md`, `planning/handoffs/<lane-id>.json`, `planning/evidence-index.json`, and `planning/checkpoints.ndjson` under the active `FEATURE_DIR`, plus `data-model.md` and `contracts/` when the feature scope demands them.
- **Default handoff**: /sp.tasks for decomposition, optionally /sp.checklist for quality checks on the resulting plan package.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Translate the approved specification package into explicit implementation design artifacts, research findings, and execution guidance that can safely feed task generation.

## Context

- Primary inputs: `spec.md`, `alignment.md`, `context.md`, `references.md`, the compiled brainstorming truth and any `plan-contract.json` contract, the task-local project cognition query bundle with readiness and returned `minimal_live_reads`, and passive learning files.
- Working state lives in the active `FEATURE_DIR`, especially `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `workflow-state.md`, `plan-contract.json`, `planning/handoffs/`, `planning/evidence-index.json`, and `planning/checkpoints.ndjson`.
- This command is design-only. Planning does not grant permission to start execution.

## Process

- Recover the active feature context and validate that the specification package is ready for planning.
- Refresh or inspect repository navigation artifacts until task-relevant coverage is sufficient.
- Research, model, and document the implementation approach with explicit constraints and guardrails.
- Design every carried `CA-###` consequence obligation into operational behavior, dependency impact, recovery/validation proof, and stop-and-reopen conditions before task handoff.
- Validate the resulting plan package before handing off to task generation.

## Output Contract

- Write the implementation plan artifact set needed by `/sp-tasks`.
- Write `plan-contract.json` so route, intent, complexity, must-preserve invariants, and allowed optimization scope survive as machine-readable truth.
- Persist planning lane evidence before synthesis: every delegated planning lane writes `planning/handoffs/<lane-id>.json`, the leader updates `planning/evidence-index.json`, and checkpoint records go to `planning/checkpoints.ndjson`.
- Consume every accepted planning handoff before final synthesis: each accepted handoff must be integrated into `plan.md`, `research.md`, `quickstart.md`, `data-model.md`, `contracts/`, or `plan-contract.json`, or explicitly recorded as deferred or blocked with a reason.
- Surface risks, unresolved decisions, and planning-time constitution/guardrail requirements explicitly.
- Keep the resulting artifact set consistent enough that task generation does not need to rediscover obvious design decisions.

## Guardrails

- Do not implement code, edit tests, or start execution from `sp-plan`.
- Do not leave locked planning decisions implicit or scattered only in prose.
- Do not trust stale navigation coverage when the project cognition query bundle should be the source of truth.
- Use anchorable section headings (`## Section Name`) in all output artifacts so that downstream task generation can produce precise `file#section` context pointers.

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

**Check for extension hooks (before planning)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_plan` key
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
- Confirm project cognition freshness and valid workflow entry before deeper planning work begins.
- Keep `workflow-state.md` current as the durable source of truth for phase, allowed artifact writes, next action, and exit criteria.
- Verify the final `plan.md` and `workflow-state.md` outputs before handoff instead of relying on chat narration.
- Update durable state before compaction-risk transitions, large planning synthesis handoffs, or any stop where resume will depend on more than the visible conversation.

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify learning start --command plan --format json` when available so passive learning files exist and the current planning run sees relevant shared project memory.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader planning context.
- Open only learning detail docs linked from planning-relevant index entries, especially repeated workflow gaps or project constraints that would otherwise be rediscovered during planning.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- [AGENT] When planning friction exposes route changes, artifact rewrites, false starts, hidden dependencies, validation gaps, or reusable constraints, make sure `workflow-state.md` captures that durable context.
- [AGENT] Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify learning capture-auto --command plan --feature-dir \"$FEATURE_DIR\" --format json` when `workflow-state.md` already preserves route reasons, false starts, hidden dependencies, or reusable constraints.
- [AGENT] When the durable state does not capture the reusable lesson cleanly, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.
- Treat this as passive shared memory, not as a separate user-visible planning command.

## Workflow Phase Lock

- [AGENT] Create or resume `WORKFLOW_STATE_FILE` before substantial planning analysis.
- Read `.specify/templates/workflow-state-template.md`.
- If `WORKFLOW_STATE_FILE` is missing, recreate it from the template and the current spec package instead of continuing from chat memory alone.
- Treat `WORKFLOW_STATE_FILE` as the stage-state source of truth on resume after compaction for the current command, allowed artifact writes, forbidden actions, authoritative files, next action, and exit criteria.
- Set or update the state for this run with at least:
  - `active_command: sp-plan`
  - `phase_mode: design-only`
  - `forbidden_actions: edit source code, edit tests, implement behavior, start execution from plan artifacts`
- Do not implement code, edit source files, edit tests, or treat planning as implicit permission to start execution.
- When resuming after compaction, re-read `WORKFLOW_STATE_FILE` before proceeding.
- If native hook policy redirects a prompt-entry phase jump, return to `WORKFLOW_STATE_FILE`; repeated or explicit phase jumps are blocked by shared workflow policy.

## Outline

1. **Setup**: Run `.specify/scripts/powershell/setup-plan.ps1 -Json` from repo root and parse JSON for `FEATURE_SPEC`, `IMPL_PLAN`, `SPECS_DIR`, `BRANCH`, and `FEATURE_DIR`.
   - If `FEATURE_DIR` is not already explicit, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify lane resolve --command plan --ensure-worktree` before guessing from branch-only context.
   - When lane resolution returns a materialized lane worktree, continue planning from that isolated worktree context rather than assuming the leader workspace is the only source of truth for this feature lane.
   - Set `WORKFLOW_STATE_FILE` to `FEATURE_DIR/workflow-state.md`.
   - [AGENT] Create or resume `WORKFLOW_STATE_FILE` before substantial planning analysis.
   - Read `.specify/templates/workflow-state-template.md`.
   - If `WORKFLOW_STATE_FILE` already exists, read it first and preserve still-valid `next_action`, `exit_criteria`, and `next_command` details instead of relying on chat memory alone.
   - Persist at least these fields for the active pass:
     - `active_command: sp-plan`
     - `phase_mode: design-only`
     - `allowed_artifact_writes: plan.md, research.md, data-model.md, contracts/, quickstart.md, plan-contract.json, planning/handoffs/*.json, planning/evidence-index.json, planning/checkpoints.ndjson, workflow-state.md`
     - `forbidden_actions: edit source code, edit tests, implement behavior, start execution from plan artifacts`
     - `authoritative_files: spec.md, alignment.md, context.md, plan.md, research.md, plan-contract.json, planning/handoffs/*.json, planning/evidence-index.json`
   - When resuming after compaction, re-read `WORKFLOW_STATE_FILE` before proceeding.
   - If native hook policy redirects a prompt-entry phase jump, return to `WORKFLOW_STATE_FILE`; repeated or explicit phase jumps are blocked by shared workflow policy.

2. **Ensure project cognition runtime exists and record planning advisory state**:
   - Check whether `.specify/project-cognition/status.json` exists.
   - If it exists, use the project cognition freshness helper for the active script variant to assess freshness before trusting the current project cognition baseline.
   - [AGENT] If freshness is `missing`, stop and tell the user to run `/sp.map-scan`, then `/sp.map-build`; wait for that rebuild before continuing.
   - [AGENT] If freshness is `stale`, record a planning advisory, continue with minimal live reads from the query result, and do not require `/sp.map-update` during artifact-only `sp-plan` work.
   - [AGENT] If freshness is `support_drift`, record a planning advisory about support-surface drift and continue only with evidence-backed reads; do not reflexively route to `/sp.map-update`.
   - [AGENT] If freshness is `partial_refresh`, record a planning advisory that the refresh was incomplete, preserve `recommended_next_action`, and continue only when query results plus minimal live reads are sufficient for implementation planning.
   - [AGENT] If freshness is `possibly_stale`, inspect the reported changed paths and reasons plus `must_refresh_topics` and `review_topics`. For artifact-only `sp-plan` work, record a planning advisory for any overlapping topics, review those topic files and minimal live reads, and continue without requiring `/sp.map-scan`/`/sp.map-build`.
   - Check whether `.specify/project-cognition/status.json` exists at the repository root.
   - [AGENT] If the project cognition runtime is missing, stop and tell the user to run `/sp.map-scan`, then `/sp.map-build`; wait for that refresh before continuing.
   - Treat task-relevant coverage as insufficient when the touched area is named only vaguely, lacks ownership or placement guidance, or lacks workflow, constraint, integration, or regression-sensitive testing guidance.
   - [AGENT] If task-relevant coverage is insufficient for the current planning request, record a planning advisory, continue with minimal live reads and targeted planning assumptions, and do not require a project cognition refresh during `sp-plan`.

3. **Load context**:
   - Read `FEATURE_SPEC`
   - Read `FEATURE_DIR/brainstorming/handoff-to-specify.json` when present and treat it as the authoritative pre-plan truth package.
   - If `brainstorming/handoff-to-specify.json` contains `must_preserve`, treat those `MP-*` items as planning obligations, not background notes.
   - If `planning_gate_status` is not `ready`, stop and route back to `/sp.specify` or to the user conflict decision named by the handoff.
   - If any `conflicts` item has `status: open`, stop and ask the user to resolve the conflict before planning.
   - Read `plan-contract.json` when present and treat route, intent, complexity as authoritative planning inputs.
   - Read `FEATURE_DIR/alignment.md`
   - Read `FEATURE_DIR/context.md`
   - Read `FEATURE_DIR/references.md` if present
   - Read `FEATURE_DIR/brainstorming/handoff-to-plan.json` if present; preserve route, intent, complexity, and handoff constraints as planning inputs.
   - Read `FEATURE_DIR/deep-research.md` if present
   - Read `FEATURE_DIR/workflow-state.md` if present. When it exists, treat it as semantically required profile-aware planning context, not optional resume trivia.
   - Read `.specify/testing/TESTING_CONTRACT.md` if present
   - Read `.specify/testing/TESTING_PLAYBOOK.md` if present
   - Read `.specify/testing/COVERAGE_BASELINE.json` if present
   - Read `.specify/memory/constitution.md`
   - Read `.specify/memory/project-rules.md` if present
   - Read `.specify/memory/learnings/INDEX.md` if present
   - Open only linked learning detail docs relevant to planning so repeated workflow gaps, implementation constraints, and user defaults are not rediscovered from scratch
   - [AGENT] Query project cognition with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition lexicon --intent plan --query=\"$ARGUMENTS\" --format json`, then generate a query_plan from returned map terms, then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition query --intent plan --query-plan \"<query_plan_json>\" --format json`.
   - If the topical coverage for the touched area is missing, stale, too broad, or task-relevant coverage is insufficient, record a planning advisory in the feature artifacts, inspect the minimum live files still needed to replace guesswork with evidence, and carry explicit assumptions or follow-up tasks instead of requiring a project cognition refresh during artifact-only planning work.
   - Read `.specify/templates/research-template.md`
   - Read `.specify/templates/workflow-state-template.md`
   - Load the copied IMPL_PLAN template

## Scenario Profile Inputs

- First-release `sp-plan` supports only these active profiles from `FEATURE_DIR/workflow-state.md`: `Standard Delivery` and `Reference-Implementation`.
- Read `FEATURE_DIR/workflow-state.md` if present and consume its scenario profile contract before planning synthesis.
- Treat `active_profile`, `required_sections`, `activated_gates`, `task_shaping_rules`, `required_evidence`, and `transition_policy` as planning inputs, not status-only metadata.
- Use the existing `active_profile` contract from `workflow-state.md`; do not perform a second informal task classification pass during planning.
- Preserve `transition_policy` as an obligation field that constrains downstream handoff; do not use it as a substitute for a supported `active_profile`.
- If the active profile is `Reference-Implementation`, add `Profile-Driven Implementation Constraints` to the generated plan and promote fidelity-preservation rules, reference-object constraints, and required evidence into `Implementation Constitution`.
- If the active profile is `Standard Delivery`, keep the standard planning artifact contract and only add profile-driven constraints when `workflow-state.md` explicitly records them.
- If `workflow-state.md` presents any other `active_profile` in first release, stop and tell the operator to repair or re-run upstream scenario profile routing state before planning; do not silently reinterpret unsupported profiles as a new planning mode.

## Operational Consequence Design

Before `sp-tasks`, convert every triggered `CA-###` consequence obligation into concrete operational design.

- Preserve the upstream Affected Object Map, State-Behavior Matrix, Dependency Impact Table, Recovery And Validation Contract, and Coverage Gaps from `spec.md`, `alignment.md`, `context.md`, `references.md`, and machine-readable handoffs.
- For each implementation-shaping `CA-###` obligation, define the operational state machine, ordering, locking or lease behavior, idempotency, concurrency hazards, recovery path, observability, rollout or migration notes, and verification strategy.
- Name behavior for running-state objects explicitly: drain, cancel, force, wait, retry, resume, ignore late result, or preserve until a later lifecycle event.
- Map every dependency impact to plan sections, design artifacts, contracts, data model notes, quickstart validation, or explicit deferrals with stop-and-reopen conditions.
- Ensure `plan-contract.json` carries the same `CA-###` obligations, operational decisions, unresolved coverage gaps, and stop-and-reopen conditions as the Markdown plan.
- If any `CA-###` obligation cannot be designed safely in `sp-plan`, stop before `sp-tasks` and route back to `/sp.specify`, `/sp.clarify`, or `/sp.deep-research` with the missing decision named.

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
- `needs_update`: record a planning advisory, perform the returned `minimal_live_reads`, and continue without requiring `/sp.map-update` during `sp-plan`.
- `needs_rebuild`: route through `/sp.map-scan`, then `/sp.map-build`.
- `blocked`: stop and report the blocking runtime issue.
- **CARRY FORWARD**: Promote project-cognition facts into planning constraints,
  `Implementation Constitution`, boundary rules, verification strategy, and
  `plan-contract.json` when they affect implementation shape.

4. **Validate alignment status before planning**:
   - If `alignment.md` is missing:
     - ERROR "Missing alignment report. Run /sp.specify first or re-run it to complete requirement alignment."
   - If `context.md` is missing:
     - ERROR "Missing context artifact. Run /sp.specify again or /sp.clarify to rebuild `context.md` before planning."
   - Read `Locked Decisions For Planning`, `Outstanding Questions`, `Remaining Risks`, and `Planning Gate Recommendation` from `alignment.md` when present.
   - Read `Locked Decisions`, `Claude Discretion`, `Canonical References`, `Existing Code Insights`, `Specific User Signals`, and `Outstanding Questions` from `context.md`.
   - If the alignment report status is `Aligned: ready for plan`:
     - continue only if no planning-critical unresolved items remain around scope, workflow behavior, data/state expectations, compatibility, external dependencies, or success criteria
   - If the alignment report status is `Force proceed with known risks`:
     - continue, but carry all remaining risks into planning as explicit planning constraints and open risks
   - Otherwise:
     - ERROR "Specification is not aligned enough for planning."
   - If `Planning Gate Recommendation` indicates `/sp.clarify` or the unresolved items still materially affect plan structure:
     - ERROR "Specification still has planning-critical gaps. Run /sp.clarify or refine /sp.specify before planning."
   - If `Planning Gate Recommendation` indicates `/sp.deep-research`, or the Feasibility / Deep Research Gate says `Needed before plan` or `Blocked`:
     - ERROR "Specification still has unproven feasibility. Run /sp.deep-research before planning."
   - If `deep-research.md` exists but lacks a `Planning Handoff` section and the feature depends on its research conclusions:
     - ERROR "Deep research evidence is not ready for planning. Re-run /sp.deep-research to synthesize a Planning Handoff."
   - If `deep-research.md` exists and includes Planning Handoff IDs (`PH-###`), preserve those IDs in plan sections that consume the research. Do not collapse traceable handoff items into unsourced prose.

5. **Assume the specification package is analysis-first**:
   - Treat the canonical workflow token `/sp.specify` as the primary pre-planning requirement-analysis entry point.
   - Tell the user to run `/sp.specify` when they need to start or repeat that requirement-analysis step manually.
   - Treat the canonical workflow token `/sp.clarify` as the follow-up enhancement path when the spec package needs deeper analysis before planning.
   - Tell the user to run `/sp.clarify` when that follow-up must be invoked manually.
   - Use capability decomposition from `spec.md` when sequencing design work
   - Use `references.md` when retained sources or reusable examples affect planning choices
   - Use `deep-research.md` when feasibility evidence, disposable demo results, research-agent findings, synthesis decisions, or implementation-chain constraints affect planning choices
   - Treat the `Planning Handoff` section in `deep-research.md` as a direct planning input, not a status note. Preserve its `PH-###` IDs, recommended approach, architecture implications, module boundaries, API/library choices, data flow notes, demo artifacts, validation implications, rejected options, and residual risks.
   - Use the `Evidence Quality Rubric` and `Planning Traceability Index` from `deep-research.md` to distinguish blocking constraints from informative context.
   - Treat `Locked Decisions`, `Claude Discretion`, `Canonical References`, and `Deferred / Future Ideas` in `spec.md` as active planning inputs, not descriptive appendix material
   - If `spec.md` includes `Fidelity Requirements`, treat `Reference Object`, `Required Fidelity`, and `Reference Behavior Inventory` as mandatory planning inputs rather than optional background.
   - Treat `context.md` as the primary implementation-context artifact that captures downstream planning decisions explicitly
   - Treat `workflow-state.md` scenario profile fields as active planning inputs. The plan consumes the existing supported profile contract persisted by upstream routing.
   - Do not perform a second informal task classification pass; `sp-plan` consumes `active_profile`, `required_sections`, `activated_gates`, `task_shaping_rules`, `required_evidence`, and `transition_policy` from `workflow-state.md`.
   - Do not introduce a separate clarification command as the normal next step for routine planning readiness
   - [AGENT] Before plan synthesis begins, split the work only into the supported plan lanes: `research`, `data model`, `contracts`, and `quickstart and validation scenarios`.
   - [AGENT] Before dispatch begins, assess the current agent capability snapshot and apply the shared policy contract: `choose_subagent_dispatch(command_name="plan", snapshot, workload_shape)`.
   - Before dispatching any planning lane, persist a `planning_checkpoint` record to `planning/checkpoints.ndjson` with the lane id, dispatch shape, authoritative inputs, expected handoff path, and current workflow-state summary.
   - Each delegated planning lane must persist the lane's structured handoff to `planning/handoffs/<lane-id>.json` before the leader accepts the lane, waits at a join point, or synthesizes `plan.md`, `research.md`, or `plan-contract.json`.
   - Update `planning/evidence-index.json` after each accepted lane handoff with lane id, handoff path, source artifacts inspected, decisions or constraints contributed, affected plan sections or generated artifacts, blocker status, and integration status.
   - Consume `planning/evidence-index.json` before final synthesis: for every accepted handoff, mark the handoff as `integrated`, `deferred`, or `blocked`, and name the target `plan.md`, `research.md`, `quickstart.md`, `data-model.md`, `contracts/`, or `plan-contract.json` section that consumed it.
   - Do not synthesize `plan.md`, `research.md`, or `plan-contract.json` from chat-only lane results. If a lane reports only prose, idle state, or an unwritten handoff, mark `subagent-blocked`, write the blocker to `workflow-state.md`, and stop or re-dispatch with a valid handoff path.
   - When resuming after compaction, re-read `workflow-state.md`, `planning/checkpoints.ndjson`, `planning/evidence-index.json`, and all accepted `planning/handoffs/<lane-id>.json` files before continuing planning synthesis.
   - Persist the decision fields exactly: `execution_model: subagent-mandatory`, `dispatch_shape: one-subagent | parallel-subagents`, `execution_surface: native-subagents`.
   - Decision order is fixed:
     - If exactly one validated isolated plan lane exists, dispatch `one-subagent`.
     - If two or more validated isolated plan lanes exist, dispatch `parallel-subagents`.
     - If no validated isolated plan lane can be packetized, mark `subagent-blocked` and stop.
    - Once a validated lane exists, leader-inline execution of substantive lane work is forbidden.
   - Collaboration routing is determined only by validated lane count and isolation. Do not make a separate judgment about whether collaboration is justified.
   - Required join points:
     - before final constitution and risk re-check
     - before writing the consolidated implementation plan
   - Record the chosen dispatch shape, blocked reason if any, selected lanes, and join points in the planning artifacts you generate.
   - In `plan-contract.json`, include references to accepted `planning/handoffs/<lane-id>.json` files that shaped each major plan decision, research conclusion, generated artifact, risk, guardrail, or escalation.
   - Do not mark planning complete while `planning/evidence-index.json` contains an accepted handoff without an explicit consuming artifact section, deferral, or blocker reason.
   - Keep the shared workflow language integration-neutral. Do not present Codex-only runtime surface wording in this shared template.

6. **Execute the plan workflow** using the IMPL_PLAN template:
   - Fill Technical Context (mark unknowns as `NEEDS CLARIFICATION`)
   - Add `Implementation Constitution` using architecture invariants, boundary ownership, forbidden implementation drift, required implementation references, and review focus from repository evidence
    - `Implementation Constitution` MUST be added if any one of the following conditions is true:
      - the feature touches an established framework-owned boundary or adapter pattern
      - the touched area is a native bridge, plugin surface, protocol seam, generated API surface, or other contract-heavy boundary
      - generic implementation drift would violate an existing repository pattern
      - the repository already has canonical boundary files or examples that implementers must inspect before changing code safely
    - If none of those conditions is true, the plan MAY omit `Implementation Constitution`.
    - Add `Dispatch Compilation Hints` whenever subagent execution would be unsafe without an explicit boundary owner, packet references, validation gates, or task-level quality floor
   - Fill Constitution Check from the constitution
   - Add a `Scenario Profile Inputs` section using `workflow-state.md` when present, including `active_profile`, `required_sections`, `activated_gates`, `task_shaping_rules`, `required_evidence`, and `transition_policy`.
   - Add a `Profile-Driven Implementation Constraints` section when `workflow-state.md` records profile-specific implementation obligations.
   - If `active_profile` is `Reference-Implementation`, promote fidelity-preservation rules, reference-object constraints, allowed-drift limits, and required evidence into `Implementation Constitution` so implementers preserve the reference instead of treating it as background inspiration.
   - When `Reference Behavior Inventory` exists, copy each preserved or redesigned behavior into `Reference Fidelity Inputs` and ensure the consolidated plan names where that behavior is preserved, redesigned, or explicitly deferred.
   - Add an `Input Risks From Alignment` section using remaining risks from `alignment.md`
   - Add a `Feasibility Evidence From Deep Research` section when `deep-research.md` exists, preserving proven chains, research-agent findings, spike evidence, constraints, rejected options, and residual risks
   - Add a `Planning Handoff From Deep Research` section when `deep-research.md` contains `Planning Handoff`, and translate that handoff into implementation strategy, architecture implications, module boundaries, API/library choices, data flow notes, validation implications, and plan-level risks
   - Add a `Deep Research Traceability Matrix` section when `deep-research.md` contains Planning Handoff IDs:
     - columns: `Plan Decision`, `Handoff ID`, `Capability ID`, `Track ID`, `Evidence / Spike ID`, `Evidence Quality`, `Plan Action`
     - every architecture, module-boundary, API/library, data-flow, validation, or residual-risk decision derived from deep research must cite at least one `PH-###` item
     - mark any `PH-###` item not consumed by the plan as `deferred`, `not applicable`, or `requires user decision`
   - Copy locked planning decisions from `alignment.md`, `context.md`, `spec.md`, and `deep-research.md` into planning constraints, assumptions, or design notes so they are not silently dropped
   - Add each implementation-shaping `MP-*` item to `plan.md#Must-Preserve Carry-Forward`, `Locked Planning Decisions`, `Implementation Constitution`, or `Alignment Inputs`.
   - Preserve `MP-*` IDs when the plan consumes goals, non-goals, references, decisions, trade-offs, and stop-and-reopen conditions.
   - Copy implementation-chain constraints and synthesis decisions from `deep-research.md` into the implementation plan instead of rediscovering or weakening them
   - If `.specify/testing/TESTING_CONTRACT.md` exists, copy the project-level testing rules into the implementation plan instead of treating tests as optional follow-up work. Preserve the stronger brownfield testing inputs carried from `sp-specify`: module priority waves, covered-module policy, `small / medium / large` policy, scenario matrix expectations, local integration seam expectations, allowed testability refactors, coverage goals, CI gate expectations, and command-tier expectations for `fast smoke`, `focused`, and `full`
   - If `.specify/testing/TESTING_PLAYBOOK.md` exists, preserve the canonical test, targeted-test, and coverage commands inside the generated plan artifacts
   - Promote framework and boundary rules from "technical background" into explicit implementation constraints rather than leaving them as implied context
   - Evaluate gates (ERROR if violations are unjustified)
   - Phase 0: generate `research.md` and resolve all `NEEDS CLARIFICATION`
   - Phase 1: generate `data-model.md`, `contracts/`, and `quickstart.md`
   - Phase 1: update agent context by running the agent script
   - Before finalizing the consolidated implementation plan, verify that no locked planning decision or implementation constitution rule has been silently omitted from the generated plan artifacts
   - Re-evaluate Constitution Check after design artifacts exist

7. **Stop and report**:
    - write `FEATURE_DIR/plan/plan-contract.json` or `FEATURE_DIR/plan-contract.json` as the machine-readable planning contract
    - branch
    - plan path
    - alignment status
    - generated artifacts
    - planning evidence paths: `planning/evidence-index.json`, `planning/checkpoints.ndjson`, and accepted `planning/handoffs/<lane-id>.json` files
    - workflow-state path
    - recommended follow-up quality check: `/sp.checklist` for a requirements/plan package audit before moving on to decomposition
    - cognition follow-up: if artifact-only planning work introduces or sharpens future architecture boundaries, ownership splits, integration surfaces, workflow contracts, or verification routes that the current project cognition runtime does not yet encode, record that as an advisory in `workflow-state.md` or `plan.md`; do not mark project cognition dirty or require a refresh until actual source/runtime changes make the runtime truth out of date
    - before final completion text, write or update `WORKFLOW_STATE_FILE` so it records:
      - `active_command: sp-plan`
      - `phase_mode: design-only`
      - current authoritative files
     - exit criteria for planning completion
     - the next action required before handoff
     - `next_command: /sp.tasks`
- [AGENT] before final completion text, if auto-capture did not preserve a reusable `workflow_gap` or `project_constraint`, use the manual `learning capture` helper surface.
  Required options: `--command`, `--type`, `--summary`, `--evidence`
   - leave one-off runs as `--decision none` with no reusable lesson; store reusable lessons as index/detail entries, and use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify learning promote --target learning ...` only after explicit confirmation or proven recurrence
   - only ask for confirmation when a new learning is highest-signal, such as an explicit user default, clear cross-stage reuse, or repeated recurrence that should become shared project memory
   - Use the user's current language for the completion report and any explanatory text, while preserving literal command names, file paths, and fixed status values exactly as written.

8. **Check for extension hooks**: After reporting, check if `.specify/extensions.yml` exists in the project root.
   - If it exists, read it and look for entries under the `hooks.after_plan` key
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

## Phases

### Phase 0: Outline & Research

1. Extract unknowns from Technical Context:
   - For each `NEEDS CLARIFICATION` -> research task
   - For each dependency -> best-practices task
   - For each integration -> patterns task
   - For each high-risk architectural choice -> stack/pattern/pitfall task
   - For each external tool, runtime, or service dependency -> availability and fallback task

2. Generate and dispatch research tasks.
   - Prefer official documentation, standards, and primary sources for factual claims.
   - Treat model memory as provisional unless confirmed by a primary source or direct repository evidence.
   - Research must reduce planning ambiguity, not accumulate background reading.

3. Consolidate findings in `research.md` using:
   - Decision
   - Rationale
   - Alternatives considered
   - Source confidence (`verified`, `cited`, or `assumed`) for each consequential claim
   - Standard stack recommendations where the phase depends on specific libraries, tools, or frameworks
   - `Don't hand-roll` guidance for problems that should use established libraries or platform capabilities
   - Common pitfalls, failure modes, and anti-patterns the planner should explicitly avoid
   - Assumptions log for anything still not verified in this session
   - Validation notes describing how the researched choice should be proven during implementation or verification
   - Environment or dependency notes when the phase depends on tools, services, runtimes, or external infrastructure that may not be present

4. Research quality bar:
   - Do not present unverified claims as settled facts.
   - If a claim could materially change plan structure, security posture, compatibility, or verification scope, it must either be verified, explicitly cited, or moved into the assumptions log.
   - Prefer prescriptive recommendations over broad option dumps once the evidence is strong enough to guide planning.
   - The finished `research.md` should answer: "What does the planner need to know to produce a high-quality implementation plan without rediscovering the domain?"
   - Use `.specify/templates/research-template.md` as the default structure for `research.md`; remove sections that are not relevant rather than leaving placeholder text behind.

**Output**: `research.md` with all `NEEDS CLARIFICATION` resolved

### Phase 1: Design & Contracts

**Prerequisites:** `research.md` complete

1. **Conditional: `data-model.md`** — Required only when the spec introduces new entities, data structures, state transitions, or persistence concerns. For pure logic changes, bug fixes, or config-only work, skip and note the reason in plan.md.
2. **Conditional: `contracts/`** — Required only when the feature defines new external interfaces, APIs, cross-service contracts, or protocol boundaries. For internal-only changes, skip and note the reason.
3. **`quickstart.md`** — Generate for every feature. Keep it focused on the smallest integration scenario that validates the feature works end-to-end.
4. Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType opencode` to update agent-specific context.

**Output**: `research.md` (required), `quickstart.md` (required), plus `data-model.md` and `contracts/*` when the feature scope demands them. Note skipped conditional artifacts in plan.md.

## Input Risks From Alignment

- [Risk 1 from alignment.md, or "None"]
- [Risk 2 from alignment.md, or omit if none]

## Key Rules

- Use absolute paths
- ERROR on gate failures or unresolved clarifications
- Match the user's current language for all user-visible output unless a literal command name, file path, or fixed status value must remain unchanged.
