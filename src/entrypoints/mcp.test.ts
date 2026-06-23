import { describe, expect, test } from 'bun:test'

import { getEmptyToolPermissionContext } from '../Tool.js'
import { WorkflowTemplateAuthoringTool } from '../tools/WorkflowTemplateAuthoringTool/WorkflowTemplateAuthoringTool.js'
import { toolToMCPListTool } from './mcp.js'

describe('MCP entrypoint tool schema publishing', () => {
  test('uses explicit tool input JSON schema when available', async () => {
    const tool = await toolToMCPListTool(
      WorkflowTemplateAuthoringTool,
      getEmptyToolPermissionContext(),
      [WorkflowTemplateAuthoringTool],
    )
    const schema = tool.inputSchema as Record<string, unknown>
    const properties = schema.properties as Record<string, unknown>
    const operation = properties.operation as Record<string, unknown>
    const template = properties.template as Record<string, unknown>

    expect(schema.type).toBe('object')
    expect(schema.required).toEqual(['operation'])
    expect(operation.enum).toEqual(['guide', 'skill_catalog', 'skill_create', 'list', 'inspect', 'validate', 'create', 'update', 'duplicate', 'delete'])
    expect(template.type).toBe('object')
    expect(template.additionalProperties).toBe(true)
    expect(schema.oneOf).toBeUndefined()
  })
})
