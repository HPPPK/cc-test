# Feature Specification: Workflow Phase Execution Contracts

**Feature Branch**: `009-specify-discussions-workflows`
**Created**: 2026-06-12
**Status**: User review requested
**Input**: `.specify/discussions/workflows/handoff-to-specify.md`

## Overview

### Feature Goal

Make cc-jiangxia workflows behave as phase execution contracts, not only prose templates. A workflow phase must define its intent, execution boundaries, completion evidence, transition authority, recommended skills, dependency status, and runtime state behavior in a way that the runtime, editor UI, import/export flow, and downstream plans can preserve consistently.

This specification is a canonical product contract. Live repository reads show that parts of this behavior already exist. Those existing pieces are baseline evidence for planning, not proof that the feature is complete.

### Intended Users and Value

- **Workflow authors** define phases that clearly state what the agent should do, what it may not do, what artifacts/evidence are required, and which existing skills are especially relevant.
- **Workflow runners** can see whether a phase is running, blocked, unable, pending confirmation, completed, stale, or missing its source template, and can act safely.
- **Workflow importers** can inspect referenced skill dependencies before committing an imported workflow.
- **Agents** receive phase context that distinguishes guidance, policy, evidence, and gates, including recommended skills that should be considered when relevant without bypassing normal SkillTool safety.

## Confirmed Scope

### In Scope

- Grouped phase semantics: `intent`, `contract`, `evidencePolicy`, and session-owned `runtimeState`.
- Compatibility-first mapping from existing flat workflow fields into grouped semantics before any direct persistence migration.
- Constraint strength semantics: guidance, policy, evidence, and gate.
- Recommended phase skill bindings to existing skills from the shared skill catalog, with source/provenance where needed.
- Soft audit for recommended skills used or clearly relevant but skipped/unavailable.
- Workflow package sharing with template data plus skill dependency manifest, not bundled skill package contents by default.
- Import preview and runtime diagnostics for available, missing, ambiguous, unsupported-source, plugin-disabled, installable, or invalid recommended skills.
- Lifecycle and completion submission model that separates phase/session status from completion attempt outcomes.
- Runtime/editor UI behavior for grouped authoring, dependency diagnostics, recommended skill status/evidence, pending confirmation, manual completion, retry, and authority labels.
- Compatibility and validation expectations across old templates, unknown fields, session snapshots, stateVersion, transition history, resume, compaction, and final reports.

### Out Of Scope

- A full workflow execution engine or scheduler.
- Default auto-execution of recommended phase skills.
- Default hard gates for recommended phase skills.
- Bundling arbitrary skill package contents into workflow exports.
- Direct destructive migration from flat persisted fields to grouped persisted fields.
- Treating plugin identity as the primary phase binding target. Plugins remain provenance/dependency for plugin-provided skills.
- Session-level cancel/resume implementation details beyond preserving their separation from phase completion controls.

### Deferred Or Future Scope

- Required phase skills as narrow quality gates with explicit invoke/skip evidence.
- Reviewed bundle mode for project-owned skills, with security review and visible file list.
- Direct grouped persistence after import/export validation, old-template fixtures, and migration tests exist.
- Richer runtime status layout decisions such as tabs, expandable details, or compact strips per viewport.
- Explicit session-level cancel/resume recovery flows.

## Must-Preserve Discussion Inputs

- **Source**: `.specify/discussions/workflows/handoff-to-specify.md`
- **JSON Source**: `.specify/discussions/workflows/handoff-to-specify.json`
- **Coverage Status**: live-evidence-backed discussion handoff with project-cognition availability gap
- **Planning Gate Status**: ready-for-specify-user-confirmed

### Mapped Must-Preserve Items

- `MP-001`: Preserve workflows as phase execution contracts, not cosmetic editor grouping or phase skill hints.
- `MP-002`: Preserve one unified feature boundary covering grouped fields, constraints, phase skills, sharing, lifecycle, UI, compatibility, and validation.
- `MP-003`: Preserve `intent`, `contract`, `evidencePolicy`, and session-owned `runtimeState`; do not make runtime state editable template data.
- `MP-004`: Preserve guidance, policy, evidence, and gate strengths with sparse hard gates.
- `MP-005`: Preserve recommended phase skills as bindings to existing skills, not plugins, and keep them soft by default.
- `MP-006`: Preserve bounded soft audit for used or clearly relevant skipped/unavailable recommended skills.
- `MP-007`: Preserve workflow package sharing as template plus dependency manifest, not default bundled skill contents.
- `MP-008`: Preserve lifecycle status separate from completion submission status.
- `MP-009`: Preserve pending confirmation as Confirm/Reject/Retry only, with duplicate ready submissions blocked.
- `MP-010`: Preserve safe runtime controls: pending confirmation controls, manual completion override, blocked/unable retry, auto-advance label, and session-level cancel/resume separation.
- `MP-011`: Preserve compatibility-first field adaptation before direct grouped persistence migration.
- `MP-012`: Preserve non-goals around scheduler, auto-execution, default required skill gates, arbitrary skill bundles, and destructive migration.
- `MP-013`: Preserve live repository evidence as the proof surface while project cognition remains partial/stale for this area.

### Discussion Conflicts

No open out-of-scope conflict remains. Deferred scope is user-confirmed by the handoff and has reopen triggers.

## Scenarios And Usage Paths

### Primary Scenario - Author A Phase Contract

A workflow author edits a workflow template phase and can distinguish the phase purpose from its execution contract and completion proof.

**Usage Path**:
1. The author opens a workflow template in the desktop workflow editor.
2. The editor presents editable Intent, Contract, and Evidence sections for the selected phase.
3. The author selects recommended skills from the shared skill catalog and sets completion criteria, required artifacts, transition authority, and evidence expectations.
4. The saved template preserves unknown fields and remains compatible with existing flat field data.

**Acceptance Signals**:
- Intent fields do not appear as hard blockers by default.
- Contract/evidence fields are visibly distinct from runtime status.
- Recommended skills preserve name plus source/provenance when needed.
- Save/validate behavior keeps old-template compatibility and unknown-field preservation.

### Secondary Scenario - Run A Phase With Recommended Skills

An agent runs a workflow phase and receives recommended skills as advisory phase context without automatic execution or permission bypass.

**Usage Path**:
1. A workflow session starts and snapshots the selected template and recommended phase skill resolutions.
2. The active phase prompt includes grouped phase context, required artifacts, completion rules, transition authority, and recommended skill status.
3. The agent invokes a recommended skill only when the current task matches the skill and normal SkillTool checks allow it.
4. Phase completion records evidence and, when relevant, skill usage or skip/unavailable rationale.

**Acceptance Signals**:
- Recommended skills are stronger than ordinary prose but remain advisory.
- Recommended skills do not grant tools, change model/effort, fork agents, open shells, install hooks, or invoke SkillTool automatically.
- Missing/degraded skills stay visible in runtime status and evidence.

### Secondary Scenario - Share And Import A Workflow

A user exports a workflow and another user imports it in a different environment.

**Usage Path**:
1. Export produces workflow template data and a skill dependency manifest.
2. The receiver previews the import.
3. The preview reports dependency diagnostics for recommended skills.
4. Missing recommended skills do not block import by default, but invalid references block selectable import.
5. Imported workflows retain unresolved references and show degraded state until resolved.

**Acceptance Signals**:
- Exported JSON does not include arbitrary skill package contents.
- Import preview shows available, missing, ambiguous, unsupported-source, plugin-disabled, installable, and invalid dependency states.
- Missing recommended skills are warnings; invalid references are errors.

### Secondary Scenario - Complete, Reject, Or Retry A Phase

A running phase reaches completion or cannot complete under its current contract.

**Usage Path**:
1. The agent submits `ready`, `blocked`, or `unable` with phase id, stateVersion, handoff, rationale, and evidence.
2. `ready` either auto-advances when authority allows or creates pending confirmation.
3. Pending confirmation exposes Confirm, Reject, and Retry only.
4. `blocked` and `unable` remain recoverable inside `running` with reason/evidence and Retry.
5. Transition history and artifact lifecycle record every decision.

**Acceptance Signals**:
- Duplicate ready submissions are blocked while confirmation is pending.
- Stale UI actions are protected by stateVersion.
- `failed` is reserved for runtime/system failure, not ordinary unable-to-complete outcomes.
- Artifact evidence remains read-only in runtime/status views.

## Capability Decomposition

### Capability Map

- **Capability 1: Phase Contract Field Model**
  Supports authoring, runtime prompt assembly, validation, import/export, and future migration.
  Depends on current workflow template schema and compatibility adapter rules.
  Delivery note: core.

- **Capability 2: Constraint Semantics**
  Defines guidance, policy, evidence, and gate behavior so workflows constrain execution without making every field a hard block.
  Depends on phase prompt, action policy, completion criteria, required artifacts, and transition authority.
  Delivery note: core.

- **Capability 3: Recommended Phase Skill Bindings**
  Connects phases to existing skills from the shared catalog with bounded soft audit and preserved SkillTool semantics.
  Depends on skill catalog, phase skill resolver, SkillTool, skill loader, and prompt assembly.
  Delivery note: core.

- **Capability 4: Dependency-Aware Sharing**
  Exports template data plus dependency manifest and previews import diagnostics.
  Depends on workflow template API, validation, resolver, desktop import/export dialog, and catalog resolution.
  Delivery note: enabling.

- **Capability 5: Lifecycle And Completion Model**
  Separates lifecycle state from completion attempt status, preserves pending confirmation, and records transitions/evidence.
  Depends on workflow session state, completion tool, transition controls, artifact lifecycle, and final report handling.
  Delivery note: core.

- **Capability 6: Runtime And Editor UI**
  Presents grouped authoring, dependency diagnostics, runtime status, recommended skill evidence, and safe controls.
  Depends on desktop workflow editor, import/export dialog, status panel, transition controls, active session strip, and accessibility labels.
  Delivery note: user-facing.

- **Capability 7: Compatibility And Validation Coverage**
  Protects old templates, unknown fields, session snapshots, stateVersion, import/export behavior, and UI controls with tests.
  Depends on same-area server and desktop tests plus quality gates.
  Delivery note: validation-oriented.

### Capability Relationships

- Capabilities 1 and 2 define the contract language that Capabilities 3, 4, 5, and 6 must use.
- Capability 3 must not bypass SkillTool permissions or lifecycle semantics from Capability 5.
- Capability 4 depends on Capability 3 reference identity and diagnostics.
- Capability 6 must reflect Capabilities 1 through 5 without inventing stronger behavior than the runtime supports.
- Capability 7 is required before any implementation can be treated as PR-ready.

## Requirements

### Functional Requirements

- **FR-001**: Workflow phases MUST expose grouped semantics for intent, contract, and evidence policy, even when current persistence remains flat.
- **FR-002**: Runtime state MUST remain session-owned and MUST NOT be editable template configuration.
- **FR-003**: Existing flat phase fields MUST map into grouped semantics without destructive migration in first scope.
- **FR-004**: Constraint behavior MUST distinguish guidance, policy, evidence, and gate.
- **FR-005**: Hard gates MUST remain limited to explainable, evidence-backed conditions such as required artifacts, completion criteria, transition authority, and explicit user confirmation.
- **FR-006**: Phase recommended skills MUST reference existing skills as the primary capability target.
- **FR-007**: Plugin identity MUST be preserved only as source/provenance/dependency metadata when a selected skill comes from a plugin.
- **FR-008**: Recommended phase skills MUST be advisory by default and MUST NOT auto-execute or block completion by default.
- **FR-009**: Recommended phase skill prompt/runtime semantics MUST tell the agent to pay special attention to selected phase skills, invoke them when relevant, and skip them when irrelevant.
- **FR-010**: Recommended phase skill use, relevant skip, and unavailable states MUST be auditable when materially relevant to phase completion.
- **FR-011**: Soft audit MUST avoid mechanically listing every recommended skill as unused or not relevant.
- **FR-012**: Skill references MUST support names-first storage and source/provenance qualifiers for ambiguity or portability.
- **FR-013**: Workflow export MUST include a dependency manifest for referenced recommended skills and MUST NOT bundle arbitrary skill package contents by default.
- **FR-014**: Workflow import preview MUST report dependency diagnostics before commit.
- **FR-015**: Missing recommended phase skills MUST allow import with warnings while preserving the unresolved reference.
- **FR-016**: Invalid skill references MUST be validation errors that can block import or template validity.
- **FR-017**: Session creation MUST snapshot template identity and recommended phase skill resolution/provenance enough to explain active and resumed runs.
- **FR-018**: Runtime prompt assembly MUST include phase contract context, completion evidence expectations, required artifacts, transition authority, and recommended skill status when applicable.
- **FR-019**: Completion submissions MUST require phaseId, stateVersion, status, handoff, rationale, and evidence.
- **FR-020**: Completion submission statuses MUST be `ready`, `blocked`, and `unable`.
- **FR-021**: `blocked` and `unable` MUST keep the phase recoverable inside `running` unless the runtime/system itself failed.
- **FR-022**: `pending-confirmation` MUST block duplicate ready submissions until Confirm, Reject, or Retry resolves it.
- **FR-023**: Transition actions MUST record stateVersion and transition history for stale-action protection and audit.
- **FR-024**: Pending confirmation UI MUST expose Confirm, Reject, and Retry only.
- **FR-025**: Manual completion MUST be a separate user override with summary/evidence and MUST NOT be confused with confirming an agent-ready submission.
- **FR-026**: Blocked/unable UI MUST show reason/evidence and Retry, and MUST NOT expose advancement controls.
- **FR-027**: Auto-advance MUST appear as an authority/status label, not a phase completion button in first scope.
- **FR-028**: Stale-template and missing-template states MUST keep session snapshots authoritative and surface warnings instead of silently replacing behavior.
- **FR-029**: Final reports and workflow artifacts MUST preserve completion evidence, transition provenance, and materially relevant recommended skill audit.
- **FR-030**: Template validation, authoring, duplicate/update, import/export, and session start paths MUST validate recommended skill references and preserve diagnostics.

### Non-Functional Requirements

- **NFR-001**: Security-sensitive skill effects such as tools, shell behavior, hooks, forked agents, model changes, and effort changes MUST keep existing SkillTool permission semantics explicit.
- **NFR-002**: Unknown fields in workflow templates and skill references MUST be preserved unless a validation error explicitly rejects them.
- **NFR-003**: User-facing status, dependency, and blocked/unable states MUST be perceivable without relying on color alone.
- **NFR-004**: Runtime diagnostics MUST be actionable enough to explain missing, ambiguous, disabled, invalid, stale, or unsupported references.
- **NFR-005**: New implementation work MUST include same-area tests and run the relevant local quality gates before PR readiness.
- **NFR-006**: Evidence and provenance MUST survive resume, compaction, final report generation, and import/export boundaries.

### Boundary Constraints

- This spec does not authorize implementation work. It prepares `/sp.plan`.
- Project cognition is currently `review` / `partial_refresh` for this area; map output navigates, but live repository evidence proves.
- Existing code already includes some workflow contract behavior; planning must classify work as existing, incomplete, missing, or hardening instead of treating the whole spec as greenfield.
- The Settings skill UI is not the integration boundary. The shared skill catalog/API/resolver is the integration boundary consumed by Settings and workflow authoring.

## Acceptance Proof

### Acceptance Signals

- A planner can map every capability to owning server, runtime, SkillTool, API, desktop UI, and test surfaces.
- The specification makes no silent scope reduction from the handoff.
- Recommended skills are stronger than ordinary prompt prose but do not imply auto-execution, default hard gates, or permission bypass.
- Import/export behavior preserves dependency references without bundling arbitrary skill contents.
- Lifecycle and completion semantics keep blocked/unable recoverable and pending confirmation protected.
- UI requirements prevent unsafe advancement controls in pending, blocked, unable, stale, and missing-template states.

### Measurable Success Criteria

- **SC-001**: Same-area server tests prove template validation, phase skill resolution, export/import dependency diagnostics, session snapshotting, completion submissions, pending conflict behavior, and transition history.
- **SC-002**: Same-area desktop tests prove grouped editor behavior, skill selector provenance, dependency diagnostics, recommended skill status/evidence, pending confirmation controls, manual completion, blocked/unable retry, and stale/missing-template hiding of controls.
- **SC-003**: Old-template fixtures prove existing flat fields and unknown fields remain compatible after any implementation changes.
- **SC-004**: A local PR gate such as `bun run verify`, plus narrower `bun run check:server` and `bun run check:desktop` when implementation occurs, passes or reports explicit blockers.

## Decision Capture

### Locked Decisions

- Use Approach 1: canonical product contract with existing implemented behavior treated as baseline evidence.
- Keep the handoff as one unified workflow contract feature.
- Use grouped product semantics while preserving flat-field compatibility first.
- Keep recommended skills soft by default.
- Bind workflow phase skills to skills, not plugins.
- Share workflows as template plus dependency manifest by default.
- Keep lifecycle status and completion attempt status separate.
- Treat pending confirmation as a real blocking state.
- Keep manual completion, retry, auto-advance labels, and session-level cancel/resume semantically separate.

### User-Confirmed Deferrals

- Full scheduler/execution engine -> reopen if workflow phases need independent queued/background orchestration.
- Auto-executing recommended skills -> reopen if the user explicitly requests runtime-driven skill execution.
- Required skill gates -> reopen for narrow quality-gate phases with invoke/skip evidence.
- Arbitrary skill bundle export -> reopen only with security review and user-visible contents.
- Direct grouped persistence migration -> reopen after old-template fixtures, import/export validation, and migration tests exist.
- Session-level cancel/resume details -> reopen when the product designs lifecycle/recovery controls.

### Canonical References

- `.specify/discussions/workflows/handoff-to-specify.md`
- `.specify/discussions/workflows/handoff-to-specify.json`
- `.specify/discussions/workflows/requirements.md`
- `.specify/discussions/workflows/open-questions.md`
- `.specify/discussions/workflows/technical-options.md`
- `.specify/discussions/workflows/project-context.md`
- Live repository reads listed in `context.md` and `references.md`

## Semantic Term Decisions

- **workflow**: cc-jiangxia product workflow templates and workflow sessions, not GitHub Actions or only Spec Kit command flow.
- **phase execution contract**: the combination of intent, allowed/forbidden behavior, required outputs, completion evidence, handoff, transition authority, lifecycle behavior, and recommended skill audit.
- **real skill / usable skill**: an existing skill capability that can be discovered and invoked through SkillTool semantics, including its own permission, model, effort, context, tools, assets, and support files.
- **recommended phase skill**: a phase-local advisory binding to an existing skill, selected in the phase definition and emphasized when relevant.
- **priority / higher priority**: stronger phase-context attention and candidate relevance, not safety override, forced execution, fixed user-visible sorting, or permission bypass.
- **completion**: a versioned submission of `ready`, `blocked`, or `unable` with handoff, rationale, and evidence, followed by transition authority handling.
- **authoring workflow / create/scaffold**: workflow template creation and editing through API/tool/UI surfaces, not manual static template copy as the only route.

## Consequence Analysis

The Senior Consequence Analysis Gate is triggered because this feature affects lifecycle operations, running sessions, shared skill/catalog state, import/export compatibility, permission-sensitive SkillTool behavior, and user-visible transition controls.

### Lifecycle And State Behavior

- `CA-001`: Skill bindings across local, bundled, plugin, managed, and MCP sources must carry stable identity/provenance and avoid duplicate-name ambiguity.
- `CA-002`: Priority semantics must never override system, developer, security, or explicit user safety boundaries.
- `CA-003`: Missing, stale, disabled, invalid, ambiguous, plugin-disabled, unsupported-source, or unavailable skills must degrade visibly with diagnostics.
- `CA-004`: Skill-derived tools, shell expansion, hooks, forked agents, model changes, and effort changes must keep permission handling explicit.
- `CA-005`: Running, pending, completed, resumed, stale-template, and missing-template sessions must preserve skill provenance or a clear snapshot/resolution record.
- `CA-006`: Used/skipped/unavailable recommended skill decisions must be observable when relevant.
- `CA-007`: Workflow skill bindings must be validated across authoring, import/export, duplicate/update, and session start.
- `CA-008`: UI labels and affordances must distinguish recommended, unavailable, blocked, unable, pending, manual, auto, stale, and missing states.
- `CA-009`: Skill evidence, completion evidence, and transition provenance must survive compaction, resume, final reports, and imports.
- `CA-010`: Recursive or unbounded nested skill invocation must remain prevented, especially if future modes introduce auto or required invocation.

### Recovery And Validation

- Rollback must be possible by keeping flat field compatibility and unknown-field preservation until migration is explicitly planned.
- Retry must supersede pending evidence without advancing the phase.
- Import must reject invalid dependency references but allow missing recommended dependencies with warnings.
- Resume must prefer session snapshot/provenance over silently changed source templates.
- Validation evidence must include server, desktop, import/export, old-template, and transition-control tests.

## Risks And Gaps

### Planning Risks

- Current repository behavior has already implemented some handoff elements, so planning must avoid duplicate work and focus on gaps/hardening.
- Project cognition coverage for product workflow runtime/editor surfaces is weak; live reads must remain authoritative.
- The exact storage boundary for skill audit, completion evidence, and final report provenance may still need implementation design.
- Direct grouped persistence migration is tempting but explicitly deferred until fixtures and validation are ready.

### Information Gaps

- Exact UI copy/layout remains an implementation/design decision.
- Exact future required-skill mode remains deferred.
- Exact session-level cancel/resume recovery contract remains deferred.
