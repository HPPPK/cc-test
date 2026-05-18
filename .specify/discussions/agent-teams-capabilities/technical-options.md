# Technical Options

Project cognition is now fresh, so source-grounded options can be discussed.

## Conceptual Options For Discussion

### Option A: Full Agent Parity

Agent Teams members behave as independent agents with the same class of capabilities as a top-level agent, subject to role and sandbox policy.

- Product behavior enabled: maximum flexibility and easiest mental model for power users.
- Risk: broad capability surface; harder to audit permissions, hooks, secrets, and side effects.
- Best fit: advanced team orchestration where each member is expected to operate like a real autonomous peer.

### Option B: Delegated Worker Model

Members inherit only the capabilities explicitly granted by the parent team/session and role definition.

- Product behavior enabled: safer orchestration and clearer permission review.
- Risk: less powerful; users may expect Skills/hooks/MCP access that are unavailable unless configured.
- Best fit: default behavior for broad user trust.

### Option C: Hybrid Capability Manifest

Members have a visible capability manifest: base role, inherited tools, enabled Skills, hook status, MCP access, memory scope, and write permissions.

- Product behavior enabled: power with inspectability; users can see why a member can or cannot perform an action.
- Risk: more product and runtime complexity.
- Best fit: likely long-term direction if Agent Teams becomes a first-class workflow.

## Recommendation Status

The strongest current direction is Option C: an explicit capability manifest and a clear preservation rule. At minimum, if `Agent({ subagent_type, name, team_name })` is intended to mean "spawn this custom agent as a teammate", the teammate path should preserve the selected custom agent's declared `hooks`, `skills`, and `mcpServers` unless a safety policy blocks a specific surface.

## Source-Grounded Technical Options

### Minimal Viable Path

Preserve custom Agent definition fields when wrapping in-process teammates.

- Product behavior enabled: `Agent({ subagent_type, name, team_name })` behaves closer to ordinary `Agent({ subagent_type })`.
- Likely impacted surface: teammate wrapping in `src/utils/swarm/inProcessRunner.ts`.
- Risk: hooks and MCP access become active in long-lived teammates, so permission/security gates must remain intact.

### Architecture-Correct Path

Define a teammate capability contract shared by in-process, tmux, and iTerm2 backends.

- Product behavior enabled: backend choice no longer silently changes Agent capabilities.
- Likely impacted surfaces: `src/tools/shared/spawnMultiAgent.ts`, `src/utils/swarm/backends/*`, `src/utils/swarm/inProcessRunner.ts`, TeamFile member metadata, docs.
- Risk: larger migration and test surface.

### Expansion-Ready Path

Add an explicit member capability manifest that records effective tools, hooks status, skills, MCP servers, permission mode, model, memory scope, and backend.

- Product behavior enabled: users can inspect why a teammate can or cannot use a capability.
- Likely impacted surfaces: server team APIs, desktop TeamStatus UI, TeamFile schema, docs.
- Risk: more UI/API persistence work; should likely be split from the minimal restoration fix.

## Cross-Provider Teammate Model Options

Current discussion direction: first implement spawn-time per-teammate runtime selection, not runtime switching for already-running teammates. The first-stage product surface should include both Agent tool spawn parameters and desktop Team UI, with the Agent tool/backend contract as the source of truth.

### Minimal Viable Path

Extend teammate spawn input and TeamFile member metadata with `providerId?: string | null` plus `model?: string`.

- Product behavior enabled: direct per-teammate provider/model selection at spawn time.
- Compatibility: existing `model` continues to work; absent `providerId` preserves current behavior.
- Risk: in-process and pane-based teammate env injection need separate handling.

### Architecture-Correct Path

Introduce a shared `RuntimeSelection` or `TeammateRuntimeSelection` contract: `{ providerId: string | null, modelId: string }`.

- Product behavior enabled: teammates use the same provider/model semantics as desktop chat and scheduled tasks.
- Compatibility: map existing `model` to `{ providerId: undefined/inherit, modelId: model }` during migration or normalization.
- Risk: touches Agent tool schema, TeamFile schema, backend spawn config, desktop/server displays, and tests.
- Current recommendation: prefer this internal contract even if the external Agent tool input remains flat for ergonomics.

### Expansion-Ready Path

Add per-member runtime controls in the Agent Teams UI and expose the effective runtime in the team capability manifest.

- Product behavior enabled: users can inspect and change each teammate's provider/model selection.
- Compatibility: should be layered after spawn-time runtime selection works.
- Risk: runtime switching for already-running teammates is more complex than spawn-time selection.

### Selected First-Stage Entry Point

Expose the runtime selection at both layers, but sequence the implementation around the underlying spawn contract.

- Backend/tool contract: accept and persist a per-teammate runtime selection equivalent to `{ providerId, modelId }`.
- In-process runtime: resolve the provider runtime for that teammate and route requests with the selected model ID.
- Pane runtime: launch the teammate process with provider-specific environment and the selected model ID.
- Desktop Team UI: provide provider/model controls per member and persist through the same team/member runtime shape.
- Status/UI display: show the effective provider/model so mixed-provider teams are inspectable.
