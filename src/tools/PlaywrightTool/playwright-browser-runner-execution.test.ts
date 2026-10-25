import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { chromium } from 'playwright'
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
  url() { return this.currentUrl }
  async title() { return this.pageTitle }
  isClosed() { return this.closed }
  context() { return context }
  async close() { this.closed = true }
  async bringToFront() { cdpCalls.push('bringToFront') }
  mainFrame() { return this }
  async goto(url: string) {
    this.emit('request', { isNavigationRequest: () => true, frame: () => this, url: () => url })
    this.navigations.push(url); this.currentUrl = url
    this.emit('framenavigated', this)
  }
  async waitForLoadState() {}
  async waitForTimeout() {}
  async evaluate(callback: () => unknown) {
    if (this.readFails) throw new Error('navigation in progress')
    // Execute the actual page callback against the transport fixture's document.
    // Restoring descriptors keeps browser globals scoped to this synchronous read.
    const location = Object.getOwnPropertyDescriptor(globalThis, 'location')
    const document = Object.getOwnPropertyDescriptor(globalThis, 'document')
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: this.currentUrl } })
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { title: this.pageTitle, body: { innerText: this.text }, readyState: this.readyState } })
    try { return callback() } finally {
      if (location) Object.defineProperty(globalThis, 'location', location)
      else Reflect.deleteProperty(globalThis, 'location')
      if (document) Object.defineProperty(globalThis, 'document', document)
      else Reflect.deleteProperty(globalThis, 'document')
    }
  }
  locator() { return { innerText: async () => this.text, evaluateAll: async () => [], first: () => this.locator() } }
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
  spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => {
    callbacks.set(delay, callback)
    return { unref() {} }
  }) as any)
  spyOn(globalThis, 'clearInterval').mockImplementation(() => {})
  spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init?: RequestInit) => {
    if (init?.body) { posts.push(JSON.parse(String(init.body))); return new Response('{}', { status: autoAccepted ? 200 : 409 }) }
    return Response.json({ showGeneration: 0, verificationCheckGeneration: 0 })
  })
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
    // This fixture has no native Windows browser PID; it must fail closed there.
    expect(await runner.presentSession('background-owner', 'foreground')).toBe(process.platform !== 'win32')
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
