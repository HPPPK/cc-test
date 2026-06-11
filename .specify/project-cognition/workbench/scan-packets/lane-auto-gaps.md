# Scan Packet: lane-auto-gaps

## Packet Contract
- **packet_id**: lane-auto-gaps
- **family_id**: gaps
- **mode**: read_only
- **result_handoff_path**: .specify/project-cognition/workbench/worker-results/lane-auto-gaps.json

## Objective
Accept inventory_only gap paths that were not assigned to other scan packets.

## Assigned Paths
See scan-queue.json for full list.

## Required Output
Return a JSON file at the handoff path with coverage rows for all assigned paths.
