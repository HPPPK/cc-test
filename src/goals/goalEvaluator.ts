import type {
  BetaMessage,
  BetaContentBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { QuerySource } from '../constants/querySource.js'
import type { AssistantMessage, Message } from '../types/message.js'
import { extractTextContent } from '../utils/messages.js'
import { getSmallFastModel } from '../utils/model/model.js'
import { safeParseJSON } from '../utils/json.js'
import { sideQuery } from '../utils/sideQuery.js'
import {
  accountThreadGoalUsage,
  buildGoalContinuationPrompt,
  getThreadGoal,
  hydrateThreadGoalFromMessages,
  incrementThreadGoalContinuation,
  markThreadGoalComplete,
  updateThreadGoalStatus,
  type ThreadGoal,
} from './goalState.js'

export type GoalEvaluation = {
  complete: boolean
  reason: string
}

export type GoalTurnDecision =
  | { action: 'none' }
  | { action: 'continue'; goal: ThreadGoal; prompt: string; reason: string }
  | { action: 'complete'; goal: ThreadGoal; reason: string }
  | { action: 'budget_limited'; goal: ThreadGoal }

type EvaluateFn = (input: {
  goal: ThreadGoal
  transcript: string
  signal: AbortSignal
  querySource?: QuerySource
}) => Promise<GoalEvaluation>

const DEFAULT_MAX_CONTINUATIONS = 500

export async function evaluateThreadGoalAfterTurn(input: {
  threadId: string
  messages: Message[]
  assistantMessages: AssistantMessage[]
  signal: AbortSignal
  now?: number
  querySource?: QuerySource
  evaluate?: EvaluateFn
}): Promise<GoalTurnDecision> {
  const now = input.now ?? Date.now()
  const current =
    getThreadGoal(input.threadId) ??
    hydrateThreadGoalFromMessages(input.threadId, input.messages, now)
  if (!current || current.status !== 'active') return { action: 'none' }

  const tokens = input.assistantMessages.reduce(
    (sum, msg) =>
      sum +
      (msg.message.usage?.input_tokens ?? 0) +
      (msg.message.usage?.output_tokens ?? 0),
    0,
  )
  const accounted = accountThreadGoalUsage(input.threadId, tokens, now) ?? current

  if (
    accounted.tokenBudget !== null &&
    accounted.tokensUsed >= accounted.tokenBudget
  ) {
    const limited =
      updateThreadGoalStatus(input.threadId, 'budget_limited', now) ?? accounted
    return { action: 'budget_limited', goal: limited }
  }

  if (accounted.continuationCount >= getMaxContinuations()) {
    const limited =
      updateThreadGoalStatus(input.threadId, 'budget_limited', now) ?? accounted
    return { action: 'budget_limited', goal: limited }
  }

  const transcript = formatTranscript([
    ...input.messages,
    ...input.assistantMessages,
  ])
  const evaluator = input.evaluate ?? evaluateGoalCompletion
  const evaluation = await evaluator({
    goal: accounted,
    transcript,
    signal: input.signal,
    querySource: input.querySource,
  })

  if (evaluation.complete) {
    const completed =
      markThreadGoalComplete(input.threadId, {
        reason: evaluation.reason,
        now,
      }) ?? accounted
    return {
      action: 'complete',
      goal: completed,
      reason: evaluation.reason,
    }
  }

  const continued =
    incrementThreadGoalContinuation(input.threadId, {
      reason: evaluation.reason,
      now,
    }) ?? accounted
  return {
    action: 'continue',
    goal: continued,
    reason: evaluation.reason,
    prompt: buildGoalContinuationPrompt(continued, evaluation.reason),
  }
}

async function evaluateGoalCompletion(input: {
  goal: ThreadGoal
  transcript: string
  signal: AbortSignal
  querySource?: QuerySource
}): Promise<GoalEvaluation> {
  const baseRequest = {
    querySource: input.querySource ?? 'hook_prompt',
    model: getSmallFastModel(),
    skipSystemPromptPrefix: true,
    thinking: false,
    temperature: 0,
    max_tokens: 512,
    signal: input.signal,
    system:
      'You evaluate whether a coding-agent goal is complete. ' +
      'Return JSON only. Say complete=true only when the transcript contains concrete visible evidence that the objective is satisfied.',
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: [
              `<objective>${input.goal.objective}</objective>`,
              '',
              '<transcript>',
              input.transcript,
              '</transcript>',
            ].join('\n'),
          },
        ],
      },
    ],
  }

  try {
    const response = await sideQuery({
      ...baseRequest,
      output_format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            complete: { type: 'boolean' },
            reason: { type: 'string' },
          },
          required: ['complete', 'reason'],
          additionalProperties: false,
        },
      },
    })

    return parseEvaluationResponse(response)
  } catch (error) {
    if (input.signal.aborted) throw error
  }

  const response = await sideQuery({
    ...baseRequest,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              `<objective>${input.goal.objective}</objective>`,
              '',
              '<transcript>',
              input.transcript,
              '</transcript>',
              '',
              'Return exactly one JSON object with this shape and no markdown:',
              '{"complete": false, "reason": "short evidence-based reason"}',
            ].join('\n'),
          },
        ],
      },
    ],
  })

  return parseEvaluationResponse(response)
}

function parseEvaluationResponse(response: BetaMessage): GoalEvaluation {
  const text = extractTextContent(response.content, '').trim()
  const parsed = safeParseJSON(text) ?? safeParseJSON(extractJsonObject(text))
  if (
    parsed &&
    typeof parsed === 'object' &&
    'complete' in parsed &&
    typeof parsed.complete === 'boolean'
  ) {
    return {
      complete: parsed.complete,
      reason:
        'reason' in parsed && typeof parsed.reason === 'string'
          ? parsed.reason
          : '',
    }
  }
  return {
    complete: false,
    reason: 'The evaluator did not return a valid completion decision.',
  }
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return text
  return text.slice(start, end + 1)
}

function formatTranscript(messages: Message[]): string {
  const lines: string[] = []
  const recent = messages.slice(-40)
  for (const message of recent) {
    if (message.type === 'user') {
      if (message.isMeta) continue
      lines.push(`User: ${contentToText(message.message.content)}`)
    } else if (message.type === 'assistant') {
      lines.push(`Assistant: ${assistantVisibleText(message.message.content)}`)
    } else if (message.type === 'system' && typeof message.content === 'string') {
      lines.push(`System: ${message.content}`)
    }
  }
  return lines.join('\n\n').slice(-24_000)
}

function contentToText(content: string | readonly BetaContentBlock[]): string {
  if (typeof content === 'string') return content
  return extractTextContent(content, '\n')
}

function assistantVisibleText(content: readonly BetaContentBlock[]): string {
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

function getMaxContinuations(): number {
  const raw = process.env.CLAUDE_CODE_GOAL_MAX_CONTINUES
  if (!raw) return DEFAULT_MAX_CONTINUATIONS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_CONTINUATIONS
}
