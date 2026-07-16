---
name: "sp-prd"
description: "Use when an older workflow or operator still invokes the deprecated `sp-prd` compatibility entrypoint and must be routed to the canonical `sp-prd-scan -> sp-prd-build` flow."
argument-hint: "Describe the existing project or PRD extraction target to reverse-document"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/prd.md"
user-invocable: true
---
## Invocation Syntax

- In this integration, invoke workflow skills with `/sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



# `/sp.prd` Deprecated Compatibility Entrypoint

## Workflow Contract Summary

This summary is routing metadata only. The full workflow contract is the frontmatter plus the sections below.

- `sp-prd` is deprecated.
- `sp-prd` is compatibility-only and is no longer the primary reverse-PRD reconstruction workflow.
- Use `sp-prd-scan` first, then `sp-prd-build`.

## Objective

Route deprecated `sp-prd` invocations into the canonical reconstruction flow
without preserving the old one-step semantics as a preferred workflow path.

## Migration Path

[AGENT] If an older doc, alias, or operator still calls `sp-prd`, keep the compatibility response brief and route the work through the canonical flow instead:

```text
sp-prd-scan -> sp-prd-build
```

The scan step performs read-only reconstruction and produces the run package. The build step compiles the master pack and exports the PRD suite. Critical claims must meet `L4 Reconstruction-Ready`.

## Process

1. Detect whether the current invocation came through the deprecated `sp-prd`
   compatibility path.
2. Explain that `sp-prd` is compatibility-only and no longer the primary
   reverse-PRD lane.
3. Start with `sp-prd-scan`.
4. Continue to `sp-prd-build` after the reconstruction scan package is ready.

## Output Contract

- Compatibility routing should hand the operator to `sp-prd-scan` first.
- Final artifacts still come from the canonical pair:
  - `.specify/prd-runs/<run-id>/prd-scan.md`
  - `.specify/prd-runs/<run-id>/exports/prd.md`

## Guardrails

- Do not describe `sp-prd` as the preferred workflow.
- Do not keep one-step semantics alive in new guidance.
- Do not skip `sp-prd-scan` and jump straight to `sp-prd-build`.
