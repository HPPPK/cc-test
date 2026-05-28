# Project Context: Workflow Template Management

## Boundary

- current_project_root: `F:\github\cc-jiangxia`
- target_project_root: `F:\github\cc-jiangxia`
- current project role: implementation target and evidence source
- reference sources: live repository files
- external systems: none identified

## Project Cognition

- status file: `.specify/project-cognition/status.json`
- status: ok, fresh, query-ready
- lexicon/query term: workflow
- readiness returned: query_ready
- minimal live reads returned:
  - `desktop/src/pages/Settings.tsx`
  - `desktop/src/pages/EmptySession.tsx`
  - `desktop/src/components/workflow/WorkflowTemplatePicker.tsx`
  - `desktop/src/api/sessions.ts`
  - `desktop/src/types/session.ts`
  - `src/server/services/workflowTemplateRegistryService.ts`
  - `src/server/api/sessions.ts`
  - `src/server/services/workflowTypes.ts`

## Live Evidence

- `desktop/src/pages/Settings.tsx` defines Settings tab navigation and renders per-tab content.
- `desktop/src/stores/uiStore.ts` defines the `SettingsTab` union and pending settings tab routing.
- `desktop/src/i18n/locales/en.ts` and `desktop/src/i18n/locales/zh.ts` contain settings tab labels.
- `desktop/src/pages/EmptySession.tsx` loads workflow templates on mount, stores valid and invalid templates, and creates workflow sessions with `templateId`, `templateSource`, and `initialPhaseId`.
- `desktop/src/components/workflow/WorkflowTemplatePicker.tsx` renders startable templates and invalid template issue messages.
- `desktop/src/api/sessions.ts` exposes `listWorkflowTemplates()` backed by `GET /api/workflows/templates`.
- `desktop/src/types/session.ts` exposes frontend workflow template list and validation issue types.
- `src/server/router.ts` routes `/api/workflows/templates` to `handleWorkflowTemplatesApi`.
- `src/server/api/sessions.ts` currently implements the workflow template API as GET-only and returns template list summary plus invalid template issues.
- `src/server/services/workflowTemplateRegistryService.ts` owns workflow template loading and writing:
  - built-in template id: `agent-development`
  - user config path: `~/.claude/cc-jiangxia/workflows.json`, via `CLAUDE_CONFIG_DIR` override in tests
  - user templates are schema version 1
  - invalid user config does not remove the built-in template
  - user templates cannot shadow the built-in template id
  - writeTemplates preserves unknown top-level, template, phase, skill, artifact, completion, and transition fields
  - first release rejects branching, loops, parallel, and nested workflow definitions
- `src/server/services/workflowTypes.ts` defines phase-level fields used by runtime: `instructions`, optional `requestedModel`, `skillDeclarations`, `requiredArtifacts`, `completionCriteria`, `transitionAuthority`, optional `actionPolicy`, and optional `phasePrompt`.
- `src/server/services/workflowRuntimeService.ts` assembles the active phase prompt from:
  - phase instructions
  - structured `phasePrompt`
  - action policy
  - required artifacts
  - completion criteria
  - prior artifacts
  - skill guidance
  - requested/actual model information
- `desktop/src/components/chat/ChatInput.tsx` has launch-time state for workflow templates and selected workflow template. It loads templates for hero composer launch controls and includes `{ templateId, templateSource, initialPhaseId }` only when creating a new session.
- `desktop/src/pages/ActiveSession.tsx` derives workflow display from `session.workflow` and renders `WorkflowStatusPanel`, `WorkflowTransitionControls`, and `WorkflowReportLink` when workflow metadata exists.
- `desktop/src/stores/chatStore.ts` recognizes workflow session summaries by `mode: 'workflow'`, `templateId`, phase index/count, and pending confirmation fields.
- `src/server/api/sessions.ts` creates workflow metadata inside `createSession` only when the request body includes a `workflow` object.
- `src/commands/compact/index.ts` defines `/compact` as clearing conversation history while keeping a summary in context, with optional custom summarization instructions.
- `src/commands/compact/compact.ts` implements `/compact` by compacting messages through the available session-memory, reactive, or traditional compaction path and returning a compaction result.

## Inference Notes

- A Settings management page can likely reuse or extend the existing registry service rather than inventing a new storage location.
- Any edit/create/delete API would be a new server API surface, because the current desktop API only lists templates.
- A full visual editor would need a larger schema-aware UI and validation contract than a list/import/raw-JSON management screen.
- The user's phrase "系统提示词" maps most closely to the runtime's combined phase context. Product copy should probably call it "phase prompt" or "phase instructions/protocol" instead of implying it replaces the global system prompt.
- User confirmed first-version custom templates are global, so project-level storage, discovery, merge precedence, and conflict handling should stay out of scope.
- Current live evidence supports launch-time workflow selection. In-place conversion of an existing dialogue session into workflow mode would need new API semantics and migration/recovery rules.
- The user's "summarize current context before Workflows" idea maps to the existing `/compact` product semantics. Implementation should still verify whether invoking the slash command path directly is appropriate or whether the UI needs an internal API wrapper around the same compaction service behavior.

## Coverage Gaps

- Hard product gaps are resolved for handoff: first version includes global user-level CRUD management, JSON import/export, protected built-ins, required phase output/handoff contracts, and composer `+ > Workflows` entry.
- Soft UX gaps remain for downstream specification/planning: exact raw JSON affordance depth, invalid-template shortcut placement, and exact API mechanics for linked workflow session creation with inherited or compacted context.
- Existing code evidence proves current registry persistence mechanics, launch-time workflow selection, session metadata creation path, and `/compact` semantics. New mutation and linked-session API details must be designed and verified downstream.

## External Reference: Claude Code Workflows

- Checked current official Claude Code docs on 2026-05-26.
- Official docs use "workflow" broadly and describe several reusable/automated workflow surfaces:
  - Skills: reusable instructions/checklists/procedures invocable as slash commands or automatically when relevant.
  - Commands: slash-command entry points for common actions; bundled skills are listed alongside built-in commands.
  - `/batch`: bundled skill for decomposing large work and running parallel worktree agents.
  - `/loop`: bundled skill for repeated prompts.
  - `/schedule`: routines that run prompts on cloud infrastructure.
  - `/run`, `/verify`, `/run-skill-generator`: bundled skills for run/verify workflows and recording a project-specific launch recipe.
  - Hooks/subagents/plugins: composable automation and packaging surfaces around skills.
- No stable official standalone `/workflow` feature was found in current public docs. Unofficial reports mention `/workflow` being removed or not yet available, so this should not be treated as a design contract.
- Design implication for this project: use Claude Code's Skills/Commands model as UX inspiration for discoverability, invocation, args, safety, and composability, while keeping this repo's Workflows model as a first-class UI-managed staged session system.
