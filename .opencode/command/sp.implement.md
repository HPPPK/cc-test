---
description: Use when tasks.md exists and the planned work should be executed through the tracked implementation workflow.
workflow_contract:
  when_to_use: '`tasks.md` is ready and the feature should move from planning into tracked execution batches.'
  primary_objective: Execute the ready batches while preserving tracker state, subagent contracts, verification discipline, and resumability.
  primary_outputs: Verified code, test, and documentation changes plus implementation-tracker and subagent-result artifacts for the active feature.
  default_handoff: Continue with the next ready batch, route blockers into /sp-debug, or report completion only when the implementation contract is actually satisfied.
---

## Workflow Contract Summary

- **When to use**: `tasks.md` is ready and the feature should move from planning into tracked execution batches.
- **Primary objective**: Execute the ready batches while preserving tracker state, subagent contracts, verification discipline, and resumability.
- **Primary outputs**: Verified code, test, and documentation changes plus implementation-tracker and subagent-result artifacts for the active feature.
- **Default handoff**: Continue with the next ready batch, route blockers into /sp-debug, or report completion only when the implementation contract is actually satisfied.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Advance the current feature through tracked implementation batches while keeping execution state, subagent work, verification evidence, and recovery paths explicit.

## Context

- Primary inputs: `tasks.md`, the plan package, `implement-tracker.md`, worker-result handoff files, passive learning files, the task-local project cognition query bundle with readiness and returned `minimal_live_reads`, and the smallest workflow-local state files needed for the touched area.
- The leader owns tracker truth, execution strategy, join points, blocker handling, and final validation.
- Delegated workers own bounded implementation lanes only; they do not own the overall implementation state.

## Process

- Recover tracker state and identify the current ready batch.
- On resume, audit terminal-looking tracker/task state before trusting completion; checked tasks are claims until validation, handoff, join point, and consumer evidence prove them.
- Carry every `CA-###` consequence obligation from packets into dispatch, implementation evidence, result acceptance, tracker open gaps, and stop-and-reopen routing.
- Choose the execution strategy and dispatch subagents or a documented fallback path.
- Integrate structured handoffs, update tracker truth, and keep verification evidence current.
- Continue automatically until the feature is complete or blocked by a real blocker.

## Output Contract

- Produce verified implementation changes plus updated execution-state artifacts for the active feature.
- Keep `implement-tracker.md` and worker-result handoffs aligned with what actually happened.
- Report blockers, retries, and completion honestly rather than inferring success from partial progress.
- Preserve any `MP-*` obligations carried in task packets, implementation state, or result handoff expectations.
- Worker result handoffs must include must-preserve evidence when packet obligations require it.
- If implementation discovers a conflict with an `MP-*` obligation, return a blocked result instead of silently changing the protected discussion decision.

## Guardrails

- Do not dispatch from raw task text alone; compile and validate the packet first.
- Do not bypass tracker truth, result handoffs, or verification gates.
- Do not declare completion because tasks look checked off if the implementation contract is not actually satisfied.

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


## opencode Project Cognition Hard Gate

**Crucial First Step**: You MUST use agent-assisted project cognition query planning first: retrieve the map lexicon with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition lexicon --intent implement --query=\"$ARGUMENTS\" --format json`, translate the raw user intent into a query_plan using returned map terms, then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition query --intent implement --query-plan \"<query_plan_json>\" --format json` before any implementation actions. Use the returned readiness, task-local bundle, and `minimal_live_reads`.
- Interpret returned readiness: `ready` continues with the task-local bundle; `review` permits only returned `minimal_live_reads`; `ambiguous` asks the user to choose; `needs_update` routes through `{{invoke:map-update}}`; `needs_rebuild` routes through `{{invoke:map-scan}}`, then `{{invoke:map-build}}`; `blocked` stops with the runtime issue.
- Treat the project cognition query bundle as the primary brownfield context surface; do not fall back to chat memory or ad hoc repository instincts when query-backed runtime coverage should be the source of truth.
- Treat this as a hard gate, not a best-effort reminder; do not continue until the returned readiness and task-local bundle are strong enough for the workflow.
- A project-cognition query is not complete when it returns JSON. It is complete only when readiness drives routing, `minimal_live_reads` constrains inspection, and relevant facts are carried into the next workflow artifact or execution state.
- Carry forward the selected capability, minimal live reads, boundary constraints, required references, validation route, and evidence gaps into `implement-tracker.md` or the current `WorkerTaskPacket` before dispatch or code edits.

## Orchestration Model

This section is **mandatory**. Every `sp-implement` run MUST follow this model — deviation is not permitted.

### Leader Responsibilities

You are the workflow **leader and orchestrator** for this run, not the concrete implementer.

- Own routing, task splitting, task contracts, dispatch, join points, integration, verification, and state updates
- Subagents own the substantive task lanes assigned through task contracts
- Recover context, choose the current ready batch, integrate structured handoffs, keep `implement-tracker.md` accurate, and own final validation
- The leader owns sequencing, review, and acceptance.
- Use `execution_model: subagent-mandatory` for ready implementation batches
- Dispatch `one-subagent` when one validated `WorkerTaskPacket` is ready; dispatch `parallel-subagents` when multiple validated packets have isolated write sets
- Use `execution_surface: native-subagents`
- If the subagent-readiness bar is not met, compile the missing context, hard rules, validation gates, or handoff requirements before dispatch
- Treat non-empty `$ARGUMENTS` as first-class implementation context, not disposable chat-only guidance

### Subagent Mandate

All substantive implementation work defaults to and MUST use subagents. Substantive implementation lanes must be delegated. The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

- Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format
- Use `dispatch_shape: one-subagent | parallel-subagents`
- **HARD RULE**: dispatch only from validated `WorkerTaskPacket` — never from raw task text alone
- If a task packet contains `must_preserve_obligations`, the worker must preserve those `MP-*` items or return a blocked result with the exact stop-and-reopen condition.
- Do not dispatch a packet that drops a discussion-derived `MP-*` obligation from `tasks.md`, `plan.md`, or `brainstorming/handoff-to-specify.json`.
- A successful worker result must include `must_preserve_evidence` for every packet obligation that affects acceptance, references, forbidden drift, or conflict/reopen conditions.
- If implementation discovers a conflict with an `MP-*` obligation, stop and return a blocked result; do not silently rewrite the product goal, non-goal, selected decision, or reference obligation.
- [AGENT] The leader must wait for and consume the structured handoff before closing the join point, declaring completion, requesting shutdown, or interrupting subagent execution
- Idle subagent is not an accepted result
- Treat `DONE_WITH_CONCERNS` as completed work plus follow-up concerns, not as silent success
- Treat `NEEDS_CONTEXT` as a blocked handoff that must carry the missing context or failed assumption explicitly

### Autonomous Blocker Recovery (Hard Rule)

If technical blockers arise (build errors, missing toolchain components, environment mismatches), you **MUST** attempt autonomous escalation to a specialist subagent **BEFORE** asking the user for intervention.

- Only stop and ask the user if the specialist lane confirms that manual human action is the ONLY remaining path

### Integrity Rules

- **Hard rule:** The leader must not edit implementation files directly while subagent execution is active
- Do **not** fall through from subagent dispatch into local self-execution just because the implementation looks feasible
- Do not dispatch a subagent when required packet fields or required references are missing — repair the packet first or stop as `subagent-blocked`
- Do not bypass tracker truth, result handoffs, or verification gates
- Do not declare completion because tasks look checked off if the implementation contract is not actually satisfied

## Pre-Dispatch Validation

Before dispatching any subagent, the leader MUST validate each task contract:

### Required Checks (BLOCK on failure)

1. **agent_exists**: Confirm the task's `agent` role exists in the agent-teams role pool: security-reviewer, test-engineer, style-reviewer, performance-reviewer, quality-reviewer, api-reviewer, debugger, code-simplifier, build-fixer, executor. If missing, auto-correct to the closest matching role or `executor`.

2. **deps_acyclic**: Confirm `depends_on` does not form a cycle. Walk the dependency chain; if a cycle is detected, stop and require tasks.md correction before dispatch.

### Advisory Checks (WARN but continue)

3. **scope_paths_exist**: Confirm each path in `write_scope` and `read_scope` exists in the repository or will be created by this task. Missing paths that are not created by earlier tasks should be flagged.

4. **context_nav_valid**: Spot-check context navigation pointers — verify the pointed-to files exist and the referenced sections are present. Missing pointers should be noted but do not block dispatch.

5. **forbidden_safe**: Verify that `forbidden` includes `.env`, credential files, secrets directories, and other sensitive paths. If missing, auto-append the default forbidden patterns before dispatch.

### Parallel Safety Check

6. **write_set_isolation**: For any two tasks in the same parallel batch, confirm their `write_scope` sets have zero overlap. Tasks with overlapping write sets MUST be serialized even if both are marked `[P]`.

### Validation Output

After checks complete, record results in `implement-tracker.md`:
- `pre_dispatch_validation`: pass | warnings | blocked
- `validation_warnings`: [list of advisory warnings]
- `auto_corrections`: [list of fields auto-corrected]

## Pre-Execution Checks

**Check for extension hooks (before implementation)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_implement` key
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
- Confirm project cognition freshness, analyze-gate status, and valid execution entry before choosing a batch.
- Keep `workflow-state.md` and `implement-tracker.md` aligned so execution state, next batch, open blockers, and resume instructions stay durable.
- Validate each `WorkerTaskPacket` before dispatch and require a `WorkerTaskResult` plus structured handoff before accepting a join point.
- Update durable state before compaction-risk transitions, long validation phases, join points, subagent fan-out, or any stop where resume will depend on more than the visible conversation.
- When execution changes map-level truth surfaces, refresh the project cognition runtime through `/sp-map-update` using the changed paths, then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition validate-build --format json` and use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition complete-refresh --format json` only when build acceptance passes. Rebuild through `/sp-map-scan` followed by `/sp-map-build` only when the baseline is missing, unusable, schema-incompatible, explicitly requested for rebuild, or invalidated by broad architecture replacement.
- If a refresh cannot be completed now, use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition mark-dirty --reason \"<reason>\" --format json` as the manual override/fallback. Preserve origin semantics in the dirty record when available: `origin-command=implement`, `origin-feature-dir=$FEATURE_DIR`, `origin-lane-id=$LANE_ID`, and the validated packet file. Only omit lane or packet details when the current runtime truly cannot resolve them, so a later same-lane `sp-implement` resume can warn while upstream brownfield entrypoints still refresh before continuing.

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify learning start --command implement --format json` when available so passive learning files exist and the current implementation run sees relevant shared project memory.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader execution context.
- Open only learning detail docs linked from implementation-relevant index entries, especially repeated pitfalls, recovery paths, or project constraints for the touched area.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- [AGENT] When implementation friction exposes retries, validation failures, route changes, false starts, hidden dependencies, rejected paths, decisive signals, root-cause families, or reusable constraints, make sure `workflow-state.md` or `implement-tracker.md` captures that durable context.
- [AGENT] For structured path learning not already captured in durable state, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.
- Treat this as passive shared memory, not as a separate user-visible execution command.

## Implement Tracker Protocol

- `FEATURE_DIR/implement-tracker.md` is the execution-state source of truth for `sp-implement`.
- [AGENT] Create it if missing after `FEATURE_DIR` is known. If it already exists and is not terminal, resume from it instead of restarting from chat memory.
- If native hook policy redirects a prompt-entry phase jump, return to `workflow-state.md` or `implement-tracker.md`; repeated or explicit phase jumps are blocked by shared workflow policy.
- Treat terminal states as `resolved` or `blocked`. Treat `gathering`, `executing`, `recovering`, `replanning`, and `validating` as resumable states.
- Update the tracker before each material phase transition: after scope recovery, before dispatching a ready batch, after each join point, before validation, when entering replanning, and before final completion reporting.
- The tracker must keep these fields obvious:
  - `status`
  - `current_batch`
  - `next_action`
  - `completed_tasks`
  - `failed_tasks`
  - `retry_attempts`
  - `blockers`
  - `recovery_action`
  - `open_gaps`
  - `user_execution_notes`
  - `resume_decision`
- If the user supplied important execution details in `$ARGUMENTS`, extract and persist them in the tracker before dispatching work. Typical examples include:
  - build or compile order
  - startup commands
  - required environment setup
  - known failing commands to avoid
  - recovery hints the runtime must remember on future resumes
- Treat these notes as binding for the current implementation run unless direct evidence shows they are wrong. Do not drop them silently on resume.
- Use this default structure:

```markdown
---
status: gathering | executing | recovering | replanning | validating | blocked | resolved
feature: [feature slug]
created: [ISO timestamp]
updated: [ISO timestamp]
resume_decision: resume-here | blocked-waiting | resolved
---

## Current Focus
current_batch: [ready batch or validation pass]
goal: [current implementation objective]
next_action: [immediate next step]

## Execution Intent
intent_outcome: [the concrete outcome this batch is trying to deliver]
intent_constraints:
  - [forbidden drift, boundary rules, or execution constraints that stay active for this batch]
success_evidence:
  - [checks or observations required before the leader can accept this batch]

## Execution State
completed_tasks:
  - [task ids already completed]
in_progress_tasks:
  - [task ids currently running]
failed_tasks:
  - [task ids that failed in the current pass]
retry_attempts: [0 if none]

## Blockers
- task: [task id]
  type: technical | external | human-action
  evidence: [short command output or observed failure]
  recovery_action: [smallest safe next recovery step]

## Validation
planned_checks:
  - [independent tests, acceptance checks, or validation commands]
completed_checks:
  - [checks already run]
human_needed_checks:
  - [manual verification still required]

## Open Gaps
- type: execution_gap | research_gap | plan_gap | spec_gap
  summary: [what is still not true]
  source: [task id, validation check, or user-visible outcome]
  next_action: [specific next step]

## User Execution Notes
- note: [important user-supplied execution detail from `$ARGUMENTS`]
  source: sp-implement arguments
  priority: high | normal
  applies_to: current feature execution
```

### Resume Audit Gate

- On every resume, treat checked tasks as claims that need evidence, not evidence themselves.
- If `implement-tracker.md` is `resolved`, all tasks appear checked, or the previous session exit is unknown, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify implement resume-audit --feature-dir \"$FEATURE_DIR\" --format json` before final reporting or new closeout.
- Treat `terminal-audit-required` as validation/recovery work, not completion.
- Require consumer evidence for tasks that create UI components, routes, providers, registries, factories, configs, tests, API handlers, or other reusable surfaces.
- Do not preserve `resolved` when the audit finds missing wiring, missing validation evidence, stale subagent handoff, unresolved `open_gaps`, or unexecuted planned validation tasks.
- If resume audit fails, update `implement-tracker.md` to `validating` or `recovering` with the audit gaps and continue from the smallest executable repair batch.

## Outline

1. Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").
   - If `FEATURE_DIR` is not already explicit, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify lane resolve --command implement --ensure-worktree` before guessing from branch-only context.
   - When lane resolution returns a materialized lane worktree, treat that worktree as the execution context for this implementation lane instead of dispatching from the leader workspace by default.

2. **Check checklists status** (if FEATURE_DIR/checklists/ exists):
   - Scan all checklist files in the checklists/ directory
   - For each checklist, count:
     - Total items: All lines matching `- [ ]` or `- [X]` or `- [x]`
     - Completed items: Lines matching `- [X]` or `- [x]`
     - Incomplete items: Lines matching `- [ ]`
   - Create a status table:

     ```text
     | Checklist | Total | Completed | Incomplete | Status |
     |-----------|-------|-----------|------------|--------|
     | ux.md     | 12    | 12        | 0          | ✓ PASS |
     | test.md   | 8     | 5         | 3          | ✗ FAIL |
     | security.md | 6   | 6         | 0          | ✓ PASS |
     ```

   - Calculate overall status:
     - **PASS**: All checklists have 0 incomplete items
     - **FAIL**: One or more checklists have incomplete items

   - **If any checklist is incomplete**:
     - Display the table with incomplete item counts
     - **STOP** and ask: "Some checklists are incomplete. Do you want to proceed with implementation anyway? (yes/no)"
     - Wait for user response before continuing
     - If user says "no" or "wait" or "stop", halt execution
     - If user says "yes" or "proceed" or "continue", proceed to step 3

   - **If all checklists are complete**:
     - Display the table showing all checklists passed
     - Automatically proceed to step 3

3. Load and analyze the implementation context:
   - **REQUIRED**: [AGENT] Create or resume `FEATURE_DIR/implement-tracker.md` immediately after `FEATURE_DIR` is known.
   - **REQUIRED WHEN PRESENT**: Read `handoff-to-implement.json` and treat it as the authoritative execution contract from tasks.
   - **STRUCTURED EXECUTION CONTRACT**: Do not reinterpret product intent from chat memory when `handoff-to-implement.json` disagrees or is more specific.
   - **STRUCTURED EXECUTION CONTRACT**: Treat `must-preserve invariants`, `allowed optimization scope`, `required validation`, and `stop-and-reopen conditions` as binding execution fields.
   - **STRUCTURED EXECUTION CONTRACT**: You must not redefine the product goal, widen locked intent, or implement outside the allowed optimization scope.
   - **STRUCTURED EXECUTION CONTRACT**: If a needed change would violate the current execution contract or require redefining the user's locked goal, stop and reopen the upstream truth layer instead of implementing through ambiguity.
   - **REQUIRED WHEN PRESENT**: Read `FEATURE_DIR/workflow-state.md` if present before choosing the next batch.
   - **REQUIRED WHEN PRESENT**: Read `handoff-to-implement.json` when present and treat it as the authoritative execution contract.
   - **REQUIRED WHEN PRESENT**: Treat `must-preserve invariants`, `allowed optimization scope`, `required validation`, and `stop-and-reopen conditions` from that contract as binding execution fields.
   - **REQUIRED WHEN PRESENT**: If `FEATURE_DIR/workflow-state.md` records `active_profile` or `required_evidence`, treat those fields as execution constraints for batch acceptance and final completion, not as descriptive metadata.
   - **PROFILE EVIDENCE DEFAULT**: For `Standard Delivery`, behavior validation and regression proof remain the lighter default unless `required_evidence` explicitly activates stronger exit evidence.
   - **PROFILE EVIDENCE UPGRADE**: For `Reference-Implementation`, completion requires profile-matched evidence for the persisted `required_evidence` terms activated upstream: reference source evidence, fidelity criteria, difference inventory, accepted deviations, and verification entry points.
   - **PROFILE ARTIFACT FORMS**: Comparison evidence, a deviation log, or fidelity audit notes are acceptable artifact forms only when they satisfy the persisted `Reference-Implementation` evidence terms; do not treat those artifact labels as replacement `required_evidence` names.
   - **IF `WORKFLOW_STATE_FILE` STILL POINTS TO `/sp.analyze` OR SHOWS TASK-GENERATION STATE WAITING FOR ANALYSIS**: stop and run `/sp-analyze` first. Do not self-authorize an `/sp-implement` start from chat memory alone.
   - **IF `WORKFLOW_STATE_FILE` POINTS TO ANOTHER UPSTREAM COMMAND SUCH AS `/sp.plan`, `/sp.tasks`, `/sp.clarify`, OR `/sp.deep-research`**: follow that recorded upstream command first and treat the current implementation attempt as blocked by analysis until the workflow state is cleared back to `/sp.implement`.
   - **IF TRACKER EXISTS WITH STATUS `blocked` OR `replanning`**: Read `blockers`, `open_gaps`, `recovery_action`, and `next_action` first, then continue from that state instead of restarting the workflow from scratch.
   - **IF TRACKER EXISTS WITH STATUS `validating`**: Resume the unfinished validation checks before considering any new implementation work.
   - **IF TRACKER EXISTS WITH STATUS `executing` OR `recovering`**: Resume from the recorded `current_batch`, `failed_tasks`, and `retry_attempts` rather than recomputing progress from chat narration.
   - **IF LANE RESOLUTION OR SESSION-STATE RECONCILE RETURNS `uncertain`**: stop and surface the conflict instead of guessing which lane to continue.
   - **IF `$ARGUMENTS` IS NON-EMPTY**: Extract any high-signal execution constraints, environment facts, build instructions, startup instructions, or recovery hints and record them under `## User Execution Notes` in `implement-tracker.md` before choosing the next batch.
   - **REQUIRED**: Query project cognition with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition lexicon --intent implement --query=\"$ARGUMENTS\" --format json`, then generate a query_plan from returned map terms, then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition query --intent implement --query-plan \"<query_plan_json>\" --format json`.
   - **IF READINESS IS `needs_rebuild`**: Run `/sp-map-scan` followed by `/sp-map-build` before continuing.
   - **IF READINESS IS `needs_update` OR TOO WEAK FOR THE TOUCHED AREA**: Use `/sp-map-update` with the changed paths. Rebuild through `/sp-map-scan` followed by `/sp-map-build` only when the baseline is missing, unusable, schema-incompatible, explicitly requested for rebuild, or invalidated by broad architecture replacement.
   - **IF READINESS IS `review`**: Inspect only the returned `minimal_live_reads` before trusting the runtime for implementation decisions.
   - **TREAT TASK-RELEVANT COVERAGE AS INSUFFICIENT** when the touched area is named only vaguely, lacks ownership or placement guidance, or lacks workflow, constraint, integration, or regression-sensitive testing guidance.
   - **IF TASK-RELEVANT COVERAGE IS INSUFFICIENT**: use returned testing artifacts and refresh through `/sp-map-update` with changed paths or affected surfaces; rebuild through `/sp-map-scan` followed by `/sp-map-build` only when the baseline is missing, unusable, schema-incompatible, explicitly being rebuilt, or invalidated by broad architecture replacement; then inspect the returned minimum live files needed to replace guesswork with evidence.
   - **REQUIRED**: Read `.specify/memory/constitution.md` if present.
   - **REQUIRED**: Read `.specify/memory/project-rules.md` if present.
   - **REQUIRED**: Read `.specify/memory/learnings/INDEX.md` if present.
   - **REQUIRED WHEN PRESENT**: Read `.specify/testing/TESTING_CONTRACT.md` before choosing the next batch so testing obligations are treated as binding execution constraints.
   - **REQUIRED WHEN PRESENT**: Read `.specify/testing/TESTING_PLAYBOOK.md` before verification so canonical test and coverage commands come from the project playbook instead of ad hoc guessing.
   - **REQUIRED WHEN PRESENT**: Read `.specify/testing/COVERAGE_BASELINE.json` before final validation when coverage policy exists for the touched modules.
   - **COMMAND-TIER MODEL**: Preserve command-tier expectations for `fast smoke`, `focused`, and `full`; run the focused tier as the lane acceptance check, use fast smoke for early signal when useful, and reserve full for broader regression or final verification.
   - **IF RELEVANT LEARNING DETAIL DOCS EXIST**: Open only the linked docs relevant to implementation so repeated pitfalls, recovery paths, and project constraints are not rediscovered from scratch.
   - **REQUIRED**: Read tasks.md for the complete task list and execution plan
   - **REQUIRED**: Read plan.md for tech stack, architecture, and file structure
   - **REQUIRED WHEN PRESENT**: Read `FEATURE_DIR/brainstorming/handoff-to-implement.json` and preserve its route, intent, complexity, must-preserve invariants, allowed optimization scope, and stop-and-reopen conditions as binding execution inputs.
   - **REQUIRED**: Extract `Implementation Constitution` from `plan.md` when present and treat it as binding execution guidance rather than advisory background
   - **IF EXISTS**: Read data-model.md for entities and relationships
   - **IF EXISTS**: Read contracts/ for API specifications and test requirements
   - **IF EXISTS**: Read research.md for technical decisions and constraints
   - **IF EXISTS**: Read quickstart.md for integration scenarios
   - **IF `Implementation Constitution` NAMES REQUIRED REFERENCES**: Read those boundary-defining files before choosing the next implementation batch
   - **REQUIRED**: Preserve must-preserve invariants, allowed optimization scope, and stop-and-reopen conditions from the locked handoff and planning package. The execution lane must not redefine the product goal during implementation.
   - **IF THE NEXT READY BATCH TOUCHES AN ESTABLISHED BOUNDARY OR FRAMEWORK**: Record the active boundary framework, preserved pattern, forbidden drift, and required references in `implement-tracker.md` before dispatching work
    - **REQUIRED FOR SUBAGENT EXECUTION**: compile a `WorkerTaskPacket` for each subagent task using `.specify/memory/constitution.md`, `plan.md`, and `tasks.md`
    - **REQUIRED FOR SUBAGENT EXECUTION**: [AGENT] compile and validate the packet before any subagent work begins
    - **REQUIRED FOR SUBAGENT EXECUTION**: Validate each `WorkerTaskPacket` before dispatching work
    - **REQUIRED FOR SUBAGENT EXECUTION**: Use `.specify/templates/worker-prompts/implementer.md` as the default implementer subagent contract and pair post-implementation reviews with `.specify/templates/worker-prompts/spec-reviewer.md` and `.specify/templates/worker-prompts/code-quality-reviewer.md`
    - **REQUIRED FOR SUBAGENT EXECUTION**: Prefer structured handoffs compatible with the shared `WorkerTaskResult` contract whenever the current runtime exposes structured subagent results
    - **REQUIRED FOR SUBAGENT EXECUTION**: If the current integration exposes a runtime-managed result channel, use that channel. Otherwise write the normalized subagent result envelope to `FEATURE_DIR/worker-results/<task-id>.json`
    - **REQUIRED FOR SUBAGENT EXECUTION**: When the local CLI is available and no runtime-managed result channel exists, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify result path` to compute the canonical handoff target and `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify result submit` to normalize and write the result envelope
    - **REQUIRED FOR SUBAGENT EXECUTION**: Preserve `reported_status` when normalizing subagent language such as `DONE_WITH_CONCERNS` or `NEEDS_CONTEXT` into canonical orchestration state
    - **REQUIRED FOR SUBAGENT EXECUTION**: Idle subagent is not an accepted result.
    - **REQUIRED FOR SUBAGENT EXECUTION**: [AGENT] The leader must wait for and consume the structured handoff before closing the join point, declaring completion, requesting shutdown, or interrupting subagent execution.
    - **HARD RULE**: dispatch only from validated `WorkerTaskPacket` — never from raw task text alone
   - If a needed change would violate the current execution contract or require redefining the user's locked goal, stop and reopen the upstream truth layer instead of implementing through ambiguity.

### Consequence Obligation Execution

- Before choosing a batch, collect every `CA-###` consequence obligation from `tasks.md`, `task-index.json`, task packets, `handoff-to-implement.json`, `workflow-state.md`, and the plan package.
- Each validated `WorkerTaskPacket` that touches an affected object must carry the relevant consequence obligation claim, affected objects, lifecycle states, dependency refs, recovery/validation refs, status, and stop-and-reopen condition.
- Must not drop `CA-###` consequence obligations during packet repair, subagent dispatch, tracker updates, result acceptance, or final validation.
- If implementation evidence proves a consequence obligation wrong, impossible, unmapped, or broader than the current packet, stop and reopen the highest valid upstream workflow instead of silently changing behavior.
- Do not accept a successful worker result for a packet with consequence obligations unless it includes validation evidence for each obligation ID or records a blocked stop-and-reopen condition.
- Keep unresolved consequence obligations visible in `implement-tracker.md` open gaps and final reporting until they are resolved, deferred by an upstream artifact, or routed to `/sp.debug`, `/sp.tasks`, `/sp.plan`, `/sp.deep-research`, or `/sp.clarify`.

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
uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition lexicon --intent implement --query=\"$ARGUMENTS\" --format json
# Agent: generate <query_plan_json> from raw user intent plus returned map terms.
uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition query --intent implement --query-plan \"<query_plan_json>\" --format json
```

Use the returned readiness:

- `ready`: continue with the returned task-local bundle.
- `review`: perform only the returned `minimal_live_reads` before continuing.
- `ambiguous`: ask the user to select the intended candidate.
- `needs_update`: route through `/sp.map-update`.
- `needs_rebuild`: route through `/sp.map-scan`, then `/sp.map-build`.
- `blocked`: stop and report the blocking runtime issue.
- **CARRY FORWARD**: Before dispatch or code edits, write the selected
  capability, minimal live reads, boundary constraints, required references,
  validation route, and evidence gaps into `implement-tracker.md` or the current
  `WorkerTaskPacket`. Do not dispatch from a packet that omits the relevant
  project-cognition facts.

Do not compile packets, dispatch subagents, or inspect implementation files
until the cognition gate has passed.

4. **Project Setup Verification**:
   - **REQUIRED**: Create/verify ignore files based on actual project setup:

   **Detection & Creation Logic**:
   - Check if the following command succeeds to determine if the repository is a git repo (create/verify .gitignore if so):

     ```sh
     git rev-parse --git-dir 2>/dev/null
     ```

   - Check if Dockerfile* exists or Docker in plan.md → create/verify .dockerignore
   - Check if .eslintrc* exists → create/verify .eslintignore
   - Check if eslint.config.* exists → ensure the config's `ignores` entries cover required patterns
   - Check if .prettierrc* exists → create/verify .prettierignore
   - Check if .npmrc or package.json exists → create/verify .npmignore (if publishing)
   - Check if terraform files (*.tf) exist → create/verify .terraformignore
   - Check if .helmignore needed (helm charts present) → create/verify .helmignore

   **If ignore file already exists**: Verify it contains essential patterns, append missing critical patterns only
   **If ignore file missing**: Create with full pattern set for detected technology

   **Common Patterns by Technology** (from plan.md tech stack):
   - **Node.js/JavaScript/TypeScript**: `node_modules/`, `dist/`, `build/`, `*.log`, `.env*`
   - **Python**: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `dist/`, `*.egg-info/`
   - **Java**: `target/`, `*.class`, `*.jar`, `.gradle/`, `build/`
   - **C#/.NET**: `bin/`, `obj/`, `*.user`, `*.suo`, `packages/`
   - **Go**: `*.exe`, `*.test`, `vendor/`, `*.out`
   - **Ruby**: `.bundle/`, `log/`, `tmp/`, `*.gem`, `vendor/bundle/`
   - **PHP**: `vendor/`, `*.log`, `*.cache`, `*.env`
   - **Rust**: `target/`, `debug/`, `release/`, `*.rs.bk`, `*.rlib`, `*.prof*`, `.idea/`, `*.log`, `.env*`
   - **Kotlin**: `build/`, `out/`, `.gradle/`, `.idea/`, `*.class`, `*.jar`, `*.iml`, `*.log`, `.env*`
   - **C++**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.so`, `*.a`, `*.exe`, `*.dll`, `.idea/`, `*.log`, `.env*`
   - **C**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.a`, `*.so`, `*.exe`, `*.dll`, `autom4te.cache/`, `config.status`, `config.log`, `.idea/`, `*.log`, `.env*`
   - **Swift**: `.build/`, `DerivedData/`, `*.swiftpm/`, `Packages/`
   - **R**: `.Rproj.user/`, `.Rhistory`, `.RData`, `.Ruserdata`, `*.Rproj`, `packrat/`, `renv/`
   - **Universal**: `.DS_Store`, `Thumbs.db`, `*.tmp`, `*.swp`, `.vscode/`, `.idea/`

   **Tool-Specific Patterns**:
   - **Docker**: `node_modules/`, `.git/`, `Dockerfile*`, `.dockerignore`, `*.log*`, `.env*`, `coverage/`
   - **ESLint**: `node_modules/`, `dist/`, `build/`, `coverage/`, `*.min.js`
   - **Prettier**: `node_modules/`, `dist/`, `build/`, `coverage/`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
   - **Terraform**: `.terraform/`, `*.tfstate*`, `*.tfvars`, `.terraform.lock.hcl`
   - **Kubernetes/k8s**: `*.secret.yaml`, `secrets/`, `.kube/`, `kubeconfig*`, `*.key`, `*.crt`

5. Parse tasks.md structure and extract:
   - **Task phases**: Setup, Tests, Core, Integration, Polish
   - **Task dependencies**: Sequential vs parallel execution rules
   - **Task details**: ID, description, file paths, parallel markers [P]
   - **Lane identity**: Treat each task as a lane-level execution unit unless an explicit wrapper task defines a serial coordination step
   - **Ready tasks**: Tasks whose prerequisites are complete within the current phase
   - **Parallel batches**: Ready tasks that can execute together without write-set conflicts
   - **Batch summaries**: Treat batch range labels such as `T012-T021` as summaries, not as one executable lane identity or one batch-owner `WorkerTaskPacket`
   - **Join points**: Synchronization steps that must complete before downstream work starts
   - **Execution flow**: Order and dependency requirements
   - **REQUIRED**: Run pre-dispatch validation (see Pre-Dispatch Validation section) on every task in the current ready batch before compiling WorkerTaskPacket.
   - **IF VALIDATION BLOCKS**: Record the blocking issue in `implement-tracker.md` under `blockers`, set `next_action` to the required fix, and stop the batch.
   - **IF VALIDATION WARNS**: Record warnings in `implement-tracker.md` and continue dispatch.

6. Select subagent dispatch for each ready batch before writing code:
   - **Agent routing**: When a task specifies an `agent` role, dispatch to that role's subagent type. When no agent is specified, default to a general executor lane. Do not route security-sensitive tasks to general-purpose agents when a matching specialist exists.
   - The invoking runtime acts as the leader: it reads the current planning artifacts, selects the next executable phase and ready batch, and dispatches work instead of performing concrete implementation directly.
   - The shared implement template is the primary source of truth for this leader-owned milestone scheduler contract, and integration-specific addenda must preserve the same semantics.
   - Fixed runtime budget:
     ```text
     max_parallel_subagents = 4
     ```
   - Fixed execution slots for current-wave bookkeeping:
     - `implement-slot-1`
     - `implement-slot-2`
     - `implement-slot-3`
     - `implement-slot-4`
   - Use the shared policy function before each batch with the current agent capability snapshot: `choose_subagent_dispatch(command_name="implement", snapshot, workload_shape)`
   - Also classify whether the current batch needs a review gate before the join point: `classify_review_gate_policy(workload_shape)`
   - Persist the decision fields exactly: `execution_model: subagent-mandatory`, `dispatch_shape: one-subagent | parallel-subagents`, `execution_surface: native-subagents`.
   - Mark `subagent-blocked` and stop if any dispatch-blocking runtime condition is present:
      - overlapping write sets
      - missing required packet fields
      - unavailable native subagent runtime
      - invalid or unvalidated packet
      - missing required references or validation gates
   - Do not use leader-inline execution as a fallback for any dispatch-blocking condition.
   - Decision order (must match policy):
       - If overlapping write sets, no safe delegated lane, missing packet, unavailable runtime, or low confidence makes dispatch unsafe, mark `subagent-blocked` and stop.
       - If exactly one safe validated packet is ready and native subagents are available, dispatch `one-subagent`.
       - If two or more safe validated packets with isolated write sets are ready and native subagents are available, dispatch `parallel-subagents`.
       - No other dispatch outcome is valid.
   - A `parallel batch` is the current ready set of isolated lane-level tasks bounded by a join point.
   - A lane is dispatch-ready only if its validated `WorkerTaskPacket` includes: objective, authoritative inputs, read scope, write scope, forbidden drift, validation checks, and done condition.
   - If any required packet field is missing, do not dispatch and do not execute inline.
   - The only legal action is to repair the packet or stop as `subagent-blocked`.
   - Do not classify lane readiness by judgment alone. A lane is incomplete only when one or more required packet fields or required references are missing.
   - If subagent dispatch is unavailable for the current batch, the only legal action is `subagent-blocked`.
   - Dispatch failure is not permission to continue locally.
   - Do not persist native subagent dispatch failures, durable inline fallback labels, or runtime-surface failure metadata in `implement-tracker.md`; report that current runtime event in the response, stop the batch, and re-evaluate dispatch capability on the next run.
   - Resume only after the blocking runtime or packet condition is explicitly repaired.
   - Re-evaluate subagent dispatch at every new parallel batch or join point instead of choosing once for the whole feature
   - When `parallel-subagents` is selected, choose the current selected wave from the ready batch and dispatch at most four validated isolated lanes.
   - Launch all selected lanes in the current `parallel-subagents` wave before waiting.
   - Wait only at the current wave join point after the full wave has been launched.
   - If the ready batch contains more than four dispatch-ready isolated lanes, execute multiple waves and re-evaluate after each wave.
   - A single implementation subagent may own one validated lane packet, but it must not own the whole ready parallel batch.
   - Do not dispatch a batch-wide objective such as `Implement T012-T021 migrations` as one implementation lane.
   - Do not treat a batch range label as one `WorkerTaskPacket`.
   - Refine only the current executable window after each join point. Do not pre-expand later batches when their exact shape depends on current batch evidence.
   - Grouped parallelism is the default when multiple ready tasks have isolated write sets and stable upstream inputs.
   - Pipeline execution is preferred when outputs flow stage-by-stage from one bounded task to the next and each stage becomes the next stage's input.
   - Every pipeline stage still needs an explicit checkpoint before downstream work continues.
   - If `classify_review_gate_policy(workload_shape)` requires review, do not cross the join point until the batch has passed worker self-check and leader acceptance.
   - If the policy recommends a peer-review lane and a read-only verification lane is available, run one peer-review lane for the high-risk batch before the leader accepts it.
   - Reserve peer-review lanes for high-risk batches such as shared registration surfaces, schema changes, protocol seams, native/plugin bridges, or generated API surfaces.
   - **Join Point Validation**: Every join point must name a validation target, a validation command or concrete check, and a pass condition before downstream work continues.
   - **Join Point Validation**: If the validation command is missing, define the smallest trustworthy command or explicit manual check before accepting the join point; do not wave the batch through on narration alone.
    - Before dispatching a concrete implementation batch, answer from repository evidence:
      - What framework or boundary pattern owns the touched surface?
      - Which files define the existing pattern that must be preserved?
      - What implementation drift is forbidden for this batch?
      - Which task or plan item proves that this constraint is intentional rather than inferred?
      - Which compiled `WorkerTaskPacket` captures the hard rules, required references, validation gates, and done criteria for this subagent task?
    - If those answers are not grounded in the current repository files, stop guesswork, read the missing references, and update `implement-tracker.md` before continuing.

7. Execute implementation following the task plan:
    - **Phase-by-phase execution**: Complete each phase before moving to the next
    - **Autonomous Loop**: You **MUST** continue processing the next ready sequential tasks automatically without stopping after a single task. Stop only when you reach a **Join Point** (awaiting parallel task results), or when all tasks in the current phase are complete.
   - **Respect dependencies**: Run sequential tasks in order, and only run [P] tasks inside their declared or inferred parallel batches
   - **Capability-aware execution**: After selecting dispatch, execute the current ready batch through `one-subagent`, `parallel-subagents`, or `parallel-subagents` when selected by policy; otherwise record `subagent-blocked` while preserving join-point semantics.
   - **Wave discipline**: For `parallel-subagents`, the current wave is not complete until every selected lane has returned a structured handoff or has been explicitly classified as blocked, stale, or deferred.
   - **Wave progression**: After each wave, consume and validate every structured handoff, update execution state, then decide whether the next wave may launch.
   - Once a batch clears the subagent-readiness bar, do not stop to ask the user whether it should switch to subagent execution; dispatch by default, and if native dispatch concretely fails, report the runtime failure in the response and stop without writing a durable fallback decision to `implement-tracker.md`.
    - Runtime-visible state should reflect join points, retry-pending work, and blockers rather than hiding those transitions behind chat-only narration.
    - After each completed batch, the leader re-evaluates milestone state, selects the next executable phase and ready batch in roadmap order, and continues automatically until the milestone is complete or blocked.
    - Do not stop after a single completed batch just because one subagent, assignee, or lane has gone idle; if ready work still exists for the milestone, keep selecting the next batch and continue.
   - **Follow TDD approach**: Execute test tasks before their corresponding implementation tasks
   - **Hard TDD gate**: Write the failing test first for every behavior-changing task, bug fix, or refactor.
   - **Hard TDD gate**: Do not write production code for the batch until the RED state is verified.
   - **Testing surface gate**: If no reliable automated test surface exists for the touched behavior, add the smallest viable test-surface bootstrap step first or stop and route through `/sp-test-scan` before continuing.
   - **Testing contract is binding when present**: If `.specify/testing/TESTING_CONTRACT.md` exists, add or update the required failing tests or regression tests before treating a behavior change as complete.
   - **File-based coordination**: Tasks affecting the same files must run sequentially
   - **Shared-surface coordination**: Treat shared registration files, router tables, export barrels, dependency injection containers, and similar coordination points as write conflicts even if the main feature files differ
   - **Boundary-pattern preservation**: When a task touches an established framework-owned surface, extend the existing pattern instead of introducing a parallel adapter, raw rewrite, or compatibility shim unless `plan.md` explicitly authorizes that change
   - **Validation checkpoints**: Verify each phase completion before proceeding

8. Implementation execution rules:
   - **Setup first**: Initialize project structure, dependencies, configuration
   - **Tests before code**: If you need to write tests for contracts, entities, and integration scenarios
   - **Core development**: Implement models, services, CLI commands, endpoints
   - **Integration work**: Database connections, middleware, logging, external services
   - **Polish and validation**: Unit tests, performance optimization, documentation

9. Progress tracking and error handling:
   - Report progress after each completed task
   - Halt execution if any non-parallel task fails
   - For tasks in parallel batches, continue with successful tasks, report failed ones, and do not cross the batch's join point until the failed work is resolved or explicitly deferred
   - A completed wave does not automatically complete the whole ready batch; do not cross the batch join point until every lane in the batch is accepted or explicitly blocked/deferred under the workflow contract
   - Planned validation tasks are still ready work. If the remaining tasks are executable tests, E2E checks, security verification, quickstart validation, or other scripted validation work already present in `tasks.md`, continue automatically instead of asking whether validation should start.
   - Do not stop to ask whether validation should start unless a manual-only check or approval step is explicitly recorded in the tracker or task plan.
   - If a subagent lane flips to `completed` or drifts into `idle` before the promised handoff, result file, or completion evidence arrives, treat it as a stale lane rather than accepted work: probe once for the missing handoff, then re-dispatch, block, or defer explicitly instead of silently continuing
   - Before accepting a completed batch, verify the structured handoff includes profile-matched evidence for the current `active_profile` and the exact `required_evidence` constraints from `workflow-state.md`.
   - For `Reference-Implementation`, require the persisted evidence terms activated upstream: reference source evidence, fidelity criteria, difference inventory, accepted deviations, and verification entry points.
   - Comparison evidence, a deviation log, or fidelity audit notes may satisfy those persisted terms when they map directly to them, but they do not replace the upstream `required_evidence` vocabulary.
   - Generic `tests passed` output is not sufficient when the active profile requires stronger exit evidence; require the profile-matched evidence named by `required_evidence` before crossing the join point.
   - For high-risk batches, treat acceptance as a three-layer check:
     - subagent self-check
     - optional read-only peer-review lane when `classify_review_gate_policy(workload_shape)` recommends it
     - leader/orchestrator review before crossing the join point
   - Blocked subagent results must include a concrete blocker summary, the failed assumption or dependency, and the smallest safe recovery step before the leader accepts the result.
   - Persist completed work, failed work, blocker evidence, `retry_attempts`, `recovery_action`, and `next_action` in `implement-tracker.md` as soon as they change
   - Before declaring the feature blocked, attempt the smallest safe recovery step that matches the evidence:
     - read the nearest implementation context for the failing area
     - run the smallest meaningful repro, failing test, or validation command
     - inspect immediate logs or error output
     - make one focused repair attempt when the evidence is clear
     - if uncertainty remains high, do focused implementation research for the narrow blocker before widening scope
   - If recovery attempts still fail, set tracker status to `blocked`, keep the blocker explicit, and preserve the best known `next_action` for the next `sp-implement` run
   - Provide clear error messages with context for debugging
   - Suggest next steps if implementation cannot proceed
   - **IMPORTANT** For completed tasks, make sure to mark the task off as [X] in the tasks file.

## Gate Self-Check

At each phase boundary, output an explicit confirmation. This replaces pure declaration with verifiable checkpoints.

### Format

```
[GATE CHECK] Phase: <phase_name>
- Forbidden actions in this phase: <list>
- I confirm I have NOT performed any forbidden action since the last gate.
- Files modified in this phase: <list or "none">
```

### When to emit

- On phase transition (e.g., analysis → specification, specification → handoff)
- Before final reporting
- After any recovery from a false start or route change

### Enforcement

This is a Level 2 enforcement (gate self-check). It does not prevent tool use, but it creates an auditable record. If a gate check cannot be honestly emitted, the phase is not complete.

After each task completion, emit a gate self-check. After all tasks, emit a final gate self-check confirming no forbidden actions were taken.

### Blocker Classification

| Type | Examples | Route |
|------|----------|-------|
| environment | Missing toolchain, wrong Node version, pip/uv failure | Fix inline or ask user |
| test-failure | Test fails after implementation change | Analyze locally first |
| runtime-bug | Crash, unexpected behavior in implemented code | Route to `/sp-debug` |
| external | Upstream API change, network dependency | Record and escalate to user |
| scope-creep | Task expands beyond original contract | Upgrade to `/sp-plan` or `/sp-specify` |

10. Completion validation:
   - Enter tracker status `validating` after the last ready implementation task is complete. `tasks.md` being fully checked off is not sufficient for completion by itself.
   - Verify all required tasks are completed
   - Check that implemented features match the original specification, accepted behavior, and any independent test criteria captured in `tasks.md`
   - Validate that tests pass and coverage meets requirements
   - If `.specify/testing/TESTING_PLAYBOOK.md` exists, use its canonical commands for full validation, targeted module validation, and coverage rather than inventing substitute commands.
   - Confirm the implementation follows the technical plan
   - Confirm final exit evidence matches `active_profile` and `required_evidence` from `workflow-state.md` when present.
   - For `Standard Delivery`, behavior validation and regression proof are the lighter default unless stronger required evidence was explicitly activated.
   - For `Reference-Implementation`, do not mark completion unless profile-matched evidence is present for the exact persisted `required_evidence` terms activated upstream: reference source evidence, fidelity criteria, difference inventory, accepted deviations, and verification entry points.
   - Comparison evidence, a deviation log, or fidelity audit notes are acceptable artifact forms only when they satisfy those persisted `Reference-Implementation` terms; do not treat them as replacement `required_evidence` names.
   - Do not accept generic `tests passed` output as sufficient when the active profile requires stronger exit evidence.
   - If validation finds missing user-visible behavior or unmet acceptance criteria, record an `open_gaps` entry instead of silently claiming completion
   - Do not use final-completion language such as `core implementation complete`, `implementation complete`, or `ready for integration testing` as shorthand for overall feature completion while required E2E, Polish, documentation, quickstart, or other planned validation tasks remain incomplete; report that partial state explicitly instead
   - Classify each unresolved gap:
     - `execution_gap`: implementation exists but still behaves incorrectly; continue fixing within the current implementation loop
     - `research_gap`: the blocker is a missing technical decision or evidence gap; update `research.md`, record the new finding in the tracker, then continue
     - `plan_gap`: the current plan/tasks do not cover the work needed to satisfy the feature goal; update `plan.md` and `tasks.md`, set tracker status to `replanning`, then continue from the next ready batch after the replan
     - `spec_gap`: the requirement itself is ambiguous, contradictory, or newly changed; stop autonomous replanning, keep the gap explicit in the tracker, and recommend `/sp.clarify`
     - `feasibility_gap`: the requirement is clear but the implementation chain is unproven; stop autonomous replanning, keep the gap explicit in the tracker, and recommend `/sp.deep-research`
   - Before final completion reporting, record `changed_code_paths` with modified, added, deleted, and renamed paths; `changed_behavior_surfaces` for affected commands, APIs, templates, generated assets, state files, tests, docs, validators, packets, or runtime assumptions; `verification_evidence`; and `project_cognition_refresh` recommending `/sp.map-update` with those changed paths whenever project cognition might be affected.
   - If the completed implementation changed truth-owning surfaces, shared surfaces, command/route/contract boundaries, verification entry points, runtime assumptions, or other map-level coverage facts, and verification is truthfully green and no explicit blocker prevents completion, including unresolved `open_gaps`, refresh the project cognition runtime through `/sp.map-update` using the changed paths. Do not rebuild for ordinary uncertain closure; `sp-map-update` records partial/low-confidence facts, known unknowns, and `minimal_live_reads`. Rebuild through `/sp.map-scan`, then `/sp.map-build` only when the baseline is missing, unusable, schema-incompatible, explicitly requested for rebuild, or invalidated by broad architecture replacement; then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition validate-build --format json` and `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition complete-refresh --format json` only when build acceptance passes.
   - If you cannot complete that refresh in the current pass, use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition mark-dirty --reason \"<reason>\" --format json` as the manual override/fallback, preserve `origin-command=implement`, `origin-feature-dir=$FEATURE_DIR`, `origin-lane-id=$LANE_ID`, and the validated packet file when available, and tell the user to run `/sp.map-update` with the changed paths before the next brownfield workflow proceeds, escalating to `/sp.map-scan`, then `/sp.map-build` only for the explicit rebuild conditions above. The same lane's later `sp-implement` resume may continue with a warning only when the recorded dirty scope overlaps the current packet scope, but upstream brownfield entrypoints and other features must refresh first.
   - Only mark the tracker `resolved` after required tasks are complete, blockers are cleared, and the validation pass is truthfully green or explicitly waiting on recorded human verification
   - [AGENT] Before the final completion report, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify implement closeout --feature-dir \"$FEATURE_DIR\" --format json` so implementation session state is validated and retry-heavy patterns are auto-captured from `implement-tracker.md`.
- [AGENT] If the closeout auto-capture pass produced no captured lesson but you still discovered a reusable `pitfall`, `recovery_path`, or `project_constraint`, use the manual `learning capture` helper surface to create or merge an index/detail entry.
  Required options: `--command`, `--type`, `--summary`, `--evidence`
- [AGENT] Before the final completion report, apply the Learning Reflex and record any reusable `pitfall`, `recovery_path`, `verification_gap`, `state_surface_gap`, or `project_constraint` in `.specify/memory/learnings/INDEX.md` plus a linked detail document when durable state did not already preserve it.
   - Treat one-off findings as no reusable lesson; store reusable lessons as index/detail entries, and use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify learning promote --target learning ...` only after explicit confirmation or proven recurrence.
   - Only ask for confirmation when a new learning is highest-signal, such as an explicit user default, clear cross-stage reuse, or repeated recurrence that should become shared project memory.
   - Report final status with summary of completed work, changed code paths, changed behavior surfaces, verification evidence, recommended `/sp.map-update` refresh when applicable, remaining human-needed checks, and any unresolved gaps

Note: This command assumes a complete task breakdown exists in tasks.md. If tasks are incomplete or missing, suggest running `/sp.tasks` first to regenerate the task list.

11. **Check for extension hooks**: After completion validation, check if `.specify/extensions.yml` exists in the project root.
    - If it exists, read it and look for entries under the `hooks.after_implement` key
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

## opencode Subagent Dispatch Contract

- Execution model: `subagents-first`
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`
- Delegation surface contract: preserve the native dispatch, fallback, worker result contract, and handoff path below.
- Native subagent dispatch: No subagent dispatch path for this session.
- Join behavior: Stay on the leader path and keep the current lane explicit.
- Managed-team fallback: No in-command team fallback for `sp-implement`; if subagents cannot proceed safely, stay on the leader path and record why.
- Leader-inline fallback: record the reason before local execution.
- Worker result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result handoff path: FEATURE_DIR/worker-results/<task-id>.json

## opencode Subagent Result Contract

- Worker result contract: preserve the shared `WorkerTaskResult` semantics even when the runtime calls lanes subagents.
- Preferred result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result file handoff path: FEATURE_DIR/worker-results/<task-id>.json
- Normalize subagent-reported statuses like `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, and `NEEDS_CONTEXT` into the shared `WorkerTaskResult` contract before the leader accepts the handoff.
- Keep `reported_status` when normalization occurs so runtime-specific subagent language can be reconciled with canonical orchestration state.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Treat `DONE_WITH_CONCERNS` as completed work plus follow-up concerns, not as silent success.
- Treat `NEEDS_CONTEXT` as a blocked handoff that must carry the missing context or failed assumption explicitly.
