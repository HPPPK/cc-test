import { unsupportedFeature } from '../utils/unsupportedFeature.js'

import type { DirectConnectConfig } from './directConnectManager.js'
export function runConnectHeadless(_config: DirectConnectConfig, _prompt: string, _outputFormat: string, _interactive: boolean): Promise<void> { return unsupportedFeature('legacy-direct-connect-headless') }
