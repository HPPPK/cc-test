import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('real HTTP server preserves an application error status and code while hiding unexpected failures', async () => {
  const previous = process.env.CLAUDE_CONFIG_DIR
  const root = await mkdtemp(join(tmpdir(), 'api-error-response-'))
  process.env.CLAUDE_CONFIG_DIR = root
  const router = await import('../router.js')
  const { ApiError } = await import('../middleware/errorHandler.js')
  const { startServer } = await import('../index.js')
  const { teamWatcher } = await import('../services/teamWatcher.js')
  const { cronScheduler } = await import('../services/cronScheduler.js')
  const stub = spyOn(router, 'handleApiRequest').mockRejectedValue(new ApiError(409, 'Wait for original verification page', 'HUMAN_VERIFICATION_PENDING'))
  const server = startServer(0, '127.0.0.1')
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/test-errors`)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'HUMAN_VERIFICATION_PENDING', message: 'Wait for original verification page' })
    stub.mockRejectedValue(new Error('private unexpected internal detail'))
    const unexpected = await fetch(`http://127.0.0.1:${server.port}/api/test-errors`)
    expect(unexpected.status).toBe(500)
    expect(JSON.stringify(await unexpected.json())).not.toContain('private unexpected internal detail')
  } finally {
    stub.mockRestore(); server.stop(true); teamWatcher.stop(); cronScheduler.stop()
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previous
    await rm(root, { recursive: true, force: true })
  }
})
