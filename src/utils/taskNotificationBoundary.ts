import { getSessionId } from '../bootstrap/state.js'
import { getDesktopWorkflowContext, resolveWorkflowRuntimeState } from '../services/tools/workflowRuntimeStateBridge.js'
import { enqueuePendingNotification, getCommandQueue, subscribeToCommandQueue, taskNotificationOwner, type NotificationState, type TaskNotificationOwner } from './messageQueueManager.js'
import type { QueuedCommand } from '../types/textInputTypes.js'

// Read-only delivery hints. Never write AppState or use this snapshot for tool authorization.
const retries = new Map<string, { timer?: ReturnType<typeof setTimeout>, failures: number, wake: Set<() => void> }>()
function clearRetry(key: string) {
  const retry = retries.get(key)
  if (retry?.timer) clearTimeout(retry.timer)
  retries.delete(key)
}
function retryUnavailable(key: string, wake?: () => void) {
  if (!wake) return
  const retry = retries.get(key) ?? { failures: 0, wake: new Set<() => void>() }
  retry.wake.add(wake)
  if (!retry.timer) {
    retry.failures++
    retry.timer = setTimeout(() => {
      retry.timer = undefined
      const callbacks = [...retry.wake]
      retry.wake.clear()
      for (const callback of callbacks) callback()
    }, Math.min(30_000, 1000 * 2 ** Math.min(retry.failures - 1, 5)))
    retry.timer.unref?.()
  }
  retries.set(key, retry)
}

export async function readTaskNotificationBoundary(
  local: NotificationState,
  options: { timeoutMs?: number, skipDesktopRefresh?: boolean, interruptOnHumanInput?: boolean, wakeOnUnavailable?: () => void } = {},
): Promise<NotificationState> {
  const desktop = getDesktopWorkflowContext()
  if (!desktop) return local
  if (options.skipDesktopRefresh) return { tasks: local.tasks, notificationAuthorityUnavailable: true }
  const key = JSON.stringify([desktop.serverUrl, desktop.sessionId])
  const interrupt = new AbortController()
  const checkHumanInput = () => {
    if (getCommandQueue().some(cmd => cmd.mode !== 'task-notification' || cmd.messageKind === 'user_input')) interrupt.abort()
  }
  const unsubscribe = options.interruptOnHumanInput ? subscribeToCommandQueue(checkHumanInput) : undefined
  if (options.interruptOnHumanInput) checkHumanInput()
  let resolution
  try {
    resolution = await resolveWorkflowRuntimeState(undefined, { timeoutMs: options.timeoutMs ?? 1000, signal: interrupt.signal })
  } finally { unsubscribe?.() }
  if (resolution.source === 'desktop' && resolution.state.sessionId === desktop.sessionId && desktop.sessionId === getSessionId()) {
    clearRetry(key)
    return { tasks: local.tasks, workflow: resolution.state }
  }
  if (!interrupt.signal.aborted) retryUnavailable(key, options.wakeOnUnavailable)
  // Retain machine results until authority recovers. Human commands never consult this flag.
  return { tasks: local.tasks, notificationAuthorityUnavailable: true }
}

export async function enqueueTaskNotificationWithAuthority(
  command: QueuedCommand, capturedLocal: NotificationState, capturedOwner: TaskNotificationOwner,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  if (!getDesktopWorkflowContext()) {
    enqueuePendingNotification(command, capturedOwner)
    return
  }
  const state = await readTaskNotificationBoundary(capturedLocal, options)
  const trusted = taskNotificationOwner(command.taskNotificationId!, state)
  enqueuePendingNotification(command, { ...trusted, sessionId: capturedOwner.sessionId, attempt: capturedOwner.attempt })
}

export function resetTaskNotificationBoundaryRetriesForTests(): void {
  for (const key of retries.keys()) clearRetry(key)
}
