import type { Command } from '../commands.js'
import type { ConnectedMCPServer } from '../services/mcp/types.js'
import { unsupportedFeature } from '../utils/unsupportedFeature.js'
export function fetchMcpSkillsForClient(_client: ConnectedMCPServer): Promise<Command[]> { return unsupportedFeature('mcp-skills') }
/** The unavailable private cache must not report successful invalidation. */
export namespace fetchMcpSkillsForClient {
  export const cache = {
    delete(_serverName: string): never { return unsupportedFeature('mcp-skills-cache') },
  }
}
