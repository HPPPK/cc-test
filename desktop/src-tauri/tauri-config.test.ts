import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))

describe('tauri security config', () => {
  it('allows desktop sidecar image URLs for opener icons', () => {
    const config = JSON.parse(
      readFileSync(join(currentDir, 'tauri.conf.json'), 'utf8'),
    ) as {
      app?: {
        security?: {
          csp?: string
        }
      }
    }

    const csp = config.app?.security?.csp ?? ''
    expect(csp).toContain('img-src')
    expect(csp).toContain('http://127.0.0.1:*')
    expect(csp).toContain('http://localhost:*')
  })

  it('enables OS proxy discovery for updater downloads', () => {
    const cargoToml = readFileSync(join(currentDir, 'Cargo.toml'), 'utf8')

    expect(cargoToml).toContain('reqwest = { version = "0.13"')
    expect(cargoToml).toContain('features = ["system-proxy"]')
  })

  it('packages default workflow ZIPs and the managed Chromium runtime for first-run seeding', () => {
    const config = JSON.parse(
      readFileSync(join(currentDir, 'tauri.conf.json'), 'utf8'),
    ) as {
      bundle?: { resources?: string[] }
    }

    expect(config.bundle?.resources ?? []).toContain('binaries/packs')
    expect(config.bundle?.resources ?? []).toContain('binaries/browser-runtime')
    expect(config.bundle?.resources ?? []).toContain('binaries/git-runtime')
    expect(config.bundle?.resources ?? []).toContain('binaries/node-runtime')
  })

  it('uses only cc-test as the desktop update channel', () => {
    const config = JSON.parse(
      readFileSync(join(currentDir, 'tauri.conf.json'), 'utf8'),
    ) as {
      plugins?: { updater?: { endpoints?: string[] } }
    }

    expect(config.plugins?.updater?.endpoints).toEqual([
      'https://github.com/HPPPK/cc-test/releases/latest/download/latest.json',
    ])
  })
})
