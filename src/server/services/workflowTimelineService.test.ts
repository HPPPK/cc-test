import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { WorkflowTimelineService, timelineDetail } from './workflowTimelineService.js'
import type { WorkflowSessionState } from './workflowTypes.js'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const configDir = await mkdtemp(path.join(tmpdir(), 'workflow-timeline-'))
  roots.push(configDir)
  const service = new WorkflowTimelineService({ configDir })
  const state = { sessionId: 'session-1', mode: 'workflow', activePhaseId: 'build', activeWorkflowRunId: 'run-1', status: 'running', updatedAt: '2026-11-18T00:00:00Z', transitionHistory: [], workflowRuns: [], runtimeContract: { audit: [], phaseStates: {} } } as unknown as WorkflowSessionState
  await mkdir(path.dirname(service.getPath('session-1')), { recursive: true })
  await writeFile(path.join(path.dirname(service.getPath('session-1')), 'state.json'), JSON.stringify(state))
  return { service, state, configDir }
}

test('records tools without a UI socket, preserves ordering, deduplicates starts and survives restart', async () => {
  const { service, configDir, state } = await fixture()
  await Promise.all([
    service.recordMessage('session-1', { type: 'content_start', blockType: 'tool_use', toolUseId: 'tool-1', toolName: 'Bash' }),
    service.recordMessage('session-1', { type: 'tool_use_complete', toolUseId: 'tool-1', toolName: 'Bash', input: { command: 'bun test', api_key: 'do-not-store' } }),
    service.recordMessage('session-1', { type: 'tool_result', toolUseId: 'tool-1', content: '2 tests passed', isError: false }),
  ])
  const restarted = new WorkflowTimelineService({ configDir })
  const result = await restarted.read('session-1', state, [])
  expect(result.events.filter(event => event.kind === 'tool-start')).toHaveLength(1)
  expect(result.events.find(event => event.kind === 'tool-start')?.detail).toContain('bun test')
  expect(result.events.find(event => event.kind === 'tool-result')?.detail).toContain('2 tests passed')
  expect(await readFile(service.getPath('session-1'), 'utf8')).not.toContain('do-not-store')
})

test('persists waiting, errors and task evidence; never writes internal thinking or plain chat', async () => {
  const { service, state } = await fixture()
  await service.recordMessage('session-1', { type: 'thinking', text: 'private reasoning' })
  await service.recordMessage('session-1', { type: 'content_delta', text: 'streaming prose' })
  await service.recordMessage('session-1', { type: 'permission_request', requestId: 'permission-1', toolName: 'Bash', description: 'Needs approval' })
  await service.recordMessage('session-1', { type: 'error', code: 'TIMEOUT', message: 'Provider timed out' })
  const result = await service.read('session-1', state, [])
  expect(result.events.map(event => event.kind)).toEqual(['waiting', 'error'])
  expect(JSON.stringify(result)).not.toContain('private reasoning')
  await service.recordMessage('missing-session', { type: 'error', message: 'Not a workflow' })
})

test('upgrade gate: old workflow with no timeline recovers transcript tools and transitions without changing old files', async () => {
  const { service, state } = await fixture()
  state.transitionHistory = [{ transitionId: 'transition-1', fromPhaseId: null, toPhaseId: 'build', decision: 'started', createdAt: '2026-11-18T00:00:00Z' }] as WorkflowSessionState['transitionHistory']
  const messages = [
    { id: 'm1', type: 'tool_use', timestamp: '2026-11-18T00:00:01Z', content: [{ type: 'tool_use', id: 'legacy-tool', name: 'Read', input: { file_path: 'README.md' } }] },
    { id: 'm2', type: 'tool_result', timestamp: '2026-11-18T00:00:02Z', content: [{ type: 'tool_result', tool_use_id: 'legacy-tool', content: 'file contents', is_error: false }] },
  ]
  const result = await service.read('session-1', state, messages)
  expect(result.events.map(event => event.kind)).toEqual(['phase', 'tool-start', 'tool-result'])
  expect(result.historySource).toBe('reconstructed')
  expect(await Bun.file(service.getPath('session-1')).exists()).toBe(false)
})

test('pagination, malformed tail, future schemas and path traversal are handled explicitly', async () => {
  const { service, state } = await fixture()
  for (let index = 0; index < 5; index++) await service.recordMessage('session-1', { type: 'tool_result', toolUseId: `t${index}`, content: `result ${index}` })
  const latest = await service.read('session-1', state, [], { limit: 2 })
  expect(latest.events).toHaveLength(2)
  expect(latest.hasMore).toBe(true)
  const older = await service.read('session-1', state, [], { limit: 2, before: latest.events[0]!.id })
  expect(older.events.map(event => event.id).some(id => latest.events.some(event => event.id === id))).toBe(false)
  await writeFile(service.getPath('session-1'), '\n{broken\n' + JSON.stringify({ schemaVersion: 99, id: 'future' }) + '\n', { flag: 'a' })
  await writeFile(service.getPath('session-1'), JSON.stringify({ ...latest.events[0], id: 'invalid-status', status: { broken: true } }) + '\n', { flag: 'a' })
  expect((await service.read('session-1', state, [])).warnings.length).toBeGreaterThan(0)
  expect((await service.read('session-1', state, [])).events.some(event => event.id === 'invalid-status')).toBe(false)
  expect(() => service.getPath('../escape')).toThrow()
})

test('state journal retains intermediate tasks, deduplicates state receipts and merges namespaced subagent tools', async () => {
  const { service, state, configDir } = await fixture()
  state.runtimeContract!.phaseStates = { build: { phaseId: 'build', taskSnapshots: [{ taskId: 'coder-1', status: 'running', updatedAt: '2026-11-18T00:00:01Z', agentRunId: 'agent-1' }] } } as unknown as NonNullable<WorkflowSessionState['runtimeContract']>['phaseStates']
  state.runtimeContract!.audit = [{ at: '2026-11-18T00:00:00Z', type: 'started', summary: 'Build started', phaseId: 'build' }]
  state.workflowRuns = [{ id: 'run-1', history: [{ at: '2026-11-18T00:00:00Z', type: 'started', summary: 'Run started' }] }] as WorkflowSessionState['workflowRuns']
  state.blockedReason = 'Dependency unavailable'
  await service.recordState(state)
  await service.recordState(state)
  state.runtimeContract!.phaseStates.build!.taskSnapshots[0]!.status = 'failed'
  state.runtimeContract!.phaseStates.build!.taskSnapshots[0]!.updatedAt = '2026-11-18T00:00:02Z'
  await service.recordState(state)
  await service.recordMessage('session-1', { type: 'tool_use_complete', toolUseId: 'sub-tool', toolName: 'Read', parentToolUseId: 'parent', input: { file_path: 'README.md' } })
  const result = await new WorkflowTimelineService({ configDir }).read('session-1', state, [{ type: 'tool_use', parentToolUseId: 'parent', timestamp: '2026-11-18T00:00:03Z', content: [{ type: 'tool_use', id: 'parent/agent-1/sub-tool', name: 'Read', input: { file_path: 'README.md' } }] }])
  expect(result.events.filter(event => event.kind === 'task').map(event => event.status)).toEqual(['running', 'failed'])
  expect(result.events.filter(event => event.kind === 'tool-start')).toHaveLength(1)
  expect(result.events.filter(event => event.kind === 'waiting')).toHaveLength(1)
  expect(result.historySource).toBe('recorded')
})

test('captures permissions, task progress and runtime states with bounded redacted details', async () => {
  const { service, state } = await fixture()
  for (const message of [
    { type: 'permission_response_ack', requestId: 'p', status: 'accepted' },
    { type: 'computer_use_permission_request', requestId: 'c', request: { reason: 'Need browser' } },
    { type: 'task_update', taskId: 'coder', status: 'blocked', progress: 'Missing dependency' },
    { type: 'system_notification', subtype: 'task_started', data: { task_id: 'coder', summary: 'Coder started' } },
    { type: 'status', state: 'thinking' },
    { type: 'status', state: 'idle' },
    { type: 'content_start', blockType: 'text' },
    { type: 'system_notification', subtype: 'unrelated' },
  ]) await service.recordMessage('session-1', message)
  expect((await service.read('session-1', state, [])).events).toHaveLength(6)
  expect(timelineDetail('API_KEY="hidden" token=private Bearer abcdef')).toBe('API_KEY=[REDACTED] token=[REDACTED] Bearer [REDACTED]')
  expect(timelineDetail({ command: 'API_KEY="hidden" bun test', nested: { command: "password='hidden'" } })).not.toContain('hidden')
  expect(timelineDetail('{"access_token":"opaque-credential","password":"hidden"}')).not.toContain('opaque-credential')
  expect(JSON.parse(timelineDetail({ token: 'hidden' })!).token).toBe('[REDACTED]')
  expect(timelineDetail({ image_url: 'data:base64,image', nested: { password: 'hidden' } })).not.toContain('hidden')
  expect(timelineDetail('a'.repeat(9000))?.length).toBe(8000)
  expect(timelineDetail(undefined)).toBeUndefined()
})

test('a failed append is visible as a warning and does not poison later writes', async () => {
  const { service, state } = await fixture()
  await mkdir(service.getPath('session-1'))
  await expect(service.recordMessage('session-1', { type: 'error', message: 'failure' })).rejects.toThrow()
  await rm(service.getPath('session-1'), { recursive: true })
  expect((await service.read('session-1', state, [])).warnings).toContain('日志写入失败，部分实时事件可能缺失。')
  await service.recordMessage('session-1', { type: 'tool_result', toolUseId: 'recovery', content: 'recovered' })
  expect((await service.read('session-1', state, [])).warnings).toContain('日志写入失败，部分实时事件可能缺失。')
})

test('exited workflows retain late tool results but do not journal subsequent ordinary chat', async () => {
  const { service, state } = await fixture()
  await service.recordMessage('session-1', { type: 'tool_use_complete', toolUseId: 'workflow-tool', toolName: 'Bash', input: {} })
  state.workflowStatus = 'cancelled'
  state.status = 'cancelled'
  await writeFile(path.join(path.dirname(service.getPath('session-1')), 'state.json'), JSON.stringify(state))
  await service.recordMessage('session-1', { type: 'tool_result', toolUseId: 'workflow-tool', content: 'stopped by user' })
  await service.recordMessage('session-1', { type: 'tool_use_complete', toolUseId: 'ordinary-tool', toolName: 'Read', input: {} })
  await service.recordMessage('session-1', { type: 'tool_result', toolUseId: 'ordinary-tool', content: 'ordinary chat result' })
  await service.recordMessage('session-1', { type: 'status', state: 'thinking' })
  const result = await service.read('session-1', state, [{ type: 'tool_use', timestamp: '2026-11-18T01:00:00Z', content: [{ type: 'tool_use', id: 'ordinary-tool', name: 'Read', input: {} }] }])
  expect(result.events).toHaveLength(2)
  expect(JSON.stringify(result)).not.toContain('ordinary chat result')
})

test('different subagents may reuse a tool id without merging their execution records', async () => {
  const { service, state } = await fixture()
  for (const parentToolUseId of ['parent-a', 'parent-b']) {
    await service.recordMessage('session-1', { type: 'tool_use_complete', toolUseId: 'call-0', parentToolUseId, toolName: 'Read', input: { file_path: `${parentToolUseId}.ts` } })
    await service.recordMessage('session-1', { type: 'tool_result', toolUseId: 'call-0', parentToolUseId, content: parentToolUseId })
  }
  const result = await service.read('session-1', state, [])
  expect(result.events.filter(event => event.kind === 'tool-start')).toHaveLength(2)
  expect(result.events.filter(event => event.kind === 'tool-result')).toHaveLength(2)
})

test('a result keeps its launch phase and tool name when the workflow advances and the start is on an older page', async () => {
  const { service, state } = await fixture()
  await service.recordMessage('session-1', { type: 'tool_use_complete', toolUseId: 'long-tool', toolName: 'Bash', input: { command: 'bun test' } })
  state.activePhaseId = 'review'
  await writeFile(path.join(path.dirname(service.getPath('session-1')), 'state.json'), JSON.stringify(state))
  await service.recordMessage('session-1', { type: 'tool_result', toolUseId: 'long-tool', content: 'passed' })
  const result = await service.read('session-1', state, [], { limit: 1 })
  expect(result.events[0]?.toolName).toBe('Bash')
  expect(result.events[0]?.phaseId).toBe('build')
})
