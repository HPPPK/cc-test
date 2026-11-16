import { describe, expect, test } from 'bun:test'
import { reserveExpertResearcherStart, guardExpertResearchToolCall, finishExpertResearcher } from './expertResearchBudgetRuntime.js'
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
  expect(isExpertPublicResearchCall('Bash', { command: cli.replace('{"fields":{"DATA_DECLARATION":"来源通过 Playwright 实际打开; curl is not evidence"}}', '["Playwright"]') })).toBe(false)
  expect(isExpertPublicResearchCall('Bash', { command: cli.replace("<<'JSON'", '<<-"JSON"').replace('\nJSON', '\n\tJSON') })).toBe(false)
  expect(isExpertPublicResearchCall('Bash', { command: cli.replace('\nJSON', '') })).toBe(true)
  expect(isExpertPublicResearchCall('Bash', { command: cli.replace('{"fields":', '{not-json:') })).toBe(false)
  expect(isExpertPublicResearchCall('Bash', { command: cli.replace('\nJSON', '}\nJSON') })).toBe(false)

})

test('configured CLI executable environment forms preserve literal report stdin without hiding shell commands', async () => {
  const { isExpertPublicResearchCall } = await import('./expertResearchBudgetRuntime.js')
  for (const executable of ['"$CLAUDE_CLI_PATH"', '"${CLAUDE_CLI_PATH}"', '$CLAUDE_CLI_PATH', '${CLAUDE_CLI_PATH}']) {
    const cli = executable + " expert-template-fill --data-stdin --output report.html <<'JSON'\n" + JSON.stringify({ fields: { DATA_DECLARATION: 'Playwright 实际打开，curl 不是引用证据' } }) + '\nJSON'
    expect(isExpertPublicResearchCall('Bash', { command: cli })).toBe(false)
    expect(isExpertPublicResearchCall('Bash', { command: 'curl https://example.com; ' + cli })).toBe(true)
    expect(isExpertPublicResearchCall('Bash', { command: cli + '\ncurl https://example.com' })).toBe(true)
    expect(isExpertPublicResearchCall('Bash', { command: cli.replace('CLAUDE_CLI_PATH', 'ARBITRARY_PATH') })).toBe(true)
  }
})

test('PowerShell literal JSON here-strings for configured report CLI keep real network commands visible', async () => {
  const { isExpertPublicResearchCall } = await import('./expertResearchBudgetRuntime.js')
  const data = JSON.stringify({ fields: { DATA_DECLARATION: 'Playwright 实际打开，curl 不是引用证据' } })
  const cli = '& $env:CLAUDE_CLI_PATH expert-template-fill --data-stdin --output report.html'
  for (const command of ["@'\n" + data + "\n'@ | " + cli, "$payload = @'\n" + data + "\n'@\n$payload | " + cli]) {
    expect(isExpertPublicResearchCall('PowerShell', { command })).toBe(false)
    expect(isExpertPublicResearchCall('PowerShell', { command: 'Invoke-WebRequest https://example.com; ' + command })).toBe(true)
    expect(isExpertPublicResearchCall('PowerShell', { command: command + '\nInvoke-WebRequest https://example.com' })).toBe(true)
    expect(isExpertPublicResearchCall('PowerShell', { command: command.replace('CLAUDE_CLI_PATH', 'ARBITRARY_PATH') })).toBe(true)
    expect(isExpertPublicResearchCall('PowerShell', { command: command.replace("@'", '@"').replace("'@", '"@') })).toBe(true)
    expect(isExpertPublicResearchCall('PowerShell', { command: command.replace(data, '["Playwright"]') })).toBe(false)
    expect(isExpertPublicResearchCall('PowerShell', { command: command.replace(data, '{not-json: Playwright}') })).toBe(false)
    expect(isExpertPublicResearchCall('PowerShell', { command: command.replace("'@", '') })).toBe(true)

  }
})


test.each(['reserve-researcher', 'reserve-browser'] as const)('preserves scoped server denial verbatim for %s without adding a global stop', async (action) => {
  const reason = 'EXPERT_RESEARCH_BUDGET_EXHAUSTED: researcher start limit reached; already-running researchers may continue within their own budgets.'
  const fetchImpl = async () => Response.json({ allowed: false, reason }, { status: 409 })
  const pending = action === 'reserve-researcher'
    ? reserveExpertResearcherStart({ agentId: 'rejected-start', agentType: 'expert-evidence-researcher', expertId: 'commercialization-research-report', artifactPath: 'lane', env, fetchImpl })
    : guardExpertResearchToolCall({ toolName: 'Playwright', agentId: 'existing-worker', env, fetchImpl })
  const error = await pending.then(() => undefined, (error) => error as Error)
  expect(error?.message).toBe(reason)
  expect(error?.message).not.toContain('without further research')
})

test('unavailable admission service fails only the requested operation without claiming global exhaustion', async () => {
  const error = await reserveExpertResearcherStart({ agentId: 'a', agentType: 'expert-evidence-researcher', expertId: 'commercialization-research-report', artifactPath: 'lane', env, fetchImpl: async () => { throw new Error('offline') } }).then(() => undefined, (error) => error as Error)
  expect(error?.message).toContain('offline')
  expect(error?.message).toContain('requested operation was not admitted')
  expect(error?.message).not.toContain('without further research')
})


test('worker cleanup reports its own terminal lifecycle without an extra model call or refunded admission', async () => {
  const bodies: any[] = []
  const fetchImpl = async (_url: string, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return Response.json({ allowed: true }) }
  await finishExpertResearcher({ agentId: 'a', agentType: 'expert-evidence-researcher', expertId: 'commercialization-research-report', env, fetchImpl })
  expect(bodies).toEqual([{ action: 'finish-researcher', agentId: 'a' }])
  await finishExpertResearcher({ agentId: 'reviewer', agentType: 'expert-evidence-reviewer', expertId: 'commercialization-research-report', env, fetchImpl })
  expect(bodies).toHaveLength(1)
  await expect(finishExpertResearcher({ agentId: 'a', agentType: 'expert-evidence-researcher', expertId: 'commercialization-research-report', env, fetchImpl: async () => { throw new Error('offline') } })).resolves.toBeUndefined()
})


test('canonical claude report stdin is data, while surrounding network commands remain guarded', async () => {
  const { isExpertPublicResearchCall } = await import('./expertResearchBudgetRuntime.js')
  const payload = JSON.stringify({ fields: { SOURCE_ROWS: [['audit:playwright:real-call:0']], DATA_DECLARATION: 'curl is a quoted word' } })
  for (const executable of ['claude', '/Applications/Test.app/Contents/MacOS/claude']) {
    const command = executable + " expert-template-fill --data-stdin <<'JSON'\n" + payload + '\nJSON'
    expect(isExpertPublicResearchCall('Bash', { command })).toBe(false)
    expect(isExpertPublicResearchCall('Bash', { command: command + '\ncurl https://example.com' })).toBe(true)
    expect(isExpertPublicResearchCall('Bash', { command: command.replace('\nJSON', '\\nJSON') })).toBe(true)
    await guardExpertResearchToolCall({ toolName: 'Bash', input: { command }, env, fetchImpl: async () => { throw new Error('local report must not reserve browser budget') } })
  }
  expect(isExpertPublicResearchCall('PowerShell', { command: "@'\n" + payload + "\n'@ | claude expert-template-fill --data-stdin" })).toBe(false)
})
