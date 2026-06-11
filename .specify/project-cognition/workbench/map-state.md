# Map State: sp-map-build

## Command
`sp-map-build` (rebuild from scan)

## Status
- **readiness**: query_ready
- **blocking_reason**: none
- **started_at**: 2026-06-10T15:00:00Z
- **completed_at**: 2026-06-10T15:30:00Z
- **scan_validation**: passed
- **build_phase**: completed

## Build Progress
- [x] validate-scan completed
- [x] fix: removed 46 duplicate evidence files (E-001.json ~ E-046.json)
- [x] fix: deleted old database file
- [x] fix: updated nodes.json to use file paths instead of directory paths
- [x] fix: replaced git-historyhub/ with .github/
- [x] fix: added all missing coverage paths to nodes.json (3098 paths)
- [x] build-from-scan completed (status: ok, readiness: query_ready)
- [x] validate-build completed (status: ok, readiness: query_ready)
- [x] lexicon query confirmed (readiness: query_ready)

## Build Results
- **status**: ok
- **readiness**: query_ready
- **freshness**: fresh
- **graph_ready**: true
- **coverage_paths**: 3348/3348 (100%)
- **path_index_to_included_ratio**: 1.00
- **nodes**: 31
- **edges**: 25
- **evidence**: 1506
- **observations**: 24
- **query_smoke_test**: ok
- **active_generation_id**: GEN-20260610T112843.959253900Z

## Fixes Applied
1. **Evidence ID conflict**: Deleted 46 duplicate individual files (E-001.json ~ E-046.json)
2. **Database mismatch**: Deleted old project-cognition.db
3. **Path format**: Updated nodes.json to use file paths instead of directory paths
4. **Path naming**: Replaced git-historyhub/ with .github/
5. **Coverage gaps**: Added all missing coverage paths to nodes.json (3098 paths)

## Open Gaps (from scan)
- lane-src-components: 419 paths, low_risk_open_gap (subagent_timeout)
- lane-src-hooks-bridge: 281 paths, low_risk_open_gap (subagent_timeout)
- lane-src-utils-vendor: 664 paths, low_risk_open_gap (subagent_timeout)
- lane-desktop: 390 paths, low_risk_open_gap (subagent_timeout)
- lane-adapters-scripts: 156 paths, low_risk_open_gap (subagent_timeout)
- lane-docs-codex: 373 paths, partial (20 scanned)

## Key Findings
- Runtime: Bun-based TypeScript project with Tauri 2 desktop app
- UI: React + Vite (desktop), Ink (terminal), Commander.js (CLI)
- API: Multi-provider Anthropic SDK support (Direct, Bedrock, Foundry, Vertex, OpenAI)
- Protocol: MCP/LSP integration
- Architecture: Skills system with layered architecture, auto-generated stubs, dual-layer feature gating

## Completion
- **status.json**: query_ready
- **project-cognition.db**: written and queryable
- **lexicon query**: confirmed readiness: query_ready
- **recommended_next_action**: use_project_cognition
