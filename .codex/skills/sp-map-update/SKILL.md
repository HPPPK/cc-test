---
name: "sp-map-update"
description: "Use when a query-backed project cognition baseline already exists and diff-based evidence refresh or user-supplied corrections must update it incrementally."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/map-update.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A project cognition baseline exists and repository changes or user supplements must update the runtime without a full rebuild.
- **Primary objective**: Compute impact closure, refresh affected evidence, update claims and conflicts, and update only the affected SQLite runtime records.
- **Primary outputs**: `.specify/project-cognition/status.json`, `.specify/project-cognition/project-cognition.db`, and query/update helper readiness metadata.
- **Default handoff**: Return to the blocked workflow once the affected query scope is green or yellow.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## Objective

Refresh the existing query-backed project cognition baseline incrementally from diff-driven evidence or explicit user corrections.

## Mandatory Subagent Execution

All substantive tasks in ordinary `sp-*` workflows default to and must use subagents.

The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format.

Use `execution_model: subagent-mandatory`.
Use `dispatch_shape: one-subagent | parallel-subagents`.
Use `execution_surface: native-subagents`.

## Process

- Query the current project cognition baseline and determine the affected closure before editing runtime outputs.
- Prefer the smallest update that can truthfully restore readiness.
- Treat explicit user corrections and user-supplied scope as first-class routing input; user-supplied scope is authoritative for the touched area unless repository evidence disproves it.
- Dispatch only validated incremental update lanes with bounded affected scope.
- A tiny localized refresh may stay as one bounded lane even when native subagents are available.
- If a safe update lane cannot be packetized or delegated, record `subagent-blocked` with the affected paths and the smallest live-read recovery path; this is a dispatch/runtime blocker, not an excuse to skip the map-update duty.
- Update the affected runtime records that can be proven, and explicitly mark uncertain edges as partial, low-confidence, stale, or known-unknown instead of claiming the update cannot be performed.

## Git Delta Intake

- Start from Git, not memory: collect modified, added, deleted, and renamed paths from the current diff, supplied commit range, or explicit changed-path list.
- Filter changed paths through `.cognitionignore` before querying or patching the runtime. Read root `.cognitionignore` and `.specify/project-cognition/.cognitionignore`; both use gitignore-compatible syntax.
- User-supplied changed paths that match `.cognitionignore` are scope notes, not update targets. Report them as ignored unless a later `!` rule re-includes the path or the user explicitly changes the ignore rule.
- Treat user-supplied changed paths, behavior surfaces, and corrections as authoritative scope hints unless repository evidence contradicts them.
- Query `project-cognition.db` for each changed path before deciding update scope.
- For every changed path, look up current owner, consumers, lifecycle/state surfaces, shared mutable state, destructive-operation edges, generated-surface propagation, verification routes, conflicts, stale claims, and known unknowns.
- Expand the update closure through owners, downstream consumers, state surfaces, workflow artifacts, generated surfaces, and verification routes that project cognition already knows.

Every changed path must be accounted for as one of: updated, provisionally adopted, ignored with reason, partial with `minimal_live_reads`, blocked with recovery condition, or requiring full rebuild for a reserved rebuild reason.

Ignored `.cognitionignore` paths are reported in ignored-path accounting only. `sp-map-update` must not write `.cognitionignore`-excluded paths into update records, known unknowns, `minimal_live_reads`, graph evidence, or route indexes.

## Update-By-Default Rule

- Ordinary uncertainty is not an update failure.
- If the affected closure cannot be fully proven, still update the records that can be proven and record the rest as `partial_refresh`, low-confidence claims, conflicts, stale claims, `known_unknowns`, and `minimal_live_reads`.
- `sp-map-update` must not route to `sp-map-scan -> sp-map-build` merely because the closure is wider than expected, some consumers are ambiguous, or extra live reads are needed.
- Rebuild is reserved for missing baseline, unusable DB/status/schema, explicit rebuild request, or repository architecture replacement so broad that the baseline identity is invalid.

## Existing-Baseline Gap Policy

When a usable active generation exists, existing-baseline ordinary gaps are `sp-map-update`
work and must not route to `$sp-map-scan`, then `$sp-map-build` for ordinary path gaps,
path count, unrelated top-level count, core-surface status, weak ownership,
missing `path_index` coverage, or unadoptable-ratio heuristics.

Use `review`, `partial_refresh`, low-confidence claims, conflicts, stale claims,
known unknowns, and `minimal_live_reads` to preserve imperfect but useful
maintenance state.

`$sp-map-scan -> $sp-map-build` is allowed after an existing baseline
only for missing or unusable runtime, zero active-generation `path_index` rows,
schema failure, `explicit_rebuild_requested`, or `baseline_identity_invalid`.

## Incremental Rule

- `sp-map-update` is the normal maintenance entrypoint after baseline build.
- It must accept both diff-driven and user-supplement-driven updates.
- It must update the query-backed cognition runtime incrementally.
- It must treat `.specify/project-cognition/status.json` plus `.specify/project-cognition/project-cognition.db` as the runtime truth source for post-update readiness.
- It must not silently escalate to a full rebuild without recording why.
- When changed paths are missing from `path_index`, classify them before escalating: adoptable paths get provisional `path_index` coverage, uncertain paths return `review` with `minimal_live_reads`, and existing-baseline ordinary gaps stay in `sp-map-update`.
- Provisional adoption must write valid graph records: an adoption `evidence` row plus a `path_index` row with `relation="provisional_path"` and graph confidence `weak` or `partial`.
- It must prefer metadata-only or single-slice updates when those are sufficient.
- After recording updates, re-evaluate runtime readiness through the shared freshness contract.
- After applying update records, run `C:\Users\11034\.specify\bin\project-cognition.exe validate-build --format json`.
- If the update helper returns `needs_rebuild`, `sp-map-update` must not call `complete-refresh`; report the concrete first/missing/unusable baseline, schema failure, zero active-generation `path_index` rows, `explicit_rebuild_requested`, or `baseline_identity_invalid` condition and route to `$sp-map-scan`, then `$sp-map-build`.
- If `validate-build` is blocked after update recording, report `partial_refresh` and preserve the validation errors instead of claiming the runtime is fresh.
- If the re-evaluated runtime is `fresh` with `readiness=ready`, finalize the successful refresh through `C:\Users\11034\.specify\bin\project-cognition.exe complete-refresh --format json` so cognition freshness metadata cannot remain stale.
- If the update helper returns `ready` and `validate-build` passes, but the shared freshness check still sees the same refreshed source paths only because those source changes are not committed yet, report the incremental update as recorded and baseline-finalization pending. Do not tell the user to run `$sp-map-scan` or `$sp-map-build` merely because refreshed source changes are not committed yet.
- After those source changes are committed, update the git-baseline freshness metadata with `C:\Users\11034\.specify\bin\project-cognition.exe record-refresh --reason \"map-update\" --format json` or `C:\Users\11034\.specify\bin\project-cognition.exe complete-refresh --format json` without rerunning `$sp-map-scan` or `$sp-map-build`, unless validation reports `needs_rebuild`, the baseline is unusable, or the affected closure cannot be bounded safely.
- Do not report refresh completion when the runtime remains blocked.
- A recorded refresh is not automatically a ready refresh: `partial_refresh` means update metadata was written but readiness still failed.

## Required Inputs

At minimum, read:

- `.specify/project-cognition/status.json`
- `.specify/project-cognition/project-cognition.db` through the
  `project-cognition` query/update helpers
- changed paths or changed commit range
- user supplement input if provided

Do not read or rewrite raw graph JSON artifacts; they are not runtime truth.

## Output Contract

The canonical outputs for this command are:

- updated `.specify/project-cognition/status.json`
- updated `.specify/project-cognition/project-cognition.db`
- query/update helper readiness metadata
- the post-recording freshness result, including `freshness`, `readiness`, and `recommended_next_action`
- when the post-recording freshness result is ready, a completed cognition refresh finalizer via `C:\Users\11034\.specify\bin\project-cognition.exe complete-refresh --format json`

## Guardrails

- Do not silently escalate to a full rebuild without recording why.
- Do not refresh unaffected runtime records just because the touched area is ambiguous; record partial or low-confidence closure for the affected records instead.
- Do not invent closure when changed paths or user supplements do not support the update.
- Do not re-read or rewrite raw graph JSON artifacts; use the query/update helpers and the smallest affected runtime records that can truthfully restore readiness.
- Do not split small localized updates into parallel scan-style lanes just because subagents are available.
- If the affected update lane cannot be safely packetized or delegated, record `subagent-blocked` with affected paths and recovery evidence; do not describe ordinary ambiguous closure as impossible to update.
- Do not write `.cognitionignore`-excluded paths into update records, `known_unknowns`, or `minimal_live_reads`; report ignored paths separately so the operator can revise `.cognitionignore` when the exclusion is wrong.

## Escalation Boundary

- Escalate to `sp-map-scan`, then `sp-map-build` only when no query-backed baseline exists, the current baseline is unusable, DB/status/schema validation fails, zero active-generation `path_index` rows exist, the user explicitly requested a rebuild (`explicit_rebuild_requested`), or the repository architecture changed so broadly that the baseline identity is invalid (`baseline_identity_invalid`).
- Do not escalate merely because the affected closure is uncertain; record the uncertainty as partial/low-confidence update data with `known_unknowns` and `minimal_live_reads`.
- Record the exact reason for escalation, including the failed baseline, DB, schema, explicit-request, or architecture-replacement fact.

## Update Duties

`sp-map-update` must:

- compute diff impact closure
- refresh affected evidence
- apply updates as a `patch-in-active-generation` operation against the current
  query-backed baseline unless validation proves a rebuild is required
- invalidate stale claims
- detect and repair stale retrieval signals, including obsolete aliases,
  colloquial user phrases, concept routes, and ownership hints
- update or create conflicts
- preserve or revise `selected_concepts` routing evidence when changed paths,
  user supplements, or runtime validation show that prior concept selection
  would now misroute a query
- preserve or revise `rejected_concepts` routing evidence when user corrections
  or repository evidence show that a plausible alias belongs to the wrong
  domain
- update affected runtime records with proven facts, low-confidence claims, conflicts, stale markers, known unknowns, and minimal live reads
- produce an incremental update record
- verify the shared freshness contract after the update record is written
- run the successful-refresh finalizer when that verification proves the runtime ready

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

When running `sp-map-update` in Codex, use the subagents-first dispatch model.
- Prefer the smallest executable update lane set.
- User-supplied scope remains authoritative unless repository evidence disproves it.
- Use `spawn_agent` for bounded lanes when `dispatch_shape` is `one-subagent` or `parallel-subagents`.
- Launch all independent lanes in the current `parallel-subagents` wave before waiting, but only after confirming the refresh is not metadata-only or single-slice.
- Use `leader-inline-fallback` only after recording why Codex native subagents are unavailable or unsafe.
- Leader-inline-fallback for a one-lane update is preferred over forcing extra subagents.
- Suggested bounded update lanes include diff impact closure, affected claim refresh, user supplement normalization, and conflict reconciliation.
- Do not turn a one-slice or metadata-only refresh into scan-style parallel exploration.
- Use `wait_agent` only at the documented join points before updating graph claims, conflicts, and slices.
- Use `close_agent` after integrating finished subagent results.
