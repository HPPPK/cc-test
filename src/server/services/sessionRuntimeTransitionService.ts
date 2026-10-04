/** One queue per session for CLI startup, runtime changes, and Expert entry/exit.
 * Callers already inside run() must use their non-queuing implementation.
 * Queue state is process-local; it never changes persisted session formats.
 */
export class SessionRuntimeTransitionService {
  private readonly transitions = new Map<string, Promise<void>>()

  run<T>(sessionId: string, transition: () => Promise<T>): Promise<T> {
    const previous = this.transitions.get(sessionId) ?? Promise.resolve()
    const result = previous.catch(() => {}).then(transition)
    const barrier = result.then(() => {}).finally(() => {
      if (this.transitions.get(sessionId) === barrier) this.transitions.delete(sessionId)
    })
    this.transitions.set(sessionId, barrier)
    // The caller and waiters still receive the error; avoid an unhandled rejection
    // on the separate void barrier when there are no waiters.
    void barrier.catch(() => {})
    return result
  }

  pending(sessionId: string): Promise<void> | undefined {
    return this.transitions.get(sessionId)
  }

  clearForTests(): void {
    this.transitions.clear()
  }
}

export const sessionRuntimeTransitionService = new SessionRuntimeTransitionService()
