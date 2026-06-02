# Handoff Assessment: Workflows

- assessed_at: 2026-05-29T15:33:41.0647544+08:00
- discussion_slug: workflows
- decision_status: ready-for-specify
- required_next_action: write-unified-handoff

## Rationale

The discussion has one coherent feature boundary: make workflow phase skills real recommended bindings to existing skills, rather than prompt-only workflow skill guidance.

Confirmed decisions are sufficient for specification:

- Workflow phases bind to skills, not plugins.
- Phase skills are fixed on the phase and recommended-first by default.
- The active phase prompt should make the agent pay special attention to selected phase skills when relevant.
- The agent decides whether each phase skill applies; recommended skills are not auto-executed and do not block phase completion by default.
- Soft audit records used recommended skills and clearly relevant skipped/unavailable skills only.
- Skill references are names-first, with source/qualified reference when needed for ambiguity or portability.
- Phase skill selection comes from the same shared capability catalog behind Settings > Skills and plugin capability navigation.
- Workflow sharing uses a workflow package: template plus skill dependency manifest, not bundled skill package contents by default.
- Missing recommended phase skills allow import with warnings, preserve references, mark unavailable at preview/runtime, and can appear in soft audit when relevant.
- UI first scope is phase-local skill selection in `WorkflowTemplateEditor`, with workflow-level dependency diagnostics in import/export and lightweight runtime status.

## Assessment Dimensions

- feature_coherence: pass
- implementation_target_clarity: pass
- current_repository_role: pass
- reference_source_clarity: pass
- planning_shape: pass
- validation_shape: pass
- risk_profile: pass-with-consequence-obligations

## Boundary Evidence

- current_project_root: `F:\github\cc-jiangxia`
- target_project_root: `F:\github\cc-jiangxia`
- target boundary: current product codebase, workflow template/runtime/desktop surfaces.
- source evidence: `requirements.md`, `technical-options.md`, `project-context.md`, `open-questions.md`, and live reads cited there.

## Remaining Unknowns

No hard unknown blocks handoff.

Soft unknowns to carry into specification:

- Exact stable skill reference schema fields.
- Whether the shared catalog must include managed/MCP/bundled sources in the first implementation slice or only align user/project/plugin first.
- Exact UI copy and layout details.
- Exact runtime storage shape for skill resolution status and soft audit evidence.
- Future required/contract phase skill behavior.

## Consequence Gate

Senior Consequence Analysis remains triggered because this feature affects workflow template schema, runtime prompt behavior, import/export, settings/catalog surfaces, session resume, and agent skill invocation semantics.

The handoff must preserve CA-001 through CA-010 and must not let downstream work silently weaken permission boundaries, source/provenance tracking, missing skill diagnostics, or resume behavior.
