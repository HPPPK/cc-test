import { describe, expect, test } from 'bun:test'
import type { Tool } from '../../Tool.js'

async function loadTool(): Promise<Tool> {
  const mod = await import('./RequestWorkflowRouteTool.js') as { RequestWorkflowRouteTool?: Tool }
  if (!mod.RequestWorkflowRouteTool) throw new Error('RequestWorkflowRouteTool export is required')
  return mod.RequestWorkflowRouteTool
}

describe('RequestWorkflowRouteTool', () => {
  test('is strict and validates jump target requirements', async () => {
    const tool = await loadTool()
    expect(tool.name).toBe('request_workflow_route')
    expect(tool.strict).toBe(true)
    const valid = {
      intent: 'jump_to_phase',
      targetPhaseId: 'delegate-implement',
      rationale: 'Validation found an implementation defect.',
      evidence: [{ kind: 'test', ref: 'route-regression' }],
    }
    expect(tool.inputSchema.safeParse(valid).success).toBe(true)
    expect(tool.inputSchema.safeParse({ ...valid, targetPhaseId: undefined }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ ...valid, unknown: true }).success).toBe(false)
  })
})
