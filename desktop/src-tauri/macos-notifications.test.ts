import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Exercise the compiled Objective-C bridge with a fake OS callback. No prompts,
// notification delivery, bundle registration, or user settings are touched.
describe.skipIf(process.platform !== 'darwin')('macOS notification permission bridge', () => {
  let dir: string
  let binary: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'jiangxia-notification-native-'))
    binary = join(dir, 'probe')
    const result = Bun.spawnSync(['clang', '-fobjc-arc', '-framework', 'Foundation', '-framework', 'Cocoa', '-framework', 'UserNotifications', 'src-tauri/src/macos_notifications.m', 'src-tauri/tests/notification_permission_probe.m', '-o', binary])
    expect(result.stderr.toString()).not.toContain('error:')
    expect(result.exitCode).toBe(0)
  })
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })
  const probe = (scenario: string) => {
    const result = Bun.spawnSync([binary, scenario])
    expect(result.exitCode).toBe(0)
    return JSON.parse(result.stdout.toString()) as { status: number; error: string }
  }
  it('returns denied, rather than a bridge error, for UNErrorDomain code 1', () => {
    expect(probe('denied')).toEqual({ status: 1, error: '' })
  })
  it('keeps real native errors distinct from denial', () => {
    expect(probe('error')).toEqual({ status: -1, error: 'probe service failure' })
  })
  it('returns consistent authorization statuses for granted and declined requests', () => {
    expect(probe('granted')).toEqual({ status: 2, error: '' })
    expect(probe('declined')).toEqual({ status: 1, error: '' })
  })
})
