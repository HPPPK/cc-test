import { ApiError, errorResponse } from '../middleware/errorHandler.js'
import { ExpertPackRegistryService, type ExpertPackCreateInput, type ExpertPackUpdateInput } from '../services/expertPackRegistryService.js'

const expertPacks = new ExpertPackRegistryService()

export async function handleExpertsApi(req: Request, _url: URL, segments: string[]): Promise<Response> {
  try {
    const resource = segments[2]
    if (!resource) {
      if (req.method !== 'GET') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
      return Response.json({ experts: await expertPacks.listExperts() })
    }
    if (resource === 'packs') return await handlePackRoute(req, segments)
    throw ApiError.notFound(`Unknown experts resource: ${segments.slice(2).join('/')}`)
  } catch (error) {
    return errorResponse(error)
  }
}

async function handlePackRoute(req: Request, segments: string[]): Promise<Response> {
  const packId = segments[3]
  const action = segments[4]

  if (!packId) {
    if (req.method === 'POST') {
      return Response.json(await expertPacks.createExpertPack(await readJson(req) as ExpertPackCreateInput), { status: 201 })
    }
    if (req.method !== 'GET') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    return Response.json({ packs: await expertPacks.listPacks() })
  }

  if (packId === 'import' && action === 'preview') {
    if (req.method !== 'POST') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    return Response.json(await expertPacks.previewExpertPackZip(readZipData(await readJson(req))))
  }

  if (packId === 'import' && !action) {
    if (req.method !== 'POST') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    return Response.json(await expertPacks.importExpertPackZip(readZipData(await readJson(req))), { status: 201 })
  }

  if (action === 'export') {
    if (req.method !== 'GET') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    return Response.json(await expertPacks.exportExpertPackZip(packId))
  }

  if (action === 'copy') {
    if (req.method !== 'POST') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    return Response.json(await expertPacks.copyExpertPack(packId), { status: 201 })
  }

  if (!action && req.method === 'PUT') {
    return Response.json(await expertPacks.updateExpertPack(packId, await readJson(req) as ExpertPackUpdateInput))
  }

  if (!action && req.method === 'DELETE') {
    await expertPacks.deleteExpertPack(packId)
    return new Response(null, { status: 204 })
  }

  throw ApiError.notFound(`Unknown expert pack resource: ${segments.slice(2).join('/')}`)
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json()
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    throw ApiError.badRequest('Request body must be valid JSON.')
  }
}

function readZipData(body: Record<string, unknown>): Uint8Array {
  const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : ''
  if (!dataBase64) throw ApiError.badRequest('Expert ZIP data is required.')
  try {
    return new Uint8Array(Buffer.from(dataBase64, 'base64'))
  } catch {
    throw ApiError.badRequest('Expert ZIP data must be valid base64.')
  }
}
