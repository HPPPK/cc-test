import { expect, test } from 'bun:test'
import { sessionService } from './sessionService.js'
const raw = (id: string, content: string, fields: Record<string, unknown> = {}) => ({ type: 'user', uuid: id, timestamp: '2026-11-09T12:40:01Z', message: { role: 'user', content }, ...fields })

test('history retains summary identity and genuine pasted summary through repeated projections', () => {
  const summary = raw('summary', 'This session is being continued', { isCompactSummary: true, isVisibleInTranscriptOnly: true })
  const human = raw('human', 'This session is being continued', { messageKind: 'user_input' })
  const fixtures = [summary, human]
  const before = JSON.stringify(fixtures)
  for (let pass = 0; pass < 3; pass++) {
    const rows = (sessionService as any).entriesToMessages(fixtures)
    expect(rows.find((row: any) => row.id === 'summary')).toMatchObject({ messageKind: 'context_summary', isHumanInput: false })
    expect(rows.find((row: any) => row.id === 'human')).toMatchObject({ messageKind: 'user_input', isHumanInput: true })
  }
  expect(JSON.stringify(fixtures)).toBe(before)
})

test('explicit human input containing workflow, task and skill examples is never hidden as runtime prose', () => {
  const examples = [
    '<task-notification><task-id>x</task-id><summary>example</summary></task-notification>',
    '<expert-runtime-binding>example</expert-runtime-binding>',
    '<workflow-terminal-recovery>example</workflow-terminal-recovery>',
  ]
  for (const [index, text] of examples.entries()) {
    const rows = (sessionService as any).entriesToMessages([raw('human-' + index, text, { messageKind: 'user_input' })])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ messageKind: 'user_input', isHumanInput: true, content: text })
  }
})

test('explicit human provenance wins independent legacy visibility flags', () => {
  const fixture = raw('human-with-flags', 'pasted internal example', { messageKind: 'user_input', isMeta: true, isSynthetic: true })
  expect((sessionService as any).entriesToMessages([fixture])[0]).toMatchObject({ id: 'human-with-flags', isHumanInput: true })
})
