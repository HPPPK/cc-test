import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expertsApi } from '../../api/experts'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSkillStore } from '../../stores/skillStore'
import { useUIStore } from '../../stores/uiStore'
import { ExpertPackManager } from './ExpertPackManager'

vi.mock('../../api/experts', () => ({
  expertsApi: {
    listPacks: vi.fn(),
    previewImport: vi.fn(),
    importPack: vi.fn(),
    updatePack: vi.fn(),
    copyPack: vi.fn(),
    createPack: vi.fn(),
    deletePack: vi.fn(),
    exportPack: vi.fn(),
  },
}))

const pack = {
  packId: 'custom-pack',
  name: 'Custom Pack',
  version: '1.0.0',
  description: 'A package from ZIP',
  storage: { kind: 'zip' as const, path: 'custom-pack.zip' },
  importedAt: '2026-07-14T00:00:00.000Z',
  experts: [{
    id: 'custom-expert',
    name: 'Custom Expert',
    description: 'Does custom work',
    statusLabel: 'Ready',
    packId: 'custom-pack',
    packName: 'Custom Pack',
    packVersion: '1.0.0',
    entrypoint: 'experts/custom/expert.json',
    promptPaths: { system: 'experts/custom/system.md' },
    formPaths: [],
    skillIds: ['custom-skill'],
    hostTools: [],
    permissions: [],
    tools: [],
    portable: true,
    systemPromptContent: 'Package prompt',
    skillContents: { 'custom-skill': 'Package skill' },
  }],
}

describe('ExpertPackManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ locale: 'en' })
    useUIStore.setState({ toasts: [] })
    vi.mocked(expertsApi.listPacks).mockResolvedValue({ packs: [pack] })
    vi.mocked(expertsApi.copyPack).mockResolvedValue({ pack, experts: pack.experts, summary: '', warnings: [], canImport: true })
    vi.mocked(expertsApi.deletePack).mockResolvedValue(undefined)
    vi.mocked(expertsApi.updatePack).mockResolvedValue(pack)
    useSkillStore.setState({ catalog: [], skills: [], isCatalogLoading: false, isLoading: false, error: null })
  })

  it('uses the workflow-style manager shell and opens a separate edit framework', async () => {
    render(<ExpertPackManager />)

    expect(await screen.findByText('Package manager')).toBeInTheDocument()
    expect(screen.getByTestId('expert-pack-row-custom-pack')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export selected' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Pack' }))

    expect(await screen.findByRole('dialog', { name: 'Edit Custom Pack' })).toBeInTheDocument()
    expect(screen.getByText('Expert editor framework')).toBeInTheDocument()
    expect(screen.getByLabelText('System Prompt')).toHaveValue('Package prompt')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Expert name'), { target: { value: 'Renamed Expert' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(expertsApi.updatePack).toHaveBeenCalledWith('custom-pack', expect.objectContaining({
      expert: expect.objectContaining({
        id: 'custom-expert',
        name: 'Renamed Expert',
        systemPromptContent: 'Package prompt',
      }),
    })))
  })

  it('copies into the editor framework and confirms deletion before deleting', async () => {
    render(<ExpertPackManager />)
    await screen.findByText('Custom Pack')

    fireEvent.click(screen.getByRole('button', { name: 'Copy Custom Pack' }))
    await waitFor(() => expect(expertsApi.copyPack).toHaveBeenCalledWith('custom-pack'))
    expect(await screen.findByRole('dialog', { name: 'Edit Custom Pack' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Custom Pack' }))
    expect(await screen.findByRole('dialog', { name: 'Delete Expert package?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(expertsApi.deletePack).toHaveBeenCalledWith('custom-pack'))
  })

  it('opens workflow-style import and export dialogs', async () => {
    render(<ExpertPackManager />)
    await screen.findByText('Custom Pack')

    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(await screen.findByRole('dialog', { name: 'Import Expert ZIP' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))

    fireEvent.click(screen.getByRole('button', { name: 'Export Custom Pack' }))
    expect(await screen.findByRole('dialog', { name: 'Export Expert ZIP packages' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})
