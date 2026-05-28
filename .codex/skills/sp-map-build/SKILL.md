---
name: "sp-map-build"
description: "Use when `sp-map-scan` has produced a full evidence baseline and you need to reconstruct the project cognition SQLite runtime."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/map-build.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A scan baseline exists and the project cognition runtime must be built or rebuilt from that evidence.
- **Primary objective**: Validate scan evidence, reconstruct graph nodes and edges into the SQLite cognition database, synthesize claims, assign confidence, create conflicts, and publish queryable task-oriented cognition bundles.
- **Primary outputs**: `.specify/project-cognition/status.json`, `.specify/project-cognition/project-cognition.db`, and query/update helper readiness metadata.
- **Default handoff**: Return to the blocked brownfield workflow once the query-backed cognition baseline is ready.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Reconstruct or refresh the query-backed project cognition runtime from a completed evidence baseline.

## Context

- Primary inputs: `.specify/project-cognition/status.json`, `.specify/project-cognition/evidence/`, `.specify/project-cognition/provisional/nodes.json`, `.specify/project-cognition/provisional/edges.json`, `.specify/project-cognition/provisional/observations.json`, and live repository evidence.
- This command owns the query-backed cognition runtime outputs: `.specify/project-cognition/status.json` and `.specify/project-cognition/project-cognition.db`.
- Run `C:\Users\11034\.specify\bin\project-cognition.exe build-from-scan --format json` after scan and package validation; it owns DB import, metadata, status publication, and DB/status agreement.
- [AGENT] Treat sparse path-index gates as build preflight; do not publish query-ready status when `validate-build` would fail `path_index_to_included_ratio`, critical path, or important path checks.
- Do not construct `.specify/project-cognition/project-cognition.db` with manual SQL as the normal workflow path.
- If the evidence baseline is incomplete or the accepted evidence cannot support graph reconstruction, produce a scan gap report and return to `sp-map-scan`.
- If scan packet intake exposes contract-invalid, systemic packet-family failures, or `paths_read` values that are not concrete path arrays, preserve the scan gap report and route back to `sp-map-scan`; this is not only a local patch in build.
- Record accepted and rejected reconstruction evidence as DB/runtime update records and queryable task-local bundle readiness metadata. Treat any raw graph or slice files as compatibility/export artifacts, not runtime truth.
- Apply project cognition ignore rules from root `.cognitionignore` and `.specify/project-cognition/.cognitionignore`; rejected paths remain outside graph evidence and DB route indexes even when scan artifacts mention them.
- Validate `repository-universe.json` as the canonical scan boundary before graph reconstruction; excluded paths are boundary facts, not graph evidence.
- If native subagent dispatch is unavailable or a substantive build lane cannot complete, persist `subagent_blocked` in machine-readable state and block baseline activation until recovery. `coverage-ledger.json.open_gaps[]` may use `low_risk_open_gap` only with owner, reason, evidence expectation, and revisit condition.

## Mandatory Subagent Execution

All substantive tasks in ordinary `sp-*` workflows default to and must use subagents.

The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format.

Use `execution_model: subagent-mandatory`.
Use `dispatch_shape: one-subagent | parallel-subagents`.
Use `execution_surface: native-subagents`.

## Objective

Reconstruct or refresh the query-backed project cognition runtime from a completed evidence baseline.

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@0baeb7525b0230a18b462954ab5ee96f4920712c specify learning start --command map-build --format json` when available so passive learning files exist and repeated graph-build blind spots can be promoted at start.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader graph-build context.
- Open only learning detail docs linked from map-build-relevant index entries.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- [AGENT] When graph reconstruction friction exposes route changes, artifact rewrites, validation gaps, false starts, hidden dependencies, or reusable constraints, make sure `map-state.md` captures that durable context.
- [AGENT] When durable state does not capture the reusable lesson cleanly, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.

## Process

- Start with validation, not writing.
- Update `map-state.md` before long-running reconstruction, join-point acceptance, compaction-risk transitions, or any stop where resume will depend on more than the visible conversation.
- Validate scan inputs before execution and compile/validate `MapBuildPacket` inputs before dispatch.
- Dispatch only validated packetized build lanes as `one-subagent` or `parallel-subagents`.
- If overlap, missing packet data, missing required references, or unsafe acceptance criteria prevent safe dispatch, record `subagent-blocked` and stop for escalation or recovery.
- Run `C:\Users\11034\.specify\bin\project-cognition.exe validate-scan --format json` before graph import.
- Run `C:\Users\11034\.specify\bin\project-cognition.exe build-from-scan --format json` after scan and package validation; this owns DB import, metadata, status publication, and DB/status agreement.
- If `build-from-scan` returns `status=blocked`, report its `errors`, identity reconciliation details from `identity_reconciliation`, `rejections`, `merge_records`, and `recovery_action` and do not proceed to build validation.
- Run `C:\Users\11034\.specify\bin\project-cognition.exe validate-build --format json` after `build-from-scan`.

## Machine-Readable Blocked State

Human workflow prose may say `subagent-blocked`, but persisted machine fields use
`subagent_blocked`.

If a substantive scan/build lane cannot dispatch or complete, write:

- `.specify/project-cognition/status.json` with `baseline_state=blocked` and
  `subagent_blocked` in `stale_reasons` or `dirty_reasons`
- `.specify/project-cognition/workbench/map-state.md` with
  `readiness=blocked`, `blocking_reason=subagent_blocked`, blocked lane ids,
  blocked scope, and recovery condition
- `.specify/project-cognition/workbench/coverage-ledger.json.open_gaps[]` with
  `reason="subagent_blocked"`, `lane_id`, `packet_id`, `blocked_scope`,
  `criticality`, `owner`, `status="blocked"`, and `recovery_condition`

`unknown` blocks, `blocked`, `critical_open_gap`, and `subagent_blocked` block baseline
activation. `low_risk_open_gap` may pass only with owner, reason,
`evidence_expectation`, and `revisit_condition`.

## Hard Boundary

- `sp-map-build` is the command that publishes query-backed cognition truth.
- `sp-map-build` must not fall back to handbook-first runtime output.
- `sp-map-build` owns claim synthesis, `truth_layer` assignment, confidence assignment, conflict construction, and SQLite runtime publication.
- Existing narratives may inform continuity, but final graph claims must be backed by scan evidence.

## Required Inputs

Before writing query-backed truth, read:

- `.specify/project-cognition/status.json`
- `.specify/project-cognition/evidence/`
- `.specify/project-cognition/provisional/nodes.json`
- `.specify/project-cognition/provisional/edges.json`
- `.specify/project-cognition/provisional/observations.json`
- `.specify/project-cognition/coverage.json`
- `.specify/project-cognition/workbench/coverage-ledger.json`
- `.specify/project-cognition/workbench/scan-queue.json`
- `.specify/project-cognition/workbench/handoff-ledger.json`
- `.specify/project-cognition/workbench/scan-packets/`

If those artifacts are missing, stop and route back to `/sp-map-scan`.

## Boundary Acceptance

`sp-map-build` must validate `.specify/project-cognition/workbench/repository-universe.json` before publishing runtime truth.

- Every `included_paths` entry must appear in `coverage.json`, `coverage-ledger.json`, or an accepted non-blocking gap.
- Every included path is represented in scan coverage or an accepted gap.
- Every `excluded_paths` entry must stay only in the boundary artifact or grouped exclusion ledger.
- Excluded paths are represented only by the boundary artifact, not by graph-facing coverage rows.
- Excluded paths must not appear in graph-facing coverage rows, evidence rows, provisional graph rows, DB path indexes, route indexes, or `minimal_live_reads`.
- If repository-universe, coverage, and packet handoffs cannot explain the same path universe, return a scan gap report and route back to `sp-map-scan`.
- If scan packet acceptance reports `fail_contract` or `fail_systemic`, route back to `sp-map-scan` with a scan gap report because the repair is not only a local patch.
- `path_index_to_included_ratio` must be computed from included paths minus true exclusions and `accepted_nonblocking_gap_paths`.
- Critical and important included paths must remain in the sparse path-index denominator unless they are true repository-universe exclusions.
- `build-from-scan` must not set `freshness=fresh`, must not set `readiness=query_ready`, and must not set `graph_ready=true` until sparse path-index gates pass.

## Path Index Source Contract

build-from-scan creates DB path_index rows from nodes.json `paths`. It does not read `attrs_json.path`, raw node metadata, or `coverage.json` as path-index sources.
coverage.json rows without matching node paths are recorded as rejected coverage with reason `no_node_relation`. If `validate-build` reports
`active_generation_has_no_path_index_rows`, route back to `sp-map-scan` to repair
node `paths` in the scan package instead of inserting SQL manually.

## Output Contract

The only canonical runtime outputs for this command are:

- `.specify/project-cognition/status.json`
- `.specify/project-cognition/project-cognition.db`
- query/update helper readiness metadata
- join-point `worker-results` evidence for delegated build lanes until the leader accepts the final query-ready baseline
- `.specify/project-cognition/workbench/worker-results/<packet-id>.json`

Do not publish handbook-first runtime truth from this command. Do not publish raw graph JSON artifacts or slices as runtime truth.

## Guardrails

- Do not rebuild the scan from chat memory.
- Do not guess and continue when required scan inputs are incomplete.
- Do not treat raw scan prose or raw Markdown checklist items alone as accepted build evidence.
- Do not accept packet results without inspected paths, evidence, and confidence.
- Do not accept packet results whose `paths_read` is a boolean, summary flag, or anything other than a non-empty array of concrete paths.
- Do not accept read/deep_read packet results whose `evidence_ids` are missing from the scan evidence package or point only to a different `source_path`.
- Do not accept orphan packet results that do not correspond to a `scan-packets/<lane-id>.md` input packet.
- Do not perform a structural-only refresh and call it success.
- Do not accept manual SQL, sqlite shell scripting, hand-picked node subsets, or leader-memory graph reconstruction as normal build paths.
- Do not locally patch around contract-invalid or systemic scan packet failures.
- If the build lane cannot be safely packetized or delegated, record `subagent-blocked` and stop for escalation or recovery.
- If a delegated lane returns unresolved evidence gaps, preserve the scan gap report and stop for escalation or recovery instead of inventing closure.

## Project Cognition Workbench State Protocol

- Project Map State Protocol remains active during build acceptance.
- Validate Scan Inputs Before Execution.
- Compile And Validate MapBuildPacket Inputs.
- Treat `coverage-ledger.json` as the machine-readable row source.
- `MapBuildPacket` is required for delegated build lanes.
- Raw scan prose or raw Markdown checklist items alone are insufficient.
- raw scan prose or raw Markdown checklist items alone
- Packet evidence intake must reject packet results without paths read.
- Packet evidence intake must require `paths_read` to be a non-empty array of concrete paths, not `true` or another summary flag.
- Packet evidence intake must reject packet results that only summarize without evidence.
- Packet evidence intake must reject non-`pass` packet outcomes until the scan lane is repacked, repaired, or recorded as an explicit unresolved gap.
- derived-only evidence is insufficient for final graph acceptance.
- Structural-only refresh is a failed build.
- The build phase is not a scaffold, migration, or file-moving command.
- Treat scan artifacts as inputs, not evidence, until packet evidence is accepted.
- `.specify/**` inputs are workbench/control artifacts, not graph evidence rows.
- DB publication must not write `.specify/**` into `evidence.source_path`, `path_index.path`, `symbol_index.path`, `entrypoint_index.path`, `test_index.test_path`, or graph claims.
- Build intake must reject `.cognitionignore`-excluded paths from scan coverage, evidence rows, provisional nodes, provisional edges, observations, packet results, and `repository-universe.json` included paths.
- DB publication must not write `.cognitionignore`-excluded paths into `evidence.source_path`, `path_index.path`, `symbol_index.path`, `entrypoint_index.path`, `test_index.test_path`, or graph claims.

## Build Duties

`sp-map-build` must:

- begins with validation, not writing
- validate scan completeness for graph reconstruction
- deduplicate provisional nodes into graph nodes
- convert candidate edges into validated graph edges
- synthesize claims from evidence with explicit `truth_layer`
- assign claim confidence
- create explicit conflict records
- publish queryable task-oriented bundles for downstream agent work
- produce workflow-operational reachability validation
- produce reverse coverage validation
- project graph truth into retrieval outputs by building evidence-backed route rows
- publish `query_examples` that demonstrate common task, symptom, and workflow
  phrases against the accepted graph truth
- synthesize `concept_candidates` from graph-backed aliases, ownership,
  capabilities, symptoms, generated surfaces, and verification routes
- publish `route_pack` entries that connect selected concepts to owners,
  consumers, affected paths, verification routes, conflicts, and
  `minimal_live_reads`
- do not rebuild the scan from chat memory
- must not guess and continue when required scan inputs are incomplete
- must reject `.cognitionignore`-excluded paths before graph reconstruction; if scan artifacts contain them, return a scan gap report instead of publishing runtime truth
- maintain a scan gap report when unresolved critical rows remain

The build must keep graph truth projection explicit: every route row that feeds
`concept_candidates`, `query_examples`, or `route_pack` must be evidence-backed,
traceable to accepted scan evidence, and rejectable when confidence, ownership,
or route semantics are weak.

## Consequence Substrate Synthesis

`sp-map-build` must synthesize consequence-analysis substrate from scan evidence so downstream workflows can query dependency impact without rebuilding the map:

- owner edges for files, modules, commands, APIs, templates, generated assets, state files, and verification entry points
- consumer edges for direct callsites, generated-surface propagation, adjacent workflows, user-facing commands, and automation/runtime entry points
- lifecycle/state edges for active actors, running work, queues, sessions, locks, caches, persisted state, cleanup, retry, rollback, and idempotency behavior
- shared-state and destructive-operation edges where close/delete/archive/rename/migrate actions can affect members, consumers, or in-flight work
- verification-route claims for the checks that prove owners, consumers, state transitions, and recovery behavior
- conflict, known-unknown, stale-claim, confidence, and `minimal_live_reads` records that `sp-map-update` can preserve or narrow incrementally

The resulting query-backed runtime must be able to answer which owners, consumers, state surfaces, generated surfaces, and verification routes are implicated by a changed path or requested behavior.

## Required Graph Semantics

Every accepted graph build must make room for:

- nodes
- edges
- claims
- conflicts
- updates
- queryable task-local bundles

At minimum, claims must include:

- `backing_evidence_ids`
- `truth_layer`
- `confidence`

## Dispatch Guidance

- Use `choose_subagent_dispatch(command_name="map-build", snapshot, workload_shape)` before lane execution.
- Dispatch each build lane from a validated `MapBuildPacket`.
- Recommended build lanes include DB normalization, claim synthesis, conflict review, and queryable task-local bundle generation.
- The leader owns final graph consistency and readiness state.

## Completion Rule

Before reporting completion:

- run `C:\Users\11034\.specify\bin\project-cognition.exe validate-scan --format json` before graph import
- run `C:\Users\11034\.specify\bin\project-cognition.exe build-from-scan --format json`; if it returns `status=blocked`, report its `errors`, identity reconciliation details from `identity_reconciliation`, `rejections`, `merge_records`, and `recovery_action`
- run `C:\Users\11034\.specify\bin\project-cognition.exe validate-build --format json` after `build-from-scan`
- report completion only after `validate-build` returns `status=ok` and `readiness=query_ready`
- confirm that `.specify/project-cognition/project-cognition.db` was written and can be queried through `C:\Users\11034\.specify\bin\project-cognition.exe lexicon --intent implement --query=\"$ARGUMENTS\" --format json`, then generate a query_plan from returned map terms, then run `C:\Users\11034\.specify\bin\project-cognition.exe query --intent implement --query-plan \"<query_plan_json>\" --format json`
- if `validate-build` returns `status=blocked`, report the specific DB, schema, active generation, status, or smoke-query error and do not mark the baseline fresh
- confirm that `status.json` reflects a query-ready baseline
- confirm that the runtime remains query-backed and does not advertise raw graph JSON or handbook-first outputs as runtime truth
- report whether follow-on localized maintenance should continue through `map-update` for future touched-area drift
- every `critical` row is covered by active runtime path and route indexes
- every `important` row is reachable through active runtime path and route indexes
- every scan packet is consumed
- every accepted packet result has paths read and confidence
- every graph claim is backed by at least one accepted packet evidence row
- query bundle and route reachability are validated through runtime query surfaces
- no final report claims success for a structural-only refresh
- `map_state_file` records accepted packet results
- owner, consumer, change propagation, and verification routes remain explicit
- known unknowns or known-unknowns remain visible
- the excluded bucket has a reason and revisit condition
- every critical shared surface can be discovered through runtime query surfaces
- every key verification entry point can be located through runtime query surfaces
- required_reads contain only reference-only or hard-excluded exceptions when runtime compatibility outputs are mentioned

## Codex Map Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Keep map packet/result schemas from this workflow authoritative; do not substitute implementation `WorkerTaskResult` fields for map scan/build/update packet contracts.

## Codex Subagents-First Dispatch

When running `sp-map-build` in Codex, use the subagents-first dispatch model.
- Use `spawn_agent` for bounded lanes when `dispatch_shape` is `one-subagent` or `parallel-subagents`.
- Launch all independent lanes in the current `parallel-subagents` wave before waiting.
- Use `leader-inline-fallback` only after recording why Codex native subagents are unavailable or unsafe.
- Suggested bounded atlas synthesis lanes include root architecture/structure, conventions/testing, integrations/runtime, and workflow/operations mapping.
- Use the scan package as the subagent input contract; do not let subagents invent unscanned coverage or skip reverse coverage checks.
- Use `wait_agent` only at the documented join points before writing compatibility/export outputs such as `PROJECT-HANDBOOK.md`, before updating project cognition workbench outputs, and before the final packet evidence and consistency pass.
- Use `close_agent` after integrating finished subagent results.
