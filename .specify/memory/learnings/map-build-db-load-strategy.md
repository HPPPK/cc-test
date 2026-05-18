# map-build DB Load Strategy

**Command**: `sp-map-build` on cc-haha
**Date**: 2026-05-16

## Summary

When running `sp-map-build`, the `specify` CLI tool does not have a direct "load scan data into DB" command. The DB must be populated through direct SQL injection.

## Key Pattern

1. **Write a SQL script** that creates gen-N with all provisional data (nodes, edges, observations, claims, evidence)
2. **Execute via sqlite3**: `sqlite3 project-cognition.db ".read load.sql"`
3. **Run `publish-runtime-metadata`** — this writes the correct status.json format with `graph_ready=true, baseline_state=ready`
4. **Run `validate-build`** — confirms `query_ready`
5. **Run `complete-refresh`** — records the git baseline

## Important Gotchas

- The `version` field in status.json must be an integer (DB schema version), not a project version string like `"999.0.0-local"`. The `publish-runtime-metadata` command auto-fixes this.
- `complete-refresh` will report topic-level `stale` when scan artifacts created new files — this is expected. The global freshness shows `fresh`.
- The DB generation SQL template (`worker-results/gen-NNN-load.sql`) is reusable for future rebuilds.

## Evidence

- `validate-build` returned `status=ok, readiness=query_ready` after DB population
- `lexicon` query returned 96+ searchable terms with aliases, paths, and symbols
- `query` returned capability candidates with subgraph edges and minimal live reads
