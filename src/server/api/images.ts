import { z } from 'zod'
import { ApiError, errorResponse } from '../middleware/errorHandler.js'
import {
  ImageGenerationService,
  type ImageGenerationInput,
} from '../services/imageGenerationService.js'

const imageGenerationService = new ImageGenerationService()

const imageOptionsSchema = {
  providerId: z.string().min(1).max(256).optional(),
  model: z.string().min(1).max(256).optional(),
  size: z.string().regex(/^\d{3,4}x\d{3,4}$/).optional(),
  quality: z.enum(['auto', 'low', 'medium', 'high']).optional(),
  outputFormat: z.enum(['png', 'jpeg', 'webp']).optional(),
  workDir: z.string().min(1).max(4096).optional(),
  fileName: z.string().min(1).max(128).optional(),
}

const preflightSchema = z.object(imageOptionsSchema).strict()
const generateSchema = z.object({
  ...imageOptionsSchema,
  prompt: z.string().min(1).max(50_000),
}).strict()

type ImageService = Pick<ImageGenerationService, 'preflight' | 'generate'>

function methodNotAllowed(method: string, route: string): ApiError {
  return new ApiError(405, `Method ${method} not allowed on ${route}`, 'METHOD_NOT_ALLOWED')
}

async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }
}

function parseInput<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw ApiError.badRequest(`Invalid image request: ${parsed.error.issues.map(issue => issue.message).join('; ')}`)
  }
  return parsed.data
}

/**
 * Desktop-server boundary for the application-wide image tool. The Agent only
 * sends prompt/options; this handler resolves the saved Provider credential
 * inside the server process and never returns that credential to the Agent.
 */
export function createImagesApiHandler(service: ImageService = imageGenerationService) {
  return async function handleImagesApi(
    req: Request,
    _url: URL,
    segments: string[],
  ): Promise<Response> {
    try {
      const action = segments[2]
      if (action === 'preflight') {
        if (req.method !== 'POST') throw methodNotAllowed(req.method, '/api/images/preflight')
        const input = parseInput(preflightSchema, await parseJsonBody(req))
        return Response.json(await service.preflight(input as ImageGenerationInput))
      }
      if (action === 'generate') {
        if (req.method !== 'POST') throw methodNotAllowed(req.method, '/api/images/generate')
        const input = parseInput(generateSchema, await parseJsonBody(req))
        return Response.json(await service.generate(input as ImageGenerationInput))
      }
      throw ApiError.notFound(`Unknown images endpoint: ${action ?? ''}`)
    } catch (error) {
      return errorResponse(error)
    }
  }
}

export const handleImagesApi = createImagesApiHandler()
