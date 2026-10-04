import { describe, expect, test } from 'bun:test'
import { ExpertBrowserActivityService } from './expertBrowserActivityService.js'

describe('ExpertBrowserActivityService', () => {
  test('keeps only safe page labels and a bounded recent-target list in ephemeral activity', () => {
    const service = new ExpertBrowserActivityService()

    const initial = service.publish('commercialization-session', {
      status: 'researching',
      currentTarget: 'https://www.google.com/search?q=private+research',
      checkedTarget: 'https://typora.io/#download',
      connectionKind: 'managed',
    })
    service.publish('commercialization-session', {
      status: 'completed',
      checkedTarget: 'https://obsidian.md/pricing?campaign=private',
    })
    service.publish('commercialization-session', {
      status: 'completed',
      checkedTarget: 'https://ia.net/writer',
    })
    const final = service.publish('commercialization-session', {
      status: 'completed',
      checkedTarget: 'https://marked2app.com/pricing',
    })

    expect(initial).toMatchObject({
      status: 'researching',
      currentTarget: 'google.com/search',
      checkedTargets: ['typora.io'],
      connectionKind: 'managed',
    })
    expect(final.checkedTargets).toEqual(['obsidian.md/pricing', 'ia.net/writer', 'marked2app.com/pricing'])
    expect(JSON.stringify(final)).not.toContain('private+research')
    expect(JSON.stringify(final)).not.toContain('campaign=private')
  })

  test('increments a show request without persisting it as user browser history and clears on session exit', () => {
    const service = new ExpertBrowserActivityService()
    service.publish('commercialization-session', {
      status: 'awaiting_verification',
      currentTarget: 'https://www.baidu.com/s?wd=markdown',
      connectionKind: 'managed',
    })

    expect(service.getShowGeneration('commercialization-session')).toBe(0)
    expect(service.requestShow('commercialization-session')).toMatchObject({
      status: 'awaiting_verification',
      currentTarget: 'baidu.com/s',
    })
    expect(service.getShowGeneration('commercialization-session')).toBe(1)

    service.clear('commercialization-session')
    expect(service.getShowGeneration('commercialization-session')).toBe(0)
    expect(service.requestShow('commercialization-session')).toBeNull()
  })

  test('exposes the latest browser key only to the trusted server route and clears it on session exit', () => {
    const service = new ExpertBrowserActivityService()
    service.publish('commercialization-session', {
      status: 'awaiting_verification',
      currentTarget: 'https://www.google.com/sorry/index',
      connectionKind: 'managed',
      browserKey: 'verification-owner',
    })
    service.publish('commercialization-session', {
      status: 'researching',
      currentTarget: 'https://www.example.com/',
      connectionKind: 'managed',
      browserKey: 'latest-worker',
    })

    expect(service.getLatestBrowserKey('commercialization-session')).toBe('latest-worker')
    service.clear('commercialization-session')
    expect(service.getLatestBrowserKey('commercialization-session')).toBeNull()
  })

  test('acknowledges only the exact requested browser show generation', async () => {
    const service = new ExpertBrowserActivityService()
    service.publish('commercialization-session', {
      status: 'awaiting_verification',
      currentTarget: 'https://www.google.com/sorry/index',
      connectionKind: 'managed',
      browserKey: 'captcha-owner',
    })
    service.requestShow('commercialization-session', 'captcha-owner')
    const generation = service.getShowGeneration('commercialization-session', 'captcha-owner')
    const waiting = service.waitForPresentationResult('commercialization-session', 'captcha-owner', generation)

    expect(service.reportPresentationResult('commercialization-session', 'captcha-owner', generation - 1, true)).toBe(false)
    expect(service.reportPresentationResult('commercialization-session', 'captcha-owner', generation, false)).toBe(true)
    await expect(waiting).resolves.toBe(false)
  })

  test('keeps activity API payload serializable after recording a window-presentation acknowledgement', () => {
    const service = new ExpertBrowserActivityService()
    service.publish('commercialization-session', {
      status: 'awaiting_verification',
      currentTarget: 'https://www.bing.com/ck/a',
      connectionKind: 'managed',
      browserKey: 'captcha-owner',
    })
    service.requestShow('commercialization-session', 'captcha-owner')
    const generation = service.getShowGeneration('commercialization-session', 'captcha-owner')
    service.reportPresentationResult('commercialization-session', 'captcha-owner', generation, false)

    const payload = service.publish('commercialization-session', {
      status: 'awaiting_verification',
      browserKey: 'captcha-owner',
    })
    expect(() => Response.json({ activity: payload })).not.toThrow()
    expect(payload).not.toHaveProperty('presentationResultsByBrowserKey')
  })

  test('increments verification checks only for the targeted pending browser key', () => {
    const service = new ExpertBrowserActivityService()
    service.publish('commercialization-session', {
      status: 'awaiting_verification',
      currentTarget: 'https://www.baidu.com/s?wd=markdown',
      connectionKind: 'managed',
      browserKey: 'browser-current-modal',
    })
    service.publish('commercialization-session', {
      status: 'researching',
      currentTarget: 'https://www.bing.com/search?q=markdown',
      connectionKind: 'managed',
      browserKey: 'browser-other-worker',
    })

    service.requestVerificationCheck('commercialization-session', 'browser-current-modal')
    expect(service.getVerificationCheckGeneration('commercialization-session', 'browser-current-modal')).toBe(1)
    expect(service.getVerificationCheckGeneration('commercialization-session', 'browser-other-worker')).toBe(0)
  })

})
