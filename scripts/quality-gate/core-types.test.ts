import { describe, expect, test } from 'bun:test'
import { lanesForMode } from './modes'
import { readFileSync } from 'node:fs'

// Compilation and generated schema parity must run even when no area lane is selected.
describe('core contract verification', () => {
  for (const mode of ['pr', 'baseline', 'release'] as const) {
    test(`${mode} always checks core types and recovered source boundaries`, () => {
      const lane = lanesForMode(mode).find(item => item.id === 'core-types')
      expect(lane?.command).toEqual(['bun', 'run', 'check:core-contracts'])
      expect(lane?.requiredForModes).toContain(mode)
      expect(lane?.impactRequiredCheck).toBeUndefined()
    })
  }
  test('the unified contract command checks generated parity, missing imports and the full core project', () => {
    const scripts = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts
    expect(scripts['check:core-contracts']).toBe('bun run check:sdk-types && bun run check:source-boundaries && bun run check:types:core && bun run check:core-tests')
    expect(scripts['check:sdk-types']).toBe('bun run scripts/generate-sdk-types.ts --check')
    expect(scripts['check:source-boundaries']).toBe('bun run desktop/scripts/scan-missing-imports.ts --check')
    expect(scripts['check:types:core']).toBe('tsc --noEmit -p tsconfig.json')
  })

  test('policy checks use explicit test paths to avoid repository-wide discovery', () => {
    const scripts = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts
    const testCommand = scripts['check:policy'].split(' && ')[0].split(/\s+/)
    expect(testCommand.slice(0, 2)).toEqual(['bun', 'test'])
    const files = testCommand.slice(2)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(file.startsWith('./')).toBe(true)
      expect(file.endsWith('.test.ts')).toBe(true)
    }
  })

  test('policy checks retain real captured child stdout and stderr', () => {
    const child = Bun.spawnSync([process.execPath, '-e', 'console.log("policy-child-stdout"); console.error("policy-child-stderr")'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(child.exitCode).toBe(0)
    expect(child.stdout.toString()).toContain('policy-child-stdout')
    expect(child.stderr.toString()).toContain('policy-child-stderr')
  })

  test('root command lanes use direct Bun test files instead of discovery filters', () => {
    for (const mode of ['fast', 'baseline', 'pr', 'release'] as const) {
      for (const lane of lanesForMode(mode)) {
        if (lane.command?.[0] !== 'bun' || lane.command[1] !== 'test') continue
        for (const file of lane.command.slice(2).filter(arg => arg.endsWith('.test.ts'))) {
          expect(file.startsWith('./')).toBe(true)
        }
      }
    }
  })

  test('eager root runners resolve selected test paths at the subprocess boundary', () => {
    const server = readFileSync(new URL('../pr/run-server-tests.ts', import.meta.url), 'utf8')
    const fastLane = readFileSync(new URL('../pr/fast-lane-tests.ts', import.meta.url), 'utf8')
    const persistence = readFileSync(new URL('./persistence-upgrade.ts', import.meta.url), 'utf8')
    expect(server).toContain('...testFiles.map(file => resolve(root, file))')
    expect(server).toContain('resolve(root, testFile)]')
    expect(fastLane).toContain('...rootTestFiles.map(file => resolve(root, file))')
    const serverCommand = persistence.split('\n').find(line => line.includes("command: ['bun', 'test',")) ?? ''
    const serverFiles = [...serverCommand.matchAll(/['"]((?:\.\/)?src\/[^'"]+\.test\.ts)['"]/g)].map(match => match[1])
    expect(serverFiles.length).toBeGreaterThan(0)
    expect(serverFiles.every(file => file.startsWith('./'))).toBe(true)
  })
})
