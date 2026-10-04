import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { __resetWebSocketHandlerStateForTests, continueCommercializationResearch, handleWebSocket } from '../ws/handler.js'
import { conversationService } from '../services/conversationService.js'
import { sessionService } from '../services/sessionService.js'
import { expertRuntimeSessionStore } from '../services/expertRuntimeSessionStore.js'
import { ExpertSessionService } from '../services/expertSessionService.js'
import { ExpertRuntimeService } from '../services/expertRuntimeService.js'
import { ExpertPackRegistryService } from '../services/expertPackRegistryService.js'
import { sessionRuntimeTransitionService } from '../services/sessionRuntimeTransitionService.js'
import { getExpertProcessBindingKey } from '../services/expertRuntimeBindingService.js'
import type { ExpertSessionMetadata } from '../services/expertPackRegistryService.js'

function active(): ExpertSessionMetadata {
  return {
    mode: 'expert', expertId: 'lifecycle-expert', expertName: 'Lifecycle expert', packId: 'lifecycle-pack', packVersion: '1',
    status: 'active', materialRefs: [], startedAt: '2026-09-16T00:00:00Z', updatedAt: '2026-09-16T00:00:00Z',
    runtimeBinding: { schemaVersion: 1, active: true, expertId: 'lifecycle-expert', expertName: 'Lifecycle expert', packId: 'lifecycle-pack', packVersion: '1',
      promptSnapshot: 'Write the brief, then dispatch research.', skills: [], tools: [], hostTools: [], permissions: [], activatedAt: '2026-09-16T00:00:00Z' },
  }
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 4000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Lifecycle did not settle')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}
function harness(initial: ExpertSessionMetadata | undefined, running = false, loadedKey?: string) {
  const id = crypto.randomUUID()
  let expert = initial
  let processKey = loadedKey
  let startupGate: Promise<void> | undefined
  const sent: any[] = []
  const ws = { data: { sessionId: id, connectedAt: Date.now(), channel: 'client', sdkToken: null, serverPort: 0, serverHost: '127.0.0.1' }, send: mock((s: string) => { sent.push(JSON.parse(s)); return 1 }), close: mock(() => {}) } as any
  const start = spyOn(conversationService, 'startSession').mockImplementation(async (_id, _cwd, _url, options) => {
    await startupGate
    running = true
    processKey = options?.expertRuntimeBindingKey
  })
  const stop = spyOn(conversationService, 'stopSessionAndWait').mockImplementation(async () => { running = false; processKey = undefined })
  spyOn(conversationService, 'hasSession').mockImplementation(() => running)
  spyOn(conversationService, 'getSessionExpertRuntimeBindingKey').mockImplementation(() => processKey)
  spyOn(conversationService, 'getSessionWorkDir').mockReturnValue(process.cwd())
  spyOn(conversationService, 'onOutput').mockImplementation(() => {})
  spyOn(conversationService, 'clearOutputCallbacks').mockImplementation(() => {})
  const send = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
  spyOn(sessionService, 'getSession').mockImplementation(async () => ({ id, workDir: process.cwd(), messages: [], expert } as any))
  spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue(process.cwd())
  spyOn(sessionService, 'getSessionLaunchInfo').mockResolvedValue(null)
  spyOn(sessionService, 'getCustomTitle').mockResolvedValue('Lifecycle fixture')
  spyOn(sessionService, 'appendSessionMetadata').mockImplementation(async (_id, metadata) => { if (metadata.expert) expert = metadata.expert })
  spyOn(expertRuntimeSessionStore, 'save').mockResolvedValue()
  spyOn(expertRuntimeSessionStore, 'remove').mockResolvedValue()
  const fallback = spyOn(expertRuntimeSessionStore, 'get').mockResolvedValue(undefined)
  const definition = { id: 'lifecycle-expert', name: 'Lifecycle expert', packId: 'lifecycle-pack', packVersion: '1', tools: [] } as any
  spyOn(ExpertPackRegistryService.prototype, 'getExpert').mockResolvedValue(definition)
  spyOn(ExpertRuntimeService.prototype, 'loadContext').mockResolvedValue({ expert: definition, prompts: { system: active().runtimeBinding!.promptSnapshot }, skills: [], hostTools: [], permissions: [] } as any)
  handleWebSocket.open(ws)
  return { id, ws, sent, start, stop, send, fallback,
    post: (message: any) => handleWebSocket.message(ws, JSON.stringify(message)),
    gate: (promise: Promise<void> | undefined) => { startupGate = promise },
    getExpert: () => expert,
  }
}
afterEach(() => { __resetWebSocketHandlerStateForTests(); mock.restore() })

describe('Expert lifecycle handoff', () => {
  test('rebinds a stale ordinary process and sends the original message exactly once', async () => {
    const h = harness(active(), true)
    h.post({ type: 'user_message', content: 'Quicker' })
    await until(() => h.send.mock.calls.length === 1)
    expect(h.stop).toHaveBeenCalledTimes(1)
    expect(h.start).toHaveBeenCalledTimes(1)
    expect(h.start.mock.calls[0]![3]?.expertSystemPrompt).toContain('Write the brief, then dispatch research.')
    expect(h.start.mock.calls[0]![3]?.expertRuntimeBindingKey).toBe(getExpertProcessBindingKey(active()))
    expect(h.send).toHaveBeenCalledWith(h.id, 'Quicker', undefined)
  })
  test('does not restart an already bound process when only research progress changes', async () => {
    const expert = active()
    const key = getExpertProcessBindingKey(expert)
    expert.updatedAt = '2026-09-16T12:00:00Z'
    expert.researchEvidence = { schemaVersion: 1, records: [], updatedAt: expert.updatedAt } as any
    const h = harness(expert, true, key)
    h.post({ type: 'user_message', content: 'Continue this research' })
    await until(() => h.send.mock.calls.length === 1)
    expect(h.stop).not.toHaveBeenCalled()
    expect(h.start).not.toHaveBeenCalled()
  })
  test('keeps explicit exit authoritative even when an active fallback record remains', async () => {
    const old = active()
    const h = harness({ ...old, status: 'exited', runtimeBinding: undefined }, true, getExpertProcessBindingKey(old))
    h.fallback.mockResolvedValue(old)
    h.post({ type: 'user_message', content: '普通聊天' })
    await until(() => h.send.mock.calls.length === 1)
    expect(h.start).toHaveBeenCalledTimes(1)
    expect(h.start.mock.calls[0]![3]?.expertSystemPrompt).toBeUndefined()
    expect(h.start.mock.calls[0]![3]?.expertRuntimeBindingKey).toBeUndefined()
  })
  test('serializes prewarm, model switch, Expert activation and the first user turn', async () => {
    const h = harness(undefined)
    let release!: () => void
    h.gate(new Promise<void>(resolve => { release = resolve }))
    h.post({ type: 'prewarm_session' })
    await until(() => h.start.mock.calls.length === 1)
    h.post({ type: 'set_runtime_config', providerId: null, modelId: 'deepseek-v4-flash' })
    const entered = new ExpertSessionService().enterExpertMode(h.id, 'lifecycle-expert')
    h.post({ type: 'user_message', content: 'Quicker' })
    try {
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(h.send).not.toHaveBeenCalled()
      expect(h.stop).not.toHaveBeenCalled()
    } finally { h.gate(undefined); release() }
    await entered
    await until(() => h.send.mock.calls.length === 1)
    const finalOptions = h.start.mock.calls.at(-1)![3]
    expect(finalOptions?.model).toBe('deepseek-v4-flash')
    expect(finalOptions?.expertSystemPrompt).toContain('Write the brief, then dispatch research.')
    expect(finalOptions?.expertRuntimeBindingKey).toBe(getExpertProcessBindingKey(h.getExpert()))
    expect(h.start.mock.calls.length).toBeLessThanOrEqual(3)
    expect(h.send).toHaveBeenCalledTimes(1)
  })
  test('applies a model change received while prewarm is still resolving its launch settings', async () => {
    const h = harness(active())
    h.post({ type: 'set_runtime_config', providerId: null, modelId: 'old-fixture-model' })
    await sessionRuntimeTransitionService.pending(h.id)
    let release!: () => void
    let blocked = false
    const gate = new Promise<void>(resolve => { release = resolve })
    spyOn(sessionService, 'getSession').mockImplementation(async () => {
      blocked = true
      await gate
      return { id: h.id, workDir: process.cwd(), messages: [], expert: h.getExpert() } as any
    })
    h.post({ type: 'prewarm_session' })
    await until(() => blocked)
    expect(h.start).not.toHaveBeenCalled()
    h.post({ type: 'set_runtime_config', providerId: null, modelId: 'deepseek-v4-flash' })
    release()
    await sessionRuntimeTransitionService.pending(h.id)
    expect(h.start.mock.calls.at(-1)![3]?.model).toBe('deepseek-v4-flash')
    h.post({ type: 'user_message', content: 'Quicker' })
    await until(() => h.send.mock.calls.length === 1)
    expect(h.start.mock.calls.at(-1)![3]?.expertRuntimeBindingKey).toBe(getExpertProcessBindingKey(active()))
    expect(h.send).toHaveBeenCalledTimes(1)
  })
  test('waits for an in-flight startup before exiting Expert Mode', async () => {
    const h = harness(active())
    let release!: () => void
    h.gate(new Promise<void>(resolve => { release = resolve }))
    h.post({ type: 'prewarm_session' })
    await until(() => h.start.mock.calls.length === 1)
    const exited = new ExpertSessionService().exitExpertMode(h.id)
    try {
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(h.stop).not.toHaveBeenCalled()
    } finally { h.gate(undefined); release() }
    await exited
    h.post({ type: 'user_message', content: '普通聊天' })
    await until(() => h.send.mock.calls.length === 1)
    expect(h.start.mock.calls.at(-1)![3]?.expertSystemPrompt).toBeUndefined()
  })
  test('does not send an already scheduled research continuation after Expert exit', async () => {
    const h = harness(active(), true, getExpertProcessBindingKey(active()))
    const internal = spyOn(conversationService, 'sendInternalMessage').mockReturnValue(true)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const pending = sessionRuntimeTransitionService.run(h.id, () => gate)
    const exited = new ExpertSessionService().exitExpertMode(h.id)
    const continued = continueCommercializationResearch(h.id, { kind: 'continue-review' })
    release()
    await pending
    await exited
    expect(await continued).toBe(false)
    expect(internal).not.toHaveBeenCalled()
    expect(h.start).not.toHaveBeenCalled()
  })
  test('reports a failed replacement and never sends the user message to a stale CLI', async () => {
    const h = harness(active(), true)
    h.start.mockRejectedValue(new Error('fixture replacement failed'))
    h.post({ type: 'user_message', content: 'Quicker' })
    await until(() => h.sent.some(m => m.type === 'error' && m.code === 'CLI_START_FAILED'))
    expect(h.send).not.toHaveBeenCalled()
    expect(h.start).toHaveBeenCalledTimes(1)
  })
})
