import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { getEmptyToolPermissionContext, type ToolUseContext } from '../../Tool.js'
import { createTaskStateBase } from '../../Task.js'
import { getDefaultAppState, type AppState } from '../../state/AppStateStore.js'
import { SendMessageTool } from '../../tools/SendMessageTool/SendMessageTool.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { createFileStateCacheWithSizeLimit } from '../../utils/fileStateCache.js'
import { createAssistantMessage } from '../../utils/messages.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { Message } from '../../types/message.js'
import * as swarms from '../../utils/agentSwarmsEnabled.js'
import * as toolHooks from './toolHooks.js'
import { runToolUse } from './toolExecution.js'
import { sendMessageInputForWorkflowGuard } from './sendMessageObservableInput.js'

const AGENT_ID = 'af6c71c025ebb5612'
const modern = { to: AGENT_ID, summary: 'Continue the original worker', message: 'Preserve the accepted work and continue.' }
function observable(input: Record<string, unknown> = modern) {
  const clone = structuredClone(input)
  SendMessageTool.backfillObservableInput!(clone)
  return clone
}

function fixture() {
  const task: LocalAgentTaskState = {
    ...createTaskStateBase(AGENT_ID, 'local_agent', 'Original worker'),
    type: 'local_agent', status: 'running', agentId: AGENT_ID, agentType: 'general-purpose', prompt: 'Original assignment',
    retrieved: false, lastReportedToolCount: 0, lastReportedTokenCount: 0, isBackgrounded: true,
    pendingMessages: [], retain: false, diskLoaded: false,
  }
  let app: AppState = { ...getDefaultAppState(), tasks: { [AGENT_ID]: task } }
  let workflow = { mode: 'workflow', sessionId: 'send-message-boundary', activePhaseId: 'delegate-implement', workflowStatus: 'running', runStatus: 'active',
    templateIdentity: { id: 'efficient-constrained-dev-debug-workflow-v5' } }
  const context: ToolUseContext = {
    options: { commands: [], debug: false, mainLoopModel: 'test-model', tools: [SendMessageTool], verbose: false, thinkingConfig: { type: 'disabled' }, mcpClients: [], mcpResources: {}, isNonInteractiveSession: true, agentDefinitions: { activeAgents: [], allAgents: [] } },
    abortController: new AbortController(), readFileState: createFileStateCacheWithSizeLimit(10),
    getAppState: () => ({ ...app, workflow, toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' } }),
    setAppState: update => { app = update(app) },
    setInProgressToolUseIDs() {}, setResponseLength() {}, updateFileHistoryState() {}, updateAttributionState() {}, messages: [],
  }
  return { context, messages: () => (app.tasks[AGENT_ID] as LocalAgentTaskState).pendingMessages,
    pause: () => { workflow = { ...workflow, runStatus: 'paused' } } }
}

const allow = (async () => ({ behavior: 'allow', decisionReason: { type: 'other', reason: 'isolated test' } })) as CanUseToolFn
async function execute(input: Record<string, unknown>, context: ToolUseContext, permission = allow) {
  const result: Message[] = []
  const block = { type: 'tool_use', id: crypto.randomUUID(), name: 'SendMessage', input } as ToolUseBlock
  for await (const update of runToolUse(block, createAssistantMessage({ content: 'Continue original worker' }), permission, context)) result.push(update.message)
  return JSON.stringify(result)
}

describe('real SendMessage workflow execution boundary', () => {
  let restorers: Array<() => void>
  const envKeys = ['CC_JIANGXIA_DESKTOP_SERVER_URL', 'CC_JIANGXIA_WORKFLOW_SESSION_ID'] as const
  let env: Array<string | undefined>
  beforeEach(() => {
    env = envKeys.map(key => process.env[key])
    for (const key of envKeys) delete process.env[key]
    const mocks = [spyOn(swarms, 'isAgentSwarmsEnabled').mockReturnValue(false),
      spyOn(toolHooks, 'runPreToolUseHooks').mockImplementation(async function* () {}),
      spyOn(toolHooks, 'runPostToolUseHooks').mockImplementation(async function* () {}),
      spyOn(toolHooks, 'runPostToolUseFailureHooks').mockImplementation(async function* () {})]
    restorers = mocks.map(mock => () => mock.mockRestore())
  })
  afterEach(() => {
    for (const restore of restorers) restore()
    envKeys.forEach((key, index) => { if (env[index] === undefined) delete process.env[key]; else process.env[key] = env[index] })
  })

  test.each([
    { type: 'shutdown_request', reason: 'Requested stop' },
    { type: 'shutdown_response', request_id: 'request-1', approve: false, reason: 'Still working' },
    { type: 'plan_approval_response', request_id: 'request-2', approve: true, feedback: 'Accepted' },
  ])('recognizes exact structured observable aliases without changing the public schema: %j', message => {
    const input = observable({ to: AGENT_ID, message })
    const parsed = SendMessageTool.inputSchema.parse(input)
    const before = JSON.stringify(input)
    expect(sendMessageInputForWorkflowGuard(SendMessageTool, input, parsed)).toEqual(parsed)
    expect(JSON.stringify(input)).toBe(before)
    const forged = { ...input, approve: 'approve' in message ? !message.approve : true }
    expect(sendMessageInputForWorkflowGuard(SendMessageTool, forged, parsed)).toHaveProperty('approve', forged.approve)
  })

  test('never treats arbitrary tools or undeclared nested fields as observable aliases', () => {
    const parsed = SendMessageTool.inputSchema.parse(modern)
    const input = observable()
    expect(sendMessageInputForWorkflowGuard({ ...SendMessageTool, name: 'DifferentTool' }, input, parsed)).toBe(input)
    expect(sendMessageInputForWorkflowGuard({ name: 'SendMessage' }, input, parsed)).toBe(input)
    const nested = observable({ to: AGENT_ID, message: { type: 'shutdown_request', reason: 'Stop', unknown_detail: 'must remain rejectable' } })
    expect(sendMessageInputForWorkflowGuard(SendMessageTool, nested, SendMessageTool.inputSchema.parse(nested)).message).toHaveProperty('unknown_detail')
  })

  test.each(['canonical', 'observable'] as const)('delivers %s input through actual SendMessage without mutating its source', async shape => {
    const current = fixture()
    const input = shape === 'canonical' ? { ...modern } : observable()
    const before = JSON.stringify(input)
    const result = await execute(input, current.context)
    expect(result).not.toContain('WORKFLOW_TOOL_FIELDS_INVALID')
    expect(result).toContain('Message queued for delivery')
    expect(current.messages()).toEqual([modern.message])
    expect(JSON.stringify(input)).toBe(before)
    expect(SendMessageTool.inputSchema.safeParse(observable()).data).toEqual(modern)
  })

  test.each([
    { ...observable(), invented_field: true },
    { ...observable(), recipient: 'different-recipient' },
    { ...observable(), content: 'different-content' },
    { ...observable(), type: 'broadcast' },
  ])('rejects unknown or conflicting aliases before actual delivery %#', async input => {
    const current = fixture()
    expect(await execute(input, current.context)).toContain('WORKFLOW_TOOL_FIELDS_INVALID')
    expect(current.messages()).toEqual([])
  })

  test.each(['valid', 'conflicting', 'unknown', 'invalid-schema', 'paused'] as const)('revalidates %s permission-updated inputs at the final guard', async kind => {
    const current = fixture()
    const permission = (async () => {
      if (kind === 'paused') current.pause()
      return { behavior: 'allow', updatedInput: kind === 'conflicting' ? { ...observable(), content: 'forged' }
        : kind === 'unknown' ? { ...observable(), invented_field: true }
          : kind === 'invalid-schema' ? { ...observable(), to: 42 } : observable() }
    }) as CanUseToolFn
    const result = await execute({ ...modern }, current.context, permission)
    if (kind === 'valid') {
      expect(result).toContain('Message queued for delivery')
      expect(current.messages()).toEqual([modern.message])
    } else {
      expect(result).toContain(kind === 'paused' ? 'WORKFLOW_EXECUTION_SUSPENDED' : 'WORKFLOW_TOOL_FIELDS_INVALID')
      expect(current.messages()).toEqual([])
    }
  })

  test('permission denial still prevents actual delivery', async () => {
    const current = fixture()
    await execute(observable(), current.context, (async () => ({ behavior: 'deny', message: 'Denied for test', decisionReason: { type: 'other', reason: 'isolated denial test' } })) as CanUseToolFn)
    expect(current.messages()).toEqual([])
  })

  test.each([{ to: '*', summary: 'Broadcast', message: 'No team permission' }, { to: AGENT_ID, message: { type: 'shutdown_request' } }])('retains teams-disabled validation for %j', async input => {
    const current = fixture()
    expect(await execute(observable(input), current.context)).toContain('Agent teams are disabled')
    expect(current.messages()).toEqual([])
  })
})
