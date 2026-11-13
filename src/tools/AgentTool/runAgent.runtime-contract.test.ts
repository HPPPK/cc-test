import { afterAll, afterEach, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { getEmptyToolPermissionContext, type ToolUseContext } from '../../Tool.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { createFileStateCacheWithSizeLimit } from '../../utils/fileStateCache.js'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { ExpertSubagentSkillContext, ExpertSubagentResearchEvidenceContext, ExpertResearchSourceAssignment } from '../../services/tools/expertSubagentSkillRuntime.js'
import * as expert from '../../services/tools/expertSubagentSkillRuntime.js'
import * as budget from '../../services/tools/expertResearchBudgetRuntime.js'
import * as storage from '../../utils/sessionStorage.js'
import * as query from '../../query.js'
import * as commands from '../../commands.js'
import type { Command } from '../../types/command.js'
import { runAgent } from './runAgent.js'
import { GENERAL_PURPOSE_AGENT } from './built-in/generalPurposeAgent.js'
import { FileReadTool } from '../FileReadTool/FileReadTool.js'
import { FileWriteTool } from '../FileWriteTool/FileWriteTool.js'
import { PlaywrightTool } from '../PlaywrightTool/PlaywrightTool.js'
import { AgentTool } from './AgentTool.js'
import type { AgentToolResult } from './agentToolUtils.js'

const directory = mkdtempSync(path.join(tmpdir(), 'agent-runtime-contract-'))
const previousConfig = process.env.CLAUDE_CONFIG_DIR
process.env.CLAUDE_CONFIG_DIR = directory
const paths = { briefPath: 'research/01-brief.md', researcherPaths: ['research/02-source.md'], reviewerPath: 'research/05-review.md', auditPath: 'research/06-audit.md', absorptionPath: 'research/07-absorption.md', completionReviewPath: 'research/08-review.md' }
const restorers: Array<() => void> = []
function fixtureContext(): ToolUseContext {
  let state = getDefaultAppState()
  state = { ...state, toolPermissionContext: getEmptyToolPermissionContext() }
  return {
    options: { commands: [], debug: false, mainLoopModel: 'claude-sonnet-4-6', tools: [FileReadTool, FileWriteTool, PlaywrightTool], verbose: false, thinkingConfig: { type: 'disabled' }, mcpClients: [], mcpResources: {}, isNonInteractiveSession: true, agentDefinitions: { activeAgents: [], allAgents: [] } },
    abortController: new AbortController(), messages: [], readFileState: createFileStateCacheWithSizeLimit(10), getAppState: () => state,
    setAppState: update => { state = update(state) }, setInProgressToolUseIDs: () => {}, setResponseLength: () => {}, updateFileHistoryState: () => {}, updateAttributionState: () => {},
  }
}
function setup(skill: ExpertSubagentSkillContext, evidence?: ExpertSubagentResearchEvidenceContext) {
  for (const restore of [
    spyOn(expert, 'loadExpertSubagentSkillContext').mockResolvedValue(skill),
    spyOn(expert, 'loadExpertSubagentResearchEvidenceContext').mockResolvedValue(evidence),
    spyOn(storage, 'recordSidechainTranscript').mockResolvedValue(undefined),
    spyOn(storage, 'writeAgentMetadata').mockResolvedValue(undefined),
    spyOn(budget, 'reserveExpertResearcherStart').mockResolvedValue(undefined),
  ]) restorers.push(() => restore.mockRestore())
}
const allow: CanUseToolFn = async (_tool, input) => ({ behavior: 'allow', updatedInput: input })
function options(agentType: string): Parameters<typeof runAgent>[0] {
  return { agentDefinition: { ...GENERAL_PURPOSE_AGENT, agentType }, promptMessages: [createUserMessage({ content: 'Bounded fixture task' })], toolUseContext: fixtureContext(), canUseTool: allow, isAsync: true, querySource: 'agent:custom', availableTools: [FileReadTool, FileWriteTool, PlaywrightTool], override: { systemPrompt: asSystemPrompt([]), userContext: {}, systemContext: {} } }
}
afterEach(() => { for (const restore of restorers.splice(0)) restore() })
afterAll(() => { if (previousConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = previousConfig; rmSync(directory, { recursive: true, force: true }) })

test('output reviewer requires a rendered draft before starting the query', async () => {
  setup({ expertId: 'fixture', packId: 'fixture', packVersion: '1', skills: [], artifactPaths: paths })
  const start = spyOn(query, 'query')
  restorers.push(() => start.mockRestore())
  await expect((async () => { for await (const _ of runAgent(options('expert-evidence-output-reviewer'))) {} })()).rejects.toThrow('EXPERT_TEMPLATE_OUTPUT_REVIEW_DRAFT_REQUIRED')
  expect(start).not.toHaveBeenCalled()
})

for (const agentType of ['expert-evidence-output-reviewer', 'expert-evidence-absorber', 'expert-evidence-reviewer']) {
  test(`${agentType} enforces real read/write/browser bounds before parent permission callbacks`, async () => {
    setup({ expertId: 'fixture', packId: 'fixture', packVersion: '1', skills: [], artifactPaths: paths, outputReview: { briefPath: paths.briefPath, absorptionPath: paths.absorptionPath, completionReviewPath: paths.completionReviewPath, reportPath: 'report.html' } }, { expertId: 'fixture', packId: 'fixture', packVersion: '1', reviewerEvidenceOnly: true, artifactPaths: paths, records: [{ agentId: 'fixture', agentType: 'expert-evidence-researcher', recordedAt: '2026-01-01', content: 'Bounded fixture evidence', entries: [] }] })
    const start = spyOn(query, 'query').mockImplementation(async function* (params) {
      expect(JSON.stringify(params.messages)).toContain('research/')
      const parent = createAssistantMessage({ content: 'Fixture permission probe' })
      for (const [tool, input] of [[FileReadTool, { file_path: 'outside.txt' }], [FileWriteTool, { file_path: 'outside.md', content: '# invalid destination' }], [PlaywrightTool, { action: 'snapshot' }]] as const) {
        const result = await params.canUseTool(tool, input, params.toolUseContext, parent, 'fixture-call')
        expect(result.behavior).toBe('deny')
      }
      yield createAssistantMessage({ content: 'Fixture complete' })
      return { reason: 'completed' as const }
    })
    restorers.push(() => start.mockRestore())
    let parentCalls = 0
    const launch = options(agentType)
    launch.canUseTool = async (_tool, input) => { parentCalls++; return { behavior: 'allow', updatedInput: input } }
    for await (const _ of runAgent(launch)) {}
    expect(parentCalls).toBe(0)
    expect(start).toHaveBeenCalledTimes(1)
  })
}

test('built-in callback fires after completion and failed queries settle the reserved researcher', async () => {
  setup({ expertId: 'fixture', packId: 'fixture', packVersion: '1', skills: [] })
  const finish = spyOn(budget, 'finishExpertResearcher').mockResolvedValue(undefined)
  restorers.push(() => finish.mockRestore())
  let callbacks = 0
  const launch = options('fixture-callback')
  launch.agentDefinition = { ...GENERAL_PURPOSE_AGENT, callback: () => { callbacks++ } }
  const start = spyOn(query, 'query').mockImplementation(async function* () { yield createAssistantMessage({ content: 'complete' }); return { reason: 'completed' as const } })
  restorers.push(() => start.mockRestore())
  for await (const _ of runAgent(launch)) {}
  expect(callbacks).toBe(1)
  expect(finish).not.toHaveBeenCalled()
  start.mockImplementation(async function* () { throw new Error('fixture provider failed'); })
  await expect((async () => { for await (const _ of runAgent(launch)) {} })()).rejects.toThrow('fixture provider failed')
  expect(callbacks).toBe(1)
  expect(finish).toHaveBeenCalledTimes(1)
})

test('managed workflow workers use their Agent id for durable tool heartbeats', async () => {
  setup({ expertId: 'fixture', packId: 'fixture', packVersion: '1', skills: [] })
  const start = spyOn(query, 'query').mockImplementation(async function* (params) {
    expect(params.toolUseContext.queryTracking?.chainId).toBe('managed-worker-1')
    yield createAssistantMessage({ content: 'Fixture complete' })
    return { reason: 'completed' as const }
  })
  restorers.push(() => start.mockRestore())

  const launch = options('managed-workflow-worker')
  launch.override = { ...launch.override, agentId: 'managed-worker-1' as never }
  launch.workflowWorkerContract = {
    sessionId: 'session-1',
    phaseId: 'delegate-implement',
    runId: 'run-1',
    batchId: 'B1',
    role: 'coder',
    workspaceRoot: directory,
    writeScopes: ['src/**'],
  }

  for await (const _ of runAgent(launch)) {}
  expect(start).toHaveBeenCalledTimes(1)
})

test('file-first worker mapping keeps only the artifact receipt instead of free-form research prose', () => {
  const result: AgentToolResult & { status: 'completed', prompt: string } = { status: 'completed', prompt: 'fixture', agentId: 'fixture', agentType: 'expert-evidence-absorber', artifactPath: paths.absorptionPath, content: [{ type: 'text', text: 'Do not forward this free-form fixture research prose.' }], totalToolUseCount: 1, totalDurationMs: 1, totalTokens: 1, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null } }
  const mapped = AgentTool.mapToolResultToToolResultBlockParam(result, 'fixture-call')
  expect(JSON.stringify(mapped)).toContain(path.basename(paths.absorptionPath))
  expect(JSON.stringify(mapped)).not.toContain('Do not forward')
})


test('researcher dispatch binds its exact source batch and reports the assignment callback', async () => {
  setup({ expertId: 'fixture', packId: 'fixture', packVersion: '1', skills: [], artifactPaths: paths, researchSourcePlan: { batches: [{ owner: 'competitors', artifactPath: paths.researcherPaths[0]!, batchFingerprint: 'fixture-batch', entries: [{ tier: 'core', category: 'fixture', candidateUrl: 'https://example.invalid/source', candidateHost: 'example.invalid', owner: 'competitors' }] }] } })
  const dispatch = spyOn(expert, 'recordExpertSubagentResearchSourceDispatch').mockResolvedValue(undefined)
  restorers.push(() => dispatch.mockRestore())
  const start = spyOn(query, 'query').mockImplementation(async function* (params) {
    expect(JSON.stringify(params.messages)).toContain('https://example.invalid/source')
    yield createAssistantMessage({ content: 'Fixture complete' })
    return { reason: 'completed' as const }
  })
  restorers.push(() => start.mockRestore())
  let assignment: ExpertResearchSourceAssignment | undefined
  const launch = options('expert-evidence-researcher')
  launch.declaredResearchArtifactPath = paths.researcherPaths[0]
  launch.taskPrompt = `Write ${paths.researcherPaths[0]}`
  launch.onExpertResearchAssignment = value => { assignment = value }
  for await (const _ of runAgent(launch)) {}
  expect(assignment).toEqual({ artifactPath: paths.researcherPaths[0], candidateUrls: ['https://example.invalid/source'] })
  expect(dispatch).toHaveBeenCalledTimes(1)
  expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ batchFingerprint: 'fixture-batch', coreEntryCount: 1, openEntryCount: 0 })
})


test('frontmatter skill preloading supplies real command metadata and content to the worker', async () => {
  setup({ expertId: 'fixture', packId: 'fixture', packVersion: '1', skills: [] })
  let loads = 0
  const skill: Command = { type: 'prompt', name: 'fixture-skill', description: 'Fixture instructions', source: 'builtin', progressMessage: 'Loading fixture', contentLength: 20, getPromptForCommand: async () => { loads++; return [{ type: 'text', text: 'Only fixture skill instructions' }] } }
  const discover = spyOn(commands, 'getSkillToolCommands').mockResolvedValue([skill])
  restorers.push(() => discover.mockRestore())
  const start = spyOn(query, 'query').mockImplementation(async function* (params) {
    expect(JSON.stringify(params.messages)).toContain('Only fixture skill instructions')
    expect(JSON.stringify(params.messages)).toContain('fixture-skill')
    yield createAssistantMessage({ content: 'Fixture complete' })
    return { reason: 'completed' as const }
  })
  restorers.push(() => start.mockRestore())
  const launch = options('fixture-preload')
  launch.agentDefinition = { ...GENERAL_PURPOSE_AGENT, skills: ['fixture-skill', 'missing-fixture-skill'] }
  for await (const _ of runAgent(launch)) {}
  expect(loads).toBe(1)
})
