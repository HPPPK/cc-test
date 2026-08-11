import { ApiError } from '../middleware/errorHandler.js'
import { hasActiveExpertRuntime } from '../services/expertRuntimeBindingService.js'
import { expertRuntimeSessionStore } from '../services/expertRuntimeSessionStore.js'
import { expertBrowserActivityService, type ExpertBrowserActivityStatus } from '../services/expertBrowserActivityService.js'

const STATUSES = new Set<ExpertBrowserActivityStatus>(['researching', 'awaiting_verification', 'resumed', 'completed', 'access_limited'])

type Payload = {
  sessionId?: unknown
  action?: unknown
  status?: unknown
  currentTarget?: unknown
  checkedTarget?: unknown
  connectionKind?: unknown
  browserKey?: unknown
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
    return Response.json({ showGeneration: expertBrowserActivityService.getShowGeneration(sessionId, url.searchParams.get('browserKey') ?? undefined) })
  }
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  const body = record(await req.json().catch(() => null)) as Payload | null
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
  if (!sessionId) throw ApiError.badRequest('Missing Expert session id.')
  await assertAuthorized(sessionId)
  if (body?.action === 'show') return Response.json({ activity: expertBrowserActivityService.requestShow(sessionId) })
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
