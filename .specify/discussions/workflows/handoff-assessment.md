# Handoff Assessment: Workflows

- assessed_at: 2026-06-11T19:24:46.7549232+08:00
- discussion_slug: workflows
- decision_status: ready-for-specify
- required_next_action: write-unified-handoff

## Rationale

The reopened discussion now has one coherent feature boundary: specify workflows as phase execution contracts in `cc-jiangxia`.

This supersedes the older phase-skill-only handoff. The confirmed direction now includes grouped phase fields, execution constraints, recommended phase skill bindings, dependency-aware sharing, lifecycle/completion semantics, runtime/editor UI behavior, compatibility, and validation.

Confirmed decisions are sufficient for specification:

- Workflow phases should be treated as execution contracts, not only prose templates.
- Phase field semantics should be grouped as `intent`, `contract`, `evidencePolicy`, and session-owned `runtimeState`.
- Constraints are soft by default unless they are clear gates such as required artifacts, completion criteria, transition authority, or user confirmation.
- Phase skills bind to existing skills, not plugins; plugin identity is provenance/dependency only.
- Recommended phase skills are fixed on the phase and elevated in active-phase context, but are not auto-executed or completion-blocking by default.
- Recommended phase skill audit is bounded: record used skills and clearly relevant skipped/unavailable skills only.
- Workflow sharing should use workflow template plus skill dependency manifest, not bundled skill packages by default.
- Missing recommended phase skills allow import with warnings, preserve references, and remain visible in preview/runtime.
- Runtime state stays session-owned and should not be stored as editable template configuration.
- Lifecycle status and completion submission status are distinct. `ready`, `blocked`, and `unable` are completion outcomes; `blocked` and `unable` remain recoverable inside `running`.
- Pending confirmation is a real blocking state and resolves through confirm, reject, or retry.
- Runtime phase controls cover Confirm/Reject/Retry, manual completion as a user override, and Retry for blocked/unable. Auto-advance is an authority label; cancel/resume are session-level controls.

## Assessment Dimensions

- feature_coherence: pass
- implementation_target_clarity: pass
- current_repository_role: pass
- reference_source_clarity: pass
- planning_shape: pass
- validation_shape: pass
- risk_profile: pass-with-consequence-obligations
- hard_unknown_count: 0
- open_conflict_count: 0

## Boundary Evidence

- current_project_root: `F:\github\cc-jiangxia`
- target_project_root: `F:\github\cc-jiangxia`
- target boundary: current product codebase, workflow template/runtime/import-export/desktop surfaces.
- path_status: user-confirmed
- source evidence: `requirements.md`, `technical-options.md`, `project-context.md`, `open-questions.md`, and live reads cited there.

## Remaining Unknowns

No hard unknown blocks draft handoff.

Soft unknowns to carry into specification:

- Exact stable skill reference schema fields across user/project/plugin/managed/bundled/MCP sources.
- Whether the first implementation aligns all skill sources immediately or starts with the current Settings-backed user/project/plugin set and leaves broader source alignment explicit.
- Exact adapter boundaries between current flat persistence fields and grouped product/runtime semantics.
- Exact UI copy and layout for Intent/Contract/Evidence editor grouping and runtime status controls.
- Exact storage location for skill audit evidence across session state, phase run records, artifacts, and final reports.
- Future required/contract phase skill behavior beyond recommended-first defaults.
- Project cognition runtime was unavailable during the latest runtime UI pass; live file evidence is current, but restored cognition should be rerun before implementation planning if available.

## Consequence Gate

Senior Consequence Analysis remains triggered because this feature affects workflow template schema, runtime prompt behavior, workflow-scoped completion tools, skill catalog/reference semantics, import/export, session lifecycle, stale/missing template behavior, and desktop workflow UI.

The handoff must preserve CA-001 through CA-010 and must not let downstream work silently weaken permission boundaries, source/provenance tracking, missing skill diagnostics, state-version protection, pending-confirmation behavior, or resume/snapshot behavior.

## Assessment Result

Proceed with one refreshed unified draft handoff pair:

- `.specify/discussions/workflows/handoff-to-specify.md`
- `.specify/discussions/workflows/handoff-to-specify.json`

The draft pair is not handoff-ready until self-review passes and the user confirms the generated handoff.
