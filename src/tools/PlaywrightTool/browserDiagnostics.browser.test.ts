import { afterEach, expect, test } from 'bun:test'
import { runSession, closeAllSessions } from './playwright-browser-runner.js'

afterEach(closeAllSessions)
const executablePath = process.env.PLAYWRIGHT_DIAGNOSTIC_FIXTURE_EXECUTABLE

test.skipIf(!executablePath)('real headless runner captures a routed offline sorry fixture and keeps the human pause', async () => {
  // All requests are fulfilled/aborted locally. No CAPTCHA or external server is contacted.
  const request: any = {
    executablePath, visible: false, slowMoMs: 0, pageTimeoutMs: 3_000, networkIdleTimeoutMs: 50, maxLinks: 10,
    preserveHumanVerificationPage: true, verificationOwnerId: 'offline-fixture',
    actions: [{ type: 'script', script: `
      await context.route('**/*', async route => {
        if (route.request().url().includes('/captcha/')) return route.abort('blockedbyclient')
        return route.fulfill({ status: 429, contentType: 'text/html', body: '<html><head><title>Unusual traffic</title></head><body>Verify you are human<script src="https://fixture.invalid/captcha/widget.js?secret=private"></script><script>setTimeout(() => { throw new Error("private secret value") }, 0)</script></body></html>' })
      })
      await page.goto('https://fixture.invalid/sorry/index?token=private', { waitUntil: 'load' })
      await page.waitForTimeout(50)
      return 'offline fixture'
    ` }, { type: 'navigate', url: 'https://fixture.invalid/should-not-run' }],
  }
  const result = await runSession('offline-fixture', request)
  expect(result.error).toContain('EXPERT_HUMAN_VERIFICATION_REQUIRED')
  expect(result.steps).toHaveLength(1)
  expect(result.browserDiagnostics).toMatchObject({ observation: 'unactionable', widgetCount: 0, visibleControlCount: 0, mainDocumentStatus: 429, inspectedFrames: 1, inspectionIncomplete: false })
  expect(result.browserDiagnostics?.events).toContainEqual({ kind: 'requestfailed', resource: 'verification', code: 'ERR_BLOCKED_BY_CLIENT' })
  expect(result.browserDiagnostics?.events).toContainEqual({ kind: 'pageerror' })
  expect(JSON.stringify(result.browserDiagnostics)).not.toMatch(/private|secret|https:/)
  const pending = await runSession('offline-fixture', { ...request, actions: [{ type: 'extract' }] })
  expect(pending.error).toContain('EXPERT_HUMAN_VERIFICATION_PENDING')
  expect(pending.verificationGateId).toBe(result.verificationGateId)
}, 15_000)
