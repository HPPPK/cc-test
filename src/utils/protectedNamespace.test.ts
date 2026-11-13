import { expect, test } from 'bun:test'
import { checkProtectedNamespace, isProtectedNamespaceDetectionAvailable } from './protectedNamespace.js'

test('unavailable namespace detection never returns a fake authorization boolean', () => {
  const old = process.env.USER_TYPE
  try {
    process.env.USER_TYPE = 'ant'
    expect(isProtectedNamespaceDetectionAvailable()).toBe(false)
    expect(() => checkProtectedNamespace()).toThrow('unavailable')
  } finally { if (old === undefined) delete process.env.USER_TYPE; else process.env.USER_TYPE = old }
})
