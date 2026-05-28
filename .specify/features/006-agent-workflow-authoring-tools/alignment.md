# Specification Alignment Report: Agent Workflow Authoring Tools

**Feature Branch**: `006-agent-workflow-authoring-tools`  
**Created**: 2026-05-27  
**Status**: Aligned: ready for plan

## Current Understanding

The user wants the agent to have an internal, globally available workflow-template authoring capability. The agent should be able to discuss a desired workflow, retrieve field guidance, inspect existing templates, validate candidate templates, directly persist valid user-template creates/updates, safely copy builtins before modifying them, delete uniquely identified user templates, and keep Settings Workflows compatible with the same persisted store.

This is a specification-only package. It does not authorize source or test edits. The user invoked `$sp-plan` after the artifact review request, which is recorded as approval to enter design-only planning.

## Confirmed Facts

- The upstream discussion handoff is user-confirmed and has `hard_unknown_count = 0` and `open_conflict_count = 0`.
- Valid user-template create/update operations should write directly without a mandatory preview step.
- The tool should be globally available in ordinary chat while respecting active workflow phase action policy.
- Existing user templates update in place by default.
- Builtin templates remain read-only; builtin edit requests create and modify a user-owned copy.
- Delete is first-scope only for uniquely identified user templates and must be treated as destructive.
- The agent needs a discoverable workflow field guide because field semantics determine workflow quality.
- Settings Workflows must see agent-created/updated templates from the same registry/store after reload/refetch.
- Live repository reads show existing registry/API/manual UI support for list/detail/validate/create/update/delete/duplicate/import/export and builtin protection.

## Low-Risk Assumptions

- "Realtime" in the user's Settings expectation is satisfied by same-store persistence plus existing Settings reload/refetch behavior; no new live push subscription is required for this spec.
- The exact tool file/module name can be decided during `/sp.plan` as long as the operation surface and contracts are preserved.
- The implementation may reuse direct registry service calls, server API calls, or both, provided parity, persistence, cache invalidation, and desktop compatibility are preserved.

## Open Questions

- Desktop-launched sessions may need a desktop-server-backed write path in addition to direct registry writes. Owner: downstream plan. Latest resolve phase: `/sp.plan`.
- Field guide alignment source must be chosen: shared schema metadata, validator annotations, or static tested guide colocated with validation. Owner: downstream plan. Latest resolve phase: `/sp.plan`.

Neither question blocks specification because the product behavior and safety contracts are already settled.

## Semantic Term Decisions

Term: workflow authoring tool  
Possible Meanings: manual Settings UI only; agent-generated JSON for user copy/paste; internal agent tool that can validate and persist workflow templates  
Selected Meanings: internal agent tool capability with read-only guide/list/inspect/validate and mutating create/update/duplicate/delete operations  
Excluded Meanings: manual UI-only; static docs-only; JSON-only output without persistence  
User Confirmation: confirmed by discussion handoff and explicit section approval on 2026-05-27

Term: realtime / Settings visible  
Possible Meanings: live push into an already-open Settings view; same persisted store visible after reload/refetch; separate preview result only  
Selected Meanings: same persisted workflow registry/store; Settings Workflows can show agent-authored templates after reload/refetch  
Excluded Meanings: mandatory preview UI; separate store invisible to Settings; required live push subscription  
User Confirmation: confirmed by handoff MP-019; semantic narrowing documented here

Term: create / update / delete  
Possible Meanings: draft only; validate only; persistent mutation  
Selected Meanings: persistent mutations for valid user-template operations with no-write safety on failure  
Excluded Meanings: preview-only persistence; direct builtin mutation; ambiguous destructive delete  
User Confirmation: confirmed by Q-001, Q-003, Q-004, Q-005

Term: existing workflow / builtin `agent-development`  
Possible Meanings: any template including builtin can be mutated in place; user templates mutate in place while builtin templates are copied; always create revised copies  
Selected Meanings: user templates update in place; builtin templates copy to non-conflicting user template then edit copy  
Excluded Meanings: direct builtin mutation; every update creates a copy  
User Confirmation: confirmed by Q-003/Q-005

Term: field guide  
Possible Meanings: informal docs; model memory; discoverable tool operation/schema help aligned with validator  
Selected Meanings: discoverable read-only authoring guide covering required/optional fields, values, relationships, examples, unsupported shapes, and quality heuristics  
Excluded Meanings: hidden implementation detail; stale manual text with no validation alignment  
User Confirmation: confirmed by Q-006 and section approval

## Upstream Intent Disposition

| Signal | Source | Disposition | Artifact Location | User Confirmed | Reopen Trigger |
| --- | --- | --- | --- | --- | --- |
| Internal agent tool for workflow authoring and optimization | MP-001, requirements.md | in_scope | spec.md Goal And Users | yes | Feature becomes manual UI-only or draft-only |
| Create workflow from natural-language phases | MP-002 | in_scope | spec.md Scenario 1, FR-006 | yes | Create cannot persist valid user templates |
| Optimize existing workflow from critique | MP-003 | in_scope | spec.md Scenario 2, FR-007 | yes | User-template updates unsupported or builtin edits mutate directly |
| Operation surface list/inspect/field guide/validate/create/update/duplicate/delete | MP-004 | in_scope | spec.md Capability Decomposition | yes | Any operation dropped without explicit decision |
| Direct writes without mandatory preview | MP-005 | preserved | spec.md Locked Decisions | yes | Mandatory preview-only flow returns |
| Global availability with phase-policy gating | MP-006 | preserved | spec.md FR-001, FR-014 | yes | Tool scoped only to workflow mode or bypasses policy |
| Builtin read-only and copy-then-edit | MP-007 | preserved | spec.md Scenario 3 | yes | Direct builtin mutation/shadowing proposed |
| Stale-write protection | MP-008 | preserved | spec.md Safety rules | yes | Update/delete writes from stale state |
| Destructive delete only for user templates | MP-009 | preserved | spec.md Scenario 4, FR-009 | yes | Builtin/ambiguous delete allowed |
| Builtin copy naming | MP-010 | preserved | spec.md Scenario 3, CA-010 | yes | Copy ids/names collide or confuse |
| Discoverable schema-aligned field guide | MP-011 | in_scope | spec.md Workflow Template Field Guide | yes | Agent relies on undocumented/stale knowledge |
| Do not mutate protected non-workflow state | MP-012 | preserved | spec.md Out Of Scope, CA-002 | yes | Writes outside cc-jiangxia workflow template config |
| Linear-only first scope | MP-013 | preserved | spec.md Out Of Scope, field guide | yes | Unsupported shapes added without product decision |
| Do not mutate session snapshots | MP-014 | preserved | spec.md FR-013, CA-005 | yes | Template update migrates active session state |
| Reuse registry/API validation/persistence | MP-015 | preserved | spec.md FR-005, NFR-004 | yes | Separate validator drifts |
| Live evidence outranks stale cognition | MP-016 | preserved | spec.md Boundary Constraints, references | yes | Downstream relies on cognition only |
| Option A selected | MP-017 | preserved | spec.md Approach Comparison | yes | Option B/C replaces direct tool |
| No-write diagnostics for invalid/risky/stale/ambiguous/denied operations | MP-018 | in_scope | spec.md Edge Cases, NFR-001 | yes | Partial writes or opaque errors occur |
| Settings compatibility after reload/refetch | MP-019 | in_scope | spec.md FR-011, semantic term decision | yes | Tool writes to separate invisible store |
| Auditable transcript results | MP-020 | in_scope | spec.md FR-012, CA-006 | yes | Tool returns generic success/failure |
| Desktop-server-backed path decision | MP-021 | deferred | spec.md Deferred Scope | yes | Runtime path cannot preserve registry/API behavior |
| Field-guide implementation source | MP-022 | deferred | spec.md Deferred Scope | yes | Guide can drift from validation |

## Deferred Or Dropped Intent

- MP-021 is deferred to `/sp.plan`: decide runtime write path for desktop-launched sessions. This is not dropped.
- MP-022 is deferred to `/sp.plan`: decide field-guide source of truth. This is not dropped.
- No upstream capability-like signal was dropped.

## Out-Of-Scope Conflicts

Upstream Signal: User initially referenced modifying `agent-development`.  
Source: user example and MP-003/MP-007.  
Spec Disposition: narrowed to copy-then-edit for builtin templates.  
Reason: repository evidence and user-confirmed decision preserve builtin templates as read-only mutation targets.  
User Confirmation: yes, Q-005.  
Reopen Trigger: user explicitly requests direct builtin mutation and accepts conflict with existing protection.

Upstream Signal: "实时更新" for Settings Workflows.  
Source: user request and MP-019.  
Spec Disposition: same-store persistence visible after reload/refetch; no live push subscription required.  
Reason: handoff and current UI evidence define Settings compatibility through registry/API refetch behavior.  
User Confirmation: yes, confirmed handoff and section approval.  
Reopen Trigger: user explicitly requires an already-open Settings view to update without refresh/refetch.

## Must-Preserve Coverage

- Coverage Status: live-evidence-backed; project cognition stale/blocked during discussion and fresh/query-ready during specify intake, advisory only
- Planning Gate Status: ready-for-specify-user-confirmed
- Hard Unknown Count: 0
- Open Conflict Count: 0

| MP | Coverage Disposition | Artifact Mapping | Notes |
| --- | --- | --- | --- |
| MP-001 | mapped | spec.md Goal And Users | Primary objective |
| MP-002 | mapped | spec.md Scenario 1 | Create path |
| MP-003 | mapped | spec.md Scenario 2/3 | Update and builtin copy |
| MP-004 | mapped | spec.md Capability Decomposition | Full operation surface |
| MP-005 | resolved | spec.md Locked Decisions | Direct writes |
| MP-006 | resolved | spec.md FR-001/FR-014 | Global but gated |
| MP-007 | resolved | spec.md Scenario 3 | Builtin copy |
| MP-008 | resolved | spec.md Safety rules | Stale protection |
| MP-009 | resolved | spec.md Scenario 4 | Destructive delete |
| MP-010 | resolved | spec.md CA-010 | Copy naming |
| MP-011 | mapped | spec.md Field Guide | Guide required |
| MP-012 | mapped | spec.md Out Of Scope | Protected state |
| MP-013 | mapped | spec.md Out Of Scope | Unsupported shapes |
| MP-014 | mapped | spec.md FR-013 | Snapshot safety |
| MP-015 | mapped | spec.md NFR-004 | Validation reuse |
| MP-016 | mapped | context.md Repository Context | Evidence rule |
| MP-017 | resolved | spec.md Approach Comparison | Option A |
| MP-018 | mapped | spec.md NFR-001 | No-write failures |
| MP-019 | resolved | spec.md FR-011 | Settings compatibility |
| MP-020 | mapped | spec.md FR-012 | Transcript audit |
| MP-021 | deferred | spec.md Deferred Scope | Plan phase |
| MP-022 | deferred | spec.md Deferred Scope | Plan phase |

## Consequence Completeness

- Gate status: ready
- Resolved or mapped `CA-###` obligations: CA-001 through CA-011 are preserved in spec.md and context.md.
- Unresolved planning blockers: none.
- Force-carried risks: desktop runtime path and field-guide source-of-truth are plan-phase design choices with explicit reopen triggers.
- Required next workflow after user review: `/sp.plan`.

## Readiness Decision

**Decision**: Aligned: ready for plan

**Reason**:
The artifact package preserves all upstream MP and CA obligations, records semantic narrowing explicitly, carries two soft design choices to plan, and has no hard unknowns or open conflicts. The user approved the section structure and invoked `$sp-plan` after the written artifact review request.
