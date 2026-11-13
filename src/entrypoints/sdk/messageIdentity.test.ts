import { expect, test } from 'bun:test'
import { normalizeSDKMessageUuid } from './messageIdentity.js'

test('preserves valid incoming SDK UUID identity', () => {
  const uuid = '11111111-1111-4111-8111-111111111111'
  expect(normalizeSDKMessageUuid(uuid)).toBe(uuid)
})
test('does not pass malformed or absent SDK IDs to transcript identity lookups', () => {
  expect(normalizeSDKMessageUuid('remote-id')).toBeUndefined()
  expect(normalizeSDKMessageUuid('')).toBeUndefined()
  expect(normalizeSDKMessageUuid(undefined)).toBeUndefined()
})
