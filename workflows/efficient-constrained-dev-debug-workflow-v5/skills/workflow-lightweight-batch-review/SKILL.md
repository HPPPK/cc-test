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

Include the existing explicit completion key readyForReview: true only when that scoped work and its promised checks are complete. A paused or blocked worker returns readyForReview: false with the concrete blocker. Preserve completed work and evidence when continuing; do not create another handoff file merely to supply this key. Waiting for diagnosis is not completion.

## Reviewer boundary

The Reviewer is read-only. Check scope, the named user behavior, focused evidence, and regressions caused by this batch. Do not edit files, repeat implementation, demand unrelated cleanup, or turn the review into a release audit.

- Review the evidence promised for this batch, not a future batch's completed user flow. A skeleton-only batch may be accepted for HTTP/resource serving checks; this never proves browser rendering or interaction and does not replace final QA.
- Playwright is public-web research only and cannot validate localhost. Use an actually available authorized local-browser path for real UI evidence. If that capability is unavailable, report the validation limitation and feasible alternative once; do not demand repeated code changes or the same rejected browser call.
- Harmless regenerable caches created by checks may be retained and recorded as non-blocking. Do not turn their presence into a cleanup approval checkpoint, delete them yourself, or permit unrelated source/data writes.
- A concrete same-batch fix within the accepted scope goes directly to its Coder; it does not require another user approval. New scope, risk or unapproved operations still require a user decision before dependent work is dispatched.

Return one JSON object containing this runtime receipt:

```json
{"workflowReview":{"reviewStatus":"pass","requiredFixes":[],"readyForNextBatch":true}}
```

Attach userScenarioChecked, evidence and remainingRisks alongside workflowReview. A pass requires meaningful evidence for the affected user path, an empty requiredFixes array and readyForNextBatch=true. If evidence is partial or not run and blocks the promised behavior, return reviewStatus="needs-fix", concrete non-empty requiredFixes and readyForNextBatch=false. A needs-fix result returns to the same Coder batch, then the Reviewer checks that batch again.

requiredFixes accepts non-empty strings or finding objects, for example {"file":"app/auth.py","issue":"Teacher update can target an administrator","requiredChange":"Restrict the target role and add a regression test"}. Preserve concrete findings. When shell tools are unavailable, inspect code and Coder-provided commands, results and evidence; do not request the same check merely because you cannot execute it yourself. Identify any genuinely unverified behavior explicitly as a validation gap; never claim that it passed or confuse missing evidence with a proven code defect.

For a same-batch defect within accepted scope, directly dispatch that batch's Coder and then its Reviewer. A report-format failure alone retries the Reviewer with the existing accepted Coder evidence. Do not request rework_current_phase for either case merely to obtain permission; that route requires user confirmation and may invalidate dependent results. Use a route only when the accepted phase or plan actually needs to change. Always follow the current task receipts rather than old narrative results.

Only Coder/Reviewer Agent calls carry the complete validated workflow_parallel_plan. QA and Debug omit workflow_parallel_plan. Do not read a new phase output as an existing input: use only existing incoming evidence supplied by the Leader, and report a missing required input as a blocker rather than repeatedly reading a file that has not been created.

Initial and resumed Reviewers automatically receive the current successful Coder report and recorded command receipts in workflow-coder-evidence. Use this bounded view of existing task records and its transcript reference; do not require another handoff file. Check actual test prerequisites: production PostgreSQL does not make a database-free health check or unit test require a database instance. Never claim an unobserved check passed.

A scope change needs executable permission, not an ordinary AskUserQuestion answer. For a necessary small existing-file addition, the Leader waits for current workers to finish and requests rework_current_phase with scopeAmendment={batchId,addWriteScopes}. Its single confirmation updates plan and permissions, preserving unaffected passing batches in Stage 4. Re-read the amended plan before dispatch. Changes to goals, dependencies or resources still require Stage 3. Explicit readyForReview=false stays blocked; it does not release dependent batches or create a technical failure.
