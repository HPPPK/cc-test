import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { handleSessionsApi } from '../api/sessions.js'
import { sendToSession } from '../ws/handler.js'
import { WorkflowSessionStateService } from '../services/workflowSessionStateService.js'
import { workflowTimelineService } from '../services/workflowTimelineService.js'
import type { WorkflowSessionState } from '../services/workflowTypes.js'

let root: string
let original: string | undefined
const sessionId = 'timeline-integration-session'
let transcript: string
beforeEach(async () => {
  original = process.env.CLAUDE_CONFIG_DIR
  root = await mkdtemp(path.join(os.tmpdir(), 'workflow-timeline-api-'))
  process.env.CLAUDE_CONFIG_DIR = root
  const project = path.join(root, 'projects', 'fixture-project')
  await mkdir(project, { recursive: true })
  transcript = path.join(project, sessionId + '.jsonl')
  await writeFile(transcript, JSON.stringify({ type: 'session-meta', workDir: root, workflow: { mode: 'workflow', activePhaseId: 'build' } }) + '\n')
  const now = new Date().toISOString()
  await new WorkflowSessionStateService().writeState(sessionId, {
    schemaVersion: 1, sessionId, mode: 'workflow', template: { id: 'fixture', version: '1', source: 'user', snapshotId: 'fixture', sourceState: 'current' },
    templateIdentity: { id: 'fixture', version: '1', source: 'user' }, sourceTemplateStatus: 'current', status: 'running', workflowStatus: 'running', runStatus: 'active', activePhaseId: 'build',
    phases: [{ id: 'build', index: 0, status: 'running', artifactPointers: [] }], phaseRuns: [], transitionHistory: [], artifactIndex: [], finalReportRef: null,
    stateVersion: 1, revision: 1, createdAt: now, updatedAt: now,
    runtimeContract: { schemaVersion: 1, migrationStatus: 'current', audit: [], phaseStates: {} },
  } as WorkflowSessionState)
})
afterEach(async () => {
  if (original === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = original
  await rm(root, { recursive: true, force: true })
})
function request(query = '', method = 'GET', id = sessionId) {
  const url = new URL(`http://127.0.0.1/api/sessions/${id}/workflow/timeline${query}`)
  return handleSessionsApi(new Request(url, { method }), url, ['api', 'sessions', id, 'workflow', 'timeline'])
}

test('WebSocket delivery persists tools even without clients and REST replays them after reconnect', async () => {
  expect(sendToSession(sessionId, { type: 'tool_use_complete', toolName: 'Bash', toolUseId: 't1', input: { command: 'bun test' } })).toBe(false)
  sendToSession(sessionId, { type: 'tool_result', toolUseId: 't1', isError: true, content: 'command failed' })
  const response = await request()
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  const first = await response.json()
  expect(first.events.map((event: { kind: string }) => event.kind)).toEqual(['tool-start', 'tool-result'])
  expect(first.events[1].status).toBe('failed')
  const again = await (await request()).json()
  expect(again.events.map((event: { id: string }) => event.id)).toEqual(first.events.map((event: { id: string }) => event.id))
  expect(await readFile(workflowTimelineService.getPath(sessionId), 'utf8')).toContain('command failed')
})

test('state mutation records transitions and task states; old transcripts remain untouched', async () => {
  const before = await readFile(transcript, 'utf8')
  const service = new WorkflowSessionStateService()
  await service.updateState(sessionId, state => ({ ...state, transitionHistory: [{ transitionId: 'phase-1', fromPhaseId: null, toPhaseId: 'build', authority: 'auto', completionCheckId: null, decision: 'started', createdAt: new Date().toISOString() }] }))
  expect((await (await request()).json()).events.some((event: { kind: string }) => event.kind === 'phase')).toBe(true)
  expect(await readFile(transcript, 'utf8')).toBe(before)
})

test('validates method, cursors and session isolation', async () => {
  expect((await request('', 'POST')).status).toBe(405)
  expect((await request('?limit=10000')).status).toBe(400)
  expect((await request('', 'GET', '..')).status).toBe(400)
  expect((await request('', 'GET', 'another-session')).status).toBe(404)
})

test('journal failures never roll back authoritative state or interrupt WebSocket delivery', async () => {
  const warning = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await mkdir(workflowTimelineService.getPath(sessionId))
    const service = new WorkflowSessionStateService()
    const changed = await service.updateState(sessionId, state => ({ ...state, transitionHistory: [{ transitionId: 'recording-failure', fromPhaseId: null, toPhaseId: 'build', authority: 'auto', completionCheckId: null, decision: 'started', createdAt: new Date().toISOString() }] }))
    expect(changed.state.transitionHistory).toHaveLength(1)
    await service.writeState(sessionId, changed.state)
    expect((await service.readState(sessionId)).state?.transitionHistory).toHaveLength(1)
    sendToSession(sessionId, { type: 'error', code: 'FIXTURE', message: 'error evidence' })
    await expect(workflowTimelineService.read(sessionId, changed.state, [])).rejects.toThrow()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(warning.mock.calls.some(call => String(call[0]).includes('Failed to record session'))).toBe(true)
    expect(warning.mock.calls.filter(call => String(call[0]).includes('Failed to record workflow state'))).toHaveLength(2)
  } finally { warning.mockRestore() }
})
