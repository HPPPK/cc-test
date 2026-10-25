import { describe, expect, test } from 'bun:test'
import type { Browser, BrowserContext, Page } from 'playwright'
import { createManagedPage, createInitialManagedPage } from './backgroundPage'

function fixture() {
  const calls: Array<[string, unknown]> = []
  const pages: Page[] = []
  const makePage = (id: string) => ({ id, isClosed: () => false }) as unknown as Page
  const expected = makePage('created')
  const sibling = makePage('sibling')
  let ids = ['context-1']
  let failCreate = false
  let attachPage = true
  let attachDelay = 0
  let targetContextId = 'context-1'
  let detachFails = false
  let pageDetachFails = false
  let closeFails = false
  let extraContext = false
  let browserCloseFails = false
  const browserSession = {
    send: async (method: string, params?: unknown) => {
      calls.push([method, params])
      if (method === 'Target.getBrowserContexts') return { browserContextIds: ids }
      if (method === 'Target.createTarget') {
        if (failCreate) throw new Error('creation failed')
        if (attachPage) {
          if (attachDelay) setTimeout(() => pages.push(sibling, expected), attachDelay)
          else pages.push(sibling, expected)
        }
        return { targetId: 'created' }
      }
      if (method === 'Target.closeTarget' && closeFails) throw new Error('target already closed')
      return {}
    },
    detach: async () => { calls.push(['browser.detach', undefined]); if (detachFails) throw new Error('detached') },
  }
  const context = {
    browser: () => browser,
    pages: () => pages,
    newPage: async () => { calls.push(['context.newPage', undefined]); return expected },
    newCDPSession: async (page: Page) => ({
      send: async () => ({ targetInfo: { targetId: (page as unknown as { id: string }).id, browserContextId: targetContextId } }),
      detach: async () => { calls.push(['page.detach', undefined]); if (pageDetachFails) throw new Error('page already detached') },
    }),
  } as unknown as BrowserContext
  const browser = {
    contexts: () => extraContext ? [context, {}] : [context],
    close: async () => { calls.push(['browser.close', undefined]); if (browserCloseFails) throw new Error('browser already closed') },
    newBrowserCDPSession: async () => browserSession,
  } as unknown as Browser
  return { context, calls, pages, expected, sibling, setIds: (value: string[]) => { ids = value }, fail: () => { failCreate = true }, noPage: () => { attachPage = false }, delayed: () => { attachDelay = 20 }, wrongContext: () => { targetContextId = 'foreign' }, brokenDetach: () => { detachFails = true }, brokenPageDetach: () => { pageDetachFails = true }, brokenClose: () => { closeFails = true }, moreContexts: () => { extraContext = true }, brokenBrowserClose: () => { browserCloseFails = true } }
}

describe('managed background page creation', () => {
  test('creates an unfocused CDP target in the correct context and returns its exact page', async () => {
    const f = fixture()
    expect(await createManagedPage(f.context, true)).toBe(f.expected)
    expect(f.calls).toContainEqual(['Target.createTarget', { url: 'about:blank', browserContextId: 'context-1', background: true }])
    expect(f.calls.some(([name]) => name === 'context.newPage')).toBe(false)
    expect(f.calls.at(-1)?.[0]).toBe('browser.detach')
  })

  test('leaves normal and authorized CDP page creation unchanged', async () => {
    const f = fixture()
    expect(await createManagedPage(f.context, false)).toBe(f.expected)
    expect(f.calls).toEqual([['context.newPage', undefined]])
  })

  test('fails closed for an ambiguous empty context without creating a foreground page', async () => {
    const f = fixture()
    f.setIds(['context-1', 'foreign-context'])
    await expect(createManagedPage(f.context, true)).rejects.toThrow('unambiguously')
    expect(f.calls.map(([name]) => name)).toEqual(['Target.getBrowserContexts', 'browser.detach'])
  })

  test('fails closed when the browser has no isolated context id', async () => {
    const f = fixture()
    f.setIds([])
    await expect(createManagedPage(f.context, true)).rejects.toThrow('unambiguously')
  })

  test('resolves an existing page context instead of selecting a sibling context id', async () => {
    const f = fixture()
    f.pages.push(f.sibling)
    f.setIds(['foreign-context', 'context-1'])
    expect(await createManagedPage(f.context, true)).toBe(f.expected)
    expect(f.calls.some(([name]) => name === 'Target.getBrowserContexts')).toBe(false)
    expect(f.calls).toContainEqual(['Target.createTarget', { url: 'about:blank', browserContextId: 'context-1', background: true }])
  })

  test('waits for the exact target to attach after the protocol reply', async () => {
    const f = fixture()
    f.delayed()
    expect(await createManagedPage(f.context, true, 200)).toBe(f.expected)
  })

  test('closes only the newly created target on attachment timeout', async () => {
    const f = fixture()
    f.noPage()
    await expect(createManagedPage(f.context, true, 0)).rejects.toThrow('Timed out')
    expect(f.calls).toContainEqual(['Target.closeTarget', { targetId: 'created' }])
    expect(f.calls.at(-1)?.[0]).toBe('browser.detach')
  })

  test('rejects a target in the wrong context even when the target id matches', async () => {
    const f = fixture()
    f.wrongContext()
    await expect(createManagedPage(f.context, true, 0)).rejects.toThrow('Timed out')
    expect(f.calls).toContainEqual(['Target.closeTarget', { targetId: 'created' }])
  })

  test('detaches after protocol failure without attempting fallback creation', async () => {
    const f = fixture()
    f.fail()
    await expect(createManagedPage(f.context, true)).rejects.toThrow('creation failed')
    expect(f.calls.at(-1)?.[0]).toBe('browser.detach')
    expect(f.calls.some(([name]) => name === 'context.newPage' || name === 'Target.closeTarget')).toBe(false)
  })

  test('keeps a successfully acquired page when session detach already happened', async () => {
    const f = fixture()
    f.brokenDetach()
    expect(await createManagedPage(f.context, true)).toBe(f.expected)
  })

  test('rejects detached contexts before trying to create a target', async () => {
    await expect(createManagedPage({ browser: () => null } as unknown as BrowserContext, true)).rejects.toThrow('connected managed Chromium')
  })


  test('rejects a context mapping when other Playwright contexts also exist', async () => {
    const f = fixture()
    f.moreContexts()
    await expect(createManagedPage(f.context, true)).rejects.toThrow('unambiguously')
  })

  test('keeps the original attachment timeout when the target was already closed', async () => {
    const f = fixture()
    f.noPage()
    f.brokenClose()
    await expect(createManagedPage(f.context, true, 0)).rejects.toThrow('Timed out')
    expect(f.calls.at(-1)?.[0]).toBe('browser.detach')
  })

  test('does not lose the exact page if its temporary identity session already detached', async () => {
    const f = fixture()
    f.brokenPageDetach()
    expect(await createManagedPage(f.context, true)).toBe(f.expected)
  })

  test('uses cached context identity for additional pages in the same managed context', async () => {
    const f = fixture()
    await createManagedPage(f.context, true)
    expect(await createManagedPage(f.context, true)).toBe(f.expected)
    expect(f.calls.filter(([name]) => name === 'Target.getBrowserContexts').length).toBe(1)
  })

})


describe('initial managed target cleanup', () => {
  test('closes only a newly owned browser and rolls back registration after creation failure', async () => {
    const f = fixture()
    f.fail()
    let rolledBack = false
    await expect(createInitialManagedPage(f.context, true, { ownsBrowser: true, onFailure: () => { rolledBack = true } })).rejects.toThrow('creation failed')
    expect(rolledBack).toBe(true)
    expect(f.calls.at(-1)?.[0]).toBe('browser.close')
  })

  test('preserves reused shared or user-owned browsers after a target failure', async () => {
    const f = fixture()
    f.fail()
    let rolledBack = false
    await expect(createInitialManagedPage(f.context, true, { ownsBrowser: false, onFailure: () => { rolledBack = true } })).rejects.toThrow('creation failed')
    expect(rolledBack).toBe(false)
    expect(f.calls.some(([name]) => name === 'browser.close')).toBe(false)
  })

  test('leaves a newly owned browser open after successful first-page attachment', async () => {
    const f = fixture()
    expect(await createInitialManagedPage(f.context, true, { ownsBrowser: true })).toBe(f.expected)
    expect(f.calls.some(([name]) => name === 'browser.close')).toBe(false)
  })
})


test('retains the original target failure when its newly owned browser already closed', async () => {
  const f = fixture()
  f.fail()
  f.brokenBrowserClose()
  await expect(createInitialManagedPage(f.context, true, { ownsBrowser: true })).rejects.toThrow('creation failed')
})
