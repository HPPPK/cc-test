import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expertsApi } from '../../api/experts'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUIStore } from '../../stores/uiStore'
import { ExpertImportExportDialog } from './ExpertImportExportDialog'

vi.mock('../../api/experts', () => ({
  expertsApi: {
    previewImport: vi.fn(),
    importPack: vi.fn(),
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
    skillIds: [],
    hostTools: [],
    permissions: [],
    tools: [],
    portable: true,
    systemPromptContent: 'Package prompt',
    skillContents: {},
  }],
}

const preview = {
  pack,
  experts: pack.experts,
  summary: 'The package can be imported.',
  warnings: [],
  canImport: true,
}

describe('ExpertImportExportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ locale: 'en' })
    useUIStore.setState({ toasts: [] })
    vi.mocked(expertsApi.previewImport).mockResolvedValue(preview)
    vi.mocked(expertsApi.importPack).mockResolvedValue(preview)
    vi.mocked(expertsApi.exportPack).mockResolvedValue({
      format: 'zip-pack',
      filename: 'custom-pack.zip',
      contentType: 'application/zip',
      dataBase64: 'emlw',
    })

    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:expert-pack') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  it('previews a selected ZIP, imports it, and refreshes the pack list callback', async () => {
    const onImported = vi.fn().mockResolvedValue(undefined)
    render(
      <ExpertImportExportDialog
        mode="import"
        open
        packs={[pack]}
        onClose={vi.fn()}
        onImported={onImported}
      />,
    )

    const file = new File(['zip'], 'custom-pack.zip', { type: 'application/zip' })
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(new TextEncoder().encode('zip').buffer),
    })

    fireEvent.change(screen.getByLabelText('Choose an Expert ZIP'), { target: { files: [file] } })

    await waitFor(() => expect(expertsApi.previewImport).toHaveBeenCalledWith('emlw'))
    expect(await screen.findByText('The package can be imported.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Import package' }))

    await waitFor(() => expect(expertsApi.importPack).toHaveBeenCalledWith('emlw'))
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Imported Custom Pack.')).toBeInTheDocument()
  })

  it('exports only the initially selected ZIP packages', async () => {
    render(
      <ExpertImportExportDialog
        mode="export"
        open
        packs={[pack]}
        initialSelectedPackIds={['custom-pack']}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('checkbox', { name: /Custom Pack/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Export selected' }))

    await waitFor(() => expect(expertsApi.exportPack).toHaveBeenCalledWith('custom-pack'))
    expect(await screen.findByText('Exported 1 Expert ZIP package(s).')).toBeInTheDocument()
  })
})
