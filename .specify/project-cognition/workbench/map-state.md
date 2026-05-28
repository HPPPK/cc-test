# Map State: sp-map-build

## Command
`sp-map-build`

## Status
`query_ready`

## Build Completed
2026-05-28T03:41:05Z

## Runtime
- status: ok
- freshness: fresh
- readiness: query_ready
- graph_ready: true
- active_generation_id: GEN-20260528T034105.715065300Z
- graph_store_path: .specify/project-cognition/project-cognition.db
- runtime_format: project-cognition-go
- runtime_schema: 1

## Build Preflight
- passive learning start: pass, no map-build-specific lessons loaded
- validate-scan: pass
- execution_model: subagent-mandatory
- dispatch_shape: parallel-subagents
- execution_surface: native-subagents
- native subagent tools discovered: spawn_agent, wait_agent, close_agent
- choose_subagent_dispatch helper: unavailable in current runtime; preserved workflow dispatch shape through native subagent primitives
- accepted scan packets available: 6/6

## Build Commands
- `project-cognition.exe validate-scan --format json`: status=ok, readiness=scan_ready
- `project-cognition.exe build-from-scan --format json`: status=ok, readiness=query_ready
- `project-cognition.exe validate-build --format json`: status=ok, readiness=query_ready

## Runtime Counts
- scan artifact coverage paths: 3334
- DB coverage paths: 187
- nodes: 43
- edges: 40
- observations: 32
- evidence rows: 318
- path index rows: 190
- query smoke test: ok

## Repository Universe
- Candidate files: 3691
- Included: 3334
- Excluded: 357
- Ambiguous: 0

## Completed Scan Packets (6/6)
| Lane | Result | Assigned | Read | Nodes | Edges | Observations |
|---|---|---:|---:|---:|---:|---:|
| root-config-runtime | accepted | 8 | 10 | 7 | 6 | 3 |
| server-workflow-api | accepted | 80 | 10 | 6 | 6 | 5 |
| desktop-workflow-ui | accepted | 40 | 40 | 6 | 6 | 7 |
| tools-agent-loop | accepted | 85 | 18 | 12 | 13 | 8 |
| verification-release-docs | accepted | 120 | 120 | 5 | 4 | 4 |
| adapters-services-risk | accepted | 120 | 120 | 7 | 5 | 5 |

## Build Acceptance Subagents
- packet-intake lane: blocked review finding; packet/result pairing was complete and no fail_contract/fail_systemic indicators were found, but the lane flagged `.specify` control paths in `root-config-runtime` paths_read and broad inventory_only coverage in server-workflow-api and tools-agent-loop.
- boundary lane: pass; repository-universe is coherent and no ignored or excluded path leaked into accepted graph-facing evidence or provisional graph paths.
- provisional-graph lane: pass; node paths, confidence, packet ids, evidence ids, and edge endpoints are structurally valid.

## Leader Adjudication
- Baseline activation is accepted because canonical `build-from-scan` and `validate-build` both returned query_ready.
- The builder rejected coverage rows without node relations as `no_node_relation`; these rejected rows are not active graph truth.
- Runtime query against `.specify/project-cognition/workbench/scan-packets/root-config-runtime.md` and `.specify/project-cognition/workbench/repository-universe.json` returned no graph nodes, confirming workbench paths are not published as graph nodes.
- Packet-intake concerns remain maintenance risks for future map-update or targeted map-scan refresh, not active runtime blockers.

## Query Smoke
- `lexicon --intent implement --query="" --format json`: readiness=query_ready, concept_candidates=[]
- `query --intent implement --query-plan ...`: readiness=query_ready, baseline_health.freshness=fresh, returned nodes for `package.json` and `src/tools.ts`
- `lexicon --intent implement --query="map build" --format json`: readiness=query_ready, terms=`map`,`build`
- `query --intent implement` with graph-backed paths returned nodes for `src/tools.ts`, `desktop/src/api/sessions.ts`, `src/server/api/sessions.ts`, and `package.json`

## Known Unknowns And Maintenance Notes
- `server.service.workflow_runtime` is backed by contract-test evidence rather than a direct implementation-file read; use localized map-update or targeted scan refresh when changing workflow runtime internals.
- `src/services/compact/reactiveCompact.ts` is stub-backed in the scan evidence; keep related claims downgraded or verify live before depending on it.
- Some observations are narrative-only and must not be promoted into stronger claims without evidence attachment.
- Repository-universe exclusions are broader than `.cognitionignore`; consumers should treat repository-universe dispositions as authoritative for this baseline.

## Blockers
None for the active query-backed baseline.

## Next Step
Use project cognition for future existing-system routing. Use `sp-map-update` for localized touched-area drift; use `sp-map-scan` followed by `sp-map-build` only for missing/unusable baseline, schema failure, zero active-generation path-index rows, explicit rebuild, or baseline identity invalid.
