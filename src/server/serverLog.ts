import { unsupportedFeature } from '../utils/unsupportedFeature.js'

/** No logger can be obtained for the unavailable legacy server. */
export function createServerLogger(): never { return unsupportedFeature('legacy-direct-connect-logger') }
