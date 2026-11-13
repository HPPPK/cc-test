import { expect, test } from 'bun:test'
import { UnsupportedFeatureError, unsupportedFeature } from './unsupportedFeature.js'

test('unsupported features fail explicitly without returning a success value', () => {
  expect(() => unsupportedFeature('fixture')).toThrow(UnsupportedFeatureError)
  expect(() => unsupportedFeature('fixture')).toThrow('fixture is unavailable in this build')
})
