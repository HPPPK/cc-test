export type BrowserContextRecoverySource = 'direct' | 'page' | 'shared' | 'browser' | 'unavailable'

export type BrowserContextCandidate<T> = {
  source: Exclude<BrowserContextRecoverySource, 'unavailable'>
  context?: T
}

export type BrowserContextRecovery<T> = {
  context?: T
  source: BrowserContextRecoverySource
}

/**
 * Selects an already-existing BrowserContext without opening a page or a
 * context. The caller is responsible for validating that each candidate is
 * still usable before passing it here.
 */
export function selectExistingBrowserContext<T>(
  candidates: ReadonlyArray<BrowserContextCandidate<T>>,
): BrowserContextRecovery<T> {
  for (const candidate of candidates) {
    if (candidate.context) return { context: candidate.context, source: candidate.source }
  }
  return { source: 'unavailable' }
}
