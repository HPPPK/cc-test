import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'

describe('Playwright browser runner', () => {
  test('executes explicit actions in a visible browser instead of an opaque search workflow', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain("headless: !request.visible && !isAssistableBackground")
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
    expect(source).toContain('const context = requireBrowserContext(session)')
    expect(source).toContain('context.newPage()')
    expect(source).toContain('page.waitForURL(action.url!')
    expect(source).toContain("if (action.type === 'script')")
    expect(source).toContain('executeRawPlaywrightScript')
    expect(source).toContain("new Script('(async () => {\\n' + source")
    expect(source).toContain('page,')
    expect(source).toContain('context,')
    expect(source).toContain('browser: session.browser')
    expect(source).toContain('playwright: { chromium, firefox, webkit, devices, selectors, request }')
  })


  test('keeps a separate active page for every agent while an Expert shares one cookie context', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain('sharedContextKey?: string')
    expect(source).toContain('const sharedContexts = new Map<string, SharedBrowserContext>()')
    expect(source).toContain('const initialPage = await context!.newPage()')
    expect(source).toContain('ownedPages: new Set([initialPage])')
    expect(source).toContain('sessionKeys.add(sessionKey)')
    expect(source).toContain('enqueueSessionRun(queueKeyForSession(raw.sessionKey, raw.request.sharedContextKey)')
  })

  test('limits normal tab recovery and switching to pages owned by the same agent', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain('ownedPages: Set<Page>')
    expect(source).toContain('ownedPages: new Set([initialPage])')
    const activeAndTabs = source.slice(source.indexOf('async function activePage'), source.indexOf('function selectorWaitState'))
    expect(activeAndTabs).toContain('openOwnedPages(session)')
    expect(activeAndTabs).not.toContain('context.pages()')
    const standardTabActions = source.slice(source.indexOf('async function clickAndFollowPopup'), source.indexOf('function humanVerificationKind'))
    expect(standardTabActions).toContain('session.ownedPages.add(popup)')
    expect(standardTabActions).toContain('session.ownedPages.add(next)')
    expect(standardTabActions).toContain('openTabs(session)[action.tab_index!]')
  })

  test('keeps script completion on its own page instead of adopting a sibling tab in a shared Expert context', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    const scriptRunner = source.slice(source.indexOf('async function executeRawPlaywrightScript'), source.indexOf('async function clickAndFollowPopup'))
    expect(scriptRunner).toContain('const scriptOwnedPages: Page[] = []')
    expect(scriptRunner).toContain('if (!scriptOwnedPages.includes(candidate)) scriptOwnedPages.push(candidate)')
    expect(scriptRunner).toContain('onOwnedPage: registerScriptOwnedPage')
    expect(scriptRunner).toContain("candidate.on('popup', registerScriptOwnedPage)")
    expect(scriptRunner).not.toContain("context.on('page'")
    expect(scriptRunner).toContain('const scriptOwnedPage = [...scriptOwnedPages].reverse().find((candidate) => !candidate.isClosed())')
    expect(scriptRunner).toContain('session.ownedPages.add(candidate)')
    expect(scriptRunner).toContain('session.page = scriptOwnedPage ?? fallbackPage')
    expect(scriptRunner).not.toContain('session.page = openTabs(session).at(-1)')
  })

  test('does not expose a sibling verification owner page as the blocked agent result', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    const blockedResult = source.slice(
      source.indexOf('async function sharedVerificationBlockedResult'),
      source.indexOf('async function runSession'),
    )
    expect(blockedResult).toContain('buildSharedVerificationBlockedResult(request, gate, blockedSessionUrl)')
    expect(blockedResult).not.toContain('pendingVerificationResult(owner, gate)')
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
    expect(source).toContain('preserveHumanVerificationWithoutChangingWindow(gate)')
    expect(source).toContain('sharedHumanVerificationOwner')
    expect(source).toContain('The window is intentionally left exactly as the user last left it.')
    expect(source).toContain('ACTIONS_THAT_CAN_SURFACE_HUMAN_VERIFICATION')
    expect(source).toContain('const pageAfterAction = await extractFinalPage(session, request)')
    expect(source).toContain('Stop this very request as soon as a visible verification page appears')
    expect(source).toContain('switch_public_entry requires a new public navigate')
    expect(source).toContain('verified must keep the preserved tab')
    // Detection lives in pageAccessAssessment so Google /sorry Chinese pages can be unit-tested.
    expect(source).toContain('detectHumanVerificationKind')
    expect(source).toContain('sharedHumanVerificationOwnerForContextKey(request.sharedContextKey)')
    expect(source).toContain('buildSharedVerificationBlockedResult')
    expect(source).not.toContain('applyWindowTarget')
    expect(source.indexOf('const sharedOwner = sharedHumanVerificationOwnerForContextKey(request.sharedContextKey)')).toBeLessThan(
      source.indexOf('const session = await openSession(sessionKey, request)'),
    )
    expect(source).toContain("bounds: { windowState: 'normal' }")
    expect(source).not.toContain('reportPresentationResult(session, showGeneration, confirmed)')
  })


  test('recovers a stale page and BrowserContext before restoring a preserved verification window', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain('const current = session.page')
    expect(source).toContain('if (current && !current.isClosed() && session.ownedPages.has(current)) return current')
    expect(source).toContain("import { selectExistingBrowserContext } from './browserSessionContextRecovery.js'")
    expect(source).toContain('function recoverBrowserContext(session: BrowserSession): BrowserContext | undefined')
    expect(source).toContain('const fromShared = session.sharedContextKey')
    expect(source).toContain('session.browser.contexts()')
    expect(source).toContain('function presentationPage(session: BrowserSession, context = recoverBrowserContext(session)): Page | undefined')
    expect(source).toContain('const preservedVerificationPage = gateUrl')
    expect(source).toContain('const page = presentationPage(session, context)')
    expect(source).toContain('no open page remains in the managed browser context')

    const presentationHelper = source.slice(
      source.indexOf('function presentationPage(session: BrowserSession, context = recoverBrowserContext(session)): Page | undefined'),
      source.indexOf('function selectorWaitState'),
    )
    expect(presentationHelper).not.toContain('context.newPage()')
  })
  test('keeps one browser session across sequential calls and follows popup tabs', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain('const sessions = new Map<string, BrowserSession>()')
    expect(source).toContain("type: 'run'")
    expect(source).toContain('async function openSession(sessionKey: string')
    expect(source).toContain("page.waitForEvent('popup'")
    expect(source).toContain('enqueueSessionRun(queueKeyForSession(raw.sessionKey), () => presentSession')
    expect(source).toContain('switched to the newly opened tab')
    expect(source).toContain("if (!action.url) return 'opened a new blank tab'")
    expect(source).toContain('const BROWSER_SESSION_IDLE_MS = 5 * 60_000')
    expect(source).not.toContain('finally {\n    await browser?.close()')
  })

  test('preserves a pending human-verification session when a caller aborts, while explicit close still releases it', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain("if (raw.type === 'abort-session')")
    expect(source).toContain('if (!session?.humanVerificationGate) await closeSession(raw.sessionKey!)')
    expect(source).toContain("if (raw.type === 'close-session')")
    expect(source).toContain('await enqueueSessionRun(queueKeyForSession(raw.sessionKey), () => closeSession(raw.sessionKey!))')
    const closeSessionBody = source.slice(source.indexOf('async function closeSession'), source.indexOf('async function guardPublicBrowserContext'))
    expect(closeSessionBody).not.toContain('sessionQueues.delete')
  })

  test('minimizes assistable Chromium only at session start and never changes a user-opened window later', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain("presentation?: 'assistable_background' | 'always_visible'")
    expect(source).toContain('managedPresentationLaunchArgs(request.presentation)')
    expect(source).toContain('await minimizeBrowserAtSessionStart(session)')
    expect(source).toContain('startupMinimizationAttempted: false')
    expect(source).toContain('shared.userPresentationRequested = true')
    expect(source).toContain('!sharedState.startupMinimizationAttempted && !sharedState.userPresentationRequested')
    expect(source).toContain('function preserveHumanVerificationWithoutChangingWindow')
    expect(source).toContain('async function presentManagedSessionForUser')
    expect(source).toContain("session.connectionKind !== 'managed'")
    expect(source).toContain('showGeneration?: unknown')
    expect(source).toContain('await reportUserRequestedPresentation(session, showGeneration, presentationConfirmed)')
    expect(source).toContain("setInterval(() => { void pollVerificationControl(session) }, 750)")
    expect(source).toContain('startVerificationControlPolling(existing, request)')
    expect(source).not.toContain('startPresentationControlPolling(')
    expect(source).toContain('Browser.setWindowBounds')
    expect(source).not.toContain("if (session.presentation === 'assistable_background') return")
    expect(source).not.toContain('shouldReassertMinimizedAfterAction')
    expect(source).not.toContain('shouldCallBringToFront')
    expect(source).not.toContain('windowTargetAfterRun')
    expect(source).not.toContain('foregroundHumanVerification')
    expect(source).not.toContain('browser.process()')
    expect(source).not.toContain('searchEngine')
    expect(source).not.toContain('verificationFallbackSearchEngines')
  })

  test('passively observes a preserved verification page every second and reports only after two healthy reads', async () => {
    const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
    expect(source).toContain('function observeHumanVerificationRecovery')
    expect(source).toContain("setInterval(() => { void observeHumanVerificationRecovery(session) }, 1_000)")
    expect(source).toContain("action: 'auto_detected_completed'")
    expect(source).toContain('session.humanVerificationHealthyObservations < 2')
    expect(source).toContain('if (!detectedVerificationKind || !ownerId) return null')
    expect(source).toContain('startHumanVerificationMonitoring(session)')
    expect(source).toContain('isHumanVerificationSurfaceStillPresent')
    expect(source).toContain('const candidateVerificationKind')
    expect(source).not.toContain('Boolean(humanVerificationKind(page)) || page.accessLimited')
    expect(source).not.toContain('response.status === 404 || response.status === 409) return true')
    expect(source).not.toContain('holdForHumanAssistanceOnActionFailure')
    expect(source).not.toContain('resumeSelector')
    expect(source).not.toContain('selectorIsUsable')
    const observer = source.slice(source.indexOf('async function observeHumanVerificationRecovery'), source.indexOf('function startHumanVerificationMonitoring'))
    for (const forbiddenOperation of ['.reload(', '.click(', '.dragTo(', '.fill(', '.press(', '.selectOption(']) {
      expect(observer).not.toContain(forbiddenOperation)
    }
  })

})


test('expires the shared verification before sibling navigation while retaining a presentable page', async () => {
  const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
  const run = source.slice(source.indexOf('async function runSession'))
  expect(run.indexOf('expireHumanVerificationGate(candidate)')).toBeLessThan(run.indexOf('sharedHumanVerificationOwnerForContextKey'))
  expect(source).toContain('parkHumanVerificationPage(session)')
  expect(source).toContain('session.preservedVerificationPages?.size')
  const presentation = source.slice(source.indexOf('function presentationPage'), source.indexOf('function selectorWaitState'))
  expect(presentation).toContain('session.preservedVerificationPages')
  expect(presentation).not.toContain('newPage()')
})


test('uses the same page assessment for scripted and ordinary navigation', async () => {
  const { assessRenderedPageAccess } = await import('./pageAccessAssessment.js')
  expect(assessRenderedPageAccess('https://example.com/x', '404 Not Found', 'Missing')).toMatchObject({ accessLimited: false, error: expect.stringContaining('PAGE_UNAVAILABLE') })
  expect(assessRenderedPageAccess('https://example.com/robots.txt', '', 'User-agent: *\nAllow: /')).toEqual({ accessLimited: false })
  const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
  expect(source).toContain('assessRenderedPageAccess(finalUrl, title, renderedText)')
  expect(source).toContain('assessRenderedPageAccess(state.url, state.title, text)')
})

// The orchestration itself is exercised by managedBrowserPresentation.test.ts.
test('wires the explicit show path to native foreground confirmation, not ordinary browsing', async () => {
  const source = await readFile(path.join(import.meta.dir, 'playwright-browser-runner.ts'), 'utf8')
  const explicitShow = source.slice(source.indexOf('async function presentManagedSessionForUser'), source.indexOf('async function presentSession'))
  expect(explicitShow).toContain('return presentManagedBrowserWindow({')
  expect(explicitShow).toContain("restorePage: () => setBrowserWindowPresentation(session, 'foreground')")
  expect(source.match(/presentManagedBrowserWindow\(\{/g)).toHaveLength(1)
})
