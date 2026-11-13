import { expect, test } from 'bun:test'
import { isSkillSearchEnabled } from './featureCheck.js'
import { getTurnZeroSkillDiscovery, startSkillDiscoveryPrefetch, collectSkillDiscoveryPrefetch } from './prefetch.js'

test('internal skill search never claims to be available in public builds', async () => {
  expect(isSkillSearchEnabled()).toBe(false)
  await expect(getTurnZeroSkillDiscovery('', [], {} as never)).rejects.toThrow('unavailable')
  expect(() => startSkillDiscoveryPrefetch(null, [], {} as never)).toThrow('unavailable')
  await expect(collectSkillDiscoveryPrefetch(Promise.resolve([]))).rejects.toThrow('unavailable')
})
