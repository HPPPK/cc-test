import type { OAuthTokens } from '../../services/oauth/types.js'
import type { OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js'

export type StoredMcpOAuth = {
  serverName: string
  serverUrl: string
  accessToken: string
  expiresAt: number
  refreshToken?: string
  scope?: string
  clientId?: string
  clientSecret?: string
  stepUpScope?: string
  discoveryState?: Partial<OAuthDiscoveryState>
  [extension: string]: unknown
}
/** Storage adapters serialize this object as-is; unrelated extension fields survive merges. */
export type SecureStorageData = {
  trustedDeviceToken?: string
  pluginSecrets?: Record<string, Record<string, string>>
  claudeAiOauth?: OAuthTokens
  mcpOAuth?: Record<string, StoredMcpOAuth>
  mcpOAuthClientConfig?: Record<string, { clientSecret: string, [extension: string]: unknown }>
  mcpXaaIdp?: Record<string, { idToken: string, expiresAt: number, [extension: string]: unknown }>
  mcpXaaIdpConfig?: Record<string, { clientSecret: string, [extension: string]: unknown }>
  [extension: string]: unknown
}
export interface SecureStorage {
  name: string
  read(): SecureStorageData | null
  readAsync(): Promise<SecureStorageData | null>
  update(data: SecureStorageData): { success: boolean, warning?: string }
  delete(): boolean
}
