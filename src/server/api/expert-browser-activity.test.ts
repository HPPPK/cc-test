import { describe, expect, test } from 'bun:test'
import { handleExpertBrowserActivityApi } from './expert-browser-activity.js'
import { expertRuntimeSessionStore } from '../services/expertRuntimeSessionStore.js'
import { expertBrowserActivityService } from '../services/expertBrowserActivityService.js'
import { expertHumanVerificationService } from '../services/expertHumanVerificationService.js'

describe('Expert browser show API', () => {
  test('targets the verification owner and waits beyond the bounded Windows native restore', async () => {
    const originalGet = expertRuntimeSessionStore.get
    const originalOwner = expertHumanVerificationService.getActiveBrowserSessionKey
    const originalWait = expertBrowserActivityService.waitForPresentationResult
    const sessionId = 'browser-show-native-test'
    const calls: unknown[][] = []
    try {
      expertRuntimeSessionStore.get = async () => ({ status: 'active', runtimeBinding: { active: true, researchBrowserPolicy: { desktopHumanVerificationHandoff: true, managedPresentationDefault: 'assistable_background' } } }) as never
      expertHumanVerificationService.getActiveBrowserSessionKey = () => 'captcha-owner'
      expertBrowserActivityService.publish(sessionId, { status: 'awaiting_verification', browserKey: 'captcha-owner', connectionKind: 'managed' })
      expertBrowserActivityService.publish(sessionId, { status: 'researching', browserKey: 'sibling', connectionKind: 'managed' })
      expertBrowserActivityService.waitForPresentationResult = async (...args) => { calls.push(args); return false }
      const response = await handleExpertBrowserActivityApi(new Request('http://localhost/api/expert-browser-activity', {
        method: 'POST', body: JSON.stringify({ sessionId, action: 'show' }),
      }), new URL('http://localhost/api/expert-browser-activity'), ['api', 'expert-browser-activity'])
      expect(await response.json()).toMatchObject({ presentationConfirmed: false })
      expect(calls).toHaveLength(1)
      expect(calls[0].slice(0, 3)).toEqual([sessionId, 'captcha-owner', 1])
      // 5s native subprocess plus the 750ms polling interval and CDP round trips.
      expect(calls[0][3] as number).toBeGreaterThanOrEqual(8_000)
      expect(expertBrowserActivityService.getShowGeneration(sessionId, 'sibling')).toBe(0)
    } finally {
      expertRuntimeSessionStore.get = originalGet
      expertHumanVerificationService.getActiveBrowserSessionKey = originalOwner
      expertBrowserActivityService.waitForPresentationResult = originalWait
      expertBrowserActivityService.clear(sessionId)
    }
  })
})
