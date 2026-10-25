import { describe, expect, test } from 'bun:test'
import { createAgentScopedPlaywrightObjects, createScriptPlaywrightModule } from './scriptSessionIsolation.js'

type FakePage = {
  name: string
  closed: boolean
  isClosed: () => boolean
  context: () => unknown
  waitForEvent?: (event: string) => Promise<unknown>
}

function page(name: string): FakePage {
  return {
    name,
    closed: false,
    isClosed() { return this.closed },
    context() { return null },
  }
}

describe('Agent-scoped Playwright script objects', () => {
  test('uses the runtime background page factory instead of a foreground context page', async () => {
    const owned = page('owned')
    const background = page('background')
    let foregroundCalls = 0
    const context = { newPage: async () => { foregroundCalls++; return page('foreground') } }
    const scoped = createAgentScopedPlaywrightObjects({
      page: owned as never, context: context as never, browser: {} as never,
      ownedPages: new Set([owned as never]),
      createPage: async () => background as never,
    })
    const created = await scoped.context.newPage()
    expect((created as never as FakePage).name).toBe('background')
    expect(foregroundCalls).toBe(0)
    expect(scoped.pages()).toContain(created)
  })
  test('hides sibling pages through page, context, browser, and pages()', async () => {
    const owned = page('owned')
    const sibling = page('sibling')
    const pages = [owned, sibling]
    const context = {
      pages: () => pages,
      browser: () => browser,
      newPage: async () => {
        const created = page('created')
        pages.push(created)
        return created
      },
    }
    const browser = { contexts: () => [context] }
    const scoped = createAgentScopedPlaywrightObjects({
      page: owned as never,
      context: context as never,
      browser: browser as never,
      ownedPages: new Set([owned as never]),
    })

    expect(scoped.pages().map((candidate) => (candidate as never as FakePage).name)).toEqual(['owned'])
    expect(scoped.context.pages().map((candidate) => (candidate as never as FakePage).name)).toEqual(['owned'])
    expect(scoped.browser.contexts()[0]).toBe(scoped.context)
    expect(scoped.page.context()).toBe(scoped.context)

    const created = await scoped.context.newPage()
    expect((created as never as FakePage).name).toBe('created')
    expect(scoped.pages().map((candidate) => (candidate as never as FakePage).name)).toEqual(['owned', 'created'])
  })

  test('claims only page-scoped popups and rejects global context page events', async () => {
    const owned = page('owned')
    const popup = page('popup')
    owned.waitForEvent = async (event) => event === 'popup' ? popup : null
    const context = {
      pages: () => [owned, popup],
      browser: () => browser,
      on: () => context,
      waitForEvent: async () => popup,
    }
    const browser = { contexts: () => [context] }
    const claimed: string[] = []
    const scoped = createAgentScopedPlaywrightObjects({
      page: owned as never,
      context: context as never,
      browser: browser as never,
      ownedPages: new Set([owned as never]),
      onOwnedPage: (candidate) => claimed.push((candidate as never as FakePage).name),
    })

    const opened = await scoped.page.waitForEvent('popup')
    expect((opened as never as FakePage).name).toBe('popup')
    expect(claimed).toEqual(['popup'])
    expect(scoped.pages().map((candidate) => (candidate as never as FakePage).name)).toEqual(['owned', 'popup'])
    expect(() => scoped.context.on('page', () => undefined)).toThrow('cannot observe global BrowserContext page events')
    expect(() => scoped.context.waitForEvent('page')).toThrow('cannot observe global BrowserContext page events')
  })

  test('blocks shared-context and shared-browser lifecycle escape hatches', () => {
    const owned = page('owned')
    const context = { pages: () => [owned], browser: () => browser }
    const browser = { contexts: () => [context] }
    const scoped = createAgentScopedPlaywrightObjects({
      page: owned as never,
      context: context as never,
      browser: browser as never,
      ownedPages: new Set([owned as never]),
    })

    expect(() => scoped.context.close()).toThrow('shared Expert script')
    expect(() => scoped.context.newCDPSession(scoped.page)).toThrow('shared Expert script')
    expect(() => scoped.browser.close()).toThrow('shared Expert script')
    expect(() => scoped.browser.newContext()).toThrow('shared Expert script')
  })
})

describe('background script presentation ownership', () => {
  test('rejects direct script foreground requests and routes browser.newPage through owned background creation', async () => {
    const owned = page('owned')
    let focused = false
    let escaped = false
    const rawPage = { ...owned, bringToFront: async () => { focused = true } }
    const created = page('background')
    const scoped = createAgentScopedPlaywrightObjects({
      page: rawPage as never, context: {} as never,
      browser: { newPage: async () => { escaped = true; return created } } as never,
      ownedPages: new Set([rawPage as never]),
      background: true,
      createPage: async () => created as never,
    })
    expect(() => scoped.page.bringToFront()).toThrow('Open browser')
    const result = await scoped.browser.newPage()
    expect(result.context()).toBe(scoped.context)
    expect(scoped.pages()).toContain(result)
    expect(focused).toBe(false)
    expect(escaped).toBe(false)
  })

  test('preserves normal script foreground behavior', async () => {
    let focused = false
    const rawPage = { ...page('normal'), bringToFront: async () => { focused = true } }
    const scoped = createAgentScopedPlaywrightObjects({
      page: rawPage as never, context: {} as never, browser: {} as never,
      ownedPages: new Set([rawPage as never]),
    })
    await scoped.page.bringToFront()
    expect(focused).toBe(true)
  })
})


describe('background script browser lifecycle', () => {
  test('blocks browser launches and connections while keeping harmless module helpers', () => {
    const methods = ['launch', 'launchPersistentContext', 'launchServer', 'connect', 'connectOverCDP']
    let launched = false
    const browserType = Object.fromEntries(methods.map((name) => [name, () => { launched = true }]))
    const module = { chromium: browserType, firefox: browserType, webkit: browserType, devices: { test: 'device' } }
    const scoped = createScriptPlaywrightModule(module, true)
    for (const name of ['chromium', 'firefox', 'webkit'] as const) {
      for (const method of methods) expect(() => scoped[name][method]!()).toThrow('Open browser')
    }
    expect(scoped.devices).toBe(module.devices)
    expect(launched).toBe(false)
  })

  test('keeps normal and CDP browser modules unchanged', () => {
    const module = { chromium: { launch: () => 'original' } }
    expect(createScriptPlaywrightModule(module, false)).toBe(module)
    expect(createScriptPlaywrightModule(module, false).chromium.launch()).toBe('original')
  })
})

test('background browser-type wrappers preserve bound informational methods and stable identity', () => {
  const browserType = { label: 'chromium', name() { return this.label } }
  const module = { chromium: browserType, devices: {} }
  const scoped = createScriptPlaywrightModule(module, true)
  expect(scoped.chromium).toBe(scoped.chromium)
  expect(scoped.chromium.name()).toBe('chromium')
  expect(scoped.chromium.label).toBe('chromium')
})

test('normal script browser.newPage keeps its original browser behavior', async () => {
  const rawPage = page('normal')
  const browser = { marker: 'raw', newPage: async () => rawPage }
  const scoped = createAgentScopedPlaywrightObjects({
    page: rawPage as never, context: {} as never, browser: browser as never,
    ownedPages: new Set([rawPage as never]),
  })
  expect(await scoped.browser.newPage()).toBe(rawPage as never)
})
