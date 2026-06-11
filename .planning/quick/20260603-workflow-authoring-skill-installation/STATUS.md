# Quick Task Status: Workflow Authoring Skill Installation

## State

- command: `$sp-quick`
- status: resolved
- understanding_confirmed: true
- execution_model: subagent-preferred
- execution_surface: native-subagents
- dispatch_shape: one-subagent
- summary_artifact: `.planning/quick/20260603-workflow-authoring-skill-installation/SUMMARY.md`

## User Request

Root-fix workflow creation so agents do not add missing phase skills blindly. When a workflow needs a skill that is not installed, the authoring path should know how to create/install that skill in a location the client recognizes as installed.

## Project Cognition

- lexicon_generation_id: `GEN-20260528T034105.715065300Z`
- readiness: `review`
- baseline_health: `partial_refresh`, dirty
- selected concepts:
  - `server.api.workflow_templates`
  - `desktop.workflow.template-manager`
- rejected concepts:
  - docs/agent corpus: broad docs surface, not primary behavior
  - built-in agent catalog: "agent" is actor wording, not agent role catalog
  - GitHub Actions workflow concepts: false-positive `workflow` match
  - empty session / task runtime / sessions workflow API: adjacent but not root authoring surface
- minimal_live_reads:
  - `src/server/api/workflowTemplates.ts`
  - `src/server/__tests__/workflowTemplates.test.ts`
  - `src/server/services/workflowTemplateAuthoringService.ts`
  - `src/server/services/workflowTemplateRegistryService.ts`
  - `src/server/services/workflowPhaseSkillResolver.ts`
  - `desktop/src/components/workflow/WorkflowTemplateManager.tsx`
  - `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
  - `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- missing_coverage: none reported by cognition; live reads still required before technical claims.

## Understanding Checkpoint Draft

- Understood problem: `workflow_template_authoring` currently can produce workflow templates whose phase `skills` refer to skills unavailable in the environment, causing Settings > Workflow diagnostics like `WORKFLOW_PHASE_SKILL_MISSING`.
- Planned outcome: make the authoring flow skill-aware: before adding phase skills, it must verify them against the installed skill catalog; when missing, it must expose a concrete create/install path for an agent-authored skill that the client will later treat as installed.
- Scope boundary: focus on workflow template authoring, skill catalog/install path, server validation, and only the workflow settings UI diagnostics if live reads show response shape changes require it. Do not change GitHub Actions workflows or broad agent runtime behavior.
- Execution approach: after confirmation, inspect the minimal live reads, dispatch one focused implementation lane when available, then integrate and verify with same-area tests.
- Validation evidence expected: focused server tests for authoring/catalog/validation behavior, any affected workflow API/UI tests, and the narrow project check required by the changed surface.

## Confirmation

- confirmed_by_user: yes
- confirmed_at: 2026-06-03

## Dispatch Notes

- one-subagent dispatch attempted with read-only explorer.
- result: failed with upstream `502 Bad Gateway`.
- fallback: `$sp-quick` light-tier leader-inline fallback activated.
- current retry: native subagent tools are available in this session; dispatching one executor lane for the bounded server authoring/skill installation fix.
- join result: executor returned `DONE_WITH_CONCERNS`; focused server tests passed, broad server gate blocked by expired quarantine entries, direct no-emit blocked by repo tooling setup.

## Current Focus

- goal: make workflow template authoring verify phase skills against installed skills and expose/create a client-recognized skill install path when missing.
- current_focus: scoped implementation, focused verification, and partial project cognition closeout recorded.
- next_action: none for scoped implementation; external follow-up is quarantine/native gate recovery before PR readiness.

## Senior Consequence Analysis

### Affected Object Map

- Workflow template authoring service/API operations for guide, skill catalog, create, update, validate.
- Workflow template registry and phase skill resolver that determine whether a referenced skill is available.
- Installed skill directories recognized by the client/server, including user/project/managed sources discovered by the catalog.
- User workflow template JSON and imported templates.
- Settings workflow template diagnostics that surface invalid or warning states.
- Authoring agents that consume `workflow_template_authoring` guidance.

### State-Behavior Matrix

- Created workflow: must either reference resolvable skills or return explicit unresolved-skill diagnostics/repair guidance.
- Updated workflow: must not silently introduce missing phase skills.
- Imported workflow: should remain diagnosable; import compatibility must not break unexpectedly.
- Missing skill: must point to a supported skill creation/install path rather than leaving only a warning.
- Existing skill: should be source-qualified or otherwise unambiguous enough for validation.
- Duplicate/ambiguous skill names: must avoid nondeterministic references where possible.
- Partially refreshed catalog: authoring should validate against current registry result and surface stale/refresh limitations.

### Dependency Impact Table

- Direct dependencies: `WorkflowTemplateAuthoringService`, `WorkflowTemplateRegistryService`, `workflowPhaseSkillResolver`, workflow templates API.
- Indirect consumers: desktop workflow settings manager/editor/import-export dialogs, authoring agents, user templates.
- Shared state: installed skill directories and user-owned workflow template config.
- Compatibility surfaces: template JSON shape, phase skill object shape, API response diagnostics.
- Validation routes: same-area server tests, workflow API tests, desktop tests only if UI semantics change.

### Recovery And Validation Contract

- Do not overwrite existing user skills implicitly.
- Any skill creation path must be explicit, idempotent for already-existing skills, and validation-backed.
- Preserve existing valid templates and unknown template fields where current code expects that.
- Verify missing-skill prevention and create/install guidance with tests before completion.
- Record project cognition update after behavior-bearing source/test changes.

### Coverage Gaps

- Live code has not yet proven whether a skill creation API already exists.
- Live code has not yet proven whether missing recommended skills should be hard-blocked or remain warnings with repair capability.
- Latest safe resolve phase: before implementation edits.
- Routing decision: continue after user confirmation with minimal live reads; ask/escalate only if live reads reveal multiple incompatible product choices.

### Consequence Obligations

- CA-001: Authoring must not write templates with unresolved recommended skills without exposing validation diagnostics and a repair/install path. Owner: `sp-quick`. Latest resolve phase: implementation. Stop-and-reopen: diagnostics can still be produced only after Settings refresh with no authoring-time warning.
- CA-002: Skill creation/install support must write only to a cataloged client-recognized directory, validate `SKILL.md`, and avoid overwriting existing skills. Owner: `sp-quick`. Latest resolve phase: implementation. Stop-and-reopen: created skills are invisible to `skill_catalog` or overwrite existing content.
- CA-003: Skill references should be deterministic enough to avoid ambiguous user/managed/bundled names when the catalog exposes source information. Owner: `sp-quick`. Latest resolve phase: implementation or explicit bounded non-goal. Stop-and-reopen: same skill name can resolve unpredictably.
- CA-004: Existing valid templates/imports must remain compatible unless a tested migration/error contract is added. Owner: `sp-quick`. Latest resolve phase: validation. Stop-and-reopen: create/update/import rejects previously valid templates without documented/tested reason.

## Validation

- `bun test src/server/__tests__/workflowTemplates.test.ts`: 50 pass, 0 fail.
- `bun test src/server/services/workflowTemplateAuthoringService.test.ts`: 33 pass, 0 fail.
- `bun test src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`: 23 pass, 0 fail.
- `bun test src/server/services/workflowTemplateAuthoringGuide.test.ts src/server/services/workflowToolPolicy.test.ts src/server/services/workflowTemplateRegistryService.test.ts`: 42 pass, 0 fail.
- `git diff --check -- <scoped files>`: no whitespace errors; LF/CRLF warnings only.
- `bun run check:quarantine`: failed because expired quarantine entries require review: `server:cron-scheduler`, `server:providers-real`, `server:tasks`, `server:e2e:business-flow`, `server:e2e:full-flow`.
- `bun run check:server`: failed before server tests for the same expired quarantine entries.
- `bun run verify`: failed, report `artifacts/quality-runs/2026-06-03T07-46-47-767Z/report.md`, summary passed=4 failed=5 skipped=2.
- `project-cognition update --payload-file .specify/project-cognition/updates/20260603-workflow-authoring-skill-installation.json --reason workflow-finalize --format json`: `partial_refresh`, update id `upd-20260603T075044.383332400Z`, readiness remains `review`.

## Summary Pointer

- summary_path: `.planning/quick/20260603-workflow-authoring-skill-installation/SUMMARY.md`
- resume_decision: resolved for scoped implementation; PR readiness remains blocked by external quality gates recorded in `SUMMARY.md`.
