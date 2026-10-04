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

test('expired verification parks its page and releases the shared lock without closing or verifying it', async () => {
  const { expireHumanVerificationGate, HUMAN_VERIFICATION_WAIT_MS } = await import('./verificationSessionPolicy.js')
  const page = { closed: false }
  const session = { page, ownedPages: new Set([page]), humanVerificationGate: { createdAt: 10 }, preservedVerificationPages: new Set<typeof page>() }
  expect(expireHumanVerificationGate(session, 10 + HUMAN_VERIFICATION_WAIT_MS - 1)).toBe(false)
  expect(expireHumanVerificationGate(session, 10 + HUMAN_VERIFICATION_WAIT_MS)).toBe(true)
  expect(session.humanVerificationGate).toBeUndefined()
  expect(session.preservedVerificationPages.has(page)).toBe(true)
  expect(session.ownedPages.has(page)).toBe(false)
  expect(page.closed).toBe(false)
})
