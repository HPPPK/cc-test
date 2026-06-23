import { api } from './client'
import type {
  SkillCatalogItem,
  SkillDetail,
  SkillsCatalogResponse,
  SkillsListResponse,
} from '../types/skill'

type SkillsCatalogOptions = {
  workflowOnly?: boolean
}

function buildSkillsQuery(cwd?: string, catalogOnly?: boolean, options?: SkillsCatalogOptions) {
  const query = new URLSearchParams()
  if (cwd) query.set('cwd', cwd)
  if (catalogOnly) query.set('catalogOnly', 'true')
  if (options?.workflowOnly) query.set('workflowOnly', 'true')
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

export const skillsApi = {
  list: (cwd?: string) => {
    return api.get<SkillsListResponse>(`/api/skills${buildSkillsQuery(cwd)}`, { timeout: 120_000 })
  },

  catalog: (cwd?: string, options?: SkillsCatalogOptions) => {
    return api.get<SkillsCatalogResponse>(`/api/skills${buildSkillsQuery(cwd, true, options)}`, { timeout: 120_000 })
  },

  detail: (source: string, name: string, cwd?: string) => {
    const query = new URLSearchParams({
      source,
      name,
    })
    if (cwd) query.set('cwd', cwd)

    return api.get<{ detail: SkillDetail }>(
      `/api/skills/detail?${query.toString()}`,
      { timeout: 120_000 },
    )
  },
}

export type { SkillCatalogItem, SkillsCatalogResponse, SkillsListResponse }
