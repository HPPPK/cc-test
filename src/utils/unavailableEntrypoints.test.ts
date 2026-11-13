import { expect, test } from 'bun:test'
import { startEventLoopStallDetector } from './eventLoopStallDetector.js'
import { startSdkMemoryMonitor } from './sdkHeapDumpMonitor.js'
import { createSessionTurnUploader } from './sessionDataUploader.js'
import { parseCcshareId, loadCcshare } from './ccshareResume.js'
import { createSSHSession, createLocalSSHSession } from '../ssh/createSSHSession.js'
import { logHandler, taskCreateHandler } from '../cli/handlers/ant.js'
import { SnapshotUpdateDialog, buildMergePrompt } from '../components/agents/SnapshotUpdateDialog.js'
import { UnsupportedFeatureError } from './unsupportedFeature.js'

test('internal entrypoints fail explicitly instead of returning proxy success', () => {
  for (const operation of [startEventLoopStallDetector, startSdkMemoryMonitor, createSessionTurnUploader, () => parseCcshareId('example'), () => loadCcshare('example'), createSSHSession, createLocalSSHSession, logHandler, taskCreateHandler, SnapshotUpdateDialog, buildMergePrompt]) expect(operation).toThrow(UnsupportedFeatureError)
})
