import { unsupportedFeature } from '../utils/unsupportedFeature.js'

import type { DangerousBackend } from './backends/dangerousBackend.js'
export class SessionManager {
  constructor(_backend: DangerousBackend, _options: { idleTimeoutMs: number, maxSessions: number }) { unsupportedFeature('legacy-direct-connect-sessions') }
  destroyAll(): Promise<void> { return unsupportedFeature('legacy-direct-connect-sessions') }
}
