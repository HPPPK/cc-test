import { expect, test } from 'bun:test'
import type { BetaToolResultBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { roughTokenCountEstimationForMessage } from './tokenEstimation.js'

test('token estimates accept beta tool references nested inside tool results', () => {
  const result: BetaToolResultBlockParam = { type: 'tool_result', tool_use_id: 'fixture-tool', content: [{ type: 'tool_reference', tool_name: 'Read' }, { type: 'text', text: 'A short result' }] }
  const tokens = roughTokenCountEstimationForMessage({ type: 'user', message: { content: [result] } })
  expect(tokens).toBeGreaterThan(0)
  expect(Number.isFinite(tokens)).toBe(true)
})
