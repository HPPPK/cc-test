import { create } from 'zustand'
import { expertsApi, type ExpertDefinition, type ExpertPackSummary, type ExpertPackUpdateInput } from '../api/experts'
import type { ExpertMaterialRef, ExpertSessionSummary } from '../types/session'
import { isTauriRuntime } from '../lib/desktopRuntime'

type ExpertModePhase = 'idle' | 'loading' | 'entering' | 'collecting' | 'writing' | 'completed' | 'failed'

type ExpertStore = {
  experts: ExpertDefinition[]
  packs: ExpertPackSummary[]
  loadingExperts: boolean
  expertsError: string | null
  modePhase: ExpertModePhase
  modeMessage: string | null
  modeError: string | null
  lastMaterialRef: ExpertMaterialRef | null
  loadExperts: () => Promise<void>
  enterExpertMode: (sessionId: string, expertId: string) => Promise<ExpertSessionSummary>
  exitExpertMode: (sessionId: string) => Promise<ExpertSessionSummary>
  submitIntakeStep: (sessionId: string, input: { stepId?: string; answer?: unknown; answers?: Record<string, unknown> }) => Promise<ExpertSessionSummary>
  runExpertAgent: (sessionId: string, input: { expertId?: string; projectRoot?: string; title?: string; notes?: string }, onProgress?: (content: string) => void) => Promise<{ expert: ExpertSessionSummary; materialRef: ExpertMaterialRef }>
  writePlaceholderMaterial: (sessionId: string, input: { expertId?: string; projectRoot?: string; title?: string; notes?: string }, onProgress?: (content: string) => void) => Promise<{ expert: ExpertSessionSummary; materialRef: ExpertMaterialRef }>
  exportPack: (packId: string) => Promise<boolean>
  updatePack: (packId: string, input: ExpertPackUpdateInput) => Promise<ExpertPackSummary>
  copyPack: (packId: string) => Promise<void>
  deletePack: (packId: string) => Promise<void>
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function saveExportedZip(result: Awaited<ReturnType<typeof expertsApi.exportPack>>): Promise<boolean> {
  const bytes = base64ToBytes(result.dataBase64)
  if (isTauriRuntime()) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ])
    const filePath = await save({ defaultPath: result.filename, filters: [{ name: 'ZIP', extensions: ['zip'] }] })
    if (!filePath) return false
    await writeFile(filePath, bytes)
    return true
  }
  const blob = new Blob([bytes as unknown as BlobPart], { type: result.contentType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = result.filename
  link.rel = 'noopener'
  link.click()
  URL.revokeObjectURL(url)
  return true
}

export const useExpertStore = create<ExpertStore>((set, get) => ({
  experts: [],
  packs: [],
  loadingExperts: false,
  expertsError: null,
  modePhase: 'idle',
  modeMessage: null,
  modeError: null,
  lastMaterialRef: null,

  loadExperts: async () => {
    set({ loadingExperts: true, expertsError: null })
    try {
      const [expertsResponse, packsResponse] = await Promise.all([expertsApi.listExperts(), expertsApi.listPacks()])
      set({ experts: expertsResponse.experts, packs: packsResponse.packs, loadingExperts: false, expertsError: null })
    } catch (error) {
      set({ loadingExperts: false, expertsError: error instanceof Error ? error.message : 'Failed to load experts.' })
    }
  },

  enterExpertMode: async (sessionId, expertId) => {
    set({ modePhase: 'entering', modeMessage: 'Entering Expert Mode', modeError: null })
    try {
      const response = await expertsApi.enterSessionExpertMode(sessionId, expertId)
      set({ modePhase: 'collecting', modeMessage: 'Expert Mode is ready.', modeError: null })
      return response.expert
    } catch (error) {
      set({ modePhase: 'failed', modeError: error instanceof Error ? error.message : 'Failed to enter Expert Mode.' })
      throw error
    }
  },

  exitExpertMode: async (sessionId) => {
    set({ modePhase: 'loading', modeMessage: 'Exiting Expert Mode', modeError: null })
    try {
      const response = await expertsApi.exitSessionExpertMode(sessionId)
      set({ modePhase: 'idle', modeMessage: null, modeError: null })
      return response.expert
    } catch (error) {
      set({ modePhase: 'failed', modeError: error instanceof Error ? error.message : 'Failed to exit Expert Mode.' })
      throw error
    }
  },

  submitIntakeStep: async (sessionId, input) => {
    set({ modePhase: 'collecting', modeMessage: 'Saving Expert Mode input.', modeError: null })
    const response = await expertsApi.submitIntakeStep(sessionId, input)
    return response.expert
  },

  runExpertAgent: async (sessionId, input, onProgress) => {
    set({ modePhase: 'writing', modeMessage: 'Reading the selected Expert ZIP and writing the result.', modeError: null })
    let finalResult: { expert: ExpertSessionSummary; materialRef: ExpertMaterialRef } | null = null
    try {
      for await (const event of expertsApi.runExpertAgentStream(sessionId, input)) {
        if (event.type === 'progress') onProgress?.(event.content)
        if (event.type === 'complete') {
          finalResult = event.data
          set({ modePhase: 'completed', modeMessage: 'Expert material package written.', modeError: null, lastMaterialRef: event.data.materialRef })
        }
        if (event.type === 'error') throw new Error(event.error)
      }
      if (!finalResult) throw new Error('Expert run did not return a completed result.')
      return finalResult
    } catch (error) {
      set({ modePhase: 'failed', modeError: error instanceof Error ? error.message : 'Failed to write expert material.' })
      throw error
    }
  },

  writePlaceholderMaterial: async (sessionId, input, onProgress) => get().runExpertAgent(sessionId, input, onProgress),

  exportPack: async (packId) => saveExportedZip(await expertsApi.exportPack(packId)),

  updatePack: async (packId, input) => {
    const updated = await expertsApi.updatePack(packId, input)
    await get().loadExperts()
    return updated
  },

  copyPack: async (packId) => {
    await expertsApi.copyPack(packId)
    await get().loadExperts()
  },

  deletePack: async (packId) => {
    await expertsApi.deletePack(packId)
    await get().loadExperts()
  },
}))
