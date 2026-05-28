---
status: resolved
created: 2026-05-28T10:20:00+08:00
updated: 2026-05-28T11:47:18+08:00
symptom: API Error 400 reports invalid schema for function `workflow_template_authoring`; schema must be JSON Schema type object but got type null.
execution_model: leader-inline
dispatch_shape: leader-inline
execution_surface: leader-inline
dispatch_reason: "Small focused investigation: one new tool, one API schema validation error, one likely schema conversion path."
blocked_reason: none
causal_map_completed: true
investigation_contract_completed: true
log_investigation_plan_completed: true
observer_framing_completed: true
skip_observer_reason: map-backed-minimum-intake
---

# Debug Session: workflow_template_authoring schema null

## Current Focus

Resolved after user confirmed the restarted desktop client no longer reproduces the provider schema error.

## Intake

- User report: asking the running client to "写一个贪吃蛇于系" fails with `API Error: 400 {"error":{"message":"Invalid schema for function 'workflow_template_authoring': schema must be a JSON Schema of 'type: \"object\"', got 'type: null'...}}`.
- Project cognition readiness: blocked/stale, recommended map update, but returned minimal live reads: `src/tools/WorkflowTemplateAuthoringTool`, `src/tools.ts`, `src/Tool.ts`.
- Selected capability/symptom: built-in tool schema registration for `workflow_template_authoring`.
- Coverage gap: cognition is stale due recent source changes; live code/tests are authoritative for this fix.

## Observer Framing

- Primary suspected loop: tool registration -> Zod input schema -> JSON Schema conversion -> API tool/function schema validation -> request rejected before model generation.
- Primary candidate: `WorkflowTemplateAuthoringTool.inputSchema` is a top-level `z.discriminatedUnion`, which converts to a schema without top-level `type: "object"`.
- Contrarian candidate: the request assembly layer discards or nulls the schema for this tool even when the tool schema is valid.
- First probe: inspect schema conversion path/tests and reproduce the exported tool schema shape.
- Related risk targets: other built-in tools using top-level unions or lazy schemas.

## Log Investigation Plan

- Existing log/error target: user-provided API error text.
- Code targets: `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx`, `src/Tool.ts`, `src/tools.ts`, schema conversion utilities/tests.
- Candidate-separating signal: if converted `input_schema.type` is missing/null only for this tool, fix tool schema; if conversion drops schema for all lazy schemas, fix converter.

## Truth Ownership Map

- Truth owner: `Tool.inputSchema` and JSON-schema conversion layer that sends API-bound tool/function schemas.
- Control state: API-bound tool definition generated from registered tools.
- Observation state: desktop chat error surfaced from provider API response.
- Closed loop: user prompt -> assembled tool pool includes `workflow_template_authoring` -> request payload includes tool schema -> provider validates schema -> provider rejects before generation.

## Evidence

- User log: provider rejects `workflow_template_authoring` because top-level schema type is null, not object.
- Live read: `WorkflowTemplateAuthoringTool.inputSchema` currently returns a lazy `z.discriminatedUnion('operation', [...strictObject variants...])`.
- Live read: `ToolInputJSONSchema` requires top-level `type: 'object'`.
- Reproduction command: `zodToJsonSchema(WorkflowTemplateAuthoringTool.inputSchema)` returns a JSON schema with top-level `$schema` and `oneOf`, but no top-level `type: "object"`.
- RED test: focused API-bound schema test failed before the fix because `toolToAPISchema(WorkflowTemplateAuthoringTool).input_schema` was a top-level `oneOf` schema with no `type: "object"`.
- Fix applied: `WorkflowTemplateAuthoringTool` now keeps the runtime Zod discriminated union for strict operation validation and exposes a separate provider-facing `inputJSONSchema` with top-level `type: "object"` and `operation` as the discriminator field.
- Focused verification: `bun test src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts` passed with 18 tests and 106 assertions.
- Relevant lane verification: `bun run check:server` passed.

## Eliminated

- None yet.

## Hypothesis

The top-level discriminated union is valid Zod for runtime validation but invalid as an API function schema because the provider requires a JSON Schema object root. The fix should expose a top-level object schema for API/tool declaration while keeping operation-specific validation strict enough through tests.

## Fix Classification

- fix_scope: truth-owner
- Reason: the API-bound tool schema is the owning contract sent to the provider; the change repairs that contract instead of hiding the desktop error.

## Changed Code Paths

- modified: `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx`
- modified: `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`
- added: `.planning/debug/workflow-template-authoring-schema-null.md`

## Changed Behavior Surfaces

- API-bound tool/function schema for `workflow_template_authoring` now has a provider-compatible top-level object schema.
- Runtime validation remains operation-specific through the existing Zod discriminated union.
- Desktop chat/tool execution should no longer fail before generation with provider schema validation error `type: null`.

## Verification Evidence

- RED: focused API-bound schema test failed before the production change because exported `input_schema` lacked top-level `type: "object"`.
- GREEN: `bun test src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts` passed, 18 tests / 106 assertions.
- GREEN: `bun run check:server` passed.
- Runtime restart: stopped the old repository-owned Tauri/Vite/sidecar process tree and restarted `cd desktop && bun run tauri dev`; new observed processes include `tauri.exe` PID 64448, desktop app PID 15812, Vite PID 32892, and sidecar server PID 33452.
- Human verification: user retried the client flow and reported "可以了".

## Loop Restoration Proof

- Triggering input: a normal chat request can include `workflow_template_authoring` in the tool pool.
- Control decision: `toolToAPISchema` now selects the explicit `inputJSONSchema` for this tool.
- Resource allocation: provider receives a JSON Schema object root with the `operation` discriminator and known fields.
- Resulting state transition: provider schema validation should accept the tool declaration instead of rejecting the request before generation.
- External observation: user retried the desktop prompt and confirmed the live provider path no longer returns the 400 schema error.

## Project Cognition Refresh

- Required outcome: refresh or dirty mark for changed tool contract coverage.
- Attempted command: `project-cognition.exe mark-dirty --origin-command debug --origin-lane-id workflow-template-authoring-schema-null --scope src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx --scope src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`.
- Outcome: failed because project cognition agreement is blocked by `active_generation_id` mismatch (`status.json` has empty string, DB has `GEN-20260527T063023.684017400Z`).
- Carry-forward blocker: run project cognition repair/update before relying on map-backed coverage for this tool area.

## Verification Plan

- Add/adjust a focused test that asserts `WorkflowTemplateAuthoringTool.inputSchema.toJSONSchema().type === 'object'` or equivalent repository conversion output.
- Run the focused tool test.
- Run `bun run check:server` because the tool/schema surface is in server/tool runtime.
