# map-scan Large Repository Strategy

**Command**: `sp-map-scan` on cc-haha (large monorepo)
**Date**: 2026-05-16

## Summary

When running `sp-map-scan` on a large, dual-architecture repository (~4000+ files across Bun CLI + Tauri desktop + adapters), the following strategies proved effective:

1. **Granular parallel lanes**: Dispatch 5 focused scan lanes (source-symbol, module-boundary, capability-workflow, build-test-runtime, git-evolution-risk) in parallel rather than one monolithic scan.
2. **Structured handoff contracts**: Each subagent returned structured JSON with `evidence`, `provisional_nodes`, `provisional_edges`, `confidence`, and `blockers` fields, making integration straightforward.
3. **`validate-scan` format requirement**: The `coverage.json` and `coverage-ledger.json` output files require a `rows` array where each row has `surface`, `category`, `coverage_class`, and `count` fields. Without this, `validate-scan` returns `status=blocked` even when all other files are correct.

## Key Evidence

- `validate-scan` returned `blocked` on first run with errors: `coverage.json must define a top-level rows array`, `coverage-ledger.json must define a non-empty rows array`
- After adding `rows` arrays with 56 coverage rows and 7 ledger rows, `validate-scan` returned `status=ok, readiness=scan_ready`

## Recommendations

- For large repos, use `rg --files` inventory rather than `Get-ChildItem -Recurse` for faster discovery
- Pre-validate the rows schema when authoring coverage.json to avoid validate-scan failures
- The `coverage.json` rows should cover each distinct surface area with per-row coverage class
