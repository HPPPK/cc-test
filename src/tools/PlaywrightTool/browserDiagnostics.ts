import type { Page } from 'playwright'

export type BrowserDiagnostics = {
  /** Observed controls only: none of these states means verification passed. */
  observation: 'actionable' | 'loading' | 'unactionable' | 'unknown'
  observedAt: string
  readyState?: string
  widgetCount?: number
  visibleControlCount?: number
  inspectedFrames: number
  inspectionIncomplete: boolean
  mainDocumentStatus?: number
  events: Array<{ kind: 'requestfailed' | 'pageerror'; resource?: 'verification' | 'other'; code?: string }>
  droppedEvents: number
}
type Capture = Pick<BrowserDiagnostics, 'events' | 'droppedEvents' | 'mainDocumentStatus'>
const captures = new WeakMap<Page, Capture>()
const LIMIT = 12

/** Attach before navigation. Store categories/codes only, never URL, error message, headers or cookies. */
export function attachBrowserDiagnostics(page: Page): void {
  if (captures.has(page)) return
  const capture: Capture = { events: [], droppedEvents: 0 }
  captures.set(page, capture)
  const record = (event: BrowserDiagnostics['events'][number]) => {
    if (capture.events.length < LIMIT) capture.events.push(event)
    else capture.droppedEvents++
  }
  page.on('requestfailed', request => {
    const code = request.failure()?.errorText?.match(/\bERR_[A-Z_]{1,64}\b/)?.[0]
    let resource: 'verification' | 'other' = 'other'
    try {
      const url = new URL(request.url())
      if (/\/(?:recaptcha|captcha|challenge)(?:\/|\b)/i.test(url.pathname)) resource = 'verification'
    } catch {}
    record({ kind: 'requestfailed', resource, ...(code ? { code } : {}) })
  })
  page.on('pageerror', () => record({ kind: 'pageerror' }))
  page.on('request', request => {
    try {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        delete capture.mainDocumentStatus
        capture.events = []
        capture.droppedEvents = 0
      }
    } catch {}
  })
  page.on('response', response => {
    try {
      const request = response.request()
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) capture.mainDocumentStatus = response.status()
    } catch {}
  })
}

/** One passive DOM observation. Missing controls may be transient; keep the human gate unchanged. */
export async function readBrowserDiagnostics(page: Page, timeoutMs = 1_000): Promise<BrowserDiagnostics> {
  attachBrowserDiagnostics(page)
  const capture = captures.get(page)!
  const base = { observedAt: new Date().toISOString(), ...capture, events: capture.events.slice() }
  let inspectedFrames = 0
  const deadline = Date.now() + timeoutMs
  try {
    const frames = page.frames()
    let widgetCount = 0
    let visibleControlCount = 0
    let readyState: string | undefined
    let inspectionIncomplete = frames.length > LIMIT
    for (const frame of frames.slice(0, LIMIT)) {
      try {
        let timer: ReturnType<typeof setTimeout> | undefined
        const surface = await Promise.race([frame.evaluate(() => {
          const widgets = Array.from(document.querySelectorAll('iframe')).filter(frame => /recaptcha|captcha|challenge|turnstile|hcaptcha/i.test(frame.getAttribute('src') ?? '')).length
          const controls = Array.from(document.querySelectorAll('button, input:not([type="hidden"]), [role="checkbox"], [role="button"]')).filter(element => {
            const style = getComputedStyle(element)
            const bounds = element.getBoundingClientRect()
            return !('disabled' in element && element.disabled) && element.getAttribute('aria-disabled') !== 'true' && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0 && bounds.width > 0 && bounds.height > 0
          }).length
          return { readyState: document.readyState, widgetCount: widgets, visibleControlCount: controls }
        }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('diagnostic timeout')), Math.max(1, deadline - Date.now())) })]).finally(() => { if (timer) clearTimeout(timer) })
        inspectedFrames++
        if (frame === page.mainFrame()) readyState = surface.readyState
        widgetCount += surface.widgetCount
        visibleControlCount += surface.visibleControlCount
      } catch { inspectionIncomplete = true }
      if (Date.now() >= deadline) { inspectionIncomplete = true; break }
    }
    const observation = inspectionIncomplete || !readyState ? 'unknown'
      : visibleControlCount > 0 ? 'actionable'
      : readyState !== 'complete' ? 'loading'
      : widgetCount > 0 ? 'unknown' : 'unactionable'
    return { ...base, observation, readyState, widgetCount, visibleControlCount, inspectedFrames, inspectionIncomplete }
  } catch {
    return { ...base, observation: 'unknown', inspectedFrames, inspectionIncomplete: true }
  }
}
