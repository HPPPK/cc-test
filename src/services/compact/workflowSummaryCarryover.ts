import type { AssistantMessage, Message, UserMessage } from '../../types/message.js'
import type { Tool, ToolUseContext } from '../../Tool.js'
import { FileReadTool } from '../../tools/FileReadTool/FileReadTool.js'
import {
  createUserMessage,
  getAssistantMessageText,
  getMessagesAfterCompactBoundary,
  normalizeMessagesForAPI,
} from '../../utils/messages.js'
import { COMPACT_MAX_OUTPUT_TOKENS } from '../../utils/context.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import {
  getCompactPrompt,
  getCompactUserSummaryMessage,
} from './prompt.js'
import {
  ERROR_MESSAGE_INCOMPLETE_RESPONSE,
  ERROR_MESSAGE_NOT_ENOUGH_MESSAGES,
  stripImagesFromMessages,
  stripReinjectedAttachments,
} from './compact.js'
import {
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  startsWithApiErrorPrefix,
} from '../api/errors.js'
import {
  getMaxOutputTokensForModel,
  queryModelWithStreaming,
} from '../api/claude.js'

export const WORKFLOW_CONTEXT_SUMMARY_UNAVAILABLE =
  'WORKFLOW_CONTEXT_SUMMARY_UNAVAILABLE'

export class WorkflowSummaryCarryoverError extends Error {
  readonly code = WORKFLOW_CONTEXT_SUMMARY_UNAVAILABLE

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'WorkflowSummaryCarryoverError'
  }
}

export type WorkflowSummaryCarryoverResult = {
  content: string
  rawSummary: string
  sourceMessageIds: string[]
}

export type WorkflowSummaryCarryoverRunnerInput = {
  messages: Message[]
  summaryRequest: UserMessage
  context: ToolUseContext
}

export type WorkflowSummaryCarryoverRunner = (
  input: WorkflowSummaryCarryoverRunnerInput,
) => Promise<AssistantMessage>

export type WorkflowSummaryCarryoverOptions = {
  messages: Message[]
  context: ToolUseContext
  summaryInstructions?: string
  summaryRunner?: WorkflowSummaryCarryoverRunner
}

export async function generateWorkflowSummaryCarryover({
  messages,
  context,
  summaryInstructions,
  summaryRunner = runDefaultWorkflowSummaryCarryover,
}: WorkflowSummaryCarryoverOptions): Promise<WorkflowSummaryCarryoverResult> {
  const messagesToSummarize = getMessagesAfterCompactBoundary(messages).filter(
    message => message.type !== 'system',
  )
  if (messagesToSummarize.length === 0) {
    throw new WorkflowSummaryCarryoverError(ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)
  }

  const summaryRequest = createUserMessage({
    content: getCompactPrompt(summaryInstructions),
  })

  let summaryResponse: AssistantMessage
  try {
    summaryResponse = await summaryRunner({
      messages: messagesToSummarize,
      summaryRequest,
      context,
    })
  } catch (error) {
    throw new WorkflowSummaryCarryoverError(
      `Compact-style workflow summary is unavailable: ${errorMessage(error)}`,
      { cause: error },
    )
  }

  const summary = getAssistantMessageText(summaryResponse)
  if (!summary) {
    throw new WorkflowSummaryCarryoverError(
      'Compact-style workflow summary is unavailable: response did not contain summary text',
    )
  }

  if (
    startsWithApiErrorPrefix(summary) ||
    summary.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE)
  ) {
    throw new WorkflowSummaryCarryoverError(summary)
  }

  return {
    content: getCompactUserSummaryMessage(summary, false),
    rawSummary: summary,
    sourceMessageIds: messagesToSummarize.map(message => message.uuid),
  }
}

async function runDefaultWorkflowSummaryCarryover({
  messages,
  summaryRequest,
  context,
}: WorkflowSummaryCarryoverRunnerInput): Promise<AssistantMessage> {
  let response: AssistantMessage | undefined
  const appState = context.getAppState()
  const tools: Tool[] = [FileReadTool]
  const streamingGen = queryModelWithStreaming({
    messages: normalizeMessagesForAPI(
      stripImagesFromMessages(
        stripReinjectedAttachments([...messages, summaryRequest]),
      ),
      context.options.tools,
    ),
    systemPrompt: asSystemPrompt([
      'You are a helpful AI assistant tasked with summarizing conversations.',
    ]),
    thinkingConfig: { type: 'disabled' as const },
    tools,
    signal: context.abortController.signal,
    options: {
      async getToolPermissionContext() {
        return context.getAppState().toolPermissionContext
      },
      model: context.options.mainLoopModel,
      toolChoice: undefined,
      isNonInteractiveSession: context.options.isNonInteractiveSession,
      hasAppendSystemPrompt: !!context.options.appendSystemPrompt,
      maxOutputTokensOverride: Math.min(
        COMPACT_MAX_OUTPUT_TOKENS,
        getMaxOutputTokensForModel(context.options.mainLoopModel),
      ),
      querySource: 'compact',
      agents: context.options.agentDefinitions.activeAgents,
      mcpTools: [],
      effortValue: appState.effortValue,
    },
  })

  for await (const event of streamingGen) {
    if (event.type === 'assistant') {
      response = event
    }
  }

  if (!response) {
    throw new Error(ERROR_MESSAGE_INCOMPLETE_RESPONSE)
  }

  return response
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
