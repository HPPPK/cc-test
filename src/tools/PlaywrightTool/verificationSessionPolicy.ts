/** A visible CAPTCHA page remains owned by the user until it is explicitly resolved. */
export function shouldSchedulePlaywrightIdleClose(humanVerificationPending: boolean): boolean {
  return !humanVerificationPending
}
