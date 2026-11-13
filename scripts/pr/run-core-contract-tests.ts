#!/usr/bin/env bun

import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadQuarantineManifest, quarantinedPathSet } from '../quality-gate/quarantine.js'

const additionalTests = new Set([
  'scripts/generate-sdk-types.test.ts',
  'scripts/restore-source-map-types.test.ts',
  'scripts/normalize-build-constants.test.ts',
  'scripts/pr/run-core-contract-tests.test.ts',
  'stubs/ant-claude-for-chrome-mcp.test.ts',
])

/** Complement run-server-tests without omitting TSX tests in its directories. */
export function collectCoreContractTestPaths(paths: readonly string[], excluded: ReadonlySet<string> = new Set()): string[] {
  const selected = paths.map(path => path.replaceAll('\\', '/')).filter(path => {
    if (excluded.has(path)) return false
    if (additionalTests.has(path)) return true
    if (!path.startsWith('src/') || !/\.test\.tsx?$/.test(path)) return false
    return !/^src\/(server|tools|utils)\//.test(path) || path.endsWith('.test.tsx')
  })
  return [...new Set(selected)].sort()
}

function sourceFiles(root: string, directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`
    return entry.isDirectory() ? sourceFiles(root, path) : entry.isFile() ? [path] : []
  })
}

export async function runIsolatedCoreContractTest(root: string, file: string, timeoutMs: string, quiet = false): Promise<number> {
  const child = Bun.spawn([process.execPath, 'test', `--timeout=${timeoutMs}`, resolve(root, file)], {
    cwd: root,
    stdout: quiet ? 'ignore' : 'inherit',
    stderr: quiet ? 'ignore' : 'inherit',
  })
  return child.exited
}

export async function runCoreContractTestFiles(files: readonly string[], runFile: (file: string) => Promise<number>): Promise<{ failedFiles: string[], exitCode: number }> {
  const failedFiles: string[] = []
  let exitCode = 0
  for (const file of files) {
    const childExitCode = await runFile(file)
    if (childExitCode !== 0) {
      failedFiles.push(file)
      if (exitCode === 0) exitCode = childExitCode
    }
  }
  return { failedFiles, exitCode }
}

if (import.meta.main) {
  const root = process.cwd()
  const excluded = quarantinedPathSet(loadQuarantineManifest(undefined, { enforceReviewDate: true }))
  const files = collectCoreContractTestPaths([...sourceFiles(root, 'src'), ...additionalTests], excluded)
  const timeoutMs = process.env.CC_JIANGXIA_CORE_TEST_TIMEOUT_MS?.trim() || '60000'
  const result = await runCoreContractTestFiles(files, file => {
    console.log(`\n[check:core-contracts] ${file}`)
    return runIsolatedCoreContractTest(root, file, timeoutMs)
  })
  if (result.failedFiles.length > 0) {
    console.error('\n[check:core-contracts] Failed test files:')
    for (const file of result.failedFiles) console.error(`- ${file}`)
  } else {
    console.log(`\n[check:core-contracts] Passed ${files.length} test files.`)
  }
  process.exit(result.exitCode)
}
