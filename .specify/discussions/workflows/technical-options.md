# Technical Options: Workflows

## Current Technical Reading

The user's premise is supported by live repository evidence.

- Existing skills are not only static descriptions. `SkillTool` can invoke a skill by name, insert skill content into the conversation, run a forked sub-agent when the skill uses `context: fork`, and carry `allowed-tools`, `model`, and `effort` effects forward in the tool context.
- Existing skill packages can include supporting scripts, assets, examples, references, and agent prompts in addition to `SKILL.md`.
- Existing workflow `skillDeclarations` are not equivalent to those skills. Workflow runtime stores and renders them as guidance. `workflowToolPolicy` explicitly states that workflow skill declarations are prompt-level guidance only and do not enable `SkillTool` globally.
- Settings already has a skill management surface backed by `/api/skills` and `useSkillStore`. Plugin detail can open plugin-provided skills through the same skill detail flow.
- The frontend skill type includes `user`, `project`, `plugin`, `mcp`, and `bundled`, while the current server API primarily enumerates `user`, `project`, and `plugin`. A shared workflow source policy needs to account for that gap.

## Phase Skill Positioning

The useful distinction is:

- **Skill**: the reusable capability package. It can be discovered, explicitly invoked, carry metadata, include supporting files, and influence tool/model/agent behavior according to its own contract.
- **Workflow phase skill**: the phase-local relationship to that capability. It should answer: why this skill matters in this phase, whether it is required or recommended, when it should be used, how it interacts with phase completion, and what evidence is needed if it is skipped.

This means a phase skill should not duplicate the skill's full instructions or assets. It should bind the phase to a skill identity plus usage policy.

## Option 1: Phase Skills As Recommended Defaults

Workflow templates declare preferred skills for a phase. The selected phase skills are fixed in the phase definition. The runtime surfaces them in active phase context so the agent pays special attention to them when deciding whether a skill applies, but does not block completion if they are not invoked.

- Product behavior: The user gets phase-aware skill preference without hidden execution or hard blocking. The agent sees "these skills matter here" as a first-class phase signal.
- Complexity: Medium-low. Validation, prompt assembly, skill surfacing, and candidate priority matter more than lifecycle enforcement.
- Risk: If there is no evidence or UI signal, recommended skills may feel like ordinary prompt guidance.
- Verification: Tests for template validation, prompt assembly, skill surfacing/candidate priority, missing references, and no false completion blocks.
- Status: selected as first positioning.
- Evidence mode: selected bounded soft audit. Record used recommended skills and clearly relevant skipped/unavailable skills with concise rationale, without blocking completion by default. Do not list every recommended skill mechanically.
- First effect surface: selected active phase prompt emphasis plus SkillTool awareness. Recommended phase skills should be easier for the agent to notice and select because the phase explicitly says to focus on them when relevant.
- Accepted prompt semantics: selected for active phase; pay special attention when deciding whether a skill applies; invoke when current task matches; do not invoke when irrelevant; soft-audit used or clearly relevant skipped/unavailable skills at completion.
- Binding schema refinement: do not duplicate skill-owned reason/appliesWhen metadata. The phase should reference selected skills and rely on each skill's own description/applicability.
- Source/export refinement: skills can come from managed, user, project/add-dir, plugin, bundled, and MCP sources. Workflow export currently exports template JSON, not skill package contents.

## Option 2: Phase Skills As Completion Contracts

Workflow templates declare phase skill bindings with stable IDs and priority. Required phase skills must be invoked, or intentionally skipped with rationale and evidence, before phase completion.

- Product behavior: Stronger quality control for verification, security, release, or review phases.
- Complexity: Medium. It extends validation, prompt assembly, workflow state/provenance, and completion checks.
- Risk: Too heavy as the default because many phase-skill relationships are contextual rather than mandatory.
- Verification: Tests for required skill evidence, skip rationale, missing skill references, and phase completion gating.
- Status: keep as special-case extension, not primary positioning.

## Option 3: Phase Skills As Capability Set

Workflow templates declare the allowed/preferred capability set for a phase. Skills can shape available tools, agents, model/effort, and phase behaviors under a policy resolver.

- Product behavior: Most expressive. Workflows become real executable process definitions rather than templates.
- Complexity: Very high. This is closer to a workflow engine and capability scheduler than a template enhancement.
- Risk: Broad blast radius across templates, sessions, tool pool assembly, permission policy, desktop management UI, and multi-agent behavior.
- Verification: Requires broader E2E and migration coverage.
- Recommendation: Keep as long-term direction, not the immediate shape unless the user wants workflows to become the central orchestration engine.

## Current Recommendation

Treat phase skill as a recommended binding/policy layer over existing skills. Start with recommended-first semantics:

- `recommended`: elevated in phase context and skill selection, but not completion-gated.
- `required`: reserved for later or narrow quality-gate phases where skipped/invoked evidence is mandatory.
- `audit`: bounded soft evidence at phase completion records recommended skill use or relevant skip/unavailable rationale, not as a hard gate or exhaustive checklist.
- `prompt_emphasis`: fixed phase recommended skills are surfaced in active phase prompt/tool guidance as skills to focus on when relevant.
- `binding_schema`: simplified; should carry skill identity/reference, not duplicated rationale or appliesWhen fields. Names are acceptable by default; qualified source can be used on ambiguity or portability needs.
- `export_policy`: open; likely should preserve references plus dependency metadata rather than bundle skill package contents by default.
- `source_catalog`: workflow authoring should draw selectable skills from the shared capability catalog behind Settings > Skills and plugin capability navigation, rather than inventing a separate workflow-specific skill inventory.
- `binding_target`: confirmed as skill. Plugins are not the primary workflow binding target; they are dependency/provenance for plugin-provided skills.

## Execution Constraint System Field Model

Reopened discussion on 2026-06-11 selected option 1: workflows as an execution constraint system.

The recommended field model is to separate **phase intent** from **phase contract**.

### Phase Intent Fields

Intent fields help the agent understand what the phase is for. They guide behavior, but should not be treated as hard machine gates by default.

- `id`: stable phase identifier.
- `label` / `name`: human-readable phase name.
- `role`: the operating stance for the agent in this phase.
- `instructions`: freeform phase instructions.
- `phasePrompt.objective`: concise objective for the phase.
- `requestedModel`: optional model preference.
- `skills`: recommended phase skill references.

### Phase Contract Fields

Contract fields define what the phase may do, must produce, must prove, and how it may advance.

- `phasePrompt.handoffInput`: what this phase must receive or reconstruct before working.
- `phasePrompt.executionRules`: local execution rules for the phase.
- `actionPolicy.allowedActions`: allowed action categories.
- `actionPolicy.forbiddenActions`: forbidden action categories.
- `requiredArtifacts`: named outputs the phase must produce.
- `completionCriteria`: acceptance criteria for treating the phase as ready, blocked, or unable.
- `phasePrompt.completionRules`: stop rules and completion-specific constraints.
- `transitionAuthority`: whether completion can auto-advance or requires user confirmation.
- `CompletionSubmission.evidence`: evidence required when the agent claims readiness/blockage.
- `CompletionSubmission.handoff`: structured handoff payload for the next phase.
- `WorkflowPhaseSkillEvidence`: soft audit for recommended skills used or clearly relevant but skipped/unavailable.

### Constraint Strengths

Not every field should be a hard blocker. The recommended model uses four strengths:

- `guidance`: influences behavior but does not block. Example: role, objective, general instructions.
- `policy`: constrains what the agent may do. Example: forbidden actions, allowed actions.
- `evidence`: requires the agent to report proof before phase completion. Example: completion evidence, artifact pointers, skill audit.
- `gate`: blocks phase transition until satisfied or explicitly skipped by a stronger authority. Example: required artifacts, required completion criteria, user-confirmation transition.

### Product Recommendation

The first-class workflow value should be the phase contract:

- a phase has explicit inputs,
- explicit allowed and forbidden behavior,
- explicit required outputs,
- explicit completion evidence,
- explicit handoff payload,
- explicit transition authority.

This keeps workflows from becoming only a template editor. Templates remain the authoring format, but runtime value comes from enforcing and auditing the phase contract.

### Best-Effective Design Assessment

This is the recommended **most effective first design**, not the theoretical maximum workflow-engine design.

The design is best for the current product shape because it uses the workflow structures already present in the system while giving them sharper runtime meaning:

- phase intent remains readable and authorable by humans,
- phase contract becomes the durable execution boundary,
- completion evidence and transition authority create real control points,
- recommended skills stay useful without becoming brittle mandatory automation,
- hard gates are reserved for artifacts, completion criteria, and user/authority transitions.

Rejected stronger alternatives for first scope:

- **Make every field severity-typed**: too much authoring friction and validation complexity for limited first-version gain.
- **Make workflows a full execution engine**: expressive, but too large a blast radius across tool permissions, skill invocation, session resume, import/export, and UI.
- **Make all constraints hard gates**: looks rigorous but will produce false blocks because many workflow instructions are contextual judgment, not machine-verifiable facts.

The effective rule is: use hard gates only where the product can clearly explain the blocked state to the user and the runtime can validate or request authority. Everything else should be guidance, policy, or evidence.

### Current Project Evidence

- `src/server/services/workflowTypes.ts` already defines `WorkflowPhaseDefinition` with `instructions`, `skills`, `skillDeclarations`, `requiredArtifacts`, `completionCriteria`, `transitionAuthority`, `actionPolicy`, and `phasePrompt`.
- `src/server/services/workflowRuntimeService.ts` already assembles the active phase prompt from phase instructions, `phasePrompt`, action policy, recommended skills, required artifacts, completion criteria, prior artifacts, skill guidance, and model selection.
- `src/server/services/workflowToolPolicy.ts` exposes `submit_phase_completion` as the workflow-only tool and requires phaseId, stateVersion, status, handoff, rationale, and evidence.
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx` already exposes many corresponding authoring fields: objective, intake, recommended skills, output artifact, handoff, execution rules, completion criteria, transition authority, and requested model.

### Open Design Point

The next decision is whether first-scope field design should keep constraints soft-by-default, with hard gates only for required artifacts/completion/transition, or introduce explicit per-field severity such as `advisory | required | blocking`.

### Recommended Schema Grouping

Decision refined on 2026-06-11: use grouped semantics as the product and runtime model, while keeping a compatibility adapter for existing flat fields.

The recommended grouping is:

```json
{
  "schemaVersion": 1,
  "id": "feature-delivery",
  "displayName": "Feature Delivery",
  "description": "Plan, implement, verify, and hand off a scoped feature.",
  "phases": [
    {
      "id": "implementation",
      "label": "Implementation",
      "intent": {
        "role": "executor",
        "objective": "Implement the scoped change according to the accepted plan.",
        "instructions": "Keep edits scoped and follow repository conventions.",
        "requestedModel": "optional-model-id",
        "recommendedSkills": [
          {
            "name": "tdd-workflow",
            "source": "optional-source-hint",
            "required": false
          }
        ]
      },
      "contract": {
        "handoffInput": [
          "Accepted requirements or prior phase handoff",
          "Known constraints and non-goals"
        ],
        "executionRules": [
          "Read relevant code before editing",
          "Do not expand scope without user confirmation"
        ],
        "actionPolicy": {
          "allowedActions": ["read-code", "edit-code", "run-tests"],
          "forbiddenActions": ["destructive-git-reset", "secret-exposure"]
        },
        "requiredArtifacts": [
          {
            "id": "implementation-summary",
            "kind": "markdown",
            "description": "Files changed, behavior changed, and verification run"
          }
        ],
        "completionCriteria": [
          {
            "id": "tests-pass",
            "description": "Relevant checks pass or blockers are explicitly documented",
            "gate": true
          }
        ],
        "completionRules": [
          "Submit completion only after evidence exists",
          "If blocked, submit blocked status with concrete blocker and recovery path"
        ],
        "transitionAuthority": "user-confirmation"
      },
      "evidencePolicy": {
        "requiredSubmissionFields": ["handoff", "rationale", "evidence"],
        "artifactEvidence": "required-for-required-artifacts",
        "skillAudit": "used-or-relevant-skipped",
        "missingDependencyBehavior": "warn-and-carry-reference"
      }
    }
  ]
}
```

Field meaning:

- `intent`: what the phase is trying to accomplish. It guides the agent and UI, but should not block completion by itself.
- `contract`: what the phase must receive, may do, must avoid, must produce, must prove, and who can advance it.
- `evidencePolicy`: what proof must be supplied at completion. This keeps completion evidence explicit without turning every instruction into a hard gate.
- `runtimeState`: should remain session-owned, not template-owned. It records active phase, state version, pending confirmation, completion submission, artifact references, transition history, skill audit, and blocked/completed status.

Compatibility recommendation:

- First implementation can keep existing flat storage fields and map them into the grouped model in runtime/editor code.
- New UI should present the grouped model even if persistence is still flat.
- Future schema migration can persist `intent`, `contract`, and `evidencePolicy` directly once import/export, validation, and old-template fixtures are covered.

This avoids a breaking persistence migration while still making the product model clean enough for prompt assembly, UI grouping, validation, and future handoff/spec work.

## Settings-Backed Skill Reference Model

Workflow authoring can reference skills from the same current available skill catalog the user already sees in Settings.

- Product behavior: Users select phase skills from a familiar list of available skills and plugin-provided skills, instead of typing unknown names or managing a separate workflow skill list.
- Architecture rule: Reuse the underlying catalog/API/resolver, not the Settings React component. Settings and workflow authoring should be two consumers of a shared source of truth.
- Reference shape: store the skill name plus source hint and optional plugin name when needed. Bare name remains acceptable when unambiguous.
- Binding target: the stored phase capability is the skill reference. If the skill comes from a plugin, the plugin name/marketplace/scope can be dependency metadata.
- Import/export impact: exported workflows carry references from this catalog as dependencies. On another machine, import resolves those references against that user's catalog and reports missing or ambiguous dependencies.
- Open gap: current Settings server API may not expose every skill source modeled by the frontend or available to the runtime, especially MCP/bundled/managed-style sources. The shared catalog should be aligned before treating the settings list as the complete workflow source.

## Skill Source And Export Options

### Option A: References Plus Dependency Manifest

Export workflow templates with their phase skill references plus a dependency manifest that lists referenced skill names, optional source hints, and resolution status at export time. Import validates availability and reports missing or ambiguous skills.

- Product behavior: Portable enough to understand dependencies without copying user/plugin/MCP skill content.
- Risk: Imported workflow may need the user to install missing skills.
- Recommendation: Best default, now refined as the proposed sharing model.
- Sharing behavior: produce a workflow package that contains `workflow.json` plus a dependency manifest for phase skills. The manifest is diagnostic metadata, not a copy of arbitrary skill package contents.
- Import behavior: show dependency status before commit: available, missing, ambiguous, unsupported-source, or installable when a known installer/source exists.

### Option B: Strict Local Validation Only

Allow phase skills only when they resolve in the current environment. Export includes names only. Import warns or errors if the target environment lacks them.

- Product behavior: Simple.
- Risk: Poor portability; exported workflow can look complete but fail later.
- Recommendation: Too weak unless export is explicitly local-only.

### Option C: Bundle Skills Into Workflow Export

Export copies skill package contents with the workflow.

- Product behavior: Most portable.
- Risk: High. Skills can include scripts, assets, hooks, shell expansion, plugin/MCP references, licensing/provenance, and sensitive/local paths.
- Recommendation: Do not make default. Consider future explicit "bundle project-owned skills" mode only with security review and a user-visible file list.

## Proposed Shareable Workflow Package

When a user wants to share a workflow with someone else, the first-class artifact should be a workflow package rather than a raw template export.

- `workflow template`: the workflow phases, transitions, prompts, completion criteria, and fixed phase skill references.
- `skill dependency manifest`: the referenced skill names, optional source hints, export-time resolution status, provenance such as project/bundled/plugin/MCP/user/managed when known, and whether the dependency is expected to be portable.
- `import preview`: a receiver-facing diagnostic step that shows which referenced skills resolve locally, which do not, and which names are ambiguous.
- `degraded run behavior`: if a phase skill is missing after import, the phase keeps the reference and reports the skill as unavailable; it does not silently delete the binding or pretend the skill is present.
- `optional future bundle`: only reviewed project-owned skills can be bundled, and only when explicitly selected.

Leave full automatic execution or capability-graph scheduling as later extensions after the recommended binding model is proven.

## Missing Skill Import Policy

The cleanest default is to separate import validity from runtime capability availability.

- Import validity: a shared workflow with missing recommended phase skills can still be imported if the template schema is valid and the missing dependencies are reported.
- Import preview: dependency status should show available, missing, ambiguous, unsupported-source, or installable.
- Persisted state: missing skill references remain in the workflow template/session snapshot; they are not silently removed.
- Runtime behavior: active phase prompt marks missing phase skills as unavailable, so the agent does not pretend they can be invoked.
- Completion behavior: for recommended phase skills, missing skills do not block completion; if clearly relevant, they can be mentioned in the soft audit as unavailable.
- Future stricter mode: required/contract phase skills can later block phase start/completion or require explicit skip evidence, but that should not be the default for recommended phase skills.

## UI And Interaction Options

### Recommended: Phase-Local Skill Selector In Workflow Template Editor

Replace the current advanced freeform phase `skills` textarea with a compact selector backed by the shared skill catalog.

- Product behavior: users select recommended skills while editing the phase that will use them.
- Interaction: selected phase shows a "Recommended skills" row/list with chips; add button opens searchable catalog grouped by source; selected skills show name, source, availability, and plugin provenance when relevant.
- Why it fits: current `WorkflowTemplateEditor` already has selected-phase editing and a skills field; this upgrades an existing affordance instead of creating a separate management concept.
- Validation: unresolved/missing/ambiguous skills are shown inline on the phase and included in save/import diagnostics.

### Supporting Surface: Workflow-Level Dependency Summary

Add a read-only dependency summary in workflow manager/import/export.

- Product behavior: users can understand the whole workflow's skill dependencies before sharing or importing.
- Interaction: template rows or detail panels can show counts such as 4 skills, 1 missing, 1 plugin-provided; import preview lists dependency status per template.
- Why supporting only: authoring belongs at phase level because skill relevance is phase-specific.

### Runtime Surface: Active Phase Skill Status

Show recommended phase skills in active workflow status only as a concise status strip or expandable section.

- Product behavior: users can see why the agent may focus on certain skills and whether any selected phase skill is unavailable.
- Interaction: display used/relevant-unavailable evidence at phase completion; avoid listing every recommended skill as a noisy checklist.

### Confirmed UI Grouping For Constraint Fields

Decision refined on 2026-06-11: the workflow authoring and runtime UI should mirror the grouped field model, but separate template authoring from session status.

Recommended editor structure:

- **Intent**: phase name, role, objective, instructions, requested model, recommended skills.
- **Contract**: required intake, execution rules, allowed/forbidden actions, required artifacts, completion criteria, completion rules, transition authority.
- **Evidence**: required completion submission fields, artifact evidence expectations, skill audit policy, missing dependency behavior.
- **Runtime Status**: visible in running workflow/session views, not as editable template data. Shows active phase, pending confirmation, blocked/completed status, produced artifacts, transition history, and skill audit.

Interaction recommendation:

- Template editor should use tabs or stacked sections for Intent, Contract, and Evidence.
- Runtime view should use a compact status area for Runtime Status and expand only when there is a warning, blocked state, pending confirmation, missing dependency, or completion evidence.
- Required/gated fields should use clear state labels such as required, missing, blocked, ready, or needs confirmation.
- Recommended or guidance fields should not look like validation blockers.

This keeps authoring understandable while preventing the common schema mistake of storing runtime lifecycle data inside the template definition.

## Recommended Phase Lifecycle Model

Decision refined on 2026-06-11: keep the lifecycle model simple, session-owned, and aligned with the current workflow runtime vocabulary.

The key distinction:

- Phase/session status describes the lifecycle of the workflow run.
- Completion submission status describes one attempt to finish the phase.

Recommended lifecycle states:

| State | Scope | Meaning | Allowed next actions |
| --- | --- | --- | --- |
| `created` | workflow and phase | Session or phase exists but is not actively executing yet. | Start first phase or activate when previous phase completes. |
| `running` | workflow and active phase | The active phase is doing work. It can also carry `blockedReason` when the last completion attempt was `blocked` or `unable`. | Continue work, submit completion, retry after blocked evidence, cancel. |
| `pending-confirmation` | workflow and active phase | Agent or system says the phase is ready, but transition authority requires user confirmation. | User confirms, rejects, or retries. New ready submissions should be blocked until pending confirmation is resolved. |
| `completed` | workflow and phase | Phase or whole workflow has accepted completion evidence and transition/result is recorded. | Advance to next phase, generate final report, inspect artifacts. No ordinary rework without an explicit new/recovery flow. |
| `failed` | workflow and phase | Runtime/system failure, corrupted state, or unrecoverable execution failure. This should not be used for normal "agent cannot complete" cases. | Recovery/resume flow, inspect error, or end run. |
| `cancelled` | workflow and phase | User/system intentionally stopped the run. | Inspect history or start a new run; no silent resume. |
| `resumed` | workflow and phase event/status marker | A recovery/resume event occurred. It should usually be shown as an event or badge, then return to the restored operational state. | Continue from restored `running`, `pending-confirmation`, or terminal state. |
| `stale-template` | workflow/session source status | Source template changed after the session snapshot. Snapshot remains authoritative. | Continue with warning, optionally start a new run from the updated template. |
| `missing-template` | workflow/session source status | Source template is no longer available. Snapshot remains authoritative if present. | Continue from snapshot with warning, export/report diagnostics. |

Recommended completion submission statuses:

| Submission status | Meaning | Runtime effect |
| --- | --- | --- |
| `ready` | The phase claims it has met completion criteria and includes handoff/evidence. | Auto-advance when authority allows, otherwise enter `pending-confirmation`. |
| `blocked` | The phase cannot pass completion criteria yet, but work can continue if the blocker is resolved. | Stay `running`, record `blockedReason`, notify user, allow retry. |
| `unable` | The phase cannot complete under the current contract or available information. | Stay `running` with a stronger blocked/user-direction signal, record evidence, and require user or downstream decision. |

Recommended product rules:

- Do not introduce long-lived `blocked` as a separate phase status in first scope. Model it as `running` plus `blockedReason`, failed completion check, and user-visible warning.
- Do not treat `unable` as `failed`. `failed` is for runtime/system failure; `unable` is an agent/completion judgment.
- `pending-confirmation` is a real blocking state. It prevents duplicate ready submissions and asks the user to confirm, reject, or retry.
- `stateVersion` should protect completion submissions and transition actions from stale UI/session state.
- `transitionHistory` should record every confirmation, rejection, retry, auto-advance, cancellation, resume, stale-template, and missing-template decision.
- Session snapshots stay authoritative for active runs. Template source changes should produce `stale-template` or `missing-template` warnings, not silent behavior changes.

## Recommended Runtime UI Controls

Decision refined on 2026-06-11: first-scope phase controls should cover phase completion/transition authority only. Session stop/recovery controls should remain separate.

Current live evidence supports this split:

- `desktop/src/types/session.ts` models phase transition actions as `confirm`, `reject`, `retry`, and `manual_complete`.
- `desktop/src/components/workflow/WorkflowTransitionControls.tsx` already prioritizes pending confirmation controls, sends `stateVersion`, and treats manual completion as a separate dialog.
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx` displays pending confirmation above stale lifecycle signals and keeps artifact evidence/details separate.
- `desktop/src/pages/ActiveSession.tsx` wires transition controls through the active session strip and hides controls for completed, stale-template, and missing-template status.

Recommended control matrix:

| Runtime condition | Primary UI state | Controls | Authority label | Notes |
| --- | --- | --- | --- | --- |
| `pending-confirmation` or `pendingConfirmation=true` | Waiting for confirmation | `Confirm`, `Reject`, `Retry` | `User confirmation required` | Highest priority. Do not show manual completion here. Controls must carry `stateVersion` and transition id when available. |
| `running` + `transitionAuthority=user-confirmation` + no pending/blocker | Working phase with manual override available | `Manually complete phase` opens a dialog, then `Confirm completion` | `Manual user completion` | This is user takeover, not agent-ready confirmation. Keep it visually secondary or in an advanced action area. |
| `running` + `blockedStatus=blocked` or `blockedReason` | Blocked but recoverable | `Retry` | `Completion blocked` | Show blocker reason and evidence. Do not show `Confirm`, `Reject`, or `Complete phase`. |
| `running` + `blockedStatus=unable` | Unable under current contract | `Retry` plus visible need-for-user-direction language | `Unable to complete` | Stronger than blocked, but still not runtime failed. Avoid advancement controls until user changes context or retries. |
| `running` + `transitionAuthority=auto` | Agent can auto-advance after ready evidence | No manual phase controls by default | `Auto advance` | Show authority label and transition history. Avoid a tempting manual button unless an explicit override feature is added. |
| `completed` | Terminal success | No phase controls | `Completed` | Show final report/artifacts only. |
| `failed` | Runtime/system failure | Recovery/session controls only | `Runtime failure` | Do not reuse phase retry unless recovery semantics are defined. |
| `cancelled` | Terminal stop | No phase controls | `Cancelled` | Resume should require an explicit session recovery design, not implicit phase retry. |
| `stale-template` or `missing-template` | Source warning | No phase transition controls | `Snapshot run` | Show warning and snapshot provenance. Continue behavior should be explicit and evidence-backed. |

Recommended labels:

- `Confirm`: approve the pending agent/system ready submission and advance or finish.
- `Reject`: reject the pending submission and return the phase to running.
- `Retry`: supersede pending evidence or re-run/re-attempt current phase completion without advancing.
- `Manually complete phase`: user starts an override path while the phase is running and user-confirmation authority applies.
- `Confirm completion`: final button inside the manual-completion dialog after summary/evidence is provided.
- `Auto advance`: status/authority label, not a button.
- `Cancel workflow`: session-level destructive/terminal action, not a phase transition control.
- `Resume workflow`: session-level recovery action, not a phase transition control.

UI rule: controls should describe the authority source, not just the action. The user should be able to tell whether the phase is waiting for agent-ready confirmation, manual user completion, auto-advance, recovery, or cancellation.

## Confirmed New Handoff Boundary

Decision confirmed on 2026-06-11: if the user asks to carry this discussion into `sp-specify`, the handoff should be a refreshed unified workflow contract handoff, not a narrow update to the older phase-skill-only handoff.

Recommended handoff goal:

> Specify workflows as phase execution contracts in cc-jiangxia, including grouped phase fields, soft-by-default constraint semantics, recommended phase skill bindings, dependency-aware sharing, lifecycle/completion status rules, and runtime/editor UI behavior.

Recommended capability map:

1. **Phase contract field model**
   - Define grouped semantics: `intent`, `contract`, `evidencePolicy`, and session-owned `runtimeState`.
   - Preserve compatibility with existing flat fields through an adapter before any direct persistence migration.

2. **Constraint semantics**
   - Use guidance, policy, evidence, and gate strengths.
   - Keep hard gates sparse: required artifacts, completion criteria, transition authority, and explicit user confirmation.

3. **Recommended phase skills**
   - Bind phases to existing skills from the shared skill catalog.
   - Keep recommended skills soft by default, with bounded evidence for used or clearly relevant skipped/unavailable skills.
   - Export references plus dependency manifest, not arbitrary skill package contents.

4. **Lifecycle and completion model**
   - Separate phase/session lifecycle from completion submission outcome.
   - Treat `ready`, `blocked`, and `unable` as submission outcomes.
   - Keep `blocked` and `unable` recoverable inside `running`; reserve `failed` for runtime/system failure.

5. **Runtime and authoring UI**
   - Template editor groups editable fields as Intent, Contract, and Evidence.
   - Runtime views show Status separately.
   - Pending confirmation exposes Confirm/Reject/Retry.
   - Manual completion is an explicit user override with summary/evidence.
   - Blocked/unable shows Retry only.
   - Auto-advance is a status/authority label; cancel/resume are session-level controls.

6. **Validation and compatibility**
   - Validate old templates and imported workflow packages.
   - Preserve unknown fields and session snapshots.
   - Add old-template fixtures before direct schema migration.
   - Protect transition actions with `stateVersion` and transition history.

Recommended deferred scope:

- Full workflow execution engine or scheduler.
- Auto-executing recommended skills.
- Required skill hard gates except narrow future quality-gate phases.
- Bundling arbitrary skill package contents into workflow exports.
- Direct destructive migration from flat persisted fields to grouped persisted fields.
- Session-level cancel/resume implementation details beyond preserving them as separate lifecycle/recovery controls.

Recommended sequencing:

1. Define field/adapter contract and validation behavior.
2. Update runtime prompt/completion evidence semantics.
3. Update template editor grouping and runtime status/control UI.
4. Add dependency-aware import/export diagnostics for phase skills.
5. Add lifecycle, old-template, import/export, and UI regression coverage.

This should be one coherent handoff because splitting schema, runtime lifecycle, and UI controls would create drift between what a workflow author defines, what the agent sees, and what the user can approve.

## Senior Consequence Analysis

### Affected Object Map

- Skill catalog entries: local, bundled, plugin, managed, and MCP skills loaded as prompt commands.
- Skill metadata: allowed tools, model, effort, context=fork, agent, hooks, shell expansion, user invocability, and disable-model-invocation.
- SkillTool invocation records and context modifiers.
- Workflow templates: phase definitions, skillDeclarations, phasePrompt, actionPolicy, requiredArtifacts, completionCriteria, and transitionAuthority.
- Workflow session state: template snapshots, active phase, phase skill provenance, pending confirmations, stateVersion, transition records, final reports, stale-template and missing-template handling.
- Workflow runtime prompt assembly and phase start/transition behavior.
- Workflow-scoped tools and tool pool assembly.
- Workflow template authoring and validation APIs.
- Desktop workflow authoring and status surfaces if UI exposure is included later.
- Downstream users of workflow artifacts, final reports, and resumed sessions.

### State-Behavior Matrix

- created: resolve declared workflow skills before phase work begins; record unresolved references as validation or start warnings.
- running: required skills must be loaded, invoked, or explicitly skipped according to the selected execution contract.
- pending-confirmation: preserve evidence of which workflow skills shaped the phase handoff before user approval.
- failed: distinguish phase failure from skill resolution or skill execution failure.
- cancelled: stop pending workflow skill execution or mark it cancelled with no retry.
- completed: final report should preserve workflow skill provenance when it affected outputs.
- resumed: reload or verify skill bindings from the session snapshot, not silently from changed live skill definitions unless an upgrade policy exists.
- stale-template: avoid silently replacing session skill bindings with newer template skill bindings.
- missing-template: preserve snapshot skill bindings if available and report missing source template separately.

### Dependency Impact Table

- `src/tools/SkillTool/SkillTool.ts`: existing executable skill mechanism; changes here affect invocation, permission, model, effort, nested/forked behavior, and audit.
- `src/skills/loadSkillsDir.ts`: skill metadata and prompt loading; changes here affect every skill source and shell/hook safety.
- `src/server/services/workflowTypes.ts`: workflow schema contract; new skill binding fields must preserve compatibility and unknown-field behavior.
- `src/server/services/workflowRuntimeService.ts`: phase prompt and lifecycle assembly; likely owner for required skill evidence and provenance.
- `src/server/services/workflowToolPolicy.ts`: current policy says skillDeclarations are prompt-level only; this is the semantic boundary to revise if workflows gain real skill capability.
- `src/tools.ts`: tool pool and workflow-scoped tools; changes here can alter which tools are available inside workflow sessions.
- `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx`: authoring validation and mutation path; needs validation support if workflow skill bindings become first-class.

### Recovery And Validation Contract

- Define a stable workflow skill binding schema before implementation.
- Validate skill references on create, update, duplicate, import, and session start.
- Preserve session snapshots so running/resumed workflows do not silently change when source skills change.
- Record evidence for required skill loaded, invoked, skipped, failed, missing, or stale states.
- Gate phase completion when required skill evidence is missing, if the selected execution contract requires enforcement.
- Keep permission prompts explicit for any skill-derived allowed tools, shell behavior, hooks, forked agents, or model changes.
- Add regression coverage for workflow prompt assembly, tool policy, template validation, lifecycle states, stale/missing skill behavior, and resume/compaction.

### Coverage Gaps

- Project cognition is stale/blocked. Continue with live evidence for discussion, but carry the map-quality gap until handoff or implementation planning.
- The product decision between auto-invocation and explicit required invocation is unresolved.
- The exact priority model is unresolved: required, recommended, advisory, preloaded, auto-run, or completion-gated.

### Consequence Obligations

- CA-001: Define stable workflow skill binding identity across local, bundled, plugin, managed, and MCP sources. Owner workflow: sp-discussion -> sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if a handoff lacks source and version semantics.
- CA-002: Define priority precedence without overriding system, developer, security, or explicit user safety boundaries. Owner workflow: sp-discussion -> sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if "higher priority" is vague or implies unsafe override.
- CA-003: Define behavior for missing, stale, disabled, invalid, or unavailable workflow skills. Owner workflow: sp-discussion -> sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if missing skills silently degrade to plain prompt text.
- CA-004: Preserve explicit permission handling for skill-derived tools, shell expansion, hooks, forked agents, model changes, and effort changes. Owner workflow: sp-specify -> sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if workflow skill execution bypasses existing SkillTool permission semantics.
- CA-005: Snapshot or otherwise preserve workflow skill provenance for running, pending, completed, resumed, stale-template, and missing-template sessions. Owner workflow: sp-specify -> sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if source skill edits can silently change an active session.
- CA-006: Make workflow skill execution observable to the user and downstream artifacts. Owner workflow: sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if required skills can run or be skipped without visible evidence.
- CA-007: Validate workflow skill bindings in workflow template authoring and import/export paths. Owner workflow: sp-specify -> sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if invalid references can be persisted without diagnostics.
- CA-008: Define UI requirements if users can author or inspect workflow skill bindings. Owner workflow: sp-discussion -> sp-specify. Latest resolve phase: specification. Status: pending. Stop-and-reopen: if UI-facing authoring is included but state and affordances are unspecified.
- CA-009: Preserve workflow skill evidence through compaction and resume. Owner workflow: sp-specify -> sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if compaction drops the skill provenance required for later phase decisions.
- CA-010: Prevent recursive or unbounded nested skill invocation. Owner workflow: sp-specify -> sp-plan. Latest resolve phase: planning. Status: pending. Stop-and-reopen: if auto-invocation or required invocation lacks depth, loop, or retry limits.
