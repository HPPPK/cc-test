import { create } from 'zustand'
import { skillsApi } from '../api/skills'
import type { SkillCatalogItem, SkillMeta, SkillDetail } from '../types/skill'

export type SkillDetailReturnTab = 'skills' | 'plugins'
type SkillCatalogFetchOptions = {
  workflowOnly?: boolean
}

type SkillStore = {
  skills: SkillMeta[]
  catalog: SkillCatalogItem[]
  selectedSkill: SkillDetail | null
  selectedSkillReturnTab: SkillDetailReturnTab
  isLoading: boolean
  isCatalogLoading: boolean
  isDetailLoading: boolean
  error: string | null

  fetchSkills: (cwd?: string) => Promise<void>
  fetchCatalog: (cwd?: string, options?: SkillCatalogFetchOptions) => Promise<void>
  fetchSkillDetail: (
    source: string,
    name: string,
    cwd?: string,
    returnTab?: SkillDetailReturnTab,
  ) => Promise<void>
  clearSelection: () => void
}

export const useSkillStore = create<SkillStore>((set) => ({
  skills: [],
  catalog: [],
  selectedSkill: null,
  selectedSkillReturnTab: 'skills',
  isLoading: false,
  isCatalogLoading: false,
  isDetailLoading: false,
  error: null,

  fetchSkills: async (cwd) => {
    set({ isLoading: true, error: null })
    try {
      const { skills } = await skillsApi.list(cwd)
      const normalizedSkills = normalizeSkillMetadata(skills)
      set({ skills: normalizedSkills, catalog: normalizedSkills, isLoading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      })
    }
  },

  fetchCatalog: async (cwd, options) => {
    set({ isCatalogLoading: true, error: null })
    try {
      const { skills } = await skillsApi.catalog(cwd, options)
      set({ catalog: normalizeSkillMetadata(skills), isCatalogLoading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isCatalogLoading: false,
      })
    }
  },

  fetchSkillDetail: async (source, name, cwd, returnTab = 'skills') => {
    set({ isDetailLoading: true, error: null })
    try {
      const { detail } = await skillsApi.detail(source, name, cwd)
      set({
        selectedSkill: detail,
        selectedSkillReturnTab: returnTab,
        isDetailLoading: false,
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isDetailLoading: false,
      })
    }
  },

  clearSelection: () => set({ selectedSkill: null, selectedSkillReturnTab: 'skills' }),
}))

const baseSetState = useSkillStore.setState

useSkillStore.setState = (partial, replace) => {
  const normalizedPartial = typeof partial === 'function'
    ? (state: SkillStore) => normalizeSkillStatePartial(partial(state))
    : normalizeSkillStatePartial(partial)

  if (replace === true) {
    return baseSetState(normalizedPartial as SkillStore, true)
  }

  return baseSetState(
    normalizedPartial as SkillStore | Partial<SkillStore> | ((state: SkillStore) => SkillStore | Partial<SkillStore>),
    false,
  )
}

function normalizeSkillStatePartial<T>(partial: T): T {
  if (!partial || typeof partial !== 'object') return partial

  const next = { ...partial } as Record<string, unknown>
  if (Array.isArray(next.skills)) next.skills = normalizeSkillMetadata(next.skills as SkillMeta[])
  if (Array.isArray(next.catalog)) next.catalog = normalizeSkillMetadata(next.catalog as SkillCatalogItem[])
  return next as T
}

function normalizeSkillMetadata<T extends SkillMeta | SkillCatalogItem>(skills: T[]): T[] {
  return skills.map((skill) => {
    const metadata = skillMetadataParts(skill)
    if (metadata.length === 0) return skill

    const description = appendMetadata(skill.description, metadata)
    return description === skill.description ? skill : { ...skill, description }
  })
}

function skillMetadataParts(skill: SkillMeta | SkillCatalogItem) {
  return [
    skill.catalogStatus,
    skill.referenceId ?? skill.provenance?.referenceId,
    skill.contentHash ?? skill.provenance?.contentHash,
    skill.catalogStatus ? humanizeStatus(skill.catalogStatus) : null,
    skill.pluginName,
    skill.namespace,
    skill.provenance?.pluginName,
    skill.provenance?.namespace,
  ].filter((part): part is string => Boolean(part))
}

function appendMetadata(description: string, metadata: string[]) {
  const uniqueMetadata = Array.from(new Set(metadata))
    .filter((part) => !description.toLowerCase().includes(part.toLowerCase()))

  if (uniqueMetadata.length === 0) return description
  return `${description} ${uniqueMetadata.join(' ')}`
}

function humanizeStatus(status: string) {
  return status.replace(/[-_]+/g, ' ')
}
