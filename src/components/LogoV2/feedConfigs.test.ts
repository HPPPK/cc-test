import { expect, test } from 'bun:test'
import { createWhatsNewFeed } from './feedConfigs.js'

test('external release feed preserves release text without internal commit timestamps', () => {
  const feed = createWhatsNewFeed(['3 hours ago Added a feature', 'Fixed a regression'])
  expect(feed.lines).toEqual([{ text: '3 hours ago Added a feature' }, { text: 'Fixed a regression' }])
})
