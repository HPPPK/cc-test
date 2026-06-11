# Open Questions: Workflows

## Hard Questions

### OQ-001: Workflow Boundary

- question: Which workflow boundary should this fresh discussion focus on?
- owner: user
- latest_resolve_phase: context-intake
- blocking_level: hard
- status: resolved
- resolution: Overall cc-jiangxia workflows product and agent capability direction.
- stop_and_reopen_condition: If downstream discussion starts making product, technical, or implementation claims without this boundary being selected, return to sp-discussion context intake.

### OQ-002: Primary Workflow Job

- question: What primary job should workflows own for the user inside cc-jiangxia?
- owner: user
- latest_resolve_phase: product-framing
- blocking_level: hard
- status: resolved
- resolution: Workflows should own skill-like capability binding for phases. The user wants workflow skills to become real executable or higher-priority capabilities, not merely prompt text.
- stop_and_reopen_condition: If later scope tries to include all workflow meanings without a primary job, return to product framing before technical options.

### OQ-003: Workflow Skill Execution Contract

- question: Should workflow-declared skills be automatically executed by the runtime, or should they be high-priority required context that the agent must invoke explicitly when relevant?
- owner: user
- latest_resolve_phase: technical-options
- blocking_level: hard
- status: superseded
- superseded_by: OQ-006
- stop_and_reopen_condition: If handoff or specification describes workflow skills without choosing auto-execution, explicit invocation, or hybrid completion gating, return to sp-discussion.

### OQ-006: Phase Skill Positioning

- question: Should phase skills primarily represent a required contract, a recommended default, or an available capability set for the phase?
- owner: user
- latest_resolve_phase: technical-options
- blocking_level: hard
- status: resolved
- resolution: Recommended default. Phase skills should primarily raise relevance/priority for existing skills in the current phase, without default auto-execution or hard completion blocking.
- stop_and_reopen_condition: If later specification treats phase skills as plain guidance or automatic execution without selecting the intended positioning, return to sp-discussion.

### OQ-007: Recommended Skill Evidence

- question: How much evidence should a recommended phase skill leave when it is used or skipped?
- owner: user
- latest_resolve_phase: product-framing
- blocking_level: hard
- status: resolved
- resolution: Soft audit. Record used recommended skills and relevant skipped/unavailable skills with rationale, but do not block completion by default.
- stop_and_reopen_condition: If recommended phase skills have no observable signal, they may degrade back into ordinary prompt text; return to sp-discussion before handoff.

### OQ-008: Soft Audit Scope

- question: Should soft audit list every recommended phase skill, or only skills that were used or clearly considered relevant?
- owner: user
- latest_resolve_phase: product-framing
- blocking_level: hard
- status: resolved
- resolution: Record only recommended phase skills that were used or clearly considered relevant and skipped/unavailable. Do not list every recommended phase skill mechanically.
- stop_and_reopen_condition: If audit scope is not bounded, recommended phase skills may create noisy completion reports or weak evidence.

### OQ-009: Recommendation Weight Surface

- question: Where should recommended phase skill weight be applied first: model prompt priority, SkillTool discovery/candidate priority, or visible phase UI?
- owner: user
- latest_resolve_phase: technical-options
- blocking_level: hard
- status: resolved
- resolution: SkillTool discovery weight/candidate priority/call suggestions. Recommended phase skills should first help the agent notice and select relevant skills in the active phase.
- stop_and_reopen_condition: If recommendation has no concrete effect surface, phase skills may degrade into ordinary prompt text.

### OQ-010: Discovery Weight Trigger

- question: Should phase-skill discovery weight be always-on for the active phase, or conditional on the user's message/task matching the skill?
- owner: user
- latest_resolve_phase: product-framing
- blocking_level: hard
- status: superseded
- superseded_by: OQ-011
- stop_and_reopen_condition: If discovery weight is too broad, recommended skills may crowd out genuinely relevant non-phase skills; if too narrow, phase recommendation may have no practical effect.

### OQ-011: Phase Skill Prompt Wording

- question: Should the phase prompt name the phase skills as "recommended skills to consider" or "phase skills to focus on first when relevant"?
- owner: user
- latest_resolve_phase: product-framing
- blocking_level: hard
- status: resolved
- resolution: Use explicit prompt semantics: selected for active phase; pay special attention when deciding whether a skill applies; invoke when current task matches; do not invoke when irrelevant; soft-audit used or clearly relevant skipped/unavailable skills at completion.
- stop_and_reopen_condition: If prompt wording is too weak, phase skills may feel like plain prose; if too strong, they may feel mandatory despite being recommended.

### OQ-012: Phase Skill Binding Schema

- question: What minimum fields should a phase skill binding carry?
- owner: user
- latest_resolve_phase: technical-options
- blocking_level: hard
- status: resolved
- resolution: Minimal reference only. Do not duplicate skill-owned metadata such as reason/appliesWhen; the skill itself already owns description and applicability semantics.
- stop_and_reopen_condition: If the binding starts copying skill descriptions/triggers into workflow templates, return to discussion to avoid drift and duplicate sources of truth.

### OQ-013: Skill Reference Shape

- question: Should phase skills be stored as bare skill names, or as stable skill references with optional source when ambiguity exists?
- owner: user
- latest_resolve_phase: technical-options
- blocking_level: hard
- status: resolved
- resolution: Names-first. Use bare skill names by default, with source/qualified reference only when needed for ambiguity or portability.
- stop_and_reopen_condition: If reference shape cannot resolve duplicate skill names across bundled, project, user, plugin, managed, or MCP sources, return to discussion before handoff.

### OQ-014: Phase Skill Source Policy

- question: Which skill sources can phase skills reference: all installed skills, only project/bundled skills, or only portable/export-safe skills?
- owner: user
- latest_resolve_phase: technical-options
- blocking_level: hard
- status: resolved
- resolution: Phase skills reference skills from the current shared capability catalog behind Settings > Skills and plugin capability navigation. Workflows bind to skills, not plugins; plugin identity is provenance/dependency when the selected skill is plugin-provided.
- stop_and_reopen_condition: If source policy is not defined, exported workflows may depend on unavailable, private, plugin, managed, or MCP skills without diagnostics.

### OQ-015: Workflow Export Skill Dependency Policy

- question: Should workflow export fail on missing/non-portable phase skills, warn with dependency metadata, or offer an optional bundle mode?
- owner: user
- latest_resolve_phase: technical-options
- blocking_level: hard
- status: resolved
- resolution: Share workflow packages with template plus skill dependency manifest by default. Do not bundle skill package contents by default. For missing recommended phase skills, allow import with warnings, keep the reference, mark the skill unavailable in preview/runtime, and use soft audit if it was relevant. Future explicit bundle mode should be limited to reviewed project-owned skills; future required phase skills may use stricter blocking or explicit skip evidence.
- stop_and_reopen_condition: If export/import lacks a dependency policy, phase skill references may silently break after transfer.

### OQ-016: Phase Lifecycle Status Model

- question: How should workflow phases represent ready, running, blocked, pending confirmation, completed, failed, cancelled, resumed, stale-template, and missing-template behavior?
- owner: user
- latest_resolve_phase: technical-options
- blocking_level: hard
- status: resolved
- resolution: Use lifecycle status for session/phase state and submission status for completion attempts. Keep `created`, `running`, `pending-confirmation`, `completed`, `failed`, `cancelled`, and resume/source-status markers as lifecycle concepts. Treat `ready`, `blocked`, and `unable` as completion submission outcomes. Do not make `blocked` a long-lived first-scope phase status; represent it as `running` with blocked evidence and retry path.
- stop_and_reopen_condition: If later specification makes normal blocked/unable completion attempts terminal failures, silently resumes cancelled runs, or lets pending confirmation be bypassed by duplicate ready submissions, return to sp-discussion.

### OQ-017: Runtime UI Controls And Authority Labels

- question: Which runtime controls should appear for confirm, reject, retry, cancel, resume, manual completion, and auto-advance?
- owner: user
- latest_resolve_phase: technical-options
- blocking_level: hard
- status: resolved
- resolution: First-scope phase transition controls should cover `confirm`, `reject`, `retry`, and `manual_complete`. Pending confirmation shows Confirm/Reject/Retry and blocks other completion controls. Running phases with user-confirmation authority can show Manually complete phase as a manual override with summary/evidence. Blocked/unable outcomes show Retry only. Auto-advance is an authority/status label, not a button. Cancel and resume are session-level lifecycle/recovery controls, not phase completion controls.
- stop_and_reopen_condition: If later UI mixes pending confirmation with manual completion, exposes advancement controls for blocked/unable states, or treats cancel/resume as ordinary phase transitions without a lifecycle/recovery contract, return to sp-discussion.

## Soft Questions

### OQ-004: Priority Semantics

- question: For recommended phase skills, what does "higher priority" mean: stronger prompt placement, better skill discovery/candidate priority, phase-local suggestion UI, model/tool hinting, or soft evidence at completion?
- owner: user
- latest_resolve_phase: specification
- blocking_level: soft
- status: open
- stop_and_reopen_condition: If priority can override safety, permissions, or user intent without a contract, reopen.

### OQ-005: UI Authoring Scope

- question: Should users be able to author and inspect workflow skill bindings in the desktop workflow template UI in first scope?
- owner: user
- latest_resolve_phase: specification
- blocking_level: soft
- status: resolved
- resolution: Yes. First UI scope should upgrade the workflow template editor's phase skills field into a phase-local shared-catalog skill selector. Import/export and runtime status should show dependency/status diagnostics as supporting surfaces.
- stop_and_reopen_condition: If UI-facing authoring is included without state labels for required/optional/missing/stale/executed/skipped skills, reopen.

## Deferred Questions

- Target users.
- Detailed primary scenario.
- Success criteria.
- Exact non-goals.
- Exact UI and interaction scope.
- Final technical implementation option.
