import { z } from 'zod'
import { agentRunLedgerService, type AgentRunEventInput, type AgentRunLedger, type AgentRunSummary } from '../services/agentRunLedgerService.js'
import { ApiError, errorResponse } from '../middleware/errorHandler.js'

const idSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/)
const eventSchema = z.object({
  sessionId: idSchema,
  runId: idSchema,
  eventType: z.enum(['tool_started', 'tool_completed', 'tool_failed', 'skill_invoked', 'artifact_recorded', 'status_changed']),
  toolUseId: z.string().trim().min(1).max(160).optional(),
  toolName: z.string().trim().min(1).max(512).optional(),
  skillId: z.string().trim().min(1).max(160).optional(),
  durationMs: z.number().finite().min(0).max(86_400_000).optional(),
  errorCode: z.string().trim().min(1).max(128).optional(),
  status: z.enum(['running', 'waiting_user', 'blocked', 'failed', 'completed']).optional(),
  artifact: z.object({ kind: z.enum(['image', 'screenshot', 'report', 'html', 'file', 'other']), path: z.string().trim().min(1).max(1_024), sourceTool: z.string().trim().min(1).max(512).optional() }).strict().optional(),
}).strict()

type AgentRunsService = {
  appendEvent(input: AgentRunEventInput): Promise<AgentRunLedger>
  listRuns(sessionId: string, limit?: number): Promise<AgentRunSummary[]>
  getRun(sessionId: string, runId: string): Promise<AgentRunLedger | null>
}

async function parseJsonBody(req: Request): Promise<unknown> {
  try { return await req.json() } catch { throw ApiError.badRequest('Invalid JSON body') }
}
function parsedLimit(value: string | null): number {
  const limit = Number.parseInt(value ?? '20', 10)
  return Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20
}

/** Strictly scoped receipt API: prompts, tool inputs, outputs and secrets are not accepted. */
export function createAgentRunsApiHandler(service: AgentRunsService = agentRunLedgerService) {
  return async function handleAgentRunsApi(req: Request, url: URL, segments: string[]): Promise<Response> {
    try {
      if (segments.length === 3 && segments[2] === 'events' && req.method === 'POST') {
        const parsed = eventSchema.safeParse(await parseJsonBody(req))
        if (!parsed.success) throw ApiError.badRequest('Invalid Agent Run event payload.')
        return Response.json({ run: await service.appendEvent(parsed.data as AgentRunEventInput) })
      }
      if (segments.length === 2 && req.method === 'GET') {
        const sessionId = url.searchParams.get('sessionId')?.trim() ?? ''
        if (!idSchema.safeParse(sessionId).success) throw ApiError.badRequest('Missing or invalid session id.')
        return Response.json({ runs: await service.listRuns(sessionId, parsedLimit(url.searchParams.get('limit'))) })
      }
      if (segments.length === 4 && req.method === 'GET') {
        const [sessionId, runId] = [segments[2] ?? '', segments[3] ?? '']
        if (!idSchema.safeParse(sessionId).success || !idSchema.safeParse(runId).success) throw ApiError.badRequest('Invalid Agent Run path.')
        const run = await service.getRun(sessionId, runId)
        if (!run) throw ApiError.notFound('Agent Run not found.')
        return Response.json({ run })
      }
      throw ApiError.notFound('Agent Run route not found.')
    } catch (error) {
      return errorResponse(error)
    }
  }
}
export const handleAgentRunsApi = createAgentRunsApiHandler()
