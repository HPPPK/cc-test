/**
 * ConversationService — CLI subprocess manager
 *
 * Each desktop session owns one CLI subprocess. The subprocess talks back to
 * the desktop server over the SDK WebSocket bridge, while the desktop UI talks
 * to the server over its own client WebSocket.
 */

import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ProviderService } from './providerService.js'
import { sessionService } from './sessionService.js'
import type { ExpertResearchArtifactPolicy } from './expertResearchArtifactPolicyService.js'
import { diagnosticsService } from './diagnosticsService.js'
import {
  isMaterializedWorktreeLaunch,
  prepareSessionWorkspace,
  shouldCreateWorktreeForSessionLaunch,
  type PreparedSessionWorkspace,
} from './repositoryLaunchService.js'
import {
  buildClaudeCliArgs,
  resolveBundledCliPathFromExecPath,
  resolveClaudeCliLauncher,
} from '../../utils/desktopBundledCli.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { isProviderManagedEnvVar } from '../../utils/managedEnvConstants.js'
import {
  getPlaywrightExecutablePath,
  getPlaywrightExecutablePathFromRuntimeDir,
} from '../../tools/PlaywrightTool/runtime.js'
import { findCanonicalGitRoot } from '../../utils/git.js'
import { sanitizePath } from '../../utils/path.js'
import { getProcessEnvWithTerminalShellEnvironment } from '../../utils/terminalShellEnvironment.js'
import {
  APP_DESKTOP_BUNDLE_ID,
  getAppStorageReadPaths,
  getJiangxiaEnvName,
  getLegacyJiangxiaEnvName,
  setJiangxiaEnvAliases,
} from '../../utils/appIdentity.js'

const MAX_CAPTURED_PROCESS_LINES = 80
const MAX_CAPTURED_SDK_MESSAGES = 40
const MAX_CAPTURED_SDK_SUMMARY = 20
const CONTROL_READY_POLL_MS = 50
const AUTO_MEMORY_DIRNAME = 'memory'
const RUNTIME_PROMPT_DIRECTORY_NAME = 'cc-jiangxia-runtime-prompts'

type AttachmentRef = {
  type: 'file' | 'image'
  name?: string
  path?: string
  data?: string
  mimeType?: string
  isDirectory?: boolean
}

type SessionProcess = {
  proc: ReturnType<typeof Bun.spawn>
  outputCallbacks: Array<(msg: any) => void>
  workDir: string
  permissionMode: string
  sdkToken: string
  sdkSocket: { send(data: string): void } | null
  pendingOutbound: string[]
  startupPending: boolean
  startupExitCode: number | null
  stdoutLines: string[]
  stderrLines: string[]
  outputDrain: Promise<void>
  sdkMessages: any[]
  sdkUnparsedPayloads: Array<{
    payload: string
    reason: 'invalid_sdk_websocket_record' | 'invalid_ndjson_record'
  }>
  sdkPayloadBuffer?: string
  initMessage: any | null
  expertRuntimeBindingKey?: string
  runtimePromptFilePath?: string
  pendingPermissionRequests: Map<
    string,
    {
      toolName: string
      toolUseId?: string
      input: Record<string, unknown>
      description?: string
      permissionSuggestions?: unknown[]
    }
  >
}

type SessionStartOptions = {
  permissionMode?: string
  model?: string
  effort?: string
  thinking?: 'enabled' | 'adaptive' | 'disabled'
  providerId?: string | null
  /** Generic Desktop session identity for application-wide execution receipts. */
  sessionId?: string
  disallowedTools?: string[]
  workflowSessionId?: string
  workflowSystemPrompt?: string
  expertSystemPrompt?: string
  expertRuntimeBindingKey?: string
  appendSystemPromptFile?: string
  expertSessionId?: string
  /**
   * Optional, package-scoped browser context key. Only an active Expert ZIP
   * that declares the researchBrowser policy receives this value.
   */
  expertSharedPlaywrightSessionId?: string
  /** A package-allowed, user-authorized local Chrome/Edge CDP endpoint. */
  expertPlaywrightCdpEndpoint?: string
  /** Session-scoped managed Chromium presentation; never applied to a CDP browser. */
  expertManagedPlaywrightPresentation?: 'assistable_background' | 'always_visible'
  /** Force this Expert's Playwright research window to remain visible. */
  expertForceVisiblePlaywright?: boolean
  /** Enable Desktop-owned CAPTCHA/login handoff for this package-scoped Expert session. */
  expertBrowserHumanVerificationHandoff?: boolean
  /** Package-declared ordered public search fallbacks for an explicit verification refusal. */
  expertBrowserVerificationFallbackSearchEngines?: Array<'Google' | '百度' | 'Bing' | '360'>
  /** Close this Expert's delegated-agent Playwright browser after its task reaches a terminal state. */
  expertClosePlaywrightWhenAgentDone?: boolean
  /** Remove AskUserQuestion from delegated agents only for this package-scoped session. */
  expertForbidSubagentAskUserQuestion?: boolean
  /** Give every delegated Expert agent the full tool pool currently enabled by Desktop. */
  expertFullToolAccess?: boolean
  /** Enabled only by the exact UIUX generated-image-only runtime binding. */
  uiuxImageOnlyDelivery?: boolean
  /** Final template output is rendered only by the Expert template-fill CLI. */
  expertTemplateFillWrite?: boolean
  /** Package-scoped final output root; passed only by an opted-in Expert runtime. */
  expertTemplateFillOutputRoot?: string
  /** Session-only fixed Markdown artifact allowlist declared by this Expert ZIP. */
  expertResearchArtifactPolicy?: ExpertResearchArtifactPolicy
  /** ZIP-declared final-delivery question and choice IDs for this active Expert only. */
  expertResearchDeliveryPolicy?: {
    questionId: string
    acceptedChoiceId: string
    continueChoiceIds: string[]
    pauseChoiceIds: string[]
  }
  /**
   * Host-only marker preserved when expertSystemPrompt is moved into a hidden
   * prompt file before spawning the CLI. It is never sent as a CLI argument.
   */
  expertRuntimeActive?: boolean
}

type RuntimeEnvironmentVariables = Record<string, string | null>

export async function writeSessionRuntimePromptFile(
  sessionId: string,
  content: string,
  directory = path.join(os.tmpdir(), RUNTIME_PROMPT_DIRECTORY_NAME),
): Promise<string> {
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'session'
  await fs.promises.mkdir(directory, { recursive: true })
  const filePath = path.join(directory, `${safeSessionId}-${randomUUID()}.md`)
  await fs.promises.writeFile(filePath, content, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  })
  return filePath
}

export async function removeSessionRuntimePromptFile(filePath: string | undefined): Promise<void> {
  if (!filePath) return
  try {
    await fs.promises.unlink(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[ConversationService] Failed to remove runtime prompt file: ${filePath}`)
    }
  }
}

export class ConversationStartupError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'WORKDIR_INVALID'
      | 'CLI_AUTH_REQUIRED'
      | 'CLI_SESSION_CONFLICT'
      | 'CLI_START_FAILED'
      | 'CLI_SPAWN_FAILED'
      | 'SESSION_DELETED',
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'ConversationStartupError'
  }
}

export class ConversationService {
  private sessions = new Map<string, SessionProcess>()
  private deletedSessions = new Set<string>()
  private providerService = new ProviderService()

  private buildSessionCliArgs(
    sessionId: string,
    sdkUrl: string,
    shouldResume: boolean,
    options?: SessionStartOptions,
    repository?: PreparedSessionWorkspace['repository'],
  ): string[] {
    const dangerousMode = process.env.CLAUDE_DANGEROUS_MODE === '1'
    const worktreeArgs =
      !shouldResume && repository?.worktree
        ? [
            '--worktree',
            repository.worktreeSlug || repository.worktreeBranch || repository.branch,
            '--worktree-base-ref',
            repository.baseRef,
          ]
        : []

    return this.resolveCliArgs([
      '--print',
      '--verbose',
      '--sdk-url',
      sdkUrl,
      '--enable-auth-status',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      // Desktop chat depends on partial assistant deltas; without this the
      // server only sees the completed assistant message at turn end.
      '--include-partial-messages',
      ...(shouldResume ? ['--resume', sessionId] : ['--session-id', sessionId]),
      ...worktreeArgs,
      '--replay-user-messages',
      ...this.getSystemPromptArgs(options),
      ...this.getRuntimeArgs(options),
      ...this.getDisallowedToolArgs(options?.disallowedTools),
      ...this.getPermissionArgs(options?.permissionMode, dangerousMode),
    ])
  }

  async startSession(
    sessionId: string,
    workDir: string,
    sdkUrl: string,
    options?: SessionStartOptions,
  ): Promise<void> {
    if (this.deletedSessions.has(sessionId)) {
      throw new ConversationStartupError(
        `Session was deleted before startup completed: ${sessionId}`,
        'SESSION_DELETED',
      )
    }
    if (this.sessions.has(sessionId)) return

    const launchInfo = await sessionService.getSessionLaunchInfo(sessionId)
    const shouldResume = !!launchInfo && launchInfo.transcriptMessageCount > 0
    const shouldReplacePlaceholder =
      !!launchInfo && launchInfo.transcriptMessageCount === 0
    const shouldCreateWorktree =
      !!launchInfo && shouldCreateWorktreeForSessionLaunch(launchInfo)
    const hasMaterializedWorktree =
      !!launchInfo && isMaterializedWorktreeLaunch(launchInfo)

    if (this.deletedSessions.has(sessionId)) {
      throw new ConversationStartupError(
        `Session was deleted before startup completed: ${sessionId}`,
        'SESSION_DELETED',
      )
    }

    if (!fs.existsSync(workDir) || !fs.statSync(workDir).isDirectory()) {
      throw new ConversationStartupError(
        `Working directory does not exist or is not a directory: ${workDir}`,
        'WORKDIR_INVALID',
      )
    }

    if (shouldReplacePlaceholder) {
      await sessionService.clearSessionTranscript(sessionId, workDir)
    }

    let launchWorkDir = workDir
    let launchRepository = launchInfo?.repository
    if (shouldCreateWorktree && launchRepository?.worktree) {
      launchWorkDir = launchRepository.requestedWorkDir || launchRepository.repoRoot || workDir
    } else if (!shouldResume && launchRepository && !hasMaterializedWorktree) {
      const preparedWorkspace = await prepareSessionWorkspace(
        workDir,
        {
          branch: launchRepository.branch,
          worktree: false,
        },
        sessionId,
      )
      launchWorkDir = preparedWorkspace.workDir
      launchRepository = preparedWorkspace.repository
    }

    if (!shouldCreateWorktree && launchRepository?.worktree) {
      launchRepository = {
        ...launchRepository,
        worktree: false,
      }
    }

    if (!fs.existsSync(launchWorkDir) || !fs.statSync(launchWorkDir).isDirectory()) {
      throw new ConversationStartupError(
        `Working directory does not exist or is not a directory: ${launchWorkDir}`,
        'WORKDIR_INVALID',
      )
    }

    const systemPrompt = this.getSystemPromptContent(options)
    let runtimePromptFilePath: string | undefined
    if (systemPrompt) {
      try {
        runtimePromptFilePath = await writeSessionRuntimePromptFile(sessionId, systemPrompt)
      } catch (error) {
        throw new ConversationStartupError(
          `Failed to prepare hidden runtime prompt for ${sessionId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'CLI_START_FAILED',
        )
      }
    }
    // The full Expert prompt is deliberately moved to a hidden file so it is
    // not duplicated on the CLI command line. Keep an explicit host-only
    // runtime marker: buildChildEnv still has to provision the local visual-QA
    // renderer for the same Expert process after expertSystemPrompt is cleared.
    const expertRuntimeActive = Boolean(options?.expertSystemPrompt || options?.expertSessionId)
    const launchOptions = runtimePromptFilePath
      ? {
          ...options,
          workflowSystemPrompt: undefined,
          expertSystemPrompt: undefined,
          appendSystemPromptFile: runtimePromptFilePath,
          ...(expertRuntimeActive ? { expertRuntimeActive: true } : {}),
        }
      : options
    const args = this.buildSessionCliArgs(
      sessionId,
      sdkUrl,
      shouldResume,
      launchOptions,
      launchRepository,
    )

    console.log(
      `[ConversationService] Starting CLI for ${sessionId}, cwd: ${launchWorkDir} (process.cwd()=${process.cwd()}, CALLER_DIR will be pinned to workDir)`,
    )

    // IMPORTANT (Bug#5): 必须覆盖子进程继承的 CALLER_DIR / PWD。
    // preload.ts 顶层读 process.env.CALLER_DIR 并调用 process.chdir(CALLER_DIR)。
    // 在 bundled 桌面端里，server sidecar 被 Tauri 从 cwd=/ 启动，claude-sidecar.ts
    // 在 server/cli 模式入口把 CALLER_DIR 默认设成 process.cwd()（即 '/'），
    // 随后这个 env 被完整继承到 Bun.spawn 的 CLI 子进程；即使这里显式传了
    // cwd: workDir，CLI 子进程里 preload.ts 还是会 chdir('/')，结果把
    // STATE.cwd / "Primary working directory" 打回根目录，IM 会话里 AI 感知的
    // 工作目录就变成 `/`。把 CALLER_DIR / PWD 显式覆盖成 workDir，preload.ts
    // chdir 后落到正确目录。
    //
    let childEnv: Record<string, string>
    try {
      childEnv = await this.buildChildEnv(launchWorkDir, sdkUrl, { ...(launchOptions ?? {}), sessionId })
    } catch (error) {
      await removeSessionRuntimePromptFile(runtimePromptFilePath)
      throw error
    }

    let proc: ReturnType<typeof Bun.spawn>
    try {
      proc = Bun.spawn(args, {
        cwd: launchWorkDir,
        env: childEnv,
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      })
    } catch (spawnErr) {
      await removeSessionRuntimePromptFile(runtimePromptFilePath)
      void diagnosticsService.recordEvent({
        type: 'cli_spawn_failed',
        severity: 'error',
        sessionId,
        summary: spawnErr instanceof Error ? spawnErr.message : String(spawnErr),
        details: {
          workDir,
          permissionMode: options?.permissionMode || 'default',
          providerId: options?.providerId ?? null,
          model: options?.model ?? null,
          error: spawnErr,
        },
      })
      throw new ConversationStartupError(
        `Failed to spawn CLI in ${launchWorkDir}: ${
          spawnErr instanceof Error ? spawnErr.message : String(spawnErr)
        }`,
        'CLI_SPAWN_FAILED',
      )
    }

    const session: SessionProcess = {
      proc,
      outputCallbacks: [],
      workDir: launchWorkDir,
      permissionMode: options?.permissionMode || 'default',
      sdkToken: this.getSdkTokenFromUrl(sdkUrl),
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: true,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      sdkUnparsedPayloads: [],
      initMessage: null,
      runtimePromptFilePath,
      expertRuntimeBindingKey: systemPrompt ? options?.expertRuntimeBindingKey : undefined,
      pendingPermissionRequests: new Map(),
    }
    this.sessions.set(sessionId, session)

    session.outputDrain = Promise.all([
      this.readProcessOutputStream(sessionId, proc.stdout, 'stdout'),
      this.readProcessOutputStream(sessionId, proc.stderr, 'stderr'),
    ]).then(() => undefined)

    proc.exited.then((code) => {
      void this.handleProcessExit(sessionId, proc, code)
    })

    const STARTUP_GRACE_MS = 3000
    const earlyExitCode = await Promise.race([
      proc.exited,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), STARTUP_GRACE_MS),
      ),
    ])

    const startupExitCode = earlyExitCode ?? session.startupExitCode
    if (startupExitCode !== null) {
      await this.waitForProcessOutputDrain(session)

      // A runtime/permission change can replace this process while its original
      // startup promise is still awaiting the grace period. That older promise
      // must only clean up its own prompt file: deleting by session id here
      // would erase the newer process, close its SDK socket, and surface a
      // misleading code 143 startup failure in Desktop.
      if (!this.releaseFailedStartupSession(sessionId, session)) {
        await removeSessionRuntimePromptFile(session.runtimePromptFilePath)
        return
      }

      const startupError = this.buildStartupError(sessionId, startupExitCode)
      await removeSessionRuntimePromptFile(session.runtimePromptFilePath)

      if (this.clearStaleLock(sessionId)) {
        console.log(
          `[ConversationService] Removed stale lock for ${sessionId}, retrying...`,
        )
        return this.startSession(sessionId, workDir, sdkUrl, options)
      }

      console.error(
        `[ConversationService] CLI exited with code ${startupExitCode} for ${sessionId}: ${startupError.message}`,
      )
      void diagnosticsService.recordEvent({
        type: 'cli_start_failed',
        severity: 'error',
        sessionId,
        summary: startupError.message,
        details: {
          code: startupError.code,
          exitCode: startupExitCode,
          retryable: startupError.retryable,
          workDir: launchWorkDir,
          permissionMode: options?.permissionMode || 'default',
          providerId: options?.providerId ?? null,
          model: options?.model ?? null,
          capturedOutput: this.buildCapturedProcessOutputDetail(session),
          sdkMessages: this.summarizeSdkMessages(session.sdkMessages),
        },
      })
      throw startupError
    }

    session.startupPending = false

    if (shouldReplacePlaceholder || !launchInfo) {
      await sessionService.appendSessionMetadata(sessionId, {
        workDir: launchWorkDir,
        customTitle: launchInfo?.customTitle ?? null,
        repository: launchRepository,
      })
    }

    console.log(`[ConversationService] CLI started successfully for ${sessionId}`)
  }

  onOutput(sessionId: string, callback: (msg: any) => void): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.outputCallbacks.push(callback)
    }
  }

  clearOutputCallbacks(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.outputCallbacks = []
    }
  }

  removeOutputCallback(sessionId: string, callback: (msg: any) => void): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.outputCallbacks = session.outputCallbacks.filter((entry) => entry !== callback)
  }

  getRecentSdkMessages(sessionId: string): any[] {
    return [...(this.sessions.get(sessionId)?.sdkMessages ?? [])]
  }

  getSessionExpertRuntimeBindingKey(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.expertRuntimeBindingKey
  }

  getSessionInitMessage(sessionId: string): any | null {
    return this.sessions.get(sessionId)?.initMessage ?? null
  }

  sendMessage(
    sessionId: string,
    content: string,
    attachments?: AttachmentRef[],
  ): boolean {
    return this.sendSdkMessage(sessionId, {
      type: 'user',
      message: {
        role: 'user',
        content: this.buildUserContent(content, sessionId, attachments),
      },
      parent_tool_use_id: null,
      session_id: '',
    })
  }

  sendInternalMessage(
    sessionId: string,
    content: string,
  ): boolean {
    return this.sendSdkMessage(sessionId, {
      type: 'user',
      message: {
        role: 'user',
        content: this.buildUserContent(content, sessionId),
      },
      parent_tool_use_id: null,
      session_id: '',
      isSynthetic: true,
    })
  }

  respondToPermission(
    sessionId: string,
    requestId: string,
    allowed: boolean,
    rule?: string,
    updatedInput?: Record<string, unknown>,
    denialMessage = 'User denied via UI',
  ): boolean {
    const session = this.sessions.get(sessionId)
    const pendingRequest = session?.pendingPermissionRequests.get(requestId)
    if (session) {
      session.pendingPermissionRequests.delete(requestId)
    }

    return this.sendSdkMessage(sessionId, {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: allowed
          ? {
              behavior: 'allow',
              updatedInput: updatedInput ?? {},
              ...(rule === 'always' && pendingRequest
                ? {
                    updatedPermissions: [
                      ...normalizeSessionPermissionUpdates(
                        pendingRequest.permissionSuggestions,
                        pendingRequest.toolName,
                      ),
                    ],
                  }
                : {}),
            }
          : { behavior: 'deny', message: denialMessage },
      },
    })
  }

  setPermissionMode(sessionId: string, mode: string): boolean {
    return this.sendSdkMessage(sessionId, {
      type: 'control_request',
      request_id: crypto.randomUUID(),
      request: {
        subtype: 'set_permission_mode',
        mode,
      },
    })
  }

  setMaxThinkingTokens(sessionId: string, maxThinkingTokens: number | null): boolean {
    return this.sendSdkMessage(sessionId, {
      type: 'control_request',
      request_id: crypto.randomUUID(),
      request: {
        subtype: 'set_max_thinking_tokens',
        max_thinking_tokens: maxThinkingTokens,
      },
    })
  }

  setMaxThinkingTokensForActiveSessions(maxThinkingTokens: number | null): number {
    let sent = 0
    for (const sessionId of this.getActiveSessions()) {
      if (this.setMaxThinkingTokens(sessionId, maxThinkingTokens)) {
        sent += 1
      }
    }
    return sent
  }

  updateEnvironmentVariables(
    sessionId: string,
    variables: RuntimeEnvironmentVariables,
  ): boolean {
    if (Object.keys(variables).length === 0) return false
    return this.sendSdkMessage(sessionId, {
      type: 'update_environment_variables',
      variables,
    })
  }

  getPendingPermissionRequests(sessionId: string): Array<{
    requestId: string
    toolName: string
    toolUseId?: string
    input: Record<string, unknown>
    description?: string
  }> {
    const session = this.sessions.get(sessionId)
    if (!session) return []
    return [...session.pendingPermissionRequests.entries()].map(
      ([requestId, request]) => ({
        requestId,
        toolName: request.toolName,
        ...(request.toolUseId ? { toolUseId: request.toolUseId } : {}),
        input: request.input,
        ...(request.description ? { description: request.description } : {}),
      }),
    )
  }

  updateEnvironmentVariablesForActiveSessions(
    variables: RuntimeEnvironmentVariables,
  ): number {
    if (Object.keys(variables).length === 0) return 0
    let sent = 0
    for (const sessionId of this.getActiveSessions()) {
      if (this.updateEnvironmentVariables(sessionId, variables)) {
        sent += 1
      }
    }
    return sent
  }

  sendInterrupt(sessionId: string): boolean {
    return this.sendSdkMessage(sessionId, {
      type: 'control_request',
      request_id: crypto.randomUUID(),
      request: { subtype: 'interrupt' },
    })
  }

  private isControlChannelReady(session: SessionProcess): boolean {
    return Boolean(session.sdkSocket)
  }

  private async waitForControlChannelReady(
    sessionId: string,
    timeoutMs: number,
  ): Promise<void> {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const session = this.sessions.get(sessionId)
      if (!session) {
        throw new Error('CLI session is not running')
      }
      if (this.isControlChannelReady(session)) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, CONTROL_READY_POLL_MS))
    }

    throw new Error('Timed out waiting for CLI control channel to become ready')
  }

  async requestControl(
    sessionId: string,
    request: Record<string, unknown>,
    timeoutMs = 10_000,
  ): Promise<Record<string, unknown>> {
    if (!this.sessions.has(sessionId)) {
      return Promise.reject(new Error('CLI session is not running'))
    }

    const startedAt = Date.now()
    await this.waitForControlChannelReady(sessionId, timeoutMs)
    const responseTimeoutMs = Math.max(1, timeoutMs - (Date.now() - startedAt))
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeOutputCallback(sessionId, handleOutput)
        reject(new Error(`Timed out waiting for ${String(request.subtype ?? 'control')} response`))
      }, responseTimeoutMs)

      const finish = (fn: () => void) => {
        clearTimeout(timeout)
        this.removeOutputCallback(sessionId, handleOutput)
        fn()
      }

      const handleOutput = (msg: any) => {
        if (
          msg?.type !== 'control_response' ||
          msg.response?.request_id !== requestId
        ) {
          return
        }

        if (msg.response.subtype === 'error') {
          finish(() => reject(new Error(String(msg.response.error || 'Control request failed'))))
          return
        }

        finish(() => resolve(
          msg.response.response && typeof msg.response.response === 'object'
            ? msg.response.response as Record<string, unknown>
            : {},
        ))
      }

      this.onOutput(sessionId, handleOutput)
      const sent = this.sendSdkMessage(sessionId, {
        type: 'control_request',
        request_id: requestId,
        request,
      })
      if (!sent) {
        finish(() => reject(new Error('CLI session is not running')))
      }
    })
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  getSessionProcessToken(sessionId: string): object | null {
    return this.sessions.get(sessionId)?.proc ?? null
  }

  stopSessionIfCurrent(sessionId: string, processToken: object | null): boolean {
    if (!processToken) return false
    const session = this.sessions.get(sessionId)
    if (!session || session.proc !== processToken) return false
    this.stopSession(sessionId)
    return true
  }

  getSessionWorkDir(sessionId: string): string {
    const session = this.sessions.get(sessionId)
    return session?.workDir || ''
  }

  updateSessionWorkDir(sessionId: string, workDir: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || !workDir.trim()) return
    session.workDir = workDir
  }

  getSessionPermissionMode(sessionId: string): string {
    const session = this.sessions.get(sessionId)
    return session?.permissionMode || 'default'
  }

  authorizeSdkConnection(
    sessionId: string,
    token: string | null | undefined,
  ): boolean {
    return this.getSdkConnectionAuthStatus(sessionId, token).authorized
  }

  getSdkConnectionAuthStatus(
    sessionId: string,
    token: string | null | undefined,
  ): {
    authorized: boolean
    reason: 'authorized' | 'session-missing' | 'token-missing' | 'token-mismatch'
  } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { authorized: false, reason: 'session-missing' }
    }
    if (!token) {
      return { authorized: false, reason: 'token-missing' }
    }
    if (token !== session.sdkToken) {
      return { authorized: false, reason: 'token-mismatch' }
    }
    return { authorized: true, reason: 'authorized' }
  }

  attachSdkConnection(
    sessionId: string,
    socket: { send(data: string): void },
  ): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    session.sdkSocket = socket
    while (session.pendingOutbound.length > 0) {
      const line = session.pendingOutbound.shift()
      if (line) {
        socket.send(line)
      }
    }
    return true
  }

  detachSdkConnection(
    sessionId: string,
    socket?: { send(data: string): void },
  ): void {
    const session = this.sessions.get(sessionId)
    if (session && (!socket || session.sdkSocket === socket)) {
      session.sdkSocket = null
    }
  }

  handleSdkPayload(sessionId: string, rawPayload: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || !rawPayload) return

    const emit = (msg: any): void => {
      session.sdkMessages.push(msg)
      if (session.sdkMessages.length > MAX_CAPTURED_SDK_MESSAGES) {
        session.sdkMessages.splice(0, session.sdkMessages.length - MAX_CAPTURED_SDK_MESSAGES)
      }
      const sdkError = this.extractSdkErrorEvent(msg)
      if (sdkError) {
        void diagnosticsService.recordEvent({
          type: sdkError.type,
          severity: 'error',
          sessionId,
          summary: sdkError.summary,
          details: sdkError.details,
        })
      }
      if (msg?.type === 'system' && msg.subtype === 'init') {
        session.initMessage = msg
      }
      if (msg?.type === 'control_request' && msg.request?.subtype === 'can_use_tool') {
        const requestId = typeof msg.request_id === 'string' ? msg.request_id : undefined
        if (requestId) {
          session.pendingPermissionRequests.set(requestId, {
            toolName: typeof msg.request.tool_name === 'string'
              ? msg.request.tool_name
              : 'Unknown',
            toolUseId: typeof msg.request.tool_use_id === 'string'
              ? msg.request.tool_use_id
              : undefined,
            input:
              msg.request.input && typeof msg.request.input === 'object'
                ? (msg.request.input as Record<string, unknown>)
                : {},
            ...(typeof msg.request.description === 'string'
              ? { description: msg.request.description }
              : {}),
            permissionSuggestions: Array.isArray(msg.request.permission_suggestions)
              ? msg.request.permission_suggestions
              : undefined,
          })
        }
      }
      for (const cb of session.outputCallbacks) {
        cb(msg)
      }
    }

    const quarantine = (
      payload: string,
      reason: 'invalid_sdk_websocket_record' | 'invalid_ndjson_record',
    ): void => {
      if (!payload) return
      const unparsedPayloads = session.sdkUnparsedPayloads ?? (session.sdkUnparsedPayloads = [])
      unparsedPayloads.push({ payload, reason })
      void diagnosticsService.recordEvent({
        type: 'sdk_transport_unparsed_record',
        severity: 'warn',
        sessionId,
        summary: 'Preserved an unparsed SDK transport record',
        details: {
          reason,
          characterCount: payload.length,
          lineBreakCount: (payload.match(/\n/g) ?? []).length,
          retainedInSession: true,
        },
      })
    }

    const tryParseAndEmit = (payload: string): boolean => {
      try {
        emit(JSON.parse(payload))
        return true
      } catch {
        return false
      }
    }

    // The sidecar forwards `--output-format stream-json` as NDJSON. A
    // WebSocket callback may end in the middle of one NDJSON record, so retain
    // that suffix until its newline delimiter arrives. Do not invent JSON
    // boundaries with brace matching: only an actual newline ends a record.
    const pending = session.sdkPayloadBuffer ?? ''
    if (!pending && tryParseAndEmit(rawPayload)) return

    // A complete JSON WebSocket record after an unterminated opaque fragment is
    // a proven application boundary. Preserve the fragment, then let the later
    // terminal result/tool event reach the normal event pipeline.
    if (pending && tryParseAndEmit(rawPayload)) {
      session.sdkPayloadBuffer = ''
      quarantine(pending, 'invalid_sdk_websocket_record')
      return
    }

    const records = (pending + rawPayload).split('\n')
    session.sdkPayloadBuffer = records.pop() ?? ''
    for (const line of records) {
      const record = line.endsWith('\r') ? line.slice(0, -1) : line
      if (!record.trim()) continue
      if (!tryParseAndEmit(record)) {
        quarantine(record, 'invalid_ndjson_record')
      }
    }
  }
  private releaseFailedStartupSession(
    sessionId: string,
    session: SessionProcess,
  ): boolean {
    if (this.sessions.get(sessionId) !== session) return false
    this.sessions.delete(sessionId)
    return true
  }

  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.proc.kill()
      this.sessions.delete(sessionId)
      void removeSessionRuntimePromptFile(session.runtimePromptFilePath)
    }
  }

  async stopSessionAndWait(sessionId: string, timeoutMs = 2_000): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    this.sessions.delete(sessionId)
    session.proc.kill()

    await Promise.race([
      session.proc.exited.catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ])
    await this.waitForProcessOutputDrain(session, timeoutMs)
    await removeSessionRuntimePromptFile(session.runtimePromptFilePath)
  }

  markSessionDeleted(sessionId: string): void {
    this.deletedSessions.add(sessionId)
    this.stopSession(sessionId)
  }

  markSessionsDeleted(sessionIds: string[]): void {
    for (const sessionId of sessionIds) {
      this.markSessionDeleted(sessionId)
    }
  }

  unmarkSessionDeleted(sessionId: string): void {
    this.deletedSessions.delete(sessionId)
  }

  unmarkSessionsDeleted(sessionIds: string[]): void {
    for (const sessionId of sessionIds) {
      this.unmarkSessionDeleted(sessionId)
    }
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys())
  }

  private async readProcessOutputStream(
    sessionId: string,
    stream: ReadableStream | null | undefined,
    streamName: 'stdout' | 'stderr',
  ): Promise<void> {
    if (!stream) return

    const reader = stream.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        if (!text.trim()) continue

        const session = this.sessions.get(sessionId)
        if (session) {
          for (const line of text
            .split('\n')
            .map((entry) => entry.trim())
            .filter(Boolean)) {
            const lines =
              streamName === 'stderr' ? session.stderrLines : session.stdoutLines
            lines.push(this.redactProcessOutput(line))
            if (lines.length > MAX_CAPTURED_PROCESS_LINES) {
              lines.splice(0, lines.length - MAX_CAPTURED_PROCESS_LINES)
            }
          }
        }

        const logLine = this.redactProcessOutput(text.trim())
        if (streamName === 'stderr') {
          console.error(`[CLI:${sessionId}:stderr] ${logLine}`)
        } else {
          console.log(`[CLI:${sessionId}:stdout] ${logLine}`)
        }
      }
    } catch {
      // Process output read failures should not kill the session.
    }
  }

  private async waitForProcessOutputDrain(
    session: SessionProcess,
    timeoutMs = 250,
  ): Promise<void> {
    const outputDrain = session.outputDrain ?? Promise.resolve()
    await Promise.race([
      outputDrain.catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  }

  private sendSdkMessage(
    sessionId: string,
    payload: Record<string, unknown>,
  ): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    const line = JSON.stringify(payload) + '\n'
    if (session.sdkSocket) {
      session.sdkSocket.send(line)
    } else {
      session.pendingOutbound.push(line)
    }
    return true
  }

  private async handleProcessExit(
    sessionId: string,
    proc: SessionProcess['proc'],
    code: number,
  ): Promise<void> {
    console.log(
      `[ConversationService] CLI process for ${sessionId} exited with code ${code}`,
    )

    const activeSession = this.sessions.get(sessionId)
    if (activeSession?.proc === proc) {
      if (activeSession.startupPending) {
        activeSession.startupExitCode = code
        return
      }
      await this.waitForProcessOutputDrain(activeSession)
      const exitError = this.buildRuntimeExitMessage(sessionId, code)
      void diagnosticsService.recordEvent({
        type: 'cli_runtime_exit',
        severity: 'error',
        sessionId,
        summary: exitError,
        details: {
          exitCode: code,
          workDir: activeSession.workDir,
          permissionMode: activeSession.permissionMode,
          capturedOutput: this.buildCapturedProcessOutputDetail(activeSession),
          sdkMessages: this.summarizeSdkMessages(activeSession.sdkMessages),
        },
      })
      for (const cb of activeSession.outputCallbacks) {
        cb({
          type: 'result',
          subtype: 'error',
          is_error: true,
          result: exitError,
          usage: { input_tokens: 0, output_tokens: 0 },
          session_id: sessionId,
        })
      }
      this.sessions.delete(sessionId)
      await removeSessionRuntimePromptFile(activeSession.runtimePromptFilePath)
    }
  }

  private getPermissionArgs(
    mode: string | undefined,
    dangerousMode: boolean,
  ): string[] {
    if (dangerousMode) {
      return ['--dangerously-skip-permissions']
    }

    const resolvedMode = mode || 'default'
    if (resolvedMode === 'bypassPermissions') {
      return ['--dangerously-skip-permissions']
    }

    const args = ['--permission-mode', resolvedMode]
    return args
  }

  private getSystemPromptContent(options: SessionStartOptions | undefined): string | null {
    const prompts = [options?.workflowSystemPrompt, options?.expertSystemPrompt]
      .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.trim().length > 0)
    return prompts.length > 0 ? prompts.join('\n\n') : null
  }

  private getSystemPromptArgs(options: SessionStartOptions | undefined): string[] {
    if (options?.appendSystemPromptFile) {
      return ['--append-system-prompt-file', options.appendSystemPromptFile]
    }
    const prompt = this.getSystemPromptContent(options)
    return prompt ? ['--append-system-prompt', prompt] : []
  }

  private getRuntimeArgs(options: SessionStartOptions | undefined): string[] {
    const args: string[] = []

    if (options?.model) {
      args.push('--model', options.model)
    }

    if (options?.effort) {
      args.push('--effort', options.effort)
    }

    if (options?.thinking) {
      args.push('--thinking', options.thinking)
    }

    return args
  }

  private getDisallowedToolArgs(disallowedTools: string[] | undefined): string[] {
    const uniqueTools = Array.from(new Set(
      (disallowedTools ?? [])
        .map((tool) => tool.trim())
        .filter(Boolean),
    ))
    if (uniqueTools.length === 0) return []
    return ['--disallowed-tools', uniqueTools.join(',')]
  }

  private async buildChildEnv(
    workDir: string,
    sdkUrl?: string,
    options?: SessionStartOptions,
  ): Promise<Record<string, string>> {
    // Provider isolation: when Desktop has its own provider config/index,
    // strip inherited provider env vars so the child CLI reads fresh values
    // from ~/.claude/cc-jiangxia/settings.json instead of stale process.env.
    //
    // If the user never configured a Desktop provider and only launched the
    // app/server with ANTHROPIC_* env vars, keep those env vars so Windows
    // dev-mode and env-only setups can still authenticate successfully.
    const PROVIDER_ENV_KEYS = [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
      'CC_JIANGXIA_SEND_DISABLED_THINKING',
      'CC_HAHA_SEND_DISABLED_THINKING',
      'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
      'CLAUDE_CODE_MODEL_CONTEXT_WINDOWS',
    ] as const

    const cleanEnv = await getProcessEnvWithTerminalShellEnvironment()
    delete cleanEnv.CLAUDE_CODE_OAUTH_TOKEN
    delete cleanEnv.CC_JIANGXIA_SESSION_ID
    delete cleanEnv.CC_HAHA_SESSION_ID
    delete cleanEnv.CC_JIANGXIA_WORKFLOW_SESSION_ID
    delete cleanEnv.CC_HAHA_WORKFLOW_SESSION_ID
    delete cleanEnv.CC_JIANGXIA_EXPERT_OUTPUT_TEMPLATE_GUARD
    delete cleanEnv.CC_HAHA_EXPERT_OUTPUT_TEMPLATE_GUARD
    delete cleanEnv.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
    delete cleanEnv.CC_HAHA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
    delete cleanEnv.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY
    delete cleanEnv.CC_HAHA_EXPERT_RESEARCH_ARTIFACT_POLICY
    delete cleanEnv.CC_JIANGXIA_EXPERT_SESSION_ID
    delete cleanEnv.CC_HAHA_EXPERT_SESSION_ID
    delete cleanEnv.CC_JIANGXIA_EXPERT_SHARED_PLAYWRIGHT_SESSION_ID
    delete cleanEnv.CC_HAHA_EXPERT_SHARED_PLAYWRIGHT_SESSION_ID
    delete cleanEnv.CC_JIANGXIA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT
    delete cleanEnv.CC_HAHA_EXPERT_PLAYWRIGHT_CDP_ENDPOINT
    delete cleanEnv.CC_JIANGXIA_EXPERT_FORCE_VISIBLE_PLAYWRIGHT
    delete cleanEnv.CC_HAHA_EXPERT_FORCE_VISIBLE_PLAYWRIGHT
    delete cleanEnv.CC_JIANGXIA_EXPERT_MANAGED_PLAYWRIGHT_PRESENTATION
    delete cleanEnv.CC_HAHA_EXPERT_MANAGED_PLAYWRIGHT_PRESENTATION
    delete cleanEnv.CC_JIANGXIA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF
    delete cleanEnv.CC_HAHA_EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF
    delete cleanEnv.CC_JIANGXIA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES
    delete cleanEnv.CC_HAHA_EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES
    delete cleanEnv.CC_JIANGXIA_EXPERT_CLOSE_PLAYWRIGHT_WHEN_AGENT_DONE
    delete cleanEnv.CC_HAHA_EXPERT_CLOSE_PLAYWRIGHT_WHEN_AGENT_DONE
    delete cleanEnv.CC_JIANGXIA_EXPERT_FORBID_SUBAGENT_ASK_USER_QUESTION
    delete cleanEnv.CC_HAHA_EXPERT_FORBID_SUBAGENT_ASK_USER_QUESTION
    delete cleanEnv.CC_JIANGXIA_EXPERT_FULL_TOOL_ACCESS
    delete cleanEnv.CC_HAHA_EXPERT_FULL_TOOL_ACCESS
    delete cleanEnv.CC_JIANGXIA_UIUX_IMAGE_ONLY_DELIVERY
    delete cleanEnv.CC_HAHA_UIUX_IMAGE_ONLY_DELIVERY
    delete cleanEnv.CC_JIANGXIA_EXPERT_RESEARCH_DELIVERY_POLICY
    delete cleanEnv.CC_HAHA_EXPERT_RESEARCH_DELIVERY_POLICY
    // The desktop server binds image requests to this session-scoped Provider.
    // Never inherit a stale binding when a child process is resumed or reused.
    delete cleanEnv.CC_JIANGXIA_PROVIDER_ID
    delete cleanEnv.CC_HAHA_PROVIDER_ID
    // Workflow sessions persist their final handoff in <workspace>/.workflow.
    // Never inherit or inject the global auto-memory override here: it prompts
    // the CLI to write ~/.claude/projects/.../memory/MEMORY.md, which is
    // intentionally outside a workflow phase's artifact-only write boundary.
    delete cleanEnv.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE
    if (this.shouldStripInheritedProviderEnv(options?.providerId)) {
      // Explicit Desktop provider routing must also defeat the CLI's alternate
      // cloud-provider selectors. A stale Azure/Foundry/Bedrock/Vertex setting
      // would otherwise bypass ANTHROPIC_BASE_URL and make the child connect to
      // an unrelated endpoint before it reaches the local Provider proxy.
      for (const key of Object.keys(cleanEnv)) {
        if (isProviderManagedEnvVar(key) || PROVIDER_ENV_KEYS.includes(key.toUpperCase())) {
          delete cleanEnv[key]
        }
      }
    }

    let desktopServerUrl: string | undefined
    if (sdkUrl) {
      try {
        const parsed = new URL(sdkUrl)
        desktopServerUrl = `http://${parsed.host}`
      } catch {
        desktopServerUrl = undefined
      }
    }

    const explicitProviderEnv =
      typeof options?.providerId === 'string'
        ? await this.providerService.getProviderRuntimeEnv(options.providerId)
        : null
    if (explicitProviderEnv && options?.model?.trim()) {
      explicitProviderEnv.ANTHROPIC_MODEL = options.model.trim()
    }
    // Keep all alternate CLI provider transports explicitly off. These keys
    // must be present (rather than merely absent) so settings loaded later by
    // the child CLI cannot re-enable an unrelated cloud-provider transport.
    const managedProviderRouteGuards = explicitProviderEnv
      ? {
          CLAUDE_CODE_USE_BEDROCK: '0',
          CLAUDE_CODE_USE_VERTEX: '0',
          CLAUDE_CODE_USE_FOUNDRY: '0',
          CLAUDE_CODE_USE_AZURE_OPENAI: '0',
        }
      : {}
    const shouldUseOfficialManagedOAuth = this.shouldMarkManagedOAuth(options?.providerId)
    const officialOAuthEnv = shouldUseOfficialManagedOAuth
      ? await this.buildOfficialOAuthEnv()
      : {}

    const cliDiagnosticsPath = diagnosticsService.getCliDiagnosticsPath()
    try {
      fs.mkdirSync(path.dirname(cliDiagnosticsPath), { recursive: true })
    } catch {
      // Diagnostics must never block session startup.
    }

    // The server sidecar receives these portable paths from Tauri, but the
    // terminal-shell environment intentionally does not retain sidecar-only
    // variables. Forward them explicitly to every Desktop CLI session so the
    // generic Playwright tool is enabled outside Expert mode too.
    const bundledBrowserRuntimeDir = process.env.CLAUDE_BROWSER_RUNTIME_DIR?.trim()
    const bundledNodeExecutable = process.env.CLAUDE_BUNDLED_NODE_EXECUTABLE?.trim()

    const childEnv: Record<string, string> = {
      ...cleanEnv,
      ...(bundledBrowserRuntimeDir
        ? { CLAUDE_BROWSER_RUNTIME_DIR: bundledBrowserRuntimeDir }
        : {}),
      ...(bundledNodeExecutable
        ? { CLAUDE_BUNDLED_NODE_EXECUTABLE: bundledNodeExecutable }
        : {}),
      CLAUDE_CODE_ENABLE_TASKS: '1',
      CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1',
      CLAUDE_CODE_DIAGNOSTICS_FILE: cliDiagnosticsPath,
      // Ordinary and Expert sessions keep their project-scoped auto-memory.
      // A Workflow's durable handoff must stay in its .workflow artifacts.
      ...(options?.workflowSessionId
        ? {}
        : { CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: this.resolveDesktopAutoMemoryPath(workDir) }),
      CALLER_DIR: workDir,
      PWD: workDir,
      // Tell the CLI entrypoint to skip project .env loading. Provider env
      // should come from Desktop-managed config or inherited launch env, not
      // be reintroduced from the repo's .env file.
      ...(explicitProviderEnv
        ? {
            CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
            ...managedProviderRouteGuards,
          }
        : {}),
      // "官方" 模式 (cc-jiangxia/settings.json 没 provider env) 下,把 CLI 标记为
      // managed-OAuth,让它忽略外部 ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
      // 残留、只走用户 /login 的 OAuth token。自定义 provider 模式绝不能设,
      // 否则 CLI 会忽略 provider 的 AUTH_TOKEN、错误地走 OAuth 打到第三方
      // endpoint。详见 src/utils/auth.ts isManagedOAuthContext()。
      ...(shouldUseOfficialManagedOAuth
        ? { CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1' }
        : {}),
      ...(explicitProviderEnv ?? {}),
      ...officialOAuthEnv,
    }

    setJiangxiaEnvAliases(childEnv, 'SKIP_DOTENV', '1')
    if (typeof options?.sessionId === 'string' && options.sessionId.trim()) {
      // Generic session identity lets every built-in tool produce real receipts,
      // rather than making observability an Expert-only privilege.
      setJiangxiaEnvAliases(childEnv, 'SESSION_ID', options.sessionId.trim())
      setJiangxiaEnvAliases(childEnv, 'AGENT_RUN_LEDGER_ENABLED', '1')
    }
    if (typeof options?.providerId === 'string' && options.providerId.trim()) {
      // Non-secret session routing only. The image tool forwards this opaque id
      // to the desktop server, which resolves the saved credential itself.
      setJiangxiaEnvAliases(childEnv, 'PROVIDER_ID', options.providerId.trim())
    }
    if (sdkUrl) {
      setJiangxiaEnvAliases(childEnv, 'COMPUTER_USE_HOST_BUNDLE_ID', APP_DESKTOP_BUNDLE_ID)
      setJiangxiaEnvAliases(childEnv, 'DESKTOP_AWAIT_MCP', '1')
      setJiangxiaEnvAliases(childEnv, 'DESKTOP_AWAIT_MCP_TIMEOUT_MS', '5000')
      if (options?.workflowSessionId) {
        setJiangxiaEnvAliases(childEnv, 'WORKFLOW_SESSION_ID', options.workflowSessionId)
      }
      // A Playwright-installed Chromium is also the approved local
      // visual-QA renderer for Expert HTML. This applies to every active Expert
      // runtime, not only template-fill Experts: UIUX redesign packs use the
      // normal Expert output protocol and still must render their QA screenshots.
      // The sidecar's browser runtime is injected into process.env by Tauri,
      // but terminal-shell environment collection intentionally does not inherit
      // all sidecar-only variables. Prefer an installed user runtime, then fall
      // back to that bundled runtime explicitly before passing it to the CLI.
      if (options?.expertRuntimeActive || options?.expertSystemPrompt || options?.expertSessionId) {
        const bundledBrowserRuntimeDir = process.env.CLAUDE_BROWSER_RUNTIME_DIR
        const visualQaBrowserExecutable = getPlaywrightExecutablePath()
          ?? (bundledBrowserRuntimeDir
            ? getPlaywrightExecutablePathFromRuntimeDir(bundledBrowserRuntimeDir)
            : null)
        if (visualQaBrowserExecutable) {
          setJiangxiaEnvAliases(childEnv, 'VISUAL_QA_BROWSER_EXECUTABLE', visualQaBrowserExecutable)
        }
      }

      if (options?.expertSharedPlaywrightSessionId) {
        setJiangxiaEnvAliases(
          childEnv,
          'EXPERT_SHARED_PLAYWRIGHT_SESSION_ID',
          options.expertSharedPlaywrightSessionId,
        )
      }
      if (options?.expertPlaywrightCdpEndpoint) {
        setJiangxiaEnvAliases(
          childEnv,
          'EXPERT_PLAYWRIGHT_CDP_ENDPOINT',
          options.expertPlaywrightCdpEndpoint,
        )
      }
      if (options?.expertManagedPlaywrightPresentation) {
        setJiangxiaEnvAliases(childEnv, 'EXPERT_MANAGED_PLAYWRIGHT_PRESENTATION', options.expertManagedPlaywrightPresentation)
      }
      if (options?.expertForceVisiblePlaywright) {
        setJiangxiaEnvAliases(childEnv, 'EXPERT_FORCE_VISIBLE_PLAYWRIGHT', '1')
      }
      if (options?.expertBrowserHumanVerificationHandoff) {
        setJiangxiaEnvAliases(childEnv, 'EXPERT_BROWSER_HUMAN_VERIFICATION_HANDOFF', '1')
      }
      if (options?.expertBrowserVerificationFallbackSearchEngines?.length) {
        setJiangxiaEnvAliases(
          childEnv,
          'EXPERT_BROWSER_VERIFICATION_FALLBACK_ENGINES',
          JSON.stringify(options.expertBrowserVerificationFallbackSearchEngines),
        )
      }
      if (options?.expertBrowserSearchPacing) {
        setJiangxiaEnvAliases(childEnv, 'EXPERT_BROWSER_SEARCH_PACING', '1')
        setJiangxiaEnvAliases(childEnv, 'EXPERT_BROWSER_SEARCH_MIN_INTERVAL_MS', String(options.expertBrowserSearchPacing.minIntervalMs))
      }
      if (options?.expertClosePlaywrightWhenAgentDone) {
        setJiangxiaEnvAliases(childEnv, 'EXPERT_CLOSE_PLAYWRIGHT_WHEN_AGENT_DONE', '1')
      }
      if (options?.expertForbidSubagentAskUserQuestion) {
        setJiangxiaEnvAliases(childEnv, 'EXPERT_FORBID_SUBAGENT_ASK_USER_QUESTION', '1')
      }
      if (options?.uiuxImageOnlyDelivery) {
        setJiangxiaEnvAliases(childEnv, 'UIUX_IMAGE_ONLY_DELIVERY', '1')
      }
      if (options?.expertFullToolAccess) {
        setJiangxiaEnvAliases(childEnv, 'EXPERT_FULL_TOOL_ACCESS', '1')
      }

      if (options?.expertSessionId) {
        setJiangxiaEnvAliases(childEnv, 'EXPERT_SESSION_ID', options.expertSessionId)
        if (options.expertTemplateFillWrite) {
          setJiangxiaEnvAliases(childEnv, 'EXPERT_TEMPLATE_FILL_WRITE', '1')
        }
        if (options.expertTemplateFillOutputRoot) {
          setJiangxiaEnvAliases(childEnv, 'EXPERT_TEMPLATE_FILL_OUTPUT_ROOT', options.expertTemplateFillOutputRoot)
        }
        if (options.expertResearchArtifactPolicy) {
          setJiangxiaEnvAliases(
            childEnv,
            'EXPERT_RESEARCH_ARTIFACT_POLICY',
            JSON.stringify(options.expertResearchArtifactPolicy),
          )
        }
        if (options.expertResearchDeliveryPolicy) {
          setJiangxiaEnvAliases(
            childEnv,
            'EXPERT_RESEARCH_DELIVERY_POLICY',
            JSON.stringify(options.expertResearchDeliveryPolicy),
          )
        }

        // Final Expert template filling must re-enter this application's CLI,
        // not an unrelated claude executable inherited from PATH. A packaged
        // desktop sidecar is discovered from the running executable, so these
        // values remain portable across user installations and dev paths.
        const bundledCliPath = resolveBundledCliPathFromExecPath()
        if (bundledCliPath) {
          childEnv.CLAUDE_CLI_PATH = bundledCliPath
          childEnv.CLAUDE_APP_ROOT =
            process.env.CLAUDE_APP_ROOT?.trim() || path.dirname(bundledCliPath)
        }
      }
    }
    if (desktopServerUrl) {
      setJiangxiaEnvAliases(childEnv, 'DESKTOP_SERVER_URL', desktopServerUrl)
    }

    return childEnv
  }

  private resolveDesktopAutoMemoryPath(workDir: string): string {
    const gitRoot = fs.existsSync(workDir) ? findCanonicalGitRoot(workDir) : null
    const homeDir = this.resolveRealPathForComparison(os.homedir())
    const realGitRoot = gitRoot
      ? this.resolveRealPathForComparison(gitRoot)
      : null
    const memoryProjectRoot =
      gitRoot && realGitRoot && path.resolve(realGitRoot) !== path.resolve(homeDir)
        ? gitRoot
        : workDir
    return (
      path.join(
        getClaudeConfigHomeDir(),
        'projects',
        sanitizePath(memoryProjectRoot),
        AUTO_MEMORY_DIRNAME,
      ) + path.sep
    ).normalize('NFC')
  }

  private resolveRealPathForComparison(filePath: string): string {
    try {
      return fs.realpathSync.native?.(filePath) ?? fs.realpathSync(filePath)
    } catch {
      return filePath
    }
  }

  /**
   * 官方模式下构造 CLI 子进程的 auth env:
   * - CLAUDE_CODE_ENTRYPOINT=claude-desktop 让 CLI 忽略外部残留 ANTHROPIC_* env
   * - 如果 Jiangxia 自管的 oauth.json 里有可用 token,注入 CLAUDE_CODE_OAUTH_TOKEN
   *   让 CLI 直接拿 env 里的 token,不碰 Keychain,绕开 macOS ACL 静默拒绝
   *   (这是 DMG 安装 .app 后 403 "Request not allowed" 的唯一根治方案)
   */
  private async buildOfficialOAuthEnv(): Promise<Record<string, string>> {
    const env: Record<string, string> = {
      CLAUDE_CODE_ENTRYPOINT: 'claude-desktop',
    }
    try {
      // deferred import: avoids instantiating the OAuth singleton on every
      // ConversationService construction — only loaded when official mode hits.
      const { jiangxiaOAuthService } = await import('./jiangxiaOAuthService.js')
      const token = await jiangxiaOAuthService.ensureFreshAccessToken()
      if (token) {
        env.CLAUDE_CODE_OAUTH_TOKEN = token
      }
    } catch (err) {
      console.error(
        '[conversationService] ensureFreshAccessToken failed:',
        err instanceof Error ? err.message : err,
      )
    }
    return env
  }

  private shouldStripInheritedProviderEnv(providerId?: string | null): boolean {
    if (providerId !== undefined) {
      return true
    }

    const configDir =
      process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
    if (getAppStorageReadPaths(configDir, 'providers.json').some((filePath) => fs.existsSync(filePath))) {
      return true
    }

    for (const settingsPath of getAppStorageReadPaths(configDir, 'settings.json')) {
      try {
        const raw = fs.readFileSync(settingsPath, 'utf-8')
        const parsed = JSON.parse(raw) as { env?: Record<string, string> }
        const env = parsed.env ?? {}
        return [
          'ANTHROPIC_API_KEY',
          'ANTHROPIC_BASE_URL',
          'ANTHROPIC_AUTH_TOKEN',
          'ANTHROPIC_MODEL',
          'ANTHROPIC_DEFAULT_HAIKU_MODEL',
          'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
          'ANTHROPIC_DEFAULT_SONNET_MODEL',
          'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
          'ANTHROPIC_DEFAULT_OPUS_MODEL',
          'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
          getJiangxiaEnvName('SEND_DISABLED_THINKING'),
          getLegacyJiangxiaEnvName('SEND_DISABLED_THINKING'),
          'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
          'CLAUDE_CODE_MODEL_CONTEXT_WINDOWS',
        ].some((key) => typeof env[key] === 'string' && env[key]!.trim().length > 0)
      } catch {
        // Try the legacy managed settings file next.
      }
    }
    return false
  }

  /**
   * 只有当用户处于"官方"模式(没有激活任何自定义 provider)时,才把 CLI 标记为
   * managed-OAuth。激活自定义 provider 时 settings.json 里有 ANTHROPIC_AUTH_TOKEN;
   * 这种情况下 CLI 必须按 token 路径走第三方 endpoint,不能被 managed 规则
   * 强制切 OAuth。
   *
   * 默认 (读不到 settings.json) 按"官方"处理 — 即使用户从未用过 cc-jiangxia
   * provider 管理,也希望官方 OAuth 能正常工作。
   */
  private shouldMarkManagedOAuth(providerId?: string | null): boolean {
    if (providerId === null) {
      return true
    }
    if (typeof providerId === 'string') {
      return false
    }

    const configDir =
      process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
    for (const providersIndexPath of getAppStorageReadPaths(configDir, 'providers.json')) {
      try {
        const raw = fs.readFileSync(providersIndexPath, 'utf-8')
        const parsed = JSON.parse(raw) as { activeId?: unknown }
        if (parsed.activeId === null) {
          return true
        }
      } catch {
        // Fall back to settings.json detection below.
      }
    }

    for (const settingsPath of getAppStorageReadPaths(configDir, 'settings.json')) {
      try {
        const raw = fs.readFileSync(settingsPath, 'utf-8')
        const parsed = JSON.parse(raw) as { env?: Record<string, string> }
        const env = parsed.env ?? {}
        const hasProviderEnv = [
          'ANTHROPIC_API_KEY',
          'ANTHROPIC_AUTH_TOKEN',
          'ANTHROPIC_BASE_URL',
        ].some(
          (key) =>
            typeof env[key] === 'string' && env[key]!.trim().length > 0,
        )
        return !hasProviderEnv
      } catch {
        // Try the legacy managed settings file next.
      }
    }
    return true
  }

  private resolveCliArgs(baseArgs: string[]): string[] {
    const launcher = resolveClaudeCliLauncher({
      cliPath: process.env.CLAUDE_CLI_PATH,
      execPath: process.execPath,
    })

    if (!launcher) {
      if (process.platform === 'win32') {
        return [
          process.execPath,
          '--preload',
          path.resolve(import.meta.dir, '../../../preload.ts'),
          path.resolve(import.meta.dir, '../../entrypoints/cli.tsx'),
          ...baseArgs,
        ]
      }
      return [path.resolve(import.meta.dir, '../../../bin/claude-jiangxia'), ...baseArgs]
    }

    return buildClaudeCliArgs(launcher, baseArgs, process.env.CLAUDE_APP_ROOT)
  }

  private clearStaleLock(sessionId: string): boolean {
    const lockDir = path.join(
      process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
      '.lock',
    )
    const lockFile = path.join(lockDir, sessionId)
    if (!fs.existsSync(lockFile)) {
      return false
    }

    try {
      fs.unlinkSync(lockFile)
      return true
    } catch {
      return false
    }
  }

  private buildStartupError(
    sessionId: string,
    exitCode: number,
  ): ConversationStartupError {
    const session = this.sessions.get(sessionId)
    const capturedOutput = this.buildCapturedProcessOutputDetail(session)
    const recentMessages = session?.sdkMessages ?? []
    const resultMessage = [...recentMessages]
      .reverse()
      .find((msg) => msg?.type === 'result' && msg.is_error)
    const assistantApiError = [...recentMessages]
      .reverse()
      .find((msg) => this.isAssistantApiErrorMessage(msg))
    const authStatus = [...recentMessages]
      .reverse()
      .find((msg) => msg?.type === 'auth_status')
    const detail =
      this.extractStartupDetail(resultMessage) ||
      this.extractAssistantApiErrorDetail(assistantApiError) ||
      this.extractStartupDetail(authStatus) ||
      capturedOutput

    if (
      /(not logged in|run \/login|sign in again|login required|unauthenticated|logged_out)/i.test(
        detail,
      )
    ) {
      return new ConversationStartupError(
        'Desktop chat could not start because Claude CLI is not authenticated. Run `./bin/claude-jiangxia /login` or provide valid API credentials, then retry.',
        'CLI_AUTH_REQUIRED',
      )
    }

    if (/session id .*already in use/i.test(detail)) {
      return new ConversationStartupError(
        `Session ${sessionId} is already in use by another CLI process or transcript.`,
        'CLI_SESSION_CONFLICT',
        true,
      )
    }

    const normalizedDetail = detail.trim()
    return new ConversationStartupError(
      normalizedDetail
        ? `CLI exited during startup (code ${exitCode}): ${normalizedDetail}`
        : `CLI exited during startup with code ${exitCode}; no CLI stderr/stdout or SDK error payload was captured before exit.`,
      'CLI_START_FAILED',
      true,
    )
  }

  private buildRuntimeExitMessage(sessionId: string, exitCode: number): string {
    const session = this.sessions.get(sessionId)
    const capturedOutput = this.buildCapturedProcessOutputDetail(session)
    const recentMessages = session?.sdkMessages ?? []
    const resultMessage = [...recentMessages]
      .reverse()
      .find((msg) => msg?.type === 'result' && msg.is_error)
    const assistantApiError = [...recentMessages]
      .reverse()
      .find((msg) => this.isAssistantApiErrorMessage(msg))
    const authStatus = [...recentMessages]
      .reverse()
      .find((msg) => msg?.type === 'auth_status')
    const detail =
      this.extractStartupDetail(resultMessage) ||
      this.extractAssistantApiErrorDetail(assistantApiError) ||
      this.extractStartupDetail(authStatus) ||
      capturedOutput

    return detail
      ? `CLI process exited unexpectedly (code ${exitCode}): ${detail}`
      : `CLI process exited unexpectedly with code ${exitCode}; no CLI stderr/stdout or SDK error payload was captured before exit.`
  }

  private buildCapturedProcessOutputDetail(
    session: SessionProcess | undefined,
  ): string {
    if (!session) return ''

    const stderrText = (session.stderrLines ?? []).join('\n').trim()
    const stdoutText = (session.stdoutLines ?? []).join('\n').trim()

    if (stderrText && stdoutText) {
      return `stderr:\n${stderrText}\nstdout:\n${stdoutText}`
    }

    return stderrText || stdoutText
  }

  private redactProcessOutput(line: string): string {
    return line
      .replace(/(ANTHROPIC_(?:API_KEY|AUTH_TOKEN)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
      .replace(/((?:api[_-]?key|auth[_-]?token|access[_-]?token)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, '$1[REDACTED]')
  }

  private extractStartupDetail(message: any): string {
    if (!message) return ''

    if (typeof message.result === 'string') return message.result
    if (typeof message.status === 'string') return message.status
    if (typeof message.message === 'string') return message.message

    if (Array.isArray(message?.errors)) {
      return message.errors
        .filter((value: unknown): value is string => typeof value === 'string')
        .join('\n')
    }

    return ''
  }

  private isAssistantApiErrorMessage(message: any): boolean {
    return (
      message?.type === 'assistant' &&
      (message.isApiErrorMessage === true || typeof message.error === 'string')
    )
  }

  private extractAssistantApiErrorDetail(message: any): string {
    if (!this.isAssistantApiErrorMessage(message)) return ''

    const text = this.extractAssistantText(message)
    const error = typeof message.error === 'string' ? message.error : ''
    if (text && error) return `${error}: ${text}`
    return text || error
  }

  private extractAssistantText(message: any): string {
    const content = message?.message?.content
    if (!Array.isArray(content)) return ''
    const textBlock = content.find(
      (block: unknown): block is { type: string; text: string } =>
        !!block &&
        typeof block === 'object' &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string',
    )
    return textBlock?.text || ''
  }

  private extractSdkErrorEvent(message: any): {
    type: string
    summary: string
    details: Record<string, unknown>
  } | null {
    if (this.isAssistantApiErrorMessage(message)) {
      const summary = this.redactProcessOutput(
        this.extractAssistantApiErrorDetail(message) || 'Assistant API error',
      )
      return {
        type: 'sdk_api_error',
        summary,
        details: {
          sdkType: message.type,
          error: typeof message.error === 'string' ? message.error : undefined,
          isApiErrorMessage: message.isApiErrorMessage === true,
          messageText: this.extractAssistantText(message)
            ? this.redactProcessOutput(this.extractAssistantText(message))
            : undefined,
          errorDetails:
            typeof message.errorDetails === 'string'
              ? this.redactProcessOutput(message.errorDetails)
              : undefined,
        },
      }
    }

    if (message?.type === 'result' && message.is_error) {
      const summary = this.redactProcessOutput(
        this.extractStartupDetail(message) || 'SDK result error',
      )
      return {
        type: 'sdk_result_error',
        summary,
        details: {
          sdkType: message.type,
          subtype: message.subtype,
          isError: true,
          result:
            typeof message.result === 'string'
              ? this.redactProcessOutput(message.result)
              : undefined,
          status:
            typeof message.status === 'string'
              ? this.redactProcessOutput(message.status)
              : undefined,
          usage: message.usage,
        },
      }
    }

    return null
  }

  private summarizeSdkMessages(messages: any[]): unknown[] {
    return messages.slice(-MAX_CAPTURED_SDK_SUMMARY).map((message) => {
      if (!message || typeof message !== 'object') {
        return message
      }
      const content = Array.isArray(message.message?.content)
        ? message.message.content.map((block: unknown) => {
            if (!block || typeof block !== 'object') return block
            const typedBlock = block as Record<string, unknown>
            return {
              type: typedBlock.type,
              text:
                typeof typedBlock.text === 'string'
                  ? this.redactProcessOutput(typedBlock.text)
                  : undefined,
            }
          })
        : undefined
      return {
        type: message.type,
        subtype: message.subtype,
        is_error: message.is_error,
        status: typeof message.status === 'string' ? message.status : undefined,
        result: typeof message.result === 'string' ? this.redactProcessOutput(message.result) : undefined,
        error: typeof message.error === 'string' ? this.redactProcessOutput(message.error) : undefined,
        errorDetails:
          typeof message.errorDetails === 'string'
            ? this.redactProcessOutput(message.errorDetails)
            : undefined,
        message: typeof message.message === 'string' ? this.redactProcessOutput(message.message) : undefined,
        content,
      }
    })
  }

  private buildUserContent(
    content: string,
    sessionId: string,
    attachments?: AttachmentRef[],
  ): Array<Record<string, unknown>> {
    const { fileReferencePrefix, imageBlocks } = this.materializeAttachments(sessionId, attachments)
    const trimmed = content.trim()
    const text = fileReferencePrefix
      ? `${fileReferencePrefix}${trimmed || 'Please analyze the attached files.'}`.trim()
      : trimmed || (imageBlocks.length > 0 ? 'Please analyze the attached images.' : '')

    return [...imageBlocks, { type: 'text', text }]
  }

  private materializeAttachments(
    sessionId: string,
    attachments?: AttachmentRef[],
  ): {
    fileReferencePrefix: string
    imageBlocks: Array<Record<string, unknown>>
  } {
    if (!attachments || attachments.length === 0) {
      return { fileReferencePrefix: '', imageBlocks: [] }
    }

    const uploadDir = path.join(
      process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
      'uploads',
      sessionId,
    )
    fs.mkdirSync(uploadDir, { recursive: true })

    const savedFilePaths: string[] = []
    const imageBlocks: Array<Record<string, unknown>> = []
    for (const attachment of attachments) {
      const payload = this.readAttachmentPayload(attachment)
      const isImage = this.isImageAttachment(attachment)
      const imageMimeType = isImage ? this.resolveImageMimeType(attachment) : null

      let materializedPath = attachment.path
      if (!materializedPath && payload) {
        const ext = this.getAttachmentExtension(attachment)
        const fileName = this.sanitizeAttachmentName(attachment.name, attachment.type, ext)
        materializedPath = path.join(uploadDir, `${crypto.randomUUID()}-${fileName}`)
        fs.writeFileSync(materializedPath, payload)
      }

      if (payload && imageMimeType) {
        imageBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageMimeType,
            data: payload.toString('base64'),
          },
        })
        continue
      }

      if (materializedPath) {
        savedFilePaths.push(materializedPath)
      }
    }

    return {
      fileReferencePrefix: savedFilePaths.length > 0
        ? savedFilePaths.map((filePath) => `@"${filePath}"`).join(' ') + ' '
        : '',
      imageBlocks,
    }
  }

  private readAttachmentPayload(attachment: AttachmentRef): Buffer | null {
    if (attachment.data) {
      return this.parseAttachmentData(attachment.data)
    }

    if (!attachment.path) return null

    try {
      return fs.readFileSync(attachment.path)
    } catch {
      return null
    }
  }

  private isImageAttachment(attachment: AttachmentRef): boolean {
    if (attachment.type === 'image') return true
    if (attachment.mimeType?.toLowerCase().startsWith('image/')) return true
    if (attachment.data?.match(/^data:image\//i)) return true
    return /\.(avif|gif|jpe?g|png|webp)$/i.test(attachment.name || attachment.path || '')
  }

  private resolveImageMimeType(attachment: AttachmentRef): string | null {
    const dataMimeType = attachment.data?.match(/^data:([^;,]+);base64,/i)?.[1]
    const candidate = (dataMimeType || attachment.mimeType || this.mimeTypeFromExtension(attachment))?.toLowerCase()
    return candidate && new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']).has(candidate)
      ? candidate
      : null
  }

  private mimeTypeFromExtension(attachment: AttachmentRef): string | null {
    const ext = path.extname(attachment.name || attachment.path || '').toLowerCase()
    switch (ext) {
      case '.gif': return 'image/gif'
      case '.jpg':
      case '.jpeg': return 'image/jpeg'
      case '.png': return 'image/png'
      case '.webp': return 'image/webp'
      default: return null
    }
  }

  private parseAttachmentData(data: string): Buffer | null {
    const match = data.match(/^data:.*?;base64,(.*)$/)
    const encoded = (match ? match[1] : data).replace(/\s/g, '')
    if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return null

    const padded = encoded.length % 4 === 0
      ? encoded
      : encoded.length % 4 === 1
        ? ''
        : encoded.padEnd(encoded.length + (4 - (encoded.length % 4)), '=')
    if (!padded) return null

    const payload = Buffer.from(padded, 'base64')
    return payload.length > 0 ? payload : null
  }

  private getAttachmentExtension(attachment: AttachmentRef): string {
    const byName = attachment.name?.match(/\.([a-z0-9]+)$/i)?.[1]
    if (byName) return byName

    const byPath = attachment.path?.match(/\.([a-z0-9]+)$/i)?.[1]
    if (byPath) return byPath

    const byMime = attachment.mimeType?.split('/')[1]?.split('+')[0]
    if (byMime) return byMime

    return attachment.type === 'image' ? 'png' : 'bin'
  }
  private sanitizeAttachmentName(
    name: string | undefined,
    type: AttachmentRef['type'],
    ext: string,
  ): string {
    const fallback = `${type}-attachment.${ext}`
    const normalized = (name || fallback).replace(/[^a-zA-Z0-9._-]/g, '_')
    return normalized || fallback
  }

  private getSdkTokenFromUrl(sdkUrl: string): string {
    const url = new URL(sdkUrl)
    return url.searchParams.get('token') || ''
  }
}

function normalizeSessionPermissionUpdates(
  suggestions: unknown[] | undefined,
  toolName: string,
) {
  if (Array.isArray(suggestions) && suggestions.length > 0) {
    return suggestions.map((suggestion) => {
      if (!suggestion || typeof suggestion !== 'object') {
        return suggestion
      }
      return {
        ...suggestion,
        destination: 'session',
      }
    })
  }

  return [
    {
      type: 'addRules',
      rules: [{ toolName }],
      behavior: 'allow',
      destination: 'session',
    },
  ]
}

export const conversationService = new ConversationService()
