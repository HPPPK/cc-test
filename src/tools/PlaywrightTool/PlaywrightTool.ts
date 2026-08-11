import { basename, join } from 'node:path'
import { z } from 'zod/v4'
import { getSessionId } from '../../bootstrap/state.js'
import { buildTool, type ToolUseContext } from '../../Tool.js'
import { closePlaywrightBrowserSession, isPlaywrightNodeBridgeAvailable, runPlaywrightWithNodeBridge } from './nodeBridge.js'
import { PLAYWRIGHT_DESCRIPTION, PLAYWRIGHT_TOOL_NAME, getPlaywrightPrompt } from './prompt.js'
import {
  ensurePlaywrightRuntimeDir,
  getUnsafePublicBrowserUrlReason,
  isPlaywrightRuntimeAvailable,
  isPlaywrightRuntimeInstalled,
  resolvePlaywrightExecutablePath,
  summarizeRenderedPageText,
} from './runtime.js'

const PLAYWRIGHT_ACTION_TYPES = ['navigate', 'reload', 'go_back', 'go_forward', 'new_tab', 'list_tabs', 'switch_tab', 'close_tab', 'fill', 'type', 'clear', 'click', 'double_click', 'hover', 'focus', 'press', 'select_option', 'check', 'uncheck', 'drag_to', 'wait', 'wait_for_selector', 'wait_for_url', 'wait_for_load_state', 'scroll', 'scroll_into_view', 'extract', 'get_attribute', 'get_html', 'count', 'is_visible', 'is_enabled', 'is_checked', 'bounding_box', 'screenshot', 'script'] as const

type ActionType = (typeof PLAYWRIGHT_ACTION_TYPES)[number]

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

type HumanVerificationResolution = 'verified' | 'switch_public_entry' | 'record_evidence_gap'

type Input = {
  actions: PlaywrightAction[]
  visible: boolean
  slow_mo_ms: number
  locale?: string
  include_screenshot: boolean
  verification_resolution?: HumanVerificationResolution
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

type Output = {
  url: string
  title: string
  text: string
  links: Array<{ text: string; url: string }>
  durationMs: number
  truncated: boolean
  steps: Step[]
  accessLimited: boolean
  screenshotPath?: string
  error?: string
}

const actionSchema = z.strictObject({
  type: z.enum(PLAYWRIGHT_ACTION_TYPES),
  url: z.string().url().optional(),
  selector: z.string().trim().min(1).max(500).optional(),
  text: z.string().max(5_000).optional(),
  key: z.string().trim().min(1).max(100).optional(),
  script: z.string().min(1).max(64_000).optional(),
  value: z.union([z.string().max(5_000), z.array(z.string().max(5_000)).min(1).max(100)]).optional(),
  attribute: z.string().trim().min(1).max(200).optional(),
  source_selector: z.string().trim().min(1).max(500).optional(),
  target_selector: z.string().trim().min(1).max(500).optional(),
  tab_index: z.number().int().min(0).max(100).optional(),
  state: z.enum(['attached', 'detached', 'visible', 'hidden', 'commit', 'domcontentloaded', 'load', 'networkidle']).optional(),
  delay_ms: z.number().int().min(0).max(2_000).optional(),
  ms: z.number().int().min(0).max(60_000).optional(),
  x: z.number().finite().min(-20_000).max(20_000).optional(),
  y: z.number().finite().min(-20_000).max(20_000).optional(),
})

const inputSchema = z.strictObject({
  actions: z.array(actionSchema).max(64).describe('The explicit real-browser actions to perform, in order. Do not describe research goals here: use navigate, fill, click, press, wait, scroll, extract, and screenshot actions. An empty list is valid only with verification_resolution=record_evidence_gap.'),
  visible: z.boolean().optional().default(true).describe('Keep the managed Chromium window in the foreground so the user can observe the actual browser actions. Default: true.'),
  slow_mo_ms: z.number().int().min(0).max(2_000).optional().default(350).describe('Delay each Playwright action when the visible browser is enabled, so the user can observe it. Default: 350ms.'),
  locale: z.string().trim().regex(/^[A-Za-z]{2,3}-[A-Za-z]{2,4}$/, 'locale must resemble zh-CN or en-US.').optional(),
  include_screenshot: z.boolean().optional().default(false).describe('Save one final screenshot when visual evidence needs to be retained.'),
  verification_resolution: z.enum(['verified', 'switch_public_entry', 'record_evidence_gap']).optional().describe('Only when this Expert session is paused on a visible human verification page: verified resumes the same page after the user completes it; switch_public_entry permits a different public source; record_evidence_gap releases the page without further research.'),
}).superRefine((value, ctx) => {
  if (value.actions.length === 0 && value.verification_resolution !== 'record_evidence_gap') {
    ctx.addIssue({ code: 'custom', path: ['actions'], message: 'actions must contain at least one browser action unless verification_resolution is record_evidence_gap.' })
  }
})

const outputSchema = z.object({
  url: z.string(),
  title: z.string(),
  text: z.string(),
  links: z.array(z.object({ text: z.string(), url: z.string() })),
  durationMs: z.number(),
  truncated: z.boolean(),
  steps: z.array(z.object({
    index: z.number(),
    type: z.enum(PLAYWRIGHT_ACTION_TYPES),
    outcome: z.enum(['success', 'failed']),
    url: z.string(),
    title: z.string().optional(),
    detail: z.string().optional(),
    screenshotPath: z.string().optional(),
  })),
  accessLimited: z.boolean(),
  screenshotPath: z.string().optional(),
  error: z.string().optional(),
})

function firstTarget(actions: ReadonlyArray<PlaywrightAction | null | undefined> | null | undefined): string | undefined {
  if (!Array.isArray(actions)) return undefined
  for (const action of actions) {
    if (action === null || action === undefined) continue
    if (action.type === 'navigate' && typeof action.url === 'string' && action.url.length > 0) return action.url
  }
  return undefined
}

function hostnameForPermission(url: string | undefined): string {
  try { return new URL(url ?? '').hostname } catch { return 'public web pages' }
}

export type PlaywrightSessionKeyOptions = {
  rootSessionId: string
  expertSessionId?: string
  shareAcrossAgents?: boolean
}

/**
 * A browser context is normally isolated per parent session and per agent.
 * An Expert may opt in through its active runtime binding to preserve a visible
 * verification page, cookies, and tabs across its own delegated agents.
 */
export function resolvePlaywrightSessionKey(
  context: Pick<ToolUseContext, 'agentId'>,
  options: PlaywrightSessionKeyOptions,
): string {
  const expertSessionId = options.expertSessionId?.trim()
  if (options.shareAcrossAgents && expertSessionId) return 'expert:' + expertSessionId
  return options.rootSessionId + ':' + (context.agentId ?? 'main')
}

function sharedExpertPlaywrightSessionId(): string | undefined {
  const value = (
    process.env.CC_JIANGXIA_EXPERT_SHARED_PLAYWRIGHT_SESSION_ID
    ?? process.env.CC_HAHA_EXPERT_SHARED_PLAYWRIGHT_SESSION_ID
  )?.trim()
  return value || undefined
}

export function resolveCurrentPlaywrightSessionKey(context: Pick<ToolUseContext, 'agentId'>): string {
  const expertSessionId = sharedExpertPlaywrightSessionId()
  return resolvePlaywrightSessionKey(context, {
    rootSessionId: getSessionId(),
    ...(expertSessionId ? { expertSessionId, shareAcrossAgents: true } : {}),
  })
}

type ExpertCdpConnection = { kind: 'cdp'; endpoint: string }

export function resolveExpertCdpConnection(env: NodeJS.ProcessEnv = process.env): { connection?: ExpertCdpConnection; error?: string } {
  const raw = (env.CC_JIANGXIA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT ?? env.CC_HAHA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT)?.trim()
  if (!raw) return {}
  try {
    const endpoint = new URL(raw)
    const hostname = endpoint.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    const validPort = /^[1-9][0-9]{0,4}$/.test(endpoint.port) && Number(endpoint.port) <= 65_535
    if (endpoint.protocol !== 'http:' || endpoint.username || endpoint.password || !isLocal || !validPort || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
      return { error: 'The active Expert browser connection is not a permitted local CDP endpoint.' }
    }
    const host = hostname.includes(':') ? '[' + hostname + ']' : hostname
    return { connection: { kind: 'cdp', endpoint: 'http://' + host + ':' + endpoint.port } }
  } catch {
    return { error: 'The active Expert browser connection is invalid.' }
  }
}

export type ExpertManagedPlaywrightPresentation = 'assistable_background' | 'always_visible'

export function resolveExpertManagedPlaywrightPresentation(env: NodeJS.ProcessEnv = process.env): ExpertManagedPlaywrightPresentation | undefined {
  const value = (env.CC_JIANGXIA_EXPERT_MANAGED_PLAYWRIGHT_PRESENTATION ?? env.CC_HAHA_EXPERT_MANAGED_PLAYWRIGHT_PRESENTATION)?.trim()
  return value === 'assistable_background' || value === 'always_visible' ? value : undefined
}

function expertForcesVisiblePlaywright(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CC_JIANGXIA_EXPERT_FORCE_VISIBLE_PLAYWRIGHT === '1' || env.CC_HAHA_EXPERT_FORCE_VISIBLE_PLAYWRIGHT === '1'
}

export function shouldPreserveExpertHumanVerificationPage(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF === '1' || env.CC_HAHA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF === '1'
}

type ExpertBrowserActivityStatus = 'researching' | 'awaiting_verification' | 'resumed' | 'completed' | 'access_limited'

function expertBrowserActivityConfig(browserKey?: string, env: NodeJS.ProcessEnv = process.env): { endpoint: URL; sessionId: string; browserKey?: string } | null {
  const serverUrl = (env.CC_JIANGXIA_DESKTOP_SERVER_URL ?? env.CC_HAHA_DESKTOP_SERVER_URL)?.trim()
  const sessionId = (env.CC_JIANGXIA_EXPERT_SESSION_ID ?? env.CC_HAHA_EXPERT_SESSION_ID)?.trim()
  if (!serverUrl || !sessionId || !shouldPreserveExpertHumanVerificationPage(env)) return null
  try { return { endpoint: new URL('/api/expert-browser-activity', serverUrl), sessionId, ...(browserKey ? { browserKey } : {}) } } catch { return null }
}

async function publishExpertBrowserActivity(input: {
  status: ExpertBrowserActivityStatus
  currentTarget?: string
  checkedTarget?: string
  connectionKind: 'managed' | 'cdp'
  browserKey?: string
}, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = expertBrowserActivityConfig(input.browserKey, env)
  if (!config) return
  await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'activity', sessionId: config.sessionId, ...input }),
  }).catch(() => undefined)
}

function unsupportedActionTypeError(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const actions = (input as { actions?: unknown }).actions
  if (!Array.isArray(actions)) return undefined

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]
    if (typeof action !== 'object' || action === null) continue
    const actionType = (action as { type?: unknown }).type
    if (typeof actionType !== 'string' || PLAYWRIGHT_ACTION_TYPES.includes(actionType as ActionType)) continue

    return [
      'Playwright does not support actions[' + index + '].type=' + JSON.stringify(actionType) + '.',
      'Use only: ' + PLAYWRIGHT_ACTION_TYPES.join(', ') + '.',
      'Retry this Playwright call immediately with an equivalent supported action.',
      'Mappings: a search uses navigate, then fill or type, then press Enter; opening a URL uses navigate; reading page text uses extract.',
      'Do not switch to Bash, PowerShell, Computer Use, Skill, or another browser tool just because this input was invalid. When a named action is insufficient, retry Playwright with the supported script action.',
    ].join(' ')
  }

  return undefined
}

function actionInputError(action: PlaywrightAction, index: number): string | null {
  const label = 'actions[' + index + ']'
  if (action.type === 'navigate') return action.url ? null : label + '.url is required for navigate.'
  if (action.type === 'new_tab') return action.url ? null : label + '.url is required for new_tab.'
  if (action.type === 'switch_tab') return action.tab_index !== undefined ? null : label + '.tab_index is required for switch_tab.'
  if (action.type === 'fill' || action.type === 'type') return action.selector && action.text !== undefined ? null : label + '.selector and .text are required for ' + action.type + '.'
  if (action.type === 'clear' || action.type === 'click' || action.type === 'double_click' || action.type === 'hover' || action.type === 'focus' || action.type === 'check' || action.type === 'uncheck' || action.type === 'scroll_into_view' || action.type === 'count' || action.type === 'is_visible' || action.type === 'is_enabled' || action.type === 'is_checked' || action.type === 'bounding_box') return action.selector ? null : label + '.selector is required for ' + action.type + '.'
  if (action.type === 'press') return action.key ? null : label + '.key is required for press; selector is optional.'
  if (action.type === 'script') return action.script ? null : label + '.script is required for script.'
  if (action.type === 'select_option') return action.selector && action.value !== undefined ? null : label + '.selector and .value are required for select_option.'
  if (action.type === 'drag_to') return action.source_selector && action.target_selector ? null : label + '.source_selector and .target_selector are required for drag_to.'
  if (action.type === 'wait') return action.ms !== undefined ? null : label + '.ms is required for wait.'
  if (action.type === 'wait_for_selector') {
    if (!action.selector) return label + '.selector is required for wait_for_selector.'
    if (action.state && !['attached', 'detached', 'visible', 'hidden'].includes(action.state)) return label + '.state for wait_for_selector must be attached, detached, visible, or hidden.'
    return null
  }
  if (action.type === 'wait_for_load_state' && action.state && !['commit', 'domcontentloaded', 'load', 'networkidle'].includes(action.state)) return label + '.state for wait_for_load_state must be commit, domcontentloaded, load, or networkidle.'
  if (action.type === 'wait_for_url') return action.url ? null : label + '.url is required for wait_for_url.'
  if (action.type === 'scroll') return action.x !== undefined || action.y !== undefined ? null : label + '.x or .y is required for scroll.'
  if (action.type === 'get_attribute') return action.selector && action.attribute ? null : label + '.selector and .attribute are required for get_attribute.'
  return null
}

function renderedOutput(raw: Awaited<ReturnType<typeof runPlaywrightWithNodeBridge>>, startedAt: number): Output {
  const summary = summarizeRenderedPageText(raw.text)
  return {
    url: raw.url,
    title: raw.title,
    text: summary.text,
    links: raw.links,
    durationMs: Date.now() - startedAt,
    truncated: summary.truncated,
    steps: raw.steps,
    accessLimited: raw.accessLimited,
    ...(raw.screenshotPath ? { screenshotPath: raw.screenshotPath } : {}),
    ...(raw.error ? { error: raw.error } : {}),
  }
}

export const PlaywrightTool = buildTool({
  name: PLAYWRIGHT_TOOL_NAME,
  searchHint: 'perform explicit, observable Playwright browser actions on public web pages',
  maxResultSizeChars: 32_000,
  alwaysLoad: true,
  async description(input) {
    const request = input as Input
    return 'Claude wants to perform ' + request.actions.length + ' observable Playwright browser action(s) on ' + hostnameForPermission(firstTarget(request.actions))
  },
  userFacingName() { return 'Playwright browser' },
  get inputSchema() { return inputSchema },
  formatInputValidationError(input) { return unsupportedActionTypeError(input) },
  get outputSchema() { return outputSchema },
  isEnabled() { return isPlaywrightRuntimeAvailable() && isPlaywrightNodeBridgeAvailable() },
  isConcurrencySafe() { return false },
  isReadOnly() { return true },
  isSearchOrReadCommand() { return { isSearch: false, isRead: true } },
  toAutoClassifierInput(input) { return firstTarget((input as Input).actions) ?? 'Playwright browser actions' },
  async checkPermissions(input) {
    const request = input as Input
    return {
      behavior: 'ask' as const,
      message: 'Claude requested permission to perform visible Playwright browser actions on ' + hostnameForPermission(firstTarget(request.actions)) + '.',
    }
  },
  async prompt() { return getPlaywrightPrompt() },
  renderToolUseMessage(input) {
    const request = input as Input
    return 'Playwright: ' + request.actions.map((action) => action.type).join(' → ') + (request.verification_resolution ? ' (verification resolution: ' + request.verification_resolution + ')' : '')
  },
  renderToolResultMessage(output) {
    return output.error
      ? 'Playwright stopped: ' + output.error
      : 'Playwright completed ' + output.steps.filter((step) => step.outcome === 'success').length + ' browser action(s): ' + (output.title || output.url)
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    // Keep this compact trace before potentially huge extracted page text. The tool-result
    // persistence layer may replace a large payload with a short preview; placing the
    // ledger first keeps the auditable URL/action record available to Expert researchers.
    const actionLedger = '<playwright-action-ledger encoding="base64">' + Buffer.from(JSON.stringify({ url: output.url, accessLimited: output.accessLimited, error: output.error, steps: output.steps }), 'utf8').toString('base64') + '</playwright-action-ledger>'
    const sections = [
      'Playwright result',
      actionLedger,
      'Final URL: ' + output.url,
      output.title ? 'Title: ' + output.title : undefined,
      'Duration: ' + output.durationMs + 'ms',
      output.accessLimited ? 'Page state: access limited or verification page detected. This is not evidence.' : undefined,
      output.error ? 'Error: ' + output.error : undefined,
      output.screenshotPath ? 'Local screenshot path: ' + output.screenshotPath : undefined,
      'Browser action trace:\n' + output.steps.map((step) => (step.index + 1) + '. ' + step.type + ': ' + step.outcome + ' — ' + step.url + (step.detail ? ' — ' + step.detail : '')).join('\n'),
      output.text ? 'Rendered visible text:\n' + output.text : undefined,
      output.links.length > 0 ? 'Rendered links:\n' + output.links.map((link, index) => (index + 1) + '. ' + link.text + ': ' + link.url).join('\n') : 'Rendered links: none',
    ].filter((section): section is string => Boolean(section))
    return { tool_use_id: toolUseID, type: 'tool_result', content: sections.join('\n\n') }
  },
  extractSearchText(output) { return output.error ?? '' },
  async validateInput(input) {
    const request = input as Input
    for (let index = 0; index < request.actions.length; index += 1) {
      const action = request.actions[index]
      const shapeError = actionInputError(action, index)
      if (shapeError) return { result: false as const, message: shapeError, errorCode: 1 }
      if ((action.type === 'navigate' || action.type === 'new_tab') && action.url) {
        const issue = getUnsafePublicBrowserUrlReason(action.url)
        if (issue) return { result: false as const, message: 'Playwright refused this URL: ' + issue, errorCode: 1 }
      }
    }
    const cdp = resolveExpertCdpConnection()
    if (cdp.error) return { result: false as const, message: cdp.error, errorCode: 1 }
    if (!cdp.connection && !isPlaywrightRuntimeInstalled() && !isPlaywrightRuntimeAvailable()) {
      return { result: false as const, message: 'Playwright is unavailable because its managed Chromium runtime is not installed.', errorCode: 1 }
    }
    if (!isPlaywrightNodeBridgeAvailable()) {
      return { result: false as const, message: 'Playwright is unavailable because its managed Node runner is not installed.', errorCode: 1 }
    }
    return { result: true as const }
  },
  async call(input, context) {
    const request = input as Input
    const sharedExpertSessionId = sharedExpertPlaywrightSessionId()
    const preserveHumanVerificationPage = shouldPreserveExpertHumanVerificationPage()
    const managedPresentation = resolveExpertManagedPlaywrightPresentation()
    const sessionKey = resolveCurrentPlaywrightSessionKey(context)
    const activityControl = expertBrowserActivityConfig(sessionKey)
    const startedAt = Date.now()
    const screenshotPath = request.include_screenshot
      ? join(await ensurePlaywrightRuntimeDir(), 'screenshots', Date.now() + '-' + basename(firstTarget(request.actions) ?? 'page').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') + '.png')
      : undefined
    const cdp = resolveExpertCdpConnection()
    if (cdp.error) {
      return { data: { url: firstTarget(request.actions) ?? '', title: '', text: '', links: [], durationMs: Date.now() - startedAt, truncated: false, steps: [], accessLimited: false, error: cdp.error } satisfies Output }
    }
    const executablePath = cdp.connection ? undefined : resolvePlaywrightExecutablePath()
    if (!cdp.connection && !executablePath) {
      return { data: { url: firstTarget(request.actions) ?? '', title: '', text: '', links: [], durationMs: Date.now() - startedAt, truncated: false, steps: [], accessLimited: false, error: 'The managed Playwright Chromium executable is unavailable. Rebuild the desktop sidecars.' } satisfies Output }
    }
    const abortBrowserSession = () => { void closePlaywrightBrowserSession(sessionKey).catch(() => undefined) }
    context.abortController.signal.addEventListener('abort', abortBrowserSession, { once: true })
    try {
      await publishExpertBrowserActivity({
        status: 'researching',
        currentTarget: firstTarget(request.actions),
        connectionKind: cdp.connection ? 'cdp' : 'managed',
        browserKey: sessionKey,
      })
      const raw = await runPlaywrightWithNodeBridge(sessionKey, {
        ...(cdp.connection ? { connection: cdp.connection } : { executablePath }),
        actions: request.actions,
        // A package-scoped assistable background browser is headed but minimised.
        // Do not expose this runtime setting in the model's Playwright input.
        visible: managedPresentation ? true : (expertForcesVisiblePlaywright() ? true : request.visible),
        ...(managedPresentation && !cdp.connection ? { presentation: managedPresentation } : {}),
        ...(activityControl ? { activityControl: { endpoint: activityControl.endpoint.toString(), sessionId: activityControl.sessionId, ...(activityControl.browserKey ? { browserKey: activityControl.browserKey } : {}) } } : {}),
        slowMoMs: request.slow_mo_ms,
        ...(request.locale ? { locale: request.locale } : {}),
        ...(screenshotPath ? { screenshotPath } : {}),
        pageTimeoutMs: 35_000,
        networkIdleTimeoutMs: 2_500,
        maxLinks: 80,
        ...(preserveHumanVerificationPage
          ? {
              preserveHumanVerificationPage: true,
              verificationOwnerId: context.agentId ?? 'main',
              ...(request.verification_resolution ? { verificationResolution: request.verification_resolution } : {}),
            }
          : {}),
      })
      const verificationRequired = preserveHumanVerificationPage
        && typeof raw.error === 'string'
        && /EXPERT_HUMAN_VERIFICATION_(?:REQUIRED|PENDING)/.test(raw.error)
      if (verificationRequired) {
        // The Expert handoff service decides which queued verification page is
        // currently shown. Do not foreground every concurrent CAPTCHA here.
        await publishExpertBrowserActivity({
          status: 'awaiting_verification',
          currentTarget: raw.url,
          connectionKind: cdp.connection ? 'cdp' : 'managed',
          browserKey: sessionKey,
        })
      } else {
        await publishExpertBrowserActivity({
          status: raw.accessLimited ? 'access_limited' : request.verification_resolution === 'verified' ? 'resumed' : 'completed',
          currentTarget: raw.url,
          ...(!raw.accessLimited && raw.url ? { checkedTarget: raw.url } : {}),
          connectionKind: cdp.connection ? 'cdp' : 'managed',
          browserKey: sessionKey,
        })
      }
      return { data: renderedOutput(raw, startedAt) }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { data: { url: firstTarget(request.actions) ?? '', title: '', text: '', links: [], durationMs: Date.now() - startedAt, truncated: false, steps: [], accessLimited: /ACCESS_LIMITED|captcha|verification/i.test(detail), error: detail } satisfies Output }
    } finally {
      context.abortController.signal.removeEventListener('abort', abortBrowserSession)
    }
  },
})

export { PLAYWRIGHT_DESCRIPTION, PLAYWRIGHT_TOOL_NAME }
