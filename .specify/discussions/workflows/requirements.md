# Requirements: Workflows

## Confirmed Product Intent

- The user wants to discuss "workflows" in a fresh sp-discussion session.
- The discussion should focus on overall direction: what workflows should mean as product and agent capability inside cc-jiangxia before choosing concrete feature or implementation targets.
- The user does not want workflow skill declarations to remain only prompt text. They want workflow-associated skills to become real capability units that can be specified by a workflow, explicitly executed, and/or given higher priority than ordinary phase guidance.
- The user clarified that the immediate question is the positioning of a workflow phase's skill relative to the existing skill system. Existing skills can be passively selected, explicitly invoked, and can include supporting templates, tools, scripts, references, assets, or agents beyond prompt text.
- The user selected recommended-first positioning: phase skills should primarily act as high-weight recommendations for the current phase, not default hard requirements or automatic execution.
- The user selected soft audit evidence for recommended phase skills: usage or relevant skip rationale should be recorded, but should not block completion by default.
- The user selected bounded audit scope: record only recommended phase skills that were used or clearly relevant but skipped/unavailable. Do not mechanically list every recommended phase skill.
- The user selected SkillTool discovery/candidate priority/call suggestions as the first effect surface for recommended phase skills.
- The user clarified that phase skill selection is fixed on the phase. Runtime behavior should not dynamically choose the phase skill set; it should surface the selected phase skills and tell the agent to pay more attention to them.
- The user accepted the fixed phase skill prompt semantics: selected for active phase, pay special attention when deciding whether a skill applies, invoke when current task matches, do not invoke when irrelevant, and soft-audit used or clearly relevant skipped/unavailable skills at completion.
- The user rejected duplicating skill-owned metadata such as reason/appliesWhen on the phase binding. The skill itself already carries description and applicability semantics.
- The user accepted names-first phase skill references, with source/qualified reference used only when needed for ambiguity or portability.
- The user raised two unresolved concerns: where phase skills may come from, and how workflow export should handle referenced skills.
- The user asked how a workflow should be shared for others to use. The proposed answer is to share a workflow package containing the workflow template plus a skill dependency manifest, not bundled skill package contents by default.
- The user proposed that workflow phase skills should be referenced from the same skill/plugin surface already visible in the Settings page, where users can see currently available skills and plugins.
- The user confirmed workflow should use skills as the primary referenced capability, not plugins.
- The user accepted the missing-skill import policy: allow import with warnings for missing recommended phase skills while keeping runtime visibility and soft audit evidence.
- The user accepted discussing UI/interaction for workflow phase skill selection.
- The user accepted the UI mainline: phase-local skill selector in workflow template editor, workflow-level dependency diagnostics in import/export, and lightweight runtime status/evidence only.
- The user accepted that workflow UI should mirror the grouped field model: Intent, Contract, Evidence, and Runtime Status. Template authoring should expose Intent, Contract, and Evidence as editable groups; Runtime Status belongs to running workflow/session views rather than persisted template fields.
- The user continued into phase lifecycle design. Recommended state model: phase/session lifecycle uses `created`, `running`, `pending-confirmation`, `completed`, `failed`, `cancelled`, and resume/source-status markers; completion attempts use `ready`, `blocked`, and `unable`.
- The user continued into runtime UI control design. Recommended first-scope controls: phase transition controls cover `confirm`, `reject`, `retry`, and `manual_complete`; session stop/recovery controls such as cancel/resume should remain separate.

## Confirmed Scope

- Direction-setting for cc-jiangxia workflows.
- Product and agent capability framing before technical implementation selection.
- A workflow skill capability layer that relates workflow phases to real skills or skill-like capabilities.
- Workflow phase semantics must distinguish prompt guidance from executable or required capability bindings.
- A phase skill should be treated as a phase-scoped relationship to an existing capability, not necessarily as a new standalone workflow-only skill format.
- Recommended phase skills should raise skill discoverability, selection priority, and phase relevance without requiring invocation before every phase completion.
- Recommended phase skills should produce lightweight audit evidence at phase completion or handoff so they remain more meaningful than ordinary prompt text.
- Recommended phase skill audits should stay concise and signal-bearing rather than exhaustive.
- Recommended phase skills should be fixed in the workflow phase definition and surfaced in the active phase prompt before adding UI-first behavior.
- "Priority" means helping the agent notice and choose relevant skills during its normal discovery/invocation process; it does not mean forced execution or user-visible manual sorting.
- The agent remains responsible for deciding whether a fixed phase skill is relevant to the current turn/task and whether to invoke it.
- Phase skill bindings should be minimal references to existing skills, not copies of skill descriptions, triggers, or support assets.
- Phase skills may reference the existing skill ecosystem rather than a workflow-local skill store.
- Workflow authoring should reference selectable phase skills from the same current available capability catalog behind Settings > Skills and plugin capability navigation.
- Workflow phase bindings should target skills. Plugin identity should be stored only as source/provenance/dependency when the selected skill is plugin-provided.
- Workflow export should not silently imply that referenced skills are bundled when they are not.
- Workflow sharing should make dependency status visible to the receiver before import or first run.
- Missing recommended phase skills should not block workflow import by default; the imported workflow should retain the references and mark them unavailable until resolved.
- Future required phase skills may use stricter blocking or explicit skip evidence, but that is not part of the current recommended-first default.
- Workflow template authoring should group editable fields as Intent, Contract, and Evidence so users understand whether they are defining purpose, execution boundaries, or completion proof.
- Runtime state should remain session-owned and shown in running workflow views, not stored as editable template configuration.
- `blocked` should not be a long-lived first-scope phase status. It should appear as `running` plus `blockedReason`, failed completion check, and user-visible warning so the phase remains recoverable.
- `unable` should not be treated as runtime `failed`. It is a completion submission outcome that asks for user or downstream direction.
- `pending-confirmation` should block duplicate ready submissions and require confirm, reject, or retry before the workflow advances.
- `stateVersion` and transition history should protect lifecycle operations from stale UI actions and preserve every completion/transition decision.
- Pending confirmation should be the highest-priority runtime UI state and should show `Confirm`, `Reject`, and `Retry` only.
- Manual completion should be an explicit user override while a phase is running under user-confirmation authority; it should require a summary/evidence dialog and should not be confused with confirming an agent-ready submission.
- Blocked or unable completion outcomes should show reason/evidence and a recovery-oriented `Retry`, but should not expose advancement controls such as `Confirm`, `Reject`, or `Complete phase`.
- Auto-advance should be represented as an authority/status label, not a button, unless a future explicit override flow is designed.
- Cancel and resume should be session-level lifecycle/recovery controls, not phase completion controls.

## Confirmed Non-Goals

- Do not resume the prior `workflow-template-management` discussion by default.
- Do not resume the prior `agent-workflow-authoring-tools` discussion by default.
- Do not enter implementation, source edits, tests, or `sp-specify` from this discussion without explicit later user request and handoff readiness.
- Do not define workflow skill priority as a way to override system, developer, security, or explicit user safety boundaries.
- Do not make every recommended phase skill a blocking completion requirement by default.
- Do not auto-execute recommended phase skills by default.
- Do not turn recommended phase skill audit into a hard gate by default.
- Do not block import solely because a recommended phase skill is missing.

## Candidate Scope Areas

- Current-product workflow features in `cc-jiangxia`.
- Agent-facing workflow authoring and modification.
- Spec-kit or AI-agent workflow mechanics.
- A broader product/work operating model.
- Skill binding semantics for workflow phases: required, optional, executable, preloaded, or advisory.
- Visibility and validation of workflow skill requirements in template authoring.
- Phase skill positioning: contract, recommendation, capability set, role default, or completion evidence requirement.

## Current Framing Question

- Should workflow export fail on missing/non-portable phase skills, warn with dependency metadata, or offer an optional bundle mode?

## Product Interpretation

The emerging job for workflows is: turn a workflow phase into an enforceable capability context, not just a prose checklist. A phase should be able to say which capabilities matter, how strongly they apply, and what evidence proves they were used or intentionally skipped.

Refined positioning: a workflow phase skill is best understood as a recommended binding from phase intent to the existing skill ecosystem. It says "this skill is especially relevant for this phase" and should influence discovery weight, candidate priority, prompt context, and agent decision-making. The skill itself remains the normal skill package with its own metadata, assets, scripts, templates, and invocation rules. Required/contract phase skills remain a possible later mode for narrow quality gates.

Soft audit refinement: recommended phase skills should leave an audit trail when they materially affect the phase. The audit should record skills that were used, or clearly relevant but skipped/unavailable, with concise rationale. It should not enumerate every recommended skill as `not_relevant` by default.

Recommendation surface refinement: the first concrete behavior should be active phase prompt emphasis plus SkillTool awareness. The phase has a fixed selected skill set. The prompt should explicitly tell the agent these are the phase's recommended skills and that the agent should pay special attention to them when deciding whether to invoke a skill.

Accepted prompt semantics:

- Phase recommended skills are selected for the active phase.
- Pay special attention to them when deciding whether a skill applies.
- Invoke a phase skill when the current task matches its purpose.
- Do not invoke a phase skill when it is not relevant.
- At phase completion, briefly note any phase skills used or clearly relevant but skipped/unavailable.

Binding refinement: the phase should not restate why a skill applies or when to use it. That is the skill's responsibility. The phase's responsibility is to select a fixed set of skills for the current phase and make the active prompt emphasize those selected skills.

Source/export refinement: skills can come from multiple scopes, while workflow templates are exported as JSON. A workflow export should preserve phase skill references and include enough dependency metadata for import validation, but should not copy arbitrary skill packages by default. For recommended phase skills, the default missing-dependency behavior should be import-with-warnings rather than import failure.

Settings-backed source refinement: workflow phase skill selection should reuse the same underlying skill catalog that powers Settings > Skills, not bind directly to the Settings UI component. The Settings UI is evidence of the user-visible source of truth, while the stable product requirement is a shared capability catalog/API that workflow authoring and settings both consume.

## Acceptance-Shaping Signals

- A workflow can refer to existing skills or skill-like capabilities by stable identity, not only paste guidance text.
- The runtime can tell the agent that a workflow skill is required or high-priority for the current phase.
- The system can show whether a required workflow skill was loaded, executed, skipped, failed, or unavailable.
- Missing or stale workflow skill references are validation issues, not silent prompt degradation.
- Permission and safety boundaries remain explicit when a workflow skill implies tools, shell behavior, model changes, hooks, or forked agents.
- Recommended skills are surfaced in a way that is materially stronger than ordinary prose in `phasePrompt`, while still allowing the agent to decide relevance.
- Phase completion can summarize recommended skill usage or skip decisions without forcing a separate user approval step.
- Importing a workflow with unavailable phase skills should produce clear diagnostics rather than silently dropping the skill references.
- Missing recommended phase skills are visible degraded state, not immediate import blockers.
- A shared workflow package can be inspected by another user to see which phase skills are already available, which are missing, which are ambiguous, and which require unsupported/private/plugin/MCP sources.
- A workflow author can choose phase skills from the same list of currently available skills the Settings page shows, including plugin-provided skills when enabled.
- The workflow authoring surface and Settings page do not drift into separate skill inventories.

## Initial Non-Functional Requirements

- Workflow skill behavior must be auditable across resume and compaction.
- Workflow templates and sessions must preserve enough provenance to explain which skill definition influenced a phase.
- The design must avoid recursive or unbounded skill invocation loops.
- Existing workflow sessions must not silently change behavior when an underlying skill changes unless the product explicitly defines that upgrade path.
- Existing workflow sessions must keep their template snapshot authoritative; stale or missing source templates should surface warnings rather than silently changing run behavior.

## Success Signals

- Not defined yet.

## UI Discussion

- ui_discussion_status: completed
- Confirmed primary UI direction: phase skill selection belongs in the workflow template editor at the selected phase level, replacing or augmenting the current advanced freeform skills textarea with a shared-catalog selector.
- Confirmed secondary UI direction: workflow import/export should show skill dependency diagnostics but should not become the primary place to author phase skills.
- Confirmed runtime/status UI direction: active workflow phase surfaces should show recommended phase skills and unavailable state only when useful, avoiding noisy checklists.
- Confirmed field grouping direction: workflow template editor should expose editable Intent, Contract, and Evidence groups; running workflow/session surfaces should expose Runtime Status separately.
- Confirmed lifecycle direction: runtime status UI should distinguish lifecycle state from completion attempt result. In particular, show blocked/unable as actionable completion outcomes inside a still-running phase unless the runtime itself failed or the user cancelled.
- Confirmed runtime-control direction: use clear authority labels and controls. Pending confirmation exposes Confirm/Reject/Retry; running user-confirmation exposes Manually complete phase as an advanced/manual path; blocked/unable exposes Retry only; auto-advance, cancel, and resume are not phase-completion buttons.
