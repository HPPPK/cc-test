import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createContext, Script } from 'node:vm'
import { chromium, devices, firefox, request, selectors, webkit, type Browser, type BrowserContext, type Frame, type Page, type Request as PlaywrightRequest } from 'playwright'
import { presentManagedBrowserWindow } from './managedBrowserPresentation.js'
import { selectExistingBrowserContext } from './browserSessionContextRecovery.js'
import { assessRenderedPageAccess, detectHumanVerificationKind, isHumanVerificationSurfaceStillPresent } from './pageAccessAssessment.js'
import { normalizePublicBrowserLink } from './linkNormalization.js'
import {
  initialWindowPresentationTarget,
  managedPresentationLaunchArgs,
  type WindowPresentationTarget,
} from './presentationPolicy.js'
import { buildSharedVerificationBlockedResult, shouldSchedulePlaywrightIdleClose, expireHumanVerificationGate, parkHumanVerificationPage } from './verificationSessionPolicy.js'
import { getUnsafePublicBrowserUrlReason, isBrowserOwnedDocumentUrl } from './runtime.js'
import { createAgentScopedPlaywrightObjects } from './scriptSessionIsolation.js'

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
  /** Expert-owned context key. Agents may share cookies while retaining separate tabs. */
  sharedContextKey?: string
  actions: PlaywrightAction[]
  visible: boolean
  /** Runtime-owned presentation, never supplied by the model input schema. */
  presentation?: 'assistable_background' | 'always_visible'
  /** Local Desktop endpoint used only for session-scoped “show browser” requests. */
  activityControl?: { endpoint: string; sessionId: string; browserKey?: string }
  slowMoMs: number
  locale?: string
  screenshotFullPage?: boolean
  screenshotPath?: string
  pageTimeoutMs: number
  networkIdleTimeoutMs: number
  maxLinks: number
  preserveHumanVerificationPage?: boolean
  verificationOwnerId?: string
  verificationResolution?: 'verified' | 'switch_public_entry' | 'record_evidence_gap'
}

type ScriptPageObservation = {
  /** The browser-observed main-document request made from a script action. */
  requestedUrl: string
  /** The final main-document URL after redirects, when available. */
  finalUrl?: string
  title?: string
  status: 'opened' | 'access_limited' | 'failed'
  detail?: string
}

type Step = {
  index: number
  type: ActionType
  outcome: 'success' | 'failed'
  url: string
  title?: string
  detail?: string
  screenshotPath?: string
  /** Concrete pages opened by context.newPage()/page.goto inside one script action. */
  scriptPages?: ScriptPageObservation[]
}

type PlaywrightRunnerResult = {
  url: string
  title: string
  text: string
  links: Array<{ text: string; url: string }>
  steps: Step[]
  accessLimited: boolean
  /** True/false only for a real verification handoff after the managed window was restored. */
  verificationWindowPresentationConfirmed?: boolean
  /** Stable runtime gate used to rejoin exactly this verification decision. */
  verificationGateId?: string
  /** A sibling worker was held outside a shared browser while another tab awaited the user. */
  sharedHumanVerificationBlocked?: boolean
  screenshotPath?: string
  error?: string
}

type HumanVerificationGate = {
  createdAt: number
  gateId: string
  ownerId: string
  finalUrl: string
  verificationKind: string
  /** Preserved for older transcripts; new background sessions never request foreground control. */
  windowPresentationConfirmed?: boolean
}

type ManagedWindowBounds = {
  left?: number
  top?: number
  width?: number
  height?: number
  windowState?: 'normal' | 'minimized' | 'maximized' | 'fullscreen'
}

type ManagedWindowInfo = {
  windowId?: number
  bounds?: ManagedWindowBounds
}

type BrowserSession = {
  browser: Browser
  context: BrowserContext
  page: Page
  /** Pages created or adopted by this Agent inside a shared cookie context. */
  ownedPages: Set<Page>
  visible: boolean
  presentation?: 'assistable_background' | 'always_visible'
  /** Desired managed-window state; assistable_background starts minimized; only an explicit show restores it. */
  windowTarget?: WindowPresentationTarget
  /** Last usable on-screen bounds for restoring a managed background window. */
  normalWindowBounds?: ManagedWindowBounds
  identity: string
  connectionKind: 'managed' | 'cdp'
  /** A shared context keeps cookies and verification state without sharing the active tab. */
  sharedContextKey?: string
  preservedVerificationPages?: Set<Page>
  humanVerificationGate?: HumanVerificationGate
  activityControl?: { endpoint: string; sessionId: string; browserKey?: string }
  /** Last explicit Desktop "open browser" request handled for this session. */
  showGeneration?: number
  verificationCheckGeneration?: number
  humanVerificationMonitor?: ReturnType<typeof setInterval>
  humanVerificationMonitorInFlight?: boolean
  humanVerificationHealthyObservations?: number
  humanVerificationAutoResolutionSent?: boolean
  /** Avoid repeating the same recovery diagnostic on every 750ms presentation poll. */
  contextRecoveryLogged?: boolean
  activityControlTimer?: ReturnType<typeof setInterval>
  idleTimer?: ReturnType<typeof setTimeout>
  /** Per-action script navigation ledger; reset before every action. */
  scriptPageObservations?: ScriptPageObservation[]
}

type SharedBrowserContext = {
  browser: Browser
  context: BrowserContext
  identity: string
  connectionKind: 'managed' | 'cdp'
  sessionKeys: Set<string>
  /** Startup minimization is a one-time native-window action for this browser. */
  startupMinimizationAttempted: boolean
  /** Once the user opens the shared window, no later Agent may minimize it. */
  userPresentationRequested: boolean
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

type BridgeAbortRequest = {
  id: string
  type: 'abort-session'
  sessionKey: string
}

type BridgeRequest = BridgeRunRequest | BridgeCloseRequest | BridgePresentRequest | BridgeAbortRequest

type BridgeResponse = {
  id: string
  ok: boolean
  result?: PlaywrightRunnerResult
  error?: string
}

const BROWSER_SESSION_IDLE_MS = 5 * 60_000
const POPUP_FOLLOW_DELAY_MS = 400
const DEFAULT_ASSISTABLE_WINDOW_BOUNDS = { left: 72, top: 72, width: 1280, height: 800 } satisfies ManagedWindowBounds
const sessions = new Map<string, BrowserSession>()
const sharedContexts = new Map<string, SharedBrowserContext>()
const sessionQueues = new Map<string, Promise<unknown>>()

function usableBrowserContext(context: BrowserContext | undefined): BrowserContext | undefined {
  if (!context) return undefined
  try {
    // BrowserContext has no public isClosed(); requesting its existing page
    // list is the neutral, non-mutating way to determine whether it is usable.
    context.pages()
    return context
  } catch {
    return undefined
  }
}

function contextFromOpenPage(page: Page | undefined): BrowserContext | undefined {
  if (!page) return undefined
  try {
    return page.isClosed() ? undefined : usableBrowserContext(page.context())
  } catch {
    return undefined
  }
}

/**
 * Presentation is allowed to recover only an existing BrowserContext. A
 * delayed Desktop foreground request may arrive after a stale session object
 * has lost its direct context reference, while the managed Chromium window and
 * preserved verification page remain alive. Rebind that exact existing context
 * instead of opening another page or silently treating the window as shown.
 */
function recoverBrowserContext(session: BrowserSession): BrowserContext | undefined {
  const direct = usableBrowserContext(session.context)
  const fromPage = contextFromOpenPage(session.page)
  const fromShared = session.sharedContextKey
    ? usableBrowserContext(sharedContexts.get(session.sharedContextKey)?.context)
    : undefined
  const fromManagedBrowser = session.connectionKind === 'managed'
    ? (() => {
        try {
          return session.browser.contexts().map((context) => usableBrowserContext(context)).find(Boolean)
        } catch {
          return undefined
        }
      })()
    : undefined
  const recovered = selectExistingBrowserContext([
    { source: 'direct', context: direct },
    { source: 'page', context: fromPage },
    { source: 'shared', context: fromShared },
    { source: 'browser', context: fromManagedBrowser },
  ])
  if (!recovered.context) return undefined
  if (recovered.source !== 'direct') {
    session.context = recovered.context
    if (!session.contextRecoveryLogged) {
      session.contextRecoveryLogged = true
      console.warn('[Playwright] Rehydrated browser context for window presentation from ' + recovered.source)
    }
  }
  return recovered.context
}

function requireBrowserContext(session: BrowserSession): BrowserContext {
  const context = recoverBrowserContext(session)
  if (!context) throw new Error('The managed browser has no recoverable BrowserContext; no new page was opened.')
  return context
}

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
  await page.screenshot({ path: request.screenshotPath, fullPage: request.screenshotFullPage ?? true, type: 'png' })
  return request.screenshotPath
}

function openOwnedPages(session: BrowserSession): Page[] {
  return [...session.ownedPages].filter((page) => !page.isClosed())
}

async function activePage(session: BrowserSession): Promise<Page> {
  const current = session.page
  if (current && !current.isClosed() && session.ownedPages.has(current)) return current
  const owned = openOwnedPages(session)
  if (owned.length > 0) {
    session.page = owned.at(-1)!
    return session.page
  }
  const page = await requireBrowserContext(session).newPage()
  session.ownedPages.add(page)
  session.page = page
  return page
}

/**
 * Window presentation must never create a fresh page. During a human-verification
 * handoff the only safe target is the already-open page in the same context; a
 * stale session.page reference must be rebound to that page rather than causing
 * an off-screen/minimized managed Chromium window to remain inaccessible.
 */
function presentationPage(session: BrowserSession, context = recoverBrowserContext(session)): Page | undefined {
  const current = session.page
  if (current && !current.isClosed() && session.ownedPages.has(current)) return current

  if (!context) return undefined
  const pages = openOwnedPages(session)
  const gateUrl = session.humanVerificationGate?.finalUrl
  const preservedVerificationPage = gateUrl
    ? pages.find((page) => page.url() === gateUrl)
    : undefined
  const parked = [...(session.preservedVerificationPages ?? [])].filter((page) => !page.isClosed())
  const recovered = preservedVerificationPage ?? pages.at(-1) ?? parked.at(-1)
  if (recovered) session.page = recovered
  return recovered
}

function selectorWaitState(state: PlaywrightAction['state']): 'attached' | 'detached' | 'visible' | 'hidden' {
  if (state === 'attached' || state === 'detached' || state === 'visible' || state === 'hidden') return state
  return 'visible'
}

function loadState(state: PlaywrightAction['state']): 'domcontentloaded' | 'load' | 'networkidle' {
  if (state === 'domcontentloaded' || state === 'load' || state === 'networkidle') return state
  return 'load'
}

function actionValueDetail(label: string, value: unknown): string {
  const rendered = typeof value === 'string' ? value : JSON.stringify(value)
  return label + ': ' + (rendered ?? 'null').slice(0, 4_000)
}

function openTabs(session: BrowserSession): Page[] {
  return recoverBrowserContext(session) ? openOwnedPages(session) : []
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

type PendingScriptPageObservation = {
  requestedUrl: string
  finalUrl?: string
  detail?: string
}

function isMainDocumentNavigation(page: Page, browserRequest: PlaywrightRequest): boolean {
  return browserRequest.isNavigationRequest() && browserRequest.frame() === page.mainFrame()
}

/**
 * Script actions are allowed to use normal Playwright APIs such as context.newPage
 * and page.goto. Capture the browser events themselves instead of trying to parse
 * model-authored JavaScript, so every concrete child page remains auditable.
 */
async function executeRawPlaywrightScript(session: BrowserSession, source: string): Promise<string> {
  const page = await activePage(session)
  const context = requireBrowserContext(session)
  const pending = new Map<Page, PendingScriptPageObservation[]>()
  const detach = new Map<Page, () => void>()

  const attach = (candidate: Page): void => {
    if (detach.has(candidate)) return
    const observed: PendingScriptPageObservation[] = []
    pending.set(candidate, observed)
    const onRequest = (browserRequest: PlaywrightRequest) => {
      if (!isMainDocumentNavigation(candidate, browserRequest)) return
      observed.push({ requestedUrl: browserRequest.url() })
    }
    const onFrameNavigated = (frame: Frame) => {
      if (frame !== candidate.mainFrame()) return
      const last = observed.at(-1)
      if (last) last.finalUrl = frame.url()
    }
    candidate.on('request', onRequest)
    candidate.on('framenavigated', onFrameNavigated)
    detach.set(candidate, () => {
      candidate.off('request', onRequest)
      candidate.off('framenavigated', onFrameNavigated)
      candidate.off('popup', registerScriptOwnedPage)
    })
    candidate.on('popup', registerScriptOwnedPage)
  }

  const scriptOwnedPages: Page[] = []
  const registerScriptOwnedPage = (candidate: Page): void => {
    session.ownedPages.add(candidate)
    if (!scriptOwnedPages.includes(candidate)) scriptOwnedPages.push(candidate)
    attach(candidate)
  }
  for (const candidate of openOwnedPages(session)) attach(candidate)

  const finalize = async (scriptError?: unknown): Promise<ScriptPageObservation[]> => {
    const observations: ScriptPageObservation[] = []
    for (const [candidate, records] of pending) {
      const title = await candidate.title().catch(() => '')
      const renderedText = await candidate.locator('body').innerText({ timeout: 2_000 }).catch(() => '')
      const currentUrl = candidate.url()
      for (const record of records) {
        const finalUrl = record.finalUrl ?? currentUrl
        const assessment = assessRenderedPageAccess(finalUrl, title, renderedText)
        const pageError = scriptError ?? assessment.error
        observations.push({
          requestedUrl: record.requestedUrl,
          ...(finalUrl ? { finalUrl } : {}),
          ...(title ? { title } : {}),
          status: pageError ? 'failed' : assessment.accessLimited ? 'access_limited' : 'opened',
          ...(pageError
            ? { detail: pageError instanceof Error ? pageError.message : String(pageError) }
            : record.detail ? { detail: record.detail } : {}),
        })
      }
    }
    return observations
  }

  try {
    const scoped = createAgentScopedPlaywrightObjects({
      page,
      context,
      browser: session.browser,
      ownedPages: session.ownedPages,
      onOwnedPage: registerScriptOwnedPage,
    })
    const sandbox = createContext(Object.assign(Object.create(null), {
      ...scoped,
      playwright: { chromium, firefox, webkit, devices, selectors, request },
    }), { codeGeneration: { strings: false, wasm: false } })
    const script = new Script('(async () => {\n' + source + '\n})()', { filename: 'playwright-script-action.js' })
    const result = await script.runInContext(sandbox)
    session.scriptPageObservations = await finalize()
    const scriptOwnedPage = [...scriptOwnedPages].reverse().find((candidate) => !candidate.isClosed())
    // Do not select context.pages().at(-1): in a cookie-sharing Expert context
    // that could be a sibling worker's tab and corrupt this action ledger.
    let fallbackPage = page
    if (page.isClosed()) {
      fallbackPage = await context.newPage()
      session.ownedPages.add(fallbackPage)
    }
    session.page = scriptOwnedPage ?? fallbackPage
    return actionValueDetail('script result', result)
  } catch (error) {
    session.scriptPageObservations = await finalize(error)
    throw error
  } finally {
    for (const dispose of detach.values()) dispose()
  }
}

async function clickAndFollowPopup(session: BrowserSession, selector: string, request: PlaywrightRunnerRequest, clickCount: 1 | 2): Promise<string> {
  const page = await activePage(session)
  const popupPromise = page.waitForEvent('popup', { timeout: POPUP_FOLLOW_DELAY_MS }).catch(() => undefined)
  if (clickCount === 2) await page.locator(selector).first().dblclick({ timeout: request.pageTimeoutMs })
  else await page.locator(selector).first().click({ timeout: request.pageTimeoutMs })
  const popup = await popupPromise
  if (popup && !popup.isClosed()) {
    session.ownedPages.add(popup)
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
    const next = await requireBrowserContext(session).newPage()
    session.ownedPages.add(next)
    session.page = next
    // Opening a blank tab and then navigating it is a valid browser sequence.
    // It is especially useful when an agent needs to preserve the current page.
    if (!action.url) return 'opened a new blank tab'
    await next.goto(action.url, { waitUntil: 'domcontentloaded', timeout: request.pageTimeoutMs })
    await waitForStablePage(next, request)
    return 'opened a new tab at ' + action.url
  }
  if (action.type === 'list_tabs') return 'tabs: ' + await tabsDetail(session)
  if (action.type === 'switch_tab') {
    const target = openTabs(session)[action.tab_index!]
    if (!target) throw new Error('No open tab exists at tab_index ' + action.tab_index + '.')
    session.page = target
    return 'switched to tab ' + action.tab_index
  }
  if (action.type === 'close_tab') {
    await page.close()
    session.ownedPages.delete(page)
    let next = openTabs(session).at(-1)
    if (!next) {
      next = await requireBrowserContext(session).newPage()
      session.ownedPages.add(next)
    }
    session.page = next
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

async function extractFinalPage(session: BrowserSession, request: PlaywrightRunnerRequest): Promise<Omit<PlaywrightRunnerResult, 'steps' | 'screenshotPath'>> {
  const page = await activePage(session)
  const state = await pageState(page)
  const unsafeReason = getUnsafePublicBrowserUrlReason(state.url)
  if (unsafeReason && !isBrowserOwnedDocumentUrl(state.url)) throw new Error('The page redirected to a blocked address: ' + unsafeReason)
  const text = await page.locator('body').innerText({ timeout: request.pageTimeoutMs }).catch(() => '')
  const assessment = assessRenderedPageAccess(state.url, state.title, text)
  const rawLinks = await page.locator('a[href]').evaluateAll((anchors, maxLinks) => anchors.slice(0, maxLinks).map((anchor) => ({
    text: (anchor.textContent ?? '').replace(/\s+/g, ' ').trim(),
    url: (anchor as HTMLAnchorElement).href,
  })), request.maxLinks)
  const links = rawLinks
    .map((link) => ({ ...link, url: normalizePublicBrowserLink(link.url) }))
    .filter((link): link is { text: string; url: string } => Boolean(link.text && link.url))
  return { ...state, text, links, ...assessment }
}

function humanVerificationKind(page: Pick<PlaywrightRunnerResult, 'url' | 'title' | 'text'>): string | null {
  return detectHumanVerificationKind(page.url, page.title ?? '', page.text ?? '')
}

function humanVerificationRequiredError(gate: HumanVerificationGate): string {
  return 'EXPERT_HUMAN_VERIFICATION_REQUIRED: ' + gate.verificationKind + ' at ' + gate.finalUrl + '. The verification page is preserved. The background browser window is not opened, moved, or minimized again after startup; open the same Chromium window from the taskbar if you need it. The Expert runtime will open a dedicated Desktop verification modal. Do not call AskUserQuestion and do not continue browser actions until the explicit resolution returns.'
}

function humanVerificationPendingError(gate: HumanVerificationGate): string {
  return 'EXPERT_HUMAN_VERIFICATION_PENDING: ' + gate.verificationKind + ' at ' + gate.finalUrl + '. Another research worker is waiting for the user. Do not navigate, open, reload, close, or interact with this shared browser session.'
}

const ACTIONS_THAT_CAN_SURFACE_HUMAN_VERIFICATION = new Set<ActionType>([
  'navigate', 'reload', 'go_back', 'go_forward', 'new_tab', 'click', 'double_click',
  'press', 'select_option', 'check', 'uncheck', 'drag_to', 'wait', 'wait_for_selector',
  'wait_for_url', 'wait_for_load_state', 'script',
])

function maybeHoldForHumanVerification(
  session: BrowserSession,
  request: PlaywrightRunnerRequest,
  page: Pick<PlaywrightRunnerResult, 'url' | 'title' | 'text'>,
): HumanVerificationGate | null {
  const ownerId = request.verificationOwnerId?.trim()
  const candidateVerificationKind = request.preserveHumanVerificationPage === true && ownerId
    ? humanVerificationKind(page)
    : null
  const detectedVerificationKind = candidateVerificationKind && isHumanVerificationSurfaceStillPresent(
    candidateVerificationKind,
    page.url,
    page.title,
    page.text,
  )
    ? candidateVerificationKind
    : null

  // A missing or stale selector is a browser-action/Skill retry issue, not a
  // human verification request. Only a concrete rendered verification surface
  // may preserve the page and open the dedicated Desktop handoff modal.
  if (!detectedVerificationKind || !ownerId) return null

  const gate = {
    gateId: randomUUID(),
    createdAt: Date.now(),
    ownerId,
    finalUrl: page.url,
    verificationKind: detectedVerificationKind,
  }
  session.humanVerificationGate = gate
  if (session.idleTimer) clearTimeout(session.idleTimer)
  // Begin passive recovery immediately. The Desktop show event may arrive later
  // or be temporarily unavailable, but it must not decide whether the preserved
  // tab can observe a user-completed verification.
  startHumanVerificationMonitoring(session)
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
  return { ...page, steps: [], accessLimited: true, verificationGateId: gate.gateId, error: humanVerificationPendingError(gate) }
}

function isUsableManagedWindowBounds(bounds: ManagedWindowBounds | undefined): bounds is Required<ManagedWindowBounds> {
  return Boolean(
    bounds
    && typeof bounds.left === 'number'
    && typeof bounds.top === 'number'
    && typeof bounds.width === 'number'
    && typeof bounds.height === 'number'
    && bounds.width >= 320
    && bounds.height >= 240
    && bounds.left > -10_000
    && bounds.top > -10_000,
  )
}

/** Returns the verification-owner session for a shared cookie context, if any. */
function sharedHumanVerificationOwnerForContextKey(sharedContextKey: string | undefined): BrowserSession | undefined {
  if (!sharedContextKey) return undefined
  const shared = sharedContexts.get(sharedContextKey)
  if (!shared) return undefined
  for (const sessionKey of shared.sessionKeys) {
    const candidate = sessions.get(sessionKey)
    if (candidate?.humanVerificationGate) return candidate
  }
  return undefined
}

/** Returns the verification-owner session for this browser context, if any. */
function sharedHumanVerificationOwner(session: BrowserSession): BrowserSession | undefined {
  if (session.humanVerificationGate) return session
  return sharedHumanVerificationOwnerForContextKey(session.sharedContextKey)
}

async function setBrowserWindowPresentation(session: BrowserSession, presentation: 'minimized' | 'foreground'): Promise<boolean> {
  try {
    const context = recoverBrowserContext(session)
    if (!context) {
      console.error('[Playwright] Failed to apply browser window presentation: no recoverable BrowserContext remains in the managed browser')
      return false
    }
    const page = presentationPage(session, context)
    if (!page) {
      console.error('[Playwright] Failed to apply browser window presentation: no open page remains in the managed browser context')
      return false
    }
    // CDP is an explicitly user-owned browser connection. Do not move, minimize,
    // resize, or close it; a foreground request may only select the active tab.
    if (session.connectionKind === 'cdp') {
      if (presentation === 'foreground') await page.bringToFront()
      return true
    }
    const cdp = await context.newCDPSession(page)
    try {
      const windowInfo = await cdp.send('Browser.getWindowForTarget') as ManagedWindowInfo
      if (typeof windowInfo.windowId !== 'number') return false
      if (presentation === 'minimized') {
        // Do not remember the intentional 1x1 off-screen launch geometry. The
        // first usable foreground bounds are retained for a later human handoff.
        if (isUsableManagedWindowBounds(windowInfo.bounds)) {
          session.normalWindowBounds = { ...windowInfo.bounds }
        }
        await cdp.send('Browser.setWindowBounds', {
          windowId: windowInfo.windowId,
          bounds: { windowState: 'minimized' },
        })
        return true
      }
      // Restore a minimized native window explicitly before applying usable
      // bounds. Supplying geometry alone is not reliable on Windows when the
      // process was launched at the off-screen 1x1 bootstrap position.
      await cdp.send('Browser.setWindowBounds', {
        windowId: windowInfo.windowId,
        bounds: { windowState: 'normal' },
      })
      await cdp.send('Browser.setWindowBounds', {
        windowId: windowInfo.windowId,
        bounds: session.normalWindowBounds ?? DEFAULT_ASSISTABLE_WINDOW_BOUNDS,
      })
      const restored = await cdp.send('Browser.getWindowForTarget') as ManagedWindowInfo
      if (restored.bounds?.windowState === 'minimized') return false
      await page.bringToFront()
      return true
    } finally {
      await cdp.detach().catch(() => undefined)
    }
  } catch (error) {
    console.error('[Playwright] Failed to apply browser window presentation:', error instanceof Error ? error.message : String(error))
    return false
  }
}

/** Applies the sole runtime window mutation for assistable_background: startup minimization. */
async function minimizeBrowserAtSessionStart(session: BrowserSession): Promise<boolean> {
  if (session.connectionKind !== 'managed' || session.windowTarget !== 'minimized') return false
  return setBrowserWindowPresentation(session, 'minimized')
}

/**
 * A CAPTCHA pauses the same page and starts passive recovery monitoring only.
 * The window is intentionally left exactly as the user last left it.
 */
function preserveHumanVerificationWithoutChangingWindow(gate: HumanVerificationGate): void {
  delete gate.windowPresentationConfirmed
}

/**
 * This is the one permitted post-start native-window mutation: an explicit
 * Desktop request from the user to view the runtime-owned Chromium window.
 * Ordinary browsing, CAPTCHA detection, recovery polling, and agent completion
 * never call it, so they cannot steal focus or hide a user-opened window.
 */
async function presentManagedSessionForUser(session: BrowserSession): Promise<boolean> {
  if (!session.browser.isConnected() || session.connectionKind !== 'managed') return false
  if (session.idleTimer) clearTimeout(session.idleTimer)
  session.windowTarget = 'foreground'
  if (session.sharedContextKey) {
    const shared = sharedContexts.get(session.sharedContextKey)
    if (shared) {
      shared.userPresentationRequested = true
      for (const siblingKey of shared.sessionKeys) {
        const sibling = sessions.get(siblingKey)
        if (sibling) sibling.windowTarget = 'foreground'
      }
    }
  }
  return presentManagedBrowserWindow({
    browser: session.browser,
    connectionKind: session.connectionKind,
    headed: session.visible || session.presentation === 'assistable_background',
    bounds: isUsableManagedWindowBounds(session.normalWindowBounds) ? session.normalWindowBounds : DEFAULT_ASSISTABLE_WINDOW_BOUNDS,
    restorePage: () => setBrowserWindowPresentation(session, 'foreground'),
  })
}

async function presentSession(sessionKey: string, presentation: 'minimized' | 'foreground'): Promise<boolean> {
  const session = sessions.get(sessionKey)
  if (!session || presentation !== 'foreground') return false
  return await presentManagedSessionForUser(session)
}

function verificationObservationRequest(session: BrowserSession): PlaywrightRunnerRequest {
  return {
    actions: [],
    visible: session.visible,
    slowMoMs: 0,
    pageTimeoutMs: 5_000,
    networkIdleTimeoutMs: 500,
    maxLinks: 20,
  }
}

function stopHumanVerificationMonitoring(session: BrowserSession): void {
  if (session.humanVerificationMonitor) clearInterval(session.humanVerificationMonitor)
  session.humanVerificationMonitor = undefined
  session.humanVerificationMonitorInFlight = false
  session.humanVerificationHealthyObservations = 0
}

async function reportAutoDetectedVerification(session: BrowserSession): Promise<boolean> {
  const control = session.activityControl
  const browserKey = control?.browserKey
  if (!control || !browserKey) return false
  try {
    const endpoint = new URL('/api/expert-human-verifications', control.endpoint)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'auto_detected_completed',
        sessionId: control.sessionId,
        browserSessionKey: browserKey,
      }),
    })
    // Only an explicit success means the server found the same pending
    // verification and has acknowledged the Desktop modal. A 404/409 can be a
    // transient ordering race; keep the page, modal, and monitor intact.
    if (response.ok) return true
  } catch {
    // Desktop reconnects should not cause the preserved page to be closed or downgraded.
  }
  return false
}

/**
 * Passive observation only: it never clicks, reloads, drags, submits, or opens
 * another page. After two healthy readings, the service resolves the existing
 * Desktop verification wait so the original tool call resumes with wait/extract.
 */
async function observeHumanVerificationRecovery(session: BrowserSession): Promise<void> {
  if (expireHumanVerificationGate(session)) { stopHumanVerificationMonitoring(session); return }
  const gate = session.humanVerificationGate
  if (!gate || session.humanVerificationAutoResolutionSent || session.humanVerificationMonitorInFlight) return
  session.humanVerificationMonitorInFlight = true
  try {
    const page = await extractFinalPage(session, verificationObservationRequest(session))
    const stillVerification = isHumanVerificationSurfaceStillPresent(
      gate.verificationKind,
      page.url,
      page.title,
      page.text,
    )
    if (stillVerification) {
      session.humanVerificationHealthyObservations = 0
      return
    }
    session.humanVerificationHealthyObservations = (session.humanVerificationHealthyObservations ?? 0) + 1
    if (session.humanVerificationHealthyObservations < 2) return
    session.humanVerificationAutoResolutionSent = true
    const accepted = await reportAutoDetectedVerification(session)
    if (accepted) stopHumanVerificationMonitoring(session)
    else session.humanVerificationAutoResolutionSent = false
  } catch {
    // A transient page/connection read must keep the exact verification context intact.
    session.humanVerificationHealthyObservations = 0
  } finally {
    session.humanVerificationMonitorInFlight = false
  }
}

function startHumanVerificationMonitoring(session: BrowserSession): void {
  if (!session.humanVerificationGate || !session.activityControl || !session.activityControl.browserKey || session.humanVerificationMonitor) return
  session.humanVerificationHealthyObservations = 0
  session.humanVerificationAutoResolutionSent = false
  void observeHumanVerificationRecovery(session)
  session.humanVerificationMonitor = setInterval(() => { void observeHumanVerificationRecovery(session) }, 1_000)
}

async function reportUserRequestedPresentation(
  session: BrowserSession,
  showGeneration: number,
  presentationConfirmed: boolean,
): Promise<void> {
  const control = session.activityControl
  if (!control?.browserKey) return
  await fetch(control.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'presentation_result',
      sessionId: control.sessionId,
      browserKey: control.browserKey,
      showGeneration,
      presentationConfirmed,
    }),
  }).catch(() => undefined)
}

async function pollVerificationControl(session: BrowserSession): Promise<void> {
  const control = session.activityControl
  if (!control) return
  try {
    const endpoint = new URL(control.endpoint)
    endpoint.searchParams.set('sessionId', control.sessionId)
    if (control.browserKey) endpoint.searchParams.set('browserKey', control.browserKey)
    const response = await fetch(endpoint)
    const payload = await response.json().catch(() => null) as {
      showGeneration?: unknown
      verificationCheckGeneration?: unknown
    } | null
    const showGeneration = typeof payload?.showGeneration === 'number' ? payload.showGeneration : 0
    if (showGeneration > (session.showGeneration ?? 0)) {
      session.showGeneration = showGeneration
      const presentationConfirmed = await presentManagedSessionForUser(session)
      await reportUserRequestedPresentation(session, showGeneration, presentationConfirmed)
    }
    const verificationCheckGeneration = typeof payload?.verificationCheckGeneration === 'number' ? payload.verificationCheckGeneration : 0
    if (verificationCheckGeneration > (session.verificationCheckGeneration ?? 0)) {
      session.verificationCheckGeneration = verificationCheckGeneration
      void observeHumanVerificationRecovery(session)
    }
  } catch {
    // An explicit browser-show request or verification check must never break browsing when Desktop is reconnecting.
  }
}

function startVerificationControlPolling(session: BrowserSession, request: PlaywrightRunnerRequest): void {
  if (!request.activityControl) return
  session.activityControl = request.activityControl
  if (session.activityControlTimer) return
  void pollVerificationControl(session)
  session.activityControlTimer = setInterval(() => { void pollVerificationControl(session) }, 750)
  session.activityControlTimer.unref?.()
}

function scheduleIdleClose(sessionKey: string, session: BrowserSession): void {
  if (session.idleTimer) clearTimeout(session.idleTimer)
  // A visible user-verification page is not idle. It remains open until the
  // user resolves it, the Expert session is stopped, or the relay itself times out.
  if (!shouldSchedulePlaywrightIdleClose(Boolean(session.humanVerificationGate || session.preservedVerificationPages?.size))) return
  session.idleTimer = setTimeout(() => {
    void enqueueSessionRun(queueKeyForSession(sessionKey), () => closeSession(sessionKey))
  }, BROWSER_SESSION_IDLE_MS)
  session.idleTimer.unref?.()
}

function queueKeyForSession(sessionKey: string, sharedContextKey?: string): string {
  return sharedContextKey ?? sessions.get(sessionKey)?.sharedContextKey ?? sessionKey
}

async function closeSession(sessionKey: string): Promise<void> {
  const session = sessions.get(sessionKey)
  if (!session) return
  sessions.delete(sessionKey)
  if (session.idleTimer) clearTimeout(session.idleTimer)
  if (session.activityControlTimer) clearInterval(session.activityControlTimer)
  stopHumanVerificationMonitoring(session)

  if (session.sharedContextKey) {
    await Promise.all(openOwnedPages(session).map((page) => page.close().catch(() => undefined)))
    const shared = sharedContexts.get(session.sharedContextKey)
    if (!shared) return
    shared.sessionKeys.delete(sessionKey)
    if (shared.sessionKeys.size > 0) return
    sharedContexts.delete(session.sharedContextKey)
    // For a CDP-attached browser, Playwright closes only its debugging connection;
    // it must never terminate the user-owned Chrome or Edge process.
    await shared.browser.close().catch(() => undefined)
    return
  }

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
  const sharedContextKey = request.sharedContextKey?.trim() || undefined
  const existing = sessions.get(sessionKey)
  if (
    existing
    && existing.browser.isConnected()
    && existing.visible === request.visible
    && existing.presentation === request.presentation
    && existing.identity === identity
    && existing.sharedContextKey === sharedContextKey
  ) {
    if (existing.idleTimer) clearTimeout(existing.idleTimer)
    startVerificationControlPolling(existing, request)
    return existing
  }
  if (existing) await closeSession(sessionKey)

  const isCdp = request.connection?.kind === 'cdp'
  // assistable_background is deliberately headed so a user can take over the
  // same page, but its first native window is bootstrapped off-screen/minimized.
  // No other Playwright call receives these launch arguments.
  const isAssistableBackground = !isCdp && request.presentation === 'assistable_background'
  let browser: Browser
  let context: BrowserContext | undefined
  let shared: SharedBrowserContext | undefined

  if (sharedContextKey) {
    shared = sharedContexts.get(sharedContextKey)
    if (shared && (!shared.browser.isConnected() || shared.identity !== identity || shared.connectionKind !== (isCdp ? 'cdp' : 'managed'))) {
      throw new Error('The Expert shared browser context is incompatible with this research request. Finish the active Expert session and start a new one.')
    }
  }

  if (shared) {
    browser = shared.browser
    context = shared.context
  } else {
    browser = isCdp
      ? await chromium.connectOverCDP(request.connection.endpoint, { slowMo: request.slowMoMs })
      : await chromium.launch({
          executablePath: request.executablePath,
          headless: !request.visible && !isAssistableBackground,
          slowMo: request.visible || isAssistableBackground ? request.slowMoMs : 0,
          // Do not force --disable-gpu: visible, user-observable research should use
          // the platform's normal graphics path when Chromium supports it.
          args: [
            '--no-first-run',
            '--no-default-browser-check',
            ...managedPresentationLaunchArgs(request.presentation),
          ],
        })
    context = isCdp
      ? browser.contexts()[0]
      : await browser.newContext({ ...(request.locale?.trim() ? { locale: request.locale.trim() } : {}) })
    if (!context) {
      await browser.close().catch(() => undefined)
      throw new Error('The authorized browser has no accessible context. Start Chrome or Edge with a local remote-debugging port, then retry.')
    }
    await guardPublicBrowserContext(context)
    if (sharedContextKey) {
      shared = {
        browser,
        context,
        identity,
        connectionKind: isCdp ? 'cdp' : 'managed',
        sessionKeys: new Set(),
        startupMinimizationAttempted: false,
        userPresentationRequested: false,
      }
      sharedContexts.set(sharedContextKey, shared)
    }
  }

  const initialPage = await context!.newPage()
  const session = {
    browser,
    context: context!,
    page: initialPage,
    ownedPages: new Set([initialPage]),
    visible: request.visible,
    ...(request.presentation ? { presentation: request.presentation } : {}),
    windowTarget: shared?.userPresentationRequested
      ? 'foreground'
      : initialWindowPresentationTarget(request.presentation),
    identity,
    connectionKind: isCdp ? 'cdp' : 'managed',
    ...(sharedContextKey ? { sharedContextKey } : {}),
  } satisfies BrowserSession
  sessions.set(sessionKey, session)
  if (sharedContextKey) sharedContexts.get(sharedContextKey)?.sessionKeys.add(sessionKey)
  // Minimize only once for the native shared browser. A later Agent creating
  // its own page must never re-minimize a window the user already opened.
  if (isAssistableBackground) {
    const sharedState = sharedContextKey ? sharedContexts.get(sharedContextKey) : undefined
    if (!sharedState) {
      await minimizeBrowserAtSessionStart(session)
    } else if (!sharedState.startupMinimizationAttempted && !sharedState.userPresentationRequested) {
      sharedState.startupMinimizationAttempted = true
      await minimizeBrowserAtSessionStart(session)
    }
  }
  startVerificationControlPolling(session, request)
  return session
}

async function sharedVerificationBlockedResult(
  request: PlaywrightRunnerRequest,
  owner: BrowserSession,
  blockedSessionUrl: string,
): Promise<PlaywrightRunnerResult> {
  const gate = owner.humanVerificationGate
  if (!gate) throw new Error('The shared browser verification owner no longer has a verification gate.')
  return buildSharedVerificationBlockedResult(request, gate, blockedSessionUrl)
}

async function runSession(sessionKey: string, request: PlaywrightRunnerRequest): Promise<PlaywrightRunnerResult> {
  // A shared context means one native Chromium window. Do this check before
  // openSession() creates a sibling blank tab; otherwise a normal worker can
  // visibly steal the CAPTCHA tab before the user has a chance to act.
  for (const candidate of sessions.values()) {
    if ((candidate === sessions.get(sessionKey) || (request.sharedContextKey && candidate.sharedContextKey === request.sharedContextKey)) && expireHumanVerificationGate(candidate)) stopHumanVerificationMonitoring(candidate)
  }
  const existing = sessions.get(sessionKey)
  const sharedOwner = sharedHumanVerificationOwnerForContextKey(request.sharedContextKey)
  if (sharedOwner && sharedOwner !== existing) {
    // A human may have already opened this shared Chromium window. Do not
    // reposition, minimize, or otherwise take control of it; simply hold the
    // sibling agent until the gate is resolved.
    const blockedSessionUrl = existing && !existing.page.isClosed() ? existing.page.url() : ''
    return sharedVerificationBlockedResult(request, sharedOwner, blockedSessionUrl)
  }

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
    stopHumanVerificationMonitoring(session)
    if (request.verificationResolution === 'record_evidence_gap') {
      const current = await pendingVerificationResult(session, existingGate)
      parkHumanVerificationPage(session)
      return {
        ...current,
        error: 'EXPERT_HUMAN_VERIFICATION_RECORDED_AS_GAP: ' + existingGate.verificationKind + ' at ' + existingGate.finalUrl + '. This verification remains unresolved; no browser action was executed and the original page is preserved.',
      }
    }
  }
  const steps: Step[] = []
  try {
    for (let index = 0; index < request.actions.length; index += 1) {
      const action = request.actions[index]
      try {
        session.scriptPageObservations = undefined
        const detail = await executeAction(session, action, request)
        const state = await pageState(await activePage(session))
        steps.push({ index, type: action.type, outcome: 'success', ...state, ...(detail ? { detail } : {}), ...(action.type === 'script' && session.scriptPageObservations?.length ? { scriptPages: session.scriptPageObservations } : {}), ...(action.type === 'screenshot' && request.screenshotPath ? { screenshotPath: request.screenshotPath } : {}) })
        // Stop this very request as soon as a visible verification page appears.
        // Waiting until all queued actions finish could let a later navigation
        // overwrite the exact tab the user needs to complete manually.
        if (ACTIONS_THAT_CAN_SURFACE_HUMAN_VERIFICATION.has(action.type)) {
          const pageAfterAction = await extractFinalPage(session, request).catch(() => null)
          const gate = pageAfterAction ? maybeHoldForHumanVerification(session, request, pageAfterAction) : null
          if (gate) {
            preserveHumanVerificationWithoutChangingWindow(gate)
            return { ...pageAfterAction!, steps, verificationGateId: gate.gateId, verificationWindowPresentationConfirmed: gate.windowPresentationConfirmed, error: humanVerificationRequiredError(gate) }
          }
        }
      } catch (error) {
        const page = await activePage(session).catch(() => session.page)
        const state = await pageState(page).catch(() => ({ url: '', title: '' }))
        const detail = error instanceof Error ? error.message : String(error)
        steps.push({ index, type: action.type, outcome: 'failed', ...state, detail, ...(action.type === 'script' && session.scriptPageObservations?.length ? { scriptPages: session.scriptPageObservations } : {}) })
        const finalPage = await extractFinalPage(session, request).catch(() => ({ ...state, text: '', links: [], accessLimited: /captcha|verification|403|429/i.test(detail) }))
        const screenshotPath = await saveScreenshot(page, request).catch(() => undefined)
        const gate = maybeHoldForHumanVerification(session, request, finalPage)
        if (gate) {
          preserveHumanVerificationWithoutChangingWindow(gate)
          return { ...finalPage, steps, ...(screenshotPath ? { screenshotPath } : {}), verificationGateId: gate.gateId, verificationWindowPresentationConfirmed: gate.windowPresentationConfirmed, error: humanVerificationRequiredError(gate) }
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
      preserveHumanVerificationWithoutChangingWindow(gate)
      return { ...finalPage, steps, ...(screenshotPath ? { screenshotPath } : {}), verificationGateId: gate.gateId, verificationWindowPresentationConfirmed: gate.windowPresentationConfirmed, error: humanVerificationRequiredError(gate) }
    }
    return { ...finalPage, steps, ...(screenshotPath ? { screenshotPath } : {}) }
  } finally {
    if (sessions.get(sessionKey) === session && session.browser.isConnected()) {
      // After startup, assistable_background deliberately leaves the native
      // window untouched, including after normal actions and verification recovery.
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
  if (raw.type === 'abort-session') {
    await enqueueSessionRun(queueKeyForSession(raw.sessionKey), async () => {
      // A caller may be cancelled after the runner has already preserved a CAPTCHA
      // tab. Keep that exact session/context alive for the Desktop verification
      // handoff; an explicit close or Expert exit remains allowed to release it.
      const session = sessions.get(raw.sessionKey!)
      if (!session?.humanVerificationGate) await closeSession(raw.sessionKey!)
    })
    writeResponse({ id: raw.id, ok: true })
    return
  }
  if (raw.type === 'close-session') {
    await enqueueSessionRun(queueKeyForSession(raw.sessionKey), () => closeSession(raw.sessionKey!))
    writeResponse({ id: raw.id, ok: true })
    return
  }
  if (raw.type === 'present-session') {
    await enqueueSessionRun(queueKeyForSession(raw.sessionKey), () => presentSession(raw.sessionKey!, raw.presentation!))
    writeResponse({ id: raw.id, ok: true })
    return
  }
  if (raw.type !== 'run' || !raw.request) throw new Error('The managed Node Playwright bridge request has an unsupported type.')
  const result = await enqueueSessionRun(queueKeyForSession(raw.sessionKey, raw.request.sharedContextKey), () => runSession(raw.sessionKey!, raw.request!))
  writeResponse({ id: raw.id, ok: true, result })
}

async function closeAllSessions(): Promise<void> {
  await Promise.all([...sessions.keys()].map((sessionKey) =>
    enqueueSessionRun(queueKeyForSession(sessionKey), () => closeSession(sessionKey)),
  ))
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
