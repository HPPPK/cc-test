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
})
