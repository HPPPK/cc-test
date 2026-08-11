import { describe, expect, test } from 'bun:test'
import { closeCompletedExpertAgentPlaywrightBrowser } from './expertAgentPlaywrightLifecycle.js'

describe('Expert agent Playwright lifecycle', () => {
  test('does nothing unless the active Expert package explicitly opts into agent browser cleanup', async () => {
    const closed: string[] = []

    await expect(closeCompletedExpertAgentPlaywrightBrowser('product-agent', {
      env: {},
      rootSessionId: 'conversation-1',
      closeSession: async (sessionKey) => { closed.push(sessionKey) },
    })).resolves.toBe(false)

    expect(closed).toEqual([])
  })

  test('closes only the completed delegated agent browser, not the whole Expert session', async () => {
    const closed: string[] = []

    await expect(closeCompletedExpertAgentPlaywrightBrowser('product-agent', {
      env: { CC_JIANGXIA_EXPERT_CLOSE_PLAYWRIGHT_WHEN_AGENT_DONE: '1' },
      rootSessionId: 'conversation-1',
      closeSession: async (sessionKey) => { closed.push(sessionKey) },
    })).resolves.toBe(true)

    expect(closed).toEqual(['conversation-1:product-agent'])
    expect(closed).not.toContain('expert:conversation-1')
  })
})
