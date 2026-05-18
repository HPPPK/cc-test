# Open Questions

## Hard Blocking

- Does the current effective capability boundary match the intended product contract?
- Should custom-agent frontmatter `hooks`, `skills`, and `mcpServers` be restored for in-process teammates?
- Should pane-based and in-process teammates expose the same effective capability set?
- Should absent `providerId` preserve legacy/inherited behavior, while explicit `providerId: null` means official/default provider?
- Should teammate capability parity work for hooks/skills/MCP be included in the same feature slice as runtime selection, or handled as a separate restoration/fix?

## Soft Blocking

- Should hook support be documented as unavailable, simulated through lifecycle events, or scoped to a future runtime capability?
- Should Skills be inherited from the parent environment by default, role-scoped through `subagent_type`, or selected per member?
- Should MCP access and credentials be inherited, denied by default, or explicitly granted through custom Agent frontmatter?
- Should team status UI show each member's effective provider name and model ID?
- Should the Agent tool expose nested `runtime: { providerId, modelId }`, or flatter fields such as `providerId` and `modelId`?
