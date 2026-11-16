import type { AttributionData, AttributionState } from './commitAttribution.js'
import { unsupportedFeature } from './unsupportedFeature.js'
export function buildPRTrailers(_data: AttributionData, _state?: AttributionState): string[] { return unsupportedFeature('commit-attribution-trailers') }
