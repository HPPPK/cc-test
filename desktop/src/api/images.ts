import { api } from './client'

export type ImageGenerationPreflightResult = {
  status: 'available' | 'unavailable' | 'unverified' | 'generated' | 'failed'
  availability: 'available' | 'unavailable' | 'unverified'
  model: string
  providerId?: string
  providerName?: string
  endpoint?: string
  message: string
  errorCode?: string
}

export const imagesApi = {
  preflight() {
    return api.post<ImageGenerationPreflightResult>('/api/images/preflight', {})
  },
}
