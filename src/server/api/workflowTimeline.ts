import { sessionService } from '../services/sessionService.js'
import { WorkflowSessionStateService } from '../services/workflowSessionStateService.js'
import { workflowTimelineService } from '../services/workflowTimelineService.js'
import { ApiError } from '../middleware/errorHandler.js'

export async function getWorkflowTimeline(req: Request, sessionId: string): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(sessionId)) throw ApiError.badRequest('Invalid session id')
  const url = new URL(req.url)
  const limit = Number(url.searchParams.get('limit') ?? '100')
  const before = url.searchParams.get('before') ?? undefined
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || (before?.length ?? 0) > 512) throw ApiError.badRequest('Invalid timeline pagination')
  const state = (await new WorkflowSessionStateService().readState(sessionId)).state
  if (!state) throw ApiError.notFound('Workflow state is unavailable')
  // SessionService resolves the session-owned transcript and namespaces subagent tools.
  const messages = await sessionService.getSessionMessages(sessionId)
  const page = await workflowTimelineService.read(sessionId, state, messages, { limit, before })
  return Response.json(page, { headers: { 'Cache-Control': 'no-store' } })
}
