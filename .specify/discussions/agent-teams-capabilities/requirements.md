# Requirements

## Current Product Question

Clarify the capability contract for Agent Teams members.

## Newly Reported Behavior

The user reports that before a PR merge, Agent Teams members still had the relevant capabilities, but after the merge they appear not to. This may indicate a behavioral regression rather than only unclear documentation.

## Source-Grounded Current Understanding

- Ordinary custom Agents support `mcpServers`, `hooks`, and `skills` in their definition.
- Agent Teams members are spawned through a teammate-specific route when `team_name` and `name` are present.
- In-process teammates appear to run through `runAgent()`, but with a teammate-specific wrapped agent definition.
- The desired behavior needs to decide whether teammates should preserve the selected `subagent_type` definition's `hooks`, `skills`, and `mcpServers`.

## Current Effective Teammate Capability Summary

- Teammates can run the normal agent loop and use a filtered async-agent tool pool.
- In-process teammates have team coordination tools (`SendMessage`, task tools) and can spawn synchronous subagents, but cannot spawn nested teammates or background agents.
- In-process teammates can use the Skill tool if it is available in the tool pool, but custom-agent `skills` frontmatter is not visibly preloaded through the teammate wrapper.
- In-process teammates do not visibly preserve custom-agent `hooks` or `mcpServers` frontmatter in the wrapper.
- Pane-based teammates run separate CLI sessions and inherit selected CLI/env settings, but backend-specific launch plumbing determines how much custom-agent identity is preserved.

## Candidate Requirements Under Discussion

- Users need to understand whether a team member is a full agent, a constrained delegated worker, or a hybrid.
- Users need to assign a teammate to a cross-provider runtime model, not only a Claude default model alias.
- Per-teammate model selection should carry both `providerId` and `modelId` where provider selection matters.
- The capability model should explicitly cover at least:
  - Skills availability and discovery
  - Hook support or lack of hook support
  - Tool access and sandbox/approval inheritance
  - MCP/server access
  - Memory or persistent context access
  - Agent role configuration and model/runtime overrides
  - Isolation boundaries between team members and the parent session
- The UI/docs should avoid implying capabilities that the runtime cannot actually provide.

## Per-Teammate Provider Model Requirement

- A teammate should be configurable with `{ providerId, modelId }`, matching desktop session runtime selection.
- `providerId: null` should mean official/default provider, not "inherit current provider".
- A string `providerId` should resolve through the saved provider index and inject provider runtime env for that teammate.
- `modelId` should be passed as the actual model ID for the selected provider.
- This should work independently per teammate so one team can mix providers/models.
- The design should avoid encoding provider selection into a single `model` string because saved provider IDs and model IDs are separate runtime concerns.

## First-Stage Scope Decision

- First stage: support provider/model selection when the teammate is created or spawned.
- Out of first-stage scope: changing provider/model for an already-running teammate.
- Preferred internal contract: reuse the desktop runtime shape `{ providerId, modelId }`.
- Product implication: different teammates in the same team may start with different saved providers and model IDs.
- First-stage entry points: both Agent tool spawn parameters and desktop Team UI.
- Implementation priority: Agent tool/backend spawn contract is the foundation; desktop UI should reuse the same runtime shape.

## Non-Goals

- No implementation has been requested.
- No formal feature handoff has been requested.

## Acceptance Signals

- A user can answer: "If I add a member to Agent Teams, what can that member use?"
- A user can distinguish inherited capability from independently configured capability.
- Risky surfaces such as hooks, filesystem writes, credentials, and MCP access have explicit boundaries.
- If a regression exists, the affected capability loss can be reproduced with a narrow before/after case.
- If teammates use custom agent types, backend choice should not silently change whether frontmatter capabilities apply.
- A user can spawn or configure teammates with different saved providers and model IDs, and each teammate's requests route to the selected provider.
- A user can do this either from the agent/team automation path or from the desktop Team UI without semantic differences.
