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
