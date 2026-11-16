export type ManagedPresentation = 'assistable_background' | 'always_visible'
export type WindowPresentationTarget = 'minimized' | 'foreground'

/** Default window state when a managed Expert browser session starts. */
export function initialWindowPresentationTarget(
  presentation: ManagedPresentation | undefined,
): WindowPresentationTarget {
  return presentation === 'assistable_background' ? 'minimized' : 'foreground'
}

/**
 * Only the runtime-owned assistable mode starts an isolated Chromium window
 * off-screen and minimized. This is a neutral startup concern: after that
 * one initial handoff, the runner deliberately does not move, minimize,
 * restore, or foreground the window again.
 */
export function managedPresentationLaunchArgs(
  presentation: ManagedPresentation | undefined,
): string[] {
  if (presentation !== 'assistable_background') return []
  return [
    '--start-minimized',
    '--window-position=-32000,-32000',
    '--window-size=1,1',
  ]
}

export type PresentationControl = { endpoint: string; sessionId: string; browserKey?: string }

export function consumePresentationRequest(consumed: Map<string, number>, control: PresentationControl, generation: number): boolean {
  if (!Number.isSafeInteger(generation) || generation <= 0) return false
  const key = JSON.stringify([control.endpoint, control.sessionId, control.browserKey ?? ''])
  if (generation <= (consumed.get(key) ?? 0)) return false
  // Mark synchronously before any native operation awaits: two sibling polling
  // responses for the same click must never restore the shared window twice.
  consumed.set(key, generation)
  return true
}
