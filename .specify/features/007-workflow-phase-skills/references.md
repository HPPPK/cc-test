# References: Workflow Phase Skills

## Discussion Artifacts

- `.specify/discussions/workflows/handoff-to-specify.md`
- `.specify/discussions/workflows/handoff-to-specify.json`
- `.specify/discussions/workflows/discussion-log.md`
- `.specify/discussions/workflows/requirements.md`
- `.specify/discussions/workflows/open-questions.md`
- `.specify/discussions/workflows/technical-options.md`
- `.specify/discussions/workflows/project-context.md`
- `.specify/discussions/workflows/discussion-state.md`

## Repository Evidence

- `src/tools/SkillTool/prompt.ts`
- `src/tools/SkillTool/SkillTool.ts`
- `src/skills/loadSkillsDir.ts`
- `src/tools.ts`
- `src/server/services/workflowTypes.ts`
- `src/server/services/workflowRuntimeService.ts`
- `src/server/services/workflowToolPolicy.ts`
- `src/server/services/workflowTemplateValidation.ts`
- `src/server/services/workflowTemplateRegistryService.ts`
- `src/server/services/workflowFinalReport.ts`
- `src/server/services/workflowReportStore.ts`
- `src/server/api/workflowTemplates.ts`
- `src/server/api/skills.ts`
- `src/server/api/sessions.ts`
- `desktop/src/types/skill.ts`
- `desktop/src/types/session.ts`
- `desktop/src/api/skills.ts`
- `desktop/src/api/sessions.ts`
- `desktop/src/stores/skillStore.ts`
- `desktop/src/components/skills/SkillList.tsx`
- `desktop/src/components/plugins/PluginDetail.tsx`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
- `desktop/src/components/workflow/WorkflowImportExportDialog.tsx`
- `desktop/src/components/workflow/WorkflowTemplateManager.tsx`
- `desktop/src/components/workflow/WorkflowStatusPanel.tsx`

## Verification Reference Points

- `src/server/__tests__/workflowTemplates.test.ts`
- `src/server/__tests__/skills.test.ts`
- `src/server/__tests__/sessions.test.ts`
- `src/server/services/workflowRuntimeService.test.ts`
- `src/server/services/workflowFinalReport.test.ts`
- `src/server/services/workflowReportStore.test.ts`
- `src/server/services/workflowTemplateRegistryService.test.ts`
- `src/server/services/workflowToolPolicy.test.ts`
- `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`
- `desktop/src/components/workflow/WorkflowComponents.test.tsx`
- `desktop/src/__tests__/skillsSettings.test.tsx`
- `desktop/src/__tests__/pluginsSettings.test.tsx`
- `desktop/src/api/sessions.test.ts`
- `desktop/src/stores/sessionStore.test.ts`
- `src/services/compact/workflowSummaryCarryover.test.ts`

## Project Cognition

- `.specify/project-cognition/status.json`
- `project-cognition lexicon --intent plan` returned `readiness: blocked`.
- `project-cognition query --intent plan` returned route candidates but `baseline_health.readiness: blocked`, so all technical claims in the spec must be verified through live repository reads.
