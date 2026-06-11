# Coverage Ledger: sp-map-scan

## Summary
- **Total included paths**: 3344
- **Total scanned paths**: 631
- **Total accepted gap paths**: 2713
- **Scan completion**: 18.9%

## Lane Status

| Lane ID | Assigned | Scanned | Gaps | Status |
|---------|----------|---------|------|--------|
| lane-src-commands-tools | 456 | 173 | 283 | pass |
| lane-src-server-services | 352 | 204 | 148 | pass |
| lane-src-skills-state | 107 | 108 | 0 | pass |
| lane-src-components | 419 | 0 | 419 | accepted_gap |
| lane-src-hooks-bridge | 281 | 0 | 281 | accepted_gap |
| lane-src-utils-vendor | 664 | 0 | 664 | accepted_gap |
| lane-src-other | 99 | 99 | 0 | pass |
| lane-desktop | 390 | 0 | 390 | accepted_gap |
| lane-adapters-scripts | 156 | 0 | 156 | accepted_gap |
| lane-docs-codex | 393 | 20 | 373 | partial |
| lane-root-github | 27 | 27 | 0 | pass |
| lane-git-evolution | 0 | 0 | 0 | pass |

## Open Gaps (low_risk_open_gap)

### lane-src-components (419 paths)
- **Reason**: subagent_timeout (both attempts)
- **Criticality**: important
- **Revisit condition**: next sp-map-update or sp-map-scan rebuild

### lane-src-hooks-bridge (281 paths)
- **Reason**: subagent_timeout
- **Criticality**: important
- **Revisit condition**: next sp-map-update or sp-map-scan rebuild

### lane-src-utils-vendor (664 paths)
- **Reason**: subagent_timeout
- **Criticality**: low_risk
- **Revisit condition**: next sp-map-update or sp-map-scan rebuild

### lane-desktop (390 paths)
- **Reason**: subagent_timeout (both attempts)
- **Criticality**: important
- **Revisit condition**: next sp-map-update or sp-map-scan rebuild

### lane-adapters-scripts (156 paths)
- **Reason**: subagent_timeout
- **Criticality**: important
- **Revisit condition**: next sp-map-update or sp-map-scan rebuild

### lane-docs-codex (373 unscanned paths)
- **Reason**: subagent_timeout
- **Criticality**: low_risk
- **Revisit condition**: next sp-map-update or sp-map-scan rebuild

## Evidence Summary
- **Total evidence rows**: 171
- **Nodes**: 30
- **Edges**: 25
- **Observations**: 24
