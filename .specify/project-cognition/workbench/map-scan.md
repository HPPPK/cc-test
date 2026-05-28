# Map Scan Report

## Command
`sp-map-scan`

## Status
`scan_ready`

## Scan Date
2026-05-28T03:28:41.238Z

## Boundary
- Candidate files: 3691
- Included files: 3334
- Excluded files: 357
- Hard boundary: .specify/** remained workflow/runtime state only and was not used as repository graph evidence.

## Methodology
Six native subagent scan lanes were dispatched from bounded packets and accepted by the leader after checking result files, assigned-path coverage, evidence rows, provisional nodes, provisional edges, and observations.

## Scan Packets
- root-config-runtime: accepted; assigned 8, read 10, evidence 10, nodes 7, edges 6, observations 3
- server-workflow-api: accepted; assigned 80, read 10, evidence 10, nodes 6, edges 6, observations 5
- desktop-workflow-ui: accepted; assigned 40, read 40, evidence 40, nodes 6, edges 6, observations 7
- tools-agent-loop: accepted; assigned 85, read 18, evidence 18, nodes 12, edges 13, observations 8
- verification-release-docs: accepted; assigned 120, read 120, evidence 120, nodes 5, edges 4, observations 4
- adapters-services-risk: accepted; assigned 120, read 120, evidence 120, nodes 7, edges 5, observations 5

## Coverage
- Coverage rows: 3334
- Worker-assigned rows: 453
- Universe-only rows: 2881
- Read/deep rows: 256
- Sampled rows: 1285
- Inventory-only rows: 1793

## Evidence
- Evidence rows: 318
- Provisional nodes: 43
- Provisional edges: 40
- Observations: 32

## Open Uncertainties
- Paths outside the six worker packets are represented explicitly from repository-universe classification and should be deepened by `sp-map-update` when a query depends on them.
- Binary assets, docs images, generated locks, and broad support files remain low-risk inventory unless release/docs behavior changes require more detail.
- This scan does not publish final cognition truth; it prepares provisional evidence for `sp-map-build`.

## Handoff
Ready for `sp-map-build` graph reconstruction after `validate-scan` confirms readiness.
