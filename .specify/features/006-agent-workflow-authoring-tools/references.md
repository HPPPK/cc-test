# References: Agent Workflow Authoring Tools

## Discussion Sources

- `.specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.md`
- `.specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.json`
- `.specify/discussions/agent-workflow-authoring-tools/discussion-log.md`
- `.specify/discussions/agent-workflow-authoring-tools/requirements.md`
- `.specify/discussions/agent-workflow-authoring-tools/open-questions.md`
- `.specify/discussions/agent-workflow-authoring-tools/technical-options.md`
- `.specify/discussions/agent-workflow-authoring-tools/project-context.md`

## Repository Evidence

- `src/tools.ts`: global and workflow-scoped built-in tool assembly.
- `src/Tool.ts`: tool contract, permission hooks, read-only/destructive metadata, validation, transcript rendering.
- `src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.tsx`: existing workflow-specific tool precedent.
- `src/server/services/workflowTemplateRegistryService.ts`: workflow template validation, builtin definition, user config persistence, cache reset, unknown-field merge behavior.
- `src/server/api/workflowTemplates.ts`: manual workflow template API operations and builtin/user protections.
- `src/server/services/workflowTypes.ts`: workflow template/session/source status and snapshot types.
- `src/server/services/workflowRuntimeService.ts`: workflow runtime snapshot and phase transition behavior.
- `src/server/services/workflowToolPolicy.ts`: active workflow phase action policy and disallowed-tool logic.
- `desktop/src/api/sessions.ts`: desktop workflow template API client.
- `desktop/src/types/session.ts`: desktop workflow template and session types.
- `desktop/src/components/workflow/WorkflowTemplateManager.tsx`: Settings Workflows template list and mutation UI.
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`: manual editor field mapping into template draft contract.
- `src/server/__tests__/workflowTemplates.test.ts`: current server API contract coverage for validation, builtin protections, create/update/delete/duplicate/import/export, and no-write behavior.

## Prior Related Work

- `.specify/discussions/workflow-template-management/`: upstream Workflows management discussion referenced by the handoff.
- `.specify/features/005-specify-discussions-workflow/`: implemented Workflows management package with final evidence; not the active feature but relevant background.

## Project Memory And Rules

- `.specify/memory/constitution.md`: spec-first workflow, evidence and verification expectations.
- `.specify/memory/project-rules.md`: project-local rule surface.
- `.specify/memory/learnings/INDEX.md`: checked during specify intake; no task-specific learning changed the requirements.
- Repository `AGENTS.md` / supplied instructions: persistent storage compatibility, protected user state, feature quality contract, and verification gate expectations.

## Evidence Notes

- Project cognition was used as advisory navigation only; live repository reads are the authority for code and behavior claims.
- The final spec preserves all MP-001 through MP-022 items and CA-001 through CA-011 obligations from the user-confirmed discussion handoff.
