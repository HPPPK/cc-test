# Requirements Checklist: Workflows Template Management And Chat Entry

## Artifact Completeness

- [x] `spec.md` names goal, users, confirmed scope, out-of-scope items, scenarios, capabilities, requirements, acceptance proof, decisions, risks, and consequence obligations.
- [x] `alignment.md` records semantic term decisions, upstream intent disposition, approach comparison, out-of-scope conflicts, and readiness.
- [x] `context.md` records repository context, integration boundaries, affected objects, dependency impact, locked decisions, and outstanding questions.
- [x] `references.md` records discussion artifacts, live repository evidence, and external reference boundary.
- [x] `workflow-state.md` records active command, planning-only mode, allowed writes, forbidden actions, stage, source sweep, disposition status, review state, and next command.
- [x] `brainstorming/handoff-to-specify.json` preserves the minimal compatibility fields required by downstream workflows.

## Requirement Quality

- [x] Requirements are testable and behavior-oriented.
- [x] Built-in template protection is explicit.
- [x] Global user-level storage scope is explicit.
- [x] Unknown-field preservation is explicit.
- [x] Import/export conflict behavior is explicit.
- [x] Phase output artifact and handoff contract requirements are explicit.
- [x] Chat context handling behavior is explicit.
- [x] Existing workflow snapshot immutability is explicit.

## Upstream Fidelity

- [x] All `MP-001` through `MP-015` items are mapped.
- [x] Capability-like upstream signals have dispositions.
- [x] Deferred items have reasons and reopen triggers.
- [x] Out-of-scope conflicts are recorded.
- [x] No hard unknown remains unresolved.
- [x] Soft unknowns are carried to planning with constraints.

## Consequence Gate

- [x] Senior consequence analysis gate is marked triggered.
- [x] Affected object map is preserved.
- [x] State-behavior matrix is preserved.
- [x] Dependency impact table is preserved.
- [x] Recovery and validation contract is preserved.
- [x] CA-001 through CA-006 obligations are preserved.

## Readiness

- [x] User confirmed unified spec shape.
- [x] Artifact self-review completed.
- [x] User review requested before planning.
- [x] Single next command is `/sp.plan`.
