import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { attachBrowserDiagnostics, readBrowserDiagnostics } from './browserDiagnostics.js'

function fixture(surface = { readyState: 'complete', widgetCount: 0, visibleControlCount: 0 }) {
  const page: any = new EventEmitter()
  page.mainFrame = () => page
  page.frames = () => [page]
  page.evaluate = async () => surface
  return page
}
describe('passive browser diagnostics', () => {
  test('does not attribute a previous main document response to a new navigation', async () => {
    const page = fixture()
    attachBrowserDiagnostics(page)
    page.emit('response', { request: () => ({ isNavigationRequest: () => true, frame: () => page }), status: () => 200 })
    page.emit('request', { isNavigationRequest: () => true, frame: () => page })
    expect((await readBrowserDiagnostics(page)).mainDocumentStatus).toBeUndefined()
  })

  test('bounds a stalled frame inspection without reporting success', async () => {
    const page = fixture()
    page.evaluate = () => new Promise(() => {})
    const result = await readBrowserDiagnostics(page, 5)
    expect(result.observation).toBe('unknown')
    expect(result.inspectionIncomplete).toBe(true)
  })
  test('executes the DOM inspection and ignores hidden or disabled controls', async () => {
    const page = fixture()
    const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
    const oldStyle = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle')
    const control = (hidden: boolean, disabled: boolean) => ({ hidden, disabled, getAttribute: (name: string) => name === 'aria-disabled' && disabled ? 'true' : null, getBoundingClientRect: () => ({ width: 10, height: 10 }) })
    const controls = [control(true, false), control(false, true)]
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { readyState: 'complete', querySelectorAll: (selector: string) => selector === 'iframe' ? [] : controls } })
    Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: (element: any) => ({ visibility: element.hidden ? 'hidden' : 'visible', display: 'block', opacity: '1' }) })
    page.evaluate = async (callback: () => unknown) => callback()
    try {
      expect((await readBrowserDiagnostics(page)).observation).toBe('unactionable')
      controls.push(control(false, false))
      expect((await readBrowserDiagnostics(page)).observation).toBe('actionable')
    } finally {
      if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document')
      if (oldStyle) Object.defineProperty(globalThis, 'getComputedStyle', oldStyle); else Reflect.deleteProperty(globalThis, 'getComputedStyle')
    }
  })

  test('reports absent controls as an observation, never a verification pass, with bounded redacted events', async () => {
    const page = fixture()
    attachBrowserDiagnostics(page)
    for (let i = 0; i < 30; i++) page.emit('requestfailed', {
      url: () => 'https://www.google.com/recaptcha/api.js?secret=token', resourceType: () => 'script',
      failure: () => ({ errorText: 'net::ERR_BLOCKED_BY_CLIENT https://secret.test/token' }),
    })
    page.emit('pageerror', new Error('private page value https://secret.test/token'))
    page.emit('response', { request: () => ({ isNavigationRequest: () => true, frame: () => page }), status: () => 429 })
    const result = await readBrowserDiagnostics(page)
    expect(result.observation).toBe('unactionable')
    expect(result.widgetCount).toBe(0)
    expect(result.events).toHaveLength(12)
    expect(result.mainDocumentStatus).toBe(429)
    expect(JSON.stringify(result)).not.toMatch(/secret|token|private page/)
    expect(result.droppedEvents).toBe(19)
  })
  test('distinguishes loading, incomplete widget observation, visible frame controls and failed inspection', async () => {
    const page = fixture({ readyState: 'loading', widgetCount: 0, visibleControlCount: 0 })
    expect((await readBrowserDiagnostics(page)).observation).toBe('loading')
    page.evaluate = async () => ({ readyState: 'complete', widgetCount: 1, visibleControlCount: 0 })
    expect((await readBrowserDiagnostics(page)).observation).toBe('unknown')
    page.frames = () => [page, { evaluate: async () => ({ readyState: 'complete', widgetCount: 0, visibleControlCount: 1 }) }]
    expect((await readBrowserDiagnostics(page)).observation).toBe('actionable')
    page.evaluate = async () => { throw new Error('private value') }
    expect((await readBrowserDiagnostics(page)).observation).toBe('unknown')
  })
})

test('does not attribute a previous page resource failure to the next verification page', async () => {
  const page = fixture()
  attachBrowserDiagnostics(page)
  page.emit('pageerror', new Error('previous unrelated page'))
  page.emit('request', { isNavigationRequest: () => true, frame: () => page })
  expect((await readBrowserDiagnostics(page)).events).toEqual([])
})
