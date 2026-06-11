# Project Context: Workflows

## Boundary Status

- current_project_root: F:\github\cc-jiangxia
- active_repository_role: discussion host and product-direction target
- target_project_root: F:\github\cc-jiangxia
- target_boundary_status: locked at product-direction level
- boundary_confidence: medium

## Evidence Used So Far

- Existing discussion directories were inspected for session selection:
  - `.specify/discussions/workflow-template-management/`
  - `.specify/discussions/agent-workflow-authoring-tools/`
- Both existing discussions are `handoff-ready`, so the user selected a fresh session.

## Project Cognition

- latest_cognition_intent: discussion
- latest_cognition_readiness: unavailable-on-2026-06-11-runtime-ui-pass
- baseline_health: stale/blocked, dirty=true, graph_ready=true
- latest_attempt: `project-cognition.exe lexicon --intent discussion --query "workflow runtime UI controls confirm reject retry cancel resume auto-advance pending confirmation desktop" --mode catalog --format json`
- latest_attempt_result: command not found in PATH; no local project-cognition executable found by `rg --files | rg "project-cognition"`.
- query_plan:
  - selected_concepts: term:workflows, term:skills, term:agent, term:runtime, term:priority
  - rejected_concepts: term:higher, term:executable
  - expanded_queries: workflow skill runtime priority; agent skills workflows; workflow template skills execution
  - paths: src; desktop/src; .codex/skills; .agents/skills; .specify/discussions
  - selection_reason: User is discussing workflows as real skill-like executable capability with priority in cc-jiangxia.
- cognition_gap: Project cognition is stale/blocked. Treat it as route navigation only; current claims below are backed by live file reads.

## Live Repository Evidence

- `src/tools/SkillTool/prompt.ts`: SkillTool prompt says matching skills are a blocking requirement and should be invoked before generating any other response about the task.
- `src/tools/SkillTool/SkillTool.ts`: SkillTool validates a skill by name, handles inline skill processing, supports forked sub-agent skill execution through `context: fork`, records usage, and returns context modifiers that can affect allowed tools, model, and effort.
- `src/skills/loadSkillsDir.ts`: Skill frontmatter supports allowed-tools, disable-model-invocation, user invocability, hooks, context=fork, agent, effort, shell, and path metadata; non-MCP skills can run prompt shell expansion when loaded.
- `src/server/services/workflowTypes.ts`: WorkflowSkillDeclaration currently has source=template, guidance, provenance, optional, and open unknown fields. It does not encode a reference to executable SkillTool skills.
- `src/server/services/workflowRuntimeService.ts`: Workflow prompt assembly includes phase instructions, phasePrompt, action policy, required artifacts, completion criteria, prior artifacts, and skill guidance from skillProvenance.
- `src/server/services/workflowToolPolicy.ts`: Workflow prompt tool guidance explicitly says skill declarations are prompt-level guidance only and do not enable SkillTool globally.
- `src/tools.ts`: Base tool pool includes SkillTool and WorkflowTemplateAuthoringTool. Workflow-scoped tools currently resolve to SubmitPhaseCompletionTool for active workflows.
- `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx`: Workflow template authoring is a concrete mutating/read-only tool with phase-policy gating, validating that workflow capability surfaces already need lifecycle and permission policy.
- `.codex/skills/`: Current skill packages include non-prompt support files such as `webapp-testing/scripts/with_server.py`, `skill-creator/scripts/*`, `skill-creator/assets/eval_review.html`, `skill-creator/agents/*`, and `code-review-skill/assets/*`.
- `src/skills/loadSkillsDir.ts`: Skill sources include `commands_DEPRECATED`, `skills`, `plugin`, `managed`, `bundled`, and `mcp`; file-based skill paths come from policy settings, user settings, project settings, plugins, and additional directories.
- `src/server/api/workflowTemplates.ts`: Workflow export currently returns JSON with `schemaVersion`, `exportedAt`, and selected `templates`; export strips runtime `source/editable/copyable` but does not bundle external skill packages.
- `src/server/services/workflowTemplateValidation.ts`: Workflow phase `skills` currently normalize to objects with `name`, optional `source` among `user/project/builtin/unknown`, optional `reason`, and unknown fields preserved.
- `src/server/services/workflowTemplateRegistryService.ts`: Unknown fields are preserved during writes, including phase `skills`, by merging existing skill objects by name or index.
- `desktop/src/api/skills.ts`: Desktop Skills API client lists skills and loads skill detail through `/api/skills` and `/api/skills/detail` with cwd, source, and name.
- `desktop/src/stores/skillStore.ts`: Settings skill list/detail state is centralized in `useSkillStore`.
- `desktop/src/types/skill.ts`: Frontend skill source type includes `user`, `project`, `plugin`, `mcp`, and `bundled`.
- `src/server/api/skills.ts`: The current Settings skill API collects user, project, and plugin skill metadata and supports detail lookup for those sources.
- `desktop/src/components/skills/SkillList.tsx`: Settings > Skills groups current skills by source and opens detail through `useSkillStore`.
- `desktop/src/components/plugins/PluginDetail.tsx`: Enabled plugin skills can be opened through the shared skill detail flow.
- `desktop/src/__tests__/pluginsSettings.test.tsx`: Tests cover plugin skill navigation into the shared Skills page flow and disabled plugin capability navigation being blocked.
- `desktop/src/types/plugin.ts` and `src/server/services/pluginService.ts`: Plugins are represented as installable capability containers with commands, agents, skills, hooks, MCP servers, and LSP servers.
- `src/server/services/pluginService.ts`: Plugin detail serializes `skillEntries` separately from other plugin capabilities, and names plugin skills with plugin-qualified names.
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`: Workflow phase skills are currently edited through an advanced textarea; each line is converted into a phase skill declaration, optionally with a `name | reason` shape.
- `desktop/src/components/workflow/WorkflowTemplateManager.tsx`: Settings workflow manager already owns create/edit/copy/delete/import/export actions for workflow templates.
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`: Import preview and export generation already exist; this is the natural place to show workflow package dependency diagnostics.
- `desktop/src/components/workflow/WorkflowTemplatePicker.tsx`: Workflow start selection already shows invalid template diagnostics; this can eventually surface start-time dependency issues.
- `desktop/src/types/session.ts`: Phase transition actions are currently modeled as `confirm`, `reject`, `retry`, and `manual_complete`.
- `desktop/src/components/workflow/WorkflowTransitionControls.tsx`: Runtime controls prioritize pending confirmation, expose Confirm/Reject/Retry for pending states, use a summary/evidence dialog for manual completion, and send transition context including state version.
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`: Pending confirmation display takes priority over stale lifecycle status; blocked reason and artifact evidence are displayed separately from transition details.
- `desktop/src/pages/ActiveSession.tsx`: The active session strip wires workflow transition controls into the session view and hides controls for completed, stale-template, and missing-template states.
- `desktop/src/components/workflow/WorkflowComponents.test.tsx`: Existing tests assert pending confirmation controls carry idempotent context, pending confirmation outranks stale lifecycle status, manual completion requires summary/evidence, and blocked/unable states do not expose unsafe advancement actions.

## Coverage Gaps

- The primary user job for workflows is not yet known.
- The primary user job is now known at the direction level: workflows should become a capability layer that can bind real skills to phases, not only prose templates.
- Concrete implementation targets are not fully selected.
- Whether UI authoring and inspection of workflow skill bindings belongs in first scope is not yet known.
- The exact phase skill positioning is unresolved: contract, recommendation, capability set, or hybrid.
- Export/import behavior for referenced phase skills is unresolved.
- Existing validation source labels for skills do not cover all current skill sources such as managed, plugin, bundled, and MCP.
- The Settings skill API and runtime skill loader may not currently expose exactly the same source universe; workflow authoring should not treat the Settings UI list as complete until the underlying catalog is aligned.
- Project cognition runtime was unavailable for the 2026-06-11 runtime UI controls pass; recommendations are based on live file reads and should be rechecked if cognition tooling is restored before formal handoff.

## Inference Notes

- Project cognition is advisory only; live repository files above are the source of truth for discussion claims.
- The repository already separates executable skills from workflow prompt guidance, so making phase skills "real" requires changing workflow semantics, not only renaming fields.
- Workflow phase skill design must account for tool permissions, forked agents, shell expansion, model/effort modifiers, and session resume provenance.
- The Settings page is not itself the integration boundary; the underlying skill catalog/API should be the integration boundary so workflow authoring, import/export, settings, and runtime resolution stay aligned.
- Product concept: a plugin is a package/distribution boundary, while a skill is an agent-invocable capability. A workflow phase skill should primarily reference the skill; plugin identity should be preserved as source/provenance and import dependency when relevant.
- Runtime UI concept: phase transition controls should represent completion authority only. Cancel/resume are broader session lifecycle controls and should not be folded into the same component without a separate recovery contract.
