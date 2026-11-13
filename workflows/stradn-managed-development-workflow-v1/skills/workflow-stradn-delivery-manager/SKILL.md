---
name: Stradn Delivery Manager
referenceId: workflow:stradn-delivery-manager
description: Run one resumable host-managed delivery graph with plan lock, dependency-safe Coder/Reviewer batches, repair loops, and independent QA.
user-invocable: false
---

# Stradn Delivery Manager

Use this skill only in the `stradn-delivery` phase. It applies Strands Graph ideas while deliberately keeping the App runtime as the single execution and persistence authority.

## Why the host remains authoritative

- The host already owns workflow status, permissions, Agent receipts, file write scopes, resource conflicts, pause/cancel signals, and persisted task snapshots.
- Do not start an independent scheduler or save a second graph state. That would allow the UI and worker graph to disagree after pause, retry, or restart.
- Treat the phase's `subagentPolicy.maxParallel` and the complete `workflow_parallel_plan` as the graph definition consumed by the existing host scheduler.

## Internal graph

1. Draft a complete Batch DAG in `.workflow/runs/<runId>/delivery-plan.md`.
2. Review the plan read-only for requirement coverage, cycles, conflicting scopes/resources, unsafe operations, and missing acceptance checks.
3. Use `AskUserQuestion` for plan-lock approval. Do not launch Coder or edit production files before approval. A plan change invalidates approval.
4. For each Batch, dispatch `coder -> reviewer` with the same complete `workflow_parallel_plan`. Each downstream Coder depends on upstream Reviewer completion.
5. On `needs-fix`, return to the same Coder and then the same Reviewer. Optional Debug is read-only and cannot replace repair.
6. After every Reviewer passes, dispatch independent QA. Code failures return to the affected `coder -> reviewer -> QA` path.
7. Complete only from fresh artifacts and runtime receipts.

## Context capsules

- Leader: requirements, user decisions, complete graph, approval state, aggregate evidence, blockers, and risks.
- Coder: one Batch goal, dependencies, write scopes, resource claims, relevant files, acceptance checks, and required return fields.
- Reviewer: one Batch goal, changed files, Coder evidence, acceptance checks, and risk boundary. Read-only.
- QA: affected user scenarios, aggregate changed files, run commands, and known risks. Read-only.

Store durable facts in workflow artifacts rather than relying on transcript history. A resumed run reloads artifacts and task snapshots, reconciles unsettled nodes, and does not repeat successful nodes without a concrete invalidation reason.

## Tool-call recovery

- When a tool returns a schema or unsupported-field error, preserve the task intent, change only the named invalid fields, and retry once.
- When the host reports a dependency/resource/write-scope conflict, leave the node queued or return a scope-change request; never bypass the lock.
- When a worker is interrupted or the workflow is paused, stop launching nodes. Resume only after the host state says running again.
- When Reviewer or QA fails, return evidence to the smallest affected repair node. Do not let Reviewer or QA edit production files.
- Repeated failure or a required authority change becomes one focused user question; ordinary internal retries do not interrupt the user.

## Required evidence

- `delivery-plan.md`: plan JSON, parallel groups, conflicts, approval record, and invalidation history.
- `implementation-log.md`: Coder/Reviewer receipts, changed files, checks, repair loops, blockers, and risks.
- `quality-report.md`: independent user-path observations, commands, failures, limitations, and preview decision.
- `run-report.md`: concise graph status and next action.
