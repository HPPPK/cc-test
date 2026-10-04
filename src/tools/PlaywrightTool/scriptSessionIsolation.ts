import type { Browser, BrowserContext, Page } from 'playwright'

type ScopedPlaywrightObjects = {
  page: Page
  context: BrowserContext
  browser: Browser
  pages: () => Page[]
}

type Options = {
  page: Page
  context: BrowserContext
  browser: Browser
  ownedPages: Set<Page>
  onOwnedPage?: (page: Page) => void
}

const PAGE_EVENT_METHODS = new Set(['on', 'once', 'addListener', 'prependListener'])
const PAGE_EVENT_REMOVAL_METHODS = new Set(['off', 'removeListener'])
const CONTEXT_PAGE_EVENT_METHODS = new Set([...PAGE_EVENT_METHODS, ...PAGE_EVENT_REMOVAL_METHODS])
const FORBIDDEN_CONTEXT_METHODS = new Set(['close', 'newCDPSession', 'removeAllListeners'])
const FORBIDDEN_BROWSER_METHODS = new Set(['close', 'disconnect', 'newBrowserCDPSession', 'newContext'])

function bindMethod<T extends object>(target: T, value: unknown): unknown {
  return typeof value === 'function' ? value.bind(target) : value
}

/**
 * Raw script actions keep an official Playwright-shaped API, but an Expert
 * worker may only observe and create pages owned by its own logical session.
 * The shared BrowserContext still carries cookies and verification state.
 * Global context-level page events are deliberately rejected because they
 * cannot identify which Agent created a page inside a shared context; scripts
 * should use context.newPage() or page.waitForEvent('popup') instead.
 */
export function createAgentScopedPlaywrightObjects(options: Options): ScopedPlaywrightObjects {
  const pageProxies = new WeakMap<Page, Page>()
  const pageListenerProxies = new WeakMap<(...args: unknown[]) => unknown, (...args: unknown[]) => unknown>()
  let scopedContext: BrowserContext
  let scopedBrowser: Browser

  const openOwnedPages = (): Page[] => [...options.ownedPages].filter((candidate) => !candidate.isClosed())

  const markOwned = (candidate: Page): Page => {
    const wasOwned = options.ownedPages.has(candidate)
    options.ownedPages.add(candidate)
    if (!wasOwned) options.onOwnedPage?.(candidate)
    return wrapPage(candidate)
  }

  const wrapPopupListener = (listener: (...args: unknown[]) => unknown) => {
    const existing = pageListenerProxies.get(listener)
    if (existing) return existing
    const wrapped = (candidate: Page, ...args: unknown[]) => listener(markOwned(candidate), ...args)
    pageListenerProxies.set(listener, wrapped)
    return wrapped
  }

  const wrapPage = (candidate: Page): Page => {
    const existing = pageProxies.get(candidate)
    if (existing) return existing
    const proxy = new Proxy(candidate, {
      get(target, property) {
        if (property === 'context') return () => scopedContext
        if (property === 'waitForEvent') {
          return async (event: string, ...args: unknown[]) => {
            const result = await (target.waitForEvent as (name: string, ...values: unknown[]) => Promise<unknown>).call(target, event, ...args)
            return event === 'popup' && result && typeof result === 'object'
              ? markOwned(result as Page)
              : result
          }
        }
        if (typeof property === 'string' && PAGE_EVENT_METHODS.has(property)) {
          return (event: string, listener: (...args: unknown[]) => unknown) => {
            const effective = event === 'popup' ? wrapPopupListener(listener) : listener
            ;(Reflect.get(target, property, target) as (name: string, callback: (...args: unknown[]) => unknown) => unknown).call(target, event, effective)
            return proxy
          }
        }
        if (typeof property === 'string' && PAGE_EVENT_REMOVAL_METHODS.has(property)) {
          return (event: string, listener: (...args: unknown[]) => unknown) => {
            const effective = event === 'popup' ? pageListenerProxies.get(listener) ?? listener : listener
            ;(Reflect.get(target, property, target) as (name: string, callback: (...args: unknown[]) => unknown) => unknown).call(target, event, effective)
            return proxy
          }
        }
        return bindMethod(target, Reflect.get(target, property, target))
      },
    }) as Page
    pageProxies.set(candidate, proxy)
    return proxy
  }

  scopedContext = new Proxy(options.context, {
    get(target, property) {
      if (property === 'pages') return () => openOwnedPages().map(wrapPage)
      if (property === 'browser') return () => scopedBrowser
      if (property === 'newPage') {
        return async (...args: unknown[]) => {
          const candidate = await (target.newPage as (...values: unknown[]) => Promise<Page>).apply(target, args)
          return markOwned(candidate)
        }
      }
      if (property === 'waitForEvent') {
        return (event: string, ...args: unknown[]) => {
          if (event === 'page') throw new Error('This shared Expert script cannot observe global BrowserContext page events; use context.newPage() or page.waitForEvent(\'popup\').')
          return (target.waitForEvent as (name: string, ...values: unknown[]) => Promise<unknown>).call(target, event, ...args)
        }
      }
      if (typeof property === 'string' && CONTEXT_PAGE_EVENT_METHODS.has(property)) {
        return (event: string, ...args: unknown[]) => {
          if (event === 'page') throw new Error('This shared Expert script cannot observe global BrowserContext page events; use context.newPage() or page.waitForEvent(\'popup\').')
          const result = (Reflect.get(target, property, target) as (name: string, ...values: unknown[]) => unknown).call(target, event, ...args)
          return result === target ? scopedContext : result
        }
      }
      if (typeof property === 'string' && FORBIDDEN_CONTEXT_METHODS.has(property)) {
        return () => { throw new Error('This shared Expert script cannot close, detach, or globally inspect its BrowserContext.') }
      }
      return bindMethod(target, Reflect.get(target, property, target))
    },
  }) as BrowserContext

  scopedBrowser = new Proxy(options.browser, {
    get(target, property) {
      if (property === 'contexts') return () => [scopedContext]
      if (typeof property === 'string' && FORBIDDEN_BROWSER_METHODS.has(property)) {
        return () => { throw new Error('This shared Expert script cannot close, detach, or create another BrowserContext.') }
      }
      return bindMethod(target, Reflect.get(target, property, target))
    },
  }) as Browser

  return {
    page: wrapPage(options.page),
    context: scopedContext,
    browser: scopedBrowser,
    pages: () => openOwnedPages().map(wrapPage),
  }
}
