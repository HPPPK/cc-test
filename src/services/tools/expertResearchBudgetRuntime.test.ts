import { describe, expect, test } from 'bun:test'
import { reserveExpertResearcherStart, guardExpertResearchToolCall } from './expertResearchBudgetRuntime.js'
const env = { CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE: '1', CC_JIANGXIA_EXPERT_TEMPLATE_FILL_DELIVERY: 'cli-only', CC_JIANGXIA_EXPERT_SESSION_ID: 's', CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://localhost:3456' }
describe('Expert research budget runtime', () => {
  test('fails closed on canonical reservation transport and denial', async () => {
    await expect(reserveExpertResearcherStart({ agentId: 'a', agentType: 'expert-evidence-researcher', expertId: 'commercialization-research-report', artifactPath: 'lane', env, fetchImpl: async () => { throw new Error('offline') } })).rejects.toThrow('EXPERT_RESEARCH_BUDGET')
    await expect(guardExpertResearchToolCall({ toolName: 'Playwright', agentId: 'a', env, fetchImpl: async () => Response.json({ allowed: false, reason: 'budget spent' }) })).rejects.toThrow('budget spent')
  })
  test('guards root browser/fetch/shell bypass, preserves CLI Bash and Markdown', async () => {
    const bodies: unknown[] = []
    const fetchImpl = async (_: unknown, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return Response.json({ allowed: false, reason: 'save evidence' }) }
    for (const [toolName, input] of [['Playwright', {}], ['WebFetch', {}], ['Bash', { command: 'curl https://example.com' }], ['PowerShell', { command: 'Invoke-WebRequest https://example.com' }]] as const) await expect(guardExpertResearchToolCall({ toolName, input, env, fetchImpl })).rejects.toThrow('save evidence')
    await guardExpertResearchToolCall({ toolName: 'Bash', input: { command: 'cc-jiangxia expert-template-fill --data-stdin --output report.html' }, env, fetchImpl })
    await guardExpertResearchToolCall({ toolName: 'Write', input: {}, env, fetchImpl })
    await guardExpertResearchToolCall({ toolName: 'PowerShell', input: { command: 'cc-jiangxia expert-template-fill --data-stdin --output report.html' }, env, fetchImpl })
    expect(bodies).toHaveLength(4)
  })
  test('every actual browser retry has a distinct reservation identity', async () => {
    const ids: string[] = []
    const fetchImpl = async (_: unknown, init?: RequestInit) => { ids.push(JSON.parse(String(init?.body)).requestId); return Response.json({ allowed: true }) }
    await guardExpertResearchToolCall({ toolName: 'Playwright', agentId: 'a', env, fetchImpl })
    await guardExpertResearchToolCall({ toolName: 'Playwright', agentId: 'a', env, fetchImpl })
    expect(new Set(ids).size).toBe(2)
    await guardExpertResearchToolCall({ toolName: 'Playwright', env: {}, fetchImpl })
    expect(ids).toHaveLength(2)
  })
})

test('researcher reservation leaves other roles and experts unchanged and fails on missing canonical identity', async () => {
  await reserveExpertResearcherStart({ agentId: 'd', agentType: 'expert-evidence-reviewer', expertId: 'commercialization-research-report', env: {} })
  await reserveExpertResearcherStart({ agentId: 'a', agentType: 'expert-evidence-researcher', expertId: 'other', env: {} })
  await expect(reserveExpertResearcherStart({ agentId: 'a', agentType: 'expert-evidence-researcher', expertId: 'commercialization-research-report', env: {} })).rejects.toThrow('identity is unavailable')
  let body: unknown
  await reserveExpertResearcherStart({ agentId: 'a', agentType: 'expert-evidence-researcher', expertId: 'commercialization-research-report', artifactPath: 'lane', env, fetchImpl: async (_, init) => { body = JSON.parse(String(init?.body)); return Response.json({ allowed: true }) } })
  expect(body).toMatchObject({ action: 'reserve-researcher', agentId: 'a', artifactPath: 'lane' })
})

test('literal CLI stdin payload words do not impersonate shell research commands', async () => {
  const { isExpertPublicResearchCall } = await import('./expertResearchBudgetRuntime.js')
  const cli = `bun run ./bin/claude-jiangxia expert-template-fill --data-stdin --output report.html <<'JSON'\n{"fields":{"DATA_DECLARATION":"来源通过 Playwright 实际打开; curl is not evidence"}}\nJSON`
  expect(isExpertPublicResearchCall('Bash', { command: cli })).toBe(false)
  expect(isExpertPublicResearchCall('Bash', { command: 'curl https://example.com; ' + cli })).toBe(true)
  expect(isExpertPublicResearchCall('Bash', { command: cli + '\ncurl https://example.com' })).toBe(true)
  expect(isExpertPublicResearchCall('Bash', { command: cli.replace("<<'JSON'", '<<JSON') })).toBe(true)
  expect(isExpertPublicResearchCall('Bash', { command: cli.replace('expert-template-fill', 'other-command') })).toBe(true)
  expect(isExpertPublicResearchCall('Bash', { command: cli.replace('{"fields":{"DATA_DECLARATION":"来源通过 Playwright 实际打开; curl is not evidence"}}', '["Playwright"]') })).toBe(true)
  expect(isExpertPublicResearchCall('Bash', { command: cli.replace("<<'JSON'", '<<-"JSON"').replace('\nJSON', '\n\tJSON') })).toBe(false)
  expect(isExpertPublicResearchCall('Bash', { command: cli.replace('\nJSON', '') })).toBe(true)
  expect(isExpertPublicResearchCall('Bash', { command: cli.replace('{"fields":', '{not-json:') })).toBe(true)

})
