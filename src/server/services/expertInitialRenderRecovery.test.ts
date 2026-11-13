import { expect, test } from 'bun:test'
import { latestInitialRenderAttempt } from './expertInitialRenderRecovery.js'
import type { MessageEntry } from './sessionService.js'

const call = (id: string, command = 'claude expert-template-fill --data-stdin'): MessageEntry => ({ id, type: 'tool_use', timestamp: id, content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] })
const result = (id: string, error = true): MessageEntry => ({ id: id + '-result', type: 'tool_result', timestamp: id, content: [{ type: 'tool_result', tool_use_id: id, is_error: error, content: 'EXPERT_RESEARCH_BUDGET_REJECTED: missing identity' }] })

test('reads actual parent render outcomes, excluding schema calls and sidechain failures', () => {
  expect(latestInitialRenderAttempt([call('a'), result('a')])).toMatchObject({ id: 'a', errorCode: 'EXPERT_RESEARCH_BUDGET_REJECTED' })
  expect(latestInitialRenderAttempt([call('a'), result('a'), call('schema', 'claude expert-template-fill --schema'), result('schema')])?.id).toBe('a')
  expect(latestInitialRenderAttempt([call('a'), result('a'), { ...call('child'), parentToolUseId: 'parent' }, { ...result('child'), parentToolUseId: 'parent' }])?.id).toBe('a')
  expect(latestInitialRenderAttempt([call('a'), result('a', false)])).toEqual({ id: 'a' })
  expect(latestInitialRenderAttempt([call('a'), { ...result('a'), content: [{ type: 'tool_result', tool_use_id: 'a', is_error: true, content: [{ type: 'text', text: 'arbitrary shell error' }] }] }])?.errorCode).toBe('EXPERT_INITIAL_RENDER_TOOL_ERROR')
  expect(latestInitialRenderAttempt([result('unknown')])).toBeUndefined()
})

test('different field errors sharing a code are distinguishable for recovery', () => {
  const first = latestInitialRenderAttempt([call('a'), result('a')])
  const changed = latestInitialRenderAttempt([call('b'), { ...result('b'), content: [{ type: 'tool_result', tool_use_id: 'b', is_error: true, content: 'EXPERT_RESEARCH_BUDGET_REJECTED: a different actionable cause' }] }])
  expect(first?.failureFingerprint).toBeDefined()
  expect(changed?.failureFingerprint).not.toBe(first?.failureFingerprint)
})

test('duplicate legacy result wrappers do not manufacture a new tool attempt', () => {
  const first = latestInitialRenderAttempt([call('a'), result('a')])
  const duplicate = latestInitialRenderAttempt([call('a'), { ...result('a'), id: 'regenerated-legacy-wrapper' }])
  expect(duplicate?.id).toBe(first?.id)
})
