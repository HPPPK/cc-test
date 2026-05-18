---
name: "sp-research"
description: "Use when a user invokes `sp-research` but the intended Spec Kit workflow is the pre-plan `sp-deep-research` feasibility gate."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/research.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



# `/sp.research` Compatibility Alias

## Workflow Contract Summary

- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## Mandatory Subagent Execution

All substantive tasks in ordinary `sp-*` workflows default to and must use subagents.

The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format.

Use `execution_model: subagent-mandatory`.
Use `dispatch_shape: one-subagent | parallel-subagents`.
Use `execution_surface: native-subagents`.


## Objective

[AGENT] Treat `sp-research` as a compatibility alias for `sp-deep-research`.
Route immediately to the canonical deep-research workflow without creating a separate workflow lane or artifact set.

## Context

- `sp-research` exists only for compatibility with users who name research as a Spec Kit command.
- The canonical workflow is `sp-deep-research`.
- Canonical outputs belong to `sp-deep-research`: `FEATURE_DIR/deep-research.md`, optional `FEATURE_DIR/research-spikes/`, and `workflow-state.md`.

## Process

- Preserve the user's original request and arguments: `$ARGUMENTS`.
- Immediately continue with `/sp.deep-research` / `sp-deep-research`.
- Do not create or persist a separate `sp-research` workflow state.

## Output Contract

- Do not write separate `sp-research` artifacts.
- If a workflow state is written, it must use `active_command: sp-deep-research`.
- If deep research is not needed, let the canonical `sp-deep-research` command write its lightweight not-needed handoff.

## Guardrails

- If this command was invoked for generic web research rather than a planning-ready spec feasibility gate, route to the passive external/web research skill instead of writing Spec Kit feature artifacts.
- Do not treat `sp-research` as a replacement for `sp-plan`, `sp-test-scan`, or any implementation workflow.
