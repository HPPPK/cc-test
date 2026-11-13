import { describe, expect, test } from 'bun:test'
import { assertExpertRuntimeReadiness } from './expertRuntimeReadiness.js'
const env = { CC_JIANGXIA_EXPERT_TEMPLATE_FILL_DELIVERY: 'cli-only', CC_JIANGXIA_EXPERT_SESSION_ID: 'test-session', CLAUDE_CLI_PATH: '/tmp/app/claude-sidecar', CLAUDE_APP_ROOT: '/tmp/app' }
const tools = [{ name: 'Playwright', isEnabled: () => true }, { name: 'Bash', isEnabled: () => true }]
describe('Expert runtime readiness before model execution', () => {
  test('does not affect ordinary chat or delegated workers', async () => {
    await expect(assertExpertRuntimeReadiness({ tools: [], env: {} })).resolves.toBeUndefined()
    await expect(assertExpertRuntimeReadiness({ tools: [], env, agentId: 'worker' })).resolves.toBeUndefined()
  })
  test('blocks missing browser before spawning a CLI or spending model tokens', async () => {
    let launches = 0
    await expect(assertExpertRuntimeReadiness({ tools: tools.filter(t => t.name !== 'Playwright'), env, run: async () => { launches++; return true } })).rejects.toMatchObject({ code: 'EXPERT_RUNTIME_BROWSER_UNAVAILABLE' })
    expect(launches).toBe(0)
    await expect(assertExpertRuntimeReadiness({ tools: [{ name: 'Playwright', isEnabled: () => false }], env })).rejects.toMatchObject({ code: 'EXPERT_RUNTIME_BROWSER_UNAVAILABLE' })
  })
  test('blocks a missing shell or launcher without guessing installed aliases', async () => {
    await expect(assertExpertRuntimeReadiness({ tools: [tools[0]!], env })).rejects.toMatchObject({ code: 'EXPERT_RUNTIME_CLI_UNAVAILABLE' })
    await expect(assertExpertRuntimeReadiness({ tools, env: { ...env, CLAUDE_CLI_PATH: '' }, execPath: '/tmp/bun' })).rejects.toMatchObject({ code: 'EXPERT_RUNTIME_CLI_UNAVAILABLE' })
  })
  test('checks the actual same-session sidecar schema with its mode and app root', async () => {
    let argv: string[] = []
    await assertExpertRuntimeReadiness({ tools, env, run: async args => { argv = args; return true } })
    expect(argv).toEqual(['/tmp/app/claude-sidecar', 'cli', '--app-root', '/tmp/app', 'expert-template-fill', '--schema', '--session-id', 'test-session'])
  })
  test('fails closed with a bounded recovery message for a broken report CLI', async () => {
    for (const run of [async () => false, async () => { throw new Error('secret-token must not appear') }]) {
      await expect(assertExpertRuntimeReadiness({ tools, env, run })).rejects.toMatchObject({ code: 'EXPERT_RUNTIME_CLI_UNAVAILABLE', message: expect.not.stringContaining('secret-token') })
    }
  })
})

test('runs an executable readiness probe and handles a missing executable without leaking stderr', async () => {
  const { mkdtemp, writeFile, chmod, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')
  if (process.platform === 'win32') return
  const root = await mkdtemp(path.join(tmpdir(), 'expert readiness '))
  const executable = path.join(root, 'claude-sidecar')
  try {
    await writeFile(executable, '#!/bin/sh\n[ "$1" = "cli" ] && [ "$2" = "--app-root" ] && [ "$4" = "expert-template-fill" ] && [ "$5" = "--schema" ] && [ "$7" = "test-session" ]\n')
    await chmod(executable, 0o700)
    await expect(assertExpertRuntimeReadiness({ tools, env: { ...env, CLAUDE_CLI_PATH: executable } })).resolves.toBeUndefined()
    await rm(executable)
    await expect(assertExpertRuntimeReadiness({ tools, env: { ...env, CLAUDE_CLI_PATH: executable } })).rejects.toMatchObject({ code: 'EXPERT_RUNTIME_CLI_UNAVAILABLE' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
