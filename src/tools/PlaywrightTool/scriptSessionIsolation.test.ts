import { describe, expect, test } from 'bun:test'
import { createAgentScopedPlaywrightObjects } from './scriptSessionIsolation.js'

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
