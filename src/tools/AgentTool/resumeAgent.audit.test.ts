import { asAgentId } from '../../types/ids.js'
import { expect, spyOn, test } from 'bun:test'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import type { Message } from '../../types/message.js'
import { buildPlaywrightAudit, finalizeAgentTool, recordInterruptedExpertAgentResearchAudit } from './agentToolUtils.js'

const source = 'https://example.com/original-evidence'
const oldBrowser = () => {
  const ledger = Buffer.from(JSON.stringify({ url: source, steps: [{ outcome: 'success' }] })).toString('base64')
  return [
    createAssistantMessage({ content: [{ type: 'tool_use', id: 'prior-browser', name: 'Playwright', input: { actions: [{ type: 'navigate', url: source }, { type: 'extract' }] } }] }),
    createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'prior-browser', content: `<playwright-action-ledger encoding="base64">${ledger}</playwright-action-ledger>` }] }),
    createAssistantMessage({ content: [{ type: 'tool_use', id: 'prior-write', name: 'Write', input: { file_path: 'research/old.md', content: 'old report' } }] }),
    createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'prior-write', content: 'saved' }] }),
    createAssistantMessage({ content: 'Old prose must not become the resumed result.' }),
  ] as Message[]
}
const metadata = (priorAuditMessages: Message[]) => ({ prompt: 'Save existing evidence only.', resolvedAgentModel: 'test', isBuiltInAgent: true, startTime: Date.now(), agentType: 'expert-evidence-researcher', isAsync: true, priorAuditMessages })

test('save-only resume retains original real browser audit with original IDs but counts only new tools and artifact writes', () => {
  const current = [
    createAssistantMessage({ content: [{ type: 'tool_use', id: 'new-write', name: 'Write', input: { file_path: 'research/current.md', content: 'preserved evidence' } }] }),
    createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'new-write', content: 'saved' }] }),
    createAssistantMessage({ content: 'Saved existing evidence.' }),
  ] as Message[]
  const result = finalizeAgentTool(current, 'same-worker', metadata(oldBrowser()))
  expect(result.playwrightAudit).toEqual([expect.objectContaining({ auditId: 'playwright:prior-browser:0', target: source, status: 'opened' })])
  expect(result.playwrightToolUseCount).toBe(0)
  expect(result.totalToolUseCount).toBe(1)
  expect(result.artifactPath).toBe('research/current.md')
  expect(JSON.stringify(result.content)).not.toContain('Old prose')
  const noNewWrite = finalizeAgentTool([createAssistantMessage({ content: 'Cannot save yet.' }) as Message], 'same-worker', metadata(oldBrowser()))
  expect(noNewWrite.artifactPath).toBeUndefined()
  expect(noNewWrite.totalToolUseCount).toBe(0)
})

test('overlapping resumed browser transcript IDs are audited only once', () => {
  const prior = oldBrowser()
  expect(buildPlaywrightAudit([...prior, ...prior])).toHaveLength(1)
  const result = finalizeAgentTool([...prior.slice(0, 2), createAssistantMessage({ content: 'Saved.' }) as Message], 'worker', metadata(prior))
  expect(result.playwrightAudit).toHaveLength(1)
})

test('interrupted save-only resume preserves original opened evidence and never promotes old Writes to current artifact state', async () => {
  let persisted: any
  const recorded = await recordInterruptedExpertAgentResearchAudit({
    agentId: 'worker', agentType: 'expert-evidence-researcher', messages: [], priorAuditMessages: oldBrowser(), reason: 'save interrupted',
    recordAudit: async value => { persisted = value },
  })
  expect(recorded).toBe(true)
  expect(persisted.entries).toEqual([expect.objectContaining({ target: source, status: 'opened', auditId: 'playwright:prior-browser:0' })])
  expect(persisted.artifactPath).toBeUndefined()
  expect(persisted.interrupted).toBe(true)
})

test('historical prose or unpaired browser intent never become opened evidence on resume', async () => {
  const prior = [
    createAssistantMessage({ content: 'I visited https://example.com/prose-only and researched it.' }),
    createAssistantMessage({ content: [{ type: 'tool_use', id: 'unfinished-browser', name: 'Playwright', input: { actions: [{ type: 'navigate', url: source }] } }] }),
  ] as Message[]
  const result = finalizeAgentTool([createAssistantMessage({ content: 'Save failed.' }) as Message], 'worker', metadata(prior))
  expect(result.playwrightAudit).toEqual([expect.objectContaining({ target: source, status: 'pending' })])
  let persisted: any
  await recordInterruptedExpertAgentResearchAudit({ agentId: 'worker', agentType: 'expert-evidence-researcher', messages: [], priorAuditMessages: prior, reason: 'interrupted', recordAudit: async value => { persisted = value } })
  expect(persisted.entries).toEqual([expect.objectContaining({ target: source, status: 'interrupted' })])
  expect(JSON.stringify(persisted.entries)).not.toContain('prose-only')
})


test('resumeAgentBackground forwards the stored same-worker transcript into audit metadata and appends only the new task prompt', async () => {
  const storage = await import('../../utils/sessionStorage.js')
  const tasks = await import('../../tasks/LocalAgentTask/LocalAgentTask.js')
  const pools = await import('../../tools.js')
  const runtime = await import('./agentToolUtils.js')
  const runner = await import('./runAgent.js')
  const { resumeAgentBackground } = await import('./resumeAgent.js')
  const { getDefaultAppState } = await import('../../state/AppStateStore.js')
  const { getEmptyToolPermissionContext } = await import('../../Tool.js')
  const { GENERAL_PURPOSE_AGENT } = await import('./built-in/generalPurposeAgent.js')
  const prior = oldBrowser()
  const workerId = 'resume-audit-fixture'
  const prompt = 'Only save the existing evidence into research/current.md.'
  let captured: Parameters<typeof runtime.runAsyncAgentLifecycle>[0] | undefined
  let queryInput: Parameters<typeof runner.runAgent>[0] | undefined
  let completed: Promise<unknown> | undefined
  let state = { ...getDefaultAppState(), toolPermissionContext: getEmptyToolPermissionContext() }
  const context: import('../../Tool.js').ToolUseContext = {
    options: { commands: [], debug: false, mainLoopModel: 'claude-sonnet-4-6', tools: [], verbose: false, thinkingConfig: { type: 'disabled' }, mcpClients: [], mcpResources: {}, isNonInteractiveSession: true, agentDefinitions: { activeAgents: [GENERAL_PURPOSE_AGENT], allAgents: [GENERAL_PURPOSE_AGENT] } },
    abortController: new AbortController(), messages: [], getAppState: () => state,
    setAppState: update => { state = update(state) }, setInProgressToolUseIDs: () => {}, setResponseLength: () => {}, updateFileHistoryState: () => {}, updateAttributionState: () => {},
    readFileState: (await import('../../utils/fileStateCache.js')).createFileStateCacheWithSizeLimit(10),
  }
  const spies = [
    spyOn(storage, 'getAgentTranscript').mockResolvedValue({ messages: prior, contentReplacements: [] }),
    spyOn(storage, 'readAgentMetadata').mockResolvedValue({ agentType: GENERAL_PURPOSE_AGENT.agentType, description: 'Resume original worker' }),
    spyOn(tasks, 'registerAsyncAgent').mockImplementation(input => ({ agentId: input.agentId!, abortController: new AbortController() }) as ReturnType<typeof tasks.registerAsyncAgent>),
    spyOn(tasks, 'startAsyncAgent').mockImplementation(() => {}),
    spyOn(pools, 'assembleToolPool').mockReturnValue([]),
    spyOn(runner, 'runAgent').mockImplementation(async function* (input) { queryInput = input; yield createAssistantMessage({ content: 'Saved existing evidence.' }); }),
    spyOn(runtime, 'runAsyncAgentLifecycle').mockImplementation(input => {
      captured = input
      const work = (async () => { for await (const _ of input.makeStream(() => {})) {} return { status: 'succeeded' as const } })()
      completed = work
      return work
    }),
  ]
  try {
    const result = await resumeAgentBackground({ agentId: workerId, prompt, toolUseContext: context, canUseTool: async (_tool, input) => ({ behavior: 'allow', updatedInput: input }) })
    await completed
    expect(result.agentId).toBe(workerId)
    expect(captured!.agentIdForCleanup).toBe(workerId)
    expect(captured!.metadata.priorAuditMessages).toEqual(prior)
    expect(captured!.metadata.prompt).toBe(prompt)
    expect(queryInput!.promptMessages.slice(0, -1)).toEqual(prior)
    expect(JSON.stringify(queryInput!.promptMessages.at(-1))).toContain(prompt)
    expect(queryInput!.override!.agentId).toBe(asAgentId(workerId))
    expect(storage.getAgentTranscript).toHaveBeenCalledWith(workerId)
    expect(tasks.startAsyncAgent).toHaveBeenCalledWith(workerId, context.setAppState)
  } finally { for (const spy of spies.reverse()) spy.mockRestore() }
})
