import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { ProviderService } from '../services/providerService.js'
import {
  CURRENT_PROVIDER_INDEX_SCHEMA_VERSION,
  ensurePersistentStorageUpgraded,
  resetPersistentStorageMigrationsForTests,
} from '../services/persistentStorageMigrations.js'

let tempDir: string

async function listFiles(dir: string) {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}

describe('persistent storage upgrade migrations', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-persistence-'))
    process.env.CLAUDE_CONFIG_DIR = tempDir
    resetPersistentStorageMigrationsForTests()
  })

  afterEach(async () => {
    resetPersistentStorageMigrationsForTests()
    delete process.env.CLAUDE_CONFIG_DIR
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('migrates legacy providers index and writes a backup before changing it', async () => {
    const ccJiangxiaDir = path.join(tempDir, 'cc-jiangxia')
    await fs.mkdir(ccJiangxiaDir, { recursive: true })
    await fs.writeFile(
      path.join(ccJiangxiaDir, 'providers.json'),
      JSON.stringify({
        activeProviderId: 'provider-1',
        rootFutureField: { keep: true },
        providers: [{
          id: 'provider-1',
          presetId: 'custom',
          name: 'Legacy Provider',
          apiKey: 'token',
          baseUrl: 'https://example.test',
          models: { main: 'model-main', haiku: '', sonnet: '', opus: '' },
          extraFutureField: 'keep-me',
        }],
      }, null, 2),
      'utf-8',
    )

    const report = await ensurePersistentStorageUpgraded()

    expect(report.failures).toEqual([])
    expect(report.migratedEntries).toContain('cc-jiangxia/providers.json')

    const migrated = JSON.parse(await fs.readFile(path.join(ccJiangxiaDir, 'providers.json'), 'utf-8')) as {
      schemaVersion?: number
      activeId?: string | null
      activeProviderId?: string
      rootFutureField?: unknown
      providers?: Array<Record<string, unknown>>
    }
    expect(migrated.schemaVersion).toBe(CURRENT_PROVIDER_INDEX_SCHEMA_VERSION)
    expect(migrated.activeId).toBe('provider-1')
    expect(migrated.activeProviderId).toBeUndefined()
    expect(migrated.rootFutureField).toEqual({ keep: true })
    expect(migrated.providers?.[0]?.extraFutureField).toBe('keep-me')

    const backups = (await listFiles(ccJiangxiaDir)).filter((file) => file.startsWith('providers.json.bak-before-migration-'))
    expect(backups.length).toBe(1)

    const service = new ProviderService()
    const { providers, activeId } = await service.listProviders()
    expect(providers).toHaveLength(1)
    expect(activeId).toBe('provider-1')

    await service.updateProvider('provider-1', { name: 'Renamed Provider' })
    const rewritten = JSON.parse(await fs.readFile(path.join(ccJiangxiaDir, 'providers.json'), 'utf-8')) as {
      rootFutureField?: unknown
      providers?: Array<Record<string, unknown>>
    }
    expect(rewritten.rootFutureField).toEqual({ keep: true })
    expect(rewritten.providers?.[0]?.extraFutureField).toBe('keep-me')
  })

  test('imports legacy root providers config into cc-jiangxia storage without deleting the source', async () => {
    await fs.writeFile(
      path.join(tempDir, 'providers.json'),
      JSON.stringify({
        version: 1,
        activeModel: 'legacy-sonnet',
        providers: [{
          id: 'legacy-provider',
          name: 'Legacy Root Provider',
          baseUrl: 'https://legacy.example.test',
          apiKey: 'legacy-token',
          models: [
            { id: 'legacy-haiku', name: 'Legacy Haiku' },
            { id: 'legacy-sonnet', name: 'Legacy Sonnet' },
          ],
          isActive: true,
          createdAt: 1,
          updatedAt: 2,
          notes: 'keep note',
        }],
      }, null, 2),
      'utf-8',
    )

    const report = await ensurePersistentStorageUpgraded()

    expect(report.failures).toEqual([])
    expect(report.migratedEntries).toContain('providers.json -> cc-jiangxia/providers.json')
    expect(report.migratedEntries).toContain('providers.json -> cc-jiangxia/settings.json')
    expect(JSON.parse(await fs.readFile(path.join(tempDir, 'providers.json'), 'utf-8'))).toMatchObject({
      version: 1,
      activeModel: 'legacy-sonnet',
    })

    const migrated = JSON.parse(await fs.readFile(path.join(tempDir, 'cc-jiangxia', 'providers.json'), 'utf-8')) as {
      activeId?: string | null
      providers?: Array<{
        id?: string
        presetId?: string
        apiFormat?: string
        models?: Record<string, string>
        notes?: string
      }>
    }
    expect(migrated.activeId).toBe('legacy-provider')
    expect(migrated.providers?.[0]).toMatchObject({
      id: 'legacy-provider',
      presetId: 'custom',
      apiFormat: 'anthropic',
      notes: 'keep note',
      models: {
        main: 'legacy-sonnet',
        haiku: 'legacy-sonnet',
        sonnet: 'legacy-sonnet',
        opus: 'legacy-sonnet',
      },
    })

    const managedSettings = JSON.parse(await fs.readFile(path.join(tempDir, 'cc-jiangxia', 'settings.json'), 'utf-8')) as {
      env?: Record<string, string>
    }
    expect(managedSettings.env).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://legacy.example.test',
      ANTHROPIC_AUTH_TOKEN: 'legacy-token',
      ANTHROPIC_MODEL: 'legacy-sonnet',
    })

    const service = new ProviderService()
    const { providers, activeId } = await service.listProviders()
    expect(activeId).toBe('legacy-provider')
    expect(providers[0]?.models.main).toBe('legacy-sonnet')
  })

  test('copies existing cc-haha storage into cc-jiangxia storage without deleting the source', async () => {
    const legacyDir = path.join(tempDir, 'cc-haha')
    const legacySessionDir = path.join(legacyDir, 'workflow-sessions')
    await fs.mkdir(legacySessionDir, { recursive: true })
    await fs.writeFile(
      path.join(legacyDir, 'providers.json'),
      JSON.stringify({
        schemaVersion: CURRENT_PROVIDER_INDEX_SCHEMA_VERSION,
        activeId: 'legacy-provider',
        providers: [{
          id: 'legacy-provider',
          presetId: 'custom',
          name: 'Legacy Provider',
          apiKey: 'legacy-token',
          baseUrl: 'https://legacy.example.test',
          models: {
            main: 'legacy-main',
            haiku: 'legacy-haiku',
            sonnet: 'legacy-sonnet',
            opus: 'legacy-opus',
          },
        }],
      }, null, 2),
      'utf-8',
    )
    await fs.writeFile(
      path.join(legacyDir, 'settings.json'),
      JSON.stringify({ env: { ANTHROPIC_MODEL: 'legacy-main' } }, null, 2),
      'utf-8',
    )
    await fs.writeFile(
      path.join(legacyDir, 'oauth.json'),
      JSON.stringify({ accessToken: 'legacy-oauth' }, null, 2),
      'utf-8',
    )
    await fs.writeFile(
      path.join(legacyDir, 'openai-oauth.json'),
      JSON.stringify({ accessToken: 'legacy-openai' }, null, 2),
      'utf-8',
    )
    await fs.writeFile(
      path.join(legacyDir, 'workflows.json'),
      JSON.stringify({ templates: [] }, null, 2),
      'utf-8',
    )
    await fs.writeFile(
      path.join(legacySessionDir, 'session-1.json'),
      JSON.stringify({ id: 'session-1' }, null, 2),
      'utf-8',
    )
    await fs.writeFile(
      path.join(legacyDir, 'desktop-ui.json'),
      JSON.stringify({ sidebarWidth: 320 }, null, 2),
      'utf-8',
    )
    await fs.writeFile(
      path.join(legacyDir, 'computer-use-config.json'),
      JSON.stringify({ enabled: true }, null, 2),
      'utf-8',
    )

    const report = await ensurePersistentStorageUpgraded()

    expect(report.failures).toEqual([])
    expect(report.migratedEntries).toEqual(expect.arrayContaining([
      'cc-haha/providers.json -> cc-jiangxia/providers.json',
      'cc-haha/settings.json -> cc-jiangxia/settings.json',
      'cc-haha/oauth.json -> cc-jiangxia/oauth.json',
      'cc-haha/openai-oauth.json -> cc-jiangxia/openai-oauth.json',
      'cc-haha/workflows.json -> cc-jiangxia/workflows.json',
      'cc-haha/workflow-sessions -> cc-jiangxia/workflow-sessions',
      'cc-haha/desktop-ui.json -> cc-jiangxia/desktop-ui.json',
      'cc-haha/computer-use-config.json -> cc-jiangxia/computer-use-config.json',
    ]))
    expect(await fs.readFile(path.join(tempDir, 'cc-haha', 'oauth.json'), 'utf-8')).toContain('legacy-oauth')
    expect(await fs.readFile(path.join(tempDir, 'cc-jiangxia', 'oauth.json'), 'utf-8')).toContain('legacy-oauth')
    expect(await fs.readFile(path.join(tempDir, 'cc-jiangxia', 'workflow-sessions', 'session-1.json'), 'utf-8')).toContain('session-1')
  })

  test('does not overwrite current cc-jiangxia provider storage with a legacy root config', async () => {
    const ccJiangxiaDir = path.join(tempDir, 'cc-jiangxia')
    await fs.mkdir(ccJiangxiaDir, { recursive: true })
    await fs.writeFile(
      path.join(tempDir, 'providers.json'),
      JSON.stringify({
        version: 1,
        activeModel: 'legacy-model',
        providers: [{
          id: 'legacy-provider',
          name: 'Legacy Root Provider',
          baseUrl: 'https://legacy.example.test',
          apiKey: 'legacy-token',
          models: [{ id: 'legacy-model' }],
          isActive: true,
        }],
      }, null, 2),
      'utf-8',
    )
    await fs.writeFile(
      path.join(ccJiangxiaDir, 'providers.json'),
      JSON.stringify({
        schemaVersion: CURRENT_PROVIDER_INDEX_SCHEMA_VERSION,
        activeId: null,
        providers: [],
      }, null, 2),
      'utf-8',
    )

    const report = await ensurePersistentStorageUpgraded()

    expect(report.failures).toEqual([])
    expect(report.migratedEntries).not.toContain('providers.json -> cc-jiangxia/providers.json')
    const current = JSON.parse(await fs.readFile(path.join(ccJiangxiaDir, 'providers.json'), 'utf-8')) as {
      activeId?: string | null
      providers?: unknown[]
    }
    expect(current.activeId).toBeNull()
    expect(current.providers).toEqual([])
  })

  test('does not write repo-owned schema metadata into shared user settings', async () => {
    await fs.writeFile(
      path.join(tempDir, 'settings.json'),
      JSON.stringify({
        defaultMode: 'acceptEdits',
        userOwnedFutureField: { nested: true },
      }, null, 2),
      'utf-8',
    )

    const report = await ensurePersistentStorageUpgraded()

    expect(report.failures).toEqual([])
    const settings = JSON.parse(await fs.readFile(path.join(tempDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
    expect(settings.schemaVersion).toBeUndefined()
    expect(settings.userOwnedFutureField).toEqual({ nested: true })
  })

  test('quarantines malformed managed settings instead of blocking startup', async () => {
    const ccJiangxiaDir = path.join(tempDir, 'cc-jiangxia')
    await fs.mkdir(ccJiangxiaDir, { recursive: true })
    await fs.writeFile(path.join(ccJiangxiaDir, 'settings.json'), '{"env":', 'utf-8')

    const report = await ensurePersistentStorageUpgraded()

    expect(report.failures).toEqual([])
    expect(report.migratedEntries).toContain('cc-jiangxia/settings.json')
    expect(JSON.parse(await fs.readFile(path.join(ccJiangxiaDir, 'settings.json'), 'utf-8'))).toEqual({})
    const quarantined = (await listFiles(ccJiangxiaDir)).filter((file) => file.startsWith('settings.json.invalid-'))
    expect(quarantined.length).toBe(1)
  })

  test('upgrades existing DeepSeek managed env to follow global thinking settings', async () => {
    const ccJiangxiaDir = path.join(tempDir, 'cc-jiangxia')
    await fs.mkdir(ccJiangxiaDir, { recursive: true })
    await fs.writeFile(
      path.join(ccJiangxiaDir, 'settings.json'),
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
          ANTHROPIC_AUTH_TOKEN: 'test-token',
          ANTHROPIC_MODEL: 'deepseek-v4-pro',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-flash',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-pro',
          CC_JIANGXIA_SEND_DISABLED_THINKING: '1',
          USER_CUSTOM_ENV: 'keep-me',
        },
      }, null, 2),
      'utf-8',
    )

    const report = await ensurePersistentStorageUpgraded()

    expect(report.failures).toEqual([])
    expect(report.migratedEntries).toContain('cc-jiangxia/settings.json')

    const migrated = JSON.parse(await fs.readFile(path.join(ccJiangxiaDir, 'settings.json'), 'utf-8')) as {
      env?: Record<string, string>
    }
    expect(migrated.env?.CC_JIANGXIA_SEND_DISABLED_THINKING).toBeUndefined()
    expect(migrated.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES).toBe(
      'thinking,effort,adaptive_thinking,max_effort',
    )
    expect(migrated.env?.ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES).toBe(
      'thinking,effort,adaptive_thinking,max_effort',
    )
    expect(migrated.env?.ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES).toBe(
      'thinking,effort,adaptive_thinking,max_effort',
    )
    expect(migrated.env?.USER_CUSTOM_ENV).toBe('keep-me')

    const backups = (await listFiles(ccJiangxiaDir)).filter((file) => file.startsWith('settings.json.bak-before-migration-'))
    expect(backups.length).toBe(1)
  })
})
