import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

describe('release desktop workflow', () => {
  test('publishes signed Windows updater artifacts by default and keeps Apple Silicon as an explicit manual opt-in', () => {
    const workflow = readFileSync('.github/workflows/release-desktop.yml', 'utf8')

    expect(workflow).toContain('max-parallel: 1')
    expect(workflow).toContain('include_macos:')
    expect(workflow).toContain("default: false")
    expect(workflow).toContain('matrix: >-')
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.include_macos")
    expect(workflow).not.toContain("if: ${{ matrix.label")
    expect(workflow).toContain('\"platform\":\"windows-latest\"')
    expect(workflow).toContain('\"rust_target\":\"x86_64-pc-windows-msvc\"')
    expect(workflow).toContain('\"platform\":\"macos-latest\"')
    expect(workflow).toContain('\"rust_target\":\"aarch64-apple-darwin\"')
    expect(workflow).toContain('\"tauri_args\":\"--target aarch64-apple-darwin --bundles app,dmg\"')
    expect(workflow).toContain('\"apple_signing_identity\":\"-\"')
    expect(workflow).toContain('TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}')
    expect(workflow).toContain('APPLE_SIGNING_IDENTITY: ${{ matrix.apple_signing_identity }}')
    expect(workflow).toContain('includeUpdaterJson: true')
    expect(workflow).toContain('assetNamePattern: ${{ matrix.asset_name_pattern }}')
    expect(workflow).not.toContain('uploadUpdaterJson:')
    expect(workflow).not.toContain('uploadUpdaterSignatures:')
    expect(workflow).not.toContain('releaseAssetNamePattern:')

    const windowsIndex = workflow.indexOf('\"platform\":\"windows-latest\"')
    const macosIndex = workflow.indexOf('\"platform\":\"macos-latest\"')
    expect(windowsIndex).toBeGreaterThan(-1)
    expect(macosIndex).toBeGreaterThan(windowsIndex)
  })

  test('blocks release builds on the non-live quality preflight and uploads its evidence', () => {
    const workflow = readFileSync('.github/workflows/release-desktop.yml', 'utf8')

    expect(workflow).toContain('quality-preflight:')
    expect(workflow).toContain('run: bun run quality:gate --mode pr')
    expect(workflow).toContain('name: Upload release quality gate')
    expect(workflow).toContain('name: release-quality-gate')
    expect(workflow).toContain('needs: quality-preflight')
    expect(workflow).toContain('name: Build (${{ matrix.label }})')
  })

  test('audits the built Windows installer before release upload', () => {
    const workflow = readFileSync('.github/workflows/release-desktop.yml', 'utf8')
    const localBuild = readFileSync('desktop/scripts/build-windows-x64.ps1', 'utf8')

    expect(workflow).toContain('tauriScript: bun run tauri:audited')
    expect(workflow).toContain('workflow-pack-staged-audit.json')
    expect(workflow).toContain('workflow-pack-audit.json')
    expect(workflow).toContain('name: Upload workflow pack audits')
    expect(workflow.indexOf('name: Build Tauri app')).toBeLessThan(workflow.indexOf('name: Upload workflow pack audits'))
    expect(localBuild).toContain(String.raw`scripts\audit-workflow-packs.ts`)
    expect(localBuild).toContain('workflow-pack-staged-audit.json')
    expect(localBuild).toContain(String.raw`scripts\audit-windows-workflow-bundle.ts`)
    expect(localBuild).toContain('windows-release-bundle')
    expect(localBuild).toContain('workflow-pack-audit.json')
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
