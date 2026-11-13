import { expect, test } from 'bun:test'
import { createClaudeForChromeMcpServer } from './ant-claude-for-chrome-mcp.js'
import { UnsupportedFeatureError } from '../src/utils/unsupportedFeature.js'

test('private Chrome MCP factory refuses unavailable integration before opening a transport', () => {
  expect(() => createClaudeForChromeMcpServer({})).toThrow(UnsupportedFeatureError)
})
