import { describe, expect, it } from 'bun:test'
import { ExpertResearchScopeTool } from './ExpertResearchScopeTool.js'
describe('Expert scope assessment host tool', () => {
  it('exposes an object-root provider schema and rejects self-declared readiness', () => {
    expect(ExpertResearchScopeTool.inputSchema.safeParse({ action: 'assess', ready: true }).success).toBe(false)
    expect(ExpertResearchScopeTool.inputSchema.safeParse({ action: 'inspect' }).success).toBe(true)
  })
  it('tells the model to continue from canonical scope and distinguish answer receipt IDs', async () => {
    const prompt = await ExpertResearchScopeTool.prompt()
    expect(prompt).toContain('continue_research')
    expect(prompt).toContain('requestId/toolUseId are not human evidence messageId')
    expect(prompt).toContain('without reassessing')
    expect(prompt).toContain('product platform/environment')
    expect(prompt).toContain('not the report format')
  })
  it('denies child agents before any server request', async () => {
    await expect(ExpertResearchScopeTool.call({ action: 'inspect' }, { agentId: 'child' } as never)).rejects.toThrow('main session')
  })
})
