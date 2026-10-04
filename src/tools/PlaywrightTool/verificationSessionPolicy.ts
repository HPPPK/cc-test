// One shared budget, not a fresh multi-minute wait for every URL.
export const HUMAN_VERIFICATION_WAIT_MS = 120_000

type VerificationSession<Page> = {
  page: Page
  ownedPages: Set<Page>
  humanVerificationGate?: { createdAt?: number }
  preservedVerificationPages?: Set<Page>
}

export function parkHumanVerificationPage<Page>(session: VerificationSession<Page>): void {
  session.preservedVerificationPages ??= new Set<Page>()
  session.preservedVerificationPages.add(session.page)
  session.ownedPages.delete(session.page)
  session.humanVerificationGate = undefined
}

export function expireHumanVerificationGate<Page>(session: VerificationSession<Page>, now = Date.now()): boolean {
  const createdAt = session.humanVerificationGate?.createdAt
  if (createdAt === undefined || now - createdAt < HUMAN_VERIFICATION_WAIT_MS) return false
  parkHumanVerificationPage(session)
  return true
}

type SharedVerificationAction = {
  type?: string
  url?: string
}

type SharedVerificationBlockedRequest = {
  actions?: SharedVerificationAction[]
}

type SharedVerificationGate = {
  gateId: string
  finalUrl: string
  verificationKind: string
}

/** A visible CAPTCHA page remains owned by the user until it is explicitly resolved. */
export function shouldSchedulePlaywrightIdleClose(humanVerificationPending: boolean): boolean {
  return !humanVerificationPending
}

/**
 * Builds the result for a sibling Agent that was paused before its own browser
 * request ran. Only the sibling request URL and explicit verification metadata
 * are returned; page text, links, title, and action steps from the verification
 * owner can never enter this result.
 */
export function buildSharedVerificationBlockedResult(
  request: SharedVerificationBlockedRequest,
  gate: SharedVerificationGate,
  blockedSessionUrl = '',
) {
  const requestedUrl = request.actions?.find((action) =>
    (action.type === 'navigate' || action.type === 'new_tab')
    && typeof action.url === 'string'
    && action.url.trim().length > 0,
  )?.url?.trim()
  const safeSessionUrl = blockedSessionUrl.trim() !== gate.finalUrl.trim()
    ? blockedSessionUrl.trim()
    : ''

  return {
    url: requestedUrl || safeSessionUrl,
    title: '',
    text: '',
    links: [],
    steps: [],
    accessLimited: true,
    verificationGateId: gate.gateId,
    sharedHumanVerificationBlocked: true,
    error: 'EXPERT_HUMAN_VERIFICATION_PENDING: ' + gate.verificationKind
      + '. This request was not executed because another research worker owns the shared browser verification page. Wait for that verification decision, then retry this request unchanged.',
  }
}
