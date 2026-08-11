import { api, getApiUrl } from './client'
import type { ExpertIntakeState, ExpertMaterialRef, ExpertSessionSummary } from '../types/session'

export type ExpertCategory = { id: string; name: string; description?: string; icon?: string }

export const fallbackExpertCategories: ExpertCategory[] = [
  { id: 'product', name: '产品经理', description: '调研、洞察、策略与产品规划', icon: 'explore' },
  { id: 'development', name: '开发', description: '工程实现、代码审查与技术诊断', icon: 'terminal' },
  { id: 'design', name: 'UI 设计', description: '界面、体验与视觉表达', icon: 'palette' },
  { id: 'uncategorized', name: '未分类', description: '等待进一步归类的专家', icon: 'more_horiz' },
]
export type ExpertCatalogMetadata = { categoryId?: string; tags?: string[] }
export type ExpertProfileEntry = { id: string; content: string; createdAt: string }
export type ExpertProfileWorkflowStep = { id: string; title: string; description?: string }
export type ExpertProfile = {
  avatar?: string
  tagline?: string
  soul?: { whoIAm: string; howITalk: string; boundaries: string[] }
  starterPrompts?: string[]
  workflow?: ExpertProfileWorkflowStep[]
  knowledgeBase?: {
    version: string
    ruleCount?: number
    styleCount?: number
    paletteCount?: number
    componentCount?: number
    notes?: string
  }
  memories?: ExpertProfileEntry[]
  diary?: ExpertProfileEntry[]
}
export type ExpertProfileRecord = { schemaVersion: 1; expertId: string; profile: ExpertProfile; updatedAt: string }

const legacyExpertCategoryIds: Record<string, string> = {
  'commercialization-research-report': 'product',
  'website-reference': 'development',
  'repo-health-check': 'development',
  'product-brief-intake': 'development',
  'migration-refactor-assessment': 'development',
}

export function resolveExpertCategoryId(expert?: { id?: string; categoryId?: string }): string {
  const categoryId = expert?.categoryId?.trim()
  if (categoryId) return categoryId
  return expert?.id ? legacyExpertCategoryIds[expert.id] ?? 'uncategorized' : 'uncategorized'
}

export type ExpertResearchBrowserPresentation = 'assistable_background' | 'always_visible'

export type ExpertResearchBrowserPolicy = {
  sharePlaywrightSessionAcrossAgents: boolean
  allowUserAuthorizedCdp?: boolean
  managedPresentationDefault?: ExpertResearchBrowserPresentation
  allowManagedPresentationChoice?: boolean
  forceVisiblePlaywright?: boolean
  closePlaywrightWhenAgentDone?: boolean
  verificationFallbackSearchEngines?: Array<'Google' | '百度' | 'Bing' | '360'>
}

export type ExpertResearchBrowserConnectionInput =
  | { kind: 'managed' }
  | { kind: 'cdp'; browser: 'chrome' | 'edge'; endpoint: string; userAuthorized: true }

export type ExpertResearchBrowserStartOptions = {
  researchBrowserConnection?: ExpertResearchBrowserConnectionInput
  researchBrowserPresentation?: ExpertResearchBrowserPresentation
}

export type ExpertToolManifest = {
  id: string
  name: string
  type: 'hostBuiltinRef' | 'packageLocalDeclarative' | 'packageLocalExecutable'
  purpose: string
  entrypoint: string
  permissions: Array<{ id: string; description: string }>
  hostToolId?: string
  command?: string
  network?: 'none' | 'declared'
}

export type ExpertDefinition = {
  id: string
  name: string
  description: string
  statusLabel: string
  profile?: ExpertProfile
  categoryId?: string
  tags?: string[]
  packId: string
  packName: string
  packVersion: string
  entrypoint: string
  promptPaths: { system?: string; intake?: string }
  formPaths: string[]
  outputProtocolPath?: string
  outputProtocolContent?: string
  researchBrowserPolicy?: ExpertResearchBrowserPolicy
  skillIds: string[]
  hostTools: Array<{ id: string; name: string; purpose: string; minHostVersion?: string; supported?: boolean }>
  permissions: Array<{ id: string; description: string }>
  tools: ExpertToolManifest[]
  intakeFlow?: import('../types/session').ExpertIntakeFlow
  portable: boolean
  systemPromptContent?: string
  skillContents?: Record<string, string>
}

export type ExpertPackSummary = {
  packId: string
  name: string
  version: string
  description: string
  storage: { kind: 'zip'; path: string }
  manifest?: {
    minHostVersion?: string
    compatibility?: Record<string, unknown>
    catalog?: ExpertCatalogMetadata
    portability?: { selfContained: boolean; notes?: string }
  }
  experts: ExpertDefinition[]
  tools?: ExpertToolManifest[]
  importedAt: string
}

export type ExpertListResponse = { experts: ExpertDefinition[] }
export type ExpertCategoryListResponse = { categories: ExpertCategory[] }
export type ExpertPackListResponse = { packs: ExpertPackSummary[] }
export type ExpertPackImportPreview = {
  pack: ExpertPackSummary
  experts: ExpertDefinition[]
  summary: string
  warnings: string[]
  canImport: boolean
  expertId?: string
  overwrite?: boolean
}
export type ExpertPackExportResponse = {
  format: 'zip-pack'
  contentType: 'application/zip'
  filename: string
  dataBase64: string
}
export type ExpertPackUpdateInput = {
  name?: string
  version?: string
  description?: string
  catalog?: ExpertCatalogMetadata
  minHostVersion?: string
  hostTools?: ExpertDefinition['hostTools']
  permissions?: ExpertDefinition['permissions']
  compatibility?: Record<string, unknown>
  portability?: { selfContained: boolean; notes?: string }
  expert?: {
    id: string
    name?: string
    description?: string
    statusLabel?: string
    profile?: ExpertProfile
    systemPromptContent?: string
    skillIds?: string[]
    intakeFlow?: ExpertDefinition['intakeFlow']
    outputProtocolContent?: string
  }
  tools?: ExpertToolManifest[]
  removeToolIds?: string[]
  toolArchivesBase64?: string[]
}
export type ExpertPackCreateInput = ExpertPackUpdateInput & {
  packId: string
  expert: NonNullable<ExpertPackUpdateInput['expert']> & { id: string; name: string }
}
export type SkillDiscoverySource = 'web' | 'qclaw' | 'all'
export type SkillDiscoveryResult = { title: string; url: string; source: Exclude<SkillDiscoverySource, 'all'> }
export type SkillDiscoveryResponse = {
  query: string
  source: SkillDiscoverySource
  provider: 'tavily' | 'brave'
  results: SkillDiscoveryResult[]
}

export type ExpertSessionResponse = { expert: ExpertSessionSummary }
export type ExpertMaterialWriteResponse = { expert: ExpertSessionSummary; materialRef: ExpertMaterialRef }
export type ExpertStreamEvent =
  | { type: 'progress'; phase: string; content: string }
  | { type: 'complete'; data: ExpertMaterialWriteResponse }
  | { type: 'error'; error: string }

export const expertsApi = {
  listExperts: () => api.get<ExpertListResponse>('/api/experts'),
  discoverSkills: (query: string, source: SkillDiscoverySource = 'all') => api.get<SkillDiscoveryResponse>(`/api/experts/discovery?${new URLSearchParams({ query, source }).toString()}`),

  listCategories: () => api.get<ExpertCategoryListResponse>('/api/experts/categories'),
  getProfile: (expertId: string) => api.get<ExpertProfileRecord>(`/api/experts/profiles/${encodeURIComponent(expertId)}`),
  updateProfile: (expertId: string, profile: ExpertProfile) => api.put<ExpertProfileRecord>(`/api/experts/profiles/${encodeURIComponent(expertId)}`, { profile }),
  updateCategories: (categories: ExpertCategory[]) => api.put<ExpertCategoryListResponse>('/api/experts/categories', { categories }),
  listPacks: () => api.get<ExpertPackListResponse>('/api/experts/packs'),
  createPack: (input: ExpertPackCreateInput) => api.post<ExpertPackImportPreview>('/api/experts/packs', input),
  previewImport: (dataBase64: string) => api.post<ExpertPackImportPreview>('/api/experts/packs/import/preview', { dataBase64 }),
  importPack: (dataBase64: string) => api.post<ExpertPackImportPreview>('/api/experts/packs/import', { dataBase64 }),
  exportPack: (packId: string) => api.get<ExpertPackExportResponse>(`/api/experts/packs/${encodeURIComponent(packId)}/export`),
  updatePack: (packId: string, input: ExpertPackUpdateInput) => api.put<ExpertPackSummary>(`/api/experts/packs/${encodeURIComponent(packId)}`, input),
  copyPack: (packId: string) => api.post<ExpertPackImportPreview>(`/api/experts/packs/${encodeURIComponent(packId)}/copy`, {}),
  deletePack: (packId: string) => api.delete<void>(`/api/experts/packs/${encodeURIComponent(packId)}`),
  enterSessionExpertMode: (sessionId: string, expertId: string, options?: ExpertResearchBrowserStartOptions) => api.post<ExpertSessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/expert/start`, { expertId, ...(options?.researchBrowserConnection ? { researchBrowserConnection: options.researchBrowserConnection } : {}), ...(options?.researchBrowserPresentation ? { researchBrowserPresentation: options.researchBrowserPresentation } : {}) }),
  exitSessionExpertMode: (sessionId: string) => api.post<ExpertSessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/expert/exit`, {}),
  requestResearchBrowserVisibility: (sessionId: string) => api.post<{ activity: unknown | null }>('/api/expert-browser-activity', { sessionId, action: 'show' }),
  submitIntakeStep: (sessionId: string, request: { stepId?: string; answer?: unknown; answers?: Record<string, unknown> }) => api.post<{ expert: ExpertSessionSummary; intakeState: ExpertIntakeState }>(`/api/sessions/${encodeURIComponent(sessionId)}/expert/intake`, request),
  listSessionExpertMaterials: (sessionId: string) => api.get<{ materialRefs: ExpertMaterialRef[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/expert/materials`),
  downloadMaterialPackage: (sessionId: string, runId: string) => api.get<ArrayBuffer>(`/api/sessions/${encodeURIComponent(sessionId)}/expert/materials/${encodeURIComponent(runId)}/download`),
  getMaterialPackageDownloadUrl: (sessionId: string, runId: string) => getApiUrl(`/api/sessions/${encodeURIComponent(sessionId)}/expert/materials/${encodeURIComponent(runId)}/download`),
  runExpertAgent: (sessionId: string, request: { expertId?: string; projectRoot?: string; title?: string; notes?: string }) => api.post<ExpertMaterialWriteResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/expert/run`, request, { timeout: 60_000 }),
  async *runExpertAgentStream(sessionId: string, request: { expertId?: string; projectRoot?: string; title?: string; notes?: string }) {
    const response = await fetch(getApiUrl(`/api/sessions/${encodeURIComponent(sessionId)}/expert/run`), {
      method: 'POST',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!response.ok || !response.body) throw new Error(`Expert run failed (${response.status})`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const event of events) {
        const line = event.split('\n').find((candidate) => candidate.startsWith('data: '))
        if (!line) continue
        yield JSON.parse(line.slice(6)) as ExpertStreamEvent
      }
    }
  },
}
