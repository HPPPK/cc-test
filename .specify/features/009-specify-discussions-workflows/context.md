# Planning Context: Workflow Phase Execution Contracts

**Feature Branch**: `009-specify-discussions-workflows`
**Created**: 2026-06-12
**Status**: Ready for user review
**Derived From**: `spec.md`, `alignment.md`, discussion sources, project cognition intake, and live repository reads

## Planning Context

The plan should treat this feature as a canonical product contract over existing and missing workflow behavior. The implementation is not greenfield: several pieces are already present in server services, APIs, desktop UI, and tests. Planning must classify each requirement as existing baseline, incomplete, missing, or hardening work.

The workflow remains planning-only until `/sp.plan`. No source, test, dependency, or runtime file was edited by `sp-specify`.

## Project Cognition Intake

- Status file exists at `.specify/project-cognition/status.json`.
- Runtime status: `review` with `partial_refresh`.
- Baseline kind: `brownfield_full`.
- Stale paths reported by status are provider/settings UI files, not the workflow runtime/editor surfaces targeted here.
- Lexicon/query selected `SkillTool - Skill Invocation` and a broad coverage-gap node.
- Product workflow runtime/editor concepts are not well represented in the current graph; targeted live reads are required.
- Advisory: continue without map maintenance for artifact-only specification work, but `/sp.plan` should keep live reads authoritative.

## Relevant Repository Context

### Server Workflow Surfaces

- `src/server/services/workflowTypes.ts` defines lifecycle statuses, phase statuses, completion submission statuses, artifact lifecycle statuses, `WorkflowPhaseSkillReference`, `WorkflowPhaseDefinition`, `CompletionSubmission`, pending confirmation, phase runs, transition records, `stateVersion`, and session state.
- `src/server/services/workflowTemplateValidation.ts` normalizes phase skills as recommended mode only, accepts source/provenance fields, validates invalid references, normalizes phase prompt/action policy/artifacts, and accepts `user`, `project`, `plugin`, `managed`, `bundled`, `mcp`, and `unknown` sources.
- `src/server/services/workflowTemplateRegistryService.ts` preserves unknown fields during writes and resolves phase skill issues against a template skill catalog.
- `src/server/services/workflowPhaseSkillResolver.ts` resolves references against a catalog and models `available`, `missing`, `ambiguous`, `unsupported-source`, `plugin-disabled`, `installable`, and `invalid-reference` statuses.
- `src/server/services/workflowSessionCreateService.ts` snapshots templates and creates phase skill resolution snapshots at session start.
- `src/server/services/workflowRuntimeService.ts` formats phase prompt sections, recommended skills prompt blocks, validates completion submissions, blocks duplicate pending ready submissions, records completion artifacts, manages pending confirmation, retry, confirm, reject, and transition history.
- `src/server/services/workflowToolPolicy.ts` describes `submit_phase_completion` requirements and currently states recommended phase skills do not grant permissions or enable SkillTool globally.

### API And Skill Surfaces

- `src/server/api/workflowTemplates.ts` exports workflow packages with `schemaVersion: 2`, templates, and dependency manifest, previews imports, computes dependency diagnostics, and blocks invalid dependencies while allowing warnings where importable.
- `src/server/api/skills.ts` provides the current Settings-backed skill API for user/project/plugin skills and skill detail.
- `src/skills/loadSkillsDir.ts` loads managed, user, project, additional, bundled, plugin, and MCP skill sources; frontmatter can affect allowed tools, model, effort, hooks, shell, context fork, user invocability, and model invocation.
- `src/tools/SkillTool/SkillTool.ts` validates skill invocation, handles permission decisions, supports forked skills, records usage, and returns allowed tools, model, and effort context modifiers.
- `src/tools/SkillTool/prompt.ts` tells agents that matching skills are a blocking requirement to invoke before responding, while workflow recommended skills must not silently bypass that normal invocation contract.

### Desktop Surfaces

- `desktop/src/types/session.ts` models workflow lifecycle, phase skill references, skill resolution statuses, snapshots, evidence, dependency manifests, import/export, and transition actions.
- `desktop/src/types/skill.ts`, `desktop/src/api/skills.ts`, and `desktop/src/stores/skillStore.ts` provide catalog/detail shapes and a shared skill store for UI surfaces.
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx` already uses a recommended skill selector backed by the shared skill catalog and preserves source/provenance selection identity.
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx` renders import and export dependency diagnostics.
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx` renders runtime status, pending/blocked artifacts, recommended skill status/evidence, stale/missing template labels, and read-only artifact history.
- `desktop/src/components/workflow/WorkflowTransitionControls.tsx` renders pending confirmation controls, manual completion, and retry with stateVersion/transition context.
- `desktop/src/pages/ActiveSession.tsx` wires workflow status and controls into the active session strip and hides phase controls for completed, stale-template, and missing-template states.
- `desktop/src/components/workflow/WorkflowComponents.test.tsx` already tests import/export diagnostics, recommended skill selector behavior, same-name skill provenance, status panel skill evidence, pending priority, artifact history, and safe transition controls.

## Existing Patterns And Reuse Notes

- Existing code favors compatibility and unknown-field preservation rather than destructive template migration.
- Workflow completion uses versioned state and artifact lifecycle, so new planning should extend that pattern instead of creating a second state system.
- Skill references should reuse the resolver/catalog path rather than duplicating Settings UI logic.
- Runtime UI should keep evidence read-only and controls explicit about authority.

## Integration Boundaries

- **Template boundary**: workflow templates define phase fields, recommended skill references, required artifacts, completion criteria, action policy, transition authority, and phase prompt.
- **Session boundary**: workflow sessions own runtime state, snapshots, active phase, pending confirmation, artifact index, transition history, final report, and evidence.
- **Skill boundary**: SkillTool owns invocation, permissions, model/effort/tool effects, context fork, shell/hook concerns, and usage recording.
- **Sharing boundary**: workflow export/import owns dependency manifest diagnostics, not skill package bundling.
- **UI boundary**: editor authoring, import/export diagnostics, status panel, transition controls, and active session strip must reflect runtime semantics without inventing stronger behavior.

## Product Boundary Constraints

- Recommended phase skills are soft by default.
- Missing recommended skills are degraded/visible, not silent drops.
- Invalid recommended skill references are validation errors.
- Direct grouped persistence migration is deferred.
- Session snapshots remain authoritative for active/resumed runs.
- Cancel/resume remain session-level lifecycle/recovery controls.

## Affected Object Map

| Obligation ID | Object / State Surface | Owner | Consumers | Evidence | Coverage Gap |
| --- | --- | --- | --- | --- | --- |
| CA-001 | Skill references and catalog entries | server workflow + skill catalog | editor, import/export, session create, runtime | `workflowPhaseSkillResolver.ts`, `workflowTemplateValidation.ts` | Exact stable identity policy still needs plan detail |
| CA-002 | Priority/prompt semantics | runtime prompt + SkillTool | agents, users, safety policy | `workflowRuntimeService.ts`, `SkillTool.ts`, `prompt.ts` | Need tests proving no permission bypass |
| CA-003 | Missing/degraded skill states | resolver + import/runtime UI | importers, runners, reports | `workflowPhaseSkillResolver.ts`, import/export dialog | Need end-to-end coverage for each diagnostic state |
| CA-004 | Permission-sensitive skill effects | SkillTool | agent runtime, workflow runtime | `SkillTool.ts`, `loadSkillsDir.ts` | Need plan for evidence that workflow does not grant effects |
| CA-005 | Skill provenance snapshots | workflow session state | resume, reports, stale/missing template handling | `workflowSessionCreateService.ts`, `workflowTypes.ts` | Exact final report/storage boundaries need planning |
| CA-006 | Skill audit evidence | completion artifacts, status panel, reports | runners, downstream phases | `WorkflowStatusPanel.tsx`, `workflowRuntimeService.ts` | Exact write path for audit evidence needs planning |
| CA-007 | Validation paths | validation, API, editor, session start | authors, importers, runners | `workflowTemplateValidation.ts`, APIs | Need coverage matrix per path |
| CA-008 | UI labels/controls | desktop workflow components | workflow authors/runners | workflow components/tests | Exact copy/layout remains implementation-level |
| CA-009 | Evidence durability | state, artifacts, report, import/export | resume, final report, downstream workflows | `workflowTypes.ts`, `workflowRuntimeService.ts` | Need compaction/resume/report tests |
| CA-010 | Nested invocation limits | SkillTool/future required modes | agents, permissions | `SkillTool.ts` | Deferred unless auto/required invocation is added |

## State-Behavior Matrix

| State | Required Behavior |
| --- | --- |
| `created` | Validate template and recommended skill references; snapshot source identity when a session starts. |
| `running` | Active phase receives grouped contract context; blocked/unable outcomes remain recoverable with reason/evidence and retry. |
| `pending-confirmation` | Preserve pending evidence; expose Confirm/Reject/Retry only; block duplicate ready submissions. |
| `completed` | Preserve accepted artifacts, completion evidence, transition history, recommended skill audit, and final report pointer. |
| `failed` | Reserve for runtime/system failure, not ordinary completion inability. |
| `cancelled` | Treat as terminal stop unless a separate recovery flow is specified. |
| `resumed` | Continue from restored state and keep provenance visible. |
| `stale-template` | Session snapshot remains authoritative; warn rather than silently replacing behavior. |
| `missing-template` | Continue from snapshot if available and report source absence separately. |
| `imported-with-missing-skills` | Keep references, show warnings, mark unavailable at preview/runtime, and allow recommended-skill import by default. |

## Dependency Impact Table

| Surface | Impact | Required Handling |
| --- | --- | --- |
| `workflowTypes.ts` | Defines persisted and API-visible state shapes | Preserve compatibility and add types only with tests |
| `workflowTemplateValidation.ts` | Normalizes/validates templates | Validate grouped/flat compatibility and skill diagnostics |
| `workflowTemplateRegistryService.ts` | Writes user templates | Preserve unknown fields and avoid destructive migration |
| `workflowPhaseSkillResolver.ts` | Resolves skill references | Define stable reference/provenance rules and status behavior |
| `workflowRuntimeService.ts` | Assembles prompts and records transitions/evidence | Preserve pending conflict, artifact lifecycle, skill audit, and final report provenance |
| `workflowToolPolicy.ts` | Defines workflow-scoped tool guidance | Keep SkillTool permissions separate from workflow references |
| `workflowTemplates` API | Handles export/import | Keep dependency manifests diagnostic and non-bundling by default |
| `skills` API/store | Provides catalog to UI | Align catalog coverage with runtime resolver expectations |
| `SkillTool` | Executes skills and applies effects | Do not bypass validation or permissions |
| Desktop workflow editor/status/controls | User-facing authoring/runtime behavior | Mirror runtime semantics and avoid unsafe controls |

## Change Propagation Matrix

| Change Surface | Upstream Inputs | Downstream Consumers | Constraint / Risk |
| --- | --- | --- | --- |
| Phase field grouping | Current flat fields, user templates | editor, runtime prompt, validation | Direct persistence migration is deferred |
| Skill reference schema | Shared catalog, plugin provenance, resolver | import/export, session start, runtime UI | Duplicate names and source gaps must be visible |
| Dependency manifest | Template export and resolver statuses | import preview, receiver runtime | Must not imply bundled skill contents |
| Completion submission | Agent/tool submission | transition history, artifacts, reports, UI | stateVersion and pending conflict must hold |
| Runtime status UI | session state and artifacts | users, support, downstream workflow review | UI must not expose unsafe advancement controls |
| Final report evidence | accepted artifacts and skill audit | completed sessions, downstream consumers | Must survive compaction/resume/report generation |

## Locked Decisions Carry-Forward

- Treat this as a canonical contract with baseline evidence.
- Preserve the unified feature boundary.
- Keep recommended phase skills soft by default.
- Keep plugins as provenance/dependency, not the primary target.
- Export dependency manifest by default, not skill contents.
- Use lifecycle status separately from completion submission status.
- Keep blocked/unable recoverable inside running.
- Keep pending confirmation as a real blocking state.
- Preserve compatibility before grouped persistence migration.

## Must-Preserve Carry-Forward

- `MP-001` through `MP-012` are preserved or in-scope in `spec.md` and `alignment.md`.
- `MP-013` is carried as a planning advisory: project cognition is useful for routing, but live code proves product workflow behavior.
- Stop-and-reopen conditions are listed in `alignment.md#upstream-intent-disposition`.

## Canonical References

- `spec.md`
- `alignment.md`
- `references.md`
- `.specify/discussions/workflows/handoff-to-specify.md`
- `.specify/discussions/workflows/handoff-to-specify.json`
- `.specify/discussions/workflows/requirements.md`
- `.specify/discussions/workflows/open-questions.md`
- `.specify/discussions/workflows/technical-options.md`
- `.specify/discussions/workflows/project-context.md`

## Outstanding Questions

- Exact storage location for runtime skill audit and final report provenance must be resolved during planning.
- Exact UI copy/layout for grouped editor sections and status labels must be resolved during implementation design.
- Exact coverage matrix for current existing behavior versus missing/hardening work must be produced by `/sp.plan`.

## Deferred / Future Ideas

- Required skill gates.
- Auto-executing recommended skills.
- Full workflow scheduler/engine.
- Reviewed project-owned skill bundling.
- Direct grouped persistence migration.
- Session-level cancel/resume recovery design.
