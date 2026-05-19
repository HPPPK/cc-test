---
name: "sp-clarify"
description: "Use when an existing specification package has planning-critical gaps, weak analysis, or new constraints that should be absorbed before planning."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/clarify.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: The current spec package exists, but planning-critical ambiguity or new evidence makes /sp-plan unreliable.
- **Primary objective**: Strengthen the existing spec package without rerunning the entire `sp-specify` flow from scratch.
- **Primary outputs**: Updated `spec.md`, `alignment.md`, `context.md`, `references.md`, `workflow-state.md`, `clarification/handoffs/<lane-id>.json`, `clarification/evidence-index.json`, and `clarification/checkpoints.ndjson` inside the active `FEATURE_DIR`.
- **Default handoff**: $sp-plan if the package becomes planning-ready; otherwise continue clarification, run another repair pass, or route unproven feasibility through /sp-deep-research.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Strengthen the current specification package just enough to remove planning-critical gaps and make the next planning decision better grounded.

## Context

- Primary inputs: the existing spec package, any newly supplied requirements or references, and the current repository context.
- The active working set is `spec.md`, `alignment.md`, `context.md`, `references.md`, `workflow-state.md`, `clarification/handoffs/`, `clarification/evidence-index.json`, and `clarification/checkpoints.ndjson` inside the current `FEATURE_DIR`.
- This command is enhancement-oriented. It should improve the package already on disk rather than restart the workflow from zero.

## Process

- Identify the specific planning-critical gaps or weak analysis that need improvement.
- Deepen the relevant parts of the specification package through targeted analysis or bounded research.
- Update the artifact set in place and reassess planning readiness.

## Output Contract

- Write the improved spec package back to disk.
- Persist clarification lane evidence before artifact updates: every delegated clarification lane writes `clarification/handoffs/<lane-id>.json`, the leader updates `clarification/evidence-index.json`, and checkpoint records go to `clarification/checkpoints.ndjson`.
- Consume every accepted clarification handoff before final artifact updates: each accepted handoff must be integrated into `spec.md`, `alignment.md`, `context.md`, `references.md`, or explicitly recorded as deferred or blocked with a reason.
- Report what changed, what risks remain, and whether the package is ready for `$sp-plan`.
- Keep unresolved uncertainty explicit instead of implying false readiness.

## Guardrails

- Prefer targeted enhancement over a full restatement.
- Do not imply planning readiness if planning-critical ambiguity still remains.
- Do not rerun the whole `sp-specify` flow unless the current package is unusably wrong.

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


## Pre-Execution Checks

**Check for extension hooks (before clarification)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_clarify` key.
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

## Outline

Goal: Strengthen an existing spec package after `/sp.specify` by closing planning-critical gaps, correcting misunderstandings, absorbing reference material better, and writing the improved results back into `spec.md`, `alignment.md`, `context.md`, and `references.md`.

## Passive Project Learning Layer

- Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify learning start --command clarify --format json` when available so this repair pass can consume existing project rules and learnings.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader clarification context.
- Open only learning detail docs linked from clarification-relevant index entries, especially repeated workflow gaps, user preferences, or project constraints for the touched area.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- When clarification friction exposes user corrections, scope changes, route changes, false starts, hidden dependencies, validation gaps, or reusable constraints, make sure `workflow-state.md` captures that durable context.
- Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify learning capture-auto --command clarify --feature-dir \"$FEATURE_DIR\" --format json` when `workflow-state.md` already preserves route reasons, false starts, hidden dependencies, or reusable constraints.
- When the durable state does not capture the reusable lesson cleanly, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.

1. Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -PathsOnly` from repo root once (`--json --paths-only` / `-Json -PathsOnly`). Parse:
   - If `FEATURE_DIR` is not already explicit, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify lane resolve --command clarify --ensure-worktree` before guessing from branch-only context.
   - When lane resolution returns a materialized lane worktree, continue clarification from that isolated worktree context so the repaired spec package stays bound to the active feature lane.
   - `FEATURE_DIR`
   - `FEATURE_SPEC`
   - optional downstream paths if returned
   - If JSON parsing fails, abort and instruct the user to verify the feature branch environment.
   - Set `ALIGNMENT_FILE` to `FEATURE_DIR/alignment.md`.
   - Set `CONTEXT_FILE` to `FEATURE_DIR/context.md`.
   - Set `REFERENCES_FILE` to `FEATURE_DIR/references.md`.
   - Set `WORKFLOW_STATE_FILE` to `FEATURE_DIR/workflow-state.md`.

2. Create or resume the workflow state:
   - Read `.specify/templates/workflow-state-template.md`.
   - If `WORKFLOW_STATE_FILE` already exists, read it first and preserve still-valid `next_action`, `exit_criteria`, and `next_command` details instead of relying on chat memory alone.
   - Treat `WORKFLOW_STATE_FILE` as the stage-state source of truth for `sp-clarify`.
   - Persist at least these fields for the active pass:
     - `active_command: sp-clarify`
     - `phase_mode: planning-only`
     - `allowed_artifact_writes: spec.md, alignment.md, context.md, references.md, clarification/handoffs/*.json, clarification/evidence-index.json, clarification/checkpoints.ndjson, workflow-state.md`
     - `forbidden_actions: edit source code, edit tests, fix build/tooling, implement behavior, run implementation-oriented fix loops`
     - `authoritative_files: spec.md, alignment.md, context.md, references.md, clarification/handoffs/*.json, clarification/evidence-index.json`
   - When resuming after compaction, re-read `WORKFLOW_STATE_FILE` before proceeding.

3. Load the current spec package and repo context:
   - `FEATURE_SPEC`
   - `FEATURE_DIR/alignment.md` if present
   - `FEATURE_DIR/context.md` if present
   - `FEATURE_DIR/references.md` if present
   - `.specify/memory/constitution.md` if present
   - `.specify/memory/project-rules.md` if present
   - `.specify/memory/learnings/INDEX.md` if present
   - relevant linked learning detail docs from the learning index
   - **Project cognition gate:** query the active project's runtime before broad
     repository reads.

     Run or emulate:

     ```text
     uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition lexicon --intent plan --query=\"$ARGUMENTS\" --format json
     # Agent: generate <query_plan_json> from raw user intent plus returned map terms.
     uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition query --intent plan --query-plan \"<query_plan_json>\" --format json
     ```

     Use the returned readiness:

     - `ready`: continue with the returned task-local bundle.
     - `review`: perform only the returned `minimal_live_reads` before continuing.
     - `ambiguous`: ask the user to select the intended candidate.
     - `needs_update`: record a planning advisory, perform the returned `minimal_live_reads`, and continue without requiring `$sp-map-update` during `sp-clarify`.
     - `needs_rebuild`: route through `$sp-map-scan`, then `$sp-map-build`.
     - `blocked`: stop and report the blocking runtime issue.
     - **CARRY FORWARD**: Use project-cognition facts to decide whether an
       apparent requirement gap is already answered by repository truth. Preserve
       selected ownership, boundary, ambiguity, and verification facts in the
       clarified spec package before routing back to planning.
   - relevant repository documentation and design artifacts when they materially affect the requested change

4. Identify what needs enhancement:
   - shallow or surface-level capability analysis
   - missing scenarios or usage paths
   - unresolved contradictions
   - underused reference material
   - newly provided requirements or constraints
   - unresolved gray areas that still change plan structure
   - unproven feasibility or implementation-chain links that make `/sp.plan` guess
   - missing locked decisions, canonical references, or deferred-scope notes
   - gaps that would make `/sp.plan` less reliable

5. Classify findings by severity:
   - high-impact gaps that require user confirmation
   - lower-risk gaps that can be safely converted into a validated artifact-update subagent lane from current context

6. Clarification loop for high-impact gaps:
   - Ask only the minimum number of questions required to make planning reliable again.
   - Present exactly one unresolved high-impact question at a time.
   - Prefer questions that lock behavior, boundary handling, compatibility, or acceptance proof rather than reopening broad ideation.
   - Use the user's current language for user-visible questions and confirmations.
   - If repository evidence or retained references can answer the gap safely, packetize the artifact update as a validated subagent lane instead of asking the user to restate codebase facts.

7. When justified, use multi-agent research or analysis to deepen the spec:
   - parallelize only when the work naturally separates into independent research tracks
   - examples: external references, local codebase context, risk analysis, comparison of alternatives
   - keep the final output synthesized back into the main spec package instead of returning raw research noise
   - before dispatching any clarification lane, persist a `clarification_checkpoint` record to `clarification/checkpoints.ndjson` with the lane id, lane type, authoritative inputs, expected handoff path, and current workflow-state summary
   - each delegated clarification lane must persist the lane's structured handoff to `clarification/handoffs/<lane-id>.json` before the leader accepts the lane, waits at a join point, or updates `spec.md`, `alignment.md`, `context.md`, or `references.md`
   - update `clarification/evidence-index.json` after each accepted lane handoff with lane id, handoff path, source artifacts inspected, questions or constraints resolved, affected artifact sections, blocker status, and integration status
   - consume `clarification/evidence-index.json` before final artifact updates: for every accepted handoff, mark the handoff as `integrated`, `deferred`, or `blocked`, and name the target `spec.md`, `alignment.md`, `context.md`, or `references.md` section that consumed it
   - do not update `spec.md`, `alignment.md`, `context.md`, or `references.md` from chat-only lane results; if a lane reports only prose, idle state, or an unwritten handoff, mark `subagent-blocked`, write the blocker to `workflow-state.md`, and stop or re-dispatch with a valid handoff path
   - when resuming after compaction, re-read `workflow-state.md`, `clarification/checkpoints.ndjson`, `clarification/evidence-index.json`, and all accepted `clarification/handoffs/<lane-id>.json` files before continuing clarification synthesis

7a. Decide whether a separate feasibility gate is needed:
   - If the remaining issue is "what should the system do?", keep clarifying in this command.
   - If the remaining issue is "can this capability work with the available APIs, libraries, platform behavior, performance envelope, or integration boundary?", update `alignment.md` and `workflow-state.md` to recommend `/sp.deep-research`.
   - Prefer `/sp.deep-research` when a disposable demo under `FEATURE_DIR/research-spikes/` would prove the implementation chain before planning.
   - Record that `/sp.deep-research` must return a `Planning Handoff` with findings, demo evidence, constraints, rejected options, and recommended approach for `/sp.plan`.
   - Do not require `/sp.deep-research` for minor changes to existing capabilities that already have a clear implementation path in the repository.

7b. Consequence Clarification Lane:
   - If existing artifacts contain a triggered Senior Consequence Analysis Gate, preserve every `CA-###` consequence obligation from `spec.md`, `alignment.md`, `context.md`, `references.md`, and `workflow-state.md`.
   - Use clarification questions to resolve product semantics for affected objects, lifecycle states, dependency impact, recovery behavior, validation proof, and coverage gaps that still block planning.
   - For every clarified consequence obligation, record whether the obligation is resolved, deferred with a latest safe resolve phase, or converted into a stop-and-reopen condition.
   - Must not drop `CA-###` consequence obligations, stop-and-reopen conditions, stand-down reasons, or coverage gaps just because the current clarification pass focuses on another requirement.
   - If a consequence obligation cannot be answered from repository evidence or user clarification, preserve it as open and route to `/sp.deep-research` or `/sp.plan` only when that downstream workflow can carry the unresolved obligation safely.

8. Delegate artifact enhancements through a validated subagent lane:
   - Build one bounded `WorkerTaskPacket` for the artifact update lane when the write scope is safe and packetized.
   - Allowed writes are limited to `spec.md`, `alignment.md`, `context.md`, `references.md`, `workflow-state.md`, and the clarification evidence files under `clarification/` inside `FEATURE_DIR`.
   - The packet must list authoritative inputs, exact artifact sections to strengthen, allowed writes, forbidden actions, acceptance checks, verification evidence, and structured handoff format.
   - The subagent updates `spec.md`, `alignment.md`, `context.md`, `references.md`, and `workflow-state.md` as needed.
   - The subagent strengthens `Locked Decisions`, `Claude Discretion`, `Canonical References`, and `Deferred / Future Ideas` in `spec.md` when relevant.
   - The subagent strengthens `Locked Decisions For Planning`, `Outstanding Questions`, and `Planning Gate Recommendation` in `alignment.md`.
   - The subagent strengthens feasibility / deep research gate status when an implementation-chain proof is needed before planning.
   - The subagent strengthens `Locked Decisions`, `Claude Discretion`, `Canonical References`, `Existing Code Insights`, `Specific User Signals`, and `Outstanding Questions` in `context.md`.
   - The leader owns coordination, packet validation, user-question decisions, structured-handoff review, acceptance, final status, and state consistency.
   - Each accepted artifact-update lane handoff must be referenced from `clarification/evidence-index.json`, and the final artifact updates must name the handoff paths that shaped resolved questions, retained risks, or escalations.
   - Do not mark clarification complete while `clarification/evidence-index.json` contains an accepted handoff without an explicit consuming artifact section, deferral, or blocker reason.
   - If the artifact update lane cannot be safely packetized or delegated, record `subagent-blocked` in `workflow-state.md` with the escalation or recovery reason and stop instead of making the artifact edits.

9. Maintain a clean output contract:
   - preserve confirmed facts
   - expand low-risk inferences only when they are useful for planning
   - clearly identify what remains unresolved
   - do not imply the spec package is planning-ready if planning-critical gaps still remain

10. Report completion with:
   - sections touched
   - whether multi-agent research was used
   - updated paths
   - clarification evidence paths: `clarification/evidence-index.json`, `clarification/checkpoints.ndjson`, and accepted `clarification/handoffs/<lane-id>.json` files
   - remaining planning risks
   - recommended next command
   - whether the spec package is now ready for `/sp.plan`, still needs more clarification, or needs `/sp.deep-research` feasibility proof first
   - whether another `/sp.specify` or `/sp.clarify` pass is still justified before planning
   - updated `workflow-state.md` path
   - cognition follow-up: if artifact-only clarification work proves later implementation should refresh ownership, workflow, integration boundary, or verification-surface cognition, record that as an advisory in `workflow-state.md`, `alignment.md`, or `context.md`; do not mark project cognition dirty or require a refresh until actual source/runtime changes make the runtime truth out of date

## Presentation Contract

When communicating findings and completion, use a structured terminal presentation built from open blocks with:

- a stage header that identifies `clarify` and the current repair state
- a status block that summarizes whether the spec package was strengthened, partially strengthened, or is waiting on user confirmation
- an explanation block that explains what changed, which planning-critical gaps were reduced, and why it matters for planning
- a risk block that lists unresolved planning risks, remaining contradictions, or evidence gaps
- a next-step block that gives the recommended next command and whether more enhancement work is still needed before `/sp.plan`
- when the package is still not planning-ready, the next-step block must avoid implying an automatic handoff to `/sp.plan`

## Rules

- Use the user's current language for user-visible output unless literal command names, file paths, or fixed status values must remain unchanged.
- Do not re-run the entire `specify` flow from scratch unless the current spec is unusably wrong.
- Prefer targeted enhancement over full restatement.
- If new information materially changes scope or alignment, update `alignment.md` in the same pass.
- Treat `/sp.clarify` as the default rescue lane and repair lane when planning-critical ambiguity remains after `/sp.specify`.
- If high-impact ambiguity remains after enhancement, recommend another clarification pass instead of implying that `/sp.plan` is now safe.
- If requirements are clear but feasibility is unproven, recommend `/sp.deep-research` instead of implying that `/sp.plan` is now safe.

## Post-Execution Checks

**Check for extension hooks (after clarification)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.after_clarify` key.
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

## Codex Structured Question Preference

- If the runtime's native structured question tool is available for the current turn, you must use it.
- Do not render the textual fallback block when the native tool is available.
- Do not self-authorize textual fallback because the question seems simple, short, or easy to phrase manually.
- Treat the template's textual question format as fallback-only guidance; use it to shape the question content, but do not render the textual block unless the native tool is unavailable in the current runtime or the tool call fails.
- Ask only the minimum number of questions required by this workflow's existing contract.
- Keep the user-visible question text in the user's current language and keep option labels short.
- Do not emit both a native tool question and the textual fallback block in the same turn. The user should see the active question exactly once.
- If the native tool is unavailable in the current runtime or the tool call fails, ask one concise plain-text confirmation question and continue with the existing enhancement flow.
- In `clarify`, use this preference for:
  - high-impact gap confirmation
  - scope or constraint confirmation when enhancement changes planning readiness
- Native tool target: `request_user_input` if the current Codex runtime exposes it
- Question count: 1-3 short questions per call
- Option count: 2-3 options per question
- Required question fields: `header`, `id`, `question`, `options`
- Option fields: `label`, `description`
- Put the recommended option first and suffix its label with `(Recommended)` when that distinction matters.
- Use this native surface for one bounded clarification or selection step; if it is unavailable or too narrow for the needed interaction, fall back immediately to the template's textual question format.
