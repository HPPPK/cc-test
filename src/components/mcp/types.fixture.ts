import type { AgentMcpServerInfo, MCPViewState, ServerInfo } from './types.js'
const agent: AgentMcpServerInfo = { name: 'local', sourceAgents: ['agent'], transport: 'stdio', command: 'server', needsAuth: false }
// @ts-expect-error an agent stdio server requires a command, not a URL
const badAgent: AgentMcpServerInfo = { name: 'local', sourceAgents: [], transport: 'stdio', url: 'https://example.test', needsAuth: false }
// @ts-expect-error selected server state requires its selected server
const view: MCPViewState = { type: 'server-menu' }
type HttpConfig = Extract<ServerInfo, { transport: 'http' }>['config']
// @ts-expect-error backend HTTP config is not an stdio command
const config: HttpConfig = { type: 'stdio', command: 'server', args: [] }
void [agent, badAgent, view, config]
