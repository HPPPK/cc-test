import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as hostTools from '../../tools.js'
import { SettingsService } from '../services/settingsService.js'
import { ProviderService } from '../services/providerService.js'
import { __resetWebSocketHandlerStateForTests, buildInitialTemplateRenderAutoContinueInstruction, buildFinalizeDeliveryAutoContinueInstruction } from '../ws/handler.js'
import { conversationService } from '../services/conversationService.js'

let isolatedConfigDir = ''
let previousConfigDir: string | undefined
beforeEach(async () => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  isolatedConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bounded-research-fixture-'))
  process.env.CLAUDE_CONFIG_DIR = isolatedConfigDir
  // Readiness exercises a known host tool pool, never credential-backed isEnabled().
  spyOn(hostTools, 'getToolsForDefaultPreset').mockReturnValue(['Agent', 'TaskOutput', 'Bash', 'Read', 'Write', 'AskUserQuestion'])
  spyOn(SettingsService.prototype, 'getUserSettings').mockResolvedValue({ model: 'fixture-model' })
  spyOn(ProviderService.prototype, 'listProviders').mockResolvedValue({ providers: [], activeId: null })
  // Binding changes may restart the fixture transport; never spawn a real CLI.
  spyOn(conversationService, 'startSession').mockResolvedValue()
})
afterEach(async () => {
  __resetWebSocketHandlerStateForTests()
  mock.restore()
  if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  const fixtureDir = isolatedConfigDir
  isolatedConfigDir = ''
  if (!fixtureDir) return
  if (path.dirname(path.resolve(fixtureDir)) !== path.resolve(os.tmpdir())
    || !path.basename(fixtureDir).startsWith('bounded-research-fixture-')) {
    throw new Error('Refusing to remove a directory outside the temporary fixture boundary')
  }
  await fs.rm(fixtureDir, { recursive: true, force: true })
})

test('failed F resumes its original transcript instead of starting a replacement review', async () => {
  const { buildOutputReviewAutoContinueInstruction } = await import('../ws/handler.js')
  const instruction = buildOutputReviewAutoContinueInstruction({ kind: 'continue-output-review', briefPath: '01.md', absorptionPath: '07.md', completionReviewPath: '08.md', reportPath: 'report.html', reviewerAgentType: 'expert-evidence-output-reviewer', resumeAgentId: 'original-F' })
  expect(instruction).toContain('"summary":"恢复原报告复核"')
  expect(instruction).toContain('SendMessage')
  expect(instruction).toContain('"to":"original-F"')
  expect(instruction).toContain('Do not launch a fresh Agent')
  expect(instruction).not.toContain('exactly one Agent tool call')
})

// Test the emitted model instruction contract, including the legacy expert branch.
test('canonical draft and final continuation use only acknowledged CLI HTML delivery', () => {
  const initial = { kind: 'continue-initial-render' as const, briefPath: '01.md', absorptionPath: '07.md' }
  const final = { kind: 'continue-finalize-delivery' as const, briefPath: '01.md', absorptionPath: '07.md', completionReviewPath: '08.md', reportPath: 'report.html' }
  const draft = buildInitialTemplateRenderAutoContinueInstruction(initial, true)
  const finish = buildFinalizeDeliveryAutoContinueInstruction(final, true)
  for (const instruction of [draft, finish]) {
    expect(instruction).toContain('claude expert-template-fill --data-stdin --output')
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

test.each(['C:\\Users\\测试\\项目\\报告.html', '/Users/test/project/报告.html'])('CLI finalization uses a filename instead of an absolute output path: %s', reportPath => {
  const instruction = buildFinalizeDeliveryAutoContinueInstruction({ kind: 'continue-finalize-delivery', briefPath: '01.md', absorptionPath: '07.md', completionReviewPath: '08.md', reportPath }, true)
  expect(instruction).toContain('--output "报告.html"')
  expect(instruction).not.toContain('--output ' + JSON.stringify(reportPath))
  expect(instruction).toContain(reportPath)
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

test.each(['continue-initial-render', 'continue-finalize-delivery', 'recover-ended-researchers', 'initial-render-stalled'] as const)('imported canonical expert uses CLI continuation by expert ID alone (%s)', async (kind) => {
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
  const workDir = path.join(isolatedConfigDir, 'workspace')
  await fs.mkdir(workDir)
  const { sessionId } = await sessionService.createSession(workDir)
  await sessionService.appendSessionMetadata(sessionId, { workDir, expert })
  const session = {
    proc: { kill() {}, exited: Promise.resolve(0) }, outputCallbacks: [], workDir,
    permissionMode: 'default', sdkToken: 'test-token', sdkSocket: null, pendingOutbound: [],
    startupPending: false, startupExitCode: null, stdoutLines: [], stderrLines: [], outputDrain: Promise.resolve(),
    sdkMessages: [], initMessage: null, pendingPermissionRequests: new Map(), expertRuntimeBindingKey: getExpertProcessBindingKey(expert),
  }
  const emitted: string[] = []
  const socket = {
    data: { sessionId, connectedAt: Date.now(), channel: 'client', sdkToken: null, serverPort: 0, serverHost: '127.0.0.1' },
    send(value: string) { emitted.push(value); return 1 }, close() {},
  } as any
  ;(conversationService as any).sessions.set(sessionId, session)
  const send = spyOn(conversationService, 'sendInternalMessage').mockReturnValue(true)
  const { commercializationResearchBudgetService } = await import('../services/commercializationResearchBudgetService.js')
  const saveOnly = spyOn(commercializationResearchBudgetService, 'markSaveOnlyRecovery')
  try {
    expect(await sessionService.getSessionTaskNotifications(sessionId)).toEqual([])
    handleWebSocket.open(socket)
    const plan = kind === 'initial-render-stalled' ? { kind, errorCode: 'EXPERT_RESEARCH_BUDGET_REJECTED' } : kind === 'recover-ended-researchers' ? { kind, recoveries: [{ artifactPath: '02.md', endedAgentId: 'ended-A', reason: 'ended-without-saved-handoff' as const }], preservedResearcherPaths: ['03.md', '04.md'] } : {
      kind, briefPath: '01.md', absorptionPath: '07.md', completionReviewPath: '08.md', reportPath: 'report.html',
    }
    const continued = await continueCommercializationResearch(sessionId, plan)
    expect(continued).toBe(true)
    if (kind === 'initial-render-stalled') {
      expect(send).not.toHaveBeenCalled()
      expect(emitted.join('\n')).toContain('EXPERT_INITIAL_RENDER_STALLED')
      expect(emitted.join('\n')).toContain('HTML 尚未生成')
      return
    }
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(sessionId, expect.stringContaining(kind === 'recover-ended-researchers' ? '<expert-research-ended-worker-recovery>' : 'claude expert-template-fill --data-stdin --output'))
    if (kind === 'recover-ended-researchers') expect(saveOnly).toHaveBeenCalledWith(sessionId, expert, 'ended-A')
    else expect(saveOnly).not.toHaveBeenCalled()
    const instruction = send.mock.calls[0]![1] as string
    expect(instruction).not.toContain('structured Write')
    expect(instruction).not.toContain('structured fixed-template Write')
  } finally {
    handleWebSocket.close(socket, 1000, 'test complete')
    conversationService.stopSession(sessionId)
    send.mockRestore()
    saveOnly.mockRestore()
  }
})
