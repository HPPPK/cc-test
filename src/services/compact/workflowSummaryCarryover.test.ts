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

  test('carries bounded recommended skill evidence through compact summary instructions', async () => {
    const messages: Message[] = [
      createUserMessage({
        content: 'Workflow recommended skill evidence: requirements-review used; missing-audit relevant-unavailable; irrelevant-style had no evidence.',
      }),
    ]
    let requestedPrompt = ''

    const result = await generateWorkflowSummaryCarryover({
      messages,
      context: createContext(),
      summaryInstructions: [
        'Preserve workflow recommended skill evidence only for used, relevant-skipped, and relevant-unavailable outcomes.',
        'Do not create a checklist of irrelevant or unused recommended skills.',
      ].join('\n'),
      summaryRunner: async input => {
        requestedPrompt = input.summaryRequest.message.content
        return createAssistantMessage({
          content: '<summary>Recommended skills: requirements-review used; missing-audit relevant-unavailable.</summary>',
        })
      },
    })

    expect(requestedPrompt).toContain('used, relevant-skipped, and relevant-unavailable')
    expect(requestedPrompt).toContain('Do not create a checklist')
    expect(result.content).toContain('requirements-review used')
    expect(result.content).toContain('missing-audit relevant-unavailable')
    expect(result.content).not.toContain('irrelevant-style')
  })

  test('carries pending confirmation and completed workflow state through compact summary instructions', async () => {
    const messages: Message[] = [
      createUserMessage({
        content: [
          'Workflow state: pending-confirmation for phase specify, confirmationId submit-ready-1.',
          'Completion submission status ready includes evidence spec.md.',
          'Final workflow state after confirm should be completed with accepted completion evidence.',
        ].join(' '),
      }),
    ]
    let requestedPrompt = ''

    const result = await generateWorkflowSummaryCarryover({
      messages,
      context: createContext(),
      summaryInstructions: [
        'Preserve workflow status, active phase, pending confirmation id, completion status, and accepted evidence references.',
        'Distinguish pending-confirmation from completed state; do not flatten either state to running.',
      ].join('\n'),
      summaryRunner: async input => {
        requestedPrompt = input.summaryRequest.message.content
        return createAssistantMessage({
          content: '<summary>Workflow state: pending-confirmation phase specify confirmationId submit-ready-1; completion status ready evidence spec.md; after confirm completed with accepted completion evidence.</summary>',
        })
      },
    })

    expect(requestedPrompt).toContain('Preserve workflow status')
    expect(requestedPrompt).toContain('Distinguish pending-confirmation from completed')
    expect(result.content).toContain('pending-confirmation phase specify')
    expect(result.content).toContain('confirmationId submit-ready-1')
    expect(result.content).toContain('completion status ready evidence spec.md')
    expect(result.content).toContain('completed with accepted completion evidence')
    expect(result.content).not.toContain('flatten')
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
