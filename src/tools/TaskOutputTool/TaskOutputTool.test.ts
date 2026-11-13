import { expect, test } from 'bun:test'
import type { Message } from '../../types/message.js'
import { requireFixtureRecord } from '../../server/__tests__/fixtureAssertions.js'
import { TaskOutputTool } from './TaskOutputTool.js'
import { createToolContextFixture, customToolSchemaFixture } from '../toolFixtures.test.js'

test('returns the real Playwright audit with an async Agent TaskOutput', () => {
  const result = TaskOutputTool.mapToolResultToToolResultBlockParam({
    retrieval_status: 'success',
    task: {
      task_id: 'expert-evidence-agent',
      task_type: 'local_agent',
      status: 'completed',
      description: 'Research external demand evidence',
      output: 'Evidence ledger complete.',
      toolAudit: { playwright: 3 },
    },
  } as never, 'toolu_task_output')

  expect(result.content).toContain('<tool-audit>')
  expect(result.content).toContain('Playwright: 3')
})

test('does not invent a Playwright audit for a legacy Agent TaskOutput', () => {
  const result = TaskOutputTool.mapToolResultToToolResultBlockParam({
    retrieval_status: 'success',
    task: {
      task_id: 'legacy-agent',
      task_type: 'local_agent',
      status: 'completed',
      description: 'Legacy agent task',
      output: 'Legacy output.',
    },
  } as never, 'toolu_task_output')

  expect(result.content).not.toContain('<tool-audit>')
})

test('names the exact required field when a model confuses taskId with task_id', async () => {
  const result = await TaskOutputTool.validateInput?.({ taskId: 'agent-1' } as never, {
    getAppState: () => ({ tasks: {} }),
  } as never)
  expect(result?.result).toBe(false)
  if (!result || result.result) throw new Error('Expected invalid task field rejection')
  expect(result.message).toContain('task_id')
  expect(result.message).toContain('agentId')
})

test('rejects the recorded empty task IDs before task lookup', () => {
  for (const task_id of ['', '   ', 123, null]) {
    expect(TaskOutputTool.inputSchema.safeParse({ task_id, block: true, timeout: 30000 }).success).toBe(false)
    const message = TaskOutputTool.formatInputValidationError?.({ task_id })
    expect(message).toContain('non-empty string')
    expect(message).toContain('agentId returned by Agent')
    expect(message).not.toContain('not taskId or id')
    expect(message).not.toContain('<agentId>')
  }
})

test('exposes non-empty task_id and the Agent mapping in the provider schema', async () => {
  const { toolToAPISchema } = await import('../../utils/api.js')
  const { getEmptyToolPermissionContext } = await import('../../Tool.js')
  const schema = customToolSchemaFixture(await toolToAPISchema(TaskOutputTool, {
    getToolPermissionContext: async () => getEmptyToolPermissionContext(),
    tools: [],
    agents: [],
  }))
  expect(schema.input_schema.required).toContain('task_id')
  const properties = requireFixtureRecord(schema.input_schema.properties)
  expect(properties.task_id).toMatchObject({ type: 'string', minLength: 1 })
  expect(JSON.stringify(properties.task_id)).toContain('agentId returned by Agent')
})

test('keeps valid Agent IDs and does not mask unrelated argument errors', async () => {
  const input = { task_id: 'a2872a90bd0ee1059', block: true, timeout: 30000 }
  expect(TaskOutputTool.inputSchema.parse(input)).toEqual(input)
  expect(TaskOutputTool.formatInputValidationError?.({ ...input, timeout: -1 })).toBeUndefined()
  expect(await TaskOutputTool.validateInput?.(input, {
    getAppState: () => ({ tasks: { [input.task_id]: { id: input.task_id } } }),
  } as never)).toEqual({ result: true })
})

test('returns accurate recovery guidance through runtime execution for recorded empty arguments', async () => {
  const { runToolUse } = await import('../../services/tools/toolExecution.js')
  const { createAssistantMessage } = await import('../../utils/messages.js')
  const context = createToolContextFixture()
  context.options.tools = [TaskOutputTool]
  const messages: Message[] = []
  for await (const update of runToolUse({
    caller: { type: 'direct' }, type: 'tool_use', name: 'TaskOutput', id: 'recorded-empty-task-id',
    input: { task_id: '', block: true, timeout: 30000 },
  }, createAssistantMessage({ content: 'Retrieve existing agent output' }),
  async () => ({ behavior: 'allow', decisionReason: { type: 'other', reason: 'Fixture' } }), context)) {
    messages.push(update.message)
  }
  const output = JSON.stringify(messages)
  expect(output).toContain('non-empty string')
  expect(output).toContain('agentId returned by Agent')
  expect(output).not.toContain('No task found')
  expect(output).not.toContain('not taskId or id')
  expect(output).not.toContain('<agentId>')
})

test('validates empty and unknown task IDs without guessing a task', async () => {
  for (const input of [{ task_id: '' }, { task_id: '   ' }, { task_id: 123 }, null]) {
    const result = await TaskOutputTool.validateInput?.(input as never, {
      getAppState: () => { throw new Error('Invalid IDs must not reach task lookup') },
    } as never)
    expect(result).toMatchObject({ result: false, errorCode: 1 })
  }
  expect(await TaskOutputTool.validateInput?.({ task_id: 'missing-task' } as never, {
    getAppState: () => ({ tasks: {} }),
  } as never)).toMatchObject({ result: false, errorCode: 2 })
})
