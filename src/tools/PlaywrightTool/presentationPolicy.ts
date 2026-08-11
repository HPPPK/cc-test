export type ManagedPresentation = 'assistable_background' | 'always_visible'
export type WindowPresentationTarget = 'minimized' | 'foreground'

/** Default window state when a managed Expert browser session starts. */
export function initialWindowPresentationTarget(
  presentation: ManagedPresentation | undefined,
): WindowPresentationTarget {
  return presentation === 'assistable_background' ? 'minimized' : 'foreground'
}

/**
 * assistable_background research must not steal focus. Only an explicit
 * verification handoff or a user "show browser" request may call bringToFront.
 */
export function shouldCallBringToFront(
  presentation: ManagedPresentation | undefined,
  target: WindowPresentationTarget | undefined,
): boolean {
  if (presentation !== 'assistable_background') return true
  return target === 'foreground'
}

/**
 * Chromium on Windows often restores a minimized window after navigation or
 * tab changes. Re-apply minimize after those actions so research does not flash.
 */
export function shouldReassertMinimizedAfterAction(
  presentation: ManagedPresentation | undefined,
  target: WindowPresentationTarget | undefined,
  actionType: string,
): boolean {
  if (presentation !== 'assistable_background' || target !== 'minimized') return false
  return [
    'navigate',
    'reload',
    'go_back',
    'go_forward',
    'new_tab',
    'switch_tab',
    'close_tab',
    'click',
    'double_click',
    'press',
    'script',
  ].includes(actionType)
}

/** After a run, keep the window foreground only while a CAPTCHA gate is live. */
export function windowTargetAfterRun(
  presentation: ManagedPresentation | undefined,
  humanVerificationPending: boolean,
): WindowPresentationTarget | null {
  if (presentation !== 'assistable_background') return null
  return humanVerificationPending ? 'foreground' : 'minimized'
}
