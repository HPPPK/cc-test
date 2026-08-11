import { afterEach, describe, expect, test } from 'bun:test'
import type { AppState } from '../../state/AppState.js'
import { IDLE_SPECULATION_STATE } from '../../state/AppStateStore.js'
import { createTaskStateBase } from '../../Task.js'
import type { ToolUseContext } from '../../Tool.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { Message } from '../../types/message.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import {
  getCommandQueue,
  resetCommandQueue,
} from '../../utils/messageQueueManager.js'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import {
  buildPlaywrightAudit,
  countToolUsesByName,
  formatPlaywrightAudit,
  finalizeAgentTool,
  recordFinalizedExpertAgentResearchAudit,
  runAsyncAgentLifecycle,
  resolveAgentTools,
  shouldSurfaceExpertEvidenceAgentFailure,
} from './agentToolUtils.js'


describe('explicit subagent question-card opt-in', () => {
  const availableTools = [
    { name: 'Playwright' },
    { name: 'AskUserQuestion' },
  ] as never

  test('allows an async built-in agent to use AskUserQuestion only when it explicitly declares it', () => {
    const resolved = resolveAgentTools({
      source: 'built-in',
      baseDir: 'built-in',
      agentType: 'expert-evidence-researcher',
      tools: ['Playwright', 'AskUserQuestion'],
      getSystemPrompt: () => '',
    }, availableTools, true)

    expect(resolved.validTools).toEqual(['Playwright', 'AskUserQuestion'])
    expect(resolved.resolvedTools.map((tool) => tool.name)).toEqual(['Playwright', 'AskUserQuestion'])
  })

  test('removes AskUserQuestion only for an Expert session that explicitly enables delegated-Ask isolation', () => {
    const previous = process.env.CC_JIANGXIA_EXPERT_FORBID_SUBAGENT_ASK_USER_QUESTION
    process.env.CC_JIANGXIA_EXPERT_FORBID_SUBAGENT_ASK_USER_QUESTION = '1'
    try {
      const resolved = resolveAgentTools({
        source: 'built-in',
        baseDir: 'built-in',
        agentType: 'expert-evidence-researcher',
        tools: ['Playwright', 'AskUserQuestion'],
        getSystemPrompt: () => '',
      }, availableTools, true)
      expect(resolved.resolvedTools.map((tool) => tool.name)).toEqual(['Playwright'])
    } finally {
      if (previous === undefined) delete process.env.CC_JIANGXIA_EXPERT_FORBID_SUBAGENT_ASK_USER_QUESTION
      else process.env.CC_JIANGXIA_EXPERT_FORBID_SUBAGENT_ASK_USER_QUESTION = previous
    }
  })

  test('keeps AskUserQuestion unavailable to an async built-in agent that did not opt in', () => {
    const resolved = resolveAgentTools({
      source: 'built-in',
      baseDir: 'built-in',
      agentType: 'ordinary-researcher',
      tools: ['Playwright'],
      getSystemPrompt: () => '',
    }, availableTools, true)

    expect(resolved.resolvedTools.map((tool) => tool.name)).toEqual(['Playwright'])
  })
})

describe('Expert evidence agent failure handling', () => {
  test('does not allow a partial evidence transcript to be reported as completed after an upstream error', () => {
    expect(shouldSurfaceExpertEvidenceAgentFailure('expert-evidence-researcher')).toBe(true)
    expect(shouldSurfaceExpertEvidenceAgentFailure('expert-evidence-reviewer')).toBe(true)
    expect(shouldSurfaceExpertEvidenceAgentFailure('general-purpose')).toBe(false)
    expect(shouldSurfaceExpertEvidenceAgentFailure(undefined)).toBe(false)
  })
})

describe('Expert Playwright audit', () => {
  const evidenceResearchMetadata = () => ({
    prompt: 'Research public evidence for the assigned report section.',
    resolvedAgentModel: 'test-model',
    isBuiltInAgent: true,
    startTime: Date.now(),
    agentType: 'expert-evidence-researcher',
    isAsync: false,
  })

  test('counts Playwright from real assistant tool_use blocks only', () => {
    const message = createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_browser',
          name: 'Playwright',
          input: { url: 'https://example.com' },
        },
        {
          type: 'tool_use',
          id: 'toolu_read',
          name: 'Read',
          input: { file_path: 'notes.md' },
        },
        { type: 'text', text: 'I listed Playwright in prose too.' },
      ],
    }) as Message

    expect(countToolUsesByName([message], 'Playwright')).toBe(1)
    expect(countToolUsesByName([message], 'WebFetch')).toBe(0)
  })

  test('builds a real Playwright audit from paired action ledgers, not subagent prose', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_opened', name: 'Playwright',
      input: { actions: [{ type: 'navigate', url: 'https://zh.mweb.im/' }, { type: 'extract' }] },
    }] }) as Message
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://zh.mweb.im/', accessLimited: false,
      steps: [{ outcome: 'success' }, { outcome: 'success' }],
    }), 'utf8').toString('base64')
    const result = createUserMessage({ content: [{
      type: 'tool_result', tool_use_id: 'toolu_opened',
      content: '<playwright-action-ledger encoding="base64">' + ledger + '</playwright-action-ledger>',
    }] }) as Message
    expect(buildPlaywrightAudit([toolUse, result])).toEqual([{
      target: 'https://zh.mweb.im/', kind: 'url', status: 'opened', finalUrl: 'https://zh.mweb.im/',
    }])
  })

  test('keeps every separately navigated public page as its own auditable source', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_multiple_pages', name: 'Playwright',
      input: {
        actions: [
          { type: 'navigate', url: 'https://store.typora.io/' },
          { type: 'extract', selector: 'body' },
          { type: 'navigate', url: 'https://www.mweb.im/' },
          { type: 'extract', selector: 'body' },
          { type: 'navigate', url: 'https://github.com/MacDownApp/macdown' },
          { type: 'extract', selector: 'body' },
        ],
      },
    }] }) as Message
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://github.com/MacDownApp/macdown',
      steps: [
        { index: 0, type: 'navigate', outcome: 'success', url: 'https://store.typora.io/' },
        { index: 1, type: 'extract', outcome: 'success', url: 'https://store.typora.io/' },
        { index: 2, type: 'navigate', outcome: 'success', url: 'https://www.mweb.im/' },
        { index: 3, type: 'extract', outcome: 'success', url: 'https://www.mweb.im/' },
        { index: 4, type: 'navigate', outcome: 'success', url: 'https://github.com/MacDownApp/macdown' },
        { index: 5, type: 'extract', outcome: 'success', url: 'https://github.com/MacDownApp/macdown' },
      ],
    }), 'utf8').toString('base64')
    const result = createUserMessage({ content: [{
      type: 'tool_result', tool_use_id: 'toolu_multiple_pages',
      content: '<playwright-action-ledger encoding="base64">' + ledger + '</playwright-action-ledger>',
    }] }) as Message

    expect(buildPlaywrightAudit([toolUse, result])).toEqual([
      { target: 'https://store.typora.io/', kind: 'url', status: 'opened', finalUrl: 'https://store.typora.io/' },
      { target: 'https://www.mweb.im/', kind: 'url', status: 'opened', finalUrl: 'https://www.mweb.im/' },
      { target: 'https://github.com/MacDownApp/macdown', kind: 'url', status: 'opened', finalUrl: 'https://github.com/MacDownApp/macdown' },
    ])
  })

  test('marks an explicit Playwright verification page as access limited without inventing a product conclusion', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_baidu', name: 'Playwright',
      input: { actions: [{ type: 'navigate', url: 'https://www.baidu.com/s?wd=mweb' }, { type: 'extract' }] },
    }] }) as Message
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://www.baidu.com/s?wd=mweb', accessLimited: true, error: 'Baidu CAPTCHA',
      steps: [{ outcome: 'success' }, { outcome: 'failed', detail: 'Baidu CAPTCHA' }],
    }), 'utf8').toString('base64')
    const result = createUserMessage({ content: [{
      type: 'tool_result', tool_use_id: 'toolu_baidu',
      content: '<playwright-action-ledger encoding="base64">' + ledger + '</playwright-action-ledger>',
    }] }) as Message
    const audit = buildPlaywrightAudit([toolUse, result])
    expect(audit).toEqual([{
      target: 'mweb',
      kind: 'search',
      searchEngine: '百度',
      query: 'mweb',
      searchUrl: 'https://www.baidu.com/s?wd=mweb',
      status: 'access_limited',
      finalUrl: 'https://www.baidu.com/s?wd=mweb',
      detail: 'Baidu CAPTCHA',
    }])
    expect(formatPlaywrightAudit(audit)).toContain('access_limited: query "mweb" [engine=百度]')
  })

  test('does not downgrade an earlier successful search when a later page in the same Playwright call reaches verification', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_baidu_mixed', name: 'Playwright',
      input: { actions: [
        { type: 'navigate', url: 'https://www.baidu.com/s?wd=first+query' },
        { type: 'wait_for_load_state', state: 'domcontentloaded' },
        { type: 'extract', selector: 'body' },
        { type: 'navigate', url: 'https://www.baidu.com/s?wd=second+query' },
        { type: 'wait_for_load_state', state: 'domcontentloaded' },
        { type: 'extract', selector: 'body' },
      ] },
    }] }) as Message
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://wappass.baidu.com/static/captcha/tuxing_v2.html',
      accessLimited: true,
      error: 'EXPERT_HUMAN_VERIFICATION_REQUIRED: Baidu slider CAPTCHA',
      steps: [
        { index: 0, type: 'navigate', outcome: 'success', url: 'https://www.baidu.com/s?wd=first+query' },
        { index: 1, type: 'wait_for_load_state', outcome: 'success', url: 'https://www.baidu.com/s?wd=first+query' },
        { index: 2, type: 'extract', outcome: 'success', url: 'https://www.baidu.com/s?wd=first+query' },
        { index: 3, type: 'navigate', outcome: 'success', url: 'https://wappass.baidu.com/static/captcha/tuxing_v2.html' },
      ],
    }), 'utf8').toString('base64')
    const result = createUserMessage({ content: [{
      type: 'tool_result', tool_use_id: 'toolu_baidu_mixed',
      content: `<playwright-action-ledger encoding="base64">${ledger}</playwright-action-ledger>`,
    }] }) as Message

    expect(buildPlaywrightAudit([toolUse, result])).toEqual([
      expect.objectContaining({ query: 'first query', status: 'opened', finalUrl: 'https://www.baidu.com/s?wd=first+query' }),
      expect.objectContaining({ query: 'second query', status: 'access_limited', finalUrl: 'https://wappass.baidu.com/static/captcha/tuxing_v2.html' }),
    ])
  })

  test('keeps Google and 360 search entries distinct with their own query and URLs', () => {
    const googleUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_google', name: 'Playwright',
      input: { actions: [{ type: 'navigate', url: 'https://www.google.com/' }, { type: 'fill', selector: 'textarea[name=q]', text: 'Mac Markdown 阅读器' }, { type: 'press', key: 'Enter' }] },
    }] }) as Message
    const soUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_360', name: 'Playwright',
      input: { actions: [{ type: 'new_tab', url: 'https://www.so.com/s?q=Mac%20Markdown%20阅读器' }, { type: 'extract' }] },
    }] }) as Message
    const googleLedger = Buffer.from(JSON.stringify({
      url: 'https://www.google.com/search?q=Mac+Markdown+%E9%98%85%E8%AF%BB%E5%99%A8', accessLimited: true,
      error: 'EXPERT_HUMAN_VERIFICATION_REQUIRED: Google CAPTCHA', steps: [{ outcome: 'success' }],
    }), 'utf8').toString('base64')
    const soLedger = Buffer.from(JSON.stringify({
      url: 'https://www.so.com/s?q=Mac%20Markdown%20阅读器', accessLimited: false, steps: [{ outcome: 'success' }],
    }), 'utf8').toString('base64')
    const googleResult = createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'toolu_google', content: '<playwright-action-ledger encoding="base64">' + googleLedger + '</playwright-action-ledger>' }] }) as Message
    const soResult = createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'toolu_360', content: '<playwright-action-ledger encoding="base64">' + soLedger + '</playwright-action-ledger>' }] }) as Message

    const audit = buildPlaywrightAudit([googleUse, soUse, googleResult, soResult])

    expect(audit).toEqual([
      expect.objectContaining({ kind: 'search', searchEngine: 'Google', query: 'Mac Markdown 阅读器', searchUrl: 'https://www.google.com/', status: 'access_limited' }),
      expect.objectContaining({ kind: 'search', searchEngine: '360', query: 'Mac Markdown 阅读器', searchUrl: 'https://www.so.com/s?q=Mac%20Markdown%20阅读器', status: 'opened' }),
    ])
    const formatted = formatPlaywrightAudit(audit)
    expect(formatted).toContain('[engine=Google]')
    expect(formatted).toContain('[engine=360]')
    expect(formatted).toContain('[search_url=https://www.google.com/]')
    expect(formatted).toContain('[final_url=https://www.google.com/search?q=Mac+Markdown+')
  })

  test('keeps a complete bounded audit for a normal deep-research worker rather than hiding later source URLs', () => {
    const audit = Array.from({ length: 24 }, (_, index) => ({
      target: `https://example.com/source-${index + 1}` ,
      kind: 'url' as const,
      status: 'opened' as const,
    }))

    const trailer = formatPlaywrightAudit(audit)
    expect(trailer).toContain('https://example.com/source-24')
    expect(trailer).not.toContain('truncated:')
  })

  test('keeps a no-browser subagent result neutral; the selected Expert Runtime owns completion policy', () => {
    const message = createAssistantMessage({
      content: 'I researched this from general knowledge and some URLs in text.',
    }) as Message

    expect(finalizeAgentTool(
      [message],
      'expert-researcher-without-browser',
      evidenceResearchMetadata(),
    ).playwrightAudit).toEqual([])
  })

  test('keeps a search-only audit as neutral provenance; Expert Runtime decides pack-specific completion', () => {
    const search = createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_serp',
          name: 'Playwright',
          input: {
            actions: [
              { type: 'navigate', url: 'https://www.bing.com/search?q=Mac+Markdown+reader' },
              { type: 'extract' },
            ],
          },
        },
        { type: 'text', text: 'The search page loaded.' },
      ],
    }) as Message
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://www.bing.com/search?q=Mac+Markdown+reader',
      steps: [{ outcome: 'success' }],
    }), 'utf8').toString('base64')
    const result = createUserMessage({
      content: [{
        type: 'tool_result',
        tool_use_id: 'toolu_serp',
        content: `<playwright-action-ledger encoding="base64">${ledger}</playwright-action-ledger>`,
      }],
    }) as Message

    expect(finalizeAgentTool(
      [search, result],
      'expert-researcher-serp-only',
      evidenceResearchMetadata(),
    ).playwrightAudit).toEqual([expect.objectContaining({ kind: 'search', status: 'opened' })])
  })

  test('persists the completed synchronous Expert agent browser audit through the shared transport', async () => {
    let recorded: { agentId: string; agentType: string; entries: unknown } | undefined

    await recordFinalizedExpertAgentResearchAudit({
      agentId: 'sync-expert-agent',
      agentType: 'expert-evidence-researcher',
      playwrightAudit: [{
        target: 'https://example.com/evidence',
        kind: 'url',
        status: 'opened',
        finalUrl: 'https://example.com/evidence',
      }],
    }, 'expert-evidence-researcher', async (input) => {
      recorded = input
    })

    expect(recorded).toEqual({
      agentId: 'sync-expert-agent',
      agentType: 'expert-evidence-researcher',
      entries: [expect.objectContaining({ finalUrl: 'https://example.com/evidence' })],
    })
  })

  test('persists browser audits for expert-evidence-reviewer the same way as researchers', async () => {
    let recorded: { agentId: string; agentType: string; entries: unknown } | undefined

    await recordFinalizedExpertAgentResearchAudit({
      agentId: 'a39662dca2982113c',
      agentType: 'expert-evidence-reviewer',
      playwrightAudit: [{
        target: 'https://www.bing.com/search?q=test',
        kind: 'search',
        searchEngine: 'Bing',
        query: 'test',
        status: 'opened',
      }],
    }, 'expert-evidence-reviewer', async (input) => {
      recorded = input
    })

    expect(recorded).toEqual({
      agentId: 'a39662dca2982113c',
      agentType: 'expert-evidence-reviewer',
      entries: [expect.objectContaining({ kind: 'search', searchEngine: 'Bing' })],
    })
  })

  test('returns the Playwright audit count for an Expert evidence researcher with a concrete source', () => {
    const message = createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_browser',
          name: 'Playwright',
          input: { actions: [{ type: 'navigate', url: 'https://example.com/evidence' }, { type: 'extract' }] },
        },
        { type: 'text', text: 'Evidence ledger complete.' },
      ],
    }) as Message
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://example.com/evidence',
      steps: [{ outcome: 'success' }],
    }), 'utf8').toString('base64')
    const browserResult = createUserMessage({
      content: [{
        type: 'tool_result',
        tool_use_id: 'toolu_browser',
        content: `<playwright-action-ledger encoding="base64">${ledger}</playwright-action-ledger>`,
      }],
    }) as Message

    const result = finalizeAgentTool(
      [message, browserResult],
      'expert-researcher-with-browser',
      evidenceResearchMetadata(),
    )

    expect(result.playwrightToolUseCount).toBe(1)
    expect(result.totalToolUseCount).toBe(1)
    expect(result.playwrightAudit).toEqual([
      expect.objectContaining({ kind: 'url', status: 'opened', finalUrl: 'https://example.com/evidence' }),
    ])
  })
})

describe('runAsyncAgentLifecycle', () => {
  afterEach(() => {
    resetCommandQueue()
  })

  test('notifies the parent before post-completion cleanup finishes', async () => {
    const taskId = 'agent-notify-first'
    const abortController = new AbortController()
    const task: LocalAgentTaskState = {
      ...createTaskStateBase(taskId, 'local_agent', 'Review code', 'toolu_agent'),
      status: 'running',
      agentId: taskId,
      prompt: 'Review code',
      agentType: 'general-purpose',
      abortController,
      retrieved: false,
      lastReportedToolCount: 0,
      lastReportedTokenCount: 0,
      isBackgrounded: true,
      pendingMessages: [],
      retain: false,
      diskLoaded: false,
    }
    let appState = {
      tasks: { [taskId]: task },
      toolPermissionContext: getEmptyToolPermissionContext(),
      speculation: IDLE_SPECULATION_STATE,
    } as unknown as AppState
    const setAppState = (updater: (prev: AppState) => AppState): void => {
      appState = updater(appState)
    }
    const message = createAssistantMessage({
      content: [{ type: 'text', text: 'Review complete.' }],
    }) as Message
    let cleanupStarted = false

    async function* makeStream(): AsyncGenerator<Message, void> {
      yield message
    }

    const result = await Promise.race([
      runAsyncAgentLifecycle({
        taskId,
        abortController,
        makeStream,
        metadata: {
          prompt: 'Review code',
          resolvedAgentModel: 'test-model',
          isBuiltInAgent: true,
          startTime: Date.now(),
          agentType: 'general-purpose',
          isAsync: true,
        },
        description: 'Review code',
        toolUseContext: {
          options: { tools: [] },
          toolUseId: 'toolu_agent',
          getAppState: () => appState,
        } as unknown as ToolUseContext,
        rootSetAppState: setAppState,
        agentIdForCleanup: taskId,
        enableSummarization: false,
        getWorktreeResult: () => {
          cleanupStarted = true
          return new Promise(() => {})
        },
      }),
      new Promise(resolve => setTimeout(() => resolve('timed-out'), 50)),
    ])

    expect(result).toEqual({ status: 'succeeded' })
    expect(cleanupStarted).toBe(true)
    expect(appState.tasks[taskId]?.status).toBe('completed')
    expect(getCommandQueue()).toHaveLength(1)
    expect(String(getCommandQueue()[0]?.value)).toContain(
      '<status>completed</status>',
    )
    expect(String(getCommandQueue()[0]?.value)).toContain('Review complete.')
  })

  test('returns a failed outcome when the background agent stream fails', async () => {
    const taskId = 'agent-failure-outcome'
    const abortController = new AbortController()
    const task: LocalAgentTaskState = {
      ...createTaskStateBase(taskId, 'local_agent', 'Failing agent', 'toolu_failure'),
      status: 'running',
      agentId: taskId,
      prompt: 'Fail deliberately',
      agentType: 'general-purpose',
      abortController,
      retrieved: false,
      lastReportedToolCount: 0,
      lastReportedTokenCount: 0,
      isBackgrounded: true,
      pendingMessages: [],
      retain: false,
      diskLoaded: false,
    }
    let appState = {
      tasks: { [taskId]: task },
      toolPermissionContext: getEmptyToolPermissionContext(),
      speculation: IDLE_SPECULATION_STATE,
    } as unknown as AppState
    const setAppState = (updater: (prev: AppState) => AppState): void => {
      appState = updater(appState)
    }

    async function* makeStream(): AsyncGenerator<Message, void> {
      throw new Error('stream failed')
    }

    await expect(runAsyncAgentLifecycle({
      taskId,
      abortController,
      makeStream,
      metadata: {
        prompt: 'Fail deliberately',
        resolvedAgentModel: 'test-model',
        isBuiltInAgent: true,
        startTime: Date.now(),
        agentType: 'general-purpose',
        isAsync: true,
      },
      description: 'Failing agent',
      toolUseContext: {
        options: { tools: [] },
        toolUseId: 'toolu_failure',
        getAppState: () => appState,
      } as unknown as ToolUseContext,
      rootSetAppState: setAppState,
      agentIdForCleanup: taskId,
      enableSummarization: false,
      getWorktreeResult: async () => ({}),
    })).resolves.toEqual({ status: 'failed', reason: 'stream failed' })
    expect(appState.tasks[taskId]?.status).toBe('failed')
  })
})
