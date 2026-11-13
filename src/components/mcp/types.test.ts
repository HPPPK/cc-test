import { expect, test } from 'bun:test'
import type { AgentDefinition } from '../../tools/AgentTool/loadAgentsDir.js'
import { extractAgentMcpServers } from '../../services/mcp/utils.js'
import type { AgentMcpServerInfo } from './types.js'

test('agent MCP summaries discriminate local command and remote URL contracts', () => {
  const agents: AgentDefinition[] = [{ agentType: 'reader', whenToUse: 'read', getSystemPrompt: () => 'Read', source: 'userSettings', mcpServers: [{ local: { type: 'stdio', command: 'server', args: [] } }, { remote: { type: 'http', url: 'https://example.test' } }] }]
  const summaries: AgentMcpServerInfo[] = extractAgentMcpServers(agents)
  expect(summaries).toEqual([{ name: 'local', sourceAgents: ['reader'], transport: 'stdio', command: 'server', needsAuth: false }, { name: 'remote', sourceAgents: ['reader'], transport: 'http', url: 'https://example.test', needsAuth: true }])
})
