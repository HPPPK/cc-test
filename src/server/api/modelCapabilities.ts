import {
  evaluateModelCapabilityRequirements,
  resolveModelCapability,
} from '../services/modelCapabilityRegistryService.js'
import { isRecord } from '../services/workflowTemplateValidation.js'

export async function handleModelCapabilitiesApi(req: Request, url: URL, segments: string[]): Promise<Response> {
  const sub = segments[2]
  if (req.method === 'GET' && !sub) {
    const provider = url.searchParams.get('provider')
    const modelId = url.searchParams.get('model') ?? url.searchParams.get('modelId')
    return Response.json({
      schemaVersion: 1,
      capability: await resolveModelCapability({ provider, modelId }),
    })
  }

  if (req.method === 'POST' && sub === 'precheck') {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Response.json({ error: 'MODEL_CAPABILITY_INVALID_JSON', message: 'Request body must be valid JSON' }, { status: 400 })
    }
    if (!isRecord(body)) {
      return Response.json({ error: 'MODEL_CAPABILITY_INVALID', message: 'Request body must be an object' }, { status: 400 })
    }
    const capability = await resolveModelCapability({
      provider: typeof body.provider === 'string' ? body.provider : null,
      modelId: typeof body.modelId === 'string' ? body.modelId : typeof body.model === 'string' ? body.model : null,
    })
    const requirements = isRecord(body.requirements) ? body.requirements : undefined
    return Response.json({
      schemaVersion: 1,
      capability,
      result: evaluateModelCapabilityRequirements(capability, requirements),
    })
  }

  return Response.json({ error: 'Not Found', message: `Unknown model capabilities endpoint: ${sub ?? ''}` }, { status: 404 })
}
