# Handoff To sp-specify: Workflow Phase Execution Contracts

- discussion_slug: workflows
- drafted_at: 2026-06-11T19:24:46.7549232+08:00
- handoff_goal: Specify workflows as phase execution contracts in cc-jiangxia, including grouped phase fields, soft-by-default constraint semantics, recommended phase skill bindings, dependency-aware sharing, lifecycle/completion status rules, and runtime/editor UI behavior.
- handoff_status: handoff-ready
- quality_gate.status: user_confirmed
- user_review_required: true
- user_confirmed_at: 2026-06-11T19:51:05.4206521+08:00

## Context Boundary

- current_project_root: `F:\github\cc-jiangxia`
- target_project_root: `F:\github\cc-jiangxia`
- path_status: user-confirmed
- boundary_confidence: medium
- reference_projects: none
- external_systems: none
- boundary_unknowns: none blocking

### Current Project Roles

- role: discussion-host
  - scope: Stores this `sp-discussion` session and durable artifacts.
  - evidence_source: current working directory and `.specify/discussions/workflows/`
  - notes: The active repository is the discussion host.
- role: product-context
  - scope: `cc-jiangxia` workflow product direction, workflow runtime, desktop UI, and skill/capability semantics.
  - evidence_source: user-confirmed workflow discussion decisions and live repository reads in `project-context.md`
  - notes: The reopened discussion refreshes an older phase-skill-only handoff into a unified workflow contract handoff.

### Target Project Roles

- role: implementation-target
  - scope: `cc-jiangxia` workflow template, validation, runtime, import/export, skill catalog/reference, session lifecycle, and desktop workflow UI surfaces.
  - evidence_source: user-confirmed target boundary and live reads in `project-context.md`
  - notes: Current project cognition is unavailable/stale for the latest pass; live repository evidence is authoritative for this draft.

## Implementation Target

Target the existing workflow, skill, and desktop surfaces in `F:\github\cc-jiangxia`.

Likely target paths to verify during specification/planning:

- `src/server/services/workflowTypes.ts`
- `src/server/services/workflowTemplateValidation.ts`
- `src/server/services/workflowRuntimeService.ts`
- `src/server/services/workflowToolPolicy.ts`
- `src/server/services/workflowTemplateRegistryService.ts`
- `src/server/services/workflowSessionCreateService.ts`
- `src/server/api/workflowTemplates.ts`
- `src/server/api/skills.ts`
- `src/skills/loadSkillsDir.ts`
- `src/tools/SkillTool/SkillTool.ts`
- `src/tools/SkillTool/prompt.ts`
- `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx`
- `desktop/src/types/skill.ts`
- `desktop/src/types/session.ts`
- `desktop/src/api/skills.ts`
- `desktop/src/api/sessions.ts`
- `desktop/src/stores/skillStore.ts`
- `desktop/src/components/skills/SkillList.tsx`
- `desktop/src/components/plugins/PluginDetail.tsx`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- `desktop/src/components/workflow/WorkflowTemplateManager.tsx`
- `desktop/src/components/workflow/WorkflowTemplatePicker.tsx`
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`
- `desktop/src/components/workflow/WorkflowTransitionControls.tsx`
- same-area tests under `src/server/services/*.test.ts`, `desktop/src/__tests__/`, and `desktop/src/components/workflow/*.test.tsx`

Target paths still to verify:

- Whether a shared skill catalog/resolver should be extracted from `src/server/api/skills.ts` and `src/skills/loadSkillsDir.ts`.
- Whether grouped workflow fields are persisted directly in first scope or mapped from existing flat fields through an adapter.
- Whether active workflow runtime evidence belongs in session state, `phaseRuns`, artifacts, final report records, or a combination.
- Whether broader managed/bundled/MCP skill sources can be aligned in first scope or should be carried as explicit dependency statuses.

Current project cognition status: unavailable/stale for latest runtime UI pass. Treat project cognition as advisory only; prove implementation facts with live code before changing behavior.

## Source Evidence

- source_type: live-code
  - evidence_status: proved
  - source: `src/tools/SkillTool/prompt.ts`
  - claim: Matching skills are treated as important invocation requirements by the existing Skill tool prompt.
- source_type: live-code
  - evidence_status: proved
  - source: `src/tools/SkillTool/SkillTool.ts`
  - claim: Existing skills can be invoked by name and may affect allowed tools, model, effort, inline context, or forked execution.
- source_type: live-code
  - evidence_status: proved
  - source: `src/skills/loadSkillsDir.ts`
  - claim: Runtime skill sources include broader origins than current workflow template skill validation, including plugin, managed, bundled, and MCP.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/services/workflowTypes.ts`
  - claim: Workflow types already define lifecycle statuses, phase statuses, completion submission statuses, phase fields, required artifacts, completion criteria, transition authority, action policy, and phase prompt.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/services/workflowRuntimeService.ts`
  - claim: Runtime prompt assembly already includes phase instructions, phase prompt, action policy, recommended skills, required artifacts, completion criteria, prior artifacts, skill guidance, and model resolution. Ready submissions can auto-advance or enter pending confirmation; non-ready submissions remain running with blocked evidence.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/services/workflowToolPolicy.ts`
  - claim: `submit_phase_completion` is the workflow-scoped completion tool and requires phaseId, stateVersion, status, handoff, rationale, and evidence; current recommended phase skills do not grant tool permissions.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/services/workflowTemplateValidation.ts`
  - claim: Current phase `skills` normalization allows objects with `name`, limited source values, optional `reason`, and unknown fields.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/services/workflowTemplateRegistryService.ts`
  - claim: Unknown fields are preserved during workflow template writes, which supports compatibility-aware evolution.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/api/workflowTemplates.ts`
  - claim: Current workflow export emits template JSON and does not bundle external skill packages.
- source_type: live-code
  - evidence_status: proved
  - source: `src/server/api/skills.ts`, `desktop/src/api/skills.ts`, `desktop/src/stores/skillStore.ts`
  - claim: Settings > Skills is backed by a skills API and desktop skill store, but current server collection primarily covers user/project/plugin skills.
- source_type: live-code
  - evidence_status: proved
  - source: `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
  - claim: Current workflow template editor exposes many phase contract fields and currently edits phase skills through an advanced freeform textarea.
- source_type: live-code
  - evidence_status: proved
  - source: `desktop/src/components/workflow/WorkflowTransitionControls.tsx`
  - claim: Current runtime controls already distinguish pending confirmation, manual completion with summary/evidence, and retry behavior.
- source_type: live-code
  - evidence_status: proved
  - source: `desktop/src/components/workflow/WorkflowStatusPanel.tsx`
  - claim: Runtime UI gives pending confirmation display priority and separates artifact/history detail from status summary.
- source_type: live-code
  - evidence_status: proved
  - source: `desktop/src/pages/ActiveSession.tsx`
  - claim: Active session UI wires workflow status and transition controls and hides controls for completed/stale/missing-template sessions.
- source_type: live-code
  - evidence_status: proved
  - source: `desktop/src/components/workflow/WorkflowComponents.test.tsx`
  - claim: Existing tests cover pending confirmation controls, state-version/idempotent transition context, manual completion evidence, pending-over-stale priority, and no unsafe advancement controls for blocked/unable states.
- source_type: user-confirmation
  - evidence_status: confirmed
  - source: `requirements.md`, `open-questions.md`, `discussion-log.md`
  - claim: User confirmed the unified workflow contract handoff boundary.
- source_type: project-cognition
  - evidence_status: degraded
  - source: `project-context.md`
  - claim: Project cognition was stale/blocked earlier and unavailable during the latest runtime UI controls pass. Live repository evidence must be rechecked during specification/planning.

## Blocking Unknowns

No hard unknown blocks specification.

Soft unknowns to carry:

- owner: downstream-contract
  - latest_resolve_phase: specification
  - unknown: Exact stable skill reference schema across user/project/plugin/managed/bundled/MCP sources.
  - stop_and_reopen_condition: Reopen discussion if a proposed schema cannot represent source/provenance or duplicate names without silent ambiguity.
- owner: downstream-contract
  - latest_resolve_phase: specification
  - unknown: Exact adapter boundary between existing flat workflow fields and grouped `intent`/`contract`/`evidencePolicy` semantics.
  - stop_and_reopen_condition: Reopen if the plan requires destructive template migration without old-template fixtures and migration tests.
- owner: downstream-contract
  - latest_resolve_phase: planning
  - unknown: Exact storage location for runtime evidence, phase skill audit, and final report provenance.
  - stop_and_reopen_condition: Reopen if runtime evidence can be lost across resume, compaction, or final report generation.
- owner: downstream-contract
  - latest_resolve_phase: specification
  - unknown: Exact UI copy/layout for grouped editor sections and runtime authority labels.
  - stop_and_reopen_condition: Reopen if UI exposes recommended/guidance fields as hard blockers or mixes manual completion with pending confirmation.
- owner: evidence
  - latest_resolve_phase: planning
  - unknown: Project cognition runtime availability.
  - stop_and_reopen_condition: Reopen or refresh evidence if project cognition becomes available and contradicts live-read assumptions.

## Downstream Instructions

### Settled Decisions

- Workflows should be specified as phase execution contracts.
- Template/product semantics are grouped as `intent`, `contract`, and `evidencePolicy`; `runtimeState` remains session-owned.
- Existing flat fields should be adapted into grouped semantics before any direct persistence migration.
- Constraint strengths are guidance, policy, evidence, and gate.
- Hard gates remain sparse and explainable: required artifacts, completion criteria, transition authority, and explicit user confirmation.
- Recommended phase skills are fixed on each phase, bind to existing skills, and are soft by default.
- Recommended phase skill audit is bounded to used or clearly relevant skipped/unavailable skills.
- Workflow sharing uses template plus skill dependency manifest by default.
- Missing recommended phase skills allow import with warnings and remain visible in preview/runtime.
- Lifecycle status and completion submission status are distinct.
- `blocked` and `unable` are completion outcomes inside recoverable `running`; `failed` is for runtime/system failure.
- `pending-confirmation` resolves through Confirm, Reject, or Retry and blocks duplicate ready submissions.
- Runtime UI: pending confirmation shows Confirm/Reject/Retry; manual completion is a separate user override with summary/evidence; blocked/unable shows Retry only; auto-advance is a label; cancel/resume are session-level controls.

### Capability Map

1. Phase contract field model.
2. Constraint semantics and gate behavior.
3. Recommended phase skill bindings and soft audit.
4. Dependency-aware workflow package sharing.
5. Lifecycle and completion submission state model.
6. Runtime/editor UI grouping and controls.
7. Compatibility, validation, old-template fixtures, and state-version protection.

### Recommended Sequence

1. Define source-compatible field/adapter contract and validation behavior.
2. Define runtime prompt/completion/evidence semantics.
3. Define phase skill reference/dependency manifest behavior.
4. Specify template editor Intent/Contract/Evidence grouping and runtime status/control UI.
5. Specify lifecycle, import/export, old-template, and UI regression coverage.
6. Plan implementation slices only after compatibility and validation rules are explicit.

### Dependencies

- Existing workflow runtime and template schema.
- Existing Skills API/store/catalog behavior.
- Existing SkillTool invocation and permission semantics.
- Existing workflow import/export surfaces.
- Desktop workflow template editor, status panel, and transition controls.

### Deferred Scope

- Full workflow execution engine or scheduler.
- Auto-executing recommended phase skills.
- Default required skill hard gates.
- Bundling arbitrary skill packages into workflow exports.
- Direct destructive persistence migration to grouped fields.
- Session-level cancel/resume implementation details beyond preserving their separation from phase completion controls.

### Reopen Conditions

- A downstream spec treats recommended skills as auto-executed or hard-gated by default.
- A downstream spec stores runtime lifecycle data as editable template configuration.
- A downstream spec collapses `blocked`/`unable` into terminal runtime failure.
- A downstream spec permits duplicate ready submissions while pending confirmation exists.
- A downstream spec silently drops missing phase skill references on import.
- A downstream spec bypasses SkillTool permission/model/tool semantics for workflow-referenced skills.
- A downstream spec omits old-template fixtures or persistence compatibility.

## UI Discussion

- ui_discussion_status: completed
- confirmed_ui_decisions:
  - Template editor exposes editable Intent, Contract, and Evidence groups.
  - Runtime/session views expose Runtime Status separately.
  - Phase skill selection belongs at selected phase level, backed by shared skill catalog.
  - Import/export surfaces show dependency diagnostics as supporting surfaces.
  - Runtime status shows recommended phase skill and unavailable state only when useful.
  - Pending confirmation is the highest-priority runtime UI state.
  - Blocked/unable outcomes show reason/evidence and Retry, without advancement controls.
- deferred_ui_decisions:
  - Exact copy and layout for editor sections.
  - Exact visual treatment for authority labels and dependency warnings.
  - Whether runtime status uses tabs, expandable details, or compact strips in each viewport.
- interaction_expectations:
  - Confirm approves a pending agent/system ready submission.
  - Reject rejects pending evidence and returns to running.
  - Retry supersedes pending evidence or re-attempts completion without advancing.
  - Manually complete phase is a user override and requires summary/evidence.
  - Auto advance is a status label, not a button.
- accessibility_expectations:
  - Controls must have distinct accessible names.
  - Pending confirmation, blocked, unable, and missing dependency states must be perceivable without relying on color alone.
  - Dialogs must have clear labels and focus management.
- ui_sketches_present: false
- ui_sketch_summary: none
- ui_sketch_reference: none

## Must-Preserve Ledger

| ID | Type | Claim | Source | Downstream Requirement | Blocking | Owner | Latest Resolve | Status | Stop And Reopen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MP-001 | goal | Specify workflows as phase execution contracts, not only prose templates or phase skill hints. | user confirmation and `technical-options.md` | Spec goal must center phase contracts with runtime evidence and transition authority. | hard | downstream-contract | specification | mapped | Reopen if workflow contract semantics are reduced to cosmetic editor grouping. |
| MP-002 | scope | Unified scope includes grouped fields, constraints, phase skills, sharing, lifecycle, UI, compatibility, and validation. | OQ-018 user confirmation | Spec must keep these as one coherent feature boundary. | hard | downstream-contract | specification | mapped | Reopen if downstream splits away lifecycle or UI controls and loses consistency. |
| MP-003 | decision | Use `intent`, `contract`, `evidencePolicy`, and session-owned `runtimeState` as grouped semantics. | `technical-options.md` | Spec must define mapping from existing flat fields and future persistence shape. | hard | downstream-contract | specification | mapped | Reopen if runtime state becomes editable template data. |
| MP-004 | decision | Constraints are guidance, policy, evidence, and gate; hard gates stay sparse and explainable. | `technical-options.md` | Spec must distinguish soft guidance from gates and state which fields block transition. | hard | downstream-contract | specification | mapped | Reopen if every instruction becomes a hard machine gate. |
| MP-005 | decision | Recommended phase skills bind to existing skills, not plugins, and are soft by default. | `requirements.md`, OQ-006, OQ-014 | Spec must preserve skill identity/provenance and avoid default auto-execution. | hard | downstream-contract | specification | mapped | Reopen if plugins become the primary binding target or recommended skills auto-run. |
| MP-006 | decision | Soft audit records used or clearly relevant skipped/unavailable recommended skills only. | OQ-007, OQ-008 | Spec must define bounded evidence shape without noisy exhaustive checklisting. | hard | downstream-contract | specification | mapped | Reopen if audit lists every recommended skill mechanically or records nothing. |
| MP-007 | decision | Workflow sharing uses template plus dependency manifest, not bundled arbitrary skill packages by default. | OQ-015 | Spec must include import preview statuses and degraded run behavior for missing dependencies. | hard | downstream-contract | specification | mapped | Reopen if import silently drops missing skill references or export implies bundled skills. |
| MP-008 | decision | Lifecycle status and completion submission outcome are separate. | OQ-016 | Spec must preserve `ready`/`blocked`/`unable` as submission outcomes and lifecycle as session/phase state. | hard | downstream-contract | specification | mapped | Reopen if normal blocked/unable outcomes become terminal runtime failures. |
| MP-009 | decision | Pending confirmation resolves only through confirm, reject, or retry and blocks duplicate ready submissions. | OQ-016, OQ-017, live runtime evidence | Spec must preserve stateVersion protection and pending conflict behavior. | hard | downstream-contract | specification | mapped | Reopen if pending ready submissions can be overwritten silently. |
| MP-010 | decision | Runtime controls distinguish pending confirmation, manual completion, blocked/unable retry, auto-advance label, and session-level cancel/resume. | OQ-017 | Spec UI requirements must prevent unsafe advancement controls in blocked/unable states. | hard | downstream-contract | specification | mapped | Reopen if UI mixes manual completion with pending confirmation or uses auto-advance as a button. |
| MP-011 | tradeoff | First scope is compatibility-aware and should adapt existing flat fields before direct grouped persistence migration. | `technical-options.md` | Planning must include old-template fixtures and migration tests before direct persistence changes. | hard | downstream-contract | planning | mapped | Reopen if implementation requires destructive migration without fixtures. |
| MP-012 | non_goal | Do not build a full workflow execution engine, scheduler, or default auto-executing skill system in this scope. | `requirements.md`, `technical-options.md` | Spec must defer orchestration-engine behavior and required skill gates unless explicitly scoped later. | hard | downstream-contract | specification | mapped | Reopen if feature expands into general scheduler/capability engine. |
| MP-013 | reference | Live repository evidence is authoritative because project cognition was stale/unavailable. | `project-context.md` | Spec/planning must recheck live files and rerun cognition if available before implementation. | soft | evidence | planning | deferred | Reopen if restored cognition contradicts live-read assumptions. |

## Senior Consequence Analysis

### Gate Status

- triggered: yes
- trigger_reason: Workflow contracts affect prompt behavior, skill invocation semantics, tool permissions, template schema, import/export, shared catalog state, session lifecycle, pending confirmations, stale/missing templates, and desktop UI controls.

### Affected Object Map

- Skill catalog entries and skill source metadata for user, project, plugin, managed, bundled, MCP, and unknown sources.
- Skill metadata that can affect tools, model, effort, context fork, agents, hooks, shell expansion, user invocability, and disable-model-invocation.
- SkillTool invocation records and context modifiers.
- Workflow templates, phase definitions, phase prompts, action policies, required artifacts, completion criteria, transition authority, phase skill declarations/references, and unknown fields.
- Workflow template validation and registry persistence.
- Workflow session state, template snapshots, active phase, phase runs, pending confirmations, state versions, transition history, artifact index, final reports, stale-template and missing-template states.
- Workflow runtime prompt assembly and phase transition behavior.
- Workflow-scoped tool policy and `submit_phase_completion`.
- Workflow import/export packages and dependency diagnostics.
- Desktop workflow template editor, manager, import/export dialog, picker, status panel, transition controls, active session strip, and tests.
- Downstream users of workflow artifacts, final reports, resumed sessions, and imported shared workflows.

### State-Behavior Matrix

| State | Required Behavior |
| --- | --- |
| `created` | Resolve/validate template and phase skill references before phase work begins; report unresolved dependencies as diagnostics. |
| `running` | Active phase receives grouped contract context; blocked/unable attempts remain recoverable with reason/evidence and retry path. |
| `pending-confirmation` | Preserve pending evidence and artifact lifecycle; expose Confirm/Reject/Retry only; block duplicate ready submissions. |
| `completed` | Preserve accepted artifacts, phase completion evidence, final report pointers, skill audit, and transition history. |
| `failed` | Reserve for runtime/system failure, not ordinary completion inability; recovery must be explicit. |
| `cancelled` | Treat as terminal stop unless a separate recovery flow is specified; do not silently resume. |
| `resumed` | Treat as an event/status marker; continue from restored lifecycle state and record provenance. |
| `stale-template` | Session snapshot remains authoritative; show warning and do not silently replace behavior. |
| `missing-template` | Continue from snapshot if available and report source template absence separately. |
| imported-with-missing-skills | Import can proceed for recommended skills with warnings, preserved references, and unavailable runtime status. |

### Dependency Impact Table

| Dependency | Impact |
| --- | --- |
| `workflowTypes.ts` | Owns schema/status contracts; changes affect persistence, API shape, and UI expectations. |
| `workflowTemplateValidation.ts` | Must validate grouped/flat compatibility, source values, dependency manifest, old templates, and unknown fields. |
| `workflowTemplateRegistryService.ts` | Must preserve unknown fields and avoid destructive migration. |
| `workflowRuntimeService.ts` | Must assemble grouped prompt context, completion evidence, lifecycle transitions, stateVersion checks, and skill audit. |
| `workflowToolPolicy.ts` | Must preserve workflow-scoped tool behavior and not grant SkillTool permissions implicitly. |
| `workflowTemplates` API | Must export/import dependency metadata and diagnostics without bundling skill contents by default. |
| `skills` API/loaders | Must provide shared catalog/resolution behavior for workflow authoring and import/runtime validation. |
| `SkillTool` | Existing invocation/permission/model semantics must not be bypassed by workflow references. |
| Desktop workflow editor/status controls | Must present grouped fields and safe runtime controls that match lifecycle semantics. |
| Tests and quality gates | Must cover schema compatibility, import/export, lifecycle transitions, UI controls, and old fixtures. |

### Recovery And Validation Contract

- Define stable phase skill reference identity and source/provenance behavior.
- Validate workflow templates on create/update/duplicate/import/session start.
- Preserve session snapshots and unknown fields.
- Record completion evidence, artifact refs, transition history, stateVersion, and skill audit.
- Enforce pending confirmation conflict behavior and stale action protection.
- Keep permission prompts and SkillTool semantics explicit.
- Provide old-template fixtures before direct persistence migration.
- Add server tests for runtime prompt assembly, completion submissions, transition behavior, validation, import/export, stale/missing template behavior, and final report evidence.
- Add desktop tests for Intent/Contract/Evidence grouping, dependency diagnostics, runtime status, Confirm/Reject/Retry, manual completion, blocked/unable controls, and stateVersion/transition id submission.
- Run relevant local gates before PR readiness: `bun run check:server`, `bun run check:desktop`, and `bun run verify` when implementation occurs.

### Coverage Gaps

- Project cognition runtime unavailable/stale: carry as soft evidence gap; rerun if available before implementation planning.
- Exact source universe for shared skill catalog requires specification.
- Exact grouped persistence migration strategy requires planning.
- Exact storage of runtime skill audit and evidence requires specification/planning.
- Exact UI copy/layout requires UI implementation validation.

### Consequence Obligations

- CA-001: Define stable workflow skill binding identity across local, bundled, plugin, managed, and MCP sources. Owner workflow: sp-discussion -> sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if a handoff/spec lacks source and version/provenance semantics.
- CA-002: Define priority precedence without overriding system, developer, security, or explicit user safety boundaries. Owner workflow: sp-discussion -> sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if "higher priority" implies unsafe override.
- CA-003: Define behavior for missing, stale, disabled, invalid, ambiguous, plugin-disabled, unsupported-source, or unavailable workflow skills. Owner workflow: sp-discussion -> sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if missing skills silently degrade to plain prompt text.
- CA-004: Preserve explicit permission handling for skill-derived tools, shell expansion, hooks, forked agents, model changes, and effort changes. Owner workflow: sp-specify -> sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if workflow skill execution bypasses existing SkillTool permission semantics.
- CA-005: Snapshot or otherwise preserve workflow skill provenance for running, pending, completed, resumed, stale-template, and missing-template sessions. Owner workflow: sp-specify -> sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if source skill edits can silently change an active session.
- CA-006: Make workflow skill use and skip/unavailable decisions observable to the user and downstream artifacts. Owner workflow: sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if recommended or future required skills can run or be skipped without visible evidence.
- CA-007: Validate workflow skill bindings in workflow template authoring, import/export, duplicate/update, and session start paths. Owner workflow: sp-specify -> sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if invalid references can persist without diagnostics.
- CA-008: Define UI state labels and affordances for authoring and runtime workflow contracts. Owner workflow: sp-discussion -> sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if UI-facing authoring is included but required/recommended/missing/stale/executed/skipped states are unspecified.
- CA-009: Preserve workflow skill evidence, completion evidence, and transition provenance through compaction, resume, final reports, and imports. Owner workflow: sp-specify -> sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if compaction/resume drops provenance needed for later phase decisions.
- CA-010: Prevent recursive or unbounded nested skill invocation. Owner workflow: sp-specify -> sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if auto-invocation or required invocation is introduced without depth, loop, and retry limits.

## Quality Gate

- status: user_confirmed
- self_reviewed_at: 2026-06-11T19:24:46.7549232+08:00
- user_review_required: true
- user_confirmed_at: 2026-06-11T19:51:05.4206521+08:00
- blocked_reasons: []
- coverage_status: live-evidence-backed discussion handoff with project-cognition availability gap
- planning_gate_status: ready-for-specify-user-confirmed
- hard_unknown_count: 0
- open_conflict_count: 0

## Handoff Self-Review

- Markdown and JSON companions must both exist.
- Shared handoff goal, discussion slug, context boundary, implementation target, quality gate, Must-Preserve IDs, and consequence obligations must match between Markdown and JSON.
- No hard blockers remain.
- User confirmation has been received; this handoff is handoff-ready for downstream `sp-specify` consumption.
