import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { LocalAgentTaskState } from '../tasks/LocalAgentTask/LocalAgentTask.js'

test.each(['active', 'waiting_for_user', 'confirmation'] as const)('the actual SDK print loop drains a delayed terminal notice with the %s authority boundary', async boundary => {
  const directory = await mkdtemp(path.join(tmpdir(), 'print-idle-notice-'))
  const previous = { config: process.env.CLAUDE_CONFIG_DIR, simple: process.env.CLAUDE_CODE_SIMPLE,
    url: process.env.CC_JIANGXIA_DESKTOP_SERVER_URL, sid: process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID }
  process.env.CLAUDE_CONFIG_DIR = directory
  process.env.CLAUDE_CODE_SIMPLE = '1'
  const originalFetch = globalThis.fetch
  const { Stream } = await import('../utils/stream.js')
  const { StructuredIO } = await import('./structuredIO.js')
  const { getDefaultAppState } = await import('../state/AppState.js')
  const { getSessionId } = await import('../bootstrap/state.js')
  const { createTaskStateBase } = await import('../Task.js')
  const { enqueueAgentNotification, failAgentTask } = await import('../tasks/LocalAgentTask/LocalAgentTask.js')
  const query = await import('../QueryEngine.js')
  const { getCommandQueue, recheckCommandQueue, resetCommandQueue } = await import('../utils/messageQueueManager.js')
  const { resetTaskNotificationBoundaryRetriesForTests } = await import('../utils/taskNotificationBoundary.js')
  const { runHeadlessStreaming } = await import('./print.js')
  const input = new Stream<string>()
  const io = new StructuredIO(input)
  let app = getDefaultAppState()
  const prompts: unknown[] = []
  const worker: LocalAgentTaskState = {
    ...createTaskStateBase('terminal-worker', 'local_agent', 'Worker'), type: 'local_agent', status: 'running',
    agentId: 'terminal-worker', agentType: 'general-purpose', prompt: 'Work', retrieved: false,
    lastReportedTokenCount: 0, lastReportedToolCount: 0, isBackgrounded: true,
    pendingMessages: [], retain: true, diskLoaded: false,
  }
  const ask = spyOn(query, 'ask').mockImplementation(async function* (args) {
    prompts.push(args.prompt)
    if (prompts.length === 1) app = { ...app, tasks: { ...app.tasks, [worker.id]: worker } }
  })
  const output: unknown[] = []
  const loop = runHeadlessStreaming(io, [], [], [], [], async () => ({ behavior: 'allow', updatedInput: {} }), {},
    () => app, update => { app = update(app) }, [], {
      verbose: false, jsonSchema: undefined, permissionPromptToolName: undefined, allowedTools: undefined,
      thinkingConfig: undefined, maxTurns: undefined, maxBudgetUsd: undefined, taskBudget: undefined,
      systemPrompt: undefined, appendSystemPrompt: undefined, userSpecifiedModel: undefined, fallbackModel: undefined,
    })
  const consume = (async () => { for await (const message of loop) output.push(message) })()
  const until = async (condition: () => boolean) => {
    for (let i = 0; i < 100 && !condition(); i++) await Bun.sleep(10)
    expect(condition()).toBe(true)
  }
  try {
    input.enqueue(JSON.stringify({ type: 'user', message: { role: 'user', content: 'Start the authorized worker' }, session_id: getSessionId(), parent_tool_use_id: null }) + '\n')
    await until(() => prompts.length === 1)
    expect(getCommandQueue()).toHaveLength(0)
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://fixture.invalid'
    process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = getSessionId()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let requests = 0
    let authority = { mode: 'workflow', sessionId: getSessionId(), runStatus: boundary === 'confirmation' ? 'active' : boundary,
      activePhaseId: 'delegate-implement', pendingConfirmation: boundary === 'confirmation' ? { status: 'pending' } : null }
    globalThis.fetch = Object.assign(async () => {
      if (++requests === 1) await gate
      return Response.json({ state: authority })
    }, { preconnect: originalFetch.preconnect })
    failAgentTask(worker.id, 'actual failed receipt', update => { app = update(app) })
    enqueueAgentNotification({ taskId: worker.id, description: 'Worker', status: 'failed', error: 'actual failed receipt', setAppState: update => { app = update(app) } })
    // The actual last-task transition releases print's background wait while
    // the actual notification producer is still awaiting Desktop authority.
    await Bun.sleep(200)
    expect(prompts).toHaveLength(1)
    expect(getCommandQueue()).toHaveLength(0)
    release()
    if (boundary !== 'active') {
      await until(() => getCommandQueue().length === 1)
      await Bun.sleep(30)
      expect(prompts).toHaveLength(1)
      // The ordinary control path can later announce an answered permission
      // or accepted phase confirmation; the queued result itself cannot.
      authority = { ...authority, runStatus: 'active', pendingConfirmation: null }
      recheckCommandQueue()
    }
    await until(() => prompts.length === 2)
    await Bun.sleep(50)
    expect(prompts).toHaveLength(2)
    expect(JSON.stringify(prompts[1])).toContain('actual failed receipt')
    expect(getCommandQueue()).toHaveLength(0)
    expect(JSON.stringify(output)).toContain('task_notification')
    expect(app.tasks[worker.id]!.status).toBe('failed')
  } finally {
    input.done()
    await consume
    ask.mockRestore()
    resetCommandQueue()
    resetTaskNotificationBoundaryRetriesForTests()
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries({ CLAUDE_CONFIG_DIR: previous.config, CLAUDE_CODE_SIMPLE: previous.simple,
      CC_JIANGXIA_DESKTOP_SERVER_URL: previous.url, CC_JIANGXIA_WORKFLOW_SESSION_ID: previous.sid })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(directory, { recursive: true, force: true })
  }
}, 60000)
