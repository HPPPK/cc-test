import { expect, test } from 'bun:test'
import { unavailableBetaHeader } from './unsupportedBeta.js'
import { CACHE_EDITING_BETA_HEADER } from './betas.js'

test('private cache editing sends no invented header and refuses an unavailable build feature', () => {
  expect(CACHE_EDITING_BETA_HEADER).toBe('')
  expect(unavailableBetaHeader(false, 'cached microcompact')).toBe('')
  expect(() => unavailableBetaHeader(true, 'cached microcompact')).toThrow('unavailable in this build')
})
