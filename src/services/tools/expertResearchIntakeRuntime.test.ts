import { describe, expect, it } from 'bun:test'
import { guardExpertIntakeToolCall, requestExpertIntake } from './expertResearchIntakeRuntime.js'
const env = { CC_JIANGXIA_EXPERT_TEMPLATE_FILL_DELIVERY: 'cli-only', CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://local', CC_JIANGXIA_EXPERT_SESSION_ID: 's' }
describe('Expert intake execution admission', () => {
  it('preserves ordinary runtime and fails closed for all unresolved tools', async () => {
    await guardExpertIntakeToolCall({ toolName: 'Bash', env: {} })
    for (const toolName of ['Agent', 'Bash', 'Write', 'Playwright', 'WebSearch']) {
      await expect(guardExpertIntakeToolCall({ toolName, env, fetchImpl: async () => Response.json({ message: 'EXPERT_INTAKE_REQUIRED' }, { status: 409 }) })).rejects.toThrow('EXPERT_INTAKE_REQUIRED')
    }
    await expect(guardExpertIntakeToolCall({ toolName: 'Bash', env, fetchImpl: async () => { throw new Error('offline') } })).rejects.toThrow('EXPERT_INTAKE_UNAVAILABLE')
  })
  it('allows only bounded intake reads/questions and sends actual tool identity', async () => {
    for (const toolName of ['Read', 'AskUserQuestion', 'assess_expert_research_scope']) {
      await guardExpertIntakeToolCall({ toolName, env, fetchImpl: async (_url, init) => { expect(JSON.parse(String(init?.body)).toolName).toBe(toolName); return Response.json({ allowed: true }) } })
    }
    await expect(requestExpertIntake('scope-assessment', {}, { env: {} })).rejects.toThrow()
  })
})
