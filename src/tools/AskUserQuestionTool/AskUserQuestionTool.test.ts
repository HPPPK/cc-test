import { describe, expect, test } from 'bun:test'
import type { Tool } from '../../Tool.js'
import { zodToJsonSchema } from '../../utils/zodToJsonSchema.js'

async function loadTool(): Promise<Tool> {
  const mod = await import('./AskUserQuestionTool.js') as { AskUserQuestionTool?: Tool }
  if (!mod.AskUserQuestionTool) throw new Error('AskUserQuestionTool export is required')
  return mod.AskUserQuestionTool
}

describe('AskUserQuestionTool workflow contract', () => {
  test('requires the top-level questions array so malformed calls remain retryable tool errors', async () => {
    const tool = await loadTool()
    expect(tool.inputSchema.safeParse({}).success).toBe(false)
  })

  test('explains how to correct a missing-choice question card without treating free-form input as a card', async () => {
    const tool = await loadTool()
    const parsed = tool.inputSchema.safeParse({
      questions: [{ prompt: 'Describe the product capability in one sentence.' }],
    })

    expect(parsed.success).toBe(false)
    if (parsed.success) throw new Error('Question without choices must be rejected')
    expect(parsed.error.issues.some((issue) => issue.message.includes('Question card requires 2–4 choices'))).toBe(true)
    expect(parsed.error.issues.some((issue) => issue.message.includes('Keep the user interaction in AskUserQuestion'))).toBe(true)
    expect(parsed.error.issues.some((issue) => issue.message.includes('retry with 2–4 useful choices'))).toBe(true)
  })

  test('accepts a legacy top-level multiSelect flag without breaking the provider-facing schema', async () => {
    const tool = await loadTool()
    const parsed = tool.inputSchema.safeParse({
      multiSelect: true,
      questions: [{
        id: 'verification',
        prompt: 'How should verification continue?',
        choices: [{ id: 'continue', label: 'Continue' }, { id: 'skip', label: 'Skip' }],
      }],
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.multiSelect).toBe(true)
    expect(parsed.data.questions[0]?.multiSelect).toBeUndefined()

    const jsonSchema = zodToJsonSchema(tool.inputSchema)
    expect(jsonSchema.type).toBe('object')
    expect(Object.prototype.hasOwnProperty.call(jsonSchema.properties ?? {}, 'multiSelect')).toBe(true)
  })

  test('accepts a legacy root header so a cosmetic label cannot force the model to retry the same question', async () => {
    const tool = await loadTool()
    const parsed = tool.inputSchema.safeParse({
      header: 'Research focus',
      questions: [{
        id: 'research-object',
        prompt: 'Which research object should we analyze?',
        choices: [{ id: 'new-product', label: 'New product' }, { id: 'existing-product', label: 'Existing product' }],
      }],
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.header).toBe('Research focus')

    const jsonSchema = zodToJsonSchema(tool.inputSchema)
    expect(Object.prototype.hasOwnProperty.call(jsonSchema.properties ?? {}, 'header')).toBe(true)
  })

  test('accepts explicit workflow completion blocking semantics without adding a new tool', async () => {
    const tool = await loadTool()
    expect(tool.inputSchema.safeParse({
      questions: [{
        id: 'status-preference',
        prompt: 'How much status detail would you like?',
        blocksCompletion: false,
        choices: [{ id: 'brief', label: 'Brief summary' }, { id: 'detailed', label: 'Detailed summary' }],
      }],
    }).success).toBe(true)
  })

  test('accepts blank optional workflow context for a non-blocking question instead of rejecting the whole card', async () => {
    const tool = await loadTool()
    const parsed = tool.inputSchema.safeParse({
      questions: [{
        id: 'market-scope',
        prompt: 'Which markets should the research cover?',
        blocksCompletion: false,
        blockingReason: '',
        answerImpact: '   ',
        choices: [{ id: 'china', label: 'China' }, { id: 'global', label: 'Global' }],
      }],
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.questions[0]?.blockingReason).toBe('')
    expect(parsed.data.questions[0]?.answerImpact).toBe('   ')
  })

  test('accepts the optional context required by necessary workflow questions', async () => {
    const tool = await loadTool()
    expect(tool.inputSchema.safeParse({
      questions: [{
        prompt: 'Which existing integration should the fix preserve?',
        blocksCompletion: true,
        blockingReason: 'The request and repository do not identify which external integration is in production.',
        answerImpact: 'The answer determines the compatibility branch and regression scenario for the fix.',
        choices: [{ label: 'Integration A' }, { label: 'Integration B' }],
      }],
    }).success).toBe(true)
  })

  test('requires a complete blocking contract in both validation and the provider-facing schema', async () => {
    const tool = await loadTool()
    const incomplete = tool.inputSchema.safeParse({
      questions: [{
        prompt: 'Which compatibility contract must this change preserve?',
        blocksCompletion: true,
        choices: [{ label: 'Contract A' }, { label: 'Contract B' }],
      }],
    })

    expect(incomplete.success).toBe(false)

    const jsonSchema = JSON.stringify(zodToJsonSchema(tool.inputSchema))
    expect(jsonSchema).toContain('"required":["blocksCompletion","blockingReason","answerImpact"]')
    expect(jsonSchema).toContain('"const":true')
    expect(jsonSchema).toContain('"const":false')
  })

  test('rejects workflow commands in question options so Ask can only return an answer to the current phase', async () => {
    const tool = await loadTool()
    const base = {
      questions: [{
        id: 'confirm-next-action',
        prompt: 'What should be adjusted?',
        choices: [{ id: 'adjust', label: 'Adjust current work' }, { id: 'continue', label: 'Continue current work' }],
      }],
    }
    expect(tool.inputSchema.safeParse(base).success).toBe(true)
    expect(tool.inputSchema.safeParse({
      ...base,
      questions: [{
        ...base.questions[0],
        choices: [{ id: 'illegal-route', label: 'Go next', action: 'advance_phase' }, base.questions[0].choices[1]],
      }],
    }).success).toBe(false)
    expect(tool.inputSchema.safeParse({
      ...base,
      questions: [{
        ...base.questions[0],
        choices: [{ id: 'illegal-jump', label: 'Jump', targetPhaseId: 'delegate-implement' }, base.questions[0].choices[1]],
      }],
    }).success).toBe(false)
  })

  test('preserves question-scoped delivery metadata from the provider payload', async () => {
    const tool = await loadTool()
    const parsed = tool.inputSchema.safeParse({
      questions: [{
        id: 'research-delivery:commercialization-report',
        prompt: '当前范围是否可以交付？',
        choices: [{ id: 'accept_current_scope', label: '按当前范围交付' }, { id: 'continue', label: '继续补充' }],
        metadata: {
          question_id: 'research-delivery:commercialization-report',
          unresolved_evidence: ['Google needs a user verification retry'],
        },
      }],
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) throw new Error('Question-scoped metadata should remain available')
    expect(parsed.data.questions[0].metadata).toEqual({
      question_id: 'research-delivery:commercialization-report',
      unresolved_evidence: ['Google needs a user verification retry'],
    })
  })
  test('retains ordinary legacy question/options calls without workflow actions', async () => {
    const tool = await loadTool()
    expect(tool.inputSchema.safeParse({
      questions: [{ question: 'Continue?', options: [{ label: 'Yes' }, { label: 'No' }] }],
    }).success).toBe(true)
  })

  test('normalizes an invalid formal research-delivery card before it is shown to the user', async () => {
    const previousPolicy = process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY = '{"questionId":"research-delivery:commercialization-report","acceptedChoiceId":"accept_current_scope","continueChoiceIds":["provide_material_and_continue"],"pauseChoiceIds":["pause_research"]}'
    try {
      const tool = await loadTool()
      await expect(tool.checkPermissions({
        questions: [{
          id: 'delivery_confirm_markdown_reader',
          prompt: 'Can the current report be delivered?',
          choices: [
            { id: 'deliver_accept', label: 'Deliver now' },
            { id: 'continue', label: 'Continue research' },
          ],
        }],
        metadata: {
          expert_research_delivery: { question_id: 'delivery_confirm_markdown_reader' },
        },
      })).resolves.toMatchObject({
        behavior: 'ask',
        updatedInput: expect.objectContaining({
          metadata: expect.objectContaining({
            expert_research_delivery: expect.objectContaining({ question_id: 'research-delivery:commercialization-report' }),
          }),
          questions: [expect.objectContaining({
            id: 'research-delivery:commercialization-report',
            choices: [
              expect.objectContaining({ id: 'accept_current_scope' }),
              expect.objectContaining({ id: 'provide_material_and_continue' }),
              expect.objectContaining({ id: 'pause_research' }),
            ],
          })],
        }),
      })
    } finally {
      if (previousPolicy === undefined) delete process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
      else process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY = previousPolicy
    }
  })

  test('allows the exact package-scoped formal research-delivery contract', async () => {
    const previousPolicy = process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY = '{"questionId":"research-delivery:commercialization-report","acceptedChoiceId":"accept_current_scope","continueChoiceIds":["provide_material_and_continue"],"pauseChoiceIds":["pause_research"]}'
    try {
      const tool = await loadTool()
      await expect(tool.checkPermissions({
        questions: [{
          id: 'research-delivery:commercialization-report',
          prompt: 'Can the current report be delivered?',
          choices: [
            { id: 'accept_current_scope', label: 'Deliver now' },
            { id: 'provide_material_and_continue', label: 'Provide material' },
            { id: 'pause_research', label: 'Pause' },
          ],
          metadata: { question_id: 'research-delivery:commercialization-report' },
        }],
        metadata: {
          expert_research_delivery: { question_id: 'research-delivery:commercialization-report' },
        },
      })).resolves.toMatchObject({ behavior: 'ask' })
    } finally {
      if (previousPolicy === undefined) delete process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
      else process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY = previousPolicy
    }
  })

  test('normalizes an unmarked evidence-gap delivery card before it consumes a user response', async () => {
    const previousPolicy = process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY = '{"questionId":"research-delivery:commercialization-report","acceptedChoiceId":"accept_current_scope","continueChoiceIds":["provide_material_and_continue"],"pauseChoiceIds":["pause_research"]}'
    try {
      const tool = await loadTool()
      await expect(tool.checkPermissions({
        questions: [{
          id: 'evidence_gap_delivery',
          prompt: '是否保留证据缺口并交付当前范围报告？',
          choices: [
            { id: 'accept_gap', label: '保留证据缺口，交付当前范围报告' },
            { id: 'provide_material', label: '先补充材料' },
            { id: 'pause', label: '暂停输出' },
          ],
        }],
      })).resolves.toMatchObject({
        behavior: 'ask',
        updatedInput: expect.objectContaining({
          metadata: expect.objectContaining({
            expert_research_delivery: expect.objectContaining({ question_id: 'research-delivery:commercialization-report' }),
          }),
          questions: [expect.objectContaining({
            id: 'research-delivery:commercialization-report',
            choices: [
              expect.objectContaining({ id: 'accept_current_scope' }),
              expect.objectContaining({ id: 'provide_material_and_continue' }),
              expect.objectContaining({ id: 'pause_research' }),
            ],
          })],
        }),
      })
    } finally {
      if (previousPolicy === undefined) delete process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
      else process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY = previousPolicy
    }
  })

  test('syncs legacy delivery IDs with the canonical ZIP contract after the user answers the displayed card', async () => {
    const previousPolicy = process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
    const previousSessionId = process.env.CC_JIANGXIA_EXPERT_SESSION_ID
    const previousServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY = JSON.stringify({
      questionId: 'research-delivery:commercialization-report',
      acceptedChoiceId: 'accept_current_scope',
      continueChoiceIds: ['provide_material_and_continue'],
      pauseChoiceIds: ['pause_research'],
    })
    process.env.CC_JIANGXIA_EXPERT_SESSION_ID = 'expert-session'
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456'
    const originalFetch = globalThis.fetch
    let request: RequestInit | undefined
    globalThis.fetch = async (_url, init) => {
      request = init
      return new Response('{}', { status: 200 })
    }
    try {
      const tool = await loadTool()
      await tool.call({
        questions: [{
          id: 'research_delivery',
          prompt: '是否接受当前证据范围并生成报告？',
          choices: [
            { id: 'deliver_now', label: '接受当前范围（推荐）' },
            { id: 'bring_material', label: '补充材料后继续' },
            { id: 'pause_here', label: '暂缓报告' },
          ],
        }],
        answers: { research_delivery: '接受当前范围（推荐）' },
        answerChoiceIds: { research_delivery: ['deliver_now'] },
        metadata: { expert_research_delivery: { question_id: 'research_delivery' } },
      })
      expect(JSON.parse(String(request?.body))).toMatchObject({
        questionId: 'research-delivery:commercialization-report',
        choiceIds: ['accept_current_scope'],
      })
    } finally {
      globalThis.fetch = originalFetch
      if (previousPolicy === undefined) delete process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
      else process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY = previousPolicy
      if (previousSessionId === undefined) delete process.env.CC_JIANGXIA_EXPERT_SESSION_ID
      else process.env.CC_JIANGXIA_EXPERT_SESSION_ID = previousSessionId
      if (previousServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
      else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = previousServerUrl
    }
  })

  test('blocks model-generated CAPTCHA Ask cards so the dedicated Desktop modal remains the only verification UI', async () => {
    const previousHandoff = process.env.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF
    const previousServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    const previousSessionId = process.env.CC_JIANGXIA_EXPERT_SESSION_ID
    process.env.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF = '1'
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456'
    process.env.CC_JIANGXIA_EXPERT_SESSION_ID = 'expert-session'
    try {
      const tool = await loadTool()
      await expect(tool.checkPermissions({
        questions: [{
          id: 'baidu_captcha',
          prompt: '百度搜索触发了滑块验证码，请用户处理。',
          choices: [
            { id: 'verify_done', label: '我已完成验证' },
            { id: 'switch_entry', label: '改查其他入口' },
            { id: 'record_gap', label: '记录证据缺口' },
          ],
        }],
      })).resolves.toMatchObject({
        behavior: 'deny',
        message: expect.stringContaining('dedicated Playwright verification result'),
      })

      await expect(tool.checkPermissions({
        questions: [{
          id: 'browser-verification',
          prompt: 'Complete the browser verification.',
          choices: [
            { id: 'verification_completed', label: 'Verified' },
            { id: 'switch_public_entry', label: 'Switch source' },
            { id: 'record_evidence_gap', label: 'Record gap' },
          ],
        }],
      })).resolves.toMatchObject({ behavior: 'deny' })
    } finally {
      if (previousHandoff === undefined) delete process.env.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF
      else process.env.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF = previousHandoff
      if (previousServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
      else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = previousServerUrl
      if (previousSessionId === undefined) delete process.env.CC_JIANGXIA_EXPERT_SESSION_ID
      else process.env.CC_JIANGXIA_EXPERT_SESSION_ID = previousSessionId
    }
  })

  test('keeps ordinary Expert decision questions interactive when they are not browser verification requests', async () => {
    const previousHandoff = process.env.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF
    const previousServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    const previousSessionId = process.env.CC_JIANGXIA_EXPERT_SESSION_ID
    process.env.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF = '1'
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:3456'
    process.env.CC_JIANGXIA_EXPERT_SESSION_ID = 'expert-session'
    try {
      const tool = await loadTool()
      await expect(tool.checkPermissions({
        questions: [{
          id: 'target-user',
          prompt: '这次立项优先验证哪类目标用户？',
          choices: [
            { id: 'individual', label: '个人用户' },
            { id: 'team', label: '小团队' },
          ],
        }],
      })).resolves.toMatchObject({ behavior: 'ask' })
    } finally {
      if (previousHandoff === undefined) delete process.env.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF
      else process.env.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF = previousHandoff
      if (previousServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
      else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = previousServerUrl
      if (previousSessionId === undefined) delete process.env.CC_JIANGXIA_EXPERT_SESSION_ID
      else process.env.CC_JIANGXIA_EXPERT_SESSION_ID = previousSessionId
    }
  })

})
