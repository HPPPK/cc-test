import { expect, test } from 'bun:test'
import { isContextCollapseEnabled, initContextCollapse, resetContextCollapse, getStats } from './index.js'
import { projectView } from './operations.js'
import { restoreFromEntries } from './persist.js'

test('context collapse is absent and unsupported paths cannot claim success', () => {
  expect(isContextCollapseEnabled()).toBe(false)
  for (const operation of [initContextCollapse, resetContextCollapse, getStats, () => projectView([]), () => restoreFromEntries([], undefined)]) {
    expect(operation).toThrow('context-collapse is unavailable in this build')
  }
})
