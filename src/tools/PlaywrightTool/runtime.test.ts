import { describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPlaywrightExecutablePathFromRuntimeDir, getUnsafePublicBrowserUrlReason, isBrowserOwnedDocumentUrl, summarizeRenderedPageText } from './runtime.js'

describe('Playwright runtime', () => {
  test('finds the macOS Chrome for Testing app executable without selecting a helper', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cc-browser-macos-'))
    try {
      const app = join(root, 'chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents')
      const executable = join(app, 'MacOS/Google Chrome for Testing')
      await mkdir(join(app, 'MacOS'), { recursive: true })
      await mkdir(join(app, 'Frameworks/Helper.app/Contents/MacOS'), { recursive: true })
      await writeFile(join(app, 'Frameworks/Helper.app/Contents/MacOS/Google Chrome for Testing Helper'), '')
      await writeFile(executable, '')
      expect(getPlaywrightExecutablePathFromRuntimeDir(root)).toBe(executable)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('keeps Windows and Linux browser discovery and rejects directories named chrome', async () => {
    for (const name of ['chrome.exe', 'chrome']) {
      const root = await mkdtemp(join(tmpdir(), 'cc-browser-runtime-'))
      try {
        await mkdir(join(root, 'chrome'))
        expect(getPlaywrightExecutablePathFromRuntimeDir(root)).toBeNull()
        const executable = join(root, 'chromium/platform', name)
        await mkdir(join(root, 'chromium/platform'), { recursive: true })
        await writeFile(executable, '')
        expect(getPlaywrightExecutablePathFromRuntimeDir(root)).toBe(executable)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    }
    expect(getPlaywrightExecutablePathFromRuntimeDir('/nonexistent/cc-browser-runtime')).toBeNull()
  })

  test('allows public pages and blocks local targets', () => {
    expect(getUnsafePublicBrowserUrlReason('https://example.com/path')).toBeNull()
    expect(getUnsafePublicBrowserUrlReason('http://localhost:3000')).toContain('Localhost')
  })

  test('allows browser-owned documents without allowing local or file destinations', () => {
    expect(isBrowserOwnedDocumentUrl('about:blank')).toBe(true)
    expect(isBrowserOwnedDocumentUrl('data:text/html,<h1>scratch</h1>')).toBe(true)
    expect(isBrowserOwnedDocumentUrl('https://example.com')).toBe(false)
    expect(isBrowserOwnedDocumentUrl('file:///C:/private.html')).toBe(false)
  })

  test('labels truncation as Playwright output', () => {
    const result = summarizeRenderedPageText('x'.repeat(100), 30)
    expect(result.truncated).toBe(true)
    expect(result.text).toContain('Playwright')
  })
})
