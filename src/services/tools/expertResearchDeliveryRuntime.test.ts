import { withFetchPreconnect, requireFixtureRecord } from "../../server/__tests__/fixtureAssertions.js"
import { describe, expect, test } from 'bun:test'

import {
  normalizeExpertResearchDeliveryQuestionContract,
  syncExpertResearchDeliveryDecision,
  normalizeExpertResearchDeliveryResponseContract,
  validateExpertResearchDeliveryQuestionContract,
} from './expertResearchDeliveryRuntime.js'



describe('syncExpertResearchDeliveryDecision', () => {

  test('validates the package-scoped final-delivery contract before the answer is collected', () => {
    const policy = '{"questionId":"research-delivery:commercialization-report","acceptedChoiceId":"accept_current_scope","continueChoiceIds":["provide_material_and_continue"],"pauseChoiceIds":["pause_research"]}'
    expect(validateExpertResearchDeliveryQuestionContract({
      questions: [{
        id: 'research-delivery:commercialization-report',
        choices: [
          { id: 'accept_current_scope' },
          { id: 'provide_material_and_continue' },
          { id: 'pause_research' },
        ],
        metadata: { question_id: 'research-delivery:commercialization-report' },
      }],
      metadata: {
        expert_research_delivery: { question_id: 'research-delivery:commercialization-report' },
      },
    }, { CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: policy })).toBeUndefined()

    expect(validateExpertResearchDeliveryQuestionContract({
      questions: [{
        id: 'delivery_confirm_markdown_reader',
        choices: [{ id: 'deliver_accept' }, { id: 'continue' }],
      }],
      metadata: {
        expert_research_delivery: { question_id: 'delivery_confirm_markdown_reader' },
      },
    }, { CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: policy })).toContain('research-delivery:commercialization-report')
    expect(validateExpertResearchDeliveryQuestionContract({
      questions: [{
        id: 'research-delivery:commercialization-report',
        choices: [{ id: 'accept_current_scope' }, { id: 'provide_material_and_continue' }],
      }],
      metadata: {
        expert_research_delivery: { question_id: 'research-delivery:commercialization-report' },
      },
    }, { CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: policy })).toContain('pause_research')
  })


  test('rejects the real unmarked evidence-gap delivery card before it can consume a user response', () => {
    const policy = '{"questionId":"research-delivery:commercialization-report","acceptedChoiceId":"accept_current_scope","continueChoiceIds":["provide_material_and_continue"],"pauseChoiceIds":["pause_research"]}'
    expect(validateExpertResearchDeliveryQuestionContract({
      questions: [{
        id: 'evidence_gap_delivery',
        prompt: '研究完成后，是否保留证据缺口并交付当前范围报告？',
        choices: [
          { id: 'accept_gap', label: '保留证据缺口，交付当前范围报告' },
          { id: 'provide_material', label: '先补充材料再出报告' },
          { id: 'pause', label: '暂停输出' },
        ],
      }],
    }, { CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: policy })).toContain('research-delivery:commercialization-report')
  })

  test('normalizes a model-authored delivery card to the ZIP-declared IDs before it reaches Desktop', () => {
    const policy = '{"questionId":"research-delivery:commercialization-report","acceptedChoiceId":"accept_current_scope","continueChoiceIds":["provide_material_and_continue"],"pauseChoiceIds":["pause_research"]}'
    const normalized = normalizeExpertResearchDeliveryQuestionContract({
      questions: [{
        id: 'delivery_confirm_photo_restore',
        prompt: '是否接受当前证据范围并进入报告准备？',
        choices: [
          { id: 'deliver_accept', label: '接受当前范围' },
          { id: 'provide_material', label: '补充用户材料' },
          { id: 'continue_public_research', label: '继续公开调研' },
          { id: 'pause', label: '暂不生成报告' },
        ],
      }],
    }, { CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: policy })

    expect(normalized.questions[0]).toEqual(expect.objectContaining({
      id: 'research-delivery:commercialization-report',
      choices: [
        expect.objectContaining({ id: 'accept_current_scope', label: '接受当前范围' }),
        expect.objectContaining({ id: 'provide_material_and_continue', label: '补充用户材料' }),
        expect.objectContaining({ id: 'pause_research', label: '暂不生成报告' }),
      ],
      metadata: expect.objectContaining({ question_id: 'research-delivery:commercialization-report' }),
    }))
    expect(validateExpertResearchDeliveryQuestionContract(normalized, { CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: policy })).toBeUndefined()
  })

  test('retries a transient Desktop connection reset before failing the user-selected delivery decision', async () => {
    let attempts = 0
    await syncExpertResearchDeliveryDecision({
      questions: [{ id: 'research-delivery:commercialization-report' }],
      answerChoiceIds: { 'research-delivery:commercialization-report': ['accept_current_scope'] },
      metadata: { expert_research_delivery: { question_id: 'research-delivery:commercialization-report' } },
    }, {
      env: {
        CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: JSON.stringify({ questionId: 'research-delivery:commercialization-report', acceptedChoiceId: 'accept_current_scope', continueChoiceIds: ['provide_material_and_continue'], pauseChoiceIds: ['pause_research'] }),
        CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456',
        CC_JIANGXIA_EXPERT_SESSION_ID: 'session-123',
      },
      fetch: withFetchPreconnect(async () => {
        attempts += 1
        if (attempts < 3) throw new Error('The socket connection was closed unexpectedly')
        return new Response('{}', { status: 200 })
      }),
      sleep: async () => {},
    })
    expect(attempts).toBe(3)
  })

  test('does not retry a 409 research-delivery rejection as a Desktop connection failure', async () => {
    let attempts = 0
    let message = ''

    try {
      await syncExpertResearchDeliveryDecision({
        questions: [{ id: 'research-delivery:commercialization-report' }],
        answerChoiceIds: { 'research-delivery:commercialization-report': ['accept_current_scope'] },
        metadata: { expert_research_delivery: { question_id: 'research-delivery:commercialization-report' } },
      }, {
        env: {
        CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: JSON.stringify({ questionId: 'research-delivery:commercialization-report', acceptedChoiceId: 'accept_current_scope', continueChoiceIds: ['provide_material_and_continue'], pauseChoiceIds: ['pause_research'] }),
          CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456',
          CC_JIANGXIA_EXPERT_SESSION_ID: 'session-123',
        },
        fetch: withFetchPreconnect(async () => {
          attempts += 1
          return new Response(JSON.stringify({
            message: '当前不能接受证据缺口并交付：仍缺少 1 个已回传浏览审计的研究子代理。',
          }), { status: 409, headers: { 'content-type': 'application/json' } })
        }),
        sleep: async () => {
          throw new Error('4xx response must not be retried')
        },
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(attempts).toBe(1)
    expect(message).toContain('服务端拒绝本次交付确认')
    expect(message).toContain('当前不能接受证据缺口并交付')
    expect(message).not.toContain('Desktop 服务连接')
  })

  test('does not affect an ordinary AskUserQuestion without delivery metadata', async () => {

    let called = false

    await syncExpertResearchDeliveryDecision({

      questions: [{ id: 'ordinary-question' }],

    }, {

      env: {},

      fetch: withFetchPreconnect(async () => {

        called = true

        return new Response('{}')

      }),

    })

    expect(called).toBe(false)

  })



  test('posts the stable choice ID and unresolved evidence for a delivery question', async () => {

    let request: { url: string; init?: RequestInit } | undefined

    await syncExpertResearchDeliveryDecision({

      questions: [{ id: 'research-delivery:commercialization-report' }],

      answerChoiceIds: {

        'research-delivery:commercialization-report': ['accept_current_scope'],

      },

      metadata: {

        expert_research_delivery: {

          question_id: 'research-delivery:commercialization-report',

          unresolved_evidence: ['App Store detail page requires user screenshot'],

        },

      },

    }, {

      env: {
        CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: JSON.stringify({ questionId: 'research-delivery:commercialization-report', acceptedChoiceId: 'accept_current_scope', continueChoiceIds: ['provide_material_and_continue'], pauseChoiceIds: ['pause_research'] }),

        CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456/',

        CC_JIANGXIA_EXPERT_SESSION_ID: 'session-123',

      },

      fetch: withFetchPreconnect(async (url, init) => {

        request = { url: String(url), init }

        return new Response('{}', { status: 200 })

      }),

    })



    expect(request?.url).toBe('http://127.0.0.1:3456/api/sessions/session-123/expert/research-delivery')

    expect(request?.init?.method).toBe('POST')

    expect(JSON.parse(String(request?.init?.body))).toEqual({

      questionId: 'research-delivery:commercialization-report',

      choiceIds: ['accept_current_scope'],

      unresolvedEvidence: ['App Store detail page requires user screenshot'],

    })

  })



  test('rejects a free-text delivery response because the stable choice ID is required', async () => {

    await expect(syncExpertResearchDeliveryDecision({

      questions: [{ id: 'research-delivery:commercialization-report' }],

      metadata: {

        expert_research_delivery: {

          question_id: 'research-delivery:commercialization-report',

        },

      },

    }, {

      env: {
        CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: JSON.stringify({ questionId: 'research-delivery:commercialization-report', acceptedChoiceId: 'accept_current_scope', continueChoiceIds: ['provide_material_and_continue'], pauseChoiceIds: ['pause_research'] }),

        CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456',

        CC_JIANGXIA_EXPERT_SESSION_ID: 'session-123',

      },

      fetch: globalThis.fetch,

    })).rejects.toThrow('需要桌面端返回所选选项 ID')

  })


  test('persists a delivery choice when model metadata is attached to the delivery question', async () => {
    let request: { url: string; init?: RequestInit } | undefined

    await syncExpertResearchDeliveryDecision({
      questions: [{
        id: 'research-delivery:commercialization-report',
        metadata: {
          question_id: 'research-delivery:commercialization-report',
          unresolved_evidence: ['Google requires a visible verification retry'],
        },
      }] as unknown as Array<{ id?: string }>,
      answerChoiceIds: {
        'research-delivery:commercialization-report': ['accept_current_scope'],
      },
    }, {
      env: {
        CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: JSON.stringify({ questionId: 'research-delivery:commercialization-report', acceptedChoiceId: 'accept_current_scope', continueChoiceIds: ['provide_material_and_continue'], pauseChoiceIds: ['pause_research'] }),
        CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456',
        CC_JIANGXIA_EXPERT_SESSION_ID: 'session-123',
      },
      fetch: withFetchPreconnect(async (url, init) => {
        request = { url: String(url), init }
        return new Response('{}', { status: 200 })
      }),
    })

    expect(request?.url).toBe('http://127.0.0.1:3456/api/sessions/session-123/expert/research-delivery')
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      questionId: 'research-delivery:commercialization-report',
      choiceIds: ['accept_current_scope'],
      unresolvedEvidence: ['Google requires a visible verification retry'],
    })
  })

})

test('recovers a stable choice ID from an exact legacy Desktop answer', async () => {
  const questionId = 'research-delivery:commercialization-report'
  let request: { url: string; init?: RequestInit } | undefined

  await syncExpertResearchDeliveryDecision({
    questions: [{
      id: questionId,
      choices: [
        { id: 'accept_current_scope', label: 'Deliver current scope' },
        { id: 'provide_material_and_continue', label: 'Provide material and continue' },
      ],
      metadata: { question_id: questionId },
    }],
    answers: { [questionId]: 'Deliver current scope' },
  }, {
    env: {
        CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: JSON.stringify({ questionId: 'research-delivery:commercialization-report', acceptedChoiceId: 'accept_current_scope', continueChoiceIds: ['provide_material_and_continue'], pauseChoiceIds: ['pause_research'] }),
      CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:3456',
      CC_JIANGXIA_EXPERT_SESSION_ID: 'session-123',
    },
    fetch: withFetchPreconnect(async (url, init) => {
      request = { url: String(url), init }
      return new Response('{}', { status: 200 })
    }),
  })

  expect(JSON.parse(String(request?.init?.body))).toEqual({
    questionId,
    choiceIds: ['accept_current_scope'],
    unresolvedEvidence: [],
  })
})

test('canonicalizes a legacy delivery response before the runtime syncs it to the fixed contract', () => {
  const env = {
    CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: JSON.stringify({
      questionId: 'research-delivery:commercialization-report',
      acceptedChoiceId: 'accept_current_scope',
      continueChoiceIds: ['provide_material_and_continue'],
      pauseChoiceIds: ['pause_research'],
    }),
  }

  const normalized = normalizeExpertResearchDeliveryResponseContract({
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
  }, env)

  expect(normalized.questions[0]?.id).toBe('research-delivery:commercialization-report')
  expect(normalized.metadata?.expert_research_delivery?.question_id).toBe('research-delivery:commercialization-report')
  expect(requireFixtureRecord(normalized.answerChoiceIds)).toEqual({
    'research-delivery:commercialization-report': ['accept_current_scope'],
  })
  expect(requireFixtureRecord(normalized.answers)).toEqual({
    'research-delivery:commercialization-report': '接受当前范围（推荐）',
  })
})


test('invalid optional delivery choice lists leave ordinary questions unchanged', () => {
  const input = { questions: [{ id: 'research_delivery', prompt: '接受当前证据范围并生成报告？', choices: [{ id: 'accept', label: '接受当前范围' }] }] }
  for (const policy of [null, {}, { questionId: 'delivery', acceptedChoiceId: 'accept', continueChoiceIds: undefined, pauseChoiceIds: [] }, { questionId: 'delivery', acceptedChoiceId: 'accept', continueChoiceIds: [], pauseChoiceIds: [123] }]) {
    expect(normalizeExpertResearchDeliveryQuestionContract(input, { CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: JSON.stringify(policy) })).toBe(input)
  }
})


test('ignores stray delivery metadata on scope answers when the expert has no delivery policy', async () => {
  for (const questions of [
    [{ id: 'coreTask' }, { id: 'deliveryBoundary' }],
    [{ id: 'scope-clarification-001' }, { id: 'deliveryBoundary' }],
  ]) {
    let calls = 0
    const input = { questions, answers: { coreTask: '拟开发新品', deliveryBoundary: 'Windows 桌面' }, metadata: { expert_research_delivery: { question_id: 'scope-clarification-001' } } }
    expect(validateExpertResearchDeliveryQuestionContract(input, {})).toBeUndefined()
    await syncExpertResearchDeliveryDecision(input, { env: {}, fetch: withFetchPreconnect(async () => { calls++; return new Response('{}') }) })
    expect(calls).toBe(0)
  }
})

test('keeps platform clarification separate from final delivery even when a delivery policy is enabled', async () => {
  const env = { CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY: JSON.stringify({ questionId: 'research-delivery:report', acceptedChoiceId: 'accept', continueChoiceIds: ['continue'], pauseChoiceIds: ['pause'] }) }
  for (const id of ['deliveryBoundary', 'expert-intake:deliveryBoundary']) {
    const input = { questions: [{ id, prompt: '首发系统？', choices: [{ id: 'windows', label: 'Windows' }, { id: 'mac', label: 'Mac' }] }], answers: { [id]: 'Windows' }, metadata: { expert_research_delivery: { question_id: 'wrong' } } }
    const normalized = normalizeExpertResearchDeliveryQuestionContract(input, env)
    expect(normalized.questions[0]?.id).toBe(id)
    expect(normalized.metadata?.expert_research_delivery).toBeUndefined()
    expect(validateExpertResearchDeliveryQuestionContract(input, env)).toBeUndefined()
    expect(normalizeExpertResearchDeliveryResponseContract(input, env).answers).toEqual(input.answers)
    let calls = 0
    await syncExpertResearchDeliveryDecision(input, { env, fetch: withFetchPreconnect(async () => { calls++; return new Response('{}') }) })
    expect(calls).toBe(0)
  }
})

test('removes only delivery tags from scope cards while retaining ordinary tracking metadata', () => {
  const input = {
    questions: [{ id: 'coreTask', prompt: '产品方向？', metadata: { question_id: 'wrong' } }],
    answers: { coreTask: '拟开发新品' },
    metadata: { source: 'scope', expert_research_delivery: { question_id: 'wrong' } },
  }
  const normalized = normalizeExpertResearchDeliveryResponseContract(input, {})
  expect(normalized.metadata.source).toBe('scope')
  expect(normalized.metadata).not.toHaveProperty('expert_research_delivery')
  expect(normalized.questions[0]).not.toHaveProperty('metadata')
  expect(normalized.answers).toEqual(input.answers)
  const questionOnly = normalizeExpertResearchDeliveryQuestionContract({ questions: input.questions }, {})
  expect(questionOnly.questions[0]).not.toHaveProperty('metadata')
})
