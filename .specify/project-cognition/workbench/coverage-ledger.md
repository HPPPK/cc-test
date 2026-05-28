# Coverage Ledger

## Status
`scan_ready`

## Packets
| Packet | Assigned | Read | Evidence | Nodes | Edges | Observations |
|---|---:|---:|---:|---:|---:|---:|
| root-config-runtime | 8 | 10 | 10 | 7 | 6 | 3 |
| server-workflow-api | 80 | 10 | 10 | 6 | 6 | 5 |
| desktop-workflow-ui | 40 | 40 | 40 | 6 | 6 | 7 |
| tools-agent-loop | 85 | 18 | 18 | 12 | 13 | 8 |
| verification-release-docs | 120 | 120 | 120 | 5 | 4 | 4 |
| adapters-services-risk | 120 | 120 | 120 | 7 | 5 | 5 |

## Outcomes
| Outcome | Count |
|---|---:|
| deep_read | 56 |
| inventory_only | 1793 |
| read | 200 |
| sampled | 1285 |

## Explicit Gaps
- gap:repository-universe-unassigned: non-packet included paths; inventory_or_sampled_in_universe; revisit When a query requires deeper evidence for paths outside the six accepted scan packets.
- gap:large-assets-and-docs: assets, docs, workflow support files; inventory_only_or_sampled; revisit When release/docs/asset behavior changes or build validation flags them.
