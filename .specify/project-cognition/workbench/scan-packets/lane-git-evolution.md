# Scan Packet: lane-git-evolution

## Packet Contract
- **packet_id**: lane-git-evolution
- **family_id**: git-history
- **mode**: read_only
- **result_handoff_path**: .specify/project-cognition/workbench/worker-results/lane-git-evolution.json

## Objective
Analyze git history for project evolution, contributor patterns, and architectural milestones.

## Assigned Paths
(none - this lane analyzes git history, not specific files)

## Required Output
Return a JSON file at the handoff path with:
- packet_id, family_id, assigned_paths, paths_read
- ledger: {todo, doing, done, blocked, overflow}
- coverage: [{path, outcome, evidence_ids}]
- confidence: verified|high|medium|low|provisional
- acceptance: pass|fail_gap|fail_quality|fail_contract
