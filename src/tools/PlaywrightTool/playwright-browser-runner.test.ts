import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'

describe('Playwright browser runner', () => {
  test('executes explicit actions in a visible browser instead of an opaque search workflow', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain("headless: !request.visible")
    expect(source).toContain("for (let index = 0; index < request.actions.length; index += 1)")
    expect(source).toContain("if (action.type === 'fill')")
    expect(source).toContain("if (action.type === 'click')")
    expect(source).toContain("if (action.type === 'press')")
    expect(source).not.toContain('searchEngine')
    expect(source).not.toContain('search_query')
  })

  test('implements the expanded normal Playwright action surface in the real runner', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    for (const action of ['reload', 'go_back', 'go_forward', 'new_tab', 'list_tabs', 'switch_tab', 'close_tab', 'type', 'clear', 'double_click', 'hover', 'focus', 'select_option', 'check', 'uncheck', 'drag_to', 'wait_for_selector', 'wait_for_url', 'wait_for_load_state', 'scroll_into_view', 'get_attribute', 'get_html', 'count', 'is_visible', 'is_enabled', 'is_checked', 'bounding_box']) {
      expect(source).toContain("action.type === '" + action + "'")
    }
    expect(source).toContain('page.locator(action.selector!).first().pressSequentially')
    expect(source).toContain('session.context.newPage()')
    expect(source).toContain('page.waitForURL(action.url!')
    expect(source).toContain("if (action.type === 'script')")
    expect(source).toContain('executeRawPlaywrightScript')
    expect(source).toContain("new Script('(async () => {\\n' + source")
    expect(source).toContain('page,')
    expect(source).toContain('context: session.context')
    expect(source).toContain('browser: session.browser')
    expect(source).toContain('playwright: { chromium, firefox, webkit, devices, selectors, request }')
  })


  test('uses connectOverCDP for an authorized local browser while preserving managed Chromium as the fallback', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain("request.connection?.kind === 'cdp'")
    expect(source).toContain('chromium.connectOverCDP(request.connection.endpoint')
    expect(source).toContain('chromium.launch({')
    expect(source).not.toContain("args: ['--disable-gpu'")
    expect(source).toContain('For a CDP-attached browser, Playwright closes only its debugging connection')
  })

  test('freezes an opted-in shared browser session on a human verification page until its owner resolves it', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain('humanVerificationGate?: HumanVerificationGate')
    expect(source).toContain('EXPERT_HUMAN_VERIFICATION_REQUIRED')
    expect(source).toContain('EXPERT_HUMAN_VERIFICATION_PENDING')
    expect(source).toContain("request.verificationResolution === 'record_evidence_gap'")
    expect(source).toContain('preserveHumanVerificationPage === true')
    expect(source).toContain('if (gate) {')
    expect(source).toContain('session.windowTarget = \'foreground\'')
    expect(source).toContain('ACTIONS_THAT_CAN_SURFACE_HUMAN_VERIFICATION')
    expect(source).toContain('const pageAfterAction = await extractFinalPage(session, request)')
    expect(source).toContain('Stop this very request as soon as a visible verification page appears')
    expect(source).toContain('switch_public_entry requires a new public navigate')
    expect(source).toContain('verified must keep the preserved tab')
    // Detection lives in pageAccessAssessment so Google /sorry Chinese pages can be unit-tested.
    expect(source).toContain('detectHumanVerificationKind')
  })


  test('keeps one browser session across sequential calls and follows popup tabs', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain('const sessions = new Map<string, BrowserSession>()')
    expect(source).toContain("type: 'run'")
    expect(source).toContain('async function openSession(sessionKey: string')
    expect(source).toContain('session.context.on(\'page\', observePopup)')
    expect(source).toContain('switched to the newly opened tab')
    expect(source).toContain('const BROWSER_SESSION_IDLE_MS = 5 * 60_000')
    expect(source).not.toContain('finally {\n    await browser?.close()')
  })

  test('adds only neutral window presentation controls for an assistable managed browser', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain("presentation?: 'assistable_background' | 'always_visible'")
    expect(source).toContain("request.presentation === 'assistable_background' ? ['--start-minimized'] : []")
    expect(source).toContain("if (!isCdp && request.presentation === 'assistable_background')")
    expect(source).toContain('initialWindowPresentationTarget')
    expect(source).toContain('shouldReassertMinimizedAfterAction')
    expect(source).toContain('shouldCallBringToFront')
    expect(source).toContain('windowTargetAfterRun')
    expect(source).toContain("background after the same verification-resume call finishes")
    expect(source).toContain("Browser.setWindowBounds")
    expect(source).toContain("page.bringToFront()")
    expect(source).toContain("setInterval(() => { void pollPresentationControl(session) }, 750)")
    expect(source).not.toContain('searchEngine')
    expect(source).not.toContain('verificationFallbackSearchEngines')
  })
})
