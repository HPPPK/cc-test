# Project Context

## Cognition Gate

- `.specify/project-cognition/status.json` was read again on 2026-05-16T22:34:33+08:00.
- Current freshness: `fresh`
- Graph readiness: `true`

Source-grounded discussion is allowed. The project cognition query still reported missing path coverage for some live paths, so exact implementation claims should cite live reads.

## Current Safe Context

From the repository guidance in AGENTS.md:

- The repo contains a CLI/local server, desktop app, MCP support, skills, and multi-agent configuration guidance.
- Codex lacks hook support in the same way Claude Code has hooks; security enforcement is instruction and sandbox based.
- Agent Teams are documented under `docs/agent/*`.
- The Agent runtime entrypoint is `src/tools/AgentTool/AgentTool.tsx`.
- Ordinary Agent execution behavior is centralized in `src/tools/AgentTool/runAgent.ts`.
- In-process teammate execution is in `src/utils/swarm/inProcessRunner.ts`.
- Teammate spawning/backend selection is under `src/tools/shared/spawnMultiAgent.ts` and `src/utils/swarm/backends/*`.
