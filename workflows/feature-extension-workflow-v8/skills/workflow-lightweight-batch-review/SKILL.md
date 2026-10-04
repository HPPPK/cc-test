---
name: Lightweight Batch Review
referenceId: workflow:lightweight-batch-review
description: Review one completed Coder batch against its user behavior and evidence without expanding into a whole-project audit.
user-invocable: false
---

Use this skill only after the Coder has completed one batch.

## Context discipline

- Use the current Context Capsule, batch goal, changed-file list, focused checks, and required artifacts. Do not pull in unrelated history or future-stage instructions.
- Treat existing AGENTS.md, CLAUDE.md, and application logs as optional evidence. Read only relevant existing sections; absence never blocks the batch. Prefer existing logs when a runtime check fails, and do not create routine workflow logs.

## Coder boundary

The Coder changes only the agreed batch and returns changed files, completed items, focused checks, blockers, risks, and evidence for the shortest affected user path. The Coder does not review its own batch.

## Reviewer boundary

The Reviewer is read-only. Check scope, the named user behavior, focused evidence, and regressions caused by this batch. Do not edit files, repeat implementation, demand unrelated cleanup, or turn the review into a release audit.

Return this compact structure:

- reviewStatus: pass | needs-fix
- userScenarioChecked
- evidence
- requiredFixes
- remainingRisks
- allowNextBatch: true | false

A pass requires meaningful evidence for the affected user path. If evidence is partial or not run, say so and set allowNextBatch to false when it blocks the promised behavior. A needs-fix result returns to the same Coder batch, then the Reviewer checks that batch again.
