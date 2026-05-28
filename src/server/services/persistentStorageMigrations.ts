import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { randomBytes } from 'node:crypto'
import {
  APP_SHORT_NAME,
  LEGACY_APP_SHORT_NAME,
  getAppStorageDir,
  getAppStoragePath,
  getLegacyAppStorageDir,
} from '../../utils/appIdentity.js'
import { normalizeLegacyDeepSeekManagedEnv } from '../../utils/providerManagedEnvCompat.js'

export const CURRENT_PROVIDER_INDEX_SCHEMA_VERSION = 1

type MigrationReport = {
  migratedEntries: string[]
  failures: string[]
}

type JsonObject = Record<string, unknown>
type LegacyProviderModel = {
  id: string
  name?: string
}
type LegacyRootProvider = {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: LegacyProviderModel[]
  isActive?: boolean
  notes?: string
}

let migrationPromise: Promise<MigrationReport> | null = null
let migrationConfigDir: string | null = null

function getConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isProviderModels(value: unknown): value is JsonObject {
  return (
    isRecord(value) &&
    typeof value.main === 'string' &&
    typeof value.haiku === 'string' &&
    typeof value.sonnet === 'string' &&
    typeof value.opus === 'string'
  )
}

function isSavedProvider(value: unknown): value is JsonObject {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.presetId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.apiKey === 'string' &&
    typeof value.baseUrl === 'string' &&
    isProviderModels(value.models)
  )
}

function isLegacyProviderModel(value: unknown): value is LegacyProviderModel {
  return isRecord(value) && typeof value.id === 'string'
}

function isLegacyRootProvider(value: unknown): value is LegacyRootProvider {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.baseUrl === 'string' &&
    typeof value.apiKey === 'string' &&
    Array.isArray(value.models) &&
    value.models.every(isLegacyProviderModel)
  )
}

function errnoCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

async function readJsonFile(filePath: string): Promise<{ missing: boolean; value: unknown; raw: string }> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return { missing: false, value: JSON.parse(raw), raw }
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      return { missing: true, value: undefined, raw: '' }
    }
    throw error
  }
}

async function backupFile(filePath: string, suffix: string): Promise<void> {
  const backupPath = `${filePath}.${suffix}-${Date.now()}-${randomBytes(3).toString('hex')}`
  await fs.copyFile(filePath, backupPath)
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp.${Date.now()}-${randomBytes(3).toString('hex')}`
  try {
    await fs.writeFile(tmpPath, stableStringify(value), 'utf-8')
    await fs.rename(tmpPath, filePath)
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {})
    throw error
  }
}

async function quarantineMalformedFile(filePath: string): Promise<void> {
  const invalidPath = `${filePath}.invalid-${Date.now()}-${randomBytes(3).toString('hex')}`
  await fs.rename(filePath, invalidPath)
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return false
    throw error
  }
}

async function copyPathIfTargetMissing(
  sourcePath: string,
  targetPath: string,
  entryName: string,
  report: MigrationReport,
): Promise<void> {
  try {
    if (!await pathExists(sourcePath) || await pathExists(targetPath)) return

    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.cp(sourcePath, targetPath, {
      recursive: true,
      errorOnExist: false,
      force: false,
    })
    report.migratedEntries.push(`${LEGACY_APP_SHORT_NAME}/${entryName} -> ${APP_SHORT_NAME}/${entryName}`)
  } catch (error) {
    report.failures.push(`${LEGACY_APP_SHORT_NAME}/${entryName}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function migrateProvidersIndex(value: unknown): JsonObject {
  if (!isRecord(value) || !Array.isArray(value.providers)) {
    return {
      schemaVersion: CURRENT_PROVIDER_INDEX_SCHEMA_VERSION,
      activeId: null,
      providers: [],
    }
  }

  const { activeProviderId: _legacyActiveProviderId, ...rest } = value
  const providers = value.providers.filter(isSavedProvider)
  const rawActiveId =
    typeof value.activeId === 'string'
      ? value.activeId
      : typeof _legacyActiveProviderId === 'string'
        ? _legacyActiveProviderId
        : null
  const activeId = rawActiveId && providers.some((provider) => provider.id === rawActiveId)
    ? rawActiveId
    : null

  return {
    ...rest,
    schemaVersion: CURRENT_PROVIDER_INDEX_SCHEMA_VERSION,
    activeId,
    providers,
  }
}

function migrateManagedSettings(value: unknown): JsonObject {
  if (!isRecord(value)) return {}
  if (value.env !== undefined && !isRecord(value.env)) {
    return { ...value, env: {} }
  }
  if (isRecord(value.env)) {
    const { env, changed } = normalizeLegacyDeepSeekManagedEnv(value.env as Record<string, string>)
    if (changed) return { ...value, env }
  }
  return value
}

async function migrateJsonEntry(
  filePath: string,
  entryName: string,
  report: MigrationReport,
  migrate: (value: unknown) => JsonObject,
): Promise<void> {
  try {
    const current = await readJsonFile(filePath)
    if (current.missing) return

    const migrated = migrate(current.value)
    if (stableStringify(migrated) === stableStringify(current.value)) return

    await backupFile(filePath, 'bak-before-migration')
    await writeJsonFile(filePath, migrated)
    report.migratedEntries.push(entryName)
  } catch (error) {
    if (error instanceof SyntaxError) {
      try {
        await quarantineMalformedFile(filePath)
        await writeJsonFile(filePath, {})
        report.migratedEntries.push(entryName)
        return
      } catch (recoveryError) {
        report.failures.push(`${entryName}: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`)
        return
      }
    }

    report.failures.push(`${entryName}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function legacyProviderModelId(
  provider: LegacyRootProvider,
  preferredModelId: unknown,
): string {
  if (
    typeof preferredModelId === 'string' &&
    provider.models.some((model) => model.id === preferredModelId)
  ) {
    return preferredModelId
  }

  return provider.models[0]?.id ?? ''
}

function migrateLegacyRootProvidersConfig(value: unknown): JsonObject | null {
  if (!isRecord(value) || !Array.isArray(value.providers)) {
    return null
  }

  const providers = value.providers
    .filter(isLegacyRootProvider)
    .map((provider) => {
      const main = legacyProviderModelId(provider, value.activeModel)
      return {
        id: provider.id,
        presetId: 'custom',
        name: provider.name,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        apiFormat: 'anthropic',
        models: {
          main,
          haiku: main,
          sonnet: main,
          opus: main,
        },
        ...(provider.notes !== undefined && { notes: provider.notes }),
      }
    })

  if (providers.length === 0) {
    return null
  }

  const activeLegacyProvider = value.providers
    .filter(isLegacyRootProvider)
    .find((provider) =>
      provider.isActive === true ||
      (typeof value.activeModel === 'string' &&
        provider.models.some((model) => model.id === value.activeModel)),
    )
  const activeId =
    activeLegacyProvider && providers.some((provider) => provider.id === activeLegacyProvider.id)
      ? activeLegacyProvider.id
      : null

  return {
    schemaVersion: CURRENT_PROVIDER_INDEX_SCHEMA_VERSION,
    activeId,
    providers,
  }
}

function buildManagedSettingsForMigratedProvider(provider: JsonObject | undefined): JsonObject | null {
  if (!provider || !isProviderModels(provider.models)) return null
  const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey : ''
  const baseUrl = typeof provider.baseUrl === 'string' ? provider.baseUrl : ''
  if (!apiKey || !baseUrl) return null

  return {
    env: {
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_MODEL: provider.models.main,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.models.haiku,
      ANTHROPIC_DEFAULT_SONNET_MODEL: provider.models.sonnet,
      ANTHROPIC_DEFAULT_OPUS_MODEL: provider.models.opus,
    },
  }
}

async function migrateLegacyRootProviders(
  configDir: string,
  appDir: string,
  report: MigrationReport,
): Promise<void> {
  const targetPath = path.join(appDir, 'providers.json')
  try {
    await fs.access(targetPath)
    return
  } catch (error) {
    if (errnoCode(error) !== 'ENOENT') {
      report.failures.push(`${APP_SHORT_NAME}/providers.json: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
  }

  const legacyPath = path.join(configDir, 'providers.json')

  try {
    const legacy = await readJsonFile(legacyPath)
    if (legacy.missing) return

    const migrated = migrateLegacyRootProvidersConfig(legacy.value)
    if (!migrated) return

    await writeJsonFile(targetPath, migrated)
    report.migratedEntries.push(`providers.json -> ${APP_SHORT_NAME}/providers.json`)

    const settingsPath = path.join(appDir, 'settings.json')
    const settings = await readJsonFile(settingsPath).catch(() => ({ missing: false, value: undefined, raw: '' }))
    if (!settings.missing) return

    const activeId = typeof migrated.activeId === 'string' ? migrated.activeId : null
    const activeProvider = Array.isArray(migrated.providers)
      ? migrated.providers.find((provider) => isRecord(provider) && provider.id === activeId)
      : undefined
    const managedSettings = buildManagedSettingsForMigratedProvider(
      isRecord(activeProvider) ? activeProvider : undefined,
    )
    if (managedSettings) {
      await writeJsonFile(settingsPath, managedSettings)
      report.migratedEntries.push(`providers.json -> ${APP_SHORT_NAME}/settings.json`)
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      report.failures.push(`providers.json: ${error.message}`)
      return
    }
    report.failures.push(`providers.json: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function runPersistentStorageMigrations(configDir: string): Promise<MigrationReport> {
  const report: MigrationReport = { migratedEntries: [], failures: [] }
  const appDir = getAppStorageDir(configDir)
  const legacyDir = getLegacyAppStorageDir(configDir)

  await copyPathIfTargetMissing(
    path.join(legacyDir, 'providers.json'),
    path.join(appDir, 'providers.json'),
    'providers.json',
    report,
  )
  await copyPathIfTargetMissing(
    path.join(legacyDir, 'settings.json'),
    path.join(appDir, 'settings.json'),
    'settings.json',
    report,
  )
  await copyPathIfTargetMissing(
    path.join(legacyDir, 'oauth.json'),
    path.join(appDir, 'oauth.json'),
    'oauth.json',
    report,
  )
  await copyPathIfTargetMissing(
    path.join(legacyDir, 'openai-oauth.json'),
    path.join(appDir, 'openai-oauth.json'),
    'openai-oauth.json',
    report,
  )
  await copyPathIfTargetMissing(
    path.join(legacyDir, 'workflows.json'),
    path.join(appDir, 'workflows.json'),
    'workflows.json',
    report,
  )
  await copyPathIfTargetMissing(
    path.join(legacyDir, 'workflow-sessions'),
    path.join(appDir, 'workflow-sessions'),
    'workflow-sessions',
    report,
  )
  await copyPathIfTargetMissing(
    path.join(legacyDir, 'desktop-ui.json'),
    path.join(appDir, 'desktop-ui.json'),
    'desktop-ui.json',
    report,
  )
  await copyPathIfTargetMissing(
    path.join(legacyDir, 'computer-use-config.json'),
    path.join(appDir, 'computer-use-config.json'),
    'computer-use-config.json',
    report,
  )

  await migrateLegacyRootProviders(configDir, appDir, report)

  await migrateJsonEntry(
    getAppStoragePath(configDir, 'providers.json'),
    `${APP_SHORT_NAME}/providers.json`,
    report,
    migrateProvidersIndex,
  )
  await migrateJsonEntry(
    getAppStoragePath(configDir, 'settings.json'),
    `${APP_SHORT_NAME}/settings.json`,
    report,
    migrateManagedSettings,
  )

  return report
}

export function ensurePersistentStorageUpgraded(): Promise<MigrationReport> {
  const configDir = getConfigDir()
  if (!migrationPromise || migrationConfigDir !== configDir) {
    migrationConfigDir = configDir
    migrationPromise = runPersistentStorageMigrations(configDir)
  }
  return migrationPromise
}

export function resetPersistentStorageMigrationsForTests(): void {
  migrationPromise = null
  migrationConfigDir = null
}
