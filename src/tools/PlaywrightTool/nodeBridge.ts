import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const PLAYWRIGHT_BROWSER_RUNNER_FILE = 'playwright-browser-runner.cjs'
export const PLAYWRIGHT_NODE_RUNNER_PATH_ENV = 'CLAUDE_PLAYWRIGHT_BROWSER_RUNNER_PATH'
export const PLAYWRIGHT_NODE_BOOTSTRAP = [
  'const runnerPath = process.env.CLAUDE_PLAYWRIGHT_BROWSER_RUNNER_PATH',
  "if (!runnerPath) throw new Error('Missing CLAUDE_PLAYWRIGHT_BROWSER_RUNNER_PATH')",
  'require(runnerPath)',
].join(';')

type PlaywrightAction = {
  type: 'navigate' | 'reload' | 'go_back' | 'go_forward' | 'new_tab' | 'list_tabs' | 'switch_tab' | 'close_tab' | 'fill' | 'type' | 'clear' | 'click' | 'double_click' | 'hover' | 'focus' | 'press' | 'select_option' | 'check' | 'uncheck' | 'drag_to' | 'wait' | 'wait_for_selector' | 'wait_for_url' | 'wait_for_load_state' | 'scroll' | 'scroll_into_view' | 'extract' | 'get_attribute' | 'get_html' | 'count' | 'is_visible' | 'is_enabled' | 'is_checked' | 'bounding_box' | 'screenshot' | 'script'
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

export type PlaywrightRunnerRequest = {
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

type PlaywrightRunnerResult = {
  url: string
  title: string
  text: string
  links: Array<{ text: string; url: string }>
  steps: Array<{ index: number; type: PlaywrightAction['type']; outcome: 'success' | 'failed'; url: string; title?: string; detail?: string; screenshotPath?: string; scriptPages?: Array<{ requestedUrl: string; finalUrl?: string; title?: string; status: 'opened' | 'access_limited' | 'failed'; detail?: string }> }>
  accessLimited: boolean
  verificationWindowPresentationConfirmed?: boolean
  verificationGateId?: string
  sharedHumanVerificationBlocked?: boolean
  accessDiagnostics?: {
    connectionKind: 'managed' | 'cdp'
    searchEngine?: 'Google' | '百度' | 'Bing' | '360'
    observedAt: string
    pacingWaitedMs?: number
    verificationKind?: string
  }
  screenshotPath?: string
  error?: string
}

type BridgeRequest =
  | { id: string; type: 'run'; sessionKey: string; request: PlaywrightRunnerRequest }
  | { id: string; type: 'close-session'; sessionKey: string }
  /**
   * Best-effort recovery for a runner request which outlived its caller.
   * The runner serializes this recovery with the same shared-context queue,
   * so it cannot close pages underneath an active sibling browser action.
   */
  | { id: string; type: 'abort-session'; sessionKey: string }
  | { id: string; type: 'present-session'; sessionKey: string; presentation: 'minimized' | 'foreground' }

type BridgeResponse = {
  id?: string
  ok: boolean
  result?: PlaywrightRunnerResult
  error?: string
}

export type PlaywrightNodeBridge = { nodeExecutable: string; runnerPath: string }
export type PlaywrightNodeBridgeInvocation = { command: string[]; env: NodeJS.ProcessEnv }

type PendingRequest = {
  resolve: (result: PlaywrightRunnerResult | undefined) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

type PersistentBridge = {
  proc: ReturnType<typeof Bun.spawn>
  pending: Map<string, PendingRequest>
  nextRequestId: number
  stderr: string
}

let persistentBridge: PersistentBridge | null = null

function isFile(path: string): boolean {
  try { return existsSync(path) && statSync(path).isFile() } catch { return false }
}

export function resolvePlaywrightNodeBridge(env: NodeJS.ProcessEnv = process.env): PlaywrightNodeBridge | null {
  const nodeExecutable = env.CLAUDE_BUNDLED_NODE_EXECUTABLE
  const runtimeDir = env.CLAUDE_BROWSER_RUNTIME_DIR
  if (!nodeExecutable || !runtimeDir) return null
  const runnerPath = join(runtimeDir, PLAYWRIGHT_BROWSER_RUNNER_FILE)
  if (!isFile(nodeExecutable) || !isFile(runnerPath)) return null
  return { nodeExecutable, runnerPath }
}

export function isPlaywrightNodeBridgeAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolvePlaywrightNodeBridge(env) !== null
}

export function normalizePlaywrightNodeRunnerPath(runnerPath: string): string {
  if (runnerPath.startsWith('\\\\?\\UNC\\')) return '\\\\' + runnerPath.slice('\\\\?\\UNC\\'.length)
  if (/^\\\\\?\\[A-Za-z]:\\/.test(runnerPath)) return runnerPath.slice(4)
  return runnerPath
}

export function createPlaywrightNodeBridgeInvocation(bridge: PlaywrightNodeBridge, env: NodeJS.ProcessEnv = process.env): PlaywrightNodeBridgeInvocation {
  return {
    command: [bridge.nodeExecutable, '--eval', PLAYWRIGHT_NODE_BOOTSTRAP],
    env: { ...env, [PLAYWRIGHT_NODE_RUNNER_PATH_ENV]: normalizePlaywrightNodeRunnerPath(bridge.runnerPath) },
  }
}

export function createPlaywrightBridgeRequest(id: string, sessionKey: string, request: PlaywrightRunnerRequest): BridgeRequest {
  return { id, type: 'run', sessionKey, request }
}

export function createPlaywrightBridgeAbortSessionRequest(id: string, sessionKey: string): BridgeRequest {
  return { id, type: 'abort-session', sessionKey }
}

function bridgeFailure(state: PersistentBridge, detail: string): void {
  for (const pending of state.pending.values()) {
    clearTimeout(pending.timeout)
    pending.reject(new Error(detail))
  }
  state.pending.clear()
}

async function consumeBridgeStream(state: PersistentBridge, stream: ReadableStream<Uint8Array> | null, kind: 'stdout' | 'stderr'): Promise<void> {
  if (!stream) return
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffered += decoder.decode(value, { stream: true })
      if (kind === 'stderr') {
        state.stderr = (state.stderr + buffered).slice(-4_000)
        // A live presentation failure must be diagnosable while the persistent
        // runner remains alive; previously stderr was visible only after exit.
        if (buffered.includes('Failed to apply browser window presentation')) {
          console.error('[Playwright bridge] ' + buffered.trim())
        }
        buffered = ''
        continue
      }
      let newline = buffered.indexOf('\n')
      while (newline >= 0) {
        const line = buffered.slice(0, newline).trim()
        buffered = buffered.slice(newline + 1)
        if (line) {
          let response: BridgeResponse
          try { response = JSON.parse(line) as BridgeResponse } catch {
            bridgeFailure(state, 'The managed Node Playwright bridge returned invalid JSON: ' + line.slice(0, 1_000))
            newline = buffered.indexOf('\n')
            continue
          }
          if (!response.id) {
            bridgeFailure(state, 'The managed Node Playwright bridge returned a response without a request id: ' + line.slice(0, 1_000))
            newline = buffered.indexOf('\n')
            continue
          }
          const pending = state.pending.get(response.id)
          if (pending) {
            state.pending.delete(response.id)
            clearTimeout(pending.timeout)
            if (!response.ok) pending.reject(new Error(response.error || 'The managed Node Playwright bridge did not return a browser result.'))
            else pending.resolve(response.result)
          }
        }
        newline = buffered.indexOf('\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function startPersistentBridge(env: NodeJS.ProcessEnv): PersistentBridge {
  const bridge = resolvePlaywrightNodeBridge(env)
  if (!bridge) throw new Error('The managed Node Playwright bridge is unavailable. Rebuild the desktop sidecars so the bundled Node runtime and Playwright browser runner are present.')
  const invocation = createPlaywrightNodeBridgeInvocation(bridge, env)
  const state: PersistentBridge = {
    proc: Bun.spawn(invocation.command, { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', env: invocation.env }),
    pending: new Map(),
    nextRequestId: 1,
    stderr: '',
  }
  // Keep the first request referenced until it completes. Once the bridge has no pending call, it is unreferenced so a completed CLI conversation can exit; closing stdin then makes the runner close its Chromium sessions.
  void consumeBridgeStream(state, state.proc.stdout, 'stdout')
  void consumeBridgeStream(state, state.proc.stderr, 'stderr')
  void state.proc.exited.then((exitCode) => {
    if (persistentBridge === state) persistentBridge = null
    bridgeFailure(state, 'The managed Node Playwright bridge exited with code ' + exitCode + ': ' + (state.stderr || 'no diagnostic output').trim().slice(0, 1_000))
  })
  return state
}

function getPersistentBridge(env: NodeJS.ProcessEnv): PersistentBridge {
  if (!persistentBridge) persistentBridge = startPersistentBridge(env)
  return persistentBridge
}

/**
 * The caller has already received a timeout. Do not await another bridge
 * request here: the original action may be holding that session's queue.
 * The runner handles abort-session outside that queue, closes only the
 * affected browser session, and lets later work reopen it cleanly.
 */
function abortTimedOutBridgeSession(state: PersistentBridge, sessionKey: string): void {
  const abortRequest = createPlaywrightBridgeAbortSessionRequest(nextRequestId(state), sessionKey)
  try {
    state.proc.stdin.write(JSON.stringify(abortRequest) + '\n')
  } catch {
    // The existing bridge exit listener handles a dead runner. The original
    // caller must still receive its timeout rather than waiting on cleanup.
  }
}

function invokeBridge<T extends PlaywrightRunnerResult | undefined>(state: PersistentBridge, request: BridgeRequest, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      state.pending.delete(request.id)
      abortTimedOutBridgeSession(state, request.sessionKey)
      reject(new Error('The managed Node Playwright bridge timed out after ' + timeoutMs + 'ms.'))
    }, timeoutMs)
    state.pending.set(request.id, { resolve: resolve as PendingRequest['resolve'], reject, timeout })
    try {
      state.proc.stdin.write(JSON.stringify(request) + '\n')
    } catch (error) {
      state.pending.delete(request.id)
      clearTimeout(timeout)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

function nextRequestId(state: PersistentBridge): string {
  return 'playwright-' + Date.now() + '-' + state.nextRequestId++
}

export async function runPlaywrightWithNodeBridge(sessionKey: string, request: PlaywrightRunnerRequest, env: NodeJS.ProcessEnv = process.env): Promise<PlaywrightRunnerResult> {
  const state = getPersistentBridge(env)
  const message = createPlaywrightBridgeRequest(nextRequestId(state), sessionKey, request)
  const result = await invokeBridge<PlaywrightRunnerResult>(state, message, Math.max(60_000, request.pageTimeoutMs * Math.max(2, request.actions.length + 1)))
  if (!result) throw new Error('The managed Node Playwright bridge did not return a browser result.')
  return result
}

/** Cancels ordinary work but never tears down a preserved human-verification tab. */
export async function abortPlaywrightBrowserSession(sessionKey: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!persistentBridge) return
  const state = persistentBridge
  const message = createPlaywrightBridgeAbortSessionRequest(nextRequestId(state), sessionKey)
  await invokeBridge<undefined>(state, message, 10_000)
}

/** Explicit session teardown for Expert exit/shutdown paths. */
export async function closePlaywrightBrowserSession(sessionKey: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!persistentBridge) return
  const state = persistentBridge
  const message: BridgeRequest = { id: nextRequestId(state), type: 'close-session', sessionKey }
  await invokeBridge<undefined>(state, message, 10_000)
}

/** Restores a managed research window or activates the current CDP tab. */
export async function presentPlaywrightBrowserSession(sessionKey: string, presentation: 'minimized' | 'foreground', env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!persistentBridge) return
  const state = persistentBridge
  const message: BridgeRequest = { id: nextRequestId(state), type: 'present-session', sessionKey, presentation }
  await invokeBridge<undefined>(state, message, 10_000)
}

export async function shutdownPlaywrightNodeBridgeForTests(): Promise<void> {
  const state = persistentBridge
  persistentBridge = null
  if (!state) return
  bridgeFailure(state, 'The managed Node Playwright bridge was shut down.')
  try { state.proc.stdin.end() } catch { /* already stopped */ }
  await state.proc.exited.catch(() => undefined)
}
