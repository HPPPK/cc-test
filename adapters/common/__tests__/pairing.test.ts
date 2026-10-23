import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { isAllowedUser, isPaired, tryPair } from '../pairing.js'

describe('pairing platform support', () => {
  it('checks DingTalk paired users with the same shared access rule', () => {
    expect(isPaired('dingtalk', 'staff-1', {
      dingtalk: {
        pairedUsers: [{ userId: 'staff-1', displayName: 'DingTalk User', pairedAt: Date.now() }],
        allowedUsers: [],
      },
    })).toBe(true)
  })

  it('keeps empty DingTalk allow and pair lists closed by default', () => {
    expect(isPaired('dingtalk', 'staff-1', {
      dingtalk: {
        pairedUsers: [],
        allowedUsers: [],
      },
    })).toBe(false)
  })
})

describe('pairing authorization boundaries', () => {
  let configDir: string
  let originalConfigDir: string | undefined

  beforeEach(() => {
    originalConfigDir = process.env.CLAUDE_CONFIG_DIR
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-pairing-'))
    process.env.CLAUDE_CONFIG_DIR = configDir
  })

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  it('consumes a valid code once, grants only the paired sender access, and preserves other config', () => {
    const configPath = path.join(configDir, 'adapters.json')
    fs.writeFileSync(configPath, JSON.stringify({
      futureSetting: { preserve: true },
      dingtalk: { enabled: true, extension: 'keep', allowedUsers: [] },
      pairing: { code: 'ABC234', expiresAt: Date.now() + 60_000, createdAt: Date.now() },
    }))

    expect(isAllowedUser('dingtalk', 'paired-sender')).toBe(false)
    expect(tryPair(' abc234 ', { userId: 'paired-sender', displayName: 'Sender' }, 'dingtalk')).toBe(true)
    expect(isAllowedUser('dingtalk', 'paired-sender')).toBe(true)
    expect(isAllowedUser('dingtalk', 'other-sender')).toBe(false)
    expect(isAllowedUser('telegram', 'paired-sender')).toBe(false)
    expect(tryPair('ABC234', { userId: 'other-sender', displayName: 'Other' }, 'dingtalk')).toBe(false)

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(persisted.futureSetting).toEqual({ preserve: true })
    expect(persisted.dingtalk).toMatchObject({
      enabled: true, extension: 'keep', allowedUsers: [],
      pairedUsers: [{ userId: 'paired-sender', displayName: 'Sender', pairedAt: expect.any(Number) }],
    })
    expect(persisted.pairing).toEqual({ code: null, expiresAt: null, createdAt: null })
  })

  it('rejects an expired code without modifying configuration or granting access', () => {
    const configPath = path.join(configDir, 'adapters.json')
    const configText = JSON.stringify({ pairing: { code: 'ABC234', expiresAt: Date.now() - 1 } })
    fs.writeFileSync(configPath, configText)

    expect(tryPair('ABC234', { userId: 'expired-sender', displayName: 'Sender' }, 'dingtalk')).toBe(false)
    expect(isAllowedUser('dingtalk', 'expired-sender')).toBe(false)
    expect(fs.readFileSync(configPath, 'utf-8')).toBe(configText)
  })

  it('blocks a valid code after five failed guesses for the same sender', () => {
    const configPath = path.join(configDir, 'adapters.json')
    const configText = JSON.stringify({ pairing: { code: 'ABC234', expiresAt: Date.now() + 60_000 } })
    fs.writeFileSync(configPath, configText)
    const sender = { userId: 'rate-limited-sender', displayName: 'Sender' }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(tryPair('WRONG', sender, 'dingtalk')).toBe(false)
    }
    expect(tryPair('ABC234', sender, 'dingtalk')).toBe(false)
    expect(isAllowedUser('dingtalk', sender.userId)).toBe(false)
    expect(fs.readFileSync(configPath, 'utf-8')).toBe(configText)
  })

  it('denies access when pairing configuration is missing or malformed', () => {
    expect(isAllowedUser('dingtalk', 'unknown-sender')).toBe(false)
    fs.writeFileSync(path.join(configDir, 'adapters.json'), '{invalid json')
    expect(isAllowedUser('dingtalk', 'unknown-sender')).toBe(false)
  })
})
