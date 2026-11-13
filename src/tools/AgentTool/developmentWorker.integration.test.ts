import { getDefaultAppState } from '../../state/AppStateStore.js'
import type { Message } from '../../types/message.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runAgent } from './runAgent.js'
import { AgentTool } from './AgentTool.js'
import { GENERAL_PURPOSE_AGENT } from './built-in/generalPurposeAgent.js'
import * as queryModule from '../../query.js'
import { getEmptyToolPermissionContext, type ToolUseContext } from '../../Tool.js'
import { createFileStateCacheWithSizeLimit } from '../../utils/fileStateCache.js'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import { runToolUse } from '../../services/tools/toolExecution.js'
import { FileWriteTool } from '../FileWriteTool/FileWriteTool.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { WorkflowSessionState } from '../../server/services/workflowTypes.js'

test('real runAgent carries worker authority into tool execution and refreshes pause through Desktop', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'development-worker-runtime-'))
  const envKeys = ['CLAUDE_CONFIG_DIR', 'CC_JIANGXIA_DESKTOP_SERVER_URL', 'CC_JIANGXIA_WORKFLOW_SESSION_ID'] as const
  const previous = envKeys.map(key => process.env[key])
  process.env.CLAUDE_CONFIG_DIR = path.join(dir, 'config')
  let workflow = {
    mode: 'workflow', sessionId: 'contract-runtime', activePhaseId: 'delegate-implement',
    workflowStatus: 'running', runStatus: 'active',
    templateIdentity: { id: 'efficient-constrained-dev-debug-workflow-v5' },
  } as WorkflowSessionState
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => Response.json({ state: workflow }) })
  process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`
  process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = workflow.sessionId
  const parent = {
    options: { commands: [], debug: false, mainLoopModel: 'fixture', tools: [FileWriteTool], verbose: false,
      thinkingConfig: { type: 'disabled' }, mcpClients: [], mcpResources: {}, isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: [], errors: [], warnings: [], metadata: { directories: [], loadedFromSettings: [] } } },
    abortController: new AbortController(), readFileState: createFileStateCacheWithSizeLimit(10),
    getAppState: () => ({ toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' }, workflow, tasks: {}, sessionHooks: new Map() }),
    setAppState() {}, setInProgressToolUseIDs() {}, setResponseLength() {}, updateFileHistoryState() {}, updateAttributionState() {}, messages: [],
  } as unknown as ToolUseContext
  const allow = (async () => ({ behavior: 'allow' })) as CanUseToolFn
  let reached = 0
  const query = spyOn(queryModule, 'query').mockImplementation(async function* (params) {
    reached += 1
    expect(params.toolUseContext.workflowWorkerContract?.role).toBe('coder')
    expect(JSON.stringify(params.messages)).toContain('Default development worker execution contract')
    const execute = async (file: string) => {
      const call = { caller: { type: 'direct' as const }, type: 'tool_use' as const, id: crypto.randomUUID(), name: 'Write', input: { file_path: path.join(dir, file), content: 'verified' } }
      const messages: Message[] = []
      for await (const update of runToolUse(call, createAssistantMessage({ content: [call] }), allow, params.toolUseContext)) messages.push(update.message)
      return JSON.stringify(messages)
    }
    expect(await execute('outside.ts')).toContain('WORKFLOW_WRITE_SCOPE')
    await execute(`src/allowed-${reached}.ts`)
    expect(await readFile(path.join(dir, `src/allowed-${reached}.ts`), 'utf8')).toBe('verified')
    workflow = { ...workflow, runStatus: 'paused' }
    expect(await execute('src/paused.ts')).toContain('WORKFLOW_EXECUTION_SUSPENDED')
    await expect(readFile(path.join(dir, 'src/paused.ts'))).rejects.toThrow()
    yield createAssistantMessage({ content: 'Fixture worker completed its bounded checks.' })
    return { reason: 'completed' as const }
  })
  try {
    const options: Parameters<typeof runAgent>[0] = {
      agentDefinition: GENERAL_PURPOSE_AGENT, promptMessages: [createUserMessage({ content: 'Implement the assigned Batch.' })],
      toolUseContext: parent, canUseTool: allow, isAsync: true, querySource: 'agent:custom',
      override: { systemPrompt: asSystemPrompt([]), userContext: {}, systemContext: {} }, availableTools: [FileWriteTool],
      workflowWorkerContract: { sessionId: workflow.sessionId, phaseId: 'delegate-implement', role: 'coder', workspaceRoot: dir, writeScopes: ['src/**'] },
    }
    for await (const _ of runAgent(options)) {}
    workflow = { ...workflow, runStatus: 'active' }
    parent.workflowWorkerContract = options.workflowWorkerContract
    // A nested runtime entry (for example a forked Skill) cannot drop its
    // parent's authority just by omitting the explicit launch parameter.
    for await (const _ of runAgent({ ...options, workflowWorkerContract: undefined })) {}
    expect(reached).toBe(2)
  } finally {
    query.mockRestore()
    server.stop(true)
    envKeys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key]
      else process.env[key] = previous[index]
    })
    await rm(dir, { recursive: true, force: true })
  }
})

test('actual Agent dispatch rejects a wrong phase role and gives QA a non-editing worker pool', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'development-dispatch-'))
  const keys = ['CLAUDE_CONFIG_DIR', 'CC_JIANGXIA_DESKTOP_SERVER_URL', 'CC_JIANGXIA_WORKFLOW_SESSION_ID', 'ANTHROPIC_API_KEY'] as const
  const previous = keys.map(key => process.env[key])
  process.env.CLAUDE_CONFIG_DIR = path.join(dir, 'config')
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fixture-no-provider-requests'
  delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
  let app: ReturnType<ToolUseContext["getAppState"]> & { workflow?: { mode: string; sessionId: string; workflowStatus: string; runStatus: string; activePhaseId: string; templateIdentity: { id: string } } } = ({ ...getDefaultAppState(), 
    toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' },
    tasks: {}, sessionHooks: new Map(), agentNameRegistry: new Map(), mcp: { ...getDefaultAppState().mcp, tools: [], clients: [], resources: {} },
    workflow: { mode: 'workflow', sessionId: 'dispatch', workflowStatus: 'running', runStatus: 'active', activePhaseId: 'scenario-review',
      templateIdentity: { id: 'efficient-constrained-dev-debug-workflow-v5' } },
   })
  const parent = {
    options: { commands: [], debug: false, mainLoopModel: 'fixture', tools: [], verbose: false,
      thinkingConfig: { type: 'disabled' }, mcpClients: [], mcpResources: {}, isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: [GENERAL_PURPOSE_AGENT], errors: [], warnings: [], metadata: { directories: [], loadedFromSettings: [] } } },
    abortController: new AbortController(), readFileState: createFileStateCacheWithSizeLimit(10), getAppState: () => app,
    setAppState(update: Parameters<ToolUseContext['setAppState']>[0]) { app = update(app) },
    setInProgressToolUseIDs() {}, setResponseLength() {}, updateFileHistoryState() {}, updateAttributionState() {}, messages: [],
  } as unknown as ToolUseContext
  const allow = (async () => ({ behavior: 'allow' })) as CanUseToolFn
  let reached = false
  const query = spyOn(queryModule, 'query').mockImplementation(async function* (params) {
    reached = true
    expect(params.toolUseContext.workflowWorkerContract?.role).toBe('qa')
    const tools = params.toolUseContext.options.tools.map(tool => tool.name)
    expect(tools).not.toContain('Write')
    expect(tools).not.toContain('Edit')
    expect(tools).not.toContain('submit_phase_completion')
    yield createAssistantMessage({ content: 'QA fixture result: no production edits.' })
    return { reason: 'completed' as const }
  })
  try {
    const input = { description: 'QA assigned change', prompt: 'Validate the accepted scenario.', subagent_type: 'general-purpose' }
    await expect(AgentTool.call({ ...input, workflow_role: 'coder' }, parent, allow, createAssistantMessage({ content: 'dispatch' }))).rejects.toThrow('WORKFLOW_AGENT_ROLE')
    await AgentTool.call({ ...input, workflow_role: 'qa' }, parent, allow, createAssistantMessage({ content: 'dispatch QA' }))
    expect(reached).toBe(true)
  } finally {
    query.mockRestore()
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index] })
    await rm(dir, { recursive: true, force: true })
  }
})
