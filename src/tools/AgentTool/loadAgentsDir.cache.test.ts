import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { resetSyncCache } from '../../services/remoteManagedSettings/syncCacheState.js'
import {
  getAllowedSettingSources,
  getCwdState,
  setAllowedSettingSources,
  setCwdState,
} from '../../bootstrap/state.js'
import { agentsHandler } from '../../cli/handlers/agents.js'
import { saveAgentToFile } from '../../components/agents/agentFileUtils.js'
import { runWithCwdOverride } from '../../utils/cwd.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import type { SettingSource } from '../../utils/settings/constants.js'
import {
  getManagedFilePath,
  getManagedSettingsDropInDir,
} from '../../utils/settings/managedPath.js'
import { setMdmSettingsCache } from '../../utils/settings/mdm/settings.js'
import { resetSettingsCache } from '../../utils/settings/settingsCache.js'
import {
  clearAgentDefinitionsCache,
  getAgentDefinitionsWithOverrides,
} from './loadAgentsDir.js'

let tmpHome: string
let originalHome: string | undefined
let originalUserProfile: string | undefined
let originalClaudeConfigDir: string | undefined
let originalClaudeCodeSimple: string | undefined
let originalClaudeCodeUseNativeFileSearch: string | undefined
let originalUserType: string | undefined
let originalManagedSettingsPath: string | undefined
let originalCwdState: string
let originalAllowedSettingSources: SettingSource[]

describe('agent definition cache invalidation', () => {
  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-def-cache-'))
    originalHome = process.env.HOME
    originalUserProfile = process.env.USERPROFILE
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    originalClaudeCodeSimple = process.env.CLAUDE_CODE_SIMPLE
    originalClaudeCodeUseNativeFileSearch =
      process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH
    originalUserType = process.env.USER_TYPE
    originalManagedSettingsPath = process.env.CLAUDE_CODE_MANAGED_SETTINGS_PATH
    originalCwdState = getCwdState()
    originalAllowedSettingSources = [...getAllowedSettingSources()]

    process.env.HOME = tmpHome
    process.env.USERPROFILE = tmpHome
    process.env.CLAUDE_CONFIG_DIR = path.join(tmpHome, '.claude')
    delete process.env.CLAUDE_CODE_SIMPLE
    process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH = '1'
    process.env.USER_TYPE = 'ant'
    process.env.CLAUDE_CODE_MANAGED_SETTINGS_PATH = path.join(
      tmpHome,
      'managed-settings',
    )

    getClaudeConfigHomeDir.cache.clear?.()
    getManagedFilePath.cache.clear?.()
    getManagedSettingsDropInDir.cache.clear?.()
    resetSyncCache()
    setMdmSettingsCache(
      { settings: {}, errors: [] },
      { settings: {}, errors: [] },
    )
    resetSettingsCache()
    clearAgentDefinitionsCache()
    setAllowedSettingSources([
      'userSettings',
      'projectSettings',
      'localSettings',
      'flagSettings',
      'policySettings',
    ])
  })

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }

    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE
    } else {
      process.env.USERPROFILE = originalUserProfile
    }

    if (originalClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
    }

    if (originalClaudeCodeSimple === undefined) {
      delete process.env.CLAUDE_CODE_SIMPLE
    } else {
      process.env.CLAUDE_CODE_SIMPLE = originalClaudeCodeSimple
    }

    if (originalClaudeCodeUseNativeFileSearch === undefined) {
      delete process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH
    } else {
      process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH =
        originalClaudeCodeUseNativeFileSearch
    }

    if (originalUserType === undefined) {
      delete process.env.USER_TYPE
    } else {
      process.env.USER_TYPE = originalUserType
    }

    if (originalManagedSettingsPath === undefined) {
      delete process.env.CLAUDE_CODE_MANAGED_SETTINGS_PATH
    } else {
      process.env.CLAUDE_CODE_MANAGED_SETTINGS_PATH = originalManagedSettingsPath
    }

    setCwdState(originalCwdState)
    setAllowedSettingSources(originalAllowedSettingSources)
    getClaudeConfigHomeDir.cache.clear?.()
    getManagedFilePath.cache.clear?.()
    getManagedSettingsDropInDir.cache.clear?.()
    resetSyncCache()
    setMdmSettingsCache(
      { settings: {}, errors: [] },
      { settings: {}, errors: [] },
    )
    resetSettingsCache()
    clearAgentDefinitionsCache()
    await fs.rm(tmpHome, { recursive: true, force: true })
  })

  test('shows a newly-created project agent in the /agents output after an initial cached read', async () => {
    const projectRoot = path.join(tmpHome, 'project')
    await fs.mkdir(projectRoot, { recursive: true })
    setCwdState(projectRoot)

    const agentType = 'cache-created-agent'
    const before = await getAgentDefinitionsWithOverrides(projectRoot)

    expect(before.allAgents.some(agent => agent.agentType === agentType)).toBe(
      false,
    )

    await runWithCwdOverride(projectRoot, () =>
      saveAgentToFile(
        'projectSettings',
        agentType,
        'Use this agent to verify cache invalidation.',
        undefined,
        'You verify cache invalidation.',
        true,
      ),
    )

    await fs.access(path.join(projectRoot, '.claude', 'agents', `${agentType}.md`))
    clearAgentDefinitionsCache()

    const after = await getAgentDefinitionsWithOverrides(projectRoot)

    expect(after.allAgents).toContainEqual(
      expect.objectContaining({
        agentType,
        source: 'projectSettings',
      }),
    )

    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    }
    try {
      await runWithCwdOverride(projectRoot, () => agentsHandler())
    } finally {
      console.log = originalLog
    }

    expect(logs.join('\n')).toContain(agentType)
  })
})
