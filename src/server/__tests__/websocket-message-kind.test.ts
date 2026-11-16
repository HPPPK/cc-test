import { expect, test, spyOn } from 'bun:test'
import { __resetWebSocketHandlerStateForTests, handleWebSocket, translateCliMessage } from '../ws/handler.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sessionService } from '../services/sessionService.js'
import { conversationService } from '../services/conversationService.js'
import { recordExpertIntakeQuestion, submitExpertResearchAssessment } from '../services/expertResearchIntakeService.js'

test('ordinary, Expert and workflow streamed replies preserve provenance without exposing control prose', () => {
  for (const session of ['normal-kind', 'expert-kind', 'workflow-kind']) {
    const hidden = translateCliMessage({ type: 'assistant', messageKind: 'internal_notification', message: { role: 'assistant', content: [{ type: 'text', text: 'private runtime instruction' }] } }, session)
    expect(hidden).toEqual([])
    const actual = translateCliMessage({ type: 'assistant', messageKind: 'assistant_response', message: { role: 'assistant', content: [{ type: 'text', text: 'real response' }] } }, session)
    expect(actual.some(value => value.type === 'content_delta')).toBe(true)
    expect(actual.every(value => value.messageKind === 'assistant_response')).toBe(true)
  }
})

test('raw SDK streaming text retains assistant authorship rather than generic system provenance', () => {
  const rows = translateCliMessage({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'streamed response' } } }, 'raw-kind')
  expect(rows).toContainEqual(expect.objectContaining({ type: 'content_delta', messageKind: 'assistant_response', text: 'streamed response' }))
  expect(translateCliMessage({ type: 'stream_event', messageKind: 'internal_notification', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hidden' } } }, 'raw-hidden')).toEqual([])
})

test('a second streamed intake card cannot replace the persisted unanswered request', async () => {
  const previous = process.env.CLAUDE_CONFIG_DIR
  const root = await mkdtemp(path.join(tmpdir(), 'ws-intake-card-'))
  process.env.CLAUDE_CONFIG_DIR = root
  let sessionId: string | undefined
  const respond = spyOn(conversationService, 'respondToPermission').mockReturnValue(true)
  try {
    sessionId = (await sessionService.createSession(root)).sessionId
    await sessionService.appendSessionMetadata(sessionId, { workDir: root, expert: { mode: 'expert', status: 'active', expertId: 'commercialization-research-report', runtimeBinding: { active: true, expertId: 'commercialization-research-report' } } as never })
    await submitExpertResearchAssessment(sessionId, { dimensions: ['coreTask', 'audience', 'deliveryBoundary'].map(id => ({ id, provenance: 'unknown', materialImpact: 'Changes the research scope', userOwnedReason: 'The user must choose the boundary' })) })
    const card = { questions: [{ id: 'coreTask', prompt: 'Which task should be researched?', choices: [{ id: 'notes', label: 'Review notes' }, { id: 'delegate', label: 'Explore possible tasks' }] }] }
    await recordExpertIntakeQuestion(sessionId, 'original-card', 'original-tool', card)
    const callbacks: Array<(message: unknown) => void> = []
    ;(conversationService as any).sessions.set(sessionId, {
      proc: { kill() {}, exited: Promise.resolve(0) }, outputCallbacks: callbacks,
      workDir: root, permissionMode: 'default', sdkToken: 'fixture-token', sdkSocket: null,
      pendingOutbound: [], startupPending: false, startupExitCode: null, stdoutLines: [], stderrLines: [],
      outputDrain: Promise.resolve(), sdkMessages: [], initMessage: null, pendingPermissionRequests: new Map(),
    })
    const sent: any[] = []
    const ws = { data: { sessionId, connectedAt: Date.now(), channel: 'client', sdkToken: null, serverPort: 0, serverHost: '127.0.0.1' }, send(payload: string) { sent.push(JSON.parse(payload)); return 1 }, close() {} } as any
    handleWebSocket.open(ws)
    expect(callbacks).toHaveLength(1)
    callbacks[0]!({ type: 'control_request', request_id: 'replacement-card', request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', tool_use_id: 'replacement-tool', input: card } })
    for (let attempt = 0; attempt < 100 && !sent.some(row => row.code === 'EXPERT_INTAKE_REQUIRED'); attempt++) await new Promise(resolve => setTimeout(resolve, 10))
    expect(sent).toContainEqual(expect.objectContaining({ type: 'error', code: 'EXPERT_INTAKE_REQUIRED', message: expect.stringContaining('still awaiting') }))
    expect(respond).toHaveBeenCalledWith(sessionId, 'replacement-card', false, undefined, undefined, expect.stringContaining('still awaiting'))
    expect(sent.some(row => row.type === 'permission_request' && row.requestId === 'replacement-card')).toBe(false)
    expect((await sessionService.getSession(sessionId))?.expert?.researchIntake?.pending?.requestId).toBe('original-card')
  } finally {
    if (sessionId) conversationService.stopSession(sessionId)
    __resetWebSocketHandlerStateForTests()
    respond.mockRestore()
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previous
    await rm(root, { recursive: true, force: true })
  }
})
