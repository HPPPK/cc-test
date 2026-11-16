import '../toolFixtures.test.js'
import { expect, spyOn, test } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { getEmptyToolPermissionContext, type ToolUseContext } from '../../Tool.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import { createFileStateCacheWithSizeLimit } from '../../utils/fileStateCache.js'
import { getCommandQueue, resetCommandQueue } from '../../utils/messageQueueManager.js'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import { AgentTool } from './AgentTool.js'
import { GENERAL_PURPOSE_AGENT } from './built-in/generalPurposeAgent.js'
import * as scheduling from './workflowTaskScheduling.js'
import * as receipts from '../../services/tools/workflowRuntimeStateBridge.js'
import * as queryModule from '../../query.js'
import { installNonLiveSubscriptionMetadataFixture } from '../__fixtures__/subscriptionMetadata.js'

installNonLiveSubscriptionMetadataFixture()

test('a registered background agent becomes failed and notifies the parent when permit acquisition rejects', async () => {
  const keys = ['CC_JIANGXIA_DESKTOP_SERVER_URL', 'CC_JIANGXIA_WORKFLOW_SESSION_ID'] as const
  const old = keys.map(key => process.env[key])
  keys.forEach(key => { delete process.env[key] })
  resetCommandQueue()
  let state = { ...getDefaultAppState(),
    toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' as const },
    tasks: {}, sessionHooks: new Map(), agentNameRegistry: new Map(),
    mcp: { ...getDefaultAppState().mcp, tools: [], clients: [], resources: {} },
    workflow: { mode: 'workflow' as const, sessionId: 'launch-rejection', activePhaseId: 'implementation',
      template: { phases: [{ id: 'implementation', subagentPolicy: { maxParallel: 1 } }] } },
  } as ReturnType<ToolUseContext['getAppState']>
  const context = {
    options: { commands: [], debug: false, mainLoopModel: 'fixture', tools: [], verbose: false,
      thinkingConfig: { type: 'disabled' }, mcpClients: [], mcpResources: {}, isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: [GENERAL_PURPOSE_AGENT], errors: [], warnings: [], metadata: { directories: [], loadedFromSettings: [] } } },
    abortController: new AbortController(), readFileState: createFileStateCacheWithSizeLimit(10),
    getAppState: () => state,
    setAppState(update: Parameters<ToolUseContext['setAppState']>[0]) { state = update(state) },
    setInProgressToolUseIDs() {}, setResponseLength() {}, updateFileHistoryState() {}, updateAttributionState() {}, messages: [],
  } as unknown as ToolUseContext
  const permit = spyOn(scheduling, 'runWithinWorkflowTaskSchedule').mockRejectedValue(new Error('Permit rejected after registration'))
  try {
    const result = await AgentTool.call({
      description: 'Queued review fixture', prompt: 'Do not execute; exercise permit rejection.',
      subagent_type: 'general-purpose', run_in_background: true,
      workflow_parallel_plan: { task_id: 'B1', tasks: [{ id: 'B1', depends_on: [], write_scopes: [], resource_claims: [], execution_mode: 'read' }] },
    }, context, (async () => ({ behavior: 'allow' })) as CanUseToolFn, createAssistantMessage({ content: 'dispatch' }))
    if (!('isAsync' in result.data) || !result.data.isAsync) throw new Error('Expected an asynchronous task registration')
    for (let attempt = 0; attempt < 20 && getCommandQueue().length === 0; attempt++) await Bun.sleep(5)
    const queue = JSON.stringify(getCommandQueue())
    expect(permit).toHaveBeenCalledTimes(1)
    expect(queue).toContain('<status>failed</status>')
    expect(queue).toContain('Permit rejected after registration')
    expect(state.tasks[result.data.agentId]?.status).toBe('failed')
  } finally {
    permit.mockRestore()
    resetCommandQueue()
    scheduling.resetWorkflowTaskSchedulers()
    keys.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index] })
  }
})

test.each(['success', 'blocked', 'blocked-receipt-failed', 'launch-receipt-failed', 'completion-receipt-failed', 'execution-suspended'] as const)(
  'managed Agent dispatch settles and reports %s with durable receipt ordering', async scenario => {
    const keys = ['CC_JIANGXIA_DESKTOP_SERVER_URL', 'CC_JIANGXIA_WORKFLOW_SESSION_ID'] as const
    const old = keys.map(key => process.env[key])
    keys.forEach(key => { delete process.env[key] })
    resetCommandQueue()
    let state = { ...getDefaultAppState(),
      toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' as const },
      tasks: {}, sessionHooks: new Map(), agentNameRegistry: new Map(),
      mcp: { ...getDefaultAppState().mcp, tools: [], clients: [], resources: {} },
      workflow: { mode: 'workflow' as const, sessionId: 'receipt-dispatch', activePhaseId: 'feature-implement',
        templateIdentity: { id: 'feature-extension-workflow-v8', version: '1', source: 'user' },
        template: { id: 'feature-extension-workflow-v8', phases: [{ id: 'feature-implement', subagentPolicy: { maxParallel: 1 } }] } },
    } as ReturnType<ToolUseContext['getAppState']>
    const context = {
      options: { commands: [], debug: false, mainLoopModel: 'fixture', tools: [], verbose: false,
        thinkingConfig: { type: 'disabled' }, mcpClients: [], mcpResources: {}, isNonInteractiveSession: true,
        agentDefinitions: { activeAgents: [GENERAL_PURPOSE_AGENT], errors: [], warnings: [], metadata: { directories: [], loadedFromSettings: [] } } },
      abortController: new AbortController(), readFileState: createFileStateCacheWithSizeLimit(10),
      getAppState: () => state,
      setAppState(update: Parameters<ToolUseContext['setAppState']>[0]) { state = update(state) },
      setInProgressToolUseIDs() {}, setResponseLength() {}, updateFileHistoryState() {}, updateAttributionState() {}, messages: [],
    } as unknown as ToolUseContext
    const recorded: string[] = []
    const progress = spyOn(receipts, 'recordWorkflowAgentTaskProgressThroughDesktop').mockImplementation(async input => {
      recorded.push(input.status)
      if (input.status === 'succeeded') expect(getCommandQueue()).toHaveLength(0)
      if (scenario.endsWith('receipt-failed') && input.status !== 'running') throw new Error('RECEIPT_WRITE_DENIED')
      return true
    })
    const permit = spyOn(scheduling, 'runWithinWorkflowTaskSchedule').mockImplementation(async (_workflow, _plan, lifecycle, options) => {
      if (scenario.startsWith('blocked')) { await options?.onBlocked?.('Dependency B1::coder failed'); return undefined }
      if (scenario === 'launch-receipt-failed') throw new Error('Permit ownership rejected')
      return lifecycle()
    })
    const query = spyOn(queryModule, 'query').mockImplementation(async function* () {
      if (scenario === 'execution-suspended') {
        yield createAssistantMessage({ content: [{ type: 'tool_use', id: 'toolu_refused_skill', name: 'Skill', input: { skill: 'test-driven-development' } }] })
        yield createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'toolu_refused_skill',
          content: '<tool_use_error>WORKFLOW_EXECUTION_SUSPENDED: No business tool was executed.</tool_use_error>', is_error: true }] })
      }
      yield createAssistantMessage({ content: 'Completed the assigned fixture task.' })
      return { reason: 'completed' as const }
    })
    try {
      const result = await AgentTool.call({
        description: 'Managed receipt fixture', prompt: 'Return a bounded fixture result.', workflow_role: 'coder',
        subagent_type: 'general-purpose', run_in_background: true,
        workflow_parallel_plan: { task_id: 'B1', tasks: [{ id: 'B1', depends_on: [], write_scopes: [], resource_claims: [], execution_mode: 'read' }] },
      }, context, (async () => ({ behavior: 'allow' })) as CanUseToolFn, createAssistantMessage({ content: 'dispatch' }))
      if (!('isAsync' in result.data) || !result.data.isAsync) throw new Error('Expected asynchronous registration')
      const deadline = Date.now() + 20_000
      while (getCommandQueue().length === 0 && Date.now() < deadline) await Bun.sleep(10)
      const queue = JSON.stringify(getCommandQueue())
      expect(permit).toHaveBeenCalledTimes(1)
      if (scenario === 'success') {
        expect(recorded).toContain('succeeded')
        expect(state.tasks[result.data.agentId]?.status).toBe('completed')
        expect(queue).toContain('<status>completed</status>')
      } else {
        expect(recorded).toContain('failed')
        expect(state.tasks[result.data.agentId]?.status).toBe('failed')
        expect(queue).toContain('<status>failed</status>')
        expect(queue).not.toContain('<status>completed</status>')
        if (scenario.endsWith('receipt-failed')) expect(queue).toContain('RECEIPT_WRITE_DENIED')
      }
    } finally {
      query.mockRestore()
      permit.mockRestore()
      progress.mockRestore()
      resetCommandQueue()
      scheduling.resetWorkflowTaskSchedulers()
      keys.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index] })
    }
  }, 60_000,
)
