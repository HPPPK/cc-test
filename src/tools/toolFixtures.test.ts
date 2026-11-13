import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { z } from 'zod/v4'
import { expect, test } from 'bun:test'
import type { Tool, ToolUseContext } from '../Tool.js'
import { buildTool, getEmptyToolPermissionContext } from '../Tool.js'
import { getDefaultAppState } from '../state/AppStateStore.js'
import { createFileStateCacheWithSizeLimit } from '../utils/fileStateCache.js'
import { createAssistantMessage } from '../utils/messages.js'
import type { AssistantMessage } from '../types/message.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'

export function createToolContextFixture(overrides: Partial<ToolUseContext> = {}): ToolUseContext {
  return {
    options: {
      commands: [], debug: false, mainLoopModel: 'fixture-model', tools: [], verbose: false,
      thinkingConfig: { type: 'disabled' }, mcpClients: [], mcpResources: {}, isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: [], allAgents: [] },
    },
    abortController: new AbortController(), readFileState: createFileStateCacheWithSizeLimit(10),
    getAppState: () => getDefaultAppState(), setAppState: () => {},
    setInProgressToolUseIDs: () => {}, setResponseLength: () => {},
    updateFileHistoryState: () => {}, updateAttributionState: () => {}, messages: [],
    ...overrides,
  }
}
export function toolPromptFixture(): Parameters<Tool['prompt']>[0] {
  return { getToolPermissionContext: async () => getEmptyToolPermissionContext(), tools: [], agents: [], allowedAgentTypes: [] }
}
const allowFixture: CanUseToolFn = async () => ({ behavior: 'allow', decisionReason: { type: 'other', reason: 'Focused tool fixture' } })
export function callToolFixture<Input, Output>(
  tool: { call(input: Input, context: ToolUseContext, permission: CanUseToolFn, parent: AssistantMessage): Promise<Output> },
  input: Input,
  context: ToolUseContext = createToolContextFixture(),
): Promise<Output> {
  return tool.call(input, context, allowFixture, createAssistantMessage({ content: 'Focused tool fixture' }))
}

test('tool fixture supplies real context callbacks and forwards the original input', async () => {
  const input = { value: 7 }
  const context = createToolContextFixture()
  const result = await callToolFixture({ async call(received: typeof input, actual) {
    expect(received).toBe(input)
    expect(actual).toBe(context)
    return received.value
  } }, input, context)
  expect(result).toBe(7)
  expect(context.getAppState().tasks).toEqual({})
})

export function customToolSchemaFixture(schema: BetaToolUnion) {
  if (!('input_schema' in schema)) throw new Error('Expected a custom tool schema')
  return schema
}
export function toolNameFixture(name: string): Tool {
  return buildTool({
    name, inputSchema: z.object({}), maxResultSizeChars: 1000,
    async description() { return name }, async prompt() { return name },
    async call() { return { data: '' } }, renderToolUseMessage() { return null },
    mapToolResultToToolResultBlockParam(data, id) { return { type: 'tool_result', tool_use_id: id, content: String(data) } },
  })
}
