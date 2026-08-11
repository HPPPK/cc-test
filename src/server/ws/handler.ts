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
import { expertHumanVerificationService } from '../services/expertHumanVerificationService.js'
import { expertBrowserActivityService } from '../services/expertBrowserActivityService.js'
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
  markAskUserQuestionIssuesStale,
  recordAskUserQuestionAnswer,
  recordAskUserQuestionIssue,
} from '../services/workflowCompletionGate.js'
import { loadCurrentWorkflowTemplate } from '../services/workflowRuntimeTemplateService.js'
import { buildWorkflowFinalReport } from '../services/workflowFinalReport.js'
import {
  getWorkflowPhaseDisallowedTools,
  getWorkflowPromptToolGuidance,
  getWorkflowScopedToolNames,
  getWorkflowQuestionCardContractViolation,
  hasWorkflowArtifactWriteCapability,
  isWorkflowArtifactWritePath,
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
  WorkflowPhaseIssue,
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
  ExpertRuntimeBindingError,
  hasActiveExpertRuntime,
  resolveExpertRuntimeToolPolicy,
} from '../services/expertRuntimeBindingService.js'
import { expertRuntimeSessionStore } from '../services/expertRuntimeSessionStore.js'
import {
  resolveExpertResearchDeliveryTerminalRecovery,
  type ExpertResearchDeliveryTerminalRecovery,
} from '../services/expertResearchDeliveryTerminalService.js'

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
  expertHumanVerificationService.cancelSession(sessionId, 'Desktop session disconnected before browser verification was resolved.')
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
    void reconcilePersistedWorkflowAskUserQuestionAnswers(sessionId).catch((error) => {
      console.warn('[WS] Failed to reconcile persisted AskUserQuestion answers for ' + sessionId + ': ' + (
        error instanceof Error ? error.message : String(error)
      ))
    })
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
    void replayPersistedWorkflowAskUserQuestion(ws, sessionId).catch((error) => {
      console.warn('[WS] Failed to restore persisted workflow AskUserQuestion for ' + sessionId + ': ' + (
        error instanceof Error ? error.message : String(error)
      ))
    })
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
  const streamState = getStreamState(sessionId)
  resetStrictVisualQaEvidence(streamState)
  streamState.strictVisualIntroductionTurn = false
  clearPrewarmState(sessionId)
  const strictVisualRuntimeActive = await isStrictVisualRuntimeActive(sessionId)
  if (strictVisualRuntimeActive && userRequestsStrictVisualPublicResearch(message.content)) {
    // The user has already chosen a public reference site or explicitly
    // authorized web research. Do not let a text-only model turn pretend that
    // this visual-research decision never happened.
    streamState.strictVisualReferenceResearchRequired = true
    streamState.strictVisualLockedReferenceUrls = strictVisualPublicReferenceUrls(message.content)
  }
  if (strictVisualRuntimeActive && userRequestsStrictVisualFinalDelivery(message.content, message.attachments)) {
    // A rendered artifact cannot complete through a prose-only final claim.
    streamState.strictVisualFinalReviewRequired = true
  }

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

  // Only the automatic first-turn "what can this Expert do?" request is a
  // welcome response. A later capability question remains an ordinary turn.
  streamState.strictVisualIntroductionTurn = titleState.userMessageCount === 1
    && isStrictVisualIntroductionRequest(message.content)

  // 启动 CLI 子进程（如果还没有）
  try {
    await ensureCliSessionStarted(ws, sessionId, 'user_message')
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    const code =
      err instanceof ExpertRuntimeBindingError
        ? err.code
        : err instanceof ConversationStartupError
          ? err.code
          : 'CLI_START_FAILED'
    console.error('[WS] CLI start failed for ' + sessionId + ': ' + errMsg)
    sendMessage(ws, {
      type: 'error',
      message: err instanceof ExpertRuntimeBindingError
        ? errMsg
        : await buildSessionStartupDiagnosticMessage(sessionId, errMsg),
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
  if (session?.expert?.mode === 'expert' && session.expert.status === 'active' && !hasActiveExpertRuntime(session.expert)) {
    sendMessage(ws, {
      type: 'error',
      message: new ExpertRuntimeBindingError().message,
      code: 'EXPERT_RUNTIME_BINDING_MISSING',
    })
    return null
  }

  // Expert runtime is attached as a hidden CLI system prompt when the session
  // starts. Never prepend it to a visible user turn or transcript entry.
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

async function rejectUnsafeWorkflowArtifactWrite(
  sessionId: string,
  requestId: string,
  allowed: boolean,
  updatedInput?: Record<string, unknown>,
): Promise<string | null> {
  if (!allowed) return null
  const pending = conversationService.getPendingPermissionRequests(sessionId)
    .find((request) => request.requestId === requestId)
  if (!pending || pending.toolName !== 'Write') return null

  const stateRead = await workflowSessionStateService.readState(sessionId)
  if (!stateRead.exists || !stateRead.state || !hasWorkflowArtifactWriteCapability(stateRead.state)) return null

  const input = updatedInput ?? pending.input
  const candidatePath = input.file_path ?? input.filePath ?? input.path
  const workDir = conversationService.getSessionWorkDir(sessionId)
    || await sessionService.getSessionWorkDir(sessionId).catch(() => null)
  if (workDir && isWorkflowArtifactWritePath(workDir, candidatePath)) return null

  conversationService.respondToPermission(sessionId, requestId, false)
  return 'This workflow phase may write only session-internal .workflow artifacts. Production files and unknown paths remain blocked until a phase explicitly grants normal edit capability.'
}

function persistedWorkflowQuestionRecoveryPrompt(answered: boolean): string {
  return answered
    ? [
        '<workflow-persisted-question-recovery>',
        'A restored workflow AskUserQuestion card was answered after the former CLI runtime no longer existed.',
        'The authoritative workflow state now contains that answer. Continue the active phase using the persisted answer and do not repeat the question.',
        'Only ask a new AskUserQuestion if a separate, still-unresolved decision is necessary.',
        '</workflow-persisted-question-recovery>',
      ].join('\n')
    : [
        '<workflow-persisted-question-dismissed>',
        'The user dismissed or denied a restored workflow AskUserQuestion card after the former CLI runtime no longer existed.',
        'The old card was marked stale and is not approval. Reassess the active phase from persisted state; ask one fresh structured question only if a decision is still necessary.',
        '</workflow-persisted-question-dismissed>',
      ].join('\n')
}

async function handlePermissionResponse(
  ws: ServerWebSocket<WebSocketData>,
  message: Extract<ClientMessage, { type: 'permission_response' }>
) {
  const { sessionId } = ws.data
  if (isE2ETestModeEnabled() && e2eTestPermissionRequestIds.has(message.requestId)) {
    return
  }
  if (expertHumanVerificationService.resolveVerification(
    message.requestId,
    message.allowed,
    message.updatedInput,
  )) {
    sendMessage(ws, { type: 'permission_response_ack', requestId: message.requestId, status: 'accepted' })
    return
  }
  const artifactWriteDenial = await rejectUnsafeWorkflowArtifactWrite(
    sessionId,
    message.requestId,
    message.allowed,
    message.updatedInput,
  )
  if (artifactWriteDenial) {
    sendMessage(ws, {
      type: 'permission_response_ack',
      requestId: message.requestId,
      status: 'rejected',
      message: artifactWriteDenial,
    })
    sendMessage(ws, {
      type: 'error',
      message: artifactWriteDenial,
      code: 'WORKFLOW_ARTIFACT_WRITE_FORBIDDEN',
    })
    return
  }
  const pendingAskUserQuestion = conversationService.getPendingPermissionRequests(sessionId)
    .find((request) => request.requestId === message.requestId && request.toolName === 'AskUserQuestion')
  const askUserQuestionAnswer = message.allowed && isAskUserQuestionAnswer(message.updatedInput)
  const restoredPersistedQuestion = !pendingAskUserQuestion
    && !conversationService.hasSession(sessionId)
    && await hasPersistedOpenWorkflowQuestionRequest(sessionId, message.requestId)

  if (restoredPersistedQuestion && (askUserQuestionAnswer || !message.allowed)) {
    const resumed = await enqueueWorkflowSessionTransition(sessionId, async () => {
      if (askUserQuestionAnswer) {
        await recordWorkflowAskUserQuestionAnswer(
          sessionId,
          message.requestId,
          message.updatedInput as Record<string, unknown>,
        )
      } else {
        await staleWorkflowAskUserQuestionIssues(sessionId, {
          requestId: message.requestId,
          rationale: 'The user dismissed or denied a restored AskUserQuestion card after its original CLI runtime was gone; the stale card must not block workflow recovery.',
        })
      }
      if (!conversationService.hasSession(sessionId)) {
        await ensureCliSessionStarted(ws, sessionId, 'workflow_auto_continue')
      }
      return conversationService.sendMessage(
        sessionId,
        persistedWorkflowQuestionRecoveryPrompt(askUserQuestionAnswer),
      )
    })
    if (!resumed) {
      sendMessage(ws, {
        type: 'permission_response_ack',
        requestId: message.requestId,
        status: 'rejected',
        message: 'The structured answer was saved, but the workflow CLI could not be resumed.',
      })
      sendMessage(ws, {
        type: 'error',
        message: 'The structured answer was saved, but the workflow CLI could not be resumed.',
        code: 'CLI_NOT_RUNNING',
      })
      sendMessage(ws, { type: 'status', state: 'idle' })
      return
    }
    sendMessage(ws, { type: 'permission_response_ack', requestId: message.requestId, status: 'accepted' })
    console.log(`[WS] Restored workflow question response for ${message.requestId}: ${message.allowed}`)
    return
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
    : pendingAskUserQuestion
      ? await enqueueWorkflowSessionTransition(sessionId, async () => {
          await staleWorkflowAskUserQuestionIssues(sessionId, {
            requestId: message.requestId,
            toolUseId: pendingAskUserQuestion.toolUseId,
            rationale: 'The user dismissed or denied the AskUserQuestion card before providing an answer; the stale question must not block the workflow.',
          })
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

function askUserQuestionPrompts(input: unknown): Array<{
  id?: string
  question?: string
  prompt?: string
  header?: string
  blocksCompletion?: boolean
  [key: string]: unknown
}> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  const questions = (input as Record<string, unknown>).questions
  if (!Array.isArray(questions)) return []
  return questions.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : undefined
    const question = typeof record.question === 'string' ? record.question : undefined
    const prompt = typeof record.prompt === 'string' ? record.prompt : undefined
    const header = typeof record.header === 'string' ? record.header : undefined
    const explicitBlocksCompletion = typeof record.blocksCompletion === 'boolean'
      ? record.blocksCompletion
      : undefined
    return id || question || prompt || header ? [{
      ...record,
      id,
      question,
      prompt,
      header,
      // AskUserQuestion is only for current-phase information or authorization.
      // Retain the fail-closed default unless the tool explicitly marks an
      // informational acknowledgement as non-blocking.
      blocksCompletion: explicitBlocksCompletion ?? true,
    }] : []
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
): Promise<Extract<ServerMessage, { type: 'permission_request' }> | null> {
  if (request.toolName !== 'AskUserQuestion') return request

  const researchDeliveryCardDenial = await getExpertResearchDeliveryCardDenial(sessionId, request.input)
  if (researchDeliveryCardDenial) {
    const delivered = conversationService.respondToPermission(
      sessionId,
      request.requestId,
      false,
      undefined,
      undefined,
      researchDeliveryCardDenial,
    )
    broadcastServerMessageToSession(sessionId, {
      type: 'error',
      code: 'EXPERT_RESEARCH_DELIVERY_PREMATURE',
      message: delivered
        ? researchDeliveryCardDenial
        : researchDeliveryCardDenial + ' The CLI session is not running, so the card was not delivered.',
    })
    return null
  }

  const stateRead = await workflowSessionStateService.readState(sessionId)
  if (!stateRead.exists || !stateRead.state || !isWorkflowSessionState(stateRead.state)) return request

  // The persisted workflow state is authoritative here. The CLI-side app state
  // can be stale across launch/resume, so reject invalid cards before the
  // desktop receives a selectable permission request.
  const contractViolation = getWorkflowQuestionCardContractViolation(
    request.toolName,
    request.input,
    stateRead.state,
  )
  if (contractViolation) {
    const delivered = conversationService.respondToPermission(
      sessionId,
      request.requestId,
      false,
      undefined,
      undefined,
      contractViolation,
    )
    broadcastServerMessageToSession(sessionId, {
      type: 'error',
      code: 'WORKFLOW_QUESTION_CONTRACT_VIOLATION',
      message: delivered
        ? contractViolation
        : contractViolation + ' The CLI session is not running, so the card was not delivered.',
    })
    return null
  }

  const questions = askUserQuestionPrompts(request.input)
  if (!questions.length) return request

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

function expertResearchDeliveryQuestionReferences(input: unknown): {
  hasDeliveryMetadata: boolean
  questionIds: string[]
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { hasDeliveryMetadata: false, questionIds: [] }
  }

  const record = input as Record<string, unknown>
  const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
    ? record.metadata as Record<string, unknown>
    : undefined
  const rootDelivery = metadata?.expert_research_delivery
  const rootDeliveryRecord = rootDelivery && typeof rootDelivery === 'object' && !Array.isArray(rootDelivery)
    ? rootDelivery as Record<string, unknown>
    : undefined
  const questionIds = new Set<string>()
  if (typeof rootDeliveryRecord?.question_id === 'string' && rootDeliveryRecord.question_id.trim()) {
    questionIds.add(rootDeliveryRecord.question_id.trim())
  }

  const questions = Array.isArray(record.questions) ? record.questions : []
  for (const question of questions) {
    if (!question || typeof question !== 'object' || Array.isArray(question)) continue
    const questionRecord = question as Record<string, unknown>
    if (typeof questionRecord.id === 'string' && questionRecord.id.trim()) {
      questionIds.add(questionRecord.id.trim())
    }
    const questionMetadata = questionRecord.metadata
    if (!questionMetadata || typeof questionMetadata !== 'object' || Array.isArray(questionMetadata)) continue
    const questionId = (questionMetadata as Record<string, unknown>).question_id
    if (typeof questionId === 'string' && questionId.trim()) questionIds.add(questionId.trim())
  }

  return {
    hasDeliveryMetadata: Boolean(rootDeliveryRecord),
    questionIds: [...questionIds],
  }
}

async function getExpertResearchDeliveryCardDenial(
  _sessionId: string,
  input: unknown,
): Promise<string | null> {
  // Research-delivery cards must always reach the user. Incomplete browser
  // audits (for example a Google CAPTCHA/VPN failure) are listed as unresolved
  // evidence; the user's explicit accept/continue/pause choice is authoritative.
  // Contract shape is still validated elsewhere before the answer is recorded.
  void input
  return null
}

async function staleWorkflowAskUserQuestionIssues(
  sessionId: string,
  input: { requestId?: string; toolUseId?: string; rationale: string },
): Promise<boolean> {
  const stateRead = await workflowSessionStateService.readState(sessionId)
  if (!stateRead.exists || !stateRead.state || !isWorkflowSessionState(stateRead.state)) return false

  const candidate = markAskUserQuestionIssuesStale(stateRead.state, {
    ...input,
    now: new Date().toISOString(),
  })
  if (candidate === stateRead.state) return false

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
  return true
}

async function recordWorkflowAskUserQuestionAnswer(
  sessionId: string,
  requestId: string,
  input: Record<string, unknown>,
): Promise<void> {
  const stateRead = await workflowSessionStateService.readState(sessionId)
  if (!stateRead.exists || !stateRead.state || !isWorkflowSessionState(stateRead.state)) return
  const answers = normalizedAskUserQuestionAnswers(input)
  if (!Object.keys(answers).length) return

  const candidate = recordAskUserQuestionAnswer(stateRead.state, {
    requestId,
    answers,
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

function askUserQuestionKeys(question: { id?: string; question?: string; prompt?: string; header?: string }): string[] {
  return [...new Set([question.id, question.question, question.prompt, question.header]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
}

function normalizedAskUserQuestionAnswers(input: Record<string, unknown>): Record<string, unknown> {
  const rawAnswers = input.answers
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) return {}
  const answers = { ...(rawAnswers as Record<string, unknown>) }
  for (const question of askUserQuestionPrompts(input)) {
    const keys = askUserQuestionKeys(question)
    const suppliedKey = keys.find((key) => Object.hasOwn(answers, key))
    if (!suppliedKey) continue
    const answer = answers[suppliedKey]
    for (const key of keys) answers[key] = answer
  }
  return answers
}

function textFromToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.flatMap((block) => {
    if (typeof block === 'string') return [block]
    if (!block || typeof block !== 'object') return []
    const record = block as Record<string, unknown>
    if (typeof record.text === 'string') return [record.text]
    return typeof record.content === 'string' ? [record.content] : []
  }).join('\n')
}

function persistedAskUserQuestionAnswer(
  resultText: string,
  question: { id?: string; question?: string; prompt?: string; header?: string },
): { questionKey: string; answer: string } | null {
  const prefix = 'User has answered your questions: '
  const suffix = ". You can now continue with the user's answers in mind."
  const start = resultText.indexOf(prefix)
  if (start === -1) return null
  const bodyStart = start + prefix.length
  const bodyEnd = resultText.indexOf(suffix, bodyStart)
  const body = resultText.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd)
  for (const key of askUserQuestionKeys(question).sort((left, right) => right.length - left.length)) {
    const marker = '"' + key + '"="'
    const answerStart = body.indexOf(marker)
    if (answerStart === -1) continue
    const valueStart = answerStart + marker.length
    const valueEnd = body.indexOf('"', valueStart)
    if (valueEnd === -1) continue
    return { questionKey: key, answer: body.slice(valueStart, valueEnd) }
  }
  return null
}

async function reconcilePersistedWorkflowAskUserQuestionAnswers(sessionId: string): Promise<void> {
  const stateRead = await workflowSessionStateService.readState(sessionId)
  if (!stateRead.exists || !stateRead.state || !isWorkflowSessionState(stateRead.state)) return
  const state = stateRead.state
  const phaseId = state.activePhaseId
  const phaseState = phaseId ? state.runtimeContract?.phaseStates[phaseId] : null
  const openIssues = phaseState?.issues.filter((issue) =>
    issue.source === 'ask-user-question'
    && issue.status === 'open'
    && typeof issue.questionRequestId === 'string'
    && typeof issue.toolUseId === 'string'
  ) ?? []
  if (!openIssues.length) return

  let messages: Array<{ type?: unknown; content?: unknown }>
  try {
    messages = await sessionService.getSessionMessages(sessionId)
  } catch {
    return
  }

  const askInputsByToolUseId = new Map<string, Record<string, unknown>>()
  const resultsByToolUseId = new Map<string, string>()
  const failedToolUseIds = new Set<string>()
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    for (const block of message.content) {
      if (!block || typeof block !== 'object') continue
      const record = block as Record<string, unknown>
      if (
        message.type === 'tool_use'
        && record.type === 'tool_use'
        && record.name === 'AskUserQuestion'
        && typeof record.id === 'string'
        && record.input
        && typeof record.input === 'object'
        && !Array.isArray(record.input)
      ) {
        askInputsByToolUseId.set(record.id, record.input as Record<string, unknown>)
      }
      if (
        message.type === 'tool_result'
        && record.type === 'tool_result'
        && typeof record.tool_use_id === 'string'
      ) {
        const text = textFromToolResultContent(record.content)
        if (text.includes('User has answered your questions:')) {
          resultsByToolUseId.set(record.tool_use_id, text)
        } else if (record.is_error === true) {
          failedToolUseIds.add(record.tool_use_id)
        }
      }
    }
  }

  let candidate = state
  for (const issue of openIssues) {
    if (issue.toolUseId && failedToolUseIds.has(issue.toolUseId)) {
      candidate = markAskUserQuestionIssuesStale(candidate, {
        toolUseId: issue.toolUseId,
        now: new Date().toISOString(),
        rationale: 'Recovered a persisted AskUserQuestion that ended with an error before an answer was delivered; the stale question no longer blocks the workflow.',
      })
      continue
    }
    const input = askInputsByToolUseId.get(issue.toolUseId!)
    const resultText = resultsByToolUseId.get(issue.toolUseId!)
    if (!input || !resultText) continue
    const question = askUserQuestionPrompts(input).find((entry) =>
      askUserQuestionKeys(entry).includes(issue.questionId ?? ''),
    )
    if (!question) continue
    const persistedAnswer = persistedAskUserQuestionAnswer(resultText, question)
    if (!persistedAnswer) continue
    const answers = normalizedAskUserQuestionAnswers({
      ...input,
      answers: { [persistedAnswer.questionKey]: persistedAnswer.answer },
    })
    candidate = recordAskUserQuestionAnswer(candidate, {
      requestId: issue.questionRequestId!,
      answers,
      now: new Date().toISOString(),
    })
  }
  if (candidate === state) return

  const written = await workflowSessionStateService.updateState(
    sessionId,
    () => candidate,
    { expectedStateVersion: state.stateVersion },
  )
  await appendWorkflowStateMetadata(sessionId, written.state, written.pointer)
  broadcastServerMessageToSession(sessionId, workflowNotificationForDesktop({
    type: 'system_notification',
    subtype: 'workflow_state',
    data: written.state,
  }) as ServerMessage)
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
  // A normal phase transition keeps the same workflow leader process alive.
  // The next turn contains only the newly active phase contract; tool execution
  // refreshes persisted Desktop state immediately before each real tool call.
  // Restarting remains reserved for a workflow binding/model/permission change.
  if (workflowResumeInstruction && !conversationService.hasSession(sessionId)) {
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
    message.action === 'retry'
    && previousState.runStatus === 'blocked'
    && nextState.workflowStatus === 'running'
    && nextState.runStatus === 'active'
    && Boolean(phaseId)
    && phaseId === previousState.activePhaseId
    && !nextState.pendingConfirmation
  ) {
    return `Continue automatically with the retried current workflow phase: ${phaseId}. Repair the recorded blocker before attempting any next-phase completion.`
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
  terminalRecoveryHandledForTurn: boolean
  terminalTurnSequence: number
  terminalFallbackTimer?: ReturnType<typeof setTimeout>
  failedAskUserQuestionToolUseIds: Set<string>
  strictVisualIntroductionTurn: boolean
  wroteStrictVisualHtml: boolean
  strictVisualHtmlWriteCount: number
  completedStrictVisualQa: boolean
  strictVisualRendererSuccessCount: number
  visualQaRendererToolUseIds: Set<string>
  strictVisualPngReadToolUseIds: Set<string>
  strictVisualLastImageReviewHtmlWriteCount: number | null
  /** True when the latest complete HTML write uses an unverifiable lifestyle price comparison. */
  strictVisualUnsupportedPriceAnalogyDetected: boolean
  /** True when a plan badge/ribbon is absolutely positioned and can overlap tier copy. */
  strictVisualUnsafeAbsolutePlanBadgeDetected: boolean
  /** True when CSS injects user-facing words into a semantic control via ::before/::after. */
  strictVisualGeneratedSemanticPseudoTextDetected: boolean
  /** True when an unverifiable QR/barcode-like pattern pretends to be a payment affordance. */
  strictVisualMisleadingPaymentCodeDetected: boolean
  /** True when process caveats are written into the customer-facing prototype UI. */
  strictVisualProcessDisclaimerDetected: boolean
  /** True when this user turn is asking the strict Expert to produce a rendered design artifact. */
  strictVisualFinalReviewRequired: boolean
  strictVisualReferenceResearchRequired: boolean
  /** A user-supplied pair of public URLs is a closed reference scope for this turn. */
  strictVisualLockedReferenceUrls: string[]
  strictVisualLockedReferenceAttemptUrls: Set<string>
  strictVisualReferenceSourceLockViolation: boolean
  strictVisualInspirationQuestionToolUseIds: Set<string>
  strictVisualReferenceResearchToolUseIds: Set<string>
  strictVisualReferenceScreenshotPathsByToolUseId: Map<string, string>
  strictVisualReferenceReadPathsByToolUseId: Map<string, string>
  strictVisualReferenceScreenshotReadPaths: Set<string>
  strictVisualReferenceResearchRecoveryAttempts: number
  strictVisualRenderRecoveryAttempts: number
  strictVisualReviewRecoveryAttempts: number
  structuredInteractionRecoveryAttempts: number
  expertResearchDeliveryRecoveryAttempts: number
  /** A delivery card reached the model turn; a transient record failure is not prose-only completion. */
  expertResearchDeliveryCardAttempted: boolean
  workflowProtocolToolRegistryError?: 'submit_phase_completion' | 'request_workflow_route'
  workflowProtocolBindingRecoveryAttempts: number
  workflowProtocolBindingRecoveryInFlight: boolean
  workflowProtocolInputValidationError?: WorkflowRecoverableInputToolName
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
      terminalRecoveryHandledForTurn: false,
      terminalTurnSequence: 0,
      terminalFallbackTimer: undefined,
      failedAskUserQuestionToolUseIds: new Set(),
      strictVisualIntroductionTurn: false,
      wroteStrictVisualHtml: false,
      strictVisualHtmlWriteCount: 0,
      completedStrictVisualQa: false,
      strictVisualRendererSuccessCount: 0,
      visualQaRendererToolUseIds: new Set(),
      strictVisualPngReadToolUseIds: new Set(),
      strictVisualLastImageReviewHtmlWriteCount: null,
      strictVisualUnsupportedPriceAnalogyDetected: false,
      strictVisualUnsafeAbsolutePlanBadgeDetected: false,
      strictVisualGeneratedSemanticPseudoTextDetected: false,
      strictVisualMisleadingPaymentCodeDetected: false,
      strictVisualProcessDisclaimerDetected: false,
      strictVisualFinalReviewRequired: false,
      strictVisualReferenceResearchRequired: false,
      strictVisualLockedReferenceUrls: [],
      strictVisualLockedReferenceAttemptUrls: new Set(),
      strictVisualReferenceSourceLockViolation: false,
      strictVisualInspirationQuestionToolUseIds: new Set(),
      strictVisualReferenceResearchToolUseIds: new Set(),
      strictVisualReferenceScreenshotPathsByToolUseId: new Map(),
      strictVisualReferenceReadPathsByToolUseId: new Map(),
      strictVisualReferenceScreenshotReadPaths: new Set(),
      strictVisualReferenceResearchRecoveryAttempts: 0,
      strictVisualRenderRecoveryAttempts: 0,
      strictVisualReviewRecoveryAttempts: 0,
      structuredInteractionRecoveryAttempts: 0,
      expertResearchDeliveryRecoveryAttempts: 0,
      expertResearchDeliveryCardAttempted: false,
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
  strictVisualIntroductionTurn: boolean
  wroteStrictVisualHtml: boolean
  completedStrictVisualQa: boolean
  completedStrictVisualReview: boolean
  visualReviewFailureReasons: string[]
  strictVisualReferenceResearchRequired: boolean
  completedStrictVisualReferenceResearch: boolean
  referenceResearchRecoveryAttempts: number
  renderQaRecoveryAttempts: number
  visualReviewRecoveryAttempts: number
  recoveryAttempts: number
}

type WorkflowTerminalRecovery = {
  state: WorkflowSessionState
  kind: 'ask-user-question' | 'continue-workflow'
}

type ExpertResearchDeliveryTerminalRecoveryResult = ExpertResearchDeliveryTerminalRecovery

type StrictVisualTerminalRecovery = {
  kind: 'ask-user-question' | 'design-direction' | 'visual-reference-research' | 'render-qa' | 'visual-review'
  expertId: string
  visualReviewFailureReasons?: string[]
}

function beginStreamedAssistantTurn(streamState: SessionStreamState): void {
  if (streamState.terminalFallbackTimer) clearTimeout(streamState.terminalFallbackTimer)
  streamState.terminalFallbackTimer = undefined
  streamState.terminalRecoveryHandledForTurn = false
  streamState.terminalTurnSequence += 1
  streamState.usedAskUserQuestion = false
  streamState.assistantText = ''
  streamState.failedAskUserQuestionToolUseIds.clear()
  streamState.workflowProtocolToolRegistryError = undefined
}

function recordAssistantText(streamState: SessionStreamState, text: unknown): void {
  if (typeof text !== 'string' || !text) return
  streamState.assistantText += text
}

function bashCommandWritesHtml(inputText: string): boolean {
  // A strict visual revision may be made through Bash (for example, Python or
  // PowerShell) rather than the dedicated Write/Edit tools. Count only clear
  // HTML-writing operations; rendering, reading, and shell inspection alone
  // must never satisfy the revision requirement.
  if (!/\.html?(?:["'\s)|;]|$)/i.test(inputText)) return false

  return /\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?|Set-Content|Add-Content|WriteAllText|WriteAllBytes|Out-File|write_text|write_bytes)\b/i.test(inputText)
    || /\bopen\s*\([^)]*,\s*["'][^"']*[wax][^"']*["'][^)]*\)\s*\.\s*write\s*\(/i.test(inputText)
    || /(?:^|[;&|])[^\r\n;&|]*(?:>>|>)\s*(?:["'][^"']*\.html?["']|[^\s;&|]*\.html?)(?:\s|$)/i.test(inputText)
    || /\bsed\b[^\r\n]*\s-i\S*[^\r\n]*\.html?/i.test(inputText)
    || /\bperl\b[^\r\n]*-pi\S*[^\r\n]*\.html?/i.test(inputText)
}

function normalizedStrictVisualPath(value: string): string {
  return value.trim().replace(/\\/g, '/').toLowerCase()
}

function inputRequestsStrictVisualInspirationSources(inputText: string): boolean {
  return /(?:"|')id(?:"|')\s*:\s*(?:"|')inspiration_sources(?:"|')/.test(inputText)
    || /\binspiration_sources\b/.test(inputText)
}

function playwrightRequestsScreenshot(inputText: string): boolean {
  return /(?:"|')include_screenshot(?:"|')\s*:\s*true/i.test(inputText)
    || /(?:"|')include_screenshot(?:"|')\s*:\s*true/i.test(inputText)
}

function normalizeStrictVisualImagePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase()
}

/**
 * Playwright screenshots are often too large for the model image reader.
 * A same-directory PNG derived from the returned name (for example
 * reference-scaled.png) is safe evidence for that source; arbitrary PNGs are not.
 */
function readTargetsStrictVisualReferenceScreenshot(inputText: string, screenshotPath: string): boolean {
  const input = normalizeStrictVisualImagePath(inputText)
  const source = normalizeStrictVisualImagePath(screenshotPath)
  if (input.includes(source)) return true

  const extensionIndex = source.lastIndexOf('.png')
  if (extensionIndex <= 0 || !source.endsWith('.png')) return false
  const prefix = source.slice(0, extensionIndex) + '-'
  const derivedStart = input.indexOf(prefix)
  if (derivedStart < 0) return false
  const derivedSuffix = input.slice(derivedStart + prefix.length).match(/^[^\\"'\s]+\.(?:png|jpe?g)(?:[\\"'\s]|$)/i)
  return derivedSuffix !== null
}

export function containsStrictVisualUnsafeAbsolutePlanBadge(inputText: string): boolean {
  const normalized = inputText.toLowerCase()
  const hasAbsolutePosition = /position\s*:\s*absolute/.test(normalized)
  if (!hasAbsolutePosition) return false
  // Limit the pairing window so unrelated absolute-positioned dialogs do not
  // trip the purchase-card rule. Promotion labels repeatedly caused 390px
  // title/price collisions in generated transaction windows.
  const planBadge = /(?:plan|tier|price|member|membership|套餐|会员)[-_ ]?(?:badge|ribbon|tag|flag|label)|(?:badge|ribbon|tag|flag|label)[-_ ]?(?:plan|tier|price|member|membership|套餐|会员)/
  const badgeMention = /(?:badge|ribbon|tag|flag|label|角标|飘带|推荐标|促销标|赠品标)/
  return (planBadge.test(normalized) && /(?:plan|tier|price|member|membership|套餐|会员|badge|ribbon|tag|flag|label)[\s\S]{0,260}position\s*:\s*absolute|position\s*:\s*absolute[\s\S]{0,260}(?:plan|tier|price|member|membership|套餐|会员|badge|ribbon|tag|flag|label)/.test(normalized))
    || (badgeMention.test(normalized) && /(?:badge|ribbon|tag|flag|label|角标|飘带|推荐标|促销标|赠品标)[\s\S]{0,180}position\s*:\s*absolute|position\s*:\s*absolute[\s\S]{0,180}(?:badge|ribbon|tag|flag|label|角标|飘带|推荐标|促销标|赠品标)/.test(normalized))
}

export function containsStrictVisualGeneratedSemanticPseudoText(inputText: string): boolean {
  // Write inputs are often JSON-stringified, so normalize escaped quotes before
  // looking for CSS pseudo-elements that inject visible words into controls.
  const normalized = inputText.replace(/\\"/g, '"').replace(/\\'/g, "'")
  const cssRule = /([^{}]{0,220}(?::?(?:before|after))[^{}]*)\{([^{}]{0,800})\}/gi
  for (const match of normalized.matchAll(cssRule)) {
    const selector = match[1] ?? ''
    const declarations = match[2] ?? ''
    if (!/(?:tab|nav|switch|plan|tier|member|membership|price|pay|button|cta|login|account)/i.test(selector)) continue
    const contentMatch = /content\s*:\s*["\']([^"\']+)["\']/i.exec(declarations)
    if (!contentMatch) continue
    // Decorative punctuation and empty content are fine. A word or CJK label
    // must be real DOM text so source-fidelity review can see and compare it.
    if (/[A-Za-z0-9\u4e00-\u9fff]{2,}/.test(contentMatch[1] ?? '')) return true
  }
  return false
}
export function containsStrictVisualMisleadingPaymentCode(inputText: string): boolean {
  const normalized = inputText.replace(/\\"/g, '"').replace(/\\'/g, "'").toLowerCase()
  // A CSS texture can be decorative elsewhere, but a dense black/white stripe
  // or grid inside a QR/payment/code selector looks like a real scannable
  // payment artefact while being unusable. Require an honest CTA instead.
  const paymentSelector = /(?:qr(?:-|_)?code|qrcode|barcode|payment(?:-|_)?code|payment-qr|二维码|扫码)[^{}]{0,260}\{[^{}]{0,900}\}/gi
  for (const match of normalized.matchAll(paymentSelector)) {
    const css = match[0] ?? ''
    if (/(?:repeating-linear-gradient|linear-gradient\([^)]*(?:#000|#111|black|rgb\(0))/i.test(css)) return true
  }
  return false
}

export function containsStrictVisualProcessDisclaimer(inputText: string): boolean {
  const normalized = inputText.replace(/\s+/g, '')
  return /(?:这是(?:交互|视觉|原型).{0,12}(?:假设|演示)|(?:仅为|只是).{0,12}(?:原型|演示)|not(?:a|an)?(?:completed|validated|production)|prototype(?:only|disclaimer))/i.test(normalized)
}

function containsStrictVisualUnsupportedPriceAnalogy(inputText: string): boolean {
  const text = inputText.toLowerCase()
  const hasPrice = /(?:[¥￥]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*元)/.test(text)
  const hasComparison = /(?:≈|约等于|相当于|只相当于|不到|一份|一杯|一顿|一次)/.test(text)
  const hasNamedLifestyleReference = /(咖啡|奶茶|电影票|午餐|早餐|自助餐|水煮鱼|炸鸡|打车|出租车|一顿饭|一份(?:饭|餐)|一杯)/.test(text)
  const hasFoodOrRideUnit = /[一二三四五六七八九十0-9]+\s*(?:份|次|杯|顿)[^<\n]{0,12}(?:鸡|鱼|餐|饭|咖啡|奶茶|电影|车)/.test(text)
  return hasPrice && hasComparison && (hasNamedLifestyleReference || hasFoodOrRideUnit)
}

function localScreenshotPathsFromPlaywrightResult(content: unknown): string[] {
  const text = textFromToolResultContent(content)
  const matches = [...text.matchAll(/Local screenshot path:\s*([^\r\n]+)/gi)]
  return [...new Set(matches
    .map((match) => match[1]?.trim())
    .filter((screenshotPath): screenshotPath is string => Boolean(screenshotPath))
    .map(normalizedStrictVisualPath))]
}

function normalizeStrictVisualPublicUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (!/^https?:$/i.test(url.protocol)) return null
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

/** Extracts only concrete user-supplied public URLs; order is preserved and duplicates removed. */
export function strictVisualPublicReferenceUrls(content: string): string[] {
  const urls: string[] = []
  for (const match of content.matchAll(/\bhttps?:\/\/[^\s<>"'）)】，,。、]+/gi)) {
    const normalized = normalizeStrictVisualPublicUrl(match[0] ?? '')
    if (normalized && !urls.includes(normalized)) urls.push(normalized)
  }
  return urls
}

function playwrightTargetUrl(input: unknown, inputText: string): string | null {
  const direct = input && typeof input === 'object' && typeof (input as { url?: unknown }).url === 'string'
    ? (input as { url: string }).url
    : null
  if (direct) return normalizeStrictVisualPublicUrl(direct)
  try {
    const parsed = JSON.parse(inputText) as { url?: unknown }
    return typeof parsed.url === 'string' ? normalizeStrictVisualPublicUrl(parsed.url) : null
  } catch {
    return null
  }
}

export function userRequestsStrictVisualPublicResearch(content: string): boolean {
  const normalized = content.trim()
  if (!normalized) return false

  // A pasted public URL is an unambiguous instruction to inspect that site.
  if (strictVisualPublicReferenceUrls(normalized).length > 0) return true

  return /(?:灵感(?:参考)?(?:网站|网页)|参考(?:网站|网页)|网站(?:研究|参考|借鉴)|网页(?:研究|参考|借鉴)|公开网站|外部参考|网络研究|website\s*(?:reference|research|inspiration)|(?:research|browse|study)\s*(?:websites?|sites?|references?)|visual\s*references?)/i.test(normalized)
}

export function userRequestsStrictVisualFinalDelivery(
  content: string,
  attachments?: Array<{ mimeType?: string; path?: string; name?: string }>,
): boolean {
  const normalized = content.trim()
  const requestsProduction = /(?:重构|改版|设计|制作|生成|交付|原型|实现|redesign|create|build|deliver|prototype)/i.test(normalized)
  const requestsArtifact = /(?:html|png|原型|视觉稿|渲染|截图|prototype|mockup|render)/i.test(normalized)
  const hasVisualAttachment = (attachments ?? []).some((attachment) => /image|png|jpe?g|webp/i.test(`${attachment.mimeType ?? ''} ${attachment.path ?? ''} ${attachment.name ?? ''}`))
  return requestsProduction && (requestsArtifact || hasVisualAttachment)
}

async function isStrictVisualRuntimeActive(sessionId: string): Promise<boolean> {
  const transcriptExpert = (await sessionService.getSession(sessionId).catch(() => null))?.expert
  const expert = hasActiveExpertRuntime(transcriptExpert)
    ? transcriptExpert
    : await expertRuntimeSessionStore.get(sessionId)
  return hasActiveExpertRuntime(expert) && expert.runtimeBinding.runtimePolicy?.mode === 'strict-visual-workflow'
}
function selectedStrictVisualPublicResearch(content: unknown): boolean | null {
  const text = textFromToolResultContent(content)
  if (!/User has answered your questions:/i.test(text) || !/\binspiration_sources\b/i.test(text)) return null
  const normalized = text.toLowerCase()
  if (/(?:不使用|不研究|无需外部|无需参考|no external|without external|do not research|none)/i.test(normalized)) return false
  if (/(?:内置|builtin|扩展|extend|允许.*(?:研究|网页)|public.*research|research.*public)/i.test(normalized)) return true
  return null
}

function recordAssistantToolUse(
  streamState: SessionStreamState,
  toolName: unknown,
  input?: unknown,
  toolUseId?: unknown,
): void {
  if (toolName === 'AskUserQuestion') streamState.usedAskUserQuestion = true
  if (toolName === 'AskUserQuestion') {
    const serialized = typeof input === 'string' ? input : JSON.stringify(input ?? '')
    if (/expert_research_delivery|research-delivery:|证据缺口.{0,40}(?:交付|报告)|accept_current_scope/i.test(serialized)) {
      streamState.expertResearchDeliveryCardAttempted = true
    }
  }
  if (WORKFLOW_PROTOCOL_TOOL_NAMES.has(toolName as WorkflowProtocolToolName)) streamState.workflowProtocolInputValidationError = undefined

  let inputText = ''
  try {
    inputText = typeof input === 'string' ? input : JSON.stringify(input ?? '')
  } catch {
    return
  }
  if (toolName === 'AskUserQuestion' && typeof toolUseId === 'string' && inputRequestsStrictVisualInspirationSources(inputText)) {
    streamState.strictVisualInspirationQuestionToolUseIds.add(toolUseId)
  }
  if (toolName === 'Playwright') {
    // Any Playwright use in this strict UIUX workflow is a claimed public
    // visual reference attempt. It must therefore finish as screenshot-backed
    // visual research rather than a text-only detour, including user-supplied
    // reference URLs that bypass the built-in choice card.
    streamState.strictVisualReferenceResearchRequired = true
    const referenceTargetUrl = playwrightTargetUrl(input, inputText)
    // content_block_start can arrive before the SDK has streamed the complete
    // Playwright input. Do not turn that partial/empty JSON into a false
    // “third-site” violation; evaluate only a complete URL or search request.
    const hasCompleteReferenceTarget = referenceTargetUrl !== null
      || /(?:"|')显式浏览器动作(?:"|')\s*:/i.test(inputText)
    if (streamState.strictVisualLockedReferenceUrls.length >= 2 && hasCompleteReferenceTarget) {
      if (!referenceTargetUrl || !streamState.strictVisualLockedReferenceUrls.includes(referenceTargetUrl)) {
        // The tool has already been requested by the model, so this is a
        // completion gate rather than an optimistic claim of prevention. It
        // ensures off-list research cannot become accepted visual evidence.
        streamState.strictVisualReferenceSourceLockViolation = true
      } else {
        streamState.strictVisualLockedReferenceAttemptUrls.add(referenceTargetUrl)
      }
    }
    if (typeof toolUseId === 'string' && playwrightRequestsScreenshot(inputText)) {
      streamState.strictVisualReferenceResearchToolUseIds.add(toolUseId)
    }
  }
  if (toolName === 'Read' && typeof toolUseId === 'string') {
    for (const screenshotPath of streamState.strictVisualReferenceScreenshotPathsByToolUseId.values()) {
      if (readTargetsStrictVisualReferenceScreenshot(inputText, screenshotPath)) {
        // Preserve the original Playwright screenshot as provenance even if
        // the model reads its safe resized derivative.
        streamState.strictVisualReferenceReadPathsByToolUseId.set(toolUseId, screenshotPath)
        break
      }
    }
  }
  const writesHtml = (['Write', 'Edit', 'MultiEdit'].includes(toolName as string)
    && /\.html?(?:["'\s]|$)/i.test(inputText))
    || (toolName === 'Bash' && bashCommandWritesHtml(inputText))
  if (writesHtml) {
    streamState.wroteStrictVisualHtml = true
    streamState.strictVisualHtmlWriteCount += 1
    const hasUnsupportedPriceAnalogy = containsStrictVisualUnsupportedPriceAnalogy(inputText)
    const hasUnsafeAbsolutePlanBadge = containsStrictVisualUnsafeAbsolutePlanBadge(inputText)
    const hasGeneratedSemanticPseudoText = containsStrictVisualGeneratedSemanticPseudoText(inputText)
    const hasMisleadingPaymentCode = containsStrictVisualMisleadingPaymentCode(inputText)
    const hasProcessDisclaimer = containsStrictVisualProcessDisclaimer(inputText)
    // Only an explicit Write can establish the contents of a complete clean
    // replacement. A partial edit or shell command must not erase a violation.
    if (hasUnsupportedPriceAnalogy || hasUnsafeAbsolutePlanBadge || hasGeneratedSemanticPseudoText || hasMisleadingPaymentCode || hasProcessDisclaimer || toolName === 'Write') {
      streamState.strictVisualUnsupportedPriceAnalogyDetected = hasUnsupportedPriceAnalogy
      streamState.strictVisualUnsafeAbsolutePlanBadgeDetected = hasUnsafeAbsolutePlanBadge
      streamState.strictVisualGeneratedSemanticPseudoTextDetected = hasGeneratedSemanticPseudoText
      streamState.strictVisualMisleadingPaymentCodeDetected = hasMisleadingPaymentCode
      streamState.strictVisualProcessDisclaimerDetected = hasProcessDisclaimer
    }
  }
  if (toolName === 'Read' && typeof toolUseId === 'string' && /\.png(?:["'\s]|$)/i.test(inputText)) {
    streamState.strictVisualPngReadToolUseIds.add(toolUseId)
  }
  if (
    toolName === 'Bash'
    && typeof toolUseId === 'string'
    && /(VISUAL_QA_BROWSER_EXECUTABLE|playwright|chrome-headless-shell|headless_shell)/i.test(inputText)
    && /\.png/i.test(inputText)
  ) {
    streamState.visualQaRendererToolUseIds.add(toolUseId)
  }
}

function toolResultContainsImage(content: unknown): boolean {
  if (Array.isArray(content)) return content.some((block) => toolResultContainsImage(block))
  if (!content || typeof content !== 'object') return false
  const block = content as { type?: unknown; source?: unknown; content?: unknown }
  if (block.type === 'image' && block.source) return true
  return toolResultContainsImage(block.content)
}

function recordFailedAskUserQuestionToolResult(
  streamState: SessionStreamState,
  toolResult: { tool_use_id?: unknown; is_error?: unknown },
): void {
  if (toolResult.is_error !== true || typeof toolResult.tool_use_id !== 'string') return
  streamState.failedAskUserQuestionToolUseIds.add(toolResult.tool_use_id)
}

function recordStrictVisualQaToolResult(
  streamState: SessionStreamState,
  toolResult: { tool_use_id?: unknown; is_error?: unknown; content?: unknown },
): void {
  if (typeof toolResult.tool_use_id !== 'string' || toolResult.is_error) return

  if (streamState.strictVisualInspirationQuestionToolUseIds.has(toolResult.tool_use_id)) {
    const requiresResearch = selectedStrictVisualPublicResearch(toolResult.content)
    if (requiresResearch !== null) streamState.strictVisualReferenceResearchRequired = requiresResearch
  }
  if (streamState.strictVisualReferenceResearchToolUseIds.has(toolResult.tool_use_id)) {
    for (const screenshotPath of localScreenshotPathsFromPlaywrightResult(toolResult.content)) {
      streamState.strictVisualReferenceScreenshotPathsByToolUseId.set(toolResult.tool_use_id, screenshotPath)
    }
  }
  const referenceReadPath = streamState.strictVisualReferenceReadPathsByToolUseId.get(toolResult.tool_use_id)
  if (referenceReadPath && toolResultContainsImage(toolResult.content)) {
    streamState.strictVisualReferenceScreenshotReadPaths.add(referenceReadPath)
  }

  if (streamState.visualQaRendererToolUseIds.has(toolResult.tool_use_id)) {
    streamState.completedStrictVisualQa = true
    streamState.strictVisualRendererSuccessCount += 1
  }
  if (
    streamState.strictVisualPngReadToolUseIds.has(toolResult.tool_use_id)
    && toolResultContainsImage(toolResult.content)
  ) {
    // The tool returned a real image payload to the model. Record which HTML
    // revision was visible so a final response cannot skip critique, revision,
    // rerendering, and a second image review.
    streamState.strictVisualLastImageReviewHtmlWriteCount = streamState.strictVisualHtmlWriteCount
  }
}

function resetStrictVisualQaEvidence(streamState: SessionStreamState): void {
  streamState.wroteStrictVisualHtml = false
  streamState.strictVisualHtmlWriteCount = 0
  streamState.completedStrictVisualQa = false
  streamState.strictVisualRendererSuccessCount = 0
  streamState.visualQaRendererToolUseIds.clear()
  streamState.strictVisualPngReadToolUseIds.clear()
  streamState.strictVisualLastImageReviewHtmlWriteCount = null
  streamState.strictVisualUnsupportedPriceAnalogyDetected = false
  streamState.strictVisualUnsafeAbsolutePlanBadgeDetected = false
  streamState.strictVisualGeneratedSemanticPseudoTextDetected = false
  streamState.strictVisualMisleadingPaymentCodeDetected = false
  streamState.strictVisualProcessDisclaimerDetected = false
  streamState.strictVisualFinalReviewRequired = false
  streamState.strictVisualReferenceResearchRequired = false
  streamState.strictVisualLockedReferenceUrls = []
  streamState.strictVisualLockedReferenceAttemptUrls.clear()
  streamState.strictVisualReferenceSourceLockViolation = false
  streamState.strictVisualInspirationQuestionToolUseIds.clear()
  streamState.strictVisualReferenceResearchToolUseIds.clear()
  streamState.strictVisualReferenceScreenshotPathsByToolUseId.clear()
  streamState.strictVisualReferenceReadPathsByToolUseId.clear()
  streamState.strictVisualReferenceScreenshotReadPaths.clear()
  streamState.strictVisualReferenceResearchRecoveryAttempts = 0
  streamState.strictVisualRenderRecoveryAttempts = 0
  streamState.strictVisualReviewRecoveryAttempts = 0
}

const WORKFLOW_PROTOCOL_TOOL_NAMES = new Set([
  'submit_phase_completion',
  'request_workflow_route',
] as const)

type WorkflowProtocolToolName = typeof WORKFLOW_PROTOCOL_TOOL_NAMES extends Set<infer T> ? T : never
const WORKFLOW_AGENT_TOOL_NAME = 'Agent' as const
type WorkflowRecoverableInputToolName = WorkflowProtocolToolName | typeof WORKFLOW_AGENT_TOOL_NAME

function workflowProtocolToolNameFromError(value: unknown): WorkflowProtocolToolName | null {
  const text = typeof value === 'string' ? value : ''
  const match = /No such tool available:\s*(submit_phase_completion|request_workflow_route)\b/i.exec(text)
  if (!match || !WORKFLOW_PROTOCOL_TOOL_NAMES.has(match[1] as WorkflowProtocolToolName)) return null
  return match[1] as WorkflowProtocolToolName
}

function workflowProtocolInputValidationToolNameFromError(value: unknown): WorkflowRecoverableInputToolName | null {
  const text = typeof value === 'string' ? value : ''
  const match = /InputValidationError:\s*(submit_phase_completion|request_workflow_route)\b/i.exec(text)
  if (match && WORKFLOW_PROTOCOL_TOOL_NAMES.has(match[1] as WorkflowProtocolToolName)) {
    return match[1] as WorkflowProtocolToolName
  }

  // An empty Agent({}) call is a model payload error, not an executed worker
  // failure. Recover once only when the normal formatter confirms that the
  // required description and/or prompt fields were absent.
  const missingAgentLaunchField = /The required parameter `(description|prompt)` is missing/i.test(text)
  return /InputValidationError:\s*Agent\b/i.test(text) && missingAgentLaunchField
    ? WORKFLOW_AGENT_TOOL_NAME
    : null
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
  const visualReviewFailureReasons = [
    streamState.strictVisualRendererSuccessCount < 2 ? 'two successful local renderer runs were not recorded' : null,
    streamState.strictVisualHtmlWriteCount < 2 ? 'a complete HTML revision was not recorded after visual review' : null,
    streamState.strictVisualLastImageReviewHtmlWriteCount !== streamState.strictVisualHtmlWriteCount ? 'the latest HTML revision was not read back as a rendered PNG image' : null,
    streamState.strictVisualUnsupportedPriceAnalogyDetected ? 'unsupported lifestyle price analogy remains in the latest complete HTML write' : null,
    streamState.strictVisualUnsafeAbsolutePlanBadgeDetected ? 'an absolute-positioned plan badge can overlap a tier label or price' : null,
    streamState.strictVisualGeneratedSemanticPseudoTextDetected ? 'CSS pseudo-elements inject semantic user-facing text' : null,
    streamState.strictVisualMisleadingPaymentCodeDetected ? 'a fake QR/barcode-like payment pattern remains in the latest complete HTML write' : null,
    streamState.strictVisualProcessDisclaimerDetected ? 'a prototype/process disclaimer remains in the customer-facing HTML' : null,
    hasStrictVisualReviewReceipt(streamState.assistantText) ? null : 'the final visual-review receipt is incomplete',
  ].filter((reason): reason is string => Boolean(reason))
  return {
    assistantText: streamState.assistantText.trim(),
    usedAskUserQuestion: streamState.usedAskUserQuestion,
    strictVisualIntroductionTurn: streamState.strictVisualIntroductionTurn,
    strictVisualFinalReviewRequired: streamState.strictVisualFinalReviewRequired,
    wroteStrictVisualHtml: streamState.wroteStrictVisualHtml,
    completedStrictVisualQa: streamState.completedStrictVisualQa,
    completedStrictVisualReview: visualReviewFailureReasons.length === 0,
    visualReviewFailureReasons,
    strictVisualReferenceResearchRequired: streamState.strictVisualReferenceResearchRequired,
    // Tool facts, not a prose receipt, establish whether visual research occurred.
    // A user-locked pair cannot be silently replaced: if one locked public
    // page is inaccessible, one successful locked screenshot plus the source
    // image is the honest fallback; an off-list query never satisfies it.
    completedStrictVisualReferenceResearch: streamState.strictVisualLockedReferenceUrls.length >= 2
      ? streamState.strictVisualLockedReferenceUrls.every((url) => streamState.strictVisualLockedReferenceAttemptUrls.has(url))
        && streamState.strictVisualReferenceScreenshotReadPaths.size >= 1
        && !streamState.strictVisualReferenceSourceLockViolation
      : streamState.strictVisualReferenceScreenshotReadPaths.size >= 2,
    referenceResearchRecoveryAttempts: streamState.strictVisualReferenceResearchRecoveryAttempts,
    renderQaRecoveryAttempts: streamState.strictVisualRenderRecoveryAttempts,
    visualReviewRecoveryAttempts: streamState.strictVisualReviewRecoveryAttempts,
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
  if (streamState.terminalFallbackTimer) clearTimeout(streamState.terminalFallbackTimer)
  streamState.terminalFallbackTimer = undefined
  streamState.usedAskUserQuestion = false
  streamState.assistantText = ''
  streamState.failedAskUserQuestionToolUseIds.clear()
  streamState.strictVisualIntroductionTurn = false
  streamState.workflowProtocolToolRegistryError = undefined
  resetStrictVisualQaEvidence(streamState)
  if (resetRecoveryAttempts) streamState.structuredInteractionRecoveryAttempts = 0
  if (resetRecoveryAttempts) streamState.expertResearchDeliveryRecoveryAttempts = 0
  streamState.expertResearchDeliveryCardAttempted = false
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

function isStrictVisualIntroductionRequest(text: string): boolean {
  const normalized = text.trim()
  if (!normalized || normalized.length > 240) return false

  const identifiesThisExpert = /(?:ui\s*\/?\s*ux|\u8bbe\u8ba1\u7cfb\u7edf\u4e13\u5bb6|\u4e13\u5bb6)/i.test(normalized)
  const asksCapabilities = /(?:\u4ecb\u7ecd(?:\u4e00\u4e0b)?|\u4f60\u80fd\u505a\u4ec0\u4e48|\u4f60\u53ef\u4ee5\u505a\u4ec0\u4e48|\u4f60(?:\u80fd|\u53ef\u4ee5).{0,12}\u5e2e\u6211\u505a\u4ec0\u4e48|\u6709\u54ea\u4e9b\u80fd\u529b)/i.test(normalized)
  const englishCapabilityIntro = /(?:introduce (?:yourself|.*(?:ui\s*\/?\s*ux|design system expert))|what can you (?:do|help (?:me )?with)|how can you help me)/i.test(normalized)

  return (identifiesThisExpert && asksCapabilities) || englishCapabilityIntro
}

export function assistantTextRequestsStrictVisualBoundedDecision(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false

  // A strict visual Expert may still ask for an uploaded screenshot, a pasted
  // URL, or free-form design context in prose. Only intercept decisions that
  // can truthfully become an AskUserQuestion card with bounded choices.
  //
  // Narrative wording such as "I will confirm whether external references are
  // needed" is not a present-tense user choice. It must not trigger recovery.
  const explicitBoundedInstruction = /(?:请(?:你)?(?:选择|确认|选)(?:\s*(?:[A-D]|方案|方向|其一))?|请选择|请确认|二选一|(?:^|[。；;：:\n])\s*选择\s*(?:[A-D]|方案|方向|其一))/i.test(normalized)
  const questionDecision = /[?？]/.test(normalized)
    && /(?:还是|是否|需不需要|要不要|would you like|do you want|should i|which (?:option|one)|please (?:choose|confirm))/i.test(normalized)

  return explicitBoundedInstruction || questionDecision
}function assistantTextPresentsMultipleDesignDirections(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false

  const chineseDirections = normalized.match(/方向\s*(?:[一二三四五六七八九十]|\d+)/g) ?? []
  const englishDirections = normalized.match(/(?:design\s+)?directions?\s*(?:[1-9]|one|two|three|four|five)/gi) ?? []
  const directions = new Set(
    [...chineseDirections, ...englishDirections]
      .map((value) => value.replace(/\s+/g, '').toLowerCase()),
  )
  return directions.size >= 2
}

async function strictVisualTerminalRecoveryForResult(
  sessionId: string,
  turn: WorkflowInteractionTurn,
): Promise<StrictVisualTerminalRecovery | null> {
  if (turn.usedAskUserQuestion || hasPendingAskUserQuestion(sessionId)) return null

  const transcriptExpert = (await sessionService.getSession(sessionId).catch(() => null))?.expert
  const expert = hasActiveExpertRuntime(transcriptExpert)
    ? transcriptExpert
    : await expertRuntimeSessionStore.get(sessionId)
  if (
    !hasActiveExpertRuntime(expert)
    || expert.runtimeBinding.runtimePolicy?.mode !== 'strict-visual-workflow'
  ) {
    return null
  }

  if (turn.strictVisualReferenceResearchRequired && !turn.completedStrictVisualReferenceResearch) {
    return { kind: 'visual-reference-research', expertId: expert.expertId }
  }
  if (turn.wroteStrictVisualHtml && !turn.completedStrictVisualQa) {
    return { kind: 'render-qa', expertId: expert.expertId }
  }
  const finalDeliveryClaimed = /(?:已完成|已交付|完成视觉稿|完成设计|final(?:ized)?|delivered?|completed)/i.test(turn.assistantText)
  if (
    (turn.wroteStrictVisualHtml || (turn.strictVisualFinalReviewRequired && finalDeliveryClaimed))
    && !turn.completedStrictVisualReview
  ) {
    return { kind: 'visual-review', expertId: expert.expertId, visualReviewFailureReasons: turn.visualReviewFailureReasons }
  }
  // The desktop's first welcome request is not a design decision. Let it end
  // naturally and wait for the user's next free-form request.
  if (turn.strictVisualIntroductionTurn) return null
  if (assistantTextPresentsMultipleDesignDirections(turn.assistantText)) {
    return { kind: 'design-direction', expertId: expert.expertId }
  }
  if (assistantTextRequestsStrictVisualBoundedDecision(turn.assistantText)) {
    return { kind: 'ask-user-question', expertId: expert.expertId }
  }
  return null
}

export function hasStrictVisualReviewReceipt(text: string): boolean {
  const normalized = text.toLowerCase()
  return [
    'taste-redesign',
    'impeccable-visual-refinement',
    'ui-craft-critique',
    'ui-craft-finalize',
    'source-fidelity-final-pass',
  ].every((skill) => normalized.includes(skill))
    // A Skill name alone is not a critique. The strict receipt must prove the
    // model chose a source-specific visual register and removed a concrete
    // generic treatment after seeing the rendered image.
    && /(?:visual-register|visual register|视觉基调|视觉人格)/i.test(text)
    && /(?:removed|remove:|删除|移除|剔除)/i.test(text)
    && /(?:collision|overlap|重叠|遮挡|裁切|cropping)/i.test(text)
    && /(?:source-fidelity|source fidelity|源图保真|事实核对|duplicate scan|重复文本)/i.test(text)
    && /(1440|desktop|桌面)/i.test(text)
    && /(1024|tablet|平板)/i.test(text)
    && /(390|mobile|手机|移动)/i.test(text)
}

function buildStrictVisualTerminalRecoveryInstruction(
  recovery: StrictVisualTerminalRecovery,
): string {
  if (recovery.kind === 'visual-reference-research') {
    return [
      '<strict-visual-reference-research-recovery>',
      'The user selected public visual-reference research, but this strict UIUX turn has not produced two distinct web screenshots that were actually read as images.',
      'Before any design direction, HTML, or final delivery, lock exactly two concrete public URLs: one structure reference for the current page type and one visual-language reference for the desired density, hierarchy, or material.',
      'For each URL call Playwright with include_screenshot: true. From each successful result, immediately Read the returned Local screenshot path. If the PNG is too large for Read, use Bash once to create a safe -scaled.png or -review.jpg derivative in that same screenshot directory, then Read it; do not move it into the session workDir. Browser text, candidate URLs, summaries, access failures, or screenshots that were not Read do not count as visual research.',
      'If the user explicitly supplied a closed pair of concrete URLs or said not to use a third site, that pair is the complete research scope: if either site is blocked or times out, record it as unavailable, do not WebSearch or substitute another URL, and continue only from the supplied screenshot plus the successful locked evidence. Never claim that an unavailable URL was visually read. If the user did not lock a closed pair, record a blocked site and replace it with a different concrete public URL; do not retry the same normalized URL.',
      'After both PNGs are read, write <visual-reference-receipt> with both URLs, visible observations, original application, and one thing not copied from each. Apply package-local visual-reference-lock; do not write HTML or end early.',
      'This is a server-enforced strict visual workflow for Expert ' + recovery.expertId + '.',
      '</strict-visual-reference-research-recovery>',
    ].join('\n')
  }

  if (recovery.kind === 'visual-review') {
    return [
      '<strict-visual-review-recovery>',
      'The PNG renderer succeeded, but this strict UIUX delivery has not completed an evidence-backed visual critique and finalization cycle.',
      'Server-detected unfinished evidence: ' + (recovery.visualReviewFailureReasons?.join('; ') || 'unknown strict visual completion failure') + '.',
      'At least one Read result in this conversation returned an actual image payload. Treat it as visual input: do not claim that rendered screenshots cannot be read, and do not ask the user to upload the screenshots you already received.',
      'Immediately apply the package-local taste-redesign, impeccable-visual-refinement, ui-craft-critique, and source-fidelity-final-pass methods to the rendered desktop, tablet, and mobile screenshots. Identify concrete screenshot-specific problems, then revise the existing HTML (do not merely describe changes). Run a source-to-final semantic diff: visible tabs, plan count/order/names/prices, payment relationship, and benefit labels must match the source fact ledger exactly; remove accidental repeated words such as “企业 企业”, invented labels, and any text injected through CSS ::before/::after. Keep all user-facing semantic labels as real DOM text, not CSS content. Remove every unsupported lifestyle price analogy such as coffee, meals, cinema tickets, ride-hailing, self-service meals, or dishes. Keep only direct prices, formula-based per-day prices, and source-supported benefits; do not invent user segments, trials, guarantees, or promotions. Never draw a fake QR code, barcode, checkerboard, or black-white stripe pattern as a payment affordance: if a real payment QR is unavailable, use an honest login/payment CTA and a plainly non-code container. Do not place prototype/process disclaimers such as “this is a visual assumption” in the customer-facing page; report those limits only in the final receipt. A plan promotion/recommendation badge may not use position:absolute in the final HTML, because it can cover a tier label or price at 390px; place it in normal flow or remove it. If this recovery follows unsupported copy, unsafe plan badges, or generated semantic pseudo text, use Write to replace the complete HTML source with a clean version: do not rely on Bash or partial Edit to silently remove it.',
      'After revision, call Bash again to render all three viewports with $env:CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE, then Read at least one newly rendered PNG image. Apply ui-craft-finalize only after that second image review.',
      'Before ending, include a concise <visual-review-receipt> that names taste-redesign, impeccable-visual-refinement, ui-craft-critique, ui-craft-finalize, and source-fidelity-final-pass; includes visual-register, removed, collision/cropping evidence, and source-fidelity / duplicate-scan evidence; and contains one concrete observation for each of 1440 desktop, 1024 tablet, and 390 mobile. Do not use AskUserQuestion or end early.',
      'This is a server-enforced strict visual workflow for Expert ' + recovery.expertId + '.',
      '</strict-visual-review-recovery>',
    ].join('\n')
  }

  if (recovery.kind === 'render-qa') {
    return [
      '<strict-visual-render-qa-recovery>',
      'An intermediate HTML artifact was written, but this turn did not run a detected local visual-QA renderer command.',
      'Immediately call Bash to render that existing HTML into PNG screenshots at 1440x1000, 1024x900, and 390x844.',
      'Use the installed browser executable from $env:CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE. Do not use Playwright, do not write another HTML file, do not ask the user for a path, and do not end this turn.',
      'The Bash command must create PNG files in the active session workDir. After the command succeeds, inspect the screenshots before claiming delivery.',
      'This is a server-enforced strict visual workflow for Expert ' + recovery.expertId + '.',
      '</strict-visual-render-qa-recovery>',
    ].join('\n')
  }

  const requirement = recovery.kind === 'design-direction'
    ? [
        'You just presented multiple design directions without the mandatory selection card.',
        'Immediately call AskUserQuestion with exactly one question whose id is design_direction.',
        'Its 2–4 bounded choices must map one-to-one to the directions already shown. Preserve their actual names and intent; do not invent a replacement direction.',
      ]
    : [
        'Your previous response asked the user for a bounded choice or confirmation in prose.',
        'Immediately convert that exact decision into one AskUserQuestion card with 2–4 bounded choices and stable ids.',
      ]

  return [
    '<strict-visual-ask-user-question-recovery>',
    ...requirement,
    'Until the AskUserQuestion call is emitted, do not output any more prose, do not end the turn, and do not call any other tool.',
    'Do not ask the user to type a direction, letter, number, confirmation, path, or choice in the free-form composer.',
    'This is a server-enforced strict visual workflow for Expert ' + recovery.expertId + '.',
    '</strict-visual-ask-user-question-recovery>',
  ].join('\n')
}

function sendStrictVisualTerminalProtocolError(
  sessionId: string,
  code:
    | 'STRICT_VISUAL_ASK_USER_QUESTION_REQUIRED'
    | 'STRICT_VISUAL_ASK_USER_QUESTION_RECOVERY_UNAVAILABLE'
    | 'STRICT_VISUAL_REFERENCE_RESEARCH_REQUIRED'
    | 'STRICT_VISUAL_REFERENCE_RESEARCH_RECOVERY_UNAVAILABLE'
    | 'STRICT_VISUAL_RENDER_QA_REQUIRED'
    | 'STRICT_VISUAL_RENDER_QA_RECOVERY_UNAVAILABLE'
    | 'STRICT_VISUAL_REVIEW_REQUIRED'
    | 'STRICT_VISUAL_REVIEW_RECOVERY_UNAVAILABLE',
): void {
  const message = code === 'STRICT_VISUAL_ASK_USER_QUESTION_REQUIRED'
    ? 'The strict UIUX Expert ended a choice turn without AskUserQuestion twice. No production action was started; retry the choice step.'
    : code === 'STRICT_VISUAL_REFERENCE_RESEARCH_REQUIRED'
      ? 'The strict UIUX Expert was asked to use public visual references but did not read two successful website screenshots. No visual delivery was accepted.'
      : code === 'STRICT_VISUAL_REFERENCE_RESEARCH_RECOVERY_UNAVAILABLE'
        ? 'The strict UIUX Expert could not deliver its required website visual-reference recovery turn. No visual delivery was accepted.'
        : code === 'STRICT_VISUAL_RENDER_QA_REQUIRED'
      ? 'The strict UIUX Expert wrote HTML but did not complete a successful Playwright/Chromium PNG render twice. No visual delivery was accepted.'
      : code === 'STRICT_VISUAL_RENDER_QA_RECOVERY_UNAVAILABLE'
        ? 'The strict UIUX Expert could not deliver its required local visual-QA recovery turn. No visual delivery was accepted.'
        : code === 'STRICT_VISUAL_REVIEW_REQUIRED'
          ? 'The strict UIUX Expert rendered PNGs but skipped the required image-based critique, revision, rerender, and finalization cycle. No visual delivery was accepted.'
          : code === 'STRICT_VISUAL_REVIEW_RECOVERY_UNAVAILABLE'
            ? 'The strict UIUX Expert could not run its required image-review recovery turn. No visual delivery was accepted.'
            : 'The strict UIUX Expert could not deliver its required AskUserQuestion recovery turn. No production action was started; retry the choice step.'
  sendToSession(sessionId, {
    type: 'error',
    code,
    message,
    retryable: true,
  })
}

function hasPendingAskUserQuestion(sessionId: string): boolean {
  return conversationService.getPendingPermissionRequests(sessionId).some(
    (request) => request.toolName === 'AskUserQuestion',
  )
}

function persistedWorkflowQuestionInput(issue: WorkflowPhaseIssue): Record<string, unknown> | null {
  const input = issue.questionInput
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const questions = input.questions
  return Array.isArray(questions) && questions.length > 0 ? { ...input } : null
}

async function hasPersistedOpenWorkflowQuestionRequest(sessionId: string, requestId: string): Promise<boolean> {
  const stateRead = await workflowSessionStateService.readState(sessionId)
  if (!stateRead.exists || !stateRead.state || !isWorkflowSessionState(stateRead.state)) return false
  const phaseId = stateRead.state.activePhaseId
  const issues = phaseId ? stateRead.state.runtimeContract?.phaseStates[phaseId]?.issues ?? [] : []
  return issues.some((issue) => (
    issue.source === 'ask-user-question'
    && issue.status === 'open'
    && issue.blocksCompletion
    && issue.questionRequestId === requestId
    && persistedWorkflowQuestionInput(issue) !== null
  ))
}

async function replayPersistedWorkflowAskUserQuestion(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
): Promise<void> {
  const stateRead = await workflowSessionStateService.readState(sessionId)
  if (!stateRead.exists || !stateRead.state || !isWorkflowSessionState(stateRead.state)) return

  const phaseId = stateRead.state.activePhaseId
  const phaseState = phaseId ? stateRead.state.runtimeContract?.phaseStates[phaseId] : null
  if (!phaseState) return

  const inMemoryRequestIds = new Set(conversationService.getPendingPermissionRequests(sessionId)
    .filter((request) => request.toolName === 'AskUserQuestion')
    .map((request) => request.requestId))
  const openIssues = phaseState.issues.filter((issue) => (
    issue.source === 'ask-user-question'
    && issue.status === 'open'
    && issue.blocksCompletion
    && typeof issue.questionRequestId === 'string'
  ))
  const activeInMemoryRequestId = openIssues.find((issue) => (
    inMemoryRequestIds.has(issue.questionRequestId!)
  ))?.questionRequestId ?? null
  const restorableIssue = activeInMemoryRequestId
    ? null
    : openIssues.find((issue) => persistedWorkflowQuestionInput(issue) !== null) ?? null
  const activeRequestId = activeInMemoryRequestId ?? restorableIssue?.questionRequestId ?? null
  let candidate = stateRead.state
  const staleRequestIds = new Set<string>()

  for (const issue of openIssues) {
    const requestId = issue.questionRequestId!
    // Several phase issues can belong to one AskUserQuestion call. Preserve all
    // entries for the single active request and stale only genuinely separate
    // request ids so a reconnect can never surface two blocking cards.
    if (requestId === activeRequestId || staleRequestIds.has(requestId)) continue
    const input = persistedWorkflowQuestionInput(issue)
    candidate = markAskUserQuestionIssuesStale(candidate, {
      requestId,
      toolUseId: issue.toolUseId,
      now: new Date().toISOString(),
      rationale: input
        ? 'A duplicate persisted blocking question was discarded; only one workflow question card may remain active after reconnect.'
        : 'This legacy workflow question cannot be restored because its card payload was not persisted. It was marked stale so the workflow can ask one fresh necessary question instead of waiting forever.',
    })
    staleRequestIds.add(requestId)
  }

  if (candidate !== stateRead.state) {
    const written = await workflowSessionStateService.updateState(
      sessionId,
      () => candidate,
      { expectedStateVersion: stateRead.state.stateVersion },
    )
    candidate = written.state
    await appendWorkflowStateMetadata(sessionId, written.state, written.pointer)
    sendToSession(sessionId, workflowNotificationForDesktop({
      type: 'system_notification',
      subtype: 'workflow_state',
      data: written.state,
    }) as ServerMessage)
  }

  // A live in-memory request is already replayed by the normal permission
  // channel. Never emit a second persisted copy of it.
  if (activeInMemoryRequestId || !restorableIssue) return
  const input = persistedWorkflowQuestionInput(restorableIssue)
  if (!input || !restorableIssue.questionRequestId) return
  const rawRequest: Extract<ServerMessage, { type: 'permission_request' }> = {
    type: 'permission_request',
    requestId: restorableIssue.questionRequestId,
    toolName: 'AskUserQuestion',
    ...(restorableIssue.toolUseId ? { toolUseId: restorableIssue.toolUseId } : {}),
    input,
    ...(restorableIssue.questionDescription ? { description: restorableIssue.questionDescription } : {}),
  }
  const request = requestWithWorkflowQuestionContext(
    rawRequest,
    workflowQuestionContextForRequest(candidate, rawRequest),
  )
  sendMessage(ws, request)
}

function hasPersistedOpenWorkflowQuestion(state: WorkflowSessionState): boolean {
  const phaseId = state.activePhaseId
  return Boolean(phaseId && state.runtimeContract?.phaseStates[phaseId]?.issues.some((issue) => (
    issue.source === 'ask-user-question'
    && issue.status === 'open'
    && issue.blocksCompletion
  )))
}

async function staleFailedWorkflowAskUserQuestions(
  sessionId: string,
  failedToolUseIds: Set<string>,
): Promise<boolean> {
  let changed = false
  for (const toolUseId of failedToolUseIds) {
    changed = (await staleWorkflowAskUserQuestionIssues(sessionId, {
      toolUseId,
      rationale: 'The AskUserQuestion tool request ended with an error before a user answer was delivered; the stale question must not block the workflow.',
    })) || changed
  }
  return changed
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
          '选项只能使用 AskUserQuestion 支持的字段：id、label、description、preview。当前阶段完成、非线性跳转和恢复必须分别使用对应的工作流工具，不能把路由字段塞进业务选项。',
        ]
      : [
          'Your previous response asked the user for a decision in prose, but an active workflow must not wait at the free-form composer.',
          'Immediately call AskUserQuestion. Do not ask another prose question and do not end this turn.',
          'The call must include a top-level questions array, stable question and option ids, and 2-4 bounded choices.',
          'Choices may use only AskUserQuestion-supported fields: id, label, description, and preview. Keep phase completion, non-linear routes, and recovery in their dedicated workflow tools; never put route fields into a business choice.',
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
  // A persisted blocking question without a live permission request can be a
  // reconnect or aborted-tool state. Do not force the model into a second
  // AskUserQuestion call; reconciliation either restores its answer or marks
  // the failed request stale before the user retries the phase.
  if (hasPersistedOpenWorkflowQuestion(state)) return null
  return {
    state,
    kind: assistantTextRequestsUserDecision(turn.assistantText)
      ? 'ask-user-question'
      : 'continue-workflow',
  }
}

const WORKFLOW_TERMINAL_RESULT_FALLBACK_MS = 300
// One reminder can be missed by a live model turn. Allow one additional
// bounded recovery before surfacing a retryable protocol error to the user.
const WORKFLOW_TERMINAL_RECOVERY_ATTEMPTS = 2

function assistantEndedTurnWithoutResult(cliMsg: any): boolean {
  if (cliMsg?.type !== 'assistant' || cliMsg?.is_error || cliMsg?.error) return false
  const stopReason = cliMsg?.message?.stop_reason ?? cliMsg?.stop_reason
  return stopReason === 'end_turn'
}

function clearWorkflowTerminalFallback(streamState: SessionStreamState): void {
  if (streamState.terminalFallbackTimer) clearTimeout(streamState.terminalFallbackTimer)
  streamState.terminalFallbackTimer = undefined
}

function scheduleWorkflowTerminalFallback(sessionId: string, cliMsg: any): void {
  if (!assistantEndedTurnWithoutResult(cliMsg)) return
  const streamState = getStreamState(sessionId)
  clearWorkflowTerminalFallback(streamState)
  const turnSequence = streamState.terminalTurnSequence
  streamState.terminalFallbackTimer = setTimeout(() => {
    const latest = getStreamState(sessionId)
    if (
      latest.terminalTurnSequence !== turnSequence
      || latest.terminalRecoveryHandledForTurn
    ) return
    latest.terminalFallbackTimer = undefined
    void finalizeClientResult(sessionId, {
      type: 'result',
      is_error: false,
      usage: {},
      __workflowTerminalFallbackTurn: turnSequence,
    })
  }, WORKFLOW_TERMINAL_RESULT_FALLBACK_MS)
}

function buildExpertResearchDeliveryTerminalRecoveryInstruction(
  recovery: ExpertResearchDeliveryTerminalRecoveryResult,
  assistantText: string,
): string {
  const expectedChoiceIds = [
    recovery.policy.acceptedChoiceId,
    ...recovery.policy.continueChoiceIds,
    ...recovery.policy.pauseChoiceIds,
  ]
  const auditSummary = recovery.completion.complete
    ? '当前浏览审计已达到该专家包声明的最小覆盖门槛。'
    : `当前浏览审计仍有以下缺口：${recovery.completion.missing.join('；')}`

  // Incomplete audits (Google CAPTCHA/VPN, partial subagents) are disclosed on
  // the card as unresolved evidence. The user may still accept current scope.
  return [
    '<expert-research-delivery-terminal-recovery>',
    '这是 Expert Runtime 的内部续办指令，不能作为普通答复展示给用户。',
    '本轮已经有研究子代理回传可审计的浏览记录，但你刚才以普通阶段总结结束，尚未完成该专家声明的研究交付流程。',
    auditSummary,
    '现在必须继续当前专家任务，不能再用“初步取证完成”“证据不足”或“还可以继续做”作为本轮结束。',
    '先复用已有审计、已打开来源和证据缺口；若仍有高价值且可公开访问的证据可补，可做有限补证。',
    'Google/百度等入口若因验证码、VPN 或访问限制无法取得完整 SERP，记为该入口的证据缺口即可，不要反复卡在同一入口。',
    `若补证已无实质价值、被访问限制阻断，或需要用户决定是否接受当前证据范围，必须立即调用一次 AskUserQuestion 的正式研究交付卡。唯一问题 ID 必须为 ${recovery.policy.questionId}。`,
    `这张卡的选项 ID 必须且只能使用：${expectedChoiceIds.join('、')}；必须包含 ${recovery.policy.acceptedChoiceId}。`,
    '交付卡必须携带该专家包要求的 expert_research_delivery metadata，并列出当前真实未解决的证据缺口（含未取得的搜索入口）。不要创建别的 delivery 问题 ID。',
    `用户的最终选择优先：若用户选择 ${recovery.policy.acceptedChoiceId}，即使仍有审计/搜索入口缺口，也视为已确认交付范围，随后可询问输出路径并执行 expert-template-fill --data-stdin。`,
    '不要用 Write、Edit、手写 HTML 或普通文本绕过这个交付流程。',
    assistantText ? `刚才的普通阶段总结：${assistantText}` : '',
    '</expert-research-delivery-terminal-recovery>',
  ].filter(Boolean).join('\n')
}

function sendExpertResearchDeliveryTerminalProtocolError(sessionId: string): void {
  sendToSession(sessionId, {
    type: 'error',
    code: 'EXPERT_RESEARCH_DELIVERY_PROTOCOL_REQUIRED',
    message: '该研究专家已两次在已有浏览证据后以普通文本结束，但没有继续补证、发出交付范围选择卡或生成报告。本次没有把普通总结当作正式完成；请重试当前专家任务。',
    retryable: true,
  })
}

async function expertResearchDeliveryTerminalRecoveryForResult(
  sessionId: string,
  turn: WorkflowInteractionTurn,
): Promise<ExpertResearchDeliveryTerminalRecoveryResult | null> {
  const transcriptExpert = (await sessionService.getSession(sessionId).catch(() => null))?.expert
  const expert = hasActiveExpertRuntime(transcriptExpert)
    ? transcriptExpert
    : await expertRuntimeSessionStore.get(sessionId)
  return resolveExpertResearchDeliveryTerminalRecovery({
    expert,
    usedAskUserQuestion: turn.usedAskUserQuestion,
    hasPendingAskUserQuestion: hasPendingAskUserQuestion(sessionId),
  })
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
              recordAssistantToolUse(streamState, pending.toolName || block.name, block.input, block.id)
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
              recordAssistantToolUse(streamState, block.name, block.input, block.id)
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
            recordFailedAskUserQuestionToolResult(streamState, block)
            recordStrictVisualQaToolResult(streamState, block)
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
            recordAssistantToolUse(streamState, contentBlock.name, contentBlock.input, contentBlock.id)
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
                recordAssistantToolUse(streamState, toolBlock.toolName, parsedInput, toolBlock.toolUseId)
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
        if (boundRequest) broadcastServerMessageToSession(sessionId, boundRequest)
      }).catch((error) => {
        console.warn(`[WS] Failed to persist AskUserQuestion state for ${sessionId}:`, error)
        sendToSession(sessionId, {
          type: 'error',
          code: 'WORKFLOW_STATE_PERSIST_FAILED',
          message: 'The structured question was not delivered because its runtime state could not be persisted safely.',
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
  toolName: WorkflowRecoverableInputToolName,
): string {
  const isChinese = state.workflowLanguage === 'zh'
  const contract = toolName === WORKFLOW_AGENT_TOOL_NAME
    ? (isChinese
      ? [
          '立即重新调用 Agent，并提供非空 description 和非空 prompt。',
          '若这是工作流委派，使用 subagent_type=general-purpose，并在顶层提供 workflow_role（coder、reviewer 或 qa）；不要把 role 只写在 prompt 里。',
        ]
      : [
          'Immediately call Agent again with a non-empty description and a non-empty prompt.',
          'For workflow delegation, use subagent_type=general-purpose and a top-level workflow_role (coder, reviewer, or qa); do not place the role only in prompt text.',
        ])
    : toolName === 'submit_phase_completion'
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
    || (toolName !== WORKFLOW_AGENT_TOOL_NAME && !getWorkflowScopedToolNames(state).includes(toolName))
    || (toolName === WORKFLOW_AGENT_TOOL_NAME && getWorkflowPhaseDisallowedTools(state).includes(WORKFLOW_AGENT_TOOL_NAME))
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
  const streamState = getStreamState(sessionId)
  const fallbackTurn = cliMsg?.__workflowTerminalFallbackTurn
  if (
    typeof fallbackTurn === 'number'
    && fallbackTurn !== streamState.terminalTurnSequence
  ) return
  if (streamState.terminalRecoveryHandledForTurn) {
    if (typeof fallbackTurn !== 'number') broadcastCliMessagesToSession(sessionId, cliMsg)
    return
  }
  streamState.terminalRecoveryHandledForTurn = true
  clearWorkflowTerminalFallback(streamState)
  if (await recoverWorkflowProtocolToolBinding(sessionId, cliMsg)) return
  if (await recoverWorkflowProtocolInputValidation(sessionId, cliMsg)) return

  const questionDeliveryFailed = await staleFailedWorkflowAskUserQuestions(
    sessionId,
    streamState.failedAskUserQuestionToolUseIds,
  )
  if (questionDeliveryFailed) {
    // The failing AskUserQuestion tool result is already visible to the user.
    // Finish cleanly after unblocking state; do not inject a second model turn.
    broadcastCliMessagesToSession(sessionId, cliMsg)
    finishWorkflowInteractionTurn(sessionId)
    return
  }

  const turn = workflowInteractionTurnForResult(sessionId)
  const workflowRecovery = !cliMsg.is_error
    ? await workflowTerminalRecoveryForResult(sessionId, turn)
    : null
  const strictVisualRecovery = !cliMsg.is_error && !workflowRecovery
    ? await strictVisualTerminalRecoveryForResult(sessionId, turn)
    : null
  const expertResearchDeliveryRecovery = !cliMsg.is_error && !workflowRecovery && !strictVisualRecovery
    ? await expertResearchDeliveryTerminalRecoveryForResult(sessionId, turn)
    : null

  if (expertResearchDeliveryRecovery) {
    // A real delivery card can fail after the user selects it if the local
    // Desktop HTTP connection resets. That is not a prose-only model exit, so
    // give the contract recovery a fresh attempt instead of showing the final
    // “twice ended in prose” error.
    if (streamState.expertResearchDeliveryCardAttempted) {
      streamState.expertResearchDeliveryCardAttempted = false
      streamState.expertResearchDeliveryRecoveryAttempts = 0
    }
    if (streamState.expertResearchDeliveryRecoveryAttempts >= 1) {
      sendExpertResearchDeliveryTerminalProtocolError(sessionId)
      finishWorkflowInteractionTurn(sessionId)
      return
    }

    if (!conversationService.hasSession(sessionId)) {
      sendExpertResearchDeliveryTerminalProtocolError(sessionId)
      finishWorkflowInteractionTurn(sessionId)
      return
    }

    streamState.expertResearchDeliveryRecoveryAttempts += 1
    sendToSession(sessionId, {
      type: 'status',
      state: 'thinking',
      verb: '正在继续补证或准备交付确认',
    })
    const sent = conversationService.sendMessage(
      sessionId,
      buildExpertResearchDeliveryTerminalRecoveryInstruction(expertResearchDeliveryRecovery, turn.assistantText),
    )
    if (sent) return

    sendExpertResearchDeliveryTerminalProtocolError(sessionId)
    finishWorkflowInteractionTurn(sessionId)
    return
  }

  if (strictVisualRecovery) {
    const strictVisualRecoveryAttempts = strictVisualRecovery.kind === 'visual-reference-research'
      ? turn.referenceResearchRecoveryAttempts
      : strictVisualRecovery.kind === 'render-qa'
        ? turn.renderQaRecoveryAttempts
        : strictVisualRecovery.kind === 'visual-review'
          ? turn.visualReviewRecoveryAttempts
          : turn.recoveryAttempts
    const requiredErrorCode = strictVisualRecovery.kind === 'visual-reference-research'
      ? 'STRICT_VISUAL_REFERENCE_RESEARCH_REQUIRED'
      : strictVisualRecovery.kind === 'render-qa'
        ? 'STRICT_VISUAL_RENDER_QA_REQUIRED'
        : strictVisualRecovery.kind === 'visual-review'
          ? 'STRICT_VISUAL_REVIEW_REQUIRED'
          : 'STRICT_VISUAL_ASK_USER_QUESTION_REQUIRED'
    const unavailableErrorCode = strictVisualRecovery.kind === 'visual-reference-research'
      ? 'STRICT_VISUAL_REFERENCE_RESEARCH_RECOVERY_UNAVAILABLE'
      : strictVisualRecovery.kind === 'render-qa'
        ? 'STRICT_VISUAL_RENDER_QA_RECOVERY_UNAVAILABLE'
        : strictVisualRecovery.kind === 'visual-review'
          ? 'STRICT_VISUAL_REVIEW_RECOVERY_UNAVAILABLE'
          : 'STRICT_VISUAL_ASK_USER_QUESTION_RECOVERY_UNAVAILABLE'

    if (strictVisualRecoveryAttempts >= 1) {
      sendStrictVisualTerminalProtocolError(sessionId, requiredErrorCode)
      finishWorkflowInteractionTurn(sessionId)
      return
    }

    if (!conversationService.hasSession(sessionId)) {
      sendStrictVisualTerminalProtocolError(sessionId, unavailableErrorCode)
      finishWorkflowInteractionTurn(sessionId)
      return
    }

    const streamState = getStreamState(sessionId)
    if (strictVisualRecovery.kind === 'visual-reference-research') {
      streamState.strictVisualReferenceResearchRecoveryAttempts += 1
    } else if (strictVisualRecovery.kind === 'render-qa') {
      streamState.strictVisualRenderRecoveryAttempts += 1
    } else if (strictVisualRecovery.kind === 'visual-review') {
      streamState.strictVisualReviewRecoveryAttempts += 1
    } else {
      streamState.structuredInteractionRecoveryAttempts += 1
    }
    sendToSession(sessionId, {
      type: 'status',
      state: 'thinking',
      verb: strictVisualRecovery.kind === 'visual-reference-research'
        ? 'Reading locked visual reference websites'
        : strictVisualRecovery.kind === 'render-qa'
          ? 'Running required local visual QA'
          : strictVisualRecovery.kind === 'visual-review'
            ? 'Critiquing and finalizing rendered UI'
            : strictVisualRecovery.kind === 'design-direction'
            ? 'Generating required design-direction choices'
            : 'Generating required choices',
    })
    const sent = conversationService.sendMessage(
      sessionId,
      buildStrictVisualTerminalRecoveryInstruction(strictVisualRecovery),
    )
    if (sent) return

    sendStrictVisualTerminalProtocolError(sessionId, unavailableErrorCode)
    finishWorkflowInteractionTurn(sessionId)
    return
  }

  if (workflowRecovery) {
    const recovery = workflowRecovery
    if (turn.recoveryAttempts >= WORKFLOW_TERMINAL_RECOVERY_ATTEMPTS) {
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
    if (cliMsg.type === 'assistant') scheduleWorkflowTerminalFallback(sessionId, cliMsg)
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
  expertSystemPrompt?: string
  expertSessionId?: string
  expertSharedPlaywrightSessionId?: string
  expertPlaywrightCdpEndpoint?: string
  expertManagedPlaywrightPresentation?: 'assistable_background' | 'always_visible'
  expertForceVisiblePlaywright?: boolean
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
  const workflowIsActive = getWorkflowScopedToolNames(workflowState).length > 0

  // Workflow and Expert Mode have independent runtime contracts. A persisted
  // Expert record may coexist with a workflow session for history/UI purposes,
  // but it must never contribute a prompt or tool restriction to the CLI while
  // the workflow is active. Otherwise an unrelated Expert can silently hide a
  // workflow-required tool or give the model contradictory instructions.
  const transcriptExpert = workflowIsActive
    ? undefined
    : (await sessionService.getSession(sessionId).catch(() => null))?.expert
  const expert = workflowIsActive
    ? undefined
    : (hasActiveExpertRuntime(transcriptExpert)
      ? transcriptExpert
      : await expertRuntimeSessionStore.get(sessionId))
  if (expert?.mode === 'expert' && expert.status === 'active' && !hasActiveExpertRuntime(expert)) {
    throw new ExpertRuntimeBindingError()
  }
  const expertToolPolicy = workflowIsActive
    ? { disallowedTools: [] }
    : resolveExpertRuntimeToolPolicy(expert, { modelId: settings.model })
  const expertSystemPrompt = workflowIsActive
    ? null
    : buildExpertRuntimeTurnInstruction(expert, { modelId: settings.model })
  const expertTemplateFillWrite = !workflowIsActive && hasActiveExpertRuntime(expert) &&
    expert.runtimeBinding.outputMode === 'template-fill'
    ? true
    : undefined
  const expertResearchDeliveryPolicy = !workflowIsActive && hasActiveExpertRuntime(expert)
    ? expert.runtimeBinding.researchDeliveryPolicy
    : undefined
  const expertBrowserHumanVerificationHandoff = !workflowIsActive && hasActiveExpertRuntime(expert) &&
    expert.runtimeBinding.researchBrowserPolicy?.desktopHumanVerificationHandoff === true
    ? true
    : undefined
  const expertBrowserVerificationFallbackSearchEngines = !workflowIsActive && hasActiveExpertRuntime(expert)
    ? expert.runtimeBinding.researchBrowserPolicy?.verificationFallbackSearchEngines
    : undefined
  const expertForbidSubagentAskUserQuestion = !workflowIsActive && hasActiveExpertRuntime(expert) &&
    expert.runtimeBinding.researchBrowserPolicy?.forbidSubagentAskUserQuestion === true
    ? true
    : undefined
  const expertClosePlaywrightWhenAgentDone = !workflowIsActive && hasActiveExpertRuntime(expert) &&
    expert.runtimeBinding.researchBrowserPolicy?.closePlaywrightWhenAgentDone === true
    ? true
    : undefined
  const expertSessionId = expertTemplateFillWrite || expertBrowserHumanVerificationHandoff || expertResearchDeliveryPolicy
    ? sessionId
    : undefined
  const expertSharedPlaywrightSessionId = !workflowIsActive && hasActiveExpertRuntime(expert) &&
    expert.runtimeBinding.researchBrowserPolicy?.sharePlaywrightSessionAcrossAgents === true
    ? sessionId
    : undefined
  const expertPlaywrightCdpEndpoint = !workflowIsActive && hasActiveExpertRuntime(expert) &&
    expert.researchBrowserConnection?.kind === 'cdp'
    ? expert.researchBrowserConnection.endpoint
    : undefined
  const expertManagedPlaywrightPresentation = !workflowIsActive && hasActiveExpertRuntime(expert) &&
    expert.researchBrowserConnection?.kind !== 'cdp'
    ? expert.researchBrowserPresentation
      ?? expert.runtimeBinding.researchBrowserPolicy?.managedPresentationDefault
      ?? (expert.runtimeBinding.researchBrowserPolicy?.forceVisiblePlaywright === true ? 'always_visible' : undefined)
    : undefined
  const expertForceVisiblePlaywright = expertManagedPlaywrightPresentation === 'always_visible'
    ? true
    : undefined
  // Workflow phases share one long-lived leader process. Do not encode a
  // phase-specific deny list into CLI launch arguments: it would make tools
  // permanently disappear after the phase changes. The execution boundary
  // refreshes the persisted Desktop phase and enforces it for every tool call.
  const disallowedTools = [...new Set(expertToolPolicy.disallowedTools)]
  const workflowSystemPrompt = buildWorkflowRuntimeBindingInstruction(sessionId, workflowState)
  const workflowSettings = workflowIsActive
    ? {
        workflowSessionId: sessionId,
        ...(workflowSystemPrompt ? { workflowSystemPrompt } : {}),
      }
    : {}
  const expertSettings = expertSystemPrompt
    ? {
        expertSystemPrompt,
        ...(expertSessionId ? { expertSessionId } : {}),
        ...(expertTemplateFillWrite ? { expertTemplateFillWrite: true } : {}),
        ...(expertResearchDeliveryPolicy ? { expertResearchDeliveryPolicy } : {}),
        ...(expertSharedPlaywrightSessionId ? { expertSharedPlaywrightSessionId } : {}),
        ...(expertPlaywrightCdpEndpoint ? { expertPlaywrightCdpEndpoint } : {}),
        ...(expertManagedPlaywrightPresentation ? { expertManagedPlaywrightPresentation } : {}),
        ...(expertForceVisiblePlaywright ? { expertForceVisiblePlaywright: true } : {}),
        ...(expertBrowserHumanVerificationHandoff ? { expertBrowserHumanVerificationHandoff: true } : {}),
        ...(expertBrowserVerificationFallbackSearchEngines?.length
          ? { expertBrowserVerificationFallbackSearchEngines }
          : {}),
        ...(expertClosePlaywrightWhenAgentDone ? { expertClosePlaywrightWhenAgentDone: true } : {}),
        ...(expertForbidSubagentAskUserQuestion ? { expertForbidSubagentAskUserQuestion: true } : {}),
      }
    : {}
  return disallowedTools.length > 0
    ? { ...settings, ...workflowSettings, ...expertSettings, disallowedTools }
    : { ...settings, ...workflowSettings, ...expertSettings }
}

function buildWorkflowRuntimeBindingInstruction(
  sessionId: string,
  state: WorkflowSessionState | null | undefined,
): string | null {
  if (!state || getWorkflowScopedToolNames(state).length === 0) return null

  const startupPrompt = typeof state.startupPrompt === 'string' ? state.startupPrompt.trim() : ''

  return [
    '<desktop-workflow-runtime-binding>',
    `This CLI process is authoritatively bound to Desktop workflow session ${sessionId}.`,
    'The current process has registered submit_phase_completion and request_workflow_route for this workflow session.',
    'Phase-specific instructions are supplied only by the latest Desktop workflow control turn. Treat an earlier phase contract as historical after a newer control turn arrives; do not carry its implementation, review, or completion instructions into the new phase.',
    'Do not infer, request, or execute future-phase instructions before Desktop supplies that phase. Historical workflow text is project context, not permission to work outside the current phase.',
    'The persisted Desktop workflow state and the tool execution result are authoritative. Each tool call is checked against that latest state, even if this transcript contains a different earlier phase.',
    'Historical transcript messages, including any earlier “No such tool available” result, are not a current tool-availability check and must not be reused as a reason to skip a required workflow tool call.',
    'When the current phase is ready, call submit_phase_completion with status, handoff, rationale, and evidence; do not replace it with prose or continue into a later phase.',
    'Use request_workflow_route only for a true non-linear route, rework, jump_to_phase, pause/resume, or finish. Never call it merely to enter the immediate linear next phase already represented by the pending completion.',
    ...(startupPrompt
      ? [
          '<desktop-workflow-project-context>',
          'This persisted handoff is project context only. It does not define the current phase, authorize tools, or override the latest Desktop workflow control turn.',
          startupPrompt,
          '</desktop-workflow-project-context>',
        ]
      : []),
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
  expertHumanVerificationService.cancelSession(sessionId)
  expertBrowserActivityService.clear(sessionId)
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
