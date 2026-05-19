---
name: "sp-constitution"
description: "Use when project principles or development rules need to be created, revised, or realigned before further specification or planning work."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/constitution.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: The project's governing principles need to be created or updated before downstream workflow work should continue.
- **Primary objective**: Update `.specify/memory/constitution.md` and propagate any principle changes into dependent templates and guidance.
- **Primary outputs**: A synchronized constitution plus any required template, shared-memory, or docs updates triggered by the principle change.
- **Default handoff**: $sp-specify for new work, or reopen the highest affected downstream stage (/sp-plan, /sp-tasks, or /sp-analyze) when a midstream amendment invalidates active artifacts.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Create or update the project constitution as the authoritative rule layer for downstream specification, planning, and execution work.

## Context

- Primary inputs: the current constitution, the user's requested principle changes, the stable shared memory layer (`project-rules.md`, `learnings/INDEX.md`, and relevant learning detail docs), and any repository context needed to derive missing values.
- The constitution must stay synchronized with dependent templates and guidance files.
- Constitution amendments may invalidate downstream planning artifacts, active workflow state, or lower-order project memory and must be treated as a workflow re-entry event when that happens.
- Versioning and governance metadata are part of the contract, not optional decoration.

## Process

- Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify learning start --command constitution --format json` when available so passive learning files exist and relevant shared memory is visible before broader context collection.
- Load the current constitution, then read `.specify/memory/project-rules.md` and `.specify/memory/learnings/INDEX.md` in that order before broader repository context. Open only relevant learning detail docs linked from the index.
- If the repository already has code and you need repo-derived evidence, read `.specify/project-cognition/status.json` plus the smallest relevant cognition slice or graph artifact first to assess git-baseline freshness before trusting any compatibility/export artifact. If the cognition baseline is missing, run `/sp-map-scan` followed by `/sp-map-build` before continuing or explicitly report the refresh as a blocking follow-up. If the cognition runtime is stale or too weak for the touched area, use `/sp-map-update` when possible before broader work continues.
- Load the current constitution and identify unresolved placeholders or requested changes.
- Derive the right version bump and updated governance metadata.
- Rewrite the constitution and propagate any downstream template, docs, compatibility/export output, project cognition runtime, or lower-memory updates required by the amendment.
- If a principle change invalidates active `spec.md`, `plan.md`, `tasks.md`, or `workflow-state.md`, reopen the highest affected downstream stage instead of always handing off directly to `/sp-specify`.

## Output Contract

- Write a finalized constitution with a sync-impact report.
- Keep dependent templates, guidance, and lower-order project memory aligned with the updated principles.
- Surface the exact downstream re-entry path (`/sp-specify`, `/sp-plan`, `/sp-tasks`, or `/sp-analyze`) when an amendment invalidates active work.
- Surface any follow-up items if a value must remain intentionally deferred.

## Guardrails

- Do not leave unexplained placeholders behind.
- Respect the semantic-versioning rules for constitution changes.
- Do not update downstream guidance partially; either sync it or report it as pending.
- Do not always hand off directly to `/sp-specify`; use the highest affected downstream stage when the amendment is midstream.
- Do not leave project rules or learnings that conflict with the amended constitution without updating them or flagging them in the sync-impact report.

## Mandatory Subagent Execution

All substantive tasks in ordinary `sp-*` workflows default to and must use subagents.

The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format.

Use `execution_model: subagent-mandatory`.
Use `dispatch_shape: one-subagent | parallel-subagents`.
Use `execution_surface: native-subagents`.


## Outline

You are updating the project constitution at `.specify/memory/constitution.md`.
This file may already contain a fully initialized default constitution, or it
may still contain legacy placeholder tokens in square brackets (for example
`[PROJECT_NAME]`). Your job is to refine the document into a concrete project
constitution and propagate any amendments across dependent artifacts.

**Note**: If `.specify/memory/constitution.md` does not exist yet, it should
have been initialized from `.specify/templates/constitution-template.md`
during project setup. That project-local template may be the default product
constitution or a built-in profile selected during `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify init`. If it is
missing, copy the template first.

## Passive Project Learning Layer

- Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify learning start --command constitution --format json` when
  available so passive learning files exist before deeper context collection.
- Read `.specify/memory/constitution.md`,
  `.specify/memory/project-rules.md`, and
  `.specify/memory/learnings/INDEX.md` in that order before broader
  repository context.
- Open only learning detail docs linked from constitution-relevant index entries,
  especially repeated workflow gaps, stable user defaults, or lower-order
  rules that may need promotion or retirement.
- Learning Reflex: before final closeout, ask whether a future senior engineer
  would benefit from seeing this lesson before related work. If yes, update
  `.specify/memory/learnings/INDEX.md` and the linked detail markdown document
  without asking for routine permission.
- When constitution work exposes repeated decision debt, rule conflict, route
  changes, hidden dependencies, or promotion friction, make sure durable state
  captures that reusable learning pressure instead of treating it as chat-only
  discussion.
- Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify learning capture-auto --command constitution --feature-dir \"$FEATURE_DIR\" --format json` when `workflow-state.md` already preserves route reasons, false starts, hidden dependencies, or reusable constraints.
- When the durable state does not capture the reusable lesson cleanly, update
  `.specify/memory/learnings/INDEX.md` and a linked detail document with the
  command, type, summary, and evidence.
- Treat project rules or learnings that conflict with the amended constitution
  as mandatory follow-up work: either realign them in this run or flag them
  explicitly in the Sync Impact Report.

## Repository Context and Navigation Freshness

- If repo-derived evidence is needed, read `.specify/project-cognition/status.json` plus the smallest relevant slice or graph artifact first to assess git-baseline freshness as the truth source before trusting any compatibility/export artifact.
- If the navigation system is missing or stale for an existing codebase, run
  `/sp-map-scan` followed by `/sp-map-build` before continuing or mark the refresh as a blocking
  follow-up rather than fabricating repository context.
- If an amendment affects project cognition runtime truth and a full refresh can be completed now,
  do it, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition validate-build --format json`, and use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition complete-refresh --format json` only when build acceptance passes;
  otherwise use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@ca37b1226d0387964eec02a93c8f9b1f8584482a specify project-cognition mark-dirty --reason \"<reason>\" --format json` as the manual override/fallback.
- If the amendment changes structure, ownership, workflows, testing strategy, integrations, or operator expectations, mark the related project cognition compatibility/export surface for refresh in the Sync Impact Report even if the constitution update itself is complete. Use this exact framing: mark the related project cognition compatibility/export surface for refresh.

## Downstream Re-entry Contract

- Inspect active downstream artifacts and phase locks before finalizing the
  amendment. At minimum, review any active `spec.md`, `plan.md`, `tasks.md`,
  or `workflow-state.md` package that relies on the current constitution.
- If a principle change invalidates active `spec.md`, `plan.md`, `tasks.md`,
  or `workflow-state.md`, reopen the highest affected downstream stage and
  record the exact re-entry path in the Sync Impact Report.
- Do not always hand off directly to `/sp-specify`. Midstream amendments may
  require `/sp-plan`, `/sp-tasks`, or `/sp-analyze` when higher-order feature
  artifacts already exist.

## Workflow Phase Lock (When an Active Feature Is Affected)

- If the amendment changes an active feature package, treat the affected
  `FEATURE_DIR/workflow-state.md` as the stage-state source of truth for the
  downstream re-entry path.
- Read `.specify/templates/workflow-state-template.md`.
- When an active feature package is affected, update or create
  `FEATURE_DIR/workflow-state.md` so it records:
  - `active_command: sp-constitution`
  - `phase_mode: planning-only`
  - a `next_action` that points to the highest affected downstream stage after
    the constitution amendment lands
  - a `next_command` of `/sp-specify`, `/sp-plan`, `/sp-tasks`, or
    `/sp-analyze` as required by the affected artifacts
- When an active feature package is affected, keep `workflow-state.md` current
  so the constitution handoff state is resume-safe.
- Before final handoff from a constitution amendment that affects an active
  feature package, verify the constitution artifact set, including amended
  `.specify/memory/constitution.md` and downstream `workflow-state.md`.
- Before any compaction-risk transition during a constitution amendment that
  affects an active feature package, update durable state before handoff so the
  downstream re-entry path survives session recovery.

Follow this execution flow:

1. Load the existing constitution at `.specify/memory/constitution.md`.
   - Identify every unresolved placeholder token of the form
     `[ALL_CAPS_IDENTIFIER]`, if any remain.
   - Treat existing concrete principles as the current baseline unless the user
     asks to replace them.
   - **IMPORTANT**: The user might require fewer or more principles than the
     ones used in the default constitution. If a number is specified, respect
     that and update the document accordingly.

2. Collect or derive missing and revised values:
   - If user input (conversation) supplies a value, use it.
   - Otherwise infer from existing repo context (README, docs,
     project cognition runtime evidence, compatibility/export references when explicitly relevant, prior constitution versions if embedded).
   - For governance dates: `RATIFICATION_DATE` is the original adoption date
     (if unknown ask or mark TODO), `LAST_AMENDED_DATE` is today if changes
     are made, otherwise keep the previous value.
   - `CONSTITUTION_VERSION` must increment according to semantic versioning
     rules:
     - MAJOR: Backward incompatible governance/principle removals or
       redefinitions.
     - MINOR: New principle/section added or materially expanded guidance.
     - PATCH: Clarifications, wording, typo fixes, non-semantic refinements.
   - If the version bump type is ambiguous, propose reasoning before
     finalizing.

3. Draft the updated constitution content:
   - Replace every unresolved placeholder with concrete text. No unexplained
     bracketed tokens should remain.
   - Preserve heading hierarchy. Remove stale instructional comments once they
     no longer add value.
   - Ensure each Principle section has a succinct name, concrete rules, and
     explicit rationale where helpful.
   - Ensure Governance lists amendment procedure, versioning policy, and
     compliance review expectations.

4. Consistency propagation checklist (convert prior checklist into active
   validations):
   - Read `.specify/templates/plan-template.md` and ensure any
     "Constitution Check" or rules align with updated principles.
   - Read `.specify/templates/spec-template.md` for scope and requirements
     alignment. Update it if the constitution adds or removes mandatory
     sections or constraints.
   - Read `.specify/templates/tasks-template.md` and ensure task
     categorization reflects new or removed principle-driven task types
     (for example observability, versioning, or testing discipline).
   - Read each command file in `.specify/templates/commands/*.md` (including
     this one) to verify no outdated references remain when generic guidance is
     required.
   - Read `.specify/memory/project-rules.md`,
     `.specify/memory/learnings/INDEX.md`, and relevant learning detail docs and resolve or explicitly report
     any lower-order guidance that now conflicts with the amended constitution.
- If the amendment changes navigation, structure, ownership, workflow,
  testing, integration, or operations expectations, mark the runtime
  handbooks for refresh and include `.specify/project-cognition/status.json`
  in the propagation review.
   - Read any runtime guidance docs (for example `README.md`,
     `docs/quickstart.md`, or agent-specific guidance files if present). Update
     references to principles that changed.

5. Produce a Sync Impact Report (prepend as an HTML comment at the top of the
   constitution file after update):
   - Version change: old -> new
   - List of modified principles (old title -> new title if renamed)
   - Added sections
   - Removed sections
   - Templates or shared memory requiring updates (`updated` / `pending`) with
     file paths
   - Downstream re-entry path: `/sp-specify`, `/sp-plan`, `/sp-tasks`, or
     `/sp-analyze`, with the highest affected downstream stage called out
     explicitly
   - Follow-up TODOs if any placeholders are intentionally deferred

6. Validation before final output:
   - No remaining unexplained bracket tokens
   - Version line matches the report
   - Dates use ISO format `YYYY-MM-DD`
   - Principles are declarative, testable, and free of vague language
     (`should` -> replace with MUST/SHOULD rationale where appropriate)

7. Write the completed constitution back to
   `.specify/memory/constitution.md` (overwrite).

8. Output a final summary to the user with:
   - New version and bump rationale
   - The highest affected downstream stage and why that is the correct
     re-entry point
   - Any files flagged for manual follow-up
   - Suggested commit message (for example
     `docs: amend constitution to vX.Y.Z (principle additions + governance update)`)

Formatting and Style Requirements:

- Use Markdown headings exactly as in the template (do not demote or promote
  levels).
- Wrap long rationale lines to keep readability (under 100 chars ideally) but
  do not hard enforce with awkward breaks.
- Keep a single blank line between sections.
- Avoid trailing whitespace.

If the user supplies partial updates (for example only one principle revision),
still perform validation and version decision steps.

If critical info is missing (for example the ratification date is truly
unknown), insert `TODO(<FIELD_NAME>): explanation` and include it in the Sync
Impact Report under deferred items.

Do not create a new template; always operate on the existing
`.specify/memory/constitution.md` file.
