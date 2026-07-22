import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

describe('release desktop workflow', () => {
  test('publishes signed Windows and Apple Silicon updater artifacts without racing latest.json', () => {
    const workflow = readFileSync('.github/workflows/release-desktop.yml', 'utf8')

    expect(workflow).toContain('max-parallel: 1')
    expect(workflow).toContain('platform: windows-latest')
    expect(workflow).toContain('rust_target: x86_64-pc-windows-msvc')
    expect(workflow).toContain('platform: macos-latest')
    expect(workflow).toContain('rust_target: aarch64-apple-darwin')
    expect(workflow).toContain("tauri_args: '--target aarch64-apple-darwin --bundles app,dmg'")
    expect(workflow).toContain('TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}')
    expect(workflow).toContain('name: Validate Apple signing and notarization credentials')
    expect(workflow).toContain('APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}')
    expect(workflow).toContain('APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}')
    expect(workflow).toContain('KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}')
    expect(workflow).toContain('APPLE_ID: ${{ secrets.APPLE_ID }}')
    expect(workflow).toContain('APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}')
    expect(workflow).toContain('APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}')
    expect(workflow).toContain('name: Import Apple Developer ID certificate')
    expect(workflow).toContain('APPLE_SIGNING_IDENTITY: ${{ env.APPLE_SIGNING_IDENTITY }}')
    expect(workflow).not.toContain("apple_signing_identity: '-'")
    expect(workflow).not.toContain('APPLE_SIGNING_IDENTITY: ${{ matrix.apple_signing_identity }}')
    expect(workflow).toContain('includeUpdaterJson: true')
    expect(workflow).toContain('assetNamePattern: ${{ matrix.asset_name_pattern }}')
    expect(workflow).not.toContain('uploadUpdaterJson:')
    expect(workflow).not.toContain('uploadUpdaterSignatures:')
    expect(workflow).not.toContain('releaseAssetNamePattern:')

    const windowsIndex = workflow.indexOf('platform: windows-latest')
    const macosIndex = workflow.indexOf('platform: macos-latest')
    expect(windowsIndex).toBeGreaterThan(-1)
    expect(macosIndex).toBeGreaterThan(windowsIndex)
  })

  test('build job runs directly without quality preflight dependency', () => {
    const workflow = readFileSync('.github/workflows/release-desktop.yml', 'utf8')

    expect(workflow).not.toContain('quality-preflight:')
    expect(workflow).not.toContain('run: bun run quality:gate --mode pr')
    expect(workflow).not.toContain('needs: quality-preflight')
    expect(workflow).toContain('name: Build (${{ matrix.label }})')
  })

  test('desktop build workflows keep Bun compile cache on the runner work drive', () => {
    for (const workflowPath of [
      '.github/workflows/build-desktop-dev.yml',
      '.github/workflows/release-desktop.yml',
    ]) {
      const workflow = readFileSync(workflowPath, 'utf8')
      for (const stepName of ['Build sidecars', 'Build Tauri app']) {
        const step = workflow.match(
          new RegExp(`- name: ${stepName}[\\s\\S]*?(?:\\n\\s{6}- name:|\\n\\s*# ──|\\n\\s*with:|$)`),
        )?.[0]

        expect(step, `${workflowPath} ${stepName}`).toContain(
          'BUN_INSTALL_CACHE_DIR: ${{ runner.temp }}/bun-install-cache',
        )
        expect(step, `${workflowPath} ${stepName}`).toContain(
          'TAURI_ENV_TARGET_TRIPLE: ${{ matrix.rust_target }}',
        )
      }
    }
  })
})
