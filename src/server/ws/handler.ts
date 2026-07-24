/**
 * WebSocket connection handler
 *
 * 管理 WebSocket 连接生命周期，处理消息路由。
 * 用户消息通过 CLI 子进程（stream-json 模式）处理，
 * CLI stdout 消息被转换为 ServerMessage 并转发到 WebSocket。
 */

import type { ServerWebSocket } from 'bun'
import type { ClientMessage, ServerMessage } from './events.js'
import * as os from 'node:os'
import {
  ConversationStartupError,
  conversationService,
} from '../services/conversationService.js'
import { computerUseApprovalService } from '../services/computerUseApprovalService.js'
import { sessionService } from '../services/sessionService.js'
import { ApiError } from '../middleware/errorHandler.js'
import { SettingsService } from '../services/settingsService.js'
import { ProviderService } from '../services/providerService.js'
import { diagnosticsService } from '../services/diagnosticsService.js'
import { deriveTitle, generateTitle, saveAiTitle } from '../services/titleService.js'
import { WorkflowRuntimeService } from '../services/workflowRuntimeService.js'
import { WorkflowSessionStateService } from '../services/workflowSessionStateService.js'
import { WorkflowReportStore } from '../services/workflowReportStore.js'
import {
  clearWorkflowSessionTransitionCoordinatorForTests,
  enqueueWorkflowSessionTransition,
} from '../services/workflowTransitionCoordinator.js'
import {
  recordAskUserQuestionAnswer,
  recordAskUserQuestionIssue,
} from '../services/workflowCompletionGate.js'
import { loadCurrentWorkflowTemplate } from '../services/workflowRuntimeTemplateService.js'
import { buildWorkflowFinalReport } from '../services/workflowFinalReport.js'
import {
  getWorkflowPhaseDisallowedTools,
  getWorkflowPromptToolGuidance,
  getWorkflowScopedToolNames,
} from '../services/workflowToolPolicy.js'
import {
  stateToWorkflowMetadata,
  workflowSummaryFromState,
} from '../services/workflowSummary.js'
import type {
  CompletionSubmission,
  WorkflowModelResolution,
  WorkflowSessionMetadata,
  WorkflowSessionSummary,
  WorkflowSessionState,
  WorkflowTransitionRequest,
} from '../services/workflowTypes.js'
import { parseSlashCommand } from '../../utils/slashCommandParsing.js'
import {
  COMMAND_NAME_TAG,
  LOCAL_COMMAND_STDERR_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
} from '../../constants/xml.js'
import { shouldCreateWorktreeForSessionLaunch } from '../services/repositoryLaunchService.js'
import {
  buildExpertRuntimeTurnInstruction,
  buildNormalRuntimeResetInstruction,
} from '../services/expertRuntimeBindingService.js'
import { setSessionChatState } from '../api/conversations.js'

const settingsService = new SettingsService()
const providerService = new ProviderService()
const workflowRuntimeService = new WorkflowRuntimeService()
const workflowSessionStateService = new WorkflowSessionStateService()
const workflowReportStore = new WorkflowReportStore()

/**
 * Cache slash commands from CLI init messages, keyed by sessionId.
 */
export type SessionSlashCommand = {
  name: string
  description: string
  argumentHint?: string
}

const sessionSlashCommands = new Map<string, SessionSlashCommand[]>()

/**
 * Timers for delayed session cleanup after client disconnect.
 * If a client reconnects within 5 minutes, the timer is cancelled.
 */
const sessionCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Track sessions where user requested stop — suppress the CLI_ERROR that
 * follows an interrupt so the frontend doesn't show "处理过程中发生错误".
 */
const sessionStopRequested = new Set<string>()

/**
 * Track user message count and title state per session for auto-title generation.
 */
const e2eTestPermissionRequestIds = new Set<string>()

const sessionTitleState = new Map<string, {
  userMessageCount: number
  hasCustomTitle: boolean
  firstUserMessage: string
  allUserMessages: string[]
  startedGenerationCounts: Set<number>
}>()

type RuntimeOverride = {
  providerId: string | null
  modelId: string
}

const runtimeOverrides = new Map<string, RuntimeOverride>()

const runtimeTransitionPromises = new Map<string, Promise<void>>()
const ephemeralWorkflowStates = new Map<string, WorkflowSessionState>()
const sessionStartupPromises = new Map<string, Promise<void>>()
const lastResolvedStartupWorkDirs = new Map<string, string>()
const prewarmPendingSessions = new Set<string>()
const prewarmedSessions = new Set<string>()
const prewarmIdleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEFAULT_PREWARM_IDLE_TIMEOUT_MS = 5 * 60_000

function restoreRuntimeOverride(
  sessionId: string,
  previousOverride: RuntimeOverride | undefined,
): void {
  if (previousOverride) {
    runtimeOverrides.set(sessionId, previousOverride)
  } else {
    runtimeOverrides.delete(sessionId)
  }
}

async function sendRepositoryStartupStatus(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  reason: 'user_message' | 'prewarm_session' | 'workflow_auto_continue',
): Promise<void> {
  if (reason !== 'user_message') return

  const launchInfo = await sessionService.getSessionLaunchInfo(sessionId).catch(() => null)
  const repository = launchInfo?.repository
  if (!repository) return

  if (shouldCreateWorktreeForSessionLaunch(launchInfo)) {
    sendMessage(ws, { type: 'status', state: 'thinking', verb: 'Creating worktree' })
  }
}

export function getSlashCommands(sessionId: string): SessionSlashCommand[] {
  return sessionSlashCommands.get(sessionId) || []
}

export type WebSocketData = {
  sessionId: string
  connectedAt: number
  channel: 'client' | 'sdk'
  sdkToken: string | null
  serverPort: number
  serverHost: string
}

// Active browser clients keyed by session. Multiple windows can observe one session.
const activeSessions = new Map<string, Set<ServerWebSocket<WebSocketData>>>()
const clientOutputCallbacks = new Map<ServerWebSocket<WebSocketData>, {
  sessionId: string
  callback: (msg: any) => void
}>()

function addActiveClient(
  sessionId: string,
  ws: ServerWebSocket<WebSocketData>,
): void {
  let clients = activeSessions.get(sessionId)
  if (!clients) {
    clients = new Set()
    activeSessions.set(sessionId, clients)
  }
  clients.add(ws)
}

function removeActiveClient(
  sessionId: string,
  ws: ServerWebSocket<WebSocketData>,
): boolean {
  const clients = activeSessions.get(sessionId)
  if (!clients?.has(ws)) return false
  clients.delete(ws)
  if (clients.size === 0) {
    activeSessions.delete(sessionId)
  }
  return true
}

function hasActiveClients(sessionId: string): boolean {
  return (activeSessions.get(sessionId)?.size ?? 0) > 0
}

function scheduleSessionCleanupAfterClientDisconnect(sessionId: string): void {
  if (hasActiveClients(sessionId) || sessionCleanupTimers.has(sessionId)) return

  computerUseApprovalService.cancelSession(sessionId)
  const cleanupTimer = setTimeout(() => {
    sessionCleanupTimers.delete(sessionId)
    if (!hasActiveClients(sessionId)) {
      console.log(`[WS] Session ${sessionId} not reconnected after 30s, stopping CLI subprocess`)
      conversationService.stopSession(sessionId)
      cleanupSessionRuntimeState(sessionId)
    }
  }, 30_000)
  sessionCleanupTimers.set(sessionId, cleanupTimer)
}

function removeDisconnectedClient(
  sessionId: string,
  ws: ServerWebSocket<WebSocketData>,
): boolean {
  const removed = removeActiveClient(sessionId, ws)
  // Always clear the callback mapping, including duplicate close notifications.
  removeClientOutputCallback(ws)
  if (removed) {
    scheduleSessionCleanupAfterClientDisconnect(sessionId)
  }
  return removed
}

function removeStaleClientAfterSendFailure(
  ws: ServerWebSocket<WebSocketData>,
  messageType: string,
  details: Record<string, unknown>,
): void {
  const { sessionId, channel } = ws.data
  void diagnosticsService.recordEvent({
    type: 'ws_client_send_failed',
    severity: 'warn',
    sessionId,
    summary: 'Client WebSocket send failed; removing stale client',
    details: {
      channel,
      messageType,
      ...details,
    },
  })

  removeDisconnectedClient(sessionId, ws)
  try {
    ws.close(1011, 'WebSocket send failed')
  } catch (error) {
    void diagnosticsService.recordEvent({
      type: 'ws_client_close_failed',
      severity: 'warn',
      sessionId,
      summary: 'Failed to close stale client WebSocket after send failure',
      details: {
        channel,
        messageType,
        error: error instanceof Error ? error.message : String(error),
      },
    })
  }
}

type ClientSendOutcome = 'sent' | 'backpressured' | 'dropped'

function sendToClient(
  ws: ServerWebSocket<WebSocketData>,
  payload: string,
  messageType: string,
): ClientSendOutcome {
  try {
    const sendResult = ws.send(payload)
    if (sendResult === 0) {
      removeStaleClientAfterSendFailure(ws, messageType, {
        reason: 'send_dropped',
        sendResult,
      })
      return 'dropped'
    }
    if (sendResult === -1) {
      void diagnosticsService.recordEvent({
        type: 'ws_client_backpressure',
        severity: 'warn',
        sessionId: ws.data.sessionId,
        summary: 'Client WebSocket send queued because of backpressure',
        details: {
          channel: ws.data.channel,
          messageType,
          sendResult,
        },
      })
      return 'backpressured'
    }
    return 'sent'
  } catch (error) {
    removeStaleClientAfterSendFailure(ws, messageType, {
      reason: error instanceof Error ? error.message : String(error),
    })
    return 'dropped'
  }
}

export const handleWebSocket = {
  open(ws: ServerWebSocket<WebSocketData>) {
    const { sessionId, channel, sdkToken } = ws.data

    if (channel === 'sdk') {
      const authStatus = conversationService.getSdkConnectionAuthStatus(sessionId, sdkToken)
      if (!authStatus.authorized) {
        console.warn(
          `[WS] Rejected SDK connection for session: ${sessionId} (${authStatus.reason})`,
        )
        void diagnosticsService.recordEvent({
          type: 'sdk_connection_rejected',
          severity: 'warn',
          sessionId,
          summary: `SDK connection rejected: ${authStatus.reason}`,
          details: {
            reason: authStatus.reason,
            hasToken: Boolean(sdkToken),
          },
        })
        ws.close(1008, 'Invalid SDK token')
        return
      }

      conversationService.attachSdkConnection(sessionId, ws)
      console.log(`[WS] SDK connected for session: ${sessionId}`)
      return
    }

    console.log(`[WS] Client connected for session: ${sessionId}`)
    void diagnosticsService.recordEvent({
      type: 'ws_client_open',
      severity: 'info',
      sessionId,
      summary: 'Client WebSocket connected',
      details: {
        channel,
        connectedAt: ws.data.connectedAt,
      },
    })

    // A second socket or a pending cleanup timer means this client is reconnecting.
    const isReconnect = hasActiveClients(sessionId) || sessionCleanupTimers.has(sessionId)

    // Cancel pending cleanup timer if client reconnects
    const pendingTimer = sessionCleanupTimers.get(sessionId)
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      sessionCleanupTimers.delete(sessionId)
    }

    addActiveClient(sessionId, ws)
    if (prewarmPendingSessions.has(sessionId) || prewarmedSessions.has(sessionId)) {
      bindPrewarmMetadataCapture(sessionId)
    } else {
      bindClientSessionOutput(sessionId, ws)
    }

    const msg: ServerMessage = { type: 'connected', sessionId }
    if (sendMessage(ws, msg) === 'dropped') return
    if (isReconnect) {
      sendWorkflowStateSnapshotIfAvailable(ws, sessionId).catch((err) => {
        console.warn(
          `[WS] Failed to send workflow state snapshot for ${sessionId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
    }
    sendWorkflowWelcomeIfNeeded(ws, sessionId).catch((err) => {
      console.warn(
        `[WS] Failed to send workflow welcome for ${sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    })
    replayPendingPermissionRequests(ws, sessionId)
  },

  message(ws: ServerWebSocket<WebSocketData>, rawMessage: string | Buffer) {
    if (ws.data.channel === 'sdk') {
      const payload = typeof rawMessage === 'string' ? rawMessage : rawMessage.toString()
      conversationService.handleSdkPayload(ws.data.sessionId, payload)
      return
    }

    try {
      const message = JSON.parse(
        typeof rawMessage === 'string' ? rawMessage : rawMessage.toString()
      ) as ClientMessage

      switch (message.type) {
        case 'user_message':
          handleUserMessage(ws, message).catch((err) => {
            void diagnosticsService.recordEvent({
              type: 'ws_user_message_failed',
              severity: 'error',
              sessionId: ws.data.sessionId,
              summary: err instanceof Error ? err.message : String(err),
              details: err,
            })
            console.error(`[WS] Unhandled error in handleUserMessage:`, err)
          })
          break

        case 'permission_response':
          void handlePermissionResponse(ws, message).catch((error) => sendWorkflowError(ws, error))
          break

        case 'computer_use_permission_response':
          handleComputerUsePermissionResponse(ws, message)
          break

        case 'set_permission_mode':
          handleSetPermissionMode(ws, message)
          break

        case 'set_runtime_config':
          void handleSetRuntimeConfig(ws, message)
          break

        case 'workflow_transition':
          void handleWorkflowTransition(ws, message)
          break

        case 'prewarm_session':
          void handlePrewarmSession(ws)
          break

        case 'stop_generation':
          handleStopGeneration(ws)
          break

        case 'e2e_test_permission_request':
          handleE2ETestPermissionRequest(ws, message)
          break

        case 'e2e_test_permission_response_ack':
          handleE2ETestPermissionResponseAck(ws, message)
          break

        case 'ping':
          sendMessage(ws, { type: 'pong' } satisfies ServerMessage)
          break

        default:
          sendError(ws, `Unknown message type: ${(message as any).type}`, 'UNKNOWN_TYPE')
      }
    } catch (error) {
      sendError(ws, `Invalid message format: ${error}`, 'PARSE_ERROR')
    }
  },

  close(ws: ServerWebSocket<WebSocketData>, code: number, reason: string) {
    const { sessionId, channel } = ws.data

    if (channel === 'sdk') {
      console.log(`[WS] SDK disconnected from session: ${sessionId} (${code}: ${reason})`)
      conversationService.detachSdkConnection(sessionId, ws)
      return
    }

    console.log(`[WS] Client disconnected from session: ${sessionId} (${code}: ${reason})`)
    void diagnosticsService.recordEvent({
      type: 'ws_client_close',
      severity: code === 1000 ? 'info' : 'warn',
      sessionId,
      summary: `Client WebSocket disconnected (${code}: ${reason || 'no reason'})`,
      details: {
        channel,
        code,
        reason,
        connectedAt: ws.data.connectedAt,
      },
    })
    if (!removeDisconnectedClient(sessionId, ws)) {
      console.log(`[WS] Ignoring stale client disconnect for session: ${sessionId}`)
    }
  },

  drain(ws: ServerWebSocket<WebSocketData>) {
    // Backpressure handling - called when the socket is ready to receive more data
  },
}

// ============================================================================
// Message handlers
// ============================================================================

async function handleUserMessage(
  ws: ServerWebSocket<WebSocketData>,
  message: Extract<ClientMessage, { type: 'user_message' }>
) {
  const { sessionId } = ws.data

  // Clear any stale stop flag from a previous turn
  sessionStopRequested.delete(sessionId)
  clearPrewarmState(sessionId)

  const desktopSlashCommand = getDesktopSlashCommand(message.content)
  if (desktopSlashCommand?.commandName === 'clear' && desktopSlashCommand.args.trim()) {
    sendMessage(ws, {
      type: 'error',
      message: 'The /clear command does not accept arguments.',
      code: 'INVALID_SLASH_COMMAND_ARGS',
    })
    sendMessage(ws, { type: 'status', state: 'idle' })
    return
  }

  if (desktopSlashCommand?.commandName === 'clear') {
    await handleDesktopClearCommand(ws)
    return
  }

  // Send thinking status
  sendMessage(ws, { type: 'status', state: 'thinking', verb: 'Thinking' })

  const initialRuntimeTransition = await waitForRuntimeTransitionBeforeUserTurn(ws, sessionId)
  if (!initialRuntimeTransition.ok) return
  if (initialRuntimeTransition.waited) {
    sendMessage(ws, { type: 'status', state: 'thinking', verb: 'Thinking' })
  }

  // Track and emit the first placeholder title before CLI startup/streaming.
  let titleState = sessionTitleState.get(sessionId)
  if (!titleState) {
    titleState = {
      userMessageCount: 0,
      hasCustomTitle: !!(await sessionService.getCustomTitle(sessionId)),
      firstUserMessage: '',
      allUserMessages: [],
      startedGenerationCounts: new Set<number>(),
    }
    sessionTitleState.set(sessionId, titleState)
  }
  const titleInput = getTitleInputForUserMessage(message.content, desktopSlashCommand)
  if (titleInput) {
    titleState.userMessageCount++
    titleState.allUserMessages.push(titleInput)
    if (titleState.userMessageCount === 1) {
      titleState.firstUserMessage = titleInput
    }
    triggerTitleGeneration(ws, sessionId)
  }

  // 启动 CLI 子进程（如果还没有）
  try {
    await ensureCliSessionStarted(ws, sessionId, 'user_message')
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    const code =
      err instanceof ConversationStartupError ? err.code : 'CLI_START_FAILED'
    console.error(`[WS] CLI start failed for ${sessionId}: ${errMsg}`)
    sendMessage(ws, {
      type: 'error',
      message: await buildSessionStartupDiagnosticMessage(sessionId, errMsg),
      code,
      retryable:
        err instanceof ConversationStartupError ? err.retryable : false,
    })
    sendMessage(ws, { type: 'status', state: 'idle' })
    return
  }

  const startupRuntimeTransition = await waitForRuntimeTransitionBeforeUserTurn(ws, sessionId)
  if (startupRuntimeTransition.ok) {
    if (startupRuntimeTransition.waited) {
      sendMessage(ws, { type: 'status', state: 'thinking', verb: 'Thinking' })
    }
  } else {
    return
  }

  // Register the callback before sending the turn so startup errors are not lost.
  // Keep output muted until the current user turn is enqueued to avoid forwarding
  // any pre-turn SDK chatter as fresh chat history.
  let userMessageSent = false
  const shouldForwardCurrentTurnLocalCommand =
    createCurrentTurnLocalCommandForwarder(desktopSlashCommand)

  bindAllClientSessionOutputs(sessionId, {
    shouldForward: (cliMsg) => {
      if (userMessageSent || (cliMsg.type === 'result' && cliMsg.is_error)) {
        return true
      }
      return shouldForwardCurrentTurnLocalCommand(cliMsg)
    },
  })

  const resolvedMessage = await resolveSessionRuntimeUserMessage(ws, sessionId, message.content, message.workflowLanguage)
  if (resolvedMessage === null) {
    sendMessage(ws, { type: 'status', state: 'idle' })
    return
  }

  const sent = conversationService.sendMessage(
    sessionId,
    resolvedMessage,
    message.attachments
  )
  if (!sent) {
    sendMessage(ws, {
      type: 'error',
      message: 'CLI process is not running. The session may have ended or the process crashed.',
      code: 'CLI_NOT_RUNNING',
    })
    sendMessage(ws, { type: 'status', state: 'idle' })
    return
  }

  userMessageSent = true
}

async function handleDesktopClearCommand(
  ws: ServerWebSocket<WebSocketData>,
) {
  const { sessionId } = ws.data

  const workDir = conversationService.getSessionWorkDir(sessionId)
  conversationService.stopSession(sessionId)
  conversationService.clearOutputCallbacks(sessionId)
  sessionSlashCommands.delete(sessionId)
  sessionTitleState.delete(sessionId)
  cleanupStreamState(sessionId)

  try {
    await sessionService.clearSessionTranscript(sessionId, workDir || undefined)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    sendMessage(ws, {
      type: 'error',
      message: errMsg,
      code: 'SESSION_CLEAR_FAILED',
    })
    sendMessage(ws, { type: 'status', state: 'idle' })
    return
  }

  sendMessage(ws, {
    type: 'system_notification',
    subtype: 'session_cleared',
    message: 'Conversation cleared',
  })
  sendMessage(ws, {
    type: 'message_complete',
    usage: { input_tokens: 0, output_tokens: 0 },
  })
}

async function sendWorkflowStateSnapshotIfAvailable(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
): Promise<void> {
  const workflow = await getWorkflowMetadata(sessionId)
  if (!workflow && !sessionId.startsWith('workflow-')) return

  const state = await loadWorkflowStateForWebSocket(sessionId, workflow ?? undefined)
  if (!state) return

  sendMessage(ws, workflowNotificationForDesktop({
    type: 'system_notification',
    subtype: 'workflow_state',
    data: state,
  }) as ServerMessage)
}

async function sendWorkflowWelcomeIfNeeded(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
): Promise<void> {
  const workflow = await getWorkflowMetadata(sessionId)
  if (!workflow) return

  const state = await loadWorkflowStateForWebSocket(sessionId, workflow)
  if (!state) return
  if (state.workflowStatus !== 'created' || state.runStatus !== 'draft') return

  const currentTemplate = await loadCurrentWorkflowTemplate(state)
  const workflowName = currentTemplate?.displayName || workflow.templateId
  const description = currentTemplate?.description?.trim()
  const firstPhase = currentTemplate?.phases.find((phase) => phase.id === state.activePhaseId)
    ?? currentTemplate?.phases[0]
  const phaseCount = currentTemplate?.phases.length ?? state.phases.length
  const labels = Array.isArray(state.labels) ? state.labels : []
  const capabilities = [
    description,
    phaseCount > 0 ? `我会按 ${phaseCount} 个阶段带你推进` : '',
    firstPhase?.label ? `第一步会从「${firstPhase.label}」开始` : '',
    labels.length ? `当前路线偏向：${labels.join('、')}` : '',
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0)

  const message = [
    `嗨，我是「${workflowName}」workflow。`,
    capabilities.length ? capabilities.join('；') + '。' : '我会按这个 workflow 的阶段约束来协助你推进。',
    '你可以直接告诉我想做什么、要改哪里、或把目标/问题丢给我；你一发消息，我就正式进入第一阶段开工。🚀',
  ].join('\n\n')

  sendMessage(ws, {
    type: 'system_notification',
    subtype: 'workflow_welcome',
    message,
    data: {
      templateId: workflow.templateId,
      templateSource: workflow.templateSource,
      workflowName,
      activePhaseId: state.activePhaseId,
      phaseCount,
    },
  })
}

async function handlePrewarmSession(ws: ServerWebSocket<WebSocketData>) {
  const { sessionId } = ws.data
  if (conversationService.hasSession(sessionId) || sessionStartupPromises.has(sessionId)) {
    return
  }

  const launchInfo = await sessionService.getSessionLaunchInfo(sessionId).catch(() => null)
  if (launchInfo?.repository) {
    console.log(`[WS] Skipping prewarm for pending repository launch session ${sessionId}`)
    return
  }
  if ((launchInfo?.transcriptMessageCount ?? 0) > 0) {
    console.log(`[WS] Skipping prewarm resume for existing transcript session ${sessionId}`)
    return
  }

  prewarmPendingSessions.add(sessionId)
  void ensureCliSessionStarted(ws, sessionId, 'prewarm_session')
    .then(() => {
      if (!prewarmPendingSessions.delete(sessionId)) return
      bindPrewarmMetadataCapture(sessionId)
      markPrewarmed(sessionId)
    })
    .catch((err) => {
      prewarmPendingSessions.delete(sessionId)
      console.warn(
        `[WS] Prewarm failed for ${sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    })
}

async function resolveSessionRuntimeUserMessage(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  content: string,
  workflowLanguage?: 'zh' | 'en',
): Promise<string | null> {
  const workflow = await getWorkflowMetadata(sessionId)
  if (workflow) {
    return resolveWorkflowUserMessage(ws, sessionId, content, workflowLanguage)
  }

  const session = await sessionService.getSession(sessionId).catch(() => null)
  const expertInstruction = buildExpertRuntimeTurnInstruction(session?.expert)
  if (expertInstruction) {
    return [
      expertInstruction,
      '<expert-user-request>',
      content,
      '</expert-user-request>',
    ].join('\n\n')
  }

  const resetInstruction = buildNormalRuntimeResetInstruction(session?.expert)
  return resetInstruction
    ? [resetInstruction, content].join('\n\n')
    : content
}

async function resolveWorkflowUserMessage(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  content: string,
  workflowLanguage?: 'zh' | 'en',
): Promise<string | null> {
  const workflow = await getWorkflowMetadata(sessionId)
  if (!workflow) return content

  const state = await loadWorkflowStateForWebSocket(sessionId, workflow)
  if (!state) return content
  if (state.workflowStatus === 'cancelled' || state.status === 'cancelled') return content
  const defaultModel = await resolveWorkflowDefaultModel(sessionId)
  if (workflowLanguage) state.workflowLanguage = workflowLanguage

  const started = await workflowRuntimeService.startPhase({
    state,
    requestedAt: new Date().toISOString(),
    resolveDefaultModel: async () => defaultModel,
    isRequestedModelAvailable: async (modelId) => defaultModel.modelId === modelId,
  })

  await persistWorkflowStateIfAvailable(sessionId, started.state, state.stateVersion)
  for (const notification of started.notifications) {
    sendMessage(ws, workflowNotificationForDesktop(notification) as ServerMessage)
  }
  if (started.state.workflowStatus === 'failed') {
    return null
  }

  const prompt = await workflowRuntimeService.assemblePrompt({
    state: started.state,
    userMessage: content,
  })
  return augmentWorkflowPrompt(started.state, prompt.content)
}

async function resolveWorkflowDefaultModel(sessionId: string): Promise<{
  providerId: string | null
  modelId: string | null
}> {
  const runtime = await getRuntimeSettings(sessionId)
  return {
    providerId: runtime.providerId ?? null,
    modelId: runtime.model ?? null,
  }
}

function augmentWorkflowPrompt(state: WorkflowSessionState, content: string): string {
  const sections = [content]
  const model = getVisibleWorkflowModelResolution(state)
  if (model) {
    sections.push([
      'Workflow model provenance',
      `Requested model: ${model.requestedModel ?? '(none)'}`,
      `Actual model: ${model.actualModel ?? '(none)'}`,
      `Provider id: ${model.providerId ?? '(official)'}`,
      `Model source: ${model.source}`,
      `Fallback applied: ${model.fallbackApplied ? 'yes' : 'no'}`,
      model.fallbackReason ? `Fallback reason: ${model.fallbackReason}` : '',
    ].filter(Boolean).join('\n'))
  }
  const toolGuidance = getWorkflowPromptToolGuidance(state)
  if (toolGuidance) sections.push(toolGuidance)
  return sections.join('\n\n')
}

function getVisibleWorkflowModelResolution(state: WorkflowSessionState): WorkflowModelResolution | undefined {
  const resolution = state.activeModelResolution
  if (isWorkflowModelResolution(resolution)) return resolution

  const activePhase = state.activePhaseId
    ? state.phases.find((phase) => phase.id === state.activePhaseId)
    : undefined
  if (
    activePhase &&
    (
      activePhase.requestedModel !== undefined ||
      activePhase.actualModel !== undefined ||
      activePhase.fallbackReason !== undefined ||
      activePhase.blockedReason !== undefined
    )
  ) {
    return {
      requestedModel: activePhase.requestedModel ?? null,
      actualModel: activePhase.actualModel ?? null,
      providerId: null,
      source: activePhase.actualModel ? 'phase-request' : 'none',
      fallbackApplied: Boolean(activePhase.fallbackReason),
      fallbackReason: activePhase.fallbackReason ?? null,
      resolvedAt: state.updatedAt,
    }
  }

  return undefined
}

function isWorkflowModelResolution(value: unknown): value is WorkflowModelResolution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    (typeof record.requestedModel === 'string' || record.requestedModel === null) &&
    (typeof record.actualModel === 'string' || record.actualModel === null) &&
    (typeof record.providerId === 'string' || record.providerId === null) &&
    (
      record.source === 'phase-request' ||
      record.source === 'main-session-default' ||
      record.source === 'none'
    ) &&
    typeof record.fallbackApplied === 'boolean' &&
    (typeof record.fallbackReason === 'string' || record.fallbackReason === null) &&
    typeof record.resolvedAt === 'string'
  )
}

function isE2ETestModeEnabled(): boolean {
  return process.env.CC_JIANGXIA_E2E_TEST_MODE === '1'
}

function handleE2ETestPermissionRequest(
  ws: ServerWebSocket<WebSocketData>,
  message: Extract<ClientMessage, { type: 'e2e_test_permission_request' }>,
): void {
  if (!isE2ETestModeEnabled()) {
    sendError(ws, 'E2E WebSocket controls are disabled.', 'E2E_TEST_MODE_DISABLED')
    return
  }
  e2eTestPermissionRequestIds.add(message.requestId)
  broadcastServerMessageToSession(ws.data.sessionId, {
    type: 'tool_use_complete',
    toolName: 'AskUserQuestion',
    toolUseId: message.toolUseId,
    input: message.input,
  })
  broadcastServerMessageToSession(ws.data.sessionId, {
    type: 'permission_request',
    requestId: message.requestId,
    toolName: 'AskUserQuestion',
    toolUseId: message.toolUseId,
    input: message.input,
  })
}

function handleE2ETestPermissionResponseAck(
  ws: ServerWebSocket<WebSocketData>,
  message: Extract<ClientMessage, { type: 'e2e_test_permission_response_ack' }>,
): void {
  if (!isE2ETestModeEnabled()) {
    sendError(ws, 'E2E WebSocket controls are disabled.', 'E2E_TEST_MODE_DISABLED')
    return
  }
  broadcastServerMessageToSession(ws.data.sessionId, {
    type: 'permission_response_ack',
    requestId: message.requestId,
    status: message.status,
    ...(message.message ? { message: message.message } : {}),
  })
}

async function handlePermissionResponse(
  ws: ServerWebSocket<WebSocketData>,
  message: Extract<ClientMessage, { type: 'permission_response' }>
) {
  const { sessionId } = ws.data
  if (isE2ETestModeEnabled() && e2eTestPermissionRequestIds.has(message.requestId)) {
    return
  }
  const askUserQuestionAnswer = isAskUserQuestionAnswer(message.updatedInput)
  const workflowChoice = workflowChoiceActionFromInput(message.updatedInput)
  if (workflowChoice && askUserQuestionAnswer) {
    const choiceResult = await handleWorkflowChoiceAction(ws, message.requestId, message.updatedInput as Record<string, unknown>, workflowChoice)
    if (choiceResult === 'handled' || choiceResult === 'stale') return
  }

  const delivered = askUserQuestionAnswer
    ? await enqueueWorkflowSessionTransition(sessionId, async () => {
        await recordWorkflowAskUserQuestionAnswer(sessionId, message.requestId, message.updatedInput as Record<string, unknown>)
        return conversationService.respondToPermission(
          sessionId,
          message.requestId,
          message.allowed,
          message.rule,
          message.updatedInput,
        )
      })
    : conversationService.respondToPermission(
        sessionId,
        message.requestId,
        message.allowed,
        message.rule,
        message.updatedInput,
      )
  if (!delivered && askUserQuestionAnswer) {
    sendMessage(ws, {
      type: 'permission_response_ack',
      requestId: message.requestId,
      status: 'rejected',
      message: 'The structured answer could not be delivered because the CLI session is not running.',
    })
    sendMessage(ws, {
      type: 'error',
      message: 'The structured answer could not be delivered because the CLI session is not running.',
      code: 'CLI_NOT_RUNNING',
    })
    sendMessage(ws, { type: 'status', state: 'idle' })
    return
  }
  sendMessage(ws, { type: 'permission_response_ack', requestId: message.requestId, status: 'accepted' })
  console.log(`[WS] Permission response for ${message.requestId}: ${message.allowed}`)
}

function askUserQuestionPrompts(input: unknown): Array<{ id?: string; question?: string; header?: string; blocksCompletion?: boolean }> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  const questions = (input as Record<string, unknown>).questions
  if (!Array.isArray(questions)) return []
  return questions.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : undefined
    const question = typeof record.question === 'string' ? record.question : undefined
    const header = typeof record.header === 'string' ? record.header : undefined
    const options = Array.isArray(record.options) ? record.options : Array.isArray(record.choices) ? record.choices : []
    const hasWorkflowAction = options.some((option) => (
      option && typeof option === 'object' && !Array.isArray(option)
      && typeof (option as Record<string, unknown>).action !== 'undefined'
    ))
    return id || question || header ? [{ id, question, header, blocksCompletion: !hasWorkflowAction }] : []
  })
}

type WorkflowQuestionContext = {
  sessionId: string
  phaseId: string
  stateVersion: number
  requestId: string
  toolUseId?: string
  issues: Array<{ issueId: string; questionId: string }>
}

function workflowQuestionContextForRequest(
  state: WorkflowSessionState,
  request: Extract<ServerMessage, { type: 'permission_request' }>,
): WorkflowQuestionContext | null {
  if (!state.activePhaseId || !state.runtimeContract) return null
  const phaseState = state.runtimeContract.phaseStates[state.activePhaseId]
  if (!phaseState) return null
  const issues = phaseState.issues.flatMap((issue) => {
    if (issue.source !== 'ask-user-question' || issue.status !== 'open' || issue.questionRequestId !== request.requestId || !issue.questionId) return []
    return [{ issueId: issue.id, questionId: issue.questionId }]
  })
  if (!issues.length) return null
  return {
    sessionId: state.sessionId,
    phaseId: state.activePhaseId,
    stateVersion: state.stateVersion,
    requestId: request.requestId,
    ...(request.toolUseId ? { toolUseId: request.toolUseId } : {}),
    issues,
  }
}

function requestWithWorkflowQuestionContext(
  request: Extract<ServerMessage, { type: 'permission_request' }>,
  context: WorkflowQuestionContext | null,
): Extract<ServerMessage, { type: 'permission_request' }> {
  if (!context || !request.input || typeof request.input !== 'object' || Array.isArray(request.input)) return request
  return { ...request, input: { ...(request.input as Record<string, unknown>), workflowQuestionContext: context } }
}

async function appendWorkflowStateMetadata(
  sessionId: string,
  state: WorkflowSessionState,
  pointer: ReturnType<typeof stateToWorkflowMetadata>['statePointer'],
): Promise<void> {
  const workDir = conversationService.getSessionWorkDir(sessionId)
    || await sessionService.getSessionWorkDir(sessionId).catch(() => null)
  if (!workDir) return
  await sessionService.appendSessionMetadata(sessionId, {
    workDir,
    workflow: stateToWorkflowMetadata(state, pointer),
  })
}

async function recordWorkflowAskUserQuestion(
  sessionId: string,
  request: Extract<ServerMessage, { type: 'permission_request' }>,
): Promise<Extract<ServerMessage, { type: 'permission_request' }>> {
  if (request.toolName !== 'AskUserQuestion') return request
  const questions = askUserQuestionPrompts(request.input)
  if (!questions.length) return request

  const stateRead = await workflowSessionStateService.readState(sessionId)
  if (!stateRead.exists || !stateRead.state || !isWorkflowSessionState(stateRead.state)) return request
  const now = new Date().toISOString()
  const candidate = recordAskUserQuestionIssue(stateRead.state, {
    requestId: request.requestId,
    ...(request.toolUseId ? { toolUseId: request.toolUseId } : {}),
    questions,
    now,
  })
  if (candidate === stateRead.state) return request

  const written = await workflowSessionStateService.updateState(
    sessionId,
    () => candidate,
    { expectedStateVersion: stateRead.state.stateVersion },
  )
  await appendWorkflowStateMetadata(sessionId, written.state, written.pointer)
  sendToSession(sessionId, workflowNotificationForDesktop({
    type: 'system_notification',
    subtype: 'workflow_state',
    data: written.state,
  }) as ServerMessage)
  return requestWithWorkflowQuestionContext(request, workflowQuestionContextForRequest(written.state, request))
}

async function recordWorkflowAskUserQuestionAnswer(
  sessionId: string,
  requestId: string,
  input: Record<string, unknown>,
): Promise<void> {
  const stateRead = await workflowSessionStateService.readState(sessionId)
  if (!stateRead.exists || !stateRead.state || !isWorkflowSessionState(stateRead.state)) return
  const answers = input.answers
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return

  const candidate = recordAskUserQuestionAnswer(stateRead.state, {
    requestId,
    answers: answers as Record<string, unknown>,
    now: new Date().toISOString(),
  })
  if (candidate === stateRead.state) return

  const written = await workflowSessionStateService.updateState(
    sessionId,
    () => candidate,
    { expectedStateVersion: stateRead.state.stateVersion },
  )
  await appendWorkflowStateMetadata(sessionId, written.state, written.pointer)
  sendToSession(sessionId, workflowNotificationForDesktop({
    type: 'system_notification',
    subtype: 'workflow_state',
    data: written.state,
  }) as ServerMessage)
}

type WorkflowRouteChoiceAction = {
  kind: 'workflow-route'
  intent: 'advance' | 'rework_current_phase' | 'jump_to_phase' | 'pause' | 'resume' | 'finish'
  targetPhaseId?: string
}

type WorkflowChoiceAction = {
  questionId: string
  choiceId: string
  action: 'advance_phase' | 'return_to_phase' | 'rework_current_phase' | 'jump_to_phase' | 'workflow_route' | 'pause_workflow' | WorkflowRouteChoiceAction
  targetPhaseId?: string
  metadata?: Record<string, unknown>
}

function workflowChoiceActionFromInput(input: unknown): WorkflowChoiceAction | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const actions = (input as Record<string, unknown>).workflowChoiceActions
  if (!Array.isArray(actions) || actions.length !== 1) return null
  const candidate = actions[0]
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
  const record = candidate as Record<string, unknown>
  if (typeof record.questionId !== 'string' || typeof record.choiceId !== 'string') return null
  const action = record.action
  const legacy = action === 'advance_phase'
    || action === 'return_to_phase'
    || action === 'rework_current_phase'
    || action === 'jump_to_phase'
    || action === 'workflow_route'
    || action === 'pause_workflow'
  const structured = action && typeof action === 'object' && !Array.isArray(action)
    && (action as Record<string, unknown>).kind === 'workflow-route'
    && typeof (action as Record<string, unknown>).intent === 'string'
  if (!legacy && !structured) return null
  const targetPhaseId = typeof record.targetPhaseId === 'string'
    ? record.targetPhaseId
    : structured && typeof (action as Record<string, unknown>).targetPhaseId === 'string'
      ? (action as Record<string, unknown>).targetPhaseId as string
      : undefined
  if ((action === 'jump_to_phase' || (structured && (action as Record<string, unknown>).intent === 'jump_to_phase')) && !targetPhaseId) return null
  return {
    questionId: record.questionId,
    choiceId: record.choiceId,
    action: action as WorkflowChoiceAction['action'],
    ...(targetPhaseId ? { targetPhaseId } : {}),
    ...(record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
      ? { metadata: record.metadata as Record<string, unknown> }
      : {}),
  }
}

function routeIntentForChoice(choice: WorkflowChoiceAction): WorkflowRouteChoiceAction['intent'] | null {
  if (typeof choice.action === 'object') return choice.action.intent
  if (choice.action === 'advance_phase') return 'advance'
  if (choice.action === 'return_to_phase' || choice.action === 'rework_current_phase') return 'rework_current_phase'
  if (choice.action === 'jump_to_phase') return 'jump_to_phase'
  return null
}

function workflowQuestionContextFromInput(input: Record<string, unknown>): WorkflowQuestionContext | null {
  const candidate = input.workflowQuestionContext
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
  const record = candidate as Record<string, unknown>
  if (
    typeof record.sessionId !== 'string'
    || typeof record.phaseId !== 'string'
    || typeof record.stateVersion !== 'number'
    || typeof record.requestId !== 'string'
    || !Array.isArray(record.issues)
  ) return null
  const issues = record.issues.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const issue = item as Record<string, unknown>
    return typeof issue.issueId === 'string' && typeof issue.questionId === 'string'
      ? [{ issueId: issue.issueId, questionId: issue.questionId }]
      : []
  })
  if (!issues.length) return null
  return {
    sessionId: record.sessionId,
    phaseId: record.phaseId,
    stateVersion: record.stateVersion,
    requestId: record.requestId,
    ...(typeof record.toolUseId === 'string' ? { toolUseId: record.toolUseId } : {}),
    issues,
  }
}

function isCurrentWorkflowChoiceQuestion(
  state: WorkflowSessionState,
  requestId: string,
  input: Record<string, unknown>,
  choice: WorkflowChoiceAction,
): boolean {
  const context = workflowQuestionContextFromInput(input)
  if (
    !context
    || context.sessionId !== state.sessionId
    || context.requestId !== requestId
    || context.phaseId !== state.activePhaseId
    || context.stateVersion !== state.stateVersion
  ) return false
  const boundIssue = context.issues.find((issue) => issue.questionId === choice.questionId)
  if (!boundIssue || !state.activePhaseId || !state.runtimeContract) return false
  const phaseState = state.runtimeContract.phaseStates[state.activePhaseId]
  return Boolean(phaseState?.issues.some((issue) => (
    issue.id === boundIssue.issueId
    && issue.source === 'ask-user-question'
    && issue.status === 'open'
    && issue.sessionId === state.sessionId
    && issue.phaseId === state.activePhaseId
    && issue.questionRequestId === requestId
    && issue.questionId === choice.questionId
  )))
}

async function handleWorkflowChoiceAction(
  ws: ServerWebSocket<WebSocketData>,
  requestId: string,
  input: Record<string, unknown>,
  choice: WorkflowChoiceAction,
): Promise<'handled' | 'fallback-to-answer' | 'stale'> {
  const { sessionId } = ws.data
  const state = await loadWorkflowStateForWebSocket(sessionId)
  if (!state) {
    sendMessage(ws, {
      type: 'permission_response_ack',
      requestId,
      status: 'rejected',
      message: 'The workflow choice cannot run because workflow state is unavailable.',
    })
    sendMessage(ws, {
      type: 'error',
      code: 'WORKFLOW_STATE_UNAVAILABLE',
      message: 'The workflow choice cannot run because workflow state is unavailable.',
    })
    return 'handled'
  }
  if (!isCurrentWorkflowChoiceQuestion(state, requestId, input, choice)) {
    sendMessage(ws, {
      type: 'permission_response_ack',
      requestId,
      status: 'stale',
      message: 'This workflow question has expired because the workflow state changed. Choose from the current workflow question instead.',
    })
    return 'stale'
  }

  const routeIntent = routeIntentForChoice(choice)
  if (routeIntent) {
    const hasPendingCompletion = state.pendingConfirmation?.status === 'pending'
    const activePhase = state.activePhaseId
      ? state.phases.find((phase) => phase.id === state.activePhaseId)
      : null
    const isBlockedRecovery = Boolean(
      state.runStatus === 'blocked'
      && !state.pendingConfirmation
      && activePhase?.blockedReason
      && (routeIntent === 'rework_current_phase' || routeIntent === 'jump_to_phase'),
    )
    if (!hasPendingCompletion && !isBlockedRecovery) {
      return 'fallback-to-answer'
    }
    await applyWorkflowTransitionMessage(ws, {
      type: 'workflow_transition',
      phaseId: state.activePhaseId ?? state.pendingConfirmation?.phaseId ?? 'workflow',
      action: 'route',
      routeIntent,
      targetPhaseId: choice.targetPhaseId,
      rationale: typeof choice.metadata?.rationale === 'string' ? choice.metadata.rationale : 'User selected a workflow route.',
      evidence: [],
      requireUserConfirmation: false,
      stateVersion: state.stateVersion,
      transitionId: 'ask-user-question:' + choice.questionId + ':' + choice.choiceId + ':' + state.stateVersion,
    } as WorkflowBoundaryTransitionMessage)
    sendMessage(ws, { type: 'permission_response_ack', requestId, status: 'accepted' })
    return 'handled'
  }
  if (choice.action !== 'pause_workflow') return 'fallback-to-answer'
  await applyWorkflowTransitionMessage(ws, {
    type: 'workflow_transition',
    phaseId: state.activePhaseId ?? 'workflow',
    action: 'pause',
    stateVersion: state.stateVersion,
    transitionId: 'ask-user-question:' + choice.questionId + ':' + choice.choiceId + ':' + state.stateVersion,
  } as WorkflowBoundaryTransitionMessage)
  sendMessage(ws, { type: 'permission_response_ack', requestId, status: 'accepted' })
  return 'handled'
}

function isAskUserQuestionAnswer(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const record = input as Record<string, unknown>
  return Array.isArray(record.questions) && Boolean(record.answers && typeof record.answers === 'object')
}

function handleComputerUsePermissionResponse(
  ws: ServerWebSocket<WebSocketData>,
  message: Extract<ClientMessage, { type: 'computer_use_permission_response' }>
) {
  const { sessionId } = ws.data
  const ok = computerUseApprovalService.resolveApproval(
    message.requestId,
    message.response,
  )
  if (!ok) {
    console.warn(
      `[WS] Ignored Computer Use permission response for unknown request ${message.requestId} from ${sessionId}`
    )
  }
}

function handleSetPermissionMode(
  ws: ServerWebSocket<WebSocketData>,
  message: Extract<ClientMessage, { type: 'set_permission_mode' }>
) {
  const { sessionId } = ws.data

  // Switching to/from bypassPermissions requires the CLI to be (re)started with
  // --dangerously-skip-permissions. The CLI rejects a runtime set_permission_mode
  // to bypassPermissions if it wasn't launched with that flag.  Rather than just
  // sending the SDK message (which would silently fail), restart the CLI subprocess
  // with the correct arguments so the new permission mode takes effect.
  const needsRestart =
    conversationService.hasSession(sessionId) &&
    (message.mode === 'bypassPermissions' || conversationService.getSessionPermissionMode(sessionId) === 'bypassPermissions')

  if (needsRestart) {
    void enqueueRuntimeTransition(sessionId, () =>
      restartSessionWithPermissionMode(ws, sessionId, message.mode),
    )
    return
  }

  const ok = conversationService.setPermissionMode(sessionId, message.mode)
  if (!ok) {
    console.warn(`[WS] Ignored permission mode update for inactive session ${sessionId}`)
  }
}

async function handleWorkflowTransition(
  ws: ServerWebSocket<WebSocketData>,
  message: Extract<ClientMessage, { type: 'workflow_transition' }>,
) {
  try {
    await enqueueWorkflowSessionTransition(ws.data.sessionId, () =>
      applyWorkflowTransitionMessage(ws, normalizeWorkflowTransitionMessage(message)),
    )
  } catch (error) {
    await sendWorkflowErrorWithAuthoritativeState(ws, error)
  }
}

async function applyWorkflowTransitionMessage(
  ws: ServerWebSocket<WebSocketData>,
  message: WorkflowBoundaryTransitionMessage,
) {
  const { sessionId } = ws.data
  if (!isWorkflowTransitionRequest(message)) {
    sendMessage(ws, {
      type: 'error',
      code: 'WORKFLOW_TRANSITION_INVALID',
      message: 'Workflow transition is invalid.',
    })
    return
  }

  const workflow = await getWorkflowMetadata(sessionId)
  if (!workflow && !sessionId.startsWith('workflow-')) {
    sendMessage(ws, {
      type: 'error',
      code: 'WORKFLOW_NOT_ENABLED',
      message: 'Workflow mode is not enabled for this session.',
    })
    return
  }

  const state = await loadWorkflowStateForWebSocket(sessionId)
  if (!state) {
    sendMessage(ws, {
      type: 'error',
      code: 'WORKFLOW_STATE_UNAVAILABLE',
      message: 'Workflow state is unavailable for this session.',
    })
    return
  }

  const result = await applyWorkflowBoundaryTransition(state, message, new Date().toISOString())

  await persistWorkflowStateIfAvailable(sessionId, result.state, state.stateVersion)
  for (const notification of result.notifications) {
    sendMessage(ws, workflowNotificationForDesktop(notification) as ServerMessage)
  }
  const workflowResumeInstruction = getWorkflowResumeInstructionAfterTransition(state, result.state, message)
    ?? getWorkflowResumeInstructionAfterCompletion(result.state, message)
  if (message.action !== 'pause' && conversationService.hasSession(sessionId)) {
    await enqueueRuntimeTransition(sessionId, () =>
      restartSessionWithWorkflowPolicy(ws, sessionId, result.state),
    )
  } else if (workflowResumeInstruction) {
    await ensureCliSessionStarted(ws, sessionId, 'workflow_auto_continue')
  }
  if (workflowResumeInstruction) {
    await sendWorkflowResumeTurn(ws, sessionId, result.state, workflowResumeInstruction)
  }
}

type WorkflowBoundaryTransitionMessage = Extract<ClientMessage, { type: 'workflow_transition' }> & {
  action: WorkflowTransitionRequest['action'] | CompletionSubmission['status'] | 'manual_complete'
  stateVersion?: number
  expectedStateVersion?: number
  handoff?: unknown
  rationale?: unknown
  evidence?: unknown
}

type WorkflowBoundaryTransitionResult = {
  state: WorkflowSessionState
  notifications: Array<Record<string, unknown>>
}

async function applyWorkflowBoundaryTransition(
  state: WorkflowSessionState,
  message: WorkflowBoundaryTransitionMessage,
  requestedAt: string,
): Promise<WorkflowBoundaryTransitionResult> {
  if (message.action === 'route') {
    if (!message.routeIntent || typeof message.rationale !== 'string' || !Array.isArray(message.evidence)) {
      throw new ApiError(400, 'Workflow route requires routeIntent, rationale, and evidence.', 'WORKFLOW_ROUTE_INVALID')
    }
    const result = await workflowRuntimeService.requestWorkflowRoute({
      state,
      requestedAt,
      transitionId: message.transitionId,
      request: {
        phaseId: message.phaseId,
        stateVersion: message.stateVersion,
        intent: message.routeIntent,
        targetPhaseId: message.targetPhaseId,
        rationale: message.rationale,
        evidence: message.evidence,
        requireUserConfirmation: message.requireUserConfirmation,
      },
    })
    return { state: result.state, notifications: result.notifications }
  }

  if (isCompletionSubmissionAction(message.action)) {
    const submission = toCompletionSubmission(message)
    const result = message.action === 'manual_complete'
      ? await workflowRuntimeService.submitManualCompletion({
        state,
        submission,
        requestedAt,
        transitionId: message.transitionId,
        nextPhaseContextStrategy: message.nextPhaseContextStrategy,
      })
      : await workflowRuntimeService.submitPhaseCompletion({
        state,
        submission,
        requestedAt,
        transitionId: message.transitionId,
      })
    return { state: result.state, notifications: result.notifications }
  }

  return await workflowRuntimeService.applyTransition({
    state,
    request: message as WorkflowTransitionRequest,
    requestedAt,
  })
}

function normalizeWorkflowTransitionMessage(
  message: Extract<ClientMessage, { type: 'workflow_transition' }>,
): WorkflowBoundaryTransitionMessage {
  if (typeof message.stateVersion === 'number') return message as WorkflowBoundaryTransitionMessage
  if (typeof message.expectedStateVersion === 'number') {
    return { ...message, stateVersion: message.expectedStateVersion } as WorkflowBoundaryTransitionMessage
  }
  return message as WorkflowBoundaryTransitionMessage
}

function isCompletionSubmissionAction(action: unknown): action is CompletionSubmission['status'] | 'manual_complete' {
  return action === 'ready' || action === 'needs_user' || action === 'completed' || action === 'blocked' || action === 'unable' || action === 'manual_complete'
}

function isSupportedNextPhaseContextStrategy(
  strategy: unknown,
): strategy is WorkflowTransitionRequest['nextPhaseContextStrategy'] | undefined {
  return strategy === undefined || strategy === 'inherit' || strategy === 'clear'
}

function toCompletionSubmission(message: WorkflowBoundaryTransitionMessage): CompletionSubmission {
  return {
    phaseId: message.phaseId,
    stateVersion: message.stateVersion as number,
    status: message.action === 'manual_complete' ? 'ready' : message.action as CompletionSubmission['status'],
    handoff: message.handoff as CompletionSubmission['handoff'],
    rationale: message.rationale as string,
    evidence: message.evidence as CompletionSubmission['evidence'],
  }
}

function getWorkflowResumeInstructionAfterCompletion(
  state: WorkflowSessionState,
  message: WorkflowBoundaryTransitionMessage,
): string | null {
  if (
    message.action === 'completed'
    && state.workflowStatus === 'running'
    && state.runStatus === 'active'
    && Boolean(state.activePhaseId)
    && !state.pendingConfirmation
  ) {
    return `Continue automatically with the workflow phase that was advanced by the completed phase submission: ${state.activePhaseId}.`
  }
  return null
}

function getWorkflowResumeInstructionAfterTransition(
  previousState: WorkflowSessionState,
  nextState: WorkflowSessionState,
  message: WorkflowBoundaryTransitionMessage,
): string | null {
  const phaseId = nextState.activePhaseId
  if (
    message.action === 'confirm'
    && nextState.workflowStatus === 'running'
    && Boolean(phaseId)
    && phaseId !== previousState.activePhaseId
    && !nextState.pendingConfirmation
  ) {
    return `Continue automatically with the newly confirmed workflow phase: ${phaseId}.`
  }

  if (
    message.action === 'route'
    && nextState.workflowStatus === 'running'
    && Boolean(phaseId)
    && !nextState.pendingConfirmation
    && !nextState.pendingRoute
  ) {
    return `Continue automatically with the workflow route target phase: ${phaseId}.`
  }

  if (
    message.action === 'reject'
    && nextState.workflowStatus === 'running'
    && Boolean(phaseId)
    && phaseId === previousState.activePhaseId
    && !nextState.pendingConfirmation
  ) {
    return [
      `The user rejected the completion result for the current workflow phase: ${phaseId}.`,
      'Do not advance the workflow phase.',
      'Immediately use AskUserQuestion to ask what the user wants to adjust in this phase.',
      'Offer concise, phase-appropriate choices and wait for the answer before revising the phase result.',
    ].join(' ')
  }

  return null
}

async function sendWorkflowResumeTurn(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  state: WorkflowSessionState,
  userMessage: string,
): Promise<void> {
  if (!conversationService.hasSession(sessionId)) return

  const phaseId = state.activePhaseId ?? 'active'
  sendMessage(ws, { type: 'status', state: 'thinking', verb: 'Thinking' })
  bindAllClientSessionOutputs(sessionId)

  const defaultModel = await resolveWorkflowDefaultModel(sessionId)
  const started = await workflowRuntimeService.startPhase({
    state,
    requestedAt: new Date().toISOString(),
    resolveDefaultModel: async () => defaultModel,
    isRequestedModelAvailable: async (modelId) => defaultModel.modelId === modelId,
  })

  await persistWorkflowStateIfAvailable(sessionId, started.state, state.stateVersion)
  for (const notification of started.notifications) {
    sendMessage(ws, workflowNotificationForDesktop(notification) as ServerMessage)
  }
  if (started.state.workflowStatus === 'failed') {
    sendMessage(ws, { type: 'status', state: 'idle' })
    return
  }

  const prompt = await workflowRuntimeService.assemblePrompt({
    state: started.state,
    userMessage,
  })
  const resolvedMessage = augmentWorkflowPrompt(started.state, prompt.content)

  const sent = conversationService.sendMessage(sessionId, resolvedMessage)
  if (!sent) {
    sendMessage(ws, {
      type: 'error',
      message: 'CLI process is not running after workflow transition confirmation.',
      code: 'CLI_NOT_RUNNING',
    })
    sendMessage(ws, { type: 'status', state: 'idle' })
  }
}

async function sendWorkflowErrorWithAuthoritativeState(
  ws: ServerWebSocket<WebSocketData>,
  error: unknown,
): Promise<void> {
  const code = error instanceof ApiError ? error.code : undefined
  if (code === 'WORKFLOW_STATE_STALE' || code === 'WORKFLOW_CONFIRMATION_SUPERSEDED') {
    const state = await loadWorkflowStateForWebSocket(ws.data.sessionId)
    if (state) {
      sendMessage(ws, workflowNotificationForDesktop({
        type: 'system_notification',
        subtype: 'workflow_state',
        data: state,
      }) as ServerMessage)
    }
  }
  sendWorkflowError(ws, error)
}

function sendWorkflowError(ws: ServerWebSocket<WebSocketData>, error: unknown): void {
  if (error instanceof ApiError) {
    sendMessage(ws, {
      type: 'error',
      code: error.code || 'WORKFLOW_TRANSITION_INVALID',
      message: error.message,
    })
    return
  }

  sendMessage(ws, {
    type: 'error',
    code: 'WORKFLOW_TRANSITION_INVALID',
    message: error instanceof Error ? error.message : 'Workflow transition failed.',
  })
}

async function handleSetRuntimeConfig(
  ws: ServerWebSocket<WebSocketData>,
  message: Extract<ClientMessage, { type: 'set_runtime_config' }>
) {
  const { sessionId } = ws.data
  const modelId = typeof message.modelId === 'string' ? message.modelId.trim() : ''
  if (!modelId) {
    sendMessage(ws, {
      type: 'error',
      message: 'Runtime model selection is invalid.',
      code: 'RUNTIME_CONFIG_INVALID',
    })
    return
  }

  const nextOverride = {
    providerId: message.providerId ?? null,
    modelId,
  }
  const prevOverride = runtimeOverrides.get(sessionId)
  runtimeOverrides.set(sessionId, nextOverride)
  const forceRestart = message.force === true

  if (
    !forceRestart &&
    prevOverride &&
    prevOverride.providerId === nextOverride.providerId &&
    prevOverride.modelId === nextOverride.modelId
  ) {
    return
  }

  if (!conversationService.hasSession(sessionId)) {
    const pendingStartup = sessionStartupPromises.get(sessionId)
    if (pendingStartup) {
      await enqueueRuntimeTransition(sessionId, async () => {
        await pendingStartup.catch(() => undefined)
        const currentOverride = runtimeOverrides.get(sessionId)
        if (
          currentOverride?.providerId !== nextOverride.providerId ||
          currentOverride.modelId !== nextOverride.modelId ||
          !conversationService.hasSession(sessionId)
        ) {
          return
        }
        await restartSessionWithRuntimeConfig(ws, sessionId, prevOverride)
      })
    }
    return
  }

  await enqueueRuntimeTransition(sessionId, () =>
    restartSessionWithRuntimeConfig(ws, sessionId, prevOverride),
  )
}

async function restartSessionWithPermissionMode(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  mode: string,
): Promise<void> {
  try {
    // Persist the new mode first so it's read on restart
    await settingsService.setPermissionMode(mode)

    const workDir = conversationService.getSessionWorkDir(sessionId)
    await conversationService.stopSessionAndWait(sessionId)

    // Rebuild runtime settings (will pick up the persisted mode)
    const runtimeSettings = await getRuntimeSettings(sessionId)
    const sessionSettings = await getRuntimeSettingsWithWorkflowPolicy(sessionId, runtimeSettings)
    const sdkUrl =
      `ws://${ws.data.serverHost}:${ws.data.serverPort}/sdk/${sessionId}` +
      `?token=${encodeURIComponent(crypto.randomUUID())}`
    await conversationService.startSession(sessionId, workDir, sdkUrl, sessionSettings)

    sendMessage(ws, { type: 'status', state: 'idle' })
    console.log(`[WS] Restarted CLI for ${sessionId} with permission mode: ${mode}`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    void diagnosticsService.recordEvent({
      type: 'permission_restart_failed',
      severity: 'error',
      sessionId,
      summary: errMsg,
      details: { mode, error: err },
    })
    console.error(`[WS] Failed to restart CLI for ${sessionId}: ${errMsg}`)
    sendMessage(ws, {
      type: 'error',
      message: await buildSessionStartupDiagnosticMessage(
        sessionId,
        `Failed to restart session with new permission mode: ${errMsg}`,
      ),
      code: 'CLI_RESTART_FAILED',
    })
    sendMessage(ws, { type: 'status', state: 'idle' })
  }
}

async function restartSessionWithRuntimeConfig(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  previousOverride: RuntimeOverride | undefined,
): Promise<void> {
  try {
    const workDir = conversationService.getSessionWorkDir(sessionId)
    await conversationService.stopSessionAndWait(sessionId)

    const runtimeSettings = await getRuntimeSettings(sessionId)
    const sessionSettings = await getRuntimeSettingsWithWorkflowPolicy(sessionId, runtimeSettings)
    const sdkUrl =
      `ws://${ws.data.serverHost}:${ws.data.serverPort}/sdk/${sessionId}` +
      `?token=${encodeURIComponent(crypto.randomUUID())}`
    await conversationService.startSession(sessionId, workDir, sdkUrl, sessionSettings)

    sendMessage(ws, { type: 'status', state: 'idle' })
    console.log(`[WS] Restarted CLI for ${sessionId} with runtime override`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    void diagnosticsService.recordEvent({
      type: 'runtime_config_restart_failed',
      severity: 'error',
      sessionId,
      summary: errMsg,
      details: { runtimeOverride: runtimeOverrides.get(sessionId), error: err },
    })
    console.error(`[WS] Failed to restart CLI for ${sessionId} after runtime override: ${errMsg}`)
    const diagnosticMessage = await buildSessionStartupDiagnosticMessage(
      sessionId,
      `Failed to switch provider/model: ${errMsg}`,
    )
    restoreRuntimeOverride(sessionId, previousOverride)
    sendMessage(ws, {
      type: 'error',
      message: diagnosticMessage,
      code: 'CLI_RESTART_FAILED',
    })
    sendMessage(ws, { type: 'status', state: 'idle' })
  }
}

async function restartSessionWithWorkflowPolicy(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  state: WorkflowSessionState,
): Promise<boolean> {
  try {
    const workDir = conversationService.getSessionWorkDir(sessionId)
    await conversationService.stopSessionAndWait(sessionId)

    const runtimeSettings = await getRuntimeSettings(sessionId)
    const sessionSettings = await getRuntimeSettingsWithWorkflowPolicy(sessionId, runtimeSettings, state)
    const sdkUrl =
      `ws://${ws.data.serverHost}:${ws.data.serverPort}/sdk/${sessionId}` +
      `?token=${encodeURIComponent(crypto.randomUUID())}`
    await conversationService.startSession(sessionId, workDir, sdkUrl, sessionSettings)
    bindAllClientSessionOutputs(sessionId)

    sendMessage(ws, { type: 'status', state: 'idle' })
    console.log(`[WS] Restarted CLI for ${sessionId} with workflow tool policy`)
    return true
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    void diagnosticsService.recordEvent({
      type: 'workflow_policy_restart_failed',
      severity: 'error',
      sessionId,
      summary: errMsg,
      details: { activePhaseId: state.activePhaseId, error: err },
    })
    console.error(`[WS] Failed to restart CLI for ${sessionId} after workflow transition: ${errMsg}`)
    sendMessage(ws, {
      type: 'error',
      message: await buildSessionStartupDiagnosticMessage(
        sessionId,
        `Failed to apply workflow tool policy: ${errMsg}`,
      ),
      code: 'CLI_RESTART_FAILED',
    })
    sendMessage(ws, { type: 'status', state: 'idle' })
    return false
  }
}

/**
 * Rebind a live CLI after a same-session workflow run changes. Workflow-scoped
 * tools are registered at CLI startup from WORKFLOW_SESSION_ID, so retaining a
 * completed/non-workflow process would leave the new run without its protocol
 * tools and with stale phase permissions.
 */
export async function refreshWorkflowRuntimeBinding(
  sessionId: string,
  state: WorkflowSessionState,
): Promise<{
  status: 'not-running' | 'restarted' | 'stopped-without-client' | 'restart-failed'
}> {
  let result: {
    status: 'not-running' | 'restarted' | 'stopped-without-client' | 'restart-failed'
  } = { status: 'not-running' }

  await enqueueRuntimeTransition(sessionId, async () => {
    // A prewarm can still be spawning an unbound CLI when a workflow starts.
    // Wait for that startup before checking hasSession, then replace it with a
    // workflow-bound process. Returning early here leaves the first workflow
    // turn without submit_phase_completion/request_workflow_route.
    const pendingStartup = sessionStartupPromises.get(sessionId)
    if (pendingStartup) {
      await pendingStartup.catch(() => undefined)
    }
    if (!conversationService.hasSession(sessionId)) return

    const clients = activeSessions.get(sessionId)
    const client = clients?.values().next().value as ServerWebSocket<WebSocketData> | undefined
    if (!client) {
      // Fail closed: do not keep an old CLI alive with a tool surface from a
      // completed or different workflow run. A later client/user turn will
      // start a fresh process from the persisted workflow state.
      await conversationService.stopSessionAndWait(sessionId)
      result = { status: 'stopped-without-client' }
      return
    }

    result = {
      status: await restartSessionWithWorkflowPolicy(client, sessionId, state)
        ? 'restarted'
        : 'restart-failed',
    }
  })

  return result
}

function handleStopGeneration(ws: ServerWebSocket<WebSocketData>) {
  const { sessionId } = ws.data
  console.log(`[WS] Stop generation requested for session: ${sessionId}`)

  sessionStopRequested.add(sessionId)

  if (conversationService.hasSession(sessionId)) {
    const stopTarget = conversationService.getSessionProcessToken(sessionId)
    // First try graceful interrupt via SDK control message
    conversationService.sendInterrupt(sessionId)

    // Force-kill if still running after 3 seconds
    setTimeout(() => {
      if (conversationService.stopSessionIfCurrent(sessionId, stopTarget)) {
        console.log(`[WS] Force-killing CLI subprocess for session: ${sessionId}`)
      }
    }, 3_000)
  }

  sendMessage(ws, { type: 'status', state: 'idle' })
}

// ============================================================================
// Title generation
// ============================================================================

function triggerTitleGeneration(ws: ServerWebSocket<WebSocketData>, sessionId: string): void {
  const state = sessionTitleState.get(sessionId)
  if (!state || state.hasCustomTitle) return

  const count = state.userMessageCount

  // Generate on count 1 (first response) and count 3 (with more context)
  if (count !== 1 && count !== 3) return
  if (state.startedGenerationCounts.has(count)) return
  state.startedGenerationCounts.add(count)

  const text = count === 1
    ? state.firstUserMessage
    : state.allUserMessages.join('\n')
  const runtimeProviderId = runtimeOverrides.get(sessionId)?.providerId

  // Fire-and-forget: derive quick title, then upgrade with AI
  void (async () => {
    try {
      // Stage 1: quick placeholder (only on first message)
      if (count === 1) {
        const placeholder = deriveTitle(text)
        if (placeholder) {
          const saved = await saveAiTitle(sessionId, placeholder)
          if (!saved) {
            state.hasCustomTitle = true
            return
          }
          sendSessionTitleUpdated(ws, sessionId, placeholder)
        }
      }

      // Stage 2: AI-generated title
      const aiTitle = await generateTitle(text, runtimeProviderId)
      if (aiTitle) {
        const saved = await saveAiTitle(sessionId, aiTitle)
        if (!saved) {
          state.hasCustomTitle = true
          return
        }
        sendSessionTitleUpdated(ws, sessionId, aiTitle)
      }
    } catch (err) {
      console.error(`[Title] Failed to generate title for ${sessionId}:`, err)
    }
  })()
}

// ============================================================================
// CLI message translation
// ============================================================================

/**
 * Per-session streaming state to avoid cross-session interference.
 * Each session tracks its own dedup flag, active block types, and tool blocks.
 */
type SessionStreamState = {
  hasReceivedStreamEvents: boolean
  activeBlockTypes: Map<number, 'text' | 'tool_use' | 'thinking'>
  activeToolBlocks: Map<number, { toolName: string; toolUseId: string; inputJson: string; parentToolUseId?: string }>
  pendingLocalCommand?: { name: string; args: string }
  usedAskUserQuestion: boolean
  assistantText: string
  structuredInteractionRecoveryAttempts: number
  workflowProtocolToolRegistryError?: 'submit_phase_completion' | 'request_workflow_route'
  workflowProtocolBindingRecoveryAttempts: number
  workflowProtocolBindingRecoveryInFlight: boolean
  workflowProtocolInputValidationError?: WorkflowProtocolToolName
  workflowProtocolInputRecoveryAttempts: number
  /** Tool blocks whose input JSON failed to parse in content_block_stop.
   *  The assistant message carries the complete input — defer to that. */
  pendingToolBlocks: Map<string, { toolName: string; toolUseId: string; parentToolUseId?: string }>
  toolParentUseIds: Map<string, string>
  lastApiError?: {
    message: string
    code: string
  }
}

const sessionStreamStates = new Map<string, SessionStreamState>()

function getStreamState(sessionId: string): SessionStreamState {
  let state = sessionStreamStates.get(sessionId)
  if (!state) {
    state = {
      hasReceivedStreamEvents: false,
      activeBlockTypes: new Map(),
      activeToolBlocks: new Map(),
      pendingLocalCommand: undefined,
      usedAskUserQuestion: false,
      assistantText: '',
      structuredInteractionRecoveryAttempts: 0,
      workflowProtocolToolRegistryError: undefined,
      workflowProtocolBindingRecoveryAttempts: 0,
      workflowProtocolBindingRecoveryInFlight: false,
      workflowProtocolInputValidationError: undefined,
      workflowProtocolInputRecoveryAttempts: 0,
      pendingToolBlocks: new Map(),
      toolParentUseIds: new Map(),
      lastApiError: undefined,
    }
    sessionStreamStates.set(sessionId, state)
  }
  return state
}

function cliParentToolUseId(cliMsg: any): string | undefined {
  return typeof cliMsg.parent_tool_use_id === 'string' && cliMsg.parent_tool_use_id.length > 0
    ? cliMsg.parent_tool_use_id
    : undefined
}

function rememberToolParentUseId(
  streamState: SessionStreamState,
  toolUseId: string | undefined,
  parentToolUseId: string | undefined,
): void {
  if (!toolUseId || !parentToolUseId) return
  streamState.toolParentUseIds.set(toolUseId, parentToolUseId)
}

function consumeToolParentUseId(
  streamState: SessionStreamState,
  toolUseId: string | undefined,
): string | undefined {
  if (!toolUseId) return undefined
  const parentToolUseId = streamState.toolParentUseIds.get(toolUseId)
  streamState.toolParentUseIds.delete(toolUseId)
  return parentToolUseId
}

/** Clean up stream state when session disconnects */
function cleanupStreamState(sessionId: string) {
  sessionStreamStates.delete(sessionId)
}

function cleanupSessionRuntimeState(sessionId: string) {
  cleanupStreamState(sessionId)
  sessionSlashCommands.delete(sessionId)
  sessionTitleState.delete(sessionId)
  runtimeOverrides.delete(sessionId)
  runtimeTransitionPromises.delete(sessionId)
  sessionStartupPromises.delete(sessionId)
  lastResolvedStartupWorkDirs.delete(sessionId)
  clearPrewarmState(sessionId)
}

function getPrewarmIdleTimeoutMs(): number {
  const raw =
    process.env.CC_JIANGXIA_PREWARM_IDLE_TIMEOUT_MS ??
    process.env.CC_HAHA_PREWARM_IDLE_TIMEOUT_MS
  if (!raw) return DEFAULT_PREWARM_IDLE_TIMEOUT_MS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_PREWARM_IDLE_TIMEOUT_MS
}

function clearPrewarmState(sessionId: string) {
  prewarmPendingSessions.delete(sessionId)
  prewarmedSessions.delete(sessionId)
  const timer = prewarmIdleTimers.get(sessionId)
  if (timer) {
    clearTimeout(timer)
    prewarmIdleTimers.delete(sessionId)
  }
}

function markPrewarmed(sessionId: string) {
  prewarmedSessions.add(sessionId)
  const timeoutMs = getPrewarmIdleTimeoutMs()
  if (timeoutMs === 0) return

  const existingTimer = prewarmIdleTimers.get(sessionId)
  if (existingTimer) clearTimeout(existingTimer)

  const timer = setTimeout(() => {
    prewarmIdleTimers.delete(sessionId)
    if (!prewarmedSessions.has(sessionId)) return
    console.log(`[WS] Prewarmed session ${sessionId} idle for ${timeoutMs}ms, stopping CLI subprocess`)
    conversationService.stopSession(sessionId)
    prewarmedSessions.delete(sessionId)
  }, timeoutMs)
  prewarmIdleTimers.set(sessionId, timer)
}

function cacheSessionInitMetadata(sessionId: string, cliMsg: any) {
  if (cliMsg?.type !== 'system' || cliMsg.subtype !== 'init') return
  if (typeof cliMsg.cwd === 'string' && cliMsg.cwd.trim()) {
    conversationService.updateSessionWorkDir(sessionId, cliMsg.cwd)
    void (async () => {
      await sessionService.appendSessionMetadata(sessionId, {
        workDir: cliMsg.cwd,
      })
      await sessionService.deletePlaceholderSessionFiles(sessionId, cliMsg.cwd)
    })()
  }
  if (cliMsg.slash_commands && Array.isArray(cliMsg.slash_commands)) {
    updateSessionSlashCommands(sessionId, cliMsg.slash_commands, { notifyClient: false })
  }
}

function extractAssistantText(cliMsg: any): string {
  const content = cliMsg?.message?.content
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

type WorkflowInteractionTurn = {
  assistantText: string
  usedAskUserQuestion: boolean
  recoveryAttempts: number
}

type WorkflowTerminalRecovery = {
  state: WorkflowSessionState
  kind: 'ask-user-question' | 'continue-workflow'
}

function beginStreamedAssistantTurn(streamState: SessionStreamState): void {
  streamState.usedAskUserQuestion = false
  streamState.assistantText = ''
  streamState.workflowProtocolToolRegistryError = undefined
}

function recordAssistantText(streamState: SessionStreamState, text: unknown): void {
  if (typeof text !== 'string' || !text) return
  streamState.assistantText += text
}

function recordAssistantToolUse(streamState: SessionStreamState, toolName: unknown): void {
  if (toolName === 'AskUserQuestion') streamState.usedAskUserQuestion = true
  if (WORKFLOW_PROTOCOL_TOOL_NAMES.has(toolName as WorkflowProtocolToolName)) streamState.workflowProtocolInputValidationError = undefined
}

const WORKFLOW_PROTOCOL_TOOL_NAMES = new Set([
  'submit_phase_completion',
  'request_workflow_route',
] as const)

type WorkflowProtocolToolName = typeof WORKFLOW_PROTOCOL_TOOL_NAMES extends Set<infer T> ? T : never

function workflowProtocolToolNameFromError(value: unknown): WorkflowProtocolToolName | null {
  const text = typeof value === 'string' ? value : ''
  const match = /No such tool available:\s*(submit_phase_completion|request_workflow_route)\b/i.exec(text)
  if (!match || !WORKFLOW_PROTOCOL_TOOL_NAMES.has(match[1] as WorkflowProtocolToolName)) return null
  return match[1] as WorkflowProtocolToolName
}

function workflowProtocolInputValidationToolNameFromError(value: unknown): WorkflowProtocolToolName | null {
  const text = typeof value === 'string' ? value : ''
  const match = /InputValidationError:\s*(submit_phase_completion|request_workflow_route)\b/i.exec(text)
  if (!match || !WORKFLOW_PROTOCOL_TOOL_NAMES.has(match[1] as WorkflowProtocolToolName)) return null
  return match[1] as WorkflowProtocolToolName
}

function recordWorkflowProtocolToolRegistryError(
  streamState: SessionStreamState,
  toolResult: { is_error?: unknown; content?: unknown },
): void {
  if (!toolResult.is_error) return
  const toolName = workflowProtocolToolNameFromError(toolResult.content)
  if (toolName) streamState.workflowProtocolToolRegistryError = toolName
  const validationToolName = workflowProtocolInputValidationToolNameFromError(toolResult.content)
  if (validationToolName) streamState.workflowProtocolInputValidationError = validationToolName
}

function recordWorkflowProtocolToolRegistryErrorFromMessage(
  streamState: SessionStreamState,
  message: unknown,
): void {
  let text = ''
  try {
    text = typeof message === 'string' ? message : JSON.stringify(message)
  } catch {
    return
  }
  const toolName = workflowProtocolToolNameFromError(text)
  if (toolName) streamState.workflowProtocolToolRegistryError = toolName
  const validationToolName = workflowProtocolInputValidationToolNameFromError(text)
  if (validationToolName) streamState.workflowProtocolInputValidationError = validationToolName
}

function workflowInteractionTurnForResult(sessionId: string): WorkflowInteractionTurn {
  const streamState = getStreamState(sessionId)
  return {
    assistantText: streamState.assistantText.trim(),
    usedAskUserQuestion: streamState.usedAskUserQuestion,
    recoveryAttempts: streamState.structuredInteractionRecoveryAttempts,
  }
}

function finishWorkflowInteractionTurn(
  sessionId: string,
  resetRecoveryAttempts = true,
  resetBindingRecoveryAttempts = true,
  resetInputValidationRecoveryAttempts = true,
): void {
  const streamState = getStreamState(sessionId)
  streamState.usedAskUserQuestion = false
  streamState.assistantText = ''
  streamState.workflowProtocolToolRegistryError = undefined
  if (resetRecoveryAttempts) streamState.structuredInteractionRecoveryAttempts = 0
  if (resetBindingRecoveryAttempts) streamState.workflowProtocolBindingRecoveryAttempts = 0
  if (resetInputValidationRecoveryAttempts) {
    streamState.workflowProtocolInputValidationError = undefined
    streamState.workflowProtocolInputRecoveryAttempts = 0
  }
}

function assistantTextRequestsUserDecision(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  const hasQuestionSignal = /[?？]/.test(normalized)
  const hasDecisionLanguage = /(?:要我|还是|请(?:你)?(?:选择|确认|告诉)|你(?:想|要|希望)|是否|需不需要|下一步|怎么做|would you like|do you want|should i|which (?:option|one)|please (?:choose|confirm|tell)|let me know|what would you like)/i.test(normalized)
  return hasQuestionSignal && hasDecisionLanguage
}

function hasPendingAskUserQuestion(sessionId: string): boolean {
  return conversationService.getPendingPermissionRequests(sessionId).some(
    (request) => request.toolName === 'AskUserQuestion',
  )
}

function buildWorkflowTerminalRecoveryInstruction(
  recovery: WorkflowTerminalRecovery,
  assistantText: string,
): string {
  const isChinese = recovery.state.workflowLanguage === 'zh'
  const interactionInstruction = recovery.kind === 'ask-user-question'
    ? isChinese
      ? [
          '你刚才用普通文本向用户提出了需要选择、确认或决定的问题，但当前活跃工作流禁止在自由输入框等待回答。',
          '现在必须立即调用 AskUserQuestion；不得再输出普通文本问题，也不得结束本轮。',
          '调用必须包含顶层 questions 数组、稳定的 question id 和 option id，以及 2 至 4 个有界选项。',
          '选项必须忠实表达你刚才提出的决定；若一个选项会触发 workflow route，使用结构化 action/targetPhaseId，而不是只写在标签文本中。',
        ]
      : [
          'Your previous response asked the user for a decision in prose, but an active workflow must not wait at the free-form composer.',
          'Immediately call AskUserQuestion. Do not ask another prose question and do not end this turn.',
          'The call must include a top-level questions array, stable question and option ids, and 2-4 bounded choices.',
          'The choices must faithfully represent the decision you just asked. For workflow routing, use structured action/targetPhaseId rather than only label text.',
        ]
    : isChinese
      ? [
          '你在 workflow 仍处于运行中时结束了模型回合，但没有产生 pending completion、pending route 或 AskUserQuestion。',
          '不得静默停止，也不得等待用户在自由输入框中发送“继续”。',
          '现在继续当前阶段：若需要用户判断、确认、权限、范围或下一步选择，立即调用 AskUserQuestion；若当前阶段已经完成，调用 submit_phase_completion；否则继续执行当前阶段允许的工作。',
          '不要用普通文本问题替代 AskUserQuestion，也不要用普通文本声明阶段完成。',
        ]
      : [
          'You ended a model turn while the workflow is still running, but there is no pending completion, pending route, or AskUserQuestion.',
          'Do not silently stop and do not wait for the user to type “continue” in the free-form composer.',
          'Continue the active phase now: call AskUserQuestion if user judgment, confirmation, permission, scope, or next-step choice is needed; call submit_phase_completion if the phase is ready; otherwise continue allowed phase work.',
          'Do not replace AskUserQuestion or submit_phase_completion with prose.',
        ]
  const visibilityInstruction = isChinese
    ? '所有用户可见文案使用中文（文件路径、代码和原始错误除外）。'
    : 'Keep user-visible text in the current workflow language.'

  return [
    '<workflow-terminal-recovery>',
    '这是工作流运行时的内部恢复指令，不要把它作为普通答复展示给用户。',
    `Active phase: ${recovery.state.activePhaseId ?? 'unknown'}.`,
    ...interactionInstruction,
    visibilityInstruction,
    assistantText ? `刚才的普通文本：${assistantText}` : '',
    '</workflow-terminal-recovery>',
  ].filter(Boolean).join('\n')
}

async function workflowTerminalRecoveryForResult(
  sessionId: string,
  turn: WorkflowInteractionTurn,
): Promise<WorkflowTerminalRecovery | null> {
  if (turn.usedAskUserQuestion || hasPendingAskUserQuestion(sessionId)) return null

  const state = await loadWorkflowStateForWebSocket(sessionId)
  if (!state || state.mode !== 'workflow' || !state.activePhaseId) return null
  if (state.workflowStatus !== 'running' || state.pendingConfirmation || state.pendingRoute) return null
  return {
    state,
    kind: assistantTextRequestsUserDecision(turn.assistantText)
      ? 'ask-user-question'
      : 'continue-workflow',
  }
}

function isDuplicateOfLastApiError(
  lastApiError: SessionStreamState['lastApiError'],
  resultMessage: string,
): boolean {
  if (!lastApiError?.message) return false
  if (resultMessage === lastApiError.message) return true
  return (
    resultMessage.includes(lastApiError.message) &&
    /CLI (?:process exited unexpectedly|exited during startup)/i.test(resultMessage)
  )
}

function bindPrewarmMetadataCapture(sessionId: string) {
  for (const msg of conversationService.getRecentSdkMessages(sessionId)) {
    cacheSessionInitMetadata(sessionId, msg)
  }
  if (!conversationService.hasSession(sessionId)) return

  conversationService.clearOutputCallbacks(sessionId)
  conversationService.onOutput(sessionId, (cliMsg) => {
    cacheSessionInitMetadata(sessionId, cliMsg)
  })
}

async function resolveSessionWorkDir(sessionId: string, fallback = os.homedir()): Promise<string> {
  let workDir = fallback
  try {
    const resolved = await sessionService.getSessionWorkDir(sessionId)
    if (resolved) workDir = resolved
    console.log(
      `[WS] resolveSessionWorkDir: sessionId=${sessionId}, resolved workDir=${JSON.stringify(
        resolved,
      )}, will spawn CLI with workDir=${workDir}`,
    )
  } catch (resolveErr) {
    console.warn(
      `[WS] resolveSessionWorkDir: failed to resolve workDir for ${sessionId}, using fallback=${workDir}: ${
        resolveErr instanceof Error ? resolveErr.message : String(resolveErr)
      }`,
    )
  }
  return workDir
}

async function ensureCliSessionStarted(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  reason: 'user_message' | 'prewarm_session' | 'workflow_auto_continue',
): Promise<void> {
  const pendingStartup = sessionStartupPromises.get(sessionId)
  if (pendingStartup) {
    await pendingStartup
    return
  }

  if (conversationService.hasSession(sessionId)) return

  const startup = (async () => {
    const workDir = await resolveSessionWorkDir(sessionId)
    lastResolvedStartupWorkDirs.set(sessionId, workDir)
    const runtimeSettings = await getRuntimeSettings(sessionId)
    const sessionSettings = await getRuntimeSettingsWithWorkflowPolicy(sessionId, runtimeSettings)
    const sdkUrl =
      `ws://${ws.data.serverHost}:${ws.data.serverPort}/sdk/${sessionId}` +
      `?token=${encodeURIComponent(crypto.randomUUID())}`
    await sendRepositoryStartupStatus(ws, sessionId, reason)
    console.log(`[WS] Starting CLI for ${sessionId} due to ${reason}`)
    await conversationService.startSession(sessionId, workDir, sdkUrl, sessionSettings)
  })()

  sessionStartupPromises.set(sessionId, startup)
  try {
    await startup
  } finally {
    if (sessionStartupPromises.get(sessionId) === startup) {
      sessionStartupPromises.delete(sessionId)
    }
  }
}

export function translateCliMessage(cliMsg: any, sessionId: string): ServerMessage[] {
  const streamState = getStreamState(sessionId)
  switch (cliMsg.type) {
    case 'assistant': {
      if (cliMsg.error || cliMsg.isApiErrorMessage) {
        const message = extractAssistantText(cliMsg) || cliMsg.error || 'Unknown API error'
        const code = typeof cliMsg.error === 'string' ? cliMsg.error : 'API_ERROR'
        streamState.lastApiError = { message, code }
        return [{
          type: 'error',
          message,
          code,
        }]
      }

      // If we already received stream_events, text/thinking were already sent.
      // Only extract tool_use blocks (stream_event's content_block_stop lacks complete tool info).
      if (cliMsg.message?.content && Array.isArray(cliMsg.message.content)) {
        const messages: ServerMessage[] = []
        if (!streamState.hasReceivedStreamEvents) beginStreamedAssistantTurn(streamState)

        for (const block of cliMsg.message.content) {
          if (streamState.hasReceivedStreamEvents) {
            // Stream events handled most blocks — but any tool_use whose
            // input JSON failed to parse in content_block_stop was deferred.
            // Emit those now with the complete input from the assistant message.
            if (block.type === 'tool_use' && streamState.pendingToolBlocks.has(block.id)) {
              const pending = streamState.pendingToolBlocks.get(block.id)!
              streamState.pendingToolBlocks.delete(block.id)
              rememberToolParentUseId(streamState, block.id, pending.parentToolUseId)
              messages.push({
                type: 'tool_use_complete',
                toolName: pending.toolName || block.name,
                toolUseId: block.id,
                input: block.input,
                parentToolUseId: pending.parentToolUseId,
              })
            }
          } else {
            // No stream events received — this is the only source, process everything
            if (block.type === 'thinking' && block.thinking) {
              messages.push({ type: 'thinking', text: block.thinking })
            } else if (block.type === 'text' && block.text) {
              recordAssistantText(streamState, block.text)
              messages.push({ type: 'content_start', blockType: 'text' })
              messages.push({ type: 'content_delta', text: block.text })
            } else if (block.type === 'tool_use') {
              recordAssistantToolUse(streamState, block.name)
              const parentToolUseId = cliParentToolUseId(cliMsg)
              rememberToolParentUseId(streamState, block.id, parentToolUseId)
              messages.push({
                type: 'tool_use_complete',
                toolName: block.name,
                toolUseId: block.id,
                input: block.input,
                parentToolUseId,
              })
            }
          }
        }

        // Reset flags for next turn
        streamState.hasReceivedStreamEvents = false
        streamState.pendingToolBlocks.clear()
        return messages
      }
      return []
    }

    case 'user': {
      // Bug #1: 处理 tool_result 消息
      // CLI 发送 type:'user' 消息，其中 content 包含 tool_result 块
      const messages: ServerMessage[] = []

      const localCommandOutput = extractLocalCommandOutput(
        cliMsg.message?.content,
      )
      if (localCommandOutput) {
        const goalEvent = extractGoalEvent(
          localCommandOutput,
          streamState.pendingLocalCommand,
        )
        streamState.pendingLocalCommand = undefined
        if (goalEvent) {
          messages.push({
            type: 'system_notification',
            subtype: 'goal_event',
            message: goalEvent.message,
            data: goalEvent,
          })
        } else {
          messages.push({ type: 'content_start', blockType: 'text' })
          messages.push({ type: 'content_delta', text: localCommandOutput })
        }
      }

      if (cliMsg.message?.content && Array.isArray(cliMsg.message.content)) {
        for (const block of cliMsg.message.content) {
          if (block.type === 'tool_result') {
            recordWorkflowProtocolToolRegistryError(streamState, block)
            const rememberedParentToolUseId = consumeToolParentUseId(streamState, block.tool_use_id)
            const parentToolUseId =
              cliParentToolUseId(cliMsg) ?? rememberedParentToolUseId
            messages.push({
              type: 'tool_result',
              toolUseId: block.tool_use_id,
              content: block.content,
              isError: !!block.is_error,
              parentToolUseId,
            })
          }
        }
      }

      return messages
    }

    case 'stream_event': {
      streamState.hasReceivedStreamEvents = true
      const event = cliMsg.event
      if (!event) return []

      switch (event.type) {
        case 'message_start': {
          beginStreamedAssistantTurn(streamState)
          return [{ type: 'status', state: 'thinking' }]
        }

        case 'content_block_start': {
          const contentBlock = event.content_block
          if (!contentBlock) return []

          const index = event.index ?? 0

          if (contentBlock.type === 'tool_use') {
            recordAssistantToolUse(streamState, contentBlock.name)
            const parentToolUseId = cliParentToolUseId(cliMsg)
            streamState.activeBlockTypes.set(index, 'tool_use')
            // Track tool info so content_block_stop can emit complete data
            streamState.activeToolBlocks.set(index, {
              toolName: contentBlock.name || '',
              toolUseId: contentBlock.id || '',
              inputJson: '',
              parentToolUseId,
            })
            return [{
              type: 'content_start',
              blockType: 'tool_use',
              toolName: contentBlock.name,
              toolUseId: contentBlock.id,
              parentToolUseId,
            }]
          }

          if (contentBlock.type === 'thinking' || contentBlock.type === 'redacted_thinking') {
            streamState.activeBlockTypes.set(index, 'thinking')
            return [{ type: 'status', state: 'thinking', verb: 'Thinking' }]
          }

          streamState.activeBlockTypes.set(index, 'text')
          return [{ type: 'content_start', blockType: 'text' }]
        }

        case 'content_block_delta': {
          const delta = event.delta
          if (!delta) return []

          if (delta.type === 'text_delta' && delta.text) {
            recordAssistantText(streamState, delta.text)
            return [{ type: 'content_delta', text: delta.text }]
          }
          if (delta.type === 'input_json_delta' && delta.partial_json) {
            // Accumulate tool input JSON
            const index = event.index ?? 0
            const toolBlock = streamState.activeToolBlocks.get(index)
            if (toolBlock) toolBlock.inputJson += delta.partial_json
            return [{ type: 'content_delta', toolInput: delta.partial_json }]
          }
          if (delta.type === 'thinking_delta' && delta.thinking) {
            return [{ type: 'thinking', text: delta.thinking }]
          }
          return []
        }

        case 'content_block_stop': {
          const index = event.index ?? 0
          const blockType = streamState.activeBlockTypes.get(index)
          streamState.activeBlockTypes.delete(index)

          if (blockType === 'tool_use') {
            const toolBlock = streamState.activeToolBlocks.get(index)
            streamState.activeToolBlocks.delete(index)
            if (toolBlock) {
              const parentToolUseId =
                cliParentToolUseId(cliMsg) ?? toolBlock.parentToolUseId
              let parsedInput = null
              try { parsedInput = JSON.parse(toolBlock.inputJson) } catch {}

              if (parsedInput !== null) {
                rememberToolParentUseId(streamState, toolBlock.toolUseId, parentToolUseId)
                return [{
                  type: 'tool_use_complete',
                  toolName: toolBlock.toolName,
                  toolUseId: toolBlock.toolUseId,
                  input: parsedInput,
                  parentToolUseId,
                }]
              }

              // JSON parse failed — defer to the assistant message which
              // carries the complete, already-parsed tool input.
              console.warn(
                `[WS] Tool input JSON parse failed for ${toolBlock.toolName} (${toolBlock.toolUseId}), deferring to assistant message`,
              )
              streamState.pendingToolBlocks.set(toolBlock.toolUseId, {
                toolName: toolBlock.toolName,
                toolUseId: toolBlock.toolUseId,
                parentToolUseId,
              })
            }
          }
          return []
        }

        case 'message_stop': {
          // message_stop is handled by the 'result' message
          return []
        }

        case 'message_delta': {
          // message_delta may contain stop_reason or usage updates
          return []
        }

        default:
          return []
      }
    }

    case 'control_request': {
      // 权限请求 — CLI 需要用户授权才能执行工具
      if (cliMsg.request?.subtype === 'can_use_tool') {
        return [{
          type: 'permission_request',
          requestId: cliMsg.request_id,
          toolName: cliMsg.request.tool_name || 'Unknown',
          toolUseId:
            typeof cliMsg.request.tool_use_id === 'string'
              ? cliMsg.request.tool_use_id
              : undefined,
          input: cliMsg.request.input || {},
          description: cliMsg.request.description,
        }]
      }
      return []
    }

    case 'control_response':
      return []

    case 'result': {
      // 对话结果（成功或错误）
      const usage = {
        input_tokens: cliMsg.usage?.input_tokens || 0,
        output_tokens: cliMsg.usage?.output_tokens || 0,
      }

      if (cliMsg.is_error) {
        // If the user requested stop, this "error" is just the interrupt
        // result — don't show it as an error in the chat UI.
        if (sessionStopRequested.has(sessionId)) {
          sessionStopRequested.delete(sessionId)
          return [{ type: 'message_complete', usage }]
        }

        const resultMessage =
          (typeof cliMsg.result === 'string' && cliMsg.result) ||
          (Array.isArray(cliMsg.errors) && cliMsg.errors.length > 0
            ? cliMsg.errors.join('\n')
            : 'Unknown error')
        if (isDuplicateOfLastApiError(streamState.lastApiError, resultMessage)) {
          streamState.lastApiError = undefined
          return [{ type: 'message_complete', usage }]
        }
        // 错误和完成消息都发送
        return [
          {
            type: 'error',
            message: resultMessage,
            code: 'CLI_ERROR',
          },
          { type: 'message_complete', usage },
        ]
      }

      // Clear stop flag on successful completion too
      sessionStopRequested.delete(sessionId)
      streamState.lastApiError = undefined
      return [{ type: 'message_complete', usage }]
    }

    case 'system': {
      // 区分不同的 system 子类型
      const subtype = cliMsg.subtype
      if (subtype === 'init') {
        // CLI 初始化完成 — 缓存 slash commands 并发送模型信息
        // NOTE: Do NOT send status:idle here — the CLI init fires while
        // processing the first user message, and sending idle would reset
        // the frontend's streaming state prematurely.
        cacheSessionInitMetadata(sessionId, cliMsg)
        const messages: ServerMessage[] = [
          // Send model info as a system notification, not a status change
          { type: 'system_notification', subtype: 'init', message: `Model: ${cliMsg.model || 'unknown'}`, data: { model: cliMsg.model } },
        ]
        // Send slash commands to frontend
        const cmds = sessionSlashCommands.get(sessionId)
        if (cmds && cmds.length > 0) {
          messages.push({
            type: 'system_notification',
            subtype: 'slash_commands',
            data: cmds,
          })
        }
        return messages
      }
      if (subtype === 'memory_saved') {
        return [{
          type: 'system_notification',
          subtype: 'memory_saved',
          message: cliMsg.message,
          data: {
            writtenPaths: Array.isArray(cliMsg.writtenPaths) ? cliMsg.writtenPaths : [],
            teamCount: typeof cliMsg.teamCount === 'number' ? cliMsg.teamCount : undefined,
            verb: typeof cliMsg.verb === 'string' ? cliMsg.verb : undefined,
          },
        }]
      }
      if (subtype === 'hook_started' || subtype === 'hook_response') {
        // Hook 执行中 — 不转发给前端
        return []
      }
      if (subtype === 'local_command' || subtype === 'local_command_output') {
        const localCommand = extractLocalCommand(cliMsg.content ?? cliMsg.message)
        if (localCommand) {
          streamState.pendingLocalCommand = localCommand
          return []
        }

        const localCommandOutput = extractLocalCommandOutput(
          cliMsg.content ?? cliMsg.message,
          { allowUntagged: subtype === 'local_command_output' },
        )
        if (!localCommandOutput) return []
        const goalEvent = extractGoalEvent(
          localCommandOutput,
          streamState.pendingLocalCommand,
        )
        streamState.pendingLocalCommand = undefined
        if (goalEvent) {
          return [{
            type: 'system_notification',
            subtype: 'goal_event',
            message: goalEvent.message,
            data: goalEvent,
          }]
        }
        return [
          { type: 'content_start', blockType: 'text' },
          { type: 'content_delta', text: localCommandOutput },
        ]
      }
      // Bug #7: 处理 task/team system 消息
      if (subtype === 'task_notification') {
        return [{
          type: 'system_notification',
          subtype: 'task_notification',
          message: cliMsg.message || cliMsg.title,
          data: cliMsg,
        }]
      }
      if (subtype === 'task_started') {
        return [
          {
            type: 'system_notification',
            subtype: 'task_started',
            message: cliMsg.message || cliMsg.description || 'Task started',
            data: cliMsg,
          },
          {
            type: 'status',
            state: 'tool_executing',
            verb: cliMsg.message || cliMsg.description || 'Task started',
          },
        ]
      }
      if (subtype === 'task_progress') {
        return [
          {
            type: 'system_notification',
            subtype: 'task_progress',
            message: cliMsg.message || cliMsg.summary || cliMsg.description || 'Task in progress',
            data: cliMsg,
          },
          {
            type: 'status',
            state: 'tool_executing',
            verb: cliMsg.message || cliMsg.summary || cliMsg.description || 'Task in progress',
          },
        ]
      }
      if (subtype === 'session_state_changed') {
        return [{
          type: 'system_notification',
          subtype: 'session_state_changed',
          message: cliMsg.message,
          data: cliMsg,
        }]
      }
      if (subtype === 'compact_boundary') {
        return [{
          type: 'system_notification',
          subtype: 'compact_boundary',
          message: getCompactBoundaryMessage(cliMsg),
          data: cliMsg.compact_metadata ?? cliMsg,
        }]
      }
      // 其他 system 消息
      return []
    }

    default:
      // 未知类型 — 调试输出但不转发
      console.log(`[WS] Unknown CLI message type: ${cliMsg.type}`, JSON.stringify(cliMsg).substring(0, 200))
      return []
  }
}

// ============================================================================
// Helpers
// ============================================================================

function syncSessionChatStateFromMessage(sessionId: string, message: ServerMessage): void {
  if (message.type === 'status') {
    setSessionChatState(sessionId, message.state)
    return
  }

  if (message.type === 'message_complete') {
    setSessionChatState(sessionId, 'idle')
    return
  }

  if (
    message.type === 'permission_request' ||
    message.type === 'computer_use_permission_request'
  ) {
    setSessionChatState(sessionId, 'permission_pending')
  }
}

function sendMessage(ws: ServerWebSocket<WebSocketData>, message: ServerMessage): ClientSendOutcome {
  syncSessionChatStateFromMessage(ws.data.sessionId, message)
  return sendToClient(ws, JSON.stringify(message), message.type)
}

function sendError(ws: ServerWebSocket<WebSocketData>, message: string, code: string) {
  sendMessage(ws, { type: 'error', message, code })
}

function getDesktopSlashCommand(content: string): ReturnType<typeof parseSlashCommand> {
  const parsed = parseSlashCommand(content.trim())
  if (!parsed || parsed.isMcp) return null
  return parsed
}

function getTitleInputForUserMessage(
  content: string,
  command: ReturnType<typeof parseSlashCommand>,
): string | null {
  if (command?.commandName !== 'goal') return content

  const args = command.args.trim()
  if (!args || args === 'clear') return null
  return args
}

export function createCurrentTurnLocalCommandForwarder(
  command: ReturnType<typeof parseSlashCommand>,
): (cliMsg: any) => boolean {
  let awaitingCurrentTurnLocalCommandOutput = false

  return (cliMsg: any) => {
    if (command && isMatchingCurrentTurnLocalCommand(cliMsg, command)) {
      awaitingCurrentTurnLocalCommandOutput = true
      return true
    }
    if (command?.commandName === 'goal' && isLocalCommandOutputMessage(cliMsg)) {
      const output = extractLocalCommandOutput(
        cliMsg.content ?? cliMsg.message,
        { allowUntagged: cliMsg.subtype === 'local_command_output' },
      )
      if (output && looksLikeGoalCommandOutput(output)) {
        awaitingCurrentTurnLocalCommandOutput = false
        return true
      }
    }
    if (
      awaitingCurrentTurnLocalCommandOutput &&
      isLocalCommandOutputMessage(cliMsg)
    ) {
      awaitingCurrentTurnLocalCommandOutput = false
      return true
    }
    return false
  }
}

function isMatchingCurrentTurnLocalCommand(
  cliMsg: any,
  command: NonNullable<ReturnType<typeof parseSlashCommand>>,
): boolean {
  if (cliMsg?.type !== 'system' || cliMsg?.subtype !== 'local_command') {
    return false
  }
  const localCommand = extractLocalCommand(cliMsg.content ?? cliMsg.message)
  if (!localCommand) return false
  return (
    localCommand.name === command.commandName &&
    localCommand.args.trim() === command.args.trim()
  )
}

function isLocalCommandOutputMessage(cliMsg: any): boolean {
  if (
    cliMsg?.type !== 'system' ||
    (cliMsg?.subtype !== 'local_command' &&
      cliMsg?.subtype !== 'local_command_output')
  ) {
    return false
  }
  return extractLocalCommandOutput(
    cliMsg.content ?? cliMsg.message,
    { allowUntagged: cliMsg.subtype === 'local_command_output' },
  ) !== null
}

function extractLocalCommandOutput(
  content: unknown,
  options: { allowUntagged?: boolean } = {},
): string | null {
  const raw = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
        .flatMap((block) => {
          if (!block || typeof block !== 'object') return []
          const text = (block as { text?: unknown }).text
          return typeof text === 'string' ? [text] : []
        })
        .join('\n')
      : ''

  if (!raw) return null

  const stdout = extractTaggedContent(raw, LOCAL_COMMAND_STDOUT_TAG)
  if (stdout !== null) return stdout

  const stderr = extractTaggedContent(raw, LOCAL_COMMAND_STDERR_TAG)
  if (stderr !== null) return stderr

  if (options.allowUntagged) {
    const normalized = raw.trim()
    return normalized || null
  }

  return null
}

function extractTaggedContent(raw: string, tag: string): string | null {
  const match = raw.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match?.[1]?.trim() ?? null
}

function extractLocalCommand(content: unknown): { name: string; args: string } | null {
  const raw = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
        .flatMap((block) => {
          if (!block || typeof block !== 'object') return []
          const text = (block as { text?: unknown }).text
          return typeof text === 'string' ? [text] : []
        })
        .join('\n')
      : ''

  const name = extractTaggedContent(raw, COMMAND_NAME_TAG)
  if (!name) return null
  return {
    name: name.replace(/^\//, ''),
    args: extractTaggedContent(raw, 'command-args') ?? '',
  }
}

type GoalEventData = {
  action: 'created' | 'replaced' | 'status' | 'paused' | 'resumed' | 'completed' | 'cleared' | 'message'
  status?: string
  objective?: string
  budget?: string
  elapsed?: string
  continuations?: string
  message?: string
}

function extractGoalEvent(
  output: string,
  command?: { name: string; args: string },
): GoalEventData | null {
  if (command && command.name !== 'goal') return null

  const trimmed = output.trim()
  if (!trimmed) return null

  if (trimmed === 'Goal cleared.' || trimmed.startsWith('Goal cleared:')) {
    return { action: 'cleared', message: trimmed }
  }
  if (trimmed === 'Goal marked complete.') {
    return { action: 'completed', message: trimmed }
  }
  if (trimmed === 'No active goal.') {
    return { action: 'message', message: trimmed }
  }

  if (trimmed.startsWith('Goal set:')) {
    const objective = trimmed.slice('Goal set:'.length).trim()
    return {
      action: 'created',
      status: 'active',
      objective: objective || undefined,
      message: trimmed,
    }
  }

  return command?.name === 'goal' ? { action: 'message', message: trimmed } : null
}

function looksLikeGoalCommandOutput(output: string): boolean {
  const trimmed = output.trim()
  return (
    trimmed.startsWith('Goal set:') ||
    trimmed.startsWith('Goal cleared:') ||
    trimmed === 'Goal cleared.' ||
    trimmed === 'Goal marked complete.' ||
    trimmed === 'No active goal.'
  )
}

function getCompactBoundaryMessage(cliMsg: any): string {
  const message = typeof cliMsg?.message === 'string' ? cliMsg.message.trim() : ''
  if (message) return message

  const content = typeof cliMsg?.content === 'string' ? cliMsg.content.trim() : ''
  if (content) return content

  return 'Context compacted'
}

function replayPendingPermissionRequests(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
): void {
  for (const request of conversationService.getPendingPermissionRequests(sessionId)) {
    sendMessage(ws, {
      type: 'permission_request',
      requestId: request.requestId,
      toolName: request.toolName,
      ...(request.toolUseId ? { toolUseId: request.toolUseId } : {}),
      input: request.input,
      ...(request.description ? { description: request.description } : {}),
    })
  }
}

function sendSessionTitleUpdated(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  title: string,
): void {
  const message: ServerMessage = { type: 'session_title_updated', sessionId, title }
  if (!sendToSession(sessionId, message)) {
    sendMessage(ws, message)
  }
}

function removeClientOutputCallback(ws: ServerWebSocket<WebSocketData>): void {
  const entry = clientOutputCallbacks.get(ws)
  if (!entry) return
  clientOutputCallbacks.delete(ws)
  const stillUsed = [...clientOutputCallbacks.values()].some(
    (candidate) =>
      candidate.sessionId === entry.sessionId &&
      candidate.callback === entry.callback,
  )
  if (!stillUsed) {
    conversationService.removeOutputCallback(entry.sessionId, entry.callback)
  }
}

function removeSessionOutputCallbacks(sessionId: string): void {
  const callbacks = new Set<(msg: any) => void>()
  for (const [ws, entry] of [...clientOutputCallbacks.entries()]) {
    if (entry.sessionId !== sessionId) continue
    callbacks.add(entry.callback)
    clientOutputCallbacks.delete(ws)
  }
  for (const callback of callbacks) {
    conversationService.removeOutputCallback(sessionId, callback)
  }
}

function getClientOutputEntry(sessionId: string): {
  sessionId: string
  callback: (msg: any) => void
} | null {
  for (const entry of clientOutputCallbacks.values()) {
    if (entry.sessionId === sessionId) return entry
  }
  return null
}

function bindAllClientSessionOutputs(
  sessionId: string,
  options?: {
    shouldForward?: (cliMsg: any) => boolean
  },
): void {
  const clients = activeSessions.get(sessionId)
  if (!clients || !conversationService.hasSession(sessionId)) return
  removeSessionOutputCallbacks(sessionId)
  const callback = createClientBroadcastCallback(sessionId, options)
  for (const ws of clients) {
    clientOutputCallbacks.set(ws, { sessionId, callback })
  }
  conversationService.onOutput(sessionId, callback)
}

function broadcastServerMessageToSession(sessionId: string, message: ServerMessage): void {
  const clients = activeSessions.get(sessionId)
  if (!clients) return
  for (const ws of [...clients]) {
    sendMessage(ws, message)
  }
}

function broadcastCliMessagesToSession(sessionId: string, cliMsg: any): void {
  const serverMsgs = translateCliMessage(cliMsg, sessionId)
  for (const message of serverMsgs) {
    if (message.type === 'permission_request' && message.toolName === 'AskUserQuestion') {
      void enqueueWorkflowSessionTransition(sessionId, async () => {
        const boundRequest = await recordWorkflowAskUserQuestion(sessionId, message)
        broadcastServerMessageToSession(sessionId, boundRequest)
      }).catch((error) => {
        console.warn(`[WS] Failed to persist AskUserQuestion workflow issue for ${sessionId}:`, error)
        sendToSession(sessionId, {
          type: 'error',
          code: 'WORKFLOW_STATE_PERSIST_FAILED',
          message: 'Workflow question was not delivered because its blocking state could not be persisted safely.',
        })
      })
      continue
    }
    broadcastServerMessageToSession(sessionId, message)
  }
}

function sendWorkflowTerminalProtocolError(
  sessionId: string,
  recovery: WorkflowTerminalRecovery,
  code: 'WORKFLOW_TERMINAL_PROTOCOL_REQUIRED' | 'WORKFLOW_TERMINAL_RECOVERY_UNAVAILABLE',
): void {
  const clients = activeSessions.get(sessionId)
  if (!clients) return
  const isChinese = recovery.state.workflowLanguage === 'zh'
  const message = code === 'WORKFLOW_TERMINAL_RECOVERY_UNAVAILABLE'
    ? (isChinese
      ? '当前工作流需要继续生成结构化交互，但运行时无法把恢复指令送达模型。系统不会把这次普通文本终止当作正常完成；请重试当前阶段。'
      : 'This workflow needs a structured continuation, but the runtime could not deliver the recovery instruction to the model. This prose-only termination is not treated as normal completion; retry the current phase.')
    : (isChinese
      ? '当前工作流连续两次在没有 AskUserQuestion、阶段完成或阶段路由的情况下结束。请重试当前阶段；系统不会把这种普通文本终止当作已完成的工作流交互。'
      : 'This workflow ended twice without AskUserQuestion, phase completion, or phase routing. Retry the current phase; prose-only termination is not treated as completed workflow interaction.')

  for (const ws of clients) {
    sendMessage(ws, {
      type: 'error',
      code,
      message,
      retryable: true,
    })
  }
}

function sendWorkflowProtocolToolBindingError(
  sessionId: string,
  state: WorkflowSessionState,
): void {
  const clients = activeSessions.get(sessionId)
  if (!clients) return
  const message = state.workflowLanguage === 'zh'
    ? '工作流阶段工具未能恢复。系统没有继续推进阶段；请重试当前阶段。'
    : 'Workflow phase tools could not be restored. The workflow was not advanced; retry the current phase.'

  for (const ws of clients) {
    sendMessage(ws, {
      type: 'error',
      code: 'WORKFLOW_PROTOCOL_TOOLS_UNAVAILABLE',
      message,
      retryable: true,
    })
  }
}

function buildWorkflowProtocolToolBindingRecoveryInstruction(
  state: WorkflowSessionState,
  toolName: WorkflowProtocolToolName,
): string {
  const isChinese = state.workflowLanguage === 'zh'
  const action = toolName === 'submit_phase_completion'
    ? 'submit_phase_completion'
    : 'request_workflow_route'
  const instruction = isChinese
    ? [
        `刚才对 ${action} 的调用因运行时工具绑定异常未执行。新的工作流运行时已经启动，并且该工具现在可用。`,
        `立即重新执行刚才需要的 ${action} 结构化调用。`,
        '不要把工具调用失败解释给用户，不要等待用户在输入框发送“继续”，也不要用普通文本替代结构化工具调用。',
        '继续遵守当前阶段权限；所有用户可见文字使用中文。',
      ]
    : [
        `The previous ${action} call did not execute because the runtime tool binding was unhealthy. A fresh workflow runtime is now running and this tool is available.`,
        `Immediately retry the required structured ${action} call.`,
        'Do not ask the user to type continue, do not expose this internal binding failure, and do not replace the tool call with prose.',
        'Continue to obey the active phase permissions.',
      ]

  return [
    '<workflow-protocol-binding-recovery>',
    ...instruction,
    '</workflow-protocol-binding-recovery>',
  ].join('\n')
}

async function recoverWorkflowProtocolToolBinding(
  sessionId: string,
  cliMsg: any,
): Promise<boolean> {
  const streamState = getStreamState(sessionId)
  const toolName = streamState.workflowProtocolToolRegistryError
    ?? workflowProtocolToolNameFromError(cliMsg?.result)
    ?? workflowProtocolToolNameFromError(Array.isArray(cliMsg?.errors) ? cliMsg.errors.join('\n') : undefined)
  if (!toolName) return false

  const state = await loadWorkflowStateForWebSocket(sessionId)
  if (
    !state
    || state.mode !== 'workflow'
    || state.workflowStatus !== 'running'
    || !getWorkflowScopedToolNames(state).includes(toolName)
  ) {
    return false
  }

  if (streamState.workflowProtocolBindingRecoveryAttempts >= 1) {
    sendWorkflowProtocolToolBindingError(sessionId, state)
    finishWorkflowInteractionTurn(sessionId)
    return true
  }

  streamState.workflowProtocolBindingRecoveryAttempts += 1
  const clients = activeSessions.get(sessionId)
  if (clients) {
    for (const ws of clients) {
      sendMessage(ws, {
        type: 'status',
        state: 'thinking',
        verb: state.workflowLanguage === 'zh' ? '正在恢复工作流工具' : 'Restoring workflow tools',
      })
    }
  }

  const rebound = await refreshWorkflowRuntimeBinding(sessionId, state)
  if (rebound.status !== 'restarted') {
    if (rebound.status !== 'restart-failed') sendWorkflowProtocolToolBindingError(sessionId, state)
    finishWorkflowInteractionTurn(sessionId)
    return true
  }

  const sent = conversationService.sendMessage(
    sessionId,
    buildWorkflowProtocolToolBindingRecoveryInstruction(state, toolName),
  )
  if (!sent) {
    sendWorkflowProtocolToolBindingError(sessionId, state)
    finishWorkflowInteractionTurn(sessionId)
    return true
  }

  finishWorkflowInteractionTurn(sessionId, true, false)
  return true
}

function sendWorkflowProtocolInputValidationError(
  sessionId: string,
  state: WorkflowSessionState,
): void {
  const clients = activeSessions.get(sessionId)
  if (!clients) return
  const message = state.workflowLanguage === 'zh'
    ? '工作流阶段工具的参数连续两次未通过校验。当前阶段没有推进；请重试当前阶段。'
    : 'Workflow phase tool parameters failed validation twice. The workflow was not advanced; retry the current phase.'

  for (const ws of clients) {
    sendMessage(ws, {
      type: 'error',
      code: 'WORKFLOW_PROTOCOL_INPUT_INVALID',
      message,
      retryable: true,
    })
  }
}

function buildWorkflowProtocolInputValidationRecoveryInstruction(
  state: WorkflowSessionState,
  toolName: WorkflowProtocolToolName,
): string {
  const isChinese = state.workflowLanguage === 'zh'
  const contract = toolName === 'submit_phase_completion'
    ? (isChinese
      ? [
          '立即重新调用 submit_phase_completion，并提供：status、handoff（对象）、rationale（非空字符串）和 evidence（数组）。',
          'phaseId 与 stateVersion 如不确定可省略，让运行时使用当前工作流状态。',
        ]
      : [
          'Immediately call submit_phase_completion again with status, handoff (an object), rationale (a non-empty string), and evidence (an array).',
          'If phaseId or stateVersion is uncertain, omit it so the runtime uses the current workflow state.',
        ])
    : (isChinese
      ? [
          '立即重新调用 request_workflow_route，并提供：intent、rationale（非空字符串）和 evidence（数组）。',
          '当 intent 为 jump_to_phase 时必须提供 targetPhaseId。',
        ]
      : [
          'Immediately call request_workflow_route again with intent, rationale (a non-empty string), and evidence (an array).',
          'targetPhaseId is required for jump_to_phase.',
        ])
  const instruction = isChinese
    ? [
        `刚才的 ${toolName} 调用因参数校验失败而未执行。工具结果中已包含具体校验错误。`,
        ...contract,
        '不要把这次失败解释给用户，不要改用普通文本、AskUserQuestion 或等待用户在输入框发送“继续”。只修正参数后重试同一个结构化工具调用。',
        '继续遵守当前阶段权限；所有用户可见文案使用中文。',
      ]
    : [
        `The previous ${toolName} call was rejected by input validation and did not execute. The tool result contains the specific validation errors.`,
        ...contract,
        'Do not explain this failure to the user, replace it with prose or AskUserQuestion, or wait for the user to type continue. Correct the payload and retry the same structured tool call only.',
        'Continue to obey the active phase permissions.',
      ]

  return [
    '<workflow-protocol-input-recovery>',
    ...instruction,
    '</workflow-protocol-input-recovery>',
  ].join('\n')
}

async function recoverWorkflowProtocolInputValidation(
  sessionId: string,
  cliMsg: any,
): Promise<boolean> {
  const streamState = getStreamState(sessionId)
  const toolName = streamState.workflowProtocolInputValidationError
    ?? workflowProtocolInputValidationToolNameFromError(cliMsg?.result)
    ?? workflowProtocolInputValidationToolNameFromError(Array.isArray(cliMsg?.errors) ? cliMsg.errors.join('\n') : undefined)
  if (!toolName) return false

  const state = await loadWorkflowStateForWebSocket(sessionId)
  if (
    !state
    || state.mode !== 'workflow'
    || state.workflowStatus !== 'running'
    || !getWorkflowScopedToolNames(state).includes(toolName)
  ) {
    return false
  }

  if (streamState.workflowProtocolInputRecoveryAttempts >= 1) {
    sendWorkflowProtocolInputValidationError(sessionId, state)
    finishWorkflowInteractionTurn(sessionId)
    return true
  }

  if (!conversationService.hasSession(sessionId)) {
    sendWorkflowProtocolInputValidationError(sessionId, state)
    finishWorkflowInteractionTurn(sessionId)
    return true
  }

  streamState.workflowProtocolInputRecoveryAttempts += 1
  const clients = activeSessions.get(sessionId)
  if (clients) {
    for (const ws of clients) {
      sendMessage(ws, {
        type: 'status',
        state: 'thinking',
        verb: state.workflowLanguage === 'zh' ? '正在修正工作流工具参数' : 'Correcting workflow tool parameters',
      })
    }
  }

  const sent = conversationService.sendMessage(
    sessionId,
    buildWorkflowProtocolInputValidationRecoveryInstruction(state, toolName),
  )
  if (!sent) {
    sendWorkflowProtocolInputValidationError(sessionId, state)
    finishWorkflowInteractionTurn(sessionId)
    return true
  }

  // Keep the bounded retry counter until the next protocol-tool attempt
  // succeeds or fails. A missing/invalid payload must be regenerated by the
  // model, so unlike a missing registry binding it must not restart the CLI.
  finishWorkflowInteractionTurn(sessionId, true, true, false)
  return true
}

async function finalizeClientResult(sessionId: string, cliMsg: any): Promise<void> {
  if (await recoverWorkflowProtocolToolBinding(sessionId, cliMsg)) return
  if (await recoverWorkflowProtocolInputValidation(sessionId, cliMsg)) return

  const turn = workflowInteractionTurnForResult(sessionId)
  const recovery = !cliMsg.is_error
    ? await workflowTerminalRecoveryForResult(sessionId, turn)
    : null

  if (recovery) {
    if (turn.recoveryAttempts >= 1) {
      sendWorkflowTerminalProtocolError(sessionId, recovery, 'WORKFLOW_TERMINAL_PROTOCOL_REQUIRED')
      finishWorkflowInteractionTurn(sessionId)
      return
    }

    if (!conversationService.hasSession(sessionId)) {
      sendWorkflowTerminalProtocolError(sessionId, recovery, 'WORKFLOW_TERMINAL_RECOVERY_UNAVAILABLE')
      finishWorkflowInteractionTurn(sessionId)
      return
    }

    const streamState = getStreamState(sessionId)
    streamState.structuredInteractionRecoveryAttempts += 1
    const clients = activeSessions.get(sessionId)
    if (clients) {
      for (const ws of clients) {
        sendMessage(ws, {
          type: 'status',
          state: 'thinking',
          verb: recovery.state.workflowLanguage === 'zh'
            ? (recovery.kind === 'ask-user-question' ? '正在生成选项' : '正在继续工作流')
            : (recovery.kind === 'ask-user-question' ? 'Generating choices' : 'Continuing workflow'),
        })
      }
    }
    const sent = conversationService.sendMessage(
      sessionId,
      buildWorkflowTerminalRecoveryInstruction(recovery, turn.assistantText),
    )
    if (sent) return

    sendWorkflowTerminalProtocolError(sessionId, recovery, 'WORKFLOW_TERMINAL_RECOVERY_UNAVAILABLE')
    finishWorkflowInteractionTurn(sessionId)
    return
  }

  broadcastCliMessagesToSession(sessionId, cliMsg)
  const clients = activeSessions.get(sessionId)
  finishWorkflowInteractionTurn(sessionId)

  const firstClient = clients?.values().next().value
  if (firstClient) triggerTitleGeneration(firstClient, sessionId)
}

function recoverWorkflowProtocolToolBindingImmediately(
  sessionId: string,
  cliMsg: any,
): boolean {
  const streamState = getStreamState(sessionId)
  if (
    !streamState.workflowProtocolToolRegistryError
    || streamState.workflowProtocolBindingRecoveryInFlight
  ) {
    return false
  }

  // A missing workflow protocol tool means this CLI was started with a stale
  // tool surface. Do not let it continue with prose or AskUserQuestion: stop
  // forwarding the old turn while a workflow-bound CLI is rebuilt and the
  // required protocol action is replayed.
  streamState.workflowProtocolBindingRecoveryInFlight = true
  void recoverWorkflowProtocolToolBinding(sessionId, cliMsg)
    .catch((error) => {
      console.error(`[WS] Immediate workflow protocol recovery failed for ${sessionId}:`, error)
    })
    .finally(() => {
      getStreamState(sessionId).workflowProtocolBindingRecoveryInFlight = false
    })
  return true
}

function createClientBroadcastCallback(
  sessionId: string,
  options?: {
    shouldForward?: (cliMsg: any) => boolean
  },
): (cliMsg: any) => void {
  let supersededByProtocolRecovery = false
  return (cliMsg: any) => {
    if (supersededByProtocolRecovery || (options?.shouldForward && !options.shouldForward(cliMsg))) return

    const streamState = getStreamState(sessionId)
    recordWorkflowProtocolToolRegistryErrorFromMessage(streamState, cliMsg)
    if (recoverWorkflowProtocolToolBindingImmediately(sessionId, cliMsg)) {
      supersededByProtocolRecovery = true
      return
    }

    if (cliMsg.type === 'result') {
      void finalizeClientResult(sessionId, cliMsg)
      return
    }

    broadcastCliMessagesToSession(sessionId, cliMsg)
  }
}

function bindClientSessionOutput(
  sessionId: string,
  ws: ServerWebSocket<WebSocketData>,
  options?: {
    shouldForward?: (cliMsg: any) => boolean
  },
) {
  if (!conversationService.hasSession(sessionId)) return

  removeClientOutputCallback(ws)
  const entry = getClientOutputEntry(sessionId)
  if (entry && !options?.shouldForward) {
    clientOutputCallbacks.set(ws, entry)
    return
  }

  const callback = createClientBroadcastCallback(sessionId, options)
  clientOutputCallbacks.set(ws, { sessionId, callback })
  conversationService.onOutput(sessionId, callback)
}

type RuntimeSettings = {
  permissionMode?: string
  model?: string
  effort?: string
  thinking?: 'disabled'
  providerId?: string | null
  disallowedTools?: string[]
  workflowSessionId?: string
  workflowSystemPrompt?: string
}

async function getRuntimeSettings(sessionId?: string): Promise<RuntimeSettings> {
  const runtimeOverride = sessionId ? runtimeOverrides.get(sessionId) : undefined
  if (runtimeOverride) {
    if (typeof runtimeOverride.providerId === 'string') {
      const { providers } = await providerService.listProviders()
      const providerExists = providers.some((provider) => provider.id === runtimeOverride.providerId)
      if (!providerExists) {
        console.warn(
          `[WS] Ignoring stale runtime provider id for ${sessionId}: ${runtimeOverride.providerId}`,
        )
        runtimeOverrides.delete(sessionId!)
        return getDefaultRuntimeSettings()
      }
    }

    const userSettings = await settingsService.getUserSettings()
    const effort =
      typeof userSettings.effort === 'string' && userSettings.effort.trim()
        ? userSettings.effort
        : undefined
    const thinking = resolveDesktopThinkingMode(userSettings)

    return {
      permissionMode: await settingsService.getPermissionMode().catch(() => undefined),
      model: runtimeOverride.modelId,
      effort,
      thinking,
      providerId: runtimeOverride.providerId,
    }
  }

  return getDefaultRuntimeSettings()
}

async function getRuntimeSettingsWithWorkflowPolicy(
  sessionId: string,
  runtimeSettings?: RuntimeSettings,
  state?: WorkflowSessionState,
): Promise<RuntimeSettings> {
  const settings = runtimeSettings ?? await getRuntimeSettings(sessionId)
  const workflowState = state ?? await loadWorkflowStateForWebSocket(sessionId)
  const disallowedTools = getWorkflowPhaseDisallowedTools(workflowState)
  const workflowSystemPrompt = buildWorkflowRuntimeBindingInstruction(sessionId, workflowState)
  const workflowSettings = getWorkflowScopedToolNames(workflowState).length > 0
    ? {
        workflowSessionId: sessionId,
        ...(workflowSystemPrompt ? { workflowSystemPrompt } : {}),
      }
    : {}
  return disallowedTools.length > 0
    ? { ...settings, ...workflowSettings, disallowedTools }
    : { ...settings, ...workflowSettings }
}

function buildWorkflowRuntimeBindingInstruction(
  sessionId: string,
  state: WorkflowSessionState | null | undefined,
): string | null {
  if (!state || getWorkflowScopedToolNames(state).length === 0 || !state.activePhaseId) return null

  return [
    '<desktop-workflow-runtime-binding>',
    `This CLI process is authoritatively bound to Desktop workflow session ${sessionId} and active phase ${state.activePhaseId}.`,
    'The current process has registered submit_phase_completion and request_workflow_route for this active workflow phase.',
    'Historical transcript messages, including any earlier “No such tool available” result, are not a current tool-availability check and must not be reused as a reason to skip a required workflow tool call.',
    'Use the actual current tool result as the only source of truth. When this phase is ready, call submit_phase_completion with status, handoff, rationale, and evidence; do not replace it with prose or continue into a later phase.',
    'Use request_workflow_route only for a true non-linear route, rework, jump_to_phase, pause/resume, or finish. Never call it merely to enter the immediate linear next phase already represented by the pending completion; after a Stage 4 repair, a confirmed normal completion enters Stage 5 automatically.',
    'Obey the current phase tool policy even if an older transcript turn used a now-forbidden tool.',
    '</desktop-workflow-runtime-binding>',
  ].join('\n')
}

async function getDefaultRuntimeSettings(): Promise<RuntimeSettings> {
  // Check if a custom provider is active
  const { providers, activeId } = await providerService.listProviders()
  let resolvedActiveId = activeId
  if (activeId && !providers.some((provider) => provider.id === activeId)) {
    console.warn(`[WS] Active provider id is stale, falling back to official provider: ${activeId}`)
    resolvedActiveId = null
    await providerService.activateOfficial()
  }

  const userSettings = await settingsService.getUserSettings()
  const providerSettings = resolvedActiveId
    ? await providerService.getManagedSettings()
    : undefined
  const modelSettings = providerSettings ?? userSettings
  const modelContext =
    typeof modelSettings.modelContext === 'string' && modelSettings.modelContext.trim()
      ? modelSettings.modelContext
      : undefined
  const effort =
    typeof userSettings.effort === 'string' && userSettings.effort.trim()
      ? userSettings.effort
      : undefined
  const thinking = resolveDesktopThinkingMode(userSettings)

  let model: string | undefined
  if (resolvedActiveId) {
    // Provider is active — only consult provider-managed cc-jiangxia settings.
    // Global ~/.claude/settings.json model values must not bleed into provider mode.
    const baseModel =
      typeof modelSettings.model === 'string' && modelSettings.model.trim()
        ? modelSettings.model
        : ''
    if (baseModel) {
      model = baseModel
      if (modelContext) model += `:${modelContext}`
    }
  } else {
    // No provider — pass model normally
    const baseModel =
      typeof userSettings.model === 'string' && userSettings.model.trim()
        ? userSettings.model
        : undefined
    model = baseModel ? (modelContext ? `${baseModel}:${modelContext}` : baseModel) : undefined
  }

  return {
    permissionMode: await settingsService.getPermissionMode().catch(() => undefined),
    model,
    effort,
    thinking,
    providerId: resolvedActiveId,
  }
}

function resolveDesktopThinkingMode(
  settings: Record<string, unknown>,
): 'disabled' | undefined {
  return settings.alwaysThinkingEnabled === false ? 'disabled' : undefined
}

async function buildSessionStartupDiagnosticMessage(
  sessionId: string,
  cause: string,
): Promise<string> {
  const lines = [
    cause,
    '',
    'Desktop service diagnostics:',
    `- sessionId: ${sessionId}`,
  ]

  try {
    const recentWorkDir = lastResolvedStartupWorkDirs.get(sessionId)
    const workDir =
      recentWorkDir ||
      conversationService.getSessionWorkDir(sessionId) ||
      await sessionService.getSessionWorkDir(sessionId)
    lines.push(`- workDir: ${workDir ?? '(unknown)'}`)
  } catch (err) {
    lines.push(`- workDir: failed to resolve (${err instanceof Error ? err.message : String(err)})`)
  }

  const runtimeOverride = runtimeOverrides.get(sessionId)
  if (runtimeOverride) {
    lines.push(`- runtimeOverride.providerId: ${runtimeOverride.providerId ?? '(official)'}`)
    lines.push(`- runtimeOverride.modelId: ${runtimeOverride.modelId}`)
  } else {
    lines.push('- runtimeOverride: (none)')
  }

  try {
    const { providers, activeId } = await providerService.listProviders()
    lines.push(`- activeProviderId: ${activeId ?? '(official)'}`)
    lines.push(`- configuredProviders: ${providers.length}`)
    if (providers.length > 0) {
      lines.push(
        `- providerIndex: ${providers
          .map((provider) => `${provider.name} (${provider.id})`)
          .join(', ')}`,
      )
    }
  } catch (err) {
    lines.push(`- providers: failed to read (${err instanceof Error ? err.message : String(err)})`)
  }

  return lines.join('\n')
}

function enqueueRuntimeTransition(
  sessionId: string,
  transition: () => Promise<void>,
): Promise<void> {
  const previous = runtimeTransitionPromises.get(sessionId) ?? Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(transition)
    .finally(() => {
      if (runtimeTransitionPromises.get(sessionId) === next) {
        runtimeTransitionPromises.delete(sessionId)
      }
    })
  runtimeTransitionPromises.set(sessionId, next)
  return next
}

async function waitForRuntimeTransitionBeforeUserTurn(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
): Promise<{ ok: boolean; waited: boolean }> {
  let waited = false
  let pendingRuntimeTransition = runtimeTransitionPromises.get(sessionId)
  while (pendingRuntimeTransition) {
    waited = true
    try {
      await pendingRuntimeTransition
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      void diagnosticsService.recordEvent({
        type: 'runtime_transition_failed',
        severity: 'error',
        sessionId,
        summary: errMsg,
        details: err,
      })
      console.error(`[WS] Runtime transition failed before handling user message for ${sessionId}: ${errMsg}`)
      sendMessage(ws, {
        type: 'error',
        message: `Failed to switch provider/model: ${errMsg}`,
        code: 'CLI_RESTART_FAILED',
      })
      sendMessage(ws, { type: 'status', state: 'idle' })
      return { ok: false, waited }
    }

    const nextTransition = runtimeTransitionPromises.get(sessionId)
    pendingRuntimeTransition =
      nextTransition && nextTransition !== pendingRuntimeTransition
        ? nextTransition
        : undefined
  }

  return { ok: true, waited }
}

async function getWorkflowMetadata(sessionId: string): Promise<WorkflowSessionMetadata | null> {
  const detail = await sessionService.getSession(sessionId).catch(() => null)
  return detail?.workflow?.mode === 'workflow' ? detail.workflow : null
}

async function loadWorkflowStateForWebSocket(
  sessionId: string,
  metadata?: WorkflowSessionMetadata,
): Promise<WorkflowSessionState | null> {
  const read = await workflowSessionStateService.readState(sessionId).catch(() => null)
  if (read?.state) return read.state
  const cached = ephemeralWorkflowStates.get(sessionId)
  if (cached) return cached

  const workflow = metadata ?? await getWorkflowMetadata(sessionId)
  if (!workflow) {
    if (sessionId.startsWith('workflow-')) {
      const state = makeEphemeralWorkflowState(sessionId)
      ephemeralWorkflowStates.set(sessionId, state)
      return state
    }
    return null
  }
  const state = makeEphemeralWorkflowState(sessionId, workflow)
  ephemeralWorkflowStates.set(sessionId, state)
  return state
}

async function persistWorkflowStateIfAvailable(
  sessionId: string,
  state: WorkflowSessionState,
  expectedStateVersion: number,
): Promise<void> {
  const read = await workflowSessionStateService.readState(sessionId).catch(() => null)
  if (!read?.exists) {
    ephemeralWorkflowStates.set(sessionId, state)
    return
  }
  const write = await workflowSessionStateService.writeState(sessionId, state, { expectedStateVersion }).catch((error) => {
    console.warn(`[WS] Failed to persist workflow state for ${sessionId}:`, error)
    return null
  })
  if (!write) return
  await persistWorkflowFinalReportIfReady(write.state)

  const workDir =
    conversationService.getSessionWorkDir(sessionId) ||
    await sessionService.getSessionWorkDir(sessionId).catch(() => null)
  if (!workDir) return

  const metadata = stateToWorkflowMetadata(write.state, write.pointer)
  const model = getVisibleWorkflowModelResolution(write.state)
  await sessionService.appendSessionMetadata(sessionId, {
    workDir,
    workflow: model ? { ...metadata, model } : metadata,
  }).catch((error) => {
    console.warn(`[WS] Failed to append workflow metadata for ${sessionId}:`, error)
  })
}

async function persistWorkflowFinalReportIfReady(state: WorkflowSessionState): Promise<void> {
  if (!state.finalReportRef) return
  await workflowReportStore.createFinalReport(state.sessionId, buildWorkflowFinalReport(state)).catch((error) => {
    console.warn(`[WS] Failed to persist workflow final report for ${state.sessionId}:`, error)
  })
}

function makeEphemeralWorkflowState(
  sessionId: string,
  workflow?: WorkflowSessionMetadata,
): WorkflowSessionState {
  const now = new Date().toISOString()
  const activePhaseId = workflow?.activePhaseId ?? 'implementation'
  const templateId = workflow?.templateId ?? 'ephemeral-workflow'
  const templateVersion = workflow?.templateVersion ?? '1'
  const templateSource = workflow?.templateSource ?? 'builtin'
  return {
    schemaVersion: 1,
    sessionId,
    mode: 'workflow',
    template: {
      id: templateId,
      version: String(templateVersion),
      source: templateSource,
      snapshotId: workflow?.templateSnapshotId ?? `${templateId}-v${templateVersion}`,
      sourceState: 'current',
    },
    templateIdentity: {
      id: templateId,
      source: templateSource,
      version: templateVersion,
      registryKey: `${templateSource}:${templateId}`,
    },
    sourceTemplateStatus: 'current',
    status: workflow?.status ?? workflow?.workflowStatus ?? 'running',
    workflowStatus: workflow?.workflowStatus ?? workflow?.status ?? 'running',
    activePhaseId,
    phases: [
      {
        id: activePhaseId || 'implementation',
        index: 0,
        status: 'running',
        artifactPointers: [],
      },
    ],
    phaseRuns: [],
    transitionHistory: [],
    artifactIndex: [],
    finalReportRef: null,
    stateVersion: workflow?.stateVersion ?? workflow?.stateRevision ?? 1,
    revision: workflow?.stateRevision ?? workflow?.stateVersion ?? 1,
    createdAt: now,
    updatedAt: now,
    pendingConfirmation: null,
  }
}

function isWorkflowTransitionRequest(message: Extract<ClientMessage, { type: 'workflow_transition' }>): boolean {
  return (
    typeof message.phaseId === 'string' &&
    message.phaseId.length > 0 &&
    (
      message.action === 'confirm' ||
      message.action === 'reject' ||
      message.action === 'retry' ||
      message.action === 'manual_complete' ||
      message.action === 'pause' ||
      message.action === 'resume' ||
      message.action === 'stop' ||
      message.action === 'route' ||
      message.action === 'ready' ||
      message.action === 'needs_user' ||
      message.action === 'completed' ||
      message.action === 'blocked' ||
      message.action === 'unable'
    ) &&
    isSupportedNextPhaseContextStrategy(message.nextPhaseContextStrategy)
  )
}

export function workflowNotificationForDesktop(notification: {
  type: string
  subtype?: string
  data?: unknown
  message?: string
}): Record<string, unknown> {
  if (notification.type !== 'system_notification' || notification.subtype !== 'workflow_state') {
    return notification as Record<string, unknown>
  }
  return {
    ...notification,
    data: isWorkflowSessionState(notification.data)
      ? workflowSummaryForWebSocket(notification.data)
      : notification.data,
  }
}

function workflowSummaryForWebSocket(state: WorkflowSessionState): WorkflowSessionSummary {
  const summary = workflowSummaryFromState(state)
  const model = getVisibleWorkflowModelResolution(state)
  const blocked = summary.pendingConfirmation ? null : getActiveBlockedSubmission(state)
  return {
    ...summary,
    ...(model ? { model } : {}),
    ...(blocked
      ? {
          blockedReason: blocked.submission.rationale,
          blockedStatus: blocked.submission.status,
          blockedEvidence: blocked.submission.evidence,
          blockedArtifact: workflowArtifactSummary(blocked.artifact, blocked.submission),
        }
      : {}),
  }
}

function getActiveBlockedSubmission(state: WorkflowSessionState): {
  artifact: Record<string, unknown>
  submission: CompletionSubmission
} | null {
  const phase = state.activePhaseId
    ? state.phases.find((candidate) => candidate.id === state.activePhaseId)
    : null
  const pointers = phase?.artifactPointers ?? []
  for (const pointer of [...pointers].reverse()) {
    const record = pointer as Record<string, unknown>
    const submission = record.submission
    if (!isBlockedCompletionSubmission(submission)) continue
    return { artifact: record, submission }
  }
  return null
}

function isBlockedCompletionSubmission(value: unknown): value is CompletionSubmission {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    (record.status === 'blocked' || record.status === 'unable') &&
    typeof record.rationale === 'string' &&
    Array.isArray(record.evidence)
  )
}

function workflowArtifactSummary(
  artifact: Record<string, unknown>,
  submission: CompletionSubmission,
): Record<string, unknown> {
  const handoff = submission.handoff
  return {
    artifactId: typeof artifact.artifactId === 'string' ? artifact.artifactId : `${submission.phaseId}-${submission.status}`,
    phaseId: submission.phaseId,
    status: submission.status,
    label: typeof artifact.title === 'string' ? artifact.title : `${submission.phaseId} ${submission.status}`,
    handoffSummary: typeof handoff.summary === 'string' ? handoff.summary : submission.rationale,
    evidenceSummary: submission.evidence
      .map((item) => typeof item.ref === 'string' ? item.ref : typeof item.label === 'string' ? item.label : '')
      .filter(Boolean)
      .join('; '),
    createdAt: typeof artifact.createdAt === 'string' ? artifact.createdAt : new Date(0).toISOString(),
    transitionId: typeof artifact.artifactId === 'string' ? artifact.artifactId : undefined,
    completionId: typeof artifact.artifactId === 'string' ? artifact.artifactId : undefined,
    provenance: submission.status === 'blocked' ? 'agent-blocked' : 'agent-unable',
  }
}

function isWorkflowSessionState(value: unknown): value is WorkflowSessionState {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).mode === 'workflow' &&
    Array.isArray((value as Record<string, unknown>).phases),
  )
}

/**
 * Send a message to a specific session's WebSocket (for use by services)
 */
export function sendToSession(sessionId: string, message: ServerMessage): boolean {
  const clients = activeSessions.get(sessionId)
  if (!clients || clients.size === 0) return false

  const payload = JSON.stringify(message)
  let delivered = false
  for (const ws of [...clients]) {
    if (sendToClient(ws, payload, message.type) !== 'dropped') {
      delivered = true
    }
  }
  return delivered
}

export function updateSessionSlashCommands(
  sessionId: string,
  commands: unknown[],
  options: { notifyClient?: boolean } = {},
): SessionSlashCommand[] {
  const normalized = commands
    .map(normalizeSessionSlashCommand)
    .filter((command): command is SessionSlashCommand => command !== null)

  sessionSlashCommands.set(sessionId, normalized)

  if (options.notifyClient !== false) {
    sendToSession(sessionId, {
      type: 'system_notification',
      subtype: 'slash_commands',
      data: normalized,
    })
  }

  return normalized
}

function normalizeSessionSlashCommand(command: unknown): SessionSlashCommand | null {
  if (typeof command === 'string') {
    return command.trim() ? { name: command, description: '' } : null
  }
  if (!command || typeof command !== 'object') return null

  const record = command as {
    name?: unknown
    command?: unknown
    description?: unknown
    argumentHint?: unknown
  }
  const name =
    typeof record.name === 'string'
      ? record.name
      : typeof record.command === 'string'
        ? record.command
        : ''
  if (!name.trim()) return null

  return {
    name,
    description: typeof record.description === 'string' ? record.description : '',
    ...(typeof record.argumentHint === 'string' ? { argumentHint: record.argumentHint } : {}),
  }
}

export function closeSessionConnection(sessionId: string, reason = 'session closed'): boolean {
  const cleanupTimer = sessionCleanupTimers.get(sessionId)
  if (cleanupTimer) {
    clearTimeout(cleanupTimer)
    sessionCleanupTimers.delete(sessionId)
  }
  computerUseApprovalService.cancelSession(sessionId)
  conversationService.clearOutputCallbacks(sessionId)
  cleanupSessionRuntimeState(sessionId)

  const clients = activeSessions.get(sessionId)
  if (!clients || clients.size === 0) return false

  activeSessions.delete(sessionId)
  for (const ws of clients) {
    clientOutputCallbacks.delete(ws)
    ws.close(1000, reason)
  }
  return true
}

export function getActiveSessionIds(): string[] {
  return Array.from(activeSessions.keys())
}

export function __resetWebSocketHandlerStateForTests(): void {
  for (const timer of sessionCleanupTimers.values()) clearTimeout(timer)
  for (const timer of prewarmIdleTimers.values()) clearTimeout(timer)
  activeSessions.clear()
  clientOutputCallbacks.clear()
  sessionCleanupTimers.clear()
  prewarmIdleTimers.clear()
  clearWorkflowSessionTransitionCoordinatorForTests()
  runtimeTransitionPromises.clear()
  runtimeOverrides.clear()
  sessionStartupPromises.clear()
  prewarmPendingSessions.clear()
  prewarmedSessions.clear()
  ephemeralWorkflowStates.clear()
}
