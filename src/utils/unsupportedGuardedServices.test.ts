import { expect, test } from 'bun:test'
import { clearAttributionCaches, registerAttributionHooks, sweepFileContentCache } from './attributionHooks.js'
import { watchSystemTheme } from './systemThemeWatcher.js'
import { startUdsMessaging, getDefaultUdsSocketPath } from './udsMessaging.js'
import { installPrepareCommitMsgHook } from './postCommitAttribution.js'
import { clearSkillIndexCache } from '../services/skillSearch/localSearch.js'
import { fetchMcpSkillsForClient } from '../skills/mcpSkills.js'
import { logMemoryRecallShape, logMemoryWriteShape } from '../memdir/memoryShapeTelemetry.js'
import { classifyAndWriteState } from '../jobs/classifier.js'
import { UnsupportedFeatureError } from './unsupportedFeature.js'

test('guarded services refuse unavailable mutations, uploads and registrations', () => {
  for (const operation of [clearAttributionCaches, registerAttributionHooks, sweepFileContentCache, watchSystemTheme, startUdsMessaging, getDefaultUdsSocketPath, installPrepareCommitMsgHook, clearSkillIndexCache, fetchMcpSkillsForClient, () => fetchMcpSkillsForClient.cache.delete('fixture'), logMemoryRecallShape, logMemoryWriteShape, classifyAndWriteState]) expect(operation).toThrow(UnsupportedFeatureError)
})
