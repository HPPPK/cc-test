import { expect, mock, spyOn, test } from 'bun:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { runAgent } from './runAgent.js'
import { GENERAL_PURPOSE_AGENT } from './built-in/generalPurposeAgent.js'
import { createToolContextFixture } from '../toolFixtures.test.js'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import { createScopeAmendmentFixture } from '../../server/services/__fixtures__/workflowScopeAmendment.js'
import { createDevelopmentWorkerContract } from '../../server/services/developmentToolExecutionPolicy.js'
import { createAgentId } from '../../utils/uuid.js'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { StructuredIO } from '../../cli/structuredIO.js'
import { Stream } from '../../utils/stream.js'
import { runToolUse } from '../../services/tools/toolExecution.js'
import { FileWriteTool } from '../FileWriteTool/FileWriteTool.js'
import { BashTool } from '../BashTool/BashTool.js'
import { setShellIfWindows } from '../../utils/windowsPaths.js'
import * as queryModule from '../../query.js'
import * as storage from '../../utils/sessionStorage.js'
import * as hooks from '../../services/tools/toolHooks.js'

test.each(['allow', 'deny', 'phase-change', 'local', 'outscope', 'suspended', 'stale-run', 'plan', 'coder-mkdir', 'qa-test', 'debug-test', 'reviewer'] as const)('bound workflow permissions preserve effective mode and real SDK authorization (%s)', async scenario => {
  const keys = ['CLAUDE_CONFIG_DIR', 'CC_JIANGXIA_DESKTOP_SERVER_URL', 'CC_JIANGXIA_WORKFLOW_SESSION_ID', 'SHELL', 'CLAUDE_CODE_GIT_BASH_PATH'] as const
  const old = keys.map(key => process.env[key])
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-permission-relay-'))
  process.env.CLAUDE_CONFIG_DIR = path.join(root, 'profile')
  setShellIfWindows()
  const work = path.join(root, 'work')
  const { state } = await createScopeAmendmentFixture(work, 'workflow-permission-fixture')
  const agentId = createAgentId()
  state.runStatus = 'active'
  const role = scenario === 'reviewer' ? 'reviewer' : scenario === 'qa-test' ? 'qa' : scenario === 'debug-test' ? 'debug' : 'coder'
  const slot = state.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(task => task.batchId === 'B1' && task.workflowRole === (role === 'reviewer' ? 'reviewer' : 'coder'))!
  slot.status = 'running'; slot.agentRunId = agentId; slot.writeScopes = ['README.md', 'tests/__init__.py']
  if (role !== 'coder') slot.writeScopes = []
  if (role === 'qa' || role === 'debug') {
    state.activePhaseId = role === 'qa' ? 'scenario-review' : 'local-preview'
    state.phases[0]!.id = state.activePhaseId
  }
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => Response.json({ state }) })
  process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`
  process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = state.sessionId
  if (scenario === 'local') { delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL; delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID }
  if (scenario === 'suspended') state.runStatus = 'paused'
  const contract = createDevelopmentWorkerContract(state, role, work, role === 'coder' || role === 'reviewer' ? 'B1' : undefined, slot.writeScopes)!
  if (scenario === 'stale-run') contract.runId = 'older-run'
  const mode = scenario === 'plan' ? 'plan' as const : 'default' as const
  const app = { ...getDefaultAppState(), workflow: state, toolPermissionContext: { ...getEmptyToolPermissionContext(), mode, alwaysAskRules: { session: ['Bash'] } } }
  const context = createToolContextFixture({ getAppState: () => app })
  context.options = { ...context.options, tools: [FileWriteTool, BashTool] }
  const input = new Stream<string>()
  const io = new StructuredIO(input)
  const requests: string[] = []
  const inputPump = (async () => { for await (const _ of io.structuredInput) {} })()
  const outputPump = (async () => {
    for await (const envelope of io.outbound) {
      if (envelope.type !== 'control_request' || envelope.request.subtype !== 'can_use_tool') continue
      requests.push(envelope.request.tool_name)
      if (scenario === 'phase-change') state.activePhaseId = 'scenario-review'
      input.enqueue(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: envelope.request_id,
        response: scenario === 'deny' ? { behavior: 'deny', message: 'User declined this worker operation' }
          : { behavior: 'allow', updatedInput: envelope.request.input } } }) + '\n')
    }
  })()
  spyOn(storage, 'recordSidechainTranscript').mockResolvedValue()
  spyOn(storage, 'writeAgentMetadata').mockResolvedValue()
  spyOn(hooks, 'runPreToolUseHooks').mockImplementation(async function* () {})
  spyOn(hooks, 'runPostToolUseHooks').mockImplementation(async function* () {})
  spyOn(hooks, 'runPostToolUseFailureHooks').mockImplementation(async function* () {})
  const canUseTool = io.createCanUseTool()
  const actualResults: string[] = []
  const shell = scenario === 'coder-mkdir' || scenario === 'qa-test' || scenario === 'debug-test'
  spyOn(queryModule, 'query').mockImplementation(async function* (params) {
    expect(params.toolUseContext.getAppState().toolPermissionContext.mode).toBe(mode)
    const directory = path.join(work, 'tests').replaceAll('\\', '/')
    const call = { type: 'tool_use' as const, caller: { type: 'direct' as const }, id: 'scoped-write', name: shell ? 'Bash' : 'Write', input: shell
      ? { command: scenario === 'coder-mkdir' ? `mkdir -p '${directory}' && test -d '${directory}' && printf 'WORKFLOW_ACTUAL_MKDIR_PASS\\n'`
        : 'test "$((2 + 2))" -eq 4 && printf "WORKFLOW_ACTUAL_READONLY_TEST_PASS\\n"', description: 'Run isolated allowed worker check' }
      : { file_path: path.join(work, scenario === 'outscope' ? 'outside.txt' : 'README.md'), content: '# Actual scoped worker write\n' } }
    const assistant = createAssistantMessage({ content: [call] })
    yield assistant
    for await (const result of runToolUse(call, assistant, params.canUseTool, params.toolUseContext)) { actualResults.push(JSON.stringify(result.message)); yield result.message }
    if (role === 'qa' || role === 'debug' || role === 'reviewer') {
      const forbidden = { type: 'tool_use' as const, caller: { type: 'direct' as const }, id: 'readonly-write', name: 'Write', input: { file_path: path.join(work, 'README.md'), content: 'Forbidden read-only write' } }
      const message = createAssistantMessage({ content: [forbidden] })
      yield message
      for await (const result of runToolUse(forbidden, message, params.canUseTool, params.toolUseContext)) yield result.message
    }
    yield createAssistantMessage({ content: 'readyForReview: false' })
    return { reason: 'completed' as const }
  })
  try {
    for await (const _ of runAgent({ agentDefinition: GENERAL_PURPOSE_AGENT, promptMessages: [createUserMessage({ content: 'Implement only the assigned batch' })],
      toolUseContext: context, workflowWorkerContract: contract, canUseTool, isAsync: true,
      querySource: 'agent:custom', availableTools: [FileWriteTool, BashTool], override: { agentId, systemPrompt: asSystemPrompt([]), userContext: {}, systemContext: {} } })) {}
    expect(requests).toEqual(shell ? ['Bash'] : ['allow', 'deny', 'phase-change'].includes(scenario) ? ['Write'] : [])
    expect(await fs.access(path.join(work, 'README.md')).then(() => true, () => false)).toBe(scenario === 'allow')
    if (scenario === 'allow') expect(await fs.readFile(path.join(work, 'README.md'), 'utf8')).toContain('Actual scoped worker write')
    expect(await fs.access(path.join(work, 'outside.txt')).then(() => true, () => false)).toBe(false)
    if (shell) expect(actualResults.join('\n')).toContain(scenario === 'coder-mkdir' ? 'WORKFLOW_ACTUAL_MKDIR_PASS' : 'WORKFLOW_ACTUAL_READONLY_TEST_PASS')
  } finally {
    input.done(); io.outbound.done()
    await Promise.all([inputPump, outputPump])
    server.stop(true); mock.restore()
    keys.forEach((key, i) => { if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i] })
    await fs.rm(root, { recursive: true, force: true })
  }
}, 60000)
