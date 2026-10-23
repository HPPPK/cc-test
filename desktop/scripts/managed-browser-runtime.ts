import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

export function hasManagedBrowserExecutable(runtimeDir: string): boolean {
  if (!existsSync(runtimeDir)) return false
  try {
    return readdirSync(runtimeDir, { recursive: true }).some((entry) => {
      const name = path.basename(entry)
      return /^(?:chrome(?:\.exe)?|Chromium|Google Chrome for Testing)$/i.test(name)
        && statSync(path.join(runtimeDir, entry)).isFile()
    })
  } catch {
    return false
  }
}

export function getPlaywrightHostPlatform(triple: string): string {
  if (triple === 'x86_64-pc-windows-msvc') return 'win64'
  if (triple === 'aarch64-apple-darwin') return 'mac14-arm64'
  if (triple === 'x86_64-apple-darwin') return 'mac14'
  if (triple === 'x86_64-unknown-linux-gnu') return 'ubuntu22.04-x64'
  if (triple === 'aarch64-unknown-linux-gnu') return 'ubuntu22.04-arm64'
  throw new Error(`[build-sidecars] Unsupported platform for bundled Chromium: ${triple}`)
}

