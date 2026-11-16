import { expect, test } from 'bun:test'
import { getAgentsPlatformCommand, isAgentsPlatformAvailable } from './index.js'

test('internal agents-platform opt-in cannot register a fabricated command', () => {
  const old = process.env.USER_TYPE
  try {
    process.env.USER_TYPE = 'ant'
    expect(isAgentsPlatformAvailable()).toBe(false)
    expect(() => getAgentsPlatformCommand()).toThrow('unavailable')
  } finally { if (old === undefined) delete process.env.USER_TYPE; else process.env.USER_TYPE = old }
})
