# Research: Agent Workflow Authoring Tools

**Date**: 2026-05-27  
**Input**: Approved `spec.md`, `alignment.md`, `context.md`, user-confirmed discussion handoff, project cognition query, and live reads of tool/registry/API/runtime/desktop surfaces.

## Summary

The feature should be implemented as a global, operation-discriminated built-in tool backed by a shared server-side authoring service. The main technical risks are validation drift, cross-process registry cache drift in desktop-launched sessions, stale overwrites from concurrent manual edits, and phase-policy bypass from global tool registration. The plan resolves those risks with shared validation extraction, a local desktop/server authoring endpoint, SHA-256 basis hashes, and operation-level phase-policy checks.

## Decisions

### Global Tool Shape

- **Recommendation**: Add one tool named `workflow_template_authoring` with an `operation` discriminated input union.
- **Rationale**: One tool keeps shared validation, permission metadata, stale-write handling, result rendering, and transcript audit behavior in a single contract. Multiple tools would duplicate schema fragments and make operation-level policy harder to keep consistent.
- **Alternatives Considered**:
  - Multiple separate tools: simpler prompts per operation, but more duplicated validation and permission drift risk.
  - Reusing the existing feature-gated `workflow` script tool: not appropriate because the current local file is a generated ant-internal stub and this feature is workflow template registry authoring, not script execution.
- **Source Confidence**: verified from `src/tools.ts`, `src/Tool.ts`, and `src/tools/WorkflowTool/WorkflowTool.ts`.

### Registry And Validation Ownership

- **Recommendation**: Extract shared validation helpers into `src/server/services/workflowTemplateValidation.ts`, then use them from the registry service, workflow template API, and authoring service.
- **Rationale**: Current registry and API validation have overlapping logic. A tool-only validator would risk accepting a template that manual Settings rejects, or rejecting one that the API accepts.
- **Alternatives Considered**:
  - Keep current API validator and call API validation from the tool only: helps desktop path but leaves direct service path and registry write validation split.
  - Copy validation into the tool: fastest implementation but violates NFR-004 and creates long-term drift.
- **Source Confidence**: verified from `workflowTemplateRegistryService.ts`, `workflowTemplates.ts`, and `workflowTemplates.test.ts`.

### Desktop Runtime Path

- **Recommendation**: When `CC_JIANGXIA_DESKTOP_SERVER_URL` is set, the tool calls a local server authoring route such as `POST /api/workflows/templates/authoring`. Otherwise it calls `WorkflowTemplateAuthoringService` directly.
- **Rationale**: Desktop-launched CLI sessions receive the server URL from `ConversationService.buildChildEnv()`. The registry service has process-local module cache; a child process direct file write could leave the desktop server cache stale until restart or internal invalidation. Server-path writes run in the cache-owning process and preserve Settings refetch behavior.
- **Alternatives Considered**:
  - Always direct-write through registry service: simpler, but risks desktop cache drift.
  - Extend only existing REST endpoints and orchestrate stale checks in the tool: possible, but update/delete stale preconditions are awkward across multiple calls and introduce race windows.
  - Add live push to Settings: unnecessary because confirmed compatibility is reload/refetch, not push subscription.
- **Source Confidence**: verified from `workflowTemplateRegistryService.ts` cache behavior, `conversationService.ts` env injection, `desktop/src/api/sessions.ts`, and `WorkflowTemplateManager.tsx`.

### Stale-Write Basis Representation

- **Recommendation**: Use a deterministic `basisHash` returned by list/inspect and required by update/delete. Compute it from canonical sorted JSON of the current registry template identity and content using SHA-256 with a `sha256:` prefix.
- **Rationale**: A hash is compact enough for tool inputs, stable across CLI/server processes, and avoids sending the full original template back as a precondition. SHA-256 avoids runtime-dependent hashing differences.
- **Alternatives Considered**:
  - Full template precondition: more verbose and easier to accidentally mutate in model output.
  - Version-only compare: templates have user-chosen `version` strings that may not change for every manual edit.
  - Bun hash or existing fast hash helpers: fast but not stable enough across runtimes/processes for a persisted precondition contract.
- **Source Confidence**: verified for existing hash utilities and template type fields; recommendation is planned design.

### Field Guide Source

- **Recommendation**: First implementation uses a static guide object in `workflowTemplateAuthoringGuide.ts`, colocated with validation constants and guarded by drift tests.
- **Rationale**: Full schema metadata or annotation-driven generation is a larger refactor. A static guide is readable for agents and users, and tests can keep it aligned with required fields, allowed values, unsupported shapes, and issue codes.
- **Alternatives Considered**:
  - Shared schema metadata generation: strongest long-term source of truth but more refactor risk for first release.
  - Validator annotations: useful later, but requires changing the validator shape before the product tool exists.
  - Free-form prompt text inside the tool: easy to drift and hard to test.
- **Source Confidence**: verified for current field requirements from registry/API/editor code; alignment test strategy is planned design.

### Active Workflow Phase Policy

- **Recommendation**: Add operation-level mutation gating, not whole-tool filtering. Read-only operations remain available; mutating operations are denied in non-implementation phases unless a custom action policy explicitly allows workflow template authoring.
- **Rationale**: `workflow_template_authoring` has both read-only and mutating operations. Adding the whole tool to disallowed tool names would also block guide/list/inspect/validate, which the agent may need safely.
- **Alternatives Considered**:
  - Add tool name to `getWorkflowPhaseDisallowedTools()`: too coarse.
  - Rely only on general permissions: misses workflow-specific phase policy.
- **Source Confidence**: verified from `workflowToolPolicy.ts` and `workflowToolPolicy.test.ts`.

## Standard Stack

- **Bun + TypeScript**: existing runtime and test environment for server/tool code.
- **Zod**: existing tool input schema convention.
- **WorkflowTemplateRegistryService**: existing storage/write/cache invalidation boundary.
- **Request/Response API handlers**: existing local server route style in `src/server/api/workflowTemplates.ts`.

## Don't Hand-Roll

- **Template persistence**: use `WorkflowTemplateRegistryService.writeTemplates()` so unknown fields and protected storage boundaries stay intact.
- **Workflow validation**: factor existing validation semantics instead of reimplementing in the tool.
- **Desktop visibility**: use local server path and existing Settings refetch rather than creating a new live update channel.
- **Session mutation**: rely on existing future-session registry lookup and current template snapshots rather than editing active session state.

## Common Pitfalls

- **Cross-process cache drift**: direct writes from a desktop child process can bypass server registry cache invalidation.
- **Validator drift**: copied validation logic will diverge from manual API behavior.
- **Overbroad phase denial**: whole-tool denial would block safe read-only operations.
- **Underdocumented fields**: without a guide, the agent will guess `outputArtifact`, `requiredIntake`, `handoffRules`, completion criteria, and transition fields.
- **Version-only stale checks**: user template `version` is not enough to detect manual edits.
- **Silent fallback**: falling back from desktop server path to direct writes hides operational failure and can leave Settings stale.

## Assumptions Log

- Desktop-launched CLI sessions that should coordinate with Settings have `CC_JIANGXIA_DESKTOP_SERVER_URL` available. Live code shows it is injected when `desktopServerUrl` exists.
- A single local authoring endpoint is acceptable as an internal server contract. It is not a public external API.
- Desktop frontend source does not need to call the authoring endpoint for this feature unless implementation chooses to expose it in UI, which is outside current scope.

## Validation Notes

- Add root `bun:test` coverage for the tool schema, read-only/destructive metadata, desktop server routing, direct service routing, phase-policy denial, and result shape.
- Add server/service tests for create/update/duplicate/delete success, no-write validation failures, stale update/delete conflicts, malformed existing config, builtin copy naming, and unknown-field preservation.
- Extend API tests for the authoring endpoint and its parity with manual template API behavior.
- Extend `workflowToolPolicy.test.ts` for the new operation-level authoring mutation decision.
- Add guide tests proving required field groups, allowed values, unsupported shapes, and issue-code repair hints are represented.
- Run `bun run check:server`, and run `bun run check:desktop` only if desktop source is touched. Final implementation handoff requires `bun run verify` or an explicit blocker.

## Environment / Dependency Notes

- No new third-party package is required.
- No live model/provider access is needed for planned tests.
- The local desktop server path depends on `fetch`, already used by `SubmitPhaseCompletionTool`.
- Generated artifact work in `/sp.plan` does not mark project cognition dirty; actual source changes later may require `/sp-map-update`.

## Sources

- `src/tools.ts`
- `src/Tool.ts`
- `src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.tsx`
- `src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.test.ts`
- `src/tools/WorkflowTool/WorkflowTool.ts`
- `src/server/services/workflowTemplateRegistryService.ts`
- `src/server/services/workflowTemplateRegistryService.test.ts`
- `src/server/api/workflowTemplates.ts`
- `src/server/__tests__/workflowTemplates.test.ts`
- `src/server/services/workflowToolPolicy.ts`
- `src/server/services/workflowToolPolicy.test.ts`
- `src/server/services/conversationService.ts`
- `desktop/src/api/sessions.ts`
- `desktop/src/components/workflow/WorkflowTemplateManager.tsx`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
