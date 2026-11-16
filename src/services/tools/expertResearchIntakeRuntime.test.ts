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
  it('does not let a second admission request erase an already saved answer or block inspection', async () => {
    for (const toolName of ['Read', 'AskUserQuestion', 'assess_expert_research_scope', 'Skill']) {
      await guardExpertIntakeToolCall({ toolName, env, fetchImpl: async () => { throw new Error('must not send redundant admission RPC') } })
    }
    await expect(requestExpertIntake('scope-assessment', {}, { env: {} })).rejects.toThrow()
  })

  it('directly retries a lost local admission acknowledgement once using the same request', async () => {
    const calls: RequestInit[] = []
    await guardExpertIntakeToolCall({ toolName: 'Agent', env: { ...env, CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456' }, fetchImpl: async (_url, init) => {
      calls.push(init!)
      expect((init as any).proxy).toBe('')
      if (calls.length === 1) throw Object.assign(new Error('secret must not leak'), { cause: { code: 'ECONNRESET' } })
      return Response.json({ allowed: true })
    } })
    expect(calls).toHaveLength(2)
    expect(calls[0]!.body).toBe(calls[1]!.body)
  })

  it('does not treat an unconfirmed admission payload as permission to research', async () => {
    for (const payload of [{}, { allowed: false }]) await expect(guardExpertIntakeToolCall({ toolName: 'Agent', env, fetchImpl: async () => Response.json(payload) })).rejects.toThrow('EXPERT_INTAKE_UNAVAILABLE')
  })

  it('keeps a safe transport cause and never claims that saved answers disappeared', async () => {
    await expect(guardExpertIntakeToolCall({ toolName: 'Agent', env, fetchImpl: async () => { throw Object.assign(new Error('sensitive upstream detail'), { cause: { code: 'ECONNRESET' } }) } })).rejects.toThrow('ECONNRESET')
    await expect(guardExpertIntakeToolCall({ toolName: 'Agent', env, fetchImpl: async () => { throw new Error('sensitive upstream detail') } })).rejects.not.toThrow('sensitive upstream detail')
  })

  it('never blindly repeats a scope assessment whose acknowledgement was lost', async () => {
    let calls = 0
    await expect(requestExpertIntake('scope-assessment', { action: 'assess', assessment: {} }, { env: { ...env, CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456' }, fetchImpl: async () => { calls++; throw new Error('lost after commit') } })).rejects.toThrow('Saved user answers remain stored')
    expect(calls).toBe(1)
  })

  it('bounds response-body stalls and identifies JSON errors without leaking response contents', async () => {
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch() {
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')) } }))
    } })
    try {
      await expect(requestExpertIntake('intake-admission', {}, { env: { ...env, CC_JIANGXIA_DESKTOP_SERVER_URL: `http://127.0.0.1:${server.port}` }, timeoutMs: 100 })).rejects.toThrow('phase=response-json')
    } finally { server.stop(true) }
    await expect(requestExpertIntake('scope-assessment', { action: 'inspect' }, { env, fetchImpl: async () => new Response('sensitive response') })).rejects.toThrow('cause=SyntaxError')
  })
})
