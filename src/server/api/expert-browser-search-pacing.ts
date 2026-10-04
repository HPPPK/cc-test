import { ApiError } from '../middleware/errorHandler.js'
import { hasActiveExpertRuntime } from '../services/expertRuntimeBindingService.js'
import { expertRuntimeSessionStore } from '../services/expertRuntimeSessionStore.js'
import { expertSearchPacingService, EXPERT_SEARCH_ENGINES, type ExpertSearchEngine } from '../services/expertSearchPacingService.js'

type Payload = {
  action?: unknown
  sessionId?: unknown
  engine?: unknown
  minIntervalMs?: unknown
  leaseId?: unknown
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function searchEngine(value: unknown): ExpertSearchEngine | null {
  return typeof value === 'string' && (EXPERT_SEARCH_ENGINES as readonly string[]).includes(value)
    ? value as ExpertSearchEngine
    : null
}

async function assertAuthorized(sessionId: string): Promise<void> {
  const expert = await expertRuntimeSessionStore.get(sessionId)
  if (!hasActiveExpertRuntime(expert) || expert.runtimeBinding.researchBrowserPolicy?.searchEnginePacing?.enabled !== true) {
    throw new ApiError(403, 'The current session is not authorized to coordinate Expert search pacing.', 'FORBIDDEN')
  }
}

export async function handleExpertBrowserSearchPacingApi(req: Request, _url: URL, segments: string[]): Promise<Response> {
  if (segments.length !== 2 || req.method !== 'POST') throw ApiError.notFound('Expert browser search pacing route not found')
  const payload = record(await req.json().catch(() => null)) as Payload | null
  const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : ''
  if (!sessionId) throw ApiError.badRequest('Missing Expert session id.')
  await assertAuthorized(sessionId)

  if (payload?.action === 'acquire') {
    const engine = searchEngine(payload.engine)
    if (!engine) throw ApiError.badRequest('Invalid search engine.')
    const minIntervalMs = typeof payload.minIntervalMs === 'number' ? payload.minIntervalMs : 3_000
    return Response.json(await expertSearchPacingService.acquire({ sessionId, engine, minIntervalMs }))
  }
  if (payload?.action === 'release') {
    const leaseId = typeof payload.leaseId === 'string' ? payload.leaseId.trim() : ''
    if (!leaseId) throw ApiError.badRequest('Missing search pacing lease id.')
    return Response.json({ released: expertSearchPacingService.release(sessionId, leaseId) })
  }
  throw ApiError.badRequest('Invalid Expert search pacing payload.')
}
