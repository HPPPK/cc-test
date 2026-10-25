import type { BrowserContext, Page } from 'playwright'

const contextIds = new WeakMap<BrowserContext, string>()

async function targetInfo(context: BrowserContext, page: Page): Promise<{ targetId: string, browserContextId?: string }> {
  const session = await context.newCDPSession(page)
  try {
    return (await session.send('Target.getTargetInfo')).targetInfo
  } finally {
    await session.detach().catch(() => undefined)
  }
}

/**
 * Background research must not use Playwright's foreground Target.createTarget
 * default. Resolve both the context and returned page by CDP identity; never
 * claim a sibling worker's most recently opened page. Unsupported runtimes fail
 * closed rather than silently falling back to a focus-stealing newPage().
 */
export async function createManagedPage(context: BrowserContext, background: boolean, timeoutMs = 10_000): Promise<Page> {
  if (!background) return context.newPage()
  const browser = context.browser()
  if (!browser) throw new Error('Background page creation requires a connected managed Chromium browser.')
  const session = await browser.newBrowserCDPSession()
  let createdTargetId: string | undefined
  try {
    let browserContextId = contextIds.get(context)
    if (!browserContextId) {
      const existing = context.pages().find((page) => !page.isClosed())
      if (existing) {
        browserContextId = (await targetInfo(context, existing)).browserContextId
      } else {
        // The runner launches one isolated context per managed browser. CDP
        // has no public Playwright-context lookup before its first page exists.
        // Only this unambiguous one-to-one mapping is safe without a seed page.
        const contexts = browser.contexts()
        const { browserContextIds } = await session.send('Target.getBrowserContexts')
        if (contexts.length === 1 && contexts[0] === context && browserContextIds.length === 1) {
          browserContextId = browserContextIds[0]
        }
      }
      if (!browserContextId) throw new Error('Cannot unambiguously identify the managed background browser context.')
      contextIds.set(context, browserContextId)
    }
    const created = await session.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId,
      background: true,
    })
    createdTargetId = created.targetId
    const deadline = Date.now() + timeoutMs
    const checked = new Set<Page>()
    do {
      for (const page of context.pages()) {
        if (page.isClosed() || checked.has(page)) continue
        checked.add(page)
        const info = await targetInfo(context, page)
        if (info.targetId === createdTargetId && info.browserContextId === browserContextId) return page
      }
      if (Date.now() >= deadline) break
      await new Promise((resolve) => setTimeout(resolve, 10))
    } while (Date.now() <= deadline)
    throw new Error('Timed out waiting for the managed background page to attach.')
  } catch (error) {
    if (createdTargetId) await session.send('Target.closeTarget', { targetId: createdTargetId }).catch(() => undefined)
    throw error
  } finally {
    await session.detach().catch(() => undefined)
  }
}

export async function createInitialManagedPage(
  context: BrowserContext,
  background: boolean,
  options: { ownsBrowser: boolean; timeoutMs?: number; onFailure?: () => void },
): Promise<Page> {
  try {
    return await createManagedPage(context, background, options.timeoutMs)
  } catch (error) {
    if (options.ownsBrowser) {
      options.onFailure?.()
      await context.browser()?.close().catch(() => undefined)
    }
    throw error
  }
}
