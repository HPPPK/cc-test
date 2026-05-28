import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  getAllowedSettingSources,
  getFlagSettingsInline,
  getFlagSettingsPath,
  setAllowedSettingSources,
  setFlagSettingsInline,
  setFlagSettingsPath,
} from '../../bootstrap/state.js'
import { resetSyncCache } from '../../services/remoteManagedSettings/syncCache.js'
import { getGlobalClaudeFile } from '../env.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'
import {
  applyConfigEnvironmentVariables,
  applySafeConfigEnvironmentVariables,
} from '../managedEnv.js'
import { getGlobalConfig, saveGlobalConfig } from '../config.js'
import { resetSettingsCache } from '../settings/settingsCache.js'
import type { SettingSource } from '../settings/constants.js'

const ENV_KEYS = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_MODEL',
  'CC_HAHA_SEND_DISABLED_THINKING',
  'CC_JIANGXIA_SEND_DISABLED_THINKING',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_LOCAL_SKIP_REMOTE_PREFETCH',
  'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
  'CLAUDE_CONFIG_DIR',
  'HOME',
  'USERPROFILE',
] as const

let tempDir: string
let originalEnv: Record<(typeof ENV_KEYS)[number], string | undefined>
let originalAllowedSettingSources: SettingSource[]
let originalFlagSettingsPath: string | undefined
let originalFlagSettingsInline: Record<string, unknown> | null
let originalGlobalConfigEnv: Record<string, string>

function resetRuntimeCaches(): void {
  getClaudeConfigHomeDir.cache.clear?.()
  getGlobalClaudeFile.cache.clear?.()
  resetSettingsCache()
  resetSyncCache()
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

async function writeJiangxiaSettings(
  dirName: 'cc-jiangxia' | 'cc-haha',
  env: Record<string, string>,
): Promise<void> {
  const dir = path.join(tempDir, dirName)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'settings.json'),
    JSON.stringify({ env }),
    'utf-8',
  )
}

describe('managedEnv Jiangxia settings', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jiangxia-managed-env-'))
    originalEnv = Object.fromEntries(
      ENV_KEYS.map(key => [key, process.env[key]]),
    ) as Record<(typeof ENV_KEYS)[number], string | undefined>
    originalAllowedSettingSources = getAllowedSettingSources()
    originalFlagSettingsPath = getFlagSettingsPath()
    originalFlagSettingsInline = getFlagSettingsInline()
    originalGlobalConfigEnv = { ...getGlobalConfig().env }

    for (const key of ENV_KEYS) {
      delete process.env[key]
    }

    process.env.CLAUDE_CONFIG_DIR = tempDir
    process.env.HOME = tempDir
    process.env.USERPROFILE = tempDir
    process.env.CLAUDE_CODE_LOCAL_SKIP_REMOTE_PREFETCH = '1'
    setAllowedSettingSources(['userSettings'])
    setFlagSettingsPath(undefined)
    setFlagSettingsInline(null)
    saveGlobalConfig(current => ({ ...current, env: {} }))
    resetRuntimeCaches()
  })

  afterEach(async () => {
    restoreEnv()
    setAllowedSettingSources(originalAllowedSettingSources)
    setFlagSettingsPath(originalFlagSettingsPath)
    setFlagSettingsInline(originalFlagSettingsInline)
    saveGlobalConfig(current => ({ ...current, env: originalGlobalConfigEnv }))
    resetRuntimeCaches()
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('applies cc-jiangxia settings ahead of legacy cc-haha settings', async () => {
    await writeJiangxiaSettings('cc-haha', {
      ANTHROPIC_MODEL: 'legacy-model',
    })
    await writeJiangxiaSettings('cc-jiangxia', {
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_MODEL: 'jiangxia-model',
      CC_HAHA_SEND_DISABLED_THINKING: '1',
    })

    applySafeConfigEnvironmentVariables()

    expect(process.env.ANTHROPIC_MODEL).toBe('jiangxia-model')
    expect(process.env.CC_HAHA_SEND_DISABLED_THINKING).toBeUndefined()
    expect(
      process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES,
    ).toBe('thinking,effort,adaptive_thinking,max_effort')
  })

  test('falls back to legacy cc-haha settings when cc-jiangxia is absent', async () => {
    await writeJiangxiaSettings('cc-haha', {
      ANTHROPIC_AUTH_TOKEN: 'legacy-token',
      ANTHROPIC_MODEL: 'legacy-model',
    })

    applyConfigEnvironmentVariables()

    expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe('legacy-token')
    expect(process.env.ANTHROPIC_MODEL).toBe('legacy-model')
  })
})
