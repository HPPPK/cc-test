import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

function readBuildScript() {
  return readFileSync(path.resolve(import.meta.dirname, 'build-sidecars.ts'), 'utf8')
}

function extractWindowsX64BunTarget(source: string) {
  const match = source.match(/case 'x86_64-pc-windows-msvc':[\s\S]*?return '([^']+)'/)
  return match?.[1] ?? null
}

function extractExternalModules(source: string) {
  const match = source.match(/external:\s*\[(.*?)\],\s*compile:/s)
  if (!match) return []

  return [...match[1]!.matchAll(/'([^']+)'/g)].map((item) => item[1]!)
}

describe('build-sidecars Windows x64 target mapping', () => {
  it('keeps the Windows x64 Bun runtime target explicit', () => {
    expect(extractWindowsX64BunTarget(readBuildScript())).toBe('bun-windows-x64')
  })

  it('bundles the IM adapter runtime dependencies into the compiled sidecar', () => {
    const externalModules = extractExternalModules(readBuildScript())

    expect(externalModules).not.toContain('@larksuiteoapi/node-sdk')
    expect(externalModules).not.toContain('grammy')
    expect(externalModules).not.toContain('dingtalk-stream')
  })

  it('keeps Playwright out of the Bun sidecar and bundles optional BiDi handling in the Node runner', () => {
    const source = readBuildScript()
    const externalModules = extractExternalModules(source)

    expect(externalModules).not.toContain('chromium-bidi')
    expect(source).toContain('PLAYWRIGHT_NODE_RUNNER_EXTERNALS')
    expect(source).toContain("'chromium-bidi/lib/cjs/bidiMapper/BidiMapper'")
    expect(source).toContain("'chromium-bidi/lib/cjs/cdp/CdpConnection'")
  })

  it('builds bundled Expert Pack ZIPs before copying pack resources', () => {
    const source = readBuildScript()

    expect(source).toContain('buildBundledExpertPacks')
    expect(source).toContain("path.join(repoRoot, 'scripts', 'build-expert-packs.ts')")
    expect(source.indexOf('await buildBundledExpertPacks()')).toBeLessThan(source.indexOf('await copyBundledWorkflowPacks()'))
  })

  it('blocks stale workflow ZIPs before copying and audits the copied layer', () => {
    const source = readBuildScript()

    expect(source).toContain('checkBundledWorkflowPacks')
    expect(source).toContain("path.join(repoRoot, 'scripts', 'build-workflow-packs.ts')")
    expect(source).toContain("'--check'")
    expect(source.indexOf('await checkBundledWorkflowPacks()')).toBeLessThan(source.indexOf('await copyBundledWorkflowPacks()'))
    expect(source).toContain('auditBundledWorkflowPacks')
    expect(source).toContain("path.join(repoRoot, 'scripts', 'audit-workflow-packs.ts')")
    expect(source).toContain("'--resource-dir'")
    expect(source).toContain("'--output-file'")
    expect(source).toContain("'workflow-pack-audit.json'")
    expect(source.indexOf('await copyBundledWorkflowPacks()')).toBeLessThan(source.indexOf('await auditBundledWorkflowPacks()'))
  })

  it('copies workflow packs next to the compiled sidecar', () => {
    const source = readBuildScript()

    expect(source).toContain('copyBundledWorkflowPacks')
    expect(source).toContain("path.join(repoRoot, 'src', 'server', 'packs')")
    expect(source).toContain("path.join(binariesDir, 'packs')")
  })

  it('downloads the target-platform managed Chromium runtime next to the compiled sidecar', () => {
    const source = readBuildScript()

    expect(source).toContain('buildBundledBrowserRuntime')
    expect(source).toContain("path.join(binariesDir, 'browser-runtime', 'playwright')")
    expect(source).toContain('PLAYWRIGHT_BROWSERS_PATH')
    expect(source).toContain("'playwright', 'install', 'chromium'")
  })

  it('ships Playwright JavaScript packages beside a portable Node-executed runner', () => {
    const source = readBuildScript()

    expect(source).toContain('buildBundledPlaywrightRunner')
    expect(source).toContain("playwright-browser-runner.cjs")
    expect(source).toContain("playwright-browser-runner.ts")
    expect(source).toContain("const PLAYWRIGHT_RUNTIME_PACKAGES = ['playwright', 'playwright-core'] as const")
    expect(source).toContain("path.join(runtimeDir, 'node_modules')")
    expect(source).toContain("path.join(repoRoot, 'node_modules', packageName)")
    expect(source).toContain("'playwright-core/*'")
    expect(source).toContain('identifiers: false')
  })

  it('downloads a pinned Portable Git runtime into Windows release resources', () => {
    const source = readBuildScript()

    expect(source).toContain('buildBundledGitRuntime')
    expect(source).toContain("path.join(resourceDir, 'portable-git')")
    expect(source).toContain("if (targetTriple !== 'x86_64-pc-windows-msvc')")
    expect(source).toContain("path.join(resourceDir, '.keep')")
    expect(source).toContain('waitForManagedGitRuntime')
    expect(source).toContain("'bin', 'bash.exe'")
    expect(source.indexOf("const MANAGED_GIT_VERSION = '2.55.0.3'")).toBeLessThan(source.indexOf('await buildBundledGitRuntime()'))
    expect(source).toContain("const MANAGED_GIT_VERSION = '2.55.0.3'")
    expect(source).toContain('v2.55.0.windows.3')
    expect(source).toContain('ab00566336b5472120f9a52d34f2e79c5406535792acb0548001ffd0bd090e5d')
    expect(source).toContain("'-y', `-o${cacheDir}`")
  })

  it('downloads a pinned Windows Node runtime so generated projects do not need a system Node install', () => {
    const source = readBuildScript()

    expect(source).toContain('buildBundledNodeRuntime')
    expect(source).toContain("path.join(binariesDir, 'node-runtime')")
    expect(source).toContain("const MANAGED_NODE_VERSION = '22.23.1'")
    expect(source).toContain('MANAGED_NODE_ARCHIVE = `${MANAGED_NODE_DIRECTORY}.zip`')
    expect(source).toContain('7df0bc9375723f4a86b3aa1b7cc73342423d9677a8df4538aca31a049e309c29')
    expect(source).toContain("'node.exe'")
    expect(source).toContain("'npm.cmd'")
    expect(source).toContain("'npx.cmd'")
    expect(source).toContain('if (hasManagedNodeRuntime(targetDir))')
    expect(source).toContain('Reusing managed Node runtime')
    expect(source.indexOf('await buildBundledNodeRuntime()')).toBeLessThan(source.indexOf('await compileExecutable('))
  })

  it('copies bundled skill resources next to the compiled sidecar', () => {
    const source = readBuildScript()

    expect(source).toContain('copyBundledSkills')
    expect(source).toContain("path.join(repoRoot, 'src', 'skills', 'bundled')")
    expect(source).toContain("path.join(binariesDir, 'skills', 'bundled')")
    expect(source).toContain('shouldCopyBundledRuntimeSource')
    expect(source).toContain('filter: shouldCopyBundledRuntimeSource')
    expect(source).toContain('/\\.(?:test|spec)\\.[cm]?[jt]sx?$/i')
  })

})
