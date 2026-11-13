import { unsupportedFeature } from '../utils/unsupportedFeature.js'

/** A disabled private beta has no public header; enabling it requires its real implementation. */
export function unavailableBetaHeader(enabled: boolean, featureName: string): '' {
  if (enabled) return unsupportedFeature(featureName)
  return ''
}
