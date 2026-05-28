import { join } from 'node:path'

export const APP_DISPLAY_NAME = 'Claude Code Jiangxia'
export const APP_SHORT_NAME = 'cc-jiangxia'
export const LEGACY_APP_SHORT_NAME = 'cc-haha'
export const APP_CLI_NAME = 'claude-jiangxia'
export const APP_CLI_ALIAS = 'cc-jiangxia'
export const LEGACY_APP_CLI_NAME = 'claude-haha'
export const APP_DESKTOP_BUNDLE_ID = 'com.claude-code-jiangxia.desktop'
export const LEGACY_APP_DESKTOP_BUNDLE_ID = 'com.claude-code-haha.desktop'
export const APP_ENV_PREFIX = 'CC_JIANGXIA'
export const LEGACY_APP_ENV_PREFIX = 'CC_HAHA'

export function getAppStorageDir(configDir: string): string {
  return join(configDir, APP_SHORT_NAME)
}

export function getLegacyAppStorageDir(configDir: string): string {
  return join(configDir, LEGACY_APP_SHORT_NAME)
}

export function getAppStoragePath(configDir: string, ...segments: string[]): string {
  return join(getAppStorageDir(configDir), ...segments)
}

export function getLegacyAppStoragePath(configDir: string, ...segments: string[]): string {
  return join(getLegacyAppStorageDir(configDir), ...segments)
}

export function getAppStorageReadPaths(configDir: string, ...segments: string[]): string[] {
  return [
    getAppStoragePath(configDir, ...segments),
    getLegacyAppStoragePath(configDir, ...segments),
  ]
}

export function getJiangxiaEnvName(suffix: string): string {
  return `${APP_ENV_PREFIX}_${suffix}`
}

export function getLegacyJiangxiaEnvName(suffix: string): string {
  return `${LEGACY_APP_ENV_PREFIX}_${suffix}`
}

export function getJiangxiaEnvValue(
  suffix: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env[getJiangxiaEnvName(suffix)] ?? env[getLegacyJiangxiaEnvName(suffix)]
}

export function setJiangxiaEnvAliases(
  env: Record<string, string | undefined>,
  suffix: string,
  value: string,
): void {
  env[getJiangxiaEnvName(suffix)] = value
  env[getLegacyJiangxiaEnvName(suffix)] = value
}

export function deleteJiangxiaEnvAliases(
  env: Record<string, string | undefined>,
  suffix: string,
): void {
  delete env[getJiangxiaEnvName(suffix)]
  delete env[getLegacyJiangxiaEnvName(suffix)]
}
