#!/usr/bin/env bun

import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import picomatch from 'picomatch'
import { changedFilesForLocalPrCheck } from './changed-files.js'
import { selectFastLaneTests } from './change-policy.js'

const root = process.cwd()
const MAX_CHANGED_TEST_FILES = Number(process.env.CC_JIANGXIA_FAST_LANE_MAX_CHANGED_TEST_FILES || '20')

function normalizePath(path: string) {
  return path.split(sep).join('/')
}

function walkFiles(dir: string, output: string[]) {
  if (!existsSync(dir)) return

  const stat = statSync(dir)
  if (stat.isFile()) {
    output.push(normalizePath(relative(root, dir)))
    return
  }

  if (!stat.isDirectory()) return

  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'artifacts') {
      continue
    }
    walkFiles(join(dir, entry), output)
  }
}

function candidateRootsForPattern(pattern: string) {
  if (pattern.startsWith('desktop/')) return ['desktop/src']
  if (pattern.startsWith('src/server/')) return ['src/server']
  if (pattern.startsWith('adapters/')) return ['adapters']
  if (pattern.startsWith('docs/')) return ['docs']
  if (pattern.startsWith('scripts/')) return ['scripts']
  return ['.']
}

function matchingFiles(patterns: string[]) {
  const candidates = new Set<string>()
  for (const pattern of patterns) {
    for (const dir of candidateRootsForPattern(pattern)) {
      const files: string[] = []
      walkFiles(join(root, dir), files)
      for (const file of files) {
        candidates.add(file)
      }
    }
  }

  const match = picomatch(patterns, { dot: true })
  return [...candidates].filter(file => match(file)).sort()
}

function isTestFile(file: string) {
  return /\.test\.[cm]?[jt]sx?$/.test(file) ||
    /\.spec\.[cm]?[jt]sx?$/.test(file) ||
    file.includes('/__tests__/')
}

function testNeighborsForSource(file: string) {
  if (isTestFile(file)) {
    return existsSync(join(root, file)) ? [file] : []
  }

  const normalized = file.replace(/\\/g, '/')
  if (!/\.[cm]?[jt]sx?$/.test(normalized)) {
    return []
  }

  const dir = dirname(normalized)
  const ext = extname(normalized)
  const stem = basename(normalized, ext)
  const candidates = [
    join(dir, `${stem}.test${ext}`),
    join(dir, `${stem}.spec${ext}`),
    join(dir, '__tests__', `${stem}.test${ext}`),
    join(dir, '__tests__', `${stem}.spec${ext}`),
  ].map(candidate => candidate.replace(/\\/g, '/'))

  return candidates.filter(candidate => existsSync(join(root, candidate)))
}

function explicitChangedFiles() {
  return process.argv.slice(2).filter(arg => !arg.startsWith('--'))
}

const changedFiles = await changedFilesForLocalPrCheck(explicitChangedFiles())
const selection = selectFastLaneTests(changedFiles)
const selectedPatterns = [
  ...selection.coreSmoke,
]
const selectedPatternFiles = matchingFiles(selectedPatterns)
const changedTestFiles = changedFiles
  .map(file => file.replace(/\\/g, '/'))
  .filter(file => isTestFile(file) && existsSync(join(root, file)))
const includeChangedTestFiles = changedTestFiles.length <= MAX_CHANGED_TEST_FILES
const nearbyTestFiles = changedFiles
  .map(file => file.replace(/\\/g, '/'))
  .filter(file => includeChangedTestFiles || !isTestFile(file))
  .flatMap(file => testNeighborsForSource(file))
const testFiles = [...new Set([
  ...selectedPatternFiles,
  ...(includeChangedTestFiles ? changedTestFiles : []),
  ...nearbyTestFiles,
])].sort()
const desktopTestFiles = testFiles
  .filter(file => file.startsWith('desktop/'))
  .map(file => file.replace(/^desktop\//, ''))
const rootTestFiles = testFiles.filter(file => !file.startsWith('desktop/'))

console.log('Fast-lane test selection')
console.log(`  Changed files: ${changedFiles.length}`)
console.log(`  Risk level: ${selection.riskLevel}`)
console.log(`  Patterns: ${selectedPatterns.length}`)
console.log(`  Changed test files: ${changedTestFiles.length}`)
if (!includeChangedTestFiles) {
  console.log(`  Skipped changed test files: ${changedTestFiles.length} exceeds max ${MAX_CHANGED_TEST_FILES}; running core smoke and nearby tests only`)
}
console.log(`  Nearby test files: ${nearbyTestFiles.length}`)
console.log(`  Test files: ${testFiles.length}`)
console.log(`  Root test files: ${rootTestFiles.length}`)
console.log(`  Desktop test files: ${desktopTestFiles.length}`)

if (selection.escalatedChecks?.length) {
  console.log(`  Escalated checks: ${selection.escalatedChecks.join(', ')}`)
}

for (const skipped of selection.skipped) {
  console.log(`  Skipped ${skipped.area}: ${skipped.reason}`)
}

if (testFiles.length === 0) {
  console.log('No matching fast-lane test files found.')
  process.exit(0)
}

let exitCode = 0

if (rootTestFiles.length > 0) {
  const proc = Bun.spawn(['bun', 'test', ...rootTestFiles], {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  exitCode = await proc.exited
}

if (exitCode === 0 && desktopTestFiles.length > 0) {
  const proc = Bun.spawn(['bun', 'run', 'test', '--', '--run', ...desktopTestFiles], {
    cwd: join(root, 'desktop'),
    stdout: 'inherit',
    stderr: 'inherit',
  })
  exitCode = await proc.exited
}

process.exit(exitCode)
