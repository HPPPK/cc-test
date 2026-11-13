import { expect, test } from 'bun:test'
import { NewInstallWizard, computeDefaultInstallDir } from './assistant.js'
import { UnsupportedFeatureError } from '../../utils/unsupportedFeature.js'
test('unavailable assistant installer neither chooses a path nor reports installation', () => {
  expect(NewInstallWizard).toThrow(UnsupportedFeatureError)
  expect(computeDefaultInstallDir).toThrow(UnsupportedFeatureError)
})
