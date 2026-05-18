import { describe, expect, test } from 'bun:test'
import { z } from 'zod/v4'
import type { Tool } from '../Tool.js'
import { AGENT_TOOL_NAME } from '../tools/AgentTool/constants.js'
import { getEmptyToolPermissionContext } from '../Tool.js'
import { clearToolSchemaCache } from './toolSchemaCache.js'

describe('toolToAPISchema', () => {
  test('hides teammate runtime fields when agent teams are disabled', async () => {
    const originalAgentTeams = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
    clearToolSchemaCache()

    try {
      const { toolToAPISchema } = await import('./api.js')
      const tool = {
        name: AGENT_TOOL_NAME,
        aliases: [],
        inputSchema: z.object({
          description: z.string(),
          prompt: z.string(),
          name: z.string().optional(),
          team_name: z.string().optional(),
          mode: z.string().optional(),
          provider_id: z.string().nullable().optional(),
          model_id: z.string().optional(),
        }),
        prompt: async () => 'Launch a new agent',
      } as unknown as Tool

      const schema = await toolToAPISchema(tool, {
        getToolPermissionContext: async () => getEmptyToolPermissionContext(),
        tools: [],
        agents: [],
      })

      expect(schema.input_schema.properties).toHaveProperty('description')
      expect(schema.input_schema.properties).toHaveProperty('prompt')
      expect(schema.input_schema.properties).not.toHaveProperty('name')
      expect(schema.input_schema.properties).not.toHaveProperty('team_name')
      expect(schema.input_schema.properties).not.toHaveProperty('mode')
      expect(schema.input_schema.properties).not.toHaveProperty('provider_id')
      expect(schema.input_schema.properties).not.toHaveProperty('model_id')
    } finally {
      if (originalAgentTeams === undefined) {
        delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
      } else {
        process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = originalAgentTeams
      }
      clearToolSchemaCache()
    }
  })
})
