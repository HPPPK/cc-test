import '../toolFixtures.test.js'
import { expect, spyOn, test } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { getEmptyToolPermissionContext, type ToolUseContext } from '../../Tool.js'
import type { WorkflowSessionState } from '../../server/services/workflowTypes.js'
import { createFileStateCacheWithSizeLimit } from '../../utils/fileStateCache.js'
import { getCommandQueue, resetCommandQueue } from '../../utils/messageQueueManager.js'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import * as storage from '../../utils/sessionStorage.js'
import * as queryModule from '../../query.js'
import { runToolUse } from '../../services/tools/toolExecution.js'
import { SendMessageTool } from '../SendMessageTool/SendMessageTool.js'
import { AgentTool } from './AgentTool.js'
import { GENERAL_PURPOSE_AGENT } from './built-in/generalPurposeAgent.js'
import { resetWorkflowTaskSchedulers } from './workflowTaskScheduling.js'
import { createTaskStateBase } from '../../Task.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { Message } from '../../types/message.js'
import { recordDevelopmentBatchAgentProgress } from '../../server/services/workflowDevelopmentBatchAgentProgress.js'
import { FORK_AGENT } from './forkSubagent.js'
import { installNonLiveSubscriptionMetadataFixture } from '../__fixtures__/subscriptionMetadata.js'

installNonLiveSubscriptionMetadataFixture()

async function fixture() {
  const now = new Date().toISOString()
  const id = 'efficient-constrained-dev-debug-workflow-v5'
  const plan = [{ id: 'B2', dependsOn: [], writeScopes: ['src/**'], resourceClaims: [], executionMode: 'write' as const }]
  const phase = { id: 'delegate-implement', label: 'Implement', instructions: 'Delegate', transitionAuthority: 'user-confirmation', skillDeclarations: [], requiredArtifacts: [], completionCriteria: [], subagentPolicy: { maxParallel: 1 } }
  const template = { schemaVersion: 1, id, source: 'user', version: '30', displayName: 'Fixture', description: '', phases: [phase] }
  const workflow = { schemaVersion: 1, sessionId: 'resume-managed-fixture', mode: 'workflow', template, templateSnapshot: template,
    templateIdentity: { id, source: 'user', version: '30' }, activePhaseId: phase.id, activeWorkflowRunId: 'run-1', workspaceRoot: process.cwd(),
    status: 'running', workflowStatus: 'running', runStatus: 'active', stateVersion: 1, revision: 1, createdAt: now, updatedAt: now,
    phases: [{ id: phase.id, index: 0, status: 'running', artifactPointers: [] }], phaseRuns: [], transitionHistory: [], artifactIndex: [], finalReportRef: null,
    workflowRuns: [{ id: 'run-1', templateId: id, status: 'active', currentPhaseId: phase.id, workspaceRoot: process.cwd(), history: [], createdAt: now, updatedAt: now,
      artifacts: [{ id: 'delivery-plan', filename: 'delivery-plan.md', phaseId: 'delivery-plan', kind: 'markdown', required: true, content: 'fixture', developmentBatchPlan: plan, createdAt: now, updatedAt: now }] }],
    runtimeContract: { schemaVersion: 1, migrationStatus: 'current', audit: [], phaseStates: { [phase.id]: {
      phaseId: phase.id, workStatus: 'in-progress', eligibility: 'ineligible', blockerReasons: [], issues: [], artifactRequirements: [], checks: [], taskSnapshots: [], evaluatedAt: now,
    } } },
  } as unknown as WorkflowSessionState
  let state: ReturnType<ToolUseContext['getAppState']> & { workflow: WorkflowSessionState } = { ...getDefaultAppState(), workflow, toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' as const },
    tasks: {}, sessionHooks: new Map(), agentNameRegistry: new Map(), mcp: { ...getDefaultAppState().mcp, tools: [], clients: [], resources: {} } }
  const context = {
    options: { commands: [], debug: false, mainLoopModel: 'fixture', tools: [AgentTool, SendMessageTool], verbose: false, thinkingConfig: { type: 'disabled' },
      mcpClients: [], mcpResources: {}, isNonInteractiveSession: true, agentDefinitions: { activeAgents: [GENERAL_PURPOSE_AGENT], allAgents: [GENERAL_PURPOSE_AGENT] } },
    abortController: new AbortController(), readFileState: createFileStateCacheWithSizeLimit(10), getAppState: () => state,
    setAppState(update: Parameters<ToolUseContext['setAppState']>[0]) { state = update(state) as typeof state },
    setInProgressToolUseIDs() {}, setResponseLength() {}, updateFileHistoryState() {}, updateAttributionState() {}, messages: [], toolUseId: 'resume-fixture-launch',
  } as unknown as ToolUseContext
  return { context, get: () => state, plan }
}

async function notification() {
  const deadline = Date.now() + 20_000
  while (!getCommandQueue().length && Date.now() < deadline) await Bun.sleep(5)
  expect(getCommandQueue().length).toBeGreaterThan(0)
}

test.each(['modern-error', 'aliases-error', 'modern-success', 'paused-final', 'stale', 'missing-owner', 'accepted', 'managed-fork'] as const)(
  'real AgentTool -> runToolUse SendMessage -> resume lifecycle preserves authority and receipts: %s', async scenario => {
    const keys = ['CC_JIANGXIA_DESKTOP_SERVER_URL', 'CC_JIANGXIA_WORKFLOW_SESSION_ID'] as const
    const old = keys.map(key => process.env[key])
    keys.forEach(key => { delete process.env[key] })
    resetCommandQueue()
    const f = await fixture()
    let calls = 0
    const contracts: unknown[] = []
    const visibleTools: string[][] = []
    const query = spyOn(queryModule, 'query').mockImplementation(async function* (input) {
      calls++
      contracts.push(input.toolUseContext.workflowWorkerContract)
      visibleTools.push(input.toolUseContext.options.tools.map(tool => tool.name))
      if (calls === 1) yield createAssistantMessage({ content: '{"readyForReview":false,"blockers":["Awaiting authorized diagnosis"]}' })
      else {
        if (scenario === 'paused-final') f.get().workflow.runStatus = 'paused'
        if (scenario.endsWith('error')) yield createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'refused-edit', is_error: true,
          content: '<tool_use_error>WORKFLOW_WORKER_CONTRACT_REQUIRED: fixture runtime refusal</tool_use_error>' }] })
        yield createAssistantMessage({ content: '{"readyForReview":true,"blockers":[],"changedFiles":["src/fixed.ts"],"testsRun":["fixture pass"]}' })
      }
      return { reason: 'completed' as const }
    })
    const transcript = spyOn(storage, 'getAgentTranscript').mockResolvedValue({ messages: [createAssistantMessage({ content: 'Prior incomplete work' })], contentReplacements: [] })
    const meta = spyOn(storage, 'readAgentMetadata').mockResolvedValue({ agentType: scenario === 'managed-fork' ? FORK_AGENT.agentType : GENERAL_PURPOSE_AGENT.agentType, description: 'Managed B2 recovery' })
    try {
      const launched = await AgentTool.call({ description: 'Managed incomplete B2', prompt: 'Implement B2. Return readyForReview explicitly.', workflow_role: 'coder',
        subagent_type: 'general-purpose', run_in_background: true,
        workflow_parallel_plan: { task_id: 'B2', tasks: [{ id: 'B2', depends_on: [], write_scopes: ['src/**'], resource_claims: [], execution_mode: 'write' }] },
      }, f.context, async () => ({ behavior: 'allow' }) as never, createAssistantMessage({ content: 'Launch bounded work' }))
      if (!('isAsync' in launched.data) || !launched.data.isAsync) throw new Error('Expected async Agent')
      await notification()
      const agentId = launched.data.agentId
      expect(f.get().tasks[agentId]?.status).toBe('completed')
      expect(f.get().workflow.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(task => task.batchId === 'B2' && task.workflowRole === 'coder')!.status).toBe('blocked')
      resetCommandQueue()
      if (scenario === 'stale') f.get().workflow.activePhaseId = 'scenario-review'
      const originalReceipts = f.get().workflow.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots
      if (scenario === 'missing-owner') {
        originalReceipts.forEach(task => { task.agentId = undefined; task.agentRunId = undefined })
      }
      if (scenario === 'accepted') {
        originalReceipts.forEach(task => { task.status = 'succeeded'; if (task.workflowRole === 'reviewer') task.reviewStatus = 'pass' })
      }
      const args = { to: agentId, summary: 'Continue original batch', message: 'Finish the accepted B2 repair.' }
      const input = scenario === 'aliases-error' ? { ...args, type: 'message', recipient: args.to, content: args.message } : args
      const output: Message[] = []
      for await (const update of runToolUse({ type: 'tool_use', caller: { type: 'direct' }, name: 'SendMessage', id: 'resume-fixture-send', input },
        createAssistantMessage({ content: 'Continue bounded work' }), async () => ({ behavior: 'allow' }), f.context)) output.push(update.message)
      if (scenario === 'stale' || scenario === 'missing-owner' || scenario === 'accepted' || scenario === 'managed-fork') {
        expect(JSON.stringify(output)).toContain(scenario === 'accepted' ? 'already succeeded' : 'WORKFLOW_RESUME_AUTHORITY_REQUIRED')
        expect(calls).toBe(1)
        expect(f.get().tasks[agentId]?.status).toBe('completed')
        return
      }
      expect(JSON.stringify(output)).toContain('resumed')
      await notification()
      expect(calls).toBe(2)
      expect(contracts[1]).toMatchObject({ role: 'coder', batchId: 'B2', sessionId: 'resume-managed-fixture', phaseId: 'delegate-implement', writeScopes: ['src/**'] })
      expect(visibleTools[1]).not.toContain('Skill')
      const receipt = f.get().workflow.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(task => task.batchId === 'B2' && task.workflowRole === 'coder')!
      const success = scenario === 'modern-success'
      expect(receipt.status).toBe(success ? 'succeeded' : 'failed')
      expect(f.get().tasks[agentId]?.status).toBe(success ? 'completed' : 'failed')
      if (scenario === 'paused-final') expect(f.get().workflow.runStatus).toBe('paused')
      expect(JSON.stringify(getCommandQueue())).toContain(success ? '<status>completed</status>' : '<status>failed</status>')
      if (!success) expect(JSON.stringify(getCommandQueue())).not.toContain('<status>completed</status>')
    } finally {
      query.mockRestore(); transcript.mockRestore(); meta.mockRestore()
      resetCommandQueue(); resetWorkflowTaskSchedulers()
      keys.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index] })
    }
  }, 60_000,
)

test.each(['feature-extension-workflow-v8', 'debug-repair-workflow-v8'])('preserves ordinary unmanaged resume outside implementation in %s', async templateId => {
  const f = await fixture()
  f.get().workflow.templateIdentity.id = templateId
  f.get().workflow.activePhaseId = 'requirements'
  const agentId = `a${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
  f.get().tasks[agentId] = {
    ...createTaskStateBase(agentId, 'local_agent', 'Save research'), type: 'local_agent', status: 'failed', agentId,
    prompt: 'Save research', agentType: 'general-purpose', retrieved: false, lastReportedTokenCount: 0, lastReportedToolCount: 0,
    isBackgrounded: true, pendingMessages: [], retain: false, diskLoaded: false,
  } as LocalAgentTaskState
  const query = spyOn(queryModule, 'query').mockImplementation(async function* (input) {
    expect(input.toolUseContext.workflowWorkerContract).toBeUndefined()
    yield createAssistantMessage({ content: 'Saved prior research.' })
    return { reason: 'completed' as const }
  })
  const transcript = spyOn(storage, 'getAgentTranscript').mockResolvedValue({ messages: [createAssistantMessage({ content: 'Prior research' })], contentReplacements: [] })
  const meta = spyOn(storage, 'readAgentMetadata').mockResolvedValue({ agentType: GENERAL_PURPOSE_AGENT.agentType })
  resetCommandQueue()
  try {
    for await (const _ of runToolUse({ type: 'tool_use', caller: { type: 'direct' }, name: 'SendMessage', id: 'research-resume',
      input: { to: agentId, summary: 'Save research', message: 'Save prior evidence only.' } },
      createAssistantMessage({ content: 'Continue research' }), async () => ({ behavior: 'allow' }), f.context)) {}
    await notification()
    expect(f.get().tasks[agentId]?.status).toBe('completed')
    expect(f.get().workflow.stateVersion).toBe(1)
    expect(query).toHaveBeenCalledTimes(1)
  } finally {
    query.mockRestore(); transcript.mockRestore(); meta.mockRestore(); resetCommandQueue()
  }
})

test('a real resumed Reviewer records object findings as needs_fix rather than completing the batch', async () => {
  const f = await fixture()
  const agentId = `a${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
  for (const [role, status, owner] of [
    ['coder', 'running', 'prior-coder'], ['coder', 'succeeded', 'prior-coder'],
    ['reviewer', 'running', agentId], ['reviewer', 'failed', agentId],
  ] as const) {
    f.get().workflow = recordDevelopmentBatchAgentProgress(f.get().workflow, {
      phaseId: 'delegate-implement', role, status, batchId: 'B2', plan: f.plan, agentId: owner, recordedAt: new Date().toISOString(),
    })
  }
  f.get().tasks[agentId] = {
    ...createTaskStateBase(agentId, 'local_agent', 'B2 Reviewer'), type: 'local_agent', status: 'failed', agentId,
    prompt: 'Review B2', agentType: 'general-purpose', retrieved: false, lastReportedTokenCount: 0, lastReportedToolCount: 0,
    isBackgrounded: true, pendingMessages: [], retain: false, diskLoaded: false, workflowTaskId: 'B2',
  } as LocalAgentTaskState
  const finding = { file: 'src/auth.ts', issue: 'Teacher route targets admin', requiredChange: 'Restrict target role' }
  const query = spyOn(queryModule, 'query').mockImplementation(async function* (input) {
    expect(input.toolUseContext.workflowWorkerContract).toMatchObject({ role: 'reviewer', batchId: 'B2', writeScopes: [] })
    const names = input.toolUseContext.options.tools.map(tool => tool.name)
    expect(names).not.toContain('Bash')
    expect(names).not.toContain('Skill')
    yield createAssistantMessage({ content: JSON.stringify({ workflowReview: { reviewStatus: 'needs-fix', requiredFixes: [finding], readyForNextBatch: false } }) })
    return { reason: 'completed' as const }
  })
  const transcript = spyOn(storage, 'getAgentTranscript').mockResolvedValue({ messages: [createAssistantMessage({ content: 'Prior invalid review' })], contentReplacements: [] })
  const meta = spyOn(storage, 'readAgentMetadata').mockResolvedValue({ agentType: GENERAL_PURPOSE_AGENT.agentType })
  resetCommandQueue()
  try {
    for await (const _ of runToolUse({ type: 'tool_use', caller: { type: 'direct' }, name: 'SendMessage', id: 'review-resume',
      input: { to: agentId, summary: 'Complete review', message: 'Return the structured review of current B2.' } },
      createAssistantMessage({ content: 'Continue review' }), async () => ({ behavior: 'allow' }), f.context)) {}
    await notification()
    const receipt = f.get().workflow.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(task => task.workflowRole === 'reviewer')!
    expect(receipt).toMatchObject({ status: 'needs_fix', reviewStatus: 'needs-fix', requiredFixes: [JSON.stringify(finding)] })
    expect(f.get().tasks[agentId]?.status).toBe('failed')
    expect(JSON.stringify(getCommandQueue())).not.toContain('<status>completed</status>')
  } finally {
    query.mockRestore(); transcript.mockRestore(); meta.mockRestore(); resetCommandQueue(); resetWorkflowTaskSchedulers()
  }
})
