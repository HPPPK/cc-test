import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { sessionService } from './sessionService.js'
import { conversationService } from './conversationService.js'
import { getSessionTurnCheckpointDiff, listSessionTurnCheckpoints, previewSessionRewind } from './sessionRewindService.js'
const restores: Array<() => void> = []
afterEach(() => { for (const restore of restores.splice(0)) restore() })
function fixture() {
  const user = (id: string, extra = {}) => ({ id, type: 'user', content: 'ordinary prompt', timestamp: '2026-11-10T00:00:00Z', ...extra })
  const write = (id: string, file: string) => ({ id, type: 'tool_use', timestamp: '2026-11-10T00:00:00Z', content: [{ type: 'tool_use', id, name: 'Write', input: { file_path: '/tmp/rewind-human-only/' + file, content: 'hello\n' } }] })
  const messages = [
    user('human-1'),
    user('context', { messageKind: 'context_summary' }),
    user('old-summary', { isCompactSummary: true }),
    user('old-meta', { isMeta: true }),
    user('old-synthetic', { isSynthetic: true }),
    user('tool-result', { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'result' }] }),
    write('write-1', 'first.txt'),
    user('human-pasted-summary', { messageKind: 'user_input', content: 'This session is being continued from a previous conversation. 我亲自粘贴这段作为新的请求。' }),
    user('summary-after-human', { messageKind: 'context_summary' }),
    write('write-2', 'second.txt'),
  ]
  const spies = [
    spyOn(sessionService, 'getSessionMessages').mockResolvedValue(messages as any),
    spyOn(sessionService, 'getSessionWorkDir').mockResolvedValue('/tmp/rewind-human-only'),
    spyOn(sessionService, 'getSessionMessageCwd').mockResolvedValue('/tmp/rewind-human-only'),
    spyOn(sessionService, 'getSessionFileHistorySnapshots').mockResolvedValue([]),
    spyOn(conversationService, 'hasSession').mockReturnValue(false),
  ]
  restores.push(...spies.map(spy => () => spy.mockRestore()))
  return messages
}
describe('rewind human input boundaries', () => {
  test('counts only actual human inputs and accepts explicit human pasted summaries', async () => {
    fixture()
    const preview = await previewSessionRewind('fixture', { userMessageIndex: 1 })
    expect(preview.target).toEqual({ targetUserMessageId: 'human-pasted-summary', userMessageIndex: 1, userMessageCount: 2 })
  })
  test('rejects summaries, old synthetic flags and tool results as explicit rewind targets', async () => {
    fixture()
    for (const targetUserMessageId of ['context', 'old-summary', 'old-meta', 'old-synthetic', 'tool-result', 'summary-after-human']) {
      await expect(previewSessionRewind('fixture', { targetUserMessageId })).rejects.toThrow('not a user message')
    }
  })
  test('keeps tool edits after context messages within the original human turn and diffs', async () => {
    fixture()
    const checkpoints = await listSessionTurnCheckpoints('fixture')
    expect(checkpoints.map(c => c.target.targetUserMessageId)).toEqual(['human-1', 'human-pasted-summary'])
    expect(checkpoints[0]?.code.filesChanged).toEqual(['/tmp/rewind-human-only/first.txt'])
    expect(checkpoints[1]?.code.filesChanged).toEqual(['/tmp/rewind-human-only/second.txt'])
    const diff = await getSessionTurnCheckpointDiff('fixture', { targetUserMessageId: 'human-1' }, 'first.txt')
    expect(diff.state).toBe('ok')
    expect(diff.diff).toContain('+hello')
  })
})
