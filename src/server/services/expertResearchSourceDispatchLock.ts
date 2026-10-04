const sessionTails = new Map<string, Promise<void>>()

/**
 * Serializes the small read-merge-write critical section used by source-package
 * receipts and one-shot recovery markers. The lock is process-local because all
 * Desktop API and WebSocket writers share this server process; durable state is
 * still written to the ordinary session stores inside the callback.
 */
export async function withExpertResearchSourceDispatchLock<T>(
  sessionId: string,
  action: () => Promise<T>,
): Promise<T> {
  const previous = sessionTails.get(sessionId) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const tail = previous.then(() => gate, () => gate)
  sessionTails.set(sessionId, tail)

  await previous.catch(() => {})
  try {
    return await action()
  } finally {
    release()
    if (sessionTails.get(sessionId) === tail) sessionTails.delete(sessionId)
  }
}
