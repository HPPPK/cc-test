import { expect, test } from 'bun:test'
import { useFrustrationDetection } from './useFrustrationDetection.js'

test('unavailable frustration detection cannot report a successful survey operation', () => {
  expect(() => useFrustrationDetection([], false, false, false)).toThrow('frustration-detection is unavailable in this build')
})
