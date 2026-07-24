/**
 * Shared per-session serialization for workflow state transitions.
 *
 * HTTP and WebSocket entrypoints run in the same server process. They must
 * participate in one queue so a later read/compute/write transition cannot
 * overwrite an earlier one from the other transport.
 */
const transitionPromises = new Map<string, Promise<unknown>>()

export function enqueueWorkflowSessionTransition<T>(
  sessionId: string,
  transition: () => Promise<T>,
): Promise<T> {
  const previous = transitionPromises.get(sessionId) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(transition)
  const tracked = next.then(() => {}, () => {})
  transitionPromises.set(sessionId, tracked)

  return next.finally(() => {
    if (transitionPromises.get(sessionId) === tracked) {
      transitionPromises.delete(sessionId)
    }
  })
}

export function clearWorkflowSessionTransitionCoordinatorForTests(): void {
  transitionPromises.clear()
}
