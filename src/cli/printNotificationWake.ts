import { getCommandQueue, pruneObsoleteTaskNotifications, subscribeToCommandQueue, taskNotificationReady, type NotificationState } from '../utils/messageQueueManager.js'
import { readTaskNotificationBoundary } from '../utils/taskNotificationBoundary.js'

/** Wake delivery only; the existing SDK run loop owns consumption and authorization. */
export function subscribeIdleTaskNotificationWake(options: {
  canWake: () => boolean
  getState: () => NotificationState
  run: () => void
  onError: (error: unknown) => void
}): () => void {
  let disposed = false
  let checking = false
  const mainNotice = (command: ReturnType<typeof getCommandQueue>[number]) => command.mode === 'task-notification'
    && command.messageKind !== 'user_input' && command.agentId === undefined
  const check = () => {
    if (disposed || checking || !options.canWake() || !getCommandQueue().some(mainNotice)) return
    checking = true
    void (async () => {
      try {
        const state = await readTaskNotificationBoundary(options.getState(), {
          interruptOnHumanInput: true,
          wakeOnUnavailable: check,
        })
        if (disposed || !options.canWake()) return
        pruneObsoleteTaskNotifications(state)
        if (getCommandQueue().some(command => mainNotice(command) && taskNotificationReady(command, state))) options.run()
      } catch (error) {
        options.onError(error)
      } finally {
        checking = false
      }
    })()
  }
  const unsubscribe = subscribeToCommandQueue(check)
  return () => { disposed = true; unsubscribe() }
}
