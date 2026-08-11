import { describe, expect, test } from 'bun:test'
import { PLAYWRIGHT_NODE_BOOTSTRAP, PLAYWRIGHT_NODE_RUNNER_PATH_ENV, PLAYWRIGHT_BROWSER_RUNNER_FILE, createPlaywrightBridgeRequest, createPlaywrightNodeBridgeInvocation, normalizePlaywrightNodeRunnerPath } from './nodeBridge.js'

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
})
