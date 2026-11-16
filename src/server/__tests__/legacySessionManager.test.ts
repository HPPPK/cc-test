import { expect, test } from 'bun:test'
import { SessionManager } from '../sessionManager.js'

test('legacy session-manager creation and cleanup explicitly reject without a backend operation', () => {
  expect(() => new SessionManager({}, { idleTimeoutMs: 100, maxSessions: 1 })).toThrow('legacy-direct-connect-sessions is unavailable')
  // Even a cleanup caller holding the legacy prototype cannot pretend sessions were destroyed.
  expect(() => SessionManager.prototype.destroyAll()).toThrow('legacy-direct-connect-sessions is unavailable')
})
