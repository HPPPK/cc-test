import { describe, expect, test } from 'bun:test'
import type { Tool } from '../../Tool.js'

async function loadTool(): Promise<Tool> {
  const mod = await import('./AskUserQuestionTool.js') as { AskUserQuestionTool?: Tool }
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
    const previousServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    const previousSessionId = process.env.CC_JIANGXIA_EXPERT_SESSION_ID
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`
    process.env.CC_JIANGXIA_EXPERT_SESSION_ID = 'session-123'

    try {
      const tool = await loadTool()
      await tool.call({
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