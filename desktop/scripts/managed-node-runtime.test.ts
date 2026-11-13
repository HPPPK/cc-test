import { describe, expect, it } from 'vitest'
import { getManagedNodeRuntime } from './managed-node-runtime'

describe('portable Node runtime targets', () => {
  for (const [triple, platform, executable] of [
    ['aarch64-apple-darwin', 'darwin-arm64', 'bin/node'],
    ['x86_64-apple-darwin', 'darwin-x64', 'bin/node'],
    ['x86_64-pc-windows-msvc', 'win-x64', 'node.exe'],
  ]) {
    it(`pins a verified runtime for ${triple}`, () => {
      const runtime = getManagedNodeRuntime(triple!)!
      expect(runtime.platform).toBe(platform)
      expect(runtime.executable).toBe(executable)
      expect(runtime.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(runtime.url).toBe(`https://nodejs.org/dist/v22.23.1/${runtime.archive}`)
      expect(runtime.archive.endsWith(runtime.windows ? '.zip' : '.tar.gz')).toBe(true)
    })
  }
  it('does not silently select a runtime for an unsupported target', () => {
    expect(getManagedNodeRuntime('unknown')).toBeNull()
  })
})
