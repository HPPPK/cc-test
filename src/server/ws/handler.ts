import { collectUiuxImageEvidence } from '../../services/tools/uiuxImageWorkflowRuntime.js'
import { validateUiuxImageReview, UIUX_REVIEW_INSTRUCTION, UIUX_REFERENCE_INSTRUCTION } from '../../services/tools/uiuxImageContract.js'
/**
 * WebSocket connection handler
 *
 * 绠＄悊 WebSocket 杩炴帴鐢熷懡鍛ㄦ湡锛屽鐞嗘秷鎭矾鐢便€? * 鐢ㄦ埛娑堟伅閫氳繃 CLI 瀛愯繘绋嬶紙stream-json 妯″紡锛夊鐞嗭紝
 * CLI stdout 娑堟伅琚浆鎹负 ServerMessage 骞惰浆鍙戝埌 WebSocket銆? */

import { isUiuxImageOnlyBinding } from '../services/uiuxImageDeliveryPolicyService.js'
import { upgradeUiuxImageOnlyRuntime } from '../services/expertRuntimeBindingService.js'
import { PROTOTYPE_PREVIEW_TOOL, parsePrototypePreviewReceipt, imageMatchesPreview, type PrototypePreviewReceipt, type PrototypePreviewScreenshot } from '../services/prototypePreviewService.js'
import { validatePrototypePreviewFiles } from '../services/prototypePreviewEvidence.js'
import type { ServerWebSocket } from 'bun'
import type { ClientMessage, ServerMessage } from './events.js'
import { ClientOutbox } from './clientOutbox.js'
import * as os from 'node:os'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  ConversationStartupError,
  conversationService,
} from '../services/conversationService.js'
import { computerUseApprovalService } from '../services/computerUseApprovalService.js'
import { expertHumanVerificationService } from '../services/expertHumanVerificationService.js'
import { expertBrowserActivityService } from '../services/expertBrowserActivityService.js'
import { expertSearchPacingService } from '../services/expertSearchPacingService.js'
import { expertResearchAutoContinueService, type ExpertResearchAutoContinuePlan } from '../services/expertResearchAutoContinueService.js'
import { ExpertSessionService } from '../services/expertSessionService.js'
import { sessionService } from '../services/sessionService.js'
import type { ExpertResearchArtifactPolicy } from '../services/expertResearchArtifactPolicyService.js'
import { ApiError } from '../middleware/errorHandler.js'
import { SettingsService } from '../services/settingsService.js'
import { ProviderService } from '../services/providerService.js'
import { diagnosticsService } from '../services/diagnosticsService.js'
import { deriveTitle, generateTitle, saveAiTitle } from '../services/titleService.js'
import { WorkflowRuntimeService } from '../services/workflowRuntimeService.js'
import { WorkflowSessionStateService } from '../services/workflowSessionStateService.js'
import { WorkflowReportStore } from '../services/workflowReportStore.js'
import { WorkflowRefinementLedgerService } from '../services/workflowRefinementLedgerService.js'
import { getAppStoragePath } from '../../utils/appIdentity.js'
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
import { isManagedWorkflowAgentTaskState } from '../services/workflowAgentTaskStateService.js'
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
  getExpertProcessBindingKey,
  buildNormalRuntimeResetInstruction,
  ExpertRuntimeBindingError,
  hasActiveExpertRuntime,
  resolveExpertRuntimeToolPolicy,
  upgradeCommercializationResearchChannelRuntime,
  restoreTruncatedExpertRuntime,
} from '../services/expertRuntimeBindingService.js'
import { expertRuntimeSessionStore } from '../services/expertRuntimeSessionStore.js'
import { sessionRuntimeTransitionService } from '../services/sessionRuntimeTransitionService.js'
import { resolveExpertTemplateFillOutputRoot } from '../services/expertTemplateOutputPolicyService.js'
import {
  resolveExpertResearchDeliveryTerminalRecovery,
  type ExpertResearchDeliveryTerminalRecovery,
} from '../services/expertResearchDeliveryTerminalService.js'

import { getSessionChatState, setSessionChatState } from '../api/conversations.js'

const settingsService = new SettingsService()
const providerService = new ProviderService()
const workflowRuntimeService = new WorkflowRuntimeService()
const workflowSessionStateService = new WorkflowSessionStateService()
const workflowReportStore = new WorkflowReportStore()
const workflowRefinementLedgerService = new WorkflowRefinementLedgerService()
// ExpertSessionService reaches the browser-activity service, which delivers
// events through this module. Instantiate it only after ESM module evaluation
// completes so that this legitimate service-to-WebSocket cycle never reads the
// imported class while it is still in the temporal dead zone.
let expertSessionService: ExpertSessionService | undefined
function getExpertSessionService(): ExpertSessionService {
  expertSessionService ??= new ExpertSessionService()
  return expertSessionService
}
const workflowArtifactWriteRecoveryAttempts = new Map<string, number>()

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
 * Track sessions where user requested stop 鈥?suppress the CLI_ERROR that
 * follows an interrupt so the frontend doesn't show "澶勭悊杩囩▼涓彂鐢熼敊璇?.
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

// CLI starts and HTTP Expert transitions share the same session lifecycle queue.


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
  reason: 'user_message' | 'prewarm_session' | 'workflow_auto_continue' | 'expert_research_auto_continue',
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
// Keep a session-level listener during the short reconnect grace period. The
// listener still drives workflow recovery even when there is temporarily no UI
// socket to receive its broadcast messages.
const retainedSessionOutputCallbacks = new Map<string, (msg: any) => void>()

type ClientBackpressureState = {
  startedAt: number
  lastReportedAt: number
  queuedSendCount: number
  messageTypes: Set<string>
}

// uWebSockets returns -1 when a payload is queued behind a slow client. Keep
// delivery intact, but coalesce diagnostics so a long streaming response does
// not turn one recoverable slow-client period into thousands of disk writes.
const CLIENT_BACKPRESSURE_DIAGNOSTIC_INTERVAL_MS = 15_000
const clientBackpressureStates = new Map<
  ServerWebSocket<WebSocketData>,
  ClientBackpressureState
>()

const clientOutboxes = new Map<ServerWebSocket<WebSocketData>, ClientOutbox>()
const runningBackgroundTasks = new Map<string, Set<string>>()

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
  clientBackpressureStates.delete(ws)
  clientOutboxes.get(ws)?.dispose()
  clientOutboxes.delete(ws)
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

  const cleanupTimer = setTimeout(() => {
    sessionCleanupTimers.delete(sessionId)
    if (!hasActiveClients(sessionId)) {
      // A UI connection is not the lifetime/owner of a running research task.
      // Keep approval requests pending; reconnecting must not auto-deny them.
      if (getSessionChatState(sessionId) !== 'idle'
        || (runningBackgroundTasks.get(sessionId)?.size ?? 0) > 0
        || expertHumanVerificationService.getPendingRequest(sessionId)
        || conversationService.getPendingPermissionRequests(sessionId).length > 0) {
        scheduleSessionCleanupAfterClientDisconnect(sessionId)
        return
      }
      console.log(`[WS] Idle session ${sessionId} disconnected after grace period; releasing CLI subprocess`)
      computerUseApprovalService.cancelSession(sessionId)
      expertHumanVerificationService.cancelSession(sessionId)
      removeSessionOutputCallbacks(sessionId)
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
  // Always clear the socket mapping, including duplicate close notifications.
  // Keep the underlying session listener only for the final client during the
  // reconnect grace period, so workflow terminal recovery still receives CLI output.
  removeClientOutputCallback(ws, { retainForReconnect: !hasActiveClients(sessionId) })
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
  _messageType: string,
): ClientSendOutcome {
  let outbox = clientOutboxes.get(ws)
  if (!outbox) {
    outbox = new ClientOutbox((frame) => {
      const outcome = sendClientFrame(ws, frame, JSON.parse(frame).type)
      return outcome === 'dropped' ? 0 : outcome === 'backpressured' ? -1 : 1
    }, () => {
      void diagnosticsService.recordEvent({
        type: 'ws_client_resync_required', severity: 'warn', sessionId: ws.data.sessionId,
        summary: 'Slow client exceeded the bounded outbox; reconnect and restore persisted history',
      })
      removeDisconnectedClient(ws.data.sessionId, ws)
      try {
        ws.close(1013, 'Client too slow; reconnect to restore history')
      } catch {
        // The stale socket is already detached; do not interrupt healthy peers.
      }
    })
    clientOutboxes.set(ws, outbox)
  }
  return outbox.send(payload)
}

function sendClientFrame(
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
      const now = Date.now()
      const existing = clientBackpressureStates.get(ws)
      if (existing) {
        existing.queuedSendCount += 1
        existing.messageTypes.add(messageType)
        if (now - existing.lastReportedAt >= CLIENT_BACKPRESSURE_DIAGNOSTIC_INTERVAL_MS) {
          void diagnosticsService.recordEvent({
            type: 'ws_client_backpressure',
            severity: 'warn',
            sessionId: ws.data.sessionId,
            summary: 'Client WebSocket remains backpressured; queued sends coalesced in diagnostics',
            details: {
              channel: ws.data.channel,
              sendResult,
              durationMs: now - existing.startedAt,
              queuedSendCount: existing.queuedSendCount,
              messageTypes: [...existing.messageTypes],
            },
          })
          existing.lastReportedAt = now
        }
        return 'backpressured'
      }

      const state: ClientBackpressureState = {
        startedAt: now,
        lastReportedAt: now,
        queuedSendCount: 1,
        messageTypes: new Set([messageType]),
      }
      clientBackpressureStates.set(ws, state)
      void diagnosticsService.recordEvent({
        type: 'ws_client_backpressure',
        severity: 'warn',
        sessionId: ws.data.sessionId,
        summary: 'Client WebSocket send queued because of backpressure',
        details: {
          channel: ws.data.channel,
          messageType,
          sendResult,
          queuedSendCount: state.queuedSendCount,
        },
      })
      return 'backpressured'
    }

    const recovered = clientBackpressureStates.get(ws)
    if (recovered) {
      clientBackpressureStates.delete(ws)
      void diagnosticsService.recordEvent({
        type: 'ws_client_backpressure_recovered',
        severity: 'info',
        sessionId: ws.data.sessionId,
        summary: 'Client WebSocket recovered from backpressure',
        details: {
          channel: ws.data.channel,
          durationMs: Date.now() - recovered.startedAt,
          queuedSendCount: recovered.queuedSendCount,
          messageTypes: [...recovered.messageTypes],
        },
      })
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
    const isReconnect = hasActiveClients(sessionId) || sessionCleanupTimers.has(sessionId) || retainedSessionOutputCallbacks.has(sessionId)

    // Cancel pending cleanup timer if client reconnects
    const pendingTimer = sessionCleanupTimers.get(sessionId)
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      sessionCleanupTimers.delete(sessionId)
    }

    addActiveClient(sessionId, ws)
    // A prior sidecar could have received all three researcher handoffs after the
    // parent turn ended. Re-check only this opt-in Expert when its client reconnects.
    expertResearchAutoContinueService.schedule(sessionId)
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
    sendMessage(ws, {
      type: 'system_notification', subtype: 'session_state',
      data: { state: getSessionChatState(sessionId), reconnected: isReconnect },
    })
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
    if (ws.data.channel === 'client') clientOutboxes.get(ws)?.drain()
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
  // A deterministic renderer/ledger failure belongs only to the prior user turn.
  streamState.expertTemplateFillValidationFailure = false
  resetStrictVisualQaEvidence(streamState)
  streamState.strictVisualIntroductionTurn = false
  clearPrewarmState(sessionId)
  const prototypeVisualRuntimeActive = await isPrototypeVisualRuntimeActive(sessionId)
  if (prototypeVisualRuntimeActive && userRequestsPrototypeArtifactDelivery(message.content, message.attachments)) {
    // A concrete topic (for example “AI 老照片修复”) starts a deliverable
    // request. It remains true across card answers so the final confirmation
    // cannot end as a prose-only plan.
    streamState.prototypeDeliveryRequested = true
  }
  const strictVisualRuntimeActive = await isStrictVisualRuntimeActive(sessionId)
  if (strictVisualRuntimeActive && userRequestsStrictVisualPublicResearch(message.content)) {
    // The user has already chosen a public reference site or explicitly
    // authorized web research. Do not let a text-only model turn pretend that
    // this visual-research decision never happened.
    streamState.strictVisualReferenceResearchRequired = true
    streamState.strictVisualLockedReferenceUrls = strictVisualPublicReferenceUrls(message.content)
  }
  if (
    strictVisualRuntimeActive
    && userRequestsStrictVisualInspirationSourceDecision(message.content, message.attachments)
    && !userHasResolvedStrictVisualInspirationSources(message.content)
  ) {
    // A screenshot-redesign task has reached the point where visual-reference
    // scope must be chosen. Keep this as server state rather than trusting the
    // model to remember to issue its inspiration_sources card.
    streamState.strictVisualInspirationSourceDecisionRequired = true
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

  try {
    await enqueueRuntimeTransition(sessionId, async () => {
      await ensureCliSessionStartedInTransition(ws, sessionId, 'user_message')
      // Bind to the final process, then send exactly once before releasing the queue.
      let userMessageSent = false
      const shouldForwardCurrentTurnLocalCommand = createCurrentTurnLocalCommandForwarder(desktopSlashCommand)
      bindAllClientSessionOutputs(sessionId, {
        shouldForward: (cliMsg) => userMessageSent || (cliMsg.type === 'result' && cliMsg.is_error)
          || shouldForwardCurrentTurnLocalCommand(cliMsg),
      })
      const resolvedMessage = await resolveSessionRuntimeUserMessage(ws, sessionId, message.content, message.workflowLanguage)
      if (resolvedMessage === null) {
        sendMessage(ws, { type: 'status', state: 'idle' })
        return
      }
      const sent = conversationService.sendMessage(sessionId, resolvedMessage, message.attachments)
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
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    const code = err instanceof ExpertRuntimeBindingError ? err.code
      : err instanceof ConversationStartupError ? err.code : 'CLI_START_FAILED'
    console.error('[WS] CLI start failed for ' + sessionId + ': ' + errMsg)
    sendMessage(ws, {
      type: 'error',
      message: err instanceof ExpertRuntimeBindingError ? errMsg
        : await buildSessionStartupDiagnosticMessage(sessionId, errMsg),
      code,
      retryable: err instanceof ConversationStartupError ? err.retryable : false,
    })
    sendMessage(ws, { type: 'status', state: 'idle' })
  }
}

async function handleDesktopClearCommand(
  ws: ServerWebSocket<WebSocketData>,
) {
  const { sessionId } = ws.data

  const workDir = conversationService.getSessionWorkDir(sessionId)
  conversationService.stopSession(sessionId)
  runningBackgroundTasks.delete(sessionId)
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
    phaseCount > 0 ? `我会按 ${phaseCount} 个阶段带你推进。` : '',
    firstPhase?.label ? `第一步会从“${firstPhase.label}”开始。` : '',
    labels.length ? `当前路线偏向：${labels.join('、')}。` : '',
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0)

  const message = [
    `嗨，我是“${workflowName}”工作流。`,
    capabilities.length ? capabilities.join('\n') : '我会按这个工作流的阶段约束来协助你推进。',
    '你可以直接告诉我想做什么、要改哪里，或把目标/问题交给我；你一发消息，我就正式进入第一阶段。',
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
  // The commercialization Expert owns any necessary product-definition
  // question in its prompt. Do not recreate the retired short-title intake
  // gate here: every research run is a complete commercial analysis by default.
  const dynamicIntakeInstruction = undefined
  return [resetInstruction, dynamicIntakeInstruction, content].filter(Boolean).join('\n\n')
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

type WorkflowArtifactWriteDenial = {
  message: string
  recoverySent: boolean
  retryable?: boolean
}

const SKILLS_DEVELOPMENT_TEMPLATE_ID = 'skills-development'
const WORKFLOW_ARTIFACT_WRITE_RECOVERY_ATTEMPTS = 1
const LEGACY_WORKFLOW_ARTIFACT_WRITE_FORBIDDEN_MESSAGE =
  'This workflow phase may write only session-internal .workflow artifacts. Production files and unknown paths remain blocked until a phase explicitly grants normal edit capability.'

function isSkillsDevelopmentWorkflow(state: WorkflowSessionState): boolean {
  return state.templateIdentity?.id === SKILLS_DEVELOPMENT_TEMPLATE_ID
}

function workflowArtifactWriteRecoveryPhaseKey(
  sessionId: string,
  phaseId: string | null,
): string {
  return `${sessionId}:${phaseId ?? 'unknown'}`
}

function workflowArtifactWriteLedgerFingerprint(
  phaseId: string | null,
  candidatePath: unknown,
): string {
  const pathDigest = createHash('sha256')
    .update(typeof candidatePath === 'string' ? candidatePath.trim().toLowerCase() : 'missing-or-unknown')
    .digest('hex')
  return `${phaseId ?? 'unknown'}:${pathDigest}`
}

function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

async function currentWorkflowPackSha256(templateId: string): Promise<string | null> {
  try {
    const filePath = getAppStoragePath(configDir(), 'workflows', 'packs', `${templateId}.zip`)
    const bytes = await fs.readFile(filePath)
    return createHash('sha256').update(bytes).digest('hex')
  } catch {
    return null
  }
}

function workflowArtifactWriteRecoveryInstruction(state: WorkflowSessionState): string {
  const lines = [
    'The previous Write request was denied because this is an artifact-only workflow phase.',
    'workflow_artifact_write is declarative; the visible tool may still be named Write. This phase permits only a workspace-relative .workflow/... path.',
    'Continue the current phase using Write only for the required .workflow artifact. Do not write src, public, the repository root, C:\\Temp, another workspace, or an unknown path. Do not call Edit/MultiEdit or treat the denial as phase completion.',
    'If a temporary verification script seems necessary, use an already allowed command or record the blocked reason under .workflow instead. Do not create an external temporary file.',
  ]
  return ['<workflow-artifact-write-recovery>', ...lines, '</workflow-artifact-write-recovery>'].join('\n')
}
async function appendWorkflowArtifactWriteRefinement(
  state: WorkflowSessionState,
  sessionId: string,
  candidatePath: unknown,
): Promise<void> {
  const templateId = state.templateIdentity?.id
  // The refinement ledger is intentionally opt-in for the independently evolved
  // skills-development pack. Other workflow templates must not gain durable
  // side effects merely because they share the artifact-write runtime guard.
  if (templateId !== SKILLS_DEVELOPMENT_TEMPLATE_ID) return
  const phaseId = state.activePhaseId ?? undefined
  const phaseFingerprint = workflowArtifactWriteLedgerFingerprint(state.activePhaseId, candidatePath)
  const existing = await workflowRefinementLedgerService.list(templateId).catch(() => [])
  if (existing.some((record) => (
    record.status === 'observed'
    && record.kind === 'tool-contract'
    && record.sourceSessionId === sessionId
    && record.phaseId === phaseId
    && record.evidence.some((evidence) => evidence.fingerprint === phaseFingerprint)
  ))) return

  const now = new Date().toISOString()
  await workflowRefinementLedgerService.append({
    templateId,
    basePackSha256: await currentWorkflowPackSha256(templateId),
    ...(phaseId ? { phaseId } : {}),
    kind: 'tool-contract',
    status: 'observed',
    scope: 'template',
    evidence: [{
      type: 'workflow-artifact-write-denied',
      summary: 'Artifact-only phase attempted a Write outside workspace-relative .workflow/.',
      observedAt: now,
      fingerprint: phaseFingerprint,
      pathCategory: typeof candidatePath === 'string' && candidatePath.trim() ? 'outside-workflow' : 'missing-or-unknown',
    }],
    expectedOutcome: 'The current phase recovers with a Write confined to .workflow/ and no product files are changed.',
    proposedChange: 'Keep the concrete Write-to-.workflow contract and bounded recovery instruction in the workflow runtime and pack.',
    sourceSessionId: sessionId,
  }).catch((error) => {
    console.warn(`[WS] Failed to record workflow artifact-write refinement for ${sessionId}:`, error)
  })
}

async function rejectUnsafeWorkflowArtifactWrite(
  sessionId: string,
  requestId: string,
  allowed: boolean,
  updatedInput?: Record<string, unknown>,
): Promise<WorkflowArtifactWriteDenial | null> {
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
  if (workDir && isWorkflowArtifactWritePath(workDir, candidatePath)) {
    if (isSkillsDevelopmentWorkflow(stateRead.state)) {
      // A compliant artifact write is meaningful progress only for the isolated
      // skills-development recovery guard. Other templates retain the original
      // artifact-write behavior with no recovery state.
      workflowArtifactWriteRecoveryAttempts.delete(
        workflowArtifactWriteRecoveryPhaseKey(sessionId, stateRead.state.activePhaseId),
      )
    }
    return null
  }

  // All non-skills-development templates retain the pre-v16 terminal rejection
  // exactly: no recovery prompt, retry budget, or refinement-ledger side effect.
  if (!isSkillsDevelopmentWorkflow(stateRead.state)) {
    conversationService.respondToPermission(sessionId, requestId, false)
    return {
      message: LEGACY_WORKFLOW_ARTIFACT_WRITE_FORBIDDEN_MESSAGE,
      recoverySent: false,
    }
  }

  const recoveryPhaseKey = workflowArtifactWriteRecoveryPhaseKey(sessionId, stateRead.state.activePhaseId)
  const recoveryAttempts = workflowArtifactWriteRecoveryAttempts.get(recoveryPhaseKey) ?? 0
  const canRecover = recoveryAttempts < WORKFLOW_ARTIFACT_WRITE_RECOVERY_ATTEMPTS
  const message = canRecover
    ? 'This is an artifact-only workflow phase. The workflow_artifact_write capability exposes the visible Write tool only for workspace-relative .workflow/... files. Your attempted path is blocked. Do not edit source/product files or end the phase; write the required current-phase artifact under .workflow/ and continue.'
    : 'This artifact-only workflow phase received another Write outside workspace-relative .workflow/ after a recovery instruction. Production files remain protected. Retry the current phase and write only its required .workflow artifact.'

  conversationService.respondToPermission(sessionId, requestId, false, undefined, undefined, message)
  await appendWorkflowArtifactWriteRefinement(stateRead.state, sessionId, candidatePath)

  if (!canRecover) {
    return { message, recoverySent: false, retryable: false }
  }

  workflowArtifactWriteRecoveryAttempts.set(recoveryPhaseKey, recoveryAttempts + 1)
  sendToSession(sessionId, {
    type: 'status',
    state: 'thinking',
    verb: 'Recovering workflow artifact write',
  })
  const recoverySent = conversationService.hasSession(sessionId)
    && conversationService.sendMessage(sessionId, workflowArtifactWriteRecoveryInstruction(stateRead.state))
  return { message, recoverySent, retryable: recoverySent }
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
      message: artifactWriteDenial.message,
    })
    if (!artifactWriteDenial.recoverySent) {
      sendMessage(ws, {
        type: 'error',
        message: artifactWriteDenial.message,
        code: 'WORKFLOW_ARTIFACT_WRITE_FORBIDDEN',
        ...(artifactWriteDenial.retryable === undefined
          ? {}
          : { retryable: artifactWriteDenial.retryable }),
      })
    }
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
  return strategy === undefined || strategy === 'inherit' || strategy === 'clear' || strategy === 'capsule'
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

  // Queue even before startSession has registered a process or startup promise.
  // A prewarm may already be resolving old settings inside the same queue.
  // Check process ownership only after that earlier transition has settled.
  await enqueueRuntimeTransition(sessionId, async () => {
    const currentOverride = runtimeOverrides.get(sessionId)
    if (
      currentOverride?.providerId !== nextOverride.providerId ||
      currentOverride.modelId !== nextOverride.modelId ||
      !conversationService.hasSession(sessionId)
    ) return
    await restartSessionWithRuntimeConfig(ws, sessionId, prevOverride)
  })
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
  runningBackgroundTasks.delete(sessionId)

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

type PrototypeFidelity = 'low' | 'mid' | 'high'
type PrototypeQaViewport = 'desktop' | 'tablet' | 'mobile'
type PrototypeScreenshot = { viewport: PrototypeQaViewport; path: string }
type PrototypeRenderAttempt = { writeCount: number; screenshots: PrototypeScreenshot[] }
type PrototypeReadAttempt = PrototypeScreenshot & { writeCount: number; rendered: boolean; preview?: PrototypePreviewScreenshot }
type PrototypeWriteAttempt = { fidelities: PrototypeFidelity[]; receipt?: string; writeCount: number }

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
  /** Hide free-form prose emitted during a server-initiated Expert continuation. */
  suppressExpertAutoContinueAssistantText: boolean
  terminalRecoveryHandledForTurn: boolean
  terminalTurnSequence: number
  terminalFallbackTimer?: ReturnType<typeof setTimeout>
  failedAskUserQuestionToolUseIds: Set<string>
  strictVisualIntroductionTurn: boolean
  hasStrictVisualGeneratedImage: boolean
  wroteStrictVisualHtml: boolean
  strictVisualHtmlWriteCount: number
  completedStrictVisualQa: boolean
  strictVisualRendererSuccessCount: number
  visualQaRendererToolUseIds: Set<string>
  strictVisualPngReadToolUseIds: Set<string>
  /** Successful image_generation calls must be read back from their returned image path. */
  strictVisualImageGenerationToolUseIds: Set<string>
  strictVisualGeneratedImagePathsByToolUseId: Map<string, string>
  strictVisualGeneratedImageReadPathsByToolUseId: Map<string, string>
  strictVisualGeneratedImageFailedReadPaths: Set<string>
  strictVisualGeneratedImageReadPaths: Set<string>
  strictVisualGeneratedImageReviewText: string
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
  /** A screenshot-redesign task must choose its visual-reference scope before it may end. */
  strictVisualInspirationSourceDecisionRequired: boolean
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
  /** Prototype-only visual QA state; this is separate from the UIUX strict workflow. */
  /** A user has supplied a concrete product/topic request, not only asked what this Expert can do. */
  prototypeDeliveryRequested: boolean
  prototypeFidelityHtmlPaths: Set<PrototypeFidelity>
  prototypeHighFidelityWriteCount: number
  prototypeHighFidelityLastReadWriteCount: number | null
  prototypeHighFidelityRevisionAfterImageReview: boolean
  prototypeWritesByToolUseId: Map<string, PrototypeWriteAttempt>
  prototypeEvidenceReceipt: string
  prototypeReviewAssistantText: string
  prototypePreviewAttempts: Map<string, { writeCount: number; fidelity: string }>
  prototypePreviewReceipt: PrototypePreviewReceipt | null
  prototypePreviewReadPaths: Set<string>
  prototypeQaRenderedPaths: Set<string>
  prototypeQaRendererViewportByToolUseId: Map<string, PrototypeRenderAttempt>
  prototypeQaRenderedViewports: Set<PrototypeQaViewport>
  prototypeQaReadViewportByToolUseId: Map<string, PrototypeReadAttempt>
  prototypeQaReadViewports: Set<PrototypeQaViewport>
  prototypeAskUserQuestionRecoveryAttempts: number
  prototypeRenderRecoveryAttempts: number
  prototypeReviewRecoveryAttempts: number
  structuredInteractionRecoveryAttempts: number
  expertResearchDeliveryRecoveryAttempts: number
  /** Counts internal tool-only recoveries; ordinary model noncompliance is not a user-visible error. */
  commercializationResearchQuestionRecoveryAttempts: number
  /** A deterministic template/evidence tool failure occurred in this user turn. */
  expertTemplateFillValidationFailure: boolean
  /** A delivery card reached the model turn; a transient record failure is not prose-only completion. */
  expertResearchDeliveryCardAttempted: boolean
  workflowProtocolToolRegistryError?: 'submit_phase_completion' | 'request_workflow_route'
  workflowProtocolBindingRecoveryAttempts: number
  workflowProtocolBindingRecoveryInFlight: boolean
  workflowProtocolInputValidationError?: WorkflowRecoverableInputToolName
  workflowProtocolInputValidationDetail?: string
  workflowProtocolInputRecoveryAttempts: number
  /** Tool blocks whose input JSON failed to parse in content_block_stop.
   *  The assistant message carries the complete input 鈥?defer to that. */
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
      suppressExpertAutoContinueAssistantText: false,
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
      strictVisualImageGenerationToolUseIds: new Set(),
      strictVisualGeneratedImagePathsByToolUseId: new Map(),
      strictVisualGeneratedImageReadPathsByToolUseId: new Map(),
      strictVisualGeneratedImageFailedReadPaths: new Set(),
      strictVisualGeneratedImageReadPaths: new Set(),
      strictVisualGeneratedImageReviewText: '',
      strictVisualLastImageReviewHtmlWriteCount: null,
      strictVisualUnsupportedPriceAnalogyDetected: false,
      strictVisualUnsafeAbsolutePlanBadgeDetected: false,
      strictVisualGeneratedSemanticPseudoTextDetected: false,
      strictVisualMisleadingPaymentCodeDetected: false,
      strictVisualProcessDisclaimerDetected: false,
      strictVisualFinalReviewRequired: false,
      strictVisualReferenceResearchRequired: false,
      strictVisualInspirationSourceDecisionRequired: false,
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
      prototypeDeliveryRequested: false,
      prototypeFidelityHtmlPaths: new Set(),
      prototypeHighFidelityWriteCount: 0,
      prototypeHighFidelityLastReadWriteCount: null,
      prototypeHighFidelityRevisionAfterImageReview: false,
      prototypeWritesByToolUseId: new Map(),
      prototypeEvidenceReceipt: '',
      prototypeReviewAssistantText: '',
      prototypePreviewAttempts: new Map(),
    prototypePreviewReceipt: null,
    prototypePreviewReadPaths: new Set(),
    prototypeQaRenderedPaths: new Set(),
      prototypeQaRendererViewportByToolUseId: new Map(),
      prototypeQaRenderedViewports: new Set(),
      prototypeQaReadViewportByToolUseId: new Map(),
      prototypeQaReadViewports: new Set(),
      prototypeAskUserQuestionRecoveryAttempts: 0,
      prototypeRenderRecoveryAttempts: 0,
      prototypeReviewRecoveryAttempts: 0,
      structuredInteractionRecoveryAttempts: 0,
      expertResearchDeliveryRecoveryAttempts: 0,
      commercializationResearchQuestionRecoveryAttempts: 0,
      expertTemplateFillValidationFailure: false,
      expertResearchDeliveryCardAttempted: false,
      workflowProtocolToolRegistryError: undefined,
      workflowProtocolBindingRecoveryAttempts: 0,
      workflowProtocolBindingRecoveryInFlight: false,
      workflowProtocolInputValidationError: undefined,
      workflowProtocolInputValidationDetail: undefined,
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
  runningBackgroundTasks.delete(sessionId)
  cleanupStreamState(sessionId)
  sessionSlashCommands.delete(sessionId)
  sessionTitleState.delete(sessionId)
  runtimeOverrides.delete(sessionId)
  // In-flight lifecycle work owns its queue entry until it settles.
  for (const key of workflowArtifactWriteRecoveryAttempts.keys()) {
    if (key.startsWith(`${sessionId}:`)) workflowArtifactWriteRecoveryAttempts.delete(key)
  }
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
  expertTemplateFillValidationFailure: boolean
  strictVisualIntroductionTurn: boolean
  wroteStrictVisualHtml: boolean
  completedStrictVisualQa: boolean
  completedStrictVisualReview: boolean
  visualReviewFailureReasons: string[]
  wrotePrototypeHtml: boolean
  prototypeDeliveryRequested: boolean
  hasAllPrototypeFidelityHtml: boolean
  completedPrototypeViewportQa: boolean
  completedPrototypeVisualReview: boolean
  prototypeVisualQualityFailureReasons: string[]
  prototypeAskUserQuestionRecoveryAttempts: number
  prototypeRenderRecoveryAttempts: number
  prototypeReviewRecoveryAttempts: number
  strictVisualReferenceResearchRequired: boolean
  strictVisualInspirationSourceDecisionRequired: boolean
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

type CommercializationResearchQuestionRecovery = {
  expertId: string
}

type StrictVisualTerminalRecovery = {
  imageOnly?: boolean
  imageGenerationFailed?: boolean
  latestImagePath?: string
  imagePreviewFailed?: boolean
  imagePreviewRead?: boolean
  kind: 'ask-user-question' | 'design-direction' | 'inspiration-source' | 'visual-reference-research' | 'image-generation' | 'image-generation-review' | 'render-qa' | 'visual-review'
  expertId: string
  visualReviewFailureReasons?: string[]
}

type PrototypeVisualTerminalRecovery = {
  kind: 'prototype-ask-user-question' | 'prototype-production' | 'prototype-render-qa' | 'prototype-visual-review'
  expertId: string
  failureReasons?: string[]
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
  if (hasStrictVisualGeneratedImageReviewPreview(streamState)) streamState.strictVisualGeneratedImageReviewText += text
  streamState.prototypeReviewAssistantText += text
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

function prototypeFidelityFromPath(path: string): PrototypeFidelity | null {
  const match = /(?:^|\/)(?:01-(low)|02-(mid)|03-(high))-fidelity\.html?$/i.exec(normalizedStrictVisualPath(path))
  return (match?.[1] || match?.[2] || match?.[3] || null) as PrototypeFidelity | null
}

function prototypeWrittenFidelities(toolName: unknown, input: Record<string, unknown>): PrototypeFidelity[] {
  if (['Write', 'Edit', 'MultiEdit'].includes(toolName as string) && typeof input.file_path === 'string') {
    const fidelity = prototypeFidelityFromPath(input.file_path)
    return fidelity ? [fidelity] : []
  }
  const command = input.command
  if (toolName !== 'Bash' || typeof command !== 'string' || !bashCommandWritesHtml(command)) return []
  // For shell writes, only explicit destinations count; mentioning an HTML
  // filename in a report, source string, renderer, or copy source is not a write.
  const targetPatterns = [
    /\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?|WriteAllText|WriteAllBytes)\s*\(\s*(?:"([^"]+\.html?)"|'([^']+\.html?)')/gi,
    /\b(?:Set-Content|Add-Content|Out-File)\s+(?:(?:-LiteralPath|-Path|-FilePath)\s+)?(?:"([^"]+\.html?)"|'([^']+\.html?)'|([^\s;|]+\.html?)(?=\s|$))/gi,
    /\bPath\s*\(\s*(?:"([^"]+\.html?)"|'([^']+\.html?)')\s*\)\s*\.\s*write_(?:text|bytes)\s*\(/gi,
    /\bopen\s*\(\s*(?:"([^"]+\.html?)"|'([^']+\.html?)')\s*,\s*["'][wax][^"']*["']/gi,
    /(?:^|[;&|])[^\r\n;&|]*(?:>>|>)\s*(?:"([^"]+\.html?)"|'([^']+\.html?)'|([^\s;&|]+\.html?)(?=\s|$))/gi,
  ]
  return [...new Set(targetPatterns.flatMap(pattern => Array.from(command.matchAll(pattern)).flatMap(match => {
    const fidelity = prototypeFidelityFromPath(match[1] || match[2] || match[3] || '')
    return fidelity ? [fidelity] : []
  })))]
}

function prototypeScreenshotFromPath(path: string): PrototypeScreenshot | null {
  const normalized = normalizedStrictVisualPath(path)
  const match = /(?:^|\/)high-(?:(?:first|final|desktop|tablet|mobile)-)*(1440x1000|1024x900|390x844)\.png$/i.exec(normalized)
  if (!match) return null
  const viewport = match[1] === '1440x1000' ? 'desktop' : match[1] === '1024x900' ? 'tablet' : 'mobile'
  return { viewport, path: normalized }
}

function prototypeScreenshotsFromRendererCommand(command: string): PrototypeScreenshot[] {
  const screenshots: PrototypeScreenshot[] = []
  // A single Bash call may contain all three renderer invocations. Track each
  // explicit output separately and later require its own successful receipt.
  for (const invocation of command.split(/;|\r?\n|&&/)) {
    if (!/03-high-fidelity\.html?(?:["'\s]|$)/i.test(invocation)
      || !/(?:VISUAL_QA_BROWSER_EXECUTABLE|chrome|headless_shell|playwright)/i.test(invocation)) continue
    const match = /["']--screenshot=([^"']+)["']|--screenshot=(?:"([^"]+)"|'([^']+)'|([^\s"']+))/i.exec(invocation)
    const screenshot = match && prototypeScreenshotFromPath(match[1] || match[2] || match[3] || match[4] || '')
    if (!screenshot) continue
    const size = screenshot.viewport === 'desktop' ? '1440,1000' : screenshot.viewport === 'tablet' ? '1024,900' : '390,844'
    if (invocation.includes('--window-size=' + size)) screenshots.push(screenshot)
  }
  return screenshots
}

function prototypeSuccessfulScreenshotPaths(content: unknown): Set<string> {
  const text = textFromToolResultContent(content)
  const paths = Array.from(text.matchAll(/(?:Screenshot written:\s*|\b\d+ bytes written to file\s+)([^\r\n]+?\.png)(?=["'\s]|$)/gi),
    match => normalizedStrictVisualPath(match[1]!.replace(/^["']/, '')))
  return new Set(paths)
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
  if (!/position\s*:\s*absolute/.test(normalized)) return false
  const planOrBadge = /(?:plan|tier|price|member|membership|badge|ribbon|tag|flag|label|套餐|会员|角标|飘带|推荐|促销|赠品)/i
  if (!planOrBadge.test(normalized)) return false
  return /(?:plan|tier|price|member|membership|badge|ribbon|tag|flag|label|套餐|会员|角标|飘带|推荐|促销|赠品)[\s\S]{0,260}position\s*:\s*absolute|position\s*:\s*absolute[\s\S]{0,260}(?:plan|tier|price|member|membership|badge|ribbon|tag|flag|label|套餐|会员|角标|飘带|推荐|促销|赠品)/i.test(normalized)
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
  const paymentSelector = /(?:qr(?:-|_)?code|qrcode|barcode|payment(?:-|_)?code|payment-qr|浜岀淮鐮亅鎵爜)[^{}]{0,260}\{[^{}]{0,900}\}/gi
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
  const hasPrice = /(?:[$¥€£]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:usd|eur|cny|rmb|yuan|元|美元|人民币))/i.test(text)
  const hasComparison = /(?:≈|约等于|相当于|只相当于|不到|equivalent(?:s+to)?|sames+as|prices+of|lesss+than)/i.test(text)
  const hasNamedLifestyleReference = /(?:咖啡|奶茶|电影票|午餐|早餐|自助餐|寿司|水煮鱼|炸鸡|打车|出租车|一顿饭|一份饭|coffee|latte|milks*tea|movies*ticket|lunch|breakfast|buffet|sushi|taxi|ride)/i.test(text)
  const hasFoodOrRideUnit = /(?:[一二三四五六七八九十0-9]+\s*(?:份|次|杯|条|顿|餐|item|meal|cup|ride))[^<\n]{0,12}(?:鸡|鱼|餐|饭|咖啡|奶茶|电影|车|coffee|tea|movie|ride|taxi)/i.test(text)
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
  for (const match of content.matchAll(/\bhttps?:\/\/[^\s<>"'，。；、]+/gi)) {
    const normalized = normalizeStrictVisualPublicUrl((match[0] ?? '').replace(/[)\],.;:!?]+$/g, ''))
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

/**
 * Screenshot redesign is the one visual intake that must actively decide the
 * reference scope. Read-only diagnosis remains free-form; a request to improve
 * the screenshot's visual or conversion outcome cannot silently skip the
 * inspiration_sources AskUserQuestion card.
 */
export function userRequestsStrictVisualInspirationSourceDecision(
  content: string,
  attachments?: Array<{ mimeType?: string; path?: string; name?: string }>,
): boolean {
  const hasVisualAttachment = (attachments ?? []).some((attachment) => /image|png|jpe?g|webp/i.test(`${attachment.mimeType ?? ''} ${attachment.path ?? ''} ${attachment.name ?? ''}`))
  if (!hasVisualAttachment) return false

  return /(?:重构|改版|重做|优化|改善|提升|设计|制作|生成|实现|购买欲|转化|付费|更有吸引力|好看|redesign|improve|optimi[sz]e|conversion|purchase)/i.test(content.trim())
}

function userHasResolvedStrictVisualInspirationSources(content: string): boolean {
  const normalized = content.trim()
  if (!normalized) return false
  if (userRequestsStrictVisualPublicResearch(normalized)) return true
  return /(?:不需要|无需|不查|基于|根据).{0,24}(?:外部|公开|网站|网页|灵感|参考|研究|截图|现有页面|原图)|(?:no|without).{0,24}(?:external|public|website|web|reference|research)/i.test(normalized)
}
async function isPrototypeVisualRuntimeActive(sessionId: string): Promise<boolean> {
  const transcriptExpert = (await sessionService.getSession(sessionId).catch(() => null))?.expert
  const expert = transcriptExpert ?? await expertRuntimeSessionStore.get(sessionId)
  return hasActiveExpertRuntime(expert) && expert.runtimeBinding.runtimePolicy?.mode === 'prototype-visual-workflow'
}

async function isStrictVisualRuntimeActive(sessionId: string): Promise<boolean> {
  const transcriptExpert = (await sessionService.getSession(sessionId).catch(() => null))?.expert
  const expert = transcriptExpert ?? await expertRuntimeSessionStore.get(sessionId)
  return hasActiveExpertRuntime(expert) && expert.runtimeBinding.runtimePolicy?.mode === 'strict-visual-workflow'
}
function selectedStrictVisualPublicResearch(content: unknown): boolean | null {
  const text = textFromToolResultContent(content)
  if (!/User has answered your questions:/i.test(text) || !/\binspiration_sources\b/i.test(text)) return null
  const normalized = text.toLowerCase()
  if (/(?:涓嶄娇鐢▅涓嶇爺绌秥鏃犻渶澶栭儴|鏃犻渶鍙傝€億no external|without external|do not research|none)/i.test(normalized)) return false
  if (/(?:鍐呯疆|builtin|鎵╁睍|extend|鍏佽.*(?:鐮旂┒|缃戦〉)|public.*research|research.*public)/i.test(normalized)) return true
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
    if (/expert_research_delivery|research-delivery:|璇佹嵁缂哄彛.{0,40}(?:浜や粯|鎶ュ憡)|accept_current_scope/i.test(serialized)) {
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
  if (
    toolName === 'image_generation'
    && typeof toolUseId === 'string'
    && /(?:"|')operation(?:"|')\s*:\s*(?:"|')generate(?:"|')/i.test(inputText)
  ) {
    streamState.strictVisualImageGenerationToolUseIds.add(toolUseId)
  }
  if (toolName === 'AskUserQuestion' && typeof toolUseId === 'string' && inputRequestsStrictVisualInspirationSources(inputText)) {
    // A valid card is now on the path to the user. Do not trigger the same
    // recovery again when the answer resumes the model; re-arm only if the
    // tool result reports that this exact card failed.
    streamState.strictVisualInspirationQuestionToolUseIds.add(toolUseId)
    streamState.strictVisualInspirationSourceDecisionRequired = false
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
    // 鈥渢hird-site鈥?violation; evaluate only a complete URL or search request.
    const hasCompleteReferenceTarget = referenceTargetUrl !== null
      || /(?:\"|')?url(?:\"|')?\s*:/i.test(inputText)
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
    for (const imagePath of streamState.strictVisualGeneratedImagePathsByToolUseId.values()) {
      if (readTargetsStrictVisualGeneratedImage(inputText, imagePath)) {
        streamState.strictVisualGeneratedImageReadPathsByToolUseId.set(toolUseId, imagePath)
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
  if (typeof toolUseId === 'string' && input && typeof input === 'object') {
    const toolInput = input as Record<string, unknown>
    const fidelities = prototypeWrittenFidelities(toolName, toolInput)
    const receipt = toolName === 'Write' && typeof toolInput.file_path === 'string'
      && /(?:^|\/)prototype-evidence\.md$/i.test(normalizedStrictVisualPath(toolInput.file_path))
      && typeof toolInput.content === 'string' ? toolInput.content : undefined
    if (fidelities.length || receipt !== undefined) {
      streamState.prototypeWritesByToolUseId.set(toolUseId, {
        fidelities, receipt, writeCount: streamState.prototypeHighFidelityWriteCount,
      })
    }
    if (toolName === 'Bash' && typeof toolInput.command === 'string') {
      const screenshots = prototypeScreenshotsFromRendererCommand(toolInput.command)
      if (screenshots.length) streamState.prototypeQaRendererViewportByToolUseId.set(toolUseId, {
        writeCount: streamState.prototypeHighFidelityWriteCount, screenshots,
      })
    }
    if (toolName === PROTOTYPE_PREVIEW_TOOL) {
      streamState.prototypePreviewAttempts.set(toolUseId, { writeCount: streamState.prototypeHighFidelityWriteCount, fidelity: String(toolInput.fidelity || 'high') })
    }
    if (toolName === 'Read' && typeof toolInput.file_path === 'string') {
      const preview = streamState.prototypePreviewReceipt?.screenshots.find(shot => normalizedStrictVisualPath(shot.path) === normalizedStrictVisualPath(toolInput.file_path as string))
      const screenshot = preview ? { viewport: preview.viewport, path: normalizedStrictVisualPath(preview.path) } : prototypeScreenshotFromPath(toolInput.file_path)
      if (screenshot) streamState.prototypeQaReadViewportByToolUseId.set(toolUseId, {
        ...screenshot, preview, writeCount: streamState.prototypeHighFidelityWriteCount,
        rendered: streamState.prototypeQaRenderedPaths.has(screenshot.path),
      })
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

function generatedImagePathFromToolResult(content: unknown): string | null {
  const text = textFromToolResultContent(content)
  const match = /(?:^|\n)Image:\s*(.+?\.(?:png|jpe?g|webp))\s*(?:\r?\n|$)/i.exec(text)
  return match?.[1]?.trim() || null
}

function imageGenerationToolResultSucceeded(content: unknown): boolean {
  const text = textFromToolResultContent(content)
  return /(?:^|\n)Image generation status:\s*generated\.\s*(?:\r?\n|$)/i.test(text)
}

function readTargetsStrictVisualGeneratedImage(inputText: string, imagePath: string): boolean {
  try {
    const input = JSON.parse(inputText)
    return typeof input.file_path === 'string' && normalizeStrictVisualImagePath(input.file_path) === normalizeStrictVisualImagePath(imagePath)
  } catch { return false }
}

function latestStrictVisualGeneratedImagePath(streamState: SessionStreamState): string | null {
  return Array.from(streamState.strictVisualGeneratedImagePathsByToolUseId.values()).at(-1) || null
}

function hasStrictVisualGeneratedImageReviewPreview(streamState: SessionStreamState): boolean {
  const latestImagePath = latestStrictVisualGeneratedImagePath(streamState)
  return latestImagePath !== null && streamState.strictVisualGeneratedImageReadPaths.has(latestImagePath)
}

function hasStrictVisualGeneratedImageReviewReceipt(text: string): boolean {
  const normalized = text.toLowerCase()
  return [
    'taste-redesign',
    'impeccable-visual-refinement',
    'ui-craft-critique',
    'ui-craft-finalize',
    'source-fidelity-final-pass',
  ].every((skill) => normalized.includes(skill))
    && /(?:visual-register|visual register|视觉基调|视觉人格)/i.test(text)
    && /(?:removed|remove:|删除|移除|删去)/i.test(text)
    && /(?:source-fidelity|source fidelity|源图保真|事实核对|duplicate scan|重复文本)/i.test(text)
    && /(?:image_generation|image generation|generated image|真实生图|生成图像)/i.test(text)
}

function recordFailedAskUserQuestionToolResult(
  streamState: SessionStreamState,
  toolResult: { tool_use_id?: unknown; is_error?: unknown },
): void {
  if (toolResult.is_error !== true || typeof toolResult.tool_use_id !== 'string') return
  streamState.failedAskUserQuestionToolUseIds.add(toolResult.tool_use_id)
  if (streamState.strictVisualInspirationQuestionToolUseIds.has(toolResult.tool_use_id)) {
    // The UI never received a usable source-scope card, so force the next
    // strict visual model turn to issue it again rather than treating it as a
    // user decision.
    streamState.strictVisualInspirationSourceDecisionRequired = true
  }
}

const EXPERT_TEMPLATE_FILL_VALIDATION_ERROR_CODES = [
  'EXPERT_TEMPLATE_FILL_RENDER_FAILED',
  'EXPERT_RESEARCH_EVIDENCE_ABSORPTION_REQUIRED',
  'EXPERT_RESEARCH_AUDIT_REFERENCE_REQUIRED',
  'EXPERT_FINAL_SOURCE_COVERAGE_REQUIRED',
] as const

export function isDeterministicExpertTemplateFillValidationFailure(content: unknown): boolean {
  const resultText = textFromToolResultContent(content)
  return EXPERT_TEMPLATE_FILL_VALIDATION_ERROR_CODES.some((code) => resultText.includes(code))
}

function recordExpertTemplateFillValidationFailure(
  streamState: SessionStreamState,
  toolResult: { is_error?: unknown; content?: unknown },
): void {
  if (toolResult.is_error !== true) return
  if (isDeterministicExpertTemplateFillValidationFailure(toolResult.content)) {
    // Keep this fact through any follow-up assistant messages in the same user
    // turn. A tool failure is not missing product information and must never be
    // converted into a new AskUserQuestion card.
    streamState.expertTemplateFillValidationFailure = true
  }
}

function recordStrictVisualQaToolResult(
  streamState: SessionStreamState,
  toolResult: { tool_use_id?: unknown; is_error?: unknown; content?: unknown },
): void {
  if (typeof toolResult.tool_use_id !== 'string') return

  if (streamState.strictVisualInspirationQuestionToolUseIds.has(toolResult.tool_use_id) && !toolResult.is_error) {
    // Record the selected public-research requirement. The pending choice was
    // cleared when its card was emitted; a failed result re-arms it above.
    const requiresResearch = selectedStrictVisualPublicResearch(toolResult.content)
    if (requiresResearch !== null) streamState.strictVisualReferenceResearchRequired = requiresResearch
  }

  recordPrototypeToolResult(streamState, {
    tool_use_id: toolResult.tool_use_id,
    is_error: Boolean(toolResult.is_error),
    content: toolResult.content,
  })
  const previewPath = streamState.strictVisualGeneratedImageReadPathsByToolUseId.get(toolResult.tool_use_id)
  if (previewPath) {
    if (toolResult.is_error || !toolResultContainsImage(toolResult.content)) streamState.strictVisualGeneratedImageFailedReadPaths.add(previewPath)
    else streamState.strictVisualGeneratedImageFailedReadPaths.delete(previewPath)
  }
  if (toolResult.is_error) return
  if (streamState.strictVisualImageGenerationToolUseIds.has(toolResult.tool_use_id) && imageGenerationToolResultSucceeded(toolResult.content)) {
    // A generated PNG can exceed the inline response limit. Record the tool
    // result path even when the tool returns text only; the later Read result
    // must still contain an image block before this becomes final evidence.
    const imagePath = generatedImagePathFromToolResult(toolResult.content)
    if (imagePath) {
      streamState.strictVisualGeneratedImagePathsByToolUseId.set(toolResult.tool_use_id, imagePath)
      streamState.strictVisualGeneratedImageReadPaths.delete(imagePath)
      streamState.strictVisualGeneratedImageReviewText = ''
    }
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
  const generatedImageReadPath = streamState.strictVisualGeneratedImageReadPathsByToolUseId.get(toolResult.tool_use_id)
  if (generatedImageReadPath && toolResultContainsImage(toolResult.content)) {
    streamState.strictVisualGeneratedImageReadPaths.add(generatedImageReadPath)
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

function recordPrototypeToolResult(
  streamState: SessionStreamState,
  result: { tool_use_id: string; is_error?: boolean; content?: unknown },
): void {
  const previewAttempt = streamState.prototypePreviewAttempts.get(result.tool_use_id)
  streamState.prototypePreviewAttempts.delete(result.tool_use_id)
  const write = streamState.prototypeWritesByToolUseId.get(result.tool_use_id)
  const render = streamState.prototypeQaRendererViewportByToolUseId.get(result.tool_use_id)
  const read = streamState.prototypeQaReadViewportByToolUseId.get(result.tool_use_id)
  streamState.prototypeWritesByToolUseId.delete(result.tool_use_id)
  streamState.prototypeQaRendererViewportByToolUseId.delete(result.tool_use_id)
  streamState.prototypeQaReadViewportByToolUseId.delete(result.tool_use_id)
  if (result.is_error) return
  if (write) {
    for (const fidelity of write.fidelities) {
      streamState.prototypeFidelityHtmlPaths.add(fidelity)
      if (fidelity !== 'high') continue
      const previous = streamState.prototypeHighFidelityWriteCount
      if (previous > 0 && streamState.prototypeHighFidelityLastReadWriteCount === previous) {
        streamState.prototypeHighFidelityRevisionAfterImageReview = true
      }
      streamState.prototypeHighFidelityWriteCount += 1
      streamState.prototypeHighFidelityLastReadWriteCount = null
      streamState.prototypePreviewReceipt = null
      streamState.prototypePreviewReadPaths.clear()
      streamState.prototypeQaRenderedViewports.clear()
      streamState.prototypeQaRenderedPaths.clear()
      streamState.prototypeQaReadViewports.clear()
      streamState.prototypeEvidenceReceipt = ''
      streamState.prototypeReviewAssistantText = ''
    }
    if (write.receipt !== undefined && write.writeCount === streamState.prototypeHighFidelityWriteCount) {
      streamState.prototypeEvidenceReceipt = write.receipt
    }
  }
  if (previewAttempt?.fidelity === 'high' && previewAttempt.writeCount > 0 && previewAttempt.writeCount === streamState.prototypeHighFidelityWriteCount) {
    const receipt = parsePrototypePreviewReceipt(textFromToolResultContent(result.content))
    if (receipt?.fidelity === 'high' && !receipt.screenId && /(?:^|[\/])03-high-fidelity\.html$/i.test(receipt.source.path.replaceAll('\\', '/'))) {
      streamState.prototypePreviewReceipt = receipt
      streamState.prototypePreviewReadPaths.clear()
      streamState.prototypeQaRenderedPaths.clear()
      streamState.prototypeQaRenderedViewports.clear()
      streamState.prototypeQaReadViewports.clear()
      for (const shot of receipt.screenshots) {
        streamState.prototypeQaRenderedPaths.add(normalizedStrictVisualPath(shot.path))
        streamState.prototypeQaRenderedViewports.add(shot.viewport)
      }
    }
  }
  if (render && render.writeCount > 0 && render.writeCount === streamState.prototypeHighFidelityWriteCount) {
    const paths = prototypeSuccessfulScreenshotPaths(result.content)
    for (const screenshot of render.screenshots) {
      if (!paths.has(screenshot.path)) continue
      streamState.prototypeQaRenderedViewports.add(screenshot.viewport)
      streamState.prototypeQaRenderedPaths.add(screenshot.path)
    }
  }
  if (read && read.rendered && read.writeCount > 0
    && read.writeCount === streamState.prototypeHighFidelityWriteCount
    && streamState.prototypeQaRenderedPaths.has(read.path)
    && (read.preview ? imageMatchesPreview(result.content, read.preview) : toolResultContainsImage(result.content))) {
    if (read.preview) streamState.prototypePreviewReadPaths.add(read.path)
    streamState.prototypeQaReadViewports.add(read.viewport)
    streamState.prototypeHighFidelityLastReadWriteCount = read.writeCount
  }
}

function resetStrictVisualQaEvidence(streamState: SessionStreamState): void {
  streamState.wroteStrictVisualHtml = false
  streamState.strictVisualHtmlWriteCount = 0
  streamState.completedStrictVisualQa = false
  streamState.strictVisualRendererSuccessCount = 0
  streamState.visualQaRendererToolUseIds.clear()
  streamState.strictVisualPngReadToolUseIds.clear()
  streamState.strictVisualImageGenerationToolUseIds.clear()
  streamState.strictVisualGeneratedImagePathsByToolUseId.clear()
  streamState.strictVisualGeneratedImageReadPathsByToolUseId.clear()
  streamState.strictVisualGeneratedImageFailedReadPaths.clear()
  streamState.strictVisualGeneratedImageReadPaths.clear()
  streamState.strictVisualGeneratedImageReviewText = ''
  streamState.strictVisualLastImageReviewHtmlWriteCount = null
  streamState.strictVisualUnsupportedPriceAnalogyDetected = false
  streamState.strictVisualUnsafeAbsolutePlanBadgeDetected = false
  streamState.strictVisualGeneratedSemanticPseudoTextDetected = false
  streamState.strictVisualMisleadingPaymentCodeDetected = false
  streamState.strictVisualProcessDisclaimerDetected = false
  streamState.strictVisualFinalReviewRequired = false
  streamState.strictVisualReferenceResearchRequired = false
  streamState.strictVisualInspirationSourceDecisionRequired = false
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
  streamState.prototypeFidelityHtmlPaths.clear()
  streamState.prototypeHighFidelityWriteCount = 0
  streamState.prototypeHighFidelityLastReadWriteCount = null
  streamState.prototypeHighFidelityRevisionAfterImageReview = false
  streamState.prototypeWritesByToolUseId.clear()
  streamState.prototypeEvidenceReceipt = ''
  streamState.prototypeReviewAssistantText = ''
  streamState.prototypePreviewReceipt = null
  streamState.prototypePreviewAttempts.clear()
  streamState.prototypePreviewReadPaths.clear()
  streamState.prototypeQaRenderedPaths.clear()
  streamState.prototypeQaRendererViewportByToolUseId.clear()
  streamState.prototypeQaRenderedViewports.clear()
  streamState.prototypeQaReadViewportByToolUseId.clear()
  streamState.prototypeQaReadViewports.clear()
  streamState.prototypeRenderRecoveryAttempts = 0
  streamState.prototypeReviewRecoveryAttempts = 0
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
  if (validationToolName) {
    streamState.workflowProtocolInputValidationError = validationToolName
    streamState.workflowProtocolInputValidationDetail = typeof toolResult.content === 'string'
      ? toolResult.content.slice(0, 4_000)
      : undefined
  }
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
  if (validationToolName) {
    streamState.workflowProtocolInputValidationError = validationToolName
    streamState.workflowProtocolInputValidationDetail = text.slice(0, 4_000)
  }
}

function workflowInteractionTurnForResult(sessionId: string): WorkflowInteractionTurn {
  const streamState = getStreamState(sessionId)
  const hasStrictVisualGeneratedImage = streamState.strictVisualGeneratedImagePathsByToolUseId.size > 0
  const generatedImageReviewPreviewRead = hasStrictVisualGeneratedImageReviewPreview(streamState)
  const visualReviewFailureReasons = (hasStrictVisualGeneratedImage
    ? [
        generatedImageReviewPreviewRead
          ? null
          : 'the final generated image was not Read as a bounded visual preview',
        hasStrictVisualGeneratedImageReviewReceipt(streamState.assistantText)
          ? null
          : 'the final generated-image review receipt is incomplete',
      ]
    : [
        streamState.strictVisualRendererSuccessCount < 2 ? 'two successful local renderer runs were not recorded' : null,
        streamState.strictVisualHtmlWriteCount < 2 ? 'a complete HTML revision was not recorded after visual review' : null,
        streamState.strictVisualLastImageReviewHtmlWriteCount !== streamState.strictVisualHtmlWriteCount ? 'the latest HTML revision was not read back as a rendered PNG image' : null,
        streamState.strictVisualUnsupportedPriceAnalogyDetected ? 'unsupported lifestyle price analogy remains in the latest complete HTML write' : null,
        streamState.strictVisualUnsafeAbsolutePlanBadgeDetected ? 'an absolute-positioned plan badge can overlap a tier label or price' : null,
        streamState.strictVisualGeneratedSemanticPseudoTextDetected ? 'CSS pseudo-elements inject semantic user-facing text' : null,
        streamState.strictVisualMisleadingPaymentCodeDetected ? 'a fake QR/barcode-like payment pattern remains in the latest complete HTML write' : null,
        streamState.strictVisualProcessDisclaimerDetected ? 'a prototype/process disclaimer remains in the customer-facing HTML' : null,
        hasStrictVisualReviewReceipt(streamState.assistantText) ? null : 'the final visual-review receipt is incomplete',
      ]
  ).filter((reason): reason is string => Boolean(reason))
  const wrotePrototypeHtml = streamState.prototypeFidelityHtmlPaths.size > 0
  const hasAllPrototypeFidelityHtml = (['low', 'mid', 'high'] as PrototypeFidelity[])
    .every((fidelity) => streamState.prototypeFidelityHtmlPaths.has(fidelity))
  const completedPrototypeViewportQa = (['desktop', 'tablet', 'mobile'] as PrototypeQaViewport[])
    .every((viewport) => streamState.prototypeQaRenderedViewports.has(viewport) && streamState.prototypeQaReadViewports.has(viewport))
  const prototypeVisualQualityFailureReasons = [
    hasAllPrototypeFidelityHtml ? null : '01-low-fidelity.html, 02-mid-fidelity.html, and 03-high-fidelity.html were not all written',
    completedPrototypeViewportQa ? null : 'all required high-fidelity 1440/1024/390 PNGs were not both rendered and Read as images',
    streamState.prototypeHighFidelityRevisionAfterImageReview ? null : '03-high-fidelity.html was not revised after the first image review',
    streamState.prototypeHighFidelityLastReadWriteCount === streamState.prototypeHighFidelityWriteCount
      ? null
      : 'the latest high-fidelity HTML revision was not Read back as rendered PNG images',
    hasPrototypeVisualReviewReceipt(streamState.prototypeReviewAssistantText) || hasPrototypeVisualReviewReceipt(streamState.prototypeEvidenceReceipt)
      ? null : 'the prototype visual-review receipt is incomplete',
  ].filter((reason): reason is string => Boolean(reason))

  return {
    assistantText: streamState.assistantText.trim(),
    usedAskUserQuestion: streamState.usedAskUserQuestion,
    expertTemplateFillValidationFailure: streamState.expertTemplateFillValidationFailure,
    strictVisualIntroductionTurn: streamState.strictVisualIntroductionTurn,
    strictVisualFinalReviewRequired: streamState.strictVisualFinalReviewRequired,
    hasStrictVisualGeneratedImage,
    wroteStrictVisualHtml: streamState.wroteStrictVisualHtml,
    completedStrictVisualQa: streamState.completedStrictVisualQa,
    completedStrictVisualReview: visualReviewFailureReasons.length === 0,
    visualReviewFailureReasons,
    wrotePrototypeHtml,
    prototypeDeliveryRequested: streamState.prototypeDeliveryRequested,
    hasAllPrototypeFidelityHtml,
    completedPrototypeViewportQa,
    completedPrototypeVisualReview: prototypeVisualQualityFailureReasons.length === 0,
    prototypeVisualQualityFailureReasons,
    prototypeAskUserQuestionRecoveryAttempts: streamState.prototypeAskUserQuestionRecoveryAttempts,
    prototypeRenderRecoveryAttempts: streamState.prototypeRenderRecoveryAttempts,
    prototypeReviewRecoveryAttempts: streamState.prototypeReviewRecoveryAttempts,
    strictVisualReferenceResearchRequired: streamState.strictVisualReferenceResearchRequired,
    strictVisualInspirationSourceDecisionRequired: streamState.strictVisualInspirationSourceDecisionRequired,
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
  streamState.expertTemplateFillValidationFailure = false
  streamState.strictVisualIntroductionTurn = false
  streamState.workflowProtocolToolRegistryError = undefined
  resetStrictVisualQaEvidence(streamState)
  if (resetRecoveryAttempts) streamState.structuredInteractionRecoveryAttempts = 0
  if (resetRecoveryAttempts) streamState.expertResearchDeliveryRecoveryAttempts = 0
  if (resetRecoveryAttempts) streamState.commercializationResearchQuestionRecoveryAttempts = 0
  streamState.expertResearchDeliveryCardAttempted = false
  if (resetBindingRecoveryAttempts) streamState.workflowProtocolBindingRecoveryAttempts = 0
  if (resetInputValidationRecoveryAttempts) {
    streamState.workflowProtocolInputValidationError = undefined
    streamState.workflowProtocolInputValidationDetail = undefined
    streamState.workflowProtocolInputRecoveryAttempts = 0
  }
}

function assistantTextRequestsUserDecision(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  const hasQuestionSignal = /[?？]/.test(normalized)
  const hasDecisionLanguage = /(?:要我|还是|请选择|请确认|告诉我|你想|需要我|是否|需不需要|下一步|怎么做|would you like|do you want|should i|which (?:option|one)|please (?:choose|confirm|tell)|let me know|what would you like)/i.test(normalized)
  return hasQuestionSignal && hasDecisionLanguage
}
function assistantTextRequestsCommercializationUserInput(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false

  // Only recover an actual request for the user's information. Statements about
  // public evidence, future research, or an internal uncertainty must remain
  // normal model turns and must not become a forced card.
  const directImperativeRequest = /请(?:直接|先|再|用.{0,24})?(?:澄清|确认|补充|说明|回答|选择|提供|告诉我|回复|描述|粘贴|上传)/i.test(normalized)
  return assistantTextRequestsUserDecision(normalized) || directImperativeRequest || /(?:我(?:还)?需要(?:你|您).{0,24}(?:澄清|确认|补充|说明|回答|选择|提供)|(?:我|还)?需要(?:你|您)?(?:先)?(?:澄清|确认|补充).{0,20}(?:关键信息|关键点|情况|细节|材料)|在(?:开始|启动|继续).{0,40}(?:之前|前).{0,36}(?:需要|需).{0,16}(?:澄清|确认|补充|说明|回答|选择|提供)|请(?:你|您).{0,20}(?:澄清|确认|补充|说明|回答|选择|提供|告诉我|回复)|(?:需要|需).{0,24}(?:用户|你|您).{0,24}(?:回答|确认|补充|选择|提供)|(?:i|we).{0,24}(?:need|require).{0,48}(?:your input|you to|clarif|confirm|more (?:information|detail))|(?:please|could you).{0,30}(?:clarif|confirm|provide|tell|choose))/i.test(normalized)
}

function isStrictVisualIntroductionRequest(text: string): boolean {
  const normalized = text.trim()
  if (!normalized || normalized.length > 240) return false

  const identifiesThisExpert = /(?:ui\s*\/?\s*ux|\u8bbe\u8ba1\u7cfb\u7edf\u4e13\u5bb6|\u4e13\u5bb6)/i.test(normalized)
  const asksCapabilities = /(?:\u4ecb\u7ecd(?:\u4e00\u4e0b)?|\u4f60\u80fd\u505a\u4ec0\u4e48|\u4f60\u53ef\u4ee5\u505a\u4ec0\u4e48|\u4f60(?:\u80fd|\u53ef\u4ee5).{0,12}\u5e2e\u6211\u505a\u4ec0\u4e48|\u6709\u54ea\u4e9b\u80fd\u529b)/i.test(normalized)
  const englishCapabilityIntro = /(?:introduce (?:yourself|.*(?:ui\s*\/?\s*ux|design system expert))|what can you (?:do|help (?:me )?with)|how can you help me)/i.test(normalized)

  return (identifiesThisExpert && asksCapabilities) || englishCapabilityIntro
}

export function assistantTextPresentsMultipleDesignDirections(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  const labeledDirections = normalized.match(/(?:方向|方案|路线|direction|concept)\s*(?:[一二三四五六七八九十A-Da-d]|\d+)/gi) ?? []
  if (labeledDirections.length >= 2) return true
  const numberedLines = normalized.match(/(?:^|\n)\s*(?:[1-4]|[A-D])[.、:：)）]/gim) ?? []
  return numberedLines.length >= 2 && /(?:方向|方案|设计|视觉|direction|concept|design)/i.test(normalized)
}

export function assistantTextRequestsStrictVisualBoundedDecision(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  if (/(?:已选|已经选择|选定|已确认).{0,12}(?:方向|方案)|(?:方向|方案).{0,12}(?:已选|已经选择|选定|已确认)|(?:selected|confirmed).{0,20}(?:direction|concept)/i.test(normalized)) return false

  // Narrative context is allowed. Intercept only an explicit, bounded user decision.
  const explicitBoundedInstruction = /(?:请选择|请确认|二选一|选项\s*[A-D]|方案\s*[A-D]|方向\s*[A-D]|please\s+(?:choose|confirm)|choose\s+(?:options?\s*)?[A-D])/i.test(normalized)
  const questionDecision = /[?？]/.test(normalized)
    && /(?:还是|是否|需不需要|要不要|would you like|do you want|should i|which (?:option|one)|please (?:choose|confirm))/i.test(normalized)

  return explicitBoundedInstruction || questionDecision
}
async function strictVisualTerminalRecoveryForResult(
  sessionId: string,
  turn: WorkflowInteractionTurn,
): Promise<StrictVisualTerminalRecovery | null> {
  if (hasPendingAskUserQuestion(sessionId)) return null

  const transcript = await sessionService.getSession(sessionId).catch(() => null)
  const transcriptExpert = transcript?.expert
  const expert = transcriptExpert ?? await expertRuntimeSessionStore.get(sessionId)
  if (
    !hasActiveExpertRuntime(expert)
    || expert.runtimeBinding.runtimePolicy?.mode !== 'strict-visual-workflow'
  ) {
    return null
  }
  const imageOnly = isUiuxImageOnlyBinding(expert.runtimeBinding)
  const historical = imageOnly ? collectUiuxImageEvidence(transcript?.messages ?? []) : null
  if (turn.usedAskUserQuestion && (!imageOnly || (!turn.hasStrictVisualGeneratedImage && !turn.wroteStrictVisualHtml))) return null
  if (historical?.stopped) return null
  const referenceScopeSatisfied = historical?.scope === 'none'
    || (historical?.scope === 'public' && historical.sources.length >= historical.minimumReferences && historical.referenceReceipt)
  if (turn.strictVisualInspirationSourceDecisionRequired && !historical?.scope) {
    return { kind: 'inspiration-source', expertId: expert.expertId }
  }
  if (turn.strictVisualReferenceResearchRequired && !turn.completedStrictVisualReferenceResearch && !referenceScopeSatisfied
    && !(imageOnly && (turn.hasStrictVisualGeneratedImage || historical?.latestImage))) {
    return { kind: 'visual-reference-research', expertId: expert.expertId, imageOnly: isUiuxImageOnlyBinding(expert.runtimeBinding) }
  }
  if (isUiuxImageOnlyBinding(expert.runtimeBinding)) {
    if (turn.strictVisualIntroductionTurn) return null
    if (!historical?.direction && assistantTextPresentsMultipleDesignDirections(turn.assistantText)) return { kind: 'design-direction', expertId: expert.expertId }
    if (assistantTextRequestsStrictVisualBoundedDecision(turn.assistantText)) return { kind: 'ask-user-question', expertId: expert.expertId }
    const state = getStreamState(sessionId)
    const latestAttempt = Array.from(state.strictVisualImageGenerationToolUseIds).at(-1)
    if (latestAttempt && !state.strictVisualGeneratedImagePathsByToolUseId.has(latestAttempt)) {
      return { kind: 'image-generation', expertId: expert.expertId, imageOnly: true, imageGenerationFailed: true }
    }
    if (turn.wroteStrictVisualHtml || turn.hasStrictVisualGeneratedImage || turn.strictVisualFinalReviewRequired) {
      if (!turn.hasStrictVisualGeneratedImage && !historical?.latestImage) return { kind: 'image-generation', expertId: expert.expertId, imageOnly: true }
      const latestImagePath = latestStrictVisualGeneratedImagePath(state) ?? historical?.latestImage ?? undefined
      const historicalPreviewRead = latestImagePath === historical?.latestImage && historical?.latestImageRead
      const reviewText = latestStrictVisualGeneratedImagePath(state)
        ? state.strictVisualGeneratedImageReviewText
        : historicalPreviewRead ? turn.assistantText : ''
      const receipt = validateUiuxImageReview(reviewText, latestImagePath)
      if (!(hasStrictVisualGeneratedImageReviewPreview(state) || historicalPreviewRead) || !receipt.valid) {
        return { kind: 'image-generation-review', expertId: expert.expertId, imageOnly: true, latestImagePath,
          imagePreviewFailed: Boolean(latestImagePath && (state.strictVisualGeneratedImageFailedReadPaths.has(latestImagePath) || (latestImagePath === historical?.latestImage && historical?.latestReadFailed))),
          imagePreviewRead: hasStrictVisualGeneratedImageReviewPreview(state) || Boolean(historicalPreviewRead), visualReviewFailureReasons: receipt.errors }
      }
    }
    return null
  }
  if (turn.wroteStrictVisualHtml && !turn.completedStrictVisualQa) {
    return { kind: 'render-qa', expertId: expert.expertId }
  }
  const finalDeliveryClaimed = /(?:宸插畬鎴恷宸蹭氦浠榺瀹屾垚瑙嗚绋縷瀹屾垚璁捐|final(?:ized)?|delivered?|completed)/i.test(turn.assistantText)
  if (turn.strictVisualFinalReviewRequired && finalDeliveryClaimed && !turn.wroteStrictVisualHtml && !turn.hasStrictVisualGeneratedImage) {
    return { kind: 'image-generation', expertId: expert.expertId }
  }
  if (
    (turn.wroteStrictVisualHtml || turn.hasStrictVisualGeneratedImage || (turn.strictVisualFinalReviewRequired && finalDeliveryClaimed))
    && !turn.completedStrictVisualReview
  ) {
    return {
      kind: turn.hasStrictVisualGeneratedImage ? 'image-generation-review' : 'visual-review',
      expertId: expert.expertId,
      visualReviewFailureReasons: turn.visualReviewFailureReasons,
    }
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

function hasPrototypeVisualReviewReceipt(text: string): boolean {
  const normalized = text.toLowerCase()
  return /<prototype-visual-review-receipt>/i.test(text)
    && ['prototype-fidelity-workflow', 'prototype-visual-quality-gate', 'frontend-design'].every((skill) => normalized.includes(skill))
    && /(?:visual register|visual-register|视觉基调|视觉方案)/i.test(text)
    && /(?:first render|first-render|首次截图|首(?:版|轮)(?:截图)?问题)/i.test(text)
    && /(?:revised|revision|changed|fixed|修改|修订|调整)/i.test(text)
    && /(?:1440|desktop|桌面)/i.test(text)
    && /(?:1024|tablet|平板)/i.test(text)
    && /(?:390|mobile|手机)/i.test(text)
    && /(?:viewport|视口)/i.test(text)
}


function userRequestsPrototypeArtifactDelivery(text: string, attachments: unknown[]): boolean {
  const normalized = text.trim()
  if (!normalized) return attachments.length > 0

  // “介绍一下原型图demo，你可以帮我做什么” is a capability question, not a
  // request to write three files. A concrete product/topic or page request is.
  const mentionsThisExpert = /(?:原型图\s*demo|原型图|这个专家)/i.test(normalized)
  const asksCapabilities = /(?:介绍(?:一下)?|说说|讲讲|展示|功能|能力|能(?:帮我)?做什么|可以(?:帮我)?做什么|能做哪些|有什么用)/i.test(normalized)
  if (mentionsThisExpert && asksCapabilities) return false

  if (/(?:生成|制作|创建|设计|开发|写(?:出)?|做(?:一个|成)?|搭建|原型|html|网页|页面|落地页|demo|产品)/i.test(normalized)) return true
  // In this Expert, a short noun phrase after capability intake is the common
  // way users name the product they want prototyped, e.g. “AI 老照片修复”.
  return normalized.length <= 80 && !/[?？]/.test(normalized)
}

function assistantTextRequestsPrototypeAskUserQuestion(text: string): boolean {
  const normalized = text.trim()
  if (!normalized || !/\bAskUserQuestion\b/i.test(normalized)) return false

  // This catches an execution monologue such as “Must ask approval via
  // AskUserQuestion” without turning ordinary user-facing prose into a card.
  return /\b(?:must|required|need(?:s)?|should|have\s+to)\b.{0,96}\b(?:ask|use|call)\b.{0,96}\bAskUserQuestion\b/i.test(normalized)
    || /\bAskUserQuestion\b.{0,96}\b(?:must|required|need(?:s)?|should|have\s+to|approval|confirm(?:ation)?|choice|selection)\b/i.test(normalized)
}

async function prototypeVisualTerminalRecoveryForResult(
  sessionId: string,
  turn: WorkflowInteractionTurn,
): Promise<PrototypeVisualTerminalRecovery | null> {
  if (turn.usedAskUserQuestion || hasPendingAskUserQuestion(sessionId)) return null

  if (!await isPrototypeVisualRuntimeActive(sessionId)) return null
  const transcriptExpert = (await sessionService.getSession(sessionId).catch(() => null))?.expert
  const expert = transcriptExpert ?? await expertRuntimeSessionStore.get(sessionId)
  if (!hasActiveExpertRuntime(expert) || expert.runtimeBinding.runtimePolicy?.mode !== 'prototype-visual-workflow') return null
  const requestedPrototypeDecisionInProse = assistantTextRequestsPrototypeAskUserQuestion(turn.assistantText)
    || assistantTextPresentsMultipleDesignDirections(turn.assistantText)
    || assistantTextRequestsStrictVisualBoundedDecision(turn.assistantText)
  if (!turn.wrotePrototypeHtml && requestedPrototypeDecisionInProse) {
    return { kind: 'prototype-ask-user-question', expertId: expert.expertId }
  }
  if (!turn.wrotePrototypeHtml && turn.prototypeDeliveryRequested) {
    return {
      kind: 'prototype-production',
      expertId: expert.expertId,
      failureReasons: ['the confirmed prototype brief ended without any required HTML artifact'],
    }
  }
  if (!turn.wrotePrototypeHtml) return null
  if (!turn.hasAllPrototypeFidelityHtml) {
    return { kind: 'prototype-production', expertId: expert.expertId, failureReasons: turn.prototypeVisualQualityFailureReasons }
  }
  if (expert.runtimeBinding.runtimePolicy.allowedToolNames.includes(PROTOTYPE_PREVIEW_TOOL)) {
    const state = getStreamState(sessionId)
    const receipt = state.prototypePreviewReceipt
    const failures: string[] = []
    if (!receipt) failures.push('尚未登记当前 HTML 的 PrototypePreview 回执；shell 命令成功不等于截图完成')
    else {
      const workDir = conversationService.getSessionWorkDir(sessionId)
      if (!workDir) failures.push('无法取得当前会话目录，不能核验最终文件')
      else failures.push(...await validatePrototypePreviewFiles(receipt, workDir).catch(() => ['无法读取预览证据目录']))
      for (const shot of receipt.screenshots) {
        if (!state.prototypePreviewReadPaths.has(normalizedStrictVisualPath(shot.path))) failures.push(shot.viewport + ' 截图尚未以匹配哈希的图片读取；可能读到旧图或文本结果')
        failures.push(...shot.issues.map(issue => shot.viewport + ': ' + issue))
      }
      if (receipt.blockedResources.length) failures.push('本地预览缺少资源：' + receipt.blockedResources.join(', '))
      if (receipt.status === 'needs-work' && !failures.length) failures.push('预览工具报告 NEEDS WORK，不能用文字覆盖')
    }
    if (failures.length) return { kind: 'prototype-render-qa', expertId: expert.expertId, failureReasons: failures }
  }
  if (!turn.completedPrototypeViewportQa) {
    return { kind: 'prototype-render-qa', expertId: expert.expertId, failureReasons: turn.prototypeVisualQualityFailureReasons }
  }
  if (!turn.completedPrototypeVisualReview) {
    return { kind: 'prototype-visual-review', expertId: expert.expertId, failureReasons: turn.prototypeVisualQualityFailureReasons }
  }
  return null
}

function buildPrototypeVisualTerminalRecoveryInstruction(
  recovery: PrototypeVisualTerminalRecovery,
): string {
  const shared = [
    'This is a server-enforced prototype visual-quality workflow for Expert ' + recovery.expertId + '.',
    'Keep every written artifact in the active session workDir. Do not start a web server, deploy files, or use Playwright on file URLs.',
  ]
  if (recovery.kind === 'prototype-ask-user-question') {
    return [
      '<prototype-visual-ask-user-question-recovery>',
      'The prior response requested a user choice or confirmation in prose instead of calling AskUserQuestion.',
      'Immediately call AskUserQuestion with exactly one bounded confirmation question and 2-3 stable, mutually exclusive choices. Reuse the approval/choice already described in the prior response; do not invent a different decision.',
      'Until the AskUserQuestion tool call is emitted, do not output prose, end the turn, write HTML, or call another tool.',
      ...shared,
      '</prototype-visual-ask-user-question-recovery>',
    ].join('\n')
  }
  if (recovery.kind === 'prototype-production') {
    return [
      '<prototype-visual-production-recovery>',
      'The prototype delivery has a confirmed brief but did not write all three required files: 01-low-fidelity.html, 02-mid-fidelity.html, and 03-high-fidelity.html.',
      'Do not summarize the plan again. Immediately write prototype-brief.md and finish the missing HTML files with one shared information architecture. Preserve verified product facts and visibly mark any allowed demo-only content as 演示占位 / 待替换. Do not call this complete yet.',
      ...shared,
      '</prototype-visual-production-recovery>',
    ].join('\n')
  }
  if (recovery.kind === 'prototype-render-qa') {
    return [
      '<prototype-visual-render-qa-recovery>',
      'The required high-fidelity viewport evidence is incomplete: ' + (recovery.failureReasons?.join('; ') || 'unknown render evidence failure') + '.',
      'Use PrototypePreview({ fidelity: "high" }) for 03-high-fidelity.html, then Read the exact unique PNG paths returned in its structured receipt. It awaits PNG completion and sets CSS viewports 1440x1000, 1024x900, and 390x844. If measured issues report clipping, missing local assets, or overflow, fix the HTML, rerender and Read again; never override them with a passing prose receipt. Do not replay Bash screenshot commands. If this session has no PrototypePreview tool, state that its ZIP/runtime binding needs upgrading rather than inventing the call.',
      ...shared,
      '</prototype-visual-render-qa-recovery>',
    ].join('\n')
  }
  const receiptOnly = recovery.failureReasons?.length === 1
    && recovery.failureReasons[0] === 'the prototype visual-review receipt is incomplete'
  return [
    '<prototype-visual-review-recovery>',
    'The prototype visual review is incomplete: ' + (recovery.failureReasons?.join('; ') || 'unknown review failure') + '.',
    receiptOnly
      ? 'The successful HTML revision, renderer outputs, and image reads are already recorded. Only the review receipt is missing. Preserve the verified HTML and screenshots; do not make a redundant revision or rerender merely to satisfy this recovery.'
      : 'Apply prototype-fidelity-workflow, prototype-visual-quality-gate, and frontend-design to the screenshots you actually Read. Identify concrete hierarchy, readability, specificity, spacing, CTA, overflow, or template-pattern defects. Modify 03-high-fidelity.html after that review, then rerender and Read desktop 1440x1000, tablet 1024x900, and mobile 390x844 again.',
    'Before ending, Write the complete <prototype-visual-review-receipt>...</prototype-visual-review-receipt> to prototype-evidence.md or include it in the final response. It must name all three applied Skills, visual register, first-render defects, actual corrections, 1440/1024/390 observations, factual/demo-content boundary, and viewport QA boundary. Do not claim physical-device testing.',
    ...shared,
    '</prototype-visual-review-recovery>',
  ].join('\n')
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
    && /(?:visual-register|visual register|瑙嗚鍩鸿皟|瑙嗚浜烘牸)/i.test(text)
    && /(?:removed|remove:|鍒犻櫎|绉婚櫎|鍓旈櫎)/i.test(text)
    && /(?:collision|overlap|閲嶅彔|閬尅|瑁佸垏|cropping)/i.test(text)
    && /(?:source-fidelity|source fidelity|婧愬浘淇濈湡|浜嬪疄鏍稿|duplicate scan|閲嶅鏂囨湰)/i.test(text)
    && /(1440|desktop|妗岄潰)/i.test(text)
    && /(1024|tablet|骞虫澘)/i.test(text)
    && /(390|mobile|鎵嬫満|绉诲姩)/i.test(text)
}

function buildStrictVisualTerminalRecoveryInstruction(
  recovery: StrictVisualTerminalRecovery,
): string {
  if (recovery.kind === 'image-generation' && recovery.imageOnly) {
    return [
      '<strict-visual-image-generation-recovery>',
      'UIUX_GENERATED_IMAGE_ONLY: no HTML, Python drawing or browser screenshot can satisfy this image request.',
      recovery.imageGenerationFailed
        ? 'The actual image generation attempt did not succeed. Explain its recorded error and call AskUserQuestion id=image_generation_failure with configure_then_retry, adjust_brief, or stop; do not automatically retry or offer substitute deliverables.'
        : 'After the resolved source/reference/direction decisions, call image_generation operation="generate" with the specific visual brief. Then Read the returned Image path and complete the generated-image-review-receipt. Do not ask for source code or start a renderer.',
      '</strict-visual-image-generation-recovery>',
    ].join('\n')
  }
  if (recovery.kind === 'image-generation') {
    return [
      '<strict-visual-image-generation-recovery>',
      'This strict UIUX request requires a real image deliverable, but the prior turn did not produce a successful Provider-generated image or an authorized fallback.',
      'Immediately call image_generation with operation="preflight". If it is available, call image_generation again with operation="generate" using a production-ready prompt grounded in the screenshot facts, selected direction, and locked visual-reference observations. Do not write HTML, CSS, SVG, Canvas, or a browser screenshot as a substitute.',
      'After every successful generate result, retain the returned Image path as real delivery evidence and immediately call Read exactly once on that path. The host returns a bounded review preview rather than the full payload; do not use Bash to copy or convert it and do not reread the same Provider image. Only after the Read returns an image block may you complete the generated-image review receipt or claim visual Skill use. If generation returns fallback.required, call AskUserQuestion with its supplied image_generation_fallback question and choices. Do not choose Python or HTML/CSS on the user’s behalf.',
      'This is a server-enforced strict visual workflow for Expert ' + recovery.expertId + '.',
      '</strict-visual-image-generation-recovery>',
    ].join('\n')
  }

  if (recovery.kind === 'image-generation-review' && recovery.imageOnly) {
    return [
      '<strict-visual-image-generation-review-recovery>',
      'UIUX_GENERATED_IMAGE_ONLY: generation succeeded. Latest Image: ' + recovery.latestImagePath,
      'Do not regenerate to repair a preview error. Do not change the image Provider or substitute an earlier file.',
      recovery.imagePreviewFailed
        ? 'The host failed to provide an image block for this existing file. Explain preview failure separately from generation. Call AskUserQuestion id=image_preview_recovery with repair_preview_then_read (after host repair retry Read of this exact existing file) or stop. Do not automatically repeat failed Reads before repair.'
        : recovery.imagePreviewRead
          ? 'The latest image already returned an image block. Reuse those pixels; no redundant Read or generation is required. Complete the factual and visual review.'
          : 'Read the exact latest Image path above. A successful Read image block is required before visual claims. If Read fails, ask to repair the host preview or stop; preserve the file.',
      'After pixels are available, apply taste-redesign, impeccable-visual-refinement, ui-craft-critique and source-fidelity-final-pass. Compare immutable source facts: brand, prices, quantities, license/use rights. Never infer family sharing from a software bundle. Scan duplicate navigation and account actions. Write a concrete image-revision-brief before one targeted correction only if a visible defect needs it. Finalize with the generated-image-review-receipt and NEEDS WORK for remaining defects.',
      UIUX_REVIEW_INSTRUCTION,
      ...(recovery.visualReviewFailureReasons?.length ? ['Receipt defects: ' + recovery.visualReviewFailureReasons.join('; ')] : []),
      '</strict-visual-image-generation-review-recovery>',
    ].join('\n')
  }

  if (recovery.kind === 'visual-reference-research' && recovery.imageOnly) {
    return [
      '<strict-visual-reference-research-recovery>',
      UIUX_REFERENCE_INSTRUCTION,
      'Write visual-reference-receipt from visible pixels: URL, section, observed layout, limitation and original application. Text/DOM extraction is not proof of an unseen visual arrangement.',
      'If a source or preview is unavailable, report the limitation and use AskUserQuestion id=reference_recovery for use_available_evidence (only with a successfully read source), no_external_reference, change_sources, or stop. Never silently expand a user-locked scope or generate before this decision.',
      '</strict-visual-reference-research-recovery>',
    ].join('\n')
  }

  if (recovery.kind === 'image-generation-review') {
    return [
      '<strict-visual-image-generation-review-recovery>',
      'A real Provider-generated image exists, but the strict UIUX delivery has not completed its image-based review receipt.',
      'Server-detected unfinished evidence: ' + (recovery.visualReviewFailureReasons?.join('; ') || 'unknown generated-image completion failure') + '.',
      'Treat the successful Provider-generated PNG path as real delivery evidence. Immediately call Read exactly once on the returned Image path; the host must downsample and attach a bounded visual preview, so never use Bash to copy or convert the original and never retry the same path. Only after that image Read returns an image block may you apply taste-redesign, impeccable-visual-refinement, ui-craft-critique, ui-craft-finalize, and source-fidelity-final-pass to the actual final pixels. If the preview identifies a material problem, issue one revised image_generation.generate prompt and immediately Read the new final Image path once; do not fabricate an iteration or claim visual Skill use without the latest preview.',
      'Before ending, include a concise <generated-image-review-receipt> that names those five methods, states the chosen visual-register, names a concrete treatment removed or avoided, records source-fidelity/duplicate-scan evidence, and says that the final PNG came from image_generation. Do not claim HTML or a browser render was model-generated imagery.',
      'This is a server-enforced strict visual workflow for Expert ' + recovery.expertId + '.',
      '</strict-visual-image-generation-review-recovery>',
    ].join('\n')
  }

  if (recovery.kind === 'inspiration-source') {
    return [
      '<strict-visual-inspiration-source-recovery>',
      'This screenshot-redesign task has not yet chosen its inspiration/reference scope. The prior prose statement that a scope is needed does not satisfy the strict workflow.',
      'Immediately call AskUserQuestion with exactly one question whose id is inspiration_sources. Offer exactly these four stable options: user_provided_reference (the user will paste one or two public reference URLs next), builtin_public_sources (use the package built-in public reference sources), extended_public_research (allow the Expert to choose relevant public reference websites), and no_external_reference (use only the screenshot facts and original design work).',
      'Do not output prose, ask for a free-form answer, begin diagnosis, browse, write HTML, or end the turn before the AskUserQuestion call is emitted.',
      'This is a server-enforced strict visual workflow for Expert ' + recovery.expertId + '.',
      '</strict-visual-inspiration-source-recovery>',
    ].join('\n')
  }

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
      'Immediately apply the package-local taste-redesign, impeccable-visual-refinement, ui-craft-critique, and source-fidelity-final-pass methods to the rendered desktop, tablet, and mobile screenshots. Identify concrete screenshot-specific problems, then revise the existing HTML (do not merely describe changes). Run a source-to-final semantic diff: visible tabs, plan count/order/names/prices, payment relationship, and benefit labels must match the source fact ledger exactly; remove accidental repeated words such as 鈥滀紒涓?浼佷笟鈥? invented labels, and any text injected through CSS ::before/::after. Keep all user-facing semantic labels as real DOM text, not CSS content. Remove every unsupported lifestyle price analogy such as coffee, meals, cinema tickets, ride-hailing, self-service meals, or dishes. Keep only direct prices, formula-based per-day prices, and source-supported benefits; do not invent user segments, trials, guarantees, or promotions. Never draw a fake QR code, barcode, checkerboard, or black-white stripe pattern as a payment affordance: if a real payment QR is unavailable, use an honest login/payment CTA and a plainly non-code container. Do not place prototype/process disclaimers such as 鈥渢his is a visual assumption鈥?in the customer-facing page; report those limits only in the final receipt. A plan promotion/recommendation badge may not use position:absolute in the final HTML, because it can cover a tier label or price at 390px; place it in normal flow or remove it. If this recovery follows unsupported copy, unsafe plan badges, or generated semantic pseudo text, use Write to replace the complete HTML source with a clean version: do not rely on Bash or partial Edit to silently remove it.',
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
        'Its 2鈥? bounded choices must map one-to-one to the directions already shown. Preserve their actual names and intent; do not invent a replacement direction.',
      ]
    : [
        'Your previous response asked the user for a bounded choice or confirmation in prose.',
        'Immediately convert that exact decision into one AskUserQuestion card with 2鈥? bounded choices and stable ids.',
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


function sendPrototypeVisualTerminalProtocolError(
  sessionId: string,
  code:
    | 'PROTOTYPE_VISUAL_ASK_USER_QUESTION_REQUIRED'
    | 'PROTOTYPE_VISUAL_ASK_USER_QUESTION_RECOVERY_UNAVAILABLE'
    | 'PROTOTYPE_VISUAL_PRODUCTION_REQUIRED'
    | 'PROTOTYPE_VISUAL_PRODUCTION_RECOVERY_UNAVAILABLE'
    | 'PROTOTYPE_VISUAL_RENDER_QA_REQUIRED'
    | 'PROTOTYPE_VISUAL_RENDER_QA_RECOVERY_UNAVAILABLE'
    | 'PROTOTYPE_VISUAL_REVIEW_REQUIRED'
    | 'PROTOTYPE_VISUAL_REVIEW_RECOVERY_UNAVAILABLE',
  failureReasons: string[] = [],
): void {
  const clients = activeSessions.get(sessionId)
  if (!clients) return
  const message = code === 'PROTOTYPE_VISUAL_ASK_USER_QUESTION_REQUIRED'
    ? '原型图demo连续两次把确认工具写成文字，没有真正弹出确认卡片；请重试当前选择步骤。'
    : code === 'PROTOTYPE_VISUAL_PRODUCTION_REQUIRED'
      ? '原型图demo没有写全低、中、高三档 HTML，未接受为完成交付。'
    : code === 'PROTOTYPE_VISUAL_RENDER_QA_REQUIRED'
      ? '原型图demo预览未通过：' + (failureReasons.join('；') || '尚未取得当前版本的完整预览证据') + '。文件仍保留，不代表未生成。'
      : code === 'PROTOTYPE_VISUAL_REVIEW_REQUIRED'
        ? '原型图demo的视觉验收未通过：' + failureReasons.map(reason => ({
          '03-high-fidelity.html was not revised after the first image review': '尚未记录首版图片审查后的成功 HTML 修订',
          'the latest high-fidelity HTML revision was not Read back as rendered PNG images': '最新 HTML 修订的截图尚未完成图片复审',
          'the prototype visual-review receipt is incomplete': '视觉复审回执缺失或字段不完整',
        }[reason] || reason)).join('；') + '。已生成的文件仍然保留。'
        : '原型图demo无法发送所需的视觉质量恢复指令；请重试当前原型步骤。'
  for (const ws of clients) {
    sendMessage(ws, { type: 'error', code, message, retryable: true })
  }
}

function strictVisualTerminalNotice(code: StrictVisualTerminalProtocolCode): string {
  if (code === 'STRICT_VISUAL_IMAGE_GENERATION_REVIEW_REQUIRED' || code === 'STRICT_VISUAL_IMAGE_GENERATION_REVIEW_RECOVERY_UNAVAILABLE') {
    return '图片已经保留，但本轮自动像素复核没有完成；它不会被标记为已验收。你可以继续让我重新检查或重新生成。'
  }
  if (code === 'STRICT_VISUAL_IMAGE_GENERATION_REQUIRED' || code === 'STRICT_VISUAL_IMAGE_GENERATION_RECOVERY_UNAVAILABLE') {
    return '本轮没有得到可验收的生成图片；你可以继续让我重试生成，或调整设计要求。'
  }
  if (code === 'STRICT_VISUAL_RENDER_QA_REQUIRED' || code === 'STRICT_VISUAL_RENDER_QA_RECOVERY_UNAVAILABLE' || code === 'STRICT_VISUAL_REVIEW_REQUIRED' || code === 'STRICT_VISUAL_REVIEW_RECOVERY_UNAVAILABLE') {
    return '页面草稿已保留，但自动视觉校验没有完成；它不会被标记为已验收。你可以继续让我修订或重新检查。'
  }
  if (code === 'STRICT_VISUAL_REFERENCE_RESEARCH_REQUIRED' || code === 'STRICT_VISUAL_REFERENCE_RESEARCH_RECOVERY_UNAVAILABLE') {
    return '本轮没有完成参考网站的视觉整理；你可以继续提供参考，或让我改用内置参考来源。'
  }
  return '本轮需要的选择没有完成；请继续告诉我你的选择，我会从当前进度继续。'
}

type StrictVisualTerminalProtocolCode =
  | 'STRICT_VISUAL_ASK_USER_QUESTION_REQUIRED'
  | 'STRICT_VISUAL_ASK_USER_QUESTION_RECOVERY_UNAVAILABLE'
  | 'STRICT_VISUAL_REFERENCE_RESEARCH_REQUIRED'
  | 'STRICT_VISUAL_REFERENCE_RESEARCH_RECOVERY_UNAVAILABLE'
  | 'STRICT_VISUAL_IMAGE_GENERATION_REQUIRED'
  | 'STRICT_VISUAL_IMAGE_GENERATION_RECOVERY_UNAVAILABLE'
  | 'STRICT_VISUAL_IMAGE_GENERATION_REVIEW_REQUIRED'
  | 'STRICT_VISUAL_IMAGE_GENERATION_REVIEW_RECOVERY_UNAVAILABLE'
  | 'STRICT_VISUAL_RENDER_QA_REQUIRED'
  | 'STRICT_VISUAL_RENDER_QA_RECOVERY_UNAVAILABLE'
  | 'STRICT_VISUAL_REVIEW_REQUIRED'
  | 'STRICT_VISUAL_REVIEW_RECOVERY_UNAVAILABLE'

/**
 * Strict visual gates are recovery mechanisms, not transport failures. Once a
 * bounded recovery has been exhausted, preserve the model's honest output and
 * settle the chat normally instead of rendering a red protocol error.
 */
function settleStrictVisualTerminalProtocol(
  sessionId: string,
  code: StrictVisualTerminalProtocolCode,
  recovery?: StrictVisualTerminalRecovery,
): void {
  const message = recovery?.imageOnly && recovery.kind === 'image-generation-review'
    ? '图片已生成并保留，但尚未完成像素复审。请修复宿主预览后读取已有图片，或继续复审；不要因此重新生成或修改生图配置。最新文件：' + recovery.latestImagePath
    : strictVisualTerminalNotice(code)
  console.warn(`[StrictVisual] ${code}: ${message}`)
  sendToSession(sessionId, {
    type: 'system_notification',
    subtype: 'strict_visual_incomplete',
    message,
    data: { code },
  })
  sendToSession(sessionId, { type: 'status', state: 'idle' })
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
  sendReplayedPermissionRequest(ws, request)
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
  recoveryAttempt: number,
): string {
  const previousTurnWasEmpty = !assistantText.trim()
  const interactionInstruction = recovery.kind === 'ask-user-question'
    ? [
        'Your previous response asked the user for a decision in prose, but an active workflow must not wait at the free-form composer.',
        'Immediately call AskUserQuestion. Do not ask another prose question and do not end this turn.',
        'The call must include a top-level questions array, stable question and option ids, and 2-4 bounded choices.',
        'Choices may use only AskUserQuestion-supported fields: id, label, description, and preview. Keep phase completion, non-linear routes, and recovery in their dedicated workflow tools; never put route fields into a business choice.',
      ]
    : [
        'You ended a model turn while the workflow is still running, but there is no pending completion, pending route, or AskUserQuestion.',
        'Do not silently stop and do not wait for the user to type continue in the free-form composer.',
        ...(previousTurnWasEmpty
          ? [
              'The previous model turn was completely empty: it produced no text and no tool call. This is not a completed workflow action.',
              'Immediately take one concrete action allowed by the active phase. Do not return another empty end_turn.',
            ]
          : []),
        ...(recoveryAttempt > 1
          ? ['A prior internal continuation did not create workflow state. Use a different concrete next action instead of repeating the same empty or prose-only finish.']
          : []),
        'Continue the active phase now: call AskUserQuestion if user judgment, confirmation, permission, scope, or next-step choice is needed; call submit_phase_completion if the phase is ready; otherwise continue allowed phase work.',
        'Do not replace AskUserQuestion or submit_phase_completion with prose.',
      ]

  return [
    '<workflow-terminal-recovery>',
    'This is an internal workflow runtime recovery instruction. Do not display it as a normal user-facing answer.',
    `Active phase: ${recovery.state.activePhaseId ?? 'unknown'}.`,
    ...interactionInstruction,
    'Keep user-visible text in the current workflow language.',
    assistantText ? `Previous prose: ${assistantText}` : '',
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
    ? 'The browser audit meets this Expert package minimum coverage threshold.'
    : `The browser audit still has these evidence gaps: ${recovery.completion.missing.join('; ')}`

  return [
    '<expert-research-delivery-terminal-recovery>',
    'This is an internal Expert runtime recovery instruction. Do not display it as a normal answer.',
    'Research agents returned auditable browser records, but the task ended in ordinary prose before the package research-delivery flow completed.',
    auditSummary,
    'Continue the current Expert task. Reuse existing audit records and opened sources; perform only bounded additional public research when it is materially useful.',
    '用户的最终选择优先：一旦该正式 AskUserQuestion 获得回答，严格按其选择继续，不要用内部推断覆盖、重问或绕过该选择。',
    `If a delivery decision is necessary, call exactly one formal AskUserQuestion research-delivery card using question id ${recovery.policy.questionId}.`,
    `Its option ids must be exactly: ${expectedChoiceIds.join(', ')}; it must include ${recovery.policy.acceptedChoiceId}.`,
    'The card must include the required expert_research_delivery metadata and list genuine unresolved evidence only. Do not create another delivery question id.',
    'Do not bypass the delivery flow with Write, Edit, hand-written HTML, or ordinary prose.',
    assistantText ? `Previous ordinary summary: ${assistantText}` : '',
    '</expert-research-delivery-terminal-recovery>',
  ].filter(Boolean).join('\n')
}
function sendExpertResearchDeliveryTerminalProtocolError(sessionId: string): void {
  sendToSession(sessionId, {
    type: 'error',
    code: 'EXPERT_RESEARCH_DELIVERY_PROTOCOL_REQUIRED',
    message: 'This research Expert ended twice after browser evidence without continuing research, issuing the required delivery decision, or generating the report. The ordinary summary was not treated as completion; retry the current Expert task.',
    retryable: true,
  })
}
async function expertResearchDeliveryTerminalRecoveryForResult(
  sessionId: string,
  turn: WorkflowInteractionTurn,
): Promise<ExpertResearchDeliveryTerminalRecoveryResult | null> {
  const transcriptExpert = (await sessionService.getSession(sessionId).catch(() => null))?.expert
  const expert = transcriptExpert ?? await expertRuntimeSessionStore.get(sessionId)
  return resolveExpertResearchDeliveryTerminalRecovery({
    expert,
    usedAskUserQuestion: turn.usedAskUserQuestion,
    hasPendingAskUserQuestion: hasPendingAskUserQuestion(sessionId),
  })
}
export function isCommercializationResearchQuestionRecoveryBlocked(input: {
  usedAskUserQuestion: boolean
  hasPendingAskUserQuestion: boolean
  expertTemplateFillValidationFailure: boolean
}): boolean {
  return input.usedAskUserQuestion
    || input.hasPendingAskUserQuestion
    // A renderer/evidence validation failure is an internal technical state,
    // not a missing product fact. Do not force a new user card from the
    // model's ordinary recovery prose.
    || input.expertTemplateFillValidationFailure
}

async function commercializationResearchQuestionRecoveryForResult(
  sessionId: string,
  turn: WorkflowInteractionTurn,
): Promise<CommercializationResearchQuestionRecovery | null> {
  if (isCommercializationResearchQuestionRecoveryBlocked({
    usedAskUserQuestion: turn.usedAskUserQuestion,
    hasPendingAskUserQuestion: hasPendingAskUserQuestion(sessionId),
    expertTemplateFillValidationFailure: turn.expertTemplateFillValidationFailure,
  })) return null

  const transcriptExpert = (await sessionService.getSession(sessionId).catch(() => null))?.expert
  const expert = transcriptExpert ?? await expertRuntimeSessionStore.get(sessionId)
  if (
    !hasActiveExpertRuntime(expert)
    || expert.expertId !== 'commercialization-research-report'
    || !assistantTextRequestsCommercializationUserInput(turn.assistantText)
  ) {
    return null
  }

  return { expertId: expert.expertId }
}

function buildCommercializationResearchQuestionRecoveryInstruction(
  recovery: CommercializationResearchQuestionRecovery,
  assistantText: string,
  recoveryAttempt: number,
): string {
  return [
    '<commercialization-research-ask-user-question-recovery>',
    'This is an internal Expert runtime recovery instruction. Do not display it as a normal answer.',
    'The previous response said that more user clarification is needed, but it ended in prose without an AskUserQuestion call. That prose statement is not a completed turn.',
    'Immediately call exactly one AskUserQuestion for the specific missing product fact implied by the previous response.',
    recoveryAttempt > 1
      ? 'The prior tool-only correction was ignored. Retry now with the AskUserQuestion tool as the entire response: no prose before or after the tool call.'
      : '',
    'Use 2–4 concise, product-specific choices and rely on the built-in Other path for custom detail. Do not ask for a generic analysis direction, permission to start research, an output location, or a fixed questionnaire.',
    'Do not browse, dispatch subagents, write files, emit another prose request, or end the turn before the AskUserQuestion call is emitted.',
    'This recovery applies only to Expert ' + recovery.expertId + '.',
    assistantText ? 'Previous prose: ' + assistantText : '',
    '</commercialization-research-ask-user-question-recovery>',
  ].filter(Boolean).join('\n')
}

function sendCommercializationResearchQuestionRecoveryUnavailableError(sessionId: string): void {
  sendToSession(sessionId, {
    type: 'error',
    code: 'COMMERCIALIZATION_RESEARCH_ASK_USER_QUESTION_RECOVERY_UNAVAILABLE',
    message: '当前会话无法发送必要的 AskUserQuestion 澄清卡片。请重试当前问题；系统没有把本轮误显示为已完成。',
    retryable: true,
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

  removeSessionOutputCallbacks(sessionId)
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

const EXPERT_RESEARCH_AUTO_CONTINUE_INSTRUCTION = [
  '<expert-research-auto-continue>',
  'The three declared file-first researcher handoffs are already complete and have been durably recorded.',
  'Do not ask the user another question. Do not re-dispatch researchers and do not redo completed browsing.',
  'Read only these files from the current session work directory:',
  '- commercialization-research/01-research-brief.md',
  '- commercialization-research/02-competitors.md',
  '- commercialization-research/03-user-needs.md',
  '- commercialization-research/04-channels.md',
  '- commercialization-research/06-browser-audit.md if it already exists.',
  'Continue the existing report pipeline now: delegate the independent evidence review, then complete browser audit, field absorption, and the fixed-template HTML report.',
  'Keep the three research reports as file paths; never paste their full contents into the parent context.',
  '</expert-research-auto-continue>',
].join('\n')

export function buildIncompleteRequiredRouteRecoveryInstruction(plan: Extract<ExpertResearchAutoContinuePlan, { kind: 'recover-incomplete-required-routes' }>): string {
  const byArtifact = new Map<string, typeof plan.recoveries>()
  for (const recovery of plan.recoveries) {
    if (recovery.artifactPath === 'commercialization-research/01-research-brief.md') continue
    const current = byArtifact.get(recovery.artifactPath) ?? []
    current.push(recovery)
    byArtifact.set(recovery.artifactPath, current)
  }
  return [
    '<expert-research-required-route-recovery>',
    'This is an internal Expert runtime recovery instruction. Do not display it as a normal answer and do not ask the user a question.',
    'The declared researcher Markdown files exist, but the server matched their real Playwright audits against both ordinary planned platform work and optional Required route blocks in 01-research-brief.md and found only the narrow gaps listed below.',
    'Do not redo broad research, re-run completed routes, or replace any other researcher report. For each artifact group below, dispatch exactly one Agent with subagent_type "expert-evidence-researcher", research_task_kind: "targeted-evidence", and run_in_background: true. Its Agent tool call must set research_artifact_path to the exact Artifact path below; keep this route repair separate from the company-source queue.',
    'Each recovery agent must Read 01-research-brief.md and its assigned existing Markdown, then use Playwright only for the listed route action. A normal content page requires navigate + wait + extract. For a real access limit, do not bypass verification: preserve the result and execute the listed same-field fallback. A real product-specific no-result search is also a bounded outcome. If primary and same-field fallback remain unavailable, preserve the gap and finish; do not loop. Homepage extraction is not content evidence; checkpoint saves do not end remaining assigned tasks.',
    ...[...byArtifact.entries()].flatMap(([artifactPath, recoveries]) => [
      '- Artifact: ' + artifactPath + '; research_artifact_path=' + artifactPath,
      ...recoveries.map((recovery) => '  - Route ' + recovery.routeId + ': ' + recovery.nextStep
        + '; primary=' + recovery.primaryTargetHost
        + '; fallback=' + recovery.fallbackTargetHost
        + (recovery.evidenceField ? '; field=' + recovery.evidenceField : '')
        + (recovery.goal ? '; goal=' + recovery.goal : '')
        + (recovery.firstRoute ? '; first=' + recovery.firstRoute : '')
        + (recovery.fallbackRoute ? '; fallback-action=' + recovery.fallbackRoute : '')
        + '; reason=' + recovery.reason),
    ]),
    'Each recovery researcher may update only its assigned existing Markdown path. Its final return must contain only that relative Markdown path plus a very short status. After dispatching all listed recovery researchers, use TaskOutput(block: true), then Read the saved paths and continue D → E → report pipeline. Do not paste research Markdown contents into the parent context.',
    '</expert-research-required-route-recovery>',
  ].join('\n')
}


export function buildUndispatchedSourceBatchRecoveryInstruction(
  plan: Extract<ExpertResearchAutoContinuePlan, { kind: 'recover-undispatched-source-batch' }>,
): string {
  return [
    '<expert-research-source-batch-recovery>',
    'This is an internal Expert runtime recovery instruction. Do not display it as a normal answer and do not ask the user a question.',
    'The declared researcher Markdown and browser audit were saved, but this bounded A/B/C execution wave still has URLs without a real terminal receipt. Run only the listed current wave; do not redo completed URLs or broad research.',
    'For every listed artifact, dispatch one Agent with subagent_type "expert-evidence-researcher", research_task_kind: "source-batch", and run_in_background: true. The Agent call must set research_artifact_path to that exact path so the server injects the correct A/B/C package. Dispatch all listed artifacts before waiting, so independent recovery lanes remain parallel.',
    ...plan.recoveries.flatMap((recovery) => [
      '- Artifact: ' + recovery.artifactPath
        + '; research_artifact_path=' + recovery.artifactPath
        + '; assigned core=' + recovery.coreEntryCount
        + '; assigned open=' + recovery.openEntryCount
        + '; remaining=' + recovery.remainingEntryCount
        + '; reason=' + recovery.reason,
      ...recovery.entries.map((entry) => '  - [' + entry.tier + '][' + entry.category + '] ' + entry.candidateUrl),
    ]),
    'Each recovery researcher must Read 01-research-brief.md and its existing assigned Markdown, then process only the explicit current-wave URLs above (at most 10 per lane). Every URL needs one real Playwright outcome: opened, access_limited, or failed. A platform search with no relevant result is a truthful failed/no-result outcome, not a reason to loop. Save the completed wave back to the same Markdown.',
    'Do not replace this source wave with a competitor-only assignment. After existing workers finish, dispatch any remaining direct-competitor gaps separately with research_task_kind: "targeted-evidence" and the same owner Markdown. Across A/B/C, preserve the official-site plus B站、YouTube、Reddit、GitHub、Gitee、X、小红书、知乎、百度贴吧、微博 evidence routes; open a concrete result when one exists, otherwise preserve truthful no-result or access-limited. Never run two writers for the same Markdown at once.',
    'After the listed agents finish, let the server re-evaluate terminal receipts. An ended unchanged wave gets at most one targeted retry; if it ends again without receipts, the runtime records the remaining entries as interrupted (unexecuted/incomplete, never visited or website-restricted), then continues D → E → initial fixed-template HTML → 08 → final patch/finalize. Do not repeatedly dispatch a still-running wave. Individual access_limited and failed/no-result outcomes are terminal and never require success retries.',
    '</expert-research-source-batch-recovery>',
  ].join('\n')
}

function buildEvidenceAbsorptionAutoContinueInstruction(
  plan: Extract<ExpertResearchAutoContinuePlan, { kind: 'continue-absorption' }>,
): string {
  return [
    '<expert-research-absorption-auto-continue>',
    'This is an internal Expert runtime continuation. Do not display it as a normal answer and do not ask the user a question.',
    'The independent evidence review is durably saved, but the declared field-absorption Markdown is missing or empty. Continue E now; do not merely say that you will dispatch it.',
    'Your next action must be exactly one Agent tool call with subagent_type "' + plan.absorberAgentType + '" and run_in_background: false.',
    'Give that Agent only this file-first task: Read the declared session Markdown artifacts below and Write only ' + plan.absorptionPath + '. Its final return must contain only that relative Markdown path plus a short status.',
    '- ' + plan.briefPath,
    ...plan.researcherPaths.map((artifactPath) => '- ' + artifactPath),
    '- ' + plan.auditPath,
    '- ' + plan.reviewerPath,
    'Do not reopen browser pages, task-output transcripts, or research browsers; do not re-dispatch A/B/C/D. Do not paste Markdown contents into the parent context.',
    'After the Agent succeeds, Read ' + plan.briefPath + ' and ' + plan.absorptionPath + ', then continue the existing fixed-template report pipeline.',
    '</expert-research-absorption-auto-continue>',
  ].join('\n')
}

function buildInitialTemplateRenderAutoContinueInstruction(
  plan: Extract<ExpertResearchAutoContinuePlan, { kind: 'continue-initial-render' }>,
): string {
  return [
    '<expert-research-initial-render-auto-continue>',
    'This is an internal Expert runtime continuation. Do not display it as a normal answer and do not ask the user a question.',
    'The chapter-ready 07 material is durably saved, but no initial fixed-template HTML draft exists. Continue the real render now; do not merely describe a future report step.',
    'Your next actions must be Read ' + plan.briefPath + ', Read ' + plan.absorptionPath + ', then exactly one structured Write for one .html file directly in the current session workDir. Use Write.content as an empty string and put the complete fixed-template fields in expert_output.',
    'Do not reopen browser pages, re-dispatch A/B/C/D/E/F, read raw ledgers, create Markdown, or paste research content into the parent context. Use a stable descriptive .html filename and do not ask the user to choose it.',
    'This Write creates an initial draft only. Do not call it final delivery and do not replace it with ordinary prose. The server will advance the same draft to the constrained 08 review when the Write really succeeds.',
    '</expert-research-initial-render-auto-continue>',
  ].join('\n')
}

function buildOutputReviewAutoContinueInstruction(
  plan: Extract<ExpertResearchAutoContinuePlan, { kind: 'continue-output-review' }>,
): string {
  return [
    '<expert-research-output-review-auto-continue>',
    'This is an internal Expert runtime continuation. Do not display it as a normal answer and do not ask the user a question.',
    'The initial HTML draft is durably saved, but this draft does not yet have a current 08 completeness-review receipt. Continue the real review now; do not merely say that you will dispatch it.',
    'Your next action must be exactly one Agent tool call with subagent_type "' + plan.reviewerAgentType + '" and run_in_background: false.',
    'Give that Agent only this file-first task: Read exactly ' + plan.briefPath + ', ' + plan.absorptionPath + ', and ' + plan.reportPath + '; Write only ' + plan.completionReviewPath + '. Its final return must contain only that relative Markdown path plus a short status.',
    'Do not browse, re-dispatch research workers, read raw researcher ledgers, generate another HTML file, or paste any research content into the parent context. After the Agent succeeds, the server will require the parent to Read 08 and make one patch-or-finalize decision for this same HTML path.',
    '</expert-research-output-review-auto-continue>',
  ].join('\n')
}

function buildFinalizeDeliveryAutoContinueInstruction(
  plan: Extract<ExpertResearchAutoContinuePlan, { kind: 'continue-finalize-delivery' }>,
): string {
  return [
    '<expert-research-finalize-delivery-auto-continue>',
    'This is an internal Expert runtime continuation. Do not display it as a normal answer and do not ask the user a question.',
    'The same initial HTML and a current 08 completeness review are durably saved. Finish the existing delivery now; do not restart research or create another report file.',
    'Read only ' + plan.completionReviewPath + '. Then write only the existing report path ' + plan.reportPath + ' using the structured fixed-template Write.',
    'If 08 plainly identifies a source-supported omission in the current report, make exactly one mode="patch" Write with only the smallest supported fields. Otherwise make mode="finalize" with fields: {} so the reviewed initial draft becomes the final delivery unchanged.',
    'Do not browse, invoke agents, ask the user, reread raw ledgers, paste research content into the parent context, or replace the report with a fresh full rewrite.',
    '</expert-research-finalize-delivery-auto-continue>',
  ].join('\n')
}

function buildMissingResearcherRecoveryInstruction(missingArtifactPaths: string[]): string {
  return [
    '<expert-research-missing-handoff-recovery>',
    'This is an internal Expert runtime recovery instruction. Do not display it as a normal answer and do not ask the user a question.',
    'The server confirmed that the following declared file-first researcher handoffs are still missing or lack a durable audit receipt:',
    ...missingArtifactPaths.map((artifactPath) => '- ' + artifactPath),
    'Do not re-dispatch any existing non-empty researcher artifact. For each missing path, dispatch exactly one Agent with subagent_type "expert-evidence-researcher", research_task_kind: "targeted-evidence", and run_in_background: true. Each Agent call must also set research_artifact_path to that one exact Markdown path; never omit it and never put sibling paths in the same call.',
    'Each recovery researcher must Read commercialization-research/01-research-brief.md, use the allowed research tools, and Write only its assigned missing Markdown path. Its final return must contain only the relative Markdown path plus a very short status.',
    'After dispatching every missing researcher, use TaskOutput(block: true) to receive their completion notifications. Then Read the actually saved files and continue the normal D → E → report pipeline. Do not paste the research Markdown contents into the parent context.',
    '</expert-research-missing-handoff-recovery>',
  ].join('\n')
}

export async function continueCommercializationResearch(
  sessionId: string,
  plan: ExpertResearchAutoContinuePlan,
): Promise<boolean> {
  const expert = (await sessionService.getSession(sessionId))?.expert ?? await expertRuntimeSessionStore.get(sessionId)
  const plannedBindingKey = getExpertProcessBindingKey(expert)
  if (!plannedBindingKey) return false
  return enqueueRuntimeTransition(sessionId, async () => {
    const current = (await sessionService.getSession(sessionId))?.expert ?? await expertRuntimeSessionStore.get(sessionId)
    // An already prepared continuation must not start ordinary chat or another
    // Expert after an exit/switch that was queued before this send.
    if (getExpertProcessBindingKey(current) !== plannedBindingKey) return false
    return continueCommercializationResearchInTransition(sessionId, plan)
  })
}

async function continueCommercializationResearchInTransition(
  sessionId: string,
  plan: ExpertResearchAutoContinuePlan,
): Promise<boolean> {
  // A live TaskOutput wait will consume normal task notifications itself. This
  // fallback exists only for the observed "parent text ended, children finished"
  // gap, so never inject a duplicate turn while a parent turn is still active.
  if (getSessionChatState(sessionId) !== 'idle') return false

  const client = activeSessions.get(sessionId)?.values().next().value as ServerWebSocket<WebSocketData> | undefined
  if (!client) return false

  if (plan.kind === 'report-delivery-stalled') {
    broadcastServerMessageToSession(sessionId, {
      type: 'error', code: 'EXPERT_REPORT_DELIVERY_STALLED',
      message: '报告定稿连续出现同一工具错误（' + plan.errorCode + '），草稿和复核没有变化，已停止无进展的自动重试。研究材料和原 HTML 均保留，但尚未最终交付：' + plan.reportPath + '。修正错误后可继续当前会话，不需要重新调研。',
    })
    broadcastServerMessageToSession(sessionId, { type: 'status', state: 'idle' })
    return true
  }

  broadcastServerMessageToSession(sessionId, {
    type: 'status',
    state: 'thinking',
    verb: plan.kind === 'recover-missing-researchers'
      ? '正在补齐缺失的调研子任务'
      : plan.kind === 'recover-undispatched-source-batch'
        ? '正在补齐未执行的核心来源取证批次'
        : plan.kind === 'recover-incomplete-required-routes'
        ? '正在补齐已选关键路线的真实取证'
        : plan.kind === 'continue-absorption'
          ? '正在进入字段吸收阶段'
          : plan.kind === 'continue-initial-render'
            ? '正在生成初始报告草稿'
            : plan.kind === 'continue-output-review'
              ? '正在进行报告完整性复核'
              : plan.kind === 'continue-finalize-delivery'
                ? '正在完成报告交付'
                : '正在继续证据复核',
  })

  try {
    await ensureCliSessionStartedInTransition(client, sessionId, 'expert_research_auto_continue')
    bindAllClientSessionOutputs(sessionId)
    const instruction = plan.kind === 'recover-missing-researchers'
      ? buildMissingResearcherRecoveryInstruction(plan.missingArtifactPaths)
      : plan.kind === 'recover-undispatched-source-batch'
        ? buildUndispatchedSourceBatchRecoveryInstruction(plan)
        : plan.kind === 'recover-incomplete-required-routes'
        ? buildIncompleteRequiredRouteRecoveryInstruction(plan)
        : plan.kind === 'continue-absorption'
          ? buildEvidenceAbsorptionAutoContinueInstruction(plan)
          : plan.kind === 'continue-initial-render'
            ? buildInitialTemplateRenderAutoContinueInstruction(plan)
            : plan.kind === 'continue-output-review'
              ? buildOutputReviewAutoContinueInstruction(plan)
              : plan.kind === 'continue-finalize-delivery'
                ? buildFinalizeDeliveryAutoContinueInstruction(plan)
                : EXPERT_RESEARCH_AUTO_CONTINUE_INSTRUCTION
    const streamState = getStreamState(sessionId)
    // Mark the turn before enqueueing it because SDK output may begin
    // synchronously. Tool/status events remain visible; only free-form prose is
    // hidden until this same generation reaches its real terminal result.
    streamState.suppressExpertAutoContinueAssistantText = true
    const sent = conversationService.sendInternalMessage(sessionId, instruction)
    if (sent) return true
    streamState.suppressExpertAutoContinueAssistantText = false
  } catch (error) {
    getStreamState(sessionId).suppressExpertAutoContinueAssistantText = false
    console.warn(`[WS] Failed to auto-continue commercialization research for ${sessionId}: ${
      error instanceof Error ? error.message : String(error)
    }`)
  }

  broadcastServerMessageToSession(sessionId, { type: 'status', state: 'idle' })
  return false
}

expertHumanVerificationService.setDelivery(sendToSession)
expertResearchAutoContinueService.setHandler(continueCommercializationResearch)
async function ensureCliSessionStarted(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  reason: 'user_message' | 'prewarm_session' | 'workflow_auto_continue' | 'expert_research_auto_continue',
): Promise<void> {
  return enqueueRuntimeTransition(sessionId, () => ensureCliSessionStartedInTransition(ws, sessionId, reason))
}

// Only call while owning the lifecycle queue; never enqueue or await the queue itself here.
async function ensureCliSessionStartedInTransition(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  reason: 'user_message' | 'prewarm_session' | 'workflow_auto_continue' | 'expert_research_auto_continue',
): Promise<void> {
  // Resolve inside the queue, not when the request first arrived. An Expert may
  // have been activated or exited while a previous startup was still pending.
  const runtimeSettings = await getRuntimeSettings(sessionId)
  const sessionSettings = await getRuntimeSettingsWithWorkflowPolicy(sessionId, runtimeSettings)
  if (conversationService.hasSession(sessionId)) {
    const loadedKey = conversationService.getSessionExpertRuntimeBindingKey(sessionId)
    if (loadedKey === sessionSettings.expertRuntimeBindingKey) return
    await conversationService.stopSessionAndWait(sessionId)
    void diagnosticsService.recordEvent({
      type: 'expert_runtime_binding_rebound', severity: 'info', sessionId,
      summary: 'Replacing CLI with the current Expert runtime binding before sending a turn',
      details: { loadedBindingKey: loadedKey ?? null, expectedBindingKey: sessionSettings.expertRuntimeBindingKey ?? null },
    })
  }
  const startup = (async () => {
    const workDir = await resolveSessionWorkDir(sessionId)
    lastResolvedStartupWorkDirs.set(sessionId, workDir)
    const sdkUrl =
      'ws://' + ws.data.serverHost + ':' + ws.data.serverPort + '/sdk/' + sessionId +
      '?token=' + encodeURIComponent(crypto.randomUUID())
    await sendRepositoryStartupStatus(ws, sessionId, reason)
    console.log('[WS] Starting CLI for ' + sessionId + ' due to ' + reason)
    await conversationService.startSession(sessionId, workDir, sdkUrl, sessionSettings)
  })()
  sessionStartupPromises.set(sessionId, startup)
  try {
    await startup
  } finally {
    if (sessionStartupPromises.get(sessionId) === startup) sessionStartupPromises.delete(sessionId)
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
            // Stream events handled most blocks 鈥?but any tool_use whose
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
            // No stream events received 鈥?this is the only source, process everything
            if (block.type === 'thinking' && block.thinking) {
              messages.push({ type: 'thinking', text: block.thinking })
            } else if (block.type === 'text' && block.text) {
              if (!streamState.suppressExpertAutoContinueAssistantText) {
                recordAssistantText(streamState, block.text)
                messages.push({ type: 'content_start', blockType: 'text' })
                messages.push({ type: 'content_delta', text: block.text })
              }
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
      // Bug #1: 澶勭悊 tool_result 娑堟伅
      // Process tool_result messages sent back by the CLI.
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
            recordExpertTemplateFillValidationFailure(streamState, block)
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
          if (streamState.suppressExpertAutoContinueAssistantText) return []
          return [{ type: 'content_start', blockType: 'text' }]
        }

        case 'content_block_delta': {
          const delta = event.delta
          if (!delta) return []

          if (delta.type === 'text_delta' && delta.text) {
            if (streamState.suppressExpertAutoContinueAssistantText) return []
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

              // JSON parse failed 鈥?defer to the assistant message which
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
      // The CLI needs user approval before it can execute a tool.
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
      streamState.suppressExpertAutoContinueAssistantText = false
      // Conversation result (success or error)
      const usage = {
        input_tokens: cliMsg.usage?.input_tokens || 0,
        output_tokens: cliMsg.usage?.output_tokens || 0,
      }

      if (cliMsg.is_error) {
        // If the user requested stop, this "error" is just the interrupt
        // result 鈥?don't show it as an error in the chat UI.
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
        // Send error and completion messages
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
      // Distinguish system subtypes
      const subtype = cliMsg.subtype
      if (subtype === 'init') {
        // CLI 鍒濆鍖栧畬鎴?鈥?缂撳瓨 slash commands 骞跺彂閫佹ā鍨嬩俊鎭?        // NOTE: Do NOT send status:idle here 鈥?the CLI init fires while
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
        // Hook 鎵ц涓?鈥?涓嶈浆鍙戠粰鍓嶇
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
      // Bug #7: 澶勭悊 task/team system 娑堟伅
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
      // 鍏朵粬 system 娑堟伅
      return []
    }

    case 'keep_alive':
      // Transport-level heartbeat. It deliberately has no desktop UI effect.
      return []

    default:
      // 鏈煡绫诲瀷 鈥?璋冭瘯杈撳嚭浣嗕笉杞彂
      console.log(`[WS] Unknown CLI message type: ${cliMsg.type}`, JSON.stringify(cliMsg).substring(0, 200))
      return []
  }
}

// ============================================================================
// Helpers
// ============================================================================

function syncSessionChatStateFromMessage(sessionId: string, message: ServerMessage): void {
  if (message.type === 'system_notification'
    && (message.subtype === 'task_started' || message.subtype === 'task_notification')) {
    const data = message.data as { task_id?: unknown; status?: unknown } | undefined
    if (typeof data?.task_id === 'string') {
      if (message.subtype === 'task_started' && !sessionStopRequested.has(sessionId)) {
        const tasks = runningBackgroundTasks.get(sessionId) ?? new Set<string>()
        tasks.add(data.task_id)
        runningBackgroundTasks.set(sessionId, tasks)
      } else if (['completed', 'failed', 'stopped', 'cancelled'].includes(String(data.status))) {
        runningBackgroundTasks.get(sessionId)?.delete(data.task_id)
      }
    }
  }
  if (message.type === 'content_start' || message.type === 'thinking') {
    setSessionChatState(sessionId, message.type === 'thinking' ? 'thinking'
      : message.blockType === 'tool_use' ? 'tool_executing' : 'streaming')
    return
  }
  if (message.type === 'status') {
    setSessionChatState(sessionId, message.state)
    return
  }

  if (message.type === 'message_complete') {
    setSessionChatState(sessionId, 'idle')
    expertResearchAutoContinueService.schedule(sessionId)
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

function sendReplayedPermissionRequest(
  ws: ServerWebSocket<WebSocketData>,
  request: Extract<ServerMessage, { type: 'permission_request' }>,
): void {
  // AskUserQuestion needs both transcript and permission state on the desktop.
  // Reconnect recovery must replay the pair together; replaying only the
  // permission leaves the workflow waiting with no visible question card.
  if (request.toolName === 'AskUserQuestion' && request.toolUseId) {
    sendMessage(ws, {
      type: 'tool_use_complete',
      toolName: request.toolName,
      toolUseId: request.toolUseId,
      input: request.input,
    })
  }
  sendMessage(ws, request)
}

function replayPendingPermissionRequests(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
): void {
  for (const request of conversationService.getPendingPermissionRequests(sessionId)) {
    sendReplayedPermissionRequest(ws, {
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

function removeClientOutputCallback(
  ws: ServerWebSocket<WebSocketData>,
  options: { retainForReconnect?: boolean } = {},
): void {
  const entry = clientOutputCallbacks.get(ws)
  if (!entry) return
  clientOutputCallbacks.delete(ws)
  const stillUsed = [...clientOutputCallbacks.values()].some(
    (candidate) =>
      candidate.sessionId === entry.sessionId &&
      candidate.callback === entry.callback,
  )
  if (stillUsed) return

  if (options.retainForReconnect) {
    const previousRetained = retainedSessionOutputCallbacks.get(entry.sessionId)
    if (previousRetained && previousRetained !== entry.callback) {
      conversationService.removeOutputCallback(entry.sessionId, previousRetained)
    }
    retainedSessionOutputCallbacks.set(entry.sessionId, entry.callback)
    return
  }

  const retained = retainedSessionOutputCallbacks.get(entry.sessionId)
  if (retained) {
    retainedSessionOutputCallbacks.delete(entry.sessionId)
    if (retained !== entry.callback) {
      conversationService.removeOutputCallback(entry.sessionId, retained)
    }
  }
  conversationService.removeOutputCallback(entry.sessionId, entry.callback)
}

function removeSessionOutputCallbacks(sessionId: string): void {
  const callbacks = new Set<(msg: any) => void>()
  const retained = retainedSessionOutputCallbacks.get(sessionId)
  if (retained) {
    callbacks.add(retained)
    retainedSessionOutputCallbacks.delete(sessionId)
  }
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
  sendToSession(sessionId, message)
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

function sendWorkflowTerminalRecoveryUnavailableError(sessionId: string): void {
  const clients = activeSessions.get(sessionId)
  if (!clients) return

  for (const ws of clients) {
    sendMessage(ws, {
      type: 'error',
      code: 'WORKFLOW_TERMINAL_RECOVERY_UNAVAILABLE',
      message: 'This workflow needs a structured continuation, but the runtime could not deliver the recovery instruction to the model. This prose-only termination is not treated as normal completion; retry the current phase.',
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
  const message = 'Workflow phase tools could not be restored. The workflow was not advanced; retry the current phase.'

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
  const action = toolName === 'submit_phase_completion'
    ? 'submit_phase_completion'
    : 'request_workflow_route'
  const instruction = [
    `The previous ${action} call did not execute because the runtime tool binding was unhealthy. A fresh workflow runtime is now running and this tool is available.`,
    `Immediately retry the required structured ${action} call.`,
    'Do not ask the user to type continue, do not expose this internal binding failure, and do not replace the tool call with prose.',
    'Continue to obey the active phase permissions and use the current workflow language for user-visible text.',
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

  if (streamState.workflowProtocolBindingRecoveryAttempts >= 1 && !isManagedWorkflowAgentTaskState(state)) {
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
        verb: 'Restoring workflow tools',
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
  const message = 'Workflow phase tool parameters failed validation twice. The workflow was not advanced; retry the current phase.'

  for (const ws of clients) {
    sendMessage(ws, {
      type: 'error',
      code: 'WORKFLOW_PROTOCOL_INPUT_INVALID',
      message,
      retryable: true,
    })
  }
}
function workflowProtocolCorrectedExample(toolName: WorkflowRecoverableInputToolName): Record<string, unknown> {
  if (toolName === WORKFLOW_AGENT_TOOL_NAME) {
    return {
      description: 'Implement or review the current workflow batch',
      prompt: 'Use the current Context Capsule and complete only the assigned batch.',
      subagent_type: 'general-purpose',
      workflow_role: 'coder',
    }
  }
  if (toolName === 'submit_phase_completion') {
    return {
      status: 'ready',
      handoff: { summary: 'What was completed and what the next phase must know.' },
      rationale: 'Why the active phase is eligible to complete.',
      evidence: [],
    }
  }
  return {
    intent: 'jump_to_phase',
    targetPhaseId: 'target-phase-id',
    rationale: 'Why the workflow must route to this phase.',
    evidence: [],
  }
}

function workflowProtocolInputRecoveryPayload(
  toolName: WorkflowRecoverableInputToolName,
  detail: string | undefined,
): Record<string, unknown> {
  const normalized = detail?.trim() || `InputValidationError: ${toolName} payload was rejected.`
  const knownFields = [
    'description', 'prompt', 'subagent_type', 'workflow_role',
    'status', 'handoff', 'rationale', 'evidence', 'phaseId', 'stateVersion',
    'intent', 'targetPhaseId',
  ]
  const lower = normalized.toLowerCase()
  const missingFields = knownFields.filter(field => {
    const key = field.toLowerCase()
    const index = lower.indexOf(key)
    if (index < 0) return false
    const context = lower.slice(Math.max(0, index - 48), index + key.length + 96)
    return context.includes('missing') || context.includes('required')
  })
  const unexpectedFields = [...normalized.matchAll(/(?:unexpected|unrecognized|unknown)\s+(?:field|key|parameter)?\s*[`"']?([A-Za-z_][A-Za-z0-9_]*)/gi)]
    .map(match => match[1]!)
    .filter((field, index, all) => all.indexOf(field) === index)
  const fieldErrors = normalized.split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 16)
  return {
    errorCode: 'WORKFLOW_PROTOCOL_INPUT_INVALID',
    toolName,
    fieldErrors,
    missingFields,
    unexpectedFields,
    correctedExample: workflowProtocolCorrectedExample(toolName),
    recoverable: true,
  }
}

function buildWorkflowProtocolInputValidationRecoveryInstruction(
  state: WorkflowSessionState,
  toolName: WorkflowRecoverableInputToolName,
  detail: string | undefined,
  attempt: number,
): string {
  const contract = toolName === WORKFLOW_AGENT_TOOL_NAME
    ? ['Immediately call Agent again with a non-empty description and prompt.', 'For workflow delegation, use subagent_type=general-purpose and a top-level workflow_role (coder, reviewer, or qa).']
    : toolName === 'submit_phase_completion'
      ? ['Immediately call submit_phase_completion again with status, handoff (an object), rationale (a non-empty string), and evidence (an array).', 'If phaseId or stateVersion is uncertain, omit it so the runtime uses the current workflow state.']
      : ['Immediately call request_workflow_route again with intent, rationale (a non-empty string), and evidence (an array).', 'targetPhaseId is required for jump_to_phase.']
  const recoveryPayload = workflowProtocolInputRecoveryPayload(toolName, detail)
  const instruction = [
    `The previous ${toolName} call was rejected by input validation and did not execute.`,
    `Recovery attempt ${attempt}. Inspect the exact structured error below and change the invalid fields.`,
    attempt > 1 ? 'Do not resend the unchanged invalid payload; correct the concrete fields named below.' : 'Correct the concrete fields named below.',
    ...contract,
    '<workflow-protocol-input-error>',
    JSON.stringify(recoveryPayload, null, 2),
    '</workflow-protocol-input-error>',
    'Do not explain this internal failure to the user, replace it with prose or AskUserQuestion, or wait for the user to type continue. Correct the payload and retry the same structured tool call only.',
    'Continue to obey the active phase permissions and use the current workflow language for user-visible text.',
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

  if (streamState.workflowProtocolInputRecoveryAttempts >= 1 && !isManagedWorkflowAgentTaskState(state)) {
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
  const recoveryAttempt = streamState.workflowProtocolInputRecoveryAttempts
  const validationDetail = streamState.workflowProtocolInputValidationDetail
  const clients = activeSessions.get(sessionId)
  if (clients) {
    for (const ws of clients) {
      sendMessage(ws, {
        type: 'status',
        state: 'thinking',
        verb: 'Correcting workflow tool parameters',
      })
    }
  }

  const sent = conversationService.sendMessage(
    sessionId,
    buildWorkflowProtocolInputValidationRecoveryInstruction(state, toolName, validationDetail, recoveryAttempt),
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
  // Either a real result or the accepted synthetic terminal fallback closes
  // this generation. Never let suppression leak into the next user turn.
  streamState.suppressExpertAutoContinueAssistantText = false
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
  const prototypeVisualRecovery = !cliMsg.is_error && !workflowRecovery && !strictVisualRecovery
    ? await prototypeVisualTerminalRecoveryForResult(sessionId, turn)
    : null
  const commercializationResearchQuestionRecovery = !cliMsg.is_error && !workflowRecovery && !strictVisualRecovery && !prototypeVisualRecovery
    ? await commercializationResearchQuestionRecoveryForResult(sessionId, turn)
    : null
  const expertResearchDeliveryRecovery = !cliMsg.is_error && !workflowRecovery && !strictVisualRecovery && !prototypeVisualRecovery && !commercializationResearchQuestionRecovery
    ? await expertResearchDeliveryTerminalRecoveryForResult(sessionId, turn)
    : null


  if (prototypeVisualRecovery) {
    const recoveryAttempts = prototypeVisualRecovery.kind === 'prototype-ask-user-question'
      ? turn.prototypeAskUserQuestionRecoveryAttempts
      : prototypeVisualRecovery.kind === 'prototype-render-qa'
        ? turn.prototypeRenderRecoveryAttempts
      : prototypeVisualRecovery.kind === 'prototype-visual-review'
        ? turn.prototypeReviewRecoveryAttempts
        : 0
    const requiredErrorCode = prototypeVisualRecovery.kind === 'prototype-ask-user-question'
      ? 'PROTOTYPE_VISUAL_ASK_USER_QUESTION_REQUIRED'
      : prototypeVisualRecovery.kind === 'prototype-production'
        ? 'PROTOTYPE_VISUAL_PRODUCTION_REQUIRED'
      : prototypeVisualRecovery.kind === 'prototype-render-qa'
        ? 'PROTOTYPE_VISUAL_RENDER_QA_REQUIRED'
        : 'PROTOTYPE_VISUAL_REVIEW_REQUIRED'
    const unavailableErrorCode = prototypeVisualRecovery.kind === 'prototype-ask-user-question'
      ? 'PROTOTYPE_VISUAL_ASK_USER_QUESTION_RECOVERY_UNAVAILABLE'
      : prototypeVisualRecovery.kind === 'prototype-production'
        ? 'PROTOTYPE_VISUAL_PRODUCTION_RECOVERY_UNAVAILABLE'
      : prototypeVisualRecovery.kind === 'prototype-render-qa'
        ? 'PROTOTYPE_VISUAL_RENDER_QA_RECOVERY_UNAVAILABLE'
        : 'PROTOTYPE_VISUAL_REVIEW_RECOVERY_UNAVAILABLE'

    if (recoveryAttempts >= 1 || !conversationService.hasSession(sessionId)) {
      sendPrototypeVisualTerminalProtocolError(sessionId, recoveryAttempts >= 1 ? requiredErrorCode : unavailableErrorCode, prototypeVisualRecovery.failureReasons)
      finishWorkflowInteractionTurn(sessionId)
      return
    }

    const streamState = getStreamState(sessionId)
    if (prototypeVisualRecovery.kind === 'prototype-ask-user-question') {
      streamState.prototypeAskUserQuestionRecoveryAttempts += 1
    } else if (prototypeVisualRecovery.kind === 'prototype-render-qa') {
      streamState.prototypeRenderRecoveryAttempts += 1
    } else if (prototypeVisualRecovery.kind === 'prototype-visual-review') {
      streamState.prototypeReviewRecoveryAttempts += 1
    }
    sendToSession(sessionId, {
      type: 'status',
      state: 'thinking',
      verb: prototypeVisualRecovery.kind === 'prototype-ask-user-question'
        ? 'Preparing the required confirmation'
        : prototypeVisualRecovery.kind === 'prototype-production'
          ? 'Completing required prototype files'
        : prototypeVisualRecovery.kind === 'prototype-render-qa'
          ? 'Running required prototype visual QA'
          : 'Critiquing and refining the prototype',
    })
    const sent = conversationService.sendMessage(
      sessionId,
      buildPrototypeVisualTerminalRecoveryInstruction(prototypeVisualRecovery),
    )
    if (sent) return

    sendPrototypeVisualTerminalProtocolError(sessionId, unavailableErrorCode, prototypeVisualRecovery.failureReasons)
    finishWorkflowInteractionTurn(sessionId)
    return
  }

  if (commercializationResearchQuestionRecovery) {
    if (!conversationService.hasSession(sessionId)) {
      sendCommercializationResearchQuestionRecoveryUnavailableError(sessionId)
      finishWorkflowInteractionTurn(sessionId)
      return
    }

    streamState.commercializationResearchQuestionRecoveryAttempts += 1
    sendToSession(sessionId, {
      type: 'status',
      state: 'thinking',
      verb: '正在生成可回答的澄清卡片',
    })
    const sent = conversationService.sendMessage(
      sessionId,
      buildCommercializationResearchQuestionRecoveryInstruction(
        commercializationResearchQuestionRecovery,
        turn.assistantText,
        streamState.commercializationResearchQuestionRecoveryAttempts,
      ),
    )
    if (sent) return

    sendCommercializationResearchQuestionRecoveryUnavailableError(sessionId)
    finishWorkflowInteractionTurn(sessionId)
    return
  }

  if (expertResearchDeliveryRecovery) {
    // A real delivery card can fail after the user selects it if the local
    // Desktop HTTP connection resets. That is not a prose-only model exit, so
    // give the contract recovery a fresh attempt instead of showing the final
    // 鈥渢wice ended in prose鈥?error.
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
        : strictVisualRecovery.kind === 'visual-review' || strictVisualRecovery.kind === 'image-generation-review'
          ? turn.visualReviewRecoveryAttempts
          : turn.recoveryAttempts
    const requiredErrorCode = strictVisualRecovery.kind === 'visual-reference-research'
      ? 'STRICT_VISUAL_REFERENCE_RESEARCH_REQUIRED'
      : strictVisualRecovery.kind === 'image-generation'
        ? 'STRICT_VISUAL_IMAGE_GENERATION_REQUIRED'
        : strictVisualRecovery.kind === 'image-generation-review'
          ? 'STRICT_VISUAL_IMAGE_GENERATION_REVIEW_REQUIRED'
          : strictVisualRecovery.kind === 'render-qa'
            ? 'STRICT_VISUAL_RENDER_QA_REQUIRED'
            : strictVisualRecovery.kind === 'visual-review'
              ? 'STRICT_VISUAL_REVIEW_REQUIRED'
              : 'STRICT_VISUAL_ASK_USER_QUESTION_REQUIRED'
    const unavailableErrorCode = strictVisualRecovery.kind === 'visual-reference-research'
      ? 'STRICT_VISUAL_REFERENCE_RESEARCH_RECOVERY_UNAVAILABLE'
      : strictVisualRecovery.kind === 'image-generation'
        ? 'STRICT_VISUAL_IMAGE_GENERATION_RECOVERY_UNAVAILABLE'
        : strictVisualRecovery.kind === 'image-generation-review'
          ? 'STRICT_VISUAL_IMAGE_GENERATION_REVIEW_RECOVERY_UNAVAILABLE'
          : strictVisualRecovery.kind === 'render-qa'
            ? 'STRICT_VISUAL_RENDER_QA_RECOVERY_UNAVAILABLE'
            : strictVisualRecovery.kind === 'visual-review'
              ? 'STRICT_VISUAL_REVIEW_RECOVERY_UNAVAILABLE'
              : 'STRICT_VISUAL_ASK_USER_QUESTION_RECOVERY_UNAVAILABLE'

    if (strictVisualRecoveryAttempts >= 1) {
      settleStrictVisualTerminalProtocol(sessionId, requiredErrorCode, strictVisualRecovery)
      finishWorkflowInteractionTurn(sessionId)
      return
    }

    if (!conversationService.hasSession(sessionId)) {
      settleStrictVisualTerminalProtocol(sessionId, unavailableErrorCode, strictVisualRecovery)
      finishWorkflowInteractionTurn(sessionId)
      return
    }

    const streamState = getStreamState(sessionId)
    if (strictVisualRecovery.kind === 'visual-reference-research') {
      streamState.strictVisualReferenceResearchRecoveryAttempts += 1
    } else if (strictVisualRecovery.kind === 'render-qa') {
      streamState.strictVisualRenderRecoveryAttempts += 1
    } else if (strictVisualRecovery.kind === 'visual-review' || strictVisualRecovery.kind === 'image-generation-review') {
      streamState.strictVisualReviewRecoveryAttempts += 1
    } else {
      streamState.structuredInteractionRecoveryAttempts += 1
    }
    sendToSession(sessionId, {
      type: 'status',
      state: 'thinking',
      verb: strictVisualRecovery.kind === 'visual-reference-research'
        ? 'Reading locked visual reference websites'
        : strictVisualRecovery.kind === 'image-generation'
          ? 'Generating the required real image'
          : strictVisualRecovery.kind === 'image-generation-review'
            ? 'Critiquing and finalizing the generated image'
            : strictVisualRecovery.kind === 'render-qa'
              ? 'Running required local visual QA'
              : strictVisualRecovery.kind === 'visual-review'
                ? 'Critiquing and finalizing rendered UI'
                : strictVisualRecovery.kind === 'design-direction'
            ? 'Generating required design-direction choices'
            : strictVisualRecovery.kind === 'inspiration-source'
              ? 'Generating required inspiration-source choices'
              : 'Generating required choices',
    })
    const sent = conversationService.sendMessage(
      sessionId,
      buildStrictVisualTerminalRecoveryInstruction(strictVisualRecovery),
    )
    if (sent) return

    settleStrictVisualTerminalProtocol(sessionId, unavailableErrorCode, strictVisualRecovery)
    finishWorkflowInteractionTurn(sessionId)
    return
  }

  if (workflowRecovery) {
    const recovery = workflowRecovery
    if (!conversationService.hasSession(sessionId)) {
      sendWorkflowTerminalRecoveryUnavailableError(sessionId)
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
          verb: recovery.kind === 'ask-user-question' ? 'Generating choices' : 'Continuing workflow',
        })
      }
    }
    const sent = conversationService.sendMessage(
      sessionId,
      buildWorkflowTerminalRecoveryInstruction(
        recovery,
        turn.assistantText,
        streamState.structuredInteractionRecoveryAttempts,
      ),
    )
    if (sent) return

    sendWorkflowTerminalRecoveryUnavailableError(sessionId)
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

  const retainedCallback = retainedSessionOutputCallbacks.get(sessionId)
  if (retainedCallback) {
    retainedSessionOutputCallbacks.delete(sessionId)
    if (!options?.shouldForward) {
      clientOutputCallbacks.set(ws, { sessionId, callback: retainedCallback })
      return
    }
    conversationService.removeOutputCallback(sessionId, retainedCallback)
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
  expertRuntimeBindingKey?: string
  /** Package-scoped template output root taken from the persisted session workDir. */
  expertTemplateFillOutputRoot?: string
  /** ZIP-declared fixed Markdown artifact allowlist for this active Expert only. */
  expertResearchArtifactPolicy?: ExpertResearchArtifactPolicy
  /** True only while a terse commercialization direction awaits one dynamic user clarification. */
  expertRequireInitialDynamicIntake?: boolean
  expertSessionId?: string
  expertSharedPlaywrightSessionId?: string
  expertPlaywrightCdpEndpoint?: string
  expertManagedPlaywrightPresentation?: 'assistable_background' | 'always_visible'
  expertForceVisiblePlaywright?: boolean
  /** Package-scoped SERP pacing for this active Expert session only. */
  expertBrowserSearchPacing?: { minIntervalMs: number }
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
  let expert = workflowIsActive
    ? undefined
    : (transcriptExpert ?? await expertRuntimeSessionStore.get(sessionId))
  if (expert?.mode === 'expert' && expert.status === 'active' && !hasActiveExpertRuntime(expert)) {
    throw new ExpertRuntimeBindingError()
  }
  if (!workflowIsActive && hasActiveExpertRuntime(expert)) {
    const upgradedExpert = await upgradeUiuxImageOnlyRuntime(await restoreTruncatedExpertRuntime(upgradeCommercializationResearchChannelRuntime(expert)))
    if (upgradedExpert !== expert) {
      const persistedSession = await sessionService.getSession(sessionId).catch(() => null)
      await sessionService.appendSessionMetadata(sessionId, {
        workDir: persistedSession?.workDir || persistedSession?.projectRoot || persistedSession?.projectPath,
        expert: upgradedExpert,
      })
      await expertRuntimeSessionStore.save(sessionId, upgradedExpert)
      expert = upgradedExpert
    }
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
  const expertResearchArtifactPolicy = !workflowIsActive && hasActiveExpertRuntime(expert)
    ? expert.runtimeBinding.researchArtifactPolicy
    : undefined
  const expertTemplateFillOutputRoot = resolveExpertTemplateFillOutputRoot(
    expertTemplateFillWrite === true ? expert?.runtimeBinding.templateFillOutputPolicy : undefined,
    (await sessionService.getSession(sessionId).catch(() => null))?.workDir,
  )
  const expertBrowserHumanVerificationHandoff = !workflowIsActive && hasActiveExpertRuntime(expert) &&
    expert.runtimeBinding.researchBrowserPolicy?.desktopHumanVerificationHandoff === true
    ? true
    : undefined
  const expertBrowserVerificationFallbackSearchEngines = !workflowIsActive && hasActiveExpertRuntime(expert)
    ? expert.runtimeBinding.researchBrowserPolicy?.verificationFallbackSearchEngines
    : undefined
  const expertBrowserSearchPacing = !workflowIsActive && hasActiveExpertRuntime(expert) &&
    expert.runtimeBinding.researchBrowserPolicy?.searchEnginePacing?.enabled === true
    ? { minIntervalMs: expert.runtimeBinding.researchBrowserPolicy.searchEnginePacing.minIntervalMs }
    : undefined
  const expertForbidSubagentAskUserQuestion = !workflowIsActive && hasActiveExpertRuntime(expert) &&
    expert.runtimeBinding.researchBrowserPolicy?.forbidSubagentAskUserQuestion === true
    ? true
    : undefined
  // Active Expert sessions deliberately give their main Agent and every
  // delegated Agent the Desktop host's complete currently enabled tool pool.
  const uiuxImageOnlyDelivery = !workflowIsActive && hasActiveExpertRuntime(expert) && isUiuxImageOnlyBinding(expert.runtimeBinding)
  const expertFullToolAccess = !uiuxImageOnlyDelivery && !workflowIsActive && hasActiveExpertRuntime(expert)
    ? true
    : undefined
  const expertClosePlaywrightWhenAgentDone = !workflowIsActive && hasActiveExpertRuntime(expert) &&
    expert.runtimeBinding.researchBrowserPolicy?.closePlaywrightWhenAgentDone === true
    ? true
    : undefined
  const expertSessionId = expertTemplateFillWrite || expertBrowserHumanVerificationHandoff || expertResearchDeliveryPolicy || expertResearchArtifactPolicy
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
        expertRuntimeBindingKey: getExpertProcessBindingKey(expert),
        ...(expertSessionId ? { expertSessionId } : {}),
        ...(expertTemplateFillWrite ? { expertTemplateFillWrite: true } : {}),
        ...(expertTemplateFillOutputRoot ? { expertTemplateFillOutputRoot } : {}),
        ...(expertResearchArtifactPolicy ? { expertResearchArtifactPolicy } : {}),
        ...(expertResearchDeliveryPolicy ? { expertResearchDeliveryPolicy } : {}),
        ...(expertSharedPlaywrightSessionId ? { expertSharedPlaywrightSessionId } : {}),
        ...(expertPlaywrightCdpEndpoint ? { expertPlaywrightCdpEndpoint } : {}),
        ...(expertManagedPlaywrightPresentation ? { expertManagedPlaywrightPresentation } : {}),
        ...(expertForceVisiblePlaywright ? { expertForceVisiblePlaywright: true } : {}),
        ...(expertBrowserHumanVerificationHandoff ? { expertBrowserHumanVerificationHandoff: true } : {}),
        ...(expertBrowserVerificationFallbackSearchEngines?.length
          ? { expertBrowserVerificationFallbackSearchEngines }
          : {}),
        ...(expertBrowserSearchPacing ? { expertBrowserSearchPacing } : {}),
        ...(expertClosePlaywrightWhenAgentDone ? { expertClosePlaywrightWhenAgentDone: true } : {}),
        ...(expertForbidSubagentAskUserQuestion ? { expertForbidSubagentAskUserQuestion: true } : {}),
        ...(expertFullToolAccess ? { expertFullToolAccess: true } : {}),
        ...(uiuxImageOnlyDelivery ? { uiuxImageOnlyDelivery: true } : {}),
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
    'Historical transcript messages, including any earlier 鈥淣o such tool available鈥?result, are not a current tool-availability check and must not be reused as a reason to skip a required workflow tool call.',
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
    // Provider is active 鈥?only consult provider-managed cc-jiangxia settings.
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
    // No provider 鈥?pass model normally
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

function enqueueRuntimeTransition<T>(
  sessionId: string,
  transition: () => Promise<T>,
): Promise<T> {
  return sessionRuntimeTransitionService.run(sessionId, transition).finally(() => {
    if (!sessionRuntimeTransitionService.pending(sessionId)) {
      for (const key of workflowArtifactWriteRecoveryAttempts.keys()) {
        if (key.startsWith(sessionId + ':')) workflowArtifactWriteRecoveryAttempts.delete(key)
      }
    }
  })
}

async function waitForRuntimeTransitionBeforeUserTurn(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
): Promise<{ ok: boolean; waited: boolean }> {
  let waited = false
  let pendingRuntimeTransition = sessionRuntimeTransitionService.pending(sessionId)
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

    const nextTransition = sessionRuntimeTransitionService.pending(sessionId)
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
  // Runtime state must advance even without a UI socket, and only once per event.
  syncSessionChatStateFromMessage(sessionId, message)
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
  expertSearchPacingService.clear(sessionId)
  retainedSessionOutputCallbacks.delete(sessionId)
  conversationService.clearOutputCallbacks(sessionId)
  cleanupSessionRuntimeState(sessionId)

  const clients = activeSessions.get(sessionId)
  if (!clients || clients.size === 0) return false

  activeSessions.delete(sessionId)
  for (const ws of clients) {
    clientOutputCallbacks.delete(ws)
    clientOutboxes.get(ws)?.dispose()
    clientOutboxes.delete(ws)
    clientBackpressureStates.delete(ws)
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
  retainedSessionOutputCallbacks.clear()
  clientBackpressureStates.clear()
  for (const outbox of clientOutboxes.values()) outbox.dispose()
  clientOutboxes.clear()
  runningBackgroundTasks.clear()
  sessionCleanupTimers.clear()
  prewarmIdleTimers.clear()
  clearWorkflowSessionTransitionCoordinatorForTests()
  sessionRuntimeTransitionService.clearForTests()
  runtimeOverrides.clear()
  sessionStartupPromises.clear()
  prewarmPendingSessions.clear()
  prewarmedSessions.clear()
  ephemeralWorkflowStates.clear()
  workflowArtifactWriteRecoveryAttempts.clear()
}
