import { expect, spyOn, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Message } from '../../types/message.js'
import type { WorkflowSessionState, WorkflowTemplate } from '../../server/services/workflowTypes.js'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { createToolContextFixture } from '../toolFixtures.test.js'
import { GENERAL_PURPOSE_AGENT } from './built-in/generalPurposeAgent.js'
import { AgentTool } from './AgentTool.js'
import { SendMessageTool } from '../SendMessageTool/SendMessageTool.js'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import { runToolUse } from '../../services/tools/toolExecution.js'
import * as queryModule from '../../query.js'
import * as storage from '../../utils/sessionStorage.js'
import * as hooks from '../../services/tools/toolHooks.js'
import { resetCommandQueue } from '../../utils/messageQueueManager.js'
import { resetWorkflowTaskSchedulers } from './workflowTaskScheduling.js'
import { buildWorkflowReviewerEvidence } from './workflowReviewerEvidence.js'
import { setShellIfWindows } from '../../utils/windowsPaths.js'
import * as batchProgress from '../../server/services/workflowDevelopmentBatchAgentProgress.js'
import { installNonLiveSubscriptionMetadataFixture } from '../__fixtures__/subscriptionMetadata.js'

installNonLiveSubscriptionMetadataFixture()

function fixture() {
  const now = new Date().toISOString()
  const template: WorkflowTemplate = {
    schemaVersion: 1, id: 'efficient-constrained-dev-debug-workflow-v5', source: 'user', version: '31', displayName: 'Integration fixture', description: '',
    phases: [{ id: 'delegate-implement', label: 'Implement', instructions: 'Delegate bounded work', transitionAuthority: 'user-confirmation', skillDeclarations: [], requiredArtifacts: [], completionCriteria: [], subagentPolicy: { maxParallel: 1 } }],
  }
  const plan = [{ id: 'B2', dependsOn: [], writeScopes: ['src/**'], resourceClaims: [], executionMode: 'write' as const }]
  const workflow: WorkflowSessionState = {
    schemaVersion: 1, sessionId: `review-evidence-${crypto.randomUUID()}`, mode: 'workflow',
    template: { id: template.id, version: '31', source: 'user', snapshotId: 'fixture', sourceState: 'current' },
    templateIdentity: { id: template.id, source: 'user', version: '31' }, templateSnapshot: template, sourceTemplateStatus: 'current',
    activePhaseId: 'delegate-implement', activeWorkflowRunId: 'current-run', workspaceRoot: process.cwd(),
    status: 'running', workflowStatus: 'running', runStatus: 'active', stateVersion: 1, revision: 1, createdAt: now, updatedAt: now,
    phases: [{ id: 'delegate-implement', index: 0, status: 'running', artifactPointers: [] }], phaseRuns: [], transitionHistory: [], artifactIndex: [], finalReportRef: null,
    workflowRuns: [{ id: 'current-run', templateId: template.id, status: 'active', currentPhaseId: 'delegate-implement', workspaceRoot: process.cwd(), history: [], createdAt: now, updatedAt: now,
      artifacts: [{ id: 'delivery-plan', filename: 'delivery-plan.md', phaseId: 'delivery-plan', kind: 'markdown', required: true, content: 'fixture', developmentBatchPlan: plan, createdAt: now, updatedAt: now }] }],
    runtimeContract: { schemaVersion: 1, migrationStatus: 'current', audit: [], phaseStates: { 'delegate-implement': {
      phaseId: 'delegate-implement', workStatus: 'in-progress', eligibility: 'ineligible', blockerReasons: [], issues: [], artifactRequirements: [], checks: [], taskSnapshots: [], evaluatedAt: now,
    } } },
  }
  let app = { ...getDefaultAppState(), workflow }
  const context = createToolContextFixture({ getAppState: () => app, setAppState: update => { app = update(app) as typeof app } })
  context.options = { ...context.options, tools: [AgentTool, SendMessageTool], agentDefinitions: { activeAgents: [GENERAL_PURPOSE_AGENT], allAgents: [GENERAL_PURPOSE_AGENT] } }
  return { context, get: () => app.workflow, tasks: () => app.tasks }
}

test('a real Reviewer needs-fix does not release a queued dependent Coder as scheduler success', async () => {
  const keys = ['CC_JIANGXIA_DESKTOP_SERVER_URL', 'CC_JIANGXIA_WORKFLOW_SESSION_ID', 'CLAUDE_CONFIG_DIR'] as const
  const previous = keys.map(key => process.env[key])
  keys.forEach(key => { delete process.env[key] })
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewer-needs-fix-schedule-'))
  process.env.CLAUDE_CONFIG_DIR = profile
  resetCommandQueue(); resetWorkflowTaskSchedulers()
  const f = fixture()
  const plan = [
    { id: 'B1', dependsOn: [], writeScopes: ['src/base.ts'], resourceClaims: [], executionMode: 'write' as const },
    { id: 'B2', dependsOn: ['B1'], writeScopes: ['src/next.ts'], resourceClaims: [], executionMode: 'write' as const },
  ]
  f.get().workflowRuns![0]!.artifacts[0]!.developmentBatchPlan = plan
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let reviewing = false
  let dependentModelRan = false
  let dependentRunningAttempts = 0
  let observedPrerequisiteRunning = 0
  const progress = batchProgress.recordDevelopmentBatchAgentProgress
  const progressSpy = spyOn(batchProgress, 'recordDevelopmentBatchAgentProgress').mockImplementation((state, input) => {
    if (input.batchId === 'B1' && input.status === 'running') observedPrerequisiteRunning++
    if (input.batchId === 'B2' && input.role === 'coder' && input.status === 'running') dependentRunningAttempts++
    return progress(state, input)
  })
  const query = spyOn(queryModule, 'query').mockImplementation(async function* (input) {
    const contract = input.toolUseContext.workflowWorkerContract!
    if (contract.role === 'reviewer') {
      reviewing = true
      await gate
      yield createAssistantMessage({ content: JSON.stringify({ workflowReview: { reviewStatus: 'needs-fix', requiredFixes: ['Fix the current Batch boundary before progressing'], readyForNextBatch: false } }) })
    } else {
      if (contract.batchId === 'B2') dependentModelRan = true
      yield createAssistantMessage({ content: '{"readyForReview":true,"blockers":[]}' })
    }
    return { reason: 'completed' as const }
  })
  const transcript = spyOn(storage, 'getAgentTranscript').mockResolvedValue({ messages: [], contentReplacements: [] })
  const launch = async (batchId: string, role: 'coder' | 'reviewer') => {
    const result = await AgentTool.call({ description: `Scoped ${batchId} ${role}`, prompt: `Complete only ${batchId}.`, workflow_role: role,
      subagent_type: 'general-purpose', run_in_background: true,
      workflow_parallel_plan: { task_id: batchId, tasks: plan.map(task => ({ id: task.id, depends_on: task.dependsOn,
        write_scopes: task.writeScopes, resource_claims: [], execution_mode: task.executionMode })) } }, f.context,
      async () => ({ behavior: 'allow' }), createAssistantMessage({ content: 'Launch current worker' }))
    if (!('isAsync' in result.data) || !result.data.isAsync) throw new Error('Expected background worker')
    return result.data.agentId
  }
  try {
    const coder = await launch('B1', 'coder'); await waitForTerminal(f.tasks, coder)
    const reviewer = await launch('B1', 'reviewer')
    const deadline = Date.now() + 10_000
    while (!reviewing && Date.now() < deadline) await Bun.sleep(1)
    expect(reviewing).toBe(true)
    const dependent = await launch('B2', 'coder')
    expect(dependentRunningAttempts).toBe(0)
    release()
    await waitForTerminal(f.tasks, reviewer); await waitForTerminal(f.tasks, dependent)
    expect(f.get().runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(task => task.batchId === 'B1' && task.workflowRole === 'reviewer')!.status).toBe('needs_fix')
    expect(f.tasks()[reviewer]!.status).toBe('failed')
    expect(f.tasks()[reviewer]).toMatchObject({ error: expect.stringContaining('WORKFLOW_REVIEW_NEEDS_FIX') })
    expect(dependentModelRan).toBe(false)
    expect(observedPrerequisiteRunning).toBeGreaterThanOrEqual(2)
    expect(dependentRunningAttempts).toBe(0)
  } finally {
    release(); query.mockRestore(); transcript.mockRestore(); progressSpy.mockRestore()
    resetCommandQueue(); resetWorkflowTaskSchedulers()
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i] })
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  }
}, 60000)

async function waitForTerminal(tasks: ReturnType<typeof fixture>['tasks'], id: string) {
  const deadline = Date.now() + 90_000
  while ((!tasks()[id] || ['running', 'pending'].includes(tasks()[id]!.status)) && Date.now() < deadline) await Bun.sleep(5)
  expect(tasks()[id]).toBeDefined()
  expect(['completed', 'failed']).toContain(tasks()[id]!.status)
}

test.each(['initial-review', 'resumed-review', 'not-ready', 'blockers-without-key'] as const)('real Coder execution evidence reaches only the authorized Reviewer: %s', async scenario => {
  const notReady = scenario === 'not-ready' || scenario === 'blockers-without-key'
  const envKeys = ['CC_JIANGXIA_DESKTOP_SERVER_URL', 'CC_JIANGXIA_WORKFLOW_SESSION_ID', 'SHELL', 'CLAUDE_CODE_GIT_BASH_PATH'] as const
  const previous = envKeys.map(key => process.env[key])
  delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
  // Match CLI startup rather than feeding Bash syntax to a host PowerShell.
  setShellIfWindows()
  resetCommandQueue(); resetWorkflowTaskSchedulers()
  const f = fixture()
  const transcripts = new Map<string, Message[]>()
  const reviewerInputs: string[] = []
  const readIds: string[] = []
  let coderId = ''
  let actualCommandResults = 0
  const commandResults: string[] = []
  const toolHooks = [spyOn(hooks, 'runPreToolUseHooks').mockImplementation(async function* () {}),
    spyOn(hooks, 'runPostToolUseHooks').mockImplementation(async function* () {}),
    spyOn(hooks, 'runPostToolUseFailureHooks').mockImplementation(async function* () {})]
  const query = spyOn(queryModule, 'query').mockImplementation(async function* (input) {
    const contract = input.toolUseContext.workflowWorkerContract!
    const id = input.toolUseContext.agentId!
    const messages: Message[] = []
    if (contract.role === 'coder') {
      coderId = id
      const call = { type: 'tool_use' as const, caller: { type: 'direct' as const }, name: 'Bash', id: crypto.randomUUID(),
        input: { command: 'test "$((2 + 2))" -eq 4 && printf "CODER_ACTUAL_ASSERTION_B2_PASS\\n"', description: 'Run isolated arithmetic regression assertion' } }
      const assistant = createAssistantMessage({ content: [call] })
      messages.push(assistant); yield assistant
      for await (const result of runToolUse(call, assistant, async () => ({ behavior: 'allow' }), input.toolUseContext)) {
        messages.push(result.message); yield result.message
        commandResults.push(JSON.stringify(result.message))
        if (result.message.type === 'user' && JSON.stringify(result.message).includes('CODER_ACTUAL_ASSERTION_B2_PASS') && !JSON.stringify(result.message).includes('<tool_use_error>')) actualCommandResults++
      }
      const report = createAssistantMessage({ content: JSON.stringify({ ...(scenario === 'blockers-without-key' ? {} : { readyForReview: !notReady }), summary: 'B2 current-run report', blockers: notReady ? ['A separate promised check is not complete'] : [] }) })
      messages.push(report); transcripts.set(id, messages); yield report
    } else {
      reviewerInputs.push(JSON.stringify(input.messages))
      const report = createAssistantMessage({ content: scenario === 'resumed-review' && reviewerInputs.length === 1
        ? 'Review interrupted before a structured result.'
        : JSON.stringify({ workflowReview: { reviewStatus: 'pass', requiredFixes: [], readyForNextBatch: true } }) })
      messages.push(report); transcripts.set(id, messages); yield report
    }
    return { reason: 'completed' as const }
  })
  const transcript = spyOn(storage, 'getAgentTranscript').mockImplementation(async id => {
    readIds.push(id)
    return { messages: transcripts.get(id) ?? [createAssistantMessage({ content: 'FOREIGN_BATCH_OR_RUN_SENTINEL' })], contentReplacements: [] }
  })
  const metadata = spyOn(storage, 'readAgentMetadata').mockResolvedValue({ agentType: GENERAL_PURPOSE_AGENT.agentType, description: 'Original current-run reviewer' })
  const launch = async (role: 'coder' | 'reviewer') => {
    const result = await AgentTool.call({ description: `B2 ${role}`, prompt: `Complete B2 ${role} within its approved scope.`, workflow_role: role, subagent_type: 'general-purpose', run_in_background: true,
      workflow_parallel_plan: { task_id: 'B2', tasks: [{ id: 'B2', depends_on: [], write_scopes: ['src/**'], resource_claims: [], execution_mode: 'write' }] },
    }, f.context, async () => ({ behavior: 'allow' }), createAssistantMessage({ content: 'Launch assigned worker' }))
    if (!('isAsync' in result.data) || !result.data.isAsync) throw new Error('Expected asynchronous worker')
    await waitForTerminal(f.tasks, result.data.agentId)
    return result.data.agentId
  }
  try {
    await launch('coder')
    expect(commandResults.join('\n')).toContain('CODER_ACTUAL_ASSERTION_B2_PASS')
    expect(actualCommandResults).toBe(1)
    const coder = f.get().runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(task => task.workflowRole === 'coder')!
    expect(coder.status).toBe(notReady ? 'blocked' : 'succeeded')
    if (notReady) {
      try { await launch('reviewer') } catch (error) { expect(String(error)).toContain('WORKFLOW_') }
      expect(reviewerInputs).toEqual([])
      expect(f.get().runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(task => task.workflowRole === 'reviewer')!.status).not.toBe('succeeded')
      return
    }
    const reviewerId = await launch('reviewer')
    if (scenario === 'resumed-review') {
      expect(f.tasks()[reviewerId]!.status).toBe('failed')
      for await (const _ of runToolUse({ type: 'tool_use', caller: { type: 'direct' }, name: 'SendMessage', id: 'resume-evidence-reviewer', input: { to: reviewerId, summary: 'Finish original review', message: 'Resume the same accepted B2 review.' } },
        createAssistantMessage({ content: 'Resume current reviewer' }), async () => ({ behavior: 'allow' }), f.context)) {}
      await waitForTerminal(f.tasks, reviewerId)
      expect(reviewerInputs).toHaveLength(2)
    }
    for (const text of reviewerInputs) {
      expect(text).toContain('<workflow-coder-evidence>')
      expect(text).toContain('CODER_ACTUAL_ASSERTION_B2_PASS')
      expect(text).toContain('B2 current-run report')
      expect(text).not.toContain('FOREIGN_BATCH_OR_RUN_SENTINEL')
    }
    expect(readIds).toContain(coderId)
    const wrongRun = structuredClone(f.get())
    wrongRun.activeWorkflowRunId = 'foreign-run'
    await expect(buildWorkflowReviewerEvidence(wrongRun, 'B2')).rejects.toThrow('unique successful current-run Coder receipt')
    await expect(buildWorkflowReviewerEvidence(f.get(), 'FOREIGN-BATCH')).rejects.toThrow('unique successful current-run Coder receipt')
    expect(f.get().runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(task => task.workflowRole === 'reviewer')!.status).toBe('succeeded')
  } finally {
    // Abort only tasks created in this isolated fixture if a real command does
    // not settle. Never leave its background runner active after restoring mocks.
    for (const task of Object.values(f.tasks())) {
      if ('abortController' in task && task.abortController instanceof AbortController && task.status === 'running') task.abortController.abort()
    }
    query.mockRestore(); transcript.mockRestore(); metadata.mockRestore()
    toolHooks.forEach(hook => hook.mockRestore())
    resetCommandQueue(); resetWorkflowTaskSchedulers()
    envKeys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index] })
  }
}, 180_000)
