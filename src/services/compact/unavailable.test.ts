import { expect, test } from 'bun:test'
import { isReactiveCompactEnabled, isReactiveOnlyMode, reactiveCompactOnPromptTooLong } from './reactiveCompact.js'
import { isCachedMicrocompactEnabled, isModelSupportedForCacheEditing, createCachedMCState } from './cachedMicrocompact.js'

test('unavailable compact variants never enable or return invented state', () => {
  expect(isReactiveCompactEnabled()).toBe(false)
  expect(isReactiveOnlyMode()).toBe(false)
  expect(isCachedMicrocompactEnabled()).toBe(false)
  expect(isModelSupportedForCacheEditing('example')).toBe(false)
  expect(reactiveCompactOnPromptTooLong).toThrow('reactive-compact is unavailable in this build')
  expect(createCachedMCState).toThrow('cached-microcompact is unavailable in this build')
})
