import { unsupportedFeature } from '../utils/unsupportedFeature.js'

import type { ServerConfig } from './types.js'
import type { SessionManager } from './sessionManager.js'
export function startServer(_config: ServerConfig, _sessions: SessionManager, _logger: never): { port?: number, stop(closeActiveConnections?: boolean): void } { return unsupportedFeature('legacy-direct-connect-server') }
