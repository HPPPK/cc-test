# Multi-Agent Scan Strategy for Large Codebases

## Command
sp-map-scan

## Type
Process Pattern

## Summary
For a 3700+ file codebase, parallel subagent dispatch with bounded MapScanPacket contracts is the correct approach. Six lanes completed in ~2-3 minutes of wall-clock time vs. hours of sequential work.

## Key Lessons

1. **Packet boundary design matters**: Group by architectural concern (core, commands, services, UI, desktop, config), not by file type or size. This makes each subagent's context coherent.

2. **Large directories need explicit disposition**: Services/ (160 files) and Utils/ (628 files) should be flagged as sampled or inventory_only upfront. Trying to deep-read everything breaks context budgets.

3. **Evidence format consistency**: Use canonical JSON schema for worker results (packet_id, ssigned_paths, paths_read, coverage[], vidence[], provisional_nodes[], provisional_edges[], observations[], confidence). This makes integration scriptable.

4. **Stub awareness**: This project has many ant-internal stubs (Proxy-based no-ops for external builds). Always note which files are stubs vs real implementations.

5. **Subagent prompt quality matters**: The key is providing enough context about the codebase structure while giving clear output format instructions. Include actual file paths to read.

6. **alidate-scan expects specific artifact structure**: coverage-ledger.json needs a top-level ows array. map-scan.md is a required artifact.

## Evidence
Successful scan of 3702 files across 6 parallel lanes, producing 71 provisional nodes, 69 edges, 79 observations, and 74 evidence rows.
