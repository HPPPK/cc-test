import type { Browser } from 'playwright'
import { restoreManagedBrowserWindowNatively, type ManagedBrowserWindowBounds } from './managedBrowserNativeWindow.js'

type ManagedBrowserPresentationRequest = {
  browser: Browser
  connectionKind: 'managed' | 'cdp'
  headed: boolean
  bounds: ManagedBrowserWindowBounds
  restorePage: () => Promise<boolean>
}

type PresentationDependencies = {
  platform: NodeJS.Platform
  restoreNative: typeof restoreManagedBrowserWindowNatively
}

/** User-requested presentation only. Never call from navigation or CAPTCHA observation. */
export async function presentManagedBrowserWindow(
  request: ManagedBrowserPresentationRequest,
  dependencies: PresentationDependencies = { platform: process.platform, restoreNative: restoreManagedBrowserWindowNatively },
): Promise<boolean> {
  if (request.connectionKind !== 'managed' || !request.headed || !request.browser.isConnected()) return false

  // Select the preserved verification tab and restore its CDP bounds first.
  // CDP may report a normal window even while Windows keeps it behind the app.
  const pageRestored = await request.restorePage().catch(() => false)
  if (dependencies.platform !== 'win32') return pageRestored

  try {
    // Query the browser we launched, not an arbitrary Chrome/Edge by name.
    // Shared agents hold this same Browser, so they resolve the same process.
    // Do not cache PIDs: a disconnected/replaced browser must not control a reused PID.
    const cdp = await request.browser.newBrowserCDPSession()
    let processId: number | undefined
    try {
      const { processInfo } = await cdp.send('SystemInfo.getProcessInfo') as {
        processInfo: Array<{ type: string; id: number }>
      }
      const candidates = processInfo.filter(info => info.type === 'browser' && Number.isInteger(info.id) && info.id > 0)
      if (candidates.length === 1) processId = candidates[0].id
    } finally {
      await cdp.detach().catch(() => undefined)
    }
    if (!processId) {
      console.error('[Playwright] Cannot present managed browser: no unique browser process identity')
      return false
    }
    const confirmed = await dependencies.restoreNative(processId, request.bounds)
    if (!confirmed) console.error('[Playwright] Managed browser native foreground restoration was not confirmed')
    return confirmed
  } catch (error) {
    console.error('[Playwright] Failed to present managed browser natively:', error instanceof Error ? error.message : String(error))
    return false
  }
}
