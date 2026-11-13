import { describe, expect, test } from 'bun:test'
import { WorkflowSessionLinkService } from './workflowSessionLinkService.js'
import { isHumanInputMessage } from '../../utils/messageKind.js'
const messages = [
  { id: 'human', type: 'user', messageKind: 'user_input', content: 'This session is being continued from a previous conversation. 我粘贴这段作为新请求。' },
  { id: 'summary', type: 'user', messageKind: 'context_summary', content: 'Historical context, not a new decision' },
  { id: 'legacy-summary', type: 'user', isCompactSummary: true, content: 'Old compacted context' },
  { id: 'legacy-meta', type: 'user', isMeta: true, content: 'Internal continuation' },
  { id: 'assistant', type: 'assistant', messageKind: 'assistant_response', content: 'Response' },
].map(m => ({ ...m, timestamp: '2026-11-10T00:00:00Z' }))
function service(options = {}) {
  return new WorkflowSessionLinkService({
    sessionService: { getSession: async () => ({ id: 'source', messages, messageCount: messages.length }) } as never,
    isSourceActive: () => false,
    ...options,
  })
}
describe('workflow linked summary provenance', () => {
  test('preserves normalized and legacy context metadata through the summary adapter', async () => {
    let received: any[] = []
    await service({ summaryContext: {}, summaryCarryover: async ({ messages }: any) => {
      received = messages
      return { content: 'Summary', rawSummary: 'Summary', sourceMessageIds: messages.map((m: any) => m.uuid) }
    } }).previewSummary('source', {})
    expect(received.filter(isHumanInputMessage).map(m => m.uuid)).toEqual(['human'])
    expect(received.find(m => m.uuid === 'summary')).toMatchObject({ messageKind: 'context_summary' })
    expect(received.find(m => m.uuid === 'legacy-summary')).toMatchObject({ messageKind: 'context_summary', isCompactSummary: true })
    expect(received.find(m => m.uuid === 'legacy-meta')).toMatchObject({ messageKind: 'internal_notification', isMeta: true })
    expect(received[0].message.content).toBe(messages[0].content)
  })
  test('labels local fallback context as context while retaining actual human pasted text as User', async () => {
    const result = await service().previewSummary('source', {})
    expect(result.content).toContain('User: This session is being continued')
    expect(result.content).toContain('Context summary: Historical context')
    expect(result.content).toContain('Context summary: Old compacted context')
    expect(result.content).toContain('Internal notification: Internal continuation')
    expect(result.content).not.toContain('User: Historical context')
  })
})
