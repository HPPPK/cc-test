import { expect, test } from 'bun:test'
import { buildInitialTemplateRenderAutoContinueInstruction, buildFinalizeDeliveryAutoContinueInstruction } from '../ws/handler.js'

// Test the emitted model instruction contract, including the legacy expert branch.
test('canonical draft and final continuation use only acknowledged CLI HTML delivery', () => {
  const initial = { kind: 'continue-initial-render' as const, briefPath: '01.md', absorptionPath: '07.md' }
  const final = { kind: 'continue-finalize-delivery' as const, briefPath: '01.md', absorptionPath: '07.md', completionReviewPath: '08.md', reportPath: 'report.html' }
  const draft = buildInitialTemplateRenderAutoContinueInstruction(initial, true)
  const finish = buildFinalizeDeliveryAutoContinueInstruction(final, true)
  for (const instruction of [draft, finish]) {
    expect(instruction).toContain('cc-jiangxia expert-template-fill --data-stdin --output')
    expect(instruction).toContain('CLAUDE_CLI_PATH')
    expect(instruction).not.toContain('structured Write')
    expect(instruction).not.toContain('patch" Write')
    expect(instruction).toContain('acknowledgement')
  }
  expect(draft).toContain('without mode')
  expect(finish).toContain('mode="finalize" with fields: {}')
  expect(finish).toContain('successful patch is terminal')
  expect(buildInitialTemplateRenderAutoContinueInstruction(initial)).toContain('structured Write')
  expect(buildFinalizeDeliveryAutoContinueInstruction(final)).toContain('structured fixed-template Write')
})

test('canonical stale source and route recovery cannot demand another catalog wave', async () => {
  const { buildUndispatchedSourceBatchRecoveryInstruction, buildIncompleteRequiredRouteRecoveryInstruction } = await import('../ws/handler.js')
  for (const instruction of [
    buildUndispatchedSourceBatchRecoveryInstruction({ kind: 'recover-undispatched-source-batch', recoveries: [] }, true),
    buildIncompleteRequiredRouteRecoveryInstruction({ kind: 'recover-incomplete-required-routes', recoveries: [] }, true),
  ]) {
    expect(instruction).toContain('candidate library')
    expect(instruction).toContain('at most one targeted follow-up per lane')
    expect(instruction).toContain('save, Read-back and submit actual audits')
    expect(instruction).not.toContain('Every URL needs one real Playwright outcome')
    expect(instruction).not.toContain('dispatch exactly one Agent')
    expect(instruction).toContain('D → E → CLI draft → F/08 → CLI patch/finalize')
  }
})


test('bounded missing handoff recovery names each lane without requiring a new researcher', async () => {
  const { buildMissingResearcherRecoveryInstruction } = await import('../ws/handler.js')
  const path = 'commercialization-research/03-user-needs.md'
  const instruction = buildMissingResearcherRecoveryInstruction([path], true)
  expect(instruction).toContain(path)
  expect(instruction).toContain('never-started lane')
  expect(instruction).toContain('preserve a truthful missing-evidence gap')
  expect(instruction).not.toContain('dispatch exactly one Agent')
})

test.each(['continue-initial-render', 'continue-finalize-delivery'] as const)('imported canonical expert uses CLI continuation by expert ID alone (%s)', async (kind) => {
  const { spyOn } = await import('bun:test')
  const { continueCommercializationResearch, handleWebSocket } = await import('../ws/handler.js')
  const { conversationService } = await import('../services/conversationService.js')
  const { sessionService } = await import('../services/sessionService.js')
  const { getExpertProcessBindingKey } = await import('../services/expertRuntimeBindingService.js')
  const expertId = 'commercialization-research-report'
  const expert = {
    mode: 'expert', expertId, packId: 'custom-imported-pack', status: 'active',
    runtimeBinding: {
      schemaVersion: 1, active: true, expertId, packId: 'custom-imported-pack',
      expertName: 'Imported product research', packVersion: '1.0.0', promptSnapshot: 'Legacy imported research',
      skills: [], hostTools: [], tools: [], permissions: [], activatedAt: new Date().toISOString(),
    },
  } as any
  const sessionId = `imported-canonical-cli-${kind}-${crypto.randomUUID()}`
  const session = {
    proc: { kill() {}, exited: Promise.resolve(0) }, outputCallbacks: [], workDir: process.cwd(),
    permissionMode: 'default', sdkToken: 'test-token', sdkSocket: null, pendingOutbound: [],
    startupPending: false, startupExitCode: null, stdoutLines: [], stderrLines: [], outputDrain: Promise.resolve(),
    sdkMessages: [], initMessage: null, pendingPermissionRequests: new Map(), expertRuntimeBindingKey: getExpertProcessBindingKey(expert),
  }
  const socket = {
    data: { sessionId, connectedAt: Date.now(), channel: 'client', sdkToken: null, serverPort: 0, serverHost: '127.0.0.1' },
    send() { return 1 }, close() {},
  } as any
  ;(conversationService as any).sessions.set(sessionId, session)
  const send = spyOn(conversationService, 'sendInternalMessage').mockReturnValue(true)
  const getSession = spyOn(sessionService, 'getSession').mockResolvedValue({ id: sessionId, workDir: process.cwd(), expert } as any)
  const title = spyOn(sessionService, 'getCustomTitle').mockResolvedValue(null)
  try {
    handleWebSocket.open(socket)
    await continueCommercializationResearch(sessionId, {
      kind, briefPath: '01.md', absorptionPath: '07.md', completionReviewPath: '08.md', reportPath: 'report.html',
    })
    expect(send).toHaveBeenCalledWith(sessionId, expect.stringContaining('cc-jiangxia expert-template-fill --data-stdin --output'))
    const instruction = send.mock.calls[0]![1] as string
    expect(instruction).not.toContain('structured Write')
    expect(instruction).not.toContain('structured fixed-template Write')
  } finally {
    handleWebSocket.close(socket)
    conversationService.stopSession(sessionId)
    send.mockRestore()
    getSession.mockRestore()
    title.mockRestore()
  }
})
