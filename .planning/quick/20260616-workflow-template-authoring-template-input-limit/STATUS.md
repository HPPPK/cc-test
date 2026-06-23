---
id: 20260616
slug: workflow-template-authoring-template-input-limit
title: Increase workflow_template_authoring template input limit
status: completed
trigger: "$sp-quick workflow_template_authoring template parameter JSON input size limit can be increased"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: native-subagents
created: 2026-06-16T10:15:44.1963260+08:00
updated: 2026-06-16T10:35:00.0000000+08:00
---

# Quick Status

## Understanding

The reported limit is on the `workflow_template_authoring` tool-call input, specifically the `template` parameter payload size accepted by the tool framework/provider path.

This is not the workflow phase policy issue and not a `workflows.json` persistence or workflow schema file-size limit.

## Scope Boundaries

- Do not mutate the user's live `workflows.json`.
- Do not relax workflow template validation unless evidence shows the input limit is incorrectly implemented there.
- Preserve the API-bound tool schema object-root contract from the prior tool schema learning.
- Keep the change focused on the authoring tool input contract or framework limit owner.

## Project Cognition

- Lexicon generation: `GEN-20260610T112843.959253900Z`.
- Selected concept: `concept:GEN-20260610T112843.959253900Z:N-030`.
- Route pack indicated likely paths:
  - `src/tools/WorkflowTemplateAuthoringTool`
  - `src/server/services/workflowTemplateAuthoringService.ts`
  - `src/server/services/workflowTemplateValidation.ts`
  - `src/utils/zodToJsonSchema.ts`

## Minimal Live Reads

- `WorkflowTemplateAuthoringTool.tsx` defines `templateSchema = z.unknown()` and explicit API schema `template` as an object with `additionalProperties: true`.
- `WorkflowTemplateAuthoringTool.test.ts` has coverage for API-bound object root but not a large template payload.
- `workflowTemplateAuthoringService.ts` accepts `template: unknown`; no template size cap was visible in the first pass.
- No direct `maxLength` for `template` was found in the initial route-pack search.

## Consequence Classification

`triggered_bounded`

Affected surface:
- `workflow_template_authoring` tool input schema/contract.
- Provider/tool framework serialization or validation around tool-call input.
- Existing validation path for `validate`, `create`, and `update` operations.

Required controls:
- Add focused regression coverage for a larger `template` payload.
- Keep workflow semantic validation intact.
- Verify API-bound tool schema remains top-level object-root.

## Next Steps After Confirmation

1. Locate the actual input-size owner in the tool framework/provider serialization path. Done.
2. Increase the allowed payload for this tool or parameter using the narrowest local mechanism. Done.
3. Add focused tests proving a large workflow template payload is accepted and advertised safely. Done.
4. Run the narrow relevant tests before handoff. Done.

## Outcome

- Added per-tool `eagerInputStreaming` support and enabled it for `workflow_template_authoring`.
- Preserved the existing first-party-only guard before forwarding `eager_input_streaming` to the API.
- Updated MCP tool-list schema publication to prefer explicit `inputJSONSchema` and return a cloned schema object.
- Added tests for eager input streaming, large template validation payloads, and MCP schema publication.

## Verification

- `bun test src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts src/entrypoints/mcp.test.ts`
- `bun run check:server`
