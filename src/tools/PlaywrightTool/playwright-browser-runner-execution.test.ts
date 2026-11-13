import { withFetchPreconnect } from '../../server/__tests__/fixtureAssertions.js'
import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { chromium } from 'playwright'
import { chromium as patchedChromium } from 'patchright'
import { EventEmitter } from 'node:events'
import * as runner from './playwright-browser-runner.js'

const callbacks = new Map<number, () => void>()
let pages: FakePage[] = []
let posts: Record<string, unknown>[] = []
let pageCreationFails = false
let autoAccepted = true
let connected = true
let bounds: Record<string, unknown> = { left: 100, top: 100, width: 1200, height: 800, windowState: 'normal' }
const cdpCalls: string[] = []
const context: any = {
  pages: () => pages,
  browser: () => browser,
  route: async () => {},
  newPage: async () => { if (pageCreationFails) throw new Error('page creation failed'); const page = new FakePage(); pages.push(page); return page },
  newCDPSession: async (page: FakePage) => ({ send: async (method: string, input?: any) => {
    cdpCalls.push(method)
    if (method === 'Target.getTargetInfo') return { targetInfo: { targetId: page.targetId, browserContextId: 'context-1' } }
    if (method === 'Browser.getWindowForTarget') return { windowId: 1, bounds }
    if (method === 'Browser.setWindowBounds') { bounds = { ...bounds, ...input.bounds }; return {} }
    return {}
  }, detach: async () => {} }),
}
const browser: any = {
  isConnected: () => connected,
  contexts: () => [context],
  newContext: async () => context,
  close: async () => { connected = false; for (const page of pages) page.closed = true },
  newBrowserCDPSession: async () => ({ send: async (method: string) => {
    cdpCalls.push(method)
    if (method === 'SystemInfo.getProcessInfo') return { processInfo: [] }
    if (method === 'Target.getBrowserContexts') return { browserContextIds: ['context-1'] }
    if (method === 'Target.createTarget') {
      if (pageCreationFails) throw new Error('page creation failed')
      const page = new FakePage(); pages.push(page); return { targetId: page.targetId }
    }
    return {}
  }, detach: async () => {} }),
}
class FakePage extends EventEmitter {
  targetId = 'target-' + crypto.randomUUID()
  closed = false
  currentUrl = 'about:blank'
  pageTitle = ''
  text = ''
  readyState = 'complete'
  readFails = false
  navigations: string[] = []
  fills = 0
  waits: number[] = []
  url() { return this.currentUrl }
  async title() { return this.pageTitle }
  isClosed() { return this.closed }
  context() { return context }
  async close() { this.closed = true }
  async bringToFront() { cdpCalls.push('bringToFront') }
  mainFrame() { return this }
  frames() { return [this] }
  async goto(url: string) {
    this.emit('request', { isNavigationRequest: () => true, frame: () => this, url: () => url })
    this.navigations.push(url); this.currentUrl = url
    this.emit('framenavigated', this)
  }
  async waitForLoadState() {}
  async waitForTimeout(ms: number) { this.waits.push(ms) }
  async evaluate(callback: () => unknown) {
    if (this.readFails) throw new Error('navigation in progress')
    // Execute the actual page callback against the transport fixture's document.
    // Restoring descriptors keeps browser globals scoped to this synchronous read.
    const location = Object.getOwnPropertyDescriptor(globalThis, 'location')
    const document = Object.getOwnPropertyDescriptor(globalThis, 'document')
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: this.currentUrl } })
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { title: this.pageTitle, body: { innerText: this.text }, readyState: this.readyState, querySelectorAll: () => [] } })
    try { return callback() } finally {
      if (location) Object.defineProperty(globalThis, 'location', location)
      else Reflect.deleteProperty(globalThis, 'location')
      if (document) Object.defineProperty(globalThis, 'document', document)
      else Reflect.deleteProperty(globalThis, 'document')
    }
  }
  locator() { return { isVisible: async () => false, fill: async () => { this.fills++; throw new Error('hidden input') }, innerText: async () => this.text, evaluateAll: async () => [], first: () => this.locator() } }
}
const request = (overrides: Record<string, unknown> = {}): any => ({
  actions: [{ type: 'extract' }], visible: false, slowMoMs: 0, pageTimeoutMs: 100, networkIdleTimeoutMs: 10, maxLinks: 20,
  preserveHumanVerificationPage: true, verificationOwnerId: 'owner', sharedContextKey: 'shared-runner-test',
  activityControl: { endpoint: 'http://127.0.0.1:3456/api/expert-browser-activity', sessionId: 'desktop', browserKey: 'owner-key' }, ...overrides,
})
function setup() {
  pages = []; posts = []; callbacks.clear(); cdpCalls.length = 0; pageCreationFails = false; connected = true; autoAccepted = true
  bounds = { left: 100, top: 100, width: 1200, height: 800, windowState: 'normal' }
  spyOn(chromium, 'launch').mockResolvedValue(browser)
  spyOn(patchedChromium, 'launch').mockResolvedValue(browser)
  spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => {
    callbacks.set(delay, callback)
    return { unref() {} }
  }) as any)
  spyOn(globalThis, 'clearInterval').mockImplementation(() => {})
  spyOn(globalThis, 'fetch').mockImplementation(withFetchPreconnect(async (_url, init) => {
    if (init?.body) { posts.push(JSON.parse(String(init.body))); return new Response('{}', { status: autoAccepted ? 200 : 409 }) }
    return Response.json({ showGeneration: 0, verificationCheckGeneration: 0 })
  }))
}
async function flush() { for (let i = 0; i < 10; i += 1) await Promise.resolve() }
async function tick() { callbacks.get(3_000)?.(); await flush() }
async function gate() {
  await runner.runSession('owner', request())
  const page = pages[0]!
  page.currentUrl = 'https://www.google.com/sorry/index'
  page.pageTitle = 'Unusual traffic'
  page.text = 'Verify you are human'
  const result = await runner.runSession('owner', request())
  await flush()
  expect(result.error).toContain('EXPERT_HUMAN_VERIFICATION_REQUIRED')
  expect(callbacks.has(3_000)).toBe(true)
  return page
}
afterEach(async () => { if (runner.closeAllSessions) await runner.closeAllSessions(); mock.restore() })

describe('executable browser runner verification', () => {
  test('launches managed sessions with Patchright and keeps the ordinary driver unused', async () => {
    setup()
    await runner.runSession('driver-test', request())
    expect(patchedChromium.launch).toHaveBeenCalledTimes(1)
    expect(chromium.launch).not.toHaveBeenCalled()
  })

  test('does not silently restart with the original driver after a managed launch failure', async () => {
    setup()
    spyOn(patchedChromium, 'launch').mockRejectedValue(new Error('candidate launch failed'))
    await expect(runner.runSession('launch-failure', request())).rejects.toThrow('candidate launch failed')
    expect(chromium.launch).not.toHaveBeenCalled()
  })

  test('keeps explicit user-browser CDP connections on the original driver', async () => {
    setup()
    spyOn(chromium, 'connectOverCDP').mockResolvedValue(browser)
    await runner.runSession('cdp-test', request({ connection: { kind: 'cdp', endpoint: 'http://127.0.0.1:9222' } }))
    expect(chromium.connectOverCDP).toHaveBeenCalledTimes(1)
    expect(patchedChromium.launch).not.toHaveBeenCalled()
  })

  test('captures failed widget requests before navigation and reports a no-control sorry observation without resuming', async () => {
    setup()
    await runner.runSession('owner', request())
    const page = pages[0]!
    page.goto = async (url: string) => {
      page.emit('requestfailed', { url: () => 'https://www.google.com/recaptcha/api.js?token=private', resourceType: () => 'script', failure: () => ({ errorText: 'net::ERR_BLOCKED_BY_CLIENT' }) })
      page.navigations.push(url); page.currentUrl = url
      page.pageTitle = 'Unusual traffic'; page.text = 'Verify you are human'
    }
    const result: any = await runner.runSession('owner', request({ actions: [{ type: 'navigate', url: 'https://www.google.com/sorry/index?token=private' }, { type: 'navigate', url: 'https://example.com' }] }))
    expect(result.error).toContain('EXPERT_HUMAN_VERIFICATION_REQUIRED')
    expect(result.browserDiagnostics.observation).toBe('unactionable')
    expect(result.browserDiagnostics.events[0]).toEqual({ kind: 'requestfailed', resource: 'verification', code: 'ERR_BLOCKED_BY_CLIENT' })
    expect(JSON.stringify(result.browserDiagnostics)).not.toContain('private')
    expect(page.navigations).toHaveLength(1)
    expect(cdpCalls).not.toContain('bringToFront')
  })

  test('imports without starting stdin transport', () => {
    expect(runner.runSession).toBeFunction()
    expect(runner.closeAllSessions).toBeFunction()
    expect(runner.startServer).toBeFunction()
  })

  test('retains original page and shared lock through blank, loading, failed and replacement authentication readings', async () => {
    setup()
    const page = await gate()
    const sibling = await runner.runSession('sibling', request({ verificationOwnerId: 'sibling', actions: [{ type: 'navigate', url: 'https://example.com/research' }] }))
    expect(sibling.sharedHumanVerificationBlocked).toBe(true)
    expect(pages).toHaveLength(1)
    page.currentUrl = 'https://example.com/login'; page.pageTitle = 'Sign in'; page.text = 'Email Password'
    await tick(); await tick()
    page.currentUrl = 'https://example.com/results'; page.pageTitle = 'Results'; page.text = ''
    await tick(); await tick()
    page.text = 'Loading results'; page.readyState = 'loading'
    await tick(); await tick()
    page.readyState = 'complete'; page.readFails = true
    await tick(); await tick()
    page.readFails = false
    expect(posts.filter(post => post.action === 'auto_detected_completed')).toHaveLength(0)
    expect(page.navigations).toHaveLength(0)
    expect(cdpCalls).not.toContain('bringToFront')
    const blocked = await runner.runSession('owner', request({ verificationResolution: 'verified' }))
    expect(blocked.error).toBeUndefined()
  })

  test('requires two healthy passive readings and retries a rejected acknowledgement before same-page resume', async () => {
    setup()
    const page = await gate()
    page.currentUrl = 'https://example.com/results'; page.pageTitle = 'Results'; page.text = 'Public results'
    await tick()
    expect(posts.filter(post => post.action === 'auto_detected_completed')).toHaveLength(0)
    autoAccepted = false
    await tick()
    expect(posts.filter(post => post.action === 'auto_detected_completed')).toHaveLength(1)
    autoAccepted = true
    await tick()
    expect(posts.filter(post => post.action === 'auto_detected_completed')).toHaveLength(2)
    const result = await runner.runSession('owner', request({ verificationResolution: 'verified' }))
    expect(result.text).toBe('Public results')
    expect(result.error).toBeUndefined()
    expect(pages).toHaveLength(1)
    expect(page.navigations).toHaveLength(0)
  })

  test('closed preserved pages cannot become verified or create replacement tabs', async () => {
    setup()
    const page = await gate()
    page.closed = true
    await tick(); await tick()
    const result = await runner.runSession('owner', request({ verificationResolution: 'verified' }))
    expect(result.error).toContain('EXPERT_HUMAN_VERIFICATION_PENDING')
    expect(posts.filter(post => post.action === 'auto_detected_completed')).toHaveLength(0)
    expect(pages).toHaveLength(1)
  })

  test('keeps invalid resolutions gated and parks a page only on an explicit evidence-gap decision', async () => {
    setup()
    const page = await gate()
    const invalid = await runner.runSession('owner', request({ verificationResolution: 'verified', actions: [{ type: 'navigate', url: 'https://example.com/skip' }] }))
    expect(invalid.error).toContain('RESOLUTION_INVALID')
    const pending = await runner.runSession('owner', request({ verificationResolution: 'verified' }))
    expect(pending.error).toContain('EXPERT_HUMAN_VERIFICATION_PENDING')
    const skipped = await runner.runSession('owner', request({ verificationResolution: 'record_evidence_gap', actions: [] }))
    expect(skipped.error).toContain('RECORDED_AS_GAP')
    expect(page.closed).toBe(false)
    expect(page.navigations).toHaveLength(0)
  })

  test('uses background page creation and cleans up a failed initial managed browser', async () => {
    setup()
    pageCreationFails = true
    await expect(runner.runSession('failed-owner', request({ presentation: 'assistable_background' }))).rejects.toThrow('page creation failed')
    expect(connected).toBe(false)
    expect(pages).toHaveLength(0)
    connected = true; pageCreationFails = false
    await runner.runSession('background-owner', request({ presentation: 'assistable_background' }))
    expect(cdpCalls).toContain('Target.createTarget')
    expect(cdpCalls).toContain('Browser.setWindowBounds')
    const result = await runner.runSession('background-owner', request({ presentation: 'assistable_background', actions: [{ type: 'new_tab', url: 'https://example.com/results' }] }))
    expect(pages).toHaveLength(2)
    expect(result.url).toBe('https://example.com/results')
    // This fixture has no native browser PID. Both macOS and Windows must
    // fail closed; this unit fixture must never activate a real user process.
    expect(await runner.presentSession('background-owner', 'foreground')).toBe(process.platform !== 'win32' && process.platform !== 'darwin')
    expect(cdpCalls).toContain('bringToFront')
  })
})


test('script-created and replacement tabs use the managed background path and preserve agent ownership', async () => {
  setup()
  const background = { presentation: 'assistable_background' }
  const created = await runner.runSession('script-owner', request({ ...background, actions: [{ type: 'script', script: "const child = await context.newPage(); await child.goto('https://example.com/script-result'); return child.url()" }] }))
  expect(created.error).toBeUndefined()
  expect(created.url).toBe('https://example.com/script-result')
  expect(created.steps[0]?.scriptPages).toContainEqual(expect.objectContaining({ requestedUrl: 'https://example.com/script-result', status: 'opened' }))
  const closeInScript = await runner.runSession('script-owner', request({ ...background, actions: [{ type: 'script', script: 'await page.close(); return "closed"' }] }))
  expect(closeInScript.error).toBeUndefined()
  expect(pages).toHaveLength(3)
  // Close every prior page so close_tab has to create an owned replacement.
  for (const page of pages.slice(0, -1)) page.closed = true
  const closed = await runner.runSession('script-owner', request({ ...background, actions: [{ type: 'close_tab' }] }))
  expect(closed.error).toBeUndefined()
  expect(pages).toHaveLength(4)
  pages.at(-1)!.closed = true
  const recovered = await runner.runSession('script-owner', request({ ...background, actions: [{ type: 'extract' }] }))
  expect(recovered.error).toBeUndefined()
  expect(pages).toHaveLength(5)
  expect(cdpCalls.filter(call => call === 'Target.createTarget')).toHaveLength(5)
})


test('a hidden search input returns an actionable query URL without a 35-second fill or fixed delay', async () => {
  setup()
  await runner.runSession('hidden-search', request({ visible: true, actions: [{ type: 'navigate', url: 'https://www.baidu.com/' }] }))
  const result = await runner.runSession('hidden-search', request({ visible: true, actions: [{ type: 'fill', selector: '#kw', text: 'old photo repair' }] }))
  expect(result.error).toContain('SEARCH_FORM_UNAVAILABLE')
  expect(result.error).toContain('https://www.baidu.com/s?wd=old+photo+repair')
  expect(result.error).toContain('No search was executed')
  expect(pages[0]!.fills).toBe(0)
  expect(pages[0]!.waits).not.toContain(8000)
})

test('a script without a returned value teaches explicit return without claiming empty data', async () => {
  setup()
  const result = await runner.runSession('no-return', request({ actions: [{ type: 'script', script: 'await Promise.resolve(42)' }] }))
  expect(result.error).toBeUndefined()
  expect(result.steps[0]?.detail).toContain('SCRIPT_NO_RETURN_VALUE')
  expect(result.steps[0]?.detail).toContain('return')
})

test('two identical failed actions stop automatic repetition within the same worker only', async () => {
  setup()
  const input = request({ actions: [{ type: 'fill', selector: '#ordinary-form', text: 'test' }] })
  await runner.runSession('repeated-failure', input)
  await runner.runSession('repeated-failure', input)
  const stopped = await runner.runSession('repeated-failure', input)
  expect(stopped.error).toContain('BROWSER_REPEATED_FAILURE')
  expect(stopped.error).toContain('No action was executed')
  expect(pages[0]!.fills).toBe(2)
  const sibling = await runner.runSession('other-worker', input)
  expect(sibling.error).not.toContain('BROWSER_REPEATED_FAILURE')
})


test('switching public entry preserves the unresolved challenge tab unchanged', async () => {
  setup()
  const page = await gate()
  const result = await runner.runSession('owner', request({
    verificationResolution: 'switch_public_entry',
    actions: [{ type: 'navigate', url: 'https://www.baidu.com/s?wd=family%20photos' }],
  }))
  expect(result.url).toBe('https://www.baidu.com/s?wd=family%20photos')
  expect(page.url()).toBe('https://www.google.com/sorry/index')
  expect(page.navigations).toHaveLength(0)
  expect(page.closed).toBe(false)
  expect(pages).toHaveLength(2)
})

test('opening a closed verification page never foregrounds a different owned tab', async () => {
  setup()
  const options = { visible: true }
  await runner.runSession('owner', request(options))
  await runner.runSession('owner', request({ ...options, actions: [{ type: 'new_tab', url: 'https://example.com/ordinary' }] }))
  const verificationPage = pages[1]!
  verificationPage.currentUrl = 'https://www.google.com/sorry/index'
  verificationPage.text = 'Verify you are human'
  await runner.runSession('owner', request(options))
  verificationPage.closed = true
  cdpCalls.length = 0
  expect(await runner.presentSession('owner', 'foreground')).toBe(false)
  expect(cdpCalls).not.toContain('bringToFront')
  expect(pages).toHaveLength(2)
})


test('skipping one preserved challenge releases that gate for unrelated pages and still detects a new challenge', async () => {
  setup()
  await gate()
  const switched = await runner.runSession('owner', request({ verificationResolution: 'switch_public_entry', actions: [
    { type: 'navigate', url: 'https://other.example.com/discussion' }, { type: 'extract', selector: 'body' },
  ] }))
  expect(switched.error).toBeUndefined()
  const next = await runner.runSession('owner', request({ actions: [
    { type: 'navigate', url: 'https://third.example.com/pricing' }, { type: 'extract', selector: 'body' },
  ] }))
  expect(next.error).toBeUndefined()
  const active = pages.at(-1)!
  active.pageTitle = 'Just a moment...'
  active.text = 'Performing security verification. This website uses a security service to protect against malicious bots.'
  const newGate = await runner.runSession('owner', request())
  expect(newGate.error).toContain('EXPERT_HUMAN_VERIFICATION_REQUIRED')
})
