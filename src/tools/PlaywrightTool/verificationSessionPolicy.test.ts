import { describe, expect, test } from 'bun:test'
import { buildSharedVerificationBlockedResult, shouldSchedulePlaywrightIdleClose } from './verificationSessionPolicy.js'

describe('Playwright verification session policy', () => {
  test('does not schedule idle closure while a human verification page is waiting', () => {
    expect(shouldSchedulePlaywrightIdleClose(true)).toBe(false)
  })

  test('returns to ordinary idle cleanup once verification is resolved', () => {
    expect(shouldSchedulePlaywrightIdleClose(false)).toBe(true)
  })

  test('keeps the verification owner page out of a blocked sibling result', () => {
    const ownerUrl = 'https://s.weibo.com/weibo?q=Quicker'
    const result = buildSharedVerificationBlockedResult({
      actions: [
        { type: 'navigate', url: 'https://data.qq.com/article/market-report' },
        { type: 'extract' },
      ],
    }, {
      gateId: 'gate-weibo',
      finalUrl: ownerUrl,
      verificationKind: 'Weibo human verification',
    }, ownerUrl)

    expect(result).toEqual({
      url: 'https://data.qq.com/article/market-report',
      title: '',
      text: '',
      links: [],
      steps: [],
      accessLimited: true,
      verificationGateId: 'gate-weibo',
      sharedHumanVerificationBlocked: true,
      error: expect.stringContaining('This request was not executed'),
    })
    expect(JSON.stringify(result)).not.toContain(ownerUrl)
  })
})

test('elapsed time never releases an unresolved verification gate or its page ownership', async () => {
  const { expireHumanVerificationGate } = await import('./verificationSessionPolicy.js')
  const page = { closed: false }
  const gate = { createdAt: 10 }
  const session = { page, ownedPages: new Set([page]), humanVerificationGate: gate, preservedVerificationPages: new Set<typeof page>() }
  expect(expireHumanVerificationGate(session, 10 + 24 * 60 * 60_000)).toBe(false)
  expect(session.humanVerificationGate).toBe(gate)
  expect(session.preservedVerificationPages.has(page)).toBe(false)
  expect(session.ownedPages.has(page)).toBe(true)
  expect(page.closed).toBe(false)
})
