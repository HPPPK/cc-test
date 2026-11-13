import { describe, expect, test } from 'bun:test'
import { getAgentPendingMessageAttachments, getQueuedCommandAttachments, collectRecentSuccessfulTools, getLatestHumanInputMessage, getPlanModeAttachmentTurnCount, getAutoModeAttachmentTurnCount, getVerifyPlanReminderTurnCount } from './attachments.js'
import { normalizeAttachmentForAPI, createAssistantMessage, createUserMessage } from './messages.js'
import { queuePendingMessage } from '../tasks/LocalAgentTask/LocalAgentTask.js'

describe('queued prompt attachment provenance', () => {
  test('preserves explicit kind and independent flags through the general queue attachment and normalization', async () => {
    const attachments = await getQueuedCommandAttachments([
      { mode: 'prompt', value: 'human quotation', messageKind: 'user_input', isMeta: true },
      { mode: 'prompt', value: 'runtime status', messageKind: 'system_event', isCompactSummary: true, isSynthetic: true },
    ] as any)
    const messages = attachments.flatMap(normalizeAttachmentForAPI)
    expect(messages[0]).toMatchObject({ messageKind: 'user_input', isMeta: true })
    expect(messages[1]).toMatchObject({ messageKind: 'system_event', isCompactSummary: true, isSynthetic: true })
  })

  test('retains human local-agent followups while classifying legacy SendMessage prompts internal', () => {
    let state = { tasks: { fixture: { id: 'fixture', type: 'local_agent', pendingMessages: [] } } } as any
    const set = (update: any) => { state = update(state) }
    queuePendingMessage('fixture', 'legacy runtime followup', set)
    queuePendingMessage('fixture', 'typed followup', set, { messageKind: 'user_input' })
    const attachments = getAgentPendingMessageAttachments({ agentId: 'fixture', getAppState: () => state, setAppState: set } as any)
    const messages = attachments.flatMap(normalizeAttachmentForAPI)
    expect(messages.map(message => message.messageKind)).toEqual(['internal_notification', 'user_input'])
    expect(messages[1]).toMatchObject({ messageKind: 'user_input', isMeta: true })
    expect(messages[1]?.message.content).toContain('typed followup')
    expect(state.tasks.fixture.pendingMessages).toEqual([])
  })
})


function mixedTurns() {
  return [
    createUserMessage({ content: 'actual typed message', messageKind: 'user_input', isMeta: true }),
    createUserMessage({ content: 'generated notification', messageKind: 'internal_notification' }),
    createUserMessage({ content: 'summary', isCompactSummary: true }),
    createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'fixture', content: 'done' }, { type: 'text', text: 'tool context' }] }),
  ]
}

describe('attachment human-turn selectors', () => {
  test('selects the latest actual human input independently of visibility flags', () => {
    const messages = mixedTurns()
    expect(getLatestHumanInputMessage(messages)).toBe(messages[0])
  })

  test('counts actual human turns for plan, auto, and verify reminders', () => {
    const messages = mixedTurns()
    expect(getPlanModeAttachmentTurnCount(messages).turnCount).toBe(1)
    expect(getAutoModeAttachmentTurnCount(messages).turnCount).toBe(1)
    expect(getVerifyPlanReminderTurnCount([{ type: 'attachment', attachment: { type: 'plan_mode_exit' } }, ...messages] as any)).toBe(1)
  })

  test('does not end successful-tool history at a generated user-role notification', () => {
    const previous = createUserMessage({ content: 'previous human', messageKind: 'user_input' })
    const latest = createUserMessage({ content: 'latest human', messageKind: 'user_input' })
    const messages = [previous,
      createAssistantMessage({ content: [{ type: 'tool_use', id: 'one', name: 'Read', input: {} }] }),
      createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'one', content: 'done' }] }),
      createUserMessage({ content: 'runtime update', messageKind: 'internal_notification' }),
      createAssistantMessage({ content: [{ type: 'tool_use', id: 'two', name: 'Edit', input: {} }] }),
      createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'two', content: 'done' }] }), latest]
    expect([...collectRecentSuccessfulTools(messages, latest)].sort()).toEqual(['Edit', 'Read'])
  })
})
