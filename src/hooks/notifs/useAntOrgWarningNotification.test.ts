import { expect, test } from 'bun:test'
import { useAntOrgWarningNotification } from './useAntOrgWarningNotification.js'
import { UnsupportedFeatureError } from '../../utils/unsupportedFeature.js'

test('internal organization notifications cannot run in this build', () => {
  expect(useAntOrgWarningNotification).toThrow(UnsupportedFeatureError)
})
