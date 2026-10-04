import { describe, expect, test } from 'bun:test'
import { extractAgentRunArtifacts, getAgentRunLedgerRuntimeConfig, recordAgentRunEvent, resolveAgentRunId } from './agentRunLedgerRuntime.js'

describe('agent run ledger runtime', () => {
  test('resolves generic session identity before legacy Expert fallback', () => {
    expect(getAgentRunLedgerRuntimeConfig({
      CC_JIANGXIA_AGENT_RUN_LEDGER_ENABLED: '1', CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456',
      CC_JIANGXIA_SESSION_ID: 'generic-session',
      CC_JIANGXIA_EXPERT_SESSION_ID: 'legacy-expert',
    })).toEqual({ serverUrl: 'http://127.0.0.1:3456/', sessionId: 'generic-session' })
    expect(resolveAgentRunId({ chainId: 'chain-1', requestId: 'request-1' })).toBe('chain-1')
    expect(resolveAgentRunId({ chainId: '../bad' })).toBeNull()
  })

  test('extracts only explicitly named artifact outputs', () => {
    expect(extractAgentRunArtifacts({
      screenshotPath: 'C:/output/page.png',
      nested: { imagePath: 'C:/must-not-be-read.png' },
      steps: [{ screenshotPath: 'C:/output/step.png' }],
      message: 'C:/must-not-be-read.md',
    })).toEqual([
      { kind: 'screenshot', path: 'C:/output/page.png' },
      { kind: 'screenshot', path: 'C:/output/step.png' },
    ])
  })

  test('posts a minimal receipt and fails open when the server is unavailable', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = []
    const success = await recordAgentRunEvent({ runId: 'run-1', eventType: 'tool_started', toolUseId: 'tool-1', toolName: 'Read' }, {
      environment: { CC_JIANGXIA_AGENT_RUN_LEDGER_ENABLED: '1', CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456', CC_JIANGXIA_SESSION_ID: 'session-1' },
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> })
        return new Response('{}', { status: 200 })
      },
    })
    const unavailable = await recordAgentRunEvent({ runId: 'run-1', eventType: 'tool_started' }, {
      environment: { CC_JIANGXIA_AGENT_RUN_LEDGER_ENABLED: '1', CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456', CC_JIANGXIA_SESSION_ID: 'session-1' },
      fetchImpl: async () => { throw new Error('offline') },
    })

    expect(success).toBe(true)
    expect(unavailable).toBe(false)
    expect(requests).toEqual([{ url: 'http://127.0.0.1:3456/api/agent-runs/events', body: {
      runId: 'run-1', eventType: 'tool_started', toolUseId: 'tool-1', toolName: 'Read', sessionId: 'session-1',
    } }])
  })
})
