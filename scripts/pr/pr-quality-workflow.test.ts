import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

describe('PR quality workflow', () => {
  test('routes policy outputs into conditional check jobs', () => {
    const workflow = readFileSync('.github/workflows/pr-quality.yml', 'utf8')

    expect(workflow).toContain("if: needs.change-policy.outputs.desktop_checks == 'true'")
    expect(workflow).toContain("if: needs.change-policy.outputs.server_checks == 'true'")
    expect(workflow).toContain("if: needs.change-policy.outputs.adapter_checks == 'true'")
    expect(workflow).toContain("if: needs.change-policy.outputs.desktop_native_checks == 'true'")
    expect(workflow).toContain("if: needs.change-policy.outputs.docs_checks == 'true'")
    expect(workflow).toContain("if: needs.change-policy.outputs.coverage_checks == 'true'")
  })

  test('installs root dependencies before loading policy tests', () => {
    const workflow = readFileSync('.github/workflows/pr-quality.yml', 'utf8')
    const setupBun = workflow.indexOf('name: Setup Bun')
    const installDependencies = workflow.indexOf('name: Install root dependencies', setupBun)
    const runPolicyTests = workflow.indexOf('name: Run policy tests')

    expect(installDependencies).toBeGreaterThan(setupBun)
    expect(installDependencies).toBeLessThan(runPolicyTests)
    expect(workflow.slice(installDependencies, runPolicyTests)).toContain('bun install --frozen-lockfile')
  })

  test('builds the desktop frontend before native checks require its dist resource', () => {
    const workflow = readFileSync('.github/workflows/pr-quality.yml', 'utf8')
    const nativeJob = workflow.indexOf('desktop-native-checks:')
    const buildDesktop = workflow.indexOf('name: Build desktop frontend', nativeJob)
    const runNative = workflow.indexOf('name: Run desktop native checks', nativeJob)

    expect(buildDesktop).toBeGreaterThan(nativeJob)
    expect(buildDesktop).toBeLessThan(runNative)
    expect(workflow.slice(buildDesktop, runNative)).toContain('working-directory: desktop')
    expect(workflow.slice(buildDesktop, runNative)).toContain('bun run build')
  })

  test('keeps coverage artifacts observable in CI', () => {
    const workflow = readFileSync('.github/workflows/pr-quality.yml', 'utf8')

    expect(workflow).toContain('COVERAGE_BASE_REF: origin/${{ github.base_ref }}')
    expect(workflow).toContain('cat "$latest_report" >> "$GITHUB_STEP_SUMMARY"')
    expect(workflow).toContain('uses: actions/upload-artifact@v4')
    expect(workflow).toContain('path: artifacts/coverage/')
    expect(workflow).toContain('retention-days: 14')
  })

  test('exposes a single required gate job for branch protection', () => {
    const workflow = readFileSync('.github/workflows/pr-quality.yml', 'utf8')

    expect(workflow).toContain('pr-quality-gate:')
    expect(workflow).toContain('name: pr-quality-gate')
    expect(workflow).toContain('if: always()')
    expect(workflow).toContain('require_success "change-policy" "${{ needs.change-policy.result }}"')
    expect(workflow).toContain('allow_skip_or_success "coverage-checks" "${{ needs.coverage-checks.result }}"')
  })
})
