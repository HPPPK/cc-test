# Workflow Authoring Skill Creation Must Be Catalog-Visible

- id: `learn-2026-06-03-workflow-authoring-skill-create-catalog-visibility-7d1a6f0c2b`
- type: `pitfall`
- source_command: `sp-quick`
- recurrence_key: `workflow-authoring-skill-create-catalog-visibility`
- applies_to: `sp-quick`, `sp-implement`, `workflow_template_authoring`, `server workflow API`

## Problem

Workflow template authoring can appear fixed if the server can create a skill file, but agents still fail the root workflow if the capability is not visible through the authoring tool contract, guide, policy, and the same installed skill catalog used by the client.

## Lesson

For workflow phase skill authoring, treat `skill_create` as a full contract surface:

- Expose the operation in the API-bound tool schema and prompt.
- Tell agents to run `skill_catalog` before adding `phases[].skills`.
- If no installed skill fits, create a user skill and then reference the returned `recommendedReference`.
- Write only to a client-recognized skill directory.
- Reject overwrites and invalid skill names.
- Validate generated `SKILL.md` frontmatter/body.
- Confirm the created skill appears in the same catalog used by workflow validation and `/api/skills`.
- Keep `skill_create` mutating and phase-policy gated.

## Evidence

- Quick task: `.planning/quick/20260603-workflow-authoring-skill-installation`
- Focused tests passed:
  - `bun test src/server/__tests__/workflowTemplates.test.ts`
  - `bun test src/server/services/workflowTemplateAuthoringService.test.ts`
  - `bun test src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`
  - `bun test src/server/services/workflowTemplateAuthoringGuide.test.ts src/server/services/workflowToolPolicy.test.ts src/server/services/workflowTemplateRegistryService.test.ts`
- `bun run verify` still failed for external gate reasons: expired quarantine entries and native Windows Tauri permission failure.
