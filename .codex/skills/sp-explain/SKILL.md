---
name: "sp-explain"
description: "Use when the user needs the current stage artifact, project cognition state, or compatibility/export atlas artifact explained in plain language without changing the underlying files."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/explain.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: The user needs to understand the current planning-stage artifact, project cognition state, or compatibility/export atlas view before deciding whether to continue, revise, or proceed.
- **Primary objective**: Translate the current artifact into plain language while staying faithful to what is actually on disk.
- **Primary outputs**: A structured explanation only; do not rewrite stage artifacts or atlas documents unless another command explicitly requests it.
- **Default handoff**: $sp-plan or /sp-tasks only after the user is satisfied with the current understanding and wants to advance.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Explain the current stage artifact in plain language so the user can understand what the system believes, what is settled, what remains open, and what the next stage would do.

## Context

- Primary inputs: the most relevant current stage artifact plus any immediately supporting artifacts needed to explain it accurately.
- This command is explanation-only. It does not invent state that is absent and does not rewrite the underlying files.
- If limited collaboration is used for a supporting cross-check, the final explanation still converges back to one render step.

## Process

- Resolve the current stage artifact deterministically.
- Load only the supporting context needed to explain it faithfully.
- Optionally run a bounded cross-check lane when the current artifact genuinely benefits from it.
- Render one final structured explanation in the user's language.

## Output Contract

- Produce a stage-aware explanation with status, risk, and next-step framing.
- Keep the explanation grounded in what is actually on disk.
- Be explicit when implementation status or another expected artifact is absent.

## Guardrails

- Do not invent missing state.
- Do not rewrite stage artifacts from inside `/sp-explain`.
- Default to `leader-inline-fallback` only when no safe supporting subagent cross-check lane can be packetized and dispatched safely.

## Mandatory Subagent Execution

All substantive tasks in ordinary `sp-*` workflows default to and must use subagents.

The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format.

Use `execution_model: subagent-mandatory`.
Use `dispatch_shape: one-subagent | parallel-subagents`.
Use `execution_surface: native-subagents`.


## Outline

Goal: Read the current stage artifact, project cognition artifact, or explicitly requested compatibility/export atlas artifact and explain it in plain language so the user can understand what the system currently believes, what is decided, what is still open, and what the next phase or next relevant view will do.

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --paths-only` from repo root once (`--json --paths-only` / `-Json -PathsOnly`) and parse the available feature paths.
   - If `FEATURE_DIR` is not already explicit, prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@3f003d2bd26e4b4e73b77950c148ccb010ece90c specify lane resolve --command explain --ensure-worktree` before guessing from branch-only context.
   - When lane resolution returns a materialized lane worktree, explain artifacts from that isolated worktree context so the explanation stays attached to the active feature lane.

2. Resolve the stage artifact deterministically:
   - If the user explicitly names a stage, honor it.
   - If the user explicitly asks about project cognition, touched-area state, or brownfield runtime truth, resolve `.specify/project-cognition/status.json` and the smallest matching query-backed artifact first.
   - Explain handbook artifacts only when the user explicitly requests the compatibility/export surfaces themselves.
   - If the user explicitly asks for a compatibility/export handbook, `PROJECT-HANDBOOK.md`, `architecture`, `structure`, `conventions`, `integrations`, `workflows`, `testing`, or `operations` artifact, resolve that artifact directly.
   - Explain the architecture, cognition, or compatibility/export atlas artifact directly instead of forcing a planning-stage fallback.
   - Otherwise prefer the most advanced available artifact in this order:
     - `tasks` -> `FEATURE_DIR/tasks.md`
     - `plan` -> `FEATURE_DIR/plan.md`
     - `specify` -> `FEATURE_DIR/spec.md`
   - Supporting files:
     - `specify`: also read `FEATURE_DIR/alignment.md` and `FEATURE_DIR/references.md` if present
     - `clarify`: read `FEATURE_DIR/spec.md`, `FEATURE_DIR/alignment.md`, and `FEATURE_DIR/references.md` together, then explain the enhancement state as an extension of the current spec package
     - `plan`: also read `FEATURE_DIR/research.md`, `FEATURE_DIR/data-model.md`, `FEATURE_DIR/contracts/`, and `FEATURE_DIR/quickstart.md` when present
     - `tasks`: also read `FEATURE_DIR/plan.md` and `FEATURE_DIR/spec.md` when needed for explanation
     - `implement`: if there is no canonical implementation status artifact, explain that implementation status is unavailable from the current file set and fall back to the most recent planning artifact instead of guessing
     - `project cognition`: read `.specify/project-cognition/status.json` plus the smallest matching slice needed to explain ownership, dependencies, lifecycle, change impact, or verification routes accurately
     - `compatibility/export atlas`: read the explicitly requested handbook plus the smallest supporting export files needed to explain ownership, dependencies, lifecycle, change impact, or verification routes accurately

3. Read the resolved artifact and any immediately supporting artifact needed to explain it accurately.
   - If present, also read `.specify/memory/constitution.md` so the explanation honors the project constitution and its constraints on the current stage artifact.

4. Before translating the artifact, assess workload shape and the current agent capability snapshot, then apply the shared policy contract: `choose_subagent_dispatch(command_name="explain", snapshot, workload_shape)`.
   - Persist the decision fields exactly: `execution_model: subagent-mandatory`, `dispatch_shape: one-subagent | parallel-subagents`, `execution_surface: native-subagents`.
   - If repository inspection, artifact reading beyond already-provided context, or evidence cross-checking is needed, dispatch a bounded subagent lane before final explanation.
   - If the artifact is fully provided in the current prompt and no repository inspection is needed, the leader may render the explanation directly because no substantive repository task is being executed.
   - If required subagent dispatch is unavailable, record `subagent-blocked` and stop with the missing capability or packet requirement instead of treating coordinator-authored substantive work as the ordinary path.
   - If collaboration is justified, keep `explain` lanes limited to:
     - primary artifact reading
     - supporting artifact cross-check
   - Required join point:
     - before rendering the final explanation
   - Report the chosen strategy, reason, any `subagent-blocked` condition, and whether supporting cross-check lanes were used.

5. Translate the artifact into plain language:
   - what this stage is trying to accomplish
   - what has already been decided
   - what remains open or risky
   - what the next stage will do with this information
   - for project cognition and compatibility/export atlas views: explain verified facts, inferred relationships, important unknowns, and the next relevant cognition slice or export view

6. Present the explanation as a structured terminal UI built from open blocks, not a raw dump.

## TUI Requirements

The output should use a polished terminal presentation with:

- a stage header
- a status block
- an explanation block
- a risk block
- a next-step block

The explanation must remain stage-aware:

- `specify`: explain the requirement package and what it means in everyday terms
- `plan`: explain the implementation approach in plain language
- `tasks`: explain what concrete work is about to happen
- `implement`: explain progress, current scope, and active risks
- `project cognition`: explain ownership, dependencies, lifecycle, change impact, confidence, and the next relevant cognition slice in plain language
- `compatibility/export atlas`: explain ownership, dependencies, lifecycle, change impact, confidence, and the next relevant export view in plain language

## Rules

- Keep the explanation grounded in the actual artifact on disk.
- Use subagent lanes for explanation work that needs repository inspection or artifact cross-checking; leader synthesis is limited to fully supplied prompt context with no substantive repository task.
- If a supporting cross-check lane is used, converge back to one final render step before presenting the explanation.
- Use the user's current language for user-visible output unless literal command names, file paths, or fixed status values must remain unchanged.
- Prefer clarity over jargon.
- Do not invent missing state; if something is absent, say it is absent.

## Codex Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Preserve this workflow's existing packet, handoff, artifact, and result schema; this section only governs capability discovery before dispatch or blocked-state recording.
