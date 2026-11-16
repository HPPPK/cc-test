import { afterEach, describe, expect, test } from 'bun:test'
import { recordDevelopmentBatchAgentProgressThroughDesktop, recordWorkflowAgentTaskProgressThroughDesktop, resolveWorkflowRuntimeState } from './workflowRuntimeStateBridge.js'

const previousServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
const previousSessionId = process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
const originalFetch = globalThis.fetch

afterEach(() => {
  if (previousServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = previousServerUrl
  if (previousSessionId === undefined) delete process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID
  else process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = previousSessionId
  globalThis.fetch = originalFetch
})

describe('workflowRuntimeStateBridge Agent task progress', () => {
  test.each([
    ['generic', recordWorkflowAgentTaskProgressThroughDesktop],
    ['development', recordDevelopmentBatchAgentProgressThroughDesktop],
  ] as const)('bounds a hung %s receipt write and aborts its transport', async (_name, record) => {
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456/'
    process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = 'session-1'
    let transportAborted = false
    globalThis.fetch = ((_input, init) => new Promise((_resolve, reject) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      init!.signal!.addEventListener('abort', () => {
        transportAborted = true
        reject(init!.signal!.reason)
      }, { once: true })
    })) as typeof fetch
    const keepAlive = setInterval(() => {}, 100)
    try {
      await expect(record({
        phaseId: 'delegate-implement', batchId: 'B1', role: 'coder', status: 'succeeded',
        plan: [{ id: 'B1', dependsOn: [], writeScopes: ['src/a.js'], resourceClaims: [], executionMode: 'write' }],
        agentId: 'agent-1', agentRunId: 'agent-1', toolUseId: 'tool-1', recordedAt: '2026-11-15T16:00:00Z',
      }, { timeoutMs: 10 })).rejects.toThrow('RECEIPT_UNAVAILABLE')
      expect(transportAborted).toBe(true)
    } finally {
      clearInterval(keepAlive)
    }
  })

  test('bounds a hung workflow lookup and fails closed instead of using local permissions', async () => {
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456'
    process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = 'session-1'
    globalThis.fetch = (async (_input, init) => {
      if (!init?.signal) throw new Error('Missing workflow request deadline')
      return await new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
      })
    }) as typeof fetch
    // The mocked fetch has no socket keeping Bun's event loop alive, whereas
    // AbortSignal.timeout uses an unreferenced timer.
    const keepAlive = setInterval(() => {}, 100)
    try {
      const result = await resolveWorkflowRuntimeState({ mode: 'workflow' }, { timeoutMs: 10 })
      expect(result.source).toBe('desktop-unavailable')
      if (result.source === 'desktop-unavailable') expect(result.reason).toContain('timeout')
    } finally {
      clearInterval(keepAlive)
    }
  })

  test('cancels workflow preflight when the active tool turn is stopped', async () => {
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456'
    process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = 'session-1'
    const controller = new AbortController()
    globalThis.fetch = (async (_input, init) => new Promise<Response>((_resolve, reject) => {
      if (!init?.signal) { reject(new Error('Missing cancellation')); return }
      init.signal.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
    })) as typeof fetch
    const pending = resolveWorkflowRuntimeState(undefined, { signal: controller.signal })
    controller.abort(new Error('Tool turn stopped'))
    const result = await pending
    expect(result.source).toBe('desktop-unavailable')
    if (result.source === 'desktop-unavailable') expect(result.reason).toContain('Tool turn stopped')
  })

  test('posts durable generic workflow task receipts to the Desktop authority', async () => {
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456/'
    process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = 'session-1'
    let requestUrl = ''
    let requestInit: RequestInit | undefined
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input)
      requestInit = init
      return Response.json({ ok: true })
    }) as typeof fetch

    const input = {
      phaseId: 'feature-implement',
      batchId: 'B1',
      role: 'coder' as const,
      plan: [{ id: 'B1', dependsOn: [], writeScopes: ['src/**'], resourceClaims: [], executionMode: 'write' as const }],
      status: 'running' as const,
      agentRunId: 'agent-1',
      toolUseId: 'tool-1',
      recordedAt: '2026-09-17T08:00:00.000Z',
    }

    await expect(recordWorkflowAgentTaskProgressThroughDesktop(input)).resolves.toBe(true)
    expect(requestUrl).toBe('http://127.0.0.1:3456/api/sessions/session-1/workflow/agent-task-progress')
    expect(requestInit?.method).toBe('POST')
    expect(JSON.parse(String(requestInit?.body))).toEqual(input)
  })
})
