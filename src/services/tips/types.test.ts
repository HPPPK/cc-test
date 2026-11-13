import { expect, test } from 'bun:test'
import type { Tip, TipContext } from './types.js'

test('tip contracts support themed content and optional relevance context', async () => {
  const tip: Tip = {
    id: 'contract-fixture', cooldownSessions: 3,
    content: async ({ theme }) => `theme: ${theme}`,
    isRelevant: async context => context?.bashTools?.has('git') ?? false,
  }
  const context: TipContext = { theme: 'dark', bashTools: new Set(['git']) }
  expect(await tip.content(context)).toBe('theme: dark')
  expect(await tip.isRelevant(context)).toBe(true)
  expect(await tip.isRelevant()).toBe(false)
})
