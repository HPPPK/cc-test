import { afterEach, describe, expect, test } from 'bun:test'
import type { AppState } from '../../state/AppState.js'
import { IDLE_SPECULATION_STATE } from '../../state/AppStateStore.js'
import { createTaskStateBase } from '../../Task.js'
import type { ToolUseContext } from '../../Tool.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { Message } from '../../types/message.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import {
  getCommandQueue,
  resetCommandQueue,
} from '../../utils/messageQueueManager.js'
import { createAssistantMessage } from '../../utils/messages.js'
import { runAsyncAgentLifecycle } from './agentToolUtils.js'

describe('runAsyncAgentLifecycle', () => {
  afterEach(() => {
    resetCommandQueue()
  })

  test('notifies the parent before post-completion cleanup finishes', async () => {
    const taskId = 'agent-notify-first'
    const abortController = new AbortController()
    const task: LocalAgentTaskState = {
      ...createTaskStateBase(taskId, 'local_agent', 'Review code', 'toolu_agent'),
      status: 'running',
      agentId: taskId,
      prompt: 'Review code',
      agentType: 'general-purpose',
      abortController,
      retrieved: false,
      lastReportedToolCount: 0,
      lastReportedTokenCount: 0,
      isBackgrounded: true,
      pendingMessages: [],
      retain: false,
      diskLoaded: false,
    }
    let appState = {
      tasks: { [taskId]: task },
      toolPermissionContext: getEmptyToolPermissionContext(),
      speculation: IDLE_SPECULATION_STATE,
    } as unknown as AppState
    const setAppState = (updater: (prev: AppState) => AppState): void => {
      appState = updater(appState)
    }
    const message = createAssistantMessage({
      content: [{ type: 'text', text: 'Review complete.' }],
    }) as Message
    let cleanupStarted = false

    async function* makeStream(): AsyncGenerator<Message, void> {
      yield message
    }

    const result = await Promise.race([
      runAsyncAgentLifecycle({
        taskId,
        abortController,
        makeStream,
        metadata: {
          prompt: 'Review code',
          resolvedAgentModel: 'test-model',
          isBuiltInAgent: true,
          startTime: Date.now(),
          agentType: 'general-purpose',
          isAsync: true,
        },
        description: 'Review code',
        toolUseContext: {
          options: { tools: [] },
          toolUseId: 'toolu_agent',
          getAppState: () => appState,
        } as unknown as ToolUseContext,
        rootSetAppState: setAppState,
        agentIdForCleanup: taskId,
        enableSummarization: false,
        getWorktreeResult: () => {
          cleanupStarted = true
          return new Promise(() => {})
        },
      }),
      new Promise(resolve => setTimeout(() => resolve('timed-out'), 50)),
    ])

    expect(result).toEqual({ status: 'succeeded' })
    expect(cleanupStarted).toBe(true)
    expect(appState.tasks[taskId]?.status).toBe('completed')
    expect(getCommandQueue()).toHaveLength(1)
    expect(String(getCommandQueue()[0]?.value)).toContain(
      '<status>completed</status>',
    )
    expect(String(getCommandQueue()[0]?.value)).toContain('Review complete.')
  })

  test('returns a failed outcome when the background agent stream fails', async () => {
    const taskId = 'agent-failure-outcome'
    const abortController = new AbortController()
    const task: LocalAgentTaskState = {
      ...createTaskStateBase(taskId, 'local_agent', 'Failing agent', 'toolu_failure'),
      status: 'running',
      agentId: taskId,
      prompt: 'Fail deliberately',
      agentType: 'general-purpose',
      abortController,
      retrieved: false,
      lastReportedToolCount: 0,
      lastReportedTokenCount: 0,
      isBackgrounded: true,
      pendingMessages: [],
      retain: false,
      diskLoaded: false,
    }
    let appState = {
      tasks: { [taskId]: task },
      toolPermissionContext: getEmptyToolPermissionContext(),
      speculation: IDLE_SPECULATION_STATE,
    } as unknown as AppState
    const setAppState = (updater: (prev: AppState) => AppState): void => {
      appState = updater(appState)
    }

    async function* makeStream(): AsyncGenerator<Message, void> {
      throw new Error('stream failed')
    }

    await expect(runAsyncAgentLifecycle({
      taskId,
      abortController,
      makeStream,
      metadata: {
        prompt: 'Fail deliberately',
        resolvedAgentModel: 'test-model',
        isBuiltInAgent: true,
        startTime: Date.now(),
        agentType: 'general-purpose',
        isAsync: true,
      },
      description: 'Failing agent',
      toolUseContext: {
        options: { tools: [] },
        toolUseId: 'toolu_failure',
        getAppState: () => appState,
      } as unknown as ToolUseContext,
      rootSetAppState: setAppState,
      agentIdForCleanup: taskId,
      enableSummarization: false,
      getWorktreeResult: async () => ({}),
    })).resolves.toEqual({ status: 'failed', reason: 'stream failed' })
    expect(appState.tasks[taskId]?.status).toBe('failed')
  })
})
