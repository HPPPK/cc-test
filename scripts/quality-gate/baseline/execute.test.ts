import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupBaselineWorkRoot, runPromptOverWebSocket, verifyChangedFiles } from './execute'
import type { BaselineCase } from '../types'

describe('baseline completion waiting', () => {
  async function withServer(mode: 'complete' | 'disconnect' | 'error', timeoutMs: number) {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request, server) { if (server.upgrade(request)) return; return new Response('not found', { status: 404 }) },
      websocket: {
        open(ws) { ws.send(JSON.stringify({ type: 'connected' })) },
        message(ws, data) {
          if (JSON.parse(String(data)).type !== 'user_message') return
          setTimeout(() => {
            if (mode === 'disconnect') ws.close()
            else ws.send(JSON.stringify(mode === 'error' ? { type: 'error', code: 'FIXTURE', message: 'explicit failure' } : { type: 'message_complete' }))
          }, 50)
        },
      },
    })
    try { return await runPromptOverWebSocket(`http://127.0.0.1:${server.port}`, 'fixture', 'work', timeoutMs) }
    finally { server.stop(true) }
  }

  test('zero means unlimited and still waits for actual completion', async () => {
    expect((await withServer('complete', 0)).at(-1)?.type).toBe('message_complete')
  })

  test('unlimited waiting still rejects an explicit model error', async () => {
    await expect(withServer('error', 0)).rejects.toThrow('FIXTURE: explicit failure')
  })

  test('a disconnected session fails instead of waiting forever', async () => {
    await expect(withServer('disconnect', 500)).rejects.toThrow('closed before baseline case completion')
  })

  test('retains an explicitly configured finite deadline', async () => {
    await expect(withServer('complete', 5)).rejects.toThrow('Timed out waiting for baseline case completion')
  })
})

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
