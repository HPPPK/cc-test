# Feature: Teammate Runtime Selection

## Scope

Stage 1 adds creation-time runtime selection for Agent Teams teammates.

## Requirements

- Agent tool teammate spawns accept an explicit provider/model pair using `provider_id` and `model_id`.
- `model_id` is preserved exactly so cross-provider model IDs are not normalized through Claude aliases.
- Legacy `model` continues to work for Claude alias selection and backward compatibility.
- Team config persists the effective runtime as `{ providerId, modelId }`.
- Pane/tmux teammates receive provider routing through their spawned process environment.
- In-process teammates receive provider routing through isolated async runtime context, not global process mutation.
- Desktop team views surface each teammate's effective model/provider from team config and watcher updates.

## Out Of Scope

- Runtime provider/model switching for already-running teammates.
- Restoring teammate skills, hooks, or MCP frontmatter parity.
- Adding a separate desktop teammate creation form.

## Acceptance

- Unit coverage proves runtime resolution, provider env construction, team API/watch mapping, and desktop rendering.
- Existing legacy teammate `model` paths remain compatible.
