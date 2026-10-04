import { afterEach, describe, expect, test } from 'bun:test'
import { recordWorkflowAgentTaskProgressThroughDesktop } from './workflowRuntimeStateBridge.js'

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
