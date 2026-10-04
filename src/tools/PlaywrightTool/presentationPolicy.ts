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
