import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

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

  test('installs root dependencies before policy tests on a clean runner', () => {
    const workflow = readFileSync('.github/workflows/pr-quality.yml', 'utf8')
    const policyJob = workflow.split('  change-policy:')[1].split('  desktop-checks:')[0]
    expect(policyJob).toContain('name: Install root dependencies\n        run: bun install')
    expect(policyJob.indexOf('name: Install root dependencies')).toBeLessThan(policyJob.indexOf('name: Run policy tests'))
  })

  test('builds frontend resources before the clean-checkout native compile job', () => {
    const workflow = readFileSync('.github/workflows/pr-quality.yml', 'utf8')
    const nativeJob = workflow.split('  desktop-native-checks:')[1].split('  docs-checks:')[0]
    expect(nativeJob).toContain('name: Build desktop frontend resources')
    expect(nativeJob).toContain('working-directory: desktop\n        run: bun run build')
    expect(nativeJob.indexOf('name: Build desktop frontend resources')).toBeLessThan(nativeJob.indexOf('name: Run desktop native checks'))
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


describe('unconditional core contract CI gate', () => {
  function job(workflow: string, name: string): string {
    const marker = `  ${name}:\n`
    const index = workflow.indexOf(marker)
    if (index === -1) throw new Error(`Missing required job: ${name}`)
    return workflow.slice(index + marker.length).split(/^  [a-z][a-z-]+:/m)[0]!
  }

  test('runs SDK parity, source boundaries, and full root types/tests regardless of changed areas', () => {
    const workflow = readFileSync('.github/workflows/pr-quality.yml', 'utf8')
    const core = job(workflow, 'core-types')
    expect(core).toContain('fetch-depth: 0')
    expect(core).toContain('uses: oven-sh/setup-bun@v2')
    expect(core).toContain('run: bun install')
    expect(core).toContain('run: bun run check:core-contracts')
    expect(core.indexOf('run: bun install')).toBeLessThan(core.indexOf('run: bun run check:core-contracts'))
    expect(core).not.toMatch(/^\s+if:/m)
    expect(core).not.toContain('continue-on-error: true')
  })

  test.each(['failure', 'skipped', 'success'])('aggregate gate requires core-types success when other area jobs are skipped: %s', result => {
    const workflow = readFileSync('.github/workflows/pr-quality.yml', 'utf8')
    const aggregate = job(workflow, 'pr-quality-gate')
    expect(aggregate.split('    steps:')[0]).toContain('      - core-types')
    expect(aggregate).toContain('require_success "core-types" "${{ needs.core-types.result }}"')
    const script = aggregate.split('        run: |\n')[1]
    if (!script) throw new Error('Missing aggregate result evaluator')
    const executable = script.replace(/\$\{\{\s*needs\.([a-z-]+)\.result\s*\}\}/g, (_match, name: string) => name === 'change-policy' ? 'success' : name === 'core-types' ? result : 'skipped')
    const child = spawnSync('bash', ['-c', executable], { encoding: 'utf8' })
    expect(child.status).toBe(result === 'success' ? 0 : 1)
  })
})
