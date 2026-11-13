import type { SecureStorageData, SecureStorage } from './types.js'
const data: SecureStorageData = { unknownExtension: { retained: true }, mcpOAuth: { local: { serverName: 'local', serverUrl: 'https://example.test', accessToken: 'example', expiresAt: 123, clientId: 'client' } } }
// @ts-expect-error token expirations are numeric, not strings
const invalid: SecureStorageData = { mcpOAuth: { local: { serverName: 'local', serverUrl: 'https://example.test', accessToken: 'example', expiresAt: 'tomorrow' } } }
const store: SecureStorage = { name: 'fixture', read: () => data, readAsync: async () => data, update: () => ({ success: true }), delete: () => true }
void [data, invalid, store]

const pluginData: SecureStorageData = { pluginSecrets: { 'fixture@local/server': { token: 'secret' } }, trustedDeviceToken: 'fixture-token' }
// @ts-expect-error persisted sensitive options are serialized strings
const invalidSecret: SecureStorageData = { pluginSecrets: { 'fixture@local': { token: 123 } } }
void [pluginData, invalidSecret]
