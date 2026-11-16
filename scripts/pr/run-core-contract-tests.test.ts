import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, test, spyOn } from 'bun:test'
import { collectCoreContractTestPaths, runCoreContractTestFiles, runIsolatedCoreContractTest } from './run-core-contract-tests.js'

describe('core contract test gate', () => {
  test('passes an absolute test filename to Bun without changing the selection', async () => {
    const root = join(tmpdir(), 'core-contract-command-fixture')
    const spawn = spyOn(Bun, 'spawn').mockReturnValue({ exited: Promise.resolve(0) } as ReturnType<typeof Bun.spawn>)
    try {
      await runIsolatedCoreContractTest(root, 'src/example.test.ts', '5000', true)
      expect(spawn.mock.calls[0]?.[0]).toEqual([process.execPath, 'test', '--timeout=5000', join(root, 'src/example.test.ts')])
    } finally {
      spawn.mockRestore()
    }
  })
  test('selects uncovered core TS/TSX tests, required repair script tests and respects quarantine', () => {
    const files = [
      'src/server/api.test.ts', 'src/tools/tool.test.ts', 'src/utils/cache.test.ts',
      'src/server/view.test.tsx', 'src/tools/view.test.tsx', 'src/utils/view.test.tsx',
      'src/entrypoints/sdk/contracts.test.ts', 'src/ink/contracts.test.tsx', 'src/services/auth.test.ts',
      'src/types/contract.fixture.ts', 'src/screens/view.test.tsx', 'src/services/quarantined.test.ts',
      'scripts/generate-sdk-types.test.ts', 'scripts/restore-source-map-types.test.ts', 'scripts/normalize-build-constants.test.ts',
      'scripts/pr/run-core-contract-tests.test.ts', 'desktop/src/view.test.tsx',
    ]
    expect(collectCoreContractTestPaths(files, new Set(['src/services/quarantined.test.ts']))).toEqual([
      'scripts/generate-sdk-types.test.ts', 'scripts/normalize-build-constants.test.ts', 'scripts/pr/run-core-contract-tests.test.ts', 'scripts/restore-source-map-types.test.ts',
      'src/entrypoints/sdk/contracts.test.ts', 'src/ink/contracts.test.tsx', 'src/screens/view.test.tsx', 'src/server/view.test.tsx', 'src/services/auth.test.ts', 'src/tools/view.test.tsx', 'src/utils/view.test.tsx',
    ])
  })

  test('normalizes Windows paths and deduplicates selected files', () => {
    expect(collectCoreContractTestPaths(['src\\services\\auth.test.ts', 'src/services/auth.test.ts', 'src\\utils\\cache.test.ts'])).toEqual(['src/services/auth.test.ts'])
  })

  test('runs every file independently and preserves the first failed child exit code', async () => {
    const calls: string[] = []
    const result = await runCoreContractTestFiles(['one.test.ts', 'two.test.ts', 'three.test.ts'], async file => {
      calls.push(file)
      return file === 'two.test.ts' ? 7 : 0
    })
    expect(calls).toEqual(['one.test.ts', 'two.test.ts', 'three.test.ts'])
    expect(result).toEqual({ failedFiles: ['two.test.ts'], exitCode: 7 })
  })

  test('returns success only when every child succeeds', async () => {
    expect(await runCoreContractTestFiles(['one.test.ts'], async () => 0)).toEqual({ failedFiles: [], exitCode: 0 })
  })
})


test('actual child processes isolate environment mutations and propagate a failed assertion', async () => {
  const root = mkdtempSync(join(tmpdir(), 'core-contract-runner-'))
  try {
    writeFileSync(join(root, 'mutate.test.ts'), "import {test} from 'bun:test'\ntest('mutate', () => {process.env.CORE_CONTRACT_ISOLATION_FIXTURE = 'mutated'})\n")
    writeFileSync(join(root, 'clean.test.ts'), "import {test,expect} from 'bun:test'\ntest('clean', () => {expect(process.env.CORE_CONTRACT_ISOLATION_FIXTURE).toBeUndefined()})\n")
    writeFileSync(join(root, 'fail.test.ts'), "import {test,expect} from 'bun:test'\ntest('failure', () => {expect(1).toBe(2)})\n")
    const execute = (file: string) => runIsolatedCoreContractTest(root, file, '5000', true)
    expect(await runCoreContractTestFiles(['./mutate.test.ts', './clean.test.ts'], execute)).toEqual({ failedFiles: [], exitCode: 0 })
    expect(await runCoreContractTestFiles(['./fail.test.ts', './clean.test.ts'], execute)).toEqual({ failedFiles: ['./fail.test.ts'], exitCode: 1 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
