import type { ConfigScope, MCPServerConnection, McpStdioServerConfig, McpSSEServerConfig, McpHTTPServerConfig, McpClaudeAIProxyServerConfig } from '../../services/mcp/types.js'

type BaseServerInfo = { name: string, client: MCPServerConnection, scope: ConfigScope }
export type StdioServerInfo = BaseServerInfo & { transport: 'stdio', config: McpStdioServerConfig }
export type SSEServerInfo = BaseServerInfo & { transport: 'sse', config: McpSSEServerConfig, isAuthenticated?: boolean }
export type HTTPServerInfo = BaseServerInfo & { transport: 'http', config: McpHTTPServerConfig, isAuthenticated?: boolean }
export type ClaudeAIServerInfo = BaseServerInfo & { transport: 'claudeai-proxy', config: McpClaudeAIProxyServerConfig, isAuthenticated?: boolean }
export type ServerInfo = StdioServerInfo | SSEServerInfo | HTTPServerInfo | ClaudeAIServerInfo
export type AgentMcpServerInfo = { name: string, sourceAgents: string[], isAuthenticated?: boolean } & (
  | { transport: 'stdio', command: string, url?: never, needsAuth: false }
  | { transport: 'sse' | 'http', url: string, command?: never, needsAuth: true }
  | { transport: 'ws', url: string, command?: never, needsAuth: false }
)
export type MCPViewState =
  | { type: 'list', defaultTab?: 'Claude Code' | 'claude.ai' | 'Agents' }
  | { type: 'server-menu' | 'server-tools', server: ServerInfo }
  | { type: 'server-tool-detail', server: ServerInfo, toolIndex: number }
  | { type: 'agent-server-menu', agentServer: AgentMcpServerInfo }
