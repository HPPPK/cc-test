import { ApiError } from '../middleware/errorHandler.js'
import { hasActiveExpertRuntime } from '../services/expertRuntimeBindingService.js'
import { expertRuntimeSessionStore } from '../services/expertRuntimeSessionStore.js'
import { expertHumanVerificationService } from '../services/expertHumanVerificationService.js'
import { isExpertBrowserVerificationContext } from '../../utils/expertHumanVerification.js'

type HumanVerificationPayload = {
  sessionId?: unknown
  agentId?: unknown
  toolUseId?: unknown
  browserSessionKey?: unknown
  verification?: unknown
  joinExisting?: unknown
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export async function handleExpertHumanVerificationsApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  if (segments.length !== 2 || req.method !== 'POST') {
    throw ApiError.notFound('Expert human verification route not found')
  }

  const payload = record(await req.json().catch(() => null)) as HumanVerificationPayload | null
  const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : ''
  const joinExisting = payload?.joinExisting === true
  if (!sessionId || (!joinExisting && !isExpertBrowserVerificationContext(payload?.verification))) {
    throw ApiError.badRequest('Invalid Expert browser verification request.')
  }

  const expert = await expertRuntimeSessionStore.get(sessionId)
  const browserPolicy = expert?.runtimeBinding?.researchBrowserPolicy
  if (
    !hasActiveExpertRuntime(expert) ||
    browserPolicy?.desktopHumanVerificationHandoff !== true ||
    (browserPolicy.forceVisiblePlaywright !== true && browserPolicy.managedPresentationDefault === undefined)
  ) {
    throw new ApiError(403, 'The current session is not an active Expert session authorized to request visible browser verification.', 'FORBIDDEN')
  }

  const response = joinExisting
    ? await expertHumanVerificationService.waitForActiveVerification(sessionId)
    : await expertHumanVerificationService.requestVerification({
      sessionId,
      ...(typeof payload.agentId === 'string' && payload.agentId.trim() ? { agentId: payload.agentId.trim() } : {}),
      ...(typeof payload.toolUseId === 'string' && payload.toolUseId.trim() ? { toolUseId: payload.toolUseId.trim() } : {}),
      ...(typeof payload.browserSessionKey === 'string' && payload.browserSessionKey.trim() ? { browserSessionKey: payload.browserSessionKey.trim() } : {}),
      verification: payload!.verification as Parameters<typeof expertHumanVerificationService.requestVerification>[0]['verification'],
    })

  return Response.json(response)
}
