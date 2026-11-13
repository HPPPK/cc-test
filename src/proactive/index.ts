/** Proactive execution is an internal feature absent from the public build. */
export class UnsupportedFeatureError extends Error {
  readonly feature = 'proactive'

  constructor() {
    super('Proactive mode is unavailable in this build')
    this.name = 'UnsupportedFeatureError'
  }
}

export function isProactiveActive(): boolean {
  return false
}

export function isProactivePaused(): boolean {
  return false
}

export function getNextTickAt(): number | null {
  return null
}

export function activateProactive(_source: 'command'): void {
  throw new UnsupportedFeatureError()
}

export function deactivateProactive(): void {
  throw new UnsupportedFeatureError()
}

export function pauseProactive(): void {
  throw new UnsupportedFeatureError()
}

export function resumeProactive(): void {
  throw new UnsupportedFeatureError()
}

export function setContextBlocked(_blocked: boolean): void {
  throw new UnsupportedFeatureError()
}

export function subscribeToProactiveChanges(_listener: () => void): () => void {
  throw new UnsupportedFeatureError()
}
