import { describe, expect, test } from 'bun:test'
import { createAgentRunsApiHandler } from './agent-runs.js'

const run = {
  schemaVersion: 1 as const,
  sessionId: 'session-1', runId: 'run-1', status: 'running' as const,
  startedAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z', events: [], artifacts: [],
}

function request(path: string, body?: unknown, method = 'POST') {
  return new Request('http://localhost' + path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

describe('agent runs API', () => {
  test('accepts a strictly scoped receipt and supports session/run reads', async () => {
    const received: unknown[] = []
    const handle = createAgentRunsApiHandler({
      async appendEvent(input) { received.push(input); return run },
      async listRuns(sessionId, limit) { return [{ ...run, sessionId, eventCount: 2, artifactCount: 0, updatedAt: String(limit) }] },
      async getRun() { return run },
    })
    const appended = await handle(request('/api/agent-runs/events', {
      sessionId: 'session-1', runId: 'run-1', eventType: 'tool_completed', toolUseId: 'tool-1', toolName: 'Playwright', durationMs: 250,
    }), new URL('http://localhost/api/agent-runs/events'), ['api', 'agent-runs', 'events'])
    const listed = await handle(request('/api/agent-runs?sessionId=session-1&limit=5', undefined, 'GET'), new URL('http://localhost/api/agent-runs?sessionId=session-1&limit=5'), ['api', 'agent-runs'])
    const fetched = await handle(request('/api/agent-runs/session-1/run-1', undefined, 'GET'), new URL('http://localhost/api/agent-runs/session-1/run-1'), ['api', 'agent-runs', 'session-1', 'run-1'])

    expect(appended.status).toBe(200)
    expect(received).toEqual([expect.objectContaining({ toolName: 'Playwright', durationMs: 250 })])
    expect(await listed.json()).toEqual({ runs: [expect.objectContaining({ sessionId: 'session-1', updatedAt: '5' })] })
    expect(await fetched.json()).toEqual({ run })
  })

  test('rejects prompt-shaped unknown data without calling the service', async () => {
    let calls = 0
    const handle = createAgentRunsApiHandler({
      async appendEvent() { calls += 1; return run },
      async listRuns() { calls += 1; return [] },
      async getRun() { calls += 1; return null },
    })
    const response = await handle(request('/api/agent-runs/events', {
      sessionId: 'session-1', runId: 'run-1', eventType: 'tool_started', prompt: 'do not persist me',
    }), new URL('http://localhost/api/agent-runs/events'), ['api', 'agent-runs', 'events'])

    expect(response.status).toBe(400)
    expect(calls).toBe(0)
  })
})
