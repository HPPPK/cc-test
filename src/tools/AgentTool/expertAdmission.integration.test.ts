import { expect, spyOn, test } from 'bun:test'
import { AgentTool } from './AgentTool.js'

test('rejects expert dispatch before allocating a background task or touching parent state', async () => {
  const keys = ['CC_JIANGXIA_EXPERT_SESSION_ID', 'CC_JIANGXIA_DESKTOP_SERVER_URL']
  const saved = keys.map(key => process.env[key])
  process.env[keys[0]!] = 'admission-test'
  process.env[keys[1]!] = 'http://localhost:3456'
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: 'EXPERT_TEMPLATE_OUTPUT_REVIEW_DRAFT_REQUIRED', message: '先保存初稿，再派审查。' }, { status: 409 }))
  let stateReads = 0
  try {
    await expect(AgentTool.call({ subagent_type: 'expert-evidence-output-reviewer', prompt: 'Check saved draft', description: 'Review', run_in_background: true } as never, {
      getAppState() { stateReads++; throw new Error('Worker allocation should not start') },
    } as never, undefined as never, undefined as never)).rejects.toMatchObject({ code: 'EXPERT_TEMPLATE_OUTPUT_REVIEW_DRAFT_REQUIRED' })
    expect(stateReads).toBe(0)
    expect(fetch).toHaveBeenCalledTimes(1)
  } finally {
    fetch.mockRestore()
    keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index] })
  }
})

test('parent receives complete server diagnostics for an unknown input failure before worker allocation', async () => {
  const keys = ['CC_JIANGXIA_EXPERT_SESSION_ID', 'CC_JIANGXIA_DESKTOP_SERVER_URL']
  const saved = keys.map(key => process.env[key])
  process.env[keys[0]!] = 'diagnostic-admission-test'
  process.env[keys[1]!] = 'http://localhost:3456'
  const message = '真实校验错误：' + JSON.stringify({ parserMessage: 'Unexpected token', source: '模型原始输入'.repeat(500), unclosedContainers: [{ line: 3, column: 1 }] })
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ message, code: 'NEW_UNEXPECTED_INPUT_ERROR' }, { status: 409 }))
  let stateReads = 0
  try {
    await expect(AgentTool.call({ subagent_type: 'expert-evidence-researcher', prompt: 'Research', description: 'Research', run_in_background: true } as never, {
      getAppState() { stateReads++; throw new Error('Worker allocation should not start') },
    } as never, undefined as never, undefined as never)).rejects.toMatchObject({ code: 'NEW_UNEXPECTED_INPUT_ERROR', message: message + '\n本次未创建子代理任务；修复以上问题后重试派遣，不要调用 TaskOutput 等待或编造任务编号。' })
    expect(stateReads).toBe(0)
    expect(fetch).toHaveBeenCalledTimes(1)
  } finally {
    fetch.mockRestore()
    keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index] })
  }
})
