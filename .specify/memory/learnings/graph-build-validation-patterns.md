# Graph Build Validation Patterns

## Command
sp-map-build

## Type
Process Pattern

## Summary
The uild-from-scan tool is strict about referential integrity. Observations must reference valid evidence IDs. Edges must reference valid node IDs. Coverage paths require matching node paths.

## Key Lessons

1. **Evidence ID consistency**: Subagents generate evidence IDs that must exactly match the references in observations, nodes, and edges. Create evidence IDs first, then reference them consistently.

2. **Node/edge referential integrity**: Every edge source_id and 	arget_id must match a node id. Check all edge references against node IDs after integration.

3. **Path index source**: uild-from-scan creates path_index rows only from 
odes[].paths. Coverage paths without matching node paths are rejected as 
o_node_relation. This is expected for directory-level coverage entries.

4. **Build workflow**: alidate-scan -> uild-from-scan -> alidate-build -> lexicon query -> cognition query. Each step must pass before the next.

5. **Common fixes**: Missing evidence IDs (typo in reference), empty edge source/target (integration artifacts), missing stub nodes for edge references.

## Evidence
Successful build: 72 nodes, 57 edges, 74 evidence, 79 observations. validate-build: status=ok, readiness=query_ready.
