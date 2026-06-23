# Data Model: Workflow Phase Execution Contracts

**Date**: 2026-06-12
**Source**: `plan.md`, `spec.md`, `context.md`, `references.md`, and live repository reads

## Overview

The feature extends existing workflow template and session state rather than creating a new data subsystem. Template data defines authorable phase contracts and recommended skill references. Session data owns runtime state, snapshots, completion submissions, pending confirmation, transition history, artifacts, and final report evidence.

## Workflow Template

### Existing Owner

- Server: `WorkflowTemplate`, `WorkflowPhaseDefinition`, `WorkflowTemplateRegistryTemplate`
- Desktop: `WorkflowTemplateDetail`, `WorkflowTemplateDraft`, `WorkflowTemplatePhase`

### Required Semantics

- `schemaVersion`, `id`, `source`, `version`, `name/displayName`, `description`
- ordered `phases`
- unknown fields preserved unless validation rejects them
- user templates remain compatible with flat fields in first scope

### Validation Rules

- Template id, version, name, and non-empty ordered phases are required.
- Built-in ids cannot be overwritten through user import.
- Old/unknown fields are preserved when import/save paths accept the template.

## Workflow Phase Contract Projection

### Authorable Template Inputs

- `intent`
  - `objective`
  - role/name/instructions/intake where applicable
- `contract`
  - `instructions`
  - `executionRules`
  - `actionPolicy.allowedActions`
  - `actionPolicy.forbiddenActions`
  - `transition.authority`
- `evidencePolicy`
  - `outputArtifact`
  - `requiredArtifacts`
  - `completionCriteria`
  - `handoffRules`
  - relevant skill use/skip/unavailable evidence expectations

### Compatibility Mapping

- Existing flat fields map into grouped semantics without deleting original accepted fields.
- Runtime state is not part of template authoring.
- Direct grouped persistence is deferred until fixtures and migration tests exist.

### Validation Rules

- `outputArtifact` must be first-class and required for prompt-to-contract phases.
- `requiredIntake` and `handoffRules` must define handoff semantics.
- `completionCriteria` must be valid and explicit.
- `transition.authority` must be `auto` or `user-confirmation`.
- Constraint strengths must distinguish guidance, policy, evidence, and gate behavior.

## Workflow Phase Skill Reference

### Fields

- `name`: required, non-empty
- `mode`: optional, normalized to `recommended`
- `source`: optional `user`, `project`, `plugin`, `managed`, `bundled`, `mcp`, or `unknown`
- `pluginName`, `namespace`, `version`, `contentHash`, `referenceId`: optional provenance/disambiguation
- `reason`: optional author guidance
- unknown fields preserved

### Validation Rules

- Empty name is invalid.
- Any mode other than `recommended` is invalid in this scope.
- Invalid references block save/import validity.
- Missing/degraded references can be warnings when importable.

## Workflow Phase Skill Resolution

### Fields

- `reference`
- `status`: `available`, `missing`, `ambiguous`, `unsupported-source`, `plugin-disabled`, `invalid-reference`, or `installable`
- `checkedAt`
- `resolvedSkill`
- `candidates`
- `diagnostic`
- `provenance`

### Resolution Rules

- Match by name plus optional source/provenance qualifiers.
- Return ambiguous when more than one present catalog entry matches.
- Return installable when known installable candidates exist but are not present.
- Return plugin-disabled when a plugin-provided match is disabled.
- Return invalid-reference for empty names or unsupported modes.

## Workflow Skill Dependency Manifest

### Fields

- `schemaVersion`
- `generatedAt`
- `dependencies[]`
  - `templateId`
  - `phaseId`
  - `reference`
  - `exportStatus`
  - optional `resolvedSource`, `pluginName`, `contentHash`, `diagnostic`

### Rules

- Export includes manifest metadata, not arbitrary skill package contents.
- Import preview combines manifest diagnostics with receiver-side resolver diagnostics.
- Invalid references block selectable import.
- Missing, ambiguous, unsupported-source, plugin-disabled, and installable states remain visible diagnostics.

## Workflow Session State

### Existing Owner

- `WorkflowSessionState`
- `WorkflowSessionMetadata`
- Desktop `WorkflowSessionSummary`

### Fields

- `schemaVersion`, `sessionId`, `mode`
- `template` and `templateIdentity`
- `templateSnapshot`
- `sourceTemplateStatus`
- `status` and `workflowStatus`
- `activePhaseId`
- `phases`
- `phaseRuns`
- `phaseSkillSnapshots`
- `pendingConfirmation`
- `transitionHistory`
- `artifactIndex`
- `finalReportRef` / `finalReportPointer`
- `stateVersion`, `revision`
- `createdAt`, `updatedAt`
- optional recovery and unknown fields

### Ownership Rules

- Session state owns runtime status, pending confirmation, artifacts, transitions, snapshots, and evidence.
- Template changes after session start do not silently mutate active session behavior.
- Stale or missing source templates warn while snapshot remains authoritative.

## Workflow Phase State

### Fields

- `id`, `index`, `status`
- `startedAt`, `completedAt`
- requested/actual model metadata
- `skillProvenance`
- `artifactPointers`
- `completion`
- `blockedReason`

### Rules

- Phase status can be created, running, pending-confirmation, failed, cancelled, completed, or resumed.
- `blocked` and `unable` completion submissions keep phase recoverable inside running.
- `failed` is reserved for runtime/system failure.

## Completion Submission

### Fields

- `phaseId`
- `stateVersion`
- `status`: `ready`, `blocked`, or `unable`
- `handoff`
- `rationale`
- `evidence[]`

### Rules

- `phaseId`, `stateVersion`, `status`, `handoff`, `rationale`, and `evidence` are required.
- `phaseId` must match active phase.
- `stateVersion` protects stale UI/tool actions.
- Duplicate ready submissions are blocked while a pending confirmation exists.

## Workflow Pending Confirmation

### Fields

- `confirmationId`
- `phaseId`
- `fromPhaseId`
- `toPhaseId`
- `completionCheckId`
- `artifactRefs`
- `createdAt`
- `status`
- optional `submission`

### Rules

- Pending confirmation exposes Confirm, Reject, and Retry only.
- Confirm accepts pending artifacts and advances or completes.
- Reject marks artifacts rejected and returns phase to running.
- Retry supersedes pending artifacts and returns phase to running.

## Workflow Transition Record

### Fields

- `transitionId`
- `fromStatus`, `toStatus`
- `fromPhaseId`, `toPhaseId`
- `authority`
- `decision`
- `action`
- `result`
- `completionCheckId`
- `artifactRefs`
- `createdAt`
- `stateVersion`
- `requestId`, revision fields

### Rules

- Transitions are append-only audit records.
- Transition ids support idempotency where existing records can be returned as no-op.
- StateVersion is captured on state-changing actions.

## Workflow Phase Skill Evidence

### Fields

- `phaseId`
- `name`
- `outcome`: `used`, `relevant-skipped`, or `relevant-unavailable`
- `rationale`
- `recordedAt`
- optional `source`, `resolutionStatus`, `toolUseId`, `artifactRef`

### Rules

- Evidence is bounded and material. Do not record every unused recommendation mechanically.
- Evidence can appear in completion artifacts, runtime status, and final report when relevant.

## Workflow Final Report

### Fields

- `schemaVersion`, `reportId`, `sessionId`
- template identity
- `phaseSummaries`
- `verificationResult`
- `conversationSummary`
- `artifactRefs`
- optional model resolutions, skill provenance, transition history ref, final status

### Rules

- Accepted phase artifacts and relevant skill audit must survive report generation.
- Final report is read-only evidence after completion.

## State Transitions

| Current State | Event | Next State | Artifact Handling | Notes |
| --- | --- | --- | --- | --- |
| created | start phase | running | none or snapshot refs | Session has stateVersion and template snapshot. |
| running | submit ready with user confirmation | pending-confirmation | pending completion artifact | Duplicate ready submissions are rejected. |
| running | submit ready with auto authority | next running or completed | accepted completion artifact | Only when authority allows. |
| running | submit blocked | running | blocked artifact/evidence | Retry is available; no advancement. |
| running | submit unable | running | unable artifact/evidence | Retry is available; no advancement. |
| pending-confirmation | confirm | next running or completed | pending artifacts accepted | StateVersion advances. |
| pending-confirmation | reject | running | pending artifacts rejected | No advancement. |
| pending-confirmation | retry | running | pending artifacts superseded | No advancement. |
| running | manual_complete | next running or completed | accepted manual artifact | Separate from agent-ready confirmation. |
| any active | stale template detected | stale-template or warning projection | snapshot preserved | Source state warning only. |
| any active | source missing | missing-template or warning projection | snapshot preserved | Session snapshot remains authoritative. |

## Compatibility And Migration

- First scope uses compatibility projection, not destructive grouped persistence.
- Existing flat fields continue to load, validate, export, import, and render.
- Unknown template and skill-reference fields are preserved on accepted save/import paths.
- Old-template fixtures are required before implementation can claim readiness.
- If grouped persistence is later added, it requires an explicit migration plan and tests.

## Validation Matrix

| Path | Required Checks |
| --- | --- |
| Authoring save | template shape, phase contract, recommended skill references, unknown fields |
| Duplicate/update | same as save plus id/source conflict handling |
| Export | selected template exists, manifest generated from resolver results |
| Import preview | template validation, manifest diagnostics, receiver resolver diagnostics, selectable flag |
| Import commit | selected candidates are valid, conflicts handled by add/rename only |
| Session start | template snapshot, phase states, phase skill snapshots, stateVersion initialized |
| Runtime prompt | grouped contract, required artifacts, completion rules, recommended skill status, no auto tool calls |
| Completion submission | required fields, active phase, stateVersion, duplicate pending conflict |
| Transition controls | confirm/reject/retry/manual_complete/retry with stateVersion |
| Final report | accepted evidence, transition provenance, relevant skill audit |

## Open Classifications For Tasks

- Exact grouped projection shape in TypeScript types and API response.
- Exact location for runtime skill audit persistence when not already covered by artifacts.
- Exact final report fields for relevant skill evidence.
- Exact desktop layout/copy for grouped Intent, Contract, Evidence, and Runtime sections.
- Exact existing-vs-hardening test gaps per FR.
