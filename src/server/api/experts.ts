import { ApiError, errorResponse } from '../middleware/errorHandler.js'
import { ExpertPackRegistryService, ExpertPackValidationError, type ExpertPackCreateInput, type ExpertPackUpdateInput } from '../services/expertPackRegistryService.js'
import {
  ExpertPackAuthoringService,
  type ExpertPackAuthoringOperationInput,
} from '../services/expertPackAuthoringService.js'
import { ExpertCategoryService } from '../services/expertCatalogService.js'
import { ExpertProfileService } from '../services/expertProfileService.js'
import { SkillDiscoveryConfigurationError, SkillDiscoveryService, type SkillDiscoverySource } from '../services/skillDiscoveryService.js'

const expertPacks = new ExpertPackRegistryService()
const expertPackAuthoring = new ExpertPackAuthoringService(expertPacks)
const expertCategories = new ExpertCategoryService()
const expertProfiles = new ExpertProfileService(expertPacks)
const skillDiscovery = new SkillDiscoveryService()

export async function handleExpertsApi(req: Request, _url: URL, segments: string[]): Promise<Response> {
  try {
    const resource = segments[2]
    if (!resource) {
      if (req.method !== 'GET') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
      return Response.json({ experts: await expertPacks.listExperts() })
    }
    if (resource === 'categories') return await handleCategoryRoute(req)
    if (resource === 'discovery') return await handleDiscoveryRoute(req, _url)
    if (resource === 'profiles') return await handleProfileRoute(req, segments)
    if (resource === 'packs') return await handlePackRoute(req, segments)
    throw ApiError.notFound(`Unknown experts resource: ${segments.slice(2).join('/')}`)
  } catch (error) {
    if (error instanceof ExpertPackValidationError) {
      return errorResponse(new ApiError(400, error.message, 'EXPERT_PACK_INCOMPLETE'))
    }
    return errorResponse(error)
  }
}

async function handleDiscoveryRoute(req: Request, url: URL): Promise<Response> {
  if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  const query = (url.searchParams.get('query') ?? '').trim()
  if (!query) throw ApiError.badRequest('A skill discovery query is required.')

  const sourceParam = url.searchParams.get('source') ?? 'all'
  if (!isSkillDiscoverySource(sourceParam)) {
    throw ApiError.badRequest('Skill discovery source must be web, qclaw, or all.')
  }

  try {
    return Response.json(await skillDiscovery.searchSkills(query, sourceParam))
  } catch (error) {
    if (error instanceof SkillDiscoveryConfigurationError) {
      throw new ApiError(503, error.message, 'SKILL_DISCOVERY_UNAVAILABLE')
    }
    throw error
  }
}

async function handlePackRoute(req: Request, segments: string[]): Promise<Response> {
  const packId = segments[3]
  const action = segments[4]

  if (packId === 'authoring' && !action) {
    if (req.method !== 'POST') throw new ApiError(405, 'Method ' + req.method + ' not allowed', 'METHOD_NOT_ALLOWED')
    return Response.json(await expertPackAuthoring.execute(await readJson(req) as ExpertPackAuthoringOperationInput))
  }

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

  if (action === 'bundled-update') {
    if (req.method !== 'POST') throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    return Response.json(await expertPacks.applyBundledExpertPackUpdate(packId))
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

async function handleCategoryRoute(req: Request): Promise<Response> {
  if (req.method === 'GET') return Response.json({ categories: await expertCategories.listCategories() })
  if (req.method === 'PUT') {
    const body = await readJson(req)
    return Response.json({ categories: await expertCategories.updateCategories(body.categories) })
  }
  throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
}

async function handleProfileRoute(req: Request, segments: string[]): Promise<Response> {
  const expertId = segments[3]
  if (!expertId) throw ApiError.notFound('Expert profile ID is required.')
  if (req.method === 'GET') return Response.json(await expertProfiles.getProfile(expertId))
  if (req.method === 'PUT') {
    const body = await readJson(req)
    return Response.json(await expertProfiles.updateProfile(expertId, body.profile))
  }
  throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
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

function isSkillDiscoverySource(value: string): value is SkillDiscoverySource {
  return value === 'web' || value === 'qclaw' || value === 'all'
}
