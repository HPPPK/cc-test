# Remove Builtin Workflow Templates

## Outcome

The product no longer registers or exposes a default builtin workflow template. Workflow templates now come from user creation or import. The former builtin id `agent-development` is no longer reserved and can be used by normal user/imported templates.

Legacy `templateSource: "builtin"` and `source: "builtin"` recognition remains in types/routes/UI compatibility paths so older persisted session metadata is not broken by this quick task.

## Changed Code Paths

modified:
- `src/server/services/workflowTemplateRegistryService.ts`
- `src/server/services/workflowTemplateValidation.ts`
- `src/server/api/workflowTemplates.ts`
- `src/server/services/workflowTemplateAuthoringGuide.ts`
- `src/server/services/workflowTemplateAuthoringService.ts`
- `scripts/quality-gate/workflow-session-mode-smoke.ts`
- `desktop/src/pages/EmptySession.test.tsx`
- `desktop/src/components/workflow/WorkflowComponents.test.tsx`
- `src/server/__tests__/workflowTemplates.test.ts`
- `src/server/__tests__/sessions.test.ts`
- `src/server/services/workflowTemplateRegistryService.test.ts`
- `src/server/services/workflowTemplateAuthoringGuide.test.ts`
- `src/server/services/workflowTemplateAuthoringService.test.ts`
- `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`
- `scripts/quality-gate/workflow-session-mode-smoke.test.ts`

added:
- `.planning/quick/20260612-remove-builtin-workflows/SUMMARY.md`
- `.specify/project-cognition/updates/20260612-remove-builtin-workflows.json`

## Changed Behavior Surfaces

- Server workflow template registry starts empty when there are no user templates.
- `/api/workflows/templates` no longer lists a builtin Agent Development template.
- Former builtin id `agent-development` is valid for create/import/export/user duplicate flows.
- Import preview treats `agent-development` like a normal id unless it conflicts with an existing user template.
- Workflow authoring guide/tool behavior no longer warns about or repairs a builtin-id conflict.
- Workflow session smoke now creates an explicit user template before starting a workflow.
- Desktop empty-session and workflow component tests now model user/imported templates as the supported path.

## Verification Evidence

- `bun test src/server/services/workflowTemplateRegistryService.test.ts src/server/__tests__/workflowTemplates.test.ts src/server/services/workflowTemplateAuthoringGuide.test.ts src/server/services/workflowTemplateAuthoringService.test.ts scripts/quality-gate/workflow-session-mode-smoke.test.ts` -> 118 pass.
- `bun test src/server/__tests__/sessions.test.ts` -> 146 pass.
- `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx src/pages/EmptySession.test.tsx src/api/sessions.test.ts` -> 90 pass across 3 files.
- `cd desktop; bun run lint` -> pass.
- `bun run check:server` -> 1161 pass, 7 skip.
- `bun run check:desktop` -> 98 files passed, 861 tests passed, typecheck and Vite build passed.
- `git diff --check -- <touched workflow files>` -> no whitespace errors; Windows LF/CRLF conversion warnings only.

## Not Checked

- Full `bun run verify` was not run in this pass. The narrower required server and desktop gates for the touched surfaces passed.
- Manual browser smoke was not run. The desktop production build and same-area Testing Library coverage passed.

## Project Cognition Refresh

Payload written to `.specify/project-cognition/updates/20260612-remove-builtin-workflows.json`.

Inline update command:

```text
project-cognition update --payload-file .specify/project-cognition/updates/20260612-remove-builtin-workflows.json --reason workflow-finalize --format json
```

Result: `update_id` `upd-20260612T090909.451923900Z`, `result_state` `partial_refresh`, readiness `review`. The update recorded the changed paths and verification, but project cognition is still not fully clean; live reads and tests remain the authority for this task's completion claim.
