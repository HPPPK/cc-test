# Requirements Checklist: Agent Workflow Authoring Tools

**Purpose**: Validate that the specification package preserves the confirmed discussion intent and is ready for user review before `/sp.plan`.
**Created**: 2026-05-27
**Feature**: `.specify/features/006-agent-workflow-authoring-tools/spec.md`

## Specification Review

- [x] CHK001 No template placeholders, TODO markers, or unresolved clarification markers remain in `spec.md`.
- [x] CHK002 Requirements are testable and unambiguous enough for `/sp.plan`.
- [x] CHK003 Confirmed scope, out-of-scope items, and deferrals are explicit.
- [x] CHK004 Semantic terms with product impact have selected and excluded meanings in `alignment.md`.
- [x] CHK005 Discussion-originated upstream signals MP-001 through MP-022 have disposition rows.
- [x] CHK006 No upstream signal is silently dropped.
- [x] CHK007 Out-of-scope conflicts are recorded with user confirmation and reopen triggers.

## Safety And Compatibility

- [x] CHK008 Direct validated writes are specified without reintroducing a mandatory preview step.
- [x] CHK009 Builtin mutation/deletion remains out of scope; builtin edit requests use copy-then-edit.
- [x] CHK010 Delete is scoped to uniquely identified user templates and marked destructive.
- [x] CHK011 Update/delete stale-write protection is specified.
- [x] CHK012 Active and historical workflow session snapshots remain unchanged by template edits.
- [x] CHK013 Protected non-workflow user state is excluded from mutation scope.
- [x] CHK014 Settings Workflows compatibility is tied to the same registry/store after reload/refetch.

## Field Guidance And Validation

- [x] CHK015 Field guide requirements cover template identity, phase identity, intent, handoff, execution, output, completion, transition, action policy, model/skills, and unsupported shapes.
- [x] CHK016 Validation parity with existing registry/API semantics is required.
- [x] CHK017 Invalid/stale/ambiguous/denied operations are no-write outcomes with actionable diagnostics.
- [x] CHK018 Transcript-auditable result content is required.

## Planning Handoff

- [x] CHK019 Plan-phase soft questions are explicit and have reopen triggers.
- [x] CHK020 Repository context names the key source, server, desktop, and test surfaces for planning.
- [x] CHK021 CA-001 through CA-011 are preserved in the spec/context.
- [x] CHK022 Single next command after user review is `/sp.plan`.
