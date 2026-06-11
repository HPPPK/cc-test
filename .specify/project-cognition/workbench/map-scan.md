# Map Scan: sp-map-scan

## Command
`sp-map-scan` (rebuild)

## Scan Summary
- **Started**: 2026-06-10T12:00:00Z
- **Completed**: 2026-06-10T13:00:00Z
- **Total included paths**: 3344
- **Total scanned paths**: 631
- **Scan completion**: 18.9%

## Execution Model
- **Model**: subagent-mandatory
- **Surface**: native-subagents
- **Dispatch shape**: parallel-subagents
- **Initial dispatch**: 12 lanes
- **Re-scan dispatch**: 5 lanes (commands-tools, server-services, skills-state, components, desktop)
- **Total dispatches**: 17

## Results

### Successful Lanes
1. **lane-root-github** (27/27 paths) - Project config, CI/CD, issue templates
2. **lane-git-evolution** (git history) - 843 commits, 2-month history, solo maintainer
3. **lane-src-commands-tools** (173/456 paths) - Command entrypoints, tool definitions, agent capabilities
4. **lane-src-server-services** (204/352 paths) - Server API, services, MCP client, memory system
5. **lane-src-skills-state** (108/107 paths) - Skills system, CLI entrypoints, state management
6. **lane-src-other** (99/99 paths) - Query engine, bootstrap state, buddy system, vim mode
7. **lane-docs-codex** (20/393 paths) - Codex config, sp-* workflow skill definitions

### Gap Lanes (low_risk_open_gap)
1. **lane-src-components** (419 paths) - timeout, important
2. **lane-src-hooks-bridge** (281 paths) - timeout, important
3. **lane-src-utils-vendor** (664 paths) - timeout, low_risk
4. **lane-desktop** (390 paths) - timeout, important
5. **lane-adapters-scripts** (156 paths) - timeout, important

## Provisional Structure
- **Nodes**: 30
- **Edges**: 25
- **Observations**: 24
- **Evidence rows**: 171

## Key Architectural Findings

### Project Shape
- **Runtime**: Bun-based TypeScript project with Tauri desktop app
- **UI**: React + Vite (desktop), Ink (terminal), Commander.js (CLI)
- **API**: Anthropic SDK with multi-provider support (Direct, Bedrock, Foundry, Vertex, OpenAI)
- **Protocol**: MCP/LSP integration
- **Desktop**: Tauri 2 with React frontend and Rust backend

### Critical Modules
1. **QueryEngine** - Core conversation lifecycle manager (~1367 lines)
2. **Bootstrap State** - Global singleton with 80+ getter/setter exports
3. **Skills System** - Layered architecture: bundledSkills → loadSkillsDir → mcpSkillBuilders → mcpSkills
4. **Server Core** - Bun.serve() HTTP+WS with ~25 REST endpoints
5. **MCP Client** - ~2400 lines, multi-transport support
6. **print.ts** - ~5600+ lines, headless/SDK orchestrator

### Notable Patterns
- Auto-generated stubs for ant-internal feature-gated modules (Proxy-based noop)
- Dual-layer feature gating (build-time `feature()` + runtime GrowthBook flags)
- Forked-agent pattern for background processing (memory, compact)
- Write-once registry pattern for skills to break circular dependencies

## Next Steps
- Run `sp-map-build` to reconstruct the project cognition graph from this evidence baseline
- Address low_risk_open_gap lanes in future `sp-map-update` cycles
- The evidence baseline provides sufficient foundation for graph reconstruction
