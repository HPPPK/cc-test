import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getPlaywrightHostPlatform, hasManagedBrowserExecutable } from './managed-browser-runtime'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function runtimeWith(executable: string) {
  const root = mkdtempSync(path.join(tmpdir(), 'managed-browser-'))
  roots.push(root)
  const target = path.join(root, executable)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, 'fixture executable')
  return root
}
describe('managed Chromium executable detection', () => {
  it.each([
    'chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chromium-legacy/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chromium-1228/chrome-win64/chrome.exe',
    'chromium-1228/chrome-linux64/chrome',
  ])('recognizes a packaged browser at %s', (executable) => {
    expect(hasManagedBrowserExecutable(runtimeWith(executable))).toBe(true)
  })
  it('rejects missing runtimes and metadata without a browser', () => {
    expect(hasManagedBrowserExecutable('/nonexistent-managed-browser-runtime')).toBe(false)
    const root = runtimeWith('chromium-1228/INSTALLATION_COMPLETE')
    expect(hasManagedBrowserExecutable(root)).toBe(false)
    mkdirSync(path.join(root, 'chrome'))
    expect(hasManagedBrowserExecutable(root)).toBe(false)
  })
})

describe('managed browser target-platform mapping', () => {
  it.each([
    ['x86_64-pc-windows-msvc', 'win64'],
    ['aarch64-apple-darwin', 'mac14-arm64'],
    ['x86_64-apple-darwin', 'mac14'],
    ['x86_64-unknown-linux-gnu', 'ubuntu22.04-x64'],
    ['aarch64-unknown-linux-gnu', 'ubuntu22.04-arm64'],
  ])('maps %s to %s', (target, host) => {
    expect(getPlaywrightHostPlatform(target)).toBe(host)
  })
  it('rejects targets without a supported managed browser', () => {
    expect(() => getPlaywrightHostPlatform('unsupported-target')).toThrow('Unsupported platform')
  })
})
