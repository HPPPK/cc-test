---
name: "sp-integrate"
description: "Use when one or more independent feature lanes have completed implementation and need a dedicated closeout workflow before mainline integration."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/integrate.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: One or more isolated feature lanes are implementation-complete and need lane-level closeout, readiness checks, and integration sequencing before merge.
- **Primary objective**: Discover completed lanes, run integration prechecks, surface drift or overlap risk, and close the lane cleanly without hiding lane state behind ad hoc merge steps.
- **Primary outputs**: Integration readiness results, lane completion state updates, and explicit closeout guidance for one or more completed lanes.
- **Default handoff**: Mainline merge or PR follow-through after readiness is confirmed; do not route back into `sp-implement` as a substitute for closeout.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## Objective

Use `sp-integrate` to discover completed lanes, run integration prechecks,
surface drift or overlap risk, and close the lane cleanly.

## Context

- Primary inputs: completed lane state, verification evidence, lane closeout metadata, and the smallest relevant project cognition query bundle or handbook guidance for merge-sensitive shared surfaces.
- This workflow is a dedicated closeout lane after implementation, not a substitute for `sp-implement`.

## Process

1. Discover candidate completed lanes and their readiness state.
2. Check shared-surface overlap, merge sequencing risk, and required closeout evidence.
3. Surface any unresolved integration blockers instead of hiding them behind a generic "done" status.
4. Produce explicit closeout guidance for merge or PR follow-through.

## Output Contract

- Integration readiness result for each candidate lane.
- Explicit blocked reasons when closeout cannot proceed safely.
- Recommended next merge or PR follow-through step when readiness is confirmed.

## Guardrails

- Do not fold this workflow into `sp-implement`.
- Do not guess merge order when conflicts or overlap are unclear.
- Treat completed lane state and verification evidence as prerequisites to closeout.
