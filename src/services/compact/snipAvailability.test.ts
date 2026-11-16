import { feature } from 'bun:bundle'
import { expect, test } from 'bun:test'
import * as snip from './snipCompact.js'
import * as projection from './snipProjection.js'

test('history snipping reports unavailable and never fabricates a compaction result', () => {
  expect(snip.isSnipRuntimeEnabled()).toBe(false)
  expect(snip.shouldNudgeForSnips([])).toBe(false)
  expect(() => snip.snipCompactIfNeeded([])).toThrow('unavailable')
  expect(() => projection.projectSnippedView([])).toThrow('unavailable')
})

test('public default excludes unavailable internal execution paths', () => {
  expect(feature('HISTORY_SNIP') ? true : false).toBe(false)
  expect(feature('EXPERIMENTAL_SKILL_SEARCH') ? true : false).toBe(false)
  expect(feature('KAIROS') ? true : false).toBe(false)
})
