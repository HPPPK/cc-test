import { expect, test } from 'bun:test'
import { daemonMain } from '../daemon/main.js'
import { runDaemonWorker } from '../daemon/workerRegistry.js'
import { psHandler, logsHandler, attachHandler, killHandler, handleBgFlag } from './bg.js'
import { templatesMain } from './handlers/templateJobs.js'
import { environmentRunnerMain } from '../environment-runner/main.js'
import { selfHostedRunnerMain } from '../self-hosted-runner/main.js'
import { UnsupportedFeatureError } from '../utils/unsupportedFeature.js'

test('disabled process entry modes fail without starting workers or claiming work', () => {
  for (const entrypoint of [() => daemonMain([]), () => runDaemonWorker('assistant'), () => psHandler([]), () => logsHandler('session'), () => attachHandler('session'), () => killHandler('session'), () => handleBgFlag([]), () => templatesMain([]), () => environmentRunnerMain([]), () => selfHostedRunnerMain([])]) expect(entrypoint).toThrow(UnsupportedFeatureError)
})
