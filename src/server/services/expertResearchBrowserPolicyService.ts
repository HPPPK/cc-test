export const EXPERT_RESEARCH_BROWSER_FALLBACK_ENGINES = ['Google', '百度', 'Bing', '360'] as const
export type ExpertResearchBrowserSearchEngine = (typeof EXPERT_RESEARCH_BROWSER_FALLBACK_ENGINES)[number]

export type ExpertResearchBrowserPresentation = 'assistable_background' | 'always_visible'

export type ExpertResearchBrowserPolicy = {
  sharePlaywrightSessionAcrossAgents: boolean
  /**
   * The Expert may offer a session-scoped connection to a browser the user has
   * deliberately opened with a local CDP debugging endpoint. Omitted means off.
   */
  allowUserAuthorizedCdp?: boolean
  /**
   * The managed Chromium presentation chosen by this package when the user has
   * not selected a session-scoped alternative. It never changes ordinary
   * Playwright calls or CDP-attached browsers.
   */
  managedPresentationDefault?: ExpertResearchBrowserPresentation
  /** Whether this package lets a person choose the managed presentation at Expert start. */
  allowManagedPresentationChoice?: boolean
  /** Legacy compatibility for packages authored before managedPresentationDefault. */
  forceVisiblePlaywright?: boolean
  /** Close each delegated agent's isolated Playwright browser after that agent reaches a terminal state. */
  closePlaywrightWhenAgentDone?: boolean
  /** Let the Desktop host own CAPTCHA/login handoff for this Expert session. */
  desktopHumanVerificationHandoff?: boolean
  /** Remove AskUserQuestion only from this Expert's delegated research workers. */
  forbidSubagentAskUserQuestion?: boolean
  /** Ordered fallback search entries used only after the user declines a visible verification. */
  verificationFallbackSearchEngines?: ExpertResearchBrowserSearchEngine[]
}

export type ExpertResearchBrowserConnection =
  | { kind: 'managed' }
  | {
      kind: 'cdp'
      browser: 'chrome' | 'edge'
      endpoint: string
      userAuthorizedAt: string
    }

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isLocalCdpHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

/**
 * Local CDP is intentionally the only supported user-browser connection.
 * The app never accepts a remote debugger, credentials, proxy URL, or a user
 * profile path. This keeps the authorization boundary visible and auditable.
 */
export function normalizeLocalCdpEndpoint(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('请填写本机 Chrome 或 Edge 的调试地址，例如 http://127.0.0.1:9222。')
  }

  let endpoint: URL
  try {
    endpoint = new URL(value.trim())
  } catch {
    throw new Error('浏览器调试地址格式不正确。')
  }

  if (endpoint.protocol !== 'http:' || endpoint.username || endpoint.password) {
    throw new Error('只允许无账号密码的本机 http 调试地址。')
  }
  if (!isLocalCdpHost(endpoint.hostname)) {
    throw new Error('只允许连接本机 localhost、127.0.0.1 或 ::1 的浏览器调试地址。')
  }
  if (!endpoint.port || !/^[1-9][0-9]{0,4}$/.test(endpoint.port)) {
    throw new Error('浏览器调试地址必须包含有效端口。')
  }
  const port = Number(endpoint.port)
  if (port > 65_535 || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
    throw new Error('浏览器调试地址只能是本机根地址，例如 http://127.0.0.1:9222。')
  }

  const hostname = endpoint.hostname.replace(/^\[|\]$/g, '')
  const host = hostname.includes(':') ? '[' + hostname + ']' : hostname.toLowerCase()
  return 'http://' + host + ':' + port
}

/**
 * Validates user input before a CDP endpoint reaches a child CLI process.
 * A package has to opt in, and every CDP connection requires a fresh explicit
 * acknowledgement from the person entering this Expert session.
 */
export function resolveExpertResearchBrowserConnection(
  policy: ExpertResearchBrowserPolicy | undefined,
  input: unknown,
  userAuthorizedAt: string,
): ExpertResearchBrowserConnection | undefined {
  if (input === undefined || input === null) return undefined
  if (!isRecord(input)) throw new Error('浏览器连接设置格式不正确。')
  if (input.kind === 'managed') return { kind: 'managed' }
  if (input.kind !== 'cdp') throw new Error('浏览器连接方式必须是 managed 或 cdp。')
  if (policy?.allowUserAuthorizedCdp !== true) {
    throw new Error('这个专家包没有声明可连接用户授权的 Chrome 或 Edge。')
  }
  if (input.userAuthorized !== true) {
    throw new Error('请先确认你授权本次专家会话读取和操作该调试浏览器。')
  }
  if (input.browser !== 'chrome' && input.browser !== 'edge') {
    throw new Error('请选择 Chrome 或 Edge。')
  }

  return {
    kind: 'cdp',
    browser: input.browser,
    endpoint: normalizeLocalCdpEndpoint(input.endpoint),
    userAuthorizedAt,
  }
}

export function resolveExpertResearchBrowserPresentation(
  policy: ExpertResearchBrowserPolicy | undefined,
  connection: ExpertResearchBrowserConnection | undefined,
  input: unknown,
): ExpertResearchBrowserPresentation | undefined {
  // A CDP browser belongs to the person who explicitly launched it. We may
  // activate the current tab later, but never minimise or otherwise control
  // the external browser window through the managed presentation setting.
  if (connection?.kind === 'cdp') return undefined

  const defaultPresentation = policy?.managedPresentationDefault
    ?? (policy?.forceVisiblePlaywright === true ? 'always_visible' : undefined)
  if (input === undefined || input === null) return defaultPresentation
  if (input !== 'assistable_background' && input !== 'always_visible') {
    throw new Error('浏览器显示方式必须是“后台检索，需协助时自动显示”或“全程显示浏览器操作”。')
  }
  if (policy?.allowManagedPresentationChoice !== true) {
    throw new Error('这个专家包不允许修改软件自带 Chromium 的显示方式。')
  }
  return input
}

/**
 * Reads the optional browser-session policy declared by an Expert output protocol.
 * It is intentionally package-scoped: no Expert ID receives special browser behavior.
 */
export function resolveExpertResearchBrowserPolicy(
  outputProtocolContent?: string,
): ExpertResearchBrowserPolicy | undefined {
  if (!outputProtocolContent?.trim()) return undefined

  let document: unknown
  try {
    document = JSON.parse(outputProtocolContent)
  } catch {
    throw new Error('专家输出协议不是有效 JSON，无法读取 researchBrowser 浏览器规则。')
  }

  if (!isRecord(document) || document.researchBrowser === undefined) return undefined
  if (!isRecord(document.researchBrowser)) {
    throw new Error('researchBrowser 必须是对象。')
  }

  const sharePlaywrightSessionAcrossAgents = document.researchBrowser.sharePlaywrightSessionAcrossAgents
  if (typeof sharePlaywrightSessionAcrossAgents !== 'boolean') {
    throw new Error('researchBrowser.sharePlaywrightSessionAcrossAgents 必须是布尔值。')
  }

  const allowUserAuthorizedCdp = document.researchBrowser.allowUserAuthorizedCdp
  if (allowUserAuthorizedCdp !== undefined && typeof allowUserAuthorizedCdp !== 'boolean') {
    throw new Error('researchBrowser.allowUserAuthorizedCdp 必须是布尔值。')
  }
  const managedPresentationDefault = document.researchBrowser.managedPresentationDefault
  if (managedPresentationDefault !== undefined && managedPresentationDefault !== 'assistable_background' && managedPresentationDefault !== 'always_visible') {
    throw new Error('researchBrowser.managedPresentationDefault 必须是 assistable_background 或 always_visible。')
  }
  const allowManagedPresentationChoice = document.researchBrowser.allowManagedPresentationChoice
  if (allowManagedPresentationChoice !== undefined && typeof allowManagedPresentationChoice !== 'boolean') {
    throw new Error('researchBrowser.allowManagedPresentationChoice 必须是布尔值。')
  }
  const forceVisiblePlaywright = document.researchBrowser.forceVisiblePlaywright
  if (forceVisiblePlaywright !== undefined && typeof forceVisiblePlaywright !== 'boolean') {
    throw new Error('researchBrowser.forceVisiblePlaywright 必须是布尔值。')
  }
  const closePlaywrightWhenAgentDone = document.researchBrowser.closePlaywrightWhenAgentDone
  if (closePlaywrightWhenAgentDone !== undefined && typeof closePlaywrightWhenAgentDone !== 'boolean') {
    throw new Error('researchBrowser.closePlaywrightWhenAgentDone 必须是布尔值。')
  }
  const desktopHumanVerificationHandoff = document.researchBrowser.desktopHumanVerificationHandoff
  if (desktopHumanVerificationHandoff !== undefined && typeof desktopHumanVerificationHandoff !== 'boolean') {
    throw new Error('researchBrowser.desktopHumanVerificationHandoff 必须是布尔值。')
  }
  const forbidSubagentAskUserQuestion = document.researchBrowser.forbidSubagentAskUserQuestion
  if (forbidSubagentAskUserQuestion !== undefined && typeof forbidSubagentAskUserQuestion !== 'boolean') {
    throw new Error('researchBrowser.forbidSubagentAskUserQuestion 必须是布尔值。')
  }
  const verificationFallbackSearchEngines = document.researchBrowser.verificationFallbackSearchEngines
  if (verificationFallbackSearchEngines !== undefined && (
    !Array.isArray(verificationFallbackSearchEngines)
    || verificationFallbackSearchEngines.length === 0
    || verificationFallbackSearchEngines.some((engine) =>
      typeof engine !== 'string' || !(EXPERT_RESEARCH_BROWSER_FALLBACK_ENGINES as readonly string[]).includes(engine),
    )
  )) {
    throw new Error('researchBrowser.verificationFallbackSearchEngines 必须是至少一个 Google、百度、Bing 或 360 入口组成的数组。')
  }
  const normalizedFallbackSearchEngines = verificationFallbackSearchEngines === undefined
    ? undefined
    : [...new Set(verificationFallbackSearchEngines)] as ExpertResearchBrowserSearchEngine[]

  return {
    sharePlaywrightSessionAcrossAgents,
    ...(allowUserAuthorizedCdp === true ? { allowUserAuthorizedCdp: true } : {}),
    ...(managedPresentationDefault ? { managedPresentationDefault } : {}),
    ...(allowManagedPresentationChoice === true ? { allowManagedPresentationChoice: true } : {}),
    ...(forceVisiblePlaywright === true ? { forceVisiblePlaywright: true } : {}),
    ...(closePlaywrightWhenAgentDone === true ? { closePlaywrightWhenAgentDone: true } : {}),
    ...(desktopHumanVerificationHandoff === true ? { desktopHumanVerificationHandoff: true } : {}),
    ...(forbidSubagentAskUserQuestion === true ? { forbidSubagentAskUserQuestion: true } : {}),
    ...(normalizedFallbackSearchEngines ? { verificationFallbackSearchEngines: normalizedFallbackSearchEngines } : {}),
  }
}
