import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { unsupportedFeature } from '../src/utils/unsupportedFeature.js'

export type PermissionMode =
  | 'ask'
  | 'skip_all_permission_checks'
  | 'follow_a_plan';

export type Logger = {
  silly?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export type ClaudeForChromeContext = Record<string, unknown>;

export const BROWSER_TOOLS: Array<{ name: string }> = [];

export function createClaudeForChromeMcpServer(
  _context: ClaudeForChromeContext,
): McpServer {
  return unsupportedFeature('private-chrome-mcp-server')
}
