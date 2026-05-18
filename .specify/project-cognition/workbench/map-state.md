# Map State — sp-map-update (2nd)

**Status**: update_complete (partial_refresh — working tree dirty)  
**Timestamp**: 2026-05-16T21:59:00Z  
**Command**: `sp-map-update`

## Update Result

| Metric | Value |
|--------|-------|
| Update trigger | Diff-driven from working tree |
| Update ID | `UPDATE-aba9af6a9de74897b0d55578151ac2ae` |
| validate-build | `status=ok, readiness=query_ready` |
| query_contract_version | 2 (upgraded from 1) |
| complete-refresh | Blocked (uncommitted working tree changes) |
| Global freshness | `fresh` |

## Changes Detected (New vs Previous Update)

| Path | Nature |
|------|--------|
| `src/components/messages/nullRenderingAttachments.ts` | Newly detected change |
| `src/tools/AgentTool/prompt.ts` | Newly detected change |
| `src/utils/api.ts` | Newly detected change |
| `src/utils/attachments.ts` | Newly detected change |
| `src/utils/messages.ts` | Newly detected change |
| `desktop/src-tauri/Cargo.toml` | Newly detected change |

## Open Issues

1. `complete-refresh` blocked by uncommitted working tree — commit changes then rerun `sp-map-update`.
2. `query_contract_version` upgraded from 1→2 during this run (specify tooling requirement).

## Next Step

Return to blocked workflow. Affected query scope is **green** (query_ready validation passed, contract v2).
