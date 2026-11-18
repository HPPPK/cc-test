import { describe, expect, it, spyOn } from 'bun:test'
import path from 'node:path'
import { needsWindowsAsciiBunProxy, resolveAsciiBunTempDir, runNativeCheck } from './check-native.ts'

describe('native check Bun launcher', () => {
  it('uses an ASCII-path Bun proxy only for Windows Bun executables under non-ASCII paths', () => {
    expect(needsWindowsAsciiBunProxy('win32', 'C:\\Users\\潘婧瑜\\.bun\\bin\\bun.exe')).toBe(true)
    expect(needsWindowsAsciiBunProxy('win32', 'C:\\tools\\bun\\bun.exe')).toBe(false)
    expect(needsWindowsAsciiBunProxy('linux', '/home/潘婧瑜/.bun/bin/bun')).toBe(false)
  })

  it('places the temporary Windows Bun proxy in a stable ASCII public path', () => {
    expect(resolveAsciiBunTempDir('C:\\Users\\Public', 123, 456)).toBe(
      'C:\\Users\\Public\\cc-jiangxia-bun\\123-456',
    )
  })
})

describe('native check build isolation', () => {
  async function commandEnvironments(platform: NodeJS.Platform, env: NodeJS.ProcessEnv) {
    const spawn = spyOn(Bun, 'spawn').mockReturnValue({ exited: Promise.resolve(0) } as ReturnType<typeof Bun.spawn>)
    try {
      expect(await runNativeCheck({ platform, bunExecutable: 'C:\\tools\\bun.exe', env })).toBe(0)
      return spawn.mock.calls.map(call => (call[1] as { env: NodeJS.ProcessEnv }).env)
    } finally { spawn.mockRestore() }
  }

  it('keeps Windows checks separate from executables held by a running desktop app', async () => {
    const env = { PATH: 'fixture-path' }
    const environments = await commandEnvironments('win32', env)
    expect(environments).toHaveLength(2)
    for (const actual of environments) {
      expect(actual.CARGO_TARGET_DIR).toBe(path.resolve(import.meta.dir, '../artifacts/native-checks/target'))
      expect(actual.CARGO_TARGET_DIR).not.toBe(path.resolve(import.meta.dir, '../desktop/src-tauri/target'))
    }
    expect(env).toEqual({ PATH: 'fixture-path' })
  })

  it('preserves explicitly configured Cargo targets', async () => {
    for (const actual of await commandEnvironments('win32', { CARGO_TARGET_DIR: 'custom-target' })) {
      expect(actual.CARGO_TARGET_DIR).toBe('custom-target')
    }
  })

  it('keeps the normal Cargo default on other platforms', async () => {
    for (const actual of await commandEnvironments('linux', {})) expect(actual).not.toHaveProperty('CARGO_TARGET_DIR')
  })
})
