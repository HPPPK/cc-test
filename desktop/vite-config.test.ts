import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const desktopRoot = dirname(fileURLToPath(import.meta.url))

describe('desktop build compatibility', () => {
  it('keeps production bundles loadable in the macOS 12 Safari 15 WebView', () => {
    const config = readFileSync(join(desktopRoot, 'vite.config.ts'), 'utf8')

    expect(config).toContain("target: ['es2021', 'safari15']")
  })

  it('does not rely on CSS color-mix for startup-critical shell chrome', () => {
    const css = readFileSync(join(desktopRoot, 'src', 'theme', 'globals.css'), 'utf8')

    expect(css).not.toContain('color-mix(')
    expect(css).toContain('--color-text-secondary-a72')
    expect(css).toContain('--color-outline-a92')
  })
  it('ignores transient Bun build artifacts that Windows locks during desktop startup', () => {
    const config = readFileSync(join(desktopRoot, 'vite.config.ts'), 'utf8')

    expect(config).toContain("ignored: ['**/src-tauri/**', '**/.*.bun-build']")
  })

  it('provides a no-watch desktop launch command for large managed runtime resources', () => {
    const packageJson = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['dev:desktop']).toBe('tauri dev --no-watch')
  })

  it('uses a deterministic jsdom localStorage setup and ignores packaged native resources', () => {
    const config = readFileSync(join(desktopRoot, 'vitest.config.ts'), 'utf8')

    expect(config).toContain("jsdom: { url: 'http://localhost/' }")
    expect(config).toContain("'src-tauri/**'")
    expect(config).toContain("setupFiles: ['./src/test/setup.ts']")
  })

})
