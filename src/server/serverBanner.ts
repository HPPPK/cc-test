import { unsupportedFeature } from '../utils/unsupportedFeature.js'

import type { ServerConfig } from './types.js'
export function printBanner(_config: ServerConfig, _authToken: string, _actualPort: number): void { return unsupportedFeature('legacy-direct-connect-banner') }
