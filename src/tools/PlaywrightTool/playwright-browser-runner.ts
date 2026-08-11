import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createContext, Script } from 'node:vm'
import { chromium, devices, firefox, request, selectors, webkit, type Browser, type BrowserContext, type Page } from 'playwright'
import { classifyRenderedPageAccess, detectHumanVerificationKind } from './pageAccessAssessment.js'
import { normalizePublicBrowserLink } from './linkNormalization.js'
import {
  initialWindowPresentationTarget,
  shouldCallBringToFront,
  shouldReassertMinimizedAfterAction,
  windowTargetAfterRun,
  type WindowPresentationTarget,
} from './presentationPolicy.js'
import { shouldSchedulePlaywrightIdleClose } from './verificationSessionPolicy.js'
import { getUnsafePublicBrowserUrlReason, isBrowserOwnedDocumentUrl } from './runtime.js'

type ActionType = 'navigate' | 'reload' | 'go_back' | 'go_forward' | 'new_tab' | 'list_tabs' | 'switch_tab' | 'close_tab' | 'fill' | 'type' | 'clear' | 'click' | 'double_click' | 'hover' | 'focus' | 'press' | 'select_option' | 'check' | 'uncheck' | 'drag_to' | 'wait' | 'wait_for_selector' | 'wait_for_url' | 'wait_for_load_state' | 'scroll' | 'scroll_into_view' | 'extract' | 'get_attribute' | 'get_html' | 'count' | 'is_visible' | 'is_enabled' | 'is_checked' | 'bounding_box' | 'screenshot' | 'script'

type PlaywrightAction = {
  type: ActionType
  url?: string
  selector?: string
  text?: string
  key?: string
  script?: string
  value?: string | string[]
  attribute?: string
  source_selector?: string
  target_selector?: string
  tab_index?: number
  state?: 'attached' | 'detached' | 'visible' | 'hidden' | 'commit' | 'domcontentloaded' | 'load' | 'networkidle'
  delay_ms?: number
  ms?: number
  x?: number
  y?: number
}

type PlaywrightRunnerRequest = {
  executablePath?: string
  connection?: { kind: 'cdp'; endpoint: string }
  actions: PlaywrightAction[]
  visible: boolean
  /** Runtime-owned presentation, never supplied by the model input schema. */
  presentation?: 'assistable_background' | 'always_visible'
  /** Local Desktop endpoint used only for session-scoped “show browser” requests. */
  activityControl?: { endpoint: string; sessionId: string; browserKey?: string }
  slowMoMs: number
  locale?: string
  screenshotPath?: string
  pageTimeoutMs: number
  networkIdleTimeoutMs: number
  maxLinks: number
  preserveHumanVerificationPage?: boolean
  verificationOwnerId?: string
  verificationResolution?: 'verified' | 'switch_public_entry' | 'record_evidence_gap'
}

type Step = {
  index: number
  type: ActionType
  outcome: 'success' | 'failed'
  url: string
  title?: string
  detail?: string
  screenshotPath?: string
}

type PlaywrightRunnerResult = {
  url: string
  title: string
  text: string
  links: Array<{ text: string; url: string }>
  steps: Step[]
  accessLimited: boolean
  screenshotPath?: string
  error?: string
}

type HumanVerificationGate = {
  ownerId: string
  finalUrl: string
  verificationKind: string
}

type BrowserSession = {
  browser: Browser
  context: BrowserContext
  page: Page
  visible: boolean
  presentation?: 'assistable_background' | 'always_visible'
  /** Desired managed-window state; assistable_background stays minimized until show/CAPTCHA. */
  windowTarget?: WindowPresentationTarget
  identity: string
  connectionKind: 'managed' | 'cdp'
  humanVerificationGate?: HumanVerificationGate
  activityControl?: { endpoint: string; sessionId: string; browserKey?: string }
  showGeneration?: number
  activityControlTimer?: ReturnType<typeof setInterval>
  idleTimer?: ReturnType<typeof setTimeout>
}

type BridgeRunRequest = {
  id: string
  type: 'run'
  sessionKey: string
  request: PlaywrightRunnerRequest
}

type BridgeCloseRequest = {
  id: string
  type: 'close-session'
  sessionKey: string
}

type BridgePresentRequest = {
  id: string
  type: 'present-session'
  sessionKey: string
  presentation: 'minimized' | 'foreground'
}

type BridgeRequest = BridgeRunRequest | BridgeCloseRequest | BridgePresentRequest

type BridgeResponse = {
  id: string
  ok: boolean
  result?: PlaywrightRunnerResult
  error?: string
}

const BROWSER_SESSION_IDLE_MS = 5 * 60_000
const POPUP_FOLLOW_DELAY_MS = 400
const sessions = new Map<string, BrowserSession>()
const sessionQueues = new Map<string, Promise<unknown>>()

async function pageState(page: Page): Promise<{ url: string; title: string }> {
  return { url: page.url(), title: await page.title().catch(() => '') }
}

async function waitForStablePage(page: Page, request: PlaywrightRunnerRequest): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: request.pageTimeoutMs })
  await page.waitForLoadState('networkidle', { timeout: request.networkIdleTimeoutMs }).catch(() => undefined)
}

async function saveScreenshot(page: Page, request: PlaywrightRunnerRequest): Promise<string | undefined> {
  if (!request.screenshotPath) return undefined
  await mkdir(dirname(request.screenshotPath), { recursive: true })
  await page.screenshot({ path: request.screenshotPath, fullPage: true, type: 'png' })
  return request.screenshotPath
}

async function activePage(session: BrowserSession): Promise<Page> {
  if (!session.page.isClosed()) return session.page
  const pages = session.context.pages().filter((page) => !page.isClosed())
  session.page = pages.at(-1) ?? await session.context.newPage()
  return session.page
}

function selectorWaitState(state: PlaywrightAction['state']): 'attached' | 'detached' | 'visible' | 'hidden' {
  if (state === 'attached' || state === 'detached' || state === 'visible' || state === 'hidden') return state
  return 'visible'
}

function loadState(state: PlaywrightAction['state']): 'commit' | 'domcontentloaded' | 'load' | 'networkidle' {
  if (state === 'commit' || state === 'domcontentloaded' || state === 'load' || state === 'networkidle') return state
  return 'load'
}

function actionValueDetail(label: string, value: unknown): string {
  const rendered = typeof value === 'string' ? value : JSON.stringify(value)
  return label + ': ' + (rendered ?? 'null').slice(0, 4_000)
}

function openTabs(session: BrowserSession): Page[] {
  return session.context.pages().filter((page) => !page.isClosed())
}


async function tabsDetail(session: BrowserSession): Promise<string> {
  const pages = openTabs(session)
  return JSON.stringify(await Promise.all(pages.map(async (page, index) => ({
    index,
    active: page === session.page,
    url: page.url(),
    title: await page.title().catch(() => ''),
  }))))
}

async function executeRawPlaywrightScript(session: BrowserSession, source: string): Promise<string> {
  const page = await activePage(session)
  const sandbox = createContext(Object.assign(Object.create(null), {
    page,
    context: session.context,
    browser: session.browser,
    pages: () => openTabs(session),
    playwright: { chromium, firefox, webkit, devices, selectors, request },
  }), { codeGeneration: { strings: false, wasm: false } })
  const script = new Script('(async () => {\n' + source + '\n})()', { filename: 'playwright-script-action.js' })
  const result = await script.runInContext(sandbox)
  session.page = openTabs(session).at(-1) ?? await session.context.newPage()
  if (shouldCallBringToFront(session.presentation, session.windowTarget)) {
    await session.page.bringToFront().catch(() => undefined)
  }
  return actionValueDetail('script result', result)
}

async function clickAndFollowPopup(session: BrowserSession, selector: string, request: PlaywrightRunnerRequest, clickCount: 1 | 2): Promise<string> {
  const page = await activePage(session)
  let popup: Page | undefined
  const observePopup = (candidate: Page) => { popup ??= candidate }
  session.context.on('page', observePopup)
  try {
    if (clickCount === 2) await page.locator(selector).first().dblclick({ timeout: request.pageTimeoutMs })
    else await page.locator(selector).first().click({ timeout: request.pageTimeoutMs })
    await page.waitForTimeout(POPUP_FOLLOW_DELAY_MS)
  } finally {
    session.context.off('page', observePopup)
  }
  if (popup && !popup.isClosed()) {
    session.page = popup
    await popup.waitForLoadState('domcontentloaded', { timeout: request.pageTimeoutMs }).catch(() => undefined)
    return (clickCount === 2 ? 'double-clicked ' : 'clicked ') + selector + '; switched to the newly opened tab'
  }
  return (clickCount === 2 ? 'double-clicked ' : 'clicked ') + selector
}

async function executeAction(session: BrowserSession, action: PlaywrightAction, request: PlaywrightRunnerRequest): Promise<string | undefined> {
  const page = await activePage(session)
  if (action.type === 'script') return executeRawPlaywrightScript(session, action.script!)
  if (action.type === 'navigate') {
    await page.goto(action.url!, { waitUntil: 'domcontentloaded', timeout: request.pageTimeoutMs })
    await waitForStablePage(page, request)
    return 'opened ' + action.url
  }
  if (action.type === 'reload') {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: request.pageTimeoutMs })
    await waitForStablePage(page, request)
    return 'reloaded current page'
  }
  if (action.type === 'go_back') {
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: request.pageTimeoutMs })
    await waitForStablePage(page, request).catch(() => undefined)
    return 'went back'
  }
  if (action.type === 'go_forward') {
    await page.goForward({ waitUntil: 'domcontentloaded', timeout: request.pageTimeoutMs })
    await waitForStablePage(page, request).catch(() => undefined)
    return 'went forward'
  }
  if (action.type === 'new_tab') {
    const next = await session.context.newPage()
    session.page = next
    await next.goto(action.url!, { waitUntil: 'domcontentloaded', timeout: request.pageTimeoutMs })
    await waitForStablePage(next, request)
    return 'opened a new tab at ' + action.url
  }
  if (action.type === 'list_tabs') return 'tabs: ' + await tabsDetail(session)
  if (action.type === 'switch_tab') {
    const target = openTabs(session)[action.tab_index!]
    if (!target) throw new Error('No open tab exists at tab_index ' + action.tab_index + '.')
    session.page = target
    if (shouldCallBringToFront(session.presentation, session.windowTarget)) {
      await target.bringToFront()
    }
    return 'switched to tab ' + action.tab_index
  }
  if (action.type === 'close_tab') {
    await page.close()
    session.page = openTabs(session).at(-1) ?? await session.context.newPage()
    if (shouldCallBringToFront(session.presentation, session.windowTarget)) {
      await session.page.bringToFront()
    }
    return 'closed the active tab'
  }
  if (action.type === 'fill') {
    await page.locator(action.selector!).first().fill(action.text!, { timeout: request.pageTimeoutMs })
    return 'filled ' + action.selector
  }
  if (action.type === 'type') {
    await page.locator(action.selector!).first().pressSequentially(action.text!, { delay: action.delay_ms ?? 40, timeout: request.pageTimeoutMs })
    return 'typed into ' + action.selector
  }
  if (action.type === 'clear') {
    await page.locator(action.selector!).first().clear({ timeout: request.pageTimeoutMs })
    return 'cleared ' + action.selector
  }
  if (action.type === 'click') return clickAndFollowPopup(session, action.selector!, request, 1)
  if (action.type === 'double_click') return clickAndFollowPopup(session, action.selector!, request, 2)
  if (action.type === 'hover') {
    await page.locator(action.selector!).first().hover({ timeout: request.pageTimeoutMs })
    return 'hovered ' + action.selector
  }
  if (action.type === 'focus') {
    await page.locator(action.selector!).first().focus({ timeout: request.pageTimeoutMs })
    return 'focused ' + action.selector
  }
  if (action.type === 'press') {
    if (action.selector) await page.locator(action.selector).first().press(action.key!, { timeout: request.pageTimeoutMs })
    else await page.keyboard.press(action.key!)
    return 'pressed ' + action.key
  }
  if (action.type === 'select_option') {
    await page.locator(action.selector!).first().selectOption(action.value!, { timeout: request.pageTimeoutMs })
    return 'selected option in ' + action.selector
  }
  if (action.type === 'check') {
    await page.locator(action.selector!).first().check({ timeout: request.pageTimeoutMs })
    return 'checked ' + action.selector
  }
  if (action.type === 'uncheck') {
    await page.locator(action.selector!).first().uncheck({ timeout: request.pageTimeoutMs })
    return 'unchecked ' + action.selector
  }
  if (action.type === 'drag_to') {
    await page.locator(action.source_selector!).first().dragTo(page.locator(action.target_selector!).first(), { timeout: request.pageTimeoutMs })
    return 'dragged ' + action.source_selector + ' to ' + action.target_selector
  }
  if (action.type === 'wait') {
    await page.waitForTimeout(action.ms!)
    return 'waited ' + action.ms + 'ms'
  }
  if (action.type === 'wait_for_selector') {
    await page.locator(action.selector!).first().waitFor({ state: selectorWaitState(action.state), timeout: request.pageTimeoutMs })
    return 'waited for ' + action.selector
  }
  if (action.type === 'wait_for_url') {
    await page.waitForURL(action.url!, { timeout: request.pageTimeoutMs })
    return 'waited for URL ' + action.url
  }
  if (action.type === 'wait_for_load_state') {
    await page.waitForLoadState(loadState(action.state), { timeout: request.pageTimeoutMs })
    return 'waited for page load state ' + loadState(action.state)
  }
  if (action.type === 'scroll') {
    await page.mouse.wheel(action.x ?? 0, action.y ?? 0)
    return 'scrolled x=' + (action.x ?? 0) + ', y=' + (action.y ?? 0)
  }
  if (action.type === 'scroll_into_view') {
    await page.locator(action.selector!).first().scrollIntoViewIfNeeded({ timeout: request.pageTimeoutMs })
    return 'scrolled ' + action.selector + ' into view'
  }
  if (action.type === 'extract') {
    const text = await page.locator(action.selector ?? 'body').first().innerText({ timeout: request.pageTimeoutMs })
    return actionValueDetail('extracted text from ' + (action.selector ?? 'body'), text)
  }
  if (action.type === 'get_attribute') {
    const value = await page.locator(action.selector!).first().getAttribute(action.attribute!, { timeout: request.pageTimeoutMs })
    return actionValueDetail('attribute ' + action.attribute + ' from ' + action.selector, value)
  }
  if (action.type === 'get_html') {
    const html = await page.locator(action.selector ?? 'html').first().innerHTML({ timeout: request.pageTimeoutMs })
    return actionValueDetail('HTML from ' + (action.selector ?? 'html'), html)
  }
  if (action.type === 'count') {
    const count = await page.locator(action.selector!).count()
    return 'count for ' + action.selector + ': ' + count
  }
  if (action.type === 'is_visible') return 'visible ' + action.selector + ': ' + await page.locator(action.selector!).first().isVisible({ timeout: request.pageTimeoutMs })
  if (action.type === 'is_enabled') return 'enabled ' + action.selector + ': ' + await page.locator(action.selector!).first().isEnabled({ timeout: request.pageTimeoutMs })
  if (action.type === 'is_checked') return 'checked ' + action.selector + ': ' + await page.locator(action.selector!).first().isChecked({ timeout: request.pageTimeoutMs })
  if (action.type === 'bounding_box') return actionValueDetail('bounding box for ' + action.selector, await page.locator(action.selector!).first().boundingBox({ timeout: request.pageTimeoutMs }))
  if (action.type === 'screenshot') {
    const screenshotPath = await saveScreenshot(page, request)
    return screenshotPath ? 'saved screenshot' : 'screenshot skipped because include_screenshot is false'
  }
  throw new Error('Unsupported Playwright action: ' + action.type)
}

async function extractFinalPage(session: BrowserSession, request: PlaywrightRunnerRequest): Promise<Omit<PlaywrightRunnerResult, 'steps' | 'error' | 'screenshotPath'>> {
  const page = await activePage(session)
  const state = await pageState(page)
  const unsafeReason = getUnsafePublicBrowserUrlReason(state.url)
  if (unsafeReason && !isBrowserOwnedDocumentUrl(state.url)) throw new Error('The page redirected to a blocked address: ' + unsafeReason)
  const text = await page.locator('body').innerText({ timeout: request.pageTimeoutMs }).catch(() => '')
  const accessLimited = Boolean(classifyRenderedPageAccess(state.url, state.title, text))
  const rawLinks = await page.locator('a[href]').evaluateAll((anchors, maxLinks) => anchors.slice(0, maxLinks).map((anchor) => ({
    text: (anchor.textContent ?? '').replace(/\s+/g, ' ').trim(),
    url: (anchor as HTMLAnchorElement).href,
  })), request.maxLinks)
  const links = rawLinks
    .map((link) => ({ ...link, url: normalizePublicBrowserLink(link.url) }))
    .filter((link): link is { text: string; url: string } => Boolean(link.text && link.url))
  return { ...state, text, links, accessLimited }
}

function humanVerificationKind(page: Pick<PlaywrightRunnerResult, 'url' | 'title' | 'text'>): string | null {
  return detectHumanVerificationKind(page.url, page.title ?? '', page.text ?? '')
}

function humanVerificationRequiredError(gate: HumanVerificationGate): string {
  return 'EXPERT_HUMAN_VERIFICATION_REQUIRED: ' + gate.verificationKind + ' at ' + gate.finalUrl + '. The visible page is preserved. The Expert runtime will open a dedicated Desktop verification modal. Do not call AskUserQuestion and do not continue browser actions until the explicit resolution returns.'
}

function humanVerificationPendingError(gate: HumanVerificationGate): string {
  return 'EXPERT_HUMAN_VERIFICATION_PENDING: ' + gate.verificationKind + ' at ' + gate.finalUrl + '. Another research worker is waiting for the user. Do not navigate, open, reload, close, or interact with this shared browser session.'
}

const ACTIONS_THAT_CAN_SURFACE_HUMAN_VERIFICATION = new Set<ActionType>([
  'navigate', 'reload', 'go_back', 'go_forward', 'new_tab', 'click', 'double_click',
  'press', 'select_option', 'check', 'uncheck', 'drag_to', 'wait', 'wait_for_selector',
  'wait_for_url', 'wait_for_load_state', 'script',
])

function maybeHoldForHumanVerification(session: BrowserSession, request: PlaywrightRunnerRequest, page: Pick<PlaywrightRunnerResult, 'url' | 'title' | 'text'>): HumanVerificationGate | null {
  const ownerId = request.verificationOwnerId?.trim()
  const verificationKind = request.preserveHumanVerificationPage === true && ownerId
    ? humanVerificationKind(page)
    : null
  if (!verificationKind) return null
  const gate = { ownerId, finalUrl: page.url, verificationKind }
  session.humanVerificationGate = gate
  if (session.idleTimer) clearTimeout(session.idleTimer)
  // The Expert handoff service selects one queued browser page to foreground.
  // Do not surface every concurrent CAPTCHA here: that would steal focus from
  // the verification page currently shown to the user.
  return gate
}

function humanVerificationResolutionError(request: PlaywrightRunnerRequest, gate: HumanVerificationGate): string | null {
  if (request.verificationResolution === 'switch_public_entry') {
    const fallback = request.actions.find((action) => (action.type === 'navigate' || action.type === 'new_tab') && action.url && action.url !== gate.finalUrl)
    if (!fallback) return 'switch_public_entry requires a new public navigate or new_tab action to a URL different from the preserved verification page.'
  }

  if (request.verificationResolution === 'verified') {
    const changedTabOrNavigation = request.actions.some((action) => ['navigate', 'new_tab', 'go_back', 'go_forward', 'switch_tab', 'close_tab'].includes(action.type))
    if (changedTabOrNavigation) return 'verified must keep the preserved tab: use wait and extract, with at most one reload if the page is unchanged.'
    if (request.actions.filter((action) => action.type === 'reload').length > 1) return 'verified permits at most one reload before extraction.'
  }

  return null
}

async function pendingVerificationResult(session: BrowserSession, gate: HumanVerificationGate): Promise<PlaywrightRunnerResult> {
  const page = await extractFinalPage(session, {
    actions: [],
    visible: session.visible,
    slowMoMs: 0,
    pageTimeoutMs: 5_000,
    networkIdleTimeoutMs: 500,
    maxLinks: 20,
  })
  return { ...page, steps: [], accessLimited: true, error: humanVerificationPendingError(gate) }
}

async function setBrowserWindowPresentation(session: BrowserSession, presentation: 'minimized' | 'foreground'): Promise<void> {
  const page = await activePage(session)
  // Only an explicit foreground request may take focus. Calling bringToFront()
  // before minimizing causes a visible flash on every background research step.
  if (session.connectionKind === 'cdp') {
    if (presentation === 'foreground') await page.bringToFront().catch(() => undefined)
    return
  }
  if (presentation === 'foreground') await page.bringToFront().catch(() => undefined)
  const cdp = await session.context.newCDPSession(page).catch(() => undefined)
  if (!cdp) return
  try {
    const windowInfo = await cdp.send('Browser.getWindowForTarget') as { windowId?: number }
    if (typeof windowInfo.windowId === 'number') {
      await cdp.send('Browser.setWindowBounds', {
        windowId: windowInfo.windowId,
        bounds: { windowState: presentation === 'foreground' ? 'normal' : 'minimized' },
      })
    }
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}

async function applyWindowTarget(session: BrowserSession): Promise<void> {
  if (!session.windowTarget) return
  await setBrowserWindowPresentation(session, session.windowTarget)
}

async function presentSession(sessionKey: string, presentation: 'minimized' | 'foreground'): Promise<void> {
  const session = sessions.get(sessionKey)
  if (!session || !session.browser.isConnected()) return
  if (session.idleTimer) clearTimeout(session.idleTimer)
  session.windowTarget = presentation
  await applyWindowTarget(session)
}

async function pollPresentationControl(session: BrowserSession): Promise<void> {
  const control = session.activityControl
  if (!control) return
  try {
    const endpoint = new URL(control.endpoint)
    endpoint.searchParams.set('sessionId', control.sessionId)
    if (control.browserKey) endpoint.searchParams.set('browserKey', control.browserKey)
    const response = await fetch(endpoint)
    const payload = await response.json().catch(() => null) as { showGeneration?: unknown } | null
    const showGeneration = typeof payload?.showGeneration === 'number' ? payload.showGeneration : 0
    if (showGeneration > (session.showGeneration ?? 0)) {
      session.showGeneration = showGeneration
      // User-requested or verification handoff: only this path may promote the window.
      session.windowTarget = 'foreground'
      await applyWindowTarget(session)
    }
  } catch {
    // Activity visibility must never break a browsing action when Desktop is reconnecting.
  }
}

function startPresentationControlPolling(session: BrowserSession, request: PlaywrightRunnerRequest): void {
  if (!request.activityControl) return
  session.activityControl = request.activityControl
  if (session.activityControlTimer) return
  void pollPresentationControl(session)
  session.activityControlTimer = setInterval(() => { void pollPresentationControl(session) }, 750)
  session.activityControlTimer.unref?.()
}

function scheduleIdleClose(sessionKey: string, session: BrowserSession): void {
  if (session.idleTimer) clearTimeout(session.idleTimer)
  // A visible user-verification page is not idle. It remains open until the
  // user resolves it, the Expert session is stopped, or the relay itself times out.
  if (!shouldSchedulePlaywrightIdleClose(Boolean(session.humanVerificationGate))) return
  session.idleTimer = setTimeout(() => { void closeSession(sessionKey) }, BROWSER_SESSION_IDLE_MS)
  session.idleTimer.unref?.()
}

async function closeSession(sessionKey: string): Promise<void> {
  const session = sessions.get(sessionKey)
  if (!session) return
  sessions.delete(sessionKey)
  if (session.idleTimer) clearTimeout(session.idleTimer)
  if (session.activityControlTimer) clearInterval(session.activityControlTimer)
  // For a CDP-attached browser, Playwright closes only its debugging connection;
  // it must never terminate the user-owned Chrome or Edge process.
  await session.browser.close().catch(() => undefined)
}

async function guardPublicBrowserContext(context: BrowserContext): Promise<void> {
  await context.route('**/*', async (route) => {
    const requestUrl = route.request().url()
    // New tabs and page.setContent() legitimately use browser-owned about:/data:
    // documents. Preserve those internal operations while still rejecting every
    // user-addressable unsafe scheme and non-public HTTP(S) destination.
    if (isBrowserOwnedDocumentUrl(requestUrl)) {
      await route.continue()
      return
    }
    const issue = getUnsafePublicBrowserUrlReason(requestUrl)
    if (issue) await route.abort('blockedbyclient')
    else await route.continue()
  })
}

async function openSession(sessionKey: string, request: PlaywrightRunnerRequest): Promise<BrowserSession> {
  const identity = request.connection?.kind === 'cdp'
    ? 'cdp:' + request.connection.endpoint
    : 'managed:' + (request.executablePath ?? '')
  const existing = sessions.get(sessionKey)
  if (existing && existing.browser.isConnected() && existing.visible === request.visible && existing.presentation === request.presentation && existing.identity === identity) {
    if (existing.idleTimer) clearTimeout(existing.idleTimer)
    startPresentationControlPolling(existing, request)
    return existing
  }
  if (existing) await closeSession(sessionKey)

  const isCdp = request.connection?.kind === 'cdp'
  const browser = isCdp
    ? await chromium.connectOverCDP(request.connection.endpoint, { slowMo: request.slowMoMs })
    : await chromium.launch({
        executablePath: request.executablePath,
        headless: !request.visible,
        slowMo: request.visible ? request.slowMoMs : 0,
        // Do not force --disable-gpu: visible, user-observable research should use
        // the platform's normal graphics path when Chromium supports it.
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          ...(request.presentation === 'assistable_background' ? ['--start-minimized'] : []),
        ],
      })
  const context = isCdp
    ? browser.contexts()[0]
    : await browser.newContext({ ...(request.locale?.trim() ? { locale: request.locale.trim() } : {}) })
  if (!context) {
    await browser.close().catch(() => undefined)
    throw new Error('The authorized browser has no accessible context. Start Chrome or Edge with a local remote-debugging port, then retry.')
  }
  await guardPublicBrowserContext(context)
  const session = {
    browser,
    context,
    page: await context.newPage(),
    visible: request.visible,
    ...(request.presentation ? { presentation: request.presentation } : {}),
    windowTarget: initialWindowPresentationTarget(request.presentation),
    identity,
    connectionKind: isCdp ? 'cdp' : 'managed',
  } satisfies BrowserSession
  sessions.set(sessionKey, session)
  startPresentationControlPolling(session, request)
  if (!isCdp && request.presentation === 'assistable_background') {
    await applyWindowTarget(session)
  }
  return session
}

async function runSession(sessionKey: string, request: PlaywrightRunnerRequest): Promise<PlaywrightRunnerResult> {
  const session = await openSession(sessionKey, request)
  const existingGate = session.humanVerificationGate
  if (existingGate) {
    if (request.verificationOwnerId !== existingGate.ownerId || !request.verificationResolution) {
      return pendingVerificationResult(session, existingGate)
    }
    const resolutionError = humanVerificationResolutionError(request, existingGate)
    if (resolutionError) {
      const current = await pendingVerificationResult(session, existingGate)
      return {
        ...current,
        error: 'EXPERT_HUMAN_VERIFICATION_RESOLUTION_INVALID: ' + resolutionError + ' The visible page remains preserved; retry the same resolution correctly.',
      }
    }
    session.humanVerificationGate = undefined
    if (request.verificationResolution === 'record_evidence_gap') {
      const current = await pendingVerificationResult(session, existingGate)
      return {
        ...current,
        error: 'EXPERT_HUMAN_VERIFICATION_RECORDED_AS_GAP: ' + existingGate.verificationKind + ' at ' + existingGate.finalUrl + '. The user declined verification; this path is an evidence gap and no browser action was executed.',
      }
    }
  }
  const steps: Step[] = []
  try {
    for (let index = 0; index < request.actions.length; index += 1) {
      const action = request.actions[index]
      try {
        const detail = await executeAction(session, action, request)
        // Chromium may restore a minimized window after navigation/tab work.
        // Re-pin it before the next action so background research does not flash.
        if (shouldReassertMinimizedAfterAction(session.presentation, session.windowTarget, action.type)) {
          await applyWindowTarget(session).catch(() => undefined)
        }
        const state = await pageState(await activePage(session))
        steps.push({ index, type: action.type, outcome: 'success', ...state, ...(detail ? { detail } : {}), ...(action.type === 'screenshot' && request.screenshotPath ? { screenshotPath: request.screenshotPath } : {}) })
        // Stop this very request as soon as a visible verification page appears.
        // Waiting until all queued actions finish could let a later navigation
        // overwrite the exact tab the user needs to complete manually.
        if (ACTIONS_THAT_CAN_SURFACE_HUMAN_VERIFICATION.has(action.type)) {
          const pageAfterAction = await extractFinalPage(session, request).catch(() => null)
          const gate = pageAfterAction ? maybeHoldForHumanVerification(session, request, pageAfterAction) : null
          if (gate) {
            session.windowTarget = 'foreground'
            await applyWindowTarget(session).catch(() => undefined)
            return { ...pageAfterAction!, steps, error: humanVerificationRequiredError(gate) }
          }
        }
      } catch (error) {
        const page = await activePage(session).catch(() => session.page)
        const state = await pageState(page).catch(() => ({ url: '', title: '' }))
        const detail = error instanceof Error ? error.message : String(error)
        steps.push({ index, type: action.type, outcome: 'failed', ...state, detail })
        const finalPage = await extractFinalPage(session, request).catch(() => ({ ...state, text: '', links: [], accessLimited: /captcha|verification|403|429/i.test(detail) }))
        const screenshotPath = await saveScreenshot(page, request).catch(() => undefined)
        const gate = maybeHoldForHumanVerification(session, request, finalPage)
        if (gate) {
          session.windowTarget = 'foreground'
          await applyWindowTarget(session).catch(() => undefined)
          return { ...finalPage, steps, ...(screenshotPath ? { screenshotPath } : {}), error: humanVerificationRequiredError(gate) }
        }
        if (request.visible && !page.isClosed()) await page.waitForTimeout(8_000).catch(() => undefined)
        return { ...finalPage, steps, ...(screenshotPath ? { screenshotPath } : {}), error: detail }
      }
    }
    const page = await activePage(session)
    const finalPage = await extractFinalPage(session, request)
    const screenshotPath = await saveScreenshot(page, request)
    const gate = maybeHoldForHumanVerification(session, request, finalPage)
    if (gate) {
      session.windowTarget = 'foreground'
      await applyWindowTarget(session).catch(() => undefined)
      return { ...finalPage, steps, ...(screenshotPath ? { screenshotPath } : {}), error: humanVerificationRequiredError(gate) }
    }
    return { ...finalPage, steps, ...(screenshotPath ? { screenshotPath } : {}) }
  } finally {
    if (sessions.get(sessionKey) === session && session.browser.isConnected()) {
      // “后台检索，需协助时自动显示” must hand the page back to the
      // background after the same verification-resume call finishes. Keep it
      // foreground only while a verification gate is still genuinely pending.
      if (session.connectionKind === 'managed') {
        const nextTarget = windowTargetAfterRun(session.presentation, Boolean(session.humanVerificationGate))
        if (nextTarget) {
          session.windowTarget = nextTarget
          await applyWindowTarget(session).catch(() => undefined)
        }
      }
      scheduleIdleClose(sessionKey, session)
    }
  }
}

function enqueueSessionRun<T>(sessionKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = sessionQueues.get(sessionKey) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  sessionQueues.set(sessionKey, current)
  void current.then(
    () => { if (sessionQueues.get(sessionKey) === current) sessionQueues.delete(sessionKey) },
    () => { if (sessionQueues.get(sessionKey) === current) sessionQueues.delete(sessionKey) },
  )
  return current
}

function writeResponse(response: BridgeResponse): void {
  process.stdout.write(JSON.stringify(response) + '\n')
}

async function handleRequest(value: unknown): Promise<void> {
  if (!value || typeof value !== 'object') throw new Error('The managed Node Playwright bridge received an invalid request.')
  const raw = value as Partial<BridgeRequest> & Partial<PlaywrightRunnerRequest>
  if (Array.isArray(raw.actions)) {
    const result = await runSession('__legacy_one_shot__', raw as PlaywrightRunnerRequest)
    await closeSession('__legacy_one_shot__')
    process.stdout.write(JSON.stringify({ ok: true, result }) + '\n')
    return
  }
  if (typeof raw.id !== 'string' || typeof raw.sessionKey !== 'string') throw new Error('The managed Node Playwright bridge request is missing its id or session key.')
  if (raw.type === 'close-session') {
    await closeSession(raw.sessionKey)
    writeResponse({ id: raw.id, ok: true })
    return
  }
  if (raw.type === 'present-session') {
    await enqueueSessionRun(raw.sessionKey, () => presentSession(raw.sessionKey!, raw.presentation!))
    writeResponse({ id: raw.id, ok: true })
    return
  }
  if (raw.type !== 'run' || !raw.request) throw new Error('The managed Node Playwright bridge request has an unsupported type.')
  const result = await enqueueSessionRun(raw.sessionKey, () => runSession(raw.sessionKey!, raw.request!))
  writeResponse({ id: raw.id, ok: true, result })
}

async function closeAllSessions(): Promise<void> {
  await Promise.all([...sessions.keys()].map((sessionKey) => closeSession(sessionKey)))
}

function startServer(): void {
  let buffered = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk: string) => {
    buffered += chunk
    let newline = buffered.indexOf('\n')
    while (newline >= 0) {
      const line = buffered.slice(0, newline).trim()
      buffered = buffered.slice(newline + 1)
      if (line) {
        let parsed: unknown
        try { parsed = JSON.parse(line) } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          process.stdout.write(JSON.stringify({ ok: false, error: 'The managed Node Playwright bridge received invalid JSON: ' + detail }) + '\n')
          newline = buffered.indexOf('\n')
          continue
        }
        void handleRequest(parsed).catch((error) => {
          const detail = error instanceof Error ? error.message : String(error)
          const id = parsed && typeof parsed === 'object' && 'id' in parsed && typeof (parsed as { id?: unknown }).id === 'string' ? (parsed as { id: string }).id : undefined
          process.stdout.write(JSON.stringify({ ...(id ? { id } : {}), ok: false, error: detail }) + '\n')
        })
      }
      newline = buffered.indexOf('\n')
    }
  })
  process.stdin.on('end', () => { void closeAllSessions() })
  process.once('SIGTERM', () => { void closeAllSessions().finally(() => process.exit(0)) })
  process.once('SIGINT', () => { void closeAllSessions().finally(() => process.exit(0)) })
}

startServer()
