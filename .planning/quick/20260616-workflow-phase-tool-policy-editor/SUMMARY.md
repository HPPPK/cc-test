# Editable Workflow Phase Tool Policy

## Outcome

Implemented editable per-phase workflow tool policy for user-authored workflow templates. Settings workflow editor now shows a Tool access section for each phase, covering known managed runtime tools and workflow built-in tools. Server-side validation and runtime enforcement now understand the same policy.

## Changed Code Paths

Modified:
- `src/server/services/workflowTypes.ts`
- `src/server/services/workflowTemplateValidation.ts`
- `src/server/services/workflowToolPolicy.ts`
- `src/tools.ts`
- `src/server/services/workflowToolPolicy.test.ts`
- `src/server/services/workflowTemplateRegistryService.test.ts`
- `src/server/__tests__/websocket-handler.test.ts`
- `desktop/src/types/session.ts`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- `desktop/src/components/workflow/WorkflowComponents.test.tsx`
- `desktop/src/i18n/locales/en.ts`
- `desktop/src/i18n/locales/zh.ts`

Added:
- `.specify/project-cognition/updates/20260616-workflow-phase-tool-policy-editor.json`

Deleted: none
Renamed: none

## Changed Behavior Surfaces

- Workflow templates may define `phase.toolPolicy.allowedTools` or `phase.contract.toolPolicy.allowedTools`.
- Template validation rejects unknown tool names and invalid `toolPolicy` shapes.
- Runtime phase tool gating uses explicit `allowedTools` when present; otherwise existing phase defaults remain unchanged.
- Workflow built-in tools are configurable: `submit_phase_completion` and `workflow_template_authoring` can be allowed or denied per phase.
- `assembleWorkflowToolPool` filters both base tools and workflow-scoped tools using the active phase policy, so in-process agent workers follow the same phase policy.
- WebSocket session startup passes matching `disallowedTools` for custom phase policies.
- Desktop workflow template editor exposes runtime tools and workflow tools per phase, warns when `submit_phase_completion` is disabled, and preserves backward compatibility by not writing default `toolPolicy` into old templates unless the user edits it or a policy already exists.

## Verification Evidence

- `bun test src/server/services/workflowToolPolicy.test.ts src/server/services/workflowTemplateRegistryService.test.ts src/server/__tests__/websocket-handler.test.ts src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.test.ts src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts` passed.
- `cd desktop; bun test src/components/workflow/WorkflowComponents.test.tsx -t "per-phase runtime"` passed.
- `bun run check:server` passed.
- `bun run check:desktop` passed.
- `bun run check:native` passed after stopping exact repo sidecar PIDs `64536`, `32172`, and `11908`, which were locking `desktop/src-tauri/target/debug/claude-sidecar.exe`.
- `bun run verify` rerun produced `artifacts/quality-runs/2026-06-16T10-10-14-960Z/report.md`: all executed lanes passed (`passed=9`, `failed=0`, `skipped=2`), but the process exited 1 because the broader dirty worktree is policy-blocked by CLI-core/provider changes and live-provider escalation outside this quick task.

## Project Cognition Refresh

Prepared payload:
- `.specify/project-cognition/updates/20260616-workflow-phase-tool-policy-editor.json`

Refresh status:
- `project-cognition update --payload-file ".specify/project-cognition/updates/20260616-workflow-phase-tool-policy-editor.json" --reason workflow-finalize --format json` failed with local DB schema mismatch: `project-cognition.db metadata schema_version has "1", expected "2"`.
- Fallback `project-cognition mark-dirty --reason "workflow-phase-tool-policy-editor closeout update blocked by project-cognition.db schema_version 1 expected 2" --format json` failed with the same schema mismatch.

## Known Unknowns

- Full PR readiness remains blocked by broader dirty-worktree policy requirements unrelated to this quick task.
- Live provider smoke was not run; local mock/request-shape and workflow runtime coverage passed.
- Running workflow sessions need restart/retry before new phase tool policy applies to their launched tool set.
