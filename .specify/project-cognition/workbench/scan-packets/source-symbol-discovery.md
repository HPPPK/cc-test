# Scan Packet: Source/Symbol Discovery

**Lane ID**: source-symbol-discovery
**Mode**: read_only
**Result Handoff**: `.specify/project-cognition/workbench/scan-packets/source-symbol-discovery-handoff.json`
**Status**: completed

## Objective
Discover and document all key source code entrypoints, symbols, types, exports, and API surfaces.

## Authoritative Inputs
- `src/` directory structure
- `desktop/src/` directory structure
- `adapters/` directory structure
- `bin/` scripts
- `stubs/` directory
- `preload.ts`
- key entrypoint and type files

## Allowed Read Scope
- `src/entrypoints/`
- `src/main.tsx`
- `src/screens/`
- `src/components/`
- `src/commands/`
- `src/services/`
- `src/tools/`
- `src/utils/` (top-level enumeration)
- `desktop/src/main.tsx`
- `desktop/src/App.tsx`
- `desktop/src/api/`
- `desktop/src/stores/`
- `desktop/src/components/`
- `adapters/`

## Forbidden
- Deep-read of all 346 utility modules
- Modification of any file
- Writing final cognition truth

## Coverage Classification
- `src/entrypoints/` — **deep-read**
- `src/main.tsx` — **deep-read**
- `src/screens/` — **sampled**
- `src/commands/` — **inventory**
- `src/services/` — **sampled**
- `src/tools/` — **inventory**
- `desktop/src/` — **sampled**

## Acceptance Checks
- Entrypoints for CLI, Init, MCP, Agent SDK documented
- 3 TUI screens identified
- 149+ TUI components found
- 115+ command modules inventoried
- 59+ tool modules inventoried
- 22 desktop stores found
- 27 desktop API clients found
- 5 IM adapter packages (common + 4 platform)
