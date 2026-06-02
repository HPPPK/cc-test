---
name: "sp-specify"
description: "Use when a new or changed feature request needs guided requirement discovery and a planning-ready specification package."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/specify.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A new or changed feature request needs a planning-ready specification package instead of immediate implementation.
- **Primary objective**: Produce a reviewed, planning-ready specification package through context exploration, one-question-at-a-time clarification, approach comparison, semantic term decomposition, artifact self-review, and user review.
- **Primary outputs**: `FEATURE_DIR/spec.md`, `FEATURE_DIR/alignment.md`, `FEATURE_DIR/context.md`, `FEATURE_DIR/references.md` when useful, `FEATURE_DIR/workflow-state.md`, `FEATURE_DIR/checklists/requirements.md`, and the minimal compatibility handoff `FEATURE_DIR/brainstorming/handoff-to-specify.json`.
- **Default handoff**: After user review, recommend exactly one next command: `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Turn a new or changed feature request into a reviewed, planning-ready specification package through a concise collaborative flow: understand context, clarify one high-impact question at a time, compare approaches, confirm the spec shape, write artifacts, self-review, and ask the user to review before planning.

## Context

- Primary inputs: the user's request, current repository context, passive memory, project cognition only as advisory navigation, and discussion source files when a discussion handoff is supplied.
- Authoritative outputs: `spec.md`, `alignment.md`, `context.md`, `references.md` when useful, `workflow-state.md`, `checklists/requirements.md`, and a minimal `brainstorming/handoff-to-specify.json` compatibility handoff.
- This command is specification-only. It is not permission to implement code.

## Process

- Create or resume the feature workspace and `workflow-state.md`.
- Explore project context only enough to understand ownership, constraints, adjacent surfaces, and source evidence.
- If invoked from `sp-discussion`, read `handoff-to-specify.md` and `.json` when present, then read the handoff-declared source files. At minimum inspect `discussion-log.md`, `requirements.md`, and `open-questions.md` when they exist; inspect `technical-options.md` and `project-context.md` when present or named.
- Extract every upstream capability-like signal from those sources and assign exactly one disposition: `preserved`, `in_scope`, `deferred`, `dropped`, or `clarification_blocker`.
- Ask one high-impact question at a time when the answer can change scope, acceptance, architecture, compatibility, security, data shape, external integration, or downstream planning.
- Decompose ambiguous terms such as capability, real, usable, works, end-to-end, fetch, probe, health, model, endpoint, integration, auth, `new` command, `<tool> new`, create, scaffold, authoring, template creation, authoring workflow, CLI path, TUI path, `能力`, `真实`, and `可用` before compiling the spec.
- Treat create/scaffold/`new` command/authoring workflow wording as an operation-shaped capability signal. If surface minimization changes the entry point, preserve the capability operation through an explicit TUI route, core API, public CLI command, or user-confirmed deferral; do not downgrade it to manual copy docs or static template-only support without confirmation.
- Present two or three approaches with trade-offs and a recommendation before committing to the spec shape.
- Present the spec sections for user approval before final artifact release.
- Write the artifact package, then self-review for placeholders, contradictions, ambiguous requirements, silent scope narrowing, dropped upstream signals, out-of-scope conflicts, missing acceptance proof, and unconfirmed product minimization.
- Ask the user to review the written artifacts before recommending exactly one next command: `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.

## Output Contract

- Write or update `spec.md`, `alignment.md`, `context.md`, `workflow-state.md`, `checklists/requirements.md`, and `references.md` when useful.
- Write or update a minimal `brainstorming/handoff-to-specify.json` compatibility handoff with `version`, `status`, `entry_source`, `source_handoff`, `source_handoff_json`, `source_files_read`, `source_signal_disposition`, `must_preserve`, `coverage_status`, `planning_gate_status`, `hard_unknown_count`, `open_conflict_count`, and `quality_gate`.
- `alignment.md` must record `Semantic Term Decisions`, `Upstream Intent Disposition`, and `Out-Of-Scope Conflicts` when relevant.
- Do not recommend `/sp.plan` while a capability-like upstream signal lacks disposition, an ambiguous high-impact term lacks confirmation, or an out-of-scope conflict lacks user confirmation.
- Report what was confirmed, what remains open, what was deferred or dropped, and the single valid next command.

## Guardrails

- Do not edit source code, tests, or implementation files from `sp-specify`.
- Do not treat the discussion handoff summary as complete when discussion source files exist.
- Do not silently narrow user scope, redefine broad capability terms, or convert the request into a smaller delivery without user confirmation.
- Do not require legacy brainstorming journals, stage manifests, lock JSON files, or replay artifacts for normal `sp-specify` completion.
- Do not treat this summary block as the workflow itself; the detailed contract below remains authoritative.

## Senior Consequence Analysis Gate

Run this gate whenever the request, artifact set, defect, or planned change can affect lifecycle operations, running objects, concurrent work, destructive behavior, shared state, downstream consumers, compatibility, security-sensitive behavior, or multiple plausible product behaviors.

Project cognition first. Use the project cognition runtime to identify ownership, consumers, state surfaces, change-propagation facts, verification routes, conflicts, known unknowns, and coverage gaps. Senior consequence analysis second. Turn those facts into explicit product and implementation obligations instead of treating the graph as the decision-maker.

Project cognition readiness provides routing advice. If readiness is `ready`, continue with the returned task-local bundle. If readiness is `review`, inspect the returned `minimal_live_reads` before continuing. If readiness is `ambiguous`, ask the user to choose. If readiness is `needs_update`, use `$sp-map-update` when the workflow needs updated runtime coverage for the touched area; otherwise continue with live repository evidence and carry the stale coverage gap forward. If readiness is `needs_rebuild`, continue with live repository evidence and recommend `$sp-map-scan -> $sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, zero active-generation `path_index` rows outside `greenfield_empty`, `explicit_rebuild_requested`, or `baseline_identity_invalid`. If readiness is `blocked`, report the blocked state and continue with live repository evidence unless the user's actual request is to fix cognition runtime state. If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements; do not recommend map-scan -> map-build solely because the graph has no paths. Carry relevant project cognition facts, returned `minimal_live_reads`, inference notes, and coverage gaps into the workflow's artifacts or durable state, but back consequence claims with live code, tests, scripts, configuration, or authoritative docs. Mutation closeout is separate from entry routing: entry stale may continue, but that does not allow source/runtime mutation workflows to defer closeout. Workflow-owned mutation closeout is not an external map-maintenance handoff; after changing project-related files or behavior, the workflow must run inline project cognition update from its changed paths, affected surfaces, and verification evidence, with `project-cognition mark-dirty` only as fallback when inline update cannot complete. `sp-map-update` is for manual/external maintenance and follow-up repair; it is external map maintenance, not routine closeout for this workflow's own changes. In shared routing summaries, sp-map-update is for manual/external maintenance.

Required output when the gate triggers:

- **Affected Object Map**: name each object, record, worker, queue, artifact, command, API, file surface, user-visible state, or downstream consumer that can be affected.
- **State-Behavior Matrix**: describe behavior for each important lifecycle state, including created, queued, running, paused, failed, cancelled, completed, resumed, archived, missing, stale, or partially refreshed states when relevant.
- **Dependency Impact Table**: map direct dependencies, indirect consumers, shared state, compatibility surfaces, validation routes, and adjacent workflows that can break if semantics change.
- **Recovery And Validation Contract**: state rollback, retry, idempotency, cleanup, migration, observability, and validation evidence required before handoff or completion.
- **Coverage Gaps**: list what project cognition or live evidence cannot prove, who must resolve each gap, the latest safe resolve phase, the stop-and-reopen condition, and the routing decision: current workflow may continue with an assumption, must ask the user, must route to clarification or deep research, or must request map maintenance.
- **Consequence Obligations**: assign stable `CA-###` IDs to every obligation that must survive downstream handoff, task generation, worker packets, verification, or debug closeout. Each `CA-###` must include claim, affected objects, owner workflow, latest resolve phase, status, and stop-and-reopen condition.

Stand down only for docs-only wording changes, trivial isolated fixes, or local refactors that cannot affect lifecycle operations, running state, destructive operations, shared state, downstream consumers, compatibility, security, or multiple behavior choices. Record the no-trigger reason or stand-down reason in the workflow's durable artifact or closeout before skipping the required outputs.

If the gate triggers and the current workflow cannot preserve the required outputs, stop and route to the workflow that can. Do not mark ready, resolved, handoff-ready, planning-ready, or complete while triggered consequence obligations remain unresolved, unmapped, or unsupported by validation evidence.

## Pre-Execution Checks

**Check for extension hooks before specification**:
- Check whether `.specify/extensions.yml` exists in the project root.
- If it exists, read entries under `hooks.before_specify`.
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

**Set the working boundary**:
- Treat the user request as the starting point for a specification, not permission to implement.
- If no feature description was supplied, stop with: `ERROR: No feature description provided`.
- Verify the installed CLI surface with `specify --help` when command availability is uncertain; feature creation uses the generated create-feature script, not an imagined `specify create-feature` command.
- Run `.specify/scripts/powershell/create-new-feature.ps1 "$ARGUMENTS"` from the repo root to create or resume the feature workspace. For generated projects this resolves to `.specify/scripts/bash/create-new-feature.sh "$ARGUMENTS"` or `.specify/scripts/powershell/create-new-feature.ps1 "$ARGUMENTS"`; Codex-generated skills should run `.specify/scripts/bash/create-new-feature.sh "$ARGUMENTS"` from the repo root for the shell variant.
- If the feature-creation script exits non-zero, stop and report the script error; do not call `specify lane register` or any invented branch command as a substitute.
- After the script succeeds, set:
  - `FEATURE_DIR`
  - `SPEC_FILE`
  - `ALIGNMENT_FILE`
  - `CONTEXT_FILE`
  - `REFERENCES_FILE`
  - `WORKFLOW_STATE_FILE`
- Create or update `workflow-state.md` before substantial analysis. Record `active_command: sp-specify`, `phase_mode: planning-only`, allowed artifact writes, `forbidden_actions`, current stage, next action, and exit criteria.
- Read `.specify/templates/workflow-state-template.md`.
- Create or resume `WORKFLOW_STATE_FILE` immediately after `FEATURE_DIR` is known.
- Treat `WORKFLOW_STATE_FILE` as the stage-state source of truth on resume after compaction for the current command, allowed artifact writes, forbidden actions, authoritative files, next action, and exit criteria.
- When resuming after compaction, re-read `WORKFLOW_STATE_FILE` before proceeding.
- Record `next_command` as `/sp.plan`, `/sp.clarify`, or `/sp.deep-research` once user review has been requested and the artifact self-review is complete.
- At the user review gate, record readiness for the next phase (`$sp-plan` for the mainline in integrations that render hyphenated command invocations) while preserving the literal `next_command` token as `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.
- Do not edit source code, tests, implementation files, generated build output, or dependency files from this workflow.
- Do not implement code, edit source files, edit tests, or run implementation-oriented fix loops from `sp-specify`.

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a8f273c8463584b9ef296295fc777783a4ae9096 specify learning start --command specify --format json` when available so passive learning files exist and the current specification run sees relevant shared project memory.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order when they exist.
- Open only learning detail docs that clearly match the request, repeated workflow gaps, user preferences, or constraints for the affected area.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail document without asking for routine permission.
- Treat passive memory as advisory evidence. Repository evidence and explicit user confirmation outrank older memory.
- [AGENT] Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a8f273c8463584b9ef296295fc777783a4ae9096 specify learning capture-auto --command specify --feature-dir \"$FEATURE_DIR\" --format json` when `workflow-state.md` already preserves route reasons, false starts, hidden dependencies, validation gaps, or reusable constraints.
- Before closeout, if this specification run exposes a reusable workflow gap, user preference, or project constraint, capture it in the learning layer or record why it is one-off.
- Required options: `--command`, `--type`, `--summary`, `--evidence`.

## Project Context Intake

- Explore project context just enough to understand ownership, constraints, adjacent surfaces, reusable patterns, compatibility boundaries, and likely verification routes.
- Check whether `.specify/project-cognition/status.json` exists before trusting project cognition output.
- Run or emulate:

```text
C:\Users\11034\.specify\bin\project-cognition.exe lexicon --intent plan --query=\"$ARGUMENTS\" --format json
# Agent: select from returned graph-backed project concept candidates; include selected_concepts, rejected_concepts, concept_decisions, lexicon_generation_id, expanded_queries, and justified paths in <query_plan_json>.
C:\Users\11034\.specify\bin\project-cognition.exe query --intent plan --query-plan \"<query_plan_json>\" --format json
```

- Prefer project cognition when it is available and fresh, but use it as navigation guidance rather than a source that can override live files or user intent.
- When cognition reports `ready`, use the returned task-local bundle.
- When cognition reports `review`, `needs_update`, or partial coverage, perform the returned minimal live reads and continue with explicit assumptions.
- `needs_update`: record a planning advisory, perform the returned `minimal_live_reads`, and continue without requiring map maintenance during artifact-only specification work.
- If freshness is `stale`, record a planning advisory, perform minimal live reads, and continue when those reads provide enough evidence.
- If freshness is `possibly_stale`, inspect the reported changed paths and review topics, perform minimal live reads, and continue with explicit assumptions when sufficient.
- If task-relevant coverage is insufficient, record a planning advisory and continue with minimal live reads instead of guessing.
- For artifact-only `sp-specify` work, use the project cognition freshness helper as advisory navigation only. Freshness is `missing` when the runtime baseline is absent; freshness is `stale` when source changes may invalidate the returned map; freshness is `support_drift` when support surfaces changed; freshness is `partial_refresh` when the helper reports an incomplete refresh and a `recommended_next_action`; freshness is `possibly_stale` when changed paths overlap `must_refresh_topics` or `review_topics`.
- The coverage-model check should identify owning surfaces and truth locations, consumer or adjacent surfaces likely to be affected, change-propagation hotspots, verification entry points, and known unknowns or stale evidence boundaries.
- Coverage is insufficient when the touched area is named only vaguely, lacks ownership or placement guidance, or lacks workflow, constraint, integration, or regression-sensitive testing guidance.
- When cognition reports `ambiguous`, ask the user to select the intended candidate before writing artifacts.
- When cognition reports `needs_rebuild` or `blocked`, report the blocking issue and the required project-map command instead of guessing.
- Carry material repository facts into `context.md` and `alignment.md`; do not leave planning-relevant facts only in transient tool output.
- Cognition follow-up: if artifact-only specification work identifies future modules, workflows, integration boundaries, verification surfaces, or ownership facts that the current query-backed runtime does not yet encode, record that as an advisory in `workflow-state.md`, `alignment.md`, or `context.md`; do not mark project cognition dirty or require a refresh until actual source/runtime changes make the runtime truth out of date.
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

Clean closeout keys on `result_state`, not `update_id`, `last_update_id`, or freshness alone:

- `ready` or `no_op`: project cognition closeout may be clean when ordinary verification also passed.
- `partial_refresh`: useful update data was written, but the final workflow state must report partial cognition closeout and the returned `minimal_live_reads`.
- `needs_rebuild`: report the exact rebuild condition and route to `$sp-map-scan`, then `$sp-map-build`.
- `blocked`: report the runtime or validation blocker and the exact recovery command.
- `recorded`: legacy recorded-only output; treat it as partial or blocked, never as clean completion.

Use `C:\Users\11034\.specify\bin\project-cognition.exe mark-dirty --reason \"<reason>\" --format json` only when inline update cannot complete: when inline update is unavailable, cannot record useful update data, cannot identify workflow-owned scope, or cannot be trusted because verification/workflow completion is not trustworthy. Dirty only when inline update cannot complete.

sp-map-update is for manual/external maintenance and follow-up repair. `$sp-map-update` remains the external/manual workflow for user edits, interrupted workflow repair, explicit map maintenance, and follow-up repair. It is not routine cleanup for changes this workflow just made.

## Discussion Source-File Sweep

When `sp-specify` starts from `sp-discussion`, do not trust only the handoff summary.

- Read `handoff-to-specify.md` when supplied or discoverable.
- Read `handoff-to-specify.json` when present and preserve compatibility fields such as `entry_source: sp-discussion`, `coverage_status`, `planning_gate_status`, `hard_unknown_count`, and `open_conflict_count`.
- Coverage and planning readiness are separate. Use `coverage_status` for upstream signal mapping completeness and `planning_gate_status` for whether downstream planning may proceed.
- Planning gate statuses include `ready`, `blocked_by_hard_unknowns`, `blocked_by_conflict`, `blocked_by_incomplete_coverage`, and `blocked_by_handoff_integrity`.
- Preserve the Must-Preserve Ledger. Every `MP-*` or `MP-###` item must be mapped, deferred, dropped, superseded, or converted into a conflict blocker with source and reopen details.
- Read the handoff-declared source files, not only the handoff summary.
- At minimum inspect these discussion source files when they exist:
  - `discussion-log.md`
  - `requirements.md`
  - `open-questions.md`
- Also inspect `technical-options.md` and `project-context.md` when present or named by the handoff.
- Record every inspected source in `source_files_read`.
- Extract every upstream capability-like signal from the handoff and source files. Capability-like signals include words and phrases around capability, real, usable, works, end-to-end, fetch, probe, health, model, endpoint, integration, auth, `new` command, `<tool> new`, create, scaffold, authoring, template creation, authoring workflow, CLI path, TUI path, `能力`, `真实`, and `可用`.
- For each signal, write exactly one `source_signal_disposition` row:
  - `preserved`
  - `in_scope`
  - `deferred`
  - `dropped`
  - `clarification_blocker`
- Planning readiness is blocked when a capability-like upstream signal has no disposition, when a narrowed interpretation is not user-confirmed, or when an upstream signal is put out of scope without confirmation and a reopen trigger.
- Treat create/scaffold/`new` command/authoring workflow wording as an operation-shaped capability signal, not as documentation garnish. If the user also asked for a small command surface, preserve the capability operation by mapping it to an explicit entry point such as a TUI route, core API, public CLI command, or user-confirmed deferral. Do not silently replace a confirmed create/scaffold operation with manual copy docs, a static template directory, or a template-only note.
- Maintain a capability preservation ledger for any operation-shaped signal whose entry point changes during normalization: upstream expression, selected entry point, artifacts that implement it, acceptance proof, and user confirmation for any narrowing.
- Preserve the disposition ledger in both `alignment.md` and the minimal compatibility `brainstorming/handoff-to-specify.json`.
- If Markdown and JSON mismatch on user-confirmed scope, quality gate, or must-preserve identity, record the mismatch and route back to refresh the handoff instead of silently repairing it.

## Clarification Loop

- The user's text is the starting point, not the finished requirement package. Analyze the whole feature first and produce a planning-ready requirement package, not a surface summary.
- Run the anti-surface warning signs check before treating the request as planning-ready. Words like "simple", "intuitive", "robust", or "clean" are not requirements when boundary conditions, failure behavior, or affected neighboring workflow remain unclear, when there is still no acceptance proof for how success will be judged, or when the proposed behavior may conflict with the current owning module or existing repository pattern.
- Do not release `Aligned: ready for plan` when the current understanding still depends on taste words, implicit defaults, untested assumptions, or missing behavior boundaries, failure handling, compatibility impact, and acceptance-shaping detail.
- Treat phrases such as "make it more intuitive", "handle permissions normally", "keep it compatible", "show an error if something goes wrong", "use the existing pattern", "it should feel fast", "just validate the data properly", "admins can handle the special cases", and "don't break existing clients" as prompts to convert the vague intent into concrete behavior, edge handling, compatibility scope, or acceptance evidence.
- Classify unresolved vague wording as a vague success standard, vague data rule, vague permission boundary, or vague compatibility claim. Terms such as "fast", "smooth", "easy", "clear", or "works well"; "valid", "clean", "normalized", or "properly formatted"; "normal permissions", "admin behavior", or "authorized users"; and "keep compatibility" or "don't break clients" require concrete acceptance-shaping details before planning handoff.
- Run an engineering-completeness gate for boundary-sensitive work. Capture the trigger/event source when behavior depends on a cross-component signal, payload, identifiers, ordering, or delivery contract, state lifecycle, retention, archival, or cleanup expectations, retry/dedup/idempotency expectations for async or event-driven behavior, user-visible failure, stale-state, or recovery behavior, configuration surface and when changes take effect, and observability or support evidence needed to diagnose failures.
- If the user already described the desired UX in natural language, preserve that product behavior while avoiding forcing a transport or browser-API choice unless the requirement truly demands it.
- Do not release for cross-boundary or event-driven features while the trigger or event source, retry, deduplication, idempotency, or replay expectations are still unknown.
- Conversation memory is not a valid handoff surface. An unknown is not an ignored value; record each unresolved planning-critical item as `resolve-now`, `resolve-by-evidence`, `defer-with-contract`, or `waive-with-risk`, and reopen upstream truth when the current specification depends on a missing or contradictory source.
- Ask one high-impact question at a time.
- Ask at most one unanswered high-impact question per message.
- Ask exactly one unresolved high-impact question per turn.
- A question is high-impact when its answer can change scope, acceptance, architecture, compatibility, security, data shape, external integration, UX behavior, migration path, or downstream planning.
- Run a high-impact ambiguity scan across targeted repository evidence and user-supplied references, examples, or linked material.
- Identify 3-5 planning-relevant gray areas before choosing the next single question.
- Derive gray areas from the combination of user intent, the project cognition runtime, and targeted repository evidence. Do not use generic labels like "UX", "behavior", or "data handling".
- Each gray area should be captured internally with: why the decision changes implementation or test shape, desired happy-path behavior, edge case or failure-path behavior, and compatibility, migration, or neighboring-workflow impact.
- Do not batch unrelated high-impact questions. Ask, receive the answer, update the understanding, then decide whether another question is still necessary.
- each clarification turn should contain at most one short checkpoint.
- Do not ask a second high-impact question before the first one is closed.
- Grouped questions are allowed only when the current domain is already narrowed to a local low-risk scope.
- Make the next question build directly on the user's most recent answer rather than resetting to generic prompts.
- If the user's answer remains vague, shallow, or contradictory, ask a targeted narrowing question, example, or recommendation. Do not accept long but still ambiguous answers as sufficient.
- Do not turn this into a freeform brainstorming workflow. Keep it as guided requirement discovery.
- Default to concise clarification turns. Do not restate the full current understanding after every answer. Save the full synthesis for the alignment-ready turn.
- Do not repeat the same question unless the user's answer changes the prior premise or explicitly asks to revisit it.
- If the runtime exposes separate progress/commentary and final reply channels, keep progress in commentary and ask the current clarification question in the final user-visible reply. The user should see the current clarification question exactly once.
- Before generating any clarification question, confirmation, or bounded selection, check whether a native structured question tool is available. If a native structured question tool is available, you must use it.
- When using a native structured question tool, map the same stage header plus topic label into the native header or title field.
- Do not render the textual fallback block when the native tool is available. Do not self-authorize textual fallback because the question seems simple. Only fall back after the native tool is unavailable or the tool call fails.
- Treat the shared open question block structure below as fallback-only text format guidance.
- Use this open question block structure in the user's current language when rendering the textual fallback block: stage header, question header, prompt, example, recommendation, options, and reply instruction.
- Keep recommendation and example scaffolding short and specific.
- Low-risk defaults may be adopted without interrupting the user, but record them as assumptions in `alignment.md`.
- If the user explicitly accepts unresolved risk, record the risk and use `Force proceed with known risks`; otherwise unresolved planning-critical ambiguity routes to `/sp.clarify`.

## Semantic Term Decomposition

- Decompose ambiguous product terms before writing the final spec.
- If the request contains 2 or more distinct deliverables, enhancements, or behavior changes that would independently change implementation or validation shape, decompose it into capabilities. Present the capability split before asking any detailed clarification question about one capability.
- Label that preview as the proposed capability split so the user can correct the grouping.
- Default to one spec with capability decomposition when the work still belongs to one coherent feature boundary.
- Help the user decompose it into bounded capabilities inside the same spec first.
- Only escalate to separate specs or clearly phased releases when one spec would no longer be coherent to plan or test.
- Do not jump straight into a detailed gray-area question while multiple sibling capabilities are still unsplit or unprioritized.
- confirm which capability should be clarified first while keeping the work in the current spec unless the user explicitly wants separate specs or phased release planning.
- Do not spend one clarification pass collecting requirements for multiple independent capabilities.
- If the request is already one bounded capability, say so briefly and continue inside the current spec.
- Use this section in `alignment.md` for high-value terms whose meanings could change the delivered product:

Use a simple row per term:

- Term: [ambiguous user term]
- Possible Meanings: [meaning A; meaning B; meaning C]
- Selected Meanings: [confirmed selected meanings]
- Excluded Meanings: [confirmed exclusions]
- User Confirmation: [who/when or missing]

- If selected or excluded meanings are missing user confirmation and the term is product-critical, keep the package out of planning-ready state.
- Scope reduction requires confirmation. Do not convert a broad request into an MVP, prototype, demo, or smaller delivery unless the user requested it or explicitly accepted the narrower version.

## Approach Comparison

- Present two or three approaches before committing to the spec shape.
- For a requirement-shaping decision, switch into decision-fork mode and present 2-3 concrete options when the choice changes behavior, boundary, compatibility, or acceptance proof.
- Do not use this mode for implementation architecture brainstorming.
- For each approach, summarize product fit, implementation risk, user-visible trade-offs, compatibility impact, and verification implications.
- Recommend one approach and explain why it best preserves the user's stated intent.
- If the user chooses a different approach, record that as a locked decision rather than re-litigating it later.

## Spec Section Approval

- Before final artifact release, present the intended spec section shape for user approval.
- The review preview must cover:
  - goal and users
  - confirmed scope
  - out-of-scope and deferred items
  - capability decomposition
  - acceptance proof
  - semantic term decisions
  - upstream signal dispositions
  - open questions or known risks
- If the user requests changes, update the working understanding before writing final artifacts.

## Artifact Writing Contract

Write the specification package after context intake, necessary clarification, semantic decomposition, approach comparison, and section approval.

- `spec.md` must capture the product requirement in planning-ready form with confirmed scope, scenarios, capability decomposition, requirements, acceptance proof, decision capture, and risks.
- `alignment.md` must capture current understanding, confirmed facts, assumptions, open questions, `Semantic Term Decisions`, `Upstream Intent Disposition`, `Out-Of-Scope Conflicts`, must-preserve coverage, and readiness decision.
- `context.md` must capture planning context, repository context, reuse notes, integration boundaries, product constraints, change propagation, locked decisions, canonical references, open questions, and deferred ideas.
- `references.md` is optional and should be written when external docs, repository examples, issue links, discussion artifacts, or user-provided references materially shaped the spec.
- `workflow-state.md` must record current stage, review state, source-file sweep status, source-signal disposition status, final handoff decision, and next command.
- `checklists/requirements.md` must exist for first-release compatibility and must validate the written spec, not resurrect legacy state machinery.
- `brainstorming/handoff-to-specify.json` must exist as a minimal compatibility handoff for downstream commands. It must include:
  - `version`
  - `status`
  - `entry_source`
  - `source_handoff`
  - `source_handoff_json`
  - `source_files_read`
  - `source_signal_disposition`
  - `must_preserve`
  - `coverage_status`
  - `planning_gate_status`
  - `hard_unknown_count`
  - `open_conflict_count`
  - `quality_gate`
- Preserve fidelity requirements and reference behavior inventory when the feature is reference-sensitive or rewrite-style.
- Preserve Senior Consequence Analysis Gate outputs as `CA-###` obligations when triggered: affected object map, state-behavior matrix, dependency impact table, recovery and validation contract, coverage gaps, lifecycle operations, running state behavior, destructive operations, shared state, downstream consumers, and stand-down reason.

## Artifact Self-Review

Before reporting completion, review the written artifacts, not just the chat summary. Review the written `spec.md`, `alignment.md`, and `context.md` as the minimum artifact set.

- No placeholders, TODOs, stale markers, or unresolved clarification markers remain unless the package is explicitly not planning-ready.
- If high-risk artifact review triggers, a read-only reviewer lane MUST run before handoff. If no high-risk review trigger is present, a reviewer lane MUST NOT be added. Review routing is condition-triggered, not preference-triggered.
- Requirements are testable and unambiguous.
- `spec.md`, `alignment.md`, `context.md`, `workflow-state.md`, and the compatibility handoff do not contradict each other.
- Every discussion-originated capability-like upstream signal has a disposition row.
- Every deferred or dropped upstream signal has a source, reason, user confirmation status, and reopen trigger.
- Every out-of-scope conflict with upstream wording is recorded in `Out-Of-Scope Conflicts`.
- Acceptance proof matches the confirmed scope.
- UI/API wording in the spec does not imply deferred capabilities are already real.
- If the self-review finds planning-critical gaps, update the artifacts and repeat the review before closeout.

## User Review Gate

- Ask the user to review the written artifact set before planning.
- Present a current-understanding summary as a misunderstanding-correction gate and ask the user to confirm or correct the current understanding before the final handoff decision is locked.
- Summarize what was confirmed, what remains open, what was deferred or dropped, and what risk remains.
- Use the user's current language for the review summary and cover Business Goals, Users & Roles, confirmed product scope, user-confirmed delivery sequence, business rules, Technical Constraints / Assumptions, confirmed decisions, and Outstanding Questions.
- If the user requests artifact edits, stay in `sp-specify`, update the artifacts, and repeat artifact self-review.
- Recommend exactly one next command:
  - `/sp.plan` when the artifact package is `Aligned: ready for plan`.
  - `/sp.clarify` when planning-critical ambiguity remains.
  - `/sp.deep-research` when requirements are clear enough but feasibility, external evidence, or an implementation-chain proof is still needed.
- Do not present multiple next commands as equally valid.
- No alternative next command is valid for the current state.
- report the single valid next path for the current state. Do not emit a second alternative next command. Do not present multiple downstream command options.
- Only the user review gate may decide whether the canonical next command is `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.
- The completion state must preserve the literal `next_command` as `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.

## Completion Report

Report completion in the user's current language while preserving literal paths, command names, and fixed status values.

Include:
- branch name
- `spec.md` path
- `alignment.md` path
- `context.md` path
- `references.md` path when created
- `workflow-state.md` path
- `checklists/requirements.md` path
- `brainstorming/handoff-to-specify.json` path
- source-file sweep status
- source-signal disposition status
- readiness decision
- single next command
- cognition follow-up for artifact-only advisory state, if relevant

## Extension Hooks

After the completion report, check whether `.specify/extensions.yml` exists.

- If it exists, read entries under `hooks.after_specify`.
- If YAML cannot be parsed, skip hook execution guidance silently.
- Filter out hooks where `enabled` is explicitly `false`.
- Treat hooks without `enabled` as enabled.
- Do not evaluate non-empty hook conditions directly; leave condition evaluation to the HookExecutor implementation.
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

## Quick Guidelines

- Focus on what users need, why they need it, and what a planner must preserve.
- Start with whole-feature understanding before capability details.
- Keep one high-impact question at a time.
- Compare two or three approaches before locking the spec shape.
- Make semantic term narrowing explicit and source-linked.
- Read discussion source files when a discussion handoff exists; the handoff summary is not enough.
- Distinguish confirmed facts, low-risk assumptions, unresolved questions, deferred scope, and dropped scope.
- Avoid implementation design except where a dependency, constraint, boundary, or planning risk must be named.
- Keep generated artifacts concise, reviewable, and useful to `/sp.plan`.
- Do not treat product minimization as the default strategy. Scope reduction requires user confirmation before it can shape `spec.md`.
- Before dispatching independent review or evidence work, use `choose_subagent_dispatch(command_name="specify", snapshot, workload_shape)` and record `execution_model: subagent-mandatory`, `dispatch_shape: one-subagent | parallel-subagents`, and `execution_surface: native-subagents` when a validated isolated lane exists. Use `one-subagent` or `parallel-subagents` only for isolated review/evidence lanes, never for source edits.
- Record impacted surfaces and change-propagation expectations, major affected surfaces, verification entry points and minimum evidence expectations, and known unknowns or stale evidence boundaries that could change planning safety.
- Route to `/sp.clarify` when planning-critical ambiguity remains around scope, workflow behavior, constraints, or success criteria.
- Do not recommend `/sp.plan` until the written artifacts pass self-review and user review has been requested.

## Codex Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Preserve this workflow's existing packet, handoff, artifact, and result schema; this section only governs capability discovery before dispatch or blocked-state recording.

## Codex Structured Question Preference

- If the runtime's native structured question tool is available for the current turn, you must use it.
- Do not render the textual fallback block when the native tool is available.
- Do not self-authorize textual fallback because the question seems simple, short, or easy to phrase manually.
- Treat the template's textual question format as fallback-only guidance; use it to shape the question content, but do not render the textual block unless the native tool is unavailable in the current runtime or the tool call fails.
- Ask only the minimum number of questions required by this workflow's existing contract.
- Keep the user-visible question text in the user's current language and keep option labels short.
- Do not emit both a native tool question and the textual fallback block in the same turn. The user should see the active question exactly once.
- If the native tool is unavailable in the current runtime or the tool call fails, fall back to the shared open question block structure already defined in this template.
- In `specify`, use this preference for:
  - planning-critical clarification
  - capability split confirmation
  - current-understanding confirmation before `Aligned: ready for plan`
- Native tool target: `request_user_input` if the current Codex runtime exposes it
- Question count: 1-3 short questions per call
- Option count: 2-3 options per question
- Required question fields: `header`, `id`, `question`, `options`
- Option fields: `label`, `description`
- Put the recommended option first and suffix its label with `(Recommended)` when that distinction matters.
- Use this native surface for one bounded clarification or selection step; if it is unavailable or too narrow for the needed interaction, fall back immediately to the template's textual question format.

## Pre-Analysis Protocol

- Before drafting or asking clarification questions, identify the scope boundary, key constraints, affected surface area, known unknowns, and safest next step.
- Keep guided requirement discovery concise and avoid reviving the deprecated fixed heavy discovery lifecycle.
- Treat `final-handoff-decision` as a compatibility readiness check name only; do not restore the legacy staged handoff flow.
- Run project cognition planning navigation with `project-cognition lexicon --intent plan`, select from graph-backed project concept candidates, carry `lexicon_generation_id`, write `concept_decisions`, then run `project-cognition query --intent plan --query-plan`; carry returned `minimal_live_reads` into the coverage-model check.
- The coverage-model check should identify truth-owning surfaces, change-propagation hotspots, verification entry points, and known unknowns relevant to the request, including module ownership, reusable components/services/hooks, integration points, and neighboring workflow constraints.
- Read `.specify/templates/workflow-state-template.md`. Create or resume `WORKFLOW_STATE_FILE` immediately after `FEATURE_DIR` is known with `phase_mode: planning-only`. Do not implement code, edit source files, edit tests, or run implementation-oriented fix loops from `sp-specify`.
- If the topical coverage for the touched area is missing, stale, or too broad: Run a codebase scout before clarification. Build a concise internal scout summary for the request area covering truth-owning surfaces and shared coordination surfaces, change-propagation hotspots, consumer surfaces, and neighboring surfaces likely to require review, verification entry points and regression-sensitive checks, and known unknowns, stale evidence boundaries, or observability gaps.
- Clarify planning-critical ambiguity, decompose the request into capabilities when needed, use default minimum depth as: happy path, failure path, compatibility impact, and acceptance proof. Write `context.md` to `CONTEXT_FILE`. Locked decisions are preserved in context.md. Provide the recommended review follow-up to `/sp.clarify` or `/sp.deep-research` when appropriate.
- Preserve this as an internal understand-before-acting pass; do not replace the one-question-at-a-time requirement discovery flow with a broad analysis report.

## Semantic Traceability Guidance

- Preserve the concise `sp-specify` flow: explore project context, ask one high-impact question at a time, compare two or three approaches, write artifacts, self-review, and ask for user review.
- When `sp-specify` comes from `sp-discussion`, read discussion source files such as `discussion-log.md`, `requirements.md`, and `open-questions.md`, not only the handoff summary.
- Record inspected files in `source_files_read` and every capability-like upstream signal in `source_signal_disposition`.
- Decompose semantic terms before narrowing scope and keep unconfirmed narrowing out of planning-ready state.
- Downstream stages must reopen upstream intent explicitly instead of silently reinterpreting it.

## Project Cognition Freshness Closeout

- This workflow is artifact-only unless the user explicitly requested source/runtime/template/config/test/generated-asset changes; do not call `project-cognition mark-dirty`, `project-cognition complete-refresh`, or `project-cognition validate-build --format json` just because `sp-specify`, `sp-plan`, or `sp-tasks` wrote planning artifacts.
- If this planning workflow makes actual source/runtime/template/config/test/generated-asset changes in the current run, it stops being artifact-only for closeout: run inline project cognition update from the workflow-owned changed paths and affected surfaces.
- Git-baseline freshness only changes after source/runtime/template/config/test/generated-asset changes are recorded; planning-only artifact edits do not require `project-cognition complete-refresh`, and manual override/fallback belongs only to an explicit map-maintenance recovery path.
- Inline project cognition update uses `project-cognition delta append` followed by `project-cognition update --delta-session "$DELTA_SESSION_ID" --reason workflow-finalize --format json` when a delta session exists, or `project-cognition update --payload-file ".specify/project-cognition/updates/<update-id>.json" --reason workflow-finalize --format json` when no delta session exists.
- The payload-file path must include changed_paths, behavior_surfaces, generated_surfaces, state_contracts, verification_evidence, known_unknowns, and confidence_notes so the update is equivalent to `sp-map-update`, not just a path stamp.
- clean closeout keys on `result_state`, not `update_id`, `last_update_id`, or freshness alone. Treat `ready` and `no_op` as clean, `partial_refresh` as recorded but not fully clean, `needs_rebuild` as a map-scan/map-build route, `blocked` as blocked, and `recorded` as legacy recorded-only output that is never clean completion.
- Use `project-cognition mark-dirty --reason "<reason>" --format json` only when inline update cannot complete.
- `sp-map-update` is for manual/external maintenance and follow-up repair, not routine cleanup for changes this workflow just made; run `/sp-map-scan` followed by `/sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, zero active-generation `path_index` rows outside `greenfield_empty`, `explicit_rebuild_requested`, or `baseline_identity_invalid`.

## Codex Subagents-First Dispatch

When running `sp-specify` in Codex, use Codex native subagents only for bounded evidence, challenge, and artifact-review lanes that support the current collaborative specification pass.
- Do not let subagents invent scope, semantic-term choices, or upstream signal dispositions outside the leader-owned artifacts.
- Use `spawn_agent` for bounded source-file sweep, repository evidence, semantic-drift challenge, and artifact validation lanes.
- Use join points before section approval, before artifact self-review, and before the user review gate when delegated lanes are active.
- Launch all independent lanes in the current `parallel-subagents` wave before waiting.
- Suggested bounded lanes include discussion source sweep, targeted repository evidence, semantic-term challenge, upstream disposition review, and written artifact validation.
- Keep structured artifact discipline: Codex subagents may return evidence and challenges, but the leader updates `spec.md`, `alignment.md`, `context.md`, `workflow-state.md`, and `brainstorming/handoff-to-specify.json`.
- Use `wait_agent` only at explicit review join points and before final user review.
- Use `close_agent` after integrating finished subagent results.
- Keep the shared workflow language integration-neutral in user-visible output.
