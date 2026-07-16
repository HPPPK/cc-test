import { describe, expect, test } from 'bun:test'
import { createTaskStateBase } from '../../Task.js'
import type { AppState } from '../../state/AppState.js'
import {
  killAsyncAgent,
  registerAgentForeground,
  startAsyncAgent,
  unregisterAgentForeground,
  type LocalAgentTaskState,
} from './LocalAgentTask.js'

function createQueuedAgent(taskId: string): LocalAgentTaskState {
  return {
    ...createTaskStateBase(taskId, 'local_agent', 'Queued implementation'),
    type: 'local_agent',
    agentId: taskId,
    prompt: 'Implement the isolated change',
    agentType: 'general-purpose',
    abortController: new AbortController(),
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true,
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
  }
}

function taskStore(task: LocalAgentTaskState) {
  let appState = {
    tasks: { [task.id]: task },
  } as unknown as AppState
  const setAppState = (updater: (previous: AppState) => AppState): void => {
    appState = updater(appState)
  }
  return {
    get task(): LocalAgentTaskState {
      return appState.tasks[task.id] as LocalAgentTaskState
    },
    setAppState,
  }
}

describe('LocalAgentTask queued lifecycle', () => {
  test('starts only when it receives a permit and can be cancelled while pending', () => {
    const queued = taskStore(createQueuedAgent('queued-agent'))

    expect(queued.task.status).toBe('pending')

    killAsyncAgent(queued.task.id, queued.setAppState)
    expect(queued.task.status).toBe('killed')
    expect(queued.task.abortController).toBeUndefined()

    startAsyncAgent(queued.task.id, queued.setAppState)
    expect(queued.task.status).toBe('killed')
  })

  test('moves a queued agent to running only once its permit is granted', () => {
    const queued = taskStore(createQueuedAgent('permitted-agent'))

    startAsyncAgent(queued.task.id, queued.setAppState)
    expect(queued.task.status).toBe('running')

    startAsyncAgent(queued.task.id, queued.setAppState)
    expect(queued.task.status).toBe('running')
  })


  test('registers a foreground agent without requiring workflow task metadata', () => {
    let appState = { tasks: {} } as unknown as AppState
    const setAppState = (updater: (previous: AppState) => AppState): void => {
      appState = updater(appState)
    }

    const registered = registerAgentForeground({
      agentId: 'foreground-agent',
      description: 'Foreground implementation',
      prompt: 'Implement the assigned change.',
      selectedAgent: { agentType: 'general-purpose' } as any,
      setAppState,
    })

    const task = appState.tasks[registered.taskId] as LocalAgentTaskState
    expect(task).toMatchObject({
      id: 'foreground-agent',
      status: 'running',
      isBackgrounded: false,
      agentType: 'general-purpose',
    })
    expect(task.workflowTaskId).toBeUndefined()

    unregisterAgentForeground(registered.taskId, setAppState)
  })
})
