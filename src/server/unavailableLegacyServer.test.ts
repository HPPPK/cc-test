import { expect, test } from 'bun:test'
import { parseConnectUrl } from './parseConnectUrl.js'
import { startServer } from './server.js'
import { SessionManager } from './sessionManager.js'
import { DangerousBackend } from './backends/dangerousBackend.js'
import { createServerLogger } from './serverLog.js'
import { printBanner } from './serverBanner.js'
import { probeRunningServer, removeServerLock, writeServerLock } from './lockfile.js'
import { runConnectHeadless } from './connectHeadless.js'
import { up } from '../cli/up.js'
import { rollback } from '../cli/rollback.js'
import { UnsupportedFeatureError } from '../utils/unsupportedFeature.js'

test('legacy private server entrypoints refuse unavailable operations without changing the maintained server', () => {
  for (const operation of [parseConnectUrl, startServer, createServerLogger, printBanner, probeRunningServer, removeServerLock, writeServerLock, runConnectHeadless, up, rollback]) expect(operation).toThrow(UnsupportedFeatureError)
  expect(() => new DangerousBackend()).toThrow(UnsupportedFeatureError)
})
