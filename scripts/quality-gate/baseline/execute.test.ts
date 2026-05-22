import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupBaselineWorkRoot, verifyChangedFiles } from './execute'
import type { BaselineCase } from '../types'

describe('baseline execution cleanup', () => {
  test('retries transient temp work root cleanup failures', async () => {
    const workRoot = mkdtempSync(join(tmpdir(), 'quality-gate-cleanup-test-'))
    const logPath = join(workRoot, 'server.log')
    writeFileSync(logPath, '')
    let attempts = 0

    try {
      await cleanupBaselineWorkRoot(
        workRoot,
        logPath,
        () => {
          attempts += 1
          if (attempts < 3) {
            const error = new Error('resource busy') as Error & { code: string }
            error.code = 'EBUSY'
            throw error
          }
          rmSync(workRoot, { recursive: true, force: true })
        },
        async () => {},
      )

      expect(attempts).toBe(3)
      expect(existsSync(workRoot)).toBe(false)
    } finally {
      rmSync(workRoot, { recursive: true, force: true })
    }
  })

  test('logs and preserves the lane result when temp cleanup keeps failing', async () => {
    const workRoot = mkdtempSync(join(tmpdir(), 'quality-gate-cleanup-test-'))
    const artifactDir = mkdtempSync(join(tmpdir(), 'quality-gate-cleanup-artifacts-'))
    const logPath = join(artifactDir, 'server.log')
    writeFileSync(logPath, '')
    let attempts = 0

    try {
      await expect(cleanupBaselineWorkRoot(
        workRoot,
        logPath,
        () => {
          attempts += 1
          const error = new Error('still locked') as Error & { code: string }
          error.code = 'EBUSY'
          throw error
        },
        async () => {},
      )).resolves.toBeUndefined()

      expect(attempts).toBeGreaterThan(1)
      expect(readFileSync(logPath, 'utf8')).toContain('Failed to remove temp work root')
    } finally {
      rmSync(workRoot, { recursive: true, force: true })
      rmSync(artifactDir, { recursive: true, force: true })
    }
  })
})

describe('baseline changed file verification', () => {
  const testCase = {
    verify: {
      commands: [],
      expectedFiles: ['src/math.ts'],
      requiredFiles: ['src/math.ts'],
      forbiddenFiles: ['src/forbidden.ts'],
    },
  } as BaselineCase

  test('normalizes changed file separators before comparing case expectations', () => {
    expect(() => verifyChangedFiles(testCase, ['src\\math.ts'])).not.toThrow()
  })
})
