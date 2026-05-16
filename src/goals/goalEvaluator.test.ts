import { describe, expect, test } from 'bun:test'
import type { BetaContentBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { Message } from '../types/message.js'
import { createAssistantMessage, createUserMessage } from '../utils/messages.js'
import { evaluateThreadGoalAfterTurn } from './goalEvaluator.js'
import { getThreadGoal, setThreadGoal } from './goalState.js'

describe('goalEvaluator', () => {
  test('continues an active goal when the evaluator says it is incomplete', async () => {
    const goal = setThreadGoal('thread-eval-continue', {
      objective: 'tests pass',
      now: 1_000,
    })
    const messages: Message[] = [
      createUserMessage({ content: 'run the tests' }),
      createAssistantMessage({
        content: [{ type: 'text', text: 'I changed code but did not test it.' }],
      }),
    ]

    const decision = await evaluateThreadGoalAfterTurn({
      threadId: 'thread-eval-continue',
      messages,
      assistantMessages: [],
      signal: new AbortController().signal,
      now: 2_000,
      evaluate: async () => ({
        complete: false,
        reason: 'Tests have not been run.',
      }),
    })

    expect(decision.action).toBe('continue')
    expect(decision.goal.goalId).toBe(goal.goalId)
    expect(decision.prompt).toContain('Tests have not been run.')
    expect(getThreadGoal('thread-eval-continue')?.status).toBe('active')
  })

  test('does not let hidden goal prompts satisfy the evaluator transcript', async () => {
    setThreadGoal('thread-eval-meta', {
      objective: 'finish after MAGIC_DONE appears',
      now: 1_000,
    })
    let capturedTranscript = ''

    const decision = await evaluateThreadGoalAfterTurn({
      threadId: 'thread-eval-meta',
      messages: [
        createUserMessage({
          content: 'The hidden instruction says MAGIC_DONE is the target.',
          isMeta: true,
        }),
        createAssistantMessage({
          content: [{ type: 'text', text: 'Still working.' }],
        }),
      ],
      assistantMessages: [],
      signal: new AbortController().signal,
      now: 2_000,
      evaluate: async ({ transcript }) => {
        capturedTranscript = transcript
        return {
          complete: false,
          reason: 'No completion evidence.',
        }
      },
    })

    expect(decision.action).toBe('continue')
    expect(capturedTranscript).not.toContain('MAGIC_DONE')
    expect(capturedTranscript).toContain('Assistant: Still working.')
  })

  test('does not let hidden assistant thinking satisfy the evaluator transcript', async () => {
    setThreadGoal('thread-eval-thinking', {
      objective: 'finish after LOOP_DONE appears',
      now: 1_000,
    })
    let capturedTranscript = ''

    await evaluateThreadGoalAfterTurn({
      threadId: 'thread-eval-thinking',
      messages: [
        createAssistantMessage({
          content: [
            {
              type: 'thinking',
              thinking: 'I will output LOOP_DONE next turn.',
              signature: 'test',
            } as unknown as BetaContentBlock,
            { type: 'text', text: 'STEP_ONE' },
          ],
        }),
      ],
      assistantMessages: [],
      signal: new AbortController().signal,
      now: 2_000,
      evaluate: async ({ transcript }) => {
        capturedTranscript = transcript
        return {
          complete: false,
          reason: 'No visible completion evidence.',
        }
      },
    })

    expect(capturedTranscript).not.toContain('LOOP_DONE')
    expect(capturedTranscript).toContain('Assistant: STEP_ONE')
  })

  test('marks an active goal complete when the evaluator says it is complete', async () => {
    setThreadGoal('thread-eval-complete', {
      objective: 'tests pass',
      now: 1_000,
    })

    const decision = await evaluateThreadGoalAfterTurn({
      threadId: 'thread-eval-complete',
      messages: [createUserMessage({ content: 'bun test passed' })],
      assistantMessages: [],
      signal: new AbortController().signal,
      now: 3_000,
      evaluate: async () => ({
        complete: true,
        reason: 'The transcript shows the tests passed.',
      }),
    })

    expect(decision.action).toBe('complete')
    expect(decision.reason).toBe('The transcript shows the tests passed.')
    expect(getThreadGoal('thread-eval-complete')?.status).toBe('complete')
    expect(getThreadGoal('thread-eval-complete')?.lastReason).toBe(
      'The transcript shows the tests passed.',
    )
  })

  test('hydrates an active goal from persisted slash command history before continuing', async () => {
    const threadId = 'thread-eval-hydrate'

    const decision = await evaluateThreadGoalAfterTurn({
      threadId,
      messages: [
        createUserMessage({
          content: [
            '<command-name>/goal</command-name>',
            '<command-args>ship persisted goal</command-args>',
          ].join('\n'),
        }),
        createUserMessage({
          content: [
            '<local-command-stdout>',
            'Goal set: ship persisted goal',
            '</local-command-stdout>',
          ].join('\n'),
        }),
        createAssistantMessage({
          content: [{ type: 'text', text: 'Still need to run verification.' }],
        }),
      ],
      assistantMessages: [],
      signal: new AbortController().signal,
      now: 120_000,
      evaluate: async ({ goal }) => ({
        complete: false,
        reason: `${goal.objective} is not verified.`,
      }),
    })

    expect(decision.action).toBe('continue')
    const restored = getThreadGoal(threadId)
    expect(restored?.objective).toBe('ship persisted goal')
    expect(restored?.tokensUsed).toBe(0)
    expect(restored?.tokenBudget).toBeNull()
    expect(restored?.continuationCount).toBe(1)
  })
})
