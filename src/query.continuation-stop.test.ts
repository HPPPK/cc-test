import { expect, test } from 'bun:test'
import type { BetaContentBlock, ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { z } from 'zod'
import { getEmptyToolPermissionContext, type Tool, type ToolUseContext } from './Tool.js'
import type { CanUseToolFn } from './hooks/useCanUseTool.js'
import { query } from './query.js'
import type { QueryDeps } from './query/deps.js'
import { StreamingToolExecutor } from './services/tools/StreamingToolExecutor.js'
import { createFileStateCacheWithSizeLimit } from './utils/fileStateCache.js'
import { createAssistantMessage, createUserMessage } from './utils/messages.js'
import { asSystemPrompt } from './utils/systemPromptType.js'

const repeatedFailureTool: Tool = {
  name: 'RepeatedFailure',
  inputSchema: z.object({}),
  async call() {
    throw new Error('deterministic query regression failure')
  },
  async description() {
    return 'Throws one deterministic test failure.'
  },
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  isReadOnly: () => true,
}

const allowTool = (async () => ({
  behavior: 'allow',
  decisionReason: { type: 'other', reason: 'test' },
})) as CanUseToolFn

function createContext(): ToolUseContext {
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'test-model',
      tools: [repeatedFailureTool],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        errors: [],
        warnings: [],
        metadata: { directories: [], loadedFromSettings: [] },
      },
    },
    abortController: new AbortController(),
    readFileState: createFileStateCacheWithSizeLimit(10),
    getAppState: () => ({
      toolPermissionContext: {
        ...getEmptyToolPermissionContext(),
        mode: 'acceptEdits',
      },
      tasks: {},
      effortValue: undefined,
      sessionHooks: new Map(),
      mcp: { clients: [], tools: [] },
    }) as ReturnType<ToolUseContext['getAppState']>,
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  }
}

function repeatedToolUse(id: string): ToolUseBlock {
  return {
    type: 'tool_use',
    id,
    name: repeatedFailureTool.name,
    input: {},
  }
}

async function drainStreamingExecutor(executor: StreamingToolExecutor) {
  const updates = []
  for await (const update of executor.getRemainingResults()) updates.push(update)
  return updates
}

test('continues the query after repeated deterministic tool errors until the model produces a valid follow-up', async () => {
  let modelCalls = 0
  const callModel = (async function* () {
    modelCalls += 1
    if (modelCalls <= 2) {
      yield createAssistantMessage({ content: [repeatedToolUse('toolu_repeated_failure_' + modelCalls)] as BetaContentBlock[] })
      return
    }
    yield createAssistantMessage({ content: 'I received the error feedback and changed my approach.' })
  }) as QueryDeps['callModel']
  const deps: QueryDeps = {
    callModel,
    microcompact: (async messages => ({ messages })) as QueryDeps['microcompact'],
    autocompact: (async () => ({ compactionResult: null, consecutiveFailures: undefined })) as QueryDeps['autocompact'],
    uuid: () => 'query-continuation-error-feedback-test',
  }

  const generator = query({
    messages: [createUserMessage({ content: 'Run the tool.' })],
    systemPrompt: asSystemPrompt('Regression test.'),
    userContext: {},
    systemContext: {},
    canUseTool: allowTool,
    toolUseContext: createContext(),
    querySource: 'repl_main_thread',
    deps,
  })

  const emitted = []
  let terminal: unknown
  while (true) {
    const next = await generator.next()
    if (next.done) {
      terminal = next.value
      break
    }
    emitted.push(next.value)
  }

  expect(modelCalls).toBe(3)
  expect(terminal).not.toEqual({ reason: 'hook_stopped' })
  expect(JSON.stringify(emitted)).toContain('deterministic query regression failure')
  expect(JSON.stringify(emitted)).not.toContain('hook_stopped_continuation')
})

test('keeps repeated streamed tool errors as feedback without emitting a continuation-stop attachment', async () => {
  const context = createContext()
  const executor = new StreamingToolExecutor([repeatedFailureTool], allowTool, context)
  const assistant = createAssistantMessage({ content: 'Run the tool.' })

  executor.addTool(repeatedToolUse('toolu_streamed_failure_first'), assistant)
  const first = await drainStreamingExecutor(executor)
  expect(JSON.stringify(first)).toContain('deterministic query regression failure')
  expect(JSON.stringify(first)).not.toContain('hook_stopped_continuation')

  executor.addTool(repeatedToolUse('toolu_streamed_failure_second'), assistant)
  const second = await drainStreamingExecutor(executor)
  expect(JSON.stringify(second)).toContain('deterministic query regression failure')
  expect(JSON.stringify(second)).not.toContain('hook_stopped_continuation')
})
