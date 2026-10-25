import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import { PLAYWRIGHT_NODE_BOOTSTRAP, PLAYWRIGHT_NODE_RUNNER_PATH_ENV, PLAYWRIGHT_BROWSER_RUNNER_FILE, createPlaywrightBridgeAbortSessionRequest, createPlaywrightBridgeRequest, createPlaywrightNodeBridgeInvocation, normalizePlaywrightNodeRunnerPath } from './nodeBridge.js'

const request = {
  executablePath: 'C:\browser\chrome.exe',
  actions: [{ type: 'navigate' as const, url: 'https://example.com/' }],
  visible: true,
  slowMoMs: 350,
  pageTimeoutMs: 35_000,
  networkIdleTimeoutMs: 2_500,
  maxLinks: 80,
}

describe('Playwright Node bridge', () => {
  test('uses a neutral runner name and keeps the Windows runner path repair', () => {
    expect(PLAYWRIGHT_BROWSER_RUNNER_FILE).toBe('playwright-browser-runner.cjs')
    const longPath = String.raw`\\?\C:\browser\playwright-browser-runner.cjs`
    expect(normalizePlaywrightNodeRunnerPath(longPath)).toBe(String.raw`C:\browser\playwright-browser-runner.cjs`)

    const invocation = createPlaywrightNodeBridgeInvocation({ nodeExecutable: 'C:\node.exe', runnerPath: 'C:\browser\playwright-browser-runner.cjs' })
    expect(invocation.command).toEqual(['C:\node.exe', '--eval', PLAYWRIGHT_NODE_BOOTSTRAP])
    expect(invocation.env[PLAYWRIGHT_NODE_RUNNER_PATH_ENV]).toBe('C:\browser\playwright-browser-runner.cjs')
  })

  test('frames the ordinary shared-session bridge request', () => {
    expect(createPlaywrightBridgeRequest('req-1', 'desktop-session:main', request)).toEqual({
      id: 'req-1',
      type: 'run',
      sessionKey: 'desktop-session:main',
      request,
    })
  })

  test('frames an out-of-band session abort for a bridge request that timed out', () => {
    expect(createPlaywrightBridgeAbortSessionRequest('req-timeout', 'expert:session-1')).toEqual({
      id: 'req-timeout',
      type: 'abort-session',
      sessionKey: 'expert:session-1',
    })
  })

  test('frames a local CDP connection without replacing it with a managed executable', () => {
    const cdpRequest = { ...request, executablePath: undefined, connection: { kind: 'cdp' as const, endpoint: 'http://127.0.0.1:9222' } }
    expect(createPlaywrightBridgeRequest('req-cdp', 'expert:session-1', cdpRequest)).toMatchObject({
      sessionKey: 'expert:session-1',
      request: { connection: { kind: 'cdp', endpoint: 'http://127.0.0.1:9222' } },
    })
  })

  test('preserves the Expert human-verification resolution channel over the persistent bridge', () => {
    const verificationRequest = createPlaywrightBridgeRequest('req-verify', 'expert:session-1', {
      actions: [{ type: 'extract' as const, selector: 'body' }],
      visible: true,
      slowMoMs: 0,
      pageTimeoutMs: 5_000,
      networkIdleTimeoutMs: 500,
      maxLinks: 20,
      preserveHumanVerificationPage: true,
      verificationOwnerId: 'subagent-a',
      verificationResolution: 'switch_public_entry',
    })

    expect(verificationRequest.request).toMatchObject({
      preserveHumanVerificationPage: true,
      verificationOwnerId: 'subagent-a',
      verificationResolution: 'switch_public_entry',
    })
  })

  test('carries runtime-owned presentation and visibility control without adding model-facing fields', () => {
    const bridgeRequest = createPlaywrightBridgeRequest('req-present', 'expert:session-1', {
      ...request,
      presentation: 'assistable_background',
      activityControl: {
        endpoint: 'http://127.0.0.1:3456/api/expert-browser-activity',
        sessionId: 'expert-session-1',
        browserKey: 'expert-session-1:research-agent',
      },
    })

    expect(bridgeRequest.request).toMatchObject({
      presentation: 'assistable_background',
      activityControl: {
        endpoint: 'http://127.0.0.1:3456/api/expert-browser-activity',
        sessionId: 'expert-session-1',
        browserKey: 'expert-session-1:research-agent',
      },
    })
  })
test('emits a live diagnostic when the persistent runner cannot apply browser window presentation', async () => {
    const source = await readFile(path.join(import.meta.dir, 'nodeBridge.ts'), 'utf8')
    expect(source).toContain("buffered.includes('Failed to apply browser window presentation')")
    expect(source).toContain("console.error('[Playwright bridge] '")
  })

})


test('Node eval bridge starts exported runners while preserving legacy self-starting runner compatibility', async () => {
  const dir = await mkdtemp(path.join(process.cwd(), '.runner-bootstrap-'))
  try {
    const legacy = path.join(dir, 'legacy.cjs')
    const exported = path.join(dir, 'exported.cjs')
    await writeFile(legacy, "process.stdout.write('legacy-started\\n')")
    await writeFile(exported, "exports.startServer = () => process.stdout.write('exported-started\\n')")
    for (const [runnerPath, expected] of [[legacy, 'legacy-started\n'], [exported, 'exported-started\n']]) {
      const result = spawnSync('node', ['--eval', PLAYWRIGHT_NODE_BOOTSTRAP], { env: { ...process.env, [PLAYWRIGHT_NODE_RUNNER_PATH_ENV]: runnerPath }, encoding: 'utf8' })
      expect(result.status).toBe(0)
      expect(result.stdout).toBe(expected)
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('compiled production runner imports without side effects and serves direct and eval Node entrypoints', async () => {
  const dir = await mkdtemp(path.join(process.cwd(), '.runner-compiled-'))
  try {
    const result = await Bun.build({ entrypoints: [path.join(import.meta.dir, 'playwright-browser-runner.ts')], outdir: dir, naming: 'runner.cjs', target: 'node', format: 'cjs', external: ['playwright'] })
    expect(result.success).toBe(true)
    const runnerPath = path.join(dir, 'runner.cjs')
    const imported = spawnSync('node', ['--eval', 'require(process.env.CLAUDE_PLAYWRIGHT_BROWSER_RUNNER_PATH);process.stdout.write(String(process.stdin.listenerCount("data")))'], { env: { ...process.env, [PLAYWRIGHT_NODE_RUNNER_PATH_ENV]: runnerPath }, encoding: 'utf8' })
    expect(imported.status).toBe(0)
    expect(imported.stdout).toBe('0')
    for (const [executable, command] of [['node', [runnerPath]], ['node', ['--eval', PLAYWRIGHT_NODE_BOOTSTRAP]], [process.execPath, [path.join(import.meta.dir, 'playwright-browser-runner.ts')]]] as Array<[string, string[]]>) {
      const child = spawnSync(executable, command, { env: { ...process.env, [PLAYWRIGHT_NODE_RUNNER_PATH_ENV]: runnerPath }, input: JSON.stringify({ id: 'close-unused-session', type: 'close-session', sessionKey: 'unused' }) + '\n', encoding: 'utf8', timeout: 10_000 })
      expect(child.status).toBe(0)
      expect(JSON.parse(child.stdout.trim())).toEqual({ id: 'close-unused-session', ok: true })
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
})
