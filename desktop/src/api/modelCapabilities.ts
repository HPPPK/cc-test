import { api } from './client'
import type { DesktopModelCapabilityDefinition } from '../lib/modelCapabilities'

type ModelCapabilityResponse = {
  schemaVersion: 1
  capability: DesktopModelCapabilityDefinition
}

export const modelCapabilitiesApi = {
  get(provider: string | null | undefined, modelId: string | null | undefined) {
    const query = new URLSearchParams()
    if (provider) query.set('provider', provider)
    if (modelId) query.set('model', modelId)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return api.get<ModelCapabilityResponse>(`/api/model-capabilities${suffix}`, { timeout: 8_000 })
  },
}
