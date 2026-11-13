import { callToolFixture } from '../toolFixtures.test.js'
import { describe, expect, test } from 'bun:test'
import type { Tool } from '../../Tool.js'

async function loadTool(): Promise<typeof import('./AskUserQuestionTool.js')['AskUserQuestionTool']> {
  const mod = await import('./AskUserQuestionTool.js')
  if (!mod.AskUserQuestionTool) throw new Error('AskUserQuestionTool export is required')
  return mod.AskUserQuestionTool
}

describe('AskUserQuestionTool research delivery compatibility', () => {
  test('forwards an exact legacy displayed answer to the delivery runtime', async () => {
    const questionId = 'research-delivery:commercialization-report'
    let recordedBody: unknown
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        recordedBody = await request.json()
        return Response.json({})
      },
    })
    const previousPolicy = process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY = JSON.stringify({ questionId, acceptedChoiceId: 'accept_current_scope', continueChoiceIds: ['provide_material_and_continue'], pauseChoiceIds: [] })
    const previousServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    const previousSessionId = process.env.CC_JIANGXIA_EXPERT_SESSION_ID
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`
    process.env.CC_JIANGXIA_EXPERT_SESSION_ID = 'session-123'

    try {
      const tool = await loadTool()
      await callToolFixture(tool, {
        questions: [{
          id: questionId,
          prompt: 'Can the report be delivered with the documented evidence gaps?',
          choices: [
            { id: 'accept_current_scope', label: 'Deliver current scope' },
            { id: 'provide_material_and_continue', label: 'Provide material and continue' },
          ],
          metadata: { question_id: questionId },
        }],
        answers: { [questionId]: 'Deliver current scope' },
        metadata: { expert_research_delivery: { question_id: questionId } },
      } as never)
    } finally {
      server.stop(true)
      if (previousPolicy === undefined) delete process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
      else process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY = previousPolicy
      if (previousServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
      else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = previousServerUrl
      if (previousSessionId === undefined) delete process.env.CC_JIANGXIA_EXPERT_SESSION_ID
      else process.env.CC_JIANGXIA_EXPERT_SESSION_ID = previousSessionId
    }

    expect(recordedBody).toEqual({
      questionId,
      choiceIds: ['accept_current_scope'],
      unresolvedEvidence: [],
    })
  })
})

test('returns scope answers successfully despite stray delivery metadata without an enabled policy', async () => {
  const previous = process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
  const previousLegacy = process.env.CC_HAHA_EXPERT_RESEARCH_DELIVERY_POLICY
  delete process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
  delete process.env.CC_HAHA_EXPERT_RESEARCH_DELIVERY_POLICY
  try {
    const tool = await loadTool()
    const input = {
      questions: [{ id: 'coreTask', prompt: '研究哪类产品？', choices: [{ id: 'new', label: '拟开发新品' }, { id: 'existing', label: '现有产品' }] }],
      answers: { coreTask: '拟开发新品' },
      metadata: { expert_research_delivery: { question_id: 'wrong' } },
    }
    const permission = await tool.checkPermissions(input as never, {} as never)
    expect(permission.behavior).toBe('ask')
    const result = await callToolFixture(tool, input as never)
    expect(result.data.answers).toEqual({ coreTask: '拟开发新品' })
  } finally {
    if (previous === undefined) delete process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
    else process.env.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY = previous
    if (previousLegacy === undefined) delete process.env.CC_HAHA_EXPERT_RESEARCH_DELIVERY_POLICY
    else process.env.CC_HAHA_EXPERT_RESEARCH_DELIVERY_POLICY = previousLegacy
  }
})
