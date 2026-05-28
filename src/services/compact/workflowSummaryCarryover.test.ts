import { describe, expect, test } from 'bun:test'

import { getEmptyToolPermissionContext, type ToolUseContext } from '../../Tool.js'
import { createFileStateCacheWithSizeLimit } from '../../utils/fileStateCache.js'
import {
  createAssistantAPIErrorMessage,
  createAssistantMessage,
  createCompactBoundaryMessage,
  createUserMessage,
} from '../../utils/messages.js'
import type { Message } from '../../types/message.js'
import {
  generateWorkflowSummaryCarryover,
  WorkflowSummaryCarryoverError,
  WORKFLOW_CONTEXT_SUMMARY_UNAVAILABLE,
  type WorkflowSummaryCarryoverRunner,
} from './workflowSummaryCarryover.js'

describe('generateWorkflowSummaryCarryover', () => {
  test('generates compact-style carryover without mutating source messages', async () => {
    const messages: Message[] = [
      createUserMessage({ content: 'We decided to keep source chat intact.' }),
      createAssistantMessage({
        content:
          'I will add a non-mutating helper for workflow summary carryover.',
      }),
    ]
    const before = JSON.stringify(messages)
    let runnerInput: Parameters<WorkflowSummaryCarryoverRunner>[0] | undefined

    const result = await generateWorkflowSummaryCarryover({
      messages,
      context: createContext(),
      summaryInstructions: 'Preserve unresolved implementation constraints.',
      summaryRunner: async input => {
        runnerInput = input
        return createAssistantMessage({
          content:
            '<analysis>drafting notes</analysis><summary>1. Primary Request and Intent:\nPreserve the source chat while carrying workflow context.</summary>',
        })
      },
    })

    expect(JSON.stringify(messages)).toBe(before)
    expect(runnerInput?.messages).toEqual(messages)
    expect(runnerInput?.summaryRequest.message.content).toContain(
      'Additional Instructions:\nPreserve unresolved implementation constraints.',
    )
    expect(result.content).toContain(
      'This session is being continued from a previous conversation',
    )
    expect(result.content).toContain('Summary:')
    expect(result.content).toContain('Preserve the source chat')
    expect(result.content).not.toContain('<analysis>')
    expect(result.sourceMessageIds).toEqual(messages.map(message => message.uuid))
  })

  test('summarizes only messages after the last compact boundary', async () => {
    const oldMessage = createUserMessage({ content: 'old context' })
    const boundary = createCompactBoundaryMessage(
      'manual',
      100,
      oldMessage.uuid,
    )
    const carriedMessage = createUserMessage({ content: 'new context' })
    const messages: Message[] = [oldMessage, boundary, carriedMessage]

    const result = await generateWorkflowSummaryCarryover({
      messages,
      context: createContext(),
      summaryRunner: async input => {
        expect(input.messages).toEqual([carriedMessage])
        return createAssistantMessage({
          content: '<summary>Only new context was summarized.</summary>',
        })
      },
    })

    expect(result.sourceMessageIds).toEqual([carriedMessage.uuid])
  })

  test('surfaces provider/runtime failures as visible summary unavailable errors', async () => {
    const messages: Message[] = [createUserMessage({ content: 'source text' })]

    await expect(
      generateWorkflowSummaryCarryover({
        messages,
        context: createContext(),
        summaryRunner: async () => {
          throw new Error('provider credentials missing')
        },
      }),
    ).rejects.toMatchObject({
      code: WORKFLOW_CONTEXT_SUMMARY_UNAVAILABLE,
      message:
        'Compact-style workflow summary is unavailable: provider credentials missing',
    })
  })

  test('does not treat API error messages as successful carryover', async () => {
    const messages: Message[] = [createUserMessage({ content: 'source text' })]

    await expect(
      generateWorkflowSummaryCarryover({
        messages,
        context: createContext(),
        summaryRunner: async () =>
          createAssistantAPIErrorMessage({
            content: 'API Error: quota exceeded',
          }),
      }),
    ).rejects.toBeInstanceOf(WorkflowSummaryCarryoverError)
  })
})

function createContext(): ToolUseContext {
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'test-model',
      tools: [],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        errors: [],
        warnings: [],
        metadata: {
          directories: [],
          loadedFromSettings: [],
        },
      },
    },
    abortController: new AbortController(),
    readFileState: createFileStateCacheWithSizeLimit(10),
    getAppState: () => ({
      toolPermissionContext: getEmptyToolPermissionContext(),
      tasks: {},
      effortValue: undefined,
    }) as ReturnType<ToolUseContext['getAppState']>,
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
  }
}
