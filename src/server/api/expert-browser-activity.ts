import { ApiError } from '../middleware/errorHandler.js'
import { hasActiveExpertRuntime } from '../services/expertRuntimeBindingService.js'
import { expertRuntimeSessionStore } from '../services/expertRuntimeSessionStore.js'
import { expertBrowserActivityService, type ExpertBrowserActivityStatus } from '../services/expertBrowserActivityService.js'
import { expertHumanVerificationService } from '../services/expertHumanVerificationService.js'

const STATUSES = new Set<ExpertBrowserActivityStatus>(['researching', 'awaiting_verification', 'resumed', 'completed', 'access_limited'])

type Payload = {
  sessionId?: unknown
  action?: unknown
  status?: unknown
  currentTarget?: unknown
  checkedTarget?: unknown
  connectionKind?: unknown
  browserKey?: unknown
  showGeneration?: unknown
  presentationConfirmed?: unknown
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

async function assertAuthorized(sessionId: string): Promise<void> {
  const expert = await expertRuntimeSessionStore.get(sessionId)
  const policy = expert?.runtimeBinding?.researchBrowserPolicy
  if (!hasActiveExpertRuntime(expert) || policy?.desktopHumanVerificationHandoff !== true || (
    policy.forceVisiblePlaywright !== true && policy.managedPresentationDefault === undefined
  )) {
    throw new ApiError(403, 'The current session is not authorized to publish Expert browser activity.', 'FORBIDDEN')
  }
}

export async function handleExpertBrowserActivityApi(req: Request, url: URL, segments: string[]): Promise<Response> {
  if (segments.length !== 2) throw ApiError.notFound('Expert browser activity route not found')
  if (req.method === 'GET') {
    const sessionId = url.searchParams.get('sessionId')?.trim() ?? ''
    if (!sessionId) throw ApiError.badRequest('Missing Expert session id.')
    await assertAuthorized(sessionId)
    const browserKey = url.searchParams.get('browserKey') ?? undefined
    return Response.json({
      showGeneration: expertBrowserActivityService.getShowGeneration(sessionId, browserKey),
      verificationCheckGeneration: expertBrowserActivityService.getVerificationCheckGeneration(sessionId, browserKey),
    })
  }
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  const body = record(await req.json().catch(() => null)) as Payload | null
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
  if (!sessionId) throw ApiError.badRequest('Missing Expert session id.')
  await assertAuthorized(sessionId)
  if (body?.action === 'show') {
    // The verification modal owns no browser key. Prefer its exact preserved
    // page over another worker's latest normal research tab.
    const requestedBrowserKey = typeof body.browserKey === 'string' && body.browserKey.trim()
      ? body.browserKey.trim()
      : undefined
    const browserKey = requestedBrowserKey
      ?? expertHumanVerificationService.getActiveBrowserSessionKey(sessionId)
      ?? expertBrowserActivityService.getLatestBrowserKey(sessionId)
    const activity = expertBrowserActivityService.requestShow(sessionId, browserKey ?? undefined)
    if (!activity || !browserKey) return Response.json({ activity, presentationConfirmed: null })

    const showGeneration = expertBrowserActivityService.getShowGeneration(sessionId, browserKey)
    const presentationConfirmed = await expertBrowserActivityService.waitForPresentationResult(
      sessionId,
      browserKey,
      showGeneration,
      // Includes the 750ms runner poll and the bounded 5s Windows native helper.
      10_000,
    )
    return Response.json({ activity, presentationConfirmed })
  }
  if (body?.action === 'verification_check') {
    // UI owns no browser key. Always target the page currently represented by
    // the dedicated verification modal, not another worker's latest browser.
    const browserKey = expertHumanVerificationService.getActiveBrowserSessionKey(sessionId)
    return Response.json({ activity: expertBrowserActivityService.requestVerificationCheck(sessionId, browserKey ?? undefined) })
  }
  if (body?.action === 'presentation_result') {
    const browserKey = typeof body.browserKey === 'string' ? body.browserKey : ''
    const generation = typeof body.showGeneration === 'number' ? body.showGeneration : 0
    const confirmed = body.presentationConfirmed === true
    return Response.json({ accepted: expertBrowserActivityService.reportPresentationResult(sessionId, browserKey, generation, confirmed) })
  }
  if (body?.action !== 'activity' || typeof body.status !== 'string' || !STATUSES.has(body.status as ExpertBrowserActivityStatus)) {
    throw ApiError.badRequest('Invalid Expert browser activity payload.')
  }
  return Response.json({ activity: expertBrowserActivityService.publish(sessionId, {
    status: body.status as ExpertBrowserActivityStatus,
    currentTarget: body.currentTarget,
    checkedTarget: body.checkedTarget,
    connectionKind: body.connectionKind,
    browserKey: body.browserKey,
  }) })
}
