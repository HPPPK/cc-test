import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  collectServerTestFiles,
  evaluateChangedLineCoverage,
  evaluateThresholds,
  runRootCoverage,
  runtimeSourceLines,
  ROOT_COVERAGE_TIMEOUT_MS,
  parseChangedLinesFromDiff,
  mergeLcovFiles,
  parseLcov,
  prefixRelativeLcovSourcePaths,
} from './coverage'

// Bun --isolate resets JS module scopes, but process.umask changes native
// process state. Exercise that boundary along with env and singleton mutation.
function createIsolationFixture(failSecond = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'root-coverage-isolation-')))
  mkdirSync(join(root, 'src/server'), { recursive: true })
  writeFileSync(join(root, 'src/server/subject.ts'), [
    'export function first() {',
    '  return 1',
    '}',
    'export function second() {',
    '  return 2',
    '}',
  ].join('\n'))
  writeFileSync(join(root, 'singleton.ts'), "export const state = { umask: process.umask(), dirty: false }\n")
  writeFileSync(join(root, '01.test.ts'), `
    import { test, expect } from 'bun:test'
    import { first } from './src/server/subject'
    import { state } from './singleton'
    test('first leaves process state dirty', () => {
      expect(first()).toBe(1)
      state.dirty = true
      process.env.CC_COVERAGE_FIXTURE_DIRTY = 'yes'
      process.umask(${process.umask() === 0o077 ? 0o022 : 0o077})
    })
  `)
  writeFileSync(join(root, '02.test.ts'), `
    import { test, expect } from 'bun:test'
    import { second } from './src/server/subject'
    import { state } from './singleton'
    test('second starts clean', () => {
      expect(process.env.CC_COVERAGE_FIXTURE_DIRTY).toBeUndefined()
      expect(state.dirty).toBe(false)
      expect(state.umask).toBe(${process.umask()})
      expect(process.umask()).toBe(${process.umask()})
      expect(process.cwd()).toBe(${JSON.stringify(root)})
      expect(second()).toBe(2)
      ${failSecond ? "throw new Error('intentional fixture failure')" : ''}
    })
  `)
  return root
}

describe('root coverage test collection', () => {
  test('includes all core TS and TSX tests while respecting quarantine and repository boundaries', () => {
    const root = mkdtempSync(join(tmpdir(), 'root-coverage-selection-'))
    const selected = [
      'src/server/routes.test.ts',
      'src/tools/Read.test.ts',
      'src/utils/cache.test.ts',
      'src/entrypoints/sdk/contracts.test.ts',
      'src/components/Select.test.tsx',
      'src/hooks/notifs/install.test.ts',
      'src/state/store.test.ts',
      'src/screens/repl.test.tsx',
      'src/tools/ReadView.test.tsx',
      'src/utils/formatter.test.tsx',
    ]
    const quarantined = 'src/components/quarantined.test.tsx'
    const ignored = ['src/state/contracts.fixture.ts', 'src/subject.ts', 'desktop/src/view.test.tsx', 'adapters/client.test.ts']
    try {
      for (const file of [...selected, quarantined, ...ignored]) {
        mkdirSync(join(root, file, '..'), { recursive: true })
        writeFileSync(join(root, file), '')
      }
      expect(collectServerTestFiles(root, new Set([quarantined]))).toEqual([...selected].sort())
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('coverage gate helpers', () => {
  test('isolates every root coverage file and merges real subprocess LCOV', async () => {
    const root = createIsolationFixture()
    try {
      // Prove the existing aggregate strategy leaks native process state on
      // this Bun runtime before verifying the actual runner's process boundary.
      const aggregate = Bun.spawn(['bun', 'test', '--isolate', '--max-concurrency=1', './01.test.ts', './02.test.ts'], {
        cwd: root, stdout: 'pipe', stderr: 'pipe',
      })
      const [, aggregateError, aggregateExit] = await Promise.all([
        new Response(aggregate.stdout).text(),
        new Response(aggregate.stderr).text(),
        aggregate.exited,
      ])
      // Windows umask is a no-op, so it cannot demonstrate POSIX native-state
      // leakage. The isolated runner below must pass on both platforms.
      if (process.platform === 'win32') {
        expect(aggregateExit).toBe(0)
      } else {
        expect(aggregateExit).not.toBe(0)
        expect(aggregateError).toContain('state.umask')
      }

      const result = await runRootCoverage(['01.test.ts', './02.test.ts'], root, join(root, 'coverage'))
      expect(result.exitCode).toBe(0)
      const merged = readFileSync(result.lcovPath, 'utf8')
      expect((merged.match(/^SF:src\/server\/subject.ts$/gm) ?? [])).toHaveLength(1)
      const summary = parseLcov(merged, {
        rootDir: root,
        scope: { id: 'fixture', title: 'Fixture', includePrefixes: ['src/server/subject.ts'] },
      })
      expect(summary.lines.total).toBeGreaterThan(0)
      const subjectRecord = merged.split('SF:src/server/subject.ts\n')[1].split('end_of_record')[0]
      expect(subjectRecord).toMatch(/DA:2,[1-9]\d*/)
      expect(subjectRecord).toMatch(/DA:5,[1-9]\d*/)
      const coveredLines = (content: string) => {
        const record = content.replaceAll('\\', '/').split('end_of_record')
          .find(section => /^SF:(?:.*\/)?src\/server\/subject\.ts\r?$/m.test(section))
        expect(record).toBeDefined()
        if (!record) throw new Error('Fixture subject is absent from LCOV')
        return [...record.matchAll(/^DA:(\d+),(\d+)/gm)]
          .filter((match) => Number(match[2]) > 0)
          .map((match) => Number(match[1]))
      }
      const expectedCovered = new Set(['000', '001'].flatMap((index) => coveredLines(
        readFileSync(join(root, 'coverage/root-server/per-file', index, 'lcov.info'), 'utf8'),
      )))
      expect(new Set(coveredLines(merged))).toEqual(expectedCovered)
      const log = readFileSync(result.logPath, 'utf8')
      expect(log).toContain(` ${join(root, '01.test.ts')}\n`)
      expect(log).toContain(` ${join(root, '02.test.ts')}\n`)
      expect(log).toContain('first leaves process state dirty')
      expect(log).toContain('second starts clean')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('propagates an isolated file failure and never publishes successful merged coverage', async () => {
    const root = createIsolationFixture(true)
    try {
      const result = await runRootCoverage(['./01.test.ts', './02.test.ts'], root, join(root, 'coverage'))
      expect(result.exitCode).not.toBe(0)
      expect(existsSync(result.lcovPath)).toBe(false)
      const log = readFileSync(result.logPath, 'utf8')
      expect(log).toContain('first leaves process state dirty')
      expect(log).toContain('intentional fixture failure')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('allows Windows Git and worktree coverage tests enough time to complete', () => {
    expect(ROOT_COVERAGE_TIMEOUT_MS).toBe(60_000)
  })

  test('parses lcov totals into percentages', () => {
    const summary = parseLcov([
      'TN:',
      'SF:src/a.ts',
      'FNDA:1,covered',
      'FNDA:0,missing',
      'FNF:4',
      'FNH:3',
      'BRDA:1,0,0,1',
      'BRDA:1,0,1,-',
      'BRF:10',
      'BRH:7',
      'DA:1,1',
      'DA:2,1',
      'DA:3,0',
      'DA:4,1',
      'DA:5,1',
      'end_of_record',
      'SF:src/b.ts',
      'FNDA:1,other',
      'FNF:1',
      'FNH:1',
      'DA:1,1',
      'DA:2,0',
      'end_of_record',
    ].join('\n'))

    expect(summary.lines.pct).toBe(71.43)
    expect(summary.functions.pct).toBe(80)
    expect(summary.branches.pct).toBe(70)
  })

  test('parses duplicate lcov source records using aggregate counters', () => {
    const summary = parseLcov([
      'TN:',
      'SF:src/a.ts',
      'FNDA:0,load',
      'FNF:1',
      'FNH:0',
      'BRDA:1,0,0,0',
      'BRF:1',
      'BRH:0',
      'DA:1,0',
      'DA:2,0',
      'LF:2',
      'LH:0',
      'end_of_record',
      'TN:',
      'SF:src/a.ts',
      'FNDA:2,load',
      'FNF:1',
      'FNH:1',
      'BRDA:1,0,0,1',
      'BRF:1',
      'BRH:1',
      'DA:1,1',
      'DA:2,0',
      'LF:2',
      'LH:1',
      'end_of_record',
    ].join('\n'))

    expect(summary.lines).toEqual({ total: 4, covered: 1, pct: 25 })
    expect(summary.functions).toEqual({ total: 2, covered: 1, pct: 50 })
    expect(summary.branches).toEqual({ total: 2, covered: 1, pct: 50 })
  })

  test('merges separate lcov runs by source path without diluting coverage', () => {
    const root = `/tmp/coverage-merge-${crypto.randomUUID()}`
    const first = `${root}/first.lcov`
    const second = `${root}/second.lcov`
    const source = `${root}/src/server/example.ts`
    mkdirSync(`${root}/src/server`, { recursive: true })
    try {
      writeFileSync(first, [
        'TN:',
        `SF:${source}`,
        'FNDA:0,run',
        'FNF:1',
        'FNH:0',
        'DA:1,0',
        'DA:2,0',
        'LF:2',
        'LH:0',
        'end_of_record',
      ].join('\n'))
      writeFileSync(second, [
        'TN:',
        `SF:${source}`,
        'FNDA:1,run',
        'FNF:1',
        'FNH:1',
        'DA:1,1',
        'DA:2,0',
        'LF:2',
        'LH:1',
        'end_of_record',
      ].join('\n'))

      const merged = mergeLcovFiles([first, second], root)
      expect((merged.match(/^SF:/gm) ?? [])).toHaveLength(1)
      expect(parseLcov(merged, { rootDir: root }).lines).toEqual({ total: 2, covered: 1, pct: 50 })
      expect(parseLcov(merged, { rootDir: root }).functions).toEqual({ total: 1, covered: 1, pct: 100 })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('filters lcov records to an explicit source scope', () => {
    const summary = parseLcov([
      'TN:',
      'SF:/repo/src/server/routes.ts',
      'LF:10',
      'LH:8',
      'DA:1,1',
      'DA:2,1',
      'DA:3,1',
      'DA:4,1',
      'DA:5,1',
      'DA:6,1',
      'DA:7,1',
      'DA:8,1',
      'DA:9,0',
      'DA:10,0',
      'FNF:2',
      'FNH:2',
      'FNDA:1,one',
      'FNDA:1,two',
      'end_of_record',
      'SF:/repo/desktop/src-tauri/target/generated.js',
      'LF:100',
      'LH:0',
      'DA:1,0',
      'FNF:10',
      'FNH:0',
      'FNDA:0,generated',
      'end_of_record',
    ].join('\n'), {
      rootDir: '/repo',
      scope: {
        id: 'server-api',
        title: 'Server/API',
        includePrefixes: ['src/server/'],
      },
    })

    expect(summary.lines.pct).toBe(80)
    expect(summary.functions.pct).toBe(100)
  })

  test('prefixes package-relative lcov source paths for changed-line coverage', () => {
    const lcov = prefixRelativeLcovSourcePaths([
      'TN:',
      'SF:src/stores/updateStore.ts',
      'LF:1',
      'LH:1',
      'end_of_record',
      'SF:/repo/desktop/src/main.tsx',
      'LF:1',
      'LH:0',
      'end_of_record',
      'SF:desktop/src/App.tsx',
      'LF:1',
      'LH:1',
      'end_of_record',
    ].join('\n'), 'desktop')

    expect(lcov).toContain('SF:desktop/src/stores/updateStore.ts')
    expect(lcov).toContain('SF:/repo/desktop/src/main.tsx')
    expect(lcov).toContain('SF:desktop/src/App.tsx')
  })

  test('evaluates changed executable line coverage', () => {
    const changedLines = parseChangedLinesFromDiff([
      'diff --git a/src/server/routes.ts b/src/server/routes.ts',
      '--- a/src/server/routes.ts',
      '+++ b/src/server/routes.ts',
      '@@ -10,0 +11,2 @@',
      '+const covered = true',
      '+const uncovered = false',
    ].join('\n'))

    const failures = evaluateChangedLineCoverage(
      changedLines,
      new Map([
        ['src/server/routes.ts', {
          suiteId: 'server-api',
          executableLines: new Set([11, 12]),
          coveredLines: new Set([11]),
        }],
      ]),
      [{
        id: 'server-api',
        title: 'Server/API',
        includePrefixes: ['src/server/'],
      }],
      90,
    ).failures

    expect(failures).toEqual(['changed-lines: coverage 50% is below minimum 90%'])
  })

  test('counts runtime source tokens while excluding comments and erased TypeScript syntax', () => {
    const sourceLines = [
      '// annotation only',
      '/* multiline',
      '   annotation */',
      'interface Envelope {',
      '  kind?: string',
      '}',
      'type Kind = "user" | "system"',
      'import type { Payload } from "./types"',
      'export type { Kind }',
      'declare const ambient: string',
      '/* annotation */ export const covered = 1',
      'export const uncovered = "// runtime string"',
      'const shape = {',
      '  count: 1,',
      '} satisfies {',
      '  count: number',
      '}',
      'const multiline = `first',
      '// still runtime string',
      'last`',
      'const pattern = /\\/\\/runtime/',
      'import { type Payload, runtime } from "./mixed"',
      'runtime()',
      '',
    ]
    const executableLines = new Set(sourceLines.map((_, index) => index + 1))
    const result = evaluateChangedLineCoverage(
      new Map([['src/server/example.ts', executableLines]]),
      new Map([['src/server/example.ts', {
        suiteId: 'server-api', executableLines,
        coveredLines: new Set([11, 13, 14, 15, 18, 19, 20, 21, 22, 23]),
      }]]),
      [{ id: 'server-api', title: 'Server', includePrefixes: ['src/server/'] }],
      100,
      { readSource: () => sourceLines.join('\n') },
    )
    expect(result.files).toEqual([{
      file: 'src/server/example.ts', suiteId: 'server-api', covered: 10, total: 11, pct: 90.91,
    }])
    expect(result.failures).toEqual(['changed-lines: coverage 90.91% is below minimum 100%'])
  })

  test('type-only files do not fail missing coverage but uncovered runtime still does', () => {
    const scopes = [{ id: 'server-api', title: 'Server', includePrefixes: ['src/server/'] }]
    const changed = new Map([['src/server/events.ts', new Set([1, 2, 3])]])
    const typesOnly = evaluateChangedLineCoverage(changed, new Map(), scopes, 90, {
      readSource: () => 'export type Event = {\n  kind: string\n}\n',
    })
    expect(typesOnly.total).toBe(0)
    expect(typesOnly.failures).toEqual([])
    const runtime = evaluateChangedLineCoverage(changed, new Map(), scopes, 90, {
      readSource: () => '// annotation\nexport const event = "runtime"\n',
    })
    expect(runtime.total).toBe(1)
    expect(runtime.files[0]).toMatchObject({ total: 1, covered: 0, reason: 'no coverage data for changed source file' })
    expect(runtime.failures).toEqual(['changed-lines: coverage 0% is below minimum 90%'])
  })

  test('keeps TSX expressions, code after comments and runtime imports measurable', () => {
    const source = [
      'import React from "react"',
      'type Props = { label: string }',
      'const View = ({ label }: Props) => (',
      '  <div>{/* comment */ label}</div>',
      ')',
      'const value = /* annotation */ 42',
    ].join('\n')
    const result = evaluateChangedLineCoverage(
      new Map([['desktop/src/View.tsx', new Set([1, 2, 3, 4, 5, 6])]]),
      new Map([['desktop/src/View.tsx', {
        suiteId: 'desktop', executableLines: new Set([1, 2, 3, 4, 5, 6]), coveredLines: new Set([1, 3, 5, 6]),
      }]]),
      [{ id: 'desktop', title: 'Desktop', includePrefixes: ['desktop/src/'] }],
      100,
      { readSource: () => source },
    )
    expect(result.total).toBe(5)
    expect(result.covered).toBe(4)
    expect(result.failures).toEqual(['changed-lines: coverage 80% is below minimum 100%'])
  })

  test('recognizes erased declarations without excluding runtime inheritance or mixed imports', () => {
    const source = [
      'import {',
      '  type Erased,',
      '  runtime,',
      '} from "./mixed"',
      'export { type Erased } from "./types"',
      'declare namespace Ambient { const value: number }',
      'function overload(value: string): string',
      'function overload(value: string) { return value }',
      'class Child extends runtime<Erased> {',
      '  declare property: Erased',
      '  method(): Erased { return runtime() as Erased }',
      '}',
      'const assertion = <Erased>runtime()',
      'enum Kind { Runtime = 1 }',
      'import {} from "./side-effects"',
    ].join('\n')
    const lines = runtimeSourceLines(source, 'example.ts')!
    expect([...lines].sort((a, b) => a - b)).toEqual([1, 3, 4, 8, 9, 11, 12, 13, 14, 15])
    expect(runtimeSourceLines('export declare class OnlyTypes { method(): void }', 'types.d.ts')!.size).toBe(0)
    expect(runtimeSourceLines('export const invalid = {', 'invalid.ts')).toBeNull()
    const fallback = evaluateChangedLineCoverage(
      new Map([['src/server/broken.ts', new Set([1])]]), new Map(),
      [{ id: 'server-api', title: 'Server', includePrefixes: ['src/server/'] }], 90,
      { readSource: () => 'export const invalid = {' },
    )
    expect(fallback.total).toBe(1)
    expect(fallback.failures).toEqual(['changed-lines: coverage 0% is below minimum 90%'])
  })

  test('excludes non-instrumented desktop styles from changed-line coverage', () => {
    const changedLines = parseChangedLinesFromDiff([
      'diff --git a/desktop/src/theme/globals.css b/desktop/src/theme/globals.css',
      '--- a/desktop/src/theme/globals.css',
      '+++ b/desktop/src/theme/globals.css',
      '@@ -10,0 +11,2 @@',
      '+.sidebar {',
      '+  color: var(--color-text-primary);',
      '+}',
      'diff --git a/desktop/src/main.tsx b/desktop/src/main.tsx',
      '--- a/desktop/src/main.tsx',
      '+++ b/desktop/src/main.tsx',
      '@@ -20,0 +21,1 @@',
      '+bootstrapDesktopApp()',
    ].join('\n'))

    const result = evaluateChangedLineCoverage(
      changedLines,
      new Map([
        ['desktop/src/main.tsx', {
          suiteId: 'desktop',
          executableLines: new Set([21]),
          coveredLines: new Set([21]),
        }],
      ]),
      [{
        id: 'desktop',
        title: 'Desktop',
        includePrefixes: ['desktop/src/'],
        excludeSuffixes: ['.css'],
      }],
      90,
      { readSource: () => null },
    )

    expect(result.files).toEqual([{
      file: 'desktop/src/main.tsx',
      suiteId: 'desktop',
      covered: 1,
      total: 1,
      pct: 100,
    }])
    expect(result.failures).toEqual([])
  })

  test('reports minimum threshold failures', () => {
    const failures = evaluateThresholds([
      {
        id: 'root-server',
        title: 'Root',
        status: 'passed',
        command: ['bun', 'test'],
        durationMs: 1,
        logPath: 'coverage.log',
        summary: {
          lines: { total: 100, covered: 79, pct: 79 },
          functions: { total: 10, covered: 9, pct: 90 },
          branches: { total: 10, covered: 8, pct: 80 },
          statements: { total: 100, covered: 79, pct: 79 },
        },
      },
    ], {
      schemaVersion: 1,
      minimums: {
        'root-server': {
          lines: 80,
        },
      },
    })

    expect(failures).toEqual(['root-server: lines coverage 79% is below minimum 80%'])
  })

  test('treats failed suite execution as a coverage failure', () => {
    const failures = evaluateThresholds([
      {
        id: 'desktop',
        title: 'Desktop',
        status: 'failed',
        command: ['bun', 'run', 'test'],
        durationMs: 1,
        logPath: 'coverage.log',
        error: 'coverage command exited with 1',
      },
    ], {
      schemaVersion: 1,
      minimums: {},
    })

    expect(failures).toEqual(['desktop: coverage command exited with 1'])
  })

  test('does not require every suite to exist in the ratchet baseline', () => {
    const failures = evaluateThresholds([
      {
        id: 'new-suite',
        title: 'New suite',
        status: 'passed',
        command: ['bun', 'test'],
        durationMs: 1,
        logPath: 'coverage.log',
        summary: {
          lines: { total: 100, covered: 90, pct: 90 },
          functions: { total: 10, covered: 9, pct: 90 },
          branches: { total: 10, covered: 8, pct: 80 },
          statements: { total: 100, covered: 90, pct: 90 },
        },
      },
    ], {
      schemaVersion: 1,
      minimums: {
        'new-suite': {
          branches: 85,
        },
      },
      ratchet: {
        baselinePath: 'scripts/quality-gate/coverage-baseline.json',
        allowedDropPercent: 0,
      },
    })

    expect(failures).toEqual(['new-suite: branches coverage 80% is below minimum 85%'])
  })
})
