import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { findBuiltWindowsInstaller, shouldAuditWindowsBuild } from './tauri-audited.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('audited Tauri build wrapper', () => {
  test('finds the actual NSIS installer under the target-specific bundle output', async () => {
    const desktopDir = await mkdtemp(path.join(tmpdir(), 'tauri-audited-'))
    roots.push(desktopDir)
    const bundleDir = path.join(desktopDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'bundle', 'nsis')
    await mkdir(bundleDir, { recursive: true })
    await writeFile(path.join(bundleDir, 'app-setup.exe.sig'), 'signature')
    const installer = path.join(bundleDir, 'app-setup.exe')
    await writeFile(installer, 'installer')

    await expect(findBuiltWindowsInstaller(desktopDir, 'x86_64-pc-windows-msvc')).resolves.toBe(installer)
  })

  test('only audits Windows Tauri build invocations', () => {
    expect(shouldAuditWindowsBuild('win32', ['build', '--bundles', 'nsis'])).toBe(true)
    expect(shouldAuditWindowsBuild('linux', ['build', '--bundles', 'nsis'])).toBe(false)
    expect(shouldAuditWindowsBuild('win32', ['dev'])).toBe(false)
  })
})
