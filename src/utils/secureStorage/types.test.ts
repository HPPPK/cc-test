import { expect, test } from 'bun:test'
import { createFallbackStorage } from './fallbackStorage.js'
import type { SecureStorage, SecureStorageData } from './types.js'

test('storage contracts preserve unknown extensions through actual fallback writes', () => {
  let saved: SecureStorageData | null = null
  const primary: SecureStorage = { name: 'unavailable-fixture', read: () => null, readAsync: async () => null, update: () => ({ success: false }), delete: () => true }
  const secondary: SecureStorage = { name: 'memory-fixture', read: () => saved, readAsync: async () => saved, update(data) { saved = data; return { success: true } }, delete() { saved = null; return true } }
  const storage = createFallbackStorage(primary, secondary)
  const payload: SecureStorageData = { futureExtension: { untouched: ['fixture'] }, mcpXaaIdp: { issuer: { idToken: 'example-only', expiresAt: 123 } } }
  expect(storage.update(payload).success).toBe(true)
  expect(storage.read()).toBe(payload)
  expect(storage.read()?.futureExtension).toEqual({ untouched: ['fixture'] })
})
