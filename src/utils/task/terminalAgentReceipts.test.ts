import { expect, test } from 'bun:test'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { TerminalAgentReceiptStore } from './terminalAgentReceipts.js'

function task(id: string, text = 'final'): LocalAgentTaskState {
  return { id, type: 'local_agent', status: 'completed', description: 'Worker',
    messages: [{ huge: true }], abortController: new AbortController(),
    result: { content: [{ type: 'text', text }] } } as unknown as LocalAgentTaskState
}

test('retains only bounded deduplicated terminal receipts and invalidates replacements', () => {
  const cache = new TerminalAgentReceiptStore(() => 'session-a', 2)
  cache.record(task('a'))
  cache.record(task('b'))
  cache.record(task('a', 'updated'))
  cache.record(task('c'))
  expect(cache.get('b')).toBeUndefined()
  expect(cache.get('unknown')).toBeUndefined()
  expect(cache.get('../a')).toBeUndefined()
  expect(cache.get('a')?.output).toBe('updated')
  expect(cache.get('a')).not.toHaveProperty('messages')
  expect(cache.get('a')).not.toHaveProperty('abortController')
  cache.forget('a')
  expect(cache.get('a')).toBeUndefined()
})

test('rejects cross-session reads, nonterminal receipts, and oversized histories', () => {
  let session = 'a'
  const cache = new TerminalAgentReceiptStore(() => session)
  cache.record(task('a', 'x'.repeat(200_000)))
  expect(cache.get('a')!.output.length).toBeLessThan(100_100)
  cache.record({ ...task('running'), status: 'running' })
  expect(cache.get('running')).toBeUndefined()
  session = 'b'
  expect(cache.get('a')).toBeUndefined()
  session = 'a'
  expect(cache.get('a')).toBeUndefined()
})
