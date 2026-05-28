# cc-jiangxia Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-16

## Active Technologies

- Bootstrap context only; run specify -> plan to capture active technologies

## Project Structure

```text
.specify/
features/
```

## Commands

specify check
specify --help

## Command Surface Rules

- Treat the live `specify --help` output as the only authoritative CLI command surface.
- Before suggesting a `specify <subcommand>` invocation, verify that `specify --help` or `specify <subcommand> --help` exposes it.
- Do not invent, paraphrase, or "normalize" unsupported CLI names such as `specify create-feature`.
- Feature creation must follow `sp-specify` plus the generated create-feature script at `.specify/scripts/bash/create-new-feature.sh` or `.specify/scripts/powershell/create-new-feature.ps1`, not a separate imagined branch-creation command family.

## Code Style

General: Follow existing repository conventions and refresh this file after the first plan.

## Recent Changes

- Initial Spec Kit Plus scaffolding

## Workflow Recovery Rules

- Treat concurrent feature work as lane-first, not branch-first.
- Resolve resumable workflow targets through durable lane state or explicit feature paths before guessing from the current branch name.
- If a workflow records canonical next-command tokens like `/sp.plan` or `/sp.implement`, normalize them before comparing against bare command names.
- If lane resolution returns a unique safe candidate and a materialized worktree, continue from that isolated worktree context instead of assuming the current workspace is correct.
- Prefer `.specify/features/<feature>/` as the canonical feature root. Preserve compatibility with legacy feature roots such as `specs/<feature>/` and `.specify/specs/<feature>/` when recovery logic or generated scripts need to reopen an existing feature package.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

<!-- SPEC-KIT:BEGIN -->
## Spec Kit Plus Managed Rules

- `[AGENT]` marks an action the AI must explicitly execute.
- `[AGENT]` is independent from `[P]`.

## Always-On Context

- Project cognition and project memory are always available, even without an active `sp-*` workflow.
- When existing-system truth matters, use project cognition before broad source inspection and use its results to narrow live reads.
- Read `.specify/memory/project-rules.md` and `.specify/memory/learnings/INDEX.md` before decisions that depend on local conventions, constraints, or past lessons.

## Workflow Recommendations

- Do not auto-enter an `sp-*` workflow unless the user invokes it.
- Recommend `sp-discussion` for open-ended requirement exploration, `sp-specify` for formal alignment, `sp-deep-research` for feasibility proof, and `sp-debug` for root-cause diagnosis.
- If the user invokes an `sp-*` workflow, follow that workflow's own contract.

## Command Surface Rules

- Treat live `specify --help` output as the authoritative CLI surface.
- Before suggesting or running a `specify <subcommand>` invocation, verify that help exposes it.
- Do not invent unsupported CLI names such as `specify create-feature`.
- Feature creation uses the generated create-feature script at `.specify/scripts/bash/create-new-feature.sh` or `.specify/scripts/powershell/create-new-feature.ps1`.

## Durable State

- When resuming generated work, prefer durable workflow state and explicit feature paths over branch name or chat memory.
- Keep project cognition freshness truthful after changes to architecture, ownership, workflow names, integration contracts, or verification entry points.
- Store reusable lessons in project memory, not only in chat or task artifacts.

- Preserve content outside this managed block.
<!-- SPEC-KIT:END -->