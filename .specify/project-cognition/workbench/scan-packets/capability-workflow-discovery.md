# Scan Packet: Capability and Workflow Discovery

**Lane ID**: capability-workflow-discovery
**Mode**: read_only
**Result Handoff**: `.specify/project-cognition/workbench/scan-packets/capability-workflow-discovery-handoff.json`
**Status**: completed

## Objective
Identify user-facing capabilities, workflows, slash commands, features, and tool surfaces.

## Authoritative Inputs
- `src/commands/` directory
- `src/screens/` directory
- `src/tools/` directory
- `src/services/` directory
- `README.md`
- `docs/` directory
- `AGENTS.md`, `CLAUDE.md`

## Allowed Read Scope
- Command module names and descriptions
- Screen module documentation
- Tool module names and descriptions
- Service module names
- Documentation files

## Forbidden
- Deep-read of every command implementation
- Modification of any file

## Coverage Classification
- Commands — **inventory** (70+ commands named)
- Screens — **deep-read**
- Tools — **sampled**
- Capabilities — **deep-read** (21 capabilities identified)
- Workflows — **deep-read** (15 workflows identified)

## Acceptance Checks
- 21 capabilities identified with code locations
- 15 user workflows documented
- 70+ slash commands inventoried
- 59+ tool modules documented
- 3 TUI screens identified
