# Implementation Plan: Agent Workflow Authoring Tools

**Branch**: `006-agent-workflow-authoring-tools` | **Date**: 2026-05-27 | **Spec**: `.specify/features/006-agent-workflow-authoring-tools/spec.md`
**Input**: User-confirmed feature specification from `.specify/features/006-agent-workflow-authoring-tools/spec.md`

## Summary

Add a globally available internal agent tool named `workflow_template_authoring` that lets the main agent guide, list, inspect, validate, create, update, duplicate, and delete workflow templates from ordinary chat. The implementation should avoid a tool-only validator by factoring shared workflow template validation and mutation orchestration into a server-side `WorkflowTemplateAuthoringService`, then expose that service both to the tool and to a local desktop/server API path so Settings Workflows sees the same persisted registry after refetch.

The plan resolves the two soft design questions from the spec: desktop-launched sessions should use the local desktop server when `CC_JIANGXIA_DESKTOP_SERVER_URL` is present, and the first field guide should be a static, tested guide colocated with shared validation/constants rather than a broader schema-metadata refactor.

## Locked Planning Decisions

- Use Option A from the discussion handoff: direct validated internal authoring tool, not preview-only or manual JSON handoff.
- Register the capability globally in the ordinary tool pool, while enforcing operation-level read-only/write/destructive metadata and active workflow phase policy.
- Implement one operation-discriminated tool, `workflow_template_authoring`, rather than many separate tools, so schema, permission, stale-write, and transcript behavior stay centralized.
- Write successful mutations through the same workflow template registry/store that Settings Workflows and `/api/workflows/templates` use.
- In desktop-launched sessions, route authoring operations through the local desktop server authoring endpoint when `CC_JIANGXIA_DESKTOP_SERVER_URL` is set; do not silently fall back to direct file writes if that endpoint fails.
- Keep builtin templates read-only. Builtin edit requests must copy to a user template first, using `<builtin-id>-custom`, then `-2`, `-3`, and `<Builtin Name> Custom` unless user intent supplies a clearer non-conflicting name.
- Update and delete require a basis hash captured from list/inspect. If current template content differs, reject without writing and instruct the agent to re-read.
- Delete is the only destructive operation in the first-scope tool contract; create/update/duplicate are mutating and never read-only, but delete alone returns `isDestructive=true`.
- Field guide source for first implementation is a colocated static guide plus tests that assert alignment with validation-required fields, supported values, unsupported shapes, and repairable issue codes.
- Active and historical workflow session snapshots are not migrated or mutated by template authoring.

## Must-Preserve Carry-Forward

| MP ID | Type | Planning Obligation | Plan Location | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- |
| MP-001 | goal | Provide internal agent tool capability for workflow authoring and optimization. | Summary; Design Overview | Reopen if feature becomes manual UI-only or draft-only. |
| MP-002 | scenario | Create workflows from natural-language phases and persist them for Settings refetch. | Design Overview; Quickstart contract | Reopen if valid create cannot persist. |
| MP-003 | scenario | Optimize an existing workflow through validated update or safe copy. | Stale-Write Protocol; Capability Preservation | Reopen if updates or builtin copy-then-edit are removed. |
| MP-004 | scope | Preserve guide, list, inspect, validate, create, update, duplicate/copy, and delete. | Tool Operation Contract; Capability Preservation | Reopen if any operation is dropped. |
| MP-005 | decision | Valid user-template create/update writes directly with no mandatory preview. | Locked Planning Decisions; Operational Consequence Design | Reopen if mandatory preview-only flow returns. |
| MP-006 | decision | Tool is global but respects active workflow phase action policy. | Phase-Policy Integration | Reopen if global availability bypasses policy. |
| MP-007 | decision | Builtins are read-only mutation targets. | Builtin Copy Design | Reopen if direct builtin mutation or shadowing is proposed. |
| MP-008 | decision | Update/delete re-read current template and reject stale writes. | Stale-Write Protocol | Reopen if stale writes can overwrite current state. |
| MP-009 | decision | Delete only uniquely identified `source:user` templates and mark delete destructive. | Tool Operation Contract; Operational Consequence Design | Reopen if builtin or ambiguous delete is allowed. |
| MP-010 | decision | Builtin copy default naming uses confirmed id/name algorithm. | Builtin Copy Design | Reopen if copy IDs/names collide or become confusing. |
| MP-011 | scope | Agent needs discoverable schema-aligned field guide. | Field Guide Design | Reopen if guide can drift or is not tool-discoverable. |
| MP-012 | non_goal | Do not mutate protected non-workflow state. | Implementation Constitution | Reopen if writes leave workflow template store. |
| MP-013 | non_goal | Keep first scope linear-only. | Field Guide Design; Validation Extraction | Reopen if unsupported shapes are accepted. |
| MP-014 | non_goal | Do not mutate active/historical workflow session snapshots. | Runtime Snapshot Safety | Reopen if template edits rewrite sessions. |
| MP-015 | reference | Reuse/share registry/API validation and persistence semantics. | Shared Validation And Service Plan | Reopen if a separate validator drifts. |
| MP-016 | reference | Live code evidence proves implementation facts; cognition is advisory. | Alignment Inputs; Constitution Check | Reopen if tasks rely only on cognition. |
| MP-017 | tradeoff | Preserve selected direct tool approach. | Summary; Locked Planning Decisions | Reopen if Option B/C replaces it. |
| MP-018 | scenario | Invalid/risky/stale/ambiguous/denied operations are no-write with diagnostics. | Result Contract; Operational Consequence Design | Reopen if failures can partially write. |
| MP-019 | scope | Settings compatibility after reload/refetch through same store. | Desktop Runtime Path; Project Structure | Reopen if a separate invisible store is introduced. |
| MP-020 | decision | Tool results are transcript-auditable. | Result Contract; Contracts | Reopen if results are opaque. |
| MP-021 | soft question | Resolve desktop-launched runtime path during plan. | Desktop Runtime Path | Resolved: use local server authoring endpoint when desktop URL exists. |
| MP-022 | soft question | Resolve field-guide source-of-truth during plan. | Field Guide Design | Resolved: colocated static tested guide for first implementation. |

## Implementation Target Boundary

- **Current project root**: `F:\github\cc-jiangxia`
- **Current project roles**: implementation target for built-in agent tools, workflow template registry/API, workflow template persistence, workflow runtime/session behavior, workflow tool policy, and desktop workflow management surfaces.
- **Target project root**: `F:\github\cc-jiangxia`
- **Target project roles**: add internal tool capability so agents can author and mutate workflow templates from ordinary chat.
- **Target paths/modules**:
  - `src/tools.ts`
  - `src/Tool.ts`
  - `src/tools/WorkflowTemplateAuthoringTool/`
  - `src/server/services/workflowTemplateRegistryService.ts`
  - `src/server/services/workflowTemplateAuthoringService.ts`
  - `src/server/services/workflowTemplateValidation.ts`
  - `src/server/services/workflowTemplateAuthoringGuide.ts`
  - `src/server/services/workflowToolPolicy.ts`
  - `src/server/api/workflowTemplates.ts`
  - `src/server/services/workflowTypes.ts`
  - `src/server/__tests__/workflowTemplates.test.ts`
  - `src/server/services/workflowTemplateRegistryService.test.ts`
  - `src/server/services/workflowToolPolicy.test.ts`
  - `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.test.ts`
  - `desktop/src/api/sessions.ts`, `desktop/src/types/session.ts`, and workflow UI files only if implementation changes desktop client/UI behavior.
- **Target evidence status**: Project cognition was fresh/query-ready and used for navigation. Live repository reads verified the current tool, registry, API, runtime, policy, desktop client, Settings UI, and server test surfaces.
- **Reference sources**: `.specify/discussions/workflow-template-management/` is related background only.
- **Cognition scope rule**: Project cognition narrows reads; code and tests prove implementation facts.
- **Stop condition**: Stop and return to discussion/spec if implementation requires direct builtin mutation, preview-only persistence, active session migration, writes outside workflow config, or unsupported non-linear workflow shapes.

## Reference Fidelity Inputs

### Reference Object

No external reference implementation is being copied. Fidelity target is the existing repository behavior for Workflows manual template management.

### Behavior-Level Fidelity Inventory

- `F-001` Manual API validation and builtin protection remain preserved through shared validation and existing API tests.
- `F-002` Registry unknown-field preservation remains preserved by keeping `WorkflowTemplateRegistryService.writeTemplates()` as the storage writer.
- `F-003` Settings Workflows refetch behavior remains preserved by writing the same store and invalidating the server-side registry cache.
- `F-004` Runtime session snapshots remain preserved by not touching workflow session state during template mutation.

## Scenario Profile Inputs

### Active Profile

- `Standard Delivery`: cross-boundary server/tool feature with no separate reference-fidelity profile and no UI redesign requirement.
- Source artifact: `alignment.md` and `context.md` record that this is a design-only planning pass for the approved spec package.

### Profile-Driven Implementation Constraints

- Planning must produce implementation-ready contracts before `/sp.tasks`.
- Same-area tests are required for production changes under `src/tools`, `src/server`, and `desktop/src` if desktop code is touched.
- Mutating behavior requires no-write failure tests, stale-write tests, builtin-copy tests, and permission/phase-policy tests.

## Technical Context

**Language/Version**: TypeScript on Bun runtime, existing ESM style with 2-space indentation and no semicolons.  
**Primary Dependencies**: Existing `zod` tool schemas, Bun tests, React/Ink rendering conventions for tool UI, server `Request`/`Response` API handlers. No new runtime dependency is planned.  
**Storage**: Existing cc-jiangxia workflow template config at `CLAUDE_CONFIG_DIR || ~/.claude`, under `cc-jiangxia/workflows.json`, through `WorkflowTemplateRegistryService`.  
**Testing**: `bun:test` for root/server/tool tests; Vitest only if desktop source changes.  
**Target Platform**: CLI/local server/desktop-launched CLI sessions on supported project platforms.  
**Project Type**: Bun CLI plus local API server and desktop frontend consumer.  
**Performance Goals**: Authoring operations are interactive config operations; avoid repeated full-file reads beyond list/validate/write cycles and keep responses deterministic.  
**Constraints**: No protected non-workflow state mutation; no live provider dependency for tests; no mandatory preview step; no silent fallback from desktop server path to direct writes.  
**Scale/Scope**: User-level workflow template registry, expected small arrays of templates/phases; first scope linear-only.

## Implementation Constitution

### Architecture Invariants

- `WorkflowTemplateRegistryService` remains the storage boundary and the source for reading/writing user templates, builtin templates, invalid-template diagnostics, unknown-field preservation, and cache invalidation.
- Shared validation must be factored from current registry/API semantics, not duplicated inside the tool.
- `workflow_template_authoring` is global, but operation-level validation denies mutating operations when active workflow phase policy forbids workflow template mutation.
- Desktop-launched sessions use the local server authoring endpoint when `CC_JIANGXIA_DESKTOP_SERVER_URL` exists so server registry cache and Settings refetch observe the same mutation.
- The tool must not mutate workflow session snapshots, transcript files, provider config, MCP config, skills, plugins, OAuth tokens, adapter state, or team/session records.

### Boundary Ownership

- Tool registration owner: `src/tools.ts`.
- Tool contract owner: `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx`.
- Operation orchestration owner: `src/server/services/workflowTemplateAuthoringService.ts`.
- Validation owner: `src/server/services/workflowTemplateValidation.ts`, consumed by registry service, workflow template API, and authoring service.
- Field guide owner: `src/server/services/workflowTemplateAuthoringGuide.ts`, tested against validation constants and issue codes.
- Phase-policy owner: `src/server/services/workflowToolPolicy.ts`.
- Desktop/server bridge owner: `src/server/api/workflowTemplates.ts` local authoring route.

### Forbidden Implementation Drift

- Do not create a separate `~/.claude` file, localStorage key, or tool-private store for workflow templates.
- Do not implement a second validator in the tool that can accept templates rejected by the registry/API.
- Do not make builtin templates editable, deletable, or shadowable by user templates.
- Do not silently direct-write from desktop sessions when the local server authoring endpoint is configured but unreachable.
- Do not add branching, loops, parallel phases, nested workflows, or unsupported shape compatibility shims.
- Do not hide validation/stale/permission failures behind generic success/failure messages.

### Required Implementation References

- `src/tools.ts`
- `src/Tool.ts`
- `src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.tsx`
- `src/tools/SubmitPhaseCompletionTool/SubmitPhaseCompletionTool.test.ts`
- `src/server/services/workflowTemplateRegistryService.ts`
- `src/server/services/workflowTemplateRegistryService.test.ts`
- `src/server/api/workflowTemplates.ts`
- `src/server/__tests__/workflowTemplates.test.ts`
- `src/server/services/workflowToolPolicy.ts`
- `src/server/services/workflowToolPolicy.test.ts`
- `desktop/src/components/workflow/WorkflowTemplateManager.tsx`
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`

### Review Focus

- Reviewers should compare authoring validation results against existing manual API behavior.
- Reviewers should verify desktop path uses the local server cache-owning process, not a separate direct file write, when `CC_JIANGXIA_DESKTOP_SERVER_URL` is present.
- Reviewers should check stale update/delete tests prove persisted config is unchanged on mismatch.
- Reviewers should check phase-policy tests cover read-only allowed and mutating denied cases.
- Reviewers should check field guide tests fail if required fields, allowed values, unsupported shapes, or repairable issue codes drift.

## Design Overview

### Tool Operation Contract

Create `src/tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.tsx` exporting `WorkflowTemplateAuthoringTool`.

- Tool name: `workflow_template_authoring`.
- `inputSchema`: `z.discriminatedUnion('operation', [...])`.
- Read-only operations: `guide`, `list`, `inspect`, `validate`.
- Mutating operations: `create`, `update`, `duplicate`, `delete`.
- `isReadOnly(input)`: true only for read-only operations.
- `isDestructive(input)`: true only for `delete`.
- `isConcurrencySafe(input)`: false for all operations, because the registry is shared mutable state and stale checks must be serialized by operation logic.
- `checkPermissions`: preserve general permission system behavior; include operation/id/source in classifier text and result rendering.
- `validateInput`: schema validation plus operation-level phase-policy denial for mutating operations.
- `call`: delegate to desktop API when `CC_JIANGXIA_DESKTOP_SERVER_URL` is set; otherwise call `WorkflowTemplateAuthoringService` directly.

### Shared Validation And Service Plan

Add `src/server/services/workflowTemplateValidation.ts` by extracting the overlapping validation behavior currently embedded in `workflowTemplateRegistryService.ts` and `workflowTemplates.ts`.

- Export normalized validation helpers that accept a registry/list context and options such as `allowExistingId`.
- Preserve current issue codes, paths, severity, builtin ID conflict behavior, linear-only rejection, required phase fields, completion criteria requirements, transition authority validation, and duplicate phase handling.
- Keep `WorkflowTemplateRegistryService.writeTemplates()` as the final persistence writer so unknown-field preservation and malformed-config no-write behavior remain intact.

Add `src/server/services/workflowTemplateAuthoringService.ts`.

- Own operation orchestration and result shaping.
- Expose `executeWorkflowTemplateAuthoringOperation(input, context)` or a class equivalent.
- Use `WorkflowTemplateRegistryService.listTemplates()` before validation and immediately before writes.
- Implement current-id conflict checks for create/duplicate.
- Implement basis-hash compare for update/delete.
- Return structured results for both success and no-write failure paths.

### Desktop Runtime Path

Add local server route support in `src/server/api/workflowTemplates.ts`, preferably:

```text
POST /api/workflows/templates/authoring
```

The route accepts the same operation union as the tool contract and calls `WorkflowTemplateAuthoringService` in the desktop server process.

Rationale:

- Desktop-launched CLI sessions receive `CC_JIANGXIA_DESKTOP_SERVER_URL` from `ConversationService.buildChildEnv()`.
- Direct file writes from the child process would not invalidate the server process module-level registry cache.
- Server-path authoring means Settings Workflows sees the mutation after existing refetch/list behavior.
- If the configured local server endpoint fails, the tool returns a visible error and does not fall back to a separate write path.

No desktop UI redesign is required. `desktop/src/api/sessions.ts` and desktop types should be changed only if implementation chooses to expose this internal authoring endpoint to desktop frontend code, which is not required for this plan.

### Stale-Write Protocol

Add a stable `basisHash` protocol for list/inspect/update/delete.

- `list` returns summaries with `basisHash` when the source is `user`; `inspect` returns full template plus `basisHash`.
- Hash input is the canonical sorted JSON of the registry template before editable/copyable decoration, plus source/id identity.
- Use SHA-256 with a `sha256:` prefix for cross-process stability; do not use runtime-dependent fast hashes for stale-write preconditions.
- `update` requires `selector: { source: 'user', id }`, `basisHash`, and `template`.
- `delete` requires `selector: { source: 'user', id }` and `basisHash`.
- Before write, re-read current registry, recompute the hash, and reject with `STALE_BASIS` if it differs.
- Failure result must include `persisted: false`, current summary metadata, and next action `inspect-and-retry`.

### Builtin Copy Design

`duplicate` accepts `source`, `id`, and optional target `id`/`name`.

- If source is builtin and target id omitted, choose `<builtin-id>-custom`, then `<builtin-id>-custom-2`, `<builtin-id>-custom-3`, etc.
- If source is builtin and target name omitted, use `<Builtin Name> Custom`.
- If user intent supplies a clearer target name/id, validate it and still reject builtin shadowing and current conflicts.
- Duplicate copies the latest current source template and creates a user template; it does not update the source template.
- Editing a builtin is implemented as duplicate followed by update of the new user template.

### Field Guide Design

Add `src/server/services/workflowTemplateAuthoringGuide.ts`.

- Export a deterministic guide object consumed by `guide`.
- Co-locate guide with validation constants and tests, but keep it static/readable for first implementation.
- Reuse constants for supported `completionCriteria.type`, `transition.authority`, and unsupported shape names where practical.
- Include required field groups from `spec.md#workflow-template-field-guide`.
- Include repair hints mapped to validation issue codes.
- Tests must assert required groups, allowed values, unsupported shapes, and repairable issue codes are present.

This resolves MP-022 without a broad schema metadata refactor.

### Phase-Policy Integration

Extend `workflowToolPolicy.ts` with a helper such as `isWorkflowTemplateAuthoringMutationDenied(state)`.

- Read-only operations are always allowed when the tool is otherwise available.
- Mutating operations outside workflow sessions are allowed subject to normal permissions.
- Mutating operations inside active workflow sessions are denied unless active phase is `implementation`/`implement` or custom phase policy explicitly allows workflow template authoring.
- Verification phase denies template mutations by default.
- Denial must be a no-write result from `validateInput` or service preflight.

Do not add the whole tool name to `getWorkflowPhaseDisallowedTools()` if that would block read-only guide/list/inspect/validate operations.

### Runtime Snapshot Safety

Authoring service must not call `WorkflowRuntimeService` or write session state. Future workflow starts can use updated templates naturally through registry lookup, while active/resumed sessions retain their template snapshots.

### Result Contract

Every tool/API result should include:

- `operation`
- `status`: `succeeded`, `validated`, `rejected`, or `failed`
- `persisted`: boolean
- `affectedTemplate`: source/id/name/version when known
- `validation`: valid flag and issue list
- `beforeSummary` and `afterSummary` for mutations when available
- `basisHash` for list/inspect and post-mutation target
- `invalidTemplates` diagnostics when list state has invalid user config
- `nextAction`: one of `none`, `inspect-and-retry`, `repair-and-validate`, `choose-unique-target`, `copy-builtin-first`, `ask-user-to-disambiguate`, `retry-after-server-available`

## Operational Consequence Design

| Obligation ID | State Machine / Ordering Decision | Concurrency And Idempotency | Recovery Path | Validation Evidence |
| --- | --- | --- | --- | --- |
| CA-001 | Valid create/update write directly after validation. Rejected operations do not call write. | Create checks current id conflict; update checks basis hash. | Return validation/stale issue and keep config unchanged. | Tool tests and server API tests for success/no-write. |
| CA-002 | Mutations route only through registry service. | Unknown fields preserved by registry writer. | Malformed config blocks write. | Registry service tests for protected files and unknown fields. |
| CA-003 | Shared validation module feeds registry/API/tool. | One validation source avoids drift. | Validation issue paths/codes guide repair. | API parity tests and field-guide tests. |
| CA-004 | Builtin mutation path is duplicate-to-user then optional update. | Source builtin never written. | Reject direct builtin update/delete with copy guidance. | Builtin copy and builtin rejection tests. |
| CA-005 | Template mutation never touches runtime session state. | Future sessions read registry; active sessions use snapshots. | No runtime recovery needed because no session mutation occurs. | Service tests inspect no runtime writes; existing runtime tests remain green. |
| CA-006 | Tool result always includes operation, persisted flag, affected template, diagnostics, and next action. | Deterministic result shape supports transcript audit. | Opaque exceptions converted to failed no-write result where possible. | Tool result snapshot/shape tests. |
| CA-007 | Update/delete require re-read and basis hash compare immediately before write. | Hash mismatch rejects; delete not idempotent unless target still exists and hash matches. | Return `STALE_BASIS` and instruct inspect-and-retry. | Stale update/delete tests with config unchanged. |
| CA-008 | Global tool uses operation-level phase-policy gate. | Read-only operations remain available; writes denied in forbidden active phases. | Return policy denial no-write result. | `workflowToolPolicy` and tool validation tests. |
| CA-009 | Delete requires unique `source:user` selector plus basis hash and destructive metadata. | Deleting missing/stale/builtin/ambiguous targets rejects. | Return target resolution or stale diagnostic. | Delete destructive metadata and no-write tests. |
| CA-010 | Builtin copy naming probes current registry until non-conflicting id. | Duplicate checks current conflicts before write. | Return conflict with suggested next id if requested target conflicts. | Copy naming tests for base, `-2`, `-3`. |
| CA-011 | Guide operation returns deterministic field guide aligned by tests. | No mutation; no cache dependency. | If guide/validation drift, tests fail before release. | Field guide coverage tests. |

## Dispatch Compilation Hints

### Boundary Owner

- Primary boundary owner: `src/server/services/workflowTemplateAuthoringService.ts`.
- Storage owner: `WorkflowTemplateRegistryService`.
- Tool owner: `WorkflowTemplateAuthoringTool`.
- Policy owner: `workflowToolPolicy.ts`.

### Required Packet References

- Every implementation packet must inspect `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/workflow-authoring-tool.md`, and the relevant existing repository files named in Required Implementation References.

### Packet Validation Gates

- Server/tool changes: run the narrow Bun tests for new/changed service, API, policy, and tool tests, then `bun run check:server`.
- Desktop source changes, only if touched: run `bun run check:desktop`.
- Before handoff from implementation: run `bun run verify` unless blocked by environment/resources.

### Task-Level Quality Floor

- No production code change under `src/tools` or `src/server` may ship without same-area tests.
- Failure-path tests must prove persisted workflow config is unchanged.
- Coverage gate files must not be lowered.

## Alignment Inputs

### Canonical References

- `.specify/features/006-agent-workflow-authoring-tools/spec.md`
- `.specify/features/006-agent-workflow-authoring-tools/alignment.md`
- `.specify/features/006-agent-workflow-authoring-tools/context.md`
- `.specify/features/006-agent-workflow-authoring-tools/references.md`
- `.specify/features/006-agent-workflow-authoring-tools/brainstorming/handoff-to-specify.json`
- `.specify/discussions/agent-workflow-authoring-tools/handoff-to-specify.json`

### Input Risks From Alignment

- Desktop runtime path was a plan-stage risk; resolved by local server authoring endpoint when desktop URL is configured.
- Field-guide source-of-truth was a plan-stage risk; resolved by colocated static guide plus drift tests for first implementation.
- Global tool registration can bypass phase policy if operation-level gating is omitted; mitigated by explicit policy helper and tests.

## Research Inputs

### Standard Stack

- Use existing Bun/TypeScript/zod/tool contract/server API stack.
- Use existing `WorkflowTemplateRegistryService` and factor current validation, instead of adding dependencies.

### Don't Hand-Roll

- Do not hand-roll file persistence outside the registry service.
- Do not hand-roll a detached validator inside the tool.
- Do not hand-roll a live Settings push channel; same-store refetch satisfies the confirmed requirement.

### Common Pitfalls

- Cross-process cache drift if a desktop child process writes workflow config directly.
- Validation drift if API and tool copy/paste validators diverge.
- Over-filtering global tool by name would block read-only guide/list operations in workflow sessions.
- Stale delete/update without a basis hash can overwrite manual edits.

### Assumptions To Validate

- `CC_JIANGXIA_DESKTOP_SERVER_URL` is present for desktop-launched CLI sessions; live code shows `ConversationService.buildChildEnv()` injects it when `desktopServerUrl` is available.
- No desktop frontend source change is required unless implementation decides to expose the internal authoring endpoint in desktop UI/client code.

### Environment / Dependency Notes

- No live provider credentials are needed for unit/API tests.
- `bun run verify` is the final non-live project quality gate.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Specification-first: PASS. Formal spec package exists and user invoked `$sp-plan` before implementation.
- Simplicity/scope discipline: PASS. Plan reuses registry/API/tool patterns and avoids UI redesign.
- Test-backed changes: PASS WITH REQUIRED FOLLOW-UP. Implementation tasks must add same-area tests for server/tool/policy and desktop only if touched.
- Security by default: PASS. Writes are restricted to workflow template config, validation is boundary-owned, protected state is out of scope, and delete is destructive.
- Reviewable/reversible delivery: PASS. Changes are scoped to tool, server service/API, policy, and tests.
- Evidence before completion: PASS WITH REQUIRED FOLLOW-UP. Implementation cannot claim ready without narrow tests and `bun run verify` or an explicit blocker.
- No unrequested fallbacks: PASS. Desktop server failure is visible; no silent fallback to direct writes when desktop URL exists.

## Project Structure

### Documentation (this feature)

```text
.specify/features/006-agent-workflow-authoring-tools/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── workflow-authoring-tool.md
│   └── workflow-authoring-api.md
├── plan-contract.json
└── tasks.md                 # Created later by /sp.tasks, not by /sp.plan
```

### Source Code (repository root)

```text
src/
├── tools.ts
├── tools/
│   └── WorkflowTemplateAuthoringTool/
│       ├── WorkflowTemplateAuthoringTool.tsx
│       └── WorkflowTemplateAuthoringTool.test.ts
└── server/
    ├── api/
    │   └── workflowTemplates.ts
    ├── __tests__/
    │   └── workflowTemplates.test.ts
    └── services/
        ├── workflowTemplateAuthoringService.ts
        ├── workflowTemplateAuthoringService.test.ts
        ├── workflowTemplateAuthoringGuide.ts
        ├── workflowTemplateValidation.ts
        ├── workflowTemplateRegistryService.ts
        ├── workflowTemplateRegistryService.test.ts
        ├── workflowToolPolicy.ts
        └── workflowToolPolicy.test.ts
```

```text
desktop/src/
├── api/sessions.ts                 # Touch only if frontend client needs new authoring endpoint.
├── types/session.ts                # Touch only if frontend types need new authoring endpoint.
└── components/workflow/*           # No planned UI redesign.
```

**Structure Decision**: Implement as a root server/tool feature. Desktop UI remains a compatibility consumer unless later tasks discover a real frontend change is necessary.

## Decision Preservation Check

- Direct validated writes -> Tool/service create/update write paths and no preview requirement.
- Global availability with phase gating -> Tool is in `getAllBaseTools()` and mutating ops validate phase policy.
- Builtin copy-then-edit -> Duplicate operation and copy naming algorithm.
- Stale update/delete -> `basisHash` protocol in data model/contracts/service.
- Settings compatibility -> Desktop server API path plus shared registry service.
- Session snapshot safety -> No runtime/session service mutation in authoring service.
- Field guide alignment -> Colocated guide plus drift tests.
- Protected state boundary -> Registry writer only.

## Research Adoption Check

- Desktop cross-process cache risk -> Adopted local server authoring endpoint.
- Validation drift risk -> Adopted shared validation extraction.
- Field-guide refactor tradeoff -> Adopted static tested guide for first release.
- Operation-level policy risk -> Adopted helper in `workflowToolPolicy.ts` rather than tool-name filtering.
- Stale-write risk -> Adopted SHA-256 canonical basis hash.

## Complexity Tracking

No constitution violations require complexity justification. The new authoring service and local authoring endpoint are justified by existing shared validation, stale-write, and desktop cache boundaries; they are not speculative abstractions.
