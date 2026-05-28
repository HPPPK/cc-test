import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CuGrantFlags } from '../../vendor/computer-use-mcp/types.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'
import { getAppStoragePath, getAppStorageReadPaths } from '../appIdentity.js'

export type StoredAuthorizedApp = {
  bundleId: string
  displayName: string
  authorizedAt?: string
}

export type StoredComputerUseConfig = {
  enabled?: boolean
  authorizedApps?: StoredAuthorizedApp[]
  grantFlags?: Partial<CuGrantFlags>
  pythonPath?: string | null
}

export const DEFAULT_COMPUTER_USE_ENABLED = true

export const DEFAULT_DESKTOP_GRANT_FLAGS: CuGrantFlags = {
  clipboardRead: true,
  clipboardWrite: true,
  systemKeyCombos: true,
}

export function getComputerUseConfigPath(): string {
  return getAppStoragePath(getClaudeConfigHomeDir(), 'computer-use-config.json')
}

export function resolveStoredComputerUseConfig(
  config?: StoredComputerUseConfig,
): {
  enabled: boolean
  authorizedApps: StoredAuthorizedApp[]
  grantFlags: CuGrantFlags
  pythonPath: string | null
} {
  return {
    enabled: config?.enabled ?? DEFAULT_COMPUTER_USE_ENABLED,
    authorizedApps: config?.authorizedApps ?? [],
    grantFlags: {
      ...DEFAULT_DESKTOP_GRANT_FLAGS,
      ...(config?.grantFlags ?? {}),
    },
    pythonPath: normalizePythonPath(config?.pythonPath),
  }
}

export function normalizePythonPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function loadStoredComputerUseConfig(): Promise<
  ReturnType<typeof resolveStoredComputerUseConfig>
> {
  for (const configPath of getAppStorageReadPaths(getClaudeConfigHomeDir(), 'computer-use-config.json')) {
    try {
      const raw = await readFile(configPath, 'utf8')
      return resolveStoredComputerUseConfig(JSON.parse(raw))
    } catch {
      // Try the legacy cc-haha file if the canonical config is unavailable.
    }
  }
  return resolveStoredComputerUseConfig()
}

export async function saveStoredComputerUseConfig(
  config: StoredComputerUseConfig,
): Promise<void> {
  const configPath = getComputerUseConfigPath()
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
}
