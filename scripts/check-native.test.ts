import { describe, expect, it } from 'bun:test'
import { needsWindowsAsciiBunProxy, resolveAsciiBunTempDir } from './check-native.ts'

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
