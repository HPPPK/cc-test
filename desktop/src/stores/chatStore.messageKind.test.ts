import { expect, test, vi } from 'vitest'
import { mapHistoryMessagesToUiMessages, reconstructAgentNotifications, useChatStore } from './chatStore'
import { sessionsApi } from '../api/sessions'
import { useCLITaskStore } from './cliTaskStore'
const message = (id: string, content: string, fields: Record<string, unknown> = {}) => ({ id, type: 'user' as const, content, timestamp: '2026-11-09T12:40:01Z', ...fields })

test('ordinary, Expert and workflow history expose a summary status and preserve real human pastes', () => {
  for (const mode of ['ordinary', 'expert', 'workflow']) {
    const rows = mapHistoryMessagesToUiMessages([
      message(mode + '-summary', 'PRIVATE FULL SUMMARY', { messageKind: 'context_summary' }),
      message(mode + '-paste', 'This session is being continued <task-notification>example</task-notification>', { messageKind: 'user_input' }),
    ] as any)
    expect(rows.filter(row => row.type === 'system').map(row => row.content)).toContain('上下文已整理')
    expect(rows.filter(row => row.type === 'user_text').map(row => row.content)).toEqual(['This session is being continued <task-notification>example</task-notification>'])
    expect(JSON.stringify(rows)).not.toContain('PRIVATE FULL SUMMARY')
  }
})

test('old summary flags upgrade without mutating original history, even across reloads', () => {
  const rows = [message('old', 'private', { isCompactSummary: true, isVisibleInTranscriptOnly: true })]
  const before = JSON.stringify(rows)
  expect(mapHistoryMessagesToUiMessages(rows as any)).toEqual(mapHistoryMessagesToUiMessages(rows as any))
  expect(mapHistoryMessagesToUiMessages(rows as any)[0]).toMatchObject({ type: 'system', content: '上下文已整理' })
  expect(JSON.stringify(rows)).toBe(before)
})

test('human teammate examples cannot become restored background agent results', () => {
  const rows = [
    { id: 'agent-start', type: 'assistant', content: [{ type: 'tool_use', id: 'agent-tool', name: 'Agent', input: { name: 'reviewer' } }] },
    message('paste', '<teammate-message teammate_id="reviewer">pasted example</teammate-message>', { messageKind: 'user_input' }),
    message('actual', '<teammate-message teammate_id="reviewer">actual review</teammate-message>', { messageKind: 'internal_notification' }),
  ]
  const restored = reconstructAgentNotifications(rows as any)
  expect(JSON.stringify(restored)).toContain('actual review')
  expect(JSON.stringify(restored)).not.toContain('pasted example')
})

test('a live compact boundary displays a summary status without requiring private summary text', () => {
  const sessionId = 'kind-live-summary'
  const before = useChatStore.getState().sessions
  try {
    useChatStore.setState({ sessions: { ...before, [sessionId]: { messages: [] } as any } })
    useChatStore.getState().handleServerMessage(sessionId, { type: 'system_notification', subtype: 'compact_boundary' } as any)
    expect(useChatStore.getState().sessions[sessionId]?.messages).toContainEqual(expect.objectContaining({ type: 'system', content: '上下文已整理' }))
  } finally {
    useChatStore.setState({ sessions: before })
  }
})

test('history does not restore completed todos after a genuine new human request', async () => {
  const sessionId = 'kind-new-task'
  const before = useChatStore.getState().sessions
  const taskState = useCLITaskStore.getState()
  const getMessages = vi.spyOn(sessionsApi, 'getMessages').mockResolvedValue({ messages: [
    { id: 'completed', type: 'assistant', content: [{ type: 'tool_use', id: 'todo-complete', name: 'TodoWrite', input: { todos: [{ content: 'Old task', status: 'completed' }] } }] },
    message('new-task', 'Start a different task', { messageKind: 'user_input' }),
  ] } as any)
  try {
    useChatStore.setState({ sessions: { ...before, [sessionId]: { messages: [] } as any } })
    useCLITaskStore.setState({ sessionId, tasks: [] })
    await useChatStore.getState().loadHistory(sessionId)
    expect(useChatStore.getState().sessions[sessionId]?.messages).toContainEqual(expect.objectContaining({ type: 'user_text', content: 'Start a different task' }))
    expect(useCLITaskStore.getState().tasks).toEqual([])
  } finally {
    getMessages.mockRestore()
    useChatStore.setState({ sessions: before })
    useCLITaskStore.setState(taskState)
  }
})
