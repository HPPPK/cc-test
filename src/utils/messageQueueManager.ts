import { feature } from 'bun:bundle'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { Permutations } from 'src/types/utils.js'
import { getSessionId } from '../bootstrap/state.js'
import type { AppState } from '../state/AppState.js'
import type {
  QueueOperation,
  QueueOperationMessage,
} from '../types/messageQueueTypes.js'
import type {
  EditablePromptInputMode,
  PromptInputMode,
  QueuedCommand,
  QueuePriority,
} from '../types/textInputTypes.js'
import type { PastedContent } from './config.js'
import { messageKindMetadata } from './messageKind.js'
import { extractTextContent } from './messages.js'
import { objectGroupBy } from './objectGroupBy.js'
import { recordQueueOperation } from './sessionStorage.js'
import { createSignal } from './signal.js'

export type SetAppState = (f: (prev: AppState) => AppState) => void

// ============================================================================
// Logging helper
// ============================================================================

function logOperation(operation: QueueOperation, content?: string): void {
  const sessionId = getSessionId()
  const queueOp: QueueOperationMessage = {
    type: 'queue-operation',
    operation,
    timestamp: new Date().toISOString(),
    sessionId,
    ...(content !== undefined && { content }),
  }
  void recordQueueOperation(queueOp)
}

// ============================================================================
// Unified command queue (module-level, independent of React state)
//
// All commands — user input, task notifications, orphaned permissions — go
// through this single queue. React components subscribe via
// useSyncExternalStore (subscribeToCommandQueue / getCommandQueueSnapshot).
// Non-React code (print.ts streaming loop) reads directly via
// getCommandQueue() / getCommandQueueLength().
//
// Priority determines dequeue order: 'now' > 'next' > 'later'.
// Within the same priority, commands are processed FIFO.
// ============================================================================

const commandQueue: QueuedCommand[] = []
export type TaskNotificationOwner = {
  sessionId?: string
  attempt?: number
  runId?: string
  phaseId?: string
  batchId?: string
  role?: string
  workflowAttempt?: number
}
type NotificationSnapshot = {
  runId?: string, phaseId?: string, batchId?: string, workflowRole?: string,
  agentRunId?: string, agentId?: string, attempt?: number, status?: string,
}
export type NotificationState = { tasks?: Record<string, { startTime?: number }>, workflow?: unknown, notificationAuthorityUnavailable?: boolean }
type NotificationWorkflow = {
  mode?: string, sessionId?: string, activeWorkflowRunId?: string, activePhaseId?: string | null, runStatus?: string, status?: string,
  pendingRoute?: unknown, pendingConfirmation?: unknown,
  runtimeContract?: { phaseStates?: Record<string, { taskSnapshots?: NotificationSnapshot[] }> },
}
// Runtime-only provenance: no queue or transcript persistence format changes.
const notificationOwners = new WeakMap<QueuedCommand, TaskNotificationOwner>()
const consumedTaskNotifications = new Set<string>()
function notificationKey(command: QueuedCommand, owner = notificationOwners.get(command)): string | undefined {
  // Managed resumes retain the local task/startTime; the workflow receipt is
  // the attempt authority. Keep the old startTime identity for generic tasks.
  const attempt = owner?.workflowAttempt === undefined ? owner?.attempt ?? null
    : ['workflow', owner.runId ?? null, owner.phaseId ?? null, owner.batchId ?? null, owner.role ?? null, owner.workflowAttempt]
  return command.mode === 'task-notification' && command.messageKind !== 'user_input' && command.taskNotificationId ? JSON.stringify([owner?.sessionId ?? getSessionId(), command.taskNotificationId, attempt, command.agentId ?? null]) : undefined
}
function rememberConsumed(key: string): void {
  consumedTaskNotifications.add(key)
  if (consumedTaskNotifications.size > 2000) consumedTaskNotifications.delete(consumedTaskNotifications.values().next().value!)
}
function notificationWorkflow(state: NotificationState): NotificationWorkflow | undefined {
  return state.workflow && typeof state.workflow === 'object' ? state.workflow as NotificationWorkflow : undefined
}
export function taskNotificationOwner(taskId: string, state: NotificationState): TaskNotificationOwner {
  const workflow = notificationWorkflow(state)
  const snapshot = Object.values(workflow?.runtimeContract?.phaseStates ?? {}).flatMap(phase => phase.taskSnapshots ?? [])
    .find(task => (task.agentRunId ?? task.agentId) === taskId)
  return { sessionId: workflow?.sessionId ?? getSessionId(), attempt: state.tasks?.[taskId]?.startTime,
    ...(snapshot ? { runId: snapshot.runId, phaseId: snapshot.phaseId, batchId: snapshot.batchId,
      role: snapshot.workflowRole, workflowAttempt: snapshot.attempt } : {}) }
}
export function acknowledgeTaskNotification(taskId: string, attempt?: number): void {
  for (const command of [...commandQueue]) {
    const owner = notificationOwners.get(command)
    if (command.mode !== 'task-notification' || command.taskNotificationId !== taskId
      || command.messageKind === 'user_input'
      || owner?.sessionId !== getSessionId() || (attempt !== undefined && owner.attempt !== attempt)) continue
    const key = notificationKey(command)
    if (key) rememberConsumed(key)
    remove([command])
  }
  // Also cover completion read immediately before its producer enqueues.
  if (attempt !== undefined) rememberConsumed(JSON.stringify([getSessionId(), taskId, attempt, null]))
}
export function acknowledgeTaskNotifications(commands: readonly QueuedCommand[]): void {
  for (const command of commands) {
    if (notificationOwners.get(command)?.sessionId !== getSessionId()) continue
    const key = notificationKey(command)
    if (command.mode === 'task-notification' && key) rememberConsumed(key)
  }
}
export function taskNotificationsWaitingForUser(state: NotificationState): boolean {
  if (state.notificationAuthorityUnavailable) return true
  const workflow = notificationWorkflow(state)
  return workflow?.mode === 'workflow' && Boolean(workflow.pendingConfirmation || workflow.pendingRoute
    || ['waiting_for_user', 'paused', 'blocked', 'stopped', 'cancelled', 'completed'].includes(workflow.runStatus ?? '')
    || ['paused', 'completed', 'cancelled', 'exited'].includes(workflow.status ?? ''))
}
export function taskNotificationReady(command: QueuedCommand, state: NotificationState): boolean {
  if (command.mode !== 'task-notification') return true
  const owner = notificationOwners.get(command)
  if (owner && owner.sessionId !== getSessionId()) return false
  if (command.messageKind === 'user_input') return true
  return !taskNotificationsWaitingForUser(state)
}
export function pruneObsoleteTaskNotifications(state: NotificationState): void {
  const workflow = notificationWorkflow(state)
  if (workflow?.sessionId && workflow.sessionId !== getSessionId()) return
  const snapshots = Object.values(workflow?.runtimeContract?.phaseStates ?? {}).flatMap(phase => phase.taskSnapshots ?? [])
  const obsolete = commandQueue.filter(command => {
    if (command.mode !== 'task-notification' || command.messageKind === 'user_input' || !command.taskNotificationId) return false
    const owner = notificationOwners.get(command)
    if (!owner || owner.sessionId !== getSessionId()) return false
    const key = notificationKey(command)
    if (key && consumedTaskNotifications.has(key)) return true
    if (owner.attempt !== undefined && (state.tasks?.[command.taskNotificationId]?.startTime ?? owner.attempt) > owner.attempt) return true
    if (!owner.runId || !owner.phaseId || !owner.batchId || !owner.role) return false
    if ((workflow?.activeWorkflowRunId && workflow.activeWorkflowRunId !== owner.runId)
      || (workflow?.activePhaseId && workflow.activePhaseId !== owner.phaseId)) return true
    const latest = snapshots.find(task => task.runId === owner.runId && task.phaseId === owner.phaseId
      && task.batchId === owner.batchId && task.workflowRole === owner.role)
    const currentAgent = latest?.agentRunId ?? latest?.agentId
    // A confirmed scope/rework reset explicitly revokes the former owner.
    // Missing metadata or an absent slot alone is not evidence of supersession.
    if (latest && !currentAgent && ['pending', 'waiting_dependency'].includes(latest.status ?? '')) return true
    return Boolean(currentAgent && (currentAgent !== command.taskNotificationId
      || (owner.workflowAttempt !== undefined && (latest?.attempt ?? owner.workflowAttempt) > owner.workflowAttempt)))
  })
  acknowledgeTaskNotifications(obsolete)
  remove(obsolete)
}
export function takeTaskNotificationBatch(first: QueuedCommand, state: NotificationState): QueuedCommand[] {
  if (first.mode !== 'task-notification' || first.messageKind === 'user_input') return [first]
  return [first, ...dequeueAllMatching(command => command.mode === 'task-notification'
    && command.messageKind !== 'user_input' && command.agentId === first.agentId && taskNotificationReady(command, state))]
}
export function restoreTaskNotificationBatch(commands: readonly QueuedCommand[]): void {
  for (const command of commands) {
    if (command.mode === 'task-notification') enqueuePendingNotification(command, notificationOwners.get(command))
  }
}
/** Frozen snapshot — recreated on every mutation for useSyncExternalStore. */
let snapshot: readonly QueuedCommand[] = Object.freeze([])
const queueChanged = createSignal()

function notifySubscribers(): void {
  snapshot = Object.freeze([...commandQueue])
  queueChanged.emit()
}

// ============================================================================
// useSyncExternalStore interface
// ============================================================================

/**
 * Subscribe to command queue changes.
 * Compatible with React's useSyncExternalStore.
 */
export const subscribeToCommandQueue = queueChanged.subscribe

/**
 * Get current snapshot of the command queue.
 * Compatible with React's useSyncExternalStore.
 * Returns a frozen array that only changes reference on mutation.
 */
export function getCommandQueueSnapshot(): readonly QueuedCommand[] {
  return snapshot
}

// ============================================================================
// Read operations (for non-React code)
// ============================================================================

/**
 * Get a mutable copy of the current queue.
 * Use for one-off reads where you need the actual commands.
 */
export function getCommandQueue(): QueuedCommand[] {
  return [...commandQueue]
}

/**
 * Get the current queue length without copying.
 */
export function getCommandQueueLength(): number {
  return commandQueue.length
}

export function hasPendingTaskNotification(taskId: string): boolean {
  return commandQueue.some(command => command.mode === 'task-notification' && command.taskNotificationId === taskId
    && (notificationOwners.get(command)?.sessionId ?? getSessionId()) === getSessionId())
}

/**
 * Check if there are commands in the queue.
 */
export function hasCommandsInQueue(): boolean {
  return commandQueue.length > 0
}

/**
 * Trigger a re-check by notifying subscribers.
 * Use after async processing completes to ensure remaining commands
 * are picked up by useSyncExternalStore consumers.
 */
export function recheckCommandQueue(): void {
  if (commandQueue.length > 0) {
    notifySubscribers()
  }
}

// ============================================================================
// Write operations
// ============================================================================

/**
 * Add a command to the queue.
 * Used for user-initiated commands (prompt, bash, orphaned-permission).
 * Defaults priority to 'next' (processed before task notifications).
 */
export function enqueue(command: QueuedCommand): void {
  commandQueue.push({ ...command, priority: command.priority ?? 'next' })
  notifySubscribers()
  logOperation(
    'enqueue',
    typeof command.value === 'string' ? command.value : undefined,
  )
}

/**
 * Add a task notification to the queue.
 * Convenience wrapper that defaults priority to 'later' so user input
 * is never starved by system messages.
 */
export function enqueuePendingNotification(command: QueuedCommand, owner?: TaskNotificationOwner): void {
  // This producer knows these are generated notifications. Preserve an explicit
  // caller kind (for example a human teammate message) and independent flags.
  const queued: QueuedCommand = {
    ...command,
    ...messageKindMetadata({ ...command, messageKind: command.messageKind ?? 'internal_notification' }),
    priority: command.priority ?? 'later',
  }
  notificationOwners.set(queued, { ...owner, sessionId: owner?.sessionId ?? getSessionId() })
  const key = notificationKey(queued)
  if (key && (consumedTaskNotifications.has(key) || commandQueue.some(item => notificationKey(item) === key))) return
  commandQueue.push(queued)
  notifySubscribers()
  logOperation(
    'enqueue',
    typeof command.value === 'string' ? command.value : undefined,
  )
}

const PRIORITY_ORDER: Record<QueuePriority, number> = {
  now: 0,
  next: 1,
  later: 2,
}

/**
 * Remove and return the highest-priority command, or undefined if empty.
 * Within the same priority level, commands are dequeued FIFO.
 *
 * An optional `filter` narrows the candidates: only commands for which the
 * predicate returns `true` are considered. Non-matching commands stay in the
 * queue untouched. This lets between-turn drains (SDK, REPL) restrict to
 * main-thread commands (`cmd.agentId === undefined`) without restructuring
 * the existing while-loop patterns.
 */
export function dequeue(
  filter?: (cmd: QueuedCommand) => boolean,
): QueuedCommand | undefined {
  if (commandQueue.length === 0) {
    return undefined
  }

  // Find the first command with the highest priority (respecting filter)
  let bestIdx = -1
  let bestPriority = Infinity
  for (let i = 0; i < commandQueue.length; i++) {
    const cmd = commandQueue[i]!
    if (filter && !filter(cmd)) continue
    const priority = PRIORITY_ORDER[cmd.priority ?? 'next']
    if (priority < bestPriority) {
      bestIdx = i
      bestPriority = priority
    }
  }

  if (bestIdx === -1) return undefined

  const [dequeued] = commandQueue.splice(bestIdx, 1)
  notifySubscribers()
  logOperation('dequeue')
  return dequeued
}

/**
 * Remove and return all commands from the queue.
 * Logs a dequeue operation for each command.
 */
export function dequeueAll(): QueuedCommand[] {
  if (commandQueue.length === 0) {
    return []
  }

  const commands = [...commandQueue]
  commandQueue.length = 0
  notifySubscribers()

  for (const _cmd of commands) {
    logOperation('dequeue')
  }

  return commands
}

/**
 * Return the highest-priority command without removing it, or undefined if empty.
 * Accepts an optional `filter` — only commands passing the predicate are considered.
 */
export function peek(
  filter?: (cmd: QueuedCommand) => boolean,
): QueuedCommand | undefined {
  if (commandQueue.length === 0) {
    return undefined
  }
  let bestIdx = -1
  let bestPriority = Infinity
  for (let i = 0; i < commandQueue.length; i++) {
    const cmd = commandQueue[i]!
    if (filter && !filter(cmd)) continue
    const priority = PRIORITY_ORDER[cmd.priority ?? 'next']
    if (priority < bestPriority) {
      bestIdx = i
      bestPriority = priority
    }
  }
  if (bestIdx === -1) return undefined
  return commandQueue[bestIdx]
}

/**
 * Remove and return all commands matching a predicate, preserving priority order.
 * Non-matching commands stay in the queue.
 */
export function dequeueAllMatching(
  predicate: (cmd: QueuedCommand) => boolean,
): QueuedCommand[] {
  const matched: QueuedCommand[] = []
  const remaining: QueuedCommand[] = []
  for (const cmd of commandQueue) {
    if (predicate(cmd)) {
      matched.push(cmd)
    } else {
      remaining.push(cmd)
    }
  }
  if (matched.length === 0) {
    return []
  }
  commandQueue.length = 0
  commandQueue.push(...remaining)
  notifySubscribers()
  for (const _cmd of matched) {
    logOperation('dequeue')
  }
  return matched
}

/**
 * Remove specific commands from the queue by reference identity.
 * Callers must pass the same object references that are in the queue
 * (e.g. from getCommandsByMaxPriority). Logs a 'remove' operation for each.
 */
export function remove(commandsToRemove: QueuedCommand[]): void {
  if (commandsToRemove.length === 0) {
    return
  }

  const before = commandQueue.length
  for (let i = commandQueue.length - 1; i >= 0; i--) {
    if (commandsToRemove.includes(commandQueue[i]!)) {
      commandQueue.splice(i, 1)
    }
  }

  if (commandQueue.length !== before) {
    notifySubscribers()
  }

  for (const _cmd of commandsToRemove) {
    logOperation('remove')
  }
}

/**
 * Remove commands matching a predicate.
 * Returns the removed commands.
 */
export function removeByFilter(
  predicate: (cmd: QueuedCommand) => boolean,
): QueuedCommand[] {
  const removed: QueuedCommand[] = []
  for (let i = commandQueue.length - 1; i >= 0; i--) {
    if (predicate(commandQueue[i]!)) {
      removed.unshift(commandQueue.splice(i, 1)[0]!)
    }
  }

  if (removed.length > 0) {
    notifySubscribers()
    for (const _cmd of removed) {
      logOperation('remove')
    }
  }

  return removed
}

/**
 * Clear all commands from the queue.
 * Used by ESC cancellation to discard queued notifications.
 */
export function clearCommandQueue(): void {
  if (commandQueue.length === 0) {
    return
  }
  commandQueue.length = 0
  notifySubscribers()
}

/**
 * Clear all commands and reset snapshot.
 * Used for test cleanup.
 */
export function resetCommandQueue(): void {
  commandQueue.length = 0
  consumedTaskNotifications.clear()
  snapshot = Object.freeze([])
}

// ============================================================================
// Editable mode helpers
// ============================================================================

const NON_EDITABLE_MODES = new Set<PromptInputMode>([
  'task-notification',
] satisfies Permutations<Exclude<PromptInputMode, EditablePromptInputMode>>)

export function isPromptInputModeEditable(
  mode: PromptInputMode,
): mode is EditablePromptInputMode {
  return !NON_EDITABLE_MODES.has(mode)
}

/**
 * Whether this queued command can be pulled into the input buffer via UP/ESC.
 * System-generated commands (proactive ticks, scheduled tasks, plan
 * verification, channel messages) contain raw XML and must not leak into
 * the user's input.
 */
export function isQueuedCommandEditable(cmd: QueuedCommand): boolean {
  return isPromptInputModeEditable(cmd.mode) && !cmd.isMeta
}

/**
 * Whether this queued command should render in the queue preview under the
 * prompt. Superset of editable — channel messages show (so the keyboard user
 * sees what arrived) but stay non-editable (raw XML).
 */
export function isQueuedCommandVisible(cmd: QueuedCommand): boolean {
  if (
    (feature('KAIROS') || feature('KAIROS_CHANNELS')) &&
    cmd.origin?.kind === 'channel'
  )
    return true
  return isQueuedCommandEditable(cmd)
}

/**
 * Extract text from a queued command value.
 * For strings, returns the string.
 * For ContentBlockParam[], extracts text from text blocks.
 */
function extractTextFromValue(value: string | ContentBlockParam[]): string {
  return typeof value === 'string' ? value : extractTextContent(value, '\n')
}

/**
 * Extract images from ContentBlockParam[] and convert to PastedContent format.
 * Returns empty array for string values or if no images found.
 */
function extractImagesFromValue(
  value: string | ContentBlockParam[],
  startId: number,
): PastedContent[] {
  if (typeof value === 'string') {
    return []
  }

  const images: PastedContent[] = []
  let imageIndex = 0
  for (const block of value) {
    if (block.type === 'image' && block.source.type === 'base64') {
      images.push({
        id: startId + imageIndex,
        type: 'image',
        content: block.source.data,
        mediaType: block.source.media_type,
        filename: `image${imageIndex + 1}`,
      })
      imageIndex++
    }
  }
  return images
}

export type PopAllEditableResult = {
  text: string
  cursorOffset: number
  images: PastedContent[]
}

/**
 * Pop all editable commands and combine them with current input for editing.
 * Notification modes (task-notification) are left in the queue
 * to be auto-processed later.
 * Returns object with combined text, cursor offset, and images to restore.
 * Returns undefined if no editable commands in queue.
 */
export function popAllEditable(
  currentInput: string,
  currentCursorOffset: number,
): PopAllEditableResult | undefined {
  if (commandQueue.length === 0) {
    return undefined
  }

  const { editable = [], nonEditable = [] } = objectGroupBy(
    [...commandQueue],
    cmd => (isQueuedCommandEditable(cmd) ? 'editable' : 'nonEditable'),
  )

  if (editable.length === 0) {
    return undefined
  }

  // Extract text from queued commands (handles both strings and ContentBlockParam[])
  const queuedTexts = editable.map(cmd => extractTextFromValue(cmd.value))
  const newInput = [...queuedTexts, currentInput].filter(Boolean).join('\n')

  // Calculate cursor offset: length of joined queued commands + 1 + current cursor offset
  const cursorOffset = queuedTexts.join('\n').length + 1 + currentCursorOffset

  // Extract images from queued commands
  const images: PastedContent[] = []
  let nextImageId = Date.now() // Use timestamp as base for unique IDs
  for (const cmd of editable) {
    // handlePromptSubmit queues images in pastedContents (value is a string).
    // Preserve the original PastedContent id so imageStore lookups still work.
    if (cmd.pastedContents) {
      for (const content of Object.values(cmd.pastedContents)) {
        if (content.type === 'image') {
          images.push(content)
        }
      }
    }
    // Bridge/remote commands may embed images directly in ContentBlockParam[].
    const cmdImages = extractImagesFromValue(cmd.value, nextImageId)
    images.push(...cmdImages)
    nextImageId += cmdImages.length
  }

  for (const command of editable) {
    logOperation(
      'popAll',
      typeof command.value === 'string' ? command.value : undefined,
    )
  }

  // Replace queue contents with only the non-editable commands
  commandQueue.length = 0
  commandQueue.push(...nonEditable)
  notifySubscribers()

  return { text: newInput, cursorOffset, images }
}

// ============================================================================
// Backward-compatible aliases (deprecated — prefer new names)
// ============================================================================

/** @deprecated Use subscribeToCommandQueue */
export const subscribeToPendingNotifications = subscribeToCommandQueue

/** @deprecated Use getCommandQueueSnapshot */
export function getPendingNotificationsSnapshot(): readonly QueuedCommand[] {
  return snapshot
}

/** @deprecated Use hasCommandsInQueue */
export const hasPendingNotifications = hasCommandsInQueue

/** @deprecated Use getCommandQueueLength */
export const getPendingNotificationsCount = getCommandQueueLength

/** @deprecated Use recheckCommandQueue */
export const recheckPendingNotifications = recheckCommandQueue

/** @deprecated Use dequeue */
export function dequeuePendingNotification(): QueuedCommand | undefined {
  return dequeue()
}

/** @deprecated Use resetCommandQueue */
export const resetPendingNotifications = resetCommandQueue

/** @deprecated Use clearCommandQueue */
export const clearPendingNotifications = clearCommandQueue

/**
 * Get commands at or above a given priority level without removing them.
 * Useful for mid-chain draining where only urgent items should be processed.
 *
 * Priority order: 'now' (0) > 'next' (1) > 'later' (2).
 * Passing 'now' returns only now-priority commands; 'later' returns everything.
 */
export function getCommandsByMaxPriority(
  maxPriority: QueuePriority,
): QueuedCommand[] {
  const threshold = PRIORITY_ORDER[maxPriority]
  return commandQueue.filter(
    cmd => PRIORITY_ORDER[cmd.priority ?? 'next'] <= threshold,
  )
}

/**
 * Returns true if the command is a slash command that should be routed through
 * processSlashCommand rather than sent to the model as text.
 *
 * Commands with `skipSlashCommands` (e.g. bridge/CCR messages) are NOT treated
 * as slash commands — their text is meant for the model.
 */
export function isSlashCommand(cmd: QueuedCommand): boolean {
  return (
    typeof cmd.value === 'string' &&
    cmd.value.trim().startsWith('/') &&
    !cmd.skipSlashCommands
  )
}
