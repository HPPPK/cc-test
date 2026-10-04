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
  buildLargeToolResultMessage,
  extractMachineReadableToolResultArtifacts,
} from '../../utils/toolResultStorage.js'
import {
  appendExpertPostReviewEvidenceAbsorptionContext,
  assertFinalizedExpertResearchArtifactWrite,
  buildPlaywrightAudit,
  countToolUsesByName,
  formatPlaywrightAudit,
  finalizeAgentTool,
  isFileFirstExpertResearchArtifactAgent,
  lastWrittenMarkdownArtifactPath,
  normalizeFinalizedExpertResearchArtifactContent,
  recordFinalizedExpertAgentResearchAudit,
  recordInterruptedExpertAgentResearchAudit,
  runAsyncAgentLifecycle,
  resolveAgentTools,
  shouldSurfaceExpertEvidenceAgentFailure,
} from './agentToolUtils.js'


describe('file-first Expert artifact completion', () => {
  const policyEnv = {
    CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT: 'C:/Users/test/Desktop/0816',
    // ConversationService passes the bare policy object to the spawned CLI process.
    // Keep this fixture aligned with the Desktop runtime rather than the ZIP protocol.
    CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY: JSON.stringify({
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: [
        'commercialization-research/02-competitors.md',
        'commercialization-research/03-user-needs.md',
        'commercialization-research/04-channels.md',
      ],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
      maxCharacters: 90_000,
    }),
  } as NodeJS.ProcessEnv
  const researcherPath = 'commercialization-research/02-competitors.md'

  test('does not fail a subagent merely because no intermediate artifact handoff was observed', () => {
    const finalMessage = createAssistantMessage({
      content: [{ type: 'text', text: researcherPath }],
    }) as Message

    expect(() => assertFinalizedExpertResearchArtifactWrite(
      [finalMessage],
      'expert-evidence-researcher',
      [{ type: 'text', text: researcherPath }],
      policyEnv,
    )).not.toThrow()
  })

  test('derives the internal artifact path from a real Write instead of the free-form handoff', () => {
    const write = createAssistantMessage({
      content: [{
        type: 'tool_use',
        id: 'toolu_actual_write_path',
        name: 'Write',
        input: { file_path: researcherPath, content: '# Competitors\n- verified evidence' },
      }],
    }) as Message
    const writeResult = createUserMessage({
      content: [{ type: 'tool_result', tool_use_id: 'toolu_actual_write_path', content: 'File written.' }],
    }) as Message
    const naturalHandoff = createAssistantMessage({
      content: [{ type: 'text', text: '已写入竞品台账；官方定价页可支持免费边界，仍需补用户付费证据。' }],
    }) as Message

    expect(lastWrittenMarkdownArtifactPath([write, writeResult, naturalHandoff])).toBe(researcherPath)
  })

  test('derives the internal artifact path from a successful Edit append', () => {
    const edit = createAssistantMessage({
      content: [{
        type: 'tool_use',
        id: 'toolu_actual_edit_path',
        name: 'Edit',
        input: { file_path: researcherPath, old_string: '# Competitors', new_string: '# Competitors\n- appended evidence' },
      }],
    }) as Message
    const editResult = createUserMessage({
      content: [{ type: 'tool_result', tool_use_id: 'toolu_actual_edit_path', content: 'File updated.' }],
    }) as Message

    expect(lastWrittenMarkdownArtifactPath([edit, editResult])).toBe(researcherPath)
  })

  test('does not promote a denied Write intent into an artifact path', () => {
    const deniedWrite = createAssistantMessage({
      content: [{
        type: 'tool_use', id: 'toolu_denied_write_path', name: 'Write',
        input: { file_path: researcherPath, content: '# not saved' },
      }],
    }) as Message
    const deniedResult = createUserMessage({
      content: [{
        type: 'tool_result', tool_use_id: 'toolu_denied_write_path',
        content: 'Write denied.', is_error: true,
      }],
    }) as Message

    expect(lastWrittenMarkdownArtifactPath([deniedWrite, deniedResult])).toBeUndefined()
  })

  test('reduces a completed research handoff to one fixed Markdown receipt', () => {
    const priorPolicy = process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY
    const priorOutputRoot = process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = policyEnv.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = policyEnv.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
    try {
      const write = createAssistantMessage({
        content: [{
          type: 'tool_use',
          id: 'toolu_free_form_handoff_write',
          name: 'Write',
          input: {
            file_path: researcherPath,
            content: '# Competitors\n- verified evidence',
          },
        }],
      }) as Message
      const receipt = createUserMessage({
        content: [{
          type: 'tool_result',
          tool_use_id: 'toolu_free_form_handoff_write',
          content: 'The file was created successfully.',
        }],
      }) as Message
      const finalMessage = createAssistantMessage({
        content: [{
          type: 'text',
          text: '研究已写入。发现了可继续验证的竞品定价线索；交付物：' + researcherPath + '。建议主代理直接读取文件后继续。',
        }],
      }) as Message

      expect(finalizeAgentTool([write, receipt, finalMessage], 'research-agent-free-form', {
        prompt: 'Research the assigned competitor section.',
        resolvedAgentModel: 'test-model',
        isBuiltInAgent: true,
        startTime: Date.now(),
        agentType: 'expert-evidence-researcher',
        isAsync: true,
      }).content).toEqual([{
        type: 'text',
        text: '文件交接：02-competitors.md；状态：子代理已结束，请直接 Read 已分配 Markdown 核验。',
      }])
    } finally {
      if (priorPolicy === undefined) delete process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY
      else process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = priorPolicy
      if (priorOutputRoot === undefined) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
      else process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = priorOutputRoot
    }
  })

  test('accepts a successful scoped Write receipt without model-supplied internal artifact metadata', () => {
    const write = createAssistantMessage({
      content: [{
        type: 'tool_use',
        id: 'toolu_research_write',
        name: 'Write',
        input: {
          file_path: researcherPath,
          content: '# Competitors\n- verified evidence',
        },
      }],
    }) as Message
    const result = createUserMessage({
      content: [{
        type: 'tool_result',
        tool_use_id: 'toolu_research_write',
        content: 'The file commercialization-research/02-competitors.md has been created successfully.',
      }],
    }) as Message
    const finalMessage = createAssistantMessage({
      content: [{ type: 'text', text: researcherPath }],
    }) as Message

    expect(() => assertFinalizedExpertResearchArtifactWrite(
      [write, result, finalMessage],
      'expert-evidence-researcher',
      [{ type: 'text', text: researcherPath }],
      policyEnv,
    )).not.toThrow()
  })

  test('normalizes a file-first handoff without retaining its prose', () => {
    const write = createAssistantMessage({
      content: [{
        type: 'tool_use',
        id: 'toolu_legacy_audit_write',
        name: 'Write',
        input: { file_path: researcherPath, content: '# Competitors\n- verified evidence' },
      }],
    }) as Message
    const result = createUserMessage({
      content: [{ type: 'tool_result', tool_use_id: 'toolu_legacy_audit_write', content: 'The file was created successfully.' }],
    }) as Message
    const legacyContent = [{
      type: 'text' as const,
      text: `${researcherPath}\n<tool-audit>Playwright: 10 calls</tool-audit>`,
    }]

    expect(() => assertFinalizedExpertResearchArtifactWrite(
      [write, result],
      'expert-evidence-researcher',
      legacyContent,
      policyEnv,
    )).not.toThrow()
    expect(normalizeFinalizedExpertResearchArtifactContent(
      'expert-evidence-researcher',
      legacyContent,
      researcherPath,
    )).toEqual([{
      type: 'text',
      text: '文件交接：02-competitors.md；状态：子代理已结束，请直接 Read 已分配 Markdown 核验。',
    }])
    expect(isFileFirstExpertResearchArtifactAgent('expert-evidence-researcher', policyEnv)).toBe(true)
  })

  test('does not leak a completed research handoff beyond its fixed Markdown receipt', () => {
    const priorPolicy = process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY
    const priorOutputRoot = process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = policyEnv.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY
    process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = policyEnv.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
    try {
      const write = createAssistantMessage({
        content: [{
          type: 'tool_use',
          id: 'toolu_finalize_legacy_audit_write',
          name: 'Write',
          input: { file_path: researcherPath, content: '# Competitors\n- verified evidence' },
        }],
      }) as Message
      const receipt = createUserMessage({
        content: [{ type: 'tool_result', tool_use_id: 'toolu_finalize_legacy_audit_write', content: 'The file was created successfully.' }],
      }) as Message
      const finalMessage = createAssistantMessage({
        content: [{ type: 'text', text: `${researcherPath}\n<tool-audit>Playwright: 10 calls</tool-audit>` }],
      }) as Message

      expect(finalizeAgentTool([write, receipt, finalMessage], 'research-agent-1', {
        prompt: 'Research the assigned competitor section.',
        resolvedAgentModel: 'test-model',
        isBuiltInAgent: true,
        startTime: Date.now(),
        agentType: 'expert-evidence-researcher',
        isAsync: true,
      }).content).toEqual([{
        type: 'text',
        text: '文件交接：02-competitors.md；状态：子代理已结束，请直接 Read 已分配 Markdown 核验。',
      }])
    } finally {
      if (priorPolicy === undefined) delete process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY
      else process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = priorPolicy
      if (priorOutputRoot === undefined) delete process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
      else process.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT = priorOutputRoot
    }
  })

  test('does not reject a successful Write because the handoff includes extra prose', () => {
    const write = createAssistantMessage({
      content: [{
        type: 'tool_use',
        id: 'toolu_legacy_audit_extra_write',
        name: 'Write',
        input: { file_path: researcherPath, content: '# Competitors\n- verified evidence' },
      }],
    }) as Message
    const result = createUserMessage({
      content: [{ type: 'tool_result', tool_use_id: 'toolu_legacy_audit_extra_write', content: 'The file was created successfully.' }],
    }) as Message

    expect(() => assertFinalizedExpertResearchArtifactWrite(
      [write, result],
      'expert-evidence-researcher',
      [{
        type: 'text',
        text: `${researcherPath}\n<tool-audit>Playwright: 10 calls</tool-audit>\nExtra explanation`,
      }],
      policyEnv,
    )).not.toThrow()
  })

  test('accepts equivalent absolute Write and final paths inside the same session work directory', () => {
    const absolutePath = 'C:/Users/test/Desktop/0816/commercialization-research/02-competitors.md'
    const write = createAssistantMessage({
      content: [{
        type: 'tool_use',
        id: 'toolu_absolute_research_write',
        name: 'Write',
        input: {
          file_path: absolutePath,
          content: '# Competitors\n- verified evidence',
        },
      }],
    }) as Message
    const result = createUserMessage({
      content: [{
        type: 'tool_result',
        tool_use_id: 'toolu_absolute_research_write',
        content: 'The file was created successfully.',
      }],
    }) as Message

    expect(() => assertFinalizedExpertResearchArtifactWrite(
      [write, result],
      'expert-evidence-researcher',
      [{ type: 'text', text: researcherPath }],
      policyEnv,
    )).not.toThrow()
  })

  test('accepts only a successful scoped Write receipt from the final output reviewer', () => {
    const completionReviewPath = 'commercialization-research/08-report-completeness-review.md'
    const write = createAssistantMessage({
      content: [{
        type: 'tool_use', id: 'toolu_output_review_write', name: 'Write', input: {
          file_path: completionReviewPath,
          content: '# Rendered output completeness review\n\n## MUST_PATCH\n- Preserve a verified free-plan boundary.',
        },
      }],
    }) as Message
    const result = createUserMessage({
      content: [{ type: 'tool_result', tool_use_id: 'toolu_output_review_write', content: 'The file was created successfully.' }],
    }) as Message
    expect(() => assertFinalizedExpertResearchArtifactWrite(
      [write, result],
      'expert-evidence-output-reviewer',
      [{ type: 'text', text: completionReviewPath }],
      policyEnv,
    )).not.toThrow()
  })

  test('accepts only a successful scoped Write receipt from the report-field absorption worker', () => {
    const absorptionPath = 'commercialization-research/07-report-field-absorption.md'
    const write = createAssistantMessage({
      content: [{
        type: 'tool_use',
        id: 'toolu_absorption_write',
        name: 'Write',
        input: { file_path: absorptionPath, content: '# 字段吸收\n\n- 证据簇：可写入竞品与风险章节。' },
      }],
    }) as Message
    const result = createUserMessage({
      content: [{ type: 'tool_result', tool_use_id: 'toolu_absorption_write', content: 'The field-absorption file was created successfully.' }],
    }) as Message
    const finalMessage = createAssistantMessage({ content: [{ type: 'text', text: absorptionPath }] }) as Message

    expect(() => assertFinalizedExpertResearchArtifactWrite(
      [write, result, finalMessage],
      'expert-evidence-absorber',
      [{ type: 'text', text: absorptionPath }],
      policyEnv,
    )).not.toThrow()
  })

})

describe('Expert subagent full tool access', () => {
  test('gives every Expert subagent the complete host pool except a package-forbidden AskUserQuestion channel', () => {
    const availableTools = [
      { name: 'Playwright' },
      { name: 'Read' },
      { name: 'Write' },
      { name: 'Edit' },
      { name: 'MultiEdit' },
      { name: 'Bash' },
      { name: 'PowerShell' },
      { name: 'WebSearch' },
      { name: 'AskUserQuestion' },
      { name: 'Agent' },
      { name: 'Skill' },
      { name: 'mcp__local__research' },
    ] as never

    const resolved = resolveAgentTools({
      source: 'built-in',
      baseDir: 'built-in',
      agentType: 'expert-evidence-researcher',
      tools: ['Playwright'],
      disallowedTools: ['Edit', 'Bash', 'AskUserQuestion'],
      getSystemPrompt: () => '',
    }, availableTools, true, false, {
      CC_JIANGXIA_EXPERT_FULL_TOOL_ACCESS: '1',
      CC_JIANGXIA_EXPERT_FORBID_SUBAGENT_ASK_USER_QUESTION: '1',
    })

    expect(resolved.hasWildcard).toBe(true)
    expect(resolved.validTools).toEqual([])
    expect(resolved.resolvedTools.map((tool) => tool.name)).toEqual(
      availableTools.map((tool) => tool.name).filter((name) => name !== 'AskUserQuestion'),
    )
  })

  test('keeps AskUserQuestion in the full Expert pool when the package does not forbid it', () => {
    const availableTools = [
      { name: 'Playwright' },
      { name: 'AskUserQuestion' },
      { name: 'Write' },
    ] as never

    const resolved = resolveAgentTools({
      source: 'built-in',
      baseDir: 'built-in',
      agentType: 'general-expert-worker',
      tools: ['Playwright'],
      getSystemPrompt: () => '',
    }, availableTools, true, false, {
      CC_JIANGXIA_EXPERT_FULL_TOOL_ACCESS: '1',
    })

    expect(resolved.resolvedTools.map((tool) => tool.name)).toEqual([
      'Playwright',
      'AskUserQuestion',
      'Write',
    ])
  })
})

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
    expect(shouldSurfaceExpertEvidenceAgentFailure('expert-evidence-output-reviewer')).toBe(true)
    expect(shouldSurfaceExpertEvidenceAgentFailure('expert-evidence-absorber')).toBe(true)
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

  test('turns an interrupted source batch into terminal audits without claiming access limits', async () => {
    const messages = [
      createUserMessage({ content: [{ type: 'text', text: [
        '<expert-research-source-assignment>',
        '唯一负责产物：commercialization-research/02-competitors.md',
        '- https://example.com/',
        '- https://second.example/',
        '</expert-research-source-assignment>',
      ].join('\n') }] }) as Message,
      createAssistantMessage({ content: [{
        type: 'tool_use',
        id: 'toolu_interrupted',
        name: 'Playwright',
        input: { actions: [{ type: 'navigate', url: 'https://example.com/' }] },
      }] }) as Message,
    ]
    let persisted: any
    const recorded = await recordInterruptedExpertAgentResearchAudit({
      agentId: 'researcher-interrupted',
      agentType: 'expert-evidence-researcher',
      messages,
      reason: 'stream failed',
      recordAudit: async (input) => { persisted = input },
    })

    expect(recorded).toBe(true)
    expect(persisted).toMatchObject({
      agentId: 'researcher-interrupted',
      agentType: 'expert-evidence-researcher',
      artifactPath: 'commercialization-research/02-competitors.md',
      interrupted: true,
    })
    expect(persisted.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'https://example.com/', status: 'interrupted' }),
      expect.objectContaining({ target: 'https://second.example/', status: 'interrupted' }),
    ]))
    expect(persisted.entries).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'access_limited' }),
    ]))
  })

  test('uses the structured source assignment when interruption happens before injected context is emitted', async () => {
    let persisted: any
    const recorded = await recordInterruptedExpertAgentResearchAudit({
      agentId: 'researcher-before-context',
      agentType: 'expert-evidence-researcher',
      messages: [],
      sourceAssignment: {
        artifactPath: 'commercialization-research/03-user-needs.md',
        candidateUrls: ['https://early.example/', 'https://later.example/'],
      },
      reason: 'provider stream failed before the meta message was yielded',
      recordAudit: async (input) => { persisted = input },
    })

    expect(recorded).toBe(true)
    expect(persisted).toMatchObject({
      artifactPath: 'commercialization-research/03-user-needs.md',
      interrupted: true,
    })
    expect(persisted.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'https://early.example/', status: 'interrupted' }),
      expect.objectContaining({ target: 'https://later.example/', status: 'interrupted' }),
    ]))
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
      auditId: 'playwright:toolu_opened:0', target: 'https://zh.mweb.im/', kind: 'url', status: 'opened', finalUrl: 'https://zh.mweb.im/', actionTypes: ['navigate', 'extract'],
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
      { auditId: 'playwright:toolu_multiple_pages:0', target: 'https://store.typora.io/', kind: 'url', status: 'opened', finalUrl: 'https://store.typora.io/', actionTypes: ['navigate', 'extract'] },
      { auditId: 'playwright:toolu_multiple_pages:2', target: 'https://www.mweb.im/', kind: 'url', status: 'opened', finalUrl: 'https://www.mweb.im/', actionTypes: ['navigate', 'extract'] },
      { auditId: 'playwright:toolu_multiple_pages:4', target: 'https://github.com/MacDownApp/macdown', kind: 'url', status: 'opened', finalUrl: 'https://github.com/MacDownApp/macdown', actionTypes: ['navigate', 'extract'] },
    ])
  })

  test('keeps concrete pages opened inside a script action as auditable sources', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_script_pages', name: 'Playwright',
      input: { actions: [{ type: 'script', script: 'const page = await context.newPage(); await page.goto(\"https://example.com/one\");' }] },
    }] }) as Message
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://example.com/two',
      accessLimited: false,
      steps: [{
        index: 0,
        type: 'script',
        outcome: 'success',
        url: 'https://example.com/two',
        scriptPages: [
          { requestedUrl: 'https://example.com/one', finalUrl: 'https://example.com/one', title: 'One', status: 'opened' },
          { requestedUrl: 'https://example.com/two', finalUrl: 'https://example.com/two', title: 'Two', status: 'opened' },
        ],
      }],
    }), 'utf8').toString('base64')
    const result = createUserMessage({ content: [{
      type: 'tool_result', tool_use_id: 'toolu_script_pages',
      content: '<playwright-action-ledger encoding="base64">' + ledger + '</playwright-action-ledger>',
    }] }) as Message

    expect(buildPlaywrightAudit([toolUse, result])).toEqual([
      expect.objectContaining({ auditId: 'playwright:toolu_script_pages:0:script:0', target: 'https://example.com/one', kind: 'url', status: 'opened', finalUrl: 'https://example.com/one' }),
      expect.objectContaining({ auditId: 'playwright:toolu_script_pages:0:script:1', target: 'https://example.com/two', kind: 'url', status: 'opened', finalUrl: 'https://example.com/two' }),
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
      auditId: 'playwright:toolu_baidu:0',
      target: 'mweb',
      kind: 'search',
      searchEngine: '百度',
      query: 'mweb',
      searchUrl: 'https://www.baidu.com/s?wd=mweb',
      searchResultStatus: 'access_limited',
      status: 'access_limited',
      finalUrl: 'https://www.baidu.com/s?wd=mweb',
      actionTypes: ['navigate', 'extract'],
      detail: 'Baidu CAPTCHA',
    }])
    expect(formatPlaywrightAudit(audit)).toContain('access_limited: query "mweb" [engine=百度]')
  })

  test('treats a transient Google sorry interstitial that ends on a normal SERP as opened', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use',
      id: 'toolu_google_transient_sorry',
      name: 'Playwright',
      input: { actions: [
        { type: 'press', key: 'Enter' },
        { type: 'wait_for_load_state', state: 'domcontentloaded' },
        { type: 'extract', selector: 'body' },
      ] },
    }] }) as Message
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://www.google.com/search?q=AI+old+photo+restoration',
      accessLimited: false,
      verificationHistory: [{
        stepIndex: 0,
        url: 'https://www.google.com/sorry/index?continue=https://www.google.com/search%3Fq%3DAI%2Bold%2Bphoto%2Brestoration',
        detail: 'Google security verification',
      }],
      steps: [
        { index: 0, type: 'press', outcome: 'success', url: 'https://www.google.com/sorry/index?continue=https://www.google.com/search%3Fq%3DAI%2Bold%2Bphoto%2Brestoration' },
        { index: 1, type: 'wait_for_load_state', outcome: 'success', url: 'https://www.google.com/search?q=AI+old+photo+restoration' },
        { index: 2, type: 'extract', outcome: 'success', url: 'https://www.google.com/search?q=AI+old+photo+restoration' },
      ],
    }), 'utf8').toString('base64')
    const result = createUserMessage({ content: [{
      type: 'tool_result',
      tool_use_id: 'toolu_google_transient_sorry',
      content: '<playwright-action-ledger encoding="base64">' + ledger + '</playwright-action-ledger>',
    }] }) as Message

    expect(buildPlaywrightAudit([toolUse, result])).toEqual([expect.objectContaining({
      target: 'AI old photo restoration',
      kind: 'search',
      searchResultStatus: 'results_observed',
      status: 'opened',
      finalUrl: 'https://www.google.com/search?q=AI+old+photo+restoration',
    })])
  })

  test('records only minimal managed-browser diagnostics for a final access-limited SERP', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use',
      id: 'playwright-limited-diagnostics',
      name: 'Playwright',
      input: { actions: [{ type: 'navigate', url: 'https://www.baidu.com/s?wd=mac+markdown' }] },
    }] })
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://wappass.baidu.com/static/captcha',
      accessLimited: true,
      accessDiagnostics: {
        connectionKind: 'managed',
        searchEngine: '百度',
        observedAt: '2026-08-13T10:00:00.000Z',
        pacingWaitedMs: 3000,
        verificationKind: 'slider CAPTCHA',
      },
    }), 'utf8').toString('base64')
    const result = createUserMessage({ content: [{
      type: 'tool_result',
      tool_use_id: 'playwright-limited-diagnostics',
      content: '<playwright-action-ledger encoding="base64">' + ledger + '</playwright-action-ledger>',
    }] })

    const audit = buildPlaywrightAudit([toolUse, result])
    expect(audit).toEqual([expect.objectContaining({
      status: 'access_limited',
      accessDiagnostics: expect.objectContaining({
        connectionKind: 'managed',
        searchEngine: '百度',
        pacingWaitedMs: 3000,
      }),
    })])
    expect(formatPlaywrightAudit(audit)).toContain('[browser=managed; engine=百度; pacingWaitedMs=3000; verification=slider CAPTCHA]')
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

  test('retains an access-limited verification entry while the explicit fallback page remains opened', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_bing_fallback', name: 'Playwright',
      input: { actions: [
        { type: 'navigate', url: 'https://www.bing.com/search?q=restore+old+family+photos' },
        { type: 'navigate', url: 'https://www.reddit.com/r/estoration/' },
      ] },
    }] }) as Message
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://www.reddit.com/r/estoration/',
      accessLimited: false,
      verificationHistory: [{
        stepIndex: 0,
        url: 'https://www.bing.com/verify?challenge=1',
        detail: 'EXPERT_HUMAN_VERIFICATION_REQUIRED: Bing security verification',
      }],
      steps: [
        { index: 0, type: 'navigate', outcome: 'success', url: 'https://www.bing.com/verify?challenge=1' },
        { index: 1, type: 'navigate', outcome: 'success', url: 'https://www.reddit.com/r/estoration/' },
      ],
    }), 'utf8').toString('base64')
    const result = createUserMessage({ content: [{
      type: 'tool_result', tool_use_id: 'toolu_bing_fallback',
      content: `<playwright-action-ledger encoding="base64">${ledger}</playwright-action-ledger>`,
    }] }) as Message

    expect(buildPlaywrightAudit([toolUse, result])).toEqual([
      expect.objectContaining({
        query: 'restore old family photos',
        searchEngine: 'Bing',
        status: 'access_limited',
        finalUrl: 'https://www.bing.com/verify?challenge=1',
      }),
      expect.objectContaining({
        target: 'https://www.reddit.com/r/estoration/',
        kind: 'url',
        status: 'opened',
        finalUrl: 'https://www.reddit.com/r/estoration/',
      }),
    ])
  })

  test('keeps the original verification URL when the runtime injects a successful fallback navigation', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_bing_runtime_fallback', name: 'Playwright',
      input: { actions: [
        { type: 'navigate', url: 'https://www.bing.com/search?q=restore+old+family+photos' },
        { type: 'wait', ms: 1000 },
        { type: 'extract', selector: 'body' },
      ] },
    }] }) as Message
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://www.so.com/s?q=restore%20old%20family%20photos',
      accessLimited: false,
      verificationHistory: [{
        stepIndex: 0,
        url: 'https://www.bing.com/search?q=restore+old+family+photos',
        detail: 'EXPERT_HUMAN_VERIFICATION_REQUIRED: Bing security verification',
      }],
      steps: [
        { index: 0, type: 'navigate', outcome: 'success', url: 'https://www.bing.com/search?q=restore+old+family+photos' },
        { index: 1, type: 'navigate', outcome: 'success', url: 'https://www.so.com/s?q=restore%20old%20family%20photos' },
        { index: 2, type: 'wait_for_load_state', outcome: 'success', url: 'https://www.so.com/s?q=restore%20old%20family%20photos' },
        { index: 3, type: 'extract', outcome: 'success', url: 'https://www.so.com/s?q=restore%20old%20family%20photos' },
      ],
    }), 'utf8').toString('base64')
    const result = createUserMessage({ content: [{
      type: 'tool_result',
      tool_use_id: 'toolu_bing_runtime_fallback',
      content: `<playwright-action-ledger encoding="base64">${ledger}</playwright-action-ledger>`,
    }] }) as Message

    expect(buildPlaywrightAudit([toolUse, result])).toEqual([expect.objectContaining({
      kind: 'search',
      searchEngine: 'Bing',
      query: 'restore old family photos',
      status: 'access_limited',
      finalUrl: 'https://www.bing.com/search?q=restore+old+family+photos',
    })])
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
    let recorded: { agentId: string; agentType: string; entries: unknown; artifactPath?: unknown; content?: unknown; completed?: boolean } | undefined

    await recordFinalizedExpertAgentResearchAudit({
      agentId: 'sync-expert-agent',
      agentType: 'expert-evidence-researcher',
      artifactPath: 'commercialization-research/02-competitors.md',
      content: [{ type: 'text', text: 'Research handoff content that must not be persisted as a handoff.' }],
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
      artifactPath: 'commercialization-research/02-competitors.md',
      content: '文件交接：02-competitors.md；状态：子代理已结束，请直接 Read 已分配 Markdown 核验。',
      completed: true,
      entries: [expect.objectContaining({ finalUrl: 'https://example.com/evidence' })],
    })
  })

  test('persists browser audits for expert-evidence-reviewer the same way as researchers', async () => {
    let recorded: { agentId: string; agentType: string; entries: unknown; artifactPath?: unknown; content?: unknown; completed?: boolean } | undefined

    await recordFinalizedExpertAgentResearchAudit({
      agentId: 'a39662dca2982113c',
      agentType: 'expert-evidence-reviewer',
      artifactPath: 'commercialization-research/05-evidence-review.md',
      content: [{ type: 'text', text: 'Reviewer handoff content that must not be persisted as a handoff.' }],
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
      artifactPath: 'commercialization-research/05-evidence-review.md',
      content: '文件交接：05-evidence-review.md；状态：子代理已结束，请直接 Read 已分配 Markdown 核验。',
      entries: [expect.objectContaining({ kind: 'search', searchEngine: 'Bing' })],
    })
  })


  test('uses a retained ledger when a large Playwright result was compacted', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_compacted_google', name: 'Playwright',
      input: {
        actions: [
          { type: 'navigate', url: 'https://www.google.com/' },
          { type: 'fill', selector: 'textarea[name=q]', text: 'Quicker Windows automation download' },
          { type: 'press', key: 'Enter' },
          { type: 'wait' },
          { type: 'extract', selector: 'body' },
        ],
      },
    }] }) as Message
    const searchUrl = 'https://www.google.com/search?q=Quicker+Windows+automation+download'
    const ledger = Buffer.from(JSON.stringify({
      url: searchUrl,
      accessLimited: false,
      steps: [
        { index: 0, type: 'navigate', outcome: 'success', url: 'https://www.google.com/' },
        { index: 1, type: 'fill', outcome: 'success', url: 'https://www.google.com/' },
        { index: 2, type: 'press', outcome: 'success', url: searchUrl },
        { index: 3, type: 'wait', outcome: 'success', url: searchUrl },
        { index: 4, type: 'extract', outcome: 'success', url: searchUrl },
      ],
    }), 'utf8').toString('base64')
    const artifact = `<playwright-action-ledger encoding="base64">${ledger}</playwright-action-ledger>`
    const rawResult = `Playwright result\n${artifact}\n${'large page body '.repeat(3000)}`
    const result = createUserMessage({ content: [{
      type: 'tool_result',
      tool_use_id: 'toolu_compacted_google',
      content: buildLargeToolResultMessage({
        filepath: 'C:/session/tool-results/call_google.txt',
        originalSize: rawResult.length,
        isJson: false,
        preview: rawResult.slice(0, rawResult.indexOf('</playwright-action-ledger>')),
        hasMore: true,
        machineReadableArtifacts: extractMachineReadableToolResultArtifacts(rawResult),
      }),
    }] }) as Message

    expect(buildPlaywrightAudit([toolUse, result])[0]).toMatchObject({
      status: 'opened',
      searchEngine: 'Google',
      searchResultStatus: 'results_observed',
      finalUrl: searchUrl,
    })
  })

  test('records a Google homepage as an entry rather than a keyword-result SERP', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_google_home', name: 'Playwright',
      input: { actions: [{ type: 'navigate', url: 'https://www.google.com.hk/' }, { type: 'fill', selector: 'textarea[name=q]', text: 'markdown reader' }] },
    }] }) as Message
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://www.google.com.hk/',
      steps: [{ index: 0, type: 'navigate', outcome: 'success', url: 'https://www.google.com.hk/' }],
    }), 'utf8').toString('base64')
    const result = createUserMessage({ content: [{
      type: 'tool_result', tool_use_id: 'toolu_google_home',
      content: `<playwright-action-ledger encoding="base64">${ledger}</playwright-action-ledger>`,
    }] }) as Message

    expect(buildPlaywrightAudit([toolUse, result])).toEqual([
      expect.objectContaining({
        auditId: 'playwright:toolu_google_home:0',
        kind: 'search',
        searchEngine: 'Google',
        searchResultStatus: 'entry_opened',
        status: 'opened',
      }),
    ])
  })

  test('records a real Bing query URL as an observed keyword-result SERP', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_bing_results', name: 'Playwright',
      input: { actions: [{ type: 'navigate', url: 'https://www.bing.com/search?q=markdown+reader' }] },
    }] }) as Message
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://www.bing.com/search?q=markdown+reader',
      steps: [{ index: 0, type: 'navigate', outcome: 'success', url: 'https://www.bing.com/search?q=markdown+reader' }],
    }), 'utf8').toString('base64')
    const result = createUserMessage({ content: [{
      type: 'tool_result', tool_use_id: 'toolu_bing_results',
      content: `<playwright-action-ledger encoding="base64">${ledger}</playwright-action-ledger>`,
    }] }) as Message

    expect(buildPlaywrightAudit([toolUse, result])[0]).toMatchObject({ searchResultStatus: 'results_observed', status: 'opened' })
  })

  test('records the post-submit SERP instead of the search engine homepage', () => {
    const toolUse = createAssistantMessage({ content: [{
      type: 'tool_use', id: 'toolu_bing_home_then_search', name: 'Playwright',
      input: {
        actions: [
          { type: 'navigate', url: 'https://www.bing.com/' },
          { type: 'fill', selector: 'textarea[name=q]', text: 'mouse launcher Quicker' },
          { type: 'press', key: 'Enter' },
          { type: 'wait', ms: 500 },
          { type: 'extract', selector: 'body' },
        ],
      },
    }] }) as Message
    const searchUrl = 'https://www.bing.com/search?q=mouse+launcher+Quicker'
    const ledger = Buffer.from(JSON.stringify({
      url: searchUrl,
      accessLimited: false,
      steps: [
        { index: 0, type: 'navigate', outcome: 'success', url: 'https://www.bing.com/' },
        { index: 1, type: 'fill', outcome: 'success', url: 'https://www.bing.com/' },
        { index: 2, type: 'press', outcome: 'success', url: searchUrl },
        { index: 3, type: 'wait', outcome: 'success', url: searchUrl },
        { index: 4, type: 'extract', outcome: 'success', url: searchUrl },
      ],
    }), 'utf8').toString('base64')
    const result = createUserMessage({ content: [{
      type: 'tool_result', tool_use_id: 'toolu_bing_home_then_search',
      content: `<playwright-action-ledger encoding="base64">${ledger}</playwright-action-ledger>`,
    }] }) as Message

    expect(buildPlaywrightAudit([toolUse, result])[0]).toMatchObject({
      target: 'mouse launcher Quicker',
      kind: 'search',
      searchEngine: 'Bing',
      finalUrl: searchUrl,
      searchResultStatus: 'results_observed',
      status: 'opened',
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

  test('fails the agent before completion when its final message violates the Reviewer contract', async () => {
    const taskId = 'agent-invalid-review-receipt'
    const abortController = new AbortController()
    const task: LocalAgentTaskState = {
      ...createTaskStateBase(taskId, 'local_agent', 'Review code', 'toolu_invalid_review'),
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
      content: [{ type: 'text', text: 'Looks good, but no structured workflowReview receipt.' }],
    }) as Message

    async function* makeStream(): AsyncGenerator<Message, void> {
      yield message
    }

    const result = await runAsyncAgentLifecycle({
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
        toolUseId: 'toolu_invalid_review',
        getAppState: () => appState,
      } as unknown as ToolUseContext,
      rootSetAppState: setAppState,
      agentIdForCleanup: taskId,
      enableSummarization: false,
      getWorktreeResult: async () => ({}),
      validateFinalMessage: () => 'WORKFLOW_DEVELOPMENT_REVIEW_RESULT_INVALID: missing workflowReview',
    })

    expect(result).toEqual({
      status: 'failed',
      reason: 'WORKFLOW_DEVELOPMENT_REVIEW_RESULT_INVALID: missing workflowReview',
    })
    expect(appState.tasks[taskId]?.status).toBe('failed')
    expect(getCommandQueue()).toHaveLength(1)
    expect(String(getCommandQueue()[0]?.value)).toContain('<status>failed</status>')
    expect(String(getCommandQueue()[0]?.value)).not.toContain('<status>completed</status>')
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

describe('post-review evidence absorption handoff', () => {
  test('never appends a server instruction to a file-first Expert completion receipt', () => {
    const fileFirst = {
      agentType: 'expert-evidence-reviewer',
      content: [{ type: 'text' as const, text: '文件交接：05-evidence-review.md；状态：子代理已结束，请直接 Read 已分配 Markdown 核验。' }],
    }
    appendExpertPostReviewEvidenceAbsorptionContext(fileFirst, '<expert-post-review-evidence-absorption>\nledger\n</expert-post-review-evidence-absorption>')
    expect(fileFirst.content).toHaveLength(1)
    expect(fileFirst.content[0]?.text).not.toContain('ledger')

    const normal = { agentType: 'general-purpose', content: [{ type: 'text' as const, text: 'Normal agent result.' }] }
    appendExpertPostReviewEvidenceAbsorptionContext(normal, '<expert-post-review-evidence-absorption>\nledger\n</expert-post-review-evidence-absorption>')
    expect(normal.content.map((block) => block.text).join('\n')).toContain('ledger')
  })
})

test('records shared verification zero-step requests as interrupted rather than target access limits', () => {
  const ledger = { url: 'https://gitee.com/', steps: [], accessLimited: true, sharedHumanVerificationBlocked: true, verificationGateId: 'weibo-gate', error: 'EXPERT_HUMAN_VERIFICATION_HANDOFF_FAILED: The operation timed out.' }
  const messages = [createAssistantMessage({ content: [{ type: 'tool_use', id: 'blocked-call', name: 'Playwright', input: { actions: [{ type: 'navigate', url: 'https://gitee.com/' }] } }] }), createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'blocked-call', content: '<playwright-action-ledger encoding="base64">' + Buffer.from(JSON.stringify(ledger)).toString('base64') + '</playwright-action-ledger>' }] })]
  expect(buildPlaywrightAudit(messages)).toMatchObject([{ target: 'https://gitee.com/', status: 'interrupted', detail: expect.stringContaining('未执行') }])
  expect(buildPlaywrightAudit(messages)[0]?.finalUrl).toBeUndefined()
})


test('researcher prompt agrees with bounded runtime recovery and file-only handoff', async () => {
  const { EXPERT_EVIDENCE_RESEARCH_AGENT } = await import('./built-in/expertEvidenceResearchAgent.js')
  const prompt = await EXPERT_EVIDENCE_RESEARCH_AGENT.getSystemPrompt({} as never)
  expect(prompt).toContain('one targeted retry')
  expect(prompt).toContain('two-minute wait budget')
  expect(prompt).toContain('Markdown is the only research handoff')
  expect(prompt).not.toContain('or delivery blocker is created')
})


test('research worker prompt distinguishes targeted evidence from assigned source batches', async () => {
  const { EXPERT_EVIDENCE_RESEARCH_AGENT } = await import('./built-in/expertEvidenceResearchAgent.js')
  const prompt = await EXPERT_EVIDENCE_RESEARCH_AGENT.getSystemPrompt({} as never)
  expect(prompt).toContain('<expert-targeted-evidence-task>')
  expect(prompt).toContain('Required routes explicitly included in this task')
  expect(prompt).not.toContain('For every Route assigned to your Markdown')
  expect(prompt).toContain('does not bypass review gates')
  expect(prompt).toContain('<expert-research-source-assignment>')
})


describe('observed non-navigation Playwright evidence', () => {
  function observed(actions: unknown[], ledger: unknown) {
    return buildPlaywrightAudit([
      createAssistantMessage({ content: [{ type: 'tool_use', id: 'observed-call', name: 'Playwright', input: { actions } }] }) as Message,
      createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'observed-call', content: '<playwright-action-ledger encoding="base64">' + Buffer.from(JSON.stringify(ledger)).toString('base64') + '</playwright-action-ledger>' }] }) as Message,
    ])
  }
  test('separate extract retains its observed concrete page and successful action', () => {
    expect(observed([{ type: 'extract' }], { url: 'https://www.bilibili.com/video/BV123/', steps: [{ index: 0, type: 'extract', outcome: 'success', url: 'https://www.bilibili.com/video/BV123/' }] })).toContainEqual(expect.objectContaining({ kind: 'url', actionTypes: ['extract'], finalUrl: 'https://www.bilibili.com/video/BV123/' }))
  })
  test('typed query uses actual final search results rather than generic sequence', () => {
    expect(observed([{ type: 'fill' }, { type: 'press' }, { type: 'extract' }], { url: 'https://www.google.com/search?q=Quicker', steps: [{ index: 0, type: 'fill', outcome: 'success', url: 'https://www.google.com/' }, { index: 1, type: 'press', outcome: 'success', url: 'https://www.google.com/search?q=Quicker' }, { index: 2, type: 'extract', outcome: 'success', url: 'https://www.google.com/search?q=Quicker' }] })).toContainEqual(expect.objectContaining({ kind: 'search', query: 'Quicker', searchResultStatus: 'results_observed', actionTypes: expect.arrayContaining(['extract']) }))
  })
  test('script final body surfaced to the model is extraction proof only for that page', () => {
    const entries = observed([{ type: 'script' }], { url: 'https://www.youtube.com/watch?v=two', textExtracted: true, steps: [{ index: 0, type: 'script', outcome: 'success', url: 'https://www.youtube.com/watch?v=two', scriptPages: [{ requestedUrl: 'https://www.youtube.com/watch?v=one', finalUrl: 'https://www.youtube.com/watch?v=one', status: 'opened' }, { requestedUrl: 'https://www.youtube.com/watch?v=two', finalUrl: 'https://www.youtube.com/watch?v=two', status: 'opened' }] }] })
    expect(entries[0]?.actionTypes).not.toContain('extract')
    expect(entries[1]?.actionTypes).toContain('extract')
  })
  test('a later failed page does not erase extraction of an earlier successful page', () => {
    const entries = observed([{ type: 'navigate', url: 'https://example.com/first' }, { type: 'extract' }, { type: 'navigate', url: 'https://example.com/second' }], { url: 'https://example.com/second', error: 'second navigation failed', steps: [
      { index: 0, type: 'navigate', outcome: 'success', url: 'https://example.com/first' },
      { index: 1, type: 'extract', outcome: 'success', url: 'https://example.com/first' },
      { index: 2, type: 'navigate', outcome: 'failed', url: 'https://example.com/second' },
    ] })
    expect(entries[0]).toMatchObject({ status: 'opened', finalUrl: 'https://example.com/first', actionTypes: ['navigate', 'extract'] })
    expect(entries[1]?.status).toBe('failed')
  })
  test('an extract requested after a failed action is not counted as executed', () => {
    const entries = observed([{ type: 'navigate', url: 'https://example.com/post' }, { type: 'extract' }], { url: 'https://example.com/post', error: 'navigation failed', steps: [{ index: 0, type: 'navigate', outcome: 'failed', url: 'https://example.com/post' }] })
    expect(entries[0]?.actionTypes ?? []).not.toContain('extract')
  })
})


test('a legacy general-purpose final research receipt preserves its terminal signal and browser evidence', async () => {
  const calls: unknown[] = []
  await recordFinalizedExpertAgentResearchAudit({
    agentId: 'legacy-researcher', agentType: 'general-purpose', artifactPath: 'commercialization-research/03-user-needs.md',
    content: [{ type: 'text', text: '已写入' }], playwrightAudit: [{ target: 'https://www.v2ex.com/t/1171074', status: 'opened', kind: 'url' }],
  }, 'general-purpose', async (input) => { calls.push(input) }, async () => undefined)
  expect(calls).toEqual([expect.objectContaining({ completed: true, artifactPath: 'commercialization-research/03-user-needs.md', entries: [expect.objectContaining({ target: 'https://www.v2ex.com/t/1171074' })] })])
})
