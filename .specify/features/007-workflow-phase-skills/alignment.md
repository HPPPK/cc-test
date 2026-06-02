# Alignment: Workflow Phase Skills

**Feature Branch**: `007-workflow-phase-skills`
**Status**: Review Draft
**Entry Source**: `sp-discussion` handoff

## Current Understanding

Workflow phase skills should become recommended bindings from a workflow phase to existing skills. The phase selects a fixed set of skills. Runtime makes those selected skills more salient for the active phase, but use or non-use remains the agent's decision based on the current task. The binding is a reference to a skill, not a copy of skill content and not a plugin binding.

Approach A, recommended binding, is user-confirmed for this specification.

## Approach Comparison

| Approach | Product Fit | Implementation Risk | Compatibility Impact | Verification Implications | Decision |
| --- | --- | --- | --- | --- | --- |
| A. Recommended binding | Best preserves confirmed intent: real phase-skill bindings without auto-execution or hard gates. | Medium. Requires schema/resolver/import-export/runtime/UI work, but avoids workflow-engine expansion. | Evolves existing `skills` arrays and preserves old exports. | Requires same-area server and desktop tests plus prompt/report/resume coverage. | Selected |
| B. Contract mode first | Strong for quality gates, security phases, or release phases. | High. Pulls required evidence, completion gating, migration, resume, and safety semantics into first release. | Larger breaking-risk surface and more user-facing blockers. | Requires broader lifecycle and E2E coverage before safe handoff. | Deferred |
| C. Lightweight diagnostics only | Smallest UI/import-export change. | Lower short-term risk. | Compatible, but weakens the product promise. | Tests mostly UI/API diagnostics; does not prove phase skills are real. | Rejected for first spec |

Recommendation: Approach A is the only option that keeps the confirmed "real skill" direction while preserving the user's repeated non-goals around no default auto-execution, no default blocking, no plugin-primary binding, and no default skill bundling.

## Semantic Term Decisions

- **Term**: skill
  **Possible Meanings**: prompt text; slash command; executable capability package; plugin capability.
  **Selected Meanings**: existing skill package/capability that SkillTool can discover/invoke and that may include metadata, tools, scripts, assets, references, templates, agents, model/effort effects, hooks, or shell expansion.
  **Excluded Meanings**: workflow-local prose guidance only; plugin as the primary binding target.
  **User Confirmation**: Confirmed through discussion and handoff.

- **Term**: workflow phase skill
  **Possible Meanings**: new skill format; prompt guidance line; required completion contract; recommended binding.
  **Selected Meanings**: phase-local recommended reference to an existing skill.
  **Excluded Meanings**: separate workflow-only skill package; automatic execution; default completion gate.
  **User Confirmation**: User selected recommended-first and later confirmed Approach A.

- **Term**: real skill / 真正的技能
  **Possible Meanings**: stronger prompt wording; executable SkillTool capability; arbitrary tools bundled into workflow; required workflow contract.
  **Selected Meanings**: first-class binding to an existing skill capability, resolved/diagnosed/exported/imported/runtime-emphasized as a capability reference.
  **Excluded Meanings**: copying skill content into workflow templates; hidden auto-execution.
  **User Confirmation**: Confirmed through handoff and Approach A.

- **Term**: higher priority / 更加关注
  **Possible Meanings**: user-visible sort order; forced invocation; safety override; active-phase attention boost.
  **Selected Meanings**: active-phase prompt emphasis and SkillTool awareness so the agent pays special attention when deciding whether a skill applies.
  **Excluded Meanings**: override system/developer/security/user instructions; mandatory invocation.
  **User Confirmation**: User clarified "用或不用是 agent 自己的" and confirmed prompt emphasis.

- **Term**: shared skill catalog
  **Possible Meanings**: Settings UI component; server `/api/skills`; SkillTool command list; new workflow-only inventory.
  **Selected Meanings**: shared resolver/catalog contract aligned with Settings > Skills and plugin capability navigation, consumed by authoring/import/export/runtime.
  **Excluded Meanings**: separate workflow-local skill list; direct coupling to a React Settings component.
  **User Confirmation**: User proposed referencing the existing skill settings page; discussion refined this to shared catalog/API.

- **Term**: plugin
  **Possible Meanings**: capability; skill; dependency container; installable bundle.
  **Selected Meanings**: distribution/installation container that can provide skills and other capabilities; plugin identity is provenance/dependency for plugin-provided skills.
  **Excluded Meanings**: primary workflow phase binding target.
  **User Confirmation**: User agreed workflow should use skills as the referenced capability.

- **Term**: workflow sharing/export
  **Possible Meanings**: raw template JSON; template plus dependencies; full bundle with skill contents.
  **Selected Meanings**: workflow package with template plus skill dependency manifest.
  **Excluded Meanings**: default bundle of arbitrary skill package contents.
  **User Confirmation**: User accepted import-with-warnings default and sharing model.

## Capability Split

This remains one coherent feature. The spec decomposes it into bounded capabilities rather than separate specs:

- Phase skill binding identity.
- Shared skill catalog and resolver.
- Phase-local authoring UI.
- Workflow package dependency manifest.
- Active phase prompt emphasis.
- Lightweight skill evidence.
- Compatibility, safety, and lifecycle guardrails.

Separate specs are not recommended because splitting schema, resolver, import/export, runtime, and UI would create contradictory partial semantics.

## Upstream Intent Disposition

| Signal ID | Source Signal | Source | Disposition | Artifact Location | User Confirmed | Reopen Trigger |
| --- | --- | --- | --- | --- | --- | --- |
| SIG-001 | Workflows should not leave skills as prompt text only. | requirements.md; MP-001 | preserved | spec.md FR-001 | yes | Reopen if bindings are only prose guidance. |
| SIG-002 | "真正的技能" should relate to current skills with tools/templates/assets. | discussion-log.md; project-context.md | in_scope | spec.md overview, FR-001 | yes | Reopen if workflow phase skills become a new prompt-only format. |
| SIG-003 | Existing skills can be passive or explicit and include templates/tools/assets. | discussion-log.md; project-context.md | preserved | spec.md semantic model; context.md live evidence | yes | Reopen if phase binding copies assets/instructions instead of referencing skills. |
| SIG-004 | Phase skill positioning is recommended-first. | OQ-006; MP-003 | preserved | spec.md scope, FR-003 | yes | Reopen if default behavior gates completion. |
| SIG-005 | Soft audit for used or relevant skipped/unavailable skills. | OQ-007/OQ-008; MP-009 | preserved | spec.md FR-016 | yes | Reopen if audit lists every recommended skill mechanically. |
| SIG-006 | Recommendation effect first applies to SkillTool discovery/candidate attention. | OQ-009/OQ-011 | in_scope | spec.md FR-014; context.md integration boundaries | yes | Reopen if prompt/runtime has no concrete effect surface. |
| SIG-007 | Agent decides whether to use a selected phase skill. | discussion-log.md | preserved | spec.md FR-014, FR-021 | yes | Reopen if runtime auto-executes recommended skills. |
| SIG-008 | Phase binding should not duplicate reason/appliesWhen. | OQ-012; MP-007 | preserved | spec.md FR-007, FR-008 | yes | Reopen if workflow template becomes source of skill applicability. |
| SIG-009 | Names-first references with source/qualified metadata only when needed. | OQ-013; MP-006 | preserved | spec.md FR-004 | yes | Reopen if all skills require verbose references without ambiguity. |
| SIG-010 | Skill source comes from shared Settings-backed catalog. | OQ-014; MP-005 | preserved | spec.md FR-005 | yes | Reopen if workflow authoring uses separate inventory. |
| SIG-011 | Workflow binds to skills, not plugins. | discussion-log.md; MP-004 | preserved | spec.md FR-002, FR-010 | yes | Reopen if schema stores plugin as primary binding target. |
| SIG-012 | Plugin identity is provenance/dependency. | discussion-log.md | preserved | spec.md FR-002, FR-010 | yes | Reopen if plugin loss silently drops skill binding. |
| SIG-013 | Workflow sharing should include dependency manifest. | OQ-015; MP-010 | preserved | spec.md FR-011 | yes | Reopen if export emits names only without dependencies. |
| SIG-014 | Export should not bundle skill contents by default. | OQ-015; MP-010 | preserved | spec.md FR-012 | yes | Reopen if first release copies arbitrary skill files. |
| SIG-015 | Missing recommended skills allow import with warnings. | OQ-015; MP-011 | preserved | spec.md FR-013 | yes | Reopen if import blocks solely due to missing recommended skills. |
| SIG-016 | Missing references are preserved and marked unavailable. | MP-011 | preserved | spec.md edge cases, FR-013, FR-015 | yes | Reopen if import silently drops unresolved references. |
| SIG-017 | UI mainline is phase-local selector in WorkflowTemplateEditor. | MP-012 | preserved | spec.md FR-017 | yes | Reopen if authoring moves only to workflow-level page. |
| SIG-018 | Import/export dependency diagnostics are supporting UI. | MP-013 | preserved | spec.md FR-018 | yes | Reopen if sharing hides dependency problems. |
| SIG-019 | Runtime status/evidence should be lightweight. | MP-014 | preserved | spec.md FR-019 | yes | Reopen if status becomes noisy checklist. |
| SIG-020 | Skill-derived permissions and safety boundaries remain explicit. | MP-015; CA-004 | preserved | spec.md FR-021, NFR Security | yes | Reopen if workflow grants tools without SkillTool permission path. |
| SIG-021 | Future bundle mode only for reviewed project-owned skills. | MP-016 | deferred | spec.md deferred scope | yes | Reopen when product explicitly requests bundle mode. |
| SIG-022 | Future required/contract phase skills. | OQ-015; MP-017 | deferred | spec.md deferred scope | yes | Reopen when mandatory evidence is requested. |
| SIG-023 | Exact storage/schema fields are implementation details. | MP-017 | in_scope | spec.md FRs constrain them; context.md leaves design to plan | yes | Reopen if field design changes product semantics. |
| SIG-024 | Existing workflow sessions must not silently change when skills change. | requirements.md NFR; CA-005 | preserved | spec.md FR-020 | yes | Reopen if source skill edits alter active session without policy. |
| SIG-025 | Avoid recursive/unbounded skill invocation. | requirements.md NFR; CA-010 | preserved | spec.md FR-022 | yes | Reopen if automatic nested skill behavior enters scope. |

## Must-Preserve Coverage

All `MP-001` through `MP-017` are mapped in `spec.md#Mapped Must-Preserve Items`.

- Preserved or in scope: `MP-001` through `MP-015`, plus `MP-017` as planning-constrained details.
- Deferred with user-confirmed future scope: `MP-016` and required/contract portions of `MP-017`.
- Dropped: none.
- Clarification blockers: none.

## Out-Of-Scope Conflicts

| Upstream Wording | Potential Conflict | Resolution | User Confirmation | Reopen Trigger |
| --- | --- | --- | --- | --- |
| "explicitly executed" appeared in early product direction. | Could imply auto-execution or mandatory execution. | First scope keeps explicit SkillTool invocation available through normal agent decision; no automatic execution. | Confirmed by recommended-first and Approach A. | Reopen if user wants runtime auto-run. |
| "higher priority" could imply override semantics. | Could weaken system/developer/security/user instructions. | Higher priority means active-phase attention, not safety override. | Confirmed in discussion. | Reopen if implementation needs priority beyond prompt/SkillTool awareness. |
| "where skills come from" could imply all sources must fully resolve immediately. | Server Settings API does not yet cover every runtime source. | Shared resolver must align sources or diagnose unsupported sources; exact extraction is for plan. | Confirmed as shared catalog direction. | Reopen if catalog cannot represent required sources. |
| "share with others" could imply full self-contained bundles. | Bundling arbitrary skill contents has security/provenance risk. | Default export is template plus dependency manifest; bundle mode deferred. | Confirmed. | Reopen when reviewed project-owned bundle mode is requested. |

## Confirmed Facts

- Existing SkillTool treats matching skills as a blocking requirement when a skill applies.
- SkillTool can run inline or forked skill execution, records usage, and can return context modifiers for allowed tools, model, and effort.
- Skill frontmatter supports metadata and behaviors beyond prompt text, including tools, hooks, model, effort, shell, and forked agent context.
- Current workflow skill declarations are prompt-level guidance and do not enable SkillTool globally.
- Current workflow export emits template JSON and does not bundle external skill packages.
- Current phase skill editor is an advanced freeform textarea.
- Current Settings skill API/store/UI exists, but source coverage differs between server API, frontend type, and runtime loader.
- Project cognition is stale/blocked and must be used only as advisory navigation.

## Assumptions

- A shared resolver can either cover all relevant runtime skill sources or produce stable unsupported-source diagnostics.
- Existing workflow template unknown-field preservation can support a compatibility migration for richer phase skill references.
- Recommended prompt emphasis can be implemented without changing global SkillTool permission behavior.

## Readiness Decision

Ready for artifact review. No planning-critical question remains after user selected Approach A.
