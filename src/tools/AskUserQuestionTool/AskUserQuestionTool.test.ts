import { describe, expect, test } from 'bun:test'
import type { Tool } from '../../Tool.js'

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

  test('accepts structured workflow choices with runtime actions while retaining the legacy question/options shape', async () => {
    const tool = await loadTool()
    expect(tool.inputSchema.safeParse({
      questions: [{
        id: 'confirm_next_action',
        prompt: '是否进入下一阶段？',
        choices: [{
          id: 'enter_next_stage',
          label: '进入下一阶段',
          action: 'advance_phase',
          targetPhaseId: 'feature-implement',
          metadata: { source: 'workflow-gate' },
        }, {
          id: 'stay',
          label: '返回修改当前阶段',
          action: 'return_to_phase',
        }],
      }],
    }).success).toBe(true)
    expect(tool.inputSchema.safeParse({
      questions: [{
        question: 'Continue?',
        options: [{ label: 'Yes' }, { label: 'No' }],
      }],
    }).success).toBe(true)
  })
})


test('requires stable IDs and valid structured targets for workflow route options', async () => {
  const tool = await loadTool()
  const base = {
    questions: [{
      prompt: 'Route workflow?',
      choices: [
        {
          id: 'return-to-stage-4',
          label: 'Return to Stage 4',
          action: { kind: 'workflow-route', intent: 'jump_to_phase', targetPhaseId: 'delegate-implement' },
        },
        { id: 'continue', label: 'Continue' },
      ],
    }],
  }
  expect(tool.inputSchema.safeParse(base).success).toBe(true)
  expect(tool.inputSchema.safeParse({
    ...base,
    questions: [{
      ...base.questions[0],
      choices: [{ label: 'Broken', action: 'jump_to_phase', targetPhaseId: 'delegate-implement' }, base.questions[0].choices[1]],
    }],
  }).success).toBe(false)
  expect(tool.inputSchema.safeParse({
    ...base,
    questions: [{
      ...base.questions[0],
      choices: [{ id: 'broken', label: 'Broken', action: { kind: 'workflow-route', intent: 'jump_to_phase' } }, base.questions[0].choices[1]],
    }],
  }).success).toBe(false)
})
