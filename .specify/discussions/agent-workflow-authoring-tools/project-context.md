# Project Context: Agent Workflow Authoring Tools

## Boundary

- Current project root: `F:\github\cc-jiangxia`
- Target project root: `F:\github\cc-jiangxia`
- Current project role: implementation target.
- Reference discussion: `.specify/discussions/workflow-template-management/`
- Cross-project transfer: none.

## Project Cognition Status

- `.specify/project-cognition/status.json` reports project cognition as stale/blocked.
- The cognition route was used only for advisory navigation.
- Technical claims in this discussion are based on live repository reads, not cognition authority.
- Follow-up map maintenance may be useful later because the cognition status says Workflows implementation changed after the active graph baseline.

## Live Evidence

- `src/tools.ts`
  - Built-in tools are assembled centrally.
  - Workflow-scoped tools are added separately.
  - The only current workflow-scoped tool name comes from `getWorkflowScopedToolNames`, which currently returns `submit_phase_completion` for active workflow states.

- `src/Tool.ts`
  - Built-in tools use a common `Tool` contract with schema, validation, permission, read-only/destructive metadata, prompt text, and transcript rendering hooks.
  - A workflow authoring tool can fit this contract and should define write/destructive behavior deliberately.

- `src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.tsx`
  - Current workflow-specific agent tool submits phase completion for user confirmation.
  - It supports a desktop API mode through environment variables and a direct runtime service path from workflow context.
  - It does not create or mutate workflow templates.

- `src/server/services/workflowTemplateRegistryService.ts`
  - User workflow templates are stored under a cc-jiangxia workflow config path based on `CLAUDE_CONFIG_DIR` or `~/.claude`.
  - The service includes builtin template data and user template validation.
  - Validation requires template identity fields and a non-empty ordered phase array; phase validation requires id, name, instructions, completion criteria, output artifact, handoff intake/rules, and transition authority.
  - Validation rejects unsupported parallel, nested, branching, and loop workflow shapes.
  - The write path rejects invalid existing config, validates payloads, preserves unknown fields, writes JSON, and resets registry cache.
  - Builtin id shadowing is rejected.

- `src/server/api/workflowTemplates.ts`
  - `/api/workflows/templates` supports list, create, detail, update, delete, validate, duplicate, import preview, import commit, and export.
  - Builtin templates are read-only for direct mutation; duplication to user templates is supported.
  - Import overwrite is rejected by default.

- `src/server/services/workflowTypes.ts`
  - Workflow template and session types include lifecycle statuses, template source statuses, template snapshots, phase definitions, artifact pointers, and transition records.

- `src/server/services/workflowRuntimeService.ts`
  - Workflow sessions operate from snapshots and transition state through phase completion/confirmation logic.
  - This supports the requirement that template edits should affect future sessions, not active session state.

- `src/server/services/workflowToolPolicy.ts`
  - Non-implementation workflow phases deny implementation tools.
  - Workflow prompt guidance currently names only `submit_phase_completion`.
  - Any workflow authoring tool exposure must account for phase action policy.

- `desktop/src/api/sessions.ts`
  - Desktop code already has typed wrappers for all workflow template API operations.

- `desktop/src/components/workflow/WorkflowTemplateManager.tsx`
  - Manual Settings UI lists templates, shows invalid diagnostics, creates, imports, exports, copies, edits, and deletes user templates.

- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
  - Manual editor maps UI form state into workflow template draft fields including template id/name/description, phases, role, objective, instructions, intake, handoff, execution rules, output artifact, completion criteria, transition authority, requested model, and skills.

- `src/server/__tests__/workflowTemplates.test.ts`
  - Tests cover current workflow template API behavior, no-write validation, builtin read-only behavior, user create/update/delete, duplicate, import/export, conflict handling, and stable errors.

## Inference Notes

- The existing server API and registry service are a strong source of reusable semantics for agent-side authoring.
- A new agent tool should not invent a separate workflow template schema. It should use the same template draft shape and validation rules as manual Settings.
- The agent needs an explicit field-guide/schema-help surface because repository evidence shows several semantically linked fields are required together, not merely independent strings.
- Because existing writes preserve unknown fields and block invalid existing config, the new tool should preserve those behaviors as product requirements, not implementation details.
- Since active workflow sessions use snapshots, template mutation should be framed as a future-session change unless a separate explicit session-migration feature is later scoped.

## Evidence Gaps

- The desired agent approval/commit model is not in repository evidence; it is a product decision.
- The exact exposure scope for a workflow authoring tool is not proven by repository evidence; it should be selected before implementation planning.
