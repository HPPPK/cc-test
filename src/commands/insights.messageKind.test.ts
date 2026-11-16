import { describe, expect, test } from 'bun:test'
import { extractToolStats, formatTranscriptForFacets, logToSessionMeta } from './insights.js'
import { createUserMessage } from '../utils/messages.js'

function sessionLog() {
  return {
    created: new Date('2026-01-01T00:00:00Z'), modified: new Date('2026-01-01T00:01:00Z'), projectPath: '/fixture',
    messages: [
      { type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: { content: [{ type: 'text', text: 'assistant reply' }], usage: { input_tokens: 10, output_tokens: 5 } } },
      createUserMessage({ content: 'generated notification', messageKind: 'internal_notification', timestamp: '2026-01-01T00:00:05Z' }),
      createUserMessage({ content: 'typed feedback', messageKind: 'user_input', isMeta: true, timestamp: '2026-01-01T00:00:10Z' }),
      createUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'fixture', content: 'error exit code 1', is_error: true }, { type: 'text', text: 'tool context' }], timestamp: '2026-01-01T00:00:12Z' }),
      createUserMessage({ content: 'summary context', isCompactSummary: true, timestamp: '2026-01-01T00:00:15Z' }),
    ],
  } as any
}

describe('insights human-message semantics', () => {
  test('counts human messages and timing without changing transport tool or token statistics', () => {
    const log = sessionLog()
    const stats = extractToolStats(log)
    expect(stats.userMessageTimestamps).toEqual(['2026-01-01T00:00:10Z'])
    expect(stats.userResponseTimes).toEqual([10])
    expect(stats.inputTokens).toBe(10)
    expect(stats.outputTokens).toBe(5)
    expect(stats.toolErrors).toBe(1)
    expect(logToSessionMeta(log)).toMatchObject({ user_message_count: 1, assistant_message_count: 1 })
  })

  test('counts explicit human commands and image-only input without role or text heuristics', () => {
    const log = sessionLog()
    log.messages = [
      { type: 'system', messageKind: 'user_input', content: '/typed-command', timestamp: '2026-01-01T00:00:20Z' },
      createUserMessage({ messageKind: 'user_input', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } }], timestamp: '2026-01-01T00:00:25Z' }),
    ]
    expect(logToSessionMeta(log).user_message_count).toBe(2)
    expect(extractToolStats(log).userMessageTimestamps).toEqual(['2026-01-01T00:00:20Z', '2026-01-01T00:00:25Z'])
    expect(formatTranscriptForFacets(log)).toContain('[User]: /typed-command')
  })

  test('does not present internal messages as user statements to facet analysis', () => {
    const transcript = formatTranscriptForFacets(sessionLog())
    expect(transcript).toContain('[User]: typed feedback')
    expect(transcript).not.toContain('[User]: generated notification')
    expect(transcript).not.toContain('[User]: summary context')
    expect(transcript).not.toContain('[User]: tool context')
  })
})
