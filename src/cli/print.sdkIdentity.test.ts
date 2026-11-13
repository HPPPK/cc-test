import { expect, test } from 'bun:test'
import { normalizeSDKMessageUuid } from '../entrypoints/sdk/messageIdentity.js'

test('SDK prompt identity is safe for duplicate lookups and local lifecycle tracking', () => {
  const known = '11111111-1111-4111-8111-111111111111'
  const received = new Set([known])
  expect(received.has(normalizeSDKMessageUuid(known)!)).toBe(true)
  expect(normalizeSDKMessageUuid('remote-message-1')).toBeUndefined()
  expect(normalizeSDKMessageUuid(undefined)).toBeUndefined()
})
