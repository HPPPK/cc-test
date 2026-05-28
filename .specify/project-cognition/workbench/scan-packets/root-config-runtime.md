# MapScanPacket: root-config-runtime

mode: read_only
packet_id: root-config-runtime
lane_id: root-config-runtime
result_handoff_path: .specify/project-cognition/workbench/worker-results/root-config-runtime.json

## Objective
Collect graph-native scan evidence for root-config-runtime.

## Authoritative Inputs
- .specify/project-cognition/workbench/repository-universe.json
- Live repository files listed below

## Allowed Read Scope
- AGENTS.md
- package.json
- tsconfig.json
- bunfig.toml
- bin/claude-jiangxia
- bin/claude-jiangxia.ps1
- src/main.tsx
- src/setup.ts

## Forbidden Paths
- .specify/** except the packet, repository-universe, and worker-result path for workflow operation
- node_modules/**, artifacts/**, build output, secrets, environment files

## Packet Ledger
- todo: 8 assigned paths
- doing: 0
- done: 0
- blocked: 0
- overflow: 0

## Acceptance Checks
- Return JSON at .specify/project-cognition/workbench/worker-results/root-config-runtime.json
- Top-level acceptance must be pass or a fail_* value
- Repeat assigned_paths exactly
- paths_read must be a non-empty concrete path array
- Account for every assigned path in coverage
- Evidence rows must include source_path and support read/deep_read coverage outcomes

## Required Handoff Shape
{
  "packet_id": "root-config-runtime",
  "acceptance": "pass",
  "assigned_paths": [],
  "paths_read": [],
  "coverage": [],
  "evidence": [],
  "provisional_nodes": [],
  "provisional_edges": [],
  "observations": [],
  "confidence": "high"
}
