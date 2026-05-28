import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomBytes } from 'node:crypto'
import { ApiError } from '../middleware/errorHandler.js'
import { getAppStoragePath } from '../../utils/appIdentity.js'
import { normalizeJsonObject, readRecoverableJsonFile } from './recoverableJsonFile.js'
import { ensurePersistentStorageUpgraded } from './persistentStorageMigrations.js'

const FALLBACK_RENAME_ERROR_CODES = new Set(['EPERM', 'EEXIST', 'EBUSY', 'EXDEV'])

function canFallbackFromRenameError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as NodeJS.ErrnoException).code ?? '')
    : ''
  return FALLBACK_RENAME_ERROR_CODES.has(code)
}

export class ManagedSettingsService {
  private static writeLocks = new Map<string, Promise<void>>()

  private getConfigDir(): string {
    return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  }

  private getSettingsPath(): string {
    return getAppStoragePath(this.getConfigDir(), 'settings.json')
  }

  private async withWriteLock<T>(
    filePath: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previousWrite = ManagedSettingsService.writeLocks.get(filePath) ?? Promise.resolve()
    const nextWrite = previousWrite.catch(() => {}).then(task)
    const trackedWrite = nextWrite.then(() => {}, () => {})

    ManagedSettingsService.writeLocks.set(filePath, trackedWrite)

    try {
      return await nextWrite
    } finally {
      if (ManagedSettingsService.writeLocks.get(filePath) === trackedWrite) {
        ManagedSettingsService.writeLocks.delete(filePath)
      }
    }
  }

  private async writeSettings(settings: Record<string, unknown>): Promise<void> {
    const filePath = this.getSettingsPath()
    const dir = path.dirname(filePath)
    const contents = JSON.stringify(settings, null, 2) + '\n'
    const tmpFile = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomBytes(6).toString('hex')}`

    await fs.mkdir(dir, { recursive: true })

    try {
      await fs.writeFile(tmpFile, contents, 'utf-8')
      await fs.rename(tmpFile, filePath)
    } catch (error) {
      if (!canFallbackFromRenameError(error)) {
        await fs.unlink(tmpFile).catch(() => {})
        throw ApiError.internal(`Failed to write settings.json: ${error}`)
      }

      try {
        await fs.writeFile(filePath, contents, 'utf-8')
      } catch (fallbackError) {
        await fs.unlink(tmpFile).catch(() => {})
        throw ApiError.internal(`Failed to write settings.json: ${fallbackError}`)
      }
      await fs.unlink(tmpFile).catch(() => {})
    }
  }

  async readSettings(): Promise<Record<string, unknown>> {
    await ensurePersistentStorageUpgraded()
    return readRecoverableJsonFile({
      filePath: this.getSettingsPath(),
      label: 'cc-jiangxia managed settings',
      defaultValue: {},
      normalize: normalizeJsonObject,
    })
  }

  async updateSettings<T>(
    updater: (current: Record<string, unknown>) => Promise<{
      settings: Record<string, unknown>
      result: T
    }> | {
      settings: Record<string, unknown>
      result: T
    },
  ): Promise<T> {
    const filePath = this.getSettingsPath()
    return this.withWriteLock(filePath, async () => {
      const current = await this.readSettings()
      const { settings, result } = await updater(current)
      await this.writeSettings(settings)
      return result
    })
  }
}
