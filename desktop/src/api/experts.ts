import { api, getApiUrl } from './client'
import type { ExpertIntakeState, ExpertMaterialRef, ExpertSessionSummary } from '../types/session'

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
  packId: string
  packName: string
  packVersion: string
  entrypoint: string
  promptPaths: { system?: string; intake?: string }
  formPaths: string[]
  outputProtocolPath?: string
  outputProtocolContent?: string
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
    portability?: { selfContained: boolean; notes?: string }
  }
  experts: ExpertDefinition[]
  tools?: ExpertToolManifest[]
  importedAt: string
}

export type ExpertListResponse = { experts: ExpertDefinition[] }
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
export type ExpertSessionResponse = { expert: ExpertSessionSummary }
export type ExpertMaterialWriteResponse = { expert: ExpertSessionSummary; materialRef: ExpertMaterialRef }
export type ExpertStreamEvent =
  | { type: 'progress'; phase: string; content: string }
  | { type: 'complete'; data: ExpertMaterialWriteResponse }
  | { type: 'error'; error: string }

export const expertsApi = {
  listExperts: () => api.get<ExpertListResponse>('/api/experts'),
  listPacks: () => api.get<ExpertPackListResponse>('/api/experts/packs'),
  createPack: (input: ExpertPackCreateInput) => api.post<ExpertPackImportPreview>('/api/experts/packs', input),
  previewImport: (dataBase64: string) => api.post<ExpertPackImportPreview>('/api/experts/packs/import/preview', { dataBase64 }),
  importPack: (dataBase64: string) => api.post<ExpertPackImportPreview>('/api/experts/packs/import', { dataBase64 }),
  exportPack: (packId: string) => api.get<ExpertPackExportResponse>(`/api/experts/packs/${encodeURIComponent(packId)}/export`),
  updatePack: (packId: string, input: ExpertPackUpdateInput) => api.put<ExpertPackSummary>(`/api/experts/packs/${encodeURIComponent(packId)}`, input),
  copyPack: (packId: string) => api.post<ExpertPackImportPreview>(`/api/experts/packs/${encodeURIComponent(packId)}/copy`, {}),
  deletePack: (packId: string) => api.delete<void>(`/api/experts/packs/${encodeURIComponent(packId)}`),
  enterSessionExpertMode: (sessionId: string, expertId: string) => api.post<ExpertSessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/expert/start`, { expertId }),
  exitSessionExpertMode: (sessionId: string) => api.post<ExpertSessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/expert/exit`, {}),
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
