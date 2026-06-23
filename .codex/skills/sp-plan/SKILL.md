---
name: "sp-plan"
description: "Use when the current specification package is ready for implementation planning and you need design artifacts before task breakdown or coding."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/plan.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: The current spec package is ready for design work, but implementation should not start until explicit planning artifacts exist.
- **Primary objective**: Produce the planning artifact set that turns specification intent into an implementation-ready architecture and execution approach.
- **Primary outputs**: `plan.md`, `research.md`, `quickstart.md`, `plan-contract.json`, and `workflow-state.md` under the active `FEATURE_DIR`; `data-model.md` and `contracts/` when the feature scope demands them; `planning/handoffs/<lane-id>.json`, `planning/evidence-index.json`, and `planning/checkpoints.ndjson` only when delegated planning lanes are used.
- **Default handoff**: /sp.tasks for decomposition; /sp.checklist remains optional for requirements-quality review, not a default handoff.
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
- Validate `FEATURE_DIR/brainstorming/handoff-to-specify.json` before planning from a discussion handoff.
- Stop when `planning_gate_status` is not `ready`, `quality_gate.user_confirmed` is missing, `context_boundary` is incomplete, target project root is required but missing, hard unknowns remain open, or conflicts remain open.
- For cross-project implementation, plan from the target project context and record that current project cognition cannot prove target-project implementation facts.
- Use target cognition, minimal live reads in the target, user confirmation, or explicit assumptions for target evidence; do not ask the user to rebuild current-project cognition for target files.
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
- Do not trust stale navigation coverage as evidence; use the project cognition query bundle as advisory navigation and prove claims from live project facts.
- Use anchorable section headings (`## Section Name`) in all output artifacts so that downstream task generation can produce precise `file#section` context pointers.

## Senior Consequence Analysis Gate

Run this gate whenever the request, artifact set, defect, or planned change can affect lifecycle operations, running objects, concurrent work, destructive behavior, shared state, downstream consumers, compatibility, security-sensitive behavior, or multiple plausible product behaviors.

Project cognition first. Use the project cognition runtime to identify ownership, consumers, state surfaces, change-propagation facts, verification routes, conflicts, known unknowns, and coverage gaps. Senior consequence analysis second. Turn those facts into explicit product and implementation obligations instead of treating the graph as the decision-maker.

Project cognition readiness provides routing advice. If readiness is `query_ready`, read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons. If readiness is `review`, inspect the returned `minimal_live_reads` before continuing and treat `coverage_diagnostics` as confidence and closeout signals. If readiness is `needs_rebuild`, continue with live repository evidence and recommend `$sp-map-scan -> $sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`. If readiness is `blocked`, report the blocked state and continue with live repository evidence unless the user's actual request is to fix cognition runtime state. If readiness is `unsupported_runtime`, continue with live evidence and record that compass intake was unavailable. If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements; do not recommend map-scan -> map-build solely because the graph has no paths. Carry relevant project cognition facts, returned `minimal_live_reads`, inference notes, and coverage gaps into the workflow's artifacts or durable state, but back consequence claims with live code, tests, scripts, configuration, or authoritative docs. Mutation closeout is separate from entry routing: entry stale may continue, but that does not allow source/runtime mutation workflows to defer closeout. Workflow-owned mutation closeout is not an external map-maintenance handoff; after changing project-related files or behavior, the workflow must run inline project cognition update from its changed paths, affected surfaces, and verification evidence, with `project-cognition mark-dirty` only as fallback when inline update cannot complete. `sp-map-update` is for manual/external maintenance and follow-up repair; it is external map maintenance, not routine closeout for this workflow's own changes. In shared routing summaries, sp-map-update is for manual/external maintenance and ordinary existing-baseline gaps.

Required output when the gate triggers:

- **Affected Object Map**: name each object, record, worker, queue, artifact, command, API, file surface, user-visible state, or downstream consumer that can be affected.
- **State-Behavior Matrix**: describe behavior for each important lifecycle state, including created, queued, running, paused, failed, cancelled, completed, resumed, archived, missing, stale, or partially refreshed states when relevant.
- **Dependency Impact Table**: map direct dependencies, indirect consumers, shared state, compatibility surfaces, validation routes, and adjacent workflows that can break if semantics change.
- **Recovery And Validation Contract**: state rollback, retry, idempotency, cleanup, migration, observability, and validation evidence required before handoff or completion.
- **Coverage Gaps**: list what project cognition or live evidence cannot prove, who must resolve each gap, the latest safe resolve phase, the stop-and-reopen condition, and the routing decision: current workflow may continue with an assumption, must ask the user, must route to clarification or deep research, or must request map maintenance.
- **Consequence Obligations**: assign stable `CA-###` IDs to every obligation that must survive downstream handoff, task generation, worker packets, verification, or debug closeout. Each `CA-###` must include claim, affected objects, owner workflow, latest resolve phase, status, and stop-and-reopen condition.

Stand down only for docs-only wording changes, trivial isolated fixes, or local refactors that cannot affect lifecycle operations, running state, destructive operations, shared state, downstream consumers, compatibility, security, or multiple behavior choices. Record the no-trigger reason or stand-down reason in the workflow's durable artifact or closeout before skipping the required outputs.

If the gate triggers and the current workflow cannot preserve the required outputs, stop and route to the workflow that can. Do not mark ready, resolved, handoff-ready, planning-ready, or complete while triggered consequence obligations remain unresolved, unmapped, or unsupported by validation evidence.

## Adaptive Plan/Tasks Execution

This partial is command-scoped for `sp-plan` and `sp-tasks` only. It does not change the mandatory subagent contract used by implementation, debug, map, PRD, or other workflows.

Select the execution mode before dispatch:

- `light`: low-risk, single-lane artifact work that is safe for leader-inline synthesis.
- `standard`: bounded planning or task-generation work where native subagents should be used when available.
- `heavy`: safety-critical, cross-boundary, high-risk, or hard-to-packetize work that requires safe native delegation before synthesis continues.

Record the adaptive decision fields exactly:

- `execution_model: adaptive`
- `execution_mode: light | standard | heavy`
- `workflow_status: ready | blocked`
- `dispatch_shape: leader-inline | one-subagent | parallel-subagents | subagent-blocked`
- `execution_surface: leader-inline | native-subagents | none`
- `capability_degraded: false | true`
- `blocked_reason: required when blocked`

Use `choose_subagent_dispatch(command_name="plan" | "tasks", snapshot, workload_shape)` as the shared policy contract. Derive `workload_shape.lightweight_safe` from workload shape and risk keys; do not invent a separate template-only boolean.

Dispatch rules:

- Light mode records `dispatch_shape: leader-inline`, `execution_surface: leader-inline`, `workflow_status: ready`, and `capability_degraded: false`.
- Standard mode uses native subagents when available: one validated lane records `one-subagent`; two or more isolated lanes record `parallel-subagents`.
- Standard mode may degrade to leader-inline only when native subagents are unavailable and no high-risk trigger is present; record `capability_degraded: true`.
- Heavy mode must use native subagents with safely packetized lanes. If native subagents are unavailable, or if the work cannot be packetized safely, record `workflow_status: blocked`, `dispatch_shape: subagent-blocked`, `execution_surface: none`, and `blocked_reason`.

Artifact-writing delegated lanes must use writable, execution-capable native subagents. If the runtime exposes role, sandbox, or permission choices, select a role/sandbox that can write the declared handoff file. Do not dispatch a read-only explorer, reviewer, or diagnostic lane when the lane must write a filesystem handoff; read-only lanes may provide supplemental evidence, but they do not satisfy `one-subagent` or `parallel-subagents` handoff requirements. The lane contract's allowed write scope must include the exact expected handoff path and must forbid unrelated writes unless the command explicitly assigns an additional generated artifact. If a delegated lane returns prose, idle state, or an unwritten handoff, stop or re-dispatch with a writable lane and the valid handoff path.

Delegated lanes still require structured handoffs before synthesis. If delegated lanes were used, consume the evidence index and every accepted handoff before final output. If no lanes were delegated, report the delegated-lane field as `none`.

Managed-team fallback is not part of adaptive plan/tasks dispatch. Do not route blocked adaptive planning or task generation to `sp-teams`, managed-team lifecycle language, or a durable team fallback from this command.

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

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@684d82cdec709d03bf5dfc07c9da71ea7cec93f8 specify learning start --command plan --format json` when available so passive learning files exist and the current planning run sees relevant shared project memory.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader planning context.
- Open only learning detail docs linked from planning-relevant index entries, especially repeated workflow gaps or project constraints that would otherwise be rediscovered during planning.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- [AGENT] When planning friction exposes route changes, artifact rewrites, false starts, hidden dependencies, validation gaps, or reusable constraints, make sure `workflow-state.md` captures that durable context.
- [AGENT] Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@684d82cdec709d03bf5dfc07c9da71ea7cec93f8 specify learning capture-auto --command plan --feature-dir \"$FEATURE_DIR\" --format json` when `workflow-state.md` already preserves route reasons, false starts, hidden dependencies, or reusable constraints.
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
   - If `FEATURE_DIR` is not already explicit, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@684d82cdec709d03bf5dfc07c9da71ea7cec93f8 specify lane resolve --command plan --ensure-worktree` before guessing from branch-only context.
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
   - [AGENT] If freshness is `missing`, continue with live repository evidence when workflow policy allows degraded advisory navigation; recommend `$sp-map-scan`, then `$sp-map-build` only as follow-up brownfield first-baseline maintenance unless the user explicitly requested cognition repair or planning truly cannot proceed without a usable baseline.
   - [AGENT] If freshness is `stale`, record a planning advisory, continue with minimal live reads from the query result, and do not require `$sp-map-update` during artifact-only `sp-plan` work.
   - [AGENT] If freshness is `support_drift`, record a planning advisory about support-surface drift and continue only with evidence-backed reads; do not reflexively route to `$sp-map-update`.
   - [AGENT] If freshness is `partial_refresh`, record a planning advisory that the refresh was incomplete, preserve `recommended_next_action`, and continue only when query results plus minimal live reads are sufficient for implementation planning.
   - [AGENT] If freshness is `possibly_stale`, inspect the reported changed paths and reasons plus `must_refresh_topics` and `review_topics`. For artifact-only `sp-plan` work, record a planning advisory for any overlapping topics, review those topic files and minimal live reads, and continue without requiring `$sp-map-scan`/`$sp-map-build`.
   - Check whether `.specify/project-cognition/status.json` exists at the repository root.
   - [AGENT] If the project cognition runtime is missing, continue with live repository evidence when workflow policy allows degraded advisory navigation; recommend `$sp-map-scan`, then `$sp-map-build` only as follow-up brownfield first-baseline maintenance unless the user explicitly requested cognition repair or planning truly cannot proceed without a usable baseline.
   - Treat task-relevant coverage as insufficient when the touched area is named only vaguely, lacks ownership or placement guidance, or lacks workflow, constraint, integration, or regression-sensitive testing guidance.
   - [AGENT] If task-relevant coverage is insufficient for the current planning request, record a planning advisory, continue with minimal live reads and targeted planning assumptions, and do not require a project cognition refresh during `sp-plan`.

3. **Load context**:
   - Read `FEATURE_SPEC`
   - Read `FEATURE_DIR/brainstorming/handoff-to-specify.json` when present and treat it as the authoritative pre-plan truth package.
   - If `brainstorming/handoff-to-specify.json` contains `must_preserve`, treat those `MP-*` items as planning obligations, not background notes.
   - If `planning_gate_status` is not `ready`, stop and route back to `$sp-specify` or to the user conflict decision named by the handoff.
   - If `quality_gate.user_confirmed` or equivalent user-confirmed `quality_gate.status` is missing, stop and route back to `$sp-specify` or `sp-discussion` according to the recorded blocker.
   - If `handoff_goal` is missing or vague, stop and route back to `sp-discussion` for handoff refresh.
   - If `context_boundary` is incomplete, stop before structural planning.
   - If `target_project_root` is required but missing, stop before structural planning.
   - If hard unknowns or open conflicts remain, stop and report the named blocker.
   - If `target_project_root` differs from `current_project_root`, plan from the target project context. Current project's cognition is not proof of target-project implementation facts.
   - For cross-project implementation, artifact-only planning may proceed only with explicit minimal live reads, target path confirmation, and recorded risk when target cognition is stale or missing.
   - Must not tell the user to run current-project `$sp-map-scan -> $sp-map-build` to fix target-project coverage.
   - If any `conflicts` item has `status: open`, stop and ask the user to resolve the conflict before planning.
   - Read `plan-contract.json` when present and treat route, intent, complexity as authoritative planning inputs.
   - Read `FEATURE_DIR/alignment.md`
   - Read `FEATURE_DIR/context.md`
   - Read `FEATURE_DIR/references.md` if present
   - Read `FEATURE_DIR/brainstorming/handoff-to-plan.json` if present; preserve route, intent, complexity, and handoff constraints as planning inputs.
   - Read `FEATURE_DIR/deep-research.md` if present
   - Read `FEATURE_DIR/workflow-state.md` if present. When it exists, treat it as semantically required profile-aware planning context, not optional resume trivia.
   - Read `.specify/memory/constitution.md`
   - Read `.specify/memory/project-rules.md` if present
   - Read `.specify/memory/learnings/INDEX.md` if present
   - Open only linked learning detail docs relevant to planning so repeated workflow gaps, implementation constraints, and user defaults are not rediscovered from scratch
   - [AGENT] Query project cognition with `C:\Users\11034\.specify\bin\project-cognition.exe compass --intent plan --query=\"$ARGUMENTS\" --format json`. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`. Do not treat first-pass reads as the final edit scope. Use `project-cognition expand` only when the packet's coverage state or live evidence requires it. Use the advanced `lexicon -> semantic_intake -> query` flow only when `compass_state`, coverage diagnostics, localization, or live evidence requires explicit concept decisions. In that escalation, run `project-cognition query --query-plan "<query_plan_json>"` with `query_plan`, `semantic_intake`, `concept_decisions`, and facet coverage
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
- If any `CA-###` obligation cannot be designed safely in `sp-plan`, stop before `sp-tasks` and route back to `$sp-specify`, `$sp-clarify`, or `$sp-deep-research` with the missing decision named.

## Capability Preservation Planning

Before command, route, or contract design is locked, preserve every operation-shaped capability from `spec.md`, `alignment.md`, `context.md`, and `brainstorming/handoff-to-specify.json`.

- Treat new/create/scaffold/authoring/template-creation signals as buildable capability operations when they were preserved or in scope upstream.
- Command-surface minimization must not delete capability. If the plan chooses a small public command surface, perform entry-point remapping: map the capability to a TUI route, core API, public CLI command, private helper invoked by the TUI, or an explicitly user-confirmed deferral.
- For every remapped capability, name the selected entry point, owning module or route, design artifact, quickstart or test proof, and any user confirmation for narrowing.
- If the plan removes or defers an upstream operation-shaped capability because of a command-surface constraint, stop and route back to `$sp-specify` or `$sp-clarify` unless the user already confirmed that narrowing.
- Record create/scaffold operation mappings in `plan.md#Capability Preservation Plan` and in `plan-contract.json` so `sp-tasks` cannot convert them into template-only or documentation-only work.
- A static template directory, manual copy docs, or authoring guide is support material; it is not an implementation of a confirmed scaffold operation unless the user-confirmed scope says manual copy is the intended entry point.

## Project Cognition Advisory Gate

This planning-only command should treat the project cognition runtime as an
advisory navigation index, not a mandatory pre-source gate.

### Advisory Rule

Use project cognition when available to find likely owners, affected paths,
risks, verification routes, and minimal live reads. Do not treat map output as
evidence by itself. Technical claims must be backed by live code, tests,
scripts, configuration, or authoritative docs.

### Required Project Cognition Compass

Default project cognition intake is `project-cognition compass --intent <intent> --query="$ARGUMENTS" --format json`.

Consume the packet in this order:

1. Read top-level `minimal_live_reads` first and use those files as the bounded first live evidence route.
2. Then use lane-level `first_pass_paths` for reasons, evidence hints, verification hints, follow-up surfaces, and `before_fix_claim` checks.
3. Treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates.
4. Treat `expansion_ref` as a normal continuation path. Run `project-cognition expand --id <id> --section <section> --format json` only when coverage state or live evidence requires more map detail.
5. Do not infer final edit scope from `minimal_live_reads` or `first_pass_paths`.

Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. Compass-specific advice is in `compass_state` and `recommended_next_action`.

- `query_ready`: read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons before expanding.
- `review`: inspect the returned `minimal_live_reads` before expanding and carry review notes from `coverage_diagnostics`.
- `needs_rebuild`: reserve `$sp-map-scan -> $sp-map-build` for documented brownfield rebuild triggers.
- `blocked`: report the runtime state clearly; continue with live evidence only when this workflow allows degraded advisory navigation.
- `unsupported_runtime`: continue with live evidence and record that compass intake was unavailable.

When `compass_state=needs_semantic_intake`, the agent writes `semantic_intake` from project vocabulary and reruns compass with `--semantic-intake-file`, or uses the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed.

### Advanced Routing

Advanced routing remains available as `project-cognition lexicon --mode catalog`, agent-authored `semantic_intake` and `concept_decisions`, then `project-cognition query --query-plan`. Use it when the first compass packet is too draft-like, a workflow needs explicit concept decisions, or coverage cannot be resolved from the default packet.

The advanced `lexicon -> semantic_intake -> query` path retrieves the schema v2 `alias_index`-backed alias catalog, helps agents normalize user input into project vocabulary, records `alias_interpretations`, selects task-relevant `selected_concepts`, records unsafe or irrelevant `rejected_concepts`, writes per-concept `concept_decisions`, carries `lexicon_generation_id`, and then runs `project-cognition query --query-plan`. If the runtime reports schema v1 or rebuild-required readiness, do not query through the old DB; continue with live repository evidence and recommend `sp-map-scan -> sp-map-build` when a usable brownfield baseline is needed. When writing the recommendation in plain text, use: run sp-map-scan -> sp-map-build.

If `project-cognition query` reports query-plan diagnostics, carry forward its `warnings`, `repair_hints`, normalized `query_plan`, structured `errors`, and `expected_shape` instead of reducing them to a raw parser exception.

### Agent-Owned Semantic Normalization

Agent-owned semantic normalization is mandatory for the advanced path. The raw lexicon ranking and `agent_normalization` are only bootstrap signals for retrieving the alias catalog and candidate universe; they are not route decisions. Raw lexicon ranking is only a bootstrap. Treat `agent_normalization.required=true` as a non-intelligent CLI reminder to write `semantic_intake` from the alias catalog (action: write_semantic_intake_from_alias_catalog). If `agent_normalization` is omitted, `omitted => required=false`: treat it as `required=false`; omission does not make raw lexical ranking authoritative. If raw `concept_candidates` are all `score=0`, or the prompt is localized, mixed-language, CJK, colloquial, symptom-first, or mixed-language or CJK text, do not stop at the raw score. CJK or mixed CJK/ASCII input still requires agent normalization even when positive raw lexical matches exist because embedded project tokens do not translate the surrounding user language. Extract embedded project terms such as command names, UI labels, file stems, state names, adapter names, and skill or package identifiers from the user's wording and the alias catalog. The agent still owns translation; `agent_normalization` is advisory guidance, not a route decision. Put those translated terms into `normalized_query`, `alias_interpretations`, `intent_facets`, `expanded_queries`, and `repository_search_terms`, then select or reject concepts by facet coverage.

Use this canonical query-plan skeleton when shaping `<query_plan_json>`. Keep `alias_interpretations` as an array of objects, not strings:

```json
{
  "raw_query": "$ARGUMENTS",
  "semantic_intake": {
    "workflow_intent": "<active workflow intent>",
    "normalized_query": "<project-language interpretation>",
    "intent_facets": ["<facet the selected concept must cover>"],
    "negative_constraints": ["<scope boundary not to treat as route truth>"],
    "alias_interpretations": [
      {"alias": "<user term>", "meaning": "<project term>", "confidence": "medium"}
    ],
    "open_semantic_questions": []
  },
  "selected_concepts": ["<concept id from lexicon payload>"],
  "rejected_concepts": ["<considered concept id>"],
  "concept_decisions": [
    {
      "concept_id": "<concept id>",
      "decision": "selected",
      "selection_reason": "<facet-coverage rationale>",
      "covered_facets": ["<covered facet>"],
      "missing_facets": [],
      "match_sources": ["alias", "semantic_intake"],
      "confidence": "medium",
      "risk": ""
    }
  ],
  "lexicon_generation_id": "<lexicon_generation_id from lexicon payload>",
  "expanded_queries": ["<normalized project-language query>"],
  "repository_search_terms": ["<project-local term to search before raw wording>"],
  "paths": ["<justified path hint>"]
}
```

### Project-Language Search Terms

Before any source search, turn the user's wording into project-language search terms derived from the alias catalog, `semantic_intake`, selected candidates, and returned route metadata. Write these as `repository_search_terms` in the query plan or workflow notes. Include component names, state names, file names, command names, UI labels, and route names when the lexicon or candidate payload exposes them.

Do not search only the raw user words. If the user's phrase has no direct code match, use `normalized_query`, `alias_interpretations`, candidate titles, candidate aliases, `matched_terms`, `colloquial_matches`, returned paths, and `expanded_queries` to form the first search set. Use these project-language search terms before broad repository search; only widen after the translated terms and returned `minimal_live_reads` fail to identify the owner.

### Concept Selection

`concept_candidates` are not a flat keyword list. Treat them as structured project concept candidates with ownership, route, alias, `matched_terms`, `colloquial_matches`, domain, disambiguation, and confidence signals. Select concepts that match the user's intent and the workflow objective, reject concepts that are unrelated or unsafe to assume, and preserve the `selection_reason` and `concept_decisions` so downstream artifacts can understand why the query was bounded that way. Each `concept_decisions` entry should record `covered_facets`, `missing_facets`, `match_sources`, confidence, and risk. Candidate selection must satisfy facet coverage for the active workflow; do not trust top similarity alone, whether the match came from lexical overlap, vector similarity, aliases, paths, or graph-neighbor expansion.

When candidate concepts conflict, are too broad, or remain unknown, follow the returned compass state instead of guessing. Do not bypass `route_pack`, `minimal_live_reads`, or `first_pass_paths` by expanding into broad repository reads merely because a candidate concept looks interesting.

### Fixed Bundle Consumption

Every workflow must consume the readiness and task-local bundle returned by the project cognition compass packet explicitly required by its command contract. Treat the compass packet as the task-local project navigation bundle. Treat raw graph JSON artifacts as obsolete runtime surfaces. Do not replace bundle consumption with broad freeform repository rereads when the runtime already covers the touched area.

### Query Completion

A project-cognition compass intake is not complete when it returns JSON. It is complete only when readiness drives routing, minimal_live_reads constrains inspection, lane-level `first_pass_paths` reasons are considered, and relevant facts are carried into the next workflow artifact or execution state.

Extract and carry forward the selected concepts, rejected concepts, `selection_reason`, `semantic_intake`, `normalized_query`, `intent_facets`, `negative_constraints`, `concept_decisions`, `covered_facets`, `missing_facets`, `match_sources`, `lexicon_generation_id`, matched capability or symptom, affected nodes and subgraph, `route_pack`, `minimal_live_reads`, `first_pass_paths`, `coverage_diagnostics`, missing coverage, evidence traces, verification routes, ambiguity, conflicts, and weak coverage.

### Command Tier Depth

Tier determines how deeply the workflow must continue through the returned bundle
and minimal live reads after the minimum gate, not whether it may skip cognition-runtime consumption.

- `trivial`: minimum required artifact set only
- `light`: minimum artifact set plus relevant routing or playbook artifacts
- `heavy`: minimum artifact set plus all relevant collaboration, propagation, and verification artifacts

### Freshness

Treat runtime freshness as map-quality diagnostics:

- `fresh` -> use the returned task-local bundle as an advisory first pass navigation aid
- `missing` -> if cognition freshness is `missing`, continue with live repository evidence when workflow policy allows degraded advisory navigation; recommend `$sp-map-scan`, then `$sp-map-build` only as follow-up brownfield first-baseline maintenance unless the user explicitly requested cognition repair or the workflow truly cannot proceed without a usable baseline
- `stale` -> if cognition freshness is `stale`, treat map output as advisory and continue with live repository evidence; recommend `$sp-map-update` as external/manual maintenance
- `stale` with changed paths missing from `path_index` -> warn and continue with live repository evidence; recommend `$sp-map-update` first for ordinary existing-baseline gaps.
  Use `$sp-map-scan -> $sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside baseline-kind exceptions described below, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`
- `support_drift` -> warn and continue with live repository evidence; recommend resolving or intentionally ignoring support-surface drift
- `partial_refresh` -> warn that refresh data was recorded but readiness did not pass; continue with live repository evidence
- `possibly_stale` -> inspect the returned affected scope when useful, then continue with live repository evidence

Preserve the distinction between the machine freshness field and public state
guidance: `freshness` records map quality, while `recommended_next_action` is a
map-maintenance recommendation.

Entry-time stale or weak cognition is still an advisory navigation concern unless the user explicitly requested map maintenance. That entry routing rule does not waive closeout ownership.

Planning-only artifact writes do not require project cognition refresh. If this planning workflow makes actual source/runtime/template/config/test/generated-asset changes in the current run, follow the shared inline closeout contract:

### Inline Project Cognition Update

Workflow-owned mutation closeout is not an external map-maintenance handoff and is not external map maintenance. It is the workflow-local form of `$sp-map-update`. If this workflow changed project-related source, runtime, templates, generated assets, config, tests, state contracts, shared surfaces, or behavior-bearing docs, closeout MUST run inline project cognition update for the workflow-owned changed paths and affected surfaces before claiming clean completion.

Use the current delta session when one exists:

```text
project-cognition delta append --session "$DELTA_SESSION_ID" --event-type workflow_closeout --changed-path "<path>" --behavior-surface "<surface>" --verification "<evidence>" --known-unknown "<unknown>" --format json
project-cognition update --delta-session "$DELTA_SESSION_ID" --reason workflow-finalize --format json
```

Include `--commit-range "<base>..<head>"` only with `--delta-session` when a safe task commit boundary exists.

When no delta session exists, write a payload file under `.specify/project-cognition/updates/` and call:

```text
project-cognition update --payload-file ".specify/project-cognition/updates/<update-id>.json" --reason workflow-finalize --format json
```

The payload must include `workflow`, `reason`, `changed_paths`, `scope_paths`, `behavior_surfaces`, `generated_surfaces`, `state_contracts`, `verification`, `known_unknowns`, `confidence_notes`, `user_decisions`, and `boundary` when those facts exist.
For compatibility with worker handoffs and delta packets, the runtime also accepts `verification_evidence` as an alias for `verification` and `generated_surface_notes` as an alias for `generated_surfaces`. Verification evidence may be an array of objects (`command`, `result`, `artifact`) or an array of command-result strings, but clean closeout still requires passing verification evidence; failed verification cannot produce a clean `ready` closeout.

Clean closeout keys on `result_state`, not `update_id`, `last_update_id`, or freshness alone:

- `ready` or `no_op`: project cognition closeout may be clean when ordinary verification also passed.
- `partial_refresh`: useful update data was written, but the final workflow state must report partial cognition closeout and the returned `minimal_live_reads`.
- `needs_rebuild`: report the exact rebuild condition and route to `$sp-map-scan`, then `$sp-map-build`.
- `blocked`: report the runtime or validation blocker and the exact recovery command.
- `recorded`: legacy recorded-only output; treat it as partial or blocked, never as clean completion.

Use `C:\Users\11034\.specify\bin\project-cognition.exe mark-dirty --reason \"<reason>\" --format json` only when inline update cannot complete: when inline update is unavailable, cannot record useful update data, cannot identify workflow-owned scope, or cannot be trusted because verification/workflow completion is not trustworthy. Dirty only when inline update cannot complete.

sp-map-update is for manual/external maintenance and follow-up repair. `$sp-map-update` remains the external/manual workflow for user edits, interrupted workflow repair, explicit map maintenance, and follow-up repair. It is not routine cleanup for changes this workflow just made.

### Greenfield Empty Baseline

If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements. Do not recommend map-scan -> map-build solely because the graph has no paths.

### Primary Read Restriction

Do not treat handbook-first or layered project-map files as evidence. If
query-returned coverage is insufficient, inspect live repository surfaces
directly and recommend `sp-map-update` for ordinary existing-baseline gaps,
localized stale cognition refresh, weak localized coverage after a usable
baseline, or external/manual changed-path map maintenance. Use `sp-map-scan -> sp-map-build`
only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation
`path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`.

The completion claim must be backed by live code, tests, scripts, configuration, or authoritative docs. Project cognition can support route selection but cannot be the sole evidence for completion.

**Project cognition gate:** query the active project's runtime before broad
repository reads.

Run or emulate:

```text
C:\Users\11034\.specify\bin\project-cognition.exe compass --intent plan --query=\"$ARGUMENTS\" --format json
```

After the default compass packet, run the advanced `lexicon -> semantic_intake -> query` path only when `compass_state`, coverage diagnostics, localization, or live evidence requires explicit concept decisions. In that escalation, use `project-cognition lexicon --mode catalog` as the alias catalog, write agent-authored `semantic_intake` and `concept_decisions`, then run `project-cognition query --query-plan "<query_plan_json>"`; include `query_plan`, `semantic_intake`, `concept_decisions`, `covered_facets`, `missing_facets`, `match_sources`, `lexicon_generation_id`, `repository_search_terms`, project-language search terms, and facet coverage; do not search only the raw user words before source search. Agent-owned semantic normalization remains mandatory: `agent_normalization` and raw lexicon ranking are bootstrap signals only; if `agent_normalization` is omitted, treat it as `required=false`; use `write_semantic_intake_from_alias_catalog` when needed. Raw lexicon ranking is only a bootstrap; CJK or mixed CJK/ASCII input still requires agent-owned normalization even when positive raw lexical matches exist. The agent still owns translation. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`.

Use the returned readiness:

- `query_ready`: read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons.
- `review`: perform only the returned `minimal_live_reads` before continuing and inspect `coverage_diagnostics`.
- `needs_rebuild`: route through `$sp-map-scan`, then `$sp-map-build` only for documented brownfield rebuild triggers.
- `blocked`: report the blocking runtime issue and continue with live evidence only where this workflow allows degraded navigation.
- **CARRY FORWARD**: Promote project-cognition facts into planning constraints,
  `Implementation Constitution`, boundary rules, verification strategy, and
  `plan-contract.json` when they affect implementation shape.

4. **Validate alignment status before planning**:
   - If `alignment.md` is missing:
     - ERROR "Missing alignment report. Run $sp-specify first or re-run it to complete requirement alignment."
   - If `context.md` is missing:
     - ERROR "Missing context artifact. Run $sp-specify again or $sp-clarify to rebuild `context.md` before planning."
   - Read `Locked Decisions For Planning`, `Outstanding Questions`, `Remaining Risks`, and `Planning Gate Recommendation` from `alignment.md` when present.
   - Read `Locked Decisions`, `Claude Discretion`, `Canonical References`, `Existing Code Insights`, `Specific User Signals`, and `Outstanding Questions` from `context.md`.
   - If the alignment report status is `Aligned: ready for plan`:
     - continue only if no planning-critical unresolved items remain around scope, workflow behavior, data/state expectations, compatibility, external dependencies, or success criteria
   - If the alignment report status is `Force proceed with known risks`:
     - continue, but carry all remaining risks into planning as explicit planning constraints and open risks
   - Otherwise:
     - ERROR "Specification is not aligned enough for planning."
   - If `Planning Gate Recommendation` indicates `/sp.clarify` or the unresolved items still materially affect plan structure:
     - ERROR "Specification still has planning-critical gaps. Run $sp-clarify or refine $sp-specify before planning."
   - If `Planning Gate Recommendation` indicates `/sp.deep-research`, or the Feasibility / Deep Research Gate says `Needed before plan` or `Blocked`:
     - ERROR "Specification still has unproven feasibility. Run $sp-deep-research before planning."
   - If `deep-research.md` exists but lacks a `Planning Handoff` section and the feature depends on its research conclusions:
     - ERROR "Deep research evidence is not ready for planning. Re-run $sp-deep-research to synthesize a Planning Handoff."
   - If `deep-research.md` exists and includes Planning Handoff IDs (`PH-###`), preserve those IDs in plan sections that consume the research. Do not collapse traceable handoff items into unsourced prose.

5. **Assume the specification package is analysis-first**:
   - Treat the canonical workflow token `/sp.specify` as the primary pre-planning requirement-analysis entry point.
   - Tell the user to run `$sp-specify` when they need to start or repeat that requirement-analysis step manually.
   - Treat the canonical workflow token `/sp.clarify` as the follow-up enhancement path when the spec package needs deeper analysis before planning.
   - Tell the user to run `$sp-clarify` when that follow-up must be invoked manually.
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
   - Persist the adaptive decision fields exactly: `execution_model: adaptive`, `execution_mode: light | standard | heavy`, `workflow_status: ready | blocked`, `dispatch_shape: leader-inline | one-subagent | parallel-subagents | subagent-blocked`, `execution_surface: leader-inline | native-subagents | none`, `capability_degraded: false | true`, and `blocked_reason: required when blocked`.
   - Adaptive decision order:
     - If the workload is lightweight safe, use `execution_mode: light`, `dispatch_shape: leader-inline`, and `execution_surface: leader-inline`; no planning lane handoff files are required.
     - If the workload is standard and native subagents are available, dispatch `one-subagent` for exactly one validated isolated planning lane or `parallel-subagents` for two or more isolated planning lanes.
     - If the workload is standard, native subagents are unavailable, and no high-risk trigger is present, continue leader-inline with `capability_degraded: true`.
     - If the workload is heavy or safety-critical and native subagents are unavailable, or if heavy work cannot be packetized safely, record `workflow_status: blocked`, `dispatch_shape: subagent-blocked`, `execution_surface: none`, and a concrete `blocked_reason`; stop before synthesizing planning artifacts.
   - Managed-team fallback is not part of adaptive plan/tasks dispatch.
   - Artifact-writing delegated planning lanes must be dispatched as a writable, execution-capable native subagent lane. If the runtime exposes role, sandbox, or permission choices, select a role/sandbox that can write the declared handoff file; a read-only lane is not a valid lane for `planning/handoffs/<lane-id>.json`.
   - Do not dispatch a read-only explorer, reviewer, or diagnostic lane to satisfy a delegated planning lane that must write a handoff. Such lanes may inform the leader only as supplemental evidence, and they do not satisfy `one-subagent` or `parallel-subagents` planning handoff requirements.
   - The delegated lane contract's allowed write scope must include the exact expected handoff path, `planning/handoffs/<lane-id>.json`, and must forbid writes outside that path unless the lane is explicitly assigned a generated artifact.
   - Before dispatching any delegated planning lane, persist a `planning_checkpoint` record to `planning/checkpoints.ndjson` with the lane id, dispatch shape, authoritative inputs, expected handoff path, and current workflow-state summary.
   - Each delegated planning lane must persist the lane's structured handoff to `planning/handoffs/<lane-id>.json` before the leader accepts the lane, waits at a join point, or synthesizes `plan.md`, `research.md`, or `plan-contract.json`.
   - Update `planning/evidence-index.json` after each accepted delegated lane handoff with lane id, handoff path, source artifacts inspected, decisions or constraints contributed, affected plan sections or generated artifacts, blocker status, and integration status.
   - Consume `planning/evidence-index.json` before final synthesis when delegated lanes were used: for every accepted handoff, mark the handoff as `integrated`, `deferred`, or `blocked`, and name the target `plan.md`, `research.md`, `quickstart.md`, `data-model.md`, `contracts/`, or `plan-contract.json` section that consumed it.
   - Do not synthesize `plan.md`, `research.md`, or `plan-contract.json` from chat-only delegated lane results. If a delegated lane reports only prose, idle state, or an unwritten handoff, mark `subagent-blocked`, write the blocker to `workflow-state.md`, and stop or re-dispatch with a writable lane and a valid handoff path.
   - When resuming after compaction and delegated lanes were used, re-read `workflow-state.md`, `planning/checkpoints.ndjson`, `planning/evidence-index.json`, and all accepted `planning/handoffs/<lane-id>.json` files before continuing planning synthesis.
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
    - planning evidence paths when delegated lanes were used: `planning/evidence-index.json`, `planning/checkpoints.ndjson`, and accepted `planning/handoffs/<lane-id>.json` files; otherwise report `delegated_planning_lanes: none`
    - execution_model: adaptive
    - execution_mode: light | standard | heavy
    - workflow_status: ready | blocked
    - dispatch_shape: leader-inline | one-subagent | parallel-subagents | subagent-blocked
    - execution_surface: leader-inline | native-subagents | none
    - capability_degraded: false | true
    - blocked_reason: required when blocked
    - workflow-state path
    - recommended follow-up quality check: `$sp-checklist` only when an explicit requirements-quality audit is still needed before decomposition
    - cognition follow-up: if artifact-only planning work introduces or sharpens future architecture boundaries, ownership splits, integration surfaces, workflow contracts, or verification routes that the current project cognition runtime does not yet encode, record that as an advisory in `workflow-state.md` or `plan.md`; do not mark project cognition dirty or require a refresh until actual source/runtime changes make the runtime truth out of date.
    - If this workflow makes actual source/runtime/template/config/test/generated-asset changes in the current run, follow the shared inline closeout contract:

### Inline Project Cognition Update

Workflow-owned mutation closeout is not an external map-maintenance handoff and is not external map maintenance. It is the workflow-local form of `$sp-map-update`. If this workflow changed project-related source, runtime, templates, generated assets, config, tests, state contracts, shared surfaces, or behavior-bearing docs, closeout MUST run inline project cognition update for the workflow-owned changed paths and affected surfaces before claiming clean completion.

Use the current delta session when one exists:

```text
project-cognition delta append --session "$DELTA_SESSION_ID" --event-type workflow_closeout --changed-path "<path>" --behavior-surface "<surface>" --verification "<evidence>" --known-unknown "<unknown>" --format json
project-cognition update --delta-session "$DELTA_SESSION_ID" --reason workflow-finalize --format json
```

Include `--commit-range "<base>..<head>"` only with `--delta-session` when a safe task commit boundary exists.

When no delta session exists, write a payload file under `.specify/project-cognition/updates/` and call:

```text
project-cognition update --payload-file ".specify/project-cognition/updates/<update-id>.json" --reason workflow-finalize --format json
```

The payload must include `workflow`, `reason`, `changed_paths`, `scope_paths`, `behavior_surfaces`, `generated_surfaces`, `state_contracts`, `verification`, `known_unknowns`, `confidence_notes`, `user_decisions`, and `boundary` when those facts exist.
For compatibility with worker handoffs and delta packets, the runtime also accepts `verification_evidence` as an alias for `verification` and `generated_surface_notes` as an alias for `generated_surfaces`. Verification evidence may be an array of objects (`command`, `result`, `artifact`) or an array of command-result strings, but clean closeout still requires passing verification evidence; failed verification cannot produce a clean `ready` closeout.

Clean closeout keys on `result_state`, not `update_id`, `last_update_id`, or freshness alone:

- `ready` or `no_op`: project cognition closeout may be clean when ordinary verification also passed.
- `partial_refresh`: useful update data was written, but the final workflow state must report partial cognition closeout and the returned `minimal_live_reads`.
- `needs_rebuild`: report the exact rebuild condition and route to `$sp-map-scan`, then `$sp-map-build`.
- `blocked`: report the runtime or validation blocker and the exact recovery command.
- `recorded`: legacy recorded-only output; treat it as partial or blocked, never as clean completion.

Use `C:\Users\11034\.specify\bin\project-cognition.exe mark-dirty --reason \"<reason>\" --format json` only when inline update cannot complete: when inline update is unavailable, cannot record useful update data, cannot identify workflow-owned scope, or cannot be trusted because verification/workflow completion is not trustworthy. Dirty only when inline update cannot complete.

sp-map-update is for manual/external maintenance and follow-up repair. `$sp-map-update` remains the external/manual workflow for user edits, interrupted workflow repair, explicit map maintenance, and follow-up repair. It is not routine cleanup for changes this workflow just made.
    - before final completion text, write or update `WORKFLOW_STATE_FILE` so it records:
      - `active_command: sp-plan`
      - `phase_mode: design-only`
      - current authoritative files
     - exit criteria for planning completion
     - the next action required before handoff
     - `next_command: /sp.tasks`
- [AGENT] before final completion text, if auto-capture did not preserve a reusable `workflow_gap` or `project_constraint`, use the manual `learning capture` helper surface.
  Required options: `--command`, `--type`, `--summary`, `--evidence`
   - leave one-off runs as `--decision none` with no reusable lesson; store reusable lessons as index/detail entries, and use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@684d82cdec709d03bf5dfc07c9da71ea7cec93f8 specify learning promote --target learning ...` only after explicit confirmation or proven recurrence
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
3. **`quickstart.md`** — Generate for every feature. Keep it focused on a representative end-to-end validation scenario that proves the confirmed product scope works through the relevant integration boundary.
4. Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType codex` to update agent-specific context.

**Output**: `research.md` (required), `quickstart.md` (required), plus `data-model.md` and `contracts/*` when the feature scope demands them. Note skipped conditional artifacts in plan.md.

## Input Risks From Alignment

- [Risk 1 from alignment.md, or "None"]
- [Risk 2 from alignment.md, or omit if none]

## Key Rules

- Use absolute paths
- ERROR on gate failures or unresolved clarifications
- Match the user's current language for all user-visible output unless a literal command name, file path, or fixed status value must remain unchanged.

## Codex Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Preserve this workflow's existing packet, handoff, artifact, and result schema; this section only governs capability discovery before dispatch or blocked-state recording.

## Project Cognition Freshness Closeout

- This workflow is artifact-only unless the user explicitly requested source/runtime/template/config/test/generated-asset changes; do not call `project-cognition mark-dirty`, `project-cognition complete-refresh`, or `project-cognition validate-build --format json` just because `sp-specify`, `sp-plan`, or `sp-tasks` wrote planning artifacts.
- If this planning workflow makes actual source/runtime/template/config/test/generated-asset changes in the current run, it stops being artifact-only for closeout: run inline project cognition update from the workflow-owned changed paths and affected surfaces.
- Git-baseline freshness only changes after source/runtime/template/config/test/generated-asset changes are recorded; planning-only artifact edits do not require `project-cognition complete-refresh`, and manual override/fallback belongs only to an explicit map-maintenance recovery path.
- Inline project cognition update uses `project-cognition delta append` followed by `project-cognition update --delta-session "$DELTA_SESSION_ID" --reason workflow-finalize --format json` when a delta session exists, or `project-cognition update --payload-file ".specify/project-cognition/updates/<update-id>.json" --reason workflow-finalize --format json` when no delta session exists.
- The payload-file path must include changed_paths, behavior_surfaces, generated_surfaces, state_contracts, verification, known_unknowns, and confidence_notes so the update is equivalent to `sp-map-update`, not just a path stamp; `verification_evidence` and `generated_surface_notes` are accepted compatibility aliases.
- clean closeout keys on `result_state`, not `update_id`, `last_update_id`, or freshness alone. Treat `ready` and `no_op` as clean, `partial_refresh` as recorded but not fully clean, `needs_rebuild` as a map-scan/map-build route, `blocked` as blocked, and `recorded` as legacy recorded-only output that is never clean completion.
- Use `project-cognition mark-dirty --reason "<reason>" --format json` only when inline update cannot complete.
- `sp-map-update` is for manual/external maintenance and follow-up repair, not routine cleanup for changes this workflow just made; run `/sp-map-scan` followed by `/sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`.

## Codex Adaptive Dispatch

When running `sp-plan` in Codex, apply the adaptive dispatch decision recorded by `choose_subagent_dispatch`.
- Light mode records `dispatch_shape: leader-inline` and `execution_surface: leader-inline`; do not spawn planning lanes for light work.
- Standard mode uses `spawn_agent` for bounded lanes when `dispatch_shape` is `one-subagent` or `parallel-subagents`.
- Standard native-unavailable degradation records `execution_surface: leader-inline` and `capability_degraded: true` only when no high-risk trigger is present.
- Heavy or safety-critical blocked work records `dispatch_shape: subagent-blocked` and `execution_surface: none` with `blocked_reason`.
- Launch all independent lanes in the current `parallel-subagents` wave before waiting.
- Suggested bounded lanes include research, data model design, contracts drafting, and quickstart or validation scenario generation.
- Use `wait_agent` only at the documented join points before the final constitution and risk re-check and before writing the consolidated implementation plan.
- Use `close_agent` after integrating finished subagent results.
